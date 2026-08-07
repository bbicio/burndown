# Design — bundled minor backlog cleanup (7 items)

**Data:** 2026-08-07
**Brief:** `docs/superpowers/briefs/2026-08-07-minor-backlog-cleanup-brief.md`

## Scope

Seven independent minor hardening/hygiene fixes across four files, confirmed with the user as one cycle (none has user-facing impact — see the pre-brief severity discussion):

1-2. `scripts/test-branch.sh`'s `schema_exists()`: detect a partially-migrated schema and fail loudly instead of silently skipping remaining migrations; explicitly check `psql`'s own exit status.
3. `scripts/test-branch.sh`'s `status()`: comment-only clarification (no code change — the `"missing"` fallback is genuinely the only reachable value given both containers always have healthchecks).
4. `load_env()` in both scripts: declare `line`/`key`/`val` as `local`.
5. `scripts/test-branch.sh`'s main-stack data-clone dump: `trap ... EXIT` cleanup so a mid-`pg_dump`/`pg_restore` failure doesn't leak the temp file.
6. Remove dead modal-editing code from `js/programs.js`/`js/roles.js` (live functions in the same files untouched).
7. `api/src/routes/timesheets.js`'s `resolveColumnMap()`: fix two of three identified gaps (first-occurrence-only substring match, duplicate-header-string collision); the third (non-optimal greedy assignment) stays as documented backlog — no demonstrated real-world trigger, and a real fix would be a much larger algorithmic change for a theoretical benefit.

## 1. `schema_exists()` — detect partial migration, verify `psql` exit status

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

Checking presence of `public.users` (created by `001_initial.sql`) AND `cg_version_projects.task_names_direct` (added by `017_task_names_direct.sql`, the last migration in filename order) together distinguishes three states: no schema (both absent → apply all migrations), fully migrated (both present → skip), and partially migrated (`users` present, last-migration marker absent → **fail loudly** rather than attempt an unsafe re-run — migration files don't use `IF NOT EXISTS`, so blindly re-running the full loop against a partially-migrated schema would itself fail with "already exists" on the migrations that did succeed). Failing with an explicit `down && up` instruction is simpler and safer than per-migration tracking, matching Cycle 1's constraint against introducing migration-tracking infrastructure — acceptable since this is a disposable local test database, not production data.

The `psql` exit-status check (`rc=$?` right after the first query) converts a previously-silent "connection failure looks like schema absent" into a visible warning, while keeping the same fail-safe direction (falls through to re-applying migrations, never silently skips them due to a transient error).

## 2. `status()` — comment-only clarification

No code change. `db_health`/`api_health`'s `"missing"` fallback (`test-branch.sh:124-125`) is the only reachable non-`healthy` value in practice, since both containers always have a Docker healthcheck defined in `docker-compose.yml` — a precondition `wait_healthy()` already assumes elsewhere in the same file. A one-line comment documents this so a future reader doesn't mistake it for an incomplete case.

## 3. `load_env()` — declare locals

```bash
load_env() {
  local env_file=".env"
  [ -f "$env_file" ] || return 0
  local line key val
  while IFS= read -r line || [ -n "$line" ]; do
    ...
```

Applied identically to both `scripts/test-branch.sh` and `scripts/run-tests.sh`, keeping the two copies byte-identical per existing precedent.

## 4. Data-clone dump cleanup on failure

```bash
DUMP_FILE=$(mktemp)
trap 'rm -f "$DUMP_FILE"' EXIT
docker exec "$MAIN_DB_CONTAINER" pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$DUMP_FILE"
docker exec -i "$DB_CONTAINER" pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists < "$DUMP_FILE"
echo "Data cloned from main."
```

`test-branch.sh` has no existing `EXIT` trap (unlike `run-tests.sh`), so introducing one here is safe. `trap ... EXIT` fires on shell exit regardless of cause (`set -e`-triggered or normal), unlike `trap ... RETURN`, whose behavior when a `set -e` failure unwinds a non-conditionally-called function is not reliably specified. On the success path, the existing `rm -f "$DUMP_FILE"` (removed from this block per the brief's original text, no longer present — the trap now owns cleanup) fires exactly once at true script exit; calling `rm -f` on an already-removed file is a harmless no-op, so no double-cleanup concern exists on any path.

## 5. Dead code removal

Delete from `js/programs.js`: `showProgramsModal`, `renderProgramsTable`, `openProgramEditModal`, `saveProgramFromModal`, `showProgramError`, `deleteProgram`, `cfgRefreshProgramDropdown`. Keep: `loadProgramsFromApi`, `savePrograms`, `getPrograms` (confirmed live via `Promise.all([...loadProgramsFromApi()...])` in `costgrid.html`, `pipeline.html`, `planning.html`, `project-config.html`).

Delete from `js/roles.js`: `showRolesView`, `hideRolesView`, `renderRolesTable`, `extractTeam`, `openRoleModal`, `saveRoleFromModal`, `showRoleError`, `deleteRole`, `exportRoles`, `importRoles`. Keep: `loadRolesFromApi`, `saveRoles`, `getRoles` (confirmed live, same call sites).

No HTML markup touched (out of scope per brief).

## 6. `resolveColumnMap()` fixes

**First-occurrence-only substring match** — `matchSpecificity()` now scans every occurrence of the candidate string, not just the first:

```js
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

**Duplicate-header-string collision** — `usedHeaders` tracks column index, not header text, so two columns with identical header text are treated as distinct:

```js
const usedHeaders = new Set(); // now holds headerIdx values, not header strings
...
for (const m of matches) {
  if (usedHeaders.has(m.headerIdx) || usedFields.has(m.field)) continue;
  result[m.field] = m.header;
  usedHeaders.add(m.headerIdx);
  usedFields.add(m.field);
}
```

**Non-optimal greedy assignment** — left unchanged (confirmed with user: no demonstrated real-world trigger, a true fix is a disproportionate algorithmic change for a theoretical benefit).

## Testing / verification

No automated test exists for the two bash scripts — verification is manual, exercised during implementation:
- Simulate a partial migration (apply only `001_initial.sql` manually, then run `up`) — second `up` must fail with the new explicit message, not silently skip remaining migrations.
- Simulate a `pg_dump`/`pg_restore` failure during the clone-data path — confirm the `mktemp` file doesn't survive script exit.
- Load a page using `js/programs.js`/`js/roles.js` after the dead-code removal — confirm no console errors, same behavior as before (dropdown population, program/role data loading).

`resolveColumnMap()` already has committed test coverage (per the Cycle covering `2026-08-05-timesheet-column-mapping-specificity`) — run the existing suite (`node --test` in `api/`) plus add cases for: a header where the candidate's first occurrence isn't a word boundary but a later one is; two columns with identical header text, both expected to map to distinct result entries.

## Explicitly excluded (unchanged from brief)

- Any other historical backlog item not listed here (all confirmed closed in prior cycles).
- HTML markup associated with the removed dead code — JS only.
- Migration-tracking table for item 1 — the fail-loud approach is deliberately simpler.
- Full rewrite of `resolveColumnMap()`'s assignment algorithm.
