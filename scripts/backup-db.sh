#!/usr/bin/env bash
# scripts/backup-db.sh — pg_dump snapshot of the main stack's database (pdash-db).
#
# Usage:
#   scripts/backup-db.sh
#
# Writes a timestamped, compressed dump (pg_dump -Fc) to backups/ (gitignored — real
# data, including PII, must never reach git). Keeps only the KEEP most recent dumps,
# deleting older ones automatically.
#
# Non-blocking by design: this is a safety net, not a gate. If pdash-db isn't running
# (e.g. local dev with the main stack down), this prints a warning and exits 0 rather
# than failing whatever called it — /finish-cycle's Gate 4 relies on this so a merge
# is never blocked just because the main stack happens to be stopped.

set -euo pipefail

# Same .env parser as scripts/test-branch.sh — never source/eval the file, since real
# .env values in this repo contain shell-special characters (e.g. `$$` in
# POSTGRES_PASSWORD) that naive sourcing would silently corrupt. A variable already
# exported in the calling shell always wins over .env.
load_env() {
  local env_file=".env"
  [ -f "$env_file" ] || return 0
  local line key val
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

DB_CONTAINER="pdash-db"
DB_USER="${POSTGRES_USER:-pdash}"
DB_NAME="${POSTGRES_DB:-pdash}"
BACKUP_DIR="backups"
KEEP=3

db_health=$(docker inspect -f '{{.State.Running}}/{{.State.Health.Status}}' "$DB_CONTAINER" 2>/dev/null || echo "missing")
if [ "$db_health" != "true/healthy" ]; then
  echo "Warning: ${DB_CONTAINER} is not running/healthy (state: ${db_health}) — skipping backup." >&2
  exit 0
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
DUMP_FILE="${BACKUP_DIR}/pdash-backup-${TIMESTAMP}.dump"

docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$DUMP_FILE"

SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "Backup written: ${DUMP_FILE} (${SIZE})"

# Prune: keep only the KEEP most recent dumps, oldest-first deletion.
mapfile -t DUMPS < <(ls -1t "${BACKUP_DIR}"/pdash-backup-*.dump 2>/dev/null)
if [ "${#DUMPS[@]}" -gt "$KEEP" ]; then
  for old in "${DUMPS[@]:$KEEP}"; do
    rm -f "$old"
    echo "Pruned old backup: ${old}"
  done
fi
