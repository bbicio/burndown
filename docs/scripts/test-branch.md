# scripts/test-branch.sh

Isolated Docker Compose stack for testing the current feature branch before merge (distinct container names/ports from the main stack, clones data from main via `pg_dump`/`pg_restore` when available, falls back to a fresh migrated DB + bootstrapped test admin otherwise). Subcommands: `up`/`down`/`status` (`status` reports "up" only when both containers are actually Docker-healthy — `.State.Running` + `.State.Health.Status` — consumed by `/finish-cycle` Gate 2 to detect a branch environment already running from an earlier attempt). Ports overridable via optional `TEST_BRANCH_FRONTEND_PORT`/`TEST_BRANCH_API_PORT`/`TEST_BRANCH_DB_PORT`/`TEST_BRANCH_ADMINER_PORT` `.env` variables, same defaults (8081/3001/5433/8082) if unset.

This file holds the full cycle-by-cycle hardening history for `scripts/test-branch.sh`. `CLAUDE.md`'s File structure entry keeps only the short summary above plus a pointer; when working on this script, read this file, not that line, for the detail. See `/sync-docs`'s routing rule for where future changes to this file should be written.

## Idempotent migration loop (2026-08)

The fresh-DB migration loop is idempotent: a `schema_exists()` helper checks `public.users` via `to_regclass` before applying migrations, so a second `up` without an intervening `down` skips already-applied migrations instead of failing with "already exists"; admin bootstrap stays unconditional on every run.

Further hardened: `schema_exists()` also checks `cg_version_projects.task_names_direct` (added by migration `017_task_names_direct.sql`) alongside `public.users`, so a schema left partially migrated by an interrupted run is detected and the script exits with an explicit `down && up` remediation message instead of silently skipping the remaining migrations (blindly re-running the full loop against a partial schema would itself fail with "already exists" on the migrations that did succeed, since files don't use `IF NOT EXISTS`); also explicitly checks the first `psql` call's own exit status, warning rather than silently treating a transient connection failure as "schema absent" — a second, unguarded `psql` call for the last-migration check remains a known, accepted minor gap.

2026-09: `schema_exists()` also checks `to_regclass('public.terms_versions')` (added by `019_terms_versions.sql`), since the `017`-era check above had gone two migrations stale (018 didn't update it either) and would otherwise have misjudged a DB migrated only through 017/018 as fully up to date, skipping the migration loop and leaving `terms_versions` missing.

## Docker-health status check (2026-08)

`status` reports "up" only when both containers are actually Docker-healthy (`.State.Running` + `.State.Health.Status`), previously just checked they existed via `docker ps`, which misreported a crash-looping/still-starting/stopped-but-stale-healthy container as "up" — consumed by `/finish-cycle` Gate 2.

## .env parsing (2026-08)

Reads `.env` via a manual line-by-line parser (never source/eval — real `.env` values here contain shell-special characters); `load_env()` silently skips any line with no `=` or an invalid shell-identifier key (previously a stray line like `export FOO=bar` aborted the whole script under `set -e`) and trims whitespace around key/value (both `line`/`key`/`val` are now `local`-declared too, closing a gap where they previously leaked into the calling shell's namespace).

## Snapshot file safety (2026-08, Cycle 3)

The main-stack data-clone dump is written via `mktemp` (`600` permissions, no world-readable window) instead of a fixed `/tmp/pdash_branch_snapshot.dump` path (a stale, days-old dump was found under the old fixed path during this fix's own verification), and is now cleaned up via `trap 'rm -f "$DUMP_FILE"' EXIT` (added right after `mktemp`, replacing an earlier unconditional `rm -f` that only ran on the success path) so a mid-`pg_dump`/`pg_restore` failure doesn't leak the file — this is the only `EXIT` trap in the script.
