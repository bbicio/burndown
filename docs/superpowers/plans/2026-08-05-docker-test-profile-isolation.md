# Docker test-profile isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Docker Compose integration-test profile its own container names, ports, project name, and disposable data volume, so it never collides with — or silently attaches to — the always-running main dev stack.

**Architecture:** A new wrapper script, `scripts/run-tests.sh`, generates a throwaway Compose override file (`docker-compose.test.yml`) that renames `db`/`api`'s containers and strips their host ports, brings up an isolated `-p pdash_test` stack, applies all SQL migrations to the fresh database, runs the existing `test` service against it, and tears everything down (containers + volume + override file) via a `trap ... EXIT`, regardless of outcome. `.claude/commands/finish-cycle.md`'s Gate 1 is updated to call this script instead of the raw `docker compose --profile test run --rm test` command.

**Tech Stack:** Bash (`set -euo pipefail`), Docker Compose v2 (`!override` merge tag, `--profile`), `psql` (via `docker exec`), no new dependencies.

## Global Constraints

- Must not alter the main stack's behavior — `docker compose up` (no `-p`, no override file) still publishes `pdash-db`/`pdash-api` on ports 5432/3000 exactly as before.
- Must run standalone, with no preexisting stack (a clean CI environment) — never require the user to stop the main stack manually.
- The test-profile's data volume must always be empty at the start of a run and removed at the end of every run (success or failure) — no persistence between runs.
- No new external dependencies (no new binaries, no new npm/pip packages).
- Isolation pattern must reuse the same techniques already established in `scripts/test-branch.sh` (`load_env()`, `write_override()` with `!override`, `wait_healthy()`), not reinvent them.
- Wherever the test command is documented in this project, it must be updated to the new command (`.claude/commands/finish-cycle.md:20` is the only known reference).

---

## File Structure

- **Create:** `scripts/run-tests.sh` — the wrapper script; owns override generation, stack lifecycle, migration application, and teardown for the isolated test run. Single-responsibility, mirrors `scripts/test-branch.sh`'s existing structure so future maintainers recognize the pattern immediately.
- **Modify:** `.claude/commands/finish-cycle.md:20` — Gate 1's documented test command, one line.

No other files change. This is a single self-contained unit — no sub-project decomposition needed.

---

### Task 1: `scripts/run-tests.sh` — isolated test-stack wrapper script

**Files:**
- Create: `scripts/run-tests.sh`

**Interfaces:**
- Consumes: `.env` at the invoking working directory (read by this task's own `load_env()`, copied from `scripts/test-branch.sh`'s existing implementation — not imported, since bash has no module system); `docker-compose.yml`'s existing `db`/`api`/`test` service definitions (unmodified); `api/src/db/migrations/*.sql` (unmodified, applied in filename-sorted order).
- Produces: an executable script at `scripts/run-tests.sh`, invoked with no arguments, that exits 0 if all integration tests pass and 1 if any fail (or if setup fails). This exit code is what Task 2's `finish-cycle.md` change relies on.

This is the only task in the plan — the full script is specified below, in one piece, since its pieces (`load_env`, `write_override`, `wait_healthy`, `cleanup`, the main sequence) are too small and too interdependent to split into separate reviewable units; splitting would just mean writing the same 80-line file across two "tasks" with no independently testable midpoint.

- [ ] **Step 1: Create the script file with full content**

Create `scripts/run-tests.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Same load_env() as scripts/test-branch.sh, verbatim -- reads .env into this shell's own
# environment (docker compose auto-loads .env for container-internal variables, but the psql
# call below runs in this script's own shell, outside any container, and needs POSTGRES_USER/
# POSTGRES_DB directly).
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

cleanup() {
  $COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$OVERRIDE_FILE"
}
trap cleanup EXIT

write_override
echo "Starting isolated test stack (project: ${PROJECT})..."

$COMPOSE up -d --build db
wait_healthy "$DB_CONTAINER"

echo "Applying migrations to the fresh test database..."
for f in api/src/db/migrations/*.sql; do
  echo "  applying $(basename "$f")"
  docker exec -i "$DB_CONTAINER" psql -U "${POSTGRES_USER:-pdash}" -d "${POSTGRES_DB:-pdash}" < "$f"
done

$COMPOSE up -d --build api
wait_healthy "$API_CONTAINER"

set +e
$COMPOSE --profile test run --rm test
exit_code=$?
set -e

exit $exit_code
```

- [ ] **Step 2: Make the script executable**

Run: `chmod +x scripts/run-tests.sh`
Expected: no output; `ls -l scripts/run-tests.sh` shows the `x` bit set for owner/group/other (matching `scripts/test-branch.sh`'s existing permissions — check with `ls -l scripts/test-branch.sh` if unsure what mode to match).

- [ ] **Step 3: Run it from the repo root while the main stack is stopped, verify a clean pass**

Run (from the main repo root, not a worktree — the script's relative paths `docker-compose.yml`, `api/src/db/migrations/`, `.env` all assume cwd is the repo root, matching `scripts/test-branch.sh`'s own convention):

```bash
docker compose down    # ensure main stack isn't running for this first check
scripts/run-tests.sh
echo "exit code: $?"
```

Expected: script prints "Starting isolated test stack (project: pdash_test)...", applies all 19 migration files in order, brings up `pdash-api-test` healthy, runs the `test` service, prints its test output, and the script's own final `echo "exit code: $?"` prints `exit code: 0` (assuming the existing `test-api.js` suite is currently green — it was last verified passing in this session's prior cycles).

- [ ] **Step 4: Verify isolation while the main stack is running (the original bug)**

Run:

```bash
docker compose up -d
scripts/run-tests.sh
echo "exit code: $?"
```

Expected: no `Conflict. The container name "/pdash-db" is already in use` error (the original bug this design fixes); script completes and reports exit code 0, identically to Step 3. This is the core acceptance criterion from the spec — confirm it explicitly, don't just glance at output.

- [ ] **Step 5: Verify volume isolation and full cleanup**

While `scripts/run-tests.sh` is mid-run (e.g. open a second terminal during Step 3 or 4, or add a temporary `sleep 30` right before the final `$COMPOSE --profile test run --rm test` line, run the check, then remove the `sleep`), run:

```bash
docker volume ls | grep pdash_test
```

Expected: a volume prefixed `pdash_test_pgdata` (or similar, matching Compose's `<project>_<volume-name>` naming), distinct from the main stack's own `<maindir>_pgdata` (or whatever the main stack's actual volume name is — check with `docker volume ls | grep pgdata` beforehand for comparison).

After the run completes (both a passing run and, separately, a run forced to fail — temporarily edit `test-api.js` to throw immediately, run `scripts/run-tests.sh`, confirm exit code 1, then revert the edit), run:

```bash
docker ps -a | grep -E "pdash-db-test|pdash-api-test"
docker volume ls | grep pdash_test
ls docker-compose.test.yml 2>&1
```

Expected: all three commands show nothing (no leftover containers, no leftover volume, `ls` reports "No such file or directory" for the override file) — confirming the `trap cleanup EXIT` ran on both the pass and the forced-fail path.

- [ ] **Step 6: Verify the main stack is unaffected**

Run:

```bash
docker compose up -d
docker inspect pdash-db --format '{{.Name}} {{.State.Status}}'
docker inspect pdash-api --format '{{.Name}} {{.State.Status}}'
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/auth/me
```

Expected: both containers report `/pdash-db running` / `/pdash-api running`, and the curl call returns a real HTTP status code (e.g. `401`, not a connection error) — confirming ports 5432/3000 are still published by the main stack exactly as before this change.

- [ ] **Step 7: Commit**

```bash
git add scripts/run-tests.sh
git commit -m "feat: add isolated Docker Compose wrapper for the integration-test profile"
```

---

### Task 2: Point `/finish-cycle` Gate 1 at the new script

**Files:**
- Modify: `.claude/commands/finish-cycle.md:20`

**Interfaces:**
- Consumes: `scripts/run-tests.sh`'s exit-code contract from Task 1 (0 = pass, 1 = fail) — Gate 1's existing logic ("If it fails: stop immediately, show the failing output verbatim") already handles a non-zero exit generically, no other change to Gate 1's surrounding steps is needed.
- Produces: nothing consumed by a later task — this is the last task in the plan.

- [ ] **Step 1: Update the documented command**

In `.claude/commands/finish-cycle.md`, change line 20 from:

```
3. Run `docker compose --profile test run --rm test`.
```

to:

```
3. Run `scripts/run-tests.sh`.
```

- [ ] **Step 2: Confirm no other reference to the old command exists**

Run: `grep -rn "docker compose --profile test run" --include="*.md" --include="*.sh" .`
Expected: zero matches outside of `docker-compose.yml`'s own usage-comment (`# Usage: docker compose --profile test run --rm test`, line 51) — that comment describes the raw profile itself (still technically valid to run directly, just no longer isolated) and is not a call site this task needs to change; the spec's scope is the *documented, callable* command in `finish-cycle.md`, not the profile's own inline usage note.

- [ ] **Step 3: Commit**

```bash
git add .claude/commands/finish-cycle.md
git commit -m "docs: point finish-cycle Gate 1 at the isolated test-stack wrapper"
```

---

## Self-Review

**1. Spec coverage:**
- "Test gate always runs isolated" → Task 1 Steps 3-4 verify both stopped-main and running-main cases.
- "Volume never shared, cleaned up every run" → Task 1 Step 5 verifies both.
- "Main stack unaffected" → Task 1 Step 6.
- "Command updated wherever referenced" → Task 2 Steps 1-2 (the grep step exists specifically to catch any reference the spec author might have missed).
- Spec's "no new external dependencies" constraint → the script uses only `docker`, `bash` builtins, and `psql` (already a dependency via the `db` image) — no new tool introduced. Confirmed no task adds one.
- Migration-application requirement (spec's "Modifica" design note) → Task 1 Step 1's script includes the explicit `for f in api/src/db/migrations/*.sql` loop, not just a description.

**2. Placeholder scan:** No TBD/TODO; every step shows literal commands and expected output rather than descriptions of what to check.

**3. Type consistency:** `DB_CONTAINER`/`API_CONTAINER` variable names, `PROJECT`/`OVERRIDE_FILE` — used identically throughout the one script in Task 1; no cross-task signature mismatch is possible since Task 2 only edits a markdown line and doesn't reference the script's internals beyond its filename and invocation form (`scripts/run-tests.sh`), which matches Task 1's Step 1 filename exactly.

No gaps found.
