#!/usr/bin/env node
/* Blocker一覧（GET /api/admin/blockers・docs/29 §2.9残P2）のローカル実API E2E。
 * - Gate承認待ち（期限超過）が gate_pending / critical として現れること
 * - openQuestions未解消・長期未更新が open_question / critical として現れること
 * - 閾値未満のopenQuestionsは現れないこと
 * dev-server を一時ポートで起動し、実PostgreSQLに対して検証する。
 */
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
let gateIdeaId = null;
let openQIdeaId = null;
let freshOpenQIdeaId = null;
try {
  const port = await freePort();
  child = spawn("npx", ["tsx", "server/dev-server.ts"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), ALLOW_LOCAL_AUTH_BYPASS: "true" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let log = "";
  child.stdout.on("data", (d) => { log += d.toString(); });
  child.stderr.on("data", (d) => { log += d.toString(); });

  const base = `http://127.0.0.1:${port}`;
  let ok = false;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) { ok = true; break; }
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ok) throw new Error(`server did not start:\n${log.slice(-1500)}`);

  const results = [];
  const structuredBase = {
    currentIssue: "Blocker一覧を実機検証するための一時案件です。",
    targetBusiness: "検証",
    targetUsers: "テスト",
    currentWorkflow: "テスト登録",
    improvementIdea: "検証後削除",
    expectedEffects: "検証",
    requiredData: [], relatedSystems: [], implementationOptions: [],
    securityNotes: ["テストデータ"],
    mvpCandidate: "", mvpDoneDefinition: "",
  };

  // 1) Gate承認待ち（期限超過）用のidea
  const gateCreated = await api(base, "POST", "/api/ideas", {
    structured: { ...structuredBase, title: `[E2E] Blocker Gate ${Date.now()}`, openQuestions: [] },
  });
  results.push(["gate idea register", gateCreated.status]);
  if (gateCreated.status !== 201 && gateCreated.status !== 200) throw new Error(`idea register failed: ${JSON.stringify(gateCreated)}`);
  gateIdeaId = String(gateCreated.json.id);
  await sql`update ideas set created_by = 'demo.other@demo.example.com' where id = ${gateIdeaId}`;
  await api(base, "POST", `/api/ideas/${gateIdeaId}/gates/init`);
  const gateReq = await api(base, "POST", `/api/ideas/${gateIdeaId}/gates/1/request-approval`, {
    authority: "business",
    approverEmail: "demo.admin@demo.example.com",
    reason: "E2E Blocker検証",
    dueAt: new Date(Date.now() + 3 * 864e5).toISOString(),
  });
  results.push(["gate request", gateReq.status]);
  await sql`
    update idea_gate_approvals
    set requested_due_at = now() - interval '1 day'
    where idea_id = ${gateIdeaId} and gate_no = 1 and required_authority = 'business'
  `;

  // 2) openQuestions未解消・8日間未更新（critical想定）のidea
  const openQCreated = await api(base, "POST", "/api/ideas", {
    structured: { ...structuredBase, title: `[E2E] Blocker OpenQ ${Date.now()}`, openQuestions: ["対象部署は？"] },
  });
  results.push(["openQ idea register", openQCreated.status]);
  openQIdeaId = String(openQCreated.json.id);
  // updated_at はBEFORE UPDATEトリガー（set_updated_at）で任意の更新のたびに現在時刻へ
  // 書き換わるため、待機日数の起点には使えない。created_at（トリガー保護なし）を後退させる。
  await sql`update ideas set created_at = now() - interval '8 days' where id = ${openQIdeaId}`;

  // 3) openQuestions未解消だが直近更新（閾値未満・現れない想定）のidea
  const freshCreated = await api(base, "POST", "/api/ideas", {
    structured: { ...structuredBase, title: `[E2E] Blocker OpenQ Fresh ${Date.now()}`, openQuestions: ["確認中"] },
  });
  results.push(["fresh openQ idea register", freshCreated.status]);
  freshOpenQIdeaId = String(freshCreated.json.id);

  // 4) Blocker一覧を取得
  const blockers = await api(base, "GET", "/api/admin/blockers");
  const items = blockers.json?.items ?? [];
  const gateItem = items.find((i) => i.ideaId === gateIdeaId);
  const openQItem = items.find((i) => i.ideaId === openQIdeaId);
  const freshItem = items.find((i) => i.ideaId === freshOpenQIdeaId);
  results.push(["blockers status", blockers.status]);
  results.push(["blockers total", String(blockers.json?.total ?? "-")]);
  results.push(["gate item", gateItem ? `${gateItem.kind}/${gateItem.severity}` : "missing"]);
  results.push(["openQ item", openQItem ? `${openQItem.kind}/${openQItem.severity}` : "missing"]);
  results.push(["fresh item (expect missing)", freshItem ? `${freshItem.kind}/${freshItem.severity}` : "missing"]);

  for (const r of results) console.log(r.join(" | "));

  const pass =
    gateCreated.status >= 200 &&
    gateReq.status === 200 &&
    openQCreated.status >= 200 &&
    freshCreated.status >= 200 &&
    blockers.status === 200 &&
    gateItem?.kind === "gate_pending" &&
    gateItem?.severity === "critical" &&
    openQItem?.kind === "open_question" &&
    openQItem?.severity === "critical" &&
    !freshItem;

  console.log(pass ? "E2E RESULT: PASS" : "E2E RESULT: FAIL");
  process.exitCode = pass ? 0 : 1;
} catch (e) {
  console.error("E2E error:", e.message);
  process.exitCode = 1;
} finally {
  const cleanupIds = [gateIdeaId, openQIdeaId, freshOpenQIdeaId].filter(Boolean);
  for (const ideaId of cleanupIds) {
    try { await sql`delete from idea_gate_approvals where idea_id = ${ideaId}`; } catch { /* cleanup */ }
    try { await sql`delete from ideas where id = ${ideaId}`; } catch { /* cleanup */ }
  }
  await sql.end();
  if (child && child.pid) {
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* already dead */ }
  }
  process.exit(process.exitCode ?? 0);
}
