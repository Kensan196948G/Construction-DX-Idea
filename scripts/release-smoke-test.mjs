import process from "node:process";
import dns from "node:dns/promises";

const inputBaseUrl = process.env.SMOKE_API_BASE_URL;
if (!inputBaseUrl) {
  console.error("SMOKE_API_BASE_URL is required. Example: https://dxidea.mirai-dx-platform.com/api");
  process.exit(1);
}

let apiBase;
try {
  apiBase = normalizeApiBase(inputBaseUrl);
} catch {
  console.error(`SMOKE_API_BASE_URL is invalid: ${inputBaseUrl}`);
  process.exit(1);
}

const userJwt = process.env.SMOKE_CF_ACCESS_USER_JWT || process.env.SMOKE_CF_ACCESS_JWT;
const userEmail = process.env.SMOKE_CF_ACCESS_USER_EMAIL || process.env.SMOKE_USER_EMAIL;
const userJwtSource = process.env.SMOKE_CF_ACCESS_USER_JWT
  ? "SMOKE_CF_ACCESS_USER_JWT"
  : process.env.SMOKE_CF_ACCESS_JWT
    ? "SMOKE_CF_ACCESS_JWT"
    : "";
const adminJwt = process.env.SMOKE_CF_ACCESS_ADMIN_JWT;
const adminEmail = process.env.SMOKE_CF_ACCESS_ADMIN_EMAIL || process.env.SMOKE_ADMIN_EMAIL || "";
const adminJwtSource = process.env.SMOKE_CF_ACCESS_ADMIN_JWT ? "SMOKE_CF_ACCESS_ADMIN_JWT" : "";

const requestTimeoutMs = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS || 10000);
if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
  console.error("SMOKE_REQUEST_TIMEOUT_MS must be a positive number.");
  process.exit(1);
}

const isDeployRun = process.env.RELEASE_DEPLOY_CHECK === "1";

// RELEASE_STAGE contract (shared with predeploy-check / release-readiness-monitor):
//   full (default) : deploy runs require Access JWTs — missing credentials FAIL.
//   pre-access     : Stage A shell release. Access is not wired yet, so JWT
//                    checks stay skipped even during release:deploy, and the
//                    static shell itself is verified instead.
const releaseStage = process.env.RELEASE_STAGE || "full";
if (!["full", "pre-access"].includes(releaseStage)) {
  console.error(`RELEASE_STAGE must be "full" or "pre-access", got: ${releaseStage}`);
  process.exit(1);
}
const isPreAccessStage = releaseStage === "pre-access";

const headersBase = { "Content-Type": "application/json" };
const results = [];

function normalizeApiBase(value) {
  const parsed = new URL(value);
  parsed.search = "";
  parsed.hash = "";
  const path = parsed.pathname.replace(/\/+$/, "");
  if (path.endsWith("/api")) {
    parsed.pathname = path;
  } else {
    parsed.pathname = `${path || ""}/api`;
  }
  return parsed.toString().replace(/\/$/, "");
}

function headersForJwt(token, tokenEmail) {
  const headers = { ...headersBase };
  if (token) headers["CF-Access-Jwt-Assertion"] = token;
  if (tokenEmail) headers["CF-Access-Authenticated-User-Email"] = tokenEmail;
  return headers;
}

async function request(path, options = {}) {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(`${apiBase}${path}`, {
      method: "GET",
      ...options,
      headers: { ...headersBase, ...(options.headers || {}) },
      signal: controller.signal,
    });
    let bodyText = "";
    try {
      bodyText = await response.text();
    } catch {
      bodyText = "<non-text response>";
    }
    const contentType = response.headers.get("content-type") ?? "";
    return {
      ok: response.ok,
      status: response.status,
      path,
      method: options.method || "GET",
      bodyText,
      contentType,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const status = error?.name === "AbortError" ? 408 : 0;
    return {
      ok: false,
      status,
      path,
      method: options.method || "GET",
      bodyText: error instanceof Error ? error.message : "<request failed>",
      errorName: error instanceof Error ? error.name : undefined,
      errorCode: error && typeof error === "object" && "code" in error ? error.code : undefined,
      durationMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function postJson(path, body, headers = {}) {
  return request(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function expect(condition, message, details) {
  const detailText = details ? `: ${details}` : "";
  if (!condition) {
    results.push({ ok: false, message, detail: details ?? "" });
    console.error(`✗ ${message}${detailText}`);
    return;
  }
  results.push({ ok: true, message, detail: details ?? "" });
  console.log(`✓ ${message}`);
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function skipOrFail(message, reason) {
  if (isDeployRun && !isPreAccessStage) {
    expect(false, message, `${reason} (credentials required for release:deploy gate)`);
    return;
  }
  console.log(`- Skip: ${reason}${isPreAccessStage ? " (stage=pre-access)" : ""}`);
}

function formatFailure(result) {
  if (result.errorName || result.errorCode) {
    return `${result.errorName ? `name=${result.errorName} ` : ""}${result.errorCode ? `code=${result.errorCode} ` : ""}${sanitizeForLog(
      result.bodyText,
    )}`.trim();
  }
  return sanitizeForLog(result.bodyText);
}

function sanitizeForLog(text) {
  if (!text) return "";
  return `${String(text).slice(0, 240).replace(/"apiKey"\s*:\s*"[^"]*"/gi, '"apiKey":"<redacted>"')}`;
}

(async () => {
  const targetHost = new URL(apiBase).hostname;
  try {
    await dns.lookup(targetHost);
  } catch {
    console.error(`DNS lookup failed for ${targetHost}. Check Cloudflare DNS/custom domain registration before running smoke tests.`);
    process.exit(1);
  }

  console.log(`Release smoke target: ${apiBase}`);
  if (adminJwt && !adminEmail && adminJwtSource) {
    console.warn(`${adminJwtSource} is set but SMOKE_CF_ACCESS_ADMIN_EMAIL is not set.`);
  }
  if (userJwt && !userEmail && userJwtSource) {
    console.warn(`${userJwtSource} is set but SMOKE_CF_ACCESS_USER_EMAIL is not set.`);
  }

  if (isPreAccessStage) {
    section("フロント外殻 (Stage A)");
    const originBase = new URL(apiBase).origin;
    let shell;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);
      const response = await fetch(`${originBase}/`, { signal: controller.signal });
      clearTimeout(timeoutId);
      shell = {
        status: response.status,
        contentType: response.headers.get("content-type") ?? "",
      };
    } catch (error) {
      shell = { status: 0, contentType: "", error: error instanceof Error ? error.message : "request failed" };
    }
    expect(
      shell.status === 200 && shell.contentType.includes("text/html"),
      "GET / serves the SPA shell as HTML 200",
      `got status=${shell.status} content-type=${shell.contentType || "n/a"}${shell.error ? ` error=${shell.error}` : ""}`,
    );
  }

  section("認証・公開エンドポイント");
  const health = await request("/health");
  expect(
    health.status === 200 && health.contentType.includes("application/json"),
    "GET /api/health returns JSON 200",
    `got status=${health.status} content-type=${health.contentType || "n/a"}`,
  );

  const meUnauthorized = await request("/me");
  expect(
    meUnauthorized.status === 401 && meUnauthorized.contentType.includes("application/json"),
    "GET /api/me without auth is JSON 401",
    `got status=${meUnauthorized.status} content-type=${meUnauthorized.contentType || "n/a"} ${formatFailure(meUnauthorized)}`,
  );

  const aiSettingsNoAuth = await request("/admin/ai-settings");
  expect(
    aiSettingsNoAuth.status === 401 && aiSettingsNoAuth.contentType.includes("application/json"),
    "GET /api/admin/ai-settings without auth is JSON 401",
    `got status=${aiSettingsNoAuth.status} content-type=${aiSettingsNoAuth.contentType || "n/a"} ${formatFailure(aiSettingsNoAuth)}`,
  );

  section("一般ユーザー系");
  const hasUserAuth = Boolean(userJwt && userEmail);
  if (hasUserAuth) {
    const meAuth = await request("/me", {
      headers: headersForJwt(userJwt, userEmail),
    });
    expect(meAuth.ok, "GET /api/me with user token is 200", `got ${meAuth.status} ${formatFailure(meAuth)}`);
  } else {
    skipOrFail("GET /api/me with user token is 200", "SMOKE_CF_ACCESS_USER_JWT / SMOKE_CF_ACCESS_USER_EMAIL not set");
  }

  if (hasUserAuth) {
    const ideasAsUser = await request("/ideas", {
      headers: headersForJwt(userJwt, userEmail),
    });
    expect(ideasAsUser.ok, "GET /api/ideas as user is reachable", `got ${ideasAsUser.status} ${formatFailure(ideasAsUser)}`);
  } else {
    skipOrFail("GET /api/ideas as user is reachable", "SMOKE_CF_ACCESS_USER_JWT / SMOKE_CF_ACCESS_USER_EMAIL not set");
  }

  section("システム管理者系");
  if (adminJwt && adminEmail) {
    const adminSettings = await request("/admin/ai-settings", {
      headers: headersForJwt(adminJwt, adminEmail),
    });
    expect(adminSettings.ok, "GET /api/admin/ai-settings as system_admin is 200", `got ${adminSettings.status} ${formatFailure(adminSettings)}`);

    const testPayload = {
      ...(process.env.SMOKE_ADMIN_TEST_API_KEY ? { apiKey: process.env.SMOKE_ADMIN_TEST_API_KEY } : {}),
      ...(process.env.SMOKE_ADMIN_TEST_MODEL ? { model: process.env.SMOKE_ADMIN_TEST_MODEL } : {}),
    };
    const testResponse = await postJson("/admin/ai-settings/test", testPayload, headersForJwt(adminJwt, adminEmail));
    expect(
      [200, 422].includes(testResponse.status),
      "POST /api/admin/ai-settings/test responds with auth+validation",
      `status=${testResponse.status} ${formatFailure(testResponse)}`,
    );
  } else {
    skipOrFail("GET /api/admin/ai-settings as system_admin is 200", "SMOKE_CF_ACCESS_ADMIN_JWT / SMOKE_CF_ACCESS_ADMIN_EMAIL not set");
  }

  section("保護境界チェック");
  const accessProtected = await request("/admin/ai-settings/test", {
    method: "POST",
    body: JSON.stringify({}),
  });
  expect(
    accessProtected.status === 401 && accessProtected.contentType.includes("application/json"),
    "POST /api/admin/ai-settings/test without auth is JSON 401",
    `got status=${accessProtected.status} content-type=${accessProtected.contentType || "n/a"} ${formatFailure(accessProtected)}`,
  );

  if (adminJwt && adminEmail) {
    const stagePayload = { stage: "planning" };
    const stage = await postJson(`/ideas/${crypto.randomUUID()}/stage`, stagePayload, headersForJwt(adminJwt, adminEmail));
    expect(
      [400, 401, 403, 404].includes(stage.status),
      "POST /api/ideas/:id/stage returns auth/boundary/validation status",
      `got ${stage.status}`,
    );
  } else {
    skipOrFail("POST /api/ideas/:id/stage returns auth/boundary/validation status", "SMOKE_CF_ACCESS_ADMIN_JWT / SMOKE_CF_ACCESS_ADMIN_EMAIL not set");
  }

  section("運用確認");
  const slackWebhookSet = Boolean(process.env.SMOKE_SLACK_WEBHOOK_TEST);
  expect(
    true,
    `Slack smoke mode: ${slackWebhookSet ? "configured" : "not configured (no live Slack webhook check)"}`,
  );

  const failed = results.filter((result) => !result.ok).length;
  console.log(`\nChecks: ${results.length} / failed=${failed}`);
  if (failed > 0) {
    console.error("Release smoke test failed.");
    process.exit(1);
  }
  console.log("Release smoke test passed.");
})(); 
