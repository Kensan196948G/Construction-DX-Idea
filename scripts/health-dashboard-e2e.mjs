#!/usr/bin/env node
/* System Health Dashboard（docs/29 §2.21・Issue #7）のローカル実API E2E。
 * dev-serverを一時ポートで起動し、GET /api/admin/health-dashboardが
 * 実DBの各シグナル（AI呼び出し・通知キュー・監査チェーン・Gate滞留）を
 * 正しく集約して返すことを確認する。
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile?.(path.join(root, ".env"));

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

async function api(base, method, p, body) {
  const res = await fetch(`${base}${p}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, json };
}

let child;
try {
  const port = await freePort();
  child = spawn("npx", ["tsx", "server/dev-server.ts"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), ALLOW_LOCAL_AUTH_BYPASS: "true" },
    stdio: ["ignore", "ignore", "ignore"],
    detached: true,
  });
  const base = `http://127.0.0.1:${port}`;
  const results = [];
  let ok = false;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${base}/api/health`); if (r.ok) { ok = true; break; } } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  results.push(["health", ok]);

  const dashboard = await api(base, "GET", "/api/admin/health-dashboard");
  results.push([
    "health-dashboard status",
    dashboard.status,
    `auditValid=${dashboard.json?.auditChain?.valid}`,
    `aiCallsToday=${dashboard.json?.ai?.callsToday}`,
    `outboxPending=${dashboard.json?.notificationOutbox?.pendingCount}`,
    `gateOverdue=${dashboard.json?.gate?.overdueCount}`,
  ]);

  // AI呼び出しを1回実行してから再取得し、本日のAI呼び出し件数が増えることを確認する。
  const before = dashboard.json?.ai?.callsToday ?? 0;
  const question = await api(base, "POST", "/api/ai/questions", {
    input: {
      workType: "E2Eテスト用の困りごと入力です。",
      currentWorkflow: "現状の手順テキスト。",
      desiredState: "改善後の理想状態テキスト。",
      confidentiality: "none",
    },
  });
  results.push(["ai/questions", question.status]);

  const dashboardAfter = await api(base, "GET", "/api/admin/health-dashboard");
  const after = dashboardAfter.json?.ai?.callsToday ?? 0;
  results.push(["ai calls today increased by 1", before, after]);

  for (const r of results) console.log(r.join(" | "));

  const pass =
    ok &&
    dashboard.status === 200 &&
    typeof dashboard.json?.auditChain?.valid === "boolean" &&
    typeof dashboard.json?.ai?.callsToday === "number" &&
    typeof dashboard.json?.notificationOutbox?.pendingCount === "number" &&
    typeof dashboard.json?.gate?.overdueCount === "number" &&
    question.status === 200 &&
    after === before + 1;

  console.log(pass ? "\nE2E RESULT: PASS" : "\nE2E RESULT: FAIL");
  process.exitCode = pass ? 0 : 1;
} catch (e) {
  console.error("E2E error:", e.message);
  process.exitCode = 1;
} finally {
  if (child && child.pid) {
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* already dead */ }
  }
  process.exit(process.exitCode ?? 0);
}
