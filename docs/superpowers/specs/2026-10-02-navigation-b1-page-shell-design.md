# Navigation Cycle B1 — page shell and sidebar-state groundwork — design

**Date:** 2026-10-02
**Brief:** `docs/superpowers/briefs/2026-10-02-navigation-b1-page-shell-brief.md`
**Path:** architectural (changes the shell of every authenticated page and sets the interface B2 builds on). Position: Cycle A (merged `38f8b6e`) → **B1 (this)** → B2 sidebar (`2026-10-02-navigation-b2-sidebar-brief.md`) → page-by-page cycles.

## 1. Purpose and success

Prepare every authenticated page for the B2 left sidebar so B2 changes navigation code and CSS only, not the ~14 pages again. **No visible change for any role.** Success = identical layout, heights, fixed/sticky panels, modals and breadcrumb before and after; the sidebar state is readable before first paint; `npm test` passes.

Decisions taken with the user: the page-shell **wrapper is the core of this cycle** (confirmed explicitly; the "no wrapper, just body padding" alternative was rejected); the wrapper is hand-written in each page, not injected at runtime.

## 2. Corrections to the Brief (verified in code, 2026-10-02)

- **14 pages, not ~18**, call `initNav` and have `#nav-container`: `pipeline`, `portfolio`, `planning`, `costgrid`, `project-config`, `team`, `config`, `timesheets`, `admin`, `attribute-lists`, `profile-jobs`, `settings`, `_db-reset`, `_terms-editor`. (18 is the count of pages linking `tokens.css`, which includes the 4 public ones.)
- The offset rule moves from `body:has(> #nav-container)` (Brief, expected behavior 4) to `#app-main`: see §4.

## 3. Page structure (all 14 pages)

```html
<div id="app-shell">
  <div id="nav-container"></div>
  <div id="app-main">
    …existing Vue root(s) (#app, #planningApp, #pipelineBoardSection, #costGridEditorSection…), unchanged…
  </div>
</div>
<script …>   <!-- all scripts stay outside the shell -->
```

- The wrapper sits **outside** every Vue mount point; the roots, their `v-cloak` and their inner markup do not change. Page-specific markup that today sits between `#nav-container` and the root (e.g. `pipeline.html`/`portfolio.html` lines before the root) goes inside `#app-main`, in the same order.
- `#app-shell` and `#app-main` are plain block containers: **no** `overflow`, `transform`, `filter`, `contain`, `will-change` or `position` (they would break descendants' `position:fixed`/`sticky`: team detail panel, `#teamAssistantPanel`, the viewer banner in `project-config.html`, the selection bar in `costgrid.html`). Pages that keep modals inside their root keep working because modals are `position:fixed` with no transformed ancestor.
- Modals appended to `<body>` by Bootstrap (backdrops) and by `nav.js` (change-password, profile, send-notification) stay on `<body>`, outside the shell. Nothing about them changes.
- `<body class="pp-fullwidth">` on `planning.html` is untouched.
- Scripts stay where they are relative to the shell (outside it, after it), so the script-loading-order rules in CLAUDE.md are unaffected. Where a page indents scripts inside its content block (`admin.html`), the closing `</div>` of the shell goes before them.

## 4. Breadcrumb and offset

- `js/nav.js` (`updateBreadcrumbs`, around line 135-147) inserts the breadcrumb bar as the **first child of `#app-main`** instead of right after `#nav-container`. Visual order today is navbar → breadcrumb → content; it stays the same. In B2 the breadcrumb is therefore already inside the content column. `body.has-breadcrumbs` and `--breadcrumb-h` are kept as they are.
- `css/style.css`: `:root { --sidebar-w: 0px; }` and `#app-main { margin-left: var(--sidebar-w); }`. With `--sidebar-w` at 0 there is no shift. B2 sets `--sidebar-w` (open / rail / 0 below 1024px); the sidebar itself will be fixed inside `#nav-container`, and the small-screen top navbar stays full width because the margin applies to `#app-main` only.
- The footer (fixed, `paddingBottom:100px` on `body`) is **not touched** in B1; B2 removes it.

## 5. Sidebar-state script (`<head>`)

Inline in the `<head>` of each of the 14 pages (no shared file: no blocking request), identical everywhere:

```html
<script>try{if(localStorage.getItem('PDash_sidebarCollapsed')==='1')document.documentElement.setAttribute('data-sidebar','collapsed')}catch(e){}</script>
```

- Key `PDash_sidebarCollapsed`, value `'1'` = collapsed; absent = open (B2's default). Attribute `data-sidebar="collapsed"` on `<html>`; absent = open.
- Inert in B1: nothing reads the attribute. Wrapped in try/catch for blocked storage.
- `js/core.js`: add `PDash_sidebarCollapsed` to `cleanLegacyStorage()`'s `keep` Set (otherwise it is deleted on the next navigation).

## 6. Versioning

Bump every `?v=N` reference of each edited versioned file on every page that loads it, to the same new number: `css/style.css` (`?v=15` → 16), `js/core.js` (`?v=10` → 11), `js/nav.js` (current → +1). `js/lib/foundations-guard.test.js` already requires `style.css`/`core.js` references to agree; `nav.js` is checked by a grep during the cycle. The `.html` files themselves are not versioned (known, CLAUDE.md "Cache-busting").

## 7. Tests

- New guard test (vitest, style of `foundations-guard.test.js`) reading the 14 pages: each contains `#app-shell > #nav-container + #app-main` in that order, the `<head>` snippet byte-identical to the canonical string, no script inside the shell opened before its closing, and `style.css` has no `overflow`/`transform`/`filter`/`contain`/`position` rule on `#app-shell`/`#app-main`.
- Unit test (jsdom) for `updateBreadcrumbs`: the bar is created as first child of `#app-main`, once, and updated in place on a second call.
- `core.js` `keep` Set test (existing style, if one exists) extended with the new key.
- `npm test` green.

## 8. Manual verification (acceptance 1, 5)

Before the change, record on pipeline, portfolio, planning, costgrid, project-config, team and config: `#pipelineBoardSection` height, breadcrumb offset, position of the fixed/sticky panels (team detail, assistant, viewer banner, selection bar), and an open modal and dropdown. After the change, the same measurements must be identical, as user, admin and sysadmin. Also check with `localStorage` blocked (no console errors) and that setting the key to `'1'` changes nothing visible and survives a page change.

## 9. Out of scope

Sidebar, small-screen navbar, breakpoint, SVG icons, menu names (B2); footer removal; recomputing `.pb-board-root` or `costgrid.html:213`; any page content change.

## 10. Risks

- A page whose script sits inside the content block (`admin.html`) is wrapped wrongly and a script ends up inside `#app-main`: caught by the guard test.
- A page with extra markup between `#nav-container` and the root (non-Vue banners, hidden inputs) changes order: handled per page in the plan and covered by the before/after measurements.
- Hard-reload note: the `.html` pages are unversioned, so a browser may keep an old page with old `?v` script tags until its cache expires; consistent old-page/old-script, not a mismatch.
