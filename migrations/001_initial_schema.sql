create extension if not exists "pgcrypto";

create table if not exists ideas (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  current_issue text not null,
  target_business text not null default '',
  target_users text not null default '',
  current_workflow text not null default '',
  improvement_idea text not null default '',
  expected_effects text not null default '',
  required_data jsonb not null default '[]',
  related_systems jsonb not null default '[]',
  implementation_options jsonb not null default '[]',
  security_notes jsonb not null default '[]',
  open_questions jsonb not null default '[]',
  mvp_candidate text not null default '',
  mvp_done_definition text not null default '',
  stage text not null default 'draft'
    check (stage in (
      'draft', 'submitted', 'planning', 'mvp', 'verification',
      'production_candidate', 'production', 'rejected', 'archived'
    )),
  created_by text not null,
  owner_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists idea_ai_sessions (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid references ideas(id) on delete set null,
  executed_by text not null,
  process_type text not null,
  model text not null,
  input_chars integer not null default 0,
  output_chars integer not null default 0,
  result text not null,
  usage_cost_estimate numeric(12, 4),
  prompt_version text not null,
  input_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists idea_decisions (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas(id) on delete cascade,
  decision text not null,
  reason text not null default '',
  decided_by text not null,
  ai_difference text not null default '',
  decided_at timestamptz not null default now()
);

create table if not exists idea_stage_histories (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  changed_by text not null,
  reason text not null default '',
  changed_at timestamptz not null default now()
);

create table if not exists idea_comments (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas(id) on delete cascade,
  author text not null,
  body text not null,
  slack_url text,
  created_at timestamptz not null default now()
);

create table if not exists ai_settings (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'claude',
  model text not null,
  secret_name text not null,
  key_last4 text,
  status text not null default 'not_configured',
  enabled boolean not null default false,
  daily_limit integer not null default 10,
  monthly_budget numeric(12, 2) not null default 0,
  last_checked_at timestamptz,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  resource_type text not null,
  resource_id text,
  result text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists usage_limits (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('user', 'global')),
  subject_id text not null,
  daily_ai_limit integer not null default 10,
  monthly_budget numeric(12, 2) not null default 0,
  enabled boolean not null default true,
  updated_by text,
  updated_at timestamptz not null default now(),
  unique (subject_type, subject_id)
);

create index if not exists idx_ideas_stage on ideas(stage);
create index if not exists idx_ideas_created_by on ideas(created_by);
create index if not exists idx_ideas_updated_at on ideas(updated_at desc);
create index if not exists idx_ai_sessions_user_created on idea_ai_sessions(executed_by, created_at desc);
create index if not exists idx_audit_actor_created on audit_logs(actor, created_at desc);
create index if not exists idx_audit_resource on audit_logs(resource_type, resource_id);
create index if not exists idx_stage_histories_idea_changed on idea_stage_histories(idea_id, changed_at desc);
