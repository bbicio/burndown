# _terms-editor.html

Sysadmin-exclusive (`role !== 'sysadmin'` gate, not admin-or-sysadmin) Terms & Conditions console, same pattern as `_db-reset.html`.

This file holds the full implementation narrative for this page — cycle-by-cycle detail, methods involved, first-attempt bugs, and report references. `CLAUDE.md`'s Pages table keeps only a one-line purpose description; when working on this page, read this file, not that row, for the detail. See `/sync-docs`'s routing rule for where future changes to this page should be written.

## Base state

Hosts exactly the card moved out of `admin.html` (same `terms` state shape, `saveTerms()`/`fmtDate()`) — the load method wraps its fetch in try/catch (reusing `terms.msg`/`msgOk` so a failed load shows a visible error instead of an infinite loading spinner). Reachable only from the sysadmin-only navbar menu block (`js/nav.js`, tab id `termseditor`).

## Version history (2026-09)

`loadTerms()` renamed `loadDraft()`, now hits `GET /api/app-settings/terms/draft` instead of `GET /terms` — the editor always shows the in-progress draft, never the last-published text (previously the two were conflated: this page and `terms.html`'s acceptance gate read the exact same value, so an unsaved "Save draft" edit was live to end users immediately — the bug this cycle exists to fix).

New state: `versions`/`versionsLoading`/`versionsError` (list) and `viewingVersion`/`viewVersionError` (single-version modal). New `loadVersions()` (`GET /terms/versions`) called from `created()` alongside `loadDraft()`, and again after every `saveTerms()` success (draft or publish) to keep the list current. New `viewVersion(version)` (`GET /terms/versions/:version`) opens `#versionViewModal`, a read-only `<textarea readonly :value="...">` — deliberately `:value`, not `{{ }}` mustache interpolation, per Vue's own documented guidance that textarea content doesn't reactively update reliably via interpolation; shows the modal (with `viewVersionError` inside it) on both the success and the failure path, not only success — an early implementation only showed it on success, silently swallowing a 404/network error on a broken "View" click, caught by this cycle's own final review.

"📜 Version History" card lists every published version (`GET /terms/versions`); "👁 View" opens the read-only modal described above; the list refreshes after every save (draft or publish). Publish now creates a permanent, immutable entry instead of overwriting the only copy — "Save draft"/"Publish new version" stayed unchanged in the UI.
