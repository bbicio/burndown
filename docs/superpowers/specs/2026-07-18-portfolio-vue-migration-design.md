# `portfolio.html` Vue 3 Migration — Design Spec

**Source:** Brief `docs/superpowers/specs/2026-07-18-portfolio-vue-migration-brief.md`. Second Tier 2 page per `docs/superpowers/specs/2026-07-14-vue-migration-roadmap-design.md`. Follows the pattern validated by `project-config.html`.

## Problem

`portfolio.html` (680 lines) + `js/portfolio.js` (568 lines) + `js/dashboard.js` (1058 lines, exclusively used by this page) implement the portfolio overview and per-project dashboard views, still Vanilla JS. The page also embeds a confirmed-orphaned `#configModal` (with its own nested, also-unreachable client/program/roles CRUD modals), three permanently-empty placeholder section divs, and a dead duplicate `showPortfolioPlanningView` definition.

## Investigation findings (informing scope decisions below)

1. **The full clients/programs/roles CRUD modals are unreachable, not just `#configModal` itself.** `showClientsModal()`/`showProgramsModal()` are only triggered from buttons *inside* `#configModal` (`portfolio.html:195,202`), which is itself reachable only via a `?configure=true` URL param no file in the repo ever sets. `rolesModal` is never triggered from anywhere. This invalidates the roadmap's original premise that this page had a "reachable" case for the clients/programs/roles consolidation question — it doesn't. That question remains open project-wide.
2. **`js/roles.js` is confirmed unused in live code** (grep-verified: zero calls to `getRoles()`/any roles.js export outside the dead `rolesModal`) — dropped, matching `project-config.html`'s precedent.
3. **`js/clients.js`/`js/programs.js` ARE genuinely used live** — `getClientName()` (client filter/sort/display) and `getPrograms()` (program summary rollups) are called directly from `js/portfolio.js`'s live rendering code, confirmed via grep. Both files stay loaded; only their CRUD-modal exports go unused (same situation as `project-config.html`).
4. **Zero native `alert()`/`window.confirm()`** in this page already — confirmed via grep. Nothing to retrofit; this page was never part of that cleanup's scope.
5. **`js/dashboard.js` is used exclusively by `portfolio.html`** (confirmed: no other `.html` file references it) — unlike `js/clients.js`/`js/programs.js`/`js/shares.js`/`js/ai.js`, which are genuinely shared elsewhere. Decision (confirmed during brainstorming): its logic is migrated into this same Vue rewrite, not left as a separate Vanilla file the new Vue instance merely calls into — leaving it Vanilla would produce an internally inconsistent page (mixed paradigms for no sharing reason). This substantially increases this cycle's scope versus the original Brief estimate (680+568 lines → +1058 more).
6. **`js/shares.js`/`js/ai.js` already use the established modal idiom** — `bootstrap.Modal.getOrCreateInstance(document.getElementById(...)).show()` (`js/shares.js:360`, `js/ai.js:395,533`) — no conflict with the "one modal idiom" convention; both are called as plain global functions from the new Vue instance, same as `project-config.html` calls `getClients()`/`getPrograms()`.

## Architecture

Vue 3 rewrite (CDN, `Vue.createApp({...}).mount('#app')`), same pattern as `project-config.html`. A single reactive `view` field (`'overview' | 'dashboard'`) replaces today's manual `display:none` toggling between `#portfolioSection` and `#dashboard`/`#mainContent`. `portfolio.html` drops `js/roles.js`, `js/config-form.js` (only ever needed for the now-removed `#configModal`), and `js/dashboard.js` (its logic moves into the Vue instance) from its script list. It keeps `js/clients.js`, `js/programs.js`, `js/shares.js`, `js/ai.js`, `js/upload.js` (actuals upload, still needed), `js/api.js`/`js/core.js`/`js/api-sync.js`/`js/nav.js`/`js/notifications.js`/`js/settings.js` (standard authenticated-page stack). Adds one new module, `js/lib/portfolio-calc.js` (pure functions, vitest-covered), following the `config-form-calc.js`/`cfg-parse.js`/`planning-calc.js`/`costgrid-calc.js` pattern already established.

## Components (single Vue instance)

**`data()`**: `view` (`'overview'|'dashboard'`), portfolio-overview state (project list, client/program filter selections, program-summary cache), per-project dashboard state (selected project, KPI values, burndown chart data, date-range filter, task filter), mirroring today's module-level variables in `js/portfolio.js`/`js/dashboard.js` 1:1.

**`js/lib/portfolio-calc.js`** (new module): extracts the pure calculation core from the two highest-risk rendering functions, separating math from DOM manipulation (which becomes Vue template bindings):
- From `renderKPIs` (`js/dashboard.js:78-130`): the pure part — `soldH`/`budgetE`/`consumedE`/`totalPtc`/`totalBudget`/`hoursLeft`/`budgetLeft` computation from `billableData`/`billableTasks`/`findRate` — extracted as e.g. `computeKpis(data, cfg)` → `{ consumedHours, soldHours, budgetTotal, consumedEur, hoursLeft, budgetLeft, asOfDate }`. The DOM-writing tail (`textContent`/`style.color` assignments) becomes template bindings/computed properties instead.
- From the burndown-chart data preparation inside `renderBurndown` (`js/dashboard.js:148-342`, 194 lines — the largest and highest-risk function in the file): the pure data-shaping logic (grouping timesheet rows by date/task, computing cumulative burn vs. planned curve) extracted into `js/lib/portfolio-calc.js`; the chart-drawing/canvas or chart-library invocation itself stays as a Vue method (charting libraries typically need direct DOM/canvas access, not pure-function-friendly).
- Both extracted functions get vitest unit tests — the one part of this page getting new automated coverage, matching every prior migration's judgment call (DOM orchestration stays manual-verification-only).

**Portfolio overview**: `v-for`-driven project cards over a reactive array, client/program `<select>` filters bound via `v-model`, replacing `buildProjectCard`'s manual HTML string building.

**Per-project dashboard**: KPI values as computed properties (backed by `computeKpis()`), burndown chart driven by the extracted data-prep function, summary/task tables as `v-for`-driven templates replacing `renderSummaryTable`/`renderTaskTables`'s manual DOM building.

**Dropped entirely (not ported — confirmed dead, see Investigation findings):**
- `#configModal` and everything nested inside it: its own Form/JSON tab toggle, `clientsModal`/`clientEditModal`, `programsModal`/`programEditModal` (unreachable except through the dead `#configModal`).
- `rolesModal`/`roleModal` and the roles-JSON-viewer hook.
- The three empty placeholder section divs (`#portfolioPlanningSection`/`#pipelineBoardSection`/`#costGridEditorSection`) and `js/portfolio.js`'s dead duplicate `showPortfolioPlanningView`.
- `js/roles.js` script load.

**Kept, called as globals (unchanged, not rewritten):** `getClientName()`/`getPrograms()` (`js/clients.js`/`js/programs.js`), `openShareModal()` (`js/shares.js`), `openAiAnalysis()` (`js/ai.js`), actuals upload helpers (`js/upload.js`).

## Data flow

No API contract changes. Same endpoints for project/config loading, timesheets/actuals, AI analysis, sharing. KPI/burndown computation happens entirely client-side over data already loaded.

## Error handling

Identical to today — no native dialogs exist here to convert; error handling already reactive (e.g., actuals-load failure states).

## Backward compatibility

- Every reachable feature (overview, dashboard, AI analysis, share, load actuals, viewer gating) is a 1:1 port.
- Removed sections (`#configModal` + nested modals, placeholder divs, dead duplicate function) were never reachable — nothing observable changes for a user of this page.
- `js/clients.js`/`js/programs.js`/`js/shares.js`/`js/ai.js`/`js/config-form.js` themselves are untouched as files. This page simply stops loading `js/config-form.js` (it was only ever needed for the now-removed `#configModal`) — dropping one page's own `<script>` tag has no effect on any other page, regardless of whether other pages still load that same file (e.g. `portfolio.html`'s own `#configModal` history aside, `js/config-form.js` remains untouched and available for whichever pages still reference it).

## Testing

`js/lib/portfolio-calc.js`'s extracted functions get real vitest unit tests covering KPI and burndown-data-prep math — new coverage this page never had. Everything else (rendering, view switching, modals, filters) is manual, post-merge, browser-based verification — `pdash-nginx` serves `main`'s working directory only, same constraint as every prior migration in this roadmap.

## Explicitly out of scope

- `js/clients.js`, `js/programs.js`, `js/roles.js`, `js/shares.js`, `js/ai.js`, `js/config-form.js`, `js/upload.js` themselves — untouched, genuinely shared with other pages (except `js/roles.js`, whose *load* is dropped from this page specifically since it's unused here — the file itself is untouched and still exists for whichever other pages still use it).
- Migrating `pipeline.html`, `costgrid.html`, or `planning.html` — each a separate future Tier 2 cycle.
- Resolving the clients/programs/roles Vue-vs-Vanilla consolidation question at a project-wide level — still no Tier 2 page examined so far has a reachable need for the full CRUD UI; deferred until one does.
- Any build-step introduction (Vite/SFC).
- Any backend/API change.
