# User administration — routes/users.js, create-admin.js, promote-sysadmin.js

The three pieces that create and mutate accounts. `CLAUDE.md`'s File structure entries keep a short summary plus a pointer here. See `/sync-docs`'s routing rule for where future changes belong. UI side: [docs/pages/admin.md](../pages/admin.md). The guards themselves: `CLAUDE.md` → `api/src/middleware/auth.js`.

## api/src/routes/users.js

`PATCH /:id` (role/status), `POST /:id/anonymize`, `DELETE /:id` — all gated `requireAdmin`, plus a shared `sysAdminTargetError()` check (2026-09): only a sysadmin may mutate a row whose current role is `sysadmin`, verified with a fresh DB read (`liveRole()`), **not** the JWT-cached claim.

`PATCH /:id`'s role field additionally runs `roleChangeError()` (`api/src/lib/role-transition.js`) for two-step promotion/demotion.

Self-modification is blocked unconditionally on all three routes.

## api/src/create-admin.js

CLI bootstrap script (admin user create / password reset). It **always** sets `role='admin'` by design — never `sysadmin`. That is a deliberate scope boundary, not an oversight; see `promote-sysadmin.js` for that step.

## api/src/promote-sysadmin.js

CLI script (2026-09) promoting an existing user to `role='sysadmin'` — the separate step needed after `create-admin.js`. Same `.env`/`DATABASE_URL` loading pattern as that script.

Two consumers:

- The integration test suite's bootstrap — `docker-compose.yml`'s `test` service runs both scripts, the second for a dedicated `TEST_SYSADMIN_EMAIL` account.
- The first real sysadmin promotion after a deploy. **No user starts as sysadmin:** `018_sysadmin_role.sql` widens the `role` CHECK constraint with no backfill, by design. Someone must run this script once by hand; after that an existing sysadmin can use `admin.html`'s "⬆ Grant sysadmin" toggle for anyone else.
