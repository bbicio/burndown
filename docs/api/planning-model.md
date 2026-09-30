# Planning model (Cycle A, 2026-09-29)

`POST /api/planning/model` (`api/src/routes/planning.js`) is the calculation behind `planning.html`'s three views (By Role / By Project / By Owner). Until this cycle the page computed everything in the browser from `config.projects` and the full actuals dump; the server now does it once and the browser only renders. Design: `docs/superpowers/specs/2026-09-29-planning-model-backend-design.md` (§14 wins where it differs from earlier sections); plan: `docs/superpowers/plans/2026-09-29-planning-model-backend.md`. Page side: `docs/pages/planning.md`, `docs/js/lib.md` (`planning-model-ui.js`). No migration, no new environment variable, no new dependency.

## Endpoint

`requireAuth` (any authenticated user). Body:

| Field | Type | Rules |
|---|---|---|
| `view` | `'role' \| 'project' \| 'owner'` | required |
| `projectIds` | string[] | required, at most 2000 ids (each at most 64 chars); duplicates dropped |
| `teams` | string[] | optional (default `[]`), at most 500 entries (each at most 200 chars); empty = no team filter |
| `from`, `to` | `YYYY-MM-DD` | required; must be real calendar dates, `from <= to`, window at most 20 years |
| `asOf` | `YYYY-MM-DD` | required: "today" as the client sees it (its local date); the server never reads its own clock |
| `pulse` | boolean | required (Monthly Pulse toggle) |

Validation lives in the pure `api/src/lib/planning-request.js` (`parsePlanningRequest`). A bad body returns `400 { error: 'Invalid request', fields: { <field>: <message> } }`.

`projectIds` that are unknown or not visible to the caller are ignored silently (no information leak). Visibility is the same rule as `GET /api/projects`: admin/sysadmin see every project, other users the projects they own or that are shared with them (`visibleProjectIds` in `api/src/services/planning-data.js`).

Response: `{ view, ownerStatus, ...projection }`. `ownerStatus` is `{ [ownerName]: 'active' | 'inactive' }` for every distinct owner name in the requested projects' actuals (`resolveOwnerStatuses` in `api/src/lib/match-resource.js`, moved there from `routes/resources.js`; unmatched/ambiguous/ignored names are `'active'`). The projection, by view (week keys are the Monday as `YYYY-MM-DD`):

- `role`: `{ roles: [{ role, sold, actuals, children: [{ project, task, sold, actual }], cells: { [weekKey]: { hours, breakdown: [{ project, task, hours }], isPast, isPulse } } }] }`
- `project`: `{ projects: [{ id, sold, actuals, tbp, weekTotals, tasks: [{ name, startDate, endDate, sold, actuals, tbp, weekTotals, roles: [{ role, sold, consumed, tbp, hasOwners, allOwnersInactive, weekData, owners: [{ name, isPlaceholder, actuals, tbp }] }] }] }] }`
- `owner`: `{ ownerMap: { [owner]: { sold, actuals, tbp, weekTotals, projects: { [projectId]: { name, sold, actuals, tbp, weekTotals, tasks: { [task]: { sold, actuals, tbp, weekData } } } } } } }`

`tbp` = "to be planned". Grouping, period aggregation (weekly/monthly columns), filters that only narrow the request, HTML and XLS export stay in the browser; the server returns week-level data only.

## Three projections, three rule sets (intentional)

The three views never shared one algorithm in the browser and the port preserves that on purpose (a "no visible change" migration). Do not unify them without a deliberate, announced behaviour change.

| Rule | By Role | By Project | By Owner |
|---|---|---|---|
| Monthly distribution (`task.monthlyDistribution`) | honoured (when it sums to 100 +/- 0.5) | not used (uniform spread) | not used (uniform spread) |
| Task dates missing | fall back to the project's dates | fall back to the project's dates | no fallback: a task without both dates spreads over every future week of the window |
| Task not overlapping the window | skipped (its sold/actuals do not count in the totals) | skipped | not skipped |
| Residual (`max(0, sold - consumed)`) | per (task, role) | per (task, role) | per TASK, over the roles that pass the team filter: `max(0, sum sold - sum consumed)` |
| Owners | n/a (no owner split) | of that (task, role) | of all the task's (team-filtered) roles together |
| Past-week placement of a Sunday actuals row | not placed (see "Calendar semantics") | not placed | placed |

Common to all: completed tasks are skipped; an actuals row matches a (task, role) case-insensitively on both (`matchesTaskRole`); the team of a role is the text before ` - ` (`rolePassesTeams`), an empty `teams` set lets everything through; in By Project and By Owner (By Role has no owner split) future hours are split among owners by their actuals share, excluding `inactive` owners (all inactive or no owner: the `—` placeholder row); Monthly Pulse puts a month's hours on its first week when the per-week figure is below 1.

`teams` and the window are therefore calculation inputs, not display filters: the team set changes By Owner's residual, and the window decides which tasks count in the Sold/Actuals totals of By Role/By Project and which weeks exist at all.

## Code map

- `api/src/lib/planning-calendar.js`: calendar dates (`isoDate`, `parseTaskDate`, `getCalendarWeeks`, `countFutureTaskWeeks`, memoised counter).
- `api/src/lib/planning-distribution.js`: rule primitives (`matchesTaskRole`, `computeResidual`, `distributeFutureResidual`, `redistributeExcludingInactive`, `hasValidPhasing`, `taskFutureWeeks`, `phasedSeries`).
- `api/src/lib/planning-model.js`: `normalizeActuals`, `groupActualsByProject`, and the three projections (`roleProjection`, `projectProjection`, `ownerProjection`, dispatched by `buildProjection`).
- `api/src/lib/planning-request.js`: request validation.
- `api/src/services/planning-data.js`: DB loading and the cache below.
- `api/src/routes/planning.js`: the route (mounted at `/api/planning` in `api/src/index.js`).

## Cache

`getPlanningData()` loads projects with their tasks, the `timesheets` rows, `resources` and `resource_aliases` once and caches the slim, data-only result in-process for 30 s. Concurrent callers share one in-flight load (single-flight). Projections are computed per request from the cached data, never cached themselves (they depend on `teams`, window, `asOf`, `pulse`).

Invalidation is one write-middleware in `api/src/index.js`: after any successful (status < 400) non-GET request whose path starts with `/api/projects`, `/api/timesheets`, `/api/resources`, `/api/admin/reset` or `/api/cost-grids`, `invalidatePlanningData()` clears the cache and bumps a generation counter, so a load that was already running when the write finished is not cached (a stale result can still be returned to the callers waiting on it). The 30 s TTL bounds staleness if a write path is ever missed. Over-invalidating is harmless.

## Calendar semantics

A "calendar date" is a Date at 00:00 UTC, so nothing depends on the server's time zone. Weeks run Monday to Sunday; a week is past when its Sunday is before `asOf`; `monthKey` (e.g. `Sep 2026`) is derived from the week's Monday. `asOf` and the window come from the client's local date (`localYmd`), which is what the old browser code used.

The server reproduces the behaviour of a browser in a UTC+ time zone (Europe/Rome for the real users). A browser in a UTC-west zone used to shift rows differently in the old code (By Role/By Project: Monday rows into the previous week; By Owner: every row one day earlier); that is not replicated.

**Known quirk, replicated on purpose:** in By Role and By Project an actuals row dated on a Sunday counts in the consumed/actuals totals but is NOT placed in any week cell. The old browser code parsed row dates as UTC midnight and compared them with local-midnight Monday-Sunday weeks, so in UTC+ zones a Sunday row fell outside every week. `inWeekLegacy` (week end exclusive) reproduces that so the migration is a zero-visible-change one; By Owner uses the inclusive `inWeek` and does place Sunday rows. The controller ruled to keep the quirk for parity; fixing it (Sunday rows shown in By Role/By Project) is a deliberate, visible follow-up change, not a bug of this cycle.

## Phase 2 behaviour change (By Role only, user-approved)

A task's `monthlyDistribution` no longer depends on the visible window. Percentages are normalised over ALL future months of the task (`taskFutureWeeks`, capped at the last month of the distribution; each month's hours are divided by the number of the task's future weeks in that month, inside the task range; past weeks of the current month are excluded) and the window only decides which cells are shown (`phasedSeries`). Before, the percentages were normalised over the visible months only: a 40/30/30 distribution seen through a window with two months became 57/43 and the hidden month's hours were re-scaled onto the visible ones.

Observed consequences (parity capture):
- In narrow windows the By Role "To be planned" column, which sums the visible future cells, is smaller because hours outside the window are no longer re-scaled onto the visible months (example on the seeded dataset: a DEV role row in a narrow window went from 270.9 to 190.9 to be planned). Sold and From actuals are unchanged; By Project and By Owner are unchanged.
- Hover tooltips no longer list zero-hour lines for a phased task in months beyond its distribution.

## Verification

- Unit: `node:test` for `planning-calendar`, `planning-distribution`, `planning-model`, `planning-request`, `match-resource` (incl. `resolveOwnerStatuses`); vitest for `js/lib/planning-model-ui.js`; integration `PM-01..PM-07` in `test-api.js` (PM-08 is manual): `TEST_CASES.md` section 25.
- Phase 1 mechanical parity gate: 144 combinations (3 views x 3 windows x 4 team sets x 2 pulse x 2 interval) captured with the OLD browser code as baseline and again with the migrated page, same calendar day, dataset seeded by `api/src/scripts/seed-planning-golden.js`, capture by `scripts/planning-golden-capture.js` (on `/planning.html`, run `window.__planningGoldenStart({label})` detached in the console and poll `window.__golden`; the migrated page contract is `vm.model.key === JSON.stringify(vm.modelRequest)`). Result: 144/144 identical on `exportRows`, `periodMeta` and HTML hash. Phase 2: 116/144 identical, the 28 that differ are all By Role.
- Benchmark (`api/src/scripts/bench-planning-model.js`; 200 projects, 150 owners, about 300k actuals rows, 6-month window): compute 0.55-0.8 s per view; payload raw 0.34 MB (role) / 3.0 MB (project) / 7.5 MB (owner), gzip 0.02 / 0.11 / 0.47 MB.
- Running the branch stack: `scripts/test-branch.sh` mounts the worktree's `api/src` into the API container but the container does not hot-reload; restart the isolated branch API container after server changes (never the main stack).

## Follow-ups

- Known limits: a request carries at most 2000 project ids, so an admin with more eligible projects than that gets a 400 error; countFutureTaskWeeks uses a closed form (constant time), so an undated task (end year 9999) costs nothing; taskFutureWeeks clamps the distribution end to about 20 years ahead.
- Sunday quirk above (deliberate visible fix).
- `POST /api/resources/match-owners` was removed in Cycle B (2026-09-30, no caller left; `resolveOwnerStatuses` is still exported from `routes/resources.js` and used by the model).
- `js/ai.js` was removed in Cycle B. `planning.html` still calls `refreshTimesheetDataFromApi()` on load only to keep the shared `timesheetData` cache populated for `js/upload.js`; candidate for removal.

## Cycle B additions (2026-09-30)

- The calculation moved out of the route into the pure `computePlanningModel(data, visible, req)` in `api/src/lib/planning-compute.js`; `POST /api/planning/model` is now parse + load + `computePlanningModel`, and the team assistant (`docs/api/planning-assistant.md`) calls the same function with `view: 'owner'` so there is one implementation of the load.
- `getPlanningData().projects` entries now also carry `pipeline` and `status` (the assistant treats a project "as Planning" as not `Canceled` and not `Completed`). No change to any projection.
