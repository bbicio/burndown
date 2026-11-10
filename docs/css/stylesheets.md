# css/ — the stylesheets

What each stylesheet owns, which pages load it, and the decisions behind the split. `CLAUDE.md`'s File structure entries keep a one-line summary plus a pointer here; the app-wide token rules themselves stay in `CLAUDE.md`'s "Design tokens" and "Cache-busting" sections, since they are conventions spanning the whole codebase rather than one file's history. See `/sync-docs`'s routing rule for where future changes belong.

There is no bundler: nginx serves these files exactly as they are on disk, and every reference carries its own `?v=N` cache-busting query string (see `CLAUDE.md` → "Cache-busting").

## css/tokens.css

Design tokens — the single source of truth for colours and type. The header unification cycle (2026-10-16) added `--status-{not-started,started,at-risk,on-hold,completed}-soft-bg`/`-soft-text`, read by `headerBadge()` and checked for contrast by `js/lib/tokens.test.js`. Navigation tokens (magenta tint, icon sizes, `--nav-*` alphas) were added in Nav B2; the foundations cycle (2026-10-02) changed several values. The content-under-the-header cycle (2026-10-19) added the component-surface tokens `--card-*` (background, border, radius, shadow, padding, head padding, danger border), `--tile-*` (KPI tile padding and label/value size), `--banner-*` and `--content-gap`; `js/lib/content-surface-guard.test.js` pins them and their consumers. Full token rules: `CLAUDE.md` → "Design tokens".

It also carries `[v-cloak] { display: none; }` (2026-07). That rule is kept here rather than in `style.css` because 4 of the Vue pages (`login.html`/`terms.html`/`activate.html`/`reset-password.html`) load `tokens.css` (and, except `terms.html`, `css/auth.css`) but **not** `style.css` — moving the rule would silently disable it there. A deliberate, accepted deviation from the tokens/components split.

## css/style.css

Component styles referencing tokens. Loaded by the authenticated pages that have the app shell — **not** by `terms.html`, which is authenticated but standalone (no navbar, no `initNav`) and links `tokens.css` only; that is precisely why the `[v-cloak]` rule lives in `tokens.css`, as the paragraph above explains.

- `.pb-board-root` (2026-07) — extracted from `pipeline.html`'s former inline `style` attribute specifically so the `[v-cloak]` rule can win via the normal CSS cascade without needing `!important`.
- `.tag-pill`/`.tag-group`/`.tag-pill--inactive`/`.tags-section--readonly` (2026-09, Cycle 2) — the tag-pill/chip component shared by `costgrid.html`/`project-config.html`'s Tags sections. See [docs/pages/costgrid.md](../pages/costgrid.md)'s "Tags" section for the component detail, the readonly-contrast decision, and a `:has()`-specificity bug found and fixed during the redesign.
- Collapsible section cards + Tags summary (2026-11-02, project-config redesign) — `.cg-section-header`, `.cg-section-chevron(--collapsed)`, `.cg-section-title`, `.cg-section-toggle-label`, `.cg-tag-groups`, `.cg-tag-summary(-pill)`, moved here from `costgrid.css` with names and values unchanged so `project-config.html`'s Tags section uses the cost grid markup without loading `costgrid.css`. `.cg-summary-bar .cg-section-chevron` stays in `costgrid.css`. Pinned by `js/lib/project-config-layout-guard.test.js`.
- Navigation (2026-10-02, Nav B2) — the `.pd-nav*` sidebar / icon-navbar rules, the `--sidebar-w`/`--nav-top-h` media queries and the `#nav-container` reservation live here (`.nav-main-tab*`, `.nav-role-menu-trigger*` and `.app-footer` were removed), as does `#pd-tooltip` (the rail tooltip). Detail: [docs/js/nav.md](../js/nav.md).
- Page head (2026-10-16, header unification) — the `.ph` band and its parts (`.ph-main`, `.ph-back`, `.ph-eyebrow`, `.ph-title-row`, `.ph-title`, `.ph-badge`, `.ph-sub`, `.ph-side`, `.ph-actions`, `.ph-btn-primary`, `.ph-btn`, `.ph-toolbar`, `.ph-toolbar-spacer`, `.ph-lbl-wide`/`-narrow`), used by every page that calls `initNav` except the five `master-*.html`; it replaced each page's own header rules. Inside `.app-container` the band cancels the container padding through `--app-pad` (`--space-6` by default, `--space-4` below 768px, `12px` on `body.pp-fullwidth`; `portfolio.html` and `program.html` no longer redefine it) and the last band of a view gets a bottom gap. `.breadcrumb-bar` lost its bottom border, so breadcrumb and band read as one block. `.pd-icon` (the `<ph-icon>` SVG) has its base rule here. `js/lib/page-head-guard.test.js` pins the component and the removed selectors.
- Shared components (2026-11-08, Team redesign) — the block opened by the comment `Shared components (pd-)` at the end of the file: `.pd-drawer` (Bootstrap offcanvas, `-head`, `-eyebrow`, `-title`, `-sub`, `-close`, `-form`, `-body`, `-foot`, `-hint`, modifier `--wide`), `.pd-row-menu*` and `.pd-tag*`, `.pd-banner*`, `.pd-confirm*` (inside a `.pd-confirm-modal`), `.pd-status-pill*`, `.pd-state*`. Values come from `admin.html`'s `ua-` block, tokens only. Used by `team.html` and `attribute-lists.html`; the other redesigned pages keep their local copies until they converge. Since 2026-11-09 the block also holds `.pd-combo*`, the CSS of `js/combo-select.js`. `js/lib/team-page-guard.test.js` fails on a hex literal in the block.

## css/controls.css

Styles of the three custom controls of `js/cg-controls.js` (`.cg-ctl*`, `.cg-pop*`, `.cg-day-*`, `.cg-month-*`, `.cg-opt*`, `.cg-person*`), moved unchanged out of `costgrid.css` on 2026-10-24 (dates C2) when `project-config.html` and `portfolio.html` started using the date picker. Loaded by those two pages, `costgrid.html` and `planning.html` (since 2026-11-02, the period selector), after `style.css` and **before** the page sheet, so a page overrides a control only with a contextual selector (`.cg-task-date .cg-ctl`, `.cg-btn-secondary.cg-people-trigger`, `.pr-period-custom-row …`). `.cg-ctl` is `position: relative`, and `.cg-pop--inline` positions a non-teleported calendar against it (see [docs/js/cg-controls.md](../js/cg-controls.md)). Every page that loads `js/cg-controls.js` must load it (`js/lib/dates-guard.test.js`).

## css/admin-crud.css

Shared layout (`card`/`table`/`btn-primary`/`form-*`/`empty`/`alert-sm`) for the simple admin CRUD pages, extracted 2026-09 from duplicated inline `<style>` blocks in `admin.html`/`team.html`/`attribute-lists.html`. A page's own extra states (e.g. `admin.html`'s role badges, pending/disabled status) stay inline. Its `.page-header` rule was removed on 2026-10-16: the pages use the shared `.ph` page head. Since 2026-10-19 its `.card`/`.page` read `--card-*` and `--content-gap`; `.alert-sm` lives in `style.css` and reads `--banner-*`. `.kpi-card` was removed from `style.css`; the phone rules of the page head (column, 20px title, hidden sub) now live there too, not in `pipeline.css`, and `.ph-btn-primary` is a fixed height taller than `.ph-btn`, with a larger minimum on a phone; `js/lib/page-head-guard.test.js` pins both heights. Since 2026-11-08 the file has no hex literal (`js/lib/team-page-guard.test.js`): the table header, borders, `.form-label`, `.empty` and the `badge-st-*` pills read tokens, the pills the soft status pairs of `tokens.css`. The `badge-st-*` pills were removed on 2026-11-09: no page uses them.

## css/team.css

`team.html` only (2026-11-08, Team redesign), loaded after `admin-crud.css`: the `tm-` rules of the list, callout, toolbar, Unmatched drawer, New/Edit fields and the resource panel, plus the tablet and phone media queries. Tokens only (`js/lib/team-page-guard.test.js`). Detail: [docs/pages/team.md](../pages/team.md).

## css/profile.css

`profile.html` only (2026-11, My profile page): the `mp-` rules of the avatar page head, the section cards, the read-only values, the password form and strength bar, the privacy rows and contact card, and the phone media query. The sub-navigation and card frame are the Master Data ones in `style.css`. Tokens only. Detail: [docs/pages/profile.md](../pages/profile.md).

## css/attribute-lists.css

`attribute-lists.html` only (2026-11-09, Attribute Lists redesign), loaded after `admin-crud.css`: the `al-` rules of the buttons, sub-nav counts and badge, list and topic cards, toolbar, table, queue strip, drawers, merge, and the tablet and phone media queries. Tokens only (`js/lib/attribute-lists-page-guard.test.js`). Detail: [docs/pages/attribute-lists.md](../pages/attribute-lists.md).

## css/auth.css

Shared stylesheet of the public auth pages `login.html`/`activate.html`/`reset-password.html`, extracted 2026-10-06 from three duplicated inline `<style>` blocks. Loaded after Bootstrap 5.3.2 + `tokens.css`, colours only via tokens, `?v=1` (pinned by `js/lib/auth-pages-guard.test.js`).

## css/pipeline.css

Page styles of `pipeline.html` only (2026-10-06, Pipeline board redesign cycle 1): year menu, the phone layout of the page head (since 2026-10-16 the header and toolbar themselves are the shared `.ph`/`.ph-toolbar`), search suggestions, collapsible columns, cards, smartphone tabs and the Filters sheet. Tokens only, no colour literals; linked after `style.css`; `js/lib/pipeline-guard.test.js` pins it. Detail: [docs/pages/pipeline.md](../pages/pipeline.md).

## css/costgrid.css

Page styles of `costgrid.html` only (2026-10-07, Cost Grid redesign cycle A): the second row of the page head (`.cg-ph-row2`, since 2026-10-16 the header card is gone) + version segmented control, the three collapsible section cards (Offer details/Tags/Sharing) and their closed-state summaries (the shared header and Tags-summary rules are in `style.css` since 2026-11-02), the grid (sticky 225px first column, rate-row custom/zero states, role ⋮ menu, no-roles placeholder column, assigned-task lock/badge, TOTAL row), the selection bar (New/Existing segmented control), the Monthly Phasing card and the Add-roles modal. The custom controls moved to `controls.css` on 2026-10-24; only contextual overrides stay here (the task date field, 92px so `Dec 31, 2026` fits, and the Reassign trigger size). Tokens only, no hardcoded hex (pinned by `js/lib/costgrid-guard.test.js`); a `@media (max-width: 1024px)` block hides the legend for tablet widths.

**The grid's base cell rules are written as `:where(.cg-grid) :where(th, td)`** — specificity 0, so every per-cell class wins without `!important`. Writing them as descendant selectors would recreate the Bootstrap `.table` override bug these replaced (G-14).

Full narrative: [docs/pages/costgrid.md](../pages/costgrid.md).

## css/portfolio.css

Page styles shared by `portfolio.html` and `program.html` (2026-10-08, Portfolio overview redesign cycle 1 and the Program Dashboard cycle the same day — it is **not** a single-page stylesheet, so a change here affects both; `program.html`'s own `.pg-*` tiles, List and Timeline rules are detailed in [docs/pages/program.md](../pages/program.md)): the Card grid view (header and toolbar are the shared `.ph`/`.ph-toolbar` since 2026-10-16) (cards, the stacked-pseudo-element program card, the spent-percent bar, the full-width children panel), and the List view (the CSS-grid "table", its `html[data-sidebar="collapsed"]`-aware responsive column hiding below 1024px — same pattern as the Pipeline cycle's detail panel). Tokens only, no colour literals; linked after `style.css`; `js/lib/portfolio-guard.test.js` pins it. One deliberate exception to "tokens only": a `!important` descendant override (`.pf-stage-pill > span`, `.pf-status-pill > span`) is needed to restyle `js/core.js`'s `pipelineBadge()`/`statusBadgeLarge()` output, since those functions return inline-`style`-carrying spans (not CSS classes) and `core.js` was deliberately left unmodified (shared with other pages). Detail: [docs/pages/portfolio.md](../pages/portfolio.md).

## css/project-config.css

Page styles of `project-config.html` only (2026-11-02, project-config redesign): the section index and Totals, the `.pc-card` restyle of `.cfg-section` (which stays unchanged in `style.css`), the task table with its open row, the merged phasing card with its bars, PTC rows, functional group cards, the phone section picker and bottom sheet. Prefix `pc-`, tokens only, no hex; loaded by no other page (`js/lib/project-config-layout-guard.test.js`). Breakpoints: `max-width: 1279.98px` (sidebar open: the task table drops Period/Roles), `1023.98px` (index as a sticky tab row, no Totals) and `767.98px` (one section at a time).

## css/planning.css

Page styles of `planning.html` only (2026-11-02, planning redesign cycle 1): the two-row toolbar (segmented controls, period selector and its menu, search, stage chips, Projects/Team popovers, switches), the legend and the "How estimates work" popover, the grid (`.pl-grid`: sticky label/Sold/Actuals/To plan columns, header and Total row inside `.pl-grid-wrap`; parent/child rows, avatars, pills, past/current/pulse/high/over cells), the Filters offcanvas and the tablet rules (`max-width: 1024px`), the Team assistant drawer and its backdrop; since 2026-11-03 (cycle 2) two `max-width: 767.98px` blocks for the smartphone layout — period stepper, cards and mini-bar, the Filters offcanvas as a bottom sheet, and (in the second block, after the drawer rules so they win) the full-screen Team assistant with person cards. It also received the rules `css/style.css` used to hold for this page only (`body.pp-fullwidth`, `#teamAssistantPanel`/`.ta-*`, `.pl-toolbar*`); the unused `.gantt-*`, `.pp-tooltip`, `#ppResourceTable` and `#portfolioPlanningContainer` rules were deleted. Prefix `pl-`, tokens only, no hex (`js/lib/content-surface-guard.test.js`); linked after `style.css` and `controls.css`. Detail: [docs/pages/planning.md](../pages/planning.md).
