# Audit: navigation architecture & vertical-space use (10 core pages)

**Date:** 2026-09-24
**Auditor:** domain-audit skill

## Scope

Confirmed with the user before any code was read:

- **Files under audit:** `js/nav.js` (shared navbar/breadcrumb/footer injection), `css/style.css` and `css/tokens.css` (nav-related rules), and the 10 core authenticated pages — `pipeline.html`, `portfolio.html`, `planning.html`, `costgrid.html`, `timesheets.html`, `config.html`, `project-config.html`, `admin.html`, `team.html`, `attribute-lists.html`. Public pages (`login.html`, `terms.html`, `activate.html`, `reset-password.html`) and sysadmin-only hidden pages (`_db-reset.html`, `_terms-editor.html`) are explicitly out of scope for this pass.
- **Breadth:** the navigation architecture (menu placement, vertical space it consumes, IA/current-location clarity) across all 10 pages, plus a first look at each page's own header/layout pattern as it relates to navigation.
- **Finding definition:** anything working against the user's two stated goals — reclaiming vertical space currently spent on chrome, and a clearer, more "dashboard-like" sense of where you are — plus any structural inconsistency between pages that would complicate a navigation redesign.
- **Ground truth:** no written spec; open-ended, informed by the user's own reference point (a HubSpot deals-board screenshot: persistant left icon-rail sidebar, no horizontal tab row eating into content height).

## Method

Read `js/nav.js` in full (650 lines); read the nav-related rules in `css/style.css`/`css/tokens.css`; grepped all 10 pages for their `initNav(...)` call (activeTab id + breadcrumbs) and for `page-header` usage; read each page's breadcrumb block; checked the whole repo for `calc(100vh` usage and for `@media` rules touching navigation.

## Findings

### 1. [High] Fixed nav chrome takes ~139px of vertical space on every page, with no way to reclaim it
- **Location:** `js/nav.js:84` (top row, inline `height:44px`, `padding:10px 0 0`), `js/nav.js:138` (tabs row, `padding-bottom:8px` + `border-top:1px`), `css/style.css:19` (`body.has-breadcrumbs { --breadcrumb-h: 33px; }`), `css/style.css:32-44` (`.app-footer`, fixed `height:100px`)
- **Evidence:** the navbar is two stacked rows inside one `<nav>` (`padding:10px 0 0` + a 44px account/logo row + a tabs row whose `.nav-main-tab` height is 44px plus 8px bottom padding and a 1px top border) — CLAUDE.md itself documents this as "106px navbar". All 10 in-scope pages pass a non-empty `breadcrumbs` array to `initNav` (confirmed by grep), which adds a further fixed 33px bar (`css/style.css:19-27`). None of this is collapsible or reclaimable — before a single pixel of page content renders, ~139px of the viewport is spent on chrome that stays constant across scroll and across pages, on top of a separately fixed 100px footer.
- **Suggested direction (not applied — for discussion):** a persistent left icon-rail sidebar, as in the HubSpot reference you shared, converts most of this from "vertical space lost on every page" into "horizontal space spent once" — the same account/notifications/section-switching functionality, without a 139px tax repeated at the top of every scroll position. Two things it would need to resolve, not answered by this audit: (a) whether the breadcrumb trail's job (page identity / back-navigation) moves into a slim top bar or is dropped in favor of the sidebar's own active-item highlight; (b) `pipeline.html`'s hardcoded `calc(100vh - 206px)` (Finding — see Out-of-scope section) would need its constant recomputed for whatever chrome remains.

### 2. [Medium] The tab row has no responsive handling and is already close to its limit
- **Location:** `js/nav.js:138` (`<div class="d-flex align-items-stretch px-2" ...>`, no `flex-wrap`), `css/style.css:56-88` (`.nav-main-tab`/`.nav-role-menu-trigger`, no `@media` rules)
- **Evidence:** a repo-wide grep for `@media` returns exactly two rules, both in `_db-reset.html` and unrelated to navigation. Bootstrap's `d-flex` defaults to `flex-wrap: nowrap`, and nothing overrides that here. For an admin/sysadmin user the tabs row already holds 3 primary tabs plus an "⚙ Admin" dropdown (5 items) plus a "🔒 Sysadmin" dropdown (2 items) — 5 top-level clickable groups with no defined behavior if they don't fit the viewport width. CLAUDE.md's own roadmap note on `team.html` ("First of four planned resource-allocation cycles") means more admin pages — and likely more dropdown growth — are already planned, not hypothetical.

### 3. [Medium] Two pages show no "you are here" signal that matches where the user actually is
- **Location:** `costgrid.html:1407-1411`, `project-config.html:449-453`
- **Evidence:** `costgrid.html` calls `initNav('pipeline', { breadcrumbs: [{label:'Home',href:'/pipeline.html'},{label:'Pipeline',href:'/pipeline.html'},{label:'…'}] })` — the highlighted top tab is "Pipeline", not anything specific to the Cost Grid Editor (no such tab exists), and the breadcrumb's last segment is a literal ellipsis with no real page name. `project-config.html` calls `initNav('portfolio', {...})` similarly, highlighting "Project Reporting" even though this is a materially different page (CLAUDE.md documents it as having its own read-only "viewer mode"). On both pages, neither the tabs nor the breadcrumb actually names where the user is.

### 4. [Low] The same destination has three different names depending on where you look
- **Location:** `js/nav.js:25` (tab label `'Project Reporting'`), `portfolio.html:919` and `project-config.html:452` (breadcrumb label `'Project Portfolio'`), CLAUDE.md's Pages table (`"Project reporting dashboard (portfolio overview...)"`)
- **Evidence:** the primary nav tab for `/portfolio.html` reads "Project Reporting"; the breadcrumb trail that appears directly under it on the same page reads "Project Portfolio" instead — a different string for the identical destination, visible in the same viewport at the same time.

### 5. [Low] The Admin dropdown's grouping exists only in the dropdown menu, not in any page's breadcrumb
- **Location:** `js/nav.js:40-52` (`adminHtml`, groups `config.html`/`timesheets.html`/`admin.html`/`team.html`/`attribute-lists.html` under one "⚙ Admin" trigger); breadcrumbs at `config.html:1268-1271` ("Home > Configuration"), `admin.html:239-242` ("Home > Administration"), `team.html:201-204` ("Home > Team"), `attribute-lists.html:203-206` ("Home > Attribute Lists"), `timesheets.html:262-265` ("Home > Timesheets")
- **Evidence:** all five pages' breadcrumbs are two levels deep, none including an "Admin" middle segment — the grouping that the dropdown menu implies (these 5 pages are "under" Admin) isn't reflected anywhere else in the page.

## Ruled out

- **Checked:** whether the navbar is `position:fixed`, which would force every page to manually offset content and risks double-margin bugs. It is not — `js/nav.js`'s injected `<nav>` carries no `position` style, and content below it (including `.breadcrumb-bar`) is in normal document flow; only `.app-footer` is `position:fixed`, and only at the bottom (`css/style.css:33`). This is a real point in favor of a sidebar migration: there's no existing offset-math workaround to unwind first.
- **Checked:** whether every in-scope page's `initNav(activeTab, ...)` call uses a valid, matching id. 8 of 10 do (`pipeline`, `portfolio`, `planning`, `timesheets`, `config`, `admin`, `team`, `attributelists`). The 2 exceptions are Finding 3, not a wider pattern.

## Out of scope / roadmap notes

- `pipeline.html`'s `.pb-board-root { height: calc(100vh - 206px) }` (`css/style.css:305`) hardcodes the current navbar+footer height math and is the one concrete engineering dependency a nav redesign will need to update (confirmed via repo-wide `calc(100vh` grep — the only other hit, `costgrid.html:186`'s `calc(100vh - 300px)`, is an unrelated internal scroll area, not tied to navbar height).
- Per-page UX beyond navigation identity was not read in depth this round — the negotiated scope was "navigation + a first look," and that first look (page-header pattern usage, breadcrumb content) surfaced only the navigation-identity issues above (Findings 3-5). A deeper page-by-page functional/usability pass is its own follow-up, not covered here.
- Mobile/narrow-viewport behavior was reasoned about from the CSS (no responsive rules exist for the tab row) rather than visually verified in an actual narrow browser — worth confirming directly before committing to a specific responsive strategy for whatever replaces the current navbar.

Report ready. Next step: audit-to-brief to translate the findings into fix cycles, or stop here if the audit doesn't call for immediate fixes.
