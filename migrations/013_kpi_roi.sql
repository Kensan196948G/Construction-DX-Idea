-- 013_kpi_roi.sql
-- KPI・ROI・Benefit Realization（docs/29 §2.6 / 元カタログ#123-148）。
-- 「何件アイデアが集まったか」ではなく「会社にいくら価値を出したか」を見える化する。
--
-- 変更点:
--   1. ideas.kpi_baseline_hours: 現状の月間工数（人時）。null=未設定。
--   2. ideas.kpi_baseline_cost: 現状の月間コスト（円）。null=未設定。
--   3. idea_kpis: 案件ごとの効果測定レコード。
--       target_reduction_pct(目標削減率) / actual_reduction_pct(本番後実績削減率) /
--       measured_at(測定日) / period_months(測定対象月数) /
--       outcome(継続/改善/停止/未判定) / review_note(未達理由・改善Action等)。
--       ※1案件複数回測定（3/6/12か月レビュー等）を想定し履歴として蓄積する。
--
-- Additive migration — safe on live databases。再実行冪等。

alter table ideas add column if not exists kpi_baseline_hours numeric(12, 1);
alter table ideas add column if not exists kpi_baseline_cost numeric(14, 0);

create table if not exists idea_kpis (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas(id) on delete cascade,
  target_reduction_pct numeric(5, 1),
  actual_reduction_pct numeric(5, 1),
  measured_at timestamptz not null default now(),
  period_months integer not null default 3 check (period_months > 0),
  outcome text not null default 'pending'
    check (outcome in ('pending', 'continue', 'improve', 'stop')),
  review_note text not null default '',
  recorded_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_idea_kpis_idea on idea_kpis(idea_id);
create index if not exists idx_ideas_kpi_baseline on ideas(kpi_baseline_hours);
