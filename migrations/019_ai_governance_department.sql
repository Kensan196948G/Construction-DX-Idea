-- 019_ai_governance_department.sql
-- AI Governance: 部署別Token Budget・コスト実績（docs/29 §2.14残・元カタログ#347〜376）。
--
-- 変更点:
--   1. usage_limits / ai_usage_counters / ai_monthly_usage_counters の
--      subject_type に 'department' を追加（既存は 'user'/'global' のみ）。
--   2. idea_ai_sessions へ department 列を追加（コスト実績の部署別集計用。
--      AIへは送信しない・利用状況の帰属記録のみ）。
--
-- Additive migration — safe on live databases。再実行冪等。
-- 対象テーブルは本マイグレーション時点で数件〜10件程度の小規模データのため、
-- 制約再検証によるロック時間は実用上無視できる規模である
-- （大規模テーブルへの同種変更のロック時間分離についてはdocs/29 §3参照）。

alter table usage_limits drop constraint if exists usage_limits_subject_type_check;
alter table usage_limits add constraint usage_limits_subject_type_check
  check (subject_type in ('user', 'global', 'department'));

alter table ai_usage_counters drop constraint if exists ai_usage_counters_subject_type_check;
alter table ai_usage_counters add constraint ai_usage_counters_subject_type_check
  check (subject_type in ('user', 'global', 'department'));

alter table ai_monthly_usage_counters drop constraint if exists ai_monthly_usage_counters_subject_type_check;
alter table ai_monthly_usage_counters add constraint ai_monthly_usage_counters_subject_type_check
  check (subject_type in ('user', 'global', 'department'));

alter table idea_ai_sessions add column if not exists department text not null default '';

create index if not exists idx_idea_ai_sessions_department_created
  on idea_ai_sessions(department, created_at) where department <> '';
