# css/ — the seven stylesheets

What each stylesheet owns, which pages load it, and the decisions behind the split. `CLAUDE.md`'s File structure entries keep a one-line summary plus a pointer here; the app-wide token rules themselves stay in `CLAUDE.md`'s "Design tokens" and "Cache-busting" sections, since they are conventions spanning the whole codebase rather than one file's history. See `/sync-docs`'s routing rule for where future changes belong.

There is no bundler: nginx serves these files exactly as they are on disk, and every reference carries its own `?v=N` cache-busting query string (see `CLAUDE.md` → "Cache-busting").

## css/tokens.css

Design tokens — the single source of truth for colours and type (`?v=9`). Navigation tokens (magenta tint, icon sizes, `--nav-*` alphas) were added in Nav B2; the foundations cycle (2026-10-02) changed several values. Full token rules: `CLAUDE.md` → "Design tokens".

It also carries `[v-cloak] { display: none; }` (2026-07). That rule is kept here rather than in `style.css` because 4 of the Vue pages (`login.html`/`terms.html`/`activate.html`/`reset-password.html`) load `tokens.css` (and, except `terms.html`, `css/auth.css`) but **not** `style.css` — moving the rule would silently disable it there. A deliberate, accepted deviation from the tokens/components split.

## css/style.css

Component styles referencing tokens. Loaded by the authenticated pages that have the app shell — **not** by `terms.html`, which is authenticated but standalone (no navbar, no `initNav`) and links `tokens.css` only; that is precisely why the `[v-cloak]` rule lives in `tokens.css`, as the paragraph above explains.

- `.pb-board-root` (2026-07) — extracted from `pipeline.html`'s former inline `style` attribute specifically so the `[v-cloak]` rule can win via the normal CSS cascade without needing `!important`.
- `.tag-pill`/`.tag-group`/`.tag-pill--inactive`/`.tags-section--readonly` (2026-09, Cycle 2) — the tag-pill/chip component shared by `costgrid.html`/`project-config.html`'s Tags sections. See [docs/pages/costgrid.md](../pages/costgrid.md)'s "Tags" section for the component detail, the readonly-contrast decision, and a `:has()`-specificity bug found and fixed during the redesign.
- Navigation (2026-10-02, Nav B2) — the `.pd-nav*` sidebar / icon-navbar rules, the `--sidebar-w`/`--nav-top-h` media queries and the `#nav-container` reservation live here (`.nav-main-tab*`, `.nav-role-menu-trigger*` and `.app-footer` were removed), as does `#pd-tooltip` (the rail tooltip). Detail: [docs/js/nav.md](../js/nav.md).

## css/admin-crud.css

Shared layout (`page-header`/`card`/`table`/`badge-st-active`/`btn-primary`/`form-*`/`empty`/`alert-sm`) for the simple admin CRUD pages, extracted 2026-09 from duplicated inline `<style>` blocks in `admin.html`/`team.html`/`attribute-lists.html`. A page's own extra states (e.g. `admin.html`'s role badges, pending/disabled status) stay inline.

## css/auth.css

Shared stylesheet of the public auth pages `login.html`/`activate.html`/`reset-password.html`, extracted 2026-10-06 from three duplicated inline `<style>` blocks. Loaded after Bootstrap 5.3.2 + `tokens.css`, colours only via tokens, `?v=1` (pinned by `js/lib/auth-pages-guard.test.js`).

## css/pipeline.css

Page styles of `pipeline.html` only (2026-10-06, Pipeline board redesign cycle 1): header, year menu, toolbar, search suggestions, collapsible columns, cards, smartphone tabs and the Filters sheet. Tokens only, no colour literals; linked after `style.css`, `?v=2` (cycle 2 added the detail panel styles); `js/lib/pipeline-guard.test.js` pins it. Detail: [docs/pages/pipeline.md](../pages/pipeline.md).

## css/costgrid.css

Page styles of `costgrid.html` only (2026-10-07, Cost Grid redesign cycle A; `?v=3` since the fidelity cycle): header card + version segmented control, the three collapsible section cards (Offer details/Tags/Sharing) and their closed-state summaries, the grid (sticky 225px first column, rate-row custom/zero states, role ⋮ menu, no-roles placeholder column, assigned-task lock/badge, TOTAL row), the selection bar (New/Existing segmented control), the Monthly Phasing card, the three custom controls of `js/cg-controls.js` and the Add-roles modal. Tokens only, no hardcoded hex (pinned by `js/lib/costgrid-guard.test.js`); a `@media (max-width: 1024px)` block hides the legend for tablet widths.

**The grid's base cell rules are written as `:where(.cg-grid) :where(th, td)`** — specificity 0, so every per-cell class wins without `!important`. Writing them as descendant selectors would recreate the Bootstrap `.table` override bug these replaced (G-14).

Full narrative: [docs/pages/costgrid.md](../pages/costgrid.md).

## css/portfolio.css

Page styles of `portfolio.html` only (2026-10-08, Portfolio overview redesign cycle 1): header + toolbar, the Card grid view (cards, the stacked-pseudo-element program card, the spent-percent bar, the full-width children panel), and the List view (the CSS-grid "table", its `html[data-sidebar="collapsed"]`-aware responsive column hiding below 1024px — same pattern as the Pipeline cycle's detail panel). Tokens only, no colour literals; linked after `style.css`, `?v=1`; `js/lib/portfolio-guard.test.js` pins it. One deliberate exception to "tokens only": a `!important` descendant override (`.pf-stage-pill > span`, `.pf-status-pill > span`) is needed to restyle `js/core.js`'s `pipelineBadge()`/`statusBadgeLarge()` output, since those functions return inline-`style`-carrying spans (not CSS classes) and `core.js` was deliberately left unmodified (shared with other pages). Detail: [docs/pages/portfolio.md](../pages/portfolio.md).
