#!/usr/bin/env bash
# Backup / restore drill (Gate B4, ADR-006).
#
# Proves the backup story end-to-end: pg_dump the source database, record a
# per-table count(*) checksum, restore the dump into a FRESH database, re-count,
# and assert every table matches. Prints a PASS/FAIL table and exits non-zero on
# any mismatch — wire it into CI (nightly) or run it by hand before a release.
#
# Safety: it never drops or overwrites the source. It restores into a separate
# "<db>_drill" database and removes it afterwards (KEEP_RESTORE=1 to keep it).
#
# The admin role used here must be able to read every tenant's rows — i.e. a
# superuser or a BYPASSRLS role — otherwise FORCE ROW LEVEL SECURITY would make
# count(*) return 0. The migration owner `fourty` is a superuser in the bundled
# Postgres and in CI, so it works out of the box.
#
# Config (env, with local defaults):
#   PGHOST PGPORT PGUSER PGPASSWORD   connection (owner/admin role)
#   SOURCE_DB                          database to back up   (default: fourty_test)
set -euo pipefail

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-fourty}"
export PGPASSWORD="${PGPASSWORD:-fourty}"
SOURCE_DB="${SOURCE_DB:-fourty_test}"
RESTORE_DB="${SOURCE_DB}_drill"

WORKDIR="$(mktemp -d)"
DUMP="${WORKDIR}/${SOURCE_DB}.dump"
trap 'rm -rf "${WORKDIR}"' EXIT

for bin in pg_dump pg_restore psql createdb dropdb; do
  command -v "$bin" >/dev/null 2>&1 || { echo "FATAL: $bin not found on PATH"; exit 2; }
done

psql_src() { psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$SOURCE_DB" -tAX "$@"; }
psql_dst() { psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$RESTORE_DB" -tAX "$@"; }

echo "== Fourty backup drill =="
echo "source=${SOURCE_DB}  restore=${RESTORE_DB}  host=${PGHOST}:${PGPORT}  user=${PGUSER}"
echo

# ── 1. Snapshot per-table counts on the source ──────────────────────────────
# Parallel indexed arrays (portable to bash 3.2 — no mapfile / associative arrays).
TABLES=()
while IFS= read -r line; do
  [ -n "$line" ] && TABLES+=("$line")
done < <(psql_src -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
if [ "${#TABLES[@]}" -eq 0 ]; then echo "FATAL: no public tables in ${SOURCE_DB}"; exit 2; fi

BEFORE=()
for t in "${TABLES[@]}"; do
  BEFORE+=("$(psql_src -c "SELECT count(*) FROM \"$t\"")")
done

# ── 2. Dump → drop/recreate restore DB → restore ────────────────────────────
echo "-> pg_dump ${SOURCE_DB} (custom format)"
pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -Fc -f "$DUMP" "$SOURCE_DB"

echo "-> recreate ${RESTORE_DB}"
dropdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" --if-exists "$RESTORE_DB"
createdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -O "$PGUSER" "$RESTORE_DB"

echo "-> pg_restore into ${RESTORE_DB}"
# --no-owner: restore objects as the connecting admin. Grants to fourty_app
# survive (the role is cluster-global). Non-fatal notices are tolerated; the
# count comparison is the real gate.
pg_restore -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" --no-owner -d "$RESTORE_DB" "$DUMP" \
  || echo "   (pg_restore reported warnings — validating by row counts)"

# ── 3. Re-count on the restore and compare ──────────────────────────────────
echo
printf '%-24s %12s %12s   %s\n' "TABLE" "SOURCE" "RESTORED" "RESULT"
printf '%-24s %12s %12s   %s\n' "------------------------" "------------" "------------" "------"

FAIL=0
i=0
for t in "${TABLES[@]}"; do
  after="$(psql_dst -c "SELECT count(*) FROM \"$t\"" 2>/dev/null || echo "ERR")"
  before="${BEFORE[$i]}"
  if [ "$before" = "$after" ]; then
    result="PASS"
  else
    result="FAIL"; FAIL=1
  fi
  printf '%-24s %12s %12s   %s\n' "$t" "$before" "$after" "$result"
  i=$((i + 1))
done

# ── 4. Cleanup + verdict ────────────────────────────────────────────────────
if [ "${KEEP_RESTORE:-0}" != "1" ]; then
  dropdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" --if-exists "$RESTORE_DB"
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "RESULT: PASS — all ${#TABLES[@]} tables restored with identical row counts."
  exit 0
else
  echo "RESULT: FAIL — at least one table's row count diverged after restore."
  exit 1
fi
