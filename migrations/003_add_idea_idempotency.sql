-- Issue: idea registration idempotency (duplicate submission protection).
-- Additive migration — nullable column, no default, safe on live rows.
alter table ideas
  add column if not exists idempotency_key text;

create unique index if not exists idx_ideas_idempotency_key
  on ideas(idempotency_key)
  where idempotency_key is not null;
