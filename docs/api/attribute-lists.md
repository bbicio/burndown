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

## Unique item label

An item's label is unique per list, case-insensitively (`021_attribute_list_items_unique_label.sql`). Both item routes catch the resulting `23505` and return 409.
