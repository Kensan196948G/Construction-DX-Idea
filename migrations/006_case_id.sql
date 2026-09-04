-- 006_case_id.sql
-- 案件ID（DX-YYYY-NNNN）採番機能。
-- 全社Idea-to-Valueプロセス（docs/New/ai-dx-dev-process.md）が定める
-- 案件ID体系との対応付けのため、正式登録（下書きを除く）されたアイデアに
-- 年別連番の案件IDを付与する。Issue #48。

create table if not exists case_id_sequences (
  year integer primary key,
  next_seq integer not null default 1
);

alter table ideas add column if not exists case_id text;

-- 既存データの後方補完: 案件IDが未採番の非下書きアイデアへ、登録日時順に
-- 年別連番を割り当てる。case_id が既に設定されている行は対象外のため、
-- このブロックは再実行しても安全（冪等）。
do $$
declare
  r record;
  seq integer;
begin
  for r in
    select id, extract(year from created_at)::int as yr
    from ideas
    where case_id is null
      and stage <> 'draft'
    order by created_at asc
  loop
    insert into case_id_sequences (year, next_seq)
      values (r.yr, 2)
      on conflict (year) do update set next_seq = case_id_sequences.next_seq + 1
      returning next_seq - 1 into seq;
    update ideas set case_id = 'DX-' || r.yr || '-' || lpad(seq::text, 4, '0') where id = r.id;
  end loop;
end $$;

create unique index if not exists idx_ideas_case_id on ideas (case_id) where case_id is not null;
