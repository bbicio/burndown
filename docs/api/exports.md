# api/src/routes/exports.js

CSV/XLS export routes. `CLAUDE.md`'s File structure entry keeps only a short summary plus a pointer here. See `/sync-docs`'s routing rule for where future changes belong.

Note that these routes have **no UI** since the Settings cycle (2026-09-30) removed the Settings modal that called them; the routes themselves were deliberately kept. See [docs/pages/settings.md](../pages/settings.md).

## Emailed exports

`POST /api/exports/{portfolio|cost-grids|ratecards}`. Each one, after emailing the CSV to the requester, also creates a self-targeted in-app notification via `createNotification()` (2026-09) — "Your export is ready" — fire-and-forget (`.catch(console.warn)`), the same pattern as the other notification call sites added in 2026-09. See [docs/api/notifications.md](notifications.md).

## The one that is different

`GET /api/exports/phasing` is an XLS download returned directly in the response: no email, no notification. It is a different code shape entirely and none of the above applies to it.
