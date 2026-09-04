-- 010_idea_value_phases.sql
-- 20フェーズ Idea-to-Value 進捗管理（docs/New/ai-dx-dev-process.md #04）。
-- 各案件が「Idea受付→…→ナレッジ化・継続判断」のどのフェーズにいるかを正式管理する。
--
-- 変更点:
--   1. ideas.phase_no: 現在フェーズ（1〜20）。null なら「未設定（旧データはstageから導出）」。
--   2. ideas.phase_note: 現在フェーズの補足（任意、例: Blocker/次のAction）。
--   3. idea_phase_history: フェーズ遷移の履歴（誰がいつ、どこからどこへ、理由）。
--
-- 後方互換: 既存行は stage からフェーズへ初期マッピング（下記DOブロック）。
--   下書き     -> 1（アイデア受付）
--   正式登録   -> 4（企画候補登録）
--   企画中     -> 6（企画検討）
--   MVP開発中  -> 11（MVP開発）
--   検証中     -> 13（MVP評価）
--   本番化候補 -> 15（業務受入試験）
--   本番運用   -> 17（Production Deploy）
--   却下       -> null（フェーズ外。理由は stage 側に保持）
--   保管       -> null（同上）
-- Additive migration — safe on live databases。再実行冪等。

alter table ideas add column if not exists phase_no integer;
alter table ideas add column if not exists phase_note text;

create table if not exists idea_phase_history (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas(id) on delete cascade,
  from_phase integer,
  to_phase integer not null,
  reason text,
  changed_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_idea_phase_history_idea on idea_phase_history(idea_id);
create index if not exists idx_ideas_phase_no on ideas(phase_no);

-- 既存データの後方補完: phase_no が未設定の非draft案件を stage から初期化する（冪等）。
do $$
declare
  r record;
  p integer;
begin
  for r in
    select id, stage from ideas where phase_no is null
  loop
    p := case r.stage
      when 'draft' then 1
      when 'submitted' then 4
      when 'planning' then 6
      when 'mvp' then 11
      when 'verification' then 13
      when 'production_candidate' then 15
      when 'production' then 17
      else null
    end;
    if p is not null then
      update ideas set phase_no = p, updated_at = now() where id = r.id;
      insert into idea_phase_history (idea_id, from_phase, to_phase, reason, changed_by)
      values (r.id, null, p, 'stageからの後方互換初期化', 'migration-010');
    end if;
  end loop;
end $$;
