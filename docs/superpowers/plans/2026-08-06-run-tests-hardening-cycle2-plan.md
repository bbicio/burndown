# run-tests.sh Hardening (Cycle 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden `scripts/run-tests.sh` with an invocation-directory guard, unconditional pre-cleanup of leftover state from an abnormally-terminated prior run, and a conditional `--build` for the `api` service based on a build-context hash.

**Architecture:** Three sequential edits to the same file (`scripts/run-tests.sh`), each independently testable: (1) a directory guard at the very top of the script, before anything else runs; (2) an unconditional cleanup call near the top of the main script body, before `write_override()`; (3) a hash-based marker file that decides whether `--build` is passed to the `api` service, with `db`'s `--build` dropped entirely since it has no build context.

**Tech Stack:** Bash (`set -euo pipefail`), Docker CLI/Compose, `sha256sum`.

## Global Constraints

- No new external dependencies.
- No regression on a normal, complete, uninterrupted run.
- The script's external contract (`exit 0` on all integration tests passing, `exit 1` otherwise) is unchanged.
- Pre-cleanup (Task 2) is scoped exclusively to the `pdash_test` Compose project — never touches the main stack or `test-branch.sh`'s isolated stack, which use entirely distinct project/container names.
- The cwd guard (Task 1) applies only to `scripts/run-tests.sh` — `scripts/test-branch.sh` is explicitly out of scope for this cycle.
- The exact mechanism for conditional `--build` (Task 3) is a hash of `api/Dockerfile` + `api/package.json` + `api/package-lock.json` compared against a marker file (`.run-tests-image-hash`, repo root, gitignored) — not Docker's own build cache alone.

---

### Task 1: Invocation-directory guard

**Files:**
- Modify: `scripts/run-tests.sh:1-2` (immediately after the shebang/`set` line)

**Interfaces:** None — single-file, independent of Tasks 2-3 (though sequenced first since it's positioned at the very top of the file).

- [ ] **Step 1: Add the guard at the very top of the script**

Replace lines 1-2:

```bash
#!/usr/bin/env bash
set -euo pipefail
```

with:

```bash
#!/usr/bin/env bash
set -euo pipefail

if [ ! -f docker-compose.yml ] || [ ! -d api/src/db/migrations ]; then
  echo "scripts/run-tests.sh must be run from the repository root (docker-compose.yml and api/src/db/migrations/ not found here)." >&2
  exit 1
fi
```

This must be the first executable code in the script — before `load_env()` is even defined, before any Docker interaction.

- [ ] **Step 2: Verify the guard fires correctly from a wrong directory**

Run: `cd /tmp && bash /path/to/repo/scripts/run-tests.sh; echo "exit code: $?"` (substitute the actual absolute path to this repo's `scripts/run-tests.sh`)
Expected: prints `scripts/run-tests.sh must be run from the repository root (docker-compose.yml and api/src/db/migrations/ not found here).` to stderr, then `exit code: 1` — no Docker command is attempted.

- [ ] **Step 3: Verify the guard passes when run from the repo root**

Run: `cd <repo-root> && bash -c 'if [ ! -f docker-compose.yml ] || [ ! -d api/src/db/migrations ]; then echo FAIL; else echo PASS; fi'`
Expected: `PASS` (both paths exist from the repo root, so the guard's condition is false and it does not exit early).

- [ ] **Step 4: Commit**

```bash
git add scripts/run-tests.sh
git commit -m "fix: guard run-tests.sh against being invoked outside the repo root"
```

---

### Task 2: Unconditional pre-cleanup of leftover state

**Files:**
- Modify: `scripts/run-tests.sh` — insert a cleanup call before `write_override()` is called (immediately after the existing `trap cleanup EXIT` line; re-read the file first to confirm the exact current line number, since Task 1 shifted every line down by 5)

**Interfaces:**
- Consumes: the existing `$COMPOSE` variable and `cleanup()` function (both already defined earlier in the script — `cleanup()` at `trap cleanup EXIT`'s target).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Locate the exact current insertion point**

Run: `grep -n "trap cleanup EXIT\|write_override$" scripts/run-tests.sh`
Expected output (line numbers may differ slightly from this example due to Task 1's insertion, but the two lines' relative order and content will match):
```
70:trap cleanup EXIT
72:write_override
```

- [ ] **Step 2: Insert the pre-cleanup call between `trap cleanup EXIT` and `write_override`**

Find this block (using the line numbers from Step 1's actual output):

```bash
trap cleanup EXIT

write_override
echo "Starting isolated test stack (project: ${PROJECT})..."
```

Replace it with:

```bash
trap cleanup EXIT

echo "Cleaning up any leftover state from a prior run..."
$COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true

write_override
echo "Starting isolated test stack (project: ${PROJECT})..."
```

- [ ] **Step 3: Verify pre-cleanup runs harmlessly on a clean system**

Run: `scripts/run-tests.sh` (a normal, full run — requires Docker running; this is the existing "no regression" case)
Expected: prints `Cleaning up any leftover state from a prior run...` early in the output, immediately followed by the normal `Starting isolated test stack (project: pdash_test)...` and the rest of the script's usual output, ending in the normal test results and exit code. No errors from the cleanup line itself (it's `|| true`-guarded).

- [ ] **Step 4: Verify pre-cleanup actually removes leftover state from a simulated hard-kill**

Run:
```bash
scripts/run-tests.sh &
PID=$!
sleep 5
kill -9 $PID
docker ps -a --filter "name=pdash-db-test" --format '{{.Names}}'
```
Expected: the last command's output shows `pdash-db-test` still present (confirming the kill bypassed the `EXIT` trap, leaving orphaned state — this is the bug being fixed).

Then run: `scripts/run-tests.sh` again (let it run to completion this time) and, once it reaches the "Cleaning up any leftover state..." line, run in a separate terminal/second command: `docker ps -a --filter "name=pdash-db-test" --format '{{.Names}}\t{{.Status}}'`
Expected: after the pre-cleanup line has printed, the leftover `pdash-db-test` container from the killed run is gone (removed by the pre-cleanup step) before the script proceeds to create a fresh one via `write_override`/`up`. The full run completes successfully with no "already exists"/name-conflict errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/run-tests.sh
git commit -m "fix: unconditionally clean up leftover pdash_test state at the start of run-tests.sh"
```

---

### Task 3: Conditional `--build` for the `api` service

**Files:**
- Modify: `scripts/run-tests.sh` — replace the unconditional `--build` on both `up -d` calls with a hash-gated flag for `api` only, and drop `--build` entirely from `db`
- Modify: `.gitignore` — add `.run-tests-image-hash`

**Interfaces:**
- Consumes: `api/Dockerfile`, `api/package.json`, `api/package-lock.json` (existing files, read-only).
- Produces: `.run-tests-image-hash` (repo root, gitignored) — a plain-text file containing a `sha256` hex digest. Not consumed by any other task in this plan.

- [ ] **Step 1: Locate the exact current `up -d --build` calls**

Run: `grep -n "up -d --build" scripts/run-tests.sh`
Expected output (line numbers may differ slightly due to Tasks 1-2's insertions, but content matches):
```
77:$COMPOSE up -d --build db
86:$COMPOSE up -d --build api
```

- [ ] **Step 2: Add the hash computation and replace both `up -d --build` calls**

Find the block containing (using the actual current line numbers from Step 1):

```bash
$COMPOSE up -d --build db
wait_healthy "$DB_CONTAINER"

echo "Applying migrations to the fresh test database..."
for f in api/src/db/migrations/*.sql; do
  echo "  applying $(basename "$f")"
  docker exec -i "$DB_CONTAINER" psql -U "${POSTGRES_USER:-pdash}" -d "${POSTGRES_DB:-pdash}" < "$f"
done

$COMPOSE up -d --build api
wait_healthy "$API_CONTAINER"
```

Replace it with:

```bash
$COMPOSE up -d db
wait_healthy "$DB_CONTAINER"

echo "Applying migrations to the fresh test database..."
for f in api/src/db/migrations/*.sql; do
  echo "  applying $(basename "$f")"
  docker exec -i "$DB_CONTAINER" psql -U "${POSTGRES_USER:-pdash}" -d "${POSTGRES_DB:-pdash}" < "$f"
done

IMAGE_HASH_FILE=".run-tests-image-hash"
CURRENT_HASH=$(cat api/Dockerfile api/package.json api/package-lock.json | sha256sum | cut -d' ' -f1)

API_BUILD_FLAG="--build"
if [ -f "$IMAGE_HASH_FILE" ] && [ "$(cat "$IMAGE_HASH_FILE")" = "$CURRENT_HASH" ]; then
  API_BUILD_FLAG=""
fi

$COMPOSE up -d $API_BUILD_FLAG api
wait_healthy "$API_CONTAINER"
echo "$CURRENT_HASH" > "$IMAGE_HASH_FILE"
```

Note: `$COMPOSE up -d $API_BUILD_FLAG api` intentionally leaves `$API_BUILD_FLAG` unquoted — when it's empty, this must expand to no argument at all (`up -d api`), not an empty-string argument. Do not quote it.

- [ ] **Step 3: Add the marker file to `.gitignore`**

Read the current `.gitignore` first (`grep -n "docker-compose.test.yml" .gitignore` to find the existing precedent for a run-tests.sh-generated file), then add a line for `.run-tests-image-hash` near it — e.g. if `.gitignore` contains:

```
docker-compose.test.yml
```

add immediately after it:

```
docker-compose.test.yml
.run-tests-image-hash
```

- [ ] **Step 4: Verify the unchanged case skips the api build**

Run: `rm -f .run-tests-image-hash && scripts/run-tests.sh` (first run — no marker exists yet, so `api` builds and the marker is created)
Expected: full successful run; `.run-tests-image-hash` now exists in the repo root with a 64-character hex string.

Run: `scripts/run-tests.sh` again immediately (no changes to `api/Dockerfile`/`package.json`/`package-lock.json` in between)
Expected: the `docker compose ... up -d api` step's output does NOT show a rebuild step for the `api` image (Docker's own output distinguishes "Built"/"Building" from a plain "Started"/"Running" for an already-existing, unchanged image) — full run still completes successfully.

- [ ] **Step 5: Verify the changed case still rebuilds**

Make a trivial, harmless change to `api/Dockerfile` (e.g. add a blank line at the end), then run `scripts/run-tests.sh`.
Expected: the `api` build step runs again (image rebuilt) despite the marker file existing from Step 4, because the computed hash now differs. Revert the trivial `api/Dockerfile` change afterward (`git checkout -- api/Dockerfile`) so it isn't accidentally committed.

- [ ] **Step 6: Commit**

```bash
git add scripts/run-tests.sh .gitignore
git commit -m "perf: make run-tests.sh's api image build conditional on a Dockerfile/dependency hash"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers the cwd guard, Task 2 covers pre-cleanup, Task 3 covers conditional `--build` (including dropping the always-no-op `--build` from `db`) and the `.gitignore` addition. All three spec sections have a corresponding task.
- **Placeholder scan:** no TBD/TODO; every step shows literal before/after code or literal commands to run.
- **Type/name consistency:** `IMAGE_HASH_FILE`, `CURRENT_HASH`, `API_BUILD_FLAG` are all introduced and used consistently within Task 3 only (no cross-task dependency on these names). `$COMPOSE`, `cleanup()`, `wait_healthy()` referenced in Tasks 2-3 are pre-existing script-level definitions (confirmed present in the current file during planning), not newly introduced by this plan.
