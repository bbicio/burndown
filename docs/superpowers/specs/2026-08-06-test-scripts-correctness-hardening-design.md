# Design — test-branch.sh/run-tests.sh correctness hardening (Cycle 1)

**Data:** 2026-08-06
**Brief:** `docs/superpowers/briefs/2026-08-06-test-scripts-correctness-hardening-brief.md`

## Scope

Three correctness fixes, confirmed with the user:

1. `load_env()` — silently ignore malformed (`=`-less) `.env` lines, trim whitespace around key/value. Applied identically to both `scripts/test-branch.sh` and `scripts/run-tests.sh` (kept duplicated, not consolidated — no shared shell-library convention exists in this project today, and introducing one for a 2-function, low-churn piece of code isn't justified).
2. `test-branch.sh up()`'s fresh-database migration loop — made idempotent so a second `up` (without an intervening `down`) doesn't fail with "already exists" errors. `run-tests.sh` is unaffected: it always builds a fully ephemeral DB and tears it down on every exit (`trap cleanup EXIT`), so its migration loop never runs against an already-migrated volume.
3. `test-branch.sh status()` — reports `"up"` only when both containers are actually Docker-healthy, not merely running.

## 1. `load_env()`

Replace the `IFS='=' read -r key val` field-split with a raw-line read, an explicit `=`-presence check, and whitespace trimming via bash parameter expansion (no new external dependency):

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

Behavior:
- A line with no `=` (e.g. stray free text) is skipped entirely — no variable exported, no error.
- Splitting happens on the *first* `=` only (`${line#*=}` keeps everything after it), so values containing `=` (e.g. URLs with query strings) are preserved exactly as before.
- Key and value are trimmed of leading/trailing whitespace before the existing comment-check/quote-stripping/already-exported logic runs, so `" KEY = value "` exports `KEY=value`.
- A comment line (`# ...`) still starts with `#` after trimming, so it's still skipped by the existing check.
- Well-formed `.env` lines (the current, working case) produce byte-identical exported values to today's behavior.

Applied verbatim to both `scripts/test-branch.sh` and `scripts/run-tests.sh`.

## 2. Idempotent fresh-database migrations (`test-branch.sh` only)

Add a `schema_exists()` helper that checks for a well-known table (`public.users`, created by `001_initial.sql`) rather than tracking individual migration files:

```bash
schema_exists() {
  local result
  result=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT to_regclass('public.users') IS NOT NULL;")
  [ "$result" = "t" ]
}
```

In `up()`'s fresh-database branch (the one taken when the main stack isn't running):

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

The admin-bootstrap call stays unconditional on every `up` — `create-admin.js` is documented as create-or-reset-password, so re-running it against an already-bootstrapped admin is a pre-existing, safe no-op-equivalent, not new behavior.

This is a coarse, whole-schema check (not per-file migration tracking), matching the brief's constraint against introducing migration-tracking tooling. It does not attempt to recover from a migration loop interrupted mid-way (a rarer case, out of scope per the brief's acceptance criteria, which only require that two consecutive full `up` runs don't fail).

## 3. `status()` health check

Replace the `docker ps` (running-only) check with the same `docker inspect ... State.Health.Status` pattern `wait_healthy()` already uses elsewhere in the same file — as a single non-blocking check, not a retry loop:

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

Both containers already have Docker healthchecks defined (a precondition `wait_healthy()` already relies on today), so this introduces no new assumption. The external contract — `exit 0` + stdout `"up"`, or `exit 1` + stdout `"down"` — is unchanged, so `/finish-cycle`'s Gate 2 (which shells out to `status`) needs no changes.

## Testing

No automated test harness exists for these bash scripts today, and this cycle doesn't introduce one (out of scope for a correctness-hardening cycle). Verification is manual, exercised during implementation:

- `load_env()`: a scratch `.env` with a malformed line, a whitespace-padded line, a quoted value, and a comment — confirm only the well-formed lines export, with correctly trimmed values.
- Migrations: run `scripts/test-branch.sh up` twice in a row (main stack not running) without an intervening `down`; the second run must not error and must print "schema already present — skipping migrations."
- `status()`: run `scripts/test-branch.sh status` while the stack is stopped (expect `down`), while it's healthy (expect `up`), and — if feasible to simulate — while a container is running but not yet healthy (expect `down`).

## Explicitly excluded (unchanged from brief)

- All other backlog items (`/tmp` dump permissions, hardcoded ports/passwords, duplicate `docker ps` calls, override-file existence checks, orphaned-container pre-cleanup in `run-tests.sh`, invocation-directory guard, unconditional `--build`) — Cycles 2 and 3.
- Any `run-tests.sh` behavior change beyond the shared `load_env()` fix.
