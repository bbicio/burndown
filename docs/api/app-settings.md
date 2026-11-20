# api/src/routes/app-settings.js

App-wide settings routes (Terms & Conditions storage among them).

This file holds the full implementation narrative for `api/src/routes/app-settings.js` — route-by-route detail, cycle-by-cycle fixes. `CLAUDE.md`'s File structure entry keeps only a one-line pointer; when working on this file, read this file, not that line, for the detail. See `/sync-docs`'s routing rule for where future changes to this file should be written.

## Version history (2026-09)

`GET /terms` (`requireAuth`, unchanged response shape `{version,content,updatedAt,updatedBy}`) now reads the latest row from the new `terms_versions` table (immutable, append-only — application code never UPDATEs/DELETEs it) instead of `app_settings.terms_content`; that old single-row storage is repurposed as pure **draft** storage, exposed via the new `GET /terms/draft` (sysadmin-exclusive), never read by `terms.html`'s acceptance gate.

`PUT /terms` (sysadmin-exclusive; answers `{ ok, newVersion, version, updatedAt, updatedBy }`, the last three read as `GET /terms/draft` reads them, inside the transaction — `test-api.js` `ACW-04`): `publishNewVersion:false` writes only the draft; `:true` additionally computes `newVersion` from `MAX(terms_versions.version)+1` and INSERTs a new immutable row, then syncs the draft to match so the next edit starts from what was just published. Since 2026-11-19 (save-c5) the whole write is one transaction: a failure leaves no new version, and a publish that loses a concurrent race (`23505` on `terms_versions.version`) answers `409 { error: 'Another version was published at the same time. Reload to see it.', code: 'STALE', version }`, `version` being the latest published one (`test-api.js` `AX-08`, `AX-08b`, `AX-09`). Since 2026-11-16 (security cycle 7, U-01) a `content` that is not a string or exceeds 100000 characters answers `400 { error: 'content must be a string of at most 100000 characters' }` before any write (`test-api.js` `TV-01`..`TV-04`); the content is stored as sent and sanitised only when shown ([docs/pages/terms.md](../pages/terms.md)).

Two more new sysadmin-exclusive routes: `GET /terms/versions` (list, no `content` field, DESC by version) and `GET /terms/versions/:version` (one version's full text, 404 if unknown).

`auth.js`'s `getCurrentTermsVersion()` (feeds `GET /api/auth/me`'s `current_terms_version` and the `409` of `POST /accept-terms`) also reads `MAX(terms_versions.version)` now, not `app_settings` — a code-review fix during this cycle: the acceptance gate and `GET /terms` must agree on "what's current," and only `terms_versions` is guaranteed in sync after a publish.

`POST /api/auth/accept-terms` takes `{ version }`, the version the user read: it records it in one `UPDATE` conditioned on that version still being `MAX(terms_versions.version)`; a missing or non-positive-integer `version` answers `400 { error: 'version is required' }`, a version no longer current `409 { error, code: 'STALE', version }` with the current one and nothing recorded (`test-api.js` `ACW-01`..`ACW-06`). `POST /api/auth/change-password` answers `{ ok: true, password_changed_at }` (`ACW-12`).

A shared `formatFullName(row)` helper (top of this file) null-safely formats the `first_name`/`last_name` LEFT JOIN used by all four version-related routes.

See `docs/pages/terms-editor.md` for the `_terms-editor.html` UI this backs.

## Privacy contact (2026-11)

`GET /privacy-contact` (`requireAuth`): `{ name, email }` read from the `PRIVACY_CONTACT_EMAIL` / `PRIVACY_CONTACT_NAME` environment variables of the `api` container (`docker-compose.yml`, `.env.example`), trimmed. An empty email answers `{ name: null, email: null }` whatever the name, and `profile.html`'s Privacy & data section then hides its "Questions about your data?" card.
