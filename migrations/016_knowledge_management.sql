-- 016_knowledge_management.sql
-- Knowledge Management（docs/29 §2.16 / 元カタログ#326〜346）。
-- Gate判定理由・コメント・効果測定レビュー等から Knowledge 候補を抽出し、
-- Review Queue（Human Approval）を経て昇格（Notion等へのURL記録）する。
--
-- 変更点:
--   1. knowledge_candidates: Knowledge 候補とそのライフサイクル
--      (candidate → approved/rejected → promoted)。
--
-- Additive migration — safe on live databases。再実行冪等。

create table if not exists knowledge_candidates (
  id uuid primary key default gen_random_uuid(),
  -- 抽出元の種別: gate_decision / idea_comment / kpi_review / manual
  source_type text not null check (source_type in ('gate_decision','idea_comment','kpi_review','manual')),
  -- 抽出元の案件（手動登録では任意）
  source_idea_id uuid references ideas(id) on delete set null,
  -- カテゴリ: decision / problem_solution / lessons / adr / best_practice / runbook / faq
  category text not null check (category in ('decision','problem_solution','lessons','adr','best_practice','runbook','faq')),
  title text not null,
  body text not null default '',
  -- ライフサイクル: candidate → approved | rejected → promoted
  status text not null default 'candidate' check (status in ('candidate','approved','rejected','promoted')),
  -- 品質スコア（1-5・抽出ルールの確度またはレビュー時の評価）
  quality_score integer,
  submitted_by text,
  reviewed_by text,
  reviewed_at timestamptz,
  -- 昇格先（Notion等）のURL
  promotion_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 同一ソースから同一タイトルの候補を重複生成しない
  unique (source_type, source_idea_id, title)
);

create index if not exists idx_knowledge_candidates_status
  on knowledge_candidates(status, created_at);
