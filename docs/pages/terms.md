# terms.html

Standalone T&C acceptance page (no navbar/initNav), Vue 3 (CDN, no build step, same pattern as `login.html`).

This file holds the full implementation narrative for this page — cycle-by-cycle detail, methods involved, first-attempt bugs, and report references. `CLAUDE.md`'s Pages table keeps only a one-line purpose description; when working on this page, read this file, not that row, for the detail. See `/sync-docs`'s routing rule for where future changes to this page should be written.

## Base state

Redirected to by `initNav()`'s gate (`user.terms_version < user.current_terms_version`). Reads the currently published Terms & Conditions text via `GET /api/app-settings/terms` — see `docs/pages/terms-editor.md`'s "Version history (2026-09)" section for why this reads the published text, not the draft `_terms-editor.html` edits.


## `?next=` (2026-11-15, security cycle 1, S-01)

The page continues to `next` after Accept only if `window.notificationUrl(next, window.location.origin)` (`js/lib/notification-url.js`, loaded as a module before the page's own script) accepts it; otherwise it goes to `/pipeline.html`, which is also the fallback when the module is not loaded. `js/nav.js` builds `next` from the current path and search; the check sits here, where the page navigates. `js/lib/notification-url-guard.test.js` pins it.

## Sanitised content (2026-11-16, security cycle 7, U-01)

The Terms HTML reaches the DOM only as `v-html="safeContent"`, a computed that returns `window.safeTermsHtml(this.termsContent)` (`js/lib/terms-html.js`, [docs/js/lib.md](../js/lib.md)). The page loads DOMPurify from jsdelivr (exact version, SRI, `crossorigin`, `defer`) and `js/lib/terms-html.js` before its own script; `privacy-notice.html` does the same. Markup outside the allowlist is removed when shown, not when saved, so every stored version, old ones included, is displayed sanitised. Without DOMPurify the content is shown as escaped text. Pinned by `js/lib/terms-html-guard.test.js`.

## Accepting the version shown (save contract, cycle 7)

`accept()` writes with `apiSave('POST', '/auth/accept-terms', { version })`, the version the page shows. `ok` goes to `next`. On `conflict` (409 STALE: newer terms were published meanwhile) the page reloads the text and version through `loadTerms()` (the former `mounted()` load, extracted unchanged), clears the checkbox and shows the server's message, so the user accepts what they then read. Any other outcome re-enables the button with the outcome's message.
