#!/usr/bin/env node
/**
 * Read-only smoke test for the deployed MVP/Prototype environment.
 *
 * Verifies that the seeded demo data is reachable and consistent across the
 * UI-facing API surface (list, detail, evaluation board, history, comments,
 * exports, users, AI settings/usage and the audit hash chain). It is
 * idempotent: no business data is created or changed.
 *
 * Usage:
 *   SMOKE_API_BASE_URL=https://dxidea-mvp.mirai-dx-platform.com/api node scripts/mvp-smoke.mjs
 */
const inputBaseUrl = process.env.SMOKE_API_BASE_URL;
if (!inputBaseUrl) {
  console.error("SMOKE_API_BASE_URL is required.");
  process.exit(1);
}

let apiBase;
try {
  const parsed = new URL(inputBaseUrl);
  parsed.search = "";
  parsed.hash = "";
  const path = parsed.pathname.replace(/\/+$/, "");
  parsed.pathname = path.endsWith("/api") ? path : `${path || ""}/api`;
  apiBase = parsed.toString().replace(/\/$/, "");
} catch {
  console.error(`SMOKE_API_BASE_URL is invalid: ${inputBaseUrl}`);
  process.exit(1);
}

const requestTimeoutMs = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS || 10000);
const accessJwt = process.env.SMOKE_CF_ACCESS_JWT ?? "";
const results = [];
console.log(`Target API: ${apiBase}`);

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(accessJwt ? { "CF-Access-Jwt-Assertion": accessJwt } : {}),
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") ?? "";
    let body;
    if (contentType.includes("json")) {
      body = await response.json().catch(() => null);
    } else {
      body = await response.text().catch(() => "");
    }
    return { ok: response.ok, status: response.status, body, contentType };
  } catch (error) {
    return {
      ok: false,
      status: error?.name === "AbortError" ? 408 : 0,
      body: error instanceof Error ? error.message : "<request failed>",
      contentType: "",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function check(name, condition, detail = "") {
  const pass = Boolean(condition);
  results.push(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  return pass;
}

let failures = 0;
function expect(name, condition, detail = "") {
  if (!check(name, condition, detail)) failures += 1;
}

const health = await request("/health");
expect("health", health.ok && health.status === 200 && health.body?.ok === true);

const me = await request("/me");
if (!me.ok && me.status === 401 && !accessJwt) {
  console.warn(
    "NOTE: API returned 401 UNAUTHENTICATED. The deployed environment appears to require a " +
      "Cloudflare Access JWT (ALLOW_LOCAL_AUTH_BYPASS is off or Access is enabled). " +
      "Set SMOKE_CF_ACCESS_JWT to run the full smoke, or re-enable the local bypass for the public MVP.",
  );
}
expect(
  "identity (local bypass => demo identity with admin/system_admin)",
  me.ok && Array.isArray(me.body?.roles) && me.body.roles.includes("admin") && me.body.roles.includes("system_admin"),
  `roles=${JSON.stringify(me.body?.roles)}`,
);

const metrics = await request("/metrics");
expect(
  "metrics reflect seeded ideas",
  metrics.ok && Number(metrics.body?.totalIdeas) >= 14 && Number(metrics.body?.activeIdeas) >= 12,
  `total=${metrics.body?.totalIdeas} active=${metrics.body?.activeIdeas} stages=${Object.keys(metrics.body?.stageCounts ?? {}).length}`,
);

const ideas = await request("/ideas?limit=200");
expect("idea list is non-empty", ideas.ok && Array.isArray(ideas.body) && ideas.body.length >= 14, `count=${ideas.body?.length}`);

const stages = new Set(Array.isArray(ideas.body) ? ideas.body.map((idea) => idea.stage) : []);
expect(
  "idea list spans the lifecycle stages",
  ["draft", "submitted", "planning", "mvp", "verification", "production_candidate", "production", "rejected", "archived"].every((stage) => stages.has(stage)),
  [...stages].join(","),
);

const evaluation = await request("/ideas/evaluation");
const scored = (evaluation.body?.items ?? []).map((item) => Number(item.priorityScore ?? -1));
expect(
  "evaluation board returns scored items",
  evaluation.ok && scored.length >= 12 && scored.every((score) => score >= 0 && score <= 10),
  `ok=${evaluation.ok} status=${evaluation.status} items=${scored.length} scores=${scored.slice(0, 5).join("/")}`,
);

const searched = await request("/ideas?q=%E5%86%99%E7%9C%9F&limit=50");
expect(
  "server-side search matches the seeded photos idea",
  searched.ok && searched.body?.some((idea) => idea.title.includes("写真")),
  `hits=${searched.body?.length}`,
);

const detail = await request(`/ideas/${ideas.body?.[0]?.id}`);
expect("idea detail round-trips structured fields", detail.ok && detail.body?.id && detail.body?.requiredData?.length >= 0);

const history = await request(`/ideas/${ideas.body?.[0]?.id}/history`);
expect("idea history endpoint responds", history.ok && Array.isArray(history.body?.history) && Array.isArray(history.body?.decisions));

const comments = await request(`/ideas/${ideas.body?.[0]?.id}/comments`);
expect("comments endpoint responds", comments.ok && Array.isArray(comments.body?.items));

const users = await request("/admin/users");
expect("user directory lists seeded demo users", users.ok && users.body?.items?.length >= 6, `users=${users.body?.items?.length}`);

const aiSettings = await request("/admin/ai-settings");
expect(
  "AI settings reflect the demo provider",
  aiSettings.ok && aiSettings.body?.provider === "demo" && aiSettings.body?.enabled === true,
  `provider=${aiSettings.body?.provider} enabled=${aiSettings.body?.enabled}`,
);

const aiUsage = await request("/admin/ai-usage");
expect("AI usage summary responds", aiUsage.ok && typeof aiUsage.body?.summary?.totalCalls === "number");

const auditVerify = await request("/admin/audit-logs/verify");
expect(
  "audit hash chain verifies",
  auditVerify.ok && auditVerify.body?.valid === true && Number(auditVerify.body?.checked) >= 25,
  `checked=${auditVerify.body?.checked} valid=${auditVerify.body?.valid}`,
);

const csv = await request("/ideas/export.csv");
expect(
  "ideas CSV export",
  csv.ok && (csv.contentType ?? "").includes("text/csv") && String(csv.body).includes("title,stage"),
);

const xls = await request("/ideas/export.xls");
expect("ideas Excel export", xls.ok && (xls.contentType ?? "").includes("excel"));

const auditHtml = await request("/admin/audit-logs/export.html");
expect("audit log HTML export", auditHtml.ok && (auditHtml.contentType ?? "").includes("text/html"));

const denied = await request("/admin/audit-logs/export.csv", { method: "POST" });
expect("method allowlist enforced (POST to export route rejected)", denied.status === 404 || denied.status === 405 || denied.status === 404);

console.log(results.join("\n"));
console.log(`\nMVP smoke: ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
