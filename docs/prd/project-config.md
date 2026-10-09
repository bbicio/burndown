# Project Configuration

Part of [PRD.md](../../PRD.md) — carries PRD §7.1 Project Configuration.

### 7.1 Project Configuration

Accessed via the project card in the Reporting view (opens `project-config.html` as a full-page form).

**Navigation** (2026-09): a `← Back to Portfolio` / `← Project Dashboard` button pair appears both at the top of the page and again at the bottom (next to Save). `← Project Dashboard` jumps straight to this project's own detail/report view instead of the bare list; it's hidden for a project that hasn't been saved yet (nothing to link to).

**Project fields:**

| Field | Type | Notes |
|---|---|---|
| Name | text | Must match D365 Project Name in XLS |
| Start date | YYYYMM | |
| End date | YYYYMM | |
| Currency | select | **Read-only** (2026-10-01): a project takes the currency of the proposal it was generated from, and amounts are not converted yet, so the menu is disabled with the hint "Currency cannot be changed here: amounts are not converted yet. Contact a sysadmin if it must be corrected." (only a sysadmin can correct it, through the API). The menu lists the currencies an admin has activated (§7.7), symbol + name (see §7.7 "Number format") |
| Pipeline | select | Inherited from cost grid if linked |
| Status | select | Project status; allowed values depend on Pipeline (e.g. `Started At Risk` is available for `Committed`, `Expected`, and `Anticipated`; `SIP` disables the field entirely; `Canceled` disables it and preserves the current value) |
| Client | select | Optional |
| Program | select | Optional |
| Cost Grid Ref | auto | Set when generated from cost grid |
| Description | textarea | (2026-09-29) Free text on what the project is about; read-only for viewers. "Generate project" pre-fills it once from the proposal's Description, and existing linked projects were backfilled once when this shipped; after that it is independent of the proposal. Feeds the competence topics of the team profiles (§16.11) |

**Task fields:**

| Field | Type | Notes |
|---|---|---|
| Name | text | Must match "Task/Issue" column in XLS |
| Billable | boolean | Include in budget calculations |
| Completed | boolean | Locks monthly distribution |
| Start / End date | DD/MM/YYYY | Full date, not month-only; defaults to project dates |
| Description | textarea | (2026-09-29) Free text on what the task covers; read-only for viewers; pre-filled once by "Generate project" from the proposal task's description. Feeds the competence topics (§16.11) |
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

**Unsaved changes warning (2026-09-30):** a successful Derive/Reforecast only updates the on-screen grid inputs — it does not touch the server until **Save** is clicked. `project-config.html` keeps a snapshot of the project as last loaded/saved; if anything on the page differs from it (Derive/Reforecast results or any other edit) and the user closes or reloads the tab, or navigates away (including via "← Back to Portfolio"), the browser's own native leave-page prompt appears. A successful Save refreshes the snapshot, so the redirect after Save never prompts; viewers never see the prompt. Tags, actuals upload/delete and the New client/New program modals persist immediately and are not part of this check. The prompt text is the browser's and cannot be customised.

Neither action validates that Phasing/Planning sums match the task totals; saving proceeds with only a soft warning if Phasing is entirely empty while billable tasks exist.

The entire form is read-only for viewers (see §18.3).

