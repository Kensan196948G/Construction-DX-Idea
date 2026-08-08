-- Issue #14: Persist submitter context fields collected on the intake form.
-- Additive migration — existing rows get empty-string defaults, so this is
-- backward compatible and safe to run on a live production database.
alter table ideas
  add column if not exists department text not null default '',
  add column if not exists submitter_name text not null default '',
  add column if not exists submitter_email text not null default '',
  add column if not exists coordination_needed text not null default '';
