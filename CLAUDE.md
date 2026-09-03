# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

For the development workflow (new feature / evolution / audit-fix), see [docs/superpowers/PROCESS.md](docs/superpowers/PROCESS.md).

**Process override — closing a development branch:** in this project, `/finish-cycle` (`.claude/commands/finish-cycle.md`) is the terminal step of every execution phase, whether run inline, via `superpowers:executing-plans`, or via `superpowers:subagent-driven-development`. Never invoke `superpowers:finishing-a-development-branch` at the end of a plan's execution — `/finish-cycle` already performs its own test gate, code review, `--no-ff` merge, push, and worktree cleanup (Gate 4). Do not merge or push a feature branch by any other means (manual `git merge`/`git push`, or the generic finishing skill) before `/finish-cycle` has run.

**Infrastructure safety — Docker commands against the main stack (`pdash-db`/`pdash-api`/`pdash-nginx`/`pdash-adminer`, project `burndown`):** never delegate a plan task or subagent dispatch that runs `docker compose` (`up`/`down`/`restart`/etc.) directly against the main stack without all three of the following. Origin: on 2026-08-05, a delegated implementer subagent verifying `scripts/run-tests.sh` (isolated test-profile work, see `docs/superpowers/reports/2026-08-05-worktree-docker-test-profile-container-names-finish-cycle.md`) wiped the real `burndown_pgdata` volume — almost certainly by running `docker compose down -v` against the main project instead of the isolated `pdash_test` one, most likely copying the `-v` habit from the isolated script's own cleanup logic. Recovery only worked because an unrelated, incidental `pg_dump` snapshot happened to exist from an earlier cycle — not because of any designed safety net.
1. **No `-v`/`--volumes` against the main stack, ever, ideally not even flagged as "not needed."** Any dispatch prompt that instructs an agent to run `docker compose down`/`up`/`restart` against the main project must explicitly forbid `-v`/`--volumes` in that same instruction, and must tell the agent to stop and escalate rather than trying a more aggressive command if the plain command doesn't behave as expected.
2. **Snapshot before touching it.** Before any agent-run Docker-lifecycle operation on the main stack as part of a verification or test step, take an explicit `pg_dump` backup first (see "Database backup & full recreation" below) — do not rely on an incidental leftover dump from an unrelated prior cycle.
3. **Treat it as a risky, confirm-first action.** `docker compose down`/`up`/`restart` against the main stack, even without `-v`, requires the same explicit human confirmation as other hard-to-reverse actions (per the top-level Executing Actions guidance) — it is not "safe because reversible in theory." Prefer, wherever the plan allows, verifying against an isolated stack (`scripts/test-branch.sh`, `scripts/run-tests.sh`) instead of touching the main stack at all.

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

### Database backup & full recreation

There was previously no documented procedure for this — added 2026-08-05 after an incident (see "Infrastructure safety" above) where the main stack's data volume was accidentally wiped and recovery depended entirely on an unrelated, incidental leftover backup file.

**Backup (take before any risky operation on the main stack):**

```powershell
docker exec pdash-db pg_dump -U pdash -Fc pdash > pdash-backup-<date>.dump
```

**Restore from a backup** (into a running, empty or to-be-overwritten `pdash-db`):

```powershell
docker cp pdash-backup-<date>.dump pdash-db:/tmp/restore.dump
docker exec pdash-db pg_restore -U pdash -d pdash --clean --if-exists --no-owner /tmp/restore.dump
docker exec pdash-db rm /tmp/restore.dump
```

**Full recreation from scratch** (empty volume, no backup — e.g. first-ever setup, or genuine data loss with no dump available): apply every migration file in `api/src/db/migrations/` in filename order, then bootstrap the first admin user:

```powershell
for f in api/src/db/migrations/*.sql; do docker exec -i pdash-db psql -U pdash -d pdash < "$f"; done
docker exec pdash-api node /app/src/create-admin.js <email> <password> [firstName] [lastName]
```

This is the same migration-loop pattern `scripts/test-branch.sh` and `scripts/run-tests.sh` already use internally for their own isolated stacks — nothing in the running app (`api/Dockerfile`, `api/src/index.js`, `create-admin.js`) applies migrations automatically, so a genuinely empty `pdash-db` stays schema-less until this loop is run by hand.

To test a feature branch in isolation before merging (separate containers/ports, doesn't touch the `main` stack):

```bash
scripts/test-branch.sh up      # build + start, clone data from main if running
scripts/test-branch.sh down    # tear down
scripts/test-branch.sh status  # "up" (exit 0) or "down" (exit 1) — both containers must be Docker-healthy
                                # for "up" (2026-08: previously just checked they existed via `docker ps`)
```

`/finish-cycle`'s Gate 2 calls `status` automatically to detect a branch environment still running from an earlier `/finish-cycle` attempt on the same branch, and asks to reuse or rebuild it instead of the plain "spin up now?" question.

No bundler, no build step for the **runtime** — nginx serves `js/`/`css/` files exactly as they are on disk, and this must stay true.

A dev-only test toolchain exists for the frontend: root `package.json` + vitest + jsdom, isolated from the runtime (see `js/lib/` below). It is never bundled, never served — `node_modules/`, `package.json`, `package-lock.json`, `vitest.config.js`, and any `*.test.js`/`*.spec.js` file are explicitly denied in `nginx.conf`. Run tests with `npm test` (single run) or `npm run test:watch`.

The backend has its own, separate unit-test toolchain: Node's built-in `node:test` runner (zero new dependency), scoped to `api/src/**/*.test.js` via `api/package.json`'s `"test"` script (`node --test src/**/*.test.js`, run from inside `api/`). This is deliberately kept independent from the frontend's `vitest` config — `vitest.config.js`'s `include` (`js/**/*.test.js`) never picks up `api/` files, and the backend runner never touches `js/`. Files that `require()` Express/DB modules (e.g. `api/src/routes/timesheets.test.js`, which imports `./timesheets`) need `api`'s `node_modules` present — run via `docker exec pdash-api node --test src/...` (the container already has them and volume-mounts `api/src` live) if the host has no `api/node_modules` installed. Pure `api/src/lib/*.test.js` files have no such dependency and run anywhere.

Still no linter on the frontend or backend.

---

## Architecture

Multi-page app backed by a Node.js/Express REST API and PostgreSQL. Every page is Vue 3 (loaded via CDN, no build step) except the 9-line `index.html` redirect — the Vue migration (tracked page-by-page below) completed 2026-08-05 when `planning.html`, the last holdout, moved over. A handful of shared library files (`js/costgrid.js`, `js/clients.js`, `js/roles.js`, `js/programs.js`, `js/ratecards.js`, `js/ai.js`, `js/upload.js`, `js/shares.js`, `js/notifications.js`, `js/nav.js`, `js/core.js`, `js/api.js`, `js/api-sync.js`, `js/settings.js`) remain classic (non-Vue) scripts loaded as globals by the Vue pages — see the file-by-file notes below for which pages load which.

### Pages

| File | Route | Purpose |
|---|---|---|
| `index.html` | `/` | Redirect → `/pipeline.html` |
| `pipeline.html` | `/pipeline.html` | Pipeline board + cost grid editor access, Vue 3 (CDN, no build step, same pattern as `portfolio.html`/`project-config.html`) |
| `portfolio.html` | `/portfolio.html` | Project reporting dashboard (portfolio overview + per-project KPI/burndown), Vue 3 (CDN, no build step, same pattern as `admin.html`/`project-config.html`) |
| `planning.html` | `/planning.html` | Resource planning view, Vue 3 (CDN, no build step, same pattern as `pipeline.html`/`costgrid.html`) |
| `costgrid.html` | `/costgrid.html?cgId=&verId=` | Cost grid editor (full-page), Vue 3 (CDN, no build step, same pattern as `pipeline.html`/`portfolio.html`) |
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
pipeline.html            — kanban pipeline board (6 stage columns, slide-in detail panel, pipeline-year dropdown), Vue 3 (CDN, no build step, same pattern as portfolio.html/project-config.html); folds in the former js/pipeline-board.js (760 lines, now deleted — confirmed exclusive to this page); adds js/lib/pipeline-calc.js (pbGetVersionBudget/pbComputeColumnTotals/pbFmtMoney/pbFmtDate/pbFmtTaskDate/pbComputePotPercentages); js/costgrid.js/js/core.js and the 4 shared static modals (#confirmModal/#cgNewGridModal/#cgCloneModal/#jsonViewerModal) remain unmodified Vanilla, called as globals — costgrid.html/planning.html still depend on them as-is; detail panel shows a loading spinner while phase/task structure fetches and an explicit "Could not load cost grid" message if it fails; outside-click-to-close on the detail panel ignores clicks inside any Bootstrap modal spawned from the panel (Share/Clone/Confirm), since those modals live outside #pbDetailPanel in the DOM
portfolio.html           — project reporting dashboard (portfolio overview + per-project dashboard), Vue 3 (CDN, no build step, same pattern as project-config.html); folds in the former js/portfolio.js + js/dashboard.js (both now unloaded by this page — js/dashboard.js was exclusive to portfolio.html and is now fully orphaned dead code; js/portfolio.js remains loaded elsewhere, see its own entry below); no longer loads js/roles.js (confirmed unused) or js/config-form.js (only needed for the now-removed, previously-unreachable #configModal + nested clients/programs/roles CRUD modals); adds js/lib/portfolio-calc.js; cardData(cfg) hoisted into a cardDataMap computed (was called ~29x/row per project card); includes the shared `#confirmModal` markup (2026-07 fix — it was missing from this page even though `js/ai.js`'s `openAiAnalysis()` no-API-key dialog, loaded here, depends on it; `showConfirm()`/`showInfo()` calls from this page silently threw before this fix)
planning.html            — resource planning (filters, By Role/By Project/By Owner grouping views, monthly/weekly interval, monthly pulse, rounded-hours toggle, XLS export/upload, AI Planning Sidebar), Vue 3 (CDN, no build step, same pattern as pipeline.html/costgrid.html); last Tier 2 page in the Vue migration roadmap — every page except the 9-line index.html redirect is now on Vue 3; folds in the former js/planning.js (1558 lines, now deleted — confirmed exclusive to this page, same precedent as js/pipeline-board.js/js/dashboard.js); single monolithic Vue.createApp, no sub-components; adds 4 new js/lib/planning-calc.js exports (getCalendarWeeks/workingDaysInWeek/getPlanningPeriods/countFutureTaskWeeks, see js/lib/ entry below); drops the js/config-form.js and js/costgrid.js `<script>` tags (confirmed dead on this page — no reachable #configModal, and no genuine call into costgrid.js beyond two page-local no-op overrides), files themselves untouched since still loaded elsewhere; keeps js/roles.js/js/clients.js/js/programs.js loaded unmodified (their `load*FromApi()` calls are genuinely used; their CRUD-modal dead markup — #rolesModal/#roleModal — was already removed, same cleanup as costgrid.html's cycle) and js/ai.js/js/upload.js/js/portfolio.js loaded unmodified as globals (js/ai.js got one hardcoded-Italian-string translation at line ~101 in this cycle; since then its two no-API-key dialogs were switched to `showInfo()`, see that file's own entry — no other change); AI Sidebar is Vue-reactive UI (open/closed state, message list) wired to the unchanged js/ai.js functions (aiPlanSend/buildPlanningContext/updateAiButtonVisibility) via hidden DOM compatibility elements; `created()` awaits `initNav()` and returns early on `!user` before any API-loading call, matching every other migrated page's pattern (a Gate-3 code-review fix — the first draft inverted this ordering); `initTooltipsAndToggles()` guards every `addEventListener` call with a `data-pp-bound` marker so re-invocations across `updated()` (which fires on every reactive re-render, e.g. AI-chat keystrokes) never double-bind a `v-html`-rendered row left in place; `sendAiMessage()` only clears the visible AI input once `aiPlanSend()` has actually consumed the message (checked via `aiPlanMessages.length` growth) so a typed question survives the "no API key configured" early-return path; Enter-to-send handler is an inline `e => { if (!e.shiftKey) {...} }` check (not Vue's `.exact` modifier) so Ctrl/Meta/Alt+Enter still send, matching the original; "Export XLS" (`buildStyledExcelExport()`) — a pre-existing bug found during this cycle, `ReferenceError: ExcelJS is not defined` since no page loaded the ExcelJS library — was fixed in a later dedicated cycle (2026-07-28) by adding the ExcelJS CDN `<script>` tag to this page (and to `costgrid.html`, for `cgExportXls()`); both pages also loaded `xlsx@0.18.5` (SheetJS) via CDN, confirmed genuinely unused by any client-side JS on either page (XLS upload/parsing goes entirely through the backend API) and removed in a later cleanup cycle (2026-08-01) — `portfolio.html` and `project-config.html` still load it for their own genuine uses and are unaffected
costgrid.html            — cost grid editor (phase/task/role table, phasing panel, version tabs, toolbar), Vue 3 (CDN, no build step, same pattern as pipeline.html/portfolio.html); single monolithic Vue.createApp, no sub-components; js/costgrid.js stays loaded unmodified as the shared library for pipeline.html/planning.html — a "bridge pattern" redefines renderCgEditor()/renderCgVersionTabs(cg)/showCostGridEditorView(cgId, versionId) in js/costgrid.js to delegate into the mounted Vue instance via a module-level `_cgVueApp` reference, so ~15 other unchanged js/costgrid.js functions that call these three at their tail (cgPublishDraft, cgCreateNewVersion, cgCloneGrid, cgGenerateProject, etc.) require zero code changes; `_cgDraft`/`this.draft` are the SAME object reference (assigned once per version load in `openVersion()`, never independently re-cloned) since `cgAutoSave()` (a kept-unchanged global) reads `_cgDraft` directly; locked/Committed-version edit enforcement restored via `:disabled="isLocked"`/`v-if="!isLocked"` on every input/select/textarea and mutation button inside the editor body (both the offer-details header form and the grid table) — matches the pre-Vue `cgApplyEditorLock()`'s exact coverage (it swept the whole editor body, header included); `#confirmModal`/`#jsonViewerModal` stay unmodified shared Vanilla utilities; `#cgNewVersionModal`/`#cgCloneModal`/`#cgRoleSelectModal` are Vue-triggered; deletes confirmed-dead `#rolesModal`/`#roleModal`/`#programsModal`/`#programEditModal` markup (only reachable via the unloaded js/main.js) — `#clientsModal`/`#clientEditModal` were investigated and found genuinely reachable (`showClientsModal()`, a live "+ New" button next to the Client dropdown), so kept, along with js/clients.js/js/roles.js/js/programs.js's `<script>` tags (all three define `load*FromApi()`/`get*()` functions this page's own init still calls, not just their now-removed dead CRUD modals); adds a `clientIdInput` computed (mirrors `startDateInput`/`endDateInput`/`ratecardIdInput`) bridging `draft.clientId`'s `null` "no client" state to the Client `<select>`'s `'__unassigned__'` sentinel option value, since Vue's native `v-model` select binding requires an exact match
timesheets.html          — timesheet upload management (admin only); summary table (2026-09) leads with Client/Project/Project code (Bootstrap checkbox multi-select filters on Client and Project, free-text on Project code, click-to-sort on all three — other columns unsortable) followed by the pre-existing Uploads/Rows/Last uploaded, all resolved server-side via `GET /api/timesheets`'s `LEFT JOIN LATERAL` (see `api/src/routes/timesheets.js` entry below); a pipeline-year `<select>` (default: current calendar year if present in `Api.pipelineYears.list()`, else the most recent year — no client-side `active` filter, matching `pipeline.html`'s own default-year resolution exactly: an admin sees ALL pipeline years there too, active or not, and only `GET /api/pipeline-years`'s non-admin branch filters to active-only server-side, which never applies here since this page is admin-only; investigated and confirmed intentional, not a bug, 2026-09; plus an explicit "All years" option `pipeline.html` doesn't have) filters rows client-side by `pipeline_year` — a project with no linked cost-grid version has `pipeline_year: null` and shows only under "All years", by design (documented in `docs/superpowers/specs/2026-09-03-timesheets-fee-pipeline-year-design.md`); "View" modal grid gained `Fee`/`Spent` as its last two columns (`Spent = Fee × Hours`, no rounding, `fmtMoney`-formatted in the project's own currency — `fmtMoney` is registered as a Vue `methods` shorthand here since this page's own `fmtDate` is a local method, not the `js/core.js` global, so template calls don't fall through to it automatically); `⬇ CSV` was replaced (not kept alongside) by `⬇ XLSX` via ExcelJS `4.4.0` CDN (same pin as `planning.html`/`costgrid.html`), filename `Client_Project_ProjectCode_YYYYMMDD.xlsx` (`sanitizeForFilename()`: spaces→`-`, filesystem-unsafe characters stripped); `created()` fires `Api.pipelineYears.list()`/`Api.currencies.active()`/`loadRows()` together via one `Promise.allSettled` (each independent, each degrades to a safe default — `[]`/EUR fallback/`this.error` respectively — on its own failure) rather than sequential awaits; `downloadXlsx()`'s `URL.revokeObjectURL(a.href)` is deferred one tick (`setTimeout(..., 0)`, 2026-09 cold-review fix) rather than called synchronously right after `a.click()` — on Safari and some older Firefox/Chromium builds the click-to-download hand-off is asynchronous, and a synchronous revoke can invalidate the blob before the download actually starts; the same unfixed pattern still exists at other export sites in the codebase (`js/costgrid.js`, `planning.html`, `js/settings.js`, `project-config.html`) and is a documented follow-up candidate, not yet applied there
config.html              — config UI (clients / client groups / programs / roles / pipelines & POT targets; admin only)
project-config.html      — full-page project config form (tasks, phasing, planning, groups), Vue 3 (CDN, no build step, same pattern as admin.html); single reactive project object, not an array; unknown ?projectId= shows an explicit not-found state instead of falling back to a random project; no longer loads js/config-form.js or js/roles.js; page-title-bar (matching portfolio.html/pipeline.html) shows the project's name (or "New Project" via isNewProject for the no-?projectId= creation flow); resolveProject() normalizes any task's monthlyDistribution: null (seen on real data) to {} — the Monthly % distribution grid's v-model indexes directly into it; `saveClientModal()`/`saveProgramModal()` (the nested "+ New client"/"+ New program" modals next to their respective dropdowns) guard against a fast repeat click via a `saving` flag on `clientModal`/`programModal` (2026-08, closing a finding from `docs/superpowers/audits/2026-08-04-double-submit-closing-audit.md`) — set as an explicit `if (this.X.saving) return;` first statement plus `:disabled`/text-swap on the Save button, matching this file's own `onSave()` pattern; previously these two had zero protection of any kind, unlike every other save/submit action in the app
admin.html               — user management (invite, role, disable, anonymize; admin only); T&C editor (view/edit/publish)
terms.html               — standalone T&C acceptance page (no navbar/initNav), Vue 3 (CDN, no build step, same pattern as login.html); redirected to by initNav() gate
css/tokens.css           — design tokens (single source of truth for colors/type); also carries `[v-cloak] { display: none; }` (2026-07) — kept here rather than in style.css since 4 of the 13 Vue pages (`login.html`/`terms.html`/`activate.html`/`reset-password.html`) load only tokens.css, not style.css, and moving the rule would silently disable it there; a deliberate, accepted deviation from the tokens/style split below
css/style.css            — component styles referencing tokens; `.pb-board-root` (2026-07) — extracted from `pipeline.html`'s former inline `style` attribute specifically so the `[v-cloak]` rule above can win via normal CSS cascade without needing `!important`
js/api.js                — Api.* namespace, apiFetch wrapper (401 → redirect to login); sets `window.__pdashAuthRedirecting = true` before the redirect (never reset — a full page navigation is already in flight once set), a side-channel flag consumed by `js/costgrid.js`'s `cgCloneGrid()` to suppress a misleading warning during a session-expiry race (see that file's entry)
js/api-sync.js           — in-memory ↔ API sync layer (cgSyncFromApi, loadConfigFromApi, etc.); `cgSyncFromApi` stores `myPermission: g.my_permission` on each `_cgStore` entry; `_apiProjectToLocal` maps `my_permission: p.my_permission || 'owner'` and converts ISO currency code → symbol (`EUR→'€'`, `USD→'$'`, `GBP→'£'`) for the form select; `costGridRef: { cgId, versionId } | null` — `cgId` is read directly from `GET /api/projects`'s server-resolved `cg_id` field (a `LEFT JOIN` to `cost_grid_versions` in `api/src/routes/projects.js`), **not** from the in-memory `_cgStore` (fixed 2026-07: `_resolveCgIdForVersion()`/`_cgStore`, declared only in `js/costgrid.js`, threw `ReferenceError` on any page that doesn't load that script — `portfolio.html`, `project-config.html` — silently emptying `config.projects` on both; `_resolveCgIdForVersion()` itself was confirmed to have zero remaining callers anywhere in the repo and deleted in a later cleanup cycle, 2026-08); `_pushProjectToApi` converts symbol → ISO code before PATCH to satisfy `currencies` FK constraint — fields not listed here are silently dropped even if returned by API; `_cgApiVersionToLocal` maps `taskIds` and `taskNames` from `lp.task_ids`/`lp.task_names` on each linked-project entry
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
                            consumed identically by all three grouping views in `planning.html`'s Vue instance
                            (by-role, by-project, by-owner) — previously by-role/by-project crashed on a task with
                            no name and by-owner was case-sensitive on both fields. `distributeFutureResidual(residualH,
                            totalFutureWeeks, weeksByMonth, pulseEnabled)`: computes `hPerWeek` from the task's
                            canonical remaining-week count (not the currently-visible date window); when
                            `pulseEnabled && hPerWeek < 1`, aggregates each month's weeks into one entry placed on
                            that month's first week with hours proportional to its week count; otherwise returns
                            one entry per week at a flat `hPerWeek`. Consumed identically by all three grouping
                            views — previously by-owner used the visible window's week count for its pulse
                            threshold (so paging could flip it) and split hours equally per month regardless of
                            week count, both since unified with by-role/by-project's already-correct behavior;
                            `countFutureTaskMonths()` (the old by-owner-only helper this replaced) was removed as
                            dead code. `getCalendarWeeks(startDate, endDate)` / `workingDaysInWeek(week, taskStart,
                            taskEnd)` / `getPlanningPeriods(cfg, interval)` / `countFutureTaskWeeks(tStart, tEnd,
                            todayMidnight)` — week-bucketing and date-range helpers added in the `planning.html`
                            Vue migration, relocated verbatim from the former `js/planning.js`; `getPlanningPeriods`
                            reads `getMonthRangeFromCfg` (a `js/portfolio.js` classic-script global) via `globalThis`
                            rather than importing it, since `js/lib/` modules only import from sibling `js/lib/`
                            modules, never from classic-script globals. Loaded via `<script type="module">` on
                            `planning.html`, before the inline `Vue.createApp` script.
                            `status-rules.js` — `getStatusRule(pipeline)`: returns `{ options: string[] | null,
                            disabled: boolean }`, the single source of truth for which project Status values are
                            selectable per pipeline stage (`SIP` → empty + disabled; `Canceled` → `options: null`
                            meaning "leave current value untouched", disabled; `Committed`/`Expected`/`Anticipated`
                            each have their own list, all spelled `'Completed'` — matching `statusBadge()`/
                            `statusBadgeLarge()` and `planning.html`'s Resource Planning filter, never `'Complete'`).
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
                            `portfolio-calc.js` — `computeKpis(data, cfg, billableData, billableTasks, findRate)`:
                            extracted from the former `js/dashboard.js`'s `renderKPIs`, returns
                            `{ consumedHours, soldHours, budgetTotal, consumedEur, hoursLeft, budgetLeft,
                            feesOnly, totalPtc, maxDate }`. `computeBurndownPoints(data, cfg, taskFilter, interval,
                            billableData, billableTasks, findRate)`: extracted from `renderBurndown`'s data-prep
                            (the largest, highest-risk function in the old file); points sit at the 1st of each
                            period with `date <= point` accumulation, so a period's consumption only appears
                            starting at the *next* point — real, pre-existing production behavior. Both consumed
                            by `portfolio.html`'s Vue `kpis`/burndown-chart computed properties; the chart-drawing
                            (Chart.js) call itself stays a Vue method, not extracted. Loaded via
                            `<script type="module">` on `portfolio.html`, before the inline `Vue.createApp` script.
                            `pipeline-calc.js` — `pbGetVersionBudget(v, cgComputeGrandTotals, getPipelineBudget)` /
                            `pbComputeColumnTotals(cards, cgComputeGrandTotals, getPipelineBudget)`: extracted from
                            the former `js/pipeline-board.js`'s own aggregation logic, with the shared `js/costgrid.js`
                            globals passed in as parameters (dependency injection) rather than read directly, matching
                            `portfolio-calc.js`'s precedent — keeps the module DOM-free and independently testable.
                            `pbFmtMoney(n, code, currencies)` / `pbFmtDate(iso)` / `pbFmtTaskDate(iso)` /
                            `pbComputePotPercentages(totalBudget, committedTotal, potAmount)`: pure formatting/POT-math
                            helpers, also ported verbatim. Loaded via `<script type="module">` on `pipeline.html`,
                            before the inline `Vue.createApp` script.
js/core.js               — state, in-memory helpers (loadConfig/persistConfig are no-ops), shared badges, esc(), fmtH(), fmtMoney(); `statusBadge()` small style for pipeline cards; `statusBadgeLarge()` same size/style as `pipelineBadge()` — used only in linked-project chips in the editor and detail panel; `cfgApplyPipelineRules(pipeline, currentStatus)` — thin DOM wrapper around `js/lib/status-rules.js`'s `getStatusRule()`, applies the returned `{options, disabled}` to the `#cfgStatus` `<select>`; still referenced by `js/config-form.js`'s own config-modal code (`portfolio.html`'s own config modal — the one this comment previously referred to — was confirmed unreachable dead code and dropped entirely in its Vue migration; `planning.html`'s Vue migration confirmed `js/config-form.js` was itself dead there too and dropped the `<script>` tag — no page loads `js/config-form.js` reachably anymore, though the file itself stays for reference); not used by `project-config.html`, whose Vue rewrite calls `getStatusRule()` directly from a reactive `sanitizeStatus()` method instead (no `#cfgStatus` element exists on that page anymore); `showConfirm(message, onConfirm, onCancel, title)`'s OK button guards against a fast repeat click via a closure-scoped `clicked` flag (2026-08) — set on first click, checked before `onConfirm()` fires; fresh per invocation (a new closure each call), so it needs no cross-call-site coordination the way a module-level flag would. Protects every one of this function's dozens of call sites at once (delete/publish/confirm flows across the app) — e.g. `js/costgrid.js`'s `cgPublishDraft()` no longer needs its own local in-flight flag, removed in the same cycle. Cancel's path needed no change: `{ once: true }` on `hidden.bs.modal` already guaranteed `onCancel` fires at most once. `showInfo(message, title = 'ℹ️ Info')` (2026-07) — single-button informational variant of `showConfirm()`, reusing the same `#confirmModal` singleton: hides `#confirmModalCancel`, clones `#confirmModalOk` to a neutral `btn btn-primary` "OK" (no destructive-looking red), and restores the original Cancel visibility + OK button text/class on `hidden.bs.modal` so the next `showConfirm()` call on the same page is unaffected; guards against a second `showInfo()` call arriving before the first has closed (e.g. a fast double-click before the trigger button's disabled state paints) via a `modalEl.dataset.pdashInfoActive` flag — a re-entrant call just re-shows the modal with updated title/message instead of re-cloning the button and re-capturing (already-mutated) "original" values, which would otherwise poison the restore permanently. Used by `js/ai.js`'s two no-API-key dialogs and `js/costgrid.js`'s Clone-incomplete warning (see their own entries) in place of the two-button `showConfirm()`, since none of those three is actually a yes/no choice. `findRate(row, cfg)` (`js/core.js:264-272`) — resolves a timesheet row's hourly rate by matching `row.task`/`row.role` against `cfg.tasks[].name`/`.resources[].role`, falling back to the task's first resource's rate if the role itself doesn't match; task/role comparisons are null-safe (`(x || '').toLowerCase()`, 2026-08) — previously threw `TypeError` on a row with a missing `task`/`role` field (plausible with incomplete XLS upload data), the third and widest-blast-radius fix in this session's 3-cycle series addressing the same class of bug (after `js/ai.js`'s `buildPlanningContext()`/`buildProjectSummary()`); called from ~15 sites across `js/ai.js`, `js/lib/portfolio-calc.js` (which injects it as a parameter rather than calling the global directly, keeping that module DOM-free/testable — its own test file mocks a local `findRate` rather than exercising the real one), `js/portfolio.js`, and `portfolio.html`'s own Vue instance (KPI cards, burndown chart, dashboard) — this was the actual live crash risk on that page. `cfg`/`cfg.tasks` presence itself remains unguarded (every call site already guards `cfg` before calling) — a deliberate scope boundary, not an oversight.
js/nav.js                — navbar + footer injection, initNav(); injects settings, change-password, send-notification,
                            and "My Profile" modals; T&C gate after GET /api/auth/me (redirects to /terms.html
                            if user.terms_version < current_terms_version); calls initNotifications(); stores window.__navUser
js/notifications.js      — bell icon + SSE notification panel; initNotifications(user) called by nav.js
js/shares.js             — share modal (cost_grid and project); loads active non-admin users from `GET /api/users/active-list` into a searchable in-memory dropdown; supports adding new shares and editing permission (editor/viewer) on existing ones via the same upsert API; `_shareAllUsers` module var is the immutable source list; `_shareUserList` excludes already-shared users
js/costgrid.js           — shared cost-grid business-logic library: loaded unmodified by `pipeline.html` as globals, and by `costgrid.html`'s own Vue rewrite via the bridge pattern (no longer loaded by `planning.html`, whose Vue migration confirmed it made no genuine calls into this file beyond two now-removed page-local no-op overrides) — decided 2026-07: this file is a permanent shared Vanilla service layer (not migration debt awaiting a future rewrite), with exactly 2 consumers today (`pipeline.html`, `costgrid.html`); see `docs/superpowers/specs/2026-07-27-costgrid-js-fate-design.md` for the rationale (`renderCgEditor()`/`renderCgVersionTabs(cg)`/`showCostGridEditorView(cgId, versionId)` are thin functions delegating into `costgrid.html`'s mounted Vue instance through a module-level `_cgVueApp` reference — every other function below that calls one of these three at its tail needs no changes); the imperative rendering functions this file used to own for its own page (`renderCgEditor`'s ~700-line innerHTML builder, `cgBindEditorEvents`, `cgApplyEditorLock`, `cgRefreshTotals`, `cgRefreshPhaseDates`, `cgRenderRoleList`, `cgFindTask`) were deleted entirely once `costgrid.html` moved to Vue; `cgComputeTaskTotals`/`cgComputePhaseTotals`/`cgComputeGrandTotals`/`cgComputeColumnTotals` relocated to `js/lib/costgrid-calc.js` (vitest-covered), `window.*`-bridged under the same names so `pipeline.html`'s unchanged detail-panel call sites are unaffected; declares `_pbCloneSource` (shared between `pipeline.html` and `costgrid.html`); Clone + Delete Draft buttons in editor toolbar; `cgConfirmDeleteGrid(cgId, name, onSuccess?)` and `cgConfirmDeleteVersion(cgId, verId, label, onSuccess?)` both accept an optional callback (defaults to a bare `renderPipelineBoard()` call if omitted — a global that only exists on pre-Vue pages; every live caller on `pipeline.html` passes a callback that bumps its own Vue `refreshTick` instead); `cgImportAll()`'s post-import refresh guards the same call with `typeof renderPipelineBoard === 'function'` for the same reason; `cgCloneGrid()` strips `taskId`/`phaseId` from the cloned structure via `stripCloneTaskIds()` (`js/lib/costgrid-calc.js`) before `saveStructure()`, then re-fetches the server-assigned structure — fixes a `duplicate key value violates unique constraint "tasks_pkey"` error (the backend reused a client-supplied `taskId` as the new row's PK, correct for a same-version re-save, wrong for Clone since the source version's tasks still exist under those IDs); `cgLoadStructureFromApi()` (`js/api-sync.js`) returns `true`/`false` (not always `undefined`) so callers can detect a failed load — `cgCloneGrid()` is the only caller that acts on it: the *source*-side load (before anything is created server-side) blocks the clone with an inline error on failure, matching the existing "Source proposal not found" pattern; the *destination*-side load (after the new cost grid/version already exist on the API) shows a non-blocking "⚠️ Clone incomplete" `showInfo()` warning on failure instead, since aborting at that point would leave orphaned server-side state — the clone still opens in the editor either way and self-heals on the next successful load; this destination-side warning is suppressed entirely when `window.__pdashAuthRedirecting` is set (`js/api.js`) — the load failed because the session expired mid-clone and a redirect to `/login.html` is already in flight, so the warning would just be a confusing flash before navigation, not an actionable message (2026-07). `showCostGridEditorView()`/`renderCgVersionTabs()` log a `console.warn` (previously silent) if called before the `_cgVueApp` bridge is set; `cgConfirmDeleteVersion(cgId, versionId, versionLabel, onSuccess)` delegates to `cgConfirmDeleteGrid(cgId, cg.name, onSuccess)` when the cost grid has only one version (instead of blocking with an `alert()`) — deleting a proposal's only version now deletes the whole proposal, since every proposal always has at least one version; `cgSaveVersion()` is `async` and guards `#btnCgSave` against a fast repeat click (`if (btn.disabled) return;`, 2026-08) — previously it called `cgAutoSave()` fire-and-forget and showed "✓ Saved" immediately regardless of whether the underlying PUT had actually completed; now the button disables for the real duration of the save and "✓ Saved" only appears once it resolves (`cgAutoSave()` itself never rejects, so no try/finally is needed to guarantee re-enable); `cgPublishDraft()`'s confirm-callback is protected against a fast repeat click by `showConfirm()`'s own guard (`js/core.js`, 2026-08) — an earlier, call-site-local `_cgPublishInFlight` flag was removed once that general fix landed, since it became redundant; `cgCreateNewGrid()` and `cgCloneGrid()` both guard their trigger button (`#btnCgCreateGrid`/`#btnCgClone`) against a fast repeat click (2026-08, same idiom as `cgSaveVersion()`) — neither routes through `showConfirm()`, so Cycle 3's general fix there doesn't cover them; both create a real cost grid + version via the API on every invocation, so a double-click previously created a duplicate proposal/clone; the button disables synchronously before the async work and the whole async body is wrapped in `try/finally` so it re-enables on every exit path; `cgGenerateProject()`/`cgConfirmAndGenerate()`/`cgDoGenerateProject()` and `_cgEnsureAddToProjectModal()`'s Confirm button were investigated for the same gap and found NOT to need it — the former uses a native, page-blocking `prompt()` for the project name with the actual state-mutating logic running fully synchronously in one tick after it (API push is fire-and-forget, never awaited), the latter hides its modal as the very first synchronous statement on click, before any `await` — neither has a window for a second click to re-enter; `cgPublishDraft()`'s success path ends with `window.location.reload()` — a Vue-reactivity gap (`_cgDraft.pipeline` is mutated via the raw global reference, bypassing Vue's proxy-based change detection, so `isDraft` and other Draft-only UI never invalidate) meant the Publish button and related controls stayed visible after a successful publish until a manual reload; its failure path uses `showConfirm()` instead of a native `alert()`, matching this file's established modal idiom; non-EUR role rate 3-level fallback (ratecard override → `role.rateOverrides[currency]` → EUR rate × factor) is no longer duplicated inline — `cgSyncRoleRatesToBaseline` and `cgPreviewRateChange` both now call the shared `resolveRoleRate()` (`js/lib/costgrid-calc.js`); `_cgCompactHeader` (localStorage `PDash_cgCompactHeader`) toggles compact/normal blue header row via ⊟/⊞ button in the "Phase / Task" sticky cell — compact hides role move/change/dup/remove buttons and reduces header font to 10px; **task assignment (R1–R5)**: `cgGetAssignedTaskIds()` + `cgGetAssignedTaskNames()` dual UUID+name check — assigned tasks have no ✕ button; `cgDoAddTasksToProject` and `cgDoGenerateProject` send `taskNames`; Generate Project button hidden when all tasks are mapped; `_cgEnsureAddToProjectModal()` is a singleton modal appended to `document.body` (z-index:10500); `cgGetVersionLockState(cgId, versionId)` — `other-version-active` reason (a sibling version already has linked projects) is whole-version and unchanged; `committed` reason now uses `js/lib/costgrid-calc.js`'s `isVersionCommittedLocked()` — locks only once the proposal's own pipeline is `Committed` **and** every task has been migrated to a project, not as soon as any single linked project reaches Committed; `cgPropagatePipelineToProjects()` pushes `_cgDraft.pipeline` onto every entry in `_cgDraft.linkedProjects` whenever the editor's Pipeline `<select>` changes (`js/costgrid.js` `change` listener) — the only way a version's pipeline is ever changed (no drag-and-drop on the pipeline board), so `config.projects[].pipeline` for a cost-grid-generated project never goes stale relative to its source version
js/portfolio.js          — no longer loaded by `portfolio.html` (its rendering logic was folded into that page's Vue rewrite); still loaded by `planning.html`, which relies on two of its exports — `getMonthRangeFromCfg(cfg)` and `fmtProjectTitle(cfg)` — consumed directly by `planning.html`'s Vue instance (formerly by `js/planning.js`, now deleted); the rest of this file's functions (`renderPortfolioSummary`, `buildProjectCard`, `buildProgramSummary`, `renderPortfolioView`, `showPortfolioView`, `showDashboardView`, the dead duplicate `showPortfolioPlanningView`) are unreachable now that no page's script list wires them up
js/roles.js              — `loadRolesFromApi`/`saveRoles`(no-op)/`getRoles` only; `loadRolesFromApi` maps `rateOverrides: r.rate_overrides || {}` on each role; role shape is `{ id, label, code, rate, rateOverrides }`. Its modal-editing UI (`showRolesView`/`hideRolesView`/`renderRolesTable`/`extractTeam`/`openRoleModal`/`saveRoleFromModal`/`showRoleError`/`deleteRole`/`exportRoles`/`importRoles`) was confirmed unreachable from any page (verified via repo-wide grep — the only same-named hits are unrelated Vue component methods on `config.html`/`costgrid.html`) and deleted 2026-08
js/upload.js             — Excel timesheet parsing
js/settings.js           — openSettingsModal() / saveSettingsModal(); reads window.__navUser; all
                            appSettings / AI_MODELS / getRoles references guarded with typeof checks
js/ai.js                 — AI sidebar chat + project analysis; `aiPlanSend()`'s and `openAiAnalysis()`'s no-API-key dialogs (English and Italian) both use `showInfo()` (`js/core.js`) rather than `showConfirm()` (2026-07) — neither is a yes/no choice, so the single-button variant matches the actual affordance; `aiPlanSend()` guards against a fast repeat click (`if (sendBtn.disabled) return;` as its first statement, 2026-08) — previously the button was only disabled after the no-API-key/empty-message checks, so a double-click before those checks completed could re-enter the function; every early-return path now re-enables the button before returning, not just the success/error `finally`; `buildPlanningContext()` (feeds the `planning.html` AI sidebar) matches timesheet records to task/role via the shared `matchesTaskRole()`/`computeResidual()` (`js/lib/planning-calc.js`, window-bridged) rather than raw `===` comparisons (2026-08) — brings it in line with the resource-planning grouping views' already-fixed matching logic (case-insensitive, null-safe); `buildResourceAllocationSummary()` (a second, independent AI-context builder with its own divergent matching logic) was deleted in the same fix — confirmed to have zero callers anywhere in the codebase; `buildProjectSummary()` (used by `openAiAnalysis()` on `portfolio.html`)'s TASK BREAKDOWN task-only match is now null-safe too (`(r.task || '').toLowerCase() === (task.name || '').toLowerCase()`, 2026-08) — no `js/lib/planning-calc.js` dependency needed since it's a task-only match (no role dimension), same inline idiom as `buildPlanningContext()`'s equivalent fix; during manual verification of this fix, found a separate, wider-blast-radius null-safety bug in `js/core.js`'s `findRate(row, cfg)` that threw on the same class of missing-field input and actually fired *before* `buildProjectSummary()`'s own match would — deliberately left unfixed in this cycle (see `js/core.js`'s own entry above for the actual fix, applied in a dedicated follow-up cycle)
js/clients.js            — client CRUD helpers; `saveClientFromModal()` guards `#clientSaveBtn` (id added 2026-08, the button previously had none) against a fast repeat click — `if (saveBtn.disabled) return;` before the `await`, re-enabled in a `finally`; a double-click during the network round-trip could previously create two clients from one submission. `js/programs.js`/`js/roles.js` had the structurally identical gap in their own save functions, but those functions (along with the rest of both files' unreachable modal-editing UI) were deleted entirely in the 2026-08 dead-code cleanup — see their own entries below
js/programs.js           — `loadProgramsFromApi`/`savePrograms`(no-op)/`getPrograms` only; its modal-editing UI (`showProgramsModal`/`renderProgramsTable`/`openProgramEditModal`/`saveProgramFromModal`/`showProgramError`/`deleteProgram`/`cfgRefreshProgramDropdown`) was confirmed unreachable from any page (verified via repo-wide grep — the only same-named hit, `deleteProgram` in `config.html`, is an unrelated Vue component method) and deleted 2026-08
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
                            (400, no partial DB writes) if any row's date can't be resolved — either a calendar-invalid
                            D/M/YYYY date (via `parseFlexibleDate`) or a cell value that doesn't match any recognized
                            date format at all (2026-08; previously fell through to storing the raw, un-validated
                            string as the entry's date). A whitespace-only cell is treated as "no date" (`null`),
                            not an error. `trimRowKeys(row)` trims every uploaded row's object keys before
                            `resolveColumnMap()` reads them (predates this session), so header/value whitespace
                            mismatches between the sampled header row and individual data rows can't cause a
                            column-mapping miss.
                            `api/src/routes/timesheets.js`'s `resolveColumnMap(headers)` — column-header-to-field
                            resolver for the XLS upload, exported (like `formatDate`) for direct `node:test`
                            coverage. Resolves each of `colDate/colRole/colOwner/colHours/colTask/colNotes/
                            colProjId/colProjName` via a **specificity-scored global assignment** (2026-08, replacing
                            the earlier fixed-declaration-order/first-match algorithm) — an audit
                            (`docs/superpowers/audits/2026-08-05-timesheet-column-mapping-ambiguity-audit.md`) found
                            the old algorithm could silently misassign a column whenever a generic keyword from an
                            early-declared field (e.g. `colOwner`'s bare `'name'`/`'nome'`) collided with a more
                            specific keyword belonging to a later-declared field (e.g. `colProjName`'s
                            `'project name'`) — the outcome depended purely on which column happened to appear first
                            in the uploaded file, with no error ever raised (`"Project Name"` could end up as the
                            `owner` value for every row, `colProjName` left `null`). Every (header, field) match is
                            now scored — tier 2 if the header equals the keyword exactly, tier 1 if the keyword
                            appears as a whole word inside the header (word-boundary aware via a manual
                            `\p{L}\p{N}` Unicode-property check, not a plain regex `\b`, since `\b` doesn't treat
                            accented letters like the `à` in `attività` as word characters and would misfire on that
                            candidate); within a tier, a longer/more specific keyword outranks a shorter/generic
                            one — then all matches across every header and every field are sorted by score and
                            assigned greedily (highest-specificity first), so field-declaration order only decides
                            genuine ties (e.g. `"Resource Name"` still resolves to `colRole`, not `colOwner`,
                            because `'resource'` (8 chars) always outscores `'name'` (4 chars) — it never reaches
                            the tie-break). `colTask`'s candidate list gained `'task name'`/`'nome attività'`
                            (mirroring `colProjName`'s existing `'project name'` pattern) — a gap found mid-fix: the
                            bare `'task'` (4 chars) tied exactly with `colOwner`'s bare `'name'` (4 chars) for the
                            header `"Task Name"`, and without a more specific candidate to break that tie cleanly,
                            declaration order silently regressed the exact bug being fixed. 2026-08 hardening:
                            `matchSpecificity()` now scans every occurrence of a candidate substring, not just the
                            first — previously a candidate whose first occurrence wasn't word-boundary-clean
                            returned no match at all, even if a later occurrence in the same header was; and
                            `resolveColumnMap()`'s `usedHeaders` collision-tracking `Set` now stores column index
                            (`m.headerIdx`) instead of header text (`m.header`), so the string-vs-index distinction
                            doesn't conflate two distinct columns that happen to share identical header text —
                            though the practical benefit is bounded by `result[field]` still storing the header
                            *string* (dereferenced by callers via `row[map.colX]`), so two identically-named columns
                            still resolve to the same underlying value; no two fields in the current
                            `FIELD_CANDIDATES` table share an overlapping candidate word, so a genuine cross-field
                            collision isn't constructible from today's real candidate list. The non-optimal
                            greedy (rather than globally-optimal bipartite) assignment strategy is unchanged —
                            no demonstrated real-world trigger, left as documented backlog.
                            `rate-resolve.js` (2026-09) — `resolveFee(tasks, taskName, role)`: backend port of
                            `js/core.js`'s `findRate()` (case-insensitive task+role match, fallback to a matched
                            task's first resource, `0` — never `null` — when nothing matches). Consumed by
                            `api/src/routes/timesheets.js`'s `POST /upload` to snapshot a `fee` value onto every
                            uploaded timesheet entry at insert time (see that file's own entry below); the `0`
                            fallback (vs. `findRate`'s `null`) is deliberate — the value is persisted, not
                            display-only, so it needs a concrete number, and `0` matches the same "no data" display
                            convention already used for Fee/Spent throughout `timesheets.html`.
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
api/src/routes/timesheets.js     — `GET /` (2026-09) returns one summary row per `project_code` plus `client_name`/
                                    `project_name`/`currency`/`pipeline_year`, resolved via `LEFT JOIN LATERAL`
                                    against `projects` (`ORDER BY created_at LIMIT 1` — `projects.code` has no
                                    uniqueness constraint, `012_project_code.sql`), then `clients`/`cost_grid_versions`;
                                    `POST /upload` additionally snapshots a `fee` onto every entry via
                                    `api/src/lib/rate-resolve.js`'s `resolveFee()` (batched one query per upload via
                                    `loadProjectTasksByCode()`, not one per row) before the existing replace-per-code
                                    `DELETE`+`INSERT`. Both LATERAL joins and `visibleCodes()`'s own non-admin filter
                                    share one `projectVisibilityPredicate(alias, userIdParam, isAdminExpr)` helper
                                    (owner or `resource_shares`) so a duplicate `project_code` across two projects
                                    with different visibility never leaks the inaccessible one's name, currency, or
                                    task rates to a user who can't see it — including at upload time, where the
                                    uploader's own visibility scopes which project's rates get snapshotted (a
                                    duplicate code with no project visible to the uploader resolves to `fee: 0`, the
                                    same as any other unresolvable rate, rather than ever drawing from a project they
                                    can't see). This is a narrower, correctness-focused helper than the `DELETE
                                    /:projectCode` handler's own visibility check just below it, which is
                                    intentionally different (owner/editor *permission*, not read visibility) and was
                                    not folded in.
api/src/db/migrations/   — numbered SQL migration files
api/src/services/        — email (nodemailer: sendInvite, sendPasswordReset, sendShareNotification,
                            sendExportEmail, sendAdminNotificationEmail), jwt
api/src/create-admin.js  — CLI bootstrap script (admin user create/reset)
scripts/test-branch.sh   — isolated Docker Compose stack for testing the current feature branch before merge
                            (distinct container names/ports from the main stack, clones data from main via
                            pg_dump/pg_restore when available, falls back to a fresh migrated DB + bootstrapped
                            test admin otherwise — the fresh-DB migration loop is idempotent, 2026-08: a
                            `schema_exists()` helper checks `public.users` via `to_regclass` before applying
                            migrations, so a second `up` without an intervening `down` skips already-applied
                            migrations instead of failing with "already exists"; admin bootstrap stays unconditional
                            on every run — further hardened 2026-08: `schema_exists()` also checks
                            `cg_version_projects.task_names_direct` (added by the *last* migration file,
                            `017_task_names_direct.sql`) alongside `public.users`, so a schema left partially
                            migrated by an interrupted run is detected and the script exits with an explicit
                            `down && up` remediation message instead of silently skipping the remaining migrations
                            (blindly re-running the full loop against a partial schema would itself fail with
                            "already exists" on the migrations that did succeed, since files don't use
                            `IF NOT EXISTS`); also explicitly checks the first `psql` call's own exit status,
                            warning rather than silently treating a transient connection failure as "schema
                            absent" — a second, unguarded `psql` call for the last-migration check remains a known,
                            accepted minor gap); `up`/`down`/`status` subcommands (`status` reports "up" only when both
                            containers are actually Docker-healthy — `.State.Running` + `.State.Health.Status`,
                            2026-08, previously just checked they existed via `docker ps`, which misreported a
                            crash-looping/still-starting/stopped-but-stale-healthy container as "up" — consumed by
                            `/finish-cycle` Gate 2 to detect a branch environment already running from an earlier
                            attempt); reads `.env` via a manual line-by-line parser (never source/eval — real `.env`
                            values here contain shell-special characters); `load_env()` silently skips any line with
                            no `=` or an invalid shell-identifier key (2026-08 — previously a stray line like
                            `export FOO=bar` aborted the whole script under `set -e`) and trims whitespace around
                            key/value (both `line`/`key`/`val` are now `local`-declared too, 2026-08, closing a
                            gap where they previously leaked into the calling shell's namespace); 2026-08 Cycle 3
                            hardening: the main-stack data-clone dump is written via `mktemp` (`600` permissions,
                            no world-readable window) instead of a fixed `/tmp/pdash_branch_snapshot.dump` path
                            (a stale, days-old dump was found under the old fixed path during this fix's own
                            verification), and is now cleaned up via `trap 'rm -f "$DUMP_FILE"' EXIT` (added right
                            after `mktemp`, replacing an earlier unconditional `rm -f` that only ran on the success
                            path) so a mid-`pg_dump`/`pg_restore` failure doesn't leak the file — this is the only
                            `EXIT` trap in the script; the four ports are overridable via optional `TEST_BRANCH_FRONTEND_PORT`/
                            `TEST_BRANCH_API_PORT`/`TEST_BRANCH_DB_PORT`/`TEST_BRANCH_ADMINER_PORT` `.env` variables,
                            same defaults (8081/3001/5433/8082) if unset
scripts/run-tests.sh     — ephemeral, fully isolated Docker Compose stack for the integration-test profile
                            (distinct `-p pdash_test` project name, `pdash-db-test`/`pdash-api-test` container
                            names, no host ports at all via `ports: !override []`); reuses `scripts/test-branch.sh`'s
                            `load_env()`/`write_override()`(`!override` merge tag)/`wait_healthy()` verbatim rather
                            than reinventing them (its own `load_env()` copy received the identical 2026-08 fix,
                            kept duplicated by design — no shared shell-library convention exists in this project);
                            applies all `api/src/db/migrations/*.sql` explicitly before
                            starting `api` (the `test` service's own command never applied migrations itself —
                            confirmed via `api/Dockerfile`/`create-admin.js`, so the old bare
                            `docker compose --profile test run --rm test` command only ever "worked" by silently
                            attaching to the main stack's already-migrated volume, a real data-isolation risk, not
                            just a naming conflict); `trap cleanup EXIT` guarantees containers + the disposable
                            `pdash_test_pgdata`-prefixed volume + the generated `docker-compose.test.yml` override
                            are removed on every exit path (pass, fail, or interrupt); replaces the old bare command
                            as `/finish-cycle` Gate 1's documented test command (`.claude/commands/finish-cycle.md`)
                            and as `TEST_CASES.md`'s "Auto" coverage legend; `docker-compose.test.yml` is gitignored;
                            2026-08 Cycle 2 hardening added: an invocation-directory guard (exits 1 before any Docker
                            call if `docker-compose.yml`/`api/src/db/migrations/` aren't found relative to cwd);
                            an unconditional pre-cleanup (`$COMPOSE down -v --remove-orphans`) at script start,
                            running *after* `write_override` (the override file must already exist, since `$COMPOSE`
                            references it via `-f` — otherwise the pre-cleanup silently no-ops, a bug caught by the
                            cycle's own final whole-branch review) — so state left over from a `SIGKILL`'d prior run
                            (which bypasses the `EXIT` trap) doesn't leak into the next one; and a conditional
                            `--build` for `api` only, gated on a hash of `api/Dockerfile`+`api/package.json` against
                            a gitignored marker (`.run-tests-image-hash`, repo root) — `db` drops `--build` entirely
                            since it has no build context (`image: postgres:16-alpine` directly, no Dockerfile);
                            2026-08 Cycle 3 hardening: the duplicated `$COMPOSE down -v --remove-orphans` command is
                            now a single shared `compose_down()` function (used by both `cleanup()` and the
                            pre-cleanup call); an `mkdir`-based concurrency lock, acquired right after the cwd
                            guard and released in `cleanup()`, prevents two simultaneous invocations from tearing
                            each other down — the lock lives at a shared `${TMPDIR:-/tmp}/pdash_test.run-tests.lock`
                            path rather than inside the repo checkout, since the `pdash_test` Docker project it
                            protects is daemon-global, not scoped to any one git worktree (two different worktrees
                            each acquiring their own checkout-local lock was the exact bug this final form avoids,
                            caught by this cycle's own whole-branch review); the lock-contention error message
                            names the exact `rmdir` command to recover from a genuinely stale lock
```

### `v-cloak` (all Vue pages, 2026-07)

Every one of the 13 Vue-mounted pages (all pages except the 9-line `index.html` redirect) has `v-cloak` on its actual Vue root mount element, paired with the `[v-cloak] { display: none; }` rule in `css/tokens.css`. This hides the raw, uncompiled template markup that would otherwise briefly flash on load/reload before Vue finishes mounting (each page is a runtime-compiled `Vue.createApp({...}).mount(...)` with no build step, so the template is the literal HTML already in the file). Vue removes the `v-cloak` attribute automatically once mounting completes — no application code manages it. **Any new Vue page must add `v-cloak` to its root mount element** to get this protection; it is not automatic. If a root element ever needs an inline `display` style (as `pipeline.html`'s did — extracted into `.pb-board-root` in `css/style.css` for exactly this reason), prefer a CSS class over an inline `style` attribute, since an inline style would otherwise need `!important` on the `[v-cloak]` rule to be overridden (a global, blunt fix for what is really a single-page conflict).

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
- `pipeline.html`'s inline `PB_STAGE_STYLE` const — uses `var(--pipeline-*-bg/color)`

Valid stages: `SIP`, `Expected`, `Anticipated`, `Committed`, `Canceled`.

Kept in sync on `config.projects[].pipeline` (a separate field from `costGridVersion.pipeline`) by `cgPropagatePipelineToProjects()` (`js/costgrid.js`), which runs on every change of the cost grid editor's Pipeline `<select>` and updates every project in `linkedProjects` — the only path that ever changes a version's pipeline stage. `getProjectPipeline(projectId)` (`js/core.js`) resolves the authoritative value for a given project: the linked cost grid version's `pipeline` if `costGridRef` is set, else `config.projects[].pipeline` directly. `js/planning.js`'s Resource Planning view deliberately reads `config.projects[].pipeline` directly rather than via `getProjectPipeline()` — by design, since resource planning applies once a task is converted into a project, not before — this is safe because of the propagation above, not despite it (verified: `docs/superpowers/audits/2026-07-09-project-pipeline-direct-reads-audit.md`).

Do not confuse pipeline **stage** (`SIP`/`Expected`/.../`Canceled`, this section) with project **status** (`Not started yet`/`Started`/`Started At Risk`/`Put on hold`/`Completed` — a separate field, whose allowed values per pipeline stage are defined by `js/lib/status-rules.js`'s `getStatusRule()`).

Helper: `getProjectPipeline(projectId)` — reads from `costGridRef` version first, falls back to `config.projects[].pipeline`.

### Script loading order (`js/lib/*` modules, and page script `defer`)

Files under `js/lib/` are native ES modules (`export function ...`), loaded via `<script type="module" src="js/lib/...">`, with a `window.<name> = <name>` bridge line per export so existing classic-script callers keep working unchanged.

**All classic `<script src="...">` tags on every Vue page — both CDN libraries (Vue, Bootstrap, Chart.js, etc.) and this project's own `js/*.js` files — carry `defer`** (2026-08 hardening, to shorten the blank-screen window before Vue mounts; see the `v-cloak` section above for why that window exists at all). Per the HTML spec, `defer`'d classic scripts and `type="module"` scripts (without `async`) share **one ordered execution queue**, ordered by document position, all running after HTML parsing completes but before `DOMContentLoaded` fires. So `js/lib/*.js` modules and every `js/*.js`/CDN script now execute in the same relative order as before, just later (non-blocking during parse) rather than synchronously as the parser reaches each tag.

Each page's trailing `Vue.createApp({...}).mount(...)` script is `type="module"` too (module scripts join the same queue), **except** `pipeline.html`, `costgrid.html`, and `planning.html`, whose entire `Vue.createApp`/`.mount()` call already lives inside a `document.addEventListener('DOMContentLoaded', () => {...})` wrapper — since that callback only ever fires once every deferred/module script has already run, no conversion was needed there.

**Rule (updated 2026-08):** any inline `<script>` on a page that is left as a plain classic script (no `defer`, no `type="module"`) executes **immediately at parse time — before every deferred/module script on the page**, regardless of where it sits in the document relative to those tags. This is now the opposite of the old assumption that classic scripts ran "in document order" relative to each other with no gap: a lone un-deferred inline script and a `defer`'d/`module` script are no longer in the same execution queue at all. Three pages have such shims that are genuinely safe left this way (`admin.html`/`timesheets.html`/`config.html`'s inline `esc()` function — nothing else on those pages defines a colliding global `esc`). But `pipeline.html`'s `showCostGridEditorView` override and `planning.html`'s `showPortfolioView`/`showDashboardView`/`showPipelineBoardView`/`updateNavState` overrides collided with same-named globals in now-deferred `js/costgrid.js`/`js/portfolio.js`/`js/core.js` — found by the final whole-branch review of the 2026-08 defer cycle, since a classic shim executing first no longer "wins" once the file it used to override is deferred. Both were fixed by converting the shim itself to `<script type="module">` with an explicit `window.functionName = function (...) {...}` assignment (not a bare `function functionName() {...}` declaration, since module top-level declarations never become `window` properties) — this makes the shim join the deferred/module queue *after* the file it overrides, so its assignment wins. **Any future page-local override of a `js/*.js` global must use this same pattern**, not a bare classic inline `<script>`.

A bridged `window.*` global from `js/lib/` may only be read from inside an event handler or a function invoked after `DOMContentLoaded` — never at the top level of a still-classic, non-deferred inline script's parse-time execution (the `esc()` shims above satisfy this trivially, since they don't read anything).

If a future `js/lib/` module needs another `js/lib/` module's function, use a native ES `import` between them (resolved independently of `<script>` tag order in the HTML), not the `window` bridge.

### Linked project resolution

`linkedProjects[].projectId` may contain stale auto-generated IDs if the project was renamed. Correct resolution order in `pipeline.html`'s `detailLinkedProjects` computed (Vue; ported verbatim from the former `js/pipeline-board.js`'s `pbOpenDetailPanel()`):

1. Direct `config.projects.find(p => p.id === lp.projectId)`
2. If null: filter projects by `costGridRef.cgId + versionId` → match by name within that subset
3. Single-project unambiguous fallback

Never use `lp.projectId` raw as the display ID — always resolve to `proj.id`.

### Cost grid editor ↔ pipeline board integration

- `costgrid.html` is a separate page. The back button navigates to `pipeline.html`.
- After delete (grid or version): `cgConfirmDeleteGrid`/`cgConfirmDeleteVersion` call their `onSuccess` callback if given, else fall back to a bare `renderPipelineBoard()` — a global that no longer exists on `pipeline.html` (its Vue rewrite passes a callback that bumps `refreshTick` instead); `costgrid.html` still defines its own local `renderPipelineBoard()` override, so the fallback remains safe there.
- After JSON import: `cgImportAll()` calls `renderPipelineBoard()` guarded by a `typeof` check, for the same reason.
- `showCostGridEditorView(cgId, verId)` redirects to `costgrid.html?cgId=...&verId=...` on `pipeline.html` (a page-local override, plain redirect). On `costgrid.html` itself, `js/costgrid.js`'s own `showCostGridEditorView` is instead a thin bridge delegating into the page's mounted Vue instance (`_cgVueApp.openVersion(cgId, versionId)`) — no longer a single-page-app DOM-render function.
- On `costgrid.html` cold load: call `cgSyncFromApi()` before reading URL params to avoid empty `_cgStore`

### Version tab switching (editor)

`costgrid.html`'s Vue instance handles version-tab clicks directly via `switchVersion(verId)` (a Vue method, `@click` on each tab), which calls `cgAutoSave()` then `await this.openVersion(this.cgId, verId)` — `openVersion()` itself awaits `cgLoadStructureFromApi(cgId, verId)` before assigning `_cgDraft`/`this.draft`, ensuring the structure is fetched before rendering. `js/costgrid.js`'s `renderCgVersionTabs(cg)` (called by other, unchanged global functions like `cgPublishDraft`) is now just a bridge that reassigns `_cgVueApp.cg` — it no longer owns the tab click-handling itself.

### Clone (`cgCloneGrid`)

`_pbCloneSource = { cgId, verId, name }` is declared in `costgrid.js` so it is available on both `pipeline.html` (whose Vue `openCloneModal` method sets it) and `costgrid.html` (whose own Vue `openCloneModal` method sets it identically).

Clone flow:
1. Clears `_cgAutoSaveTimer` (clearTimeout) to prevent concurrent save on the original during clone
2. Creates a new cost grid + version via API; new version label is always `'v1'` regardless of the source label
3. Copies phase/task/role structure from the source version via `cgLoadStructureFromApi` + `saveStructure` — the copied `phases` array is passed through `stripCloneTaskIds()` (`js/lib/costgrid-calc.js`) first, removing every `taskId`/`phaseId` so the backend mints fresh UUIDs instead of reusing the source version's (still-existing) ones, which previously caused `duplicate key value violates unique constraint "tasks_pkey"`
4. On `costgrid.html`: updates URL to the new `cgId`/`verId` via `history.replaceState` (prevents stale URL state loops)
5. Redirects to the new grid in the editor, re-fetching the server-assigned structure via `cgLoadStructureFromApi` (the in-memory seed used only `phases: []` since the real IDs aren't known client-side until the server assigns them)

### Pipeline board layout (height math)

Navbar: two rows (106px: 10px padding-top + 44px top row + 52px tabs row). Footer: fixed 100px.

`#pipelineBoardSection { height: calc(100vh - 206px) }` — 106px navbar + 100px footer. Must be kept in sync if navbar/footer height changes.

`#pbColumnsContainer { height: calc(100% - 61px) }` — the 61px is the pipeline section's own header bar.

**Critical**: do NOT add `h-100` class to `#pbColumnsContainer`. Bootstrap's `.h-100` applies `height:100%!important`, which overrides the `calc()` value and hides the sticky totals footer below `overflow:hidden`.

### Detail panel

`#pbDetailPanel` width: 860px, Vue-rendered (`v-if="selectedCgId"`). Layout (top to bottom):
- While the version's phase/task structure is loading (`detailLoading`): a centered Bootstrap spinner, no header action buttons.
- If `selectedCg`/`selectedVersion` fail to resolve after loading (e.g. a stale/missing cost grid): an explicit "Could not load cost grid. Try reloading the page." message, matching the former `js/pipeline-board.js`'s equivalent error path.
- Otherwise: **Version tabs row** (shown whenever `cg.versions.length > 0` — always visible, even for a single-version proposal, since 2026-07): horizontal tab buttons with colored stage dot, rendered above the two-column body; clicking a tab calls `openDetailPanel(cgId, verId)` to reload the panel for that version.
- **Two-column body** (a `d-flex flex-grow-1`, no separate `#pbDetailContent` wrapper — direct child of `#pbDetailPanel`):
  - Left column (50%): offer metadata + linked projects, `overflow-y:auto`, `border-right`
  - Right column (flex:1): task/phase breakdown, `overflow-y:auto`

Header buttons (right side, shown once loaded): `🗑 Delete` · `⧉ Clone` · `🔗 Share` · `✏️ Edit` · `×` — plain `@click` Vue bindings, no element IDs.

- `🗑 Delete`: visible only when `detailStage === 'Draft'`. Calls `deleteSelectedVersion()`, which wraps `cgConfirmDeleteVersion(cgId, verId, label, onSuccess)` with an `onSuccess` that closes the panel and bumps `refreshTick`.
- `⧉ Clone` calls `openCloneModal(cgId, verId)`, which sets `_pbCloneSource = { cgId, verId, name }` for the currently viewed version and opens `#cgCloneModal`.
- Outside-click-to-close (`mousedown` outside `#pbDetailPanel`, 200ms delayed registration to avoid the opening click immediately closing it) explicitly ignores clicks inside any `.modal`/`.modal-backdrop` — Share/Clone/Confirm modals are appended outside `#pbDetailPanel` in the DOM, so without this guard, interacting with them (e.g. confirming a delete) would close the panel mid-action.

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
