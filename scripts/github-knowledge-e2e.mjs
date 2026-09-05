#!/usr/bin/env node
/* GitHub Engineering 連携（migration 015）と Knowledge Management（migration 016）の
 * ローカル実API E2E。GitHub API はローカルモックサーバー（GITHUB_API_BASE）で応答し、
 * dev-server を一時ポートで起動して実PostgreSQLに対して検証する。
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile?.(path.join(root, ".env"));
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error("DATABASE_URL required");

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

// ---- ローカル GitHub API モック ----
// 案件ID（DX-YYYY-NNNN）は登録後に採番されるため、タイトルはリクエスト時に合成する。
function startGithubMock() {
  let caseId = "";
  const prs = () => [
    { number: 7, title: `feat: ${caseId} 検収写真チェックのMVP`, state: "open", draft: false, html_url: "https://github.test/org/demo-repo/pull/7", updated_at: "2026-09-05T00:00:00Z", body: "" },
    { number: 8, title: "chore: 依存更新", state: "open", draft: false, html_url: "https://github.test/org/demo-repo/pull/8", updated_at: "2026-09-04T00:00:00Z", body: "no case" },
  ];
  const issues = () => [
    { number: 3, title: `${caseId} 検収フローの改善`, state: "open", html_url: "https://github.test/org/demo-repo/issues/3", updated_at: "2026-09-03T00:00:00Z" },
    { number: 9, title: "PRはissues APIに含まれる", state: "open", html_url: "https://github.test/org/demo-repo/pull/9", updated_at: "2026-09-02T00:00:00Z", pull_request: { html_url: "x" } },
  ];
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://github.test");
    const p = url.pathname;
    const json = (body, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (p === "/repos/org/demo-repo") {
      return json({
        full_name: "org/demo-repo",
        default_branch: "main",
        stargazers_count: 5,
        open_issues_count: 2,
        pushed_at: "2026-09-05T00:00:00Z",
        archived: false,
      });
    }
    if (p === "/repos/org/demo-repo/commits/main/status") {
      return json({ state: "success", total_count: 1, repository: { html_url: "https://github.test/org/demo-repo" } });
    }
    if (p === "/repos/org/demo-repo/releases/latest") {
      return json({ tag_name: "v1.0.0", name: "MVP", published_at: "2026-09-01T00:00:00Z", html_url: "https://github.test/org/demo-repo/releases/tag/v1.0.0", prerelease: false });
    }
    if (p === "/repos/org/demo-repo/pulls" && url.searchParams.get("state") === "open") return json(prs());
    if (p === "/repos/org/demo-repo/issues" && url.searchParams.get("state") === "open") return json(issues());
    if (p === "/repos/org/missing") return json({ message: "Not Found" }, 404);
    return json({ message: `mock: no route for ${p}` }, 404);
  });
  return {
    setCaseId(value) { caseId = value; },
    server,
    listen() {
      return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
    },
  };
}

let child;
const sql = postgres(dbUrl, { max: 1 });
let createdIdeaId = null;
let caseIdForCleanup = null;
try {
  const ghMock = startGithubMock();
  const ghPort = await ghMock.listen();
  const port = await freePort();
  child = spawn("npx", ["tsx", "server/dev-server.ts"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      ALLOW_LOCAL_AUTH_BYPASS: "true",
      GITHUB_API_BASE: `http://127.0.0.1:${ghPort}`,
      GITHUB_TOKEN: "e2e-test-token",
    },
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

  // 1) アイデア登録（case_id 採番 → モック側は caseId が判らないため、
  //    PR/Issueタイトル一致は実際の caseId で確認する。モックのタイトルは後から案内される）
  const structured = {
    title: `[E2E] GitHub/Knowledge ${Date.now()}`,
    currentIssue: "GitHub連携と知識管理を実機検証するための一時案件です。Excel転記を解決した。",
    targetBusiness: "検証",
    targetUsers: "テスト",
    currentWorkflow: "テスト登録",
    improvementIdea: "検証後削除",
    expectedEffects: "転記時間の削減",
    requiredData: [], relatedSystems: [], implementationOptions: [],
    securityNotes: ["テストデータ"], openQuestions: [],
    mvpCandidate: "", mvpDoneDefinition: "",
  };
  const created = await api(base, "POST", "/api/ideas", { structured });
  results.push(["idea register", created.status]);
  if (created.status !== 201 && created.status !== 200) { throw new Error(`idea register failed: ${JSON.stringify(created)}`); }
  createdIdeaId = String(created.json.id);
  caseIdForCleanup = String(created.json.caseId ?? "");
  ghMock.setCaseId(caseIdForCleanup);
  await sql`update ideas set created_by = 'demo.other@demo.example.com' where id = ${createdIdeaId}`;

  // 2) Repo紐付け（URL形式の正規化確認を含む）
  const link1 = await api(base, "POST", `/api/ideas/${createdIdeaId}/repos`, { repoFullName: "org/demo-repo" });
  results.push(["link repo", link1.status, link1.json?.repoFullName ?? "", `branch=${link1.json?.defaultBranch}`]);
  const link2 = await api(base, "POST", `/api/ideas/${createdIdeaId}/repos`, { repoFullName: "https://github.com/org/demo-repo.git" });
  results.push(["link repo (URL normalized)", link2.status, link2.json?.repoFullName]);
  const linkBad = await api(base, "POST", `/api/ideas/${createdIdeaId}/repos`, { repoFullName: "org/missing" });
  results.push(["link missing repo (expect 502)", linkBad.status, linkBad.json?.code ?? ""]);

  // 3) Repo一覧
  const list = await api(base, "GET", `/api/ideas/${createdIdeaId}/repos`);
  results.push(["list repos", list.status, `items=${list.json?.items?.length}`, `evidence=${list.json?.evidence?.length}`]);

  // 4) GitHub状態取得（CI/Release/PR/Issue・案件ID一致）
  const overview = await api(base, "GET", `/api/ideas/${createdIdeaId}/github/overview`);
  const repo0 = overview.json?.repos?.[0];
  results.push(["overview ci", repo0?.ciStatus ?? "-"]);
  results.push(["overview release", repo0?.latestRelease?.tagName ?? "-"]);
  results.push(["overview prs", String(repo0?.openPullRequests?.length ?? "-"), `caseMatched=${repo0?.openPullRequests?.filter((p) => p.caseIdMatched).length}`]);
  results.push(["overview issues", String(repo0?.openIssues?.length ?? "-"), `caseMatched=${repo0?.openIssues?.filter((i) => i.caseIdMatched).length}`]);

  // 5) Evidence同期（ci+release+PR2+Issue1=5行・PRはissuesから除外）
  const sync = await api(base, "POST", `/api/ideas/${createdIdeaId}/github/sync`);
  results.push(["sync evidence", sync.status, `upserted=${sync.json?.upserted}`, JSON.stringify(sync.json?.byKind ?? {})]);
  const list2 = await api(base, "GET", `/api/ideas/${createdIdeaId}/repos`);
  results.push(["evidence rows", String(list2.json?.evidence?.length ?? "-")]);

  // 6) Gate1承認（条件: 提案者は別ユーザー済み）→ 判定理由が知識候補化される
  await api(base, "POST", `/api/ideas/${createdIdeaId}/gates/init`);
  await api(base, "POST", `/api/ideas/${createdIdeaId}/gates/1/request-approval`, {
    authority: "business",
    approverEmail: "demo.admin@demo.example.com",
    reason: "E2E知識抽出用",
  });
  const decide = await api(base, "POST", `/api/ideas/${createdIdeaId}/gates/1/approval`, {
    authority: "business",
    decision: "approve",
    reason: "検収写真チェックのMVP化を決定した（E2E用判定理由）",
  });
  results.push(["gate1 approve", decide.status, decide.json?.status ?? ""]);

  // 7) コメント追加（解決系 → problem_solution で抽出される）
  const comment = await api(base, "POST", `/api/ideas/${createdIdeaId}/comments`, {
    body: "Excel転記の二重入力を、フォーム自動化で解決した（E2E用コメント）。",
  });
  results.push(["comment add", comment.status]);

  // 8) Knowledge候補抽出（Gate判定 + コメント）
  const extract = await api(base, "POST", "/api/knowledge/extract");
  results.push(["knowledge extract", extract.status, `created=${extract.json?.created}`, JSON.stringify(extract.json?.scanned ?? {})]);
  const queue = await api(base, "GET", "/api/knowledge?status=candidate");
  const mine = (queue.json?.items ?? []).filter((k) => k.sourceIdeaId === createdIdeaId);
  const gateCandidate = mine.find((k) => k.sourceType === "gate_decision");
  const commentCandidate = mine.find((k) => k.sourceType === "idea_comment");
  results.push(["gate decision candidate", gateCandidate ? gateCandidate.category : "missing"]);
  results.push(["comment candidate", commentCandidate ? commentCandidate.category : "missing"]);

  // 9) 手動登録 → 承認 → 昇格
  const manual = await api(base, "POST", "/api/knowledge", {
    title: `[E2E] 手動知識 ${Date.now()}`,
    category: "best_practice",
    body: "E2E用の手動登録候補です。",
  });
  results.push(["knowledge manual", manual.status, manual.json?.status ?? ""]);
  const review = await api(base, "POST", `/api/knowledge/${manual.json?.id}/review`, { action: "approve", qualityScore: 5 });
  results.push(["knowledge approve", review.status, review.json?.status ?? "", `score=${review.json?.qualityScore}`]);
  const promote = await api(base, "POST", `/api/knowledge/${manual.json?.id}/promote`, { url: "https://notion.example.com/kb/e2e" });
  results.push(["knowledge promote", promote.status, promote.json?.status ?? "", promote.json?.promotionUrl ?? ""]);
  const promoted = await api(base, "GET", "/api/knowledge?status=promoted");
  results.push(["promoted list", promoted.status, `has=${(promoted.json?.items ?? []).some((k) => k.id === manual.json?.id)}`]);

  for (const r of results) console.log(r.join(" | "));

  const pass =
    created.status >= 200 &&
    link1.status === 200 && link1.json?.repoFullName === "org/demo-repo" && link1.json?.defaultBranch === "main" &&
    link2.status === 200 && link2.json?.repoFullName === "org/demo-repo" &&
    linkBad.status === 502 &&
    list.status === 200 && list.json?.items?.length === 1 &&
    repo0?.ciStatus === "success" && repo0?.latestRelease?.tagName === "v1.0.0" &&
    repo0?.openPullRequests?.length === 2 &&
    repo0?.openPullRequests?.filter((p) => p.caseIdMatched).length === 1 &&
    repo0?.openIssues?.length === 1 &&
    sync.status === 200 && sync.json?.upserted === 5 &&
    list2.json?.evidence?.length === 5 &&
    decide.status === 200 && decide.json?.status === "approved" &&
    comment.status >= 200 && comment.status < 300 &&
    extract.status === 200 && extract.json?.created >= 2 &&
    !!gateCandidate && gateCandidate?.category === "decision" &&
    !!commentCandidate && commentCandidate?.category === "problem_solution" &&
    manual.status === 201 && review.status === 200 && review.json?.status === "approved" &&
    promote.status === 200 && promote.json?.status === "promoted" &&
    promoted.json?.items?.some((k) => k.id === manual.json?.id) === true;

  console.log(pass ? "E2E RESULT: PASS" : "E2E RESULT: FAIL");
  process.exitCode = pass ? 0 : 1;
} catch (e) {
  console.error("E2E error:", e.message);
  process.exitCode = 1;
} finally {
  if (createdIdeaId) {
    // knowledge_candidates.source_idea_id は ideas削除で SET NULL になるため、
    // タイトル接頭辞で先に削除する（冪等クリーンアップ）。
    try { await sql`delete from knowledge_candidates where source_idea_id = ${createdIdeaId} or title like '[E2E] GitHub/Knowledge%'`; } catch { /* cleanup */ }
    try { await sql`delete from idea_repo_links where idea_id = ${createdIdeaId}`; } catch { /* cleanup */ }
    try { await sql`delete from idea_github_evidence where idea_id = ${createdIdeaId}`; } catch { /* cleanup */ }
    try { await sql`delete from idea_gate_approvals where idea_id = ${createdIdeaId}`; } catch { /* cleanup */ }
    try { await sql`delete from ideas where id = ${createdIdeaId}`; } catch { /* cleanup */ }
  }
  try { await sql`delete from knowledge_candidates where title like '[E2E] 手動知節%' or title like '[E2E] 手動知識%'`; } catch { /* cleanup */ }
  await sql.end();
  if (child && child.pid) {
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* already dead */ }
  }
  process.exit(process.exitCode ?? 0);
}
