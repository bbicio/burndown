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

