#!/usr/bin/env node
/* PoC・MVP・UAT管理（migration 017・docs/29 §2.19）のローカル実API E2E。
 * dev-server を一時ポートで起動し、実PostgreSQLに対してPoC計画の登録、
 * UATチェックリスト・受入判定の更新、UATフィードバックの投稿・集計を検証する。
 */
import { spawn } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile?.(path.join(root, ".env"));
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error("DATABASE_URL required");
const sql = postgres(dbUrl, { max: 1 });

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
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
let createdIdeaId;
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

  const structured = {
    title: `[E2E] PoC/UAT ${Date.now()}`,
    currentIssue: "PoC/UAT管理を実機検証するための一時案件です。",
    targetBusiness: "検証",
    targetUsers: "テスト",
    currentWorkflow: "テスト登録",
    improvementIdea: "検証後削除",
    expectedEffects: "検証",
    requiredData: [], relatedSystems: [], implementationOptions: [],
    securityNotes: [], openQuestions: [],
    mvpCandidate: "", mvpDoneDefinition: "",
  };
  const created = await api(base, "POST", "/api/ideas", { structured });
  results.push(["idea register", created.status]);
  if (created.status !== 201 && created.status !== 200) throw new Error(`idea register failed: ${JSON.stringify(created)}`);
  createdIdeaId = String(created.json.id);

  // 1) 未登録時はデフォルト値が返る
  const empty = await api(base, "GET", `/api/ideas/${createdIdeaId}/poc`);
  results.push(["poc get (empty)", empty.status, empty.json?.plan?.acceptanceResult]);

  // 2) PoC計画の登録
  const upsert = await api(base, "PUT", `/api/ideas/${createdIdeaId}/poc`, {
    hypothesis: "写真の自動分類で確認時間を50%削減できる",
    successCriteria: "1現場で1週間試用し、確認時間が半減すること",
    mvpScopeIn: ["写真アップロード", "自動分類"],
    mvpScopeOut: ["帳票出力", "他システム連携"],
    testUsers: "現場代理人3名",
    testScenarios: ["撮影→アップロード→分類確認"],
  });
  results.push(["poc upsert", upsert.status, upsert.json?.hypothesis?.slice(0, 10)]);

  // 3) UATフィードバックを3件投稿（good, good, defect）→ 平均4.0超・不具合1件 → conditional_go相当
  const fb1 = await api(base, "POST", `/api/ideas/${createdIdeaId}/uat-feedback`, { rating: 5, comment: "使いやすい", feedbackType: "general" });
  const fb2 = await api(base, "POST", `/api/ideas/${createdIdeaId}/uat-feedback`, { rating: 4, comment: "概ね良好", feedbackType: "improvement" });
  const fb3 = await api(base, "POST", `/api/ideas/${createdIdeaId}/uat-feedback`, { rating: 3, comment: "分類が誤ることがある", feedbackType: "defect" });
  results.push(["uat feedback x3", fb1.status, fb2.status, fb3.status]);

  const feedbackList = await api(base, "GET", `/api/ideas/${createdIdeaId}/uat-feedback`);
  results.push([
    "uat feedback list",
    feedbackList.status,
    `count=${feedbackList.json?.summary?.count}`,
    `avg=${feedbackList.json?.summary?.averageRating}`,
    `verdict=${feedbackList.json?.summary?.recommendedVerdict}`,
  ]);

  // 4) UATチェックリストの更新と受入判定
  const checklist = await api(base, "PUT", `/api/ideas/${createdIdeaId}/poc/checklist`, {
    uatChecklist: [
      { item: "撮影→アップロードが3秒以内", done: true },
      { item: "分類精度90%以上", done: false },
    ],
    acceptanceResult: "conditional_go",
    acceptanceNotes: "分類精度の改善を条件に本番化を検討する",
  });
  results.push(["poc checklist update", checklist.status, checklist.json?.acceptanceResult]);

  const final = await api(base, "GET", `/api/ideas/${createdIdeaId}/poc`);
  results.push([
    "poc get (final)",
    final.status,
    final.json?.plan?.acceptanceResult,
    `checklist=${final.json?.plan?.uatChecklist?.length}`,
    `feedbackSummary.verdict=${final.json?.feedbackSummary?.recommendedVerdict}`,
  ]);

  for (const r of results) console.log(r.join(" | "));

  const pass =
    created.status >= 200 &&
    empty.status === 200 && empty.json?.plan?.acceptanceResult === "pending" &&
    upsert.status === 200 && upsert.json?.mvpScopeIn?.length === 2 &&
    fb1.status === 201 && fb2.status === 201 && fb3.status === 201 &&
    feedbackList.status === 200 && feedbackList.json?.summary?.count === 3 &&
    feedbackList.json?.summary?.defectCount === 1 &&
    feedbackList.json?.summary?.recommendedVerdict === "conditional_go" &&
    checklist.status === 200 && checklist.json?.acceptanceResult === "conditional_go" &&
    final.status === 200 && final.json?.plan?.uatChecklist?.length === 2 &&
    final.json?.feedbackSummary?.recommendedVerdict === "conditional_go";

  console.log(pass ? "E2E RESULT: PASS" : "E2E RESULT: FAIL");
  process.exitCode = pass ? 0 : 1;
} catch (e) {
  console.error("E2E error:", e.message);
  process.exitCode = 1;
} finally {
  if (createdIdeaId) {
    // idea_poc_plans / idea_uat_feedback は on delete cascade のため idea削除で連動削除される。
    try { await sql`delete from ideas where id = ${createdIdeaId}`; } catch { /* cleanup */ }
  }
  await sql.end();
  if (child && child.pid) {
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* already dead */ }
  }
  process.exit(process.exitCode ?? 0);
}
