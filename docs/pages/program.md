# program.html

Program Dashboard: a programme-level overview of its projects (budget/hours/time/needs-attention
KPIs, an aggregated burndown chart, and a List-or-Timeline view of the member projects), reached
from the `Dashboard`/`Program Dashboard →` entries in `portfolio.html` (see that page's own
"Program Dashboard cycle" section) and from the project reporting view's breadcrumb/program row.
Vue 3 (CDN, no build step), same pattern as `portfolio.html`.

Spec: `docs/superpowers/specs/2026-10-08-program-dashboard-design.md`. Plan:
`docs/superpowers/plans/2026-10-08-program-dashboard.md`. Brief + boards:
`docs/superpowers/design/reporting-dashboard/`.

## Decisions (D1-D14 of the spec)

- **New page, not a third Portfolio view** (D1) — explicit user request.
- **No new backend** (D2) — every number is computed client-side from `config.projects` (already
  visibility-filtered by the API), `timesheetData` and `getPipelineBudget()`, the same inputs
  `portfolio.html` already uses. `GET /api/reporting/programs/:id`, proposed in the raw brief, was
  never built — see `api/src/routes/reporting.js`'s own dead-code comments (D13) for why a server
  endpoint for this kind of number was already a bad idea before this cycle.
- **`Sold` = Σ task budget** (`soldHours × hourlyRate`, falling back to the pipeline-budget fee when a
  version has no cost-grid tasks), not the Portfolio Card/List's own phasing-based `Sold` (D3) — the
  two happen to agree whenever phasing was actually filled in, but phasing is 0 on about a third of
  real projects today. Portfolio's own `Sold` column is intentionally **not** changed in this cycle
  (changing it would also have to touch its `Variance` column, a Portfolio-section decision, not a
  Program Dashboard one).
- **Mixed currencies → `null`, never a silent EUR** (D4): `programCurrency()` in
  `js/lib/program-calc.js` returns `null` the moment two projects disagree, and every money figure on
  the page then renders the literal text `Mixed currencies` while hours/consumption/vs-time stay
  numeric. Deliberately not `portfolio-calc.js`'s `commonCurrency()`, which defaults to EUR on a
  mismatch — exactly the kind of silent wrong number this page can't afford.
- **Visibility = whatever `config.projects` already contains** (D5) — a user who can't see some of a
  programme's projects just doesn't get them in the KPIs/list; there is no "Showing N of M projects"
  in practice, because nothing in the current data model gives the browser `M` (`GET /api/programs`
  returns only `{ id, name }`, no project count) without adding a server endpoint, which D2 rules out.
  The markup for the empty-program state (`No projects in this program are visible to you.`) is real
  and does fire — a program that resolves but has zero visible children — it's the partial-count
  message specifically that has no data source yet.
- **Share reuses the existing `openShareModal('program', …)` modal** (D6) — the real programme Share
  is Portfolio's own Cycle 2, not this page's problem.
- **Export = PNG of the burndown chart only** (D7), via the same `toBase64Image()` pattern as the
  project reporting view's own burndown chart. No page-level PDF export.
- **Needs-attention click filters the Projects card** (D8): `attentionFilter` (data) toggled by the
  tile's own click, applied in the `visibleRows`/`timelineBarsData` computeds; a "Showing flagged
  only · Clear" link appears next to the reporting-scope note while it's active.
- **Monthly burndown only, no interval selector** (D9) — the project reporting view's own
  Monthly/Quarterly/Biweekly/Weekly buttons have no equivalent here.
- **Thresholds (D10)**: bars/tiles navy `<85%`, amber `85-100%`, red `>100%` (`spentBarState()`,
  reused from `portfolio-calc.js`); `vs time` red `>+10pt`, green `<-10pt`, neutral between;
  `Needs attention` = `status === 'Started At Risk'` OR `consumptionPct >= 85` OR
  `consumptionPct - timePct > 10` (`needsAttention()` in `js/lib/program-calc.js`).
- **`css/portfolio.css` shared between the two pages** (D11) — see that file's `.pg-*` section.
- **Controls styled like the Portfolio's own `.pf-*` controls** (D12), not the costgrid custom
  controls — that uniformisation is its own future cycle, covering both pages.
- **The two dead `/api/reporting/*` endpoints stay, documented as dead** (D13) — see
  `api/src/routes/reporting.js`'s own comments and the `ARCHITECTURE.md` entries; removal is
  deferred to the Portfolio section's end-of-restyling review, same as items below.
- **Review/test perimeter limited to this cycle's own files** (D14) — no incursion into the rest of
  the Portfolio section's code, which gets a dedicated review pass once the whole section's redesign
  is done.

## `js/lib/program-calc.js`

Pure, DOM-free module (ES exports + `window.<name>` bridges, like every other `js/lib/` file),
covered by `program-calc.test.js`. Reuses `spentPercent`/`spentBarState`/`computeBurndownPoints`
from `portfolio-calc.js` rather than re-deriving them.

| Export | What it does |
|---|---|
| `programCurrency(cfgs)` | shared currency code, or `null` on a mismatch (D4) |
| `programRange(cfgs)` | `{ startYm, endYm, startDate, endDate, months[] }` spanning every dated project, or `null` if none are dated |
| `projectMetrics(cfg, rows, deps)` | one row's `{ soldHours, soldMoney, spentHours, spentMoney, remainingHours, remainingMoney, consumptionPct, timePct, vsTime, hasBudget, hasActuals, started }` |
| `programTotals(metrics[])` | Σspent/Σsold — never the mean of the rows' own percentages; a project without a budget contributes its spend but not to the denominator |
| `timeElapsed(range, metrics[], today)` | `{ pct, startedCount, totalCount }` |
| `needsAttention(entries, thresholds)` | `{ ids[], reasons: { [id]: string } }`, D10's rule |
| `sortProjectRows(rows, attentionIds)` | flagged rows first, then by start date; does not mutate its input |
| `programBurndown(range, projects, deps)` | `{ labels, actual[], planned[], todayIndex, todayRemaining }` — projects each other's `computeBurndownPoints()` series onto the shared axis (holding a project's first value before it starts, last value after it ends), then sums |
| `timelineBars(range, rows)` | per-project `{ leftPct, widthPct, fillPct, state, started, ... }` for the Timeline view |
| `todayPosition(range, today)` | `today`'s `%` position on the axis, `null` if outside it |

## Page structure

Standard page shell (`#app-shell` > `#nav-container` + `#app-main`, `v-cloak`, head snippet),
`initNav('portfolio', { breadcrumbs: [...] })` — the menu entry stays **Portfolio**; the active page
is reachable only via a URL, not its own menu item, same pattern as `profile-jobs.html`.
`programId` missing, or the programme not found, redirects to `/portfolio.html?notice=program-not-found`
(the same `?notice=` mechanism `portfolio.html` already handles for `direct-creation-disabled`, extended
by this cycle with the new code). A programme that resolves but has zero visible projects stays on the
page and shows the empty-state message instead of redirecting — see D5 above.

Loads a slightly trimmed version of `portfolio.html`'s script list: no `xlsx`, no `js/upload.js` (no
Load Actuals entry point here), adds `js/lib/program-calc.js`. Also needs
`js/lib/notif-browser.js` ahead of `js/notifications.js` — easy to miss, since the Program Dashboard
spec's own script list omitted it; every other page that loads `notifications.js` loads this too, and
skipping it throws inside `initNav()` before `loading` is ever cleared (found by capturing the
headless-Chrome console during the Task 3 visual check, not by the vitest suite — a static guard
can't see a runtime-only dependency like this).

**Header**: `‹ Project Portfolio` link, `PROGRAM DASHBOARD` label, title + pipeline-stage pill
(`domPipeline` = the first child's own pipeline stage by id order, mirroring the Portfolio redesign's
own `domPipeline`/D7 rule), the meta line (client · N projects · date range · currency), Export/Share
actions.

**4 KPI tiles**: Budget, Hours, Time elapsed, Needs attention (a `<button>`, filters the Projects card
below, D8). All four tolerate `programCurrency() === null` (money → `Mixed currencies`) and
`programRange() === null` (Time elapsed shows `—`).

**Program burndown card**: title + "Sum of remaining hours across N projects" subtitle, a legend
(`Remaining hours (actual)` solid / `Remaining hours planned (phasing)` dashed) and a Download PNG
link, a Chart.js line chart (colours via `chartColor('--chart-actual'|'--chart-phasing')`, since
Chart.js cannot resolve `var()`), with a "Today" marker drawn by a small inline Chart.js plugin
(`afterDraw`) rather than a built-in annotation — a navy pill with `{hours}h left · {month label}`
positioned at the current month's point. Replaced entirely by the `No dated projects in this program`
message when `programRange()` is `null`.

**Projects card**: a `List`/`Timeline` segmented control (Timeline disabled without a date range);
the reporting-scope note (`Task, role and entry analysis is in each project's reporting`) sits beside
it. **List**: 8 columns (Project/Status/Sold/Spent/Remaining/Consumption/Vs time/action), a grey tick
on the Consumption bar at the project's own `timePct`, a `PROGRAM TOTAL` row, `No budget`/`No actuals`
states per row. A project is marked `No actuals` only when it has already started
(`metrics.started`, date-based) and still has zero recorded hours — a project whose `status` field
still says "Not started yet" but whose dates say otherwise is exactly the case this is meant to catch;
a genuinely not-yet-started project shows a plain `0.00h`, matching the board's own two such rows.
`vs time` shows `—` for any not-yet-started project regardless of the raw number (Review Focus 5),
since `0 - 0 = 0pt` would otherwise read as "on track" rather than "not applicable yet". **Timeline**:
one duration bar per dated project (dashed outline if not started), filled by consumption % with the
same colour thresholds, a vertical "Today" line (omitted when `todayPosition()` is `null`), and a
3-item legend. Only shown at `min-width: 1024px` — below it the segmented control itself disappears
and the List stays the only view (spec §12, explicitly "not yet designed" for tablet/phone, so this
responsive behaviour is provisional).

## `css/portfolio.css` (shared, D11)

Bumped to `?v=2` on both pages. The `.pg-*` classes at the bottom of the file are exclusive to this
page (`portfolio.css` itself stays the single shared sheet, not split into two files) — KPI tiles,
the List grid (`.pg-list-row`'s `grid-template-areas`, reflowed at `1023px`/`767px` rather than hiding
fixed tracks, so the same cells can become a 2-column mobile card without separate markup), the
Timeline (`.pg-timeline-*`, scoped entirely inside `@media (min-width: 1024px)`), and the burndown
card's legend/download button. Reuses `.pf-spent-bar`/`.pf-spent-{normal,warning,danger}`/
`.pf-badge-neutral`/`.pf-clear-link` directly from the Portfolio section rather than duplicating them
under a `.pg-` name.

## Known gaps / deferred (spec §16-17)

Same list as `portfolio.html`'s own currently-open items, plus: no column sort in the List (spec
says optional, out of scope); no real programme Share (reuses the project/cost-grid modal, limited
for a programme target); the `GET /api/reporting/*` dead-code removal; the `Sold` semantics
divergence between this page and Portfolio's own Card/List. All revisited together in the
end-of-restyling Portfolio review (D14).
