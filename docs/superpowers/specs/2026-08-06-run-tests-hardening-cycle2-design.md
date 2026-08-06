# Design — scripts/run-tests.sh hardening (Cycle 2)

**Data:** 2026-08-06
**Brief:** `docs/superpowers/briefs/2026-08-06-run-tests-hardening-cycle2-brief.md`

## Scope

Three hardening fixes to `scripts/run-tests.sh` only, confirmed with the user:

1. Pre-cleanup of leftover `pdash_test` project state from a previous, abnormally-terminated run.
2. A guard ensuring the script is invoked from the repository root.
3. Conditional `--build` on the `api` service (only rebuild when its build-context inputs actually changed) — reversing the prior cycle's "deliberate, unconditional `--build`" decision at the user's explicit request for this cycle. `db` drops `--build` entirely: it uses a stock `postgres:16-alpine` image with no `build:` context, so the flag was always a no-op there.

## 1. Pre-cleanup

Add the same cleanup call the `EXIT` trap already uses, unconditionally, near the top of the script — before `write_override()` is called:

```bash
echo "Cleaning up any leftover state from a prior run..."
$COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true
```

This is idempotent and safe to run even when nothing exists (a normal, clean invocation) — `docker compose down` on a project with no running resources is a harmless no-op. It guarantees every run starts from a genuinely empty volume regardless of how the previous invocation ended (including `SIGKILL`, which bypasses the `EXIT` trap entirely).

## 2. Invocation-directory guard

Add a check at the very top of the script, before `load_env()` and before any Docker interaction:

```bash
if [ ! -f docker-compose.yml ] || [ ! -d api/src/db/migrations ]; then
  echo "scripts/run-tests.sh must be run from the repository root (docker-compose.yml and api/src/db/migrations/ not found here)." >&2
  exit 1
fi
```

Both checked paths are files/directories the script already depends on later (`docker-compose.yml` via `$COMPOSE`, `api/src/db/migrations/*.sql` for migrations), so no new marker file is introduced. Failing here — before `load_env()`, before writing the override file, before any `docker` command — means a wrong-directory invocation never touches Docker at all.

## 3. Conditional `--build` (api only)

Hash the actual build-context inputs and compare against a marker file saved from the last successful build:

```bash
IMAGE_HASH_FILE=".run-tests-image-hash"
CURRENT_HASH=$(cat api/Dockerfile api/package.json api/package-lock.json | sha256sum | cut -d' ' -f1)

API_BUILD_FLAG="--build"
if [ -f "$IMAGE_HASH_FILE" ] && [ "$(cat "$IMAGE_HASH_FILE")" = "$CURRENT_HASH" ]; then
  API_BUILD_FLAG=""
fi
```

`$COMPOSE up -d db` (no `--build` — `db` has no build context, `image: postgres:16-alpine` directly in `docker-compose.yml`). `$COMPOSE up -d $API_BUILD_FLAG api` — passes `--build` only when the hash differs from the marker or no marker exists yet (first run). After the `api` service is confirmed healthy, write the new hash to the marker file:

```bash
echo "$CURRENT_HASH" > "$IMAGE_HASH_FILE"
```

`$IMAGE_HASH_FILE` (`.run-tests-image-hash`, repo root) is added to `.gitignore` — it's local build-cache state, not something to commit, matching `docker-compose.test.yml`'s existing precedent in the same file.

## Testing / verification

No automated test exists for these scripts. Verification is manual, exercised during implementation:

- **Pre-cleanup:** start `run-tests.sh`, `SIGKILL` the script (or the underlying `pdash-db-test`/`pdash-api-test` containers) mid-run, then run `run-tests.sh` again — the second run must complete successfully with no "already exists"/name-conflict errors.
- **cwd guard:** run `scripts/run-tests.sh` (not `./run-tests.sh` from within `scripts/`) from a directory that is not the repo root — must fail immediately with the guard's message, before any Docker command runs.
- **Conditional build, unchanged case:** run `run-tests.sh` twice in a row with no changes to `api/Dockerfile`/`package.json`/`package-lock.json` — the second run's Docker output must show the `api` build step skipped/cached, not rebuilt.
- **Conditional build, changed case:** modify `api/Dockerfile` (or a dependency) between two runs — the second run must rebuild the `api` image (no stale-image regression).
- **No regression:** a single, complete, uninterrupted `run-tests.sh` run still passes as it does today.

## Explicitly excluded (unchanged from brief)

- All other backlog items (`/tmp` dump permissions, hardcoded ports/passwords, duplicate `docker ps` calls, override-file existence check) — Cycle 3.
- No changes to `scripts/test-branch.sh` in this cycle.
- The two minor items surfaced during Cycle 1 (interrupted-migration-loop silent skip, `schema_exists()` not checking `psql`'s exit status) — unscheduled backlog, not part of this cycle.
