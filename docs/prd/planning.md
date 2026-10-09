# Resource Planning

Part of [PRD.md](../../PRD.md) — carries PRD §5 Resource Planning.

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
  - If the task's `monthlyDistribution` sums to ~100% (`planning.js:631-633`): the residual is split by month according to that %, renormalized across **all** of the task's future months the distribution covers, then divided evenly across that month's future weeks. Since 2026-09-30 this split no longer depends on the visible date window (before, narrowing the window re-scaled the residual onto the visible months, e.g. 40/30/30 became 57/43): the window only decides which columns are shown, so a cell keeps the same hours whatever the window. Consequently the **To be planned** column of a By Role row — which sums the visible future cells — is smaller in a narrow window, since hours of months outside the window are not shown. If the distribution has 0% allocated to every future month of the task, this falls back to the even-split rule below. (The By Role / By Project / By Owner tables are computed by the backend since 2026-09-30, `POST /api/planning/model`, with the same rules as before; only this window-independence changed.)
  - Otherwise: the residual is split evenly across `countFutureTaskWeeks()` — a count of the task's *own* remaining weeks based on its date window, not the number of weeks currently visible on screen, so hours/week stays stable as the user pages through the date range — via the shared `distributeFutureResidual(residualH, totalFutureWeeks, weeksByMonth, pulseEnabled)` helper (`js/lib/planning-calc.js`). Called identically by all three grouping views (`planning.js:678` by-role; `:1070` by-project; `:1356` by-owner), so the three views can no longer disagree on the distribution formula.
- **Monthly pulse** (toggle): applies only in the even-split branch above (not when a `monthlyDistribution` is driving the split), and only when the computed hours/week is `< 1`. Instead of showing a fractional value in every week, that month's total is aggregated into a single cell on the month's *first* week — proportional to how many calendar weeks fall in that month, not divided equally across months — and rendered as `~Xh`. Threshold, distribution, and placement are all computed once inside `distributeFutureResidual` using the task's canonical remaining-week count, not the currently-visible date window, so paging through months never flips the threshold or reshuffles the totals.
- **Rounded** (toggle): display-only — `Math.round(hours)` vs. `hours.toFixed(2)` (`planning.js:690`). It does not change Sold/From actuals/To be planned totals or exports, only how each cell is printed.
- **Owner-level split within By Project/By Owner** (2026-09-28): within a task/role, "To be planned" hours are further split across the individual owners who logged actuals on it, proportional to each owner's share of that task/role's actuals. An owner currently marked **inactive** in the Team registry (`team.html`) receives **no share of future hours** — their share is redistributed proportionally among the remaining active owners; if every owner on a task/role is inactive, its entire future share falls to a "TBD" placeholder row. **Sold** and **From actuals** are unaffected by status: an inactive owner's row still shows their real historical Sold/Actuals attribution unchanged (only their future share moves), with a small "inactive" badge next to their name. An owner whose name has no match (or an ambiguous match) in the Team registry is treated as active. XLS exports from both views carry the same signal as a `(inactive)` text suffix.


- The per-project "By Task" Gantt view (§5.4) uses simpler math than the portfolio table above: it splits raw `soldHours` (not the sold-minus-consumed residual) evenly across the task's overlapping weeks, or by `monthlyDistribution` % if present (`planning.js:277-287`) — actual consumption is shown separately as a completion-% overlay (see §5.4), not subtracted from planned hours.

### 5.4 Gantt View

Task-level Gantt bars per project — **not** phase-level: rows are `project.tasks[]` entries directly (`renderPlanningByTask`, `planning.js:235-270`); there is no phase grouping in this view (phases only exist in the cost-grid domain, not on `project.tasks`).

Each bar's fill color reflects task status, not pipeline stage (`planning.js:253`): grey if the task is marked non-billable (`excl`), green if completed, red if actual hours exceed sold hours, blue otherwise. The filled portion of the bar is `min(100, consumedHours / soldHours × 100)` (`planning.js:248`) — a completion/consumption indicator, distinct from the "To be planned" distribution math in §5.3.

Today marker: the current week's column is highlighted (`gantt-today` class / `isCurrent` flag, `planning.js:450`).

### 5.5 Overallocation color coding

A static, non-AI legend on the Resource Planning table: a row's load is shown in red once it exceeds 30 hours/week (`planning.html:621`). This is a fixed display rule, not an analysis or a generated issue list — see §11.3's correction note for a feature this PRD previously (incorrectly) described as an AI-driven version of this same idea.

---

