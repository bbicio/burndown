# PDash — Product Requirements Document

**Version:** 1.0  
**Date:** 2026-05-29  
**Status:** Current

---

## 1. Product Overview

PDash is a multi-user web application for project portfolio management. It is designed for consulting and professional services teams who need to track commercial offers, plan resources, and monitor budget consumption across multiple projects.

The app is backed by a Node.js/Express REST API and a PostgreSQL database, with JWT-based authentication and role-based access control — three account roles (sysadmin/admin/user, sysadmin added 2026-09) plus per-resource sharing permissions (owner/editor/viewer) govern what each user can see and do (see §15–18). The frontend is Vanilla JS with no build step; each view is a separate HTML page.

---

## 2. Users and Context

**Primary user:** Project Manager / Portfolio Manager at a professional services firm.

**Context:** The user manages a portfolio of consulting projects. Each project is associated with a commercial offer (Cost Grid) built from estimated effort per role. Actuals come from a weekly Excel timesheet export. The user wants to see, at a glance, where each offer sits in the sales pipeline and how each active project is tracking against budget.

---

## 3. Views and Navigation

The application has three primary views accessible from the top navigation bar, plus a full-screen editor overlay.

| Nav Tab | View |
|---|---|
| Pipeline | Kanban board of cost grid offers organised by deal stage |
| Resource Planning | Cross-project hours distribution by role, project or owner |
| Project Reporting | Portfolio budget overview — estimated vs. spent |

**Default view on load:** Pipeline.

A secondary sub-navigation row (`appSubnav`) appears within the Reporting view for additional configuration panels.

---

## 4. Pipeline Board

### 4.1 Purpose

Organise all commercial offers (cost grids) by deal stage. Each offer is a card in a kanban column. The board gives a quick read of what is in the pipeline, the value at each stage, and the current status of each deal.

### 4.2 Deal Stages (Columns)

Six fixed stages, displayed left to right:

| Stage | Meaning |
|---|---|
| Draft | Private working copy — visible only to its creator; excluded from column totals |
| SIP | Strategic intent / early prospect |
| Expected | Qualified opportunity, likely to close |
| Anticipated | High-confidence, close imminent |
| Committed | Deal signed / Committed revenue |
| Canceled | Opportunity withdrawn or lost |

Each column (except Draft) has a sticky footer showing the total budget value of all offers in that column. **Mixed currencies within one column (2026-09 clarification, no behavior change):** if every offer in a column shares the same currency, the footer shows one plain total in that currency. If a column holds offers in more than one currency, the footer instead shows one subtotal line per currency (in that currency's own figures, with a small grey EUR-equivalent shown next to any non-EUR line), followed by a bold combined "TOT" line — the sum of every offer's fee converted to its EUR-equivalent via that offer's own exchange rate, not a naive sum of raw numbers across currencies. Pass-through costs (PTC) follow the same per-currency-then-EUR-equivalent pattern, shown as a secondary line under each subtotal.

### 4.3 Offer Cards

Each card represents one cost grid (the active/locked version). Cards display:

- Offer name
- Pipeline stage badge (colour-coded)
- Total budget (€)
- Number of phases and tasks
- Linked project(s) with status badge
- Edit (✏️) action button; Delete (🗑) action button only on Draft-stage cards with edit permission
- Viewer permission hides Edit and Delete entirely (see §18.3)

Clicking a card (anywhere other than the action buttons) opens the **Detail Panel**.

### 4.3a Filtering (2026-09)

A filter bar sits below the title, above the columns, so the board stays readable as the number of offers grows. In order: a free-text search box (matches offer name or client name), then four multi-select dropdown filters — Owner, Client, Currency, and Value (deal size, bucketed €0–20K / €20K–50K / €50K–100K / €100K–200K / €200K+, with an "Include PTC" toggle deciding whether pass-through costs count toward the bucket). Selecting multiple values within one filter is an OR (e.g. two owners at once); different filters combine as AND. All filtering updates the board instantly as selections change, and a "Clear filters" control appears once any filter is active. Filters never change which offers a user is allowed to see (§3.3/§18) — they only narrow what's already visible — and the Draft column is always shown in full, unaffected by any filter, since it's a private working copy. Filters reset whenever the page is reloaded.

### 4.4 Detail Panel

A fixed right-side panel (860 px wide) with two scrollable columns.

**Header:** 🗑 Delete (Draft stage only) · ⧉ Clone · 🔗 Share · ✏️ Edit · ×. A row of version tabs (colour-coded stage dot + label) always appears above the two-column body, even for a single-version proposal; clicking a tab reloads the panel for that version. Deleting a proposal's only remaining version deletes the entire proposal, since every proposal always has at least one version. Viewer permission hides Clone, Share, and Edit from the header (see §18.3).

**Left column — Offer metadata + Linked Projects**

- Offer name, pipeline stage badge
- Version label, creation date
- Start date / end date
- Currency
- Rate card name, if one is set on the version
- Notes
- Total budget (€) broken down as: Fee + Pass-Through Costs (PTC)
- JSON export button for the raw cost grid data
- **Linked Projects** list: for each linked project shows project ID (resolved from config), project name, status badge, assigned task names (if any tasks have been assigned to the project), and a "📊 Project Dashboard" button (renamed from "Portfolio", 2026-09) that navigates to that project's reporting view (only visible when timesheet data exists for the project)

**Right column — Task and Phase breakdown**

- Phase headers (bold, indigo) with total hours and total budget
- Per-task rows: task name, role breakdown (hours per role), task total
- Role column totals at the bottom of each phase
- Grand total row

### 4.5 Board Toolbar

- **Pipeline year dropdown** (replaces the static "Pipeline" title) — shows the selected year and a caret; clicking opens a menu of all visible pipeline years. Switching year reloads the board via `?year=YYYY` URL param.
- **+ New Proposal** button — opens the Cost Grid Editor with a blank grid (hidden for non-admins on inactive years)

### 4.6 Pipeline Stages

See §4.2 for the full list of stages and their meanings.

### 4.7 Pipeline Years

Admin-managed via **Configuration → Pipelines & POTs**. Each year is either Visible (appears on the board) or Hidden (suppressed for all users). The board enforces visibility: `GET /api/cost-grids?year=YYYY` returns 404 for unknown years and 403 for inactive ones.

### 4.8 POT Summary in Detail Panel

When a cost grid is linked to a client (or client group), the detail panel shows a POT section: Total % (Committed + Anticipated) against the POT target for the selected year, rendered as a dual-segment progress bar (Committed in green, Anticipated in orange), with the Total, Committed, and Anticipated amounts listed below the bar.

### 4.9 Cost Grid Editor (overlay)

Accessed via "+ New Proposal" or the Edit button on a card. The editor opens as a full-page overlay that keeps the Pipeline tab highlighted in the nav.

**Toolbar:** 🚀 Publish to SIP (Draft versions only, see "Publishing a Draft" below) · 🔗 Share (opens the same share modal described in §18.2, with the same inline "Shared with" list and removal described in §18.3 — the full-page editor is not a separate sharing surface, it's the same mechanism as the pipeline board's detail panel) · ⧉ Clone · 🗑 Delete version (Draft stage only) · ⬇ Export XLS (downloads a styled Excel workbook of the current version's full structure) · ⊟/⊞ compact header toggle (hides per-role move/change/duplicate/remove controls and shrinks the header font)

**Grid-level fields:**
- Grid name

**Version-level fields:**
- Version label
- Pipeline stage (SIP / Expected / Anticipated / Committed / Canceled)
- Start date / End date
- Currency (€, $, £, CHF) — whenever a non-EUR currency is selected, the field shows the offer's own frozen "1 EUR = X" exchange rate underneath it (the rate this offer was last saved with, not a live lookup — see §7.7 for why)
- Client and rate card selection (drives the effective rate for each role column)
- Notes
- Linked projects (multi-select from configured projects)

**Structure:** Phases → Tasks → Roles

- A grid has one or more **phases** (named work packages)
- Each phase has one or more **tasks**
- Each task has estimated **hours** per **role** (despite the "days" terminology used loosely elsewhere in this document's own history — the actual stored, calculated, and displayed unit throughout the cost grid is hours, entered directly, not converted from a day count)
- Pass-through costs (PTC) can be added at task level

**Role columns:**
- Added/removed dynamically
- Each role has a label, a code (matching the actuals XLS), a team, and an hourly rate (€/h)
- Effective rate follows a fallback chain: client rate card override → role's per-currency agency default → EUR rate × currency exchange factor
- Each role column header carries four controls: ◀ / ▶ to move the column left/right, "⇄ change" to replace that role with a different one (keeping its position and hours), "⊕ dup" to duplicate the column under a different role, and "✕ remove" to delete the column outright. The compact-header toggle (§4.9's editor toolbar) hides all four to save space; they reappear when compact mode is switched off.

**Cost calculation:**
- Task budget = Σ(hours × hourly rate) per role + PTC
- Phase budget = Σ task budgets
- Total budget = Σ phase budgets

**Versioning:**
- Multiple versions per grid
- **Publishing a Draft to SIP** (🚀 Publish to SIP, Draft versions only): a one-way transition — once published, a version can never be set back to Draft. Publishing makes it visible to the rest of the team for the first time (a Draft is private to its creator, see §4.2). If the same proposal has *other* Draft versions besides the one being published, they are **permanently deleted** as part of publishing — the confirmation dialog names them and warns of this before it happens.
- **Clone** (⧉, available from both the pipeline board's detail panel and the full-page editor): creates a brand-new, separate proposal — not a new version of the current one — copying the current version's full phase/task/role structure. The new proposal's first version is always labeled "v1" regardless of what the source version was labeled.
- A version is **locked** when: (a) the proposal itself is Committed **and** every task has already been migrated to a project, or (b) another version in the same grid has a linked project
- Locked versions display a 🔒 badge and are read-only
- While the proposal is Committed but tasks remain unmapped, the version stays fully editable and "Generate Project" stays available for the remaining tasks — a proposal can generate more than one project over time, and being Committed does not by itself block that
- **Program auto-link (2026-09):** generating a project from only a subset of the proposal's available tasks (any stage except Draft), when the proposal has no program established yet, opens a "Create program" step (name + ID, or link to an already-existing program) before the project is created; canceling that step aborts the whole generation with nothing created. Once a program is established this way, every later project generated from the same proposal — partial selection or the remaining full set — auto-links to that same program with no further prompt. Any authenticated user with editor access to the proposal can establish a program this way, not just admins.
- **Selecting every remaining task at once** produces a single project with no program prompt at all — the program step only triggers when the selection leaves at least one task unassigned (see above); a proposal generated in one full pass never needs a program unless the user chooses to link one anyway via a later partial generation.
- **Adding tasks to an already-linked project** (as opposed to generating a brand-new one): the same task-selection toolbar that offers "▶ Create project" also offers, once the proposal already has at least one linked project, a dropdown of its existing linked project(s) plus a "＋ Add to project" button — selecting tasks and using this instead appends them to that existing project rather than creating another one. A confirmation step lists exactly which tasks will be added before it happens; the dropdown always resets to unselected after use, so it never silently retains a previous choice.

**Version actions:** Duplicate, Delete, JSON export/import

**Saving:** every field edit inside the editor (phase/task names, descriptions, PTC, header fields, role rates, etc.) schedules an autosave in the background, confirmed by a brief "💾 Auto-saved" toast — there is no need to click anything for an edit to persist. A `💾 Save` button is also available in the toolbar for an explicit, immediate save (shows "💾 Saving…" while in flight).

**Back button:** Returns to Pipeline Board (also triggers an autosave of the current draft state before navigating, on top of the continuous per-edit autosave above).

---

## 5. Resource Planning

### 5.1 Purpose

Show the distribution of sold hours across the portfolio — by role, by project, or by owner — and compare sold hours against consumed actuals from timesheets.

### 5.2 Filters and Controls

| Control | Options |
|---|---|
| Project filter | Multi-select projects |
| Group by | By Role / By Project / By Owner |
| Time granularity | Monthly / Weekly |
| Date range navigation | Previous / Next with period label (e.g. "May 2026 – Aug 2026") |
| Team filter | Filter by team name |
| Monthly pulse | Toggle — show pulse indicators |
| Rounded | Toggle — round to whole numbers vs. two decimal places (display only, see §5.3) |
| Export XLS | Download the current table as Excel |
| 📂 Load XLS | Upload an Excel timesheet file to import actuals — a third entry point into the same upload mechanism described in §8, alongside Project Reporting's and the project configuration form's "Load Actuals" buttons; subject to the same blocking role/task validation (§8.3) |

### 5.3 Table Structure

Rows: resources (roles, projects, or owners depending on grouping). **By Owner** groups its rows in three levels — **Owner → Project → Task** — aggregating hours across every role assigned to a task into one row per task, attributed to the owner regardless of which role they logged time under (a task with multiple sold roles sums all roles' Sold/Actuals into that single task row). This is deliberate: the view's purpose is to show which task an owner is actually working on, not their role (already known once the person is identified) — role-level detail remains available in the By Project view (Project → Task → Role → Owner). **By Role** (2026-09) is expandable: each role row carries a collapse/expand toggle, collapsed by default, that reveals one child row per (project, task) combination the role covers, each with its own Sold/From actuals/To be planned and period cells — a role spread across several projects/tasks no longer reads as one opaque aggregate; the previous, tooltip-only breakdown on hover remains available too. "Expand all"/"Collapse all" controls (already present on By Project/By Owner) are available for By Role as well.  
Columns: time periods (months or weeks) within the selected date range, plus three summary columns per row: **Sold**, **From actuals**, **To be planned**.  
Cells: hours for that resource in that period.

**Formulas** (portfolio-wide table; the By Role / By Project / By Owner grouping only changes the aggregation key, not the underlying math — all three share the same residual/distribution engine):

- **Sold** = Σ `task.resources[].soldHours`, summed over the tasks/resources matching the row's group and the active team filter (`planning.js:598,601`). In By Owner, this sum is taken across every sold role on the task before the residual is computed (`planning.js:1306-1311`), not per role.
- **From actuals** (past weeks only) = matched timesheet hours grouped by week, filtered by task name + role via the shared `matchesTaskRole(record, taskName, role)` helper (`js/lib/planning-calc.js`) — case-insensitive on both fields, and null-safe on a missing task name (matches on role alone rather than throwing). Used identically by all three grouping views (`planning.js:605,617` by-role; `:1027` by-project; `:1311` by-owner, unioned across the task's roles via `.some(...)` so a record matching more than one role is still counted once), so the three views can no longer disagree on which timesheet rows belong to a given task/role. A week is "past" once its end date is before today (`w.isPast`, `planning.js:440`).
- **Residual** = `computeResidual(soldHours, consumedHours)` = `Math.max(0, soldHours − consumedHours)` per task/role (`js/lib/planning-calc.js`; called at `planning.js:609,1029,1331`) — floored at 0, so an over-consumed task/role contributes nothing to future planning rather than a negative offset. Because the floor applies per task/role rather than to the row's aggregate total, a row's **To be planned** can exceed **Sold − From actuals** when one task among several for that role is over-consumed (its full actuals still count toward "From actuals," but its floored-at-zero residual contributes nothing to "To be planned," while another task's residual is unaffected) — the "To be planned" column header carries a tooltip explaining this. This is accepted, documented behavior, not a calculation bug; reconciling it would require changing which future weeks absorb which task's shortfall. In By Owner, this floor now applies at the *task* level (summed across roles) rather than per role — an over-consumed role's shortfall can be offset by another role's remaining budget on the same task, which is intentional given the row is now task-scoped, not role-scoped.
- **To be planned** (current/future weeks) = the residual, distributed across the task's remaining weeks:
  - If the task's `monthlyDistribution` sums to ~100% (`planning.js:631-633`): the residual is split by month according to that %, renormalized across whichever future months the distribution actually covers, then divided evenly across that month's weeks. If the distribution has 0% allocated to every visible future month, this falls back to the even-split rule below.
  - Otherwise: the residual is split evenly across `countFutureTaskWeeks()` — a count of the task's *own* remaining weeks based on its date window, not the number of weeks currently visible on screen, so hours/week stays stable as the user pages through the date range — via the shared `distributeFutureResidual(residualH, totalFutureWeeks, weeksByMonth, pulseEnabled)` helper (`js/lib/planning-calc.js`). Called identically by all three grouping views (`planning.js:678` by-role; `:1070` by-project; `:1356` by-owner), so the three views can no longer disagree on the distribution formula.
- **Monthly pulse** (toggle): applies only in the even-split branch above (not when a `monthlyDistribution` is driving the split), and only when the computed hours/week is `< 1`. Instead of showing a fractional value in every week, that month's total is aggregated into a single cell on the month's *first* week — proportional to how many calendar weeks fall in that month, not divided equally across months — and rendered as `~Xh`. Threshold, distribution, and placement are all computed once inside `distributeFutureResidual` using the task's canonical remaining-week count, not the currently-visible date window, so paging through months never flips the threshold or reshuffles the totals.
- **Rounded** (toggle): display-only — `Math.round(hours)` vs. `hours.toFixed(2)` (`planning.js:690`). It does not change Sold/From actuals/To be planned totals or exports, only how each cell is printed.
- The per-project "By Task" Gantt view (§5.4) uses simpler math than the portfolio table above: it splits raw `soldHours` (not the sold-minus-consumed residual) evenly across the task's overlapping weeks, or by `monthlyDistribution` % if present (`planning.js:277-287`) — actual consumption is shown separately as a completion-% overlay (see §5.4), not subtracted from planned hours.

### 5.4 Gantt View

Task-level Gantt bars per project — **not** phase-level: rows are `project.tasks[]` entries directly (`renderPlanningByTask`, `planning.js:235-270`); there is no phase grouping in this view (phases only exist in the cost-grid domain, not on `project.tasks`).

Each bar's fill color reflects task status, not pipeline stage (`planning.js:253`): grey if the task is marked non-billable (`excl`), green if completed, red if actual hours exceed sold hours, blue otherwise. The filled portion of the bar is `min(100, consumedHours / soldHours × 100)` (`planning.js:248`) — a completion/consumption indicator, distinct from the "To be planned" distribution math in §5.3.

Today marker: the current week's column is highlighted (`gantt-today` class / `isCurrent` flag, `planning.js:450`).

### 5.5 Overallocation color coding

A static, non-AI legend on the Resource Planning table: a row's load is shown in red once it exceeds 30 hours/week (`planning.html:621`). This is a fixed display rule, not an analysis or a generated issue list — see §11.3's correction note for a feature this PRD previously (incorrectly) described as an AI-driven version of this same idea.

---

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
- **＋ New project** — the only page-level toolbar action; navigates to `project-config.html`

**Per-project card** (2026-09 redesign): identity (title, code, pipeline/status badges, an actuals-availability badge — `No actuals available` when the project has no uploaded timesheet data) plus a compact totals row — Duration (project start–end month range), Sold (`phasing` total), Spent (actual-hours-to-date total), and Variance (Sold − Spent, colored green when positive/under-budget and red when negative/over-budget) — with no per-month breakdown on the card itself. The only action on the card is a single **Project Dashboard** button (renamed from `Open project →`, 2026-09), always clickable (not gated on the project having actuals), which navigates into that project's detail view (§6.2).

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

## 7. Configuration

All configuration screens described in this section are admin-only and accessible via the **config.html** page (tabbed layout), which also manages Pipeline years and POT targets. (A separate `admin.html` page exists for user management and is out of scope for this section.)

### 7.1 Project Configuration

Accessed via the project card in the Reporting view (opens `project-config.html` as a full-page form).

**Navigation** (2026-09): a `← Back to Portfolio` / `← Project Dashboard` button pair appears both at the top of the page and again at the bottom (next to Save). `← Project Dashboard` jumps straight to this project's own detail/report view instead of the bare list; it's hidden for a project that hasn't been saved yet (nothing to link to).

**Project fields:**

| Field | Type | Notes |
|---|---|---|
| Name | text | Must match D365 Project Name in XLS |
| Start date | YYYYMM | |
| End date | YYYYMM | |
| Currency | select | €, $, £, CHF |
| Pipeline | select | Inherited from cost grid if linked |
| Status | select | Project status; allowed values depend on Pipeline (e.g. `Started At Risk` is available for `Committed`, `Expected`, and `Anticipated`; `SIP` disables the field entirely; `Canceled` disables it and preserves the current value) |
| Client | select | Optional |
| Program | select | Optional |
| Cost Grid Ref | auto | Set when generated from cost grid |

**Task fields:**

| Field | Type | Notes |
|---|---|---|
| Name | text | Must match "Task/Issue" column in XLS |
| Billable | boolean | Include in budget calculations |
| Completed | boolean | Locks monthly distribution |
| Start / End date | DD/MM/YYYY | Full date, not month-only; defaults to project dates |
| Monthly distribution | % per month | Required for multi-month tasks |
| Resources | role + sold hours + rate | Breakdown of sold effort |

**Monthly % distribution (per task):** only shown for a task spanning more than one month — a single-month task has nothing to distribute. One editable cell per month the task covers, each a percentage; a badge next to the row gives live feedback on whether the entered percentages currently sum to 100%. The cells are read-only (can't be edited) once the task is marked Completed, for a single-month task, or for a viewer. This is the same distribution the Derive/Reforecast actions below read when spreading a task's budget/hours across its future months.

**Edit modes:** Visual form only. (A raw-JSON editor toggle exists in the underlying shared `js/config-form.js`, but was confirmed unreachable on `project-config.html` — no toggle button existed in this page's markup — during its 2026-07 Vue 3 migration, and was not ported. `portfolio.html`'s own separate copy of this config modal, which also referenced `js/config-form.js`, was confirmed unreachable and dropped entirely during that page's own 2026-07 Vue 3 migration; `js/config-form.js` itself remains loaded by `planning.html`, whose own reachability was not investigated.)

**Other sections in the form:** Pass Through Costs (external cost line items), Phasing (monthly budget distribution), Planning (monthly sold-hours distribution), and Functional Groups (named role groupings) — each a distinct area of the same full-page form.

**Pass Through Costs (PTC):** external costs not tied to sold hours — licences, travel, and similar — added as individual line items, each with a title, an optional free-text note, an amount, and the month it occurs in (chosen from the project's own configured months; the project's start/end dates must be set first). A running "Total PTC" figure sums every item. Any item can be removed, after confirming.

**Functional Groups** (2026-09): each group is a name plus a list of role rows, one row per role membership — a free-text role name (must match the "Job Role: Name" column in the uploaded XLS) plus a task dropdown, scoped to this project's own tasks, defaulting to "— any task —". Picking a specific task claims that role's hours only on that task for this group — used to keep a functional area's reporting total precise when the same role is billed at different rates on different tasks (see §6.3); leaving it as "— any task —" claims the role everywhere it appears, matching the group's pre-2026-09 behavior.

**Actuals section** (2026-09): manages the D365 timesheet data imported for this project.
- **📂 Load Actuals** — upload an Excel timesheet file (same mechanism as the Project Reporting single-project detail view's button of the same name, §6.1).
- **👁 View** — opens a popup listing every imported row for this project: Date, Owner, Role, Task, Hours, Notes, Fee, Spent (Fee is the hourly rate resolved and stored at import time, §8.3; Spent = Fee × Hours). Shown only once actuals exist; visible to viewers too.
- **⬇ Download actuals** — downloads the same rows/columns as an Excel `.xlsx` file, named `<Client>_<ProjectName>_<ProjectCode>_<YYYYMMDD>.xlsx`. Shown only once actuals exist; visible to viewers too.
- **🗑 Delete actuals** — permanently removes all imported actuals for this project's D365 code, after a confirmation prompt. Hidden for viewers.
- Saving the project form (**💾 Save**) now returns to this project's own detail view in Project Reporting, rather than the bare project list.

Phasing and Planning are manual grids by default (one currency/hours input per month, freely editable). Two actions can bulk-fill them instead of hand-entry — both share the same confirm-modal UI, but compute completely different numbers:

#### Derive from Task Dates vs. Reforecast

| | **Derive from Task Dates** | **Reforecast** |
|---|---|---|
| Button | `⟳ Derive from task dates` | `↻ Reforecast from actuals` |
| Visible when | Always | Only once actuals exist for the project's D365 code in the uploaded timesheets |
| Data source | Task `startDate`/`endDate` and sold hours/budget only — no actuals | Actual timesheet hours from the loaded XLS, matched by task name, plus sold hours/budget |
| What it touches | All months (past and future alike) | **Past** months (before the current calendar month) vs. **current/future** months, handled differently |
| Past months | N/A — not treated specially | Overwritten with **actual** spend and hours from the XLS. If actuals exceed the sold total, they're scaled down proportionally so the task never shows more than 100% consumed |
| Future months | Each task's `soldHours × hourlyRate` (and hours) is split across months by day-overlap: `overlapDays / taskTotalDays` fraction of the task falling in that month | If the task's `monthlyDistribution` sums to ~100%, remaining budget/hours follow that distribution, with any drift between planned % and actuals-derived % carried onto the first future month; otherwise the remaining budget/hours are split evenly across the task's remaining future months |
| Rounding | Hours across all months round to the nearest quarter-hour, with the sum guaranteed to exactly match the total distributed — never a value the confirmation modal didn't already show | Future months only: hours round to the nearest quarter-hour with the sum guaranteed to exactly match the residual being distributed (no cumulative drift across months); currency rounds to the nearest cent per month, independently. Past months keep exact actual values |
| Result | Both Phasing and Planning grids updated | Both Phasing and Planning grids **fully overwritten** |
| Confirmation | Standard confirm modal | Modal explicitly states past months are replaced with actuals and future months are redistributed |
| Persisted to server | Only when the user subsequently clicks the page's normal **Save** | Same — Save is a separate, explicit step |

**No snapshot/rollback.** `project-config.html` has no `↩ Rollback` control and never saves a pre-run snapshot — confirmed, during that page's 2026-07 Vue 3 migration, to have been unreachable dead code already (`js/config-form.js` still contains the underlying `cfgSaveReforecastSnapshot`/`cfgRollbackReforecast` functions and localStorage mechanism; `portfolio.html`'s own separate copy of this config modal was confirmed unreachable and dropped entirely during that page's own 2026-07 Vue 3 migration, and no live page reachable from normal navigation exposes a rollback button). A Derive/Reforecast run cannot be undone once it overwrites the on-screen grids, other than by reloading the page before clicking **Save** (which discards all unsaved edits, not just the derived/reforecasted ones).

**Blocking error case (Reforecast only):** if the carried-forward drift would push the first future month's distribution above 100%, Reforecast does not silently clamp or partially apply — it stops computing entirely (no task after the offending one is processed either) and shows an inline error message (not a native browser dialog, since a 2026-07 cleanup cycle removed all `alert()`/`window.confirm()` calls from this page): *"Cannot reforecast: Task "&lt;name&gt;": carry-forward (X%) pushes &lt;month&gt; above 100%. Adjust the monthly distribution manually before running Reforecast."* Neither grid is touched, and the user must manually edit that task's monthly distribution before retrying.

**Unsaved result is lost silently on navigation:** a successful Derive/Reforecast only updates the on-screen grid inputs — it does not touch the server. There is no `beforeunload` warning anywhere in the app. If the user closes the tab or navigates away before clicking **Save**, the derived/reforecasted values are gone; the next visit loads the grids fresh from the server (i.e. still the pre-run values).

Neither action validates that Phasing/Planning sums match the task totals; saving proceeds with only a soft warning if Phasing is entirely empty while billable tasks exist.

The entire form is read-only for viewers (see §18.3).

### 7.2 Clients

Simple registry: ID + name. Used to group projects in portfolio view. A client can belong to at most one client group.

Each client row has a **💲 Costgrid** button that opens a rate card modal. The modal lists all roles with two columns:

| Column | Content |
|---|---|
| Agency default | Rate from the global rate card (falls back to `role.hourly_rate` if no global card exists) |
| Client custom (€/h) | Editable override for this client; blank = use agency default |

Saving creates or updates a per-client rate card. Custom rates are applied automatically when the client is selected in a new proposal. Rate card management is **not** available from admin.html — it lives exclusively here.

Rate cards support multiple currencies: for each active non-EUR currency (e.g. USD), the modal shows an additional column alongside EUR, pre-populated with the role's agency default for that currency when set.

### 7.3 Client Groups

Named bundles of clients (e.g. "Italian Public Sector"). Used as the target for POT targets when multiple clients share a revenue goal. CRUD: create, rename, delete. Members: assign/remove individual clients. A client can belong to at most one group at a time. Deleting a group does not delete its member clients — they simply become ungrouped.

### 7.4 Pipelines & POTs

**What a POT is:** a Client POT is the total target revenue — the maximum "wallet potential" — allocated to a specific client (or client group) for a given forecasting year. It is the financial benchmark the organization aims to capture from that client, combining existing recurring business with identified upsell/cross-sell growth opportunities. Everything below (the POT banner, the POT table, the View Details modal, the history log) is different views onto that one number and how actual/anticipated pipeline is tracking against it.

Master/detail tab in config.html:

**View A — Pipeline list:** table of all pipeline years with Visible / Hidden status badge. Actions: toggle visibility (Show/Hide), delete (blocked if cost grid versions reference the year), "POTs →" (drills into View B), "📊 Proposal Phasing", "📋 Project Phasing", + Add year.

**Proposal Phasing / Project Phasing:** dedicated per-year views opened from the pipeline list row, each with an XLS export link. Proposal Phasing shows the monthly budget distribution across proposals for the year; Project Phasing shows the same for active projects.

**View B — POT targets for selected year:**

Layout (top to bottom):
1. Navigation row — ← Pipelines button · "Pipeline YYYY" title · Visible/Hidden status badge
2. **POT banner** (shown only when the year has at least one POT) — Total POT Target across all POTs for the year, and the Committed+Anticipated total with achievement %
3. **5 stage summary cards** (SIP, Expected, Anticipated, Committed, Canceled) — each shows count of proposals and total professional-fee value (days × 8 × rate; pass-through costs excluded). Cards are populated via `GET /api/pots/pipeline-summary?year=`.
4. "POT Targets" section header with "+ New POT" button
5. POT table — lists all POTs for the year. Each row has: client/group name, type badge (Individual / Group), target amount, and action buttons: 🔍 View Details · ✏️ Edit · 🗑.

**+ New POT form:** targets an individual client, a client group, or one of two virtual scopes — "Unassigned / To be Identified" and "New Biz" — for revenue not yet tied to a named client; amount only; year is fixed to the current View B year.

**✏️ Edit:** inline form to update the amount; every change is logged to `pot_history`.

**🔍 View Details modal** — shows:
- POT type badge (Individual / Group) and scope name
- Four KPI cards: **Target** (current `pot.amount`, most recent history entry) · **Total (C+A)** (Committed + Anticipated professional fees) · **Committed** · **Anticipated** — each scoped to this POT's client/group for the year, with a % of target
- **History** — change log newest-first: date, author, old value → new value with arrow
- **Proposals** — all cost grid versions scoped to the POT's client/group + year; Canceled included; Draft excluded; each row links to `/costgrid.html?cgId=...&verId=...`

POT progress is also visible in the Pipeline board detail panel for linked offers.

### 7.5 Programs

Simple registry: ID + name. Groups projects across the portfolio and reporting view. **A program's ID is permanently fixed once created** — the field is disabled in the edit form from that point on, with no way to change it later; a typo made at creation time cannot be corrected on this program, only worked around by creating a new one and migrating its projects.

**Deleting a program is blocked outright while any project is still linked to it** — the delete does not proceed and does not unlink the projects; every linked project must be moved off the program first. (The confirm dialog's own wording currently says linked projects "will lose the program reference," implying the projects get silently unlinked and the delete proceeds — that text does not match this actual, blocking behavior; tracked as a product bug, not corrected by this PRD note alone.)

**No longer has its own tab in config.html's navigation (2026-09)** — since any user can already establish a program from other entry points (`project-config.html`'s "+ New program", or Generate Project's auto-link flow, §4.9), a dedicated Programs tab was judged redundant and hidden. The registry, its API, and the rename/delete actions described above are all unchanged in the backend — but with no tab to reach them from, renaming or deleting an existing program currently has **no UI entry point at all**. Revisiting where that capability should live is an open, explicitly deferred follow-up, not an oversight.

### 7.6 Roles Registry

Accessed via the "Roles" tab in **config.html** (Configuration), alongside Currencies, Clients, Client Groups, and Pipelines & POTs.

| Field | Notes |
|---|---|
| Label | Display name (e.g. "Senior Developer") |
| Code | Must match the role code in the XLS actuals (e.g. "HWGDEV") |
| Team | Not a separate input — auto-derived from the `TEAM - Role` prefix of Code, used as a group label for Resource Planning filters |
| Rate (€/h) | Default hourly rate; can be overridden per cost grid version |
| Default rate (per active non-EUR currency) | Optional — one extra field per active currency (§7.7) appears in the same Add/Edit Role form; blank means "convert the EUR rate at the current exchange rate," a value here fixes this role's own default rate in that currency regardless of exchange-rate movement. This is the "role's per-currency agency default" link in the rate fallback chain (§4.9) — distinct from a client's own rate-card override (§7.2, which takes priority over this) and from a per-offer rate edit (which takes priority over both). |

Actions: Add, edit, delete.

### 7.7 Currencies

Accessed via the "💱 Currencies" tab in **config.html**, alongside Roles, Clients, Client Groups, and Pipelines & POTs — previously undocumented in this PRD despite being a distinct admin tab.

EUR is the fixed base currency (always 1:1, not editable, always active). Any other currency starts **inactive** — offered on offer/project currency dropdowns only once an admin activates it here. **"+ Activate currency"** picks an inactive currency and sets its exchange rate as "1 EUR = X"; once activated it appears in the active-currencies table alongside EUR, with its own symbol, name, rate, and last-updated date. An active currency's rate can be updated at any time directly in that table (a Save button per row); every update is timestamped. A **History** button (not available for EUR, whose rate never changes) opens a log of that currency's past rates over time.

Clicking Save on a rate change opens a confirmation dialog showing the old and new rate before it takes effect, explaining explicitly that the update does **not** retroactively change any proposal or project already in the system — each offer's own exchange rate is fixed the moment the offer is created (or last saved with that currency selected), and only applies going forward to new offers (an existing offer's rate can only change if it is re-saved with that currency selected again, which recomputes it from the then-current admin rate — there is no separate, user-facing "refresh rate" action). This mirrors, in the offer editor itself, the rate display described in §4.9 below.

This exchange rate is the same one used throughout the app wherever a non-EUR figure needs a EUR-equivalent — the pipeline board's mixed-currency column totals (§4.2), the rate card's per-currency columns (§7.2), and any other cross-currency aggregation all read this same admin-managed rate, not a separately configured one.

Actions: Add, edit, delete.

---

## 8. Excel Timesheet Upload

### 8.1 Purpose

Import actuals (hours consumed) from a weekly timesheet export.  
Actuals are matched to projects and tasks to compute budget spent.

### 8.2 Expected Columns

| Column | Format | Notes |
|---|---|---|
| Date | DD/MM/YYYY, MM/DD/YYYY, or ISO `YYYY-MM-DD` — day/month order is disambiguated automatically | Week ending date |
| Job Role: Name | `CODE - LABEL` | Matched to role code in Roles Registry |
| Owner: Name | Text | Person who logged the hours |
| Hours | Decimal | Comma or period accepted |
| Task/Issue | Text | Must match task name in project config |
| D365 Project ID | Text | Used to identify the project |
| WF Project Name | Text | Display name |
| Notes | Text | Free text, not used in calculations |

### 8.3 Behaviour

- Rows with a missing/blank D365 Project ID are skipped; date and hours are stored as-is even if blank/zero
- Hours are grouped by project ID and persisted to PostgreSQL via the API (`timesheets` routes); the frontend loads them into an in-memory cache on each page load
- Uploading a new file for a project replaces the previous actuals for that project
- Triggers refresh of all reporting views
- **Date disambiguation:** for text-formatted date cells (native Excel date cells are read directly, unambiguous), day/month order is resolved deterministically whenever possible — if one of the two numbers is greater than 12, it cannot be a month, so the reading is unambiguous. Only when both numbers are ≤12 (genuinely ambiguous, e.g. `03/04/2026`) does the system fall back to a default (MM/DD, matching the source export's known convention). If the resolved date is not a real calendar date (e.g. day 31 in April), the **entire upload is rejected** with an error naming the offending spreadsheet row — no partial import, not even of the file's otherwise-valid rows.
- **Fee snapshot (2026-09):** each imported row's hourly rate (`Fee`) is resolved once at import time — by matching the row's task+role against the linked project's configured resource rates, same logic as the burndown/KPI rate lookup used elsewhere — and stored with the row. A later change to a role's rate does not retroactively change what an already-imported row reports; re-uploading the file is how a project's actuals pick up a rate change.
- **Role/task validation, blocking (2026-09):** before anything is imported, every row's Task/Issue and Job Role: Name are checked against the target project's own configured tasks and resources — the same case-insensitive matching used for the Fee snapshot above, but stricter: a row referencing a task that doesn't exist on the project, or a role that isn't among that task's configured resources (a blank role included), is an inconsistency. If the file contains even one, **the entire upload is rejected** — nothing is imported for any project code in the file — and a dialog lists every distinct project/task/role combination found to be inconsistent, so the file (or the project's task/resource configuration) can be corrected before re-uploading. This replaces the old silent behavior where an unmatched row would still import with a `Fee` of `0` or a rate borrowed from the task's first configured resource.

### 8.4 Timesheet Management Page (`/timesheets.html`, admin only)

Lists every project code that has uploaded timesheet data, for review and cleanup — separate from the upload action itself (§8.1-8.3), which happens from the Project Reporting view.

- **Summary table**, one row per project code:
  - **Client**, **Project**, **Project code** — the first 3 columns; Client/Project show "—" for a project code with no matching project record.
  - **Uploads**, **Rows**, **Last uploaded** — as before.
  - Filters: a checkbox multi-select for Client, a checkbox multi-select for Project (both combine with AND, and with each other), and a free-text substring filter for Project code.
  - Sorting: clicking the Client, Project, or Project code header cycles ascending → descending → unsorted; the other columns aren't sortable.
  - **Pipeline year** selector: defaults to the current calendar year if it's an active pipeline year, otherwise the most recently active year; an explicit "All years" option shows every project code regardless of year. A project code with no linked cost-grid version has no pipeline year and is only shown under "All years."
- **View** (👁): opens a modal listing every uploaded row for that project code — Date, Owner, Role, Task, Hours, Notes, **Fee**, **Spent**. Fee is the hourly rate snapshotted at import time (§8.3); Spent is Fee × Hours. Both are formatted in the project's own currency.
- **Download actuals** (⬇): downloads the same rows and columns as the View modal, as an Excel `.xlsx` workbook (not CSV), named `<Client>_<Project>_<ProjectCode>_<YYYYMMDD>.xlsx` (spaces in client/project names become `-`; characters not valid in a filename are dropped).
- **Delete actuals** (🗑): removes every uploaded row for that project code, after a confirmation prompt naming the number of uploads/rows that will be deleted. Irreversible.

---

## 9. Settings

Accessed via **account dropdown → ⚙ Settings** (available on all pages).

### 9.1 API & Integrations Tab

| Provider | Fields |
|---|---|
| Anthropic | API Key + model selection |
| OpenAI | API Key + model selection |
| Google Gemini | API Key + model selection |

Keys are persisted in the browser's `localStorage` (`PDash_settings`).

### 9.2 Data Manager Tab

#### Exports (CSV — sent to user's email as attachments)

| Export | Contents | Access |
|---|---|---|
| Cost Grids | One row per task — Grid, Version, Pipeline, Start Date, End Date, Currency, Phase, Task, one column per role-code (days) | All users (own/shared grids only) |
| Project Portfolio | One row per project — ID, Name, Program, Program ID, Client, Pipeline, Status, Start Date, End Date, Currency | All users (own/shared projects only) |
| Roles in Rate Cards | One row per role — Role Code, Role Label, Default rate, one column per client ratecard | Admin only |

Clicking an export button triggers a server-side CSV generation; the file is sent immediately as an email attachment to the logged-in user's address.

#### Backup

- **Full Backup (.json):** Downloads a dated JSON snapshot of all API data (projects, roles, programs, clients, cost grids)
- **Restore from Backup:** Admin-only. ⚠️ Non-functional as implemented, for two compounding reasons — not just the one below: `restoreFromBackup()` reads a key shape (`s.config`/`s.costgrids`) that doesn't match what Full Backup actually writes (`stores.projects`/`stores.costGrids`) for the project/cost-grid data; and even for the keys that *do* line up (roles/programs/clients), the functions that would apply them are documented no-ops left over from before this app was fully API-backed, and every page reloads its state fresh from the API on the next load regardless. No data is persisted back to the API by this button, for any of its fields.

#### Send Notification

Any authenticated user can compose and send a notification to a specific colleague; broadcasting to all active users is admin/sysadmin-only. Delivery channel is selectable — Push (in-app), Email, or both (at least one required). Supports an optional deep-link URL (e.g. `/pipeline.html`, `/costgrid.html?cgId=...`) with a custom label.

---

## 10. Notifications

### 10.1 Bell Icon

A 🔔 bell icon in the navbar top bar shows the unread notification count. Clicking it opens a dropdown panel listing the last 50 notifications.

### 10.2 Real-Time Delivery

Notifications are pushed in real time via **Server-Sent Events (SSE)** — no page refresh required. New notifications appear at the top of the panel instantly.

### 10.3 Notification Panel

Each notification shows:
- Title (bold)
- Body text (optional)
- Time ago (e.g. "3m ago")
- Clickable deep-link if a URL was provided

Clicking a notification marks it as read and navigates to the linked URL if present. "Mark all read" clears the badge in one action.

### 10.4 Notification Types

| Trigger | Description |
|---|---|
| Export ready | Sent automatically when a CSV export is requested — both an email (with the file attached) and an in-app notification (2026-09) to the requester themselves |
| Sent notification | Any user composes a message targeting a specific colleague; broadcast to all users is admin/sysadmin-only |
| Share granted | When a cost grid, project, or program is shared with you — both an email and an in-app notification, for all three resource types (2026-09: previously cost grid share sent only the email) |
| Share revoked (2026-09) | When your access to a project is removed — both an email and an in-app notification to the person whose access was removed (previously silent on both channels); program-level access is granted and revoked per-project under the hood, so this same trigger covers both |
| Cost grid ownership reassigned (2026-09) | When you're made the new owner of a cost grid/proposal — both an email and an in-app notification to the new owner (previously email only) |

### 10.5 Browser (Desktop) Notifications (2026-09)

Alongside the in-app bell, the site tries to show a native OS/browser popup for the same real-time notifications — a best-effort echo, never the only delivery path. A small row at the top of the notification panel reflects and controls this, updated every time the panel is opened:
- **Permission never asked** — "🔔 Enable desktop notifications?" with an "Enable" button; clicking it requests the browser's own permission.
- **Permission granted and popups on** — "🔔 Desktop notifications on" with a "Disable" button; clicking it turns popups back off (a local, in-app preference — the browser's own permission grant itself can't be revoked from the page, only re-enabled here or changed via the browser's own site settings) without needing to touch browser settings.
- **Permission granted but locally disabled** — the row reverts to an "Enable" button, re-enabling without asking the browser again (it's already granted).
- **Permission denied by the browser** — the row doesn't show at all; this app has no way to override a browser-level block.

When enabled, a new notification arriving via the existing SSE stream shows a popup **only if the PDash tab isn't currently focused/visible** — avoiding a redundant popup when the user is already looking at the page. Clicking the popup focuses the tab and follows the notification's link, same as clicking it in the panel. No server-side change: this is a purely client-side echo of the "push" channel already described above.

---

## 11. AI Sidebar

Accessed via the "🤖 AI Chat" button in the top-right of the navbar.

### 11.1 Planning Assistant (Chat)

- Chat interface with conversation history
- Context automatically built from: project config, task breakdown, role assignments, monthly allocation, owner totals
- Calculates forward-looking allocation estimates (next 6 months)
- User can ask free-form planning questions

### 11.2 Project Analysis

- Triggered per project from the Reporting view
- Calls the configured AI provider with a structured project summary
- Returns:
  - RAG status (Red / Amber / Green) with rationale
  - Burn rate analysis
  - Budget risk assessment
  - Planning variance
  - Task-level performance notes
  - Concrete recommendations

### 11.3 Supported AI Providers, and where the request actually goes

- Anthropic Claude (`https://api.anthropic.com/v1/messages`)
- OpenAI (`https://api.openai.com/v1/chat/completions`)
- Google Gemini (`https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`)

**These calls go directly from the browser to the provider, not through PDash's own backend.** The API key entered in Settings (§9.1) and the full request payload (including, for Project Analysis, financial project figures) are sent client-side straight to the provider's own endpoint — PDash's servers never see the prompt or the response.

(2026-09 correction: an earlier version of this PRD described a "Resource Allocation Analysis" feature here — detecting overlapping task allocations and flagging overallocation via AI, at a >28h/week threshold. Audited and confirmed this does not exist anywhere in the codebase. The only real overallocation-related behavior in the app is unrelated and non-AI: Resource Planning's own table (§5) statically color-codes a row red once its load exceeds 30h/week — a fixed display rule, not an AI analysis. This section previously conflated the two.)

---

## 12. Data Model

The source of truth is PostgreSQL. On each page load, the frontend seeds an **in-memory** cache (module-level JS variables, not localStorage) from the API; user actions update the in-memory state immediately and fire an async write to the API in the background. See ARCHITECTURE.md section 5 for the full DB schema and CLAUDE.md's "Data strategy (in-memory cache)" section for the sync functions.

### 12.1 localStorage keys (client-only settings, not server data)

`localStorage` is **not** used for server data — every project, cost grid, role, client, and timesheet row lives only in the in-memory cache described above, seeded fresh from the API on every page load. Only two genuinely client-side keys exist:

| Key | Contents |
|---|---|
| `PDash_settings` | AI provider keys, display preferences |
| `PDash_summary` | Portfolio summary view selection |

### 12.2 CostGrid Shape

```
CostGrid {
  id
  name
  versions: [
    {
      versionId
      label
      pipeline           // "Draft" | "SIP" | "Expected" | "Anticipated" | "Committed" | "Canceled"
      startDate, endDate
      currency
      note
      linkedProjects: [{ projectId, projectName, taskIds, taskNames }]  // taskIds/taskNames = tasks assigned to this project
      phases: [
        {
          id, title
          tasks: [
            {
              id, title
              ptc            // pass-through costs
              roles: [{ roleId, days, months }]
            }
          ]
        }
      ]
    }
  ]
}
```

### 12.3 Project Shape

```
Project {
  id
  name
  startDate, endDate   // YYYYMM
  currency
  pipeline
  status
  programId
  clientId
  costGridRef: { cgId, versionId }   // link to cost grid version
  tasks: [
    {
      name
      billable, completed
      startDate, endDate
      monthlyDistribution: { "YYYYMM": percent }
      resources: [{ role, soldHours, hourlyRate }]
    }
  ]
  phasing: { "YYYYMM": amount }
  ptc: [{ label, amount, month }]
  groups: [{ label, roles[] }]
}
```

---

## 13. Non-Functional Requirements

| Requirement | Detail |
|---|---|
| Runtime | Docker Compose (nginx + Node.js/Express + PostgreSQL); no frontend build step |
| Persistence | PostgreSQL (source of truth); in-memory JS cache seeded from the API on each page load (see §12.1) — localStorage holds only client-side settings, not server data |
| Auth | JWT in httpOnly cookie; 401 → redirect to login |
| Dependencies (frontend) | Bootstrap 5.3.2 (CDN), Chart.js, SheetJS (XLS parsing) |
| Dependencies (backend) | Express, pg, bcryptjs, jsonwebtoken, nodemailer, multer, xlsx |
| Language | All UI text, alerts, and labels must be in English |
| Design tokens | All colours and type sizes must reference CSS custom properties in `css/tokens.css` — no hardcoded hex values in JS or CSS |

---

## 14. Design System

| Token group | Description |
|---|---|
| `--brand-navy` `--brand-magenta` | Primary brand colours (#0B1840, #F0287A) |
| `--indigo-*` | Steel blue palette — project cards, planning |
| `--violet-*` | Slate blue palette — program panels, aggregate rows |
| `--sand-*` | Warm sand — cost grid tables |
| `--pipeline-{stage}-bg/color` | Pipeline stage colours (single source of truth) |
| `--text-2xs` → `--text-2xl` | Typography scale (0.70 rem → 1.25 rem) |
| `--space-1` → `--space-6` | 8px grid spacing (4px → 24px) |
| `--radius-xs` → `--radius-full` | Border radius scale |
| `--shadow-xs` → `--shadow-xl` | Elevation shadows |

---

## 15. Authentication

### 15.1 Login

Email + password. On success: httpOnly JWT cookie set, user profile returned. Wrong password or unknown email both return a generic "invalid credentials" error (no field hint, no user enumeration). Disabled accounts are refused even with correct credentials. **A session lasts 8 hours** from login before the user is automatically signed out (no in-app warning as it approaches — the next action simply gets a 401 and redirects to login).

**Password requirement:** every password-setting flow (activation, reset, change) requires a minimum of 8 characters — enforced both in the UI and, authoritatively, on the server.

### 15.2 Invite Flow

Admin fills first name, last name, email, role → user created in `pending` status → invite email sent with a link containing a token valid for **48 hours**. Following the link lets the user set a password (same 8-character minimum as above); the account becomes `active`.

**Resending an invite (2026-09):** a "✉️ Resend invite" button appears on `admin.html`'s user list, visible only for users still in `pending` status — for the case where the original invite email was lost or never arrived. Resending invalidates the old link and issues a brand-new token with a fresh 48-hour expiry (regardless of whether the previous one had already expired); the same invite email template is used. Any admin or sysadmin can resend, not only the user who sent the original invite.

### 15.3 Password Reset

Self-service. Requesting a reset always returns success, regardless of whether the email matches an account (no enumeration). If it does match, a reset link is emailed, valid for **2 hours**. Following it lets the user set a new password (same 8-character minimum).

### 15.4 Change Password

Available to any authenticated user from the account menu. Requires the current password plus a new password and confirmation (same 8-character minimum).

### 15.5 Logout

Clears the session cookie and returns the user to the login page.

---

## 16. User Administration

Accessed via `admin.html`, admin or sysadmin.

### 16.1 User List

All users, filterable by status (Active / Pending / Disabled); each row shows role and who invited the user.

### 16.2 Roles & Permissions

Three tiers (2026-09) — `sysadmin` sits above `admin` and inherits every admin capability, plus two exclusives carved out of the plain admin tier:

| Role | Description |
|---|---|
| `sysadmin` | Everything `admin` has, plus exclusive access to the DB Reset page (§16.6) and Terms & Conditions editing (§16.5) |
| `admin` | Full access to all data and configuration — no longer includes DB Reset or T&C editing |
| `user` | Scoped access — owns and sees only their own resources |

No account starts as sysadmin; the first one is set up outside the product (direct DB action). Every promotion after that goes through §16.3's toggle.

| Action | Sysadmin | Admin | User |
|---|---|---|---|
| Access DB Reset page | ✅ | ❌ | ❌ |
| Edit/publish Terms & Conditions | ✅ | ❌ | ❌ |
| Grant/revoke sysadmin | ✅ | ❌ | ❌ |
| Invite users | ✅ | ✅ | ❌ |
| Disable / re-enable users | ✅ | ✅ (not on a sysadmin account) | ❌ |
| Anonymize users | ✅ | ✅ (not on a sysadmin account) | ❌ |
| Manage clients | ✅ | ✅ | read-only |
| Manage programs | ✅ | ✅ | create/rename ✅ (2026-09, see §4.9/§7.5), delete ❌ |
| Manage roles + rates | ✅ | ✅ | read-only |
| View ratecards | ✅ | ✅ | ✅ |
| Create / edit / delete ratecards | ✅ | ✅ | ❌ |
| View all cost grids | ✅ | ✅ | own + shared |
| View all projects | ✅ | ✅ | own + shared |
| View all planning | ✅ | ✅ | own + shared |
| Share cost grid / project | ✅ | ✅ | own only |
| Upload timesheet | ✅ | ✅ | own projects only |
| Broadcast notification | ✅ | ✅ | ❌ |
| Manage Team / Attribute Lists (§16.7/§16.8, 2026-09) | ✅ | ✅ | ❌ |

### 16.3 Role & Status Actions

Make a user admin or user (any admin/sysadmin can do this). Grant or revoke sysadmin (sysadmin viewers only, and only on an admin/sysadmin row — never directly on a `user` row: promotion is two-step, `user → admin` then `admin → sysadmin`; demotion mirrors it, `sysadmin → admin` then `admin → user`, never a direct jump in either direction). Disable or re-enable an account. No one can change their own role or status — their own row shows "(you)" instead of action buttons. A sysadmin account can only be modified — role, status, or anonymized — by another sysadmin; a plain admin sees no action buttons at all on a sysadmin's row.

### 16.4 Anonymize

Available only on disabled, not-yet-anonymized users. Requires an explicit confirmation describing what will change. Replaces the user's email and name with anonymized placeholders; their operational data (cost grids, projects) is preserved, only the identity is scrubbed. No one can anonymize their own account, and (per §16.3) a plain admin cannot anonymize a sysadmin.

### 16.5 Terms & Conditions Editor

Moved out of `admin.html` (2026-09) to its own page — sysadmin-exclusive, reachable from a sysadmin-only navbar menu. Sysadmin can view the current draft's version number and edit its HTML content. "Save draft" saves the edit for later without publishing it — users are unaffected and never see an unsaved draft. "Publish new version" permanently records the current draft as a new version and increments the version number, which forces every user to re-accept on their next login (see §17.1). A "👁 Preview" button opens the live acceptance page (`/terms.html`) in a new tab, rendering the current *draft* exactly as a real user would see it — a way to check the draft's appearance before committing to Publish.

**Version history (2026-09):** every published version is retained permanently — publishing a new version never destroys the previous one's text, unlike before this change. A "Version History" list shows every past version (number, publish date, publisher); clicking a version opens its full text read-only. This exists primarily for record-keeping — being able to show exactly what text a given user accepted at a given time, which was not previously possible.

### 16.6 DB Reset

Sysadmin-exclusive hidden page (was admin-only before 2026-09) for bulk/targeted destructive DB operations. Reachable from the same sysadmin-only navbar menu as §16.5. Every destructive action on this page — every scope below, plus the single-proposal delete — requires typing the literal word **DELETE** into a confirmation field before it can proceed, not just a click-through dialog.

**Reset by scope** — 7 independently-triggered, differently-scoped bulk deletions, each with its own stated effect and carve-outs:

| Scope | Deletes | Explicitly spared |
|---|---|---|
| Proposals | All cost grids, versions, phases, tasks, task roles, and related sharing records | — |
| Projects & Programs | All projects (including tasks and planning data) and all programs | Cost grids are not affected |
| Clients & Client Groups | All clients, client groups, and their POTs | Client references on proposals/projects are set to null, not cascade-deleted |
| Client Ratecards | All ratecards linked to a specific client | Agency-wide ratecards (no client) are not affected |
| Actuals (Timesheets) | All uploaded timesheet data | Project structure is not affected |
| Pipeline Years & POTs | All pipeline years and all POT targets with their history | Proposals already in SIP/Committed are not affected |
| Notifications | All in-app notifications for all users | Push/email history already sent is not affected |

**Delete a single proposal** — deletes one cost grid (and everything under it) by ID, independent of the scoped resets above.

**Reassign a proposal's owner** — moves ownership of one proposal to a different active user (see §18.1 for the fuller reassignment behavior, including the equivalent, broader route available directly from the cost grid editor).

### 16.7 Team (Resource Registry, 2026-09)

Own page (`team.html`), admin or sysadmin, reachable from the "⚙ Admin" navbar dropdown. A standalone directory of people who can be allocated to work — first name, last name, email, job title, and a free-text job description — kept separate from PDash user accounts (a resource does not need a login to exist here) but with an optional link to one, when the person also happens to be a PDash user.

Job title is chosen from the same list of roles used elsewhere in the app (§7.6), so a resource's title stays consistent with the titles sold in cost grids; an "Other…" option allows a free-text title for anyone whose real title isn't in that list. Resources can be deactivated (hidden from the default list, kept for history) and reactivated, or deleted outright.

This is the first of four planned cycles toward AI-assisted resource allocation — nothing on this page is consumed by planning or the pipeline yet.

### 16.8 Attribute Lists (Tag Taxonomy, 2026-09)

Own page (`attribute-lists.html`), admin or sysadmin, reachable from the same "⚙ Admin" dropdown as Team. A generic, admin-managed system of named lists and their items — seeded on first deploy with four lists (Market, Brand, Therapeutic Area, Service Type), each empty until an admin populates it. An admin can create additional lists at any time directly from the UI, with no further development needed.

Each list's items can be renamed and toggled active/inactive, but never deleted outright — once a tag exists, it can be retired but not erased, so a future feature that has already applied it to a proposal or project can't have that reference silently vanish. A list's own display name can be renamed too; its underlying identifier is fixed at creation and never changes, even across a rename.

Nothing on this page tags a proposal or project yet — that connection, and the AI-assisted resource suggestion this taxonomy is ultimately meant to feed, are later cycles of the same initiative as §16.7.

---

## 17. GDPR & Data Rights

### 17.1 Terms & Conditions Gate

After login, if the user has never accepted the current Terms & Conditions version — or a new version was published since their last acceptance — they are redirected to a standalone acceptance page before continuing to the app. A checkbox must be ticked before the continue button becomes active. Accepting returns the user to the page they were originally headed to.

### 17.2 Profile Rectification

"My Profile" (accessible from the account menu) lets a user update their own first name, last name, and email. Email must be a valid format and not already used by another account.

### 17.3 Anonymization

The right-to-erasure mechanism for this product is the anonymize action described in §16.4 — admin-performed, not self-service, and requires the account to be disabled first.

---

## 18. Sharing & Permissions

### 18.1 Ownership

The creator of a cost grid or project is its exclusive owner by default. Disabling a user does not remove their ownership; an admin can reassign it to another user.

A sysadmin can reassign a proposal's owner from `_db-reset.html`'s "Change proposal owner" widget (§16.6). As of 2026-09, any admin or sysadmin can also do this directly from the full-page cost grid editor (§4.9) — a "Reassign to…" dropdown next to the owner's name, listing active users, available regardless of whether the version is locked (reassignment is an ownership change, not a content edit). Reassigning a proposal's owner this way additionally grants the new owner Editor access to every project already linked to the proposal (an existing owner of one of those projects keeps their ownership rather than being downgraded), and sends the new owner both an email (listing the linked projects they gained access to) and an in-app notification (2026-09).

### 18.2 Share Modal

Available from a cost grid's detail panel or a project's reporting view — not available at all on a Draft-stage proposal, consistent with a Draft being private to its creator (§4.2). Searches active, non-admin/non-sysadmin platform users by name or email (no free-text email invites — only existing accounts can be granted access). Grants Editor or Viewer access. Permission on an existing share can be changed at any time. Sharing sends the recipient both an email and an in-app notification with a direct link to the shared resource — for all three resource types, project, cost grid, and program (2026-09: previously cost grid share sent only the email, no in-app notification).

**Removing a project share (2026-09):** the person whose access is removed also gets an email and an in-app notification — previously this happened silently, on neither channel. There is no separate "remove" action for a whole program at once — a program's access is granted per-project under the hood, so removing someone from a program means removing them from each of its projects individually, which is where this same notification fires. Removing a cost grid share stays silent on both channels — this cycle only closed the gap for project/program access, not cost grids, as an explicit scope decision.

**Sharing a whole program (2026-09):** each program group's header in the portfolio list view has its own "🔗 Share Program" button — a third, distinct sharing target beyond a single cost grid or project. Sharing a program grants the chosen permission on **every project currently in that program**, in one action, not project-by-project. Only an admin, or someone who already owns/edits at least one project in the program, can do this.

### 18.3 Inline Share Visibility (2026-09)

Both the pipeline board's sliding detail panel and the full-page proposal editor show, without needing to open the Share modal: the proposal owner's name, its (version's) creation date, and a "Shared with" list of everyone who has access, each with their permission badge. A non-owner share can be removed directly from this list. Adding a new share, or changing an existing share's permission, still requires the Share modal. The full-page proposal editor previously had no sharing controls at all — it now also has its own Share button, opening the same modal.

Sharing a cost grid does not grant access to its linked project(s) — the two are independent grants; a project must be shared separately for someone to see it.

### 18.4 Viewer Enforcement

| Surface | Hidden for viewers |
|---|---|
| Pipeline board (card + detail panel) | Edit, Clone, Delete |
| Project Reporting (portfolio view) | Configure (list card — reintroduced in a later 2026-09 cycle, hidden per-card for a viewer-permission project); Load Actuals stays single-project-view only |
| Project Reporting (single-project view) | Configure, Load Actuals |
| Project Configuration form | Entire form becomes read-only (sticky banner, all inputs disabled, Save/action/Reforecast buttons hidden) |
