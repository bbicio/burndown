# js/api-sync.js

In-memory ↔ API sync layer (`cgSyncFromApi`, `loadConfigFromApi`, etc.).

This file holds the full implementation narrative for `js/api-sync.js` — function-by-function detail, cycle-by-cycle fixes, first-attempt bugs. `CLAUDE.md`'s File structure entry keeps only a one-line pointer; when working on this file, read this file, not that line, for the detail. See `/sync-docs`'s routing rule for where future changes to this file should be written.

## Base state

`cgSyncFromApi` stores `myPermission: g.my_permission` on each `_cgStore` entry. `_apiProjectToLocal` maps `my_permission: p.my_permission || 'owner'` and converts ISO currency code → symbol (`EUR→'€'`, `USD→'$'`, `GBP→'£'`) for the form select. `costGridRef: { cgId, versionId } | null` — `cgId` is read directly from `GET /api/projects`'s server-resolved `cg_id` field (a `LEFT JOIN` to `cost_grid_versions` in `api/src/routes/projects.js`), **not** from the in-memory `_cgStore`. `_pushProjectToApi` converts symbol → ISO code before PATCH to satisfy the `currencies` FK constraint — fields not listed here are silently dropped even if returned by the API. `_cgApiVersionToLocal` maps `taskIds` and `taskNames` from `lp.task_ids`/`lp.task_names` on each linked-project entry.

## _resolveCgIdForVersion ReferenceError fix (2026-07)

`cgId` reading was fixed to come from the server-resolved `cg_id` field, not `_resolveCgIdForVersion()`/`_cgStore` (declared only in `js/costgrid.js`), which threw `ReferenceError` on any page that doesn't load that script — `portfolio.html`, `project-config.html` — silently emptying `config.projects` on both. `_resolveCgIdForVersion()` itself was confirmed to have zero remaining callers anywhere in the repo and deleted in a later cleanup cycle (2026-08).

## _pushProjectToApi return value (2026-09)

`_pushProjectToApi` returns `true`/`false` (was always implicitly `undefined`) — `true` once the core project upsert is confirmed persisted server-side, `false` if that upsert itself failed (sub-resource pushes — tasks/phasing/ptc/planning/groups — stay best-effort/swallowed internally and don't affect this return value); consumed by `js/costgrid.js`'s `cgDoGenerateProject()` to decide whether the post-generation dialog can safely offer to navigate to `project-config.html`.
