# help.html — Documentation viewer

Shows the documents listed in `handbook/manifest.json`. Reached from the account menu's "Help" entry (`#nav-help-link`, under Privacy Notice, every authenticated user); no main-menu entry, `initNav('help', …)`. Spec: `docs/superpowers/specs/2026-11-11-handbook-viewer-design.md`.

## Current state

- **Documents.** One manifest entry per document: `id`, `title`, `audience` (`public` or `restricted`), `renderer` (`markdown` or `test-cases`) and `file` under `handbook/`. The file's folder must match its audience. `scripts/handbook-guard.test.js` pins the manifest, the folders and what the viewer can show.
- **Who sees what.** `visibleDocs` (`js/lib/handbook.js`) lists the public documents for everyone and the restricted ones for admin and sysadmin. The server enforces the same split: nginx serves `handbook/` behind `/auth-check` and `handbook/restricted/` behind `/admin-check` (`GET /api/auth/admin-check`: 204 for admin/sysadmin, 403 for a user, 401 without a session).
- **`?doc=<id>`.** `resolveDoc` opens the document of that id; an unknown or not-visible id falls back to the first visible document with a notice. Choosing a document rewrites the query string with `history.replaceState`.
- **Navigation.** A sidebar with the groups "Guides" (public) and "Admin" (restricted); below 1024px a `<select>`.
- **Renderers.**
  - `markdown`: `marked` (CDN, exact version in `help.html`). A `mermaid` code block is drawn by `mermaid` (CDN ES module, exact version in `help.html`), imported only when the document contains one, with `securityLevel: 'strict'`.
  - `test-cases`: `js/lib/test-cases-parse.js` turns the table document into sections and cases; each case cycles untested → passed → failed. Parser warnings show in an amber band above the content.
- **Test results.** Stored in `localStorage['pdash_test_state_v1']`, the key `test-cases.html` used. It does not start with `PDash`, so `cleanLegacyStorage()` leaves it alone.
- **Payload check.** A fetched file is accepted by its content (`isHandbookPayload`) as well as `res.ok`, which alone is not enough: an expired session redirects the fetch to the login page, which would otherwise render as the document.
- **Redirect.** `/test-cases.html` answers `301` to `/help.html?doc=test-cases` (`nginx.conf`).

Stylesheet `css/help.css`. Tests: `js/lib/handbook.test.js`, `js/lib/test-cases-parse.test.js`, `scripts/handbook-guard.test.js`, `scripts/nginx-serve.test.js`, `scripts/classify-cycle.test.js`, `test-api.js` (`/api/auth/admin-check`).
