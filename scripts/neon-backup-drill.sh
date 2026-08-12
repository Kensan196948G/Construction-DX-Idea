#!/usr/bin/env bash
# Neon backup/restore drill (read-mostly; creates a temporary branch).
# Requirements: neonctl CLI, NEON_PROJECT_ID (default: twilight-cloud-06040828).
# The branch is intentionally kept after the drill for audit evidence.
set -euo pipefail

PROJECT_ID="${NEON_PROJECT_ID:-twilight-cloud-06040828}"
STAMP="$(date +%Y%m%d)"
BRANCH="backup-${STAMP}"

if ! command -v neonctl >/dev/null 2>&1; then
  echo "ERROR: neonctl is required. Install from https://neon.tech/docs/reference/neon-cli"
  exit 1
fi

echo "== [1/4] Creating backup branch: ${BRANCH} (project ${PROJECT_ID})"
neonctl branches create --name "${BRANCH}" --project-id "${PROJECT_ID}"

echo "== [2/4] Resolving temporary connection string"
CONN="$(neonctl connection-string --branch "${BRANCH}" --project-id "${PROJECT_ID}")"

echo "== [3/4] Consistency checks (ideas / audit_logs / counters)"
psql "${CONN}" -v ON_ERROR_STOP=1 <<'SQL'
select 'ideas' as tbl, count(*) from ideas
union all select 'audit_logs', count(*) from audit_logs
union all select 'notification_outbox', count(*) from notification_outbox
union all select 'ai_usage_counters', count(*) from ai_usage_counters;
select id, actor, action, created_at from audit_logs order by created_at desc limit 5;
SQL

echo "== [4/4] Evidence: branch ${BRANCH} retained. Record output in docs/10 (§6) evidence log."
echo "DRILL OK: ${BRANCH}"
