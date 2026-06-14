# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

No package manager, no bundler, no tests, no linter on the frontend.

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
| `project-config.html` | `/project-config.html?projectId=` | Full-page project config form (tasks, phasing, planning, groups) |
| `admin.html` | `/admin.html` | User management — invite, role, disable (admin only) |
| `login.html` | `/login.html` | Public — login form |
| `activate.html` | `/activate.html?token=` | Public — account activation |
| `reset-password.html` | `/reset-password.html?token=` | Public — password reset |
| `migration.html` | `/migration.html` | One-time data migration tool |
| `_db-reset.html` | `/_db-reset.html` | Admin-only hidden page for bulk DB data deletion by scope |

### File structure

```
index.html               — 9-line redirect to pipeline.html
pipeline.html            — kanban board
portfolio.html           — project reporting dashboard
planning.html            — resource planning
costgrid.html            — cost grid editor
timesheets.html          — timesheet upload (admin only)
config.html              — config UI (clients / client groups / programs / roles / pipelines & POT targets; admin only)
project-config.html      — full-page project config form (tasks, phasing, planning, groups)
admin.html               — user management (invite, role, disable; admin only)
css/tokens.css           — design tokens (single source of truth for colors/type)
css/style.css            — component styles referencing tokens
js/api.js                — Api.* namespace, apiFetch wrapper (401 → redirect to login)
js/api-sync.js           — localStorage ↔ API sync layer (cgSyncFromApi, loadConfigFromApi, etc.)
js/core.js               — state, localStorage helpers, shared badges, esc(), fmtH(), fmtMoney()
js/nav.js                — navbar + footer injection, initNav(); also injects settings modal HTML and
                            change-password modal; calls initNotifications() at end; stores window.__navUser
js/notifications.js      — bell icon + SSE notification panel; initNotifications(user) called by nav.js
js/shares.js             — generic share modal (cost_grid and project)
js/pipeline-board.js     — kanban render, pbOpenDetailPanel, pbCloseDetailPanel; caches `_pbRatecards` (from Api.ratecards.list) for ratecard name display in detail panel; version tabs and Clone button in detail panel
js/costgrid.js           — cost grid editor (phases/tasks/roles table, save/load/version logic); declares `_pbCloneSource` (shared with pipeline board); Clone button in editor toolbar
js/portfolio.js          — portfolio dashboard + resource planning view
js/dashboard.js          — per-project KPI + burndown render
js/config-form.js        — project config form (tasks, phasing, planning, groups)
js/roles.js              — roles management modal
js/upload.js             — Excel timesheet parsing
js/settings.js           — openSettingsModal() / saveSettingsModal(); reads window.__navUser; all
                            appSettings / AI_MODELS / getRoles references guarded with typeof checks
js/ai.js                 — AI sidebar chat + project analysis
js/clients.js            — client CRUD helpers
js/programs.js           — program CRUD helpers
js/ratecards.js          — rate cards admin modal + loadRatecardsForDropdown() cache used by costgrid.js;
                            client-specific rate editing is via openClientRatecard() in config.html (Vue method)
api/src/routes/          — Express routes (auth, users, config, cost-grids, projects, timesheets,
                            reporting, exports, notifications, pipeline-years, client-groups, pots, reset)
api/src/routes/exports.js        — POST /api/exports/{portfolio|cost-grids|ratecards}
api/src/routes/notifications.js  — SSE stream, CRUD, push; exports { router, pushToUser }
api/src/routes/pipeline-years.js — CRUD for admin-managed pipeline years
api/src/routes/client-groups.js  — CRUD for client groups + member assignment
api/src/routes/pots.js           — CRUD for POT targets + history
api/src/routes/reset.js          — GET /api/admin/reset/scopes + POST /api/admin/reset/:scope (admin-only bulk delete)
api/src/db/migrations/   — numbered SQL migration files
api/src/services/        — email (nodemailer + sendExportEmail), jwt
api/src/create-admin.js  — CLI bootstrap script (admin user create/reset)
```

### Routing

Navigation is URL-based — clicking a nav tab changes `window.location.href`. Each page is a self-contained HTML file that initialises its own data on `DOMContentLoaded`.

Each page calls `initNav(activeTab)` from `nav.js` which:
1. Injects the shared navbar HTML (two-row: logo/icons row + tabs row) and fixed footer
2. Injects the settings modal and change-password modal HTML (centralised — do NOT duplicate in page HTML)
3. Calls `GET /api/auth/me` — redirects to `/login.html` on 401
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

### Data strategy (localStorage as cache)

`localStorage` is the UI cache; the API is the source of truth.

- **On page load**: call `cgSyncFromApi()` / `loadConfigFromApi()` / `refreshTimesheetDataFromApi()` to seed localStorage from the server.
- **On user action**: write to localStorage immediately (instant UI), then fire an async API call in the background (fire-and-forget).
- **Offline fallback**: if the API is unavailable, the app falls back to localStorage cache.

Key sync functions in `api-sync.js`:

| Function | What it does |
|---|---|
| `cgSyncFromApi()` | Seeds all cost grid metadata into localStorage |
| `cgLoadStructureFromApi(cgId, verId)` | Loads phase/task/role structure for one version |
| `loadConfigFromApi()` | Loads all projects from API into `config.projects` |
| `loadPipelineBudgetsFromApi()` | Loads pre-computed budget totals indexed by versionId |
| `refreshTimesheetDataFromApi()` | Loads timesheet rows from API into `timesheetData` |
| `_cgUpsertVersionToApi(cgId, verId)` | Write-through: pushes cost grid version to API |
| `_pushProjectToApi(project)` | Write-through: pushes project (all sub-resources) to API |

### Pipeline stage: single source of truth

Pipeline stage is stored on `costGridVersion.pipeline`. These locations must stay in sync:

- `css/tokens.css` — `--pipeline-{stage}-bg` / `--pipeline-{stage}-color` for all 5 stages
- `js/core.js` `pipelineBadge()` — uses `var(--pipeline-*-color)`
- `js/costgrid.js` switch block — uses `var(--pipeline-*-color)`
- `js/pipeline-board.js` `PB_STAGE_STYLE` — uses `var(--pipeline-*-bg/color)`

Valid stages: `SIP`, `Expected`, `Anticipated`, `Committed`, `Canceled`.

Helper: `getProjectPipeline(projectId)` — reads from `costGridRef` version first, falls back to `config.projects[].pipeline`.

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
- On `costgrid.html` cold load: call `cgSyncFromApi()` before reading URL params to avoid empty localStorage

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

Header buttons (right side): `⧉ Clone` · `{ } JSON` · `🔗 Share` · `✏️ Edit` · `×`

The Clone button (`#pbBtnCloneCg`) sets `_pbCloneSource = { cgId, verId, name }` for the currently viewed version and opens `#cgCloneModal`.

### Column totals footer

Each pipeline column footer shows:
- **Main value** (bold): professional fees only (`fee` from `pbComputeColumnTotals`)
- **Secondary line** (muted, small): PTC total only, shown only when `ptc > 0`
- Currency symbol is included in the value string via `pbFmtMoney(n, cur)` — do NOT add a standalone currency `<span>` next to it

### Settings modal

The settings modal HTML is injected by `nav.js` (not duplicated in page HTML). It has two tabs:

- **API & Integrations** — AI provider keys (Anthropic / OpenAI / Gemini) stored in `localStorage`
- **Data Manager** — CSV exports (cost grids, portfolio, rate cards), full backup download, admin-only restore and send-notification

`openSettingsModal()` in `settings.js` reads `window.__navUser` set by `nav.js`. All references to `appSettings`, `AI_MODELS`, `getRoles`, `persistSettings`, `updateAiButtonVisibility` are wrapped in `typeof` guards because those globals are not available on every page.

The "⚙ Settings" entry point is in the account dropdown (top-right navbar), visible on all pages.

### Notifications

`js/notifications.js` is loaded on all authenticated pages. `initNotifications(user)` is called by `nav.js` after navbar injection.

- Bell icon `#nav-notif-btn` in the top navbar row shows the unread count badge
- Panel opens as a Bootstrap dropdown listing last 50 notifications
- Real-time delivery via **SSE**: `new EventSource('/api/notifications/stream', {withCredentials:true})`
- `GET /api/notifications/unread-count` → badge on load
- `PATCH /api/notifications/read-all` → "Mark all read" button
- `PATCH /api/notifications/:id/read` → click on item
- Notifications may carry a `url` deep-link (e.g. `/costgrid.html?cgId=...`) rendered as a clickable link
- Admin can send notifications (targeted or broadcast) from Settings → Data Manager tab

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

Run migrations with:
```powershell
docker exec -i pdash-db psql -U pdash -d pdash < api/src/db/migrations/004_add_notifications.sql
```

### Language constraint

All user-facing text, alerts, labels, and instructions **must be in English**.
