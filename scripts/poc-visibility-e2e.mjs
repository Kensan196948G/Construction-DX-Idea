#!/usr/bin/env -S npx tsx
/* PoC/UAT情報の可視性（loadIdeaForPocAccess）の実DB E2E。
   restricted/confidential 案件のPoC/UAT情報が非owner・非adminから
   403となり、public/internal は閲覧できることを確認する
   （ALLOW_LOCAL_AUTH_BYPASS は常にadminへ固定されるため、この検証には
   関数直接呼び出しが必要）。 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { workerSecurityTestHooks } from "../worker/index";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile?.(path.join(root, ".env"));

const { getDb, loadIdeaForPocAccess } = workerSecurityTestHooks;
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
const owner = "poc-visibility-e2e-owner@example.com";
const stranger = "poc-visibility-e2e-stranger@example.com";

async function makeIdea(classification) {
  const marker = `PoC可視性E2E ${randomUUID().slice(0, 8)}`;
  const [row] = await db`
    insert into ideas (
      case_id, title, current_issue, target_business, target_users, current_workflow,
      improvement_idea, expected_effects, required_data, related_systems,
      implementation_options, security_notes, open_questions, mvp_candidate,
      mvp_done_definition, department, submitter_name, submitter_email,
      coordination_needed, stage, created_by, information_classification
    ) values (
      ${"DX-9999-" + Math.floor(Math.random() * 9000 + 1000)}, ${marker}, 'テスト用の困りごと',
      'テスト業務', 'テスト担当', '現状手順', '改善案', '効果',
      '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
      'MVP案', '完了条件', 'テスト部', 'テスト太郎', ${owner}, '',
      'submitted', ${owner}, ${classification}
    ) returning id
  `;
  return row.id;
}

const createdIds = [];
try {
  const restrictedId = await makeIdea("restricted");
  createdIds.push(restrictedId);
  const confidentialId = await makeIdea("confidential");
  createdIds.push(confidentialId);
  const internalId = await makeIdea("internal");
  createdIds.push(internalId);

  async function deniedFor(user, id) {
    try {
      await loadIdeaForPocAccess(db, env, user, id);
      return false;
    } catch (error) {
      return error?.code === "FORBIDDEN" || error?.status === 403;
    }
  }

  check(
    "stranger denied on restricted idea",
    await deniedFor(stranger, restrictedId),
  );
  check(
    "stranger denied on confidential idea",
    await deniedFor(stranger, confidentialId),
  );
  check(
    "stranger allowed on internal idea",
    !(await deniedFor(stranger, internalId)),
  );
  check(
    "owner still allowed on own restricted idea",
    !(await deniedFor(owner, restrictedId)),
  );
} catch (error) {
  console.error("E2E error:", error);
  failures++;
} finally {
  if (createdIds.length) {
    await db`delete from ideas where id = any(${createdIds})`.catch(() => {});
  }
  await db.end?.({ timeout: 1 }).catch(() => {});
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
