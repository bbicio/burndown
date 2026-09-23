# api/src/routes/app-settings.js

App-wide settings routes (Terms & Conditions storage among them).

This file holds the full implementation narrative for `api/src/routes/app-settings.js` — route-by-route detail, cycle-by-cycle fixes. `CLAUDE.md`'s File structure entry keeps only a one-line pointer; when working on this file, read this file, not that line, for the detail. See `/sync-docs`'s routing rule for where future changes to this file should be written.

## Version history (2026-09)

`GET /terms` (`requireAuth`, unchanged response shape `{version,content,updatedAt,updatedBy}`) now reads the latest row from the new `terms_versions` table (immutable, append-only — application code never UPDATEs/DELETEs it) instead of `app_settings.terms_content`; that old single-row storage is repurposed as pure **draft** storage, exposed via the new `GET /terms/draft` (sysadmin-exclusive), never read by `terms.html`'s acceptance gate.

`PUT /terms` (sysadmin-exclusive): `publishNewVersion:false` writes only the draft; `:true` additionally computes `newVersion` from `MAX(terms_versions.version)+1` and INSERTs a new immutable row, then syncs the draft to match so the next edit starts from what was just published — no transactional guard against a concurrent double-publish race, a pre-existing risk class (the old single-row storage had the identical race), explicitly descoped in `docs/superpowers/specs/2026-09-11-terms-version-history-design.md`.

Two more new sysadmin-exclusive routes: `GET /terms/versions` (list, no `content` field, DESC by version) and `GET /terms/versions/:version` (one version's full text, 404 if unknown).

`auth.js`'s `getCurrentTermsVersion()` (feeds `GET /api/auth/me`'s `current_terms_version` and `POST /accept-terms`) also reads `MAX(terms_versions.version)` now, not `app_settings` — a code-review fix during this cycle: the acceptance gate and `GET /terms` must agree on "what's current," and only `terms_versions` is guaranteed in sync after a publish.

A shared `formatFullName(row)` helper (top of this file) null-safely formats the `first_name`/`last_name` LEFT JOIN used by all four version-related routes.

See `docs/pages/terms-editor.md` for the `_terms-editor.html` UI this backs.
