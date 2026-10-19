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

**Per-project drill-down KPI tiles** — shown when opening a single project, driven by task/config data rather than `phasing`. Since the 2026-10-15 redesign (7.4) there are three tiles: **Hours** (consumed of sold, a bar, `% consumed`, hours left; when actuals include entries dated after today, a note `incl. <N>h dated after today` beneath), **Budget** (fees spent of the fees sold, a bar, `% spent` and the amount left; pass-through costs are not in those figures and appear beneath as `+ X PTC`; `—` and `No budget` when no fee is sold, the PTC line still shown) and **Time elapsed** (the share of the project's date range already gone, `As of <today>`, and a pace judgment — `Hours on track`, `Hours ahead of time` or `Hours behind time`, ±10 points between consumption and time; `—` without dates). The figures are computed by `js/lib/portfolio-calc.js`'s `computeKpis()` (extracted, vitest-covered, from the former `js/dashboard.js`'s `renderKPIs`) and consumed by `portfolio.html`'s Vue `kpis` computed property:

| KPI | Calculation |
|---|---|
| Total Sold Hours | Σ `task.resources[].soldHours` over billable tasks |
| Total Budget | Σ `soldHours × hourlyRate` over billable tasks (+ pass-through costs, if any) |
| Hours Consumed | Σ actual hours from timesheets to date |
| Budget Consumed | Σ actual hours × role rate |
| Hours Left | Total Sold Hours − Hours Consumed |
| Budget Left | Total Budget − Budget Consumed |

Note the two tables are not interchangeable: the portfolio summary's "Budget Estimated" reads the manually-maintained/derived `phasing` grid (§7.1), while the drill-down's "Total Budget" is computed live from task sold-hours × rate and ignores `phasing` entirely — the two can disagree if `phasing` hasn't been kept in sync with the task data (e.g. after editing sold hours without re-running Derive/Reforecast).

**Burndown chart** (Progress card → `Burndown`, 2026-10-15): a line chart filterable to a single task (`Task: All tasks ▾`) and to a Monthly, Quarterly, Biweekly or Weekly interval, with an `Export PNG` action. Its solid line is the actual trend — "Remaining hours (actual)" when the project has a budget to burn down against, "Cumulative hours" when it doesn't. A dashed "Remaining hours planned" line shows the plan: from the project's € phasing when present ("(phasing)"), otherwise a straight line from the sold hours to zero ("(linear)"). The solid line stops at today: the point of the interval containing today shows the remaining hours as of today and carries a navy pill (`<N>h left`, or `<N>h consumed` without a budget) — with no task filter the same figure as the Hours tile's `left`, except for an over-sold project, where the line and the pill stop at 0h, and for entries dated after today, which the pill does not count and the tile does (its note gives them) — and the legend reads `Today · <date>`; there is no Today marker, and the line is not cut, when today is outside the project's range or the project has no dates. The tooltip shows the hours consumed and remaining at that point and the `Planned` value of the dashed line, plus the budget consumed and remaining — with a task filter, that task's own budget — and, when the plan comes from the phasing, its planned amount; after today only the `Planned` lines remain.

**Toolbar actions:**
- **＋ New project** — the only page-level toolbar action; **temporarily disabled** (2026-10-01): projects are created from a proposal (Generate project, §4). The button shows the tooltip "Projects are created from a proposal (Generate project). Creating a project directly is temporarily disabled." and opening the project form without a project by URL redirects back here with the same message. The function stays in the product and will be re-enabled together with currency conversion for projects without a proposal.

**Two layouts: Card and List** (2026-10-08 redesign). A segmented control in the toolbar switches between them, and the choice is remembered across reloads. Both are fed by one shared, ordered list of rows, so they can never disagree about what is shown or in which order; programs and projects are mixed into a single ordering rather than programs always coming first. `Sort` offers `Client A–Z` (client, then programs before projects within the same client, then name) and `Alphabetical` (name only).

**Toolbar filters:** a free-text search (project name, code or client) plus three multi-select checkbox dropdowns — `Client`, `Stage` (pipeline stage; new in this redesign) and `Status`. Multiple ticks within one dropdown match by OR, the four filters combine by AND, and a neutral `Clear filters` link appears only while something is active. While any filter is active, every program's child projects are shown automatically — a matching child must never stay hidden behind a collapsed parent — and the expand/collapse control is replaced by a non-interactive `Shown (filtered)` label.

**Project card** (Card view): a `PROJECT` label and the pipeline-stage pill, then client name, project title and code, a 2×2 block of Duration / Sold / Spent / Variance, a divider, a spend bar with `N% spent` beneath it, and a footer with the status pill, `Configure` (hidden for viewers) and `Dashboard`. A project with no phasing still appears, with `—` in place of the figures and `No budget` under an empty bar — previously such a project was omitted from the page entirely. `0% spent` and `No budget` mean different things: the first is a budgeted project that has not been billed against yet, the second a project with nothing sold. The bar turns amber from 85% and red above 100%. The `No actuals available` badge remains on cards with no uploaded timesheet data.

**Program card** (Card view): the same shape, labelled `PROGRAM · N PROJECTS`, with figures aggregated across the program's projects, and a footer offering `Share`, `Show N projects` / `Hide projects`, and a `Dashboard` that opens the Program Dashboard (§6.1a; the button was inactive until 2026-10-08, when that page was built). Opening a program reveals a full-width panel below its row listing the child projects as compact cards (name, code, status, spent/sold, bar, `Configure` and `Dashboard →`). Only one program is open at a time in Card view.

**List view:** a table-like grid with `Program / Project`, `Stage`, `Status`, `Duration`, `Sold`, `Spent`, `Variance` and row actions. A chevron expands a program's children in place, and several programs can be open at once here. A program's `Status` cell is textual — `N at risk` when any child is at risk, otherwise `N projects`. Child rows are indented and leave `Stage` and `Duration` empty; `Configure` is not offered in this view. Below roughly 1024px of available width the `Duration` and `Spent` columns are dropped.

Expansion is shared between the two layouts: a program opened — or closed — in one view is in the same state in the other.

**Detail-page header** (redesigned 2026-10-15, 7.4): a `‹ Portfolio` link back to the overview; for a project in a program, a `PROGRAM <name> · N projects · Program Dashboard →` line; the project title — which, for a project in a program, opens a menu listing every project of the program with its status, consumption bar and %, the current one ticked, and a footer with the program's totals and `Program Dashboard →`; the stage and status pills; and a line with the client, code, date range and the project's tags. Switching project from that menu opens the new project on the whole-project period with every task collapsed.

**Detail-page actions** (in the header, top right):
- **Configure** — navigate to that project's `project-config.html`
- **Load Actuals** — upload an Excel timesheet file to import actuals for that project
- **Planning** — navigate to `planning.html` for that project
- **Share** — open the share modal

(The `＋ Summary` toggle has been hidden since 2026-09.)

Configure and Load Actuals are hidden for viewers (see §18.3). Load Actuals remains detail-page-only; **Configure was reintroduced on the list cards in a later 2026-09 cycle** (see the View features bullets below) — the original "moved from the list card to the detail-page header" note above describes an intermediate state, not current behavior.

**‹ Portfolio** (2026-10-15): navigates back to the overview, from the top of the detail view only; the bottom `← Portfolio` button of the 2026-09 layout was removed.

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

**How it is reached:** it has no menu entry. From the Portfolio Overview (§6.1) via a program's `Dashboard` in either layout, or `Program Dashboard →` in the expanded children panel; and from a project's own reporting view via the program line's `Program Dashboard →` link and the footer of the project-title menu (2026-10-15; the program crumb in the breadcrumb was removed with the in-page breadcrumb). Opening it for a program that does not exist returns to the Portfolio with the notice "Program not found."

**Visibility:** it aggregates the projects of the program the user can already see. A program all of whose projects are invisible to the user shows "No projects in this program are visible to you." rather than denying access.

**Four KPI tiles:**

| Tile | Shows |
|---|---|
| Budget | Money spent of money sold across the program, a spend bar, `N% spent` and the amount left |
| Hours | Hours consumed of hours sold, the same bar, `N% consumed` and the hours left |
| Time elapsed | How much of the program's own date range has passed, the range itself, how many of its projects have started, and whether consumption is running above or below elapsed time |
| Needs attention | How many projects are flagged and the worst one with its reason; clicking the tile filters the project list to the flagged ones |

A project is flagged as needing attention when its status is `Started At Risk`, **or** its consumption has reached 85%, **or** its consumption is more than 10 points ahead of elapsed time. Spend bars turn amber from 85% and red above 100%, the same thresholds the Portfolio cards use.

**Program burndown:** a chart summing the remaining hours of the program's projects across the program's months, with the actual trend alongside the planned one derived from each project's phasing, and a `Download PNG` action. The actual line stops at the current month, whose pill `<N>h left · <month>` gives the program's remaining hours as of today; a project that has ended counts with its real final remaining. A program with no dated project shows "No dated projects in this program" instead.

**Two views of the member projects:**
- **List** — one row per project with status, Sold / Spent / Remaining (hours and money), a consumption bar carrying a notch at the elapsed-time position so plan and actual are comparable in one glance, and `Vs time` in percentage points (red more than 10 points ahead of pace, green more than 10 behind). A final `PROGRAM TOTAL` row carries the same figures for the program. `Reporting →` opens that project's own reporting view.
- **Timeline** — one bar per project positioned and sized by its dates inside the program range, filled by its consumption, with a `Today` line. Projects without dates have no position on a time axis and are therefore not shown here; the view is unavailable altogether for a program with no dated project.

Money across projects in differing currencies is not converted: every money figure reads "Mixed currencies" instead, while hours, consumption and pace remain meaningful. A project with nothing sold shows `No budget` and is excluded from the program's consumption percentage while still counting as one of its projects.

Task-, role- and entry-level analysis is deliberately not duplicated here — it stays in each project's own reporting view, and the page says so.

### 6.2 Monthly Summary Table

Not a portfolio-wide bar chart — this is a **per-project table** in the drill-down view, shown by the Progress card's `Monthly summary` view since 2026-10-15 (the card's three views are `Burndown`, `Monthly summary` and, when the project has pass-through costs, `Pass-through`, which lists them; without actuals the card shows "No actuals loaded yet." and, for a non-viewer, `Load Actuals`, while `Pass-through` stays reachable). One row per month with the columns Month · Planned hours (resource plan) · Consumed · Variance · Est. budget · Spent · Variance, plus a PTC column that only appears when the project has at least one pass-through-cost line item. The current month carries a `current` pill; future months are muted, with `—` in the actual columns. A Total row sums every column, and `Export XLS` downloads the same figures as numbers — the month as text, amounts in the project's currency named in the headers, the actual columns of future months left empty.

- Planned hours (resource plan) = `cfg.planning[YYYYMM]`, the project's resource plan — not the burndown's dashed line, which comes from the € phasing; Hours Consumed = actual timesheet hours that month; Hours Variance = Estimated − Consumed.
- Budget Estimated = `cfg.phasing[YYYYMM]`; Budget Spent = actual hours × role rate that month; Budget Variance = Estimated − Spent.
- Variance highlighting is **one-sided**: negative variance (over budget/over hours) is shown in red; there is no corresponding green styling for positive/under-budget variance — it renders in the default table text color.

The only chart on this page is the burndown line chart described implicitly by §6.1 (Chart.js `type: 'line'`, `renderBurndownChart()` method) — there is no separate bar chart matching the portfolio-wide "estimated vs. spent per month across the portfolio" description that was previously here.

### 6.3 Breakdown by Task / Role / Functional Area

(Redesigned 2026-10-15, 7.4: one Breakdown card replaces the former Period filter card, the three "Summary by …" pivot cards and the Task detail section.) A segmented control picks the view; each row shows a name with a second line, then **Sold**, **Spent**, **Remaining (total)** — hours with the amount beneath — and **Total consumption** (a bar and %). A Total row closes the table, and `Export XLS` downloads the current view. A row whose consumption exceeds its sold hours gets an `Over sold` pill, a red bar and a negative Remaining; the bar turns amber from 85%. A project with nothing sold shows `—` for Sold, Remaining and % with empty bars. Below roughly 1280px the Remaining column is hidden. The Total row is the same in the three views — Sold, Spent and Remaining, hours and amounts, equal to the Hours tile — because each counts every billable entry once.

- **By task** — one row per billable task (second line: number of roles and the functional areas it belongs to). Clicking a task (or Enter/Space on it) expands its roles — one sub-row per role (owners · rate/h); a role logged on the task but not sold on it reads `—` for Sold, Remaining and %, priced at the same rate as the task row — and its **Entries**: one row per month, all closed, each opening to its entries (Date, Role (resource), Hours, Amount, Note), one month at a time, with an `Export XLS` of the task's entries. Non-billable tasks are listed below the Total under **Excluded from report**, with their hours and entries, and count in no total.
- **By role** — one row per **(role, task) pair** (2026-09): a role billed at a different hourly rate on two tasks (real example: an "Account Director" role priced at 168/h on one task and 130/h on another) gets one internally-consistent row per task rather than one blended row whose total couldn't be reconciled against the cost grid. A role logged on a task where it is not configured gets its own row, after the configured ones, with `—` for Sold, Remaining and %.
- **By functional area** — one row per functional area (§7.1's Functional Groups), whose membership is a list of explicit **(role, task)** pairs (or a role claimed for "— any task —", the legacy behavior). Disabled, with the tooltip "No functional areas configured", when the project has none. Hours no area claims form an `Ungrouped` row ("Not in any functional area"; its Sold reads `—` when it holds no configured role). A role in two areas counts in each of them and once in the Total, and the note "Some roles belong to more than one area: their hours count in each area and once in the Total." then appears under the table.

**Period** (top right of the card): `Whole project` (with the project's date range), the months up to the current one most recent first (each with its hours), and a `Custom range` of two dates. With a period active, the Spent column reads `Spent · <period>` and counts only that period, while Sold, Remaining and Total consumption stay on the whole project; the Period button is highlighted and a `Reset` link appears. (Before 2026-10-15 the filtered column was "In period" and Spent showed consumption minus the period.)

---

