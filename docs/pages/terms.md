# terms.html

Standalone T&C acceptance page (no navbar/initNav), Vue 3 (CDN, no build step, same pattern as `login.html`).

This file holds the full implementation narrative for this page — cycle-by-cycle detail, methods involved, first-attempt bugs, and report references. `CLAUDE.md`'s Pages table keeps only a one-line purpose description; when working on this page, read this file, not that row, for the detail. See `/sync-docs`'s routing rule for where future changes to this page should be written.

## Base state

Redirected to by `initNav()`'s gate (`user.terms_version < user.current_terms_version`). Reads the currently published Terms & Conditions text via `GET /api/app-settings/terms` — see `docs/pages/terms-editor.md`'s "Version history (2026-09)" section for why this reads the published text, not the draft `_terms-editor.html` edits.


## `?next=` (2026-11-15, security cycle 1, S-01)

The page continues to `next` after Accept only if `window.notificationUrl(next, window.location.origin)` (`js/lib/notification-url.js`, loaded as a module before the page's own script) accepts it; otherwise it goes to `/pipeline.html`, which is also the fallback when the module is not loaded. `js/nav.js` builds `next` from the current path and search; the check sits here, where the page navigates. `js/lib/notification-url-guard.test.js` pins it.
