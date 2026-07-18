# Test-branch.sh Safe .env Sourcing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce `scripts/test-branch.sh` into the repo — an isolated Docker Compose stack for testing a feature branch before merge — with `.env` sourcing built in from the start using a shell-safe manual parser (never `source`/`eval`), matching the existing `api/src/create-admin.js` pattern.

**Architecture:** Single self-contained bash script, no dependencies beyond `docker`, `git`, `bash`. A `load_env()` function reads `.env` line-by-line via `read`, skips comments/blank lines, strips surrounding quotes, and exports each `KEY=VALUE` pair only if `KEY` isn't already set in the environment — never invoking `source`/`eval` on the file, since real `.env` values in this repo contain shell-special characters (e.g. `$$` in `POSTGRES_PASSWORD`) that a naive `source` would corrupt.

**Tech Stack:** Bash (`set -euo pipefail`), Docker Compose, no new dependencies.

## Global Constraints

- No new dependencies (no `dotenv` package, no external tools) — pure bash, per the spec's explicit constraint.
- `.env` absence must not error — script falls back to hardcoded defaults (`pdash`/`pdash`), unchanged from today.
- A variable already exported in the calling shell always wins over `.env` — mirrors `create-admin.js:29`'s `if (!(key in process.env))` precedence.
- `.env` is read relative to the current working directory (not the script's location) — consistent with the rest of the script, which already assumes it runs from the repo root (writes `docker-compose.branch.yml` with a relative path, invokes `docker compose` with relative paths).

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/test-branch.sh` (new) | Full isolated-branch-stack script: `load_env()` (this plan's focus), plus `up`/`down` commands, override-file generation, health-wait, data cloning/migration — carried over verbatim from the reviewed offline proposal, with `load_env()` added. |

No other files are touched by this plan. Integrating the script into `finish-cycle.md`/`PROCESS.md` (Cycle 2) and any `CLAUDE.md` documentation line are explicitly out of scope — see the Cycle 1 brief's "Scope escluso esplicitamente".

---

### Task 1: Add `scripts/test-branch.sh` with safe `.env` sourcing

**Files:**
- Create: `scripts/test-branch.sh`

**Interfaces:**
- Consumes: nothing from other tasks (this is the only task in this plan).
- Produces: `scripts/test-branch.sh up` / `scripts/test-branch.sh down` (Docker-dependent commands, not exercised by this task's verification — see Step 4 below for why). `load_env()` is an internal function, not consumed by anything outside this file in this plan.

- [ ] **Step 1: Write the verification fixture and command, run it, confirm it currently fails**

The script doesn't exist yet, so any verification of `load_env()` must fail at this point. Create a scratch directory and fixture `.env`, then try to extract and run a `load_env` function from the not-yet-existing script:

```bash
mkdir -p /tmp/test-branch-env-check
cat > /tmp/test-branch-env-check/.env <<'EOF'
POSTGRES_USER=custom_user
POSTGRES_DB=custom_db
POSTGRES_PASSWORD=P4$$word123__
EOF
bash -c "
  set -euo pipefail
  cd /tmp/test-branch-env-check
  $(sed -n '/^load_env()/,/^}/p' scripts/test-branch.sh 2>/dev/null)
  load_env
  echo \"USER=\$POSTGRES_USER\"
  echo \"DB=\$POSTGRES_DB\"
  echo \"PASS=\$POSTGRES_PASSWORD\"
"
```

Run it. Expected: the `sed` finds nothing (file doesn't exist), so `load_env` is never defined — the script errors with something like `load_env: command not found` (exit code 127). This confirms there's no accidental pre-existing implementation.

- [ ] **Step 2: Create `scripts/test-branch.sh` with `load_env()` integrated**

```bash
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
```

- [ ] **Step 3: Make it executable and verify syntax**

```bash
chmod +x scripts/test-branch.sh
bash -n scripts/test-branch.sh
```

Expected: `bash -n` (syntax check only, no execution) produces no output and exits 0.

- [ ] **Step 4: Re-run the Step 1 verification command, confirm `load_env()` reads `.env` correctly**

```bash
bash -c "
  set -euo pipefail
  cd /tmp/test-branch-env-check
  $(sed -n '/^load_env()/,/^}/p' scripts/test-branch.sh)
  load_env
  echo \"USER=\$POSTGRES_USER\"
  echo \"DB=\$POSTGRES_DB\"
  echo \"PASS=\$POSTGRES_PASSWORD\"
"
```

Expected output:
```
USER=custom_user
DB=custom_db
PASS=P4$$word123__
```

The `PASS` line matters most: it confirms `$$` was read as two literal characters, not expanded to a PID — proof `load_env()` never invokes `source`/`eval` on the file content.

- [ ] **Step 5: Verify shell-exported variables take precedence over `.env`**

```bash
bash -c "
  set -euo pipefail
  cd /tmp/test-branch-env-check
  export POSTGRES_USER=shell_wins
  $(sed -n '/^load_env()/,/^}/p' scripts/test-branch.sh)
  load_env
  echo \"USER=\$POSTGRES_USER\"
  echo \"DB=\$POSTGRES_DB\"
"
```

Expected output:
```
USER=shell_wins
DB=custom_db
```

`POSTGRES_USER` keeps the shell-exported value (`.env`'s `custom_user` is not applied since the variable was already set); `POSTGRES_DB` still comes from `.env` since it wasn't pre-exported.

- [ ] **Step 6: Verify a missing `.env` falls back to the script's hardcoded defaults**

```bash
mkdir -p /tmp/test-branch-env-missing
bash -c "
  set -euo pipefail
  cd /tmp/test-branch-env-missing
  $(sed -n '/^load_env()/,/^}/p' scripts/test-branch.sh)
  load_env
  DB_USER=\"\${POSTGRES_USER:-pdash}\"
  DB_NAME=\"\${POSTGRES_DB:-pdash}\"
  echo \"DB_USER=\$DB_USER\"
  echo \"DB_NAME=\$DB_NAME\"
"
```

Expected output:
```
DB_USER=pdash
DB_NAME=pdash
```

No `.env` in `/tmp/test-branch-env-missing` — `load_env` returns immediately (its `[ -f "$env_file" ] || return 0` guard), and the script's own `${VAR:-pdash}` defaults apply, unchanged from before this fix.

- [ ] **Step 7: Clean up scratch directories**

```bash
rm -rf /tmp/test-branch-env-check /tmp/test-branch-env-missing
```

- [ ] **Step 8: Commit**

```bash
git add scripts/test-branch.sh
git commit -m "$(cat <<'EOF'
feat: add scripts/test-branch.sh with safe .env sourcing

Introduces the isolated branch-testing Docker stack script with a
load_env() function baked in from the start, mirroring
api/src/create-admin.js's manual .env parsing (never source/eval) —
real .env values in this repo contain shell-special characters (e.g.
$$ in POSTGRES_PASSWORD) that naive sourcing would corrupt.
EOF
)"
```

---

## Out of scope (confirmed in the Cycle 1 brief)

- Wiring `scripts/test-branch.sh` into `finish-cycle.md` Gate 2 or `PROCESS.md` — that integration, plus the open design question about re-running `/finish-cycle` with the branch stack already active, is Cycle 2 (`docs/superpowers/briefs/2026-07-18-finish-cycle-gate2-retry-behavior-brief.md`), a separate plan.
- Adding the `CLAUDE.md` "Development" section line mentioned verbally by the user — not part of either offline-reviewed file, deferred to whichever cycle actually merges the script into the documented workflow.
- Any change to `api/src/create-admin.js`.
