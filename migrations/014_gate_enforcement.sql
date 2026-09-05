-- 014_gate_enforcement.sql
-- Gate高度化（docs/29 §2.7 / 元カタログ#155-181）。
-- 承認期限・代理承認・条件付き承認・滞留分析のためのスキーマ拡張。
--
-- 変更点:
--   1. idea_gate_approvals.requested_due_at: 承認依頼の期限（null=期限なし）。
--      依頼時に指定するか、システム既定（例: 5営業日）を設定する。
--   2. idea_gate_approvals.delegate_to: 代理承認者（元承認者の代わりに判定できる人）。
--   3. idea_gate_approvals.condition_note: 条件付き承認の場合の条件（例: 「XXの修正が
--      完了すること」）。approve 時に設定し、条件は別途充足確認する。
--   4. idea_gate_approvals.condition_met: 条件充足済みか（boolean・null=条件なし）。
--   5. idea_gate_approvals.last_reminded_at / reminder_count: 承認リマインダーの
--      最終送信時刻と送信回数（日次クローン or 管理APIから送信）。
--   6. idea_gate_approvals.escalated_at: 期限超過でエスカレーションした時刻。
--   7. gate_dwell_*: 滞留分析用の補助関数はSQLで都度集計するため、列のみ追加する。
--
-- Additive migration — safe on live databases。再実行冪等。

alter table idea_gate_approvals add column if not exists requested_due_at timestamptz;
alter table idea_gate_approvals add column if not exists delegate_to text;
alter table idea_gate_approvals add column if not exists condition_note text not null default '';
alter table idea_gate_approvals add column if not exists condition_met boolean;
alter table idea_gate_approvals add column if not exists last_reminded_at timestamptz;
alter table idea_gate_approvals add column if not exists reminder_count integer not null default 0;
alter table idea_gate_approvals add column if not exists escalated_at timestamptz;

-- 滞留分析（期限超過のrequested行）を高速化する索引
create index if not exists idx_idea_gate_approvals_due
  on idea_gate_approvals(status, requested_due_at)
  where status = 'requested';
