-- 021_saved_filters.sql
-- Saved Filter / My View（docs/29 §2.23残P2）。
-- 各ユーザーが自分専用（My View）の検索条件（ステージ・キーワード等）を
-- 名前を付けて保存し、一覧画面から呼び出せるようにする。
create table if not exists saved_filters (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  list_type text not null check (list_type in ('issue', 'idea')),
  name text not null,
  params jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_saved_filters_owner on saved_filters(owner_email, list_type, created_at desc);

drop trigger if exists saved_filters_set_updated_at on saved_filters;
create trigger saved_filters_set_updated_at
before update on saved_filters
for each row
execute function set_updated_at();
