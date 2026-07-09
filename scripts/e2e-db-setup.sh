#!/usr/bin/env bash
# Provision the dedicated Playwright E2E database + app role (idempotent).
#
# Mirrors the vitest test-DB convention: the owner/superuser role `fourty`
# migrates and truncates; the RLS-subject app role `fourty_app` is what the
# running app (`next start`) connects as, so E2E exercises the real RLS path.
#
# Table-level grants + RLS policies are applied by the drizzle migrations
# (GRANT ... TO fourty_app in drizzle/0002_rls.sql), which the Playwright
# globalSetup runs. This script only ensures the database and login role exist.
#
# Run once locally: `npm run db:e2e:setup`. CI reuses the same script.
#
# Config (env, with local defaults):
#   PGHOST PGPORT PGUSER PGPASSWORD   admin connection (owner role `fourty`)
#   E2E_DB                            database name        (default: fourty_e2e)
#   APP_ROLE APP_PASSWORD             RLS-subject app role (default: fourty_app)
set -euo pipefail

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-fourty}"
PGPASSWORD="${PGPASSWORD:-fourty}"
export PGPASSWORD
E2E_DB="${E2E_DB:-fourty_e2e}"
APP_ROLE="${APP_ROLE:-fourty_app}"
APP_PASSWORD="${APP_PASSWORD:-fourty_app}"

# Guard: this script is only ever meant for an *_e2e database.
case "$E2E_DB" in
  *e2e*) ;;
  *) echo "Refusing: E2E_DB='$E2E_DB' does not look like an e2e database." >&2; exit 1 ;;
esac

psql_admin() { psql -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$@"; }

# App login role — idempotent (CREATE ROLE is not IF-NOT-EXISTS-aware).
psql_admin -d postgres -c "DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
    CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PASSWORD}';
  END IF;
END
\$\$;"

# Database — CREATE DATABASE cannot run inside a transaction/DO block, so guard
# it with a plain existence check (no-op when the CI service already created it).
if ! psql_admin -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${E2E_DB}'" | grep -q 1; then
  psql_admin -d postgres -c "CREATE DATABASE ${E2E_DB} OWNER ${PGUSER};"
fi

echo "E2E database '${E2E_DB}' and app role '${APP_ROLE}' are ready."
