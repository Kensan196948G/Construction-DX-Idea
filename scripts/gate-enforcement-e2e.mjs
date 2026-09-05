#!/usr/bin/env node
/* Gate高度化（migration 014・docs/29 §2.7）のローカル実API E2E。
 * - 承認期限（dueAt・過去日時は拒否）
 * - 代理承認（delegateTo）
 * - 条件付き承認（conditionNote）
 * - Gate滞留分析（/api/admin/gates/overview）
 * - リマインダー/エスカレーション（/api/admin/gates/reminders/run・24h間隔制御）
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
let createdIdeaId = null;
let dwellIdeaId = null;
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
  const dueIn3d = new Date(Date.now() + 3 * 864e5).toISOString();
  const dueIn10d = new Date(Date.now() + 10 * 864e5).toISOString();

  // 1) アイデア登録（提案者 = local.dev・bypass ユーザー）
  const structured = {
    title: `[E2E] Gate Enforcement ${Date.now()}`,
    currentIssue: "Gate高度化（期限/代理/条件付き/滞留分析）を実機検証するための一時案件です。",
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
  if (created.status !== 201 && created.status !== 200) { throw new Error(`idea register failed: ${JSON.stringify(created)}`); }
  createdIdeaId = String(created.json.id);

  // 判定者（bypassユーザー local.dev）が提案者自身だと SoD 403 になるため、
  // 提案者を別ユーザーへ変更して approve の成功経路を検証できるようにする。
  await sql`update ideas set created_by = 'demo.other@demo.example.com' where id = ${createdIdeaId}`;

  // 2) gates/init
  const init = await api(base, "POST", `/api/ideas/${createdIdeaId}/gates/init`);
  results.push(["gates/init", init.status, `rows=${init.json?.items?.length ?? "-"}`]);

  // 3) 過去日時の期限 → 400
  const pastDue = await api(base, "POST", `/api/ideas/${createdIdeaId}/gates/1/request-approval`, {
    authority: "business",
    approverEmail: "demo.admin@demo.example.com",
    reason: "E2E期限検証",
    dueAt: new Date(Date.now() - 864e5).toISOString(),
  });
  results.push(["past dueAt (expect 400)", pastDue.status, pastDue.json?.code ?? ""]);

  // 4) 承認期限+代理承認つきの依頼（承認者=別ユーザー、代理=bypassユーザー）
  const req = await api(base, "POST", `/api/ideas/${createdIdeaId}/gates/1/request-approval`, {
    authority: "business",
    approverEmail: "demo.admin@demo.example.com",
    reason: "E2E依頼",
    dueAt: dueIn3d,
    delegateTo: "local.dev@example.com",
  });
  results.push(["request with due+delegate", req.status, req.json?.status ?? ""]);
  results.push(["dueAt saved", req.json?.requestedDueAt ? String(req.json.requestedDueAt).slice(0, 10) : "none"]);
  results.push(["delegate saved", req.json?.delegateTo ?? "none"]);

  // 5) 別案件でGate1のみ依頼（期限つき・後で滞留分析/エスカレーション対象にする。
  //    Gate2はGate1全Authority承認が前提のため、滞留検証はGate1のまま使う）
  const createdB = await api(base, "POST", "/api/ideas", { structured: { ...structured, title: `[E2E] Gate Enforcement Dwell ${Date.now()}` } });
  if (createdB.status !== 201 && createdB.status !== 200) { throw new Error(`idea register (dwell) failed: ${JSON.stringify(createdB)}`); }
  dwellIdeaId = String(createdB.json.id);
  await sql`update ideas set created_by = 'demo.other@demo.example.com' where id = ${dwellIdeaId}`;
  await api(base, "POST", `/api/ideas/${dwellIdeaId}/gates/init`);
  const req2 = await api(base, "POST", `/api/ideas/${dwellIdeaId}/gates/1/request-approval`, {
    authority: "business",
    approverEmail: "demo.admin@demo.example.com",
    reason: "E2E滞留検証",
    dueAt: dueIn10d,
  });
  results.push(["request滞留idea gate1", req2.status, req2.json?.status ?? ""]);
  if (req.status !== 200 || req2.status !== 200) { throw new Error(`gate request failed: ${JSON.stringify([req, req2])}`); }

  // 6) 条件付き承認（代理承認者=bypassユーザーが判定）
  const cond = await api(base, "POST", `/api/ideas/${createdIdeaId}/gates/1/approval`, {
    authority: "business",
    decision: "approve",
    reason: "条件付きで承認する",
    conditionNote: "セキュリティレビュー完了まで本番化しないこと",
    conditionMet: false,
  });
  results.push(["conditional approve (delegate)", cond.status, cond.json?.status ?? ""]);
  results.push(["conditionNote saved", cond.json?.conditionNote ? "yes" : "no"]);
  results.push(["conditionMet saved", String(cond.json?.conditionMet ?? "null")]);

  // 7) GET /gates で条件・期限・代理が返ること
  const gates = await api(base, "GET", `/api/ideas/${createdIdeaId}/gates`);
  const g1 = gates.json?.items?.find((r) => r.gateNo === 1 && r.requiredAuthority === "business");
  results.push(["GET gate1 condition", g1?.conditionNote ? "yes" : "no"]);
  results.push(["GET gate1 delegate", g1?.delegateTo ?? "none"]);

  // 8) 滞留分析（requested行: 滞留案件のGate1 business 1件）
  const overview = await api(base, "GET", "/api/admin/gates/overview");
  const ovItems = overview.json?.items ?? [];
  const mine = ovItems.find((r) => r.ideaId === dwellIdeaId);
  results.push(["overview total", String(overview.json?.total ?? "-")]);
  results.push(["overview mine", mine ? `gate${mine.gateNo}/${mine.requiredAuthority}` : "missing"]);
  results.push(["overview dwell", String(mine?.dwellDays ?? "-")]);

  // 9) 期限を過去へ変更（SQL）→ 期限超過として滞留分析・エスカレーション対象に
  await sql`
    update idea_gate_approvals
    set requested_due_at = now() - interval '1 day'
    where idea_id = ${dwellIdeaId} and gate_no = 1 and required_authority = 'business'
  `;
  const overview2 = await api(base, "GET", "/api/admin/gates/overview");
  const mine2 = (overview2.json?.items ?? []).find((r) => r.ideaId === dwellIdeaId);
  results.push(["overview overdue", String(mine2?.overdue ?? "-")]);
  results.push(["overview overdueCount", String(overview2.json?.overdueCount ?? "-")]);

  // 10) リマインダー/エスカレーション実行
  const run1 = await api(base, "POST", "/api/admin/gates/reminders/run");
  results.push(["reminders run1", run1.status, `escalated=${run1.json?.escalated}`]);
  const dbRow = await sql`
    select reminder_count, escalated_at, last_reminded_at
    from idea_gate_approvals
    where idea_id = ${dwellIdeaId} and gate_no = 1 and required_authority = 'business'
  `;
  results.push(["db reminder_count", String(dbRow[0]?.reminder_count ?? "-")]);
  results.push(["db escalated_at", dbRow[0]?.escalated_at ? "set" : "unset"]);

  // 11) 24h間隔制御: 再実行では skipped になる
  const run2 = await api(base, "POST", "/api/admin/gates/reminders/run");
  results.push(["reminders run2 (expect skipped)", `escalated=${run2.json?.escalated}`, `skipped=${run2.json?.skipped}`]);

  for (const r of results) console.log(r.join(" | "));

  const pass =
    created.status >= 200 &&
    [200, 201].includes(init.status) &&
    pastDue.status === 400 &&
    req.status === 200 &&
    req.json?.requestedDueAt &&
    req.json?.delegateTo === "local.dev@example.com" &&
    req2.status === 200 &&
    cond.status === 200 &&
    cond.json?.status === "approved" &&
    !!cond.json?.conditionNote &&
    cond.json?.conditionMet === false &&
    !!g1?.conditionNote &&
    g1?.delegateTo === "local.dev@example.com" &&
    !!mine &&
    mine2?.overdue === true &&
    run1.status === 200 &&
    run1.json?.escalated >= 1 &&
    Number(dbRow[0]?.reminder_count) >= 1 &&
    !!dbRow[0]?.escalated_at &&
    run2.status === 200 &&
    run2.json?.escalated === 0 &&
    run2.json?.skipped >= 1;

  console.log(pass ? "E2E RESULT: PASS" : "E2E RESULT: FAIL");
  process.exitCode = pass ? 0 : 1;
} catch (e) {
  console.error("E2E error:", e.message);
  process.exitCode = 1;
} finally {
  // process.exit は finally のクリーンアップを飛ばすため、ここで必ず後始末してから終了する。
  const cleanupIds = [createdIdeaId, dwellIdeaId].filter(Boolean);
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
