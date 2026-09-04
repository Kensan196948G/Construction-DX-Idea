-- 009_gate_authority_policy.sql
-- 複数Authority共同承認（Gate Policy Engine v2）。
-- 全社Idea-to-Valueプロセス（docs/New/ai-dx-dev-process.md #05/#06）が定める
-- 「Gateごとに承認が必要なAuthorityの組合せ」を実現するためのスキーマ拡張。
--
-- 変更点:
--   1. idea_gate_approvals の一意制約を (idea_id, gate_no) から
--      (idea_id, gate_no, required_authority) へ変更。
--      1 Gate に Authority ごとの承認行を複数持てるようにする
--      （例: Gate1 = business行 + domain行 + engineering行）。
--   2. requested_by 列を追加。Gate申請者（SoD: 申請者 ≠ 承認者）の記録・監査に使う。
--   3. approval_seq 列を追加。同一Gate内の承認順序（並列承認の場合は同一値）を保持する。
--      ※ 現行実装では並列（全員承認）だが、将来の順次承認への拡張に備える。
--
-- 制約変更の安全性: 0008 時点の行は (idea_id, gate_no) ごと1行（主Authorityのみ）だが、
-- 既存DBへの適用時は本migrationが主Authority行を残したまま追加Authority行の
-- バックフィルは行わない（実行時に worker の /gates/init が gateAuthorityPolicy
-- （src/lib/shared.ts）に基づいて不足行を on conflict do nothing で補完する）。
-- migration 008 は本番DBへ未適用（state.json: 適用は承認待ち）のため、実データ破壊なし。
-- 再実行しても安全（DO ブロック・IF NOT EXISTS で冪等）。

-- 1) 旧一意制約（idea_id, gate_no）を除去
do $$
declare
  constraint_name text;
begin
  -- 008 の inline UNIQUE は PostgreSQL が idea_gate_approvals_idea_id_gate_no_key と命名する。
  -- 万一異なる命名の unique 制約が残っていても拾えるよう名前で検索する。
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'idea_gate_approvals'::regclass
    and contype = 'u'
    and conname like 'idea_gate_approvals%'
  order by conname
  limit 1;

  if constraint_name is not null then
    execute format('alter table idea_gate_approvals drop constraint %I', constraint_name);
  end if;
end $$;

-- 2) 新一意制約（idea_id, gate_no, required_authority）
create unique index if not exists uq_idea_gate_approvals_idea_gate_authority
  on idea_gate_approvals (idea_id, gate_no, required_authority);

-- 3) requested_by（Gate申請者）列
alter table idea_gate_approvals add column if not exists requested_by text;

-- 4) approval_seq（Gate内承認順序。並列=同一値。既定1）
alter table idea_gate_approvals add column if not exists approval_seq integer not null default 1;

-- 補助インデックス（008に合わせて維持）
create index if not exists idx_idea_gate_approvals_idea on idea_gate_approvals(idea_id);
create index if not exists idx_idea_gate_approvals_status on idea_gate_approvals(status);
