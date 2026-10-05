# Master Data split — design

Date: 2026-10-05. Type: evolution (Scenario 2). Source: Brief of this session, refined in `/brainstorming`.

## Goal

Split `config.html` ("Master Data", one Vue app with six tab panels) into **five working pages**, one per functionality, linked by a second contextual lateral menu. Remove the Programs management from the Config interface only.

**Priority of this cycle: the split must work.** A radical UI redesign follows in the next days, so there is no polish, no refactor and no shared-code extraction. Duplication across pages is accepted.

## Current behavior (verified in code)

- `config.html` (2106 lines): one Vue 3 app `window.__cfgApp`, six panels switched by `activeTab` + `v-show` (Currencies, Roles, Clients, Client Groups, Pipelines & POTs, Programs); default tab `clients` (`config.html:95-110`, `:1019`).
- `initNav('config', …)`; non-admin/sysadmin users get `accessDenied` (`:1254-1264`). `loadAll()` fetches every list for every tab (`:1274-1291`).
- One nav entry: "Master Data" → `/config.html` in the Admin group of `NAV_GROUPS` (`js/nav.js:17`).
- `js/lib/page-names.test.js` pins menu label = `<title>` = breadcrumb per nav id (`PAGES` map, lines 10-30).
- Pipelines & POTs panel: `config.html:265-641` (list, POT detail, proposal/project phasing views).
- Programs outside config.html (DB, `/programs*` API, `js/programs.js`, portfolio grouping, costgrid Generate Project, project-config "0. Program") are **not** part of this change.

## Design

### 1. Pages

Five new files, each a copy of `config.html` cut down to one panel with only its own state, methods and data loads:

| File | Panel |
|---|---|
| `master-clients.html` | Clients |
| `master-client-groups.html` | Client Groups |
| `master-pipelines.html` | Pipelines & POTs |
| `master-roles.html` | Roles & rates |
| `master-currencies.html` | Currencies |

- Programs (tab, panel, `programs` data, `sortedPrograms`, `openProgramForm`/`saveProgram`/`deleteProgram`, `Api.programs.list()` in the load) is not carried over.
- Each page loads only what its panel needs. Expected dependencies (from the panel templates; to be verified per page in the plan): Groups → clients; Pipelines → clients, active currencies, pipeline years, year totals; Roles → currencies; Currencies → itself; Clients → itself.
- Copied unchanged: access check (admin or sysadmin), `globalError` banner with its scroll watcher, the inline `esc` shim, money setup (`window.__currencies` loaded by the page), the rate-confirmation modal, the role delete guard, the phasing views and their helpers.
- Each page keeps the standard page shell (`#app-shell` > `#nav-container` + `#app-main`), `v-cloak` on its Vue root, the head snippet for `PDash_sidebarCollapsed`, and the same script set as `config.html` (same `?v=N` values).

### 2. Second lateral menu

Inside `#app-main`, each page wraps its Vue root:

```html
<div class="md-layout">
  <nav class="md-subnav" aria-label="Master Data">…5 links, active has aria-current="page"…</nav>
  <div class="md-content"><div id="app" v-cloak>…</div></div>
</div>
```

- ≥ 1024px: fixed-width column (about 200px), sticky under the breadcrumb, to the right of the main sidebar.
- < 1024px: horizontal scrollable row above the content.
- Active link: magenta accent, like the old `.cfg-tab-btn.active`.
- Styles in `css/style.css` (token-based); `style.css` `?v` bumped in every page that references it. The markup is hand-written and duplicated in the five pages (decision of this cycle). `nav.js` is not used to render it.
- `#app-shell`, `#app-main` and the wrapper must not get `overflow`, `transform`, `filter`, `contain`, `will-change` or `position` (shell rule); `position: sticky` on the sub-menu itself is allowed.

### 3. Naming and navigation

- All five pages call `initNav('config', { breadcrumbs: [Home, { label: 'Master Data' }] })`, with `<title>PDash — Master Data</title>`. The page's own name is its `<h1>` and the active sub-menu entry. Browser tabs all read "Master Data" (accepted).
- `js/nav.js`: the `config` entry's `href` becomes `/master-clients.html`. Nothing else changes in it; bump `nav.js` `?v` in every page that references it.

### 4. config.html

Replaced by a minimal redirect page (no shell, no Vue): `location.replace('/master-clients.html')`, with a `<noscript>`/meta-refresh fallback link. It is not an authenticated page and is removed from the shell-guard page list.

### 5. Tests

- `page-names.test.js`: `PAGES` map drops `config.html` and gains the five new files, all with id `config`.
- Shell guard (`nav-shell*.test.js`): page list updated the same way (five new pages in, `config.html` out).
- New guard test: each of the five pages carries the same five sub-menu links (same hrefs, same order), exactly one marked `aria-current="page"` (its own), and contains no `program` reference.
- `npm test` green, including the `?v=` agreement guards.
- Manual browser pass (sidebar open, rail, small navbar): every page loads and works — client CRUD; group CRUD and client→group assignment; pipeline years, POT and phasing views; roles with per-currency rates and the delete guard; currency activation, rate update with the confirmation modal, history; non-admin gets access denied on each page; `/config.html` redirects.

### 6. Docs

`/sync-docs`: `docs/pages/config.md` (describe the five pages and the redirect), the CLAUDE.md pages table and file-structure entries, `test-cases.html`/`TEST_CASES.md` references to `config.html`.

## Acceptance criteria

1. Five pages load on their own URLs, each showing only its own panel and fetching only its own data.
2. The second lateral menu appears on all five pages, links them, highlights the current one.
3. The Admin menu keeps one "Master Data" entry, highlighted on all five pages, leading to the Clients page.
4. `/config.html` redirects to the Clients page.
5. No Programs UI or `Api.programs` reference in the five pages; no Programs code outside Config is changed.
6. Non-admin: access denied on each page; admin/sysadmin: full access.
7. Every old feature works identically on its new page (list in §5).
8. `npm test` passes with the guard tests updated; no `?v=` mismatches.
9. Docs and test cases synced.

## Explicitly excluded scope

- DB, API routes, migrations, `js/programs.js`, `Api.programs`.
- Portfolio grouping, costgrid Generate Project, project-config "0. Program".
- Any visual redesign, shared-code extraction or refactor (including the Pipelines & POTs code; no new unit tests for moved logic).
- Merging Clients and Client Groups into one page.
- Changes to API permissions or to the other Admin entries.
- Replacing native `confirm()` in the moved handlers.
- Per-page browser titles/breadcrumbs (all read "Master Data").

## Risks

- Duplicated code in five pages can drift; accepted, the redesign replaces it.
- Splitting the single `loadAll()` may miss a cross-panel dependency (e.g. a panel reading `clients` or `activeCurrencies`); the plan verifies each page's dependencies and the manual pass covers it.
- New CSS in the shared `style.css` needs the version bump on every referencing page, or stale caches break the layout (see CLAUDE.md "Cache-busting").
