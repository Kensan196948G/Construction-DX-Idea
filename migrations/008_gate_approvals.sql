-- 008_gate_approvals.sql
-- Gate拡張・Authority制 多段階承認フロー。
-- 全社Idea-to-Valueプロセス（docs/New/ai-dx-dev-process.md #05）が定める
-- Gate1〜5と3 Authority（Business/Domain/Engineering）に対応する。
--
-- 各ゲートの主承認Authorityは、同資料の表（07/09/13/15/16節）が示す主担当を
-- 単純化して割り当てる（複数Authorityの共同承認は将来拡張とし、本テーブルは
-- 主承認者1名の判定のみを扱う）:
--   Gate1 企画承認     -> business   （経営企画が主）
--   Gate2 開発承認     -> domain     （技術仕様はドメイン承認）
--   Gate3 MVP承認      -> domain     （ドメインが主、経営企画は最終確認）
--   Gate4 本番移行承認 -> business   （経営企画の移行判定が最終）
--   Gate5 Release承認  -> engineering（IT/DXが実行判定）
--
-- 既存の ideas.approval_status（単一承認、migration 004）は後方互換のため
-- 維持し、全ゲート承認完了時に 'approved' を反映する集約先として使う。
-- Additive migration — safe on live databases. Issue #50.

create table if not exists idea_gate_approvals (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas(id) on delete cascade,
  gate_no integer not null check (gate_no between 1 and 5),
  required_authority text not null
    check (required_authority in ('business', 'domain', 'engineering')),
  approver_email text,
  status text not null default 'pending'
    check (status in ('pending', 'requested', 'approved', 'rejected', 'returned')),
  reason text,
  requested_at timestamptz,
  acted_at timestamptz,
  acted_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idea_id, gate_no)
);

create index if not exists idx_idea_gate_approvals_idea on idea_gate_approvals(idea_id);
create index if not exists idx_idea_gate_approvals_status on idea_gate_approvals(status);
