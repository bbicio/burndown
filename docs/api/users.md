# User administration — routes/users.js, create-admin.js, promote-sysadmin.js

The three pieces that create and mutate accounts. `CLAUDE.md`'s File structure entries keep a short summary plus a pointer here. See `/sync-docs`'s routing rule for where future changes belong. UI side: [docs/pages/admin.md](../pages/admin.md). The guards themselves: `CLAUDE.md` → `api/src/middleware/auth.js`.

## api/src/routes/users.js

`PATCH /:id` (role/status), `POST /:id/anonymize`, `DELETE /:id` — all gated `requireAdmin`, plus a shared `sysAdminTargetError()` check (2026-09): only a sysadmin may mutate a row whose current role is `sysadmin`, verified with a fresh DB read (`liveRole()`), **not** the JWT-cached claim.

`PATCH /:id`'s role field additionally runs `roleChangeError()` (`api/src/lib/role-transition.js`) for two-step promotion/demotion.

`PATCH /:id` also takes `firstName`, `lastName`, `email` (2026-11, My profile page): a user's details are admin-managed, the user only sends a rectification request (`POST /api/auth/rectification-request`). The details go through `normalizeDetails`/`detailsError` (`api/src/lib/user-details.js`) after the existing guards; an invalid field answers 400 `{ error, field }` and nothing is written, an email used by another user (case-insensitive) 409 `{ error: 'Email already in use', field: 'email' }`, an anonymized target (`anon_…@deleted.local`) 400, and an actor whose live role (`liveRole`) is no longer admin or sysadmin 403 — a stale JWT must not be able to change an email. Role, status and details are written by one `UPDATE`. A new email also clears `reset_token`/`reset_expires`, and on a **pending** user `invite_token`/`invite_expires` — those links went to the old address; Resend invite or Forgot password issue new ones. Names are limited to 100 characters and the email to 255, the column sizes. An email matching the anonymized pattern (`anon_…@deleted.local`, `ANON_EMAIL_RE` in `user-details.js`) is refused as reserved.

`POST /:id/anonymize` deletes the user's `rectification_requests` rows before anonymizing (their message is free text with personal data); the admins' notifications of those requests cascade with them.

Self-modification is blocked unconditionally on all three routes.

## api/src/create-admin.js

CLI bootstrap script (admin user create / password reset). It **always** sets `role='admin'` by design — never `sysadmin`. That is a deliberate scope boundary, not an oversight; see `promote-sysadmin.js` for that step.

## api/src/promote-sysadmin.js

CLI script (2026-09) promoting an existing user to `role='sysadmin'` — the separate step needed after `create-admin.js`. Same `.env`/`DATABASE_URL` loading pattern as that script.

Two consumers:

- The integration test suite's bootstrap — `docker-compose.yml`'s `test` service runs both scripts, the second for a dedicated `TEST_SYSADMIN_EMAIL` account.
- The first real sysadmin promotion after a deploy. **No user starts as sysadmin:** `018_sysadmin_role.sql` widens the `role` CHECK constraint with no backfill, by design. Someone must run this script once by hand; after that an existing sysadmin can use `admin.html`'s "⬆ Grant sysadmin" toggle for anyone else.

## Two-step CLIs and revocation (2026-11-10)

`create-admin.js` on an existing user now also sets `password_changed_at` and calls `revokeTwoStepState`. `api/src/trust-device.js <email> [--days N]` prints the value of a `pdash_device` cookie for an active user (label `Automation (CLI)`); `api/src/two-step-code.js <email>` prints a fresh 6-digit code for the user's most recent open challenge (exit 1 without one). Both load `api/src/cli-env.js`. `PATCH /:id` (new email or `status: 'disabled'`), `DELETE /:id` and `/anonymize` revoke challenges and trusted devices.
