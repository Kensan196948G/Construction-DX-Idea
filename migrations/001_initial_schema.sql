create extension if not exists "pgcrypto";

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

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

drop trigger if exists ideas_set_updated_at on ideas;
create trigger ideas_set_updated_at
before update on ideas
for each row
execute function set_updated_at();

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
  daily_limit integer not null default 10 check (daily_limit >= 0),
  monthly_budget numeric(12, 2) not null default 0 check (monthly_budget >= 0),
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
  daily_ai_limit integer not null default 10 check (daily_ai_limit >= 0),
  monthly_budget numeric(12, 2) not null default 0 check (monthly_budget >= 0),
  enabled boolean not null default true,
  updated_by text,
  updated_at timestamptz not null default now(),
  unique (subject_type, subject_id)
);

create table if not exists ai_usage_counters (
  subject_type text not null check (subject_type in ('user', 'global')),
  subject_id text not null,
  usage_date date not null default current_date,
  used_count integer not null default 0 check (used_count >= 0),
  limit_count integer not null check (limit_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (subject_type, subject_id, usage_date)
);

create table if not exists ai_monthly_usage_counters (
  subject_type text not null check (subject_type in ('user', 'global')),
  subject_id text not null,
  usage_month date not null,
  used_cost_estimate numeric(12, 6) not null default 0 check (used_cost_estimate >= 0),
  budget numeric(12, 2) not null check (budget >= 0),
  updated_at timestamptz not null default now(),
  primary key (subject_type, subject_id, usage_month)
);

create table if not exists notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  resource_type text not null,
  resource_id uuid,
  idempotency_key text not null unique,
  payload jsonb not null default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ideas_stage on ideas(stage);
create index if not exists idx_ideas_created_by on ideas(created_by);
create index if not exists idx_ideas_updated_at on ideas(updated_at desc);
create index if not exists idx_ai_sessions_idea on idea_ai_sessions(idea_id);
create index if not exists idx_ai_sessions_user_created on idea_ai_sessions(executed_by, created_at desc);
create index if not exists idx_ai_sessions_created on idea_ai_sessions(created_at desc);
create index if not exists idx_ai_monthly_usage_subject_month on ai_monthly_usage_counters(subject_type, subject_id, usage_month);
create index if not exists idx_decisions_idea on idea_decisions(idea_id);
create index if not exists idx_stage_histories_idea on idea_stage_histories(idea_id);
create index if not exists idx_comments_idea on idea_comments(idea_id);
create index if not exists idx_audit_actor_created on audit_logs(actor, created_at desc);
create index if not exists idx_audit_resource on audit_logs(resource_type, resource_id);
create index if not exists idx_stage_histories_idea_changed on idea_stage_histories(idea_id, changed_at desc);
create index if not exists idx_notification_outbox_status_next on notification_outbox(status, next_attempt_at);
