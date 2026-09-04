-- 007_authority.sql
-- Authority（Business/Domain/Engineering）区分の追加。
-- 全社Idea-to-Valueプロセス（docs/New/ai-dx-dev-process.md）が定める3 Authority
-- （Business=経営企画／Domain=建設土木技術／Engineering=IT・DX）と対応付ける。
-- 既存の role（user/admin/system_admin）による認可判定は変更しない。
-- Authorityは後続のGate拡張承認フロー（Issue #50）が承認者判定に利用する追加属性。
-- Additive migration — safe on live databases. Issue #49.

alter table app_users add column if not exists authority text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'app_users_authority_check'
  ) then
    alter table app_users
      add constraint app_users_authority_check
      check (authority is null or authority in ('business', 'domain', 'engineering'));
  end if;
end $$;

create index if not exists idx_app_users_authority on app_users(authority);
