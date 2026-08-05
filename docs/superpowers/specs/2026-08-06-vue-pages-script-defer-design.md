# Design — defer/async script loading across the 13 Vue pages

**Data:** 2026-08-06
**Brief:** `docs/superpowers/briefs/2026-08-06-vue-pages-script-defer-brief.md`

## Scope

Shorten the blank-screen window before Vue mounts (and removes `v-cloak`) on all 13 Vue-mounted pages, by marking every classic `<script src="...">` tag `defer` and converting each page's trailing inline `Vue.createApp({...}).mount(...)` script to `type="module"` — with **zero functional regression**. Confirmed with the user:

1. Mechanism for the trailing inline script: convert to `type="module"` (not `DOMContentLoaded`-wrapping) — per the HTML spec, `defer`'d classic scripts and `type="module"` scripts (without `async`) share one ordered execution queue, ordered by document position, all running after HTML parsing completes but before `DOMContentLoaded`.
2. `admin.html`/`timesheets.html`/`config.html`'s inline `esc()` shim scripts stay untouched, classic, unmarked — they're separate script blocks (not the trailing Vue.createApp one), have no `src` attribute so `defer` doesn't apply to them anyway, and have no strict ordering requirement beyond running before `nav.js`/`ratecards.js`, which they already do today as a plain blocking classic script.
3. Third-party CDN scripts (Vue, Bootstrap, Chart.js, xlsx, ExcelJS) get `defer` too, same treatment as this project's own `js/*.js` files.

## 1. Architecture

Two mechanical edits per page, applied uniformly:

1. Add `defer` to every classic `<script src="...">` tag — both CDN libraries and this project's own `js/*.js` files. `js/lib/*.js` files (already `type="module"`) need no change — they're already in the shared ordered-execution queue.
2. Change the page's trailing `<script>` (containing `Vue.createApp({...}).mount(...)`) to `<script type="module">`.

Because deferred classic scripts and module scripts share one document-ordered execution queue, every `js/*.js` global (`core.js`, `api.js`, `nav.js`, etc.) and every CDN library (`Vue`, `bootstrap`, etc.) is guaranteed to have already executed by the time the module-ized `Vue.createApp(...)` script runs — identical effective behavior to today, just non-blocking during HTML parsing.

Any other inline script on a page that is NOT the trailing Vue.createApp script (i.e. the `esc()` shims on `admin.html`/`timesheets.html`/`config.html`) is left completely untouched — no `type`, no `defer`, same position, same content.

## 2. Per-page script inventory (verified by reading each file)

| Page | Extra CDN scripts | Own `js/*.js` files (in order) | `js/lib/*` modules | Inline shim before core.js? |
|---|---|---|---|---|
| `pipeline.html` | Bootstrap | api, core, settings, notifications, roles, costgrid, clients, programs, api-sync, shares, nav | cfg-parse, costgrid-calc, pipeline-calc | no |
| `portfolio.html` | Chart.js (in `<head>`), Bootstrap, xlsx | api, core, settings, notifications, upload, clients, programs, ai, shares, api-sync, nav | portfolio-calc | no |
| `planning.html` | Bootstrap, ExcelJS | api, core, settings, notifications, roles, clients, programs, portfolio, upload, ai, api-sync, nav | planning-calc | no |
| `costgrid.html` | Bootstrap, ExcelJS | api, core, settings, notifications, roles, clients, programs, costgrid, api-sync, ratecards, nav | cfg-parse, costgrid-calc | no |
| `timesheets.html` | Bootstrap | api, core, settings, notifications, nav | — | **yes** (`esc()`) |
| `config.html` | Bootstrap | api, core, settings, notifications, nav | — | **yes** (`esc()`) |
| `project-config.html` | Bootstrap, xlsx | api, core, settings, notifications, clients, programs, api-sync, nav | cfg-parse, status-rules, config-form-calc | no |
| `admin.html` | Bootstrap | api, core, settings, notifications, nav | — | **yes** (`esc()`) |
| `terms.html` | — | — (no navbar) | — | no |
| `login.html` | — | — (no navbar) | — | no |
| `activate.html` | — | — (no navbar) | — | no |
| `reset-password.html` | — | — (no navbar) | — | no |
| `_db-reset.html` | Bootstrap | api, core, settings, notifications, nav | — | no |

Every page also loads the Vue CDN script (`<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js">`), which gets `defer` on all 13.

## 3. Testing / verification

No automated test can exercise real script-tag load-order timing (jsdom doesn't model it). Verification is manual, in a real browser, per page, with a hard reload (cache disabled) each time. General check on every page: no console errors, especially no `ReferenceError`/`TypeError` on `Vue`, `bootstrap`, or any page-global (`esc`, `initNav`, etc.).

**Public pages (Vue CDN only, no navbar):**

1. **login.html** — hard reload. Console clean. Valid credentials → redirects to `/pipeline.html`. Invalid credentials → inline error, stays on page. "Forgot password" link switches view without reload.
2. **activate.html** — hard reload with a valid `?token=`. Console clean. Form renders and submits; invalid/missing token shows the expected error state.
3. **reset-password.html** — same pattern as activate.html: valid `?token=` → form renders/submits; invalid/missing token → expected error state.
4. **terms.html** — hard reload via the `?next=` redirect path (a user with a stale `terms_version`, or direct `?next=/pipeline.html`). Console clean. Accepting redirects to `next`.

**Pages with the `esc()` inline shim — extra check: confirm `esc()` is still readable as a global by `nav.js`/`ratecards.js` before those scripts run, since the shim stays untouched and classic:**

5. **admin.html** — hard reload. Console clean (no `esc is not defined`, no `initNav is not defined`). User list loads, filter tabs work, "+ Invite" modal opens/closes, T&C editor tab loads content.
6. **timesheets.html** — hard reload. Console clean, `esc()` available. Upload history list loads; file picker for XLS upload opens without a load-time crash.
7. **config.html** — hard reload. Console clean, `esc()` available. Clients/Client Groups/Programs/Roles/Pipelines & POTs tabs all switch and load data.

**Bigger pages with many script dependencies:**

8. **pipeline.html** — hard reload. Console clean. Kanban board renders with all stage columns; clicking a card opens the detail panel (exercises `js/costgrid.js` global calls from the now-module-ized inline script); Share/Clone modals open from the panel.
9. **portfolio.html** — hard reload. Console clean (note: Chart.js is in `<head>` — confirm it still loads/executes correctly deferred from there). Portfolio overview cards render; a project's dashboard renders its burndown chart (Chart.js + `js/lib/portfolio-calc.js`); AI analysis button reachable (`js/ai.js` + `#confirmModal`/`showInfo()`).
10. **planning.html** — hard reload. Console clean. Resource planning grid renders in at least one grouping view (By Role/By Project/By Owner); AI Planning Sidebar opens and its input is usable; XLS export button reachable.
11. **costgrid.html** — hard reload via a real `?cgId=&verId=`. Console clean (specifically confirm the `_cgVueApp` bridge pattern still works — `js/costgrid.js`'s functions like `cgSaveVersion`/`cgPublishDraft` must still find the mounted Vue instance). Editor table renders, version tabs switch, Save button works.
12. **project-config.html** — hard reload via a real `?projectId=`. Console clean. Tasks/phasing/planning/groups sections render; Client/Program dropdowns populate; status dropdown respects `getStatusRule()`.
13. **_db-reset.html** — hard reload (admin session). Console clean. Scope list loads; "Delete single proposal" and "Change proposal owner" widgets are reachable.

## Explicitly excluded (unchanged from brief)

- No rewrite of any `js/*.js` file's contents — only `<script>` tag attributes and the trailing inline script's `type` change.
- The `v-cloak`/CSS fix itself (completed 2026-07-31) is not reopened here.
- No change to any page's data-loading logic/sequencing beyond what's needed to preserve script execution order.
- No bundler/build step; no `type="module"` conversion for the project's own classic `js/*.js` files (they stay classic, just gain `defer`) — only each page's own trailing inline script is converted.
