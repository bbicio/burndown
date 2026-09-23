# api/src/routes/reset.js

`GET /api/admin/reset/scopes` + `POST /api/admin/reset/:scope` (**sysadmin-exclusive** bulk delete, 2026-09 — was admin-only, gated `requireSysAdmin` not `requireAdmin`); scopes: proposals, projects, clients, ratecards, actuals, pipelines, notifications. Also `POST /api/admin/reset/cost-grid/:cgId` — delete one proposal + linked projects (transactional) — and `PATCH /api/admin/reset/cost-grid/:cgId/owner` — reassign proposal owner.

This file holds the full implementation narrative for `api/src/routes/reset.js` — route-by-route detail, cycle-by-cycle fixes. `CLAUDE.md`'s File structure entry keeps only a one-line pointer; when working on this file, read this file, not that line, for the detail. See `/sync-docs`'s routing rule for where future changes to this file should be written.

## PATCH .../owner transactional fix (2026-09)

Now transactional and keeps `resource_shares` in sync with `cost_grids.owner_id`, not just the latter — previously only `cost_grids.owner_id` was updated, so the share modal/inline share list (both read/write `resource_shares`, never `cost_grids.owner_id` directly) kept showing the *previous* owner as permanent owner (un-shareable, since "already has access" excludes them from the add-share search) and never showed the real new owner at all. The fix deletes the old owner's stale `resource_shares` row and upserts one for the new owner (`ON CONFLICT ... DO UPDATE SET permission = 'owner'`, since they may already hold some other permission on the same cost grid) inside the same transaction as the `cost_grids.owner_id` update.

## Hardening (2026-09, same cycle that added cost-grids.js's own broader owner-reassignment route)

The `ON CONFLICT` branch now also refreshes `shared_by` to `req.user.id` (the sysadmin performing the reassignment), not `ownerId` (the recipient) — previously a re-reassignment could leave a share row recording the new owner as having granted access to themselves; and `ROLLBACK` in the `catch` block is now `.catch(() => {})`-guarded so a broken pooled connection during rollback can't swallow the original error and hang the request.

This route stays cost-grid-only (no linked-project grants) and sysadmin-exclusive — it does not replace `cost-grids.js`'s newer, broader owner-reassignment route (see `docs/pages/costgrid.md`'s "Owner reassignment" section, and `admin.html`'s "⬆ Grant sysadmin" toggle path is unrelated — see `docs/pages/admin.md`).
