# js/lib/

Pure functions extracted for unit testing (vitest + jsdom), each an ES module (`export function ...`) with a `window.<name> = <name>` bridge for existing classic-script callers; see `CLAUDE.md`'s "Script loading order" section for how these modules fit into page load order.

This file holds the full function-by-function reference and implementation narrative for `js/lib/` — signatures, what each function does, cycle-by-cycle bug history, and which pages load which module. `CLAUDE.md`'s File structure entry keeps only a one-line pointer; when working on any `js/lib/*.js` file, read this file, not that line, for the detail. See `/sync-docs`'s routing rule for where future changes to these modules should be written.

## cfg-parse.js

`cfgParseHours`, `cfgFmtHours`, `roundToQuarterHour` (moved from `config-form.js`), `distributeHoursExact(total, rawValues, grid=0.25)` (largest-remainder rounding: floors every raw value to `grid`, then hands the missing grid-steps to the containers with the largest fractional remainder — ascending key as tie-break — so the returned values always sum to exactly `roundToQuarterHour(total)`; throws on a negative `rawValues` entry or if `Σ rawValues` diverges from `total` by more than 0.05). Used by `cfgDerivePhasing`/`cfgReforecast` in `config-form.js` so the planning-grid total shown in the confirmation modal always matches what gets saved.

## planning-calc.js

`matchesTaskRole(record, taskName, role)`: case-insensitive on both role and task name, null-safe (a missing `taskName` matches on role alone, never throws). `computeResidual(soldH, consumedH)`: `Math.max(0, soldH - consumedH)`, extracted verbatim from three previously-divergent inline implementations. Both are consumed identically by all three grouping views in `planning.html`'s Vue instance (by-role, by-project, by-owner) — previously by-role/by-project crashed on a task with no name and by-owner was case-sensitive on both fields.

`distributeFutureResidual(residualH, totalFutureWeeks, weeksByMonth, pulseEnabled)`: computes `hPerWeek` from the task's canonical remaining-week count (not the currently-visible date window); when `pulseEnabled && hPerWeek < 1`, aggregates each month's weeks into one entry placed on that month's first week with hours proportional to its week count; otherwise returns one entry per week at a flat `hPerWeek`. Consumed identically by all three grouping views — previously by-owner used the visible window's week count for its pulse threshold (so paging could flip it) and split hours equally per month regardless of week count, both since unified with by-role/by-project's already-correct behavior; `countFutureTaskMonths()` (the old by-owner-only helper this replaced) was removed as dead code.

`getCalendarWeeks(startDate, endDate)` / `workingDaysInWeek(week, taskStart, taskEnd)` / `getPlanningPeriods(cfg, interval)` / `countFutureTaskWeeks(tStart, tEnd, todayMidnight)` — week-bucketing and date-range helpers added in the `planning.html` Vue migration, relocated verbatim from the former `js/planning.js`; `getPlanningPeriods` reads `getMonthRangeFromCfg` (a `js/portfolio.js` classic-script global) via `globalThis` rather than importing it, since `js/lib/` modules only import from sibling `js/lib/` modules, never from classic-script globals.

`sumChildBreakdownHours(roleWeekMap, weekKeys, project, task)` (2026-09) — sums, across a set of week keys, only the `breakdown` entries belonging to one (project, task) child; `isPulse` is true only if a week that actually contributed matching hours was itself a pulse week (a pulse week with no matching entry doesn't taint an unrelated child's flag). Feeds `byRoleView()`'s By Role drill-down child rows — see `docs/pages/planning.md`'s "By Role project/task drill-down" section.

Loaded via `<script type="module">` on `planning.html`, before the inline `Vue.createApp` script.

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
