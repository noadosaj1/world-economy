#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Applies the migrations to a throwaway Postgres database and runs the SQL
# test suite against them. Verifies the schema, the RLS policies and the
# anti-cheat guarantees for real, rather than by inspection.
#
#   PGHOST / PGPORT / PGUSER point at any Postgres you can create databases on.
# ---------------------------------------------------------------------------
set -euo pipefail

DB="${DB:-world_economy_test}"
PSQL=(psql -v ON_ERROR_STOP=1 --no-psqlrc -q)

echo "==> recreating database $DB"
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" >/dev/null
"${PSQL[@]}" -d postgres -c "create database $DB" >/dev/null

echo "==> applying test shim"
"${PSQL[@]}" -d "$DB" -f supabase/tests/00_shim.sql >/dev/null

for f in supabase/migrations/*.sql; do
  echo "==> applying $(basename "$f")"
  "${PSQL[@]}" -d "$DB" -f "$f" >/dev/null
done

for f in supabase/tests/[1-9]*.sql; do
  echo "==> running $(basename "$f")"
  "${PSQL[@]}" -d "$DB" -f "$f"
done

echo "==> all database tests passed"
