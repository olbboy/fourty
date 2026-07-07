#!/bin/bash
# Runs once on first Postgres init (mounted into /docker-entrypoint-initdb.d).
# Creates the non-owner application role. It is subject to RLS (ADR-001);
# table grants are applied by migration 0002 (run as the owner `fourty`).
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fourty_app') THEN
      CREATE ROLE fourty_app LOGIN PASSWORD '${FOURTY_APP_PASSWORD:-fourty_app}';
    END IF;
  END
  \$\$;
EOSQL
