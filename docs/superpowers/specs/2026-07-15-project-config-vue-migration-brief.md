# `project-config.html` Vue 3 Migration — Brief

**Scenario:** 2 (evolution of an existing page).

**Source:** First Tier 2 page per `docs/superpowers/specs/2026-07-14-vue-migration-roadmap-design.md`. Tier 1 (`terms.html`, `_db-reset.html`) is complete; this is the first page in the shared-dependency cluster (`project-config.html`, `pipeline.html`, `portfolio.html`, `costgrid.html`, `planning.html`), chosen because it's the least central/highest-isolation of the 5.

---

## Current behavior

Read in full from `project-config.html` (521 lines) and `js/config-form.js` (1369 lines), cross-referenced against `js/roles.js`/`js/clients.js`/`js/programs.js` and `config.html`:

- **Not Vue today** — classic script-driven page. Zero `Vue.createApp`/`v-`/`{{ }}` occurrences. All rendering is `document.getElementById(...)`/`innerHTML` from `js/config-form.js`.
- **Script load order** (`project-config.html:216-232`): Bootstrap, `window.__cfgFullPage = true` inline flag, `js/api.js`, `js/core.js`, xlsx (CDN), `js/settings.js`, `js/notifications.js`, `js/roles.js`, `js/costgrid.js`, three `js/lib/*` modules (`cfg-parse.js`, `costgrid-calc.js`, `status-rules.js`), `js/config-form.js`, `js/clients.js`, `js/programs.js`, `js/api-sync.js`, `js/nav.js`.
- **`initNav('portfolio', {...})`** called at `project-config.html:324`, gated on the returned user (`:329`).
- **DOM structure**: a single scrolling form (`#cfgFormSections`) with 8 stacked `.cfg-section` blocks (not tabs) — Client, Program (optional), Project info, Actuals, Tasks & Resources, Monthly Budget Phasing, Monthly Hour Planning, Pass Through Costs, Functional Groups (optional) (`project-config.html:38-126`).
- **`js/config-form.js`** is the logic engine: 54 top-level functions covering project load/select (`:58-140`), tasks & resources rendering (`:196-472`), phasing/planning grids including the reforecast/rollback/snapshot machinery (`:517-933`, `cfgReforecast` alone spans `:711-933`), money/grid formatting delegating to `js/lib/cfg-parse.js` (`:937-995`), PTC list (`:1022-1077`), functional groups (`:1087-1110`), a dead form/JSON tab toggle (`:1119-1142`, see below), and save/import/export/XLSX-export (`:1145-1369`).
- **Viewer mode** (read-only banner + disabled inputs + hidden action buttons) is implemented entirely inline in `project-config.html:472-500`, gated on `resolvedProj?.my_permission === 'viewer'`, with a 200ms `setTimeout` to wait for async form render before disabling inputs (`:486-492`).
- **Dead code**: `#cfgTabJson` (`project-config.html:30`) and `cfgSwitchTab` (`js/config-form.js:1119-1142`) implement a Form/JSON view toggle with no `.cfg-tab-btn` trigger anywhere on this page — confirmed unreachable.
- **`js/roles.js`**: loaded (`project-config.html:223`) and `loadRolesFromApi()` called on init, but **entirely unused** by `config-form.js` — zero references to `roles`/`getRoles()`. Dead weight specific to this page. (The roles management modal DOM it provides isn't present on this page either — only `costgrid.html`/`planning.html`/`portfolio.html` have it.)
- **`js/clients.js`/`js/programs.js`**: used narrowly — `cfgRefreshClientDropdown()`/`cfgRefreshProgramDropdown()` populate the `#cfgClientId`/`#cfgProgramId` dropdowns (called from `cfgLoadProject`, `js/config-form.js:107,110`), and `openClientEditModal(null)`/`openProgramEditModal(null)` (`project-config.html:43,50`) open a single add/edit modal (`clientEditModal`/`programEditModal`, `project-config.html:186-213`,`155-183`). The full list-management table modal (`showClientsModal()`/`showProgramsModal()`) is **not** reachable from this page (only from `portfolio.html`).
- **`config.html`** (2071 lines) is already Vue 3 (`Vue.createApp` at `:982`), and independently reimplements clients/programs/roles/ratecards CRUD in its own `data()`/methods (`saveClient`/`saveProgram`/`saveRole` at `:1349,1486,1541`, `openClientRatecard` at `:1917`) — it does **not** load `js/clients.js`/`js/programs.js`/`js/roles.js` at all (confirmed absent). Two fully parallel, non-sharing implementations of the same 3 entity types already exist in the codebase; this predates this migration.

---

## Expected behavior

1. **Rewrite `project-config.html` as a Vue 3 app** (CDN, `Vue.createApp({...}).mount(...)`, no build step, no SFCs) — same CDN pattern as every prior migration.
2. **1:1 functional port** of every current behavior: all 8 form sections, task/resource CRUD, phasing/planning grid rendering and math, reforecast/derive/rollback/snapshot logic, PTC list, functional groups, save/import/export/XLSX-export, and viewer-mode gating (read-only banner, disabled inputs, hidden action buttons) — same outcomes on every branch.
3. **Drop the dead Form/JSON tab toggle** (`#cfgTabJson`, `cfgSwitchTab`) — it's unreachable today and there's no reason to carry it into the rewrite. If dead-code removal proves non-trivial (e.g. tangled into shared logic used elsewhere), split it into its own step within this same cycle rather than blocking the main rewrite.
4. **Drop the `js/roles.js` load** for this page — it's loaded today but entirely unused by `config-form.js`; the new Vue page has no reason to load it.
5. **Client/program dropdown + add-modal**: still needed (actively used), but *how* — own local Vue implementation vs. an extractable shared piece — is an open question for `/brainstorming` (see below), not decided here.

---

## Constraints

- Vue 3 via CDN only — no build step, no bundler.
- No change to any API endpoint this page calls (project CRUD, clients, programs, phasing/planning calculations are all client-side math over data already fetched — verify during `/brainstorming`/design which specific endpoints are in play).
- `config.html`'s own Vue implementation is untouched by this cycle (see Explicitly excluded scope).
- `portfolio.html`, `pipeline.html`, `planning.html`, `costgrid.html` are untouched by this cycle — each still loads `js/roles.js`/`js/clients.js`/`js/programs.js` unchanged, and gets its own future Tier 2 Brief.
- `pdash-nginx` serves the main checkout's working directory only — new behavior isn't visible in a browser until after merge; manual verification is a post-merge step, same as every prior cycle.
- **Size flag**: `js/config-form.js` (1369 lines / 54 functions) is far larger than either prior Tier 1 migration. Whether this becomes one plan or is decomposed into sub-cycles (e.g. tasks/phasing as one pass, planning/groups/save as another) is an open question for `/brainstorming`, not decided here.

---

## Acceptance criteria

- [ ] `project-config.html` is rewritten as a Vue 3 app (`Vue.createApp(...).mount(...)`), no build step.
- [ ] All 8 form sections render and behave identically to today (same fields, same validation, same computed totals).
- [ ] Task/resource add/edit/remove behaves identically, including XLSX export.
- [ ] Phasing/planning grids, reforecast, derive, and rollback/snapshot logic produce identical numeric results to today (this is the highest-risk area — `cfgReforecast` alone is 222 lines).
- [ ] PTC list and functional groups behave identically.
- [ ] Viewer mode (read-only banner, disabled inputs, hidden buttons) behaves identically for `my_permission === 'viewer'`.
- [ ] The dead Form/JSON tab toggle (`#cfgTabJson`/`cfgSwitchTab`) is removed, with no regression to any reachable feature.
- [ ] `js/roles.js` is no longer loaded on this page.
- [ ] Client/program dropdown population and add-modal continue to work, per whatever approach `/brainstorming` selects for the open question below.
- [ ] Manual browser verification (post-merge) confirms all of the above, covering at minimum: loading an existing project, editing each section, saving, reforecasting, rolling back, and viewer-mode read-only rendering.

---

## Explicitly excluded scope

- Any change to `config.html`'s own Vue implementation of clients/programs/roles/ratecards — it stays exactly as-is regardless of what this cycle decides for `project-config.html`.
- Migrating `portfolio.html`, `pipeline.html`, `planning.html`, or `costgrid.html` — each is a separate future Tier 2 cycle with its own Brief.
- Any build-step introduction (Vite/SFC).
- Any backend/API change.
- Open-ended dead-code hunting beyond the one confirmed-dead toggle (`#cfgTabJson`/`cfgSwitchTab`) already identified in Current behavior — this cycle removes that specific piece (as its own step if needed), not an audit of the whole file for other unrelated dead code.

---

## Open questions for `/brainstorming`

1. **Consolidation approach**: should the new Vue `project-config.html` implement its own local client/program dropdown + add-modal (parallel to `config.html`'s independent Vue CRUD and to `js/clients.js`/`js/programs.js`'s Vanilla-JS version — a third parallel implementation), or should this cycle extract a shared, reusable Vue piece (composable/component) that `config.html` and later Tier 2 pages could eventually consume? Scoped narrowly to the dropdown + single add/edit modal pattern this page actually uses — not the full list-management table modal, which this page doesn't use.
2. **Cycle decomposition**: given `js/config-form.js`'s size (1369 lines / 54 functions) far exceeds either Tier 1 migration, should this become one implementation plan, or should `/brainstorming` split it into sequential sub-cycles (e.g., one pass for tasks/resources/PTC/groups, a second for the higher-risk phasing/planning/reforecast/rollback machinery)?
3. Does removing the dead `#cfgTabJson`/`cfgSwitchTab` toggle turn out to be trivial (isolated dead code) or does `cfgSwitchTab` share machinery with something still-live elsewhere in `config-form.js` that needs to stay? (Current behavior only confirms it's unreachable *from this page*, not that the function itself has zero other callers — worth a grep pass at design time.)

Brief ready. Next step: /brainstorming.
