#!/usr/bin/env bash
# Runs on the VPS over SSH from the GitHub Actions deploy job. Expects, in the
# environment: IMAGE_TAG, REGISTRY_OWNER, PUBLIC_PORT, GHCR_USER, GHCR_TOKEN
# and BACKEND_ENV (the whole backend .env). The compose file has already been
# copied next to this script.
set -euo pipefail

STACK_DIR="${STACK_DIR:-/opt/dar-el-barka}"
cd "$STACK_DIR"

: "${IMAGE_TAG:?IMAGE_TAG is required}"
: "${REGISTRY_OWNER:?REGISTRY_OWNER is required}"
: "${BACKEND_ENV:?BACKEND_ENV is required}"
: "${GHCR_USER:?GHCR_USER is required}"
: "${GHCR_TOKEN:?GHCR_TOKEN is required}"

# Configuration files are written from the environment, never expanded
# inside this script, and readable by the deploy user only.
umask 077
printf '%s\n' "$BACKEND_ENV" > backend.env
printf 'REGISTRY_OWNER=%s\nIMAGE_TAG=%s\nPUBLIC_PORT=%s\nPUBLIC_BIND=%s\n' \
  "$REGISTRY_OWNER" "$IMAGE_TAG" "${PUBLIC_PORT:-8081}" "${PUBLIC_BIND:-127.0.0.1}" > .env
umask 022

if ! docker network inspect pg-network > /dev/null 2>&1; then
  echo "The Docker network pg-network does not exist; the database must be attached to it first." >&2
  exit 1
fi

echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin

# The image serving now, kept for the rollback branch below.
PREVIOUS_TAG="$(docker inspect --format '{{.Config.Image}}' deb-backend 2>/dev/null | sed 's/.*://' || true)"
echo "Deploying ${IMAGE_TAG} (previous: ${PREVIOUS_TAG:-none})"

docker compose pull --quiet
# Additive migrations first, from a one-off container of the new image.
docker compose run --rm migrate
docker compose up -d --remove-orphans

echo "Waiting for the API to become ready..."
attempt=0
until [ "$(docker inspect --format '{{.State.Health.Status}}' deb-backend 2>/dev/null)" = "healthy" ]; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 24 ]; then
    echo "The API never became ready. Last log lines:" >&2
    docker logs deb-backend --tail 100 >&2 || true
    if [ -n "$PREVIOUS_TAG" ] && [ "$PREVIOUS_TAG" != "$IMAGE_TAG" ]; then
      echo "Restoring ${PREVIOUS_TAG}" >&2
      sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${PREVIOUS_TAG}/" .env
      docker compose up -d --remove-orphans || true
    fi
    exit 1
  fi
  sleep 5
done

docker image prune -f > /dev/null
docker compose ps
echo "Deployed ${IMAGE_TAG}"
