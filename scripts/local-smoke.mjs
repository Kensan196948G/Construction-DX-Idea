#!/usr/bin/env node
/**
 * ローカル実DBスモーク（開発サーバー自動起動・検証・停止）。
 *
 * server/dev-server.ts を一時ポートで起動し、ルート .env の DATABASE_URL が指す
 * ローカルPostgreSQLに対して主要API・監査チェーン・ボディ上限を検証する。
 * 検証後は子プロセスを必ず停止する（SIGTERM → 3秒でSIGKILL）。
 *
 * Usage:
 *   npm run dev:smoke
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requestTimeoutMs = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS || 10000);
const startupTimeoutMs = Number(process.env.SMOKE_STARTUP_TIMEOUT_MS || 20000);

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function request(apiBase, pathname, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(`${apiBase}${pathname}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
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

const port = await freePort();
const apiBase = `http://127.0.0.1:${port}/api`;
const child = spawn("npx", ["tsx", "server/dev-server.ts"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    ALLOW_LOCAL_AUTH_BYPASS: "true",
    AI_ENABLED: "false",
    SLACK_WEBHOOK_URL: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let childLog = "";
child.stdout.on("data", (chunk) => {
  childLog += chunk;
});
child.stderr.on("data", (chunk) => {
  childLog += chunk;
});

const results = [];
let failures = 0;
function expect(name, condition, detail = "") {
  const pass = Boolean(condition);
  results.push(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures += 1;
}

function stopChild() {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    child.kill("SIGTERM");
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 3000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

try {
  let ready = false;
  const deadline = Date.now() + startupTimeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    const health = await request(apiBase, "/health");
    if (health.ok && health.status === 200) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  if (!ready) {
    console.error(`Dev server did not become ready on port ${port}.`);
    console.error(childLog.slice(-2000));
    failures += 1;
  } else {
    const health = await request(apiBase, "/health");
    expect("health", health.ok && health.status === 200 && health.body?.ok === true);

    const me = await request(apiBase, "/me");
    expect(
      "identity (local bypass => admin/system_admin)",
      me.ok &&
        Array.isArray(me.body?.roles) &&
        me.body.roles.includes("admin") &&
        me.body.roles.includes("system_admin"),
      `roles=${JSON.stringify(me.body?.roles)}`,
    );

    const metrics = await request(apiBase, "/metrics");
    expect(
      "metrics reflect local ideas",
      metrics.ok &&
        Number(metrics.body?.totalIdeas) >= 14 &&
        typeof metrics.body?.stageCounts === "object",
      `total=${metrics.body?.totalIdeas}`,
    );

    const ideas = await request(apiBase, "/ideas?limit=200");
    expect(
      "idea list is non-empty",
      ideas.ok && Array.isArray(ideas.body) && ideas.body.length >= 14,
      `count=${ideas.body?.length}`,
    );

    const evaluation = await request(apiBase, "/ideas/evaluation");
    const scored = (evaluation.body?.items ?? []).map((item) =>
      Number(item.priorityScore ?? -1),
    );
    expect(
      "evaluation board returns scored items",
      evaluation.ok &&
        scored.length >= 12 &&
        scored.every((score) => score >= 0 && score <= 10),
      `items=${scored.length}`,
    );

    const users = await request(apiBase, "/admin/users");
    expect(
      "user directory lists seeded demo users",
      users.ok && users.body?.items?.length >= 5,
      `users=${users.body?.items?.length}`,
    );

    const auditVerify = await request(apiBase, "/admin/audit-logs/verify");
    expect(
      "audit hash chain verifies",
      auditVerify.ok && auditVerify.body?.valid === true,
      `checked=${auditVerify.body?.checked} valid=${auditVerify.body?.valid}`,
    );

    const csv = await request(apiBase, "/ideas/export.csv");
    expect(
      "ideas CSV export",
      csv.ok && (csv.contentType ?? "").includes("text/csv"),
    );

    const largeBody = "x".repeat(2 * 1024 * 1024);
    const tooLarge = await request(apiBase, "/ideas", {
      method: "POST",
      body: JSON.stringify({ structured: {} }).padEnd(largeBody.length, "x"),
    });
    expect(
      "request body limit returns 413",
      tooLarge.status === 413 && tooLarge.body?.error === "payload_too_large",
      `status=${tooLarge.status}`,
    );

    const denied = await request(apiBase, "/admin/audit-logs/export.csv", {
      method: "POST",
    });
    expect(
      "method allowlist enforced (POST to export route rejected)",
      denied.status === 404 || denied.status === 405,
      `status=${denied.status}`,
    );
  }
} catch (error) {
  console.error("Local smoke failed:", error instanceof Error ? error.message : error);
  failures += 1;
} finally {
  await stopChild();
}

console.log(results.join("\n"));
console.log(`\nLocal smoke: ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
