# test-branch.sh + run-tests.sh Hardening (Cycle 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden `scripts/test-branch.sh` (secure temp-file handling for the main-stack data clone, configurable ports) and `scripts/run-tests.sh` (deduplicate its cleanup command, add a concurrency lock).

**Architecture:** Four independent edits across two files: Tasks 1-2 touch `scripts/test-branch.sh` only; Tasks 3-4 touch `scripts/run-tests.sh` only, in this order because Task 4's `cleanup()` change builds on the `compose_down()` helper Task 3 introduces.

**Tech Stack:** Bash (`set -euo pipefail`), `mktemp`, `mkdir`-based locking (POSIX-atomic, no new dependency).

## Global Constraints

- No new external dependencies.
- No regression on a normal, complete, uninterrupted run of either script with default `.env` (no custom port overrides, no concurrent second invocation).
- Neither script's external contract changes (`test-branch.sh`'s `up`/`down`/`status` subcommand behavior; `run-tests.sh`'s `exit 0`/`exit 1` on integration-test pass/fail).
- The test-admin bootstrap credential (`test-branch@pdash.local` / `TestBranch123!`) is unchanged — not in scope.
- `run-tests.sh` exposes no host ports — port configurability (Task 2) applies only to `test-branch.sh`.

---

### Task 1: Secure the `/tmp` dump in `test-branch.sh`

**Files:**
- Modify: `scripts/test-branch.sh:142-148`

**Interfaces:** None — single-file, independent of Tasks 2-4.

- [ ] **Step 1: Replace the fixed dump path with `mktemp`, and clean up after use**

Replace lines 142-148:

```bash
  if docker ps --format '{{.Names}}' | grep -qx "$MAIN_DB_CONTAINER"; then
    echo "main stack detected — cloning data from ${MAIN_DB_CONTAINER}..."
    docker exec "$MAIN_DB_CONTAINER" pg_dump -U "$DB_USER" -Fc "$DB_NAME" > /tmp/pdash_branch_snapshot.dump
    docker exec -i "$DB_CONTAINER" pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists < /tmp/pdash_branch_snapshot.dump
    echo "Data cloned from main."
    $COMPOSE up -d --build api nginx adminer
    wait_healthy "$API_CONTAINER"
```

with:

```bash
  if docker ps --format '{{.Names}}' | grep -qx "$MAIN_DB_CONTAINER"; then
    echo "main stack detected — cloning data from ${MAIN_DB_CONTAINER}..."
    DUMP_FILE=$(mktemp)
    docker exec "$MAIN_DB_CONTAINER" pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$DUMP_FILE"
    docker exec -i "$DB_CONTAINER" pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists < "$DUMP_FILE"
    rm -f "$DUMP_FILE"
    echo "Data cloned from main."
    $COMPOSE up -d --build api nginx adminer
    wait_healthy "$API_CONTAINER"
```

`mktemp` creates the file with `600` permissions by default on all POSIX systems (owner read/write only) — no world-readable window at any point, and no new dependency (already available wherever bash is).

- [ ] **Step 2: Verify by running the clone-data path with the main stack up**

This requires the main stack (`pdash-db`/`pdash-api`/etc.) to be running. If it isn't, start it first with `docker compose up -d` from the repo root (per this project's CLAUDE.md, confirm with the user before starting/stopping the main stack if it isn't already running — this step only needs it *running*, not modified).

Run: `git branch --show-current` — confirm you're on a feature branch (not `main`), since `test-branch.sh` refuses to run on `main`.
Run: `scripts/test-branch.sh up` — with the main stack running, this exercises the clone-data path (the block just edited).
Expected: prints `main stack detected — cloning data from pdash-db...` and `Data cloned from main.`, no errors related to the dump file.

While the script is still mid-clone (or immediately after "Data cloned from main." prints, before the script finishes), check for a leftover dump file: `ls /tmp/pdash_branch_snapshot.dump 2>&1` — expected: `No such file or directory` (the old fixed filename is never created anymore). Also run `ls /tmp/tmp.* 2>/dev/null` right as the clone step runs, if you can catch it — the `mktemp`-created file should not persist after the script completes.

- [ ] **Step 3: Tear down and commit**

```bash
scripts/test-branch.sh down
```

```bash
git add scripts/test-branch.sh
git commit -m "fix: create test-branch.sh's main-stack data-clone dump via mktemp (0600, auto-deleted) instead of a fixed world-readable /tmp path"
```

---

### Task 2: Configurable ports in `test-branch.sh`

**Files:**
- Modify: `scripts/test-branch.sh:62-65`

**Interfaces:** None — single-file, independent of Tasks 1, 3, 4.

- [ ] **Step 1: Replace the fixed port assignments with env-overridable defaults**

Replace lines 62-65:

```bash
FRONTEND_PORT=8081
API_PORT=3001
DB_PORT=5433
ADMINER_PORT=8082
```

with:

```bash
FRONTEND_PORT="${TEST_BRANCH_FRONTEND_PORT:-8081}"
API_PORT="${TEST_BRANCH_API_PORT:-3001}"
DB_PORT="${TEST_BRANCH_DB_PORT:-5433}"
ADMINER_PORT="${TEST_BRANCH_ADMINER_PORT:-8082}"
```

No other line in the file needs to change — `write_override()`, `open_browser()`, and the final "Stack up" message already reference these as `$FRONTEND_PORT`/`$API_PORT`/`$DB_PORT`/`$ADMINER_PORT` variables, not literals.

- [ ] **Step 2: Verify the default (no override) case still works**

Run: `scripts/test-branch.sh up` (no custom env vars set)
Expected: identical behavior to before — nginx on `8081`, adminer on `8082`, etc. (confirm via `curl -s -o /dev/null -w '%{http_code}' http://localhost:8081` or simply opening it, per however you're already verifying `up`).

Run: `scripts/test-branch.sh down`

- [ ] **Step 3: Verify a custom port override works**

```bash
echo "TEST_BRANCH_FRONTEND_PORT=9091" >> .env
scripts/test-branch.sh up
```

Expected: the script's own "Stack up. Opening http://localhost:9091 ..." message shows the custom port, and the service actually responds there (`curl -s -o /dev/null -w '%{http_code}' http://localhost:9091` — expect `200` or similar, not connection refused). Confirm `http://localhost:8081` (the old default) is NOT serving this stack.

Tear down and revert the `.env` change:

```bash
scripts/test-branch.sh down
git checkout -- .env
```

(If `.env` wasn't tracked or the line was appended to an untracked file, instead manually remove the `TEST_BRANCH_FRONTEND_PORT=9091` line you added — do not leave it in `.env` after this task.)

- [ ] **Step 4: Commit**

```bash
git add scripts/test-branch.sh
git commit -m "feat: make test-branch.sh's ports configurable via optional .env variables"
```

---

### Task 3: Extract the duplicated cleanup command in `run-tests.sh`

**Files:**
- Modify: `scripts/run-tests.sh:66-70` (the `cleanup()` function and `trap` line), `scripts/run-tests.sh:74-75` (the pre-cleanup call)

**Interfaces:**
- Consumes: `$COMPOSE` (pre-existing script variable).
- Produces: `compose_down()` — a bash function taking no arguments, used by Task 4's `cleanup()` modification.

- [ ] **Step 1: Add the `compose_down()` function and use it in both places**

Replace lines 66-70:

```bash
cleanup() {
  $COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$OVERRIDE_FILE"
}
trap cleanup EXIT
```

with:

```bash
compose_down() {
  $COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true
}

cleanup() {
  compose_down
  rm -f "$OVERRIDE_FILE"
}
trap cleanup EXIT
```

Then replace lines 74-75 (the pre-cleanup call, now at a shifted line number — re-check with `grep -n` before editing):

```bash
echo "Cleaning up any leftover state from a prior run..."
$COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true
```

with:

```bash
echo "Cleaning up any leftover state from a prior run..."
compose_down
```

- [ ] **Step 2: Verify the literal command now appears exactly once**

Run: `grep -c '\$COMPOSE down -v --remove-orphans' scripts/run-tests.sh`
Expected: `1` (only inside `compose_down()` itself — both call sites now say `compose_down`, not the literal command).

- [ ] **Step 3: Verify no regression with a normal full run**

Run: `scripts/run-tests.sh`
Expected: identical behavior to before this change — full run completes, prints "Cleaning up any leftover state from a prior run..." early on, and finishes with the usual test results and exit code.

- [ ] **Step 4: Commit**

```bash
git add scripts/run-tests.sh
git commit -m "refactor: extract run-tests.sh's duplicated cleanup command into a shared compose_down() function"
```

---

### Task 4: Concurrency lock in `run-tests.sh`

**Files:**
- Modify: `scripts/run-tests.sh:4-7` (right after the cwd guard, before `load_env()`), `scripts/run-tests.sh`'s `cleanup()` function (introduced in Task 3 — re-check exact current line numbers with `grep -n` before editing, since Task 3 shifted lines)

**Interfaces:**
- Consumes: `compose_down()` (Task 3) — not directly, but `cleanup()`'s existing call to it stays as-is; this task only adds a line to the same function.
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Add the lock acquisition right after the cwd guard**

Find the cwd guard block (the current file's lines 4-7):

```bash
if [ ! -f docker-compose.yml ] || [ ! -d api/src/db/migrations ]; then
  echo "scripts/run-tests.sh must be run from the repository root (docker-compose.yml and api/src/db/migrations/ not found here)." >&2
  exit 1
fi
```

Immediately after it (before the blank line that precedes the `load_env()` comment), insert:

```bash

LOCK_DIR=".run-tests.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "Another run-tests.sh is already in progress (lock: $LOCK_DIR). Wait for it to finish." >&2
  exit 1
fi
```

- [ ] **Step 2: Release the lock in `cleanup()`**

Find `cleanup()` (as left by Task 3):

```bash
cleanup() {
  compose_down
  rm -f "$OVERRIDE_FILE"
}
```

Replace with:

```bash
cleanup() {
  compose_down
  rm -f "$OVERRIDE_FILE"
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
```

- [ ] **Step 3: Verify the lock blocks a genuinely concurrent second invocation**

```bash
scripts/run-tests.sh &
FIRST_PID=$!
sleep 5
scripts/run-tests.sh; echo "second invocation exit code: $?"
```

Expected: the second invocation (the foreground one you just ran) prints `Another run-tests.sh is already in progress (lock: .run-tests.lock). Wait for it to finish.` to stderr and exits with a non-zero code immediately — it must NOT proceed to any Docker command.

Then wait for the first (background) invocation to finish:

```bash
wait $FIRST_PID; echo "first invocation exit code: $?"
```

Expected: the first invocation completes normally (its own Docker stack was never touched by the blocked second invocation) and reports its own real test-pass/fail exit code (`0` if all 97 integration tests passed).

- [ ] **Step 4: Verify the lock is released after a normal run (no stale lock blocking the next invocation)**

Run: `ls -d .run-tests.lock 2>&1`
Expected: `No such file or directory` — the lock directory was removed by `cleanup()` when the prior run (Step 3's background one) exited.

Run: `scripts/run-tests.sh` (a fresh, single, uncontended run)
Expected: completes normally, no lock-related error — confirms the lock doesn't wrongly persist across separate invocations.

- [ ] **Step 5: Commit**

```bash
git add scripts/run-tests.sh
git commit -m "fix: add an mkdir-based concurrency lock to run-tests.sh so two simultaneous invocations can't tear each other down"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers the `/tmp` dump security fix, Task 2 covers configurable ports, Task 3 covers the shared cleanup helper, Task 4 covers the concurrency lock. All four spec sections have a corresponding task.
- **Placeholder scan:** no TBD/TODO; every step shows literal before/after code or literal commands to run.
- **Type/name consistency:** `compose_down()` (introduced Task 3) is referenced only by name in Task 4's `cleanup()` modification, not redefined — consistent. `LOCK_DIR` (introduced Task 4) is a new variable, not referenced by Tasks 1-3. `DUMP_FILE` (Task 1) and `TEST_BRANCH_*_PORT` (Task 2) are each self-contained to their own task, no cross-task references.
- **Task ordering note:** Task 3 must run before Task 4 (Task 4's `cleanup()` edit is written against Task 3's post-refactor version of that function) — an implementer executing Task 4 should re-read the current file state rather than assume the plan's shown "before" block for `cleanup()` is still verbatim-current if Task 3 hasn't landed yet or if line numbers shifted.
