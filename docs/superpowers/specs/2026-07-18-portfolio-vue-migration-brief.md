# `portfolio.html` Vue 3 Migration — Brief

**Scenario:** 2 (evolution of an existing page).

**Source:** Second Tier 2 page per `docs/superpowers/specs/2026-07-14-vue-migration-roadmap-design.md`. Originally selected because it appeared to be the one remaining Tier 2 page with a *reachable* full clients/programs/roles CRUD UI — investigation below found this premise was wrong (see Current behavior). Proceeding anyway per user decision: migrate the live dashboard, and remove the confirmed-orphaned `#configModal`/roles-management code rather than port it, following the same "confirmed-dead code is not ported" precedent established in the `terms.html`/`_db-reset.html`/`project-config.html` cycles.

---

## Current behavior

Read in full from `portfolio.html` (680 lines) and `js/portfolio.js` (568 lines), cross-referenced against `js/clients.js`/`js/programs.js`/`js/roles.js`/`js/dashboard.js`:

- **Two live views + three dead placeholder divs.** `portfolio.html` actually renders: (a) the portfolio overview (`#portfolioSection`, `:129-144` — project cards grid, client/program filters, program-summary rollups) and (b) the per-project dashboard (`#mainContent`/`#dashboard`, `:38-126` — KPIs, burndown chart, summary tables). Three other section divs (`#portfolioPlanningSection`, `#pipelineBoardSection`, `#costGridEditorSection`, `:149-151`) are permanently empty (`display:none`, no children) — the comment directly above them (`:148`) says *"Placeholder sections (referenced by portfolio.js but live on other pages)"*. `showPipelineBoardView()`/`showCostGridEditorView()` (`:462-468`) are `window.location.href` redirects to `/pipeline.html`/`/costgrid.html`, never populate these divs.
- **`showPortfolioPlanningView` is defined twice** — once in `js/portfolio.js:482-494` (calls a `renderPortfolioPlanningView()` that doesn't exist in this page's loaded scripts, only in `js/planning.js:396` which portfolio.html never loads) and once in the page's own later inline `<script>` (`:454-456`, `window.location.href = '/planning.html'`). Since the inline script runs after `js/portfolio.js` loads and both are plain top-level function declarations, the inline version wins — `js/portfolio.js`'s version is dead code on this page.
- **`#configModal` (`:170-282`) is confirmed orphaned**, same pattern already found and left alone in the `project-config.html` cycle. The visible buttons that would normally reach it — `#btnOpenConfig` (`:140`) and `#btnConfigureProject` (`:65`) — are wired (`:526-531`) to redirect to `/project-config.html` instead of opening `configModal`. The only code path that still calls `openConfigModal(...)` is a dead branch (`:499-502`) gated on a `?configure=true` URL param that no file in the repo ever sets (confirmed via repo-wide grep). This modal houses its own Form/JSON tab toggle (`.cfg-tab-btn`, `:176-177`, wired to `cfgSwitchTab` at `:544-546`) — also unreachable as a result.
- **`showClientsModal()`/`showProgramsModal()` (full CRUD list modals) are themselves unreachable** — both are only triggered from buttons *inside* `#configModal` (`:195`, `:202`), which is itself unreachable per the above. `clientsModal`/`clientEditModal` (`:392-419`) and `programsModal`/`programEditModal` (`:361-389`) are real, functional CRUD implementations (`js/clients.js:35-95`, `js/programs.js:29-95`) — just with no live door to them on this page.
- **`rolesModal` (`:323-342`) is never triggered from anywhere** in `portfolio.html`/`js/portfolio.js` (confirmed via repo-wide grep — `showRolesView()`'s only call site is its own definition in `js/roles.js:31`). The "＋ Add role"/`roleModal` dialog (`:345-358`, wired at `:668-670`) and the roles-JSON-viewer hook (`getRoles()` at `:672`, inside a `btnRolesShowJson` handler) are both nested inside `rolesModal`'s DOM — since `rolesModal` never opens, none of this is reachable either.
- **Live, reachable data functions vs. dead modal UI — verified by direct grep, not assumed:**
  - `getClientName()` (from `js/clients.js`) **is genuinely used** in `js/portfolio.js`'s live code (`:10, 331, 336, 372, 403, 513` — client filter dropdown, sort-by-client, client name display on cards/summaries). `js/clients.js` must stay loaded.
  - `getPrograms()` (from `js/programs.js`) **is genuinely used** (`js/portfolio.js:365, 512` — program summary rollups, program name resolution). `js/programs.js` must stay loaded.
  - `getClients()` (the raw list, as opposed to `getClientName()`) and any call to `getRoles()`/`js/roles.js` exports are **never called** in `js/portfolio.js`'s live code — confirmed via grep, zero matches. `js/roles.js` can be dropped entirely, matching the precedent already set for `project-config.html`.
- **Zero native `alert()`/`window.confirm()` calls** in `portfolio.html` or `js/portfolio.js` — confirmed via grep. This page already exclusively uses the custom `showConfirm(...)` modal (`confirmModal`, `:156-167`), consistent with the convention now recorded in project memory. Nothing to retrofit here.
- **Viewer-mode gating** is present but far sparser than `project-config.html`'s: `js/portfolio.js:191,193` hide the "⚙️ Configure"/"📂 Load Actuals" buttons on project cards for `my_permission === 'viewer'`; `js/dashboard.js:38,42` gates `#btnConfigureProject`'s visibility the same way inside the per-project dashboard view. No other viewer-gating found in this file (Roles/Clients/Programs modals, AI Analysis, Share modal show no permission checks here — inherited from backend enforcement).
- **10 modals total** in `portfolio.html`: `confirmModal` (custom confirm, live), `configModal` (dead, see above), `aiModal` (AI analysis result, live — `#btnAiAnalysis` → `openAiAnalysis()`), `jsonViewerModal` (generic JSON viewer, live for config-export paths, dead for the roles hook specifically), `rolesModal`/`roleModal` (dead), `programsModal`/`programEditModal` (dead — only reachable via dead `configModal`), `clientsModal`/`clientEditModal` (dead — same).
- **Script load order** (`:429-449`): bootstrap, xlsx, `js/api.js`, `js/core.js`, `js/settings.js`, `js/notifications.js`, `js/roles.js`, `js/costgrid.js`, `js/lib/cfg-parse.js`/`costgrid-calc.js`/`status-rules.js` (modules), `js/config-form.js`, `js/upload.js`, `js/dashboard.js`, `js/clients.js`, `js/programs.js`, `js/portfolio.js`, `js/ai.js`, `js/api-sync.js`, `js/shares.js`, `js/nav.js`.
- **`initNav('portfolio', {...})`** called at `:482`, with an early return at `:486` if no user.

---

## Expected behavior

1. **Rewrite `portfolio.html` as a Vue 3 app** (CDN, `Vue.createApp({...}).mount(...)`, no build step) — same pattern as every prior migration in this roadmap.
2. **1:1 port of every reachable feature**: portfolio overview (project cards grid, client/program filters, program-summary rollups), per-project dashboard (KPIs, burndown chart, summary/task tables), AI Analysis modal, Share modal integration, Load Actuals, viewer-mode button gating.
3. **Confirmed-dead code is not ported** (matching the established precedent): `#configModal` and everything nested inside it (its own Form/JSON toggle, and — since they're only reachable through it — `clientsModal`/`clientEditModal`/`programsModal`/`programEditModal`), `rolesModal`/`roleModal` and the roles-JSON-viewer hook, the three empty placeholder section divs, and `js/portfolio.js`'s dead duplicate `showPortfolioPlanningView`/`renderPortfolioPlanningView` reference.
4. **Drop the `js/roles.js` load** — confirmed entirely unused in live code (same finding, same fix as `project-config.html`).
5. **Keep `js/clients.js` and `js/programs.js` loaded** — `getClientName()`/`getPrograms()` are genuinely used by the live dashboard/overview code. These files' own CRUD-modal exports (`showClientsModal`, `openClientEditModal`, etc.) simply go unused after the retrofit, same as `project-config.html`'s situation with these same two files.
6. **No native alert/confirm retrofit needed** — this page already has zero native dialog calls.

---

## Constraints

- Vue 3 via CDN only — no build step, no bundler.
- No change to any API endpoint used today (project/config loading, AI analysis, timesheets/actuals, share modal's underlying calls).
- Follow the now-recorded project convention (`feedback_vue_migration_conventions.md`): no native `alert()`/`window.confirm()` (already satisfied — nothing to introduce), one Bootstrap modal-management idiom (`bootstrap.Modal.getOrCreateInstance(...)` per-call, matching `project-config.html`'s established style) for every modal this page keeps (`confirmModal`, `aiModal`, `jsonViewerModal`, plus whatever the Share modal integration requires — verify `js/shares.js`'s own modal-instantiation pattern during design, since it's a shared file not being rewritten here).
- `js/shares.js` (share modal) and `js/ai.js` (AI analysis) are shared files, not touched by this cycle — only `portfolio.html` itself and its own inline logic are rewritten; verify during design exactly how these two files' functions get called from the new Vue instance (likely unchanged global function calls, same as `project-config.html` calling `getClients()`/`getPrograms()` as globals).
- `pdash-nginx` serves `main`'s working directory only — manual verification is a post-merge step, same as every prior cycle.
- **Size flag**: `portfolio.html` (680 lines) + `js/portfolio.js` (568 lines) live logic is comparable in scale to `project-config.html`'s prior migration. Whether this becomes one implementation plan or needs task-level decomposition is a `/brainstorming`/`writing-plans` question, not decided here (same judgment call already made successfully for `project-config.html`).

---

## Acceptance criteria

- [ ] `portfolio.html` is rewritten as a Vue 3 app (`Vue.createApp(...).mount(...)`), no build step.
- [ ] Portfolio overview (project cards, client filter, program filter, program-summary rollups) renders and behaves identically to today.
- [ ] Per-project dashboard (KPIs, burndown chart, summary tables, task tables) renders and behaves identically to today.
- [ ] AI Analysis modal, Share modal integration, and Load Actuals button all work identically to today.
- [ ] Viewer-mode button gating (Configure/Load Actuals hidden for `my_permission === 'viewer'`) behaves identically.
- [ ] `#configModal` and its nested Client/Program/Roles CRUD modals are removed, with no regression to any reachable feature (none of them were reachable to begin with — this is a removal of dead weight, not a feature loss).
- [ ] The three empty placeholder section divs (`#portfolioPlanningSection`/`#pipelineBoardSection`/`#costGridEditorSection`) and the dead duplicate `showPortfolioPlanningView` are removed.
- [ ] `js/roles.js` is no longer loaded on this page; `js/clients.js`/`js/programs.js` remain loaded.
- [ ] Manual browser verification (post-merge) confirms all of the above, covering at minimum: portfolio overview with filters, opening a project's dashboard, AI analysis, share modal, load actuals, and viewer-mode rendering for a shared/viewer-permission project.

---

## Explicitly excluded scope

- Any change to `js/clients.js`, `js/programs.js`, `js/roles.js`, `js/shares.js`, `js/ai.js`, or `js/config-form.js` themselves — these are genuinely shared with other pages (`js/clients.js`/`js/programs.js`/`js/roles.js` with `costgrid.html`/`planning.html`/`pipeline.html`; `js/shares.js`/`js/ai.js` likely elsewhere too) — this cycle only changes what `portfolio.html` loads/calls, not their contents.
- **Correction (confirmed during brainstorming): `js/dashboard.js` (1058 lines) is NOT excluded scope** — confirmed via grep to be loaded exclusively by `portfolio.html` (no other page references it), so its KPI/burndown/summary-table rendering logic is migrated into the same Vue rewrite, not left as a separate Vanilla-JS file the new Vue instance calls into. This substantially increases this cycle's scope versus the original Brief estimate.
- Migrating `pipeline.html`, `costgrid.html`, or `planning.html` — each is a separate future Tier 2 cycle.
- Resolving the clients/programs/roles Vue-vs-Vanilla consolidation question in any deeper sense than "this page's own dead CRUD modals are removed, not migrated" — the underlying duplication between `config.html`'s independent Vue CRUD and `js/clients.js`/`js/programs.js`/`js/roles.js`'s Vanilla CRUD remains unresolved project-wide, since no Tier 2 page examined so far has a *reachable* need for the full CRUD UI.
- Any build-step introduction (Vite/SFC).
- Any backend/API change.

---

## Open questions for `/brainstorming`

1. **Scope decomposition**: given the comparable size to `project-config.html` (which used a single design spec + multi-task implementation plan successfully), confirm the same approach applies here, or decide otherwise.
2. **`js/shares.js`/`js/ai.js` integration pattern**: how does the new Vue instance call into these shared, unmodified files' modal-opening functions — as plain global function calls (matching `project-config.html`'s precedent for `getClients()`/`getPrograms()`), or does either file need a closer look at its own modal-instantiation idiom to keep the "one modal idiom" convention consistent?
3. Should the dead-code removal (`#configModal` + nested modals, placeholder divs, duplicate `showPortfolioPlanningView`) happen in the same task as the main Vue rewrite, or as a distinct early step within the same plan (mirroring how `project-config.html`'s plan handled its own dead-code omissions as explicit, separate acceptance criteria rather than silent omissions)?

Brief ready. Next step: /brainstorming.
