# Design — scripts/test-branch.sh + scripts/run-tests.sh hardening (Cycle 3)

**Data:** 2026-08-07
**Brief:** `docs/superpowers/briefs/2026-08-07-test-scripts-hardening-cycle3-brief.md`

## Scope

Four hardening fixes across `scripts/test-branch.sh` (2 items) and `scripts/run-tests.sh` (2 items), confirmed with the user. Two originally-candidate items (duplicate `docker ps` calls, `status()`'s override-file dependency) were verified already resolved as side effects of Cycles 1-2 and are not part of this cycle.

1. `test-branch.sh`'s `pg_dump` snapshot: create with restrictive permissions via `mktemp`, delete immediately after use.
2. `test-branch.sh`'s four fixed ports: make configurable via optional `.env` variables, same defaults.
3. `run-tests.sh`: add an `mkdir`-based concurrency lock so two simultaneous invocations can't tear each other down via the pre-cleanup added in Cycle 2.
4. `run-tests.sh`: extract the duplicated `$COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true` into a single shared `compose_down()` function.

## 1. `/tmp` dump security fix (`test-branch.sh`)

Replace the fixed `/tmp/pdash_branch_snapshot.dump` path with `mktemp` (creates a file with 0600 permissions by default on all POSIX systems — no world-readable window at any point) and explicitly remove it once `pg_restore` completes:

```bash
DUMP_FILE=$(mktemp)
docker exec "$MAIN_DB_CONTAINER" pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$DUMP_FILE"
docker exec -i "$DB_CONTAINER" pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists < "$DUMP_FILE"
rm -f "$DUMP_FILE"
echo "Data cloned from main."
```

No new dependency — `mktemp` is already assumed available (same toolchain as the rest of the script).

## 2. Configurable ports (`test-branch.sh`)

Replace the four fixed assignments with parameter-expansion defaults, reading from optional `.env` variables (already loaded by the existing `load_env()` before this point in the script):

```bash
FRONTEND_PORT="${TEST_BRANCH_FRONTEND_PORT:-8081}"
API_PORT="${TEST_BRANCH_API_PORT:-3001}"
DB_PORT="${TEST_BRANCH_DB_PORT:-5433}"
ADMINER_PORT="${TEST_BRANCH_ADMINER_PORT:-8082}"
```

No behavior change when `.env` doesn't set these — same defaults as today. Nothing else in the script (`write_override()`, `open_browser()`, the final "Stack up" message) needs to change — they already reference `$FRONTEND_PORT`/etc. as variables, not literals.

## 3. Concurrency lock (`run-tests.sh`)

An `mkdir`-based lock (atomic on POSIX filesystems, no new dependency), acquired immediately after the existing cwd guard, before `load_env()` or any Docker interaction:

```bash
LOCK_DIR=".run-tests.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "Another run-tests.sh is already in progress (lock: $LOCK_DIR). Wait for it to finish." >&2
  exit 1
fi
```

Released in the existing `cleanup()` (same `trap ... EXIT` — no new trap):

```bash
cleanup() {
  compose_down
  rm -f "$OVERRIDE_FILE"
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
```

## 4. Shared cleanup helper (`run-tests.sh`)

Extract the duplicated command into one function, defined once, called from both places that need it:

```bash
compose_down() {
  $COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true
}
```

`cleanup()`'s body becomes `compose_down` (see above); the pre-cleanup call (Cycle 2, currently `$COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true` inline) becomes `compose_down` too. `compose_down` must be defined before both `trap cleanup EXIT` and the pre-cleanup call site — i.e., near the top of the script alongside `write_override`/`wait_healthy`.

## Testing / verification

No automated test exists for these scripts. Verification is manual, exercised during implementation:

- **`/tmp` dump**: run `test-branch.sh up` with the main stack running (clone-data path); confirm the dump file no longer exists in `/tmp` after the run completes, and (if capturable mid-run) that it was created with `600`-equivalent permissions.
- **Configurable ports**: set e.g. `TEST_BRANCH_FRONTEND_PORT=9091` in `.env`, run `up`, confirm nginx responds on `9091` not `8081`. Then unset it, run again, confirm the default `8081` still works (no regression).
- **Concurrency lock**: start `run-tests.sh` in the background, then start a second invocation while the first is still running — the second must exit immediately with the lock message, without touching the first's Docker stack, which must continue and complete normally.
- **Shared cleanup helper**: `grep -c` for the literal `$COMPOSE down -v --remove-orphans` string in the file after the change — must be exactly 1 (inside `compose_down()`), not 2.
- **No regression**: a single, complete, uninterrupted run of each script (`test-branch.sh up`/`down`, `run-tests.sh`) still behaves as today with no custom `.env` port overrides and no concurrent second invocation.

## Explicitly excluded (unchanged from brief)

- The two items verified already resolved (duplicate `docker ps`, `status()`'s override-file dependency) — closed, not reopened.
- No change to the test-admin bootstrap credential (`test-branch@pdash.local` / `TestBranch123!`) — confirmed unchanged, a known/accepted throwaway credential for an ephemeral local DB.
- No port/configuration changes to `run-tests.sh` — it exposes no host ports at all (`ports: !override []`), not affected by item 2.
- No external locking tool or cross-script shared library — `compose_down()` is local to `run-tests.sh` only; `load_env()` stays duplicated across both scripts per existing precedent.
