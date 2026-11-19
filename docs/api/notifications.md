# api/src/routes/notifications.js

SSE stream, CRUD, push; exports `{ router, pushToUser, createNotification }`.

This file holds the full implementation narrative for `api/src/routes/notifications.js` — cycle-by-cycle detail, design decisions. `CLAUDE.md`'s File structure entry keeps only a one-line pointer; when working on this file, read this file, not that line, for the detail. See `/sync-docs`'s routing rule for where future changes to this file should be written.

## createNotification extraction (2026-09)

`createNotification(userId, {type, title, body, url, urlLabel})` — the `INSERT INTO notifications` + `pushToUser()` pair every "something happened to you" flow in this codebase follows, extracted once six call sites needed it (project/program share grant, cost-grid share grant, cost-grid ownership reassignment, export-ready self-notification, project share revoke). Lazy-required the same way `pushToUser` always has been (`if (!_x) _x = require('./notifications').X`) to sidestep the circular-require between this file and its callers.

The pipeline-stage-change broadcast (`notifyAdminsPipelineChange`, `cost-grids.js`) was deliberately left on its own manual `INSERT`+`pushToUser` loop rather than migrated — it's a one-INSERT-per-admin broadcast, not a single-recipient call, and wasn't part of the cycle that introduced this helper.

## Stream ends with the session (2026-11-11, B-417)

`GET /stream` passes `requireAuth` only when it opens. On every 25 s heartbeat it calls `sessionRowError(req.user)` (`api/src/middleware/auth.js`, the query `requireAuth` runs): a session error (account disabled or anonymized, password changed) removes the connection from `sseClients` and ends the response; the browser's `EventSource` reconnects, gets 401 and stops. The browser that changed its own password reconnects with the reissued cookie. A check still pending skips the next tick (no heartbeat written); a failed query keeps the stream and writes the heartbeat. Revocation therefore reaches an open stream within one interval. Spec: `docs/superpowers/specs/2026-11-11-backlog-b417-sse-revocation-design.md`. Tests: `notifications.test.js`; `test-api.js` `SSE-00..SSE-03`.


## Notification url rule (2026-11-15, security cycle 1, S-01)

`POST /` calls `notificationUrlError(url, process.env.APP_URL)` (`api/src/lib/notification-url.js`) right after the title check and before the user lookup, so an invalid url answers `400 { error, code: 'URL_RULE' }` and creates no row, for one user and for a broadcast alike. The stored value is the one sent, not normalised. An empty string counts as no url. `createNotification` is not validated: its callers build their own urls. Existing rows are not migrated; the client neutralises them at render. Tests: `test-api.js` `NU-00..NU-09`.

`POST /` writes every recipient's row with one `INSERT … SELECT … FROM unnest($1::uuid[])` (2026-11-19, save-c5): a failure leaves no notification and pushes none. Push and email then go out for each returned row. Test: `test-api.js` `AX-10`.

## userId validated (2026-11-16, B-500)

A present, non-UUID `userId` answers `400 { error: 'userId must be a valid UUID' }` before the user lookup; an absent or empty one is still a broadcast (admin only). The same check and message guard the share routes of `routes/cost-grids.js` and `routes/projects.js` (`POST /:id/shares` body, `DELETE /:id/shares/:userId` path), after their permission check. Tests: `test-api.js` `UV-01..UV-08`.
