# test-branch.sh/run-tests.sh Correctness Hardening (Cycle 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three correctness bugs in the branch/test Docker Compose helper scripts: malformed/whitespace `.env` handling in `load_env()`, non-idempotent fresh-database migrations in `test-branch.sh up()`, and `status()` reporting mere container existence instead of real health.

**Architecture:** Three independent, surgical edits to existing bash scripts — no new files, no new external dependencies, no new shell-library convention. Each fix is verified manually (there is no automated test harness for these scripts in this project, and this cycle doesn't introduce one).

**Tech Stack:** Bash (`set -euo pipefail`), Docker CLI (`docker`, `docker compose`), PostgreSQL (`psql`).

## Global Constraints

- No new external dependencies (spec: "No new external dependency").
- `load_env()` must be fixed identically in both `scripts/test-branch.sh` and `scripts/run-tests.sh` — kept duplicated, not consolidated into a shared file.
- No regression on well-formed `.env` files or a normal single `up`→`down` cycle.
- `status()`'s external contract (`exit 0` + stdout `"up"`, or `exit 1` + stdout `"down"`) must not change — only the internal criterion.
- The migration-idempotency fix must not introduce a migration-tracking table or per-file tracking mechanism — a coarse schema-existence check only.
- All user-facing script output stays in English (project-wide convention, `CLAUDE.md`).

---

### Task 1: Fix `load_env()` in `scripts/test-branch.sh`

**Files:**
- Modify: `scripts/test-branch.sh:24-37` (the `load_env()` function)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing consumed by other tasks — `load_env()`'s external behavior (exports variables from `.env` into the calling shell) is unchanged in the well-formed case; only edge-case handling changes.

- [ ] **Step 1: Write a scratch `.env` fixture and manual test script to confirm current buggy behavior**

Create a temporary test fixture (not committed) to exercise `load_env()` in isolation:

```bash
mkdir -p /tmp/load-env-test && cd /tmp/load-env-test
cat > .env <<'EOF'
FOO=bar
  SPACED_KEY = spaced value
this is a stray line with no equals sign
# a comment line
QUOTED="quoted value"
EOF
```

Create `check.sh` in the same directory:

```bash
#!/usr/bin/env bash
set -euo pipefail
load_env() {
  local env_file=".env"
  [ -f "$env_file" ] || return 0
  while IFS='=' read -r key val; do
    key="${key%$'\r'}"
    [[ -z "$key" || "$key" == \#* ]] && continue
    val="${val%$'\r'}"
    val="${val%\"}"; val="${val#\"}"
    val="${val%\'}"; val="${val#\'}"
    if [ -z "${!key+x}" ]; then
      export "$key=$val"
    fi
  done < "$env_file"
}
load_env
echo "FOO=[${FOO:-unset}]"
echo "SPACED_KEY exists: $(env | grep -c '^SPACED_KEY=' || true)"
echo "'  SPACED_KEY ' var exists: $(env | grep -c 'SPACED_KEY' || true)"
echo "QUOTED=[${QUOTED:-unset}]"
```

- [ ] **Step 2: Run it to confirm the current bug**

Run: `bash /tmp/load-env-test/check.sh`

Expected (buggy behavior): `FOO=[bar]`, `QUOTED=[quoted value]` are correct, but the stray no-`=` line and the whitespace-padded key produce garbage exported variables (visible via `env | grep -i spaced` showing a mis-named variable, and no clean error).

- [ ] **Step 3: Apply the fix to `scripts/test-branch.sh`**

Replace lines 24-37 of `scripts/test-branch.sh` with:

```bash
load_env() {
  local env_file=".env"
  [ -f "$env_file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    [[ "$line" != *=* ]] && continue
    key="${line%%=*}"; val="${line#*=}"
    key="${key#"${key%%[![:space:]]*}"}"; key="${key%"${key##*[![:space:]]}"}"
    [[ -z "$key" || "$key" == \#* ]] && continue
    val="${val#"${val%%[![:space:]]*}"}"; val="${val%"${val##*[![:space:]]}"}"
    val="${val%\"}"; val="${val#\"}"
    val="${val%\'}"; val="${val#\'}"
    if [ -z "${!key+x}" ]; then
      export "$key=$val"
    fi
  done < "$env_file"
}
```

- [ ] **Step 4: Re-run the scratch check with the fixed function**

Update `/tmp/load-env-test/check.sh`'s inline `load_env()` definition to match the new version above, then run: `bash /tmp/load-env-test/check.sh`

Expected: `FOO=[bar]`, `QUOTED=[quoted value]` still correct; `env | grep -i spaced` shows `SPACED_KEY=spaced value` (trimmed, no leading/trailing whitespace in the name or value); the stray no-`=` line produces no new exported variable at all (confirm via `env | wc -l` before/after adding that line to the fixture, or `env | grep -c 'stray'` returning `0`).

- [ ] **Step 5: Clean up the scratch fixture**

```bash
rm -rf /tmp/load-env-test
```

- [ ] **Step 6: Commit**

```bash
git add scripts/test-branch.sh
git commit -m "fix: skip malformed .env lines and trim whitespace in test-branch.sh load_env()"
```

---

### Task 2: Apply the identical `load_env()` fix to `scripts/run-tests.sh`

**Files:**
- Modify: `scripts/run-tests.sh:8-21` (the `load_env()` function)

**Interfaces:**
- Consumes: the fixed `load_env()` body from Task 1 (byte-identical function).
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Apply the same fix**

Replace lines 8-21 of `scripts/run-tests.sh` with the exact same function body used in Task 1:

```bash
load_env() {
  local env_file=".env"
  [ -f "$env_file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    [[ "$line" != *=* ]] && continue
    key="${line%%=*}"; val="${line#*=}"
    key="${key#"${key%%[![:space:]]*}"}"; key="${key%"${key##*[![:space:]]}"}"
    [[ -z "$key" || "$key" == \#* ]] && continue
    val="${val#"${val%%[![:space:]]*}"}"; val="${val%"${val##*[![:space:]]}"}"
    val="${val%\"}"; val="${val#\"}"
    val="${val%\'}"; val="${val#\'}"
    if [ -z "${!key+x}" ]; then
      export "$key=$val"
    fi
  done < "$env_file"
}
```

- [ ] **Step 2: Verify the two functions are byte-identical**

Run:

```bash
diff <(sed -n '24,37p' scripts/test-branch.sh) <(sed -n '8,21p' scripts/run-tests.sh)
```

Expected: no output (the two function bodies match exactly, line-for-line at their respective locations in each file).

- [ ] **Step 3: Commit**

```bash
git add scripts/run-tests.sh
git commit -m "fix: skip malformed .env lines and trim whitespace in run-tests.sh load_env()"
```

---

### Task 3: Idempotent fresh-database migrations in `test-branch.sh up()`

**Files:**
- Modify: `scripts/test-branch.sh` — add a `schema_exists()` helper (near `wait_healthy()`, e.g. after line 99) and wrap the migration loop inside `up()`'s fresh-database branch (currently lines 136-141)

**Interfaces:**
- Consumes: `$DB_CONTAINER`, `$DB_USER`, `$DB_NAME` (already-defined script variables, lines 53/55-56).
- Produces: `schema_exists()` — a bash function with no arguments, returning shell truth value (0 = schema present, 1 = not present) via its `[ "$result" = "t" ]` exit status. Not consumed by any other task in this plan, but available for Cycle 2/3 work.

- [ ] **Step 1: Add the `schema_exists()` helper**

Insert immediately after the `wait_healthy()` function (after line 99 in the current file, before `open_browser()`):

```bash
schema_exists() {
  local result
  result=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT to_regclass('public.users') IS NOT NULL;")
  [ "$result" = "t" ]
}
```

- [ ] **Step 2: Wrap the migration loop in `up()`'s fresh-database branch**

Replace the current fresh-database branch body (the `else` block that currently reads):

```bash
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
```

with:

```bash
  else
    echo "main stack not running — preparing fresh database..."
    if schema_exists; then
      echo "schema already present — skipping migrations."
    else
      for f in api/src/db/migrations/*.sql; do
        echo "  applying $(basename "$f")"
        docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$f"
      done
    fi
    $COMPOSE up -d --build api nginx adminer
    wait_healthy "$API_CONTAINER"
    echo "Bootstrapping test admin user (test-branch@pdash.local / TestBranch123!)..."
    docker exec "$API_CONTAINER" node /app/src/create-admin.js test-branch@pdash.local TestBranch123! Test Branch
    echo "NOTE: fresh database — no pre-existing data, only the bootstrapped admin above."
  fi
```

- [ ] **Step 3: Verify the current branch and repo state before running Docker**

Run: `git branch --show-current`

Expected: NOT `main` (the script refuses to run on `main` — see lines 41-45). If currently on `main`, check out any feature branch first, e.g. the branch this plan's changes are being committed on, before proceeding to Step 4.

- [ ] **Step 4: Run `up` twice in a row against a fresh database (main stack stopped) to confirm the fix**

Confirm the main stack is stopped first (this test must exercise the fresh-database branch, not the clone-from-main branch):

Run: `docker ps --format '{{.Names}}' | grep -x pdash-db || echo "main stack not running, good"`

Then:

```bash
scripts/test-branch.sh up
```

Expected: completes successfully, prints each migration file being applied (first run, empty schema).

```bash
scripts/test-branch.sh up
```

Expected (second run, no intervening `down`): completes successfully, prints `"schema already present — skipping migrations."` instead of re-applying migration files, and does NOT error with any "already exists" message.

- [ ] **Step 5: Tear down the test stack**

```bash
scripts/test-branch.sh down
```

Expected: exits cleanly, removes `docker-compose.branch.yml`.

- [ ] **Step 6: Commit**

```bash
git add scripts/test-branch.sh
git commit -m "fix: make test-branch.sh's fresh-database migration loop idempotent"
```

---

### Task 4: `status()` reports real container health, not just existence

**Files:**
- Modify: `scripts/test-branch.sh:111-120` (the `status()` function)

**Interfaces:**
- Consumes: `$DB_CONTAINER`, `$API_CONTAINER` (already-defined script variables, lines 53-54).
- Produces: nothing consumed by other tasks — `status()`'s external contract (`exit 0`/`"up"` or `exit 1`/`"down"`) is unchanged, only its internal decision criterion.

- [ ] **Step 1: Replace the `status()` function**

Replace lines 111-120:

```bash
status() {
  if docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER" && \
     docker ps --format '{{.Names}}' | grep -qx "$API_CONTAINER"; then
    echo "up"
    exit 0
  else
    echo "down"
    exit 1
  fi
}
```

with:

```bash
status() {
  local db_health api_health
  db_health=$(docker inspect -f '{{.State.Health.Status}}' "$DB_CONTAINER" 2>/dev/null || echo "missing")
  api_health=$(docker inspect -f '{{.State.Health.Status}}' "$API_CONTAINER" 2>/dev/null || echo "missing")
  if [ "$db_health" = "healthy" ] && [ "$api_health" = "healthy" ]; then
    echo "up"
    exit 0
  else
    echo "down"
    exit 1
  fi
}
```

- [ ] **Step 2: Verify "down" case (stack stopped)**

Confirm no branch stack is running: `scripts/test-branch.sh down` (safe no-op if already down).

Run: `scripts/test-branch.sh status; echo "exit code: $?"`

Expected: prints `down` then `exit code: 1`.

- [ ] **Step 3: Verify "up" case (stack healthy)**

```bash
scripts/test-branch.sh up
```

Wait for it to finish (it already blocks on `wait_healthy` internally for both containers), then run:

```bash
scripts/test-branch.sh status; echo "exit code: $?"
```

Expected: prints `up` then `exit code: 0`.

- [ ] **Step 4: Verify the "existing but not yet healthy" case is now correctly reported as "down"**

While the stack is running, immediately restart just the db container to put it briefly into a non-healthy starting state, and check status before it stabilizes:

```bash
BRANCH=$(git branch --show-current)
SANITIZED=$(echo "$BRANCH" | tr '/ ' '__')
docker restart "pdash-db-${SANITIZED}" >/dev/null
scripts/test-branch.sh status; echo "exit code: $?"
```

Expected: prints `down` and `exit code: 1` immediately after the restart (container exists and is running, but its healthcheck hasn't reported `healthy` yet) — confirming this is now correctly distinguished from the old `docker ps`-only check, which would have reported `up` in this exact scenario. Wait a few seconds and run `scripts/test-branch.sh status` again — it should return to `up` once the healthcheck passes.

- [ ] **Step 5: Tear down the test stack**

```bash
scripts/test-branch.sh down
```

- [ ] **Step 6: Commit**

```bash
git add scripts/test-branch.sh
git commit -m "fix: status() now checks container health, not just existence"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1+2 cover the spec's `load_env()` section (both files). Task 3 covers the migration-idempotency section. Task 4 covers the `status()` section. All three spec sections have a corresponding task.
- **Placeholder scan:** no TBD/TODO; every step shows literal code or literal commands.
- **Type/name consistency:** `schema_exists()` (Task 3) and the `status()` rewrite (Task 4) both reference `$DB_CONTAINER`/`$API_CONTAINER`/`$DB_USER`/`$DB_NAME`, all of which are pre-existing script-level variables (not newly introduced by this plan) — verified against the current file content (lines 52-56) during planning.
