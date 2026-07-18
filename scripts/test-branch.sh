#!/usr/bin/env bash
# scripts/test-branch.sh — isolated Docker Compose stack for the current feature branch.
#
# Usage:
#   scripts/test-branch.sh up      # build + start the branch stack, clone data from main if running
#   scripts/test-branch.sh down    # tear down the branch stack and its volumes
#
# Why an override file: db/api/nginx/adminer in docker-compose.yml use fixed `container_name`
# values, so `docker compose -p <project>` alone is NOT enough to run alongside the main stack —
# container names collide regardless of project namespace. This script generates a
# docker-compose.branch.yml override with distinct container names + ports per branch.
#
# Data: if the main stack's db container (pdash-db) is running, this clones it via
# pg_dump/pg_restore so you test against realistic data. If main is not running, it falls back
# to a fresh database with all migrations applied and a bootstrapped test admin user.

set -euo pipefail

# Reads .env from the current working directory (same directory `docker compose` itself
# auto-loads .env from — this script already assumes it runs from the repo root). Never
# uses `source`/`eval` on the file: real .env values in this repo contain shell-special
# characters (e.g. `$$` in POSTGRES_PASSWORD) that naive sourcing would silently corrupt.
# A variable already exported in the calling shell always wins over .env.
load_env() {
  local env_file=".env"
  [ -f "$env_file" ] || return 0
  while IFS='=' read -r key val; do
    [[ -z "$key" || "$key" == \#* ]] && continue
    val="${val%\"}"; val="${val#\"}"
    val="${val%\'}"; val="${val#\'}"
    if [ -z "${!key+x}" ]; then
      export "$key=$val"
    fi
  done < "$env_file"
}

load_env

BRANCH=$(git branch --show-current)
if [ -z "$BRANCH" ] || [ "$BRANCH" = "main" ]; then
  echo "Refusing to run on main — checkout a feature branch first." >&2
  exit 1
fi

SANITIZED=$(echo "$BRANCH" | tr '/ ' '__')
PROJECT="pdash_branch_${SANITIZED}"
OVERRIDE_FILE="docker-compose.branch.yml"
COMPOSE="docker compose -p $PROJECT -f docker-compose.yml -f $OVERRIDE_FILE"

MAIN_DB_CONTAINER="pdash-db"
DB_CONTAINER="pdash-db-${SANITIZED}"
API_CONTAINER="pdash-api-${SANITIZED}"
DB_USER="${POSTGRES_USER:-pdash}"
DB_NAME="${POSTGRES_DB:-pdash}"

FRONTEND_PORT=8081
API_PORT=3001
DB_PORT=5433
ADMINER_PORT=8082

write_override() {
  cat > "$OVERRIDE_FILE" <<EOF
services:
  db:
    container_name: ${DB_CONTAINER}
    ports: ["${DB_PORT}:5432"]
  api:
    container_name: ${API_CONTAINER}
    ports: ["${API_PORT}:3000"]
  nginx:
    container_name: pdash-nginx-${SANITIZED}
    ports: ["${FRONTEND_PORT}:80"]
  adminer:
    container_name: pdash-adminer-${SANITIZED}
    ports: ["${ADMINER_PORT}:8080"]
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

open_browser() {
  local url=$1
  case "$(uname -s)" in
    Darwin) open "$url" ;;
    Linux) xdg-open "$url" >/dev/null 2>&1 || true ;;
    MINGW*|MSYS*|CYGWIN*) start "$url" ;;
    *) echo "Open manually: $url" ;;
  esac
}

up() {
  write_override
  echo "Starting isolated stack for branch '${BRANCH}' (project: ${PROJECT})..."

  $COMPOSE up -d --build db
  wait_healthy "$DB_CONTAINER"

  if docker ps --format '{{.Names}}' | grep -qx "$MAIN_DB_CONTAINER"; then
    echo "main stack detected — cloning data from ${MAIN_DB_CONTAINER}..."
    docker exec "$MAIN_DB_CONTAINER" pg_dump -U "$DB_USER" -Fc "$DB_NAME" > /tmp/pdash_branch_snapshot.dump
    docker exec -i "$DB_CONTAINER" pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists < /tmp/pdash_branch_snapshot.dump
    echo "Data cloned from main."
    $COMPOSE up -d --build api nginx adminer
    wait_healthy "$API_CONTAINER"
  else
    echo "main stack not running — applying migrations to a fresh database..."
    for f in api/src/db/migrations/*.sql; do
      echo "  applying $(basename "$f")"
      docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$f"
    done
    $COMPOSE up -d --build api nginx adminer
    wait_healthy "$API_CONTAINER"
    echo "Bootstrapping test admin user (test-branch@pdash.local / TestBranch123!)..."
    docker exec "$API_CONTAINER" node /app/src/create-admin.js test-branch@pdash.local TestBranch123! Test Branch
    echo "NOTE: fresh database — no pre-existing data, only the bootstrapped admin above."
  fi

  echo ""
  echo "Stack up. Opening http://localhost:${FRONTEND_PORT} ..."
  open_browser "http://localhost:${FRONTEND_PORT}"
  echo "Adminer (DB browser): http://localhost:${ADMINER_PORT}"
  echo "Tear down when done with: scripts/test-branch.sh down"
}

down() {
  echo "Tearing down stack for branch '${BRANCH}' (project: ${PROJECT})..."
  $COMPOSE down -v
  rm -f "$OVERRIDE_FILE"
  echo "Done."
}

case "${1:-up}" in
  up) up ;;
  down) down ;;
  *) echo "Usage: $0 [up|down]" >&2; exit 1 ;;
esac
