# Design — Isolate the Docker Compose integration-test profile from the main stack

**Data:** 2026-08-05
**Brief:** `docs/superpowers/briefs/2026-08-05-docker-test-profile-isolation-brief.md`

## Problema

`docker-compose.yml`'s `db`/`api` services declare fixed `container_name` (`pdash-db`, `pdash-api`, `docker-compose.yml:7,24`) and fixed host ports (`5432`, `3000`, `docker-compose.yml:14-15,35-36`). The integration-test profile (`docker-compose.yml:53-73`, `docker compose --profile test run --rm test`) depends on these same `db`/`api` services with no isolation of its own — no distinct project name, container name, or port. Two consequences:

- **Verified directly (2026-08-05):** running the test command while the main dev stack is up fails with a container-name conflict.
- **Deduced from documented Compose behavior, not verified against real data:** running it while the main stack is down but its named volume `pgdata` still exists (the normal state after a plain `docker compose down`, which doesn't remove volumes) would attach the test run to that same volume — the integration test's `create-admin.js`/`test-api.js` could then run against real data instead of an isolated database.

## Expected behavior

The test gate always runs in an environment fully isolated from the main stack — distinct container names, no shared host ports, distinct Compose project name (so a distinct, disposable data volume) — regardless of whether the main stack is up, and regardless of the invoking directory. The test database starts empty on every run; containers and the volume created for the run are removed automatically afterward, on both success and failure.

## Scope escluso (confermato nel Brief)

- `scripts/test-branch.sh` e il suo meccanismo di isolamento per branch — intoccato, un caso d'uso distinto (uno stack persistente per testare un branch manualmente vs. un test runner effimero in stile CI).
- Il resto del backlog di hardening già noto per `scripts/test-branch.sh` (file `/tmp` world-readable, migrazioni non idempotenti, password admin hardcoded) — un ciclo futuro separato.
- La logica interna di `test-api.js`/`create-admin.js` — invariata, cambia solo l'ambiente in cui girano.
- Invocazioni parallele fra worktree/branch multipli — esplicitamente fuori scope per conferma dell'utente; un project name/container name fisso va bene perché il gate di test gira sempre in sequenza dentro un singolo `/finish-cycle`.

## Approcci considerati

**A — Script wrapper dedicato (`scripts/run-tests.sh`), scelto:** genera un override statico (project name `pdash_test`, `container_name: pdash-db-test`/`pdash-api-test`, nessuna porta host) a ogni run, orchestra `up db` → `up api` → `run --rm test` → teardown sempre garantito (`trap ... EXIT`) indipendentemente dall'esito. Ricalca il pattern già stabilito da `scripts/test-branch.sh`'s `write_override()`/`wait_healthy()`.

**B — File di override statico committato, nessuno script (scartato):** richiederebbe di digitare a mano gli stessi flag `-p`/`-f` a ogni invocazione, e la garanzia "teardown sempre, anche in caso di fallimento" dipenderebbe dal fatto che chi lo lancia ricordi un secondo comando — uno script con `trap` garantisce questo senza condizioni, un semplice file no.

**C — Rimuovere il `container_name` fisso da `db`/`api` nel file base (scartato):** l'opzione più invasiva; `pdash-api`/`pdash-db` sono referenziati direttamente per nome in diverse convenzioni già stabilite in questo progetto (comandi `docker exec pdash-api ...` documentati in `CLAUDE.md`, `docker inspect pdash-api` nel Gate 4 di `/finish-cycle`) — rimuoverli romperebbe quelle convenzioni per risolvere un problema che riguarda solo il profilo test.

## Modifica

**Nuovo file: `scripts/run-tests.sh`**

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

Design notes:
- `ports: !override []` on both `db` and `api` — no host port exposed at all, since the `test` service only ever talks to `db`/`api` over the internal Compose network (`API_URL: http://api:3000`, `docker-compose.yml:60`, resolved via the Compose-internal DNS alias for the `api` service, unaffected by container name or host port mapping). This is the simplest way to guarantee zero port conflicts with the main stack regardless of which ports the main stack happens to be using.
- `trap cleanup EXIT` fires on normal exit, an error under `set -e`, or a signal (e.g. Ctrl+C) — guarantees `down -v` (removes both containers and the named volume) and override-file removal happen every time, matching the Brief's "cleaned up on every run" requirement without relying on the caller remembering a second command.
- The `test` service's exit code is captured with `set +e`/`set -e` bracketing it specifically, so `set -e` (active for the rest of the script, catching real setup failures like a failed `db`/`api` build or a health-check timeout) doesn't also swallow or mask a *test* failure's own exit code — the script's own exit code must still faithfully be 0 (all tests passed) or 1 (one or more failed), matching the existing documented contract (`docker-compose.yml:52`, "Exit code 0 = all tests pass; 1 = one or more failures").
- No data cloning from the main stack (unlike `scripts/test-branch.sh`) — the `test` service already bootstraps its own admin user via `create-admin.js` (`docker-compose.yml:63-67`) against a schema; **the `test` service's existing command does not apply DB migrations itself** — confirmed by reading `api/Dockerfile` (plain `CMD ["node", "src/index.js"]`, no migration step) and `create-admin.js`/`api/src/index.js` (neither applies migrations). This means the documented command *today* only ever "worked" by silently attaching to an already-migrated volume — i.e. the main stack's — which is itself evidence for the severity of the bug this design fixes, not just a theoretical risk. `scripts/run-tests.sh` (shown in full above) applies migrations explicitly, the same way `scripts/test-branch.sh`'s `up()` does for a from-scratch database (`api/src/db/migrations/*.sql`, in order, via `psql`), after the `db` container is healthy and before starting `api`.

**Modify: `.claude/commands/finish-cycle.md:20`**

```diff
-3. Run `docker compose --profile test run --rm test`.
+3. Run `scripts/run-tests.sh`.
```

## Verifica

- Run `scripts/run-tests.sh` while the main stack (`docker compose up`, unmodified) is running → succeeds, no container-name or port conflict.
- While the script is running, `docker volume ls` shows a `pdash_test_pgdata`-prefixed volume distinct from the main stack's.
- After a run — both a passing run and one forced to fail (e.g. by temporarily breaking a test) — `docker ps -a` and `docker volume ls` show no leftover `pdash-db-test`/`pdash-api-test` containers or `pdash_test_*` volumes, and `docker-compose.test.yml` no longer exists on disk.
- The main stack, started normally, continues to publish on `pdash-db`/`pdash-api`/ports 5432/3000 exactly as before — no regression.
- `scripts/run-tests.sh`'s own exit code is 0 on an all-passing run and 1 on a run with failures, matching the documented contract callers (this script itself, and `/finish-cycle`'s Gate 1) rely on.

## Error handling / rollback

If `db` or `api` fails to build or become healthy, the script exits non-zero (via `set -e` or `wait_healthy`'s own timeout-exit) and the `trap`-registered cleanup still runs, so no partial stack is left behind. Rollback is trivial: revert the two changed/added files (`scripts/run-tests.sh`, `.claude/commands/finish-cycle.md`); nothing persists between runs by design, so there's no state to migrate back.
