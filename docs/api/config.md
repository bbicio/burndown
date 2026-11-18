# api/src/routes/config.js

Clients / client groups / programs / roles / ratecards CRUD. It backs the Master Data pages (`master-clients.html`, `master-client-groups.html`, `master-pipelines.html`, `master-roles.html`, `master-currencies.html`) since the 2026-10-05 split; `config.html` itself is now only a redirect stub to `/master-clients.html`.

**The `/programs*` routes are the exception:** no Master Data page uses them any more. Their only live callers are `project-config.html`, `costgrid.html` and `portfolio.html`. Anyone removing or changing Programs handling needs to look there, not at the `master-*` pages.

This file holds the full implementation narrative for `api/src/routes/config.js` — route-by-route detail, cycle-by-cycle fixes, security findings. `CLAUDE.md`'s File structure entry keeps only a one-line pointer; when working on this file, read this file, not that line, for the detail. See `/sync-docs`'s routing rule for where future changes to this file should be written.

## Programs auth (2026-09)

`POST /programs` relaxed `requireAdmin` → `requireAuth` — `project-config.html`'s own "+ New program" button was already reachable by any non-viewer, and `costgrid.html`'s Generate Project → auto-create-program flow (see `docs/pages/costgrid.md`) needs the same access for a non-admin proposal owner/editor establishing a proposal's first program.

`PATCH /programs/:id` relaxed the same way, so a non-admin who just created a program can fix a typo in its name — but only skips the ownership check below when the program has zero linked projects yet (still being established); once it has at least one project, the caller must be admin or hold owner/editor on at least one of them.

`POST /programs/:id/share` (pre-existing, unrelated to this cycle) had **no ownership check at all** — any authenticated user could grant themselves editor on every project in an arbitrary program by attaching their own project's `programId` to it first; fixed with the same admin-or-owner/editor check.

`DELETE /programs/:id` stays `requireAdmin` (already blocked while any project is linked, via the existing 400 "Cannot delete program with linked projects").

## Programs in the save contract (2026-11-18, save-contract cycle 3)

`program` is a registered entity (`services/saved-entities.js`). `POST /programs` is a `versionedWrite` create and answers `201` with the program snapshot `{ id, name, version, shares }`; `PATCH /programs/:id` and `DELETE /programs/:id` are `unchecked` updates/deletes, with their answers unchanged. `POST /programs/:id/share` keeps its checks before the transaction, then shares every project of the program in **one** `unchecked` program update: the upsert never lowers a permission (`api/src/lib/share-rank.js`, `owner` > `editor` > `viewer`), so an existing owner or editor keeps it. The answer is `201 { ok, shared, granted, raised, kept, emailSent }`: rows created, rows taken to a higher permission, rows left at an equal or higher one. Email and notification follow the commit. Tests: `test-api.js` `PG-01..05`.

## Ratecard entries (2026-10-30, currency cycle 3)

`PATCH /ratecards/:id/entries` replaces the whole set in one transaction: entries whose `roleId` is not in the body are deleted, the others are upserted. An empty array clears every entry. `hourlyRate` is `number | null`; `null` means no client EUR rate, the agency default (`roles.hourly_rate`) applies. Each entry goes through `ratecardEntryError` (see [lib.md](lib.md)) before any write; an entry with neither a rate nor a currency override, a missing or malformed `roleId`, an unknown role or a malformed rate card id is refused with `400`, an unknown rate card with `404`. The transaction locks the rate card row (`FOR NO KEY UPDATE` since 2026-11-17), so two concurrent replacements run one after the other.

## Ratecard version (2026-11-11, backlog cycle 2, migration `035`)

The body is `{ version, entries }`. Since the save contract (below) the version check is `versionedWrite`'s: a different, missing or non-integer `version`, or a bare array body (a page cached before 2026-11-11), answers `409 STALE` and writes nothing; a role repeated in `entries` answers `400`. Entries whose role no longer exists are dropped before the write, which is one `INSERT … SELECT … FROM unnest(…) ON CONFLICT … DO UPDATE`.

`POST /ratecards` requires `clientId`; it locks the client row (`FOR NO KEY UPDATE`) and returns the client's existing card with its `entries` (200) instead of creating a second one. `POST /ratecards/clone` was removed.

## Save contract: roles and rate cards (2026-11-17, save-contract cycle 1, migration `037`)

Every write route of roles and rate cards goes through `versionedWrite` ([services.md](services.md)), stays `requireAdmin` and runs its money checks before the write. A body without the current integer `version` answers `409 { error, code: 'STALE', version }` — "This role was changed by someone else since you opened it." / "This rate card was changed by someone else since you opened it." — and an unknown id `404`. Each success leaves one `change_log` row per entity it changed (`entity_type` `role` or `ratecard`, the session's user).

| Route | Body | Answer | `change_log` action |
|---|---|---|---|
| `GET /roles` | — | rows with `version` | — |
| `POST /roles` | `{ label, code, team?, hourlyRate?, rateOverrides? }` | `201` the role | `create`, version 0 |
| `PATCH /roles/:id` | fields to change + `version`; an absent field is left as it is | the role | `update` |
| `DELETE /roles/:id` | `{ version }` | `{ ok: true }` | `delete`, stored version + 1, snapshot before |
| `GET /ratecards/:id` | — | `id, name, client_id, version, entries[]` | — |
| `POST /ratecards` | `{ name, clientId }` | `201` the card, or `200` the client's existing card | `create` (none for an existing card) |
| `PATCH /ratecards/:id` | `{ name, version }` | the card | `update` |
| `PATCH /ratecards/:id/entries` | `{ version, entries }` | the whole card | `update-entries` |
| `DELETE /ratecards/:id` | `{ version }` | `{ ok: true }` | `delete` |

A duplicate role code stays `409 'Role code already exists'` without `code: 'STALE'`; the refusals found inside the write (role used in cost grids or by a team resource, card used in cost grids) stay `400`.

Deleting a role locks first the rate cards holding it (in id order), then the role — the order the entries `PATCH` takes through its FK — and after the `CASCADE` gives each of those cards a new version and a `role-deleted` row, in the same transaction. Tests: `test-api.js` `SC-01..SC-14`, `SV-33..SV-35`, `SV-49`.
