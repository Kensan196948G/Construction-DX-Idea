-- Approval workflow fields + audit-log hash chain (tamper resistance).
-- Additive migration — existing rows keep safe defaults.

alter table ideas
  add column if not exists approval_status text not null default 'none',
  add column if not exists approver_email text not null default '',
  add column if not exists approval_requested_at timestamptz,
  add column if not exists approval_acted_at timestamptz,
  add column if not exists approval_reason text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ideas_approval_status_check'
  ) then
    alter table ideas
      add constraint ideas_approval_status_check
      check (approval_status in ('none', 'requested', 'approved', 'rejected', 'returned'));
  end if;
end $$;

alter table audit_logs
  add column if not exists prev_hash text,
  add column if not exists entry_hash text;

create index if not exists idx_audit_logs_created_id
  on audit_logs(created_at, id);
