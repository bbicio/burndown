# Design — close out the last 3 backlog items

**Data:** 2026-08-12
**Brief:** `docs/superpowers/briefs/2026-08-12-final-three-backlog-items-brief.md`

## Scope

Three items from the historical backlog, confirmed with the user:

1. `scripts/test-branch.sh`'s `schema_exists()`: add an exit-status check to its second `psql` query, matching the existing pattern on the first.
2. Remove now-dead `_roleEditId`/`_programEditId` module variables from `js/roles.js`/`js/programs.js`.
3. `api/src/routes/timesheets.js`'s `resolveColumnMap()` greedy assignment: **investigated, no code change** — documented as an accepted limitation instead of implementing a full bipartite-optimal matching algorithm for an undemonstrated edge case.

## 1. `schema_exists()`'s second query exit-status check

Apply the identical `rc=$?`/warning/`return 1` pattern already used for the first query, inline (no shared helper — the function is short and this project's style favors linear inline code over abstraction for a two-call function):

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
  return 0
}
```

A transient failure on either query now produces the same "could not query schema state" warning, no longer confusable with a genuine partial-migration state on the second query specifically.

## 2. Dead variable removal

Delete `let _roleEditId = null;  // ID of the role being edited (null = new)` from `js/roles.js:6` and `let _programEditId = null;` from `js/programs.js:6`. Confirmed via repo-wide grep: each name's only occurrence is its own declaration. No other line in either file changes.

## 3. `resolveColumnMap()` greedy assignment — documented limitation, no code change

Investigation during brainstorming found a genuine (not purely theoretical) failure mode: if two headers tie exactly on specificity score for the same field, and one of the two headers has no other viable field match while the other does, the greedy assignment (sorted by score, first-come-first-served) can assign the field to the "flexible" header first, leaving the header with no alternative completely unmapped — even though a different assignment could have filled both. Reproducing this requires a specific real-world header-naming coincidence (e.g., a column literally named just "Name" with no other distinguishing candidates, alongside another ambiguous column that also matches "name" among other options) that has not been observed in the existing test suite or any reported issue across two prior investigation cycles (`2026-08-05-timesheet-column-mapping-specificity`, `2026-08-07-minor-backlog-cleanup`).

Confirmed with the user: a full optimal bipartite-matching algorithm (e.g., Hungarian algorithm) is disproportionate engineering for an edge case with no demonstrated real-world trigger. Instead, add a code comment directly above `resolveColumnMap()` documenting the exact failure scenario found, so a future developer who re-investigates this doesn't have to re-derive it from scratch:

```javascript
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
```

## Testing / verification

- Item 1: simulate a `psql` failure on the second query specifically (e.g., point at a nonexistent table mid-call, or interrupt connectivity between the two `docker exec` calls) and confirm the warning message, not the partial-migration message, is printed.
- Item 2: `npm test` (136/136) confirms no regression; repo-wide grep confirms both variable names are gone.
- Item 3: no test needed — comment-only change.

## Explicitly excluded (unchanged from brief)

- Any other historical backlog item (all confirmed closed).
- Changes to `test-branch.sh`'s `up`/`down`/`status` external contract.
