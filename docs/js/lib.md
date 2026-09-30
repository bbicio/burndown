# js/lib/

Pure functions extracted for unit testing (vitest + jsdom), each an ES module (`export function ...`) with a `window.<name> = <name>` bridge for existing classic-script callers; see `CLAUDE.md`'s "Script loading order" section for how these modules fit into page load order.

This file holds the full function-by-function reference and implementation narrative for `js/lib/` — signatures, what each function does, cycle-by-cycle bug history, and which pages load which module. `CLAUDE.md`'s File structure entry keeps only a one-line pointer; when working on any `js/lib/*.js` file, read this file, not that line, for the detail. See `/sync-docs`'s routing rule for where future changes to these modules should be written.

## cfg-parse.js

`cfgParseHours`, `cfgFmtHours`, `roundToQuarterHour` (moved from `config-form.js`), `distributeHoursExact(total, rawValues, grid=0.25)` (largest-remainder rounding: floors every raw value to `grid`, then hands the missing grid-steps to the containers with the largest fractional remainder — ascending key as tie-break — so the returned values always sum to exactly `roundToQuarterHour(total)`; throws on a negative `rawValues` entry or if `Σ rawValues` diverges from `total` by more than 0.05). Used by `cfgDerivePhasing`/`cfgReforecast` in `config-form.js` so the planning-grid total shown in the confirmation modal always matches what gets saved.

## planning-calc.js

`matchesTaskRole(record, taskName, role)`: case-insensitive on both role and task name, null-safe (a missing `taskName` matches on role alone, never throws). `computeResidual(soldH, consumedH)`: `Math.max(0, soldH - consumedH)`, extracted verbatim from three previously-divergent inline implementations. Both are consumed identically by all three grouping views in `planning.html`'s Vue instance (by-role, by-project, by-owner) — previously by-role/by-project crashed on a task with no name and by-owner was case-sensitive on both fields.

**Planning model cycle (2026-09-29, `?v=5`):** the calculation moved to the backend (`api/src/lib/planning-*.js`, `docs/api/planning-model.md`), so this module was trimmed: `distributeFutureResidual`, `redistributeExcludingInactive` and `countFutureTaskWeeks` were removed (their server counterparts live in `api/src/lib/planning-distribution.js` / `planning-calendar.js`). What remains: `matchesTaskRole`, `computeResidual`, `getCalendarWeeks`, `sumChildBreakdownHours`, plus the pre-existing, unused `workingDaysInWeek` and `getPlanningPeriods`. The paragraphs below describing the removed functions are kept as history of the (unchanged) rules.

`distributeFutureResidual(residualH, totalFutureWeeks, weeksByMonth, pulseEnabled)` (removed 2026-09-29, see above): computes `hPerWeek` from the task's canonical remaining-week count (not the currently-visible date window); when `pulseEnabled && hPerWeek < 1`, aggregates each month's weeks into one entry placed on that month's first week with hours proportional to its week count; otherwise returns one entry per week at a flat `hPerWeek`. Consumed identically by all three grouping views — previously by-owner used the visible window's week count for its pulse threshold (so paging could flip it) and split hours equally per month regardless of week count, both since unified with by-role/by-project's already-correct behavior; `countFutureTaskMonths()` (the old by-owner-only helper this replaced) was removed as dead code.

`getCalendarWeeks(startDate, endDate)` / `workingDaysInWeek(week, taskStart, taskEnd)` / `getPlanningPeriods(cfg, interval)` / `countFutureTaskWeeks(tStart, tEnd, todayMidnight)` — week-bucketing and date-range helpers added in the `planning.html` Vue migration, relocated verbatim from the former `js/planning.js`; `getPlanningPeriods` reads `getMonthRangeFromCfg` (a `js/portfolio.js` classic-script global) via `globalThis` rather than importing it, since `js/lib/` modules only import from sibling `js/lib/` modules, never from classic-script globals.

`sumChildBreakdownHours(roleWeekMap, weekKeys, project, task)` (2026-09) — sums, across a set of week keys, only the `breakdown` entries belonging to one (project, task) child; `isPulse` is true only if a week that actually contributed matching hours was itself a pulse week (a pulse week with no matching entry doesn't taint an unrelated child's flag). Feeds `byRoleView()`'s By Role drill-down child rows — see `docs/pages/planning.md`'s "By Role project/task drill-down" section.

`redistributeExcludingInactive(ownerTotals, ownerStatus)` (2026-09-28; removed 2026-09-29, now server-side only) — `ownerTotals: {[name]: actualsHours}`, `ownerStatus: {[name]: 'active'|'inactive'}` (a name absent from `ownerStatus` is treated as `'active'`, fail-open). Returns `{ props: {[name]: proportion}, allInactive: boolean }`: renormalizes each eligible (non-`'inactive'`) owner's proportion over the eligible pool's own total, so an inactive owner's share is redistributed among the rest while preserving their relative ratio; `allInactive: true` (empty pool, or its total ≤0.01) signals the caller to route 100% of future hours to the existing TBD placeholder row instead. Consumed by `byProjectView`/`byOwnerView` in place of their previous raw `ownerTotals[o]/totalOwnerH` proportional split — see `docs/pages/planning.md`'s "Inactive-owner handling" section for the full call-site narrative, including the `displayOwners` all-inactive-TBD-row fix and the By Owner Sold-hours carve-out.

Loaded via `<script type="module">` on `planning.html`, before the inline `Vue.createApp` script.

## planning-model-ui.js (2026-09-29, Planning model cycle)

Client side of `POST /api/planning/model` (`docs/api/planning-model.md`), pure and DOM-free, loaded only by `planning.html` (`?v=1`, `<script type="module">`, `window.*` bridge for each export). `localYmd(date)`: local `YYYY-MM-DD` (what the request sends for `from`/`to`/`asOf`). `buildModelRequest({ view, projectIds, teams, windowStart, windowEnd, today, pulse })`: maps the page's view id (`byrole`/`byproject`/`byowner`) to `role`/`project`/`owner` and builds the request body, teams sorted so the same filter set always yields the same request key. `buildKeyMap(weeks)` / `remapKeys(obj, keyMap)`: the server keys weeks by Monday `YYYY-MM-DD`; the page's render code keys them by `weekStart.toISOString()`, so responses are re-keyed (unknown keys pass through). `adaptRoleModel` / `adaptProjectModel` / `adaptOwnerModel(data, keyMap)`: reshape the three server projections into the structures the existing render code used (`roleMap`/`roleSoldMap`/`roleActualsMap`/`roleChildMap`; the project tree with re-keyed `weekTotals`/`weekData`; `ownerMap`). Vitest cases in `planning-model-ui.test.js`. Page-side use: `docs/pages/planning.md`, "Planning model".

## status-rules.js

`getStatusRule(pipeline)`: returns `{ options: string[] | null, disabled: boolean }`, the single source of truth for which project Status values are selectable per pipeline stage (`SIP` → empty + disabled; `Canceled` → `options: null` meaning "leave current value untouched", disabled; `Committed`/`Expected`/`Anticipated` each have their own list, all spelled `'Completed'` — matching `statusBadge()`/`statusBadgeLarge()` and `planning.html`'s Resource Planning filter, never `'Complete'`). Replaces `js/core.js`'s previous inline `allowed`/`allOpts` map, which had `Committed` missing `Started At Risk` (present for `Expected`/`Anticipated`) and used the spelling `'Complete'`, which no other consumer in the codebase recognized.

Loaded via `<script type="module">` on `project-config.html` and `portfolio.html`, before `core.js`.

## costgrid-calc.js

`versionHasFreeTasks(ver)`: true if any task in `ver.phases[].tasks[]` is absent from every `ver.linkedProjects[].taskIds`/`taskNames`. `isVersionCommittedLocked(ver)`: `ver.pipeline === 'Committed' && !versionHasFreeTasks(ver)` — keyed on the *proposal's own* pipeline field, not any individual linked project's. Used by `cgGetVersionLockState()` (`js/costgrid.js`) for its `committed` lock reason; previously that check read a linked project's own `pipeline` field and locked the whole version (hiding Generate Project, disabling the editor) as soon as *any single* linked project reached Committed, even with other tasks in the same version still unmapped.

Loaded via `<script type="module">` on every page that can render version lock state: `project-config.html`, `portfolio.html`, `planning.html`, `pipeline.html`, `costgrid.html`.

`findExistingProgramForProposal(linkedProjects, projects, cgId, versionId)` (2026-09) — once a proposal's first partial-task-selection Generate Project run establishes a program, every later generation from the same proposal (partial or full) auto-links to it instead of prompting again; this resolves that existing program id from the proposal's `linkedProjects`. Mirrors `pipeline.html`'s `detailLinkedProjects` computed's stale-id resolution exactly: direct `project.id` match, then (scoped to `cgId`/`versionId`) a name match — exact, then prefix — then a single-project-in-scope fallback; `cgId`/`versionId` are optional and simply skip the fallback tiers when omitted. Used by `cgSubmitProjectName()` (`js/costgrid.js`).

`resolveRoleRate(...)` — 3-tier rate resolution: ratecard per-currency override → role per-currency override → EUR baseline × live exchange rate factor; deduplicates logic previously repeated inline three times. Called from both the Vue role-selector/rate-cell code in `costgrid.html` and from `js/costgrid.js`'s `cgSyncRoleRatesToBaseline`/`cgPreviewRateChange` — see `docs/js/costgrid.md`.

`stripCloneTaskIds(phases)` — strips `taskId`/`phaseId` before a cloned structure is POSTed to `saveStructure()` for a new version — fixes a `duplicate key value violates unique constraint "tasks_pkey"` error: the backend reuses a supplied `taskId` as the new row's PK, correct for a same-version re-save but wrong for Clone, since the source version's tasks still exist in the DB under those exact IDs. Used by `js/costgrid.js`'s `cgCloneGrid()` — see `docs/js/costgrid.md`.

## portfolio-calc.js

`computeKpis(data, cfg, billableData, billableTasks, findRate)`: extracted from the former `js/dashboard.js`'s `renderKPIs`, returns `{ consumedHours, soldHours, budgetTotal, consumedEur, hoursLeft, budgetLeft, feesOnly, totalPtc, maxDate }`. `computeBurndownPoints(data, cfg, taskFilter, interval, billableData, billableTasks, findRate)`: extracted from `renderBurndown`'s data-prep (the largest, highest-risk function in the old file); points sit at the 1st of each period with `date <= point` accumulation, so a period's consumption only appears starting at the *next* point — real, pre-existing production behavior. Both consumed by `portfolio.html`'s Vue `kpis`/burndown-chart computed properties; the chart-drawing (Chart.js) call itself stays a Vue method, not extracted.

`buildSummaryCols(rows, byKeyFn, entries, filterRange, cfg, findRate)` (2026-09): generic pivot builder behind "Summary by task/role" — `entries` is the caller-built `{key, label, soldHours, soldEur}` column list, `byKeyFn(row)` decides which entry a row counts toward (a single dimension for "by task", a composite `role|task` string for "by role"); extracted verbatim from `portfolio.html`'s former Vue method of the same name (`this.filterRange`/`this.dashboardProject` became explicit params). `summaryTotals(cols, hasFilter)`: sums a `buildSummaryCols()` column array into a card's TOTAL column, agnostic to how the columns were grouped; kept as a thin Vue-instance method wrapper on `portfolio.html` *in addition to* this export, since it's called directly from template expressions, which — unlike a plain JS method body — do not reliably fall back to a bare `window.*` global from inside their own compiled `with()` block (`buildSummaryCols` has no such wrapper, since it's only ever called from computed properties, not the template).

`normalizeGroupEntries(grp)` / `entryMatchesRow(entries, role, task)` (2026-09): the membership mechanism behind "Summary by functional area" — a group's `entries: [{role, task}]` (`task === ''` = wildcard, "any task") decides whether a given timesheet row's `(role, task)` counts toward that functional area; `normalizeGroupEntries` seeds wildcard entries from a group's legacy `roles: string[]` (no task association) when `entries` is absent, so old group definitions keep working with no DB migration.

Loaded via `<script type="module">` on `portfolio.html`, before the inline `Vue.createApp` script.

## pipeline-calc.js

`pbGetVersionBudget(v, cgComputeGrandTotals, getPipelineBudget)` / `pbComputeColumnTotals(cards, cgComputeGrandTotals, getPipelineBudget)`: extracted from the former `js/pipeline-board.js`'s own aggregation logic, with the shared `js/costgrid.js` globals passed in as parameters (dependency injection) rather than read directly, matching `portfolio-calc.js`'s precedent — keeps the module DOM-free and independently testable. `pbFmtMoney(n, code, currencies)` / `pbFmtDate(iso)` / `pbFmtTaskDate(iso)` / `pbComputePotPercentages(totalBudget, committedTotal, potAmount)`: pure formatting/POT-math helpers, also ported verbatim.

`pbPriceBucketKey(amountEur)` (2026-09) — buckets a EUR-equivalent total into `'0-20k'`/`'20-50k'`/`'50-100k'`/`'100-200k'`/`'200k+'`; lower bound inclusive of the *higher* bucket (exactly 20000 → `'20-50k'`, not `'0-20k'`), a deliberate user decision, not an off-by-one.

`pbCardMatchesFilters(card, filters, cgComputeGrandTotals, getPipelineBudget, getClientName)` (2026-09) — pipeline board's filter-bar matcher: AND across `{search, ownerIds, clientIds, currencies, priceBuckets, includePtc}`, OR within each array's own selected values (empty = no restriction); reuses `pbGetVersionBudget` + the same fee/rate EUR-equivalent division `pbComputeColumnTotals` already does for column footers, so the price-bucket filter and the totals shown today can never silently diverge; `includePtc` toggles the bucketed total between fee-only (default) and fee+ptc; `getClientName` is injected (like the other two callbacks) to keep this module DOM/global-free. See `CLAUDE.md`'s "Filter bar" section for the Vue-side wiring.

Loaded via `<script type="module">` on `pipeline.html`, before the inline `Vue.createApp` script.

## notif-browser.js

Two pure decision functions behind the browser-notification feature (see `docs/js/notifications.md` for the full feature), both `vitest`-covered, both deliberately trivial so the one non-trivial-looking part of this feature stays testable — the rest (permission prompts, the actual `Notification` constructor, focus/click handling) is DOM/browser-API surface, verified manually instead.

`shouldShowBrowserNotification(permission, isPageVisible, optedOut = false)`: `permission === 'granted' && !isPageVisible && !optedOut` — whether an incoming SSE push should fire a native popup.

`getBrowserNotifBannerState(permission, optedOut)` (2026-09, added in a same-cycle fix after manual testing found the original "Enable" button never updated once permission was granted): returns `{ visible, label }` — `label: 'Enable'` when permission is `default` or the user has locally opted out despite a `granted` permission, `label: 'Disable'` when granted and not opted out, `visible: false` when the browser itself denied permission (nothing this app can do about that).

Loaded via `<script type="module">` on every one of the 10 authenticated pages that also load `js/notifications.js`.

## team-ui.js (2026-09-25, Team UX cycle)

Two pure helpers for `team.html` (only page that loads it, `<script type="module" src="js/lib/team-ui.js?v=1">`, bridged to `window.sortResources` / `window.filterComboOptions` and read only inside computeds/methods, never at parse time). Spec `docs/superpowers/specs/2026-09-25-team-ux-design.md`, plan `docs/superpowers/plans/2026-09-25-team-ux.md`; 17 vitest cases in `js/lib/team-ui.test.js`.

`sortResources(list, key, dir = 'asc')`: returns a **new** array (input untouched). Keys: `name` (last name, then first), `email`, `role` (label, then code), `status` (active before anything else); an unknown key falls back to `name`. Comparison is case/accent-insensitive and numeric-aware (`localeCompare` with `sensitivity:'base'`, `numeric:true`); `null`/`undefined` count as `''`. `dir` (`'asc'|'desc'`) flips only the primary comparator — ties always fall back to name ascending, then to the original position, so switching direction never shuffles rows that compare equal.

`filterComboOptions(options, query)`: `options` is `[{ id, label }]`. An option is kept when **every** whitespace-separated token of the query is a substring of its label (case- and accent-insensitive via NFD + `\p{M}`), so "rossi mario" finds "Mario Rossi"; a blank/absent query returns a copy of all options; input order is preserved. Design refinement over the spec's plain "substring" (decided while planning).

### buildProfileTree (2026-09-25, Cycle 3c)

`buildProfileTree(profile, roles = [])` (bridged to `window.buildProfileTree`, `team-ui.js` is `?v=2` in `team.html`): turns a stored `resources.profile` into the tree the Experience profile tab renders, or `null` when the profile is absent or has no `totals`. Output `{ totals, computedAt, dimensions, roles }`: dimensions sorted by name, each with `untaggedHours` and `values[]` (`key`, `label`, `hours`, `share`, `last`, `projectCount`, `projects[]` = `{ code, name, hours, last, tasks[] }`), values and projects sorted by hours desc then name; role nodes carry `label` resolved from the `roles` list by code (fallback: the code) and their own `projects[]`. A code missing from `profile.projects` becomes a zero-hour node named by its code. Pure, never mutates its input; vitest cases in `js/lib/team-ui.test.js`. **2026-09-29 (profile descriptions cycle, `?v=5`):** the output also has `topics: [{ id, name, projectCount, projects[] }]` built from the API's resolved `profile.topics` (`[{ id, name, projectCodes }]`), sorted by project count desc then name; `[]` when the profile has none. See `docs/pages/team.md` and `docs/api/topics.md`.

### paginate, sortUnmatched, fold (Team UX polish cycle, 2026-09-28)

`team-ui.js` is `?v=4` in `team.html` (bumped twice this cycle — once for `paginate`/`sortUnmatched`, again when `fold` was exported mid-cycle after manual verification found the Unmatched search wasn't actually accent-insensitive as documented).

`paginate(items, page, pageSize)` (bridged to `window.paginate`): returns `{ pageItems, totalPages, page }`. `totalPages` is `Math.max(1, Math.ceil(items.length / pageSize))` — an empty list still reports 1 page, never 0; `page` is clamped into `[1, totalPages]` before slicing. Pure, never mutates `items`.

`sortUnmatched(list, key, dir = 'asc')` (bridged to `window.sortUnmatched`): same new-array/stable-tie-break contract as `sortResources`, but over `GET /api/resources/unmatched` rows instead of resources. Keys: `name` (`display_name`, via `fold`), `hours`, `projects` (both numeric, `Number(x) || 0` — not string comparison, so `9` sorts before `10`); an unknown key falls back to `hours`.

`fold(s)` (bridged to `window.foldText`, kept as the internal name `fold` for other functions in this module — already used by `filterComboOptions`): lowercases and strips accents (NFD + `\p{M}` removal) and trims. Exported (was previously a private helper) so `team.html`'s Unmatched-names search can use the same accent-insensitive matching the Team tab's search already had via `filterComboOptions`.

Used by `team.html` for: Team-tab pagination (wraps `sortedResources`, resets to page 1 only on `filterText`/`showInactive`/`sortKey`/`sortDir` changes — not on every list recompute, so editing/deactivating/deleting a row mid-page doesn't bounce the admin back to page 1); Unmatched-names search/sort/pagination (search and sort via `fold`/`sortUnmatched`, pagination resets on filter/sort/list-reload changes, since assign/ignore/rescan can shrink the queue); an expandable per-row project list (`GET /api/resources/unmatched`'s `project_list: [{code, name}]`, rendered "name (CODE)" — see `docs/api/resources.md`).

Spec `docs/superpowers/specs/2026-09-28-team-ux-polish-design.md`, plan `docs/superpowers/plans/2026-09-28-team-ux-polish.md`; vitest cases for all three in `js/lib/team-ui.test.js`.

`buildProfileTree` (2026-09-30, team assistant cycle) also returns `topicGroups: { direct, context, legacy }`: each topic node gains `hasProvenance`, `directHours`, `direct` and `context` (project-name children from `profile.topics[].direct/context.projectCodes`); `direct` holds nodes with provenance and at least one direct project, `context` those with at least one context project (a topic can appear in both), `legacy` those of a version-1 profile without provenance. `topics` (the flat list) is unchanged. Vitest cases in `team-ui.test.js`. Used by the "Direct experience" / "Project context" groups of the Experience tab (`docs/pages/team.md`).

## profile-jobs-ui.js (Cycle 3d, 2026-09-28)

Pure helpers for `profile-jobs.html` (only page that loads it, `<script type="module" src="js/lib/profile-jobs-ui.js?v=1">`, bridged to `window.*`). `filterJobProjects(list, { search, status })` (every whitespace-separated search token matches code or name, case/accent-insensitive), `sortJobProjects(list, key, dir)` (`'code'` numeric-aware, `'status'` by severity order error>queued>unprocessed>updated, `'lastProcessed'` with never-processed rows always last), `jobStatusLabel`/`jobStatusClass`, `describeNextRun(schedule, project?)`, `formatDateTime`, `formatDuration`. Spec `docs/superpowers/specs/2026-09-26-profile-jobs-console-design.md`, plan `docs/superpowers/plans/2026-09-26-profile-jobs-console.md`; 18 vitest cases in `js/lib/profile-jobs-ui.test.js`.

## team-assistant-ui.js (Planning team assistant cycle, 2026-09-30)

Pure formatting helpers for the Team assistant panel in `planning.html` (only page that loads it, `<script type="module" src="js/lib/team-assistant-ui.js?v=3">`, bridged to `window.*`). `renderChatText(text)` (model text is untrusted: HTML-escapes first, then allows only `**bold**` and line breaks), `rowView(row)` (formats one table row from `/rank`'s `rows[]`: score to one decimal, hours rounded, tags/projects/tasks/topics lists with "—" for empty, free hours as "N avg / M min", current load, hours on the project, flags, rationale), `projectOptions(projects)` (the selector's options: projects with a not-completed task that has a role and sold hours above 0), `starterPrompts(roles)` (five starter sentences, the availability one naming the first required role) and `tableTitle(key)` ("Best team" / "Alternative team" / "Available team"). Vitest cases in `team-assistant-ui.test.js`. Backend: `docs/api/planning-assistant.md`; page: `docs/pages/planning.md`.

## project-push-result.js (save-error message)

`summarizePushResult(failed)` (2026-09-30): turns the `failed` list of `_pushProjectToApiDetailed()` (`js/api-sync.js`) into `{ ok, message }` — "Save failed: <parts> (was|were) not saved. Fix the issue and press Save again." with readable labels (project details, tasks, phasing, PTC, monthly planning, role groups; unknown parts fall back to the raw name). Only `project-config.html` loads it (`?v=1`, bridged to `window.summarizePushResult`, read only inside `onSave`). Vitest cases in `project-push-result.test.js`; page: `docs/pages/project-config.md`.

## config-form-calc.js (project-config helpers)

Derive/Reforecast distribution maths for `project-config.html` (`deriveDistribution`, `reforecastDistribution`) plus, since 2026-09-30, `isProjectDirty(savedJson, project)` — true when `JSON.stringify(project)` differs from the snapshot taken after load/save, false when either is null; drives the leave-page prompt (see `docs/pages/project-config.md`). Only `project-config.html` loads it (`?v=2`). `team-assistant-ui.js` gained `selectionStillValid` and `shouldSendOnEnter` the same day (see `docs/pages/planning.md`).
