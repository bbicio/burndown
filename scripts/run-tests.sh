#!/usr/bin/env bash
set -euo pipefail

if [ ! -f docker-compose.yml ] || [ ! -d api/src/db/migrations ]; then
  echo "scripts/run-tests.sh must be run from the repository root (docker-compose.yml and api/src/db/migrations/ not found here)." >&2
  exit 1
fi

LOCK_DIR=".run-tests.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "Another run-tests.sh is already in progress (lock: $LOCK_DIR). Wait for it to finish." >&2
  exit 1
fi

# Same load_env() as scripts/test-branch.sh, verbatim -- reads .env into this shell's own
# environment (docker compose auto-loads .env for container-internal variables, but the psql
# call below runs in this script's own shell, outside any container, and needs POSTGRES_USER/
# POSTGRES_DB directly).
load_env() {
  local env_file=".env"
  [ -f "$env_file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    [[ "$line" != *=* ]] && continue
    key="${line%%=*}"; val="${line#*=}"
    key="${key#"${key%%[![:space:]]*}"}"; key="${key%"${key##*[![:space:]]}"}"
    [[ -z "$key" || "$key" == \#* ]] && continue
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    val="${val#"${val%%[![:space:]]*}"}"; val="${val%"${val##*[![:space:]]}"}"
    val="${val%\"}"; val="${val#\"}"
    val="${val%\'}"; val="${val#\'}"
    if [ -z "${!key+x}" ]; then
      export "$key=$val"
    fi
  done < "$env_file"
}

load_env

PROJECT="pdash_test"
OVERRIDE_FILE="docker-compose.test.yml"
COMPOSE="docker compose -p $PROJECT -f docker-compose.yml -f $OVERRIDE_FILE"

DB_CONTAINER="pdash-db-test"
API_CONTAINER="pdash-api-test"

write_override() {
  cat > "$OVERRIDE_FILE" <<EOF
services:
  db:
    container_name: ${DB_CONTAINER}
    ports: !override []
  api:
    container_name: ${API_CONTAINER}
    ports: !override []
EOF
}

wait_healthy() {
  local container=$1
  local retries=30
  until [ "$(docker inspect -f '{{.State.Health.Status}}' "$container" 2>/dev/null)" = "healthy" ]; do
    retries=$((retries - 1))
    if [ "$retries" -le 0 ]; then
      echo "Timed out waiting for $container to become healthy." >&2
      exit 1
    fi
    sleep 2
  done
}

compose_down() {
  $COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true
}

cleanup() {
  compose_down
  rm -f "$OVERRIDE_FILE"
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup EXIT

write_override

echo "Cleaning up any leftover state from a prior run..."
compose_down

echo "Starting isolated test stack (project: ${PROJECT})..."

$COMPOSE up -d db
wait_healthy "$DB_CONTAINER"

echo "Applying migrations to the fresh test database..."
for f in api/src/db/migrations/*.sql; do
  echo "  applying $(basename "$f")"
  docker exec -i "$DB_CONTAINER" psql -U "${POSTGRES_USER:-pdash}" -d "${POSTGRES_DB:-pdash}" < "$f"
done

IMAGE_HASH_FILE=".run-tests-image-hash"
CURRENT_HASH=$(cat api/Dockerfile api/package.json | sha256sum | cut -d' ' -f1)

API_BUILD_FLAG="--build"
if [ -f "$IMAGE_HASH_FILE" ] && [ "$(cat "$IMAGE_HASH_FILE")" = "$CURRENT_HASH" ]; then
  API_BUILD_FLAG=""
fi

$COMPOSE up -d $API_BUILD_FLAG api
wait_healthy "$API_CONTAINER"
echo "$CURRENT_HASH" > "$IMAGE_HASH_FILE"

set +e
$COMPOSE --profile test run --rm test
exit_code=$?
set -e

exit $exit_code
