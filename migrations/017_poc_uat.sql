-- 017_poc_uat.sql
-- PoC・MVP・UAT管理（docs/29 §2.19 / 元カタログ#436-453）。
-- PoC仮説・成功基準・MVPスコープ(In/Out)・テスト対象者/シナリオを記録し、
-- UATフィードバック（5段階評価+コメント、不具合/改善要望の別）から
-- Go/No-Go（または条件付きGo）判定を支援する。
--
-- 変更点:
--   1. idea_poc_plans: 案件ごとに1件（PoC仮説・成功基準・MVPスコープ・
--      UATチェックリスト・受入判定）。
--   2. idea_uat_feedback: 案件ごとに複数件（テストユーザーからのフィードバック履歴）。
--
-- Additive migration — safe on live databases。再実行冪等。

create table if not exists idea_poc_plans (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null unique references ideas(id) on delete cascade,
  hypothesis text not null default '',
  success_criteria text not null default '',
  mvp_scope_in jsonb not null default '[]'::jsonb,
  mvp_scope_out jsonb not null default '[]'::jsonb,
  test_users text not null default '',
  test_scenarios jsonb not null default '[]'::jsonb,
  uat_checklist jsonb not null default '[]'::jsonb,
  acceptance_result text not null default 'pending'
    check (acceptance_result in ('pending', 'go', 'conditional_go', 'no_go')),
  acceptance_notes text not null default '',
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists idea_uat_feedback (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text not null default '',
  feedback_type text not null default 'general'
    check (feedback_type in ('general', 'defect', 'improvement')),
  submitted_by text not null,
  submitted_at timestamptz not null default now()
);

create index if not exists idx_idea_poc_plans_idea on idea_poc_plans(idea_id);
create index if not exists idx_idea_uat_feedback_idea on idea_uat_feedback(idea_id);
