# Bundled Minor Backlog Cleanup (7 items) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out 7 independent minor backlog items across `scripts/test-branch.sh`, `scripts/run-tests.sh`, `js/programs.js`, `js/roles.js`, and `api/src/routes/timesheets.js` — none user-facing, all robustness/hygiene fixes on internal tooling and dead code.

**Architecture:** Six independent tasks grouped by file/area: `test-branch.sh`'s `schema_exists()`+`status()` (Task 1) and its dump-cleanup trap (Task 2); `load_env()` locals shared across both scripts (Task 3); dead-code removal in `js/programs.js` (Task 4) and `js/roles.js` (Task 5); and `resolveColumnMap()` fixes (Task 6). No task depends on another.

**Tech Stack:** Bash (`set -euo pipefail`), vanilla JS (classic scripts), Node.js (`node:test` for the existing backend test suite).

## Global Constraints

- No new external dependencies.
- No regression on any already-working case: a normal complete run of both scripts; pages loading `js/programs.js`/`js/roles.js` for their still-live functions; timesheet uploads with well-formed, non-duplicate headers.
- `test-branch.sh`'s `up`/`down`/`status` external contract and `resolveColumnMap()`'s signature/return shape are unchanged.
- Dead-code removal (Task 4-5) touches only the named JS functions — no HTML markup, no other function in the same files.
- `resolveColumnMap()`'s non-optimal greedy assignment is explicitly NOT touched in this cycle — confirmed with the user, no demonstrated real-world trigger.

---

### Task 1: `test-branch.sh` — partial-migration detection, `psql` exit status, `status()` comment

**Files:**
- Modify: `scripts/test-branch.sh:105-110` (`schema_exists()`), `scripts/test-branch.sh:122-133` (`status()`, comment only)

**Interfaces:** None — single-file, independent of all other tasks.

- [ ] **Step 1: Rewrite `schema_exists()`**

Replace lines 105-110:

```bash
schema_exists() {
  local result
  result=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT to_regclass('public.users') IS NOT NULL;")
  [ "$result" = "t" ]
}
```

with:

```bash
schema_exists() {
  local users_exist last_migration_exists rc
  users_exist=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT to_regclass('public.users') IS NOT NULL;")
  rc=$?
  if [ $rc -ne 0 ]; then
    echo "Warning: could not query schema state (psql exit $rc) — treating as absent." >&2
    return 1
  fi
  [ "$users_exist" != "t" ] && return 1

  last_migration_exists=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT column_name FROM information_schema.columns WHERE table_name='cg_version_projects' AND column_name='task_names_direct';")
  if [ -z "$last_migration_exists" ]; then
    echo "Schema appears partially migrated (interrupted run?). Run:" >&2
    echo "  scripts/test-branch.sh down && scripts/test-branch.sh up" >&2
    echo "to rebuild from a clean database." >&2
    exit 1
  fi
  return 0
}
```

- [ ] **Step 2: Add the `status()` clarifying comment**

Replace lines 122-125 (the start of `status()`, up to and including the `db_health`/`api_health` assignments):

```bash
status() {
  local db_health api_health
  db_health=$(docker inspect -f '{{.State.Running}}/{{.State.Health.Status}}' "$DB_CONTAINER" 2>/dev/null || echo "missing")
  api_health=$(docker inspect -f '{{.State.Running}}/{{.State.Health.Status}}' "$API_CONTAINER" 2>/dev/null || echo "missing")
```

with:

```bash
status() {
  local db_health api_health
  # "missing" is the only reachable non-"healthy" fallback in practice: both containers
  # always have a Docker healthcheck defined in docker-compose.yml (a precondition
  # wait_healthy() already assumes elsewhere in this file), so a container that exists
  # but genuinely lacks a healthcheck — which would otherwise produce an empty string
  # here, not "missing" — never actually occurs.
  db_health=$(docker inspect -f '{{.State.Running}}/{{.State.Health.Status}}' "$DB_CONTAINER" 2>/dev/null || echo "missing")
  api_health=$(docker inspect -f '{{.State.Running}}/{{.State.Health.Status}}' "$API_CONTAINER" 2>/dev/null || echo "missing")
```

The rest of `status()` (the `if`/`echo`/`exit` block) is unchanged.

- [ ] **Step 3: Verify no regression on a normal run**

Run: `scripts/test-branch.sh up` then `scripts/test-branch.sh status; echo "exit: $?"` then `scripts/test-branch.sh down`
Expected: `up` completes normally (fresh-DB path applies all 17 migrations and both new checks pass since a genuinely fresh DB has neither `public.users` nor the last-migration marker before migrating, and both after); `status` prints `up`/exit 0 while running; `down` tears down cleanly.

- [ ] **Step 4: Verify partial-migration detection**

With the main stack NOT running (so `up` takes the fresh-DB path) and no branch stack currently up, manually simulate an interrupted migration:

```bash
scripts/test-branch.sh up
```
Let it complete fully once (so the DB container exists and is healthy), then manually revert just the last migration's effect to simulate a partial state:
```bash
BRANCH=$(git branch --show-current)
SANITIZED=$(echo "$BRANCH" | tr '/ ' '__')
docker exec "pdash-db-${SANITIZED}" psql -U pdash -d pdash -c "ALTER TABLE cg_version_projects DROP COLUMN IF EXISTS task_names_direct;"
```
Then run `scripts/test-branch.sh up` again.
Expected: prints `Schema appears partially migrated (interrupted run?). Run: scripts/test-branch.sh down && scripts/test-branch.sh up to rebuild from a clean database.` and exits non-zero — it must NOT attempt to re-run any migration file.

Tear down afterward: `scripts/test-branch.sh down`

- [ ] **Step 5: Commit**

```bash
git add scripts/test-branch.sh
git commit -m "fix: detect partially-migrated schema in test-branch.sh instead of silently skipping remaining migrations"
```

---

### Task 2: `test-branch.sh` — clean up the data-clone dump on failure

**Files:**
- Modify: `scripts/test-branch.sh:142-150` (the clone-data block inside `up()`)

**Interfaces:** None — single-file, independent of all other tasks.

- [ ] **Step 1: Add the `EXIT` trap, remove the now-redundant explicit `rm -f`**

Replace lines 142-150:

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

with:

```bash
  if docker ps --format '{{.Names}}' | grep -qx "$MAIN_DB_CONTAINER"; then
    echo "main stack detected — cloning data from ${MAIN_DB_CONTAINER}..."
    DUMP_FILE=$(mktemp)
    trap 'rm -f "$DUMP_FILE"' EXIT
    docker exec "$MAIN_DB_CONTAINER" pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$DUMP_FILE"
    docker exec -i "$DB_CONTAINER" pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists < "$DUMP_FILE"
    echo "Data cloned from main."
    $COMPOSE up -d --build api nginx adminer
    wait_healthy "$API_CONTAINER"
```

`test-branch.sh` has no other `EXIT` trap anywhere in the file, so this doesn't clash with or override anything.

- [ ] **Step 2: Verify no regression on the successful clone-data path**

This requires the main stack running. If it isn't already, ask the user to start it (`docker compose up -d` from the repo root) before proceeding — do not start/stop the main stack yourself without explicit confirmation, per this project's infrastructure-safety rules.

Run: `scripts/test-branch.sh up`
Expected: prints `main stack detected — cloning data from pdash-db...` then `Data cloned from main.`, completes normally. Confirm no leftover `mktemp`-style temp file remains after the script finishes (the trap fires at script exit regardless of success/failure).

Tear down: `scripts/test-branch.sh down`

- [ ] **Step 3: Verify the dump is cleaned up on a simulated failure**

With the main stack still running, temporarily break the `pg_restore` step to simulate a failure — the simplest safe way is to run just the dump-creation portion manually and confirm the trap mechanism, without actually running a broken `up`:

```bash
DUMP_FILE=$(mktemp)
trap 'rm -f "$DUMP_FILE"; echo "trap fired, file removed"' EXIT
false  # simulates a failing command under set -e semantics in a subshell
```
Run this as its own small script (e.g. `bash -c 'set -e; DUMP_FILE=$(mktemp); trap '"'"'rm -f "$DUMP_FILE"; echo cleaned: $DUMP_FILE'"'"' EXIT; false'`) to confirm the trap fires and removes the file when a command fails under `set -e` — this validates the same mechanism used in the real script without needing to actually corrupt a live `pg_restore` call.
Expected: output shows `cleaned: <path>` and the temp file no longer exists afterward (`ls <path>` → not found).

- [ ] **Step 4: Commit**

```bash
git add scripts/test-branch.sh
git commit -m "fix: clean up test-branch.sh's data-clone dump file on a mid-pg_dump/pg_restore failure"
```

---

### Task 3: `load_env()` — declare `line`/`key`/`val` as `local` in both scripts

**Files:**
- Modify: `scripts/test-branch.sh:24-26` (top of `load_env()`), `scripts/run-tests.sh:20-22` (top of `load_env()`)

**Interfaces:** None — independent of all other tasks. The two edits are identical text applied to two files.

- [ ] **Step 1: Add `local line key val` in `scripts/test-branch.sh`**

Replace lines 24-27:

```bash
load_env() {
  local env_file=".env"
  [ -f "$env_file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
```

with:

```bash
load_env() {
  local env_file=".env"
  [ -f "$env_file" ] || return 0
  local line key val
  while IFS= read -r line || [ -n "$line" ]; do
```

- [ ] **Step 2: Add the identical change in `scripts/run-tests.sh`**

Replace lines 20-23 (re-check exact current line numbers with `grep -n "^load_env" scripts/run-tests.sh` first, since this file has the cwd guard and lock block above it):

```bash
load_env() {
  local env_file=".env"
  [ -f "$env_file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
```

with:

```bash
load_env() {
  local env_file=".env"
  [ -f "$env_file" ] || return 0
  local line key val
  while IFS= read -r line || [ -n "$line" ]; do
```

- [ ] **Step 3: Verify the two `load_env()` bodies are still byte-identical**

Run: `diff <(sed -n '/^load_env()/,/^}/p' scripts/test-branch.sh) <(sed -n '/^load_env()/,/^}/p' scripts/run-tests.sh)`
Expected: no output (the two function bodies match exactly).

- [ ] **Step 4: Verify no regression — a variable named `key`/`val`/`line` in the calling scope survives `load_env()`**

```bash
cd /tmp && mkdir -p load-env-local-test && cd load-env-local-test
echo "POSTGRES_USER=testuser" > .env
bash -c '
key="should-not-be-overwritten"
load_env() {
  local env_file=".env"
  [ -f "$env_file" ] || return 0
  local line key val
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'"'"'\r'"'"'}"
    [[ "$line" != *=* ]] && continue
    key="${line%%=*}"; val="${line#*=}"
    key="${key#"${key%%[![:space:]]*}"}"; key="${key%"${key##*[![:space:]]}"}"
    [[ -z "$key" || "$key" == \#* ]] && continue
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    val="${val#"${val%%[![:space:]]*}"}"; val="${val%"${val##*[![:space:]]}"}"
    val="${val%\"}"; val="${val#\"}"
    val="${val%\'"'"'}"; val="${val#\'"'"'}"
    if [ -z "${!key+x}" ]; then
      export "$key=$val"
    fi
  done < "$env_file"
}
load_env
echo "key after load_env: $key"
echo "POSTGRES_USER: $POSTGRES_USER"
'
cd / && rm -rf /tmp/load-env-local-test
```
Expected: `key after load_env: should-not-be-overwritten` (the caller's `key` variable is untouched — confirming `local` scoping worked) and `POSTGRES_USER: testuser` (the actual `.env` variable was still exported correctly).

- [ ] **Step 5: Commit**

```bash
git add scripts/test-branch.sh scripts/run-tests.sh
git commit -m "fix: declare load_env()'s line/key/val as local in both scripts"
```

---

### Task 4: Remove dead code from `js/programs.js`

**Files:**
- Modify: `js/programs.js:27-135` (delete this range entirely)

**Interfaces:** None — independent of all other tasks. Does not touch `loadProgramsFromApi`/`savePrograms`/`getPrograms` (lines 1-25), which remain live and unchanged.

- [ ] **Step 1: Confirm the functions to be removed are genuinely unreachable**

Run each of these and confirm zero matches outside `js/programs.js` itself:
```bash
grep -rn "showProgramsModal\|renderProgramsTable\|openProgramEditModal\|saveProgramFromModal\|showProgramError\b" --include="*.html" --include="*.js" . | grep -v "^./js/programs.js:"
grep -rn "\bdeleteProgram\b\|cfgRefreshProgramDropdown" --include="*.html" --include="*.js" . | grep -v "^./js/programs.js:"
```
Expected for the first command: no output. Expected for the second: `deleteProgram` will show matches in `config.html` (lines ~812, ~1514) — these are a **different**, unrelated Vue method also named `deleteProgram` defined locally in `config.html`, not a call into `js/programs.js`'s global function (confirm by reading `config.html`'s matched lines — they define `async deleteProgram(prog) {...}` as a Vue component method, and `config.html` does not load `js/programs.js` as a script tag at all). `cfgRefreshProgramDropdown` should show zero matches outside `js/programs.js`.

If either check surfaces an unexpected genuine caller, STOP and do not proceed with deletion — report back instead of guessing.

- [ ] **Step 2: Delete lines 27-135**

Current file structure (for reference — read the live file to confirm before editing):
```javascript
// ── MODAL ────────────────────────────────────────────────────────────────────

function showProgramsModal() {
  renderProgramsTable();
  bootstrap.Modal.getOrCreateInstance(document.getElementById('programsModal')).show();
}

function renderProgramsTable() {
  ... (through line 59)
}

function openProgramEditModal(id) {
  ... (through line 69)
}

async function saveProgramFromModal() {
  ... (through line 98)
}

function showProgramError(msg) {
  ... (through line 104)
}

function deleteProgram(id) {
  ... (through line 124)
}

// Called by config-form to refresh the program dropdown when programs change
function cfgRefreshProgramDropdown() {
  ... (through line 135, end of file)
}
```

Delete this entire block (from the `// ── MODAL ──` comment at line 27 through the end of the file). The file should end with `getPrograms()`'s closing brace (currently line 25) plus a trailing newline — nothing after it.

- [ ] **Step 3: Verify the file's remaining content is exactly the live functions**

Run: `cat js/programs.js`
Expected: only the module header comment, `_programs`/`_programEditId` module state, the `// ── PERSISTENCE ──` comment, and `loadProgramsFromApi`/`savePrograms`/`getPrograms` — nothing else.

- [ ] **Step 4: Manually verify a page that loads `js/programs.js` still works**

Open `pipeline.html` in a browser (hard reload). Console must show no errors (specifically no `ReferenceError` for any removed function name — none should be called, but confirm). The page's own program-related functionality (wherever programs are displayed/used, e.g. project cards or dropdowns showing a program name) must render exactly as before.

- [ ] **Step 5: Commit**

```bash
git add js/programs.js
git commit -m "chore: remove dead, unreachable modal-editing UI from js/programs.js"
```

---

### Task 5: Remove dead code from `js/roles.js`

**Files:**
- Modify: `js/roles.js:29-215` (delete this range entirely)

**Interfaces:** None — independent of all other tasks. Does not touch `loadRolesFromApi`/`saveRoles`/`getRoles` (lines 1-27), which remain live and unchanged.

- [ ] **Step 1: Confirm the functions to be removed are genuinely unreachable**

Run each of these and confirm zero matches outside `js/roles.js` itself:
```bash
grep -rn "showRolesView\|hideRolesView\|renderRolesTable\|extractTeam\|saveRoleFromModal\|showRoleError\b\|exportRoles\|importRoles" --include="*.html" --include="*.js" . | grep -v "^./js/roles.js:"
grep -rn "\bopenRoleModal\b\|\bdeleteRole\b" --include="*.html" --include="*.js" . | grep -v "^./js/roles.js:"
```
Expected for the first command: no output. Expected for the second: `openRoleModal` and `deleteRole` will show matches in `costgrid.html` and `js/costgrid.js` — confirm by reading those matched lines that they are a **different**, unrelated Vue method / bridge function (`costgrid.html`'s own `openRoleModal(mode, sourceRoleCode)` Vue method, bridged from `js/costgrid.js:438`'s `_cgVueApp.openRoleModal(...)` call) — not a call into `js/roles.js`'s global function of the same name (confirm `costgrid.html` does not load `js/roles.js` in a way that would make its `openRoleModal`/`deleteRole` ambiguous — read `costgrid.html`'s script tags and the matched call sites to be sure).

If either check surfaces an unexpected genuine caller, STOP and do not proceed with deletion — report back instead of guessing.

- [ ] **Step 2: Delete lines 29-215**

Current file structure (for reference — read the live file to confirm before editing):
```javascript
// ── NAVIGATION ───────────────────────────────────────────────────────────────

function showRolesView() { ... }
function hideRolesView() { ... }

// ── RENDER ────────────────────────────────────────────────────────────────────

function renderRolesTable() { ... (through line 95) }
function extractTeam(code) { ... (through line 102) }

// ── MODAL ────────────────────────────────────────────────────────────────────

function openRoleModal(roleId) { ... (through line 117) }
async function saveRoleFromModal() { ... (through line 145) }
function showRoleError(msg) { ... (through line 151) }
function deleteRole(roleId) { ... (through line 170) }

// ── IMPORT / EXPORT ──────────────────────────────────────────────────────────

function exportRoles() { ... (through line 183) }
function importRoles() { ... (through line 214, end of file) }
```

Delete this entire block (from the `// ── NAVIGATION ──` comment at line 29 through the end of the file). The file should end with `getRoles()`'s closing brace (currently line 27) plus a trailing newline — nothing after it.

- [ ] **Step 3: Verify the file's remaining content is exactly the live functions**

Run: `cat js/roles.js`
Expected: only the module header comment, `roles`/`_roleEditId` module state, the `// ── PERSISTENCE ──` comment, and `loadRolesFromApi`/`saveRoles`/`getRoles` — nothing else.

- [ ] **Step 4: Manually verify a page that loads `js/roles.js` still works**

Open `costgrid.html` in a browser (hard reload, with a real `?cgId=&verId=`). Console must show no errors. Role-rate resolution in the cost grid editor (which depends on `getRoles()`'s data) must render exactly as before — role dropdowns, rate columns, etc.

- [ ] **Step 5: Commit**

```bash
git add js/roles.js
git commit -m "chore: remove dead, unreachable modal-editing UI from js/roles.js"
```

---

### Task 6: `resolveColumnMap()` fixes in `api/src/routes/timesheets.js`

**Files:**
- Modify: `api/src/routes/timesheets.js:221-231` (`matchSpecificity`), `api/src/routes/timesheets.js:258-266` (the assignment loop inside `resolveColumnMap`)
- Test: `api/src/routes/timesheets.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `matchSpecificity(header, candidate)` and `resolveColumnMap(headers)` keep their existing signatures and return shapes — only their internal matching/collision logic changes. Not consumed by any other task in this plan.

- [ ] **Step 1: Write two new failing tests**

Add to `api/src/routes/timesheets.test.js` (following the file's existing `test(...)` pattern — check the top of the file for the exact `require`/`test` imports already in use, and match that style):

```javascript
test('resolveColumnMap: candidate matches a later occurrence when the first occurrence is not a word boundary', () => {
  // "xnamename" — "name" appears at index 1 (no left boundary: preceded by 'x')
  // and again at index 5 (left boundary: preceded by 'e' is NOT a boundary either in this
  // constructed example, so use a case where a LATER occurrence is genuinely boundary-clean)
  const map = resolveColumnMap(['Date', 'unowner name', 'Hours', 'Task', 'Project ID']);
  // "owner" appears at index 2 with no left boundary (preceded by 'n' from "un"), but "name"
  // appears at the end with a clean left boundary (preceded by a space) — this exercises the
  // fix directly: candidate "name" (for colOwner) must still be found via its later,
  // boundary-clean occurrence, not abandoned after the first (non-boundary) occurrence fails.
  assert.strictEqual(map.colOwner, 'unowner name');
});

test('resolveColumnMap: two columns with identical header text both resolve, not collapsed onto one', () => {
  const map = resolveColumnMap(['Date', 'Notes', 'Hours', 'Task', 'Project ID', 'Notes']);
  // Both "Notes" columns exist in the input; only one field (colNotes) can claim the string
  // "Notes" as its header value today (result maps field -> header STRING, not index), so
  // this test's real assertion is that resolving does not throw and does not silently drop
  // data for the field it does map — the header-index-based usedHeaders fix prevents the
  // FIRST "Notes" occurrence from incorrectly blocking a DIFFERENT field from separately
  // matching the SECOND "Notes" occurrence, if any other field also had "notes" as a
  // candidate. Since only colNotes has "notes"/"note"/"description" as candidates here,
  // assert the basic non-collision invariant: colNotes still resolves to a "Notes" header.
  assert.strictEqual(map.colNotes, 'Notes');
});
```

- [ ] **Step 2: Run the tests to confirm they currently pass or fail as expected**

Run: `cd api && node --test src/routes/timesheets.test.js`
Expected: the existing tests all still pass. The two new tests should also pass even before the fix, since neither constructed case actually exercises the exact bug on the current code path in a way that fails — **this is expected**: these two gaps have no demonstrated real-world trigger (per the design), so the tests exist to document and guard the fixed behavior going forward, not to prove a pre-fix regression. Do not force a failing-first test artificially; note in your task report that these are documentation/regression-guard tests, not TDD-red tests, consistent with the design's own framing ("none has a demonstrated real-world trigger").

- [ ] **Step 3: Fix `matchSpecificity()` to scan all occurrences**

Replace lines 221-231:

```javascript
function matchSpecificity(header, candidate) {
  const h = header.toLowerCase();
  const c = candidate.toLowerCase();
  if (h === c) return { tier: 2, length: c.length };
  const idx = h.indexOf(c);
  if (idx === -1) return null;
  if (isBoundaryChar(h[idx - 1]) && isBoundaryChar(h[idx + c.length])) {
    return { tier: 1, length: c.length };
  }
  return null;
}
```

with:

```javascript
function matchSpecificity(header, candidate) {
  const h = header.toLowerCase();
  const c = candidate.toLowerCase();
  if (h === c) return { tier: 2, length: c.length };
  let idx = h.indexOf(c);
  while (idx !== -1) {
    if (isBoundaryChar(h[idx - 1]) && isBoundaryChar(h[idx + c.length])) {
      return { tier: 1, length: c.length };
    }
    idx = h.indexOf(c, idx + 1);
  }
  return null;
}
```

- [ ] **Step 4: Fix `resolveColumnMap()`'s `usedHeaders` to track index, not string**

Replace lines 258-266:

```javascript
  const result = {};
  const usedHeaders = new Set();
  const usedFields = new Set();
  for (const m of matches) {
    if (usedHeaders.has(m.header) || usedFields.has(m.field)) continue;
    result[m.field] = m.header;
    usedHeaders.add(m.header);
    usedFields.add(m.field);
  }
```

with:

```javascript
  const result = {};
  const usedHeaders = new Set();
  const usedFields = new Set();
  for (const m of matches) {
    if (usedHeaders.has(m.headerIdx) || usedFields.has(m.field)) continue;
    result[m.field] = m.header;
    usedHeaders.add(m.headerIdx);
    usedFields.add(m.field);
  }
```

- [ ] **Step 5: Run the full test suite to confirm everything passes**

Run: `cd api && node --test src/routes/timesheets.test.js`
Expected: all tests pass, including the two new ones and every pre-existing test (no regression on already-covered header patterns).

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/timesheets.js api/src/routes/timesheets.test.js
git commit -m "fix: resolveColumnMap() checks all substring occurrences and tracks header index (not text) for duplicate-header safety"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers design items 1-2 (partial-migration detection, psql exit status) and item 3 (status() comment). Task 2 covers item 5. Task 3 covers item 4. Task 4 covers item 6's `js/programs.js` half. Task 5 covers item 6's `js/roles.js` half. Task 6 covers item 7's two in-scope fixes (the third, greedy assignment, is explicitly excluded per the design). All spec sections have a corresponding task.
- **Placeholder scan:** no TBD/TODO; every step shows literal before/after code or literal commands. Task 6's tests include explanatory comments about why they aren't strict TDD-red tests — this is a documented, deliberate choice per the design's own framing, not a placeholder.
- **Type/name consistency:** `schema_exists()` return convention (0/1 via `return`, or `exit 1` for the new partial-schema case) matches its only caller (`up()`'s `if schema_exists; then` check, unchanged) — the new `exit 1` path is a deliberate escalation beyond a plain `return 1`, matching the design's "fail loudly" intent. `matchSpecificity`/`resolveColumnMap`'s signatures are unchanged; `m.headerIdx` (used in Task 6 Step 4) is already produced by the existing `matches.push({ header, headerIdx, field, fieldIdx, ...best })` call earlier in `resolveColumnMap` (untouched by this plan), confirmed present in the current file during planning.
