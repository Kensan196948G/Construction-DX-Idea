#!/usr/bin/env node
/* Saved Filter / My View（docs/29 §2.23残P2・migration 021）のローカル実API E2E。
 * - 作成・一覧（listTypeフィルタ）・更新・削除の基本CRUD
 * - 他ユーザーの保存済みフィルタは更新・削除できないこと（所有者チェック）
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
let issueFilterId = null;
let ideaFilterId = null;
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

  // 1) issue用フィルタを作成
  const createIssue = await api(base, "POST", "/api/saved-filters", {
    listType: "issue",
    name: "至急対応（E2E）",
    params: { stage: "submitted", q: "写真" },
  });
  results.push(["create issue filter", createIssue.status]);
  issueFilterId = createIssue.json?.id;

  // 2) idea用フィルタを作成
  const createIdea = await api(base, "POST", "/api/saved-filters", {
    listType: "idea",
    name: "MVP検討中（E2E）",
    params: { stage: "mvp" },
  });
  results.push(["create idea filter", createIdea.status]);
  ideaFilterId = createIdea.json?.id;

  // 3) listType=issueで一覧 → issueのみ含まれる
  const listIssue = await api(base, "GET", "/api/saved-filters?listType=issue");
  const issueIds = (listIssue.json?.items ?? []).map((i) => i.id);
  results.push(["list issue filters", listIssue.status, `contains=${issueIds.includes(issueFilterId)}`, `excludesIdea=${!issueIds.includes(ideaFilterId)}`]);

  // 4) listType未指定で一覧 → 両方含まれる
  const listAll = await api(base, "GET", "/api/saved-filters");
  const allIds = (listAll.json?.items ?? []).map((i) => i.id);
  results.push(["list all filters", listAll.status, `containsIssue=${allIds.includes(issueFilterId)}`, `containsIdea=${allIds.includes(ideaFilterId)}`]);

  // 5) 名前を更新
  const rename = await api(base, "PATCH", `/api/saved-filters/${issueFilterId}`, { name: "至急対応（改名・E2E）" });
  results.push(["rename issue filter", rename.status, rename.json?.name]);

  // 6) 他ユーザーの所有物として偽装（DB直更新）した後、更新・削除がFORBIDDEN(403)になることを確認
  await sql`update saved_filters set owner_email = 'demo.other@demo.example.com' where id = ${ideaFilterId}`;
  const forbiddenUpdate = await api(base, "PATCH", `/api/saved-filters/${ideaFilterId}`, { name: "乗っ取り試行" });
  results.push(["update other user's filter (expect 403)", forbiddenUpdate.status]);
  const forbiddenDelete = await api(base, "DELETE", `/api/saved-filters/${ideaFilterId}`);
  results.push(["delete other user's filter (expect 403)", forbiddenDelete.status]);

  // 7) 自分のフィルタは削除できる
  const deleteOwn = await api(base, "DELETE", `/api/saved-filters/${issueFilterId}`);
  results.push(["delete own filter", deleteOwn.status]);
  const listAfterDelete = await api(base, "GET", "/api/saved-filters?listType=issue");
  const stillThere = (listAfterDelete.json?.items ?? []).some((i) => i.id === issueFilterId);
  results.push(["issue filter gone after delete", !stillThere]);

  for (const r of results) console.log(r.join(" | "));

  const pass =
    createIssue.status === 201 &&
    createIdea.status === 201 &&
    listIssue.status === 200 &&
    issueIds.includes(issueFilterId) &&
    !issueIds.includes(ideaFilterId) &&
    listAll.status === 200 &&
    allIds.includes(issueFilterId) &&
    allIds.includes(ideaFilterId) &&
    rename.status === 200 &&
    rename.json?.name === "至急対応（改名・E2E）" &&
    forbiddenUpdate.status === 403 &&
    forbiddenDelete.status === 403 &&
    deleteOwn.status === 200 &&
    !stillThere;

  console.log(pass ? "E2E RESULT: PASS" : "E2E RESULT: FAIL");
  process.exitCode = pass ? 0 : 1;
} catch (e) {
  console.error("E2E error:", e.message);
  process.exitCode = 1;
} finally {
  const cleanupIds = [issueFilterId, ideaFilterId].filter(Boolean);
  for (const id of cleanupIds) {
    try { await sql`delete from saved_filters where id = ${id}`; } catch { /* cleanup */ }
  }
  await sql.end();
  if (child && child.pid) {
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* already dead */ }
  }
  process.exit(process.exitCode ?? 0);
}
