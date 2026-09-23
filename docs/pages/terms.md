# terms.html

Standalone T&C acceptance page (no navbar/initNav), Vue 3 (CDN, no build step, same pattern as `login.html`).

This file holds the full implementation narrative for this page — cycle-by-cycle detail, methods involved, first-attempt bugs, and report references. `CLAUDE.md`'s Pages table keeps only a one-line purpose description; when working on this page, read this file, not that row, for the detail. See `/sync-docs`'s routing rule for where future changes to this page should be written.

## Base state

Redirected to by `initNav()`'s gate (`user.terms_version < user.current_terms_version`). Reads the currently published Terms & Conditions text via `GET /api/app-settings/terms` — see `docs/pages/terms-editor.md`'s "Version history (2026-09)" section for why this reads the published text, not the draft `_terms-editor.html` edits.
