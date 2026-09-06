#!/usr/bin/env node
/* フェーズ別「次の必要Action」・必須成果物チェックリスト（docs/29 §2.9残・
 * migration 020）のローカル実API E2E。
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
let createdIdeaId;
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

  const created = await api(base, "POST", "/api/ideas", {
    structured: {
      title: `[E2E] フェーズチェックリスト ${Date.now()}`,
      currentIssue: "E2Eテスト用の困りごとです。",
      targetBusiness: "検証",
      targetUsers: "テスト",
      currentWorkflow: "テスト登録",
      improvementIdea: "検証後削除",
      expectedEffects: "検証",
      requiredData: [], relatedSystems: [], implementationOptions: [],
      securityNotes: [], openQuestions: [],
      mvpCandidate: "", mvpDoneDefinition: "",
    },
  });
  results.push(["idea register", created.status]);
  if (created.status !== 201 && created.status !== 200) throw new Error(`idea register failed: ${JSON.stringify(created)}`);
  createdIdeaId = String(created.json.id);

  // 1) 初回GET: POST /api/ideas は正式登録（submitted）扱いのためphase 4から開始する。
  //    テンプレートがその場で提示される。
  const phase1 = await api(base, "GET", `/api/ideas/${createdIdeaId}/phase`);
  const initialPhaseNo = phase1.json?.phaseNo;
  results.push([
    "phase get (initial)",
    phase1.status,
    `phaseNo=${initialPhaseNo}`,
    `hasHint=${typeof phase1.json?.nextActionHint === "string" && phase1.json.nextActionHint.length > 0}`,
    `checklist=${phase1.json?.checklist?.length}`,
  ]);

  // 2) チェックリストの1件目を完了にして保存
  const draftChecklist = (phase1.json?.checklist ?? []).map((item, idx) => ({
    ...item,
    done: idx === 0 ? true : item.done,
  }));
  const savedChecklist = await api(base, "PUT", `/api/ideas/${createdIdeaId}/phase/checklist`, {
    checklist: draftChecklist,
  });
  results.push(["phase checklist PUT", savedChecklist.status, `doneCount=${savedChecklist.json?.checklist?.filter((i) => i.done).length}`]);

  // 3) 再GET: 保存したチェック状態が反映されている
  const phase1Again = await api(base, "GET", `/api/ideas/${createdIdeaId}/phase`);
  results.push(["phase get (after checklist save)", phase1Again.status, `firstDone=${phase1Again.json?.checklist?.[0]?.done}`]);

  // 4) フェーズを1つ前進 → 新フェーズのテンプレートへ差し替わる（前のチェック状態はリセット）
  const nextPhaseNo = initialPhaseNo + 1;
  const advance = await api(base, "POST", `/api/ideas/${createdIdeaId}/phase`, { phaseNo: nextPhaseNo });
  results.push(["phase advance", advance.status, `phaseNo=${advance.json?.phaseNo}`]);

  const phase2 = await api(base, "GET", `/api/ideas/${createdIdeaId}/phase`);
  results.push([
    "phase get (after advance)",
    phase2.status,
    `phaseNo=${phase2.json?.phaseNo}`,
    `hint=${phase2.json?.nextActionHint?.slice(0, 20)}`,
    `checklistReset=${phase2.json?.checklist?.every((i) => i.done === false)}`,
  ]);

  for (const r of results) console.log(r.join(" | "));

  const pass =
    ok &&
    created.status >= 200 &&
    phase1.status === 200 && initialPhaseNo >= 1 &&
    typeof phase1.json?.nextActionHint === "string" && phase1.json.nextActionHint.length > 0 &&
    Array.isArray(phase1.json?.checklist) && phase1.json.checklist.length > 0 &&
    savedChecklist.status === 200 &&
    phase1Again.status === 200 && phase1Again.json?.checklist?.[0]?.done === true &&
    advance.status === 200 && advance.json?.phaseNo === nextPhaseNo &&
    phase2.status === 200 && phase2.json?.phaseNo === nextPhaseNo &&
    phase2.json?.checklist?.length > 0 &&
    phase2.json.checklist.every((i) => i.done === false) &&
    phase2.json?.nextActionHint !== phase1.json?.nextActionHint;

  console.log(pass ? "\nE2E RESULT: PASS" : "\nE2E RESULT: FAIL");
  process.exitCode = pass ? 0 : 1;
} catch (e) {
  console.error("E2E error:", e.message);
  process.exitCode = 1;
} finally {
  if (createdIdeaId) {
    try {
      const dbUrl = process.env.DATABASE_URL;
      if (dbUrl) {
        const { default: postgres } = await import("postgres");
        const sql = postgres(dbUrl, { max: 1 });
        await sql`delete from idea_phase_history where idea_id = ${createdIdeaId}`;
        await sql`delete from ideas where id = ${createdIdeaId}`;
        await sql.end();
      }
    } catch { /* cleanup best-effort */ }
  }
  if (child && child.pid) {
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* already dead */ }
  }
  process.exit(process.exitCode ?? 0);
}
