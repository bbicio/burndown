# PDash — Product Requirements Document

**Version:** 1.0  
**Date:** 2026-05-29  
**Status:** Current

---

## 1. Product Overview

PDash is a multi-user web application for project portfolio management. It is designed for consulting and professional services teams who need to track commercial offers, plan resources, and monitor budget consumption across multiple projects.

The app is backed by a Node.js/Express REST API and a PostgreSQL database, with JWT-based authentication and role-based access control — two account roles (admin/user) plus per-resource sharing permissions (owner/editor/viewer) govern what each user can see and do (see §15–18). The frontend is Vanilla JS with no build step; each view is a separate HTML page.

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

Each column (except Draft) has a sticky footer showing the total budget value of all offers in that column.

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

### 4.4 Detail Panel

A fixed right-side panel (860 px wide) with two scrollable columns.

**Header:** 🗑 Delete (Draft stage only) · ⧉ Clone · 🔗 Share · ✏️ Edit · ×. When the cost grid has more than one version, a row of version tabs (colour-coded stage dot + label) appears above the two-column body; clicking a tab reloads the panel for that version. Viewer permission hides Clone, Share, and Edit from the header (see §18.3).

**Left column — Offer metadata + Linked Projects**

- Offer name, pipeline stage badge
- Version label, creation date
- Start date / end date
- Currency
- Rate card name, if one is set on the version
- Notes
- Total budget (€) broken down as: Fee + Pass-Through Costs (PTC)
- JSON export button for the raw cost grid data
- **Linked Projects** list: for each linked project shows project ID (resolved from config), project name, status badge, assigned task names (if any tasks have been assigned to the project), and a "📊 Portfolio" button that navigates to that project's reporting view (only visible when timesheet data exists for the project)

**Right column — Task and Phase breakdown**

- Phase headers (bold, indigo) with total days and total budget
- Per-task rows: task name, role breakdown (days per role), task total
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

**Toolbar:** ⧉ Clone · 🗑 Delete version (Draft stage only) · ⊟/⊞ compact header toggle (hides per-role move/change/duplicate/remove controls and shrinks the header font)

**Grid-level fields:**
- Grid name

**Version-level fields:**
- Version label
- Pipeline stage (SIP / Expected / Anticipated / Committed / Canceled)
- Start date / End date
- Currency (€, $, £, CHF)
- Client and rate card selection (drives the effective rate for each role column)
- Notes
- Linked projects (multi-select from configured projects)

**Structure:** Phases → Tasks → Roles

- A grid has one or more **phases** (named work packages)
- Each phase has one or more **tasks**
- Each task has estimated **days** per **role**
- Pass-through costs (PTC) can be added at task level

**Role columns:**
- Added/removed dynamically
- Each role has a label, a code (matching the actuals XLS), a team, and an hourly rate (€/h)
- Effective rate follows a fallback chain: client rate card override → role's per-currency agency default → EUR rate × currency exchange factor

**Cost calculation:**
- Task budget = Σ(days × hourly rate) per role + PTC
- Phase budget = Σ task budgets
- Total budget = Σ phase budgets

**Versioning:**
- Multiple versions per grid
- A version is **locked** when: (a) a Committed linked project exists, or (b) another version in the same grid has a linked project
- Locked versions display a 🔒 badge and are read-only

**Version actions:** Duplicate, Delete, JSON export/import

**Back button:** Returns to Pipeline Board (auto-saves draft state).

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

### 5.3 Table Structure

Rows: resources (roles, projects, or owners depending on grouping).  
Columns: time periods (months or weeks) within the selected date range, plus three summary columns per row: **Sold**, **From actuals**, **To be planned**.  
Cells: hours for that resource in that period.

**Formulas** (portfolio-wide table; the By Role / By Project / By Owner grouping only changes the aggregation key, not the underlying math — all three share the same residual/distribution engine):

- **Sold** = Σ `task.resources[].soldHours`, summed over the tasks/resources matching the row's group and the active team filter (`planning.js:607,610`).
- **From actuals** (past weeks only) = matched timesheet hours grouped by week, filtered by task name + role (`planning.js:613-617,624-636`). A week is "past" once its end date is before today (`w.isPast`, `planning.js:449`).
- **Residual** = `Math.max(0, soldHours − consumedHours)` per task/role (`planning.js:619`) — floored at 0, so an over-consumed task/role contributes nothing to future planning rather than a negative offset.
- **To be planned** (current/future weeks) = the residual, distributed across the task's remaining weeks:
  - If the task's `monthlyDistribution` sums to ~100% (`planning.js:642-644`): the residual is split by month according to that %, renormalized across whichever future months the distribution actually covers (`planning.js:646-677`), then divided evenly across that month's weeks. If the distribution has 0% allocated to every visible future month, this falls back to the even-split rule below (`planning.js:655-664`).
  - Otherwise: the residual is split evenly across `countFutureTaskWeeks()` — a count of the task's *own* remaining weeks based on its date window, not the number of weeks currently visible on screen, so hours/week stays stable as the user pages through the date range (`planning.js:679-681`).
- **Monthly pulse** (toggle): applies only in the even-split branch above (not when a `monthlyDistribution` is driving the split), and only when the computed hours/week is `< 1` (`planning.js:683`). Instead of showing a fractional value in every week, that month's total is aggregated into a single cell on the month's first visible week and rendered as `~Xh` (`planning.js:686-698`).
- **Rounded** (toggle): display-only — `Math.round(hours)` vs. `hours.toFixed(2)` (`planning.js:714`). It does not change Sold/From actuals/To be planned totals or exports, only how each cell is printed.
- The per-project "By Task" Gantt view (§5.4) uses simpler math than the portfolio table above: it splits raw `soldHours` (not the sold-minus-consumed residual) evenly across the task's overlapping weeks, or by `monthlyDistribution` % if present (`planning.js:286-296`) — actual consumption is shown separately as a completion-% overlay (see §5.4), not subtracted from planned hours.

### 5.4 Gantt View

Task-level Gantt bars per project — **not** phase-level: rows are `project.tasks[]` entries directly (`renderPlanningByTask`, `planning.js:235-270`); there is no phase grouping in this view (phases only exist in the cost-grid domain, not on `project.tasks`).

Each bar's fill color reflects task status, not pipeline stage (`planning.js:253`): grey if the task is marked non-billable (`excl`), green if completed, red if actual hours exceed sold hours, blue otherwise. The filled portion of the bar is `min(100, consumedHours / soldHours × 100)` (`planning.js:248`) — a completion/consumption indicator, distinct from the "To be planned" distribution math in §5.3.

Today marker: the current week's column is highlighted (`gantt-today` class / `isCurrent` flag, `planning.js:450`).

---

## 6. Project Reporting

### 6.1 Portfolio Overview

**Purpose:** Show budget estimated vs. budget spent per project per month.

**Portfolio summary table** (one row per KPI, one column per month, `portfolio.js:44-91`):

| KPI | Calculation |
|---|---|
| Budget Estimated | Σ `project.phasing[YYYYMM]` across selected projects |
| Budget Spent | Σ timesheet hours for that month × the matching role's hourly rate |
| Variance | Estimated − Spent |

**Per-project drill-down KPI cards** (`portfolio.html:80-85`, computed by `dashboard.js:78-130`) — a separate set of cards shown when opening a single project, driven by task/config data rather than `phasing`:

| KPI | Calculation |
|---|---|
| Total Sold Hours | Σ `task.resources[].soldHours` over billable tasks |
| Total Budget | Σ `soldHours × hourlyRate` over billable tasks (+ pass-through costs, if any) |
| Hours Consumed | Σ actual hours from timesheets to date |
| Budget Consumed | Σ actual hours × role rate |
| Hours Left | Total Sold Hours − Hours Consumed |
| Budget Left | Total Budget − Budget Consumed |

Note the two tables are not interchangeable: the portfolio summary's "Budget Estimated" reads the manually-maintained/derived `phasing` grid (§7.1), while the drill-down's "Total Budget" is computed live from task sold-hours × rate and ignores `phasing` entirely — the two can disagree if `phasing` hasn't been kept in sync with the task data (e.g. after editing sold hours without re-running Derive/Reforecast).

**Toolbar actions:**
- **Load XLS** — upload an Excel timesheet file to import actuals
- **Clients** — open Clients management modal
- **Programs** — open Programs management modal
- **Configure Portfolio** — open Project configuration panel

Configure Portfolio and Load Actuals are hidden for viewers (see §18.3).

**View features:**
- Projects grouped by program (expandable / collapsible)
- Program summary row aggregates all child metrics
- Filter by client
- Sort alphabetically or by client

### 6.2 Monthly Summary Table

Not a portfolio-wide bar chart — this is a **per-project table** in the drill-down view (`dashboard.js:340-452`), one row per month, columns grouped as Hours (Estimated / Consumed / Variance) and Budget (Estimated / Spent / Variance), plus a PTC column that only appears when the project has at least one pass-through-cost line item (`hasPtc`, `dashboard.js:366,409,433`). A TOTAL row sums every column.

- Hours Estimated = `cfg.planning[YYYYMM]`; Hours Consumed = actual timesheet hours that month; Hours Variance = Estimated − Consumed.
- Budget Estimated = `cfg.phasing[YYYYMM]`; Budget Spent = actual hours × role rate that month; Budget Variance = Estimated − Spent.
- Variance highlighting is **one-sided**: negative variance (over budget/over hours) is shown in bold red (`text-danger fw-bold`, `dashboard.js:429,432`); there is no corresponding green styling for positive/under-budget variance — it renders in the default table text color.

The only chart on this page is the burndown line chart described implicitly by §6.1 (Chart.js `type: 'line'`, `dashboard.js:296-297`) — there is no separate bar chart matching the portfolio-wide "estimated vs. spent per month across the portfolio" description that was previously here.

---

## 7. Configuration

All configuration screens described in this section are admin-only and accessible via the **config.html** page (tabbed layout), which also manages Pipeline years and POT targets. (A separate `admin.html` page exists for user management and is out of scope for this section.)

### 7.1 Project Configuration

Accessed via the project card in the Reporting view (opens `project-config.html` as a full-page form).

**Project fields:**

| Field | Type | Notes |
|---|---|---|
| Name | text | Must match D365 Project Name in XLS |
| Start date | YYYYMM | |
| End date | YYYYMM | |
| Currency | select | €, $, £, CHF |
| Pipeline | select | Inherited from cost grid if linked |
| Status | select | Project status |
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

**Edit modes:** Visual form or raw JSON editor.

**Other sections in the form:** Phasing (monthly budget distribution), Planning (monthly sold-hours distribution), and Functional Groups (named role groupings) — each a distinct area of the same full-page form.

Phasing and Planning are manual grids by default (one currency/hours input per month, freely editable). Two actions can bulk-fill them instead of hand-entry — both share the same confirm-modal / snapshot / rollback UI, but compute completely different numbers:

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
| Snapshot / rollback | Current grid values saved to browser `localStorage` before overwriting; `↩ Rollback reforecast` restores them (own confirm modal). Past months become read-only in the grid while a snapshot exists | Same mechanism, shared with Derive |
| Persisted to server | Only when the user subsequently clicks the page's normal **Save** — the snapshot itself is never sent to the API | Same — Save is a separate, explicit step |

**Blocking error case (Reforecast only):** if the carried-forward drift would push the first future month's distribution above 100%, Reforecast does not silently clamp or partially apply — it stops computing entirely (no task after the offending one is processed either) and shows a blocking `alert()`: *"Cannot reforecast: Task "&lt;name&gt;": carry-forward (X%) pushes &lt;month&gt; above 100%. Adjust the monthly distribution manually before running Reforecast."* Neither grid is touched, no snapshot is taken, and the user must manually edit that task's monthly distribution before retrying.

**Unsaved result is lost silently on navigation:** a successful Derive/Reforecast only updates the on-screen grid inputs and writes the pre-run snapshot to `localStorage` — it does not touch the server. There is no `beforeunload` warning anywhere in the app. If the user closes the tab or navigates away before clicking **Save**, the derived/reforecasted values are gone; the next visit loads the grids fresh from the server (i.e. still the pre-run values), and the abandoned `localStorage` snapshot is left behind, keyed by project ID — so Rollback may still appear available on a later visit even though there is nothing meaningful left to roll back to (the current grid already equals the snapshot).

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

Named bundles of clients (e.g. "Italian Public Sector"). Used as the target for POT targets when multiple clients share a revenue goal. CRUD: create, rename, delete. Members: assign/remove individual clients.

### 7.4 Pipelines & POTs

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

Simple registry: ID + name. Groups projects across the portfolio and reporting view.

### 7.6 Roles Registry

Accessed via the "Roles" tab in **config.html** (Configuration), alongside Clients, Client Groups, and Programs.

| Field | Notes |
|---|---|
| Label | Display name (e.g. "Senior Developer") |
| Code | Must match the role code in the XLS actuals (e.g. "HWGDEV") |
| Team | Not a separate input — auto-derived from the `TEAM - Role` prefix of Code, used as a group label for Resource Planning filters |
| Rate (€/h) | Default hourly rate; can be overridden per cost grid version |

Actions: Add, edit, delete.

---

## 8. Excel Timesheet Upload

### 8.1 Purpose

Import actuals (hours consumed) from a weekly timesheet export.  
Actuals are matched to projects and tasks to compute budget spent.

### 8.2 Expected Columns

| Column | Format | Notes |
|---|---|---|
| Date | DD/MM/YYYY (or ISO `YYYY-MM-DD`) | Week ending date |
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

**Known risk:** date parsing for text-formatted cells assumes DD/MM/YYYY unconditionally (`api/src/routes/timesheets.js:193-194`), with no heuristic validation. If the source export occasionally emits US-format dates (MM/DD/YYYY) for a text-formatted cell, day and month are silently swapped whenever both values are ≤12 (e.g. "03/04/2026" is always read as 3 April, never as 4 March) — no error is raised. Native Excel date cells are unaffected (handled by a separate, earlier branch). Candidate for a future technical cycle (input validation or explicit format confirmation).

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
- **Restore from Backup:** Admin-only. ⚠️ Non-functional as implemented — `restoreFromBackup()` only mutates legacy in-memory globals via no-op save functions and reads a key shape (`s.config`/`s.costgrids`) that doesn't match what Full Backup actually writes (`stores.projects`/`stores.costGrids`); no data is persisted back to the API.

#### Send Notification

Any authenticated user can compose and send a notification to a specific colleague; broadcasting to all active users is admin-only. Delivery channel is selectable — Push (in-app), Email, or both (at least one required). Supports an optional deep-link URL (e.g. `/pipeline.html`, `/costgrid.html?cgId=...`) with a custom label.

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
| Export ready | Sent automatically when a CSV export is requested (currently delivered via email; in-app notification planned) |
| Sent notification | Any user composes a message targeting a specific colleague; broadcast to all users is admin-only |
| Share | When a cost grid or project is shared with you |

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

### 11.3 Resource Allocation Analysis

- Detects overlapping task allocations per resource
- Flags overallocation (> 28 h/week on a single project)
- Produces a prioritised issue list by severity

### 11.4 Supported AI Providers

- Anthropic Claude (`https://api.anthropic.com/v1/messages`)
- OpenAI (`https://api.openai.com/v1/chat/completions`)
- Google Gemini (`https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`)

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

Email + password. On success: httpOnly JWT cookie set, user profile returned. Wrong password or unknown email both return a generic "invalid credentials" error (no field hint, no user enumeration). Disabled accounts are refused even with correct credentials.

### 15.2 Invite Flow

Admin fills first name, last name, email, role → user created in `pending` status → invite email sent with a link containing a token valid for **48 hours**. Following the link lets the user set a password; the account becomes `active`.

### 15.3 Password Reset

Self-service. Requesting a reset always returns success, regardless of whether the email matches an account (no enumeration). If it does match, a reset link is emailed, valid for **2 hours**. Following it lets the user set a new password.

### 15.4 Change Password

Available to any authenticated user from the account menu. Requires the current password plus a new password and confirmation.

### 15.5 Logout

Clears the session cookie and returns the user to the login page.

---

## 16. User Administration

Accessed via `admin.html`, admin-only.

### 16.1 User List

All users, filterable by status (Active / Pending / Disabled); each row shows role and who invited the user.

### 16.2 Roles & Permissions

| Role | Description |
|---|---|
| `admin` | Full access to all data and configuration |
| `user` | Scoped access — owns and sees only their own resources |

| Action | Admin | User |
|---|---|---|
| Invite users | ✅ | ❌ |
| Disable / re-enable users | ✅ | ❌ |
| Manage clients | ✅ | read-only |
| Manage programs | ✅ | read-only |
| Manage roles + rates | ✅ | read-only |
| View ratecards | ✅ | ✅ |
| Create / edit / delete ratecards | ✅ | ❌ |
| View all cost grids | ✅ | own + shared |
| View all projects | ✅ | own + shared |
| View all planning | ✅ | own + shared |
| Share cost grid / project | ✅ | own only |
| Upload timesheet | ✅ | own projects only |

### 16.3 Role & Status Actions

Make a user admin or user; disable or re-enable an account. An admin cannot change their own role or status — their own row shows "(you)" instead of action buttons.

### 16.4 Anonymize

Available only on disabled, not-yet-anonymized users. Requires an explicit confirmation describing what will change. Replaces the user's email and name with anonymized placeholders; their operational data (cost grids, projects) is preserved, only the identity is scrubbed. An admin cannot anonymize their own account.

### 16.5 Terms & Conditions Editor

Admin can view the current version number and edit its HTML content. "Save draft" updates the content without changing the version (existing users are not re-prompted). "Publish new version" increments the version, which forces every user to re-accept on their next login (see §17.1).

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

### 18.2 Share Modal

Available from a cost grid's detail panel or a project's reporting view. Searches active, non-admin platform users by name or email (no free-text email invites — only existing accounts can be granted access). Grants Editor or Viewer access. Permission on an existing share can be changed at any time. Sharing sends the recipient a notification with a direct link to the shared resource.

### 18.3 Viewer Enforcement

| Surface | Hidden for viewers |
|---|---|
| Pipeline board (card + detail panel) | Edit, Clone, Delete |
| Project Reporting (portfolio view) | Configure, Load Actuals |
| Project Reporting (single-project view) | Configure |
| Project Configuration form | Entire form becomes read-only (sticky banner, all inputs disabled, Save/action/Reforecast buttons hidden) |
