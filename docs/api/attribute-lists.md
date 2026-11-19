# api/src/routes/attribute-lists.js

Generic tag/taxonomy CRUD. Backs `attribute-lists.html` and, since Cycle 2, is read by `costgrid.html`/`project-config.html`'s Tags sections via `js/tags.js`.

`CLAUDE.md`'s File structure entry keeps only a short summary plus a pointer here; read this file for the detail. See `/sync-docs`'s routing rule for where future changes belong. UI side: [docs/pages/costgrid.md](../pages/costgrid.md)'s "Tags" section.

## Auth, per route

Reads (`GET /`, `GET /:id/items`) are `requireAuth` only.

They were `requireAdmin` until 2026-09, via a blanket admin-only router guard — which silently broke the tag UI for any non-admin editor: `js/tags.js`'s fetches all 403'd and the `.catch()` swallowed it into an empty "No tag lists configured yet." with no error surfaced anywhere.

Writes stay `requireAdmin`, declared per route rather than on the router:

- `POST /` and `PATCH /:id` — rename only. `slug` is immutable: generated once via `slugify()` at creation and never touched again.
- `POST /:id/items`
- `PATCH /:id/items/:itemId` — label and/or `active`/`inactive` status.

## No DELETE, by design

There is no `DELETE` anywhere in this file, deliberately, so that a tag already applied elsewhere can never be removed out from under it in a future cycle. Items are retired by flipping their status to `inactive`.

## Assigning tags

Tags are assigned one at a time; there is no replace-all route. The routes live in `routes/projects.js` and `routes/cost-grids.js`.

- `GET /api/projects/:id/tags` and `GET /api/cost-grids/:id/versions/:vId/tags` list the assigned items (`item_id, label, status, list_id, list_name, list_slug`, ordered by list name then label).
- `PUT` and `DELETE` on `…/tags/:itemId` of the same two paths assign and remove one item. Both answer `200` with the list the `GET` returns; assigning an assigned item or removing an absent one changes nothing.
- Errors in order: `403 Access denied` (no edit permission); `404 Project not found` (also for a project id that is not a UUID) / `Version not found`; `400 Version is locked` (versions); `400 itemId must be a valid UUID`; `400 Tag item does not exist`. A version of another grid answers `404 Version not found` before the permission check (`versionScope`).
- Any existing item is accepted, inactive ones included, so an inactive tag can always be removed.

## Unique item label

An item's label is unique per list, case-insensitively (`021_attribute_list_items_unique_label.sql`). Both item routes catch the resulting `23505` and return 409.
