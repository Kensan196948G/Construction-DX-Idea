#!/usr/bin/env node
/* Gate Policy Engine v2 のローカル実API E2E（一時ポートで dev-server を起動して検証） */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile?.(path.join(root, ".env"));
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error("DATABASE_URL required");

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
const sql = postgres(dbUrl, { max: 1 });
let createdIdeaId = null;
try {
  const port = await freePort();
  child = spawn("npx", ["tsx", "server/dev-server.ts"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), ALLOW_LOCAL_AUTH_BYPASS: "true" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => { log += d.toString(); });
  child.stderr.on("data", (d) => { log += d.toString(); });

  const base = `http://127.0.0.1:${port}`;
  // health 待ち
  let ok = false;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) { ok = true; break; }
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ok) { console.error("server did not start:\n", log.slice(-1500)); process.exit(1); }

  const results = [];

  // 1) アイデア登録
  const structured = {
    title: `[E2E] Gate Policy ${Date.now()}`,
    currentIssue: "Gate Policy Engine v2 の複数Authority共同承認を実機検証するための一時案件です。",
    targetBusiness: "検証",
    targetUsers: "テスト",
    currentWorkflow: "テスト登録",
    improvementIdea: "検証後削除",
    expectedEffects: "検証",
    requiredData: [], relatedSystems: [], implementationOptions: [],
    securityNotes: ["テストデータ"], openQuestions: [],
    mvpCandidate: "", mvpDoneDefinition: "",
  };
  const created = await api(base, "POST", "/api/ideas", { structured });
  results.push(["idea register", created.status]);
  if (created.status !== 201 && created.status !== 200) { console.error(JSON.stringify(created)); process.exit(1); }
  createdIdeaId = String(created.json.id);
  // 注: bypass モードでは actor=local.dev@example.com=提案者になるため、
  // 「提案者自身による approve が 403(SoD) になること」を下記 sod 検証で確認する。

  // 2) gates/init → ポリシー行生成（Gate1=3行, Gate5=1行 …）
  const init = await api(base, "POST", `/api/ideas/${createdIdeaId}/gates/init`);
  results.push(["gates/init", init.status, `rows=${init.json?.items?.length ?? "-"}`]);
  const gate1Rows = init.json?.items?.filter((r) => r.gateNo === 1) ?? [];
  const gate1Authorities = gate1Rows.map((r) => r.requiredAuthority).sort();
  results.push(["Gate1 authority rows", gate1Authorities.join(",")]);

  // 3) Gate1 の business 承認依頼（承認者を別ユーザーへ）
  const req = await api(base, "POST", `/api/ideas/${createdIdeaId}/gates/1/request-approval`, {
    authority: "business",
    approverEmail: "demo.admin@demo.example.com",
    reason: "E2E依頼",
  });
  results.push(["request business", req.status, req.json?.status ?? req.json?.message]);

  // 4) 提案者本人（local.dev admin bypass）による approve → SoD 403 になるはず
  const sod = await api(base, "POST", `/api/ideas/${createdIdeaId}/gates/1/approval`, {
    authority: "business",
    decision: "approve",
    reason: "SoD検証",
  });
  results.push(["approve by creator (SoD expect 403)", sod.status, sod.json?.message ?? ""]);

  // 5) GET /gates → summary
  const gates = await api(base, "GET", `/api/ideas/${createdIdeaId}/gates`);
  const summaryGate1 = gates.json?.summary?.find((s) => s.gateNo === 1);
  results.push(["GET summary Gate1", summaryGate1?.status ?? "-"]);
  results.push(["summary count", String(gates.json?.summary?.length ?? "-")]);

  for (const r of results) console.log(r.join(" | "));

  // 判定
  const pass =
    created.status >= 200 &&
    gate1Authorities.join(",") === "business,domain,engineering" &&
    req.status === 200 &&
    sod.status === 403 &&
    ["requested", "pending"].includes(summaryGate1?.status);
  console.log(pass ? "E2E RESULT: PASS" : "E2E RESULT: FAIL");
  process.exitCode = pass ? 0 : 1;
} catch (e) {
  console.error("E2E error:", e.message);
  process.exitCode = 1;
} finally {
  if (createdIdeaId) {
    try { await sql`delete from idea_gate_approvals where idea_id = ${createdIdeaId}`; } catch { /* cleanup */ }
    try { await sql`delete from ideas where id = ${createdIdeaId}`; } catch { /* cleanup */ }
  }
  await sql.end();
  if (child && !child.killed) child.kill("SIGTERM");
}
