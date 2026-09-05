-- 012_information_classification.sql
-- 情報区分・公開制御（docs/29 §2.17 / Issue #13後のP0候補）。
-- 案件単位のデータ分類（Public / Internal / Confidential / Restricted）を管理する。
--
-- 変更点:
--   1. ideas.information_classification: 案件の情報区分（既定 internal=社内）。
--      public=社外公開可 / internal=社内のみ / confidential=要承認（機密） /
--      restricted=限定公開（要個別許可）。
--   2. ideas.classification_notes: 区分の補足（例: 根拠・適用対象）。
--   3. 区分の変更履歴を idea_classification_history に記録（監査・SoD補助）。
--
-- Additive migration — safe on live databases。再実行冪等。
-- 既定は internal（社内のみ）: 公開前に明示操作を要求する fail-closed 方針。

alter table ideas add column if not exists information_classification text not null default 'internal'
  check (information_classification in ('public', 'internal', 'confidential', 'restricted'));
alter table ideas add column if not exists classification_notes text not null default '';

create table if not exists idea_classification_history (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas(id) on delete cascade,
  from_classification text,
  to_classification text not null,
  reason text,
  changed_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_idea_classification_history_idea
  on idea_classification_history(idea_id);
