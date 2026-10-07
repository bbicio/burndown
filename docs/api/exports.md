# api/src/routes/exports.js

CSV/XLS export routes. `CLAUDE.md`'s File structure entry keeps only a short summary plus a pointer here. See `/sync-docs`'s routing rule for where future changes belong.

Note the split in how these are reachable: the **three CSV routes** have had **no UI** since the Settings cycle (2026-09-30) removed the Settings modal that called them — the routes themselves were deliberately kept (see [docs/pages/settings.md](../pages/settings.md)). The **phasing XLS** is a different story and is still live: `master-pipelines.html` links it directly (`<a :href="/api/exports/phasing?year=...">`). `PRD.md` records the same distinction.

## Emailed exports

`POST /api/exports/{portfolio|cost-grids|ratecards}`. Each one, after emailing the CSV to the requester, also creates a self-targeted in-app notification via `createNotification()` (2026-09) — "Your export is ready" — fire-and-forget (`.catch(console.warn)`), the same pattern as the other notification call sites added in 2026-09. See [docs/api/notifications.md](notifications.md).

## The one that is different

`GET /api/exports/phasing` is an XLS download returned directly in the response: no email, no notification. It is a different code shape entirely and none of the above applies to it. It is also the only one of the four with a live UI entry point — the download link on `master-pipelines.html` — so it is **not** dead code, despite the three CSV routes next to it having no caller.
