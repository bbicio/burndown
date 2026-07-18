# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

For the development workflow (new feature / evolution / audit-fix), see [docs/superpowers/PROCESS.md](docs/superpowers/PROCESS.md).

**Process override — closing a development branch:** in this project, `/finish-cycle` (`.claude/commands/finish-cycle.md`) is the terminal step of every execution phase, whether run inline, via `superpowers:executing-plans`, or via `superpowers:subagent-driven-development`. Never invoke `superpowers:finishing-a-development-branch` at the end of a plan's execution — `/finish-cycle` already performs its own test gate, code review, `--no-ff` merge, push, and worktree cleanup (Gate 4). Do not merge or push a feature branch by any other means (manual `git merge`/`git push`, or the generic finishing skill) before `/finish-cycle` has run.

## Development

The app runs via Docker Compose. Start everything with:

```bash
docker compose up
# then open http://localhost
```

The nginx container serves static files; the api container runs Node.js/Express on port 3000; the db container runs PostgreSQL 16.

Hot reload for the API: `./api/src` is volume-mounted into the container, so Node.js file changes are picked up by nodemon without a rebuild.

To bootstrap the first admin user (or reset a password):

```powershell
docker exec pdash-api node /app/src/create-admin.js <email> <password> [firstName] [lastName]
```

To run database migrations:

```powershell
docker exec pdash-db psql -U pdash -d pdash -f /path/to/migration.sql
```

To test a feature branch in isolation before merging (separate containers/ports, doesn't touch the `main` stack):

```bash
scripts/test-branch.sh up    # build + start, clone data from main if running
scripts/test-branch.sh down  # tear down
```

No bundler, no build step for the **runtime** — nginx serves `js/`/`css/` files exactly as they are on disk, and this must stay true.

A dev-only test toolchain exists for the frontend: root `package.json` + vitest + jsdom, isolated from the runtime (see `js/lib/` below). It is never bundled, never served — `node_modules/`, `package.json`, `package-lock.json`, `vitest.config.js`, and any `*.test.js`/`*.spec.js` file are explicitly denied in `nginx.conf`. Run tests with `npm test` (single run) or `npm run test:watch`.

The backend has its own, separate unit-test toolchain: Node's built-in `node:test` runner (zero new dependency), scoped to `api/src/**/*.test.js` via `api/package.json`'s `"test"` script (`node --test src/**/*.test.js`, run from inside `api/`). This is deliberately kept independent from the frontend's `vitest` config — `vitest.config.js`'s `include` (`js/**/*.test.js`) never picks up `api/` files, and the backend runner never touches `js/`. Files that `require()` Express/DB modules (e.g. `api/src/routes/timesheets.test.js`, which imports `./timesheets`) need `api`'s `node_modules` present — run via `docker exec pdash-api node --test src/...` (the container already has them and volume-mounts `api/src` live) if the host has no `api/node_modules` installed. Pure `api/src/lib/*.test.js` files have no such dependency and run anywhere.

Still no linter on the frontend or backend.

---

## Architecture

Multi-page Vanilla JS app backed by a Node.js/Express REST API and PostgreSQL. No frontend framework.

### Pages

| File | Route | Purpose |
|---|---|---|
| `index.html` | `/` | Redirect → `/pipeline.html` |
| `pipeline.html` | `/pipeline.html` | Pipeline board + cost grid editor access |
| `portfolio.html` | `/portfolio.html` | Project reporting dashboard |
| `planning.html` | `/planning.html` | Resource planning view |
| `costgrid.html` | `/costgrid.html?cgId=&verId=` | Cost grid editor (full-page) |
| `timesheets.html` | `/timesheets.html` | XLS timesheet upload management |
| `config.html` | `/config.html` | Clients / client groups / programs / roles / pipelines & POT targets (admin only) |
| `project-config.html` | `/project-config.html?projectId=` | Full-page project config form (tasks, phasing, planning, groups); viewer mode: sticky read-only banner + all inputs disabled + action buttons hidden |
| `admin.html` | `/admin.html` | User management — invite, role, disable, anonymize (admin only); T&C editor |
| `terms.html` | `/terms.html?next=` | Public (auth required) — T&C acceptance page shown on first login or after version bump |
| `login.html` | `/login.html` | Public — login form |
| `activate.html` | `/activate.html?token=` | Public — account activation |
| `reset-password.html` | `/reset-password.html?token=` | Public — password reset |
| `_db-reset.html` | `/_db-reset.html` | Admin-only hidden page for bulk DB data deletion by scope, Vue 3 (CDN, no build step, same pattern as `admin.html`), now with navbar (`initNav(null, ...)`, no nav-tab entry); also has "Delete single proposal" widget (UUID input, cascade delete) and "Change proposal owner" widget (UUID + active-user dropdown) |

### File structure

```
index.html               — 9-line redirect to pipeline.html
pipeline.html            — kanban board
portfolio.html           — project reporting dashboard
planning.html            — resource planning
costgrid.html            — cost grid editor
timesheets.html          — timesheet upload (admin only)
config.html              — config UI (clients / client groups / programs / roles / pipelines & POT targets; admin only)
project-config.html      — full-page project config form (tasks, phasing, planning, groups), Vue 3 (CDN, no build step, same pattern as admin.html); single reactive project object, not an array; unknown ?projectId= shows an explicit not-found state instead of falling back to a random project; no longer loads js/config-form.js or js/roles.js
admin.html               — user management (invite, role, disable, anonymize; admin only); T&C editor (view/edit/publish)
terms.html               — standalone T&C acceptance page (no navbar/initNav), Vue 3 (CDN, no build step, same pattern as login.html); redirected to by initNav() gate
css/tokens.css           — design tokens (single source of truth for colors/type)
css/style.css            — component styles referencing tokens
js/api.js                — Api.* namespace, apiFetch wrapper (401 → redirect to login)
js/api-sync.js           — in-memory ↔ API sync layer (cgSyncFromApi, loadConfigFromApi, etc.); `cgSyncFromApi` stores `myPermission: g.my_permission` on each `_cgStore` entry; `_apiProjectToLocal` maps `my_permission: p.my_permission || 'owner'` and converts ISO currency code → symbol (`EUR→'€'`, `USD→'$'`, `GBP→'£'`) for the form select; `_pushProjectToApi` converts symbol → ISO code before PATCH to satisfy `currencies` FK constraint — fields not listed here are silently dropped even if returned by API; `_cgApiVersionToLocal` maps `taskIds` and `taskNames` from `lp.task_ids`/`lp.task_names` on each linked-project entry
js/lib/                  — pure functions extracted for unit testing (vitest + jsdom), each an ES module
                            (`export function ...`) with a `window.<name> = <name>` bridge for existing classic-script
                            callers; see "Script loading order" below. `cfg-parse.js` — `cfgParseHours`,
                            `cfgFmtHours`, `roundToQuarterHour` (moved from config-form.js), `distributeHoursExact(total, rawValues, grid=0.25)`
                            (largest-remainder rounding: floors every raw value to `grid`, then hands the missing
                            grid-steps to the containers with the largest fractional remainder — ascending key as
                            tie-break — so the returned values always sum to exactly `roundToQuarterHour(total)`;
                            throws on a negative `rawValues` entry or if `Σ rawValues` diverges from `total` by more
                            than 0.05). Used by `cfgDerivePhasing`/`cfgReforecast` in `config-form.js` so the
                            planning-grid total shown in the confirmation modal always matches what gets saved.
                            `planning-calc.js` — `matchesTaskRole(record, taskName, role)`: case-insensitive on
                            both role and task name, null-safe (a missing `taskName` matches on role alone, never
                            throws). `computeResidual(soldH, consumedH)`: `Math.max(0, soldH - consumedH)`,
                            extracted verbatim from three previously-divergent inline implementations. Both are
                            consumed identically by all three grouping views in `planning.js` (by-role, by-project,
                            by-owner) — previously by-role/by-project crashed on a task with no name and by-owner
                            was case-sensitive on both fields. `distributeFutureResidual(residualH,
                            totalFutureWeeks, weeksByMonth, pulseEnabled)`: computes `hPerWeek` from the task's
                            canonical remaining-week count (not the currently-visible date window); when
                            `pulseEnabled && hPerWeek < 1`, aggregates each month's weeks into one entry placed on
                            that month's first week with hours proportional to its week count; otherwise returns
                            one entry per week at a flat `hPerWeek`. Consumed identically by all three grouping
                            views — previously by-owner used the visible window's week count for its pulse
                            threshold (so paging could flip it) and split hours equally per month regardless of
                            week count, both since unified with by-role/by-project's already-correct behavior;
                            `countFutureTaskMonths()` (the old by-owner-only helper this replaced) was removed as
                            dead code. Loaded via `<script type="module">` on `planning.html`, before `planning.js`.
                            `status-rules.js` — `getStatusRule(pipeline)`: returns `{ options: string[] | null,
                            disabled: boolean }`, the single source of truth for which project Status values are
                            selectable per pipeline stage (`SIP` → empty + disabled; `Canceled` → `options: null`
                            meaning "leave current value untouched", disabled; `Committed`/`Expected`/`Anticipated`
                            each have their own list, all spelled `'Completed'` — matching `statusBadge()`/
                            `statusBadgeLarge()` and `planning.js`'s Resource Planning filter, never `'Complete'`).
                            Replaces `js/core.js`'s previous inline `allowed`/`allOpts` map, which had `Committed`
                            missing `Started At Risk` (present for `Expected`/`Anticipated`) and used the spelling
                            `'Complete'`, which no other consumer in the codebase recognized. Loaded via
                            `<script type="module">` on `project-config.html` and `portfolio.html`, before `core.js`.
                            `costgrid-calc.js` — `versionHasFreeTasks(ver)`: true if any task in
                            `ver.phases[].tasks[]` is absent from every `ver.linkedProjects[].taskIds`/`taskNames`.
                            `isVersionCommittedLocked(ver)`: `ver.pipeline === 'Committed' && !versionHasFreeTasks(ver)`
                            — keyed on the *proposal's own* pipeline field, not any individual linked project's.
                            Used by `cgGetVersionLockState()` (`js/costgrid.js`) for its `committed` lock reason;
                            previously that check read a linked project's own `pipeline` field and locked the whole
                            version (hiding Generate Project, disabling the editor) as soon as *any single* linked
                            project reached Committed, even with other tasks in the same version still unmapped.
                            Loaded via `<script type="module">` on every page that can render version lock state:
                            `project-config.html`, `portfolio.html`, `planning.html`, `pipeline.html`, `costgrid.html`.
js/core.js               — state, in-memory helpers (loadConfig/persistConfig are no-ops), shared badges, esc(), fmtH(), fmtMoney(); `statusBadge()` small style for pipeline cards; `statusBadgeLarge()` same size/style as `pipelineBadge()` — used only in linked-project chips in the editor and detail panel; `cfgApplyPipelineRules(pipeline, currentStatus)` — thin DOM wrapper around `js/lib/status-rules.js`'s `getStatusRule()`, applies the returned `{options, disabled}` to the `#cfgStatus` `<select>`; still used by `js/config-form.js` (i.e. `portfolio.html`'s own config modal) but **not** by `project-config.html`, whose Vue rewrite calls `getStatusRule()` directly from a reactive `sanitizeStatus()` method instead (no `#cfgStatus` element exists on that page anymore)
js/nav.js                — navbar + footer injection, initNav(); injects settings, change-password, send-notification,
                            and "My Profile" modals; T&C gate after GET /api/auth/me (redirects to /terms.html
                            if user.terms_version < current_terms_version); calls initNotifications(); stores window.__navUser
js/notifications.js      — bell icon + SSE notification panel; initNotifications(user) called by nav.js
js/shares.js             — share modal (cost_grid and project); loads active non-admin users from `GET /api/users/active-list` into a searchable in-memory dropdown; supports adding new shares and editing permission (editor/viewer) on existing ones via the same upsert API; `_shareAllUsers` module var is the immutable source list; `_shareUserList` excludes already-shared users
js/pipeline-board.js     — kanban render, pbOpenDetailPanel, pbCloseDetailPanel; caches `_pbRatecards` (from Api.ratecards.list) for ratecard name display in detail panel; version tabs, Clone button, and Delete Draft button in detail panel; hides Edit/Clone/Delete controls for viewers (`cg.myPermission !== 'viewer'`); pipeline card badge shows `pipelineBadge(v.pipeline)` (stage, not project status); `pbLoadPotSection` falls back to `v.clientId` when no linked project provides a clientId; POT `committed_total`/`anticipated_total` read directly from `GET /api/pots/summary` response (server-side, all proposals) — not from `_pbBudgets` cache; POT section shows split: Total% (C+A), Committed (green), Anticipated (orange) with dual-segment progress bar; linked-project chips use `statusBadgeLarge()` for project status; chips display assigned task list from `lp.taskNames` (R5); `_pbOutsideClickHandler` closes the panel on `mousedown` outside `#pbDetailPanel` — registered by `pbOpenDetailPanel` with a 200ms delay and removed by `pbCloseDetailPanel`
js/costgrid.js           — cost grid editor (phases/tasks/roles table, save/load/version logic); declares `_pbCloneSource` (shared with pipeline board); Clone + Delete Draft buttons in editor toolbar; `cgConfirmDeleteVersion(cgId, verId, label, onSuccess?)` accepts optional callback (editor passes redirect, list/panel pass re-render); non-EUR role rate 3-level fallback: ratecard override → `role.rateOverrides[currency]` → EUR rate × factor; both `cgSyncRoleRatesToBaseline` and `cgPreviewRateChange` use this chain; `_cgCompactHeader` (localStorage `PDash_cgCompactHeader`) toggles compact/normal blue header row via ⊟/⊞ button in the "Phase / Task" sticky cell — compact hides role move/change/dup/remove buttons and reduces header font to 10px; **task assignment (R1–R5)**: `cgGetAssignedTaskIds()` + `cgGetAssignedTaskNames()` dual UUID+name check — assigned tasks have no ✕ button; `cgDoAddTasksToProject` and `cgDoGenerateProject` send `taskNames`; Generate Project button hidden when all tasks are mapped; `_cgEnsureAddToProjectModal()` is a singleton modal appended to `document.body` (z-index:10500); `cgGetVersionLockState(cgId, versionId)` — `other-version-active` reason (a sibling version already has linked projects) is whole-version and unchanged; `committed` reason now uses `js/lib/costgrid-calc.js`'s `isVersionCommittedLocked()` — locks only once the proposal's own pipeline is `Committed` **and** every task has been migrated to a project, not as soon as any single linked project reaches Committed; `cgPropagatePipelineToProjects()` pushes `_cgDraft.pipeline` onto every entry in `_cgDraft.linkedProjects` whenever the editor's Pipeline `<select>` changes (`js/costgrid.js` `change` listener) — the only way a version's pipeline is ever changed (no drag-and-drop on the pipeline board), so `config.projects[].pipeline` for a cost-grid-generated project never goes stale relative to its source version
js/portfolio.js          — portfolio dashboard + resource planning view; hides Configure and Load Actuals buttons for viewers (`cfg.my_permission !== 'viewer'`)
js/planning.js           — resource planning table filters (project/team dropdowns, group-by role/project/owner, monthly/weekly interval, monthly pulse, rounded-hours toggle) and the Gantt view (phase-level bars, colour-coded by pipeline stage, today marker); loaded by `planning.html`
js/dashboard.js          — per-project KPI + burndown render; hides Configure button for viewers (`proj?.my_permission !== 'viewer'`)
js/config-form.js        — project config form (tasks, phasing, planning, groups); hours parsing/formatting delegated to `js/lib/cfg-parse.js`
js/roles.js              — roles management modal; `loadRolesFromApi` maps `rateOverrides: r.rate_overrides || {}` on each role; role shape is `{ id, label, code, rate, rateOverrides }`
js/upload.js             — Excel timesheet parsing
js/settings.js           — openSettingsModal() / saveSettingsModal(); reads window.__navUser; all
                            appSettings / AI_MODELS / getRoles references guarded with typeof checks
js/ai.js                 — AI sidebar chat + project analysis
js/clients.js            — client CRUD helpers
js/programs.js           — program CRUD helpers
js/ratecards.js          — rate cards admin modal + loadRatecardsForDropdown() cache used by costgrid.js;
                            client-specific rate editing is via openClientRatecard() in config.html (Vue method);
                            `_rcRenderEntries` pre-populates non-EUR column placeholders with agency default from `_rcRoles[rid].rate_overrides[currency]`;
                            `_rcSaveEntries` collects `.rc-override-rate` inputs and sends `rateOverrides` per role
api/src/routes/          — Express routes (auth, users, config, cost-grids, projects, timesheets,
                            reporting, exports, notifications, pipeline-years, client-groups, pots, reset, app-settings)
api/src/lib/              — pure functions extracted for unit testing (node:test, run via `npm test`/`node --test`
                            from `api/`), mirroring the frontend's `js/lib/` convention; `date-parse.js` —
                            `parseFlexibleDate(a, b, year)`: disambiguates day/month order deterministically when
                            one value is >12 (unambiguous), falls back to MM/DD (the source export's known
                            convention) only when genuinely ambiguous (both ≤12), validates against real
                            calendar/leap-year arithmetic, throws on an invalid date. Consumed by
                            `api/src/routes/timesheets.js`'s `formatDate()`, which now rejects the entire upload
                            (400, no partial DB writes) if any row's date can't be resolved.
                            `api/src/routes/timesheets.js`'s `resolveColumnMap(headers)` — column-header-to-field
                            resolver for the XLS upload, exported (like `formatDate`) for direct `node:test`
                            coverage. Resolves each of `colDate/colRole/colOwner/colHours/colTask/colNotes/
                            colProjId/colProjName` via case-insensitive substring match against each field's
                            keyword list, tracking already-claimed headers in a `Set` so no physical column can be
                            assigned to two fields (previously an ambiguous header like `"Resource Name"` — matching
                            both role's `resource` keyword and owner's `name` keyword — would silently duplicate
                            role into owner). Field declaration order (`date > role > owner > hours > task > notes
                            > projId > projName`) is the explicit conflict-priority order: whichever field is
                            declared first wins any column conflict.
api/src/routes/exports.js        — POST /api/exports/{portfolio|cost-grids|ratecards}
api/src/routes/notifications.js  — SSE stream, CRUD, push; exports { router, pushToUser }
api/src/routes/pipeline-years.js — CRUD for admin-managed pipeline years
api/src/routes/client-groups.js  — CRUD for client groups + member assignment
api/src/routes/pots.js           — CRUD for POT targets + history; /year-totals; proposals matched via cgv.client_id (not cg_version_projects); `GET /`, `GET /year-totals`, `GET /:id/details` and `GET /summary` all return `committed_total`, `anticipated_total` separately; `/summary` computes these server-side across all proposals (no user-visibility filter) so every caller sees the same POT; all fee subqueries divide by `COALESCE(currency_rate, 1)` for EUR normalisation
api/src/routes/reset.js          — GET /api/admin/reset/scopes + POST /api/admin/reset/:scope (admin-only bulk delete);
                                    scopes: proposals, projects, clients, ratecards, actuals, pipelines, notifications;
                                    POST /api/admin/reset/cost-grid/:cgId — delete one proposal + linked projects (transactional);
                                    PATCH /api/admin/reset/cost-grid/:cgId/owner — reassign proposal owner
api/src/routes/app-settings.js   — GET /api/app-settings/terms (requireAuth); PUT /api/app-settings/terms (requireAdmin);
                                    publishNewVersion=true increments terms_version forcing all users to re-accept
api/src/db/migrations/   — numbered SQL migration files
api/src/services/        — email (nodemailer: sendInvite, sendPasswordReset, sendShareNotification,
                            sendExportEmail, sendAdminNotificationEmail), jwt
api/src/create-admin.js  — CLI bootstrap script (admin user create/reset)
scripts/test-branch.sh   — isolated Docker Compose stack for testing the current feature branch before merge
                            (distinct container names/ports from the main stack, clones data from main via
                            pg_dump/pg_restore when available, falls back to a fresh migrated DB + bootstrapped
                            test admin otherwise); `up`/`down` subcommands; reads `.env` via a manual line-by-line
                            parser (never source/eval — real `.env` values here contain shell-special characters)
```

### Routing

Navigation is URL-based — clicking a nav tab changes `window.location.href`. Each page is a self-contained HTML file that initialises its own data on `DOMContentLoaded`.

Each page calls `initNav(activeTab)` from `nav.js` which:
1. Injects the shared navbar HTML (two-row: logo/icons row + tabs row) and fixed footer
2. Injects the settings modal, change-password modal, send-notification modal, and "My Profile" modal HTML (centralised — do NOT duplicate in page HTML)
3. Calls `GET /api/auth/me` — redirects to `/login.html` on 401; redirects to `/terms.html` if `user.terms_version < user.current_terms_version`
4. Stores the user object in `window.__navUser`
5. Wires all navbar events (account dropdown, settings, change password, notifications)
6. Calls `initNotifications(user)` from `notifications.js`
7. Returns the user object

All authenticated pages must load (in order): `core.js`, `api.js`, `api-sync.js`, `nav.js`, `notifications.js`, `settings.js` — then any page-specific scripts.

Typical page init pattern:
```js
document.addEventListener('DOMContentLoaded', async () => {
  loadSettings();
  const user = await initNav('pipeline');  // returns null on 401 (already redirected)
  if (!user) return;

  await Promise.all([loadClientsFromApi(), loadProgramsFromApi(), loadRolesFromApi()]);
  await Promise.all([cgSyncFromApi(), loadConfigFromApi(), loadPipelineBudgetsFromApi()]);
  renderPipelineBoard();
});
```

### Data strategy (in-memory cache)

In-memory module-level variables are the UI cache; the API is the source of truth. **localStorage is not used for server data** — it holds only `PDash_settings` (AI keys) and `PDash_summary` (portfolio summary selection), both genuinely client-side.

- **On page load**: call `cgSyncFromApi()` / `loadConfigFromApi()` / `refreshTimesheetDataFromApi()` to populate in-memory state from the API. Each page load starts fresh — no stale cross-session data.
- **On user action**: update in-memory state immediately (instant UI), then fire an async API call in the background (fire-and-forget).
- **`loadConfig()` and `persistConfig()` are no-ops** — kept as function stubs so existing callers in HTML pages don't break, but they do nothing. `config.projects` is populated exclusively by `loadConfigFromApi()`.

Key sync functions in `api-sync.js`:

| Function | What it does |
|---|---|
| `cgSyncFromApi()` | Seeds all cost grid metadata into `_cgStore` (in-memory Map) |
| `cgLoadStructureFromApi(cgId, verId)` | Loads phase/task/role structure for one version into `_cgStore` |
| `loadConfigFromApi()` | Loads all projects from API into `config.projects` |
| `loadPipelineBudgetsFromApi()` | Loads pre-computed budget totals indexed by versionId into `_pbBudgets` |
| `refreshTimesheetDataFromApi()` | Loads timesheet rows from API into `timesheetData` + `_timesheetProjectData` |
| `_cgUpsertVersionToApi(cgId, verId)` | Write-through: pushes cost grid version to API |
| `_pushProjectToApi(project)` | Write-through: pushes project (all sub-resources) to API |

**Cost grid store** (`_cgStore` Map in `costgrid.js`): replaces `PDash_cg_*` localStorage keys. `cgLoad/cgSave/cgGetIndex` operate on this Map. Deep-clones on read and write to avoid accidental in-place mutation.

**Rate consistency**: `PUT /api/cost-grids/:id/versions/:vId/structure` always snapshots all role rates as `rate_override` in `task_roles`, regardless of whether the role is custom or ratecard-priced. This ensures the `/budgets` SQL (`COALESCE(tr.rate_override, r.hourly_rate, 0)`) always uses the correct rate. When `cgLoadStructureFromApi` reads structure back, it refreshes `ver.roles` from DB only when all roles have `rate_override` set (meaning the version was saved with the current fix); otherwise it preserves client-side ratecard rates already in memory.

### Pipeline stage: single source of truth

Pipeline stage is stored on `costGridVersion.pipeline`. These locations must stay in sync:

- `css/tokens.css` — `--pipeline-{stage}-bg` / `--pipeline-{stage}-color` for all 5 stages
- `js/core.js` `pipelineBadge()` — uses `var(--pipeline-*-color)`
- `js/costgrid.js` switch block — uses `var(--pipeline-*-color)`
- `js/pipeline-board.js` `PB_STAGE_STYLE` — uses `var(--pipeline-*-bg/color)`

Valid stages: `SIP`, `Expected`, `Anticipated`, `Committed`, `Canceled`.

Kept in sync on `config.projects[].pipeline` (a separate field from `costGridVersion.pipeline`) by `cgPropagatePipelineToProjects()` (`js/costgrid.js`), which runs on every change of the cost grid editor's Pipeline `<select>` and updates every project in `linkedProjects` — the only path that ever changes a version's pipeline stage. `getProjectPipeline(projectId)` (`js/core.js`) resolves the authoritative value for a given project: the linked cost grid version's `pipeline` if `costGridRef` is set, else `config.projects[].pipeline` directly. `js/planning.js`'s Resource Planning view deliberately reads `config.projects[].pipeline` directly rather than via `getProjectPipeline()` — by design, since resource planning applies once a task is converted into a project, not before — this is safe because of the propagation above, not despite it (verified: `docs/superpowers/audits/2026-07-09-project-pipeline-direct-reads-audit.md`).

Do not confuse pipeline **stage** (`SIP`/`Expected`/.../`Canceled`, this section) with project **status** (`Not started yet`/`Started`/`Started At Risk`/`Put on hold`/`Completed` — a separate field, whose allowed values per pipeline stage are defined by `js/lib/status-rules.js`'s `getStatusRule()`).

Helper: `getProjectPipeline(projectId)` — reads from `costGridRef` version first, falls back to `config.projects[].pipeline`.

### Script loading order (`js/lib/*` modules)

Files under `js/lib/` are native ES modules (`export function ...`), loaded via `<script type="module" src="js/lib/...">`, with a `window.<name> = <name>` bridge line per export so existing classic-script callers keep working unchanged.

Module scripts are always deferred: they execute after HTML parsing completes and before `DOMContentLoaded` fires, regardless of their position in the document. Classic non-deferred scripts (`core.js`, `config-form.js`, etc.) execute immediately at parse time, in document order.

**Rule:** a bridged `window.*` global from `js/lib/` may only be read from inside an event handler or a function invoked after `DOMContentLoaded` — never at the top level of a classic script's parse-time execution, since the bridging module may not have run yet at that point. Every current `js/lib/` consumer (e.g. `cfgParseHours`/`cfgFmtHours` calls in `config-form.js`) satisfies this today.

If a future `js/lib/` module needs another `js/lib/` module's function, use a native ES `import` between them (resolved independently of `<script>` tag order in the HTML), not the `window` bridge.

### Linked project resolution

`linkedProjects[].projectId` may contain stale auto-generated IDs if the project was renamed. Correct resolution order in `pbOpenDetailPanel()`:

1. Direct `config.projects.find(p => p.id === lp.projectId)`
2. If null: filter projects by `costGridRef.cgId + versionId` → match by name within that subset
3. Single-project unambiguous fallback

Never use `lp.projectId` raw as the display ID — always resolve to `proj.id`.

### Cost grid editor ↔ pipeline board integration

- `costgrid.html` is a separate page. The back button navigates to `pipeline.html`.
- After delete (grid or version): call `renderPipelineBoard()`
- After JSON import: call `renderPipelineBoard()`
- `showCostGridEditorView(cgId, verId)` redirects to `costgrid.html?cgId=...&verId=...`
- On `costgrid.html` cold load: call `cgSyncFromApi()` before reading URL params to avoid empty `_cgStore`

### Version tab switching (editor)

Version tab click handlers in `renderCgVersionTabs` are **async**: they call `await cgLoadStructureFromApi(cgId, verId)` before `showCostGridEditorView()` to ensure the structure is fetched before rendering. The URL is also synced via `history.replaceState` after switching.

### Clone (`cgCloneGrid`)

`_pbCloneSource = { cgId, verId, name }` is declared in `costgrid.js` (not `pipeline-board.js`) so it is available on both `pipeline.html` and `costgrid.html`.

Clone flow:
1. Clears `_cgAutoSaveTimer` (clearTimeout) to prevent concurrent save on the original during clone
2. Creates a new cost grid + version via API; new version label is always `'v1'` regardless of the source label
3. Copies phase/task/role structure from the source version via `cgLoadStructureFromApi` + `saveStructure`
4. On `costgrid.html`: updates URL to the new `cgId`/`verId` via `history.replaceState` (prevents stale URL state loops)
5. Redirects to the new grid in the editor

### Pipeline board layout (height math)

Navbar: two rows (106px: 10px padding-top + 44px top row + 52px tabs row). Footer: fixed 100px.

`#pipelineBoardSection { height: calc(100vh - 206px) }` — 106px navbar + 100px footer. Must be kept in sync if navbar/footer height changes.

`#pbColumnsContainer { height: calc(100% - 61px) }` — the 61px is the pipeline section's own header bar.

**Critical**: do NOT add `h-100` class to `#pbColumnsContainer`. Bootstrap's `.h-100` applies `height:100%!important`, which overrides the `calc()` value and hides the sticky totals footer below `overflow:hidden`.

### Detail panel

`#pbDetailPanel` width: 860px. Layout (top to bottom):
- **Version tabs row** (shown only when `cg.versions.length > 1`): horizontal tab buttons with colored stage dot, rendered above the two-column body; clicking a tab calls `pbOpenDetailPanel(cgId, verId)` to reload the panel for that version
- **Two-column body** inside `#pbDetailContent` (a `d-flex flex-grow-1`):
  - Left column (50%): offer metadata + linked projects, `overflow-y:auto`, `border-right`
  - Right column (flex:1): task/phase breakdown, `overflow-y:auto`

Header buttons (right side): `🗑 Delete` · `⧉ Clone` · `🔗 Share` · `✏️ Edit` · `×`

- `🗑 Delete` (`#pbBtnDeleteVersion`): visible only when `stage === 'Draft'`. Calls `cgConfirmDeleteVersion(cgId, verId, label, onSuccess)` where `onSuccess` closes the panel and re-renders the board.
- The Clone button (`#pbBtnCloneCg`) sets `_pbCloneSource = { cgId, verId, name }` for the currently viewed version and opens `#cgCloneModal`.

### Column totals footer

Each pipeline column footer shows:
- **Main value** (bold): professional fees only (`fee` from `pbComputeColumnTotals`)
- **Secondary line** (muted, small): PTC total only, shown only when `ptc > 0`
- Currency symbol is included in the value string via `pbFmtMoney(n, cur)` — do NOT add a standalone currency `<span>` next to it

### Settings modal

The settings modal HTML is injected by `nav.js` (not duplicated in page HTML). It has two tabs:

- **API & Integrations** — AI provider keys (Anthropic / OpenAI / Gemini) stored in `localStorage`
- **Data Manager** — CSV exports (cost grids, portfolio, rate cards), full backup download, admin-only restore

`openSettingsModal()` in `settings.js` reads `window.__navUser` set by `nav.js`. All references to `appSettings`, `AI_MODELS`, `getRoles`, `persistSettings`, `updateAiButtonVisibility` are wrapped in `typeof` guards because those globals are not available on every page.

The "⚙ Settings" entry point is in the account dropdown (top-right navbar), visible on all pages.

### Send Notification modal

`#sendNotifModal` is injected by `nav.js` (moderate size, `max-width:520px`), separate from the Settings modal. Opened via "📣 Send Notification" in the account dropdown — visible to **all** authenticated users.

- Recipient `<select id="sendNotifTarget">` is populated from `GET /api/users/active-list` (any authenticated user; excludes self). An "All users (broadcast)" option is prepended only when `window.__navUser.role === 'admin'`.
- Channel checkboxes: Push notification (default checked) and/or Email — at least one required.
- Submits `POST /api/notifications` with `{ userId?, title, body?, url?, urlLabel?, channels }`. Server enforces that broadcast (omitted `userId`) requires `role === 'admin'`; individual targeting is open to any authenticated user.

### Notifications

`js/notifications.js` is loaded on all authenticated pages. `initNotifications(user)` is called by `nav.js` after navbar injection.

- Bell icon `#nav-notif-btn` in the top navbar row shows the unread count badge
- Panel opens as a Bootstrap dropdown listing last 50 notifications
- Real-time delivery via **SSE**: `new EventSource('/api/notifications/stream', {withCredentials:true})`
- `GET /api/notifications/unread-count` → badge on load
- `PATCH /api/notifications/read-all` → "Mark all read" button
- `PATCH /api/notifications/:id/read` → click on item
- Notifications may carry a `url` deep-link (e.g. `/costgrid.html?cgId=...`) rendered as a clickable link
- Any user can send a notification to another specific user (push and/or email) via the account dropdown's "📣 Send Notification" entry; broadcasting to all users is admin-only. See [Send Notification modal](#send-notification-modal).

`notifications.js` defines a standalone `_esc` fallback at the top in case `core.js` is not loaded on the page.

### Sharing

`js/shares.js` provides a generic share modal. Call `openShareModal(type, id, name)` where `type` is `'cost_grid'` or `'project'`. The modal handles user search by email, permission selection, and removal. Sharing triggers an email notification from the API.

### Design tokens

`css/tokens.css` is the single source of truth. Never use hardcoded hex values in JS or CSS — reference `var(--token-name)`.

Typography scale (all shifted up from Bootstrap defaults):
- `--text-2xs: 0.70rem` → `--text-2xl: 1.25rem`

Palette: steel blue (`--indigo-*`), slate blue (`--violet-*`), sand (`--sand-*`).

Brand: `--brand-navy: #0B1840`, `--brand-magenta: #F0287A`.

### DB migrations

| File | Description |
|---|---|
| `001_initial.sql` | Core schema (users, projects, cost grids, etc.) |
| `002_add_project_extra.sql` | `planning` and `groups` JSONB columns on `projects` |
| `003_add_task_description_dates.sql` | `description`, `start_date`, `end_date` on tasks |
| `004_add_notifications.sql` | `notifications` table |
| `005_drafts_pipeline_year_pot.sql` | `Draft` pipeline stage; `pipeline_year` on versions; `client_groups`; `pots` + `pot_history` |
| `006_pipeline_years.sql` | `pipeline_years` table (admin-managed visible years) |
| `007_version_date_varchar.sql` | `cost_grid_versions.start_date` / `end_date` → `VARCHAR(6)` (`YYYYMM`) |
| `008_version_client.sql` | `client_id UUID` added to `cost_grid_versions` |
| `009_version_project_name.sql` | `project_name VARCHAR(255)` added to `cost_grid_versions` |
| `010_pots_special_label.sql` | `special_label VARCHAR(255)` added to `pots` for virtual targets |
| `011_pot_history_note.sql` | `note VARCHAR(500)` added to `pot_history` for change justification |
| `013_role_rate_overrides.sql` | `rate_overrides JSONB NOT NULL DEFAULT '{}'` added to `roles` for per-currency agency default rates |
| `014_terms_accepted.sql` | `terms_version INTEGER` and `terms_accepted_at TIMESTAMPTZ` added to `users` for T&C acceptance tracking |
| `015_app_settings.sql` | `app_settings` key/value table created; seeded with `terms_version` and `terms_content` |
| `017_task_names_direct.sql` | `task_names_direct JSONB NOT NULL DEFAULT '[]'::jsonb` added to `cg_version_projects`; backfills from `project_tasks` name matching |

Run migrations with:
```powershell
docker exec -i pdash-db psql -U pdash -d pdash < api/src/db/migrations/004_add_notifications.sql
```

### Language constraint

All user-facing text, alerts, labels, and instructions **must be in English**.
