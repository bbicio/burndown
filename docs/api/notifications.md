# api/src/routes/notifications.js

SSE stream, CRUD, push; exports `{ router, pushToUser, createNotification }`.

This file holds the full implementation narrative for `api/src/routes/notifications.js` — cycle-by-cycle detail, design decisions. `CLAUDE.md`'s File structure entry keeps only a one-line pointer; when working on this file, read this file, not that line, for the detail. See `/sync-docs`'s routing rule for where future changes to this file should be written.

## createNotification extraction (2026-09)

`createNotification(userId, {type, title, body, url, urlLabel})` — the `INSERT INTO notifications` + `pushToUser()` pair every "something happened to you" flow in this codebase follows, extracted once six call sites needed it (project/program share grant, cost-grid share grant, cost-grid ownership reassignment, export-ready self-notification, project share revoke). Lazy-required the same way `pushToUser` always has been (`if (!_x) _x = require('./notifications').X`) to sidestep the circular-require between this file and its callers.

The pipeline-stage-change broadcast (`notifyAdminsPipelineChange`, `cost-grids.js`) was deliberately left on its own manual `INSERT`+`pushToUser` loop rather than migrated — it's a one-INSERT-per-admin broadcast, not a single-recipient call, and wasn't part of the cycle that introduced this helper.
