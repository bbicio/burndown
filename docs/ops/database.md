# Database operations

Backup, restore, and full recreation of the `pdash-db` database. Moved verbatim out of `CLAUDE.md` on 2026-10-10 (phase 3 of the context-size split).

`CLAUDE.md` keeps the entry point (`scripts/backup-db.sh`, run automatically by `/finish-cycle` Gate 4) and — unchanged and deliberately still loaded every session — the **Infrastructure safety** block, which is the rule that makes a snapshot mandatory before any Docker-lifecycle operation on the main stack. That block was written after a real incident on 2026-08-05 in which the main stack's data volume was wiped and recovery depended on an incidental leftover dump. Read it there; this file is the procedure, not the rule.

What each migration file does: [docs/db/migrations.md](../db/migrations.md).

### Database backup & full recreation

There was previously no documented procedure for this — added 2026-08-05 after an incident (see "Infrastructure safety" above) where the main stack's data volume was accidentally wiped and recovery depended entirely on an unrelated, incidental leftover backup file.

**Backup (preferred — automated, run before any risky operation on the main stack):**

```bash
scripts/backup-db.sh
```

Writes a timestamped `pg_dump -Fc` snapshot to `backups/` (gitignored — real data, including PII, must never reach git), keeping only the 3 most recent dumps and pruning older ones automatically. Non-blocking by design: if `pdash-db` isn't running, it warns and exits 0 rather than failing whatever called it. `/finish-cycle`'s Gate 4 (2026-09) runs this automatically, with no confirmation prompt, right after merge is confirmed and before any merge state changes — so every merge to `main` leaves a fresh data snapshot behind, not just a structural one recoverable from `api/src/db/migrations/`.

**Backup (manual fallback — equivalent to what the script above does):**

```powershell
docker exec pdash-db pg_dump -U pdash -Fc pdash > pdash-backup-<date>.dump
```

**Restore from a backup** (into a running, empty or to-be-overwritten `pdash-db`):

```powershell
docker cp pdash-backup-<date>.dump pdash-db:/tmp/restore.dump
docker exec pdash-db pg_restore -U pdash -d pdash --clean --if-exists --no-owner /tmp/restore.dump
docker exec pdash-db rm /tmp/restore.dump
```

**Full recreation from scratch** (empty volume, no backup — e.g. first-ever setup, or genuine data loss with no dump available): apply every migration file in `api/src/db/migrations/` in filename order, then bootstrap the first admin user:

Run this in **Bash** (the loop is bash syntax, not PowerShell):

```bash
for f in api/src/db/migrations/*.sql; do
  printf '%s\n' "\\echo applying $(basename "$f")"   # %s: printf would read \e as ESC
  cat "$f"
  printf '\n'
done | docker exec -i pdash-db psql -U pdash -d pdash -v ON_ERROR_STOP=1
docker exec pdash-api node /app/src/create-admin.js <email> <password> [firstName] [lastName]
```

This is the same pattern `scripts/test-branch.sh` and `scripts/run-tests.sh` use internally for their own isolated stacks — nothing in the running app (`api/Dockerfile`, `api/src/index.js`, `create-admin.js`) applies migrations automatically, so a genuinely empty `pdash-db` stays schema-less until this is run by hand.

**Three things that must stay this way, in all three copies** (2026-10-07; the per-file `docker exec` loop this replaced is still quoted in older specs/plans under `docs/superpowers/` as a historical record — do not copy it from there):
1. **One piped `psql` session, not one `docker exec` per file.** A `docker exec` costs ~1.2 s on this machine (measured), so 30 files cost ~37 s per stack creation instead of ~1 s.
2. **`-v ON_ERROR_STOP=1`.** Without it a failing migration is ignored and the run continues, leaving an incomplete schema with no error — the actual bug this fixed, worse than the lost time.
3. **The `\echo applying …` marker and the trailing `printf '\n'`.** `psql` reports line numbers against the concatenated stream, so without the marker a failure never names the migration that broke; the trailing newline stops a file lacking one from fusing into the next. The marker must use `printf '%s\n'` — written as a format string, `printf '\\echo …'` makes printf emit `<ESC>cho applying …`, which `psql` ignores, silently losing every marker.

To test a feature branch in isolation before merging (separate containers/ports, doesn't touch the `main` stack):

```bash
scripts/test-branch.sh up      # build + start, clone data from main if running
scripts/test-branch.sh down    # tear down
scripts/test-branch.sh status  # "up" (exit 0) or "down" (exit 1) — both containers must be Docker-healthy
                                # for "up" (2026-08: previously just checked they existed via `docker ps`)
```

`/finish-cycle`'s Gate 2 calls `status` automatically to detect a branch environment still running from an earlier `/finish-cycle` attempt on the same branch, and asks to reuse or rebuild it instead of the plain "spin up now?" question. **This is the ordinary branch only** (2026-10-09): on a **no-code cycle** — as classified by `node scripts/classify-cycle.mjs`, whose rule is pinned by `scripts/classify-cycle.test.js` and explained in `PROCESS.md` §6 point 4c — Gate 2 skips its steps 1-5, so it never offers a stack at all; it runs `status` read-only after the user confirms the classification and *reports* a stack left running by an earlier attempt rather than reusing, rebuilding or tearing it down.

No bundler, no build step for the **runtime** — nginx serves `js/`/`css/` files exactly as they are on disk, and this must stay true.

A dev-only test toolchain exists for the frontend: root `package.json` + vitest + jsdom, isolated from the runtime (see `js/lib/` below). It is never bundled, never served — `node_modules/`, `package.json`, `package-lock.json`, `vitest.config.js`, and any `*.test.js`/`*.spec.js` file are explicitly denied in `nginx.conf`. Run tests with `npm test` (single run) or `npm run test:watch`. Vitest 4 needs Node ≥ 20.12 (it crashes at startup with `does not provide an export named 'styleText'` on older versions): if the host Node is older, run the suite in a throwaway container instead — no change to `package.json` or the scripts, the host `node_modules` is untouched (the anonymous volume keeps the Linux dependencies off it), and the main Docker stack is not involved:

```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W):/app" -v /app/node_modules -w /app node:22 sh -c 'npm ci --no-audit --no-fund >/dev/null 2>&1 && npm test'
```

The backend has its own, separate unit-test toolchain: Node's built-in `node:test` runner (zero new dependency), scoped to `api/src/**/*.test.js` via `api/package.json`'s `"test"` script (`node --test src/**/*.test.js`, run from inside `api/`). This is deliberately kept independent from the frontend's `vitest` config — `vitest.config.js`'s `include` is `['js/**/*.test.js', 'scripts/**/*.test.js']` (the second pattern since `scripts/classify-cycle.test.js`), so it never picks up `api/` files, and the backend runner never touches `js/`. A new test under `scripts/` therefore needs no config change. Files that `require()` Express/DB modules (e.g. `api/src/routes/timesheets.test.js`, which imports `./timesheets`) need `api`'s `node_modules` present — run via `docker exec pdash-api node --test src/...` (the container already has them and volume-mounts `api/src` live) if the host has no `api/node_modules` installed. Pure `api/src/lib/*.test.js` files have no such dependency and run anywhere.

Still no linter on the frontend or backend.

---

