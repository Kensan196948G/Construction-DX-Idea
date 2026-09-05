#!/usr/bin/env node
/* AI品質Evalのローカル実API E2E: dev-server(実DB)で /api/admin/ai-eval を実行し、
   Golden Dataset がデモAIで全ケース合格(スコア1.0)することを確認する。 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile?.(path.join(root, ".env"));
const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.on("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});
const child = spawn("npx", ["tsx", "server/dev-server.ts"], {
  cwd: root,
  env: { ...process.env, PORT: String(port), ALLOW_LOCAL_AUTH_BYPASS: "true" },
  stdio: ["ignore", "pipe", "pipe"],
});
const base = `http://127.0.0.1:${port}`;
let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${cond ? "" : detail}`);
  if (!cond) failures++;
};
try {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${base}/api/health`); if (r.ok) break; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  const res = await fetch(`${base}/api/admin/ai-eval`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "demo" }),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  check("ai-eval API 200", res.status === 200, `status=${res.status} ${text.slice(0,300)}`);
  check("eval summary has totals", json && typeof json.totalCases === "number" && typeof json.passRate === "number", JSON.stringify(json).slice(0,200));
  if (json) {
    check("all golden cases pass (demo)", json.passedCases === json.totalCases && json.passRate === 1, `passed=${json.passedCases}/${json.totalCases}`);
    check("executed with demo", json.executedWith === "demo", `provider=${json.executedWith}`);
    check("results have per-case checks", Array.isArray(json.results) && json.results.every(r => r.ok && r.caseId), "results shape");
  }
  // 監査ログに ai.eval.ran が記録されている
  const audit = await fetch(`${base}/api/admin/audit-logs?limit=5`).then(r => r.json());
  check("audit records ai.eval.ran", (audit.items || []).some(e => e.action === "ai.eval.ran"), JSON.stringify((audit.items||[]).map(e=>e.action)));
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exitCode = failures === 0 ? 0 : 1;
} finally {
  child.kill();
}
