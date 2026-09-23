# api/src/routes/config.js

Clients / client groups / programs / roles / ratecards CRUD (backs `config.html`).

This file holds the full implementation narrative for `api/src/routes/config.js` — route-by-route detail, cycle-by-cycle fixes, security findings. `CLAUDE.md`'s File structure entry keeps only a one-line pointer; when working on this file, read this file, not that line, for the detail. See `/sync-docs`'s routing rule for where future changes to this file should be written.

## Programs auth (2026-09)

`POST /programs` relaxed `requireAdmin` → `requireAuth` — `project-config.html`'s own "+ New program" button was already reachable by any non-viewer, and `costgrid.html`'s Generate Project → auto-create-program flow (see `docs/pages/costgrid.md`) needs the same access for a non-admin proposal owner/editor establishing a proposal's first program.

`PATCH /programs/:id` relaxed the same way, so a non-admin who just created a program can fix a typo in its name — but only skips the ownership check below when the program has zero linked projects yet (still being established); once it has at least one project, the caller must be admin or hold owner/editor on at least one of them.

`POST /programs/:id/share` (pre-existing, unrelated to this cycle) had **no ownership check at all** — any authenticated user could grant themselves editor on every project in an arbitrary program by attaching their own project's `programId` to it first; fixed with the same admin-or-owner/editor check.

`DELETE /programs/:id` stays `requireAdmin` (already blocked while any project is linked, via the existing 400 "Cannot delete program with linked projects").
