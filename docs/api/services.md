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

## email.js

Nodemailer wrappers: `sendInvite`, `sendPasswordReset`, `sendShareNotification`, `sendShareRevokedEmail`, `sendOwnerReassignedEmail`, `sendExportEmail`, `sendAdminNotificationEmail`.

`sendShareRevokedEmail` (2026-09) is the access-removed counterpart to `sendShareNotification`. It is consumed **only** by `projects.js`'s `DELETE /:id/shares/:userId` — cost-grid share removal does not call it, a deliberate scope decision rather than an omission.

The module also exports an `APP_URL` constant (2026-09) used for building the links inside emails.

## jwt.js

Token signing/verification behind the `pdash_token` cookie. The middleware that consumes it is `api/src/middleware/auth.js` (see `CLAUDE.md`).

## The other services, in one line each

- `resource-matching.js` (2026-09, Cycle 3b) — `refreshUnmatched(codes | null)`, the DB half of actuals-owner-name matching; the rules themselves live in `api/src/lib/match-resource.js`.
- `profile-engine.js` / `profile-worker.js` (Cycle 3c) — the profile queue plus per-code processing, and the 60 s self-scheduling worker started from `api/src/index.js`.
- `llm.js` (2026-09-30) — one `chat({ system, messages, tools })` interface over the Anthropic Messages API.
- `planning-assistant.js` (2026-09-30) — DB loading and orchestration of the team assistant.
- `planning-data.js` (2026-09-29) — loads projects/tasks, actuals, resources and aliases for the planning model and caches them for 30 s (`getPlanningData`, `invalidatePlanningData`, `visibleProjectIds`).
- `topic-extraction.js` (2026-09-29) — extracts the competence vocabulary from project/task descriptions for the profile worker; the pure rules live in `api/src/lib/topic-extract.js` and the LLM call goes through `llm.js`. Detail in [docs/api/profile-engine.md](profile-engine.md), not in `topics.md` (which covers the admin API over the resulting vocabulary).
- `two-step.js` (2026-11-10) — data access of the email-code login: challenges (`createChallenge`, `findChallenge`, `recordAttempt`, `replaceCode`, `resetLatestCode`, `deleteChallenge`), trusted devices (`trustDevice`, `findTrustedDevice`, `listDevices`, `removeDevice`, `removeAllDevices`), and `revokeTwoStepState(userId)`, called from every path that changes a credential or the state of an account. `createChallenge` and `trustDevice` take a `guard` (`{ email, passwordChangedAt }` as read before the slow steps) and insert only while the user still matches, returning null otherwise. `email.js` gained `sendLoginCode`, its transporter has connect/greeting/socket timeouts, and `sendAdminNotificationEmail` escapes title, body and name itself.
- `users.js` (2026-11-11) — writes on `users` that run on the caller's transaction client: `anonymizeUser(db, id)` (requests, row, two-step state) and `notifyAdmins(db, requestId, title, body, requesterId)`, one `INSERT INTO notifications … SELECT` for every other active admin/sysadmin, returning the rows with each admin's `email`/`first_name` (none → `POST /api/auth/rectification-request` answers 409 `NO_RECIPIENT`). The transaction itself is `withTransaction(pool, fn)` in `api/src/db/transaction.js`.
