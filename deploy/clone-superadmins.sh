#!/usr/bin/env bash
# ─── Clone PROD → STAGING: full public SCHEMA + super_admins DATA only ───────
#
# File-based + two-phase so PROD and STAGING never need to run at the same time
# (required on a small/1 GB box where we pause prod to start staging):
#
#   bash deploy/clone-superadmins.sh dump   # while PROD is up (reads prod, writes files)
#   ... stop prod, start staging ...
#   bash deploy/clone-superadmins.sh load   # while STAGING is up (loads files)
#
# Copies the production PUBLIC schema STRUCTURE (all tables, empty) + the DATA of
# ONLY public.super_admins. No tenant schemas / no other data. Prod is read-only.
# Dumps are written to deploy/staging-clone/.
# ───────────────────────────────────────────────────────────────────────────
set -euo pipefail

CMD="${1:-}"
OUT_DIR="${CLONE_DIR:-deploy/staging-clone}"
PROD_CONTAINER="${PROD_PG_CONTAINER:-wa-postgres}"
STG_CONTAINER="${STG_PG_CONTAINER:-wa-staging-postgres}"
PROD_ENV="${PROD_ENV_FILE:-deploy/.env}"
STG_ENV="${STG_ENV_FILE:-deploy/.env.staging}"

getenv() { grep -E "^$1=" "$2" | tail -1 | cut -d= -f2- | sed 's/^"//; s/"$//'; }

dump() {
  local user pw db
  user="$(getenv DB_USERNAME "$PROD_ENV")"; user="${user:-postgres}"
  pw="$(getenv DB_PASSWORD "$PROD_ENV")"
  db="$(getenv DB_NAME "$PROD_ENV")"; db="${db:-whatsapp_commerce}"
  mkdir -p "$OUT_DIR"
  echo "[dump] PROD container=$PROD_CONTAINER db=$db → $OUT_DIR"

  echo "  • public schema (structure only)…"
  docker exec -e PGPASSWORD="$pw" "$PROD_CONTAINER" \
    pg_dump -U "$user" -d "$db" --schema=public --schema-only --no-owner --no-privileges \
    > "$OUT_DIR/public-schema.sql"

  echo "  • public.super_admins (data only)…"
  docker exec -e PGPASSWORD="$pw" "$PROD_CONTAINER" \
    pg_dump -U "$user" -d "$db" --table=public.super_admins --data-only --no-owner \
    > "$OUT_DIR/superadmins-data.sql"

  echo "✅ dump complete. Files in $OUT_DIR. Safe to stop prod and start staging now."
}

load() {
  local user pw db existing
  user="$(getenv DB_USERNAME "$STG_ENV")"; user="${user:-postgres}"
  pw="$(getenv DB_PASSWORD "$STG_ENV")"
  db="$(getenv DB_NAME "$STG_ENV")"; db="${db:-whatsapp_commerce_staging}"

  [ -f "$OUT_DIR/public-schema.sql" ] || { echo "ERROR: run 'dump' first ($OUT_DIR/public-schema.sql missing)"; exit 1; }

  existing="$(docker exec -e PGPASSWORD="$pw" "$STG_CONTAINER" \
    psql -tAU "$user" -d "$db" \
    -c "SELECT to_regclass('public.super_admins') IS NOT NULL AND (SELECT count(*) FROM public.super_admins) > 0;" 2>/dev/null || echo "f")"
  if [ "$(echo "$existing" | tr -d '[:space:]')" = "t" ]; then
    echo "ERROR: staging already has super_admins. Aborting (run 'down -v' for a clean re-clone)."; exit 1
  fi

  echo "[load] STAGING container=$STG_CONTAINER db=$db"
  echo "  • public schema…"
  docker exec -i -e PGPASSWORD="$pw" "$STG_CONTAINER" \
    psql -v ON_ERROR_STOP=1 -U "$user" -d "$db" < "$OUT_DIR/public-schema.sql"
  echo "  • super_admins data…"
  docker exec -i -e PGPASSWORD="$pw" "$STG_CONTAINER" \
    psql -v ON_ERROR_STOP=1 -U "$user" -d "$db" < "$OUT_DIR/superadmins-data.sql"

  local count
  count="$(docker exec -e PGPASSWORD="$pw" "$STG_CONTAINER" \
    psql -tAU "$user" -d "$db" -c "SELECT count(*) FROM public.super_admins;")"
  echo "✅ load complete. super_admins rows: $(echo "$count" | tr -d '[:space:]'). No tenant data copied."
}

case "$CMD" in
  dump) dump ;;
  load) load ;;
  *) echo "Usage: bash deploy/clone-superadmins.sh {dump|load}"; exit 1 ;;
esac
