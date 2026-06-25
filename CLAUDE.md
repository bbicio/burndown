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
| `project-config.html` | `/project-config.html?projectId=` | Full-page project config form (tasks, phasing, planning, groups); viewer mode: sticky read-only banner + all inputs disabled + action buttons hidden |
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
js/api-sync.js           — in-memory ↔ API sync layer (cgSyncFromApi, loadConfigFromApi, etc.); `cgSyncFromApi` stores `myPermission: g.my_permission` on each `_cgStore` entry; `_apiProjectToLocal` maps `my_permission: p.my_permission || 'owner'` — fields not listed here are silently dropped even if returned by API
js/core.js               — state, in-memory helpers (loadConfig/persistConfig are no-ops), shared badges, esc(), fmtH(), fmtMoney()
js/nav.js                — navbar + footer injection, initNav(); also injects settings modal HTML,
                            change-password modal, and send-notification modal; calls initNotifications() at
                            end; stores window.__navUser
js/notifications.js      — bell icon + SSE notification panel; initNotifications(user) called by nav.js
js/shares.js             — share modal (cost_grid and project); loads active non-admin users from `GET /api/users/active-list` into a searchable in-memory dropdown; supports adding new shares and editing permission (editor/viewer) on existing ones via the same upsert API; `_shareAllUsers` module var is the immutable source list; `_shareUserList` excludes already-shared users
js/pipeline-board.js     — kanban render, pbOpenDetailPanel, pbCloseDetailPanel; caches `_pbRatecards` (from Api.ratecards.list) for ratecard name display in detail panel; version tabs, Clone button, and Delete Draft button in detail panel; hides Edit/Clone/Delete controls for viewers (`cg.myPermission !== 'viewer'`)
js/costgrid.js           — cost grid editor (phases/tasks/roles table, save/load/version logic); declares `_pbCloneSource` (shared with pipeline board); Clone + Delete Draft buttons in editor toolbar; `cgConfirmDeleteVersion(cgId, verId, label, onSuccess?)` accepts optional callback (editor passes redirect, list/panel pass re-render)
js/portfolio.js          — portfolio dashboard + resource planning view; hides Configure and Load Actuals buttons for viewers (`cfg.my_permission !== 'viewer'`)
js/dashboard.js          — per-project KPI + burndown render; hides Configure button for viewers (`proj?.my_permission !== 'viewer'`)
js/config-form.js        — project config form (tasks, phasing, planning, groups); `cfgParseHours(str)` uses `parseFloat` directly — never via `cfgParseMoney` (which strips "." for de-DE locale, inflating "22.25" → 2225); `cfgFmtHours(n)` uses `toFixed(2)`; future-month reforecast values rounded to `Math.round(n * 4) / 4`
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
api/src/routes/pots.js           — CRUD for POT targets + history; /year-totals; proposals matched via cgv.client_id (not cg_version_projects)
api/src/routes/reset.js          — GET /api/admin/reset/scopes + POST /api/admin/reset/:scope (admin-only bulk delete);
                                    scopes: proposals, projects, clients, ratecards, actuals, pipelines, notifications
api/src/db/migrations/   — numbered SQL migration files
api/src/services/        — email (nodemailer: sendInvite, sendPasswordReset, sendShareNotification,
                            sendExportEmail, sendAdminNotificationEmail), jwt
api/src/create-admin.js  — CLI bootstrap script (admin user create/reset)
```

### Routing

Navigation is URL-based — clicking a nav tab changes `window.location.href`. Each page is a self-contained HTML file that initialises its own data on `DOMContentLoaded`.

Each page calls `initNav(activeTab)` from `nav.js` which:
1. Injects the shared navbar HTML (two-row: logo/icons row + tabs row) and fixed footer
2. Injects the settings modal, change-password modal, and send-notification modal HTML (centralised — do NOT duplicate in page HTML)
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

Run migrations with:
```powershell
docker exec -i pdash-db psql -U pdash -d pdash < api/src/db/migrations/004_add_notifications.sql
```

### Language constraint

All user-facing text, alerts, labels, and instructions **must be in English**.
