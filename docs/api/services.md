# api/src/services/ — index

What lives in `api/src/services/`, and where each one is documented. `CLAUDE.md`'s File structure entry keeps only a short summary plus a pointer here. See `/sync-docs`'s routing rule for where future changes belong.

| Service | Documented in |
|---|---|
| `email.js`, `jwt.js` | this file (below) |
| `resource-matching.js` | [docs/api/resources.md](resources.md) |
| `profile-engine.js`, `profile-worker.js` | [docs/api/profile-engine.md](profile-engine.md) |
| `llm.js`, `planning-assistant.js` | [docs/api/planning-assistant.md](planning-assistant.md) |
| `planning-data.js` | [docs/api/planning-model.md](planning-model.md) |
| `topic-extraction.js` | [docs/api/profile-engine.md](profile-engine.md) (where `extractForCode` and the peek-before-claim flow are; `docs/api/topics.md` routes here too) |
| `users.js` | [docs/api/users.md](users.md) (`anonymizeUser`) and this file (below) |
| `versioned-write.js`, `saved-entities.js` | this file (below); the routes that use them in [docs/api/config.md](config.md) |

## email.js

Nodemailer wrappers: `sendInvite`, `sendPasswordReset`, `sendShareNotification`, `sendShareRevokedEmail`, `sendOwnerReassignedEmail`, `sendExportEmail`, `sendAdminNotificationEmail`. `renderAdminNotificationLink(url)` (exported, 2026-11-15) builds that mail's "Open in PDash" paragraph: a link only for a url `notificationLink()` accepts, escaped for the `href`; see `docs/api/lib.md` (`notification-url.js`).

`sendShareRevokedEmail` (2026-09) is the access-removed counterpart to `sendShareNotification`. It is consumed **only** by `projects.js`'s `DELETE /:id/shares/:userId` — cost-grid share removal does not call it, a deliberate scope decision rather than an omission.

The module also exports an `APP_URL` constant (2026-09) used for building the links inside emails, and `appLink(path)` (`${APP_URL}${path}`, 2026-11-16, B-499), which builds every share and owner-reassignment link of `routes/cost-grids.js`. Tests: `api/src/services/email-app-link.test.js`.

## jwt.js

Token signing/verification behind the `pdash_token` cookie. The middleware that consumes it is `api/src/middleware/auth.js` (see `CLAUDE.md`). `cookieSecure()` is `true` unless `NODE_ENV` is exactly `development`, read on every call; `cookieOptions(opts)` adds `httpOnly` and that flag, and every set and clear of `pdash_token`, `pdash_challenge` and `pdash_device` (`routes/auth.js`) goes through it (2026-11-16, security cycle 6, S-07). Tests: `api/src/services/jwt.test.js`.

## versioned-write.js and saved-entities.js (2026-11-17, save-contract cycle 1)

`versionedWrite(poolOrClient, { type, id, expectedVersion, userId, action, write })` → `{ entity, version }`. With a pool it opens the transaction (`withTransaction`); with a client (an object with `release`) it runs inside the caller's and never sends `BEGIN`/`COMMIT`. For an update it locks the row (`SELECT version … FOR UPDATE`), throws `NotFoundError` for no row and `StaleError` when `expectedVersion` is not an integer equal to the stored one, runs `write(client)`, adds 1 to `version`, and writes the snapshot to `change_log`. A `delete` takes the snapshot before `write` and logs the stored version + 1; a `create` (no `id`) logs version 0 for the id `write` returns, or nothing when `write` returns `{ id, created: false }`. Any error rolls the whole write back. `userId` is always `req.user.id`. `respondSaveError(res, err)` answers a `StaleError` with `409 { error, code: 'STALE', version }` and a `NotFoundError` with `404`, and returns whether it did.

`saved-entities.js` holds one entry per type — `table`, `staleMessage`, `notFoundMessage`, `snapshot(client, id)` — for `role` and `ratecard`; the table name never comes from the request. `ratecardSnapshot` is also `GET /ratecards/:id`'s query. `change_log` has no route. Tests: `versioned-write.test.js`; the rule that every write of a registered table goes through it: `scripts/save-contract-guard.test.js`.

## The other services, in one line each

- `passwords.js` (2026-11-17) — the one place that hashes a new password (`scripts/password-policy-guard.test.js`): `hashNewPassword(password, context, { breachCheck })` → `{ hash }` or `{ error }` runs `lib/password-policy.js` with the common list (`loadCommonPasswords()`, read once), then `pwnedCount` against the Have I Been Pwned range API (only the first 5 hex characters of the SHA-1 leave, `Add-Padding: true`, a timeout), then bcrypt. HIBP is fail-open: a timeout, network error or non-200 logs `[passwords] breach check unavailable: <reason>` and the password is accepted. `breachCheck: false` (`create-admin.js`) or `PASSWORD_BREACH_CHECK=off` (the `run-tests.sh` stack) skips it. The three password routes answer a refusal with `400 { error, code: 'PASSWORD_RULE' }`. Tests: `passwords.test.js`; `test-api.js` `PP-01..PP-04`.
- `resource-matching.js` (2026-09, Cycle 3b) — `refreshUnmatched(codes | null)`, the DB half of actuals-owner-name matching; the rules themselves live in `api/src/lib/match-resource.js`.
- `profile-engine.js` / `profile-worker.js` (Cycle 3c) — the profile queue plus per-code processing, and the 60 s self-scheduling worker started from `api/src/index.js`.
- `llm.js` (2026-09-30) — one `chat({ system, messages, tools })` interface over the Anthropic Messages API.
- `planning-assistant.js` (2026-09-30) — DB loading and orchestration of the team assistant.
- `planning-data.js` (2026-09-29) — loads projects/tasks, actuals, resources and aliases for the planning model and caches them for 30 s (`getPlanningData`, `invalidatePlanningData`, `visibleProjectIds`).
- `topic-extraction.js` (2026-09-29) — extracts the competence vocabulary from project/task descriptions for the profile worker; the pure rules live in `api/src/lib/topic-extract.js` and the LLM call goes through `llm.js`. Detail in [docs/api/profile-engine.md](profile-engine.md), not in `topics.md` (which covers the admin API over the resulting vocabulary).
- `two-step.js` (2026-11-10) — data access of the email-code login: challenges (`createChallenge`, `findChallenge`, `recordAttempt`, `replaceCode`, `resetLatestCode`, `deleteChallenge`), trusted devices (`trustDevice`, `findTrustedDevice`, `listDevices`, `removeDevice`, `removeAllDevices`), and `revokeTwoStepState(userId)`, called from every path that changes a credential or the state of an account. `createChallenge` and `trustDevice` take a `guard` (`{ email, passwordChangedAt }` as read before the slow steps) and insert only while the user still matches, returning null otherwise. `email.js` gained `sendLoginCode`, its transporter has connect/greeting/socket timeouts, and `sendAdminNotificationEmail` escapes title, body and name itself.
- `users.js` (2026-11-11) — writes on `users` that run on the caller's transaction client: `anonymizeUser(db, id)` (requests, row, two-step state) and `notifyAdmins(db, requestId, title, body, requesterId)`, one `INSERT INTO notifications … SELECT` for every other active admin/sysadmin, returning the rows with each admin's `email`/`first_name` (none → `POST /api/auth/rectification-request` answers 409 `NO_RECIPIENT`). The transaction itself is `withTransaction(pool, fn)` in `api/src/db/transaction.js`.
