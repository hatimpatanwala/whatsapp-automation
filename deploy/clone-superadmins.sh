#!/usr/bin/env bash
# ─── Clone PROD → STAGING: full public SCHEMA + super_admins DATA only ───────
#
# Copies the production PUBLIC schema STRUCTURE (all tables, empty) into the
# fresh staging DB, plus the DATA of ONLY public.super_admins. No tenant schemas
# and no other tenant/business data are copied.
#
# It NEVER writes to the production database — prod is read-only here (pg_dump).
#
# Run ON THE SERVER, AFTER staging postgres is up but BEFORE the staging backend
# starts (so the app doesn't pre-create public tables):
#
#   docker compose -p wa-staging -f deploy/docker-compose.staging.yml \
#     --env-file deploy/.env.staging up -d postgres
#   bash deploy/clone-superadmins.sh
#   docker compose -p wa-staging -f deploy/docker-compose.staging.yml \
#     --env-file deploy/.env.staging up -d --build
# ───────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROD_CONTAINER="${PROD_PG_CONTAINER:-wa-postgres}"
STG_CONTAINER="${STG_PG_CONTAINER:-wa-staging-postgres}"
PROD_ENV="${PROD_ENV_FILE:-deploy/.env}"
STG_ENV="${STG_ENV_FILE:-deploy/.env.staging}"

getenv() { grep -E "^$1=" "$2" | tail -1 | cut -d= -f2- | sed 's/^"//; s/"$//'; }

PROD_USER="$(getenv DB_USERNAME "$PROD_ENV")"; PROD_USER="${PROD_USER:-postgres}"
PROD_PW="$(getenv DB_PASSWORD "$PROD_ENV")"
PROD_DB="$(getenv DB_NAME "$PROD_ENV")"; PROD_DB="${PROD_DB:-whatsapp_commerce}"

STG_USER="$(getenv DB_USERNAME "$STG_ENV")"; STG_USER="${STG_USER:-postgres}"
STG_PW="$(getenv DB_PASSWORD "$STG_ENV")"
STG_DB="$(getenv DB_NAME "$STG_ENV")"; STG_DB="${STG_DB:-whatsapp_commerce_staging}"

echo "PROD: container=$PROD_CONTAINER db=$PROD_DB   STAGING: container=$STG_CONTAINER db=$STG_DB"

# Safety: refuse if staging already has super admins (avoid clobbering a used env).
EXISTING="$(docker exec -e PGPASSWORD="$STG_PW" "$STG_CONTAINER" \
  psql -tAU "$STG_USER" -d "$STG_DB" \
  -c "SELECT to_regclass('public.super_admins') IS NOT NULL AND (SELECT count(*) FROM public.super_admins) > 0;" 2>/dev/null || echo "f")"
if [ "$(echo "$EXISTING" | tr -d '[:space:]')" = "t" ]; then
  echo "ERROR: staging already has super_admins data. Aborting to avoid overwrite."
  echo "       Drop/recreate the staging DB volume first if you want a clean clone."
  exit 1
fi

TMP_SCHEMA="$(mktemp)"; TMP_DATA="$(mktemp)"
trap 'rm -f "$TMP_SCHEMA" "$TMP_DATA"' EXIT

echo "[1/3] Dumping PROD public schema (structure only, no data)…"
docker exec -e PGPASSWORD="$PROD_PW" "$PROD_CONTAINER" \
  pg_dump -U "$PROD_USER" -d "$PROD_DB" \
  --schema=public --schema-only --no-owner --no-privileges > "$TMP_SCHEMA"

echo "[2/3] Dumping PROD public.super_admins (data only)…"
docker exec -e PGPASSWORD="$PROD_PW" "$PROD_CONTAINER" \
  pg_dump -U "$PROD_USER" -d "$PROD_DB" \
  --table=public.super_admins --data-only --no-owner > "$TMP_DATA"

echo "[3/3] Loading schema + super_admins into STAGING…"
docker exec -i -e PGPASSWORD="$STG_PW" "$STG_CONTAINER" \
  psql -v ON_ERROR_STOP=1 -U "$STG_USER" -d "$STG_DB" < "$TMP_SCHEMA"
docker exec -i -e PGPASSWORD="$STG_PW" "$STG_CONTAINER" \
  psql -v ON_ERROR_STOP=1 -U "$STG_USER" -d "$STG_DB" < "$TMP_DATA"

COUNT="$(docker exec -e PGPASSWORD="$STG_PW" "$STG_CONTAINER" \
  psql -tAU "$STG_USER" -d "$STG_DB" -c "SELECT count(*) FROM public.super_admins;")"
echo "✅ Done. Staging public schema cloned; super_admins rows imported: $(echo "$COUNT" | tr -d '[:space:]')"
echo "   Tenant schemas and all other data were NOT copied."
