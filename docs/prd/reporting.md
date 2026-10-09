# Project Reporting

Part of [PRD.md](../../PRD.md) — carries PRD §6 Project Reporting.

## 6. Project Reporting

### 6.1 Portfolio Overview

**Purpose:** Show, per project, enough to judge budget health at a glance and get into the project's own detail — not a full per-month breakdown (that lives in the drill-down view, §6.2). (Corrected 2026-09: the list view previously showed a per-project monthly Estimated/Spent/Variance table on every card; user feedback — reviewing this list as an actual analyst — was that the per-month figures were never read, only the totals, with every real read happening after clicking into the project's own detail page. The card was redesigned around that observation; see "Per-project card" below.)

**Portfolio summary table** (one row per KPI, one column per month; computed client-side in `portfolio.html`'s Vue instance, `pinnedSummary`/`programSummary` computed properties) — unchanged by the 2026-09 card redesign, still a full monthly breakdown, but scoped to the projects pinned into it (§ "＋ Summary" below), not to every card:

| KPI | Calculation |
|---|---|
| Budget Estimated | Σ `project.phasing[YYYYMM]` across selected projects |
| Budget Spent | Σ timesheet hours for that month × the matching role's hourly rate |
| Variance | Estimated − Spent |

**Per-project drill-down KPI cards** — a separate set of cards shown when opening a single project, driven by task/config data rather than `phasing`; computed by `js/lib/portfolio-calc.js`'s `computeKpis()` (extracted, vitest-covered, from the former `js/dashboard.js`'s `renderKPIs`) and consumed by `portfolio.html`'s Vue `kpis` computed property:

| KPI | Calculation |
|---|---|
| Total Sold Hours | Σ `task.resources[].soldHours` over billable tasks |
| Total Budget | Σ `soldHours × hourlyRate` over billable tasks (+ pass-through costs, if any) |
| Hours Consumed | Σ actual hours from timesheets to date |
| Budget Consumed | Σ actual hours × role rate |
| Hours Left | Total Sold Hours − Hours Consumed |
| Budget Left | Total Budget − Budget Consumed |

Note the two tables are not interchangeable: the portfolio summary's "Budget Estimated" reads the manually-maintained/derived `phasing` grid (§7.1), while the drill-down's "Total Budget" is computed live from task sold-hours × rate and ignores `phasing` entirely — the two can disagree if `phasing` hasn't been kept in sync with the task data (e.g. after editing sold hours without re-running Derive/Reforecast).

**Burndown chart:** a line chart on the detail page, filterable to a single task (or the whole project) and to a monthly or weekly interval. Its solid main line is the actual consumption trend — labeled "Remaining Hours" if the project has a budget to burn down against, or "Cumulative Hours" if it doesn't. Up to two dashed reference lines can appear alongside it: "Estimated Budget (phasing)" (orange, when the project's `phasing` data is available) and/or "Estimated Hours" (green, from the `planning` grid) — these are the plan the actual line is being compared against, letting a reader see at a glance whether consumption is running ahead of or behind what was planned.

**Toolbar actions:**
- **＋ New project** — the only page-level toolbar action; **temporarily disabled** (2026-10-01): projects are created from a proposal (Generate project, §4). The button shows the tooltip "Projects are created from a proposal (Generate project). Creating a project directly is temporarily disabled." and opening the project form without a project by URL redirects back here with the same message. The function stays in the product and will be re-enabled together with currency conversion for projects without a proposal.

**Two layouts: Card and List** (2026-10-08 redesign). A segmented control in the toolbar switches between them, and the choice is remembered across reloads. Both are fed by one shared, ordered list of rows, so they can never disagree about what is shown or in which order; programs and projects are mixed into a single ordering rather than programs always coming first. `Sort` offers `Client A–Z` (client, then programs before projects within the same client, then name) and `Alphabetical` (name only).

**Toolbar filters:** a free-text search (project name, code or client) plus three multi-select checkbox dropdowns — `Client`, `Stage` (pipeline stage; new in this redesign) and `Status`. Multiple ticks within one dropdown match by OR, the four filters combine by AND, and a neutral `Clear filters` link appears only while something is active. While any filter is active, every program's child projects are shown automatically — a matching child must never stay hidden behind a collapsed parent — and the expand/collapse control is replaced by a non-interactive `Shown (filtered)` label.

**Project card** (Card view): a `PROJECT` label and the pipeline-stage pill, then client name, project title and code, a 2×2 block of Duration / Sold / Spent / Variance, a divider, a spend bar with `N% spent` beneath it, and a footer with the status pill, `Configure` (hidden for viewers) and `Dashboard`. A project with no phasing still appears, with `—` in place of the figures and `No budget` under an empty bar — previously such a project was omitted from the page entirely. `0% spent` and `No budget` mean different things: the first is a budgeted project that has not been billed against yet, the second a project with nothing sold. The bar turns amber from 85% and red above 100%. The `No actuals available` badge remains on cards with no uploaded timesheet data.

**Program card** (Card view): the same shape, labelled `PROGRAM · N PROJECTS`, with figures aggregated across the program's projects, and a footer offering `Share`, `Show N projects` / `Hide projects`, and a `Dashboard` that opens the Program Dashboard (§6.1a; the button was inactive until 2026-10-08, when that page was built). Opening a program reveals a full-width panel below its row listing the child projects as compact cards (name, code, status, spent/sold, bar, `Configure` and `Dashboard →`). Only one program is open at a time in Card view.

**List view:** a table-like grid with `Program / Project`, `Stage`, `Status`, `Duration`, `Sold`, `Spent`, `Variance` and row actions. A chevron expands a program's children in place, and several programs can be open at once here. A program's `Status` cell is textual — `N at risk` when any child is at risk, otherwise `N projects`. Child rows are indented and leave `Stage` and `Duration` empty; `Configure` is not offered in this view. Below roughly 1024px of available width the `Duration` and `Spent` columns are dropped.

Expansion is shared between the two layouts: a program opened — or closed — in one view is in the same state in the other.

**Detail-page actions** (moved off the list card in the 2026-09 redesign; live in the detail view's own header instead, alongside Configure):
- **⚙️ Configure** — navigate to that project's `project-config.html`
- **📂 Load Actuals** — upload an Excel timesheet file to import actuals for that project
- **🔗 Share** — open the share modal
- **📅 Planning** — navigate to `planning.html` for that project
- **＋ Summary** — pin/unpin the project into the Budget Summary table at the top of the Portfolio Overview page

Configure and Load Actuals are hidden for viewers (see §18.3). Load Actuals remains detail-page-only; **Configure was reintroduced on the list cards in a later 2026-09 cycle** (see the View features bullets below) — the original "moved from the list card to the detail-page header" note above describes an intermediate state, not current behavior.

**← Portfolio** (2026-09): navigates back to the list. Appears both at the top of the detail view (next to the header) and again at the bottom (after Task detail) — the same action in two places so a long detail page doesn't force a scroll back to the top just to leave it.

(Corrected 2026-07: this section previously described "Clients"/"Programs" management modals as page-level toolbar actions. Confirmed during `portfolio.html`'s 2026-07 Vue 3 migration that both were only ever reachable through `#configModal`, itself gated behind a `?configure=true` URL parameter no file in the repo ever set — i.e. already unreachable dead code before this migration, not a regression. `#configModal` and its nested clients/programs/roles CRUD were dropped entirely as part of that rewrite.)

**View features:**
- Projects grouped by program (expandable / collapsible)
- Program group header shows the same Duration/Sold/Spent/Variance totals as an individual card, aggregated across all its child projects, plus a project-count badge — corrected 2026-09, previously a full per-month breakdown table (excluded from the initial card redesign, then extended to match on user request after seeing it live)
- Search by project name, project code, or client name (2026-09, first control in the filter row) — combines with the Client and Status filters below via AND
- Filter by client
- Filter by status — multi-select (Not started yet / Started / Started At Risk / Put on hold / Completed); selecting several combines them via OR; a project with no status stored matches "Not started yet," the same default its own status badge shows (2026-09)
- "✕ Clear filters" resets search/Client/Status together (not Sort) once any of them is active; an explicit "No projects match the current filters." message appears when the combination matches nothing (2026-09)
- Sort alphabetically or by client
- Each card carries a "⚙️ Configure" button (hidden for a viewer-permission project) alongside "Project Dashboard," navigating straight to that project's `project-config.html` from the list (2026-09 — reintroduces the shortcut an earlier 2026-09 cycle had deliberately dropped in favor of detail-only access)
- A program group whose children include a search/Status match auto-expands, so a matching project is never left hidden behind a manual "Show Child Projects" click; the manual toggle is unavailable (replaced by a "▼ Shown (filtered)" indicator) while any filter is active, to avoid a control that looks clickable but has no visible effect (2026-09)
- Cards lay out in a 2-column grid — a program group spans the full row width, its own child projects render in a nested 2-column grid, and ungrouped projects fill the remaining cells two per row (2026-09)
- The list view's URL stays in sync with the project being viewed (`?projectId=<id>` while on a detail view, bare `/portfolio.html` on the list), matching every other page that links into this view (2026-09)

### 6.1a Program Dashboard (2026-10-08)

**Purpose:** Answer, for one program, the questions the per-project views cannot: is the program as a whole on budget, is it on schedule, and which of its projects needs attention first. It aggregates the program's projects rather than adding any new data — everything is computed from the same project configuration and uploaded actuals the Portfolio already uses, so there is no separate program-level budget to maintain.

**How it is reached:** it has no menu entry. From the Portfolio Overview (§6.1) via a program's `Dashboard` in either layout, or `Program Dashboard →` in the expanded children panel; and from a project's own reporting view via the program name in the breadcrumb, the program row's `Program Dashboard →` link, and the sibling-projects dropdown. Opening it for a program that does not exist returns to the Portfolio with the notice "Program not found."

**Visibility:** it aggregates the projects of the program the user can already see. A program all of whose projects are invisible to the user shows "No projects in this program are visible to you." rather than denying access.

**Four KPI tiles:**

| Tile | Shows |
|---|---|
| Budget | Money spent of money sold across the program, a spend bar, `N% spent` and the amount left |
| Hours | Hours consumed of hours sold, the same bar, `N% consumed` and the hours left |
| Time elapsed | How much of the program's own date range has passed, the range itself, how many of its projects have started, and whether consumption is running above or below elapsed time |
| Needs attention | How many projects are flagged and the worst one with its reason; clicking the tile filters the project list to the flagged ones |

A project is flagged as needing attention when its status is `Started At Risk`, **or** its consumption has reached 85%, **or** its consumption is more than 10 points ahead of elapsed time. Spend bars turn amber from 85% and red above 100%, the same thresholds the Portfolio cards use.

**Program burndown:** a chart summing the remaining hours of the program's projects across the program's months, with the actual trend alongside the planned one derived from each project's phasing, and a `Download PNG` action. A program with no dated project shows "No dated projects in this program" instead.

**Two views of the member projects:**
- **List** — one row per project with status, Sold / Spent / Remaining (hours and money), a consumption bar carrying a notch at the elapsed-time position so plan and actual are comparable in one glance, and `Vs time` in percentage points (red more than 10 points ahead of pace, green more than 10 behind). A final `PROGRAM TOTAL` row carries the same figures for the program. `Reporting →` opens that project's own reporting view.
- **Timeline** — one bar per project positioned and sized by its dates inside the program range, filled by its consumption, with a `Today` line. Projects without dates have no position on a time axis and are therefore not shown here; the view is unavailable altogether for a program with no dated project.

Money across projects in differing currencies is not converted: every money figure reads "Mixed currencies" instead, while hours, consumption and pace remain meaningful. A project with nothing sold shows `No budget` and is excluded from the program's consumption percentage while still counting as one of its projects.

Task-, role- and entry-level analysis is deliberately not duplicated here — it stays in each project's own reporting view, and the page says so.

### 6.2 Monthly Summary Table

Not a portfolio-wide bar chart — this is a **per-project table** in the drill-down view (`portfolio.html`'s `monthlySummary` Vue computed property), one row per month, columns grouped as Hours (Estimated / Consumed / Variance) and Budget (Estimated / Spent / Variance), plus a PTC column that only appears when the project has at least one pass-through-cost line item (`hasPtc`). A TOTAL row sums every column.

- Hours Estimated = `cfg.planning[YYYYMM]`; Hours Consumed = actual timesheet hours that month; Hours Variance = Estimated − Consumed.
- Budget Estimated = `cfg.phasing[YYYYMM]`; Budget Spent = actual hours × role rate that month; Budget Variance = Estimated − Spent.
- Variance highlighting is **one-sided**: negative variance (over budget/over hours) is shown in bold red (`text-danger fw-bold`); there is no corresponding green styling for positive/under-budget variance — it renders in the default table text color.

The only chart on this page is the burndown line chart described implicitly by §6.1 (Chart.js `type: 'line'`, `renderBurndownChart()` method) — there is no separate bar chart matching the portfolio-wide "estimated vs. spent per month across the portfolio" description that was previously here.

### 6.3 Summary by Task / Role / Functional Area

Three cards in the drill-down view, below the Monthly Summary table, each a pivot table (one row per metric — Total Amount, Spent, In period, Residual — one column per group, plus a TOTAL column) built from the same underlying timesheet data. Every column shows both hours and the corresponding € figure.

- **Summary by task** — one column per project task, regardless of role.
- **Summary by role** — one column per **(role, task) pair** actually present, not per role alone (2026-09). A role billed at a different hourly rate on two different tasks (real example: an "Account Director" role priced at 168/h on one task and 130/h on another, because the rate is configured per task, not globally per role) previously landed in one blended column whose total couldn't be reconciled against the cost grid; it now gets two separate, internally-consistent columns, one per task.
- **Summary by functional area** — one column per functional area (§7.1's Functional Groups), unchanged in shape from before 2026-09, but now precise: each area's membership is a list of explicit **(role, task)** pairs (or a role claimed for "— any task —", the default/legacy behavior) rather than a bare role-name list matched against every task that role appears on. This lets an area count a role's hours on one specific task while excluding that same role's hours on a different task (billed at a different rate) — without needing to split the card's own columns by task the way "Summary by role" does.

Task detail (the per-task role breakdown further down the page) is unaffected by any of the above — it was already scoped to one task at a time.

---

