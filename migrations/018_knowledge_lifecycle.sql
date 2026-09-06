-- 018_knowledge_lifecycle.sql
-- Knowledge Management ライフサイクル拡張（docs/29 §2.16残・元カタログ#326〜346）。
-- Knowledge Owner・有効期限・Superseded/Archived・重複統合（後継への統合）・
-- 再利用回数を追加する。品質スコアの自動評価はアプリ側（shared.ts）の
-- 決定論的関数で行い、DBには結果値のみ保存する（既存quality_score列を継続利用）。
--
-- 変更点:
--   1. knowledge_candidates へ owner/expires_at/superseded_by/reuse_count を追加
--   2. status に 'superseded'・'archived' を追加
--
-- Additive migration — safe on live databases。再実行冪等。

alter table knowledge_candidates
  add column if not exists owner text,
  add column if not exists expires_at timestamptz,
  add column if not exists superseded_by uuid references knowledge_candidates(id) on delete set null,
  add column if not exists reuse_count integer not null default 0;

alter table knowledge_candidates drop constraint if exists knowledge_candidates_status_check;
alter table knowledge_candidates add constraint knowledge_candidates_status_check
  check (status in ('candidate', 'approved', 'rejected', 'promoted', 'superseded', 'archived'));

create index if not exists idx_knowledge_candidates_expires_at
  on knowledge_candidates(expires_at) where expires_at is not null;
