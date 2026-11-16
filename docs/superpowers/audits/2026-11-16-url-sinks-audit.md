# URL Sinks Audit (frontend)

**Date:** 2026-11-16
**Scope (agreed with the user before any code was read):** verification-only. The root `*.html` pages and `js/**/*.js` (tests excluded): every point where a URL reaches an attribute or a navigation — Vue `:href`/`:src`/`v-bind:*`, `href="${…}"`/`src="${…}"` in HTML strings, `.href =`/`.src =`/`setAttribute`, `location.*`, `window.open`. Closes the gap that `docs/superpowers/audits/2026-11-15-security-review-audit.md` lists as "Not assessed" (Vue `:href`/`:src` bindings fed by stored data).
**Finding:** a URL from stored or user-supplied data (API, query string, `localStorage`) that reaches its sink with no scheme check. A constant URL, or one built from a fixed path with ids as parameters, is verified sound.
**Ground truth:** `js/lib/notification-url.js` (an app path or an absolute URL on the app origin; nothing else).
**Out of bounds (user):** the server except to trace where a value comes from; `handbook/` and `docs/`.

## Method

- Grepped the scoped files for each sink form (Vue bindings, `href=`/`src=` with `${`/concatenation, `.href =`/`.src =`, `setAttribute`, `location.*`, `window.open`, `.action`/`formAction`, `top.`/`parent.location`) and for the URL sources (`location.search`, `URLSearchParams`, `localStorage.getItem`); every hit read and its value traced to its origin, through the API route when the value is stored.
- Re-checked the S-01 fixes at their sinks (`js/notifications.js`, `terms.html` `?next=`) instead of assuming them.
- Reading done by a read-only agent and its finding re-read by hand at the cited lines. Did not run the app or any payload.

## Findings

### U-01 — Terms & Conditions HTML is stored and rendered unsanitised

- **Type:** Stored XSS (OWASP A03). **Severity:** Medium (privileged writer, every user reached).
- **Location:** `terms.html:69` (`v-html="termsContent"`, fed at `:114`), `privacy-notice.html:62` (`v-html="content"`, fed at `:108`); writer `api/src/routes/app-settings.js:122-139`; editor `_terms-editor.html:59`.
- **Evidence:**
  - `PUT /api/app-settings/terms` (`requireSysAdmin`) checks only `content === undefined` (`app-settings.js:125`) and stores the value as is in `terms_versions.content` and `app_settings.terms_content` (`:130-139`).
  - The editor is a raw HTML `<textarea>` ("Edit HTML content below", `_terms-editor.html:58-59`).
  - Both pages render it with `v-html` and no sanitiser: an `<a href="javascript:…">`, a `data:` link or an `<img onerror=…>` reaches the DOM; the current CSP (`nginx.conf:24`, `script-src … 'unsafe-inline'`) does not stop `javascript:` URLs or inline handlers.
  - `terms.html` is the gate every user passes after a version bump (`js/nav.js` redirects there when `terms_version < current_terms_version`), so one stored payload runs in every user's session.
- **Exploitability:** needs a sysadmin account (compromised, or a malicious insider); then it acts as any user who opens the gate or the Privacy Notice.
- **Not found by the 2026-11-15 audit:** its "Output encoding" row lists the `v-html` sinks as fed by escaping builders; these two are fed by stored HTML.

No other findings.

## Verified sound

| Area | Why | Where |
|---|---|---|
| Notification url (S-01 fix) | `safeNotifUrl` goes through `notificationUrl(url, location.origin)` and fails closed when the module is missing; every page loading `notifications.js` also loads `notification-url.js`; HTML attributes escaped | `js/notifications.js:75-77`, `:87`, `:163`, `:174-175` |
| `terms.html?next=` | through `notificationUrl` before `location.href`, default `/pipeline.html` | `terms.html:95`, `:130` |
| Navigation and breadcrumbs | hrefs only from constant tables (`NAV_ITEMS`, `md-subnav` items, breadcrumb callers); the one computed breadcrumb uses a validated year | `js/nav.js:10-25`, `:67`, `:404`; `js/lib/md-subnav.js:11-40`, `:59`, `:77`; `master-pipelines.html:1196` |
| Page-to-page links | fixed paths with ids encoded (`encodeURIComponent`/`URLSearchParams`) | `costgrid.html:802`, `pipeline.html:533`, `:998`, `portfolio.html:327`, `:348`, `master-pipelines.html:663`, `:792`, and the other constant redirects |
| Downloads | `URL.createObjectURL(blob)` and `chart.toBase64Image()` on locally built data | `js/costgrid.js:1692`, `:1706`, `planning.html:1175`, `project-config.html:1019`, `timesheets.html:605`, `portfolio.html:2072`, `program.html:500` |
| `mailto:` contact | scheme fixed; address from server env `PRIVACY_CONTACT_EMAIL` | `profile.html:210`, `:212`; `api/src/routes/app-settings.js:22-24` |
| Help viewer | `?doc=` used only as a manifest key; markdown from repo-owned `handbook/` files; Mermaid from a constant URL with SRI | `help.html:163-171`, `:321`; `js/lib/handbook.js:22-28` |
| Images from data | none: no `<img>`/`:src` takes a value from the API | — |

## Out of scope / roadmap notes

- `project-config.html:959`, `:1173` build `/portfolio.html?projectId=` with the stored id unencoded (harmless for the scheme; inconsistent with the other call sites).
- `PUT /api/app-settings/terms` has no type or length check on `content` (`app-settings.js:125`), beside U-01.
- `help.html` has more `v-html` sinks fed by repo files (`:75`, `:84`, `:102-127`); not user-writable, so not findings here.
- The CSP still admits `'unsafe-inline'` (`nginx.conf:24`): it is what makes U-01 runnable. Security cycle 8 (`docs/superpowers/briefs/2026-11-16-security-c8-csp-script-src-brief.md`) removes it.
