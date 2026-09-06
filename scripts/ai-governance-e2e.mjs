#!/usr/bin/env -S npx tsx
/* AI Governance: 部署別Token Budget・コスト実績（docs/29 §2.14残・migration 019）の実DB/実API E2E。
 *
 * 1) getEffectiveUsageLimits を直接呼び出し、department指定時のみ部署別上限が
 *    含まれること（usage_limitsに有効な行がある場合のみ）を実DBで確認する
 *    （ALLOW_LOCAL_AUTH_BYPASSのdemoプロバイダ経路は日次/月次予算チェック自体を
 *    スキップするため、予算判定ロジックそのものはHTTP経由では検証できない）。
 * 2) dev-server（bypass・demoプロバイダ）を起動し、PUT /api/admin/usage-limits
 *    （department）→ POST /api/ai/questions（department付き）→
 *    GET /api/admin/ai-usage/by-department で部署別コスト実績への反映を確認する
 *    （auditAiはdemoプロバイダでも実行されるため、departmentの記録自体は検証可能）。
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { workerSecurityTestHooks } from "../worker/index";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile?.(path.join(root, ".env"));

const { getDb, getEffectiveUsageLimits } = workerSecurityTestHooks;
const env = { DATABASE_URL: process.env.DATABASE_URL ?? "" };
if (!env.DATABASE_URL) {
  console.log("SKIP: DATABASE_URL not set — this E2E requires a local Postgres instance.");
  process.exit(0);
}

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${cond ? "" : detail}`);
  if (!cond) failures++;
};

const db = getDb(env);
const department = `E2E部署テスト-${Date.now()}`;
const otherDepartment = `E2E部署テスト-未設定-${Date.now()}`;

try {
  // 1) 直接呼び出し: usage_limitsに部署別の有効な行がある場合のみ反映される。
  await db`
    insert into usage_limits (subject_type, subject_id, daily_ai_limit, monthly_budget, enabled, updated_by)
    values ('department', ${department}, 3, 500, true, 'e2e-test')
  `;

  const withDept = await getEffectiveUsageLimits(env, "e2e-user@example.com", 10, 0, department);
  const deptLimit = withDept.find((l) => l.subjectType === "department");
  check("department limit included when department has an enabled row", !!deptLimit, JSON.stringify(withDept));
  check("department limit values match", deptLimit?.dailyLimit === 3 && deptLimit?.monthlyBudget === 500, JSON.stringify(deptLimit));

  const withoutDeptArg = await getEffectiveUsageLimits(env, "e2e-user@example.com", 10, 0);
  check(
    "department limit absent when no department is passed",
    !withoutDeptArg.some((l) => l.subjectType === "department"),
    JSON.stringify(withoutDeptArg),
  );

  const withOtherDept = await getEffectiveUsageLimits(env, "e2e-user@example.com", 10, 0, otherDepartment);
  check(
    "department limit absent for a department with no usage_limits row",
    !withOtherDept.some((l) => l.subjectType === "department"),
    JSON.stringify(withOtherDept),
  );
} catch (error) {
  console.error("Direct-call E2E error:", error);
  failures++;
} finally {
  await db`delete from usage_limits where subject_type = 'department' and subject_id = ${department}`.catch(() => {});
}

// 2) HTTP経由: PUT usage-limits → POST /api/ai/questions(department) → by-department集計。
let child;
try {
  const port = await new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port: p } = server.address();
      server.close(() => resolve(p));
    });
  });
  child = spawn("npx", ["tsx", "server/dev-server.ts"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), ALLOW_LOCAL_AUTH_BYPASS: "true" },
    stdio: ["ignore", "ignore", "ignore"],
    detached: true,
  });
  const base = `http://127.0.0.1:${port}`;
  const api = async (method, p, body) => {
    const res = await fetch(`${base}${p}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 300) }; }
    return { status: res.status, json };
  };

  let healthy = false;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${base}/api/health`); if (r.ok) { healthy = true; break; } } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  check("dev-server health", healthy);

  const httpDept = `E2E部署テストHTTP-${Date.now()}`;
  const put = await api("PUT", "/api/admin/usage-limits", {
    subjectType: "department",
    subjectId: httpDept,
    dailyLimit: 50,
    monthlyBudget: 1000,
    enabled: true,
  });
  check("usage-limits PUT (department)", put.status === 200 && put.json?.subjectType === "department", `status=${put.status}`);

  const rejectBlank = await api("PUT", "/api/admin/usage-limits", {
    subjectType: "department",
    subjectId: "   ",
    dailyLimit: 1,
    monthlyBudget: 1,
    enabled: true,
  });
  check("usage-limits PUT rejects whitespace-only department id (400)", rejectBlank.status === 400, `status=${rejectBlank.status}`);

  const listLimits = await api("GET", "/api/admin/usage-limits");
  check(
    "usage-limits GET includes the new department row",
    (listLimits.json?.items ?? []).some((it) => it.subjectType === "department" && it.subjectId === httpDept),
    JSON.stringify(listLimits.json),
  );

  const question = await api("POST", "/api/ai/questions", {
    input: {
      workType: "E2Eテスト用の困りごと入力です。",
      currentWorkflow: "現状の手順テキスト。",
      desiredState: "改善後の理想状態テキスト。",
      confidentiality: "none",
    },
    department: httpDept,
  });
  check("ai/questions with department (demo provider)", question.status === 200, `status=${question.status} body=${JSON.stringify(question.json).slice(0, 200)}`);

  const byDept = await api("GET", "/api/admin/ai-usage/by-department");
  const row = (byDept.json?.items ?? []).find((it) => it.department === httpDept);
  check("ai-usage/by-department reflects the recorded call", !!row && row.totalCalls >= 1, JSON.stringify(row));

  // cleanup（HTTP側で作った部署のusage_limits/ai_usage_countersを削除）
  await db`delete from usage_limits where subject_type = 'department' and subject_id in (${httpDept}, ${otherDepartment})`.catch(() => {});
  await db`delete from idea_ai_sessions where department in (${httpDept}, ${otherDepartment})`.catch(() => {});
} catch (error) {
  console.error("HTTP E2E error:", error);
  failures++;
} finally {
  await db.end?.({ timeout: 1 }).catch(() => {});
  if (child && child.pid) {
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* already dead */ }
  }
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
