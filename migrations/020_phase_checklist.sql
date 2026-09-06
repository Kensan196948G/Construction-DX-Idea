-- 020_phase_checklist.sql
-- フェーズ別必須成果物チェックリスト（docs/29 §2.9残・元カタログ#205〜224）。
--
-- 変更点:
--   1. ideas.phase_checklist: 現在フェーズの必須成果物チェックリスト
--      （[{item, done}]形式のjsonb）。フェーズが進む/戻るたびに、そのフェーズの
--      既定テンプレート（shared.ts phaseDeliverableTemplates）で置き換える。
--
-- Additive migration — safe on live databases。再実行冪等。

alter table ideas add column if not exists phase_checklist jsonb not null default '[]'::jsonb;
