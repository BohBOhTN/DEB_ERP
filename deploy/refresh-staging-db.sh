#!/usr/bin/env bash
# Copies production into staging (issue 017). Run by hand on the VPS, never
# by the pipeline:
#
#   1. dumps the production database to a dated file, which is also a
#      backup of production worth keeping;
#   2. recreates the staging database and restores the dump into it, owned
#      by the staging role;
#   3. optionally copies the product photos (COPY_MEDIA=1).
#
# Production is only read. The one thing replaced is the staging database,
# and the script refuses any target whose name does not contain "staging".
#
#   sudo -E ./refresh-staging-db.sh              # asks before replacing
#   ASSUME_YES=1 COPY_MEDIA=1 ./refresh-staging-db.sh
set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-postgres-prod}"
PG_SUPERUSER="${PG_SUPERUSER:-postgres}"
PROD_DB="${PROD_DB:-dar_el_baraka}"
STAGING_DB="${STAGING_DB:-dar_el_baraka_staging}"
STAGING_ROLE="${STAGING_ROLE:-dar_el_baraka_staging_user}"
STAGING_DIR="${STAGING_DIR:-/opt/dar-el-barka-staging}"
BACKUP_DIR="${BACKUP_DIR:-/opt/dar-el-barka-backups}"
PROD_MEDIA_VOLUME="${PROD_MEDIA_VOLUME:-dar-el-barka_deb-media}"
STAGING_MEDIA_VOLUME="${STAGING_MEDIA_VOLUME:-dar-el-barka-staging_deb-media}"

case "$STAGING_DB" in
  *staging*) ;;
  *)
    echo "Refusing: the target database must have \"staging\" in its name (got ${STAGING_DB})." >&2
    exit 1
    ;;
esac

if [ "$STAGING_DB" = "$PROD_DB" ]; then
  echo "Refusing: the staging and production databases are the same." >&2
  exit 1
fi

psql_admin() {
  docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$PG_SUPERUSER" "$@"
}

if ! psql_admin -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname = '${STAGING_ROLE}'" | grep -q 1; then
  echo "The role ${STAGING_ROLE} does not exist. Create it once (see deploy/README.md), then run this again." >&2
  exit 1
fi

if [ "${ASSUME_YES:-0}" != "1" ]; then
  printf 'This replaces the database %s with a copy of %s. Type "staging" to go on: ' "$STAGING_DB" "$PROD_DB"
  read -r answer
  if [ "$answer" != "staging" ]; then
    echo "Nothing was changed."
    exit 1
  fi
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
dump="${BACKUP_DIR}/${PROD_DB}-$(date +%Y%m%d-%H%M%S).dump"

echo "Dumping ${PROD_DB} to ${dump}"
# Without owners and grants: the copy belongs to the staging role alone.
docker exec "$PG_CONTAINER" pg_dump -U "$PG_SUPERUSER" -Fc --no-owner --no-acl "$PROD_DB" > "$dump"
chmod 600 "$dump"

if [ ! -s "$dump" ]; then
  echo "The dump is empty; staging was not touched." >&2
  exit 1
fi

# The staging API holds connections to the database it is about to lose.
staging_was_up=0
if [ -f "${STAGING_DIR}/docker-compose.yml" ] && [ -f "${STAGING_DIR}/.env" ]; then
  if (cd "$STAGING_DIR" && docker compose ps --status running --quiet backend | grep -q .); then
    staging_was_up=1
    (cd "$STAGING_DIR" && docker compose stop backend)
  fi
fi

echo "Recreating ${STAGING_DB}"
psql_admin -d postgres -c "DROP DATABASE IF EXISTS \"${STAGING_DB}\" WITH (FORCE)"
psql_admin -d postgres -c "CREATE DATABASE \"${STAGING_DB}\" OWNER \"${STAGING_ROLE}\""

echo "Restoring the dump into ${STAGING_DB}"
docker exec -i "$PG_CONTAINER" pg_restore -U "$PG_SUPERUSER" \
  --no-owner --no-acl --role="$STAGING_ROLE" --exit-on-error \
  -d "$STAGING_DB" < "$dump"

# Sessions opened on production mean nothing on staging.
psql_admin -d "$STAGING_DB" -c 'DELETE FROM "auth_sessions"' > /dev/null

if [ "${COPY_MEDIA:-0}" = "1" ]; then
  echo "Copying the product photos from ${PROD_MEDIA_VOLUME} to ${STAGING_MEDIA_VOLUME}"
  docker volume create "$STAGING_MEDIA_VOLUME" > /dev/null
  docker run --rm \
    -v "${PROD_MEDIA_VOLUME}:/from:ro" \
    -v "${STAGING_MEDIA_VOLUME}:/to" \
    alpine:3.20 sh -c 'cp -a /from/. /to/'
fi

if [ "$staging_was_up" = "1" ]; then
  # The copy may be behind the staging build: apply what it is missing.
  (cd "$STAGING_DIR" && docker compose run --rm migrate && docker compose up -d backend)
fi

echo "Staging now holds a copy of ${PROD_DB}. Backup kept: ${dump}"
