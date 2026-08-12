-- App-level user directory for login management (Cloudflare Access remains
-- the authentication entry point; this table stores roles and display data).
-- Additive migration — safe on live databases.

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null default '',
  department text not null default '',
  role text not null default 'user'
    check (role in ('user', 'admin', 'system_admin')),
  status text not null default 'active'
    check (status in ('active', 'suspended')),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_app_users_role on app_users(role);
create index if not exists idx_app_users_status on app_users(status);
