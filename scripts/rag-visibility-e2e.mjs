#!/usr/bin/env -S npx tsx
/* RAG類似検索の情報区分・可視性フィルタ（CodeRabbit指摘・PR #68）の実DB E2E。
   confidential/restricted 案件が非admin候補から除外され、admin には見える
   ことを、findSimilarIdeas を直接呼び出して確認する（HTTP経由の
   ALLOW_LOCAL_AUTH_BYPASS は常にadminへ固定されるため、この検証には
   関数直接呼び出しが必要）。 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { workerSecurityTestHooks } from "../worker/index";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile?.(path.join(root, ".env"));

const { getDb, findSimilarIdeas } = workerSecurityTestHooks;
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
const marker = `RAG可視性E2E ${randomUUID().slice(0, 8)}`;
const owner = "rag-visibility-e2e-owner@example.com";
const stranger = "rag-visibility-e2e-stranger@example.com";

try {
  const [restricted] = await db`
    insert into ideas (
      case_id, title, current_issue, target_business, target_users, current_workflow,
      improvement_idea, expected_effects, required_data, related_systems,
      implementation_options, security_notes, open_questions, mvp_candidate,
      mvp_done_definition, department, submitter_name, submitter_email,
      coordination_needed, stage, created_by, information_classification
    ) values (
      ${"DX-9999-" + Math.floor(Math.random() * 9000 + 1000)}, ${marker + " 極秘案件"}, 'テスト用の困りごと',
      'テスト業務', 'テスト担当', '現状手順', '改善案', '効果',
      '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
      'MVP案', '完了条件', 'テスト部', 'テスト太郎', ${owner}, '',
      'submitted', ${owner}, 'restricted'
    ) returning id, case_id, title
  `;
  check("restricted idea created", !!restricted?.id);

  const asStranger = await findSimilarIdeas(db, marker, undefined, 5, {
    user: stranger,
    isAdmin: false,
  });
  check(
    "non-admin, non-owner does NOT see restricted idea in RAG hits",
    !asStranger.some((hit) => hit.idea.id === restricted.id),
    `hits=${JSON.stringify(asStranger.map((h) => h.idea.id))}`,
  );

  const asOwner = await findSimilarIdeas(db, marker, undefined, 5, {
    user: owner,
    isAdmin: false,
  });
  check(
    "non-admin owner still sees own restricted idea in RAG hits",
    asOwner.some((hit) => hit.idea.id === restricted.id),
  );

  const asAdmin = await findSimilarIdeas(db, marker, undefined, 5, {
    user: "admin-e2e@example.com",
    isAdmin: true,
  });
  check(
    "admin sees restricted idea in RAG hits",
    asAdmin.some((hit) => hit.idea.id === restricted.id),
  );

  await db`delete from ideas where id = ${restricted.id}`;
} catch (error) {
  console.error("E2E error:", error);
  failures++;
} finally {
  await db.end?.({ timeout: 1 }).catch(() => {});
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
