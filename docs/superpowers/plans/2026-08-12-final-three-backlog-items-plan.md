# Close Out the Last 3 Backlog Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three remaining minor backlog items: add an exit-status check to `schema_exists()`'s second `psql` query, remove two now-dead module variables, and document (without fixing) `resolveColumnMap()`'s greedy-assignment limitation.

**Architecture:** Three independent tasks, each touching a different file with zero interaction between them.

**Tech Stack:** Bash (`scripts/test-branch.sh`), vanilla JS (`js/roles.js`/`js/programs.js`), Node.js (`api/src/routes/timesheets.js`).

## Global Constraints

- No new external dependencies.
- No regression on any already-working case.
- `schema_exists()`'s external contract (called only as `if schema_exists; then` from `up()`) is unchanged — only its internal error handling on the second query.
- Item 3 is comment-only — no logic change to `resolveColumnMap()`/`matchSpecificity()`.

---

### Task 1: `schema_exists()`'s second query exit-status check

**Files:**
- Modify: `scripts/test-branch.sh:117-118` (the `last_migration_exists` query, inside `schema_exists()`)

**Interfaces:** None — single-file, independent of Tasks 2-3.

- [ ] **Step 1: Add the exit-status check to the second query**

Replace lines 117-124:

```bash
  last_migration_exists=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT column_name FROM information_schema.columns WHERE table_name='cg_version_projects' AND column_name='task_names_direct';")
  if [ -z "$last_migration_exists" ]; then
    echo "Schema appears partially migrated (interrupted run?). Run:" >&2
    echo "  scripts/test-branch.sh down && scripts/test-branch.sh up" >&2
    echo "to rebuild from a clean database." >&2
    exit 1
  fi
```

with:

```bash
  last_migration_exists=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT column_name FROM information_schema.columns WHERE table_name='cg_version_projects' AND column_name='task_names_direct';")
  rc=$?
  if [ $rc -ne 0 ]; then
    echo "Warning: could not query schema state (psql exit $rc) — treating as absent." >&2
    return 1
  fi
  if [ -z "$last_migration_exists" ]; then
    echo "Schema appears partially migrated (interrupted run?). Run:" >&2
    echo "  scripts/test-branch.sh down && scripts/test-branch.sh up" >&2
    echo "to rebuild from a clean database." >&2
    exit 1
  fi
```

`rc` is already declared `local` at the top of `schema_exists()` (`scripts/test-branch.sh:107`, `local users_exist last_migration_exists rc`) and reused here — no new `local` declaration needed.

- [ ] **Step 2: Verify a normal run still works**

Run: `scripts/test-branch.sh up` then `scripts/test-branch.sh down`
Expected: identical behavior to before (fresh-DB path applies all migrations on first run; the two `psql` queries succeed normally).

- [ ] **Step 3: Simulate a failure on the second query specifically**

With the branch stack up and healthy (from Step 2, re-run `up` if torn down), simulate the second query failing by targeting a container that can't run the query (e.g., stop the DB container briefly between the two queries is hard to time manually — instead, directly test the function in isolation):

```bash
BRANCH=$(git branch --show-current)
SANITIZED=$(echo "$BRANCH" | tr '/ ' '__')
DB_CONTAINER="pdash-db-${SANITIZED}"
DB_USER=pdash
DB_NAME=pdash

# Simulate: first query succeeds (schema exists), second query targets a
# nonexistent container to force a psql/docker exec failure.
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT to_regclass('public.users') IS NOT NULL;"
docker exec "pdash-db-nonexistent-container-xyz" psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT 1;" 2>&1; echo "exit code: $?"
```

Expected: the second command fails with a nonzero exit code (container not found) — this confirms the exact failure mode the new `rc=$?` check on the second query is designed to catch (a `docker exec`/`psql` failure produces a nonzero exit, which the function must now warn about rather than silently treat as "partially migrated").

- [ ] **Step 4: Tear down**

```bash
scripts/test-branch.sh down
```

- [ ] **Step 5: Commit**

```bash
git add scripts/test-branch.sh
git commit -m "fix: check psql's exit status on schema_exists()'s second query too"
```

---

### Task 2: Remove dead `_roleEditId`/`_programEditId` variables

**Files:**
- Modify: `js/roles.js:6`
- Modify: `js/programs.js:6`

**Interfaces:** None — independent of Tasks 1 and 3.

- [ ] **Step 1: Confirm both variables are genuinely dead**

Run:
```bash
grep -rn "_roleEditId\|_programEditId" --include="*.html" --include="*.js" .
```
Expected: exactly two matches, each variable's own declaration line (`js/roles.js:6`, `js/programs.js:6`) — no other occurrence anywhere. If anything else matches, STOP and report BLOCKED rather than proceeding.

- [ ] **Step 2: Delete the line in `js/roles.js`**

Replace:

```javascript
let roles = [];          // in-memory array, loaded by loadRolesFromApi()
let _roleEditId = null;  // ID of the role being edited (null = new)
```

with:

```javascript
let roles = [];          // in-memory array, loaded by loadRolesFromApi()
```

- [ ] **Step 3: Delete the line in `js/programs.js`**

Replace:

```javascript
let _programs = [];
let _programEditId = null;
```

with:

```javascript
let _programs = [];
```

- [ ] **Step 4: Verify no regression**

Run: `npm test`
Expected: 136/136 tests pass (neither file is under test, but this confirms no accidental syntax error or unrelated breakage).

- [ ] **Step 5: Commit**

```bash
git add js/roles.js js/programs.js
git commit -m "chore: remove dead _roleEditId/_programEditId module variables"
```

---

### Task 3: Document `resolveColumnMap()`'s greedy-assignment limitation

**Files:**
- Modify: `api/src/routes/timesheets.js:234` (insert a comment block immediately before the `function resolveColumnMap(headers) {` line)

**Interfaces:** None — comment-only, independent of Tasks 1-2.

- [ ] **Step 1: Insert the documentation comment**

Find (the blank line and function declaration right after `matchSpecificity()`'s closing brace):

```javascript
  return null;
}

function resolveColumnMap(headers) {
```

Replace with:

```javascript
  return null;
}

// Known, accepted limitation (documented 2026-08-12, not fixed): the assignment below is
// greedy (highest-specificity match wins first), not a globally-optimal bipartite matching.
// If two headers tie exactly on score for the same field, and one of them has no other
// viable field match while the other does, greedy can assign the field to the "flexible"
// header first, leaving the header with no alternative unmapped — even though a different
// assignment could have filled both. Reproducing this requires a specific real-world header
// naming coincidence not observed across two prior investigation cycles (see
// docs/superpowers/specs/2026-08-05-timesheet-column-mapping-specificity-design.md and
// docs/superpowers/specs/2026-08-12-final-three-backlog-items-design.md). A full optimal
// matching algorithm (e.g. Hungarian algorithm) was confirmed disproportionate for this
// undemonstrated edge case — not implemented.
function resolveColumnMap(headers) {
```

- [ ] **Step 2: Verify no behavior change**

Run: `cd api && node --test src/routes/timesheets.test.js`
Expected: all 24 tests still pass — this is a comment-only change, no logic touched.

- [ ] **Step 3: Commit**

```bash
git add api/src/routes/timesheets.js
git commit -m "docs: document resolveColumnMap()'s greedy-assignment limitation as accepted, not fixed"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers item 1 (second query exit-status check), Task 2 covers item 2 (dead variables), Task 3 covers item 3 (documented limitation, no code change). All three spec sections have a corresponding task.
- **Placeholder scan:** no TBD/TODO; every step shows literal before/after code or literal commands.
- **Type/name consistency:** Task 1's `rc` variable reuses the same `local rc` already declared at `schema_exists()`'s top (confirmed present in the current file during planning) — no redeclaration needed, matching the existing function's structure exactly.
