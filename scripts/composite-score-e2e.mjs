#!/usr/bin/env node
/* 複合スコア体系・AI推奨順位と人間評価の差異表示（docs/29 §2.4残）のローカル実API E2E。
 * GET /api/ideas/evaluation が返す compositeScore/alignment を、実際のGate承認結果と
 * 突き合わせて検証する。dev-server を一時ポートで起動し、実PostgreSQLに対して検証する。
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
let approvedIdeaId = null;
let rejectedIdeaId = null;
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
    currentIssue: "複合スコア体系を実機検証するための一時案件です。",
    targetBusiness: "検証",
    targetUsers: "テスト",
    currentWorkflow: "テスト登録",
    improvementIdea: "検証後削除",
    expectedEffects: "検証",
    requiredData: ["データA"], relatedSystems: ["システムB"], implementationOptions: ["SaaS活用"],
    securityNotes: [], openQuestions: [],
    mvpCandidate: "MVP案あり", mvpDoneDefinition: "",
  };

  // 1) Gate1を全Authority承認するidea（business/domain/engineering軸が加点される想定）
  const approvedCreated = await api(base, "POST", "/api/ideas", {
    structured: { ...structuredBase, title: `[E2E] Composite Approved ${Date.now()}` },
  });
  results.push(["approved idea register", approvedCreated.status]);
  if (approvedCreated.status !== 201 && approvedCreated.status !== 200) throw new Error(`idea register failed: ${JSON.stringify(approvedCreated)}`);
  approvedIdeaId = String(approvedCreated.json.id);
  await sql`update ideas set created_by = 'demo.other@demo.example.com', kpi_baseline_hours = 40, kpi_baseline_cost = 100000 where id = ${approvedIdeaId}`;
  await api(base, "POST", `/api/ideas/${approvedIdeaId}/gates/init`);
  for (const authority of ["business", "domain", "engineering"]) {
    await api(base, "POST", `/api/ideas/${approvedIdeaId}/gates/1/request-approval`, {
      authority,
      approverEmail: "demo.admin@demo.example.com",
      reason: "E2E複合スコア検証",
    });
    const decision = await api(base, "POST", `/api/ideas/${approvedIdeaId}/gates/1/approval`, {
      authority,
      decision: "approve",
      reason: "E2E複合スコア検証承認",
    });
    results.push([`approve gate1 ${authority}`, decision.status, decision.json?.status ?? ""]);
  }

  // 2) Gate1のbusinessをrejectするidea（alignment=rejected_by_gate想定）
  const rejectedCreated = await api(base, "POST", "/api/ideas", {
    structured: { ...structuredBase, title: `[E2E] Composite Rejected ${Date.now()}` },
  });
  results.push(["rejected idea register", rejectedCreated.status]);
  rejectedIdeaId = String(rejectedCreated.json.id);
  await sql`update ideas set created_by = 'demo.other@demo.example.com' where id = ${rejectedIdeaId}`;
  await api(base, "POST", `/api/ideas/${rejectedIdeaId}/gates/init`);
  await api(base, "POST", `/api/ideas/${rejectedIdeaId}/gates/1/request-approval`, {
    authority: "business",
    approverEmail: "demo.admin@demo.example.com",
    reason: "E2E複合スコア検証（却下）",
  });
  const rejectDecision = await api(base, "POST", `/api/ideas/${rejectedIdeaId}/gates/1/approval`, {
    authority: "business",
    decision: "reject",
    reason: "E2E複合スコア検証却下",
  });
  results.push(["reject gate1 business", rejectDecision.status, rejectDecision.json?.status ?? ""]);

  // 3) 評価ボードを取得し、両ideaのcompositeScore/alignmentを確認
  const evaluation = await api(base, "GET", "/api/ideas/evaluation");
  const items = evaluation.json?.items ?? [];
  const approvedItem = items.find((i) => String(i.id) === approvedIdeaId);
  const rejectedItem = items.find((i) => String(i.id) === rejectedIdeaId);
  results.push(["evaluation status", evaluation.status]);
  results.push(["approved item found", !!approvedItem]);
  results.push(["rejected item found", !!rejectedItem]);

  const businessAxis = approvedItem?.compositeScore?.axes?.find((a) => a.key === "business");
  const domainAxis = approvedItem?.compositeScore?.axes?.find((a) => a.key === "domain");
  const engineeringAxis = approvedItem?.compositeScore?.axes?.find((a) => a.key === "engineering");
  const roiAxis = approvedItem?.compositeScore?.axes?.find((a) => a.key === "roi");
  results.push(["approved business axis", JSON.stringify(businessAxis)]);
  results.push(["approved domain axis", JSON.stringify(domainAxis)]);
  results.push(["approved engineering axis", JSON.stringify(engineeringAxis)]);
  results.push(["approved roi axis", JSON.stringify(roiAxis)]);
  results.push(["approved alignment", approvedItem?.alignment]);
  results.push(["rejected alignment", rejectedItem?.alignment]);

  for (const r of results) console.log(r.join(" | "));

  const pass =
    approvedCreated.status >= 200 &&
    rejectedCreated.status >= 200 &&
    rejectDecision.status === 200 &&
    evaluation.status === 200 &&
    !!approvedItem &&
    !!rejectedItem &&
    (businessAxis?.score ?? 0) > 0 &&
    (domainAxis?.score ?? 0) > 0 &&
    (engineeringAxis?.score ?? 0) > 0 &&
    (roiAxis?.score ?? 0) === 6 &&
    approvedItem.alignment !== "rejected_by_gate" &&
    rejectedItem.alignment === "rejected_by_gate";

  console.log(pass ? "E2E RESULT: PASS" : "E2E RESULT: FAIL");
  process.exitCode = pass ? 0 : 1;
} catch (e) {
  console.error("E2E error:", e.message);
  process.exitCode = 1;
} finally {
  const cleanupIds = [approvedIdeaId, rejectedIdeaId].filter(Boolean);
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
