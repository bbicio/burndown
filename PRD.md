# PDash — Product Requirements Document

**Version:** 1.0  
**Date:** 2026-05-29  
**Status:** Current

---

## 1. Product Overview

PDash is a multi-user web application for project portfolio management. It is designed for consulting and professional services teams who need to track commercial offers, plan resources, and monitor budget consumption across multiple projects.

The app is backed by a Node.js/Express REST API and a PostgreSQL database, with JWT-based authentication and role-based access control. The frontend is Vanilla JS with no build step; each view is a separate HTML page.

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

Clicking a card (anywhere other than the action buttons) opens the **Detail Panel**.

### 4.4 Detail Panel

A fixed right-side panel (860 px wide) with two scrollable columns.

**Header:** 🗑 Delete (Draft stage only) · ⧉ Clone · 🔗 Share · ✏️ Edit · ×. When the cost grid has more than one version, a row of version tabs (colour-coded stage dot + label) appears above the two-column body; clicking a tab reloads the panel for that version.

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
- **+ New Cost Grid** button — opens the Cost Grid Editor with a blank grid (hidden for non-admins on inactive years)
- **Roles** button — opens the Roles Registry modal (see §7.6)

### 4.6 Pipeline Stages

Six stages: `Draft` (private, only visible to creator) + `SIP` / `Expected` / `Anticipated` / `Committed` / `Canceled`. Draft offers are excluded from column totals and other users' boards.

### 4.7 Pipeline Years

Admin-managed via **Configuration → Pipelines & POTs**. Each year is either Visible (appears on the board) or Hidden (suppressed for all users). The board enforces visibility: `GET /api/cost-grids?year=YYYY` returns 404 for unknown years and 403 for inactive ones.

### 4.8 POT Summary in Detail Panel

When a cost grid is linked to a client (or client group), the detail panel shows a POT section: Total % (Committed + Anticipated) against the POT target for the selected year, rendered as a dual-segment progress bar (Committed in green, Anticipated in orange), with the Total, Committed, and Anticipated amounts listed below the bar.

### 4.9 Cost Grid Editor (overlay)

Accessed via "+ New Cost Grid" or the Edit button on a card. The editor opens as a full-page overlay that keeps the Pipeline tab highlighted in the nav.

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
| Rounded | Toggle — round hour values to whole numbers |
| Export XLS | Download the current table as Excel |

### 5.3 Table Structure

Rows: resources (roles, projects, or owners depending on grouping).  
Columns: time periods (months or weeks) within the selected date range.  
Cells: hours for that resource in that period (sold / actuals / variance).

### 5.4 Gantt View

Phase-level Gantt bars per project.  
Colour-coded by pipeline stage.  
Today marker highlighted.

---

## 6. Project Reporting

### 6.1 Portfolio Overview

**Purpose:** Show budget estimated vs. budget spent per project per month.

**KPI cards per project:**

| KPI | Calculation |
|---|---|
| Budget Estimated | From cost grid phasing (monthly distribution) |
| Budget Spent | Actuals from XLS × role hourly rate |
| Variance | Estimated − Spent |
| Total Sold Hours | Σ sold hours from cost grid |
| Total Budget | Σ sold hours × rate |

**Toolbar actions:**
- **Load XLS** — upload an Excel timesheet file to import actuals
- **Clients** — open Clients management modal
- **Programs** — open Programs management modal
- **Configure Portfolio** — open Project configuration panel

**View features:**
- Projects grouped by program (expandable / collapsible)
- Program summary row aggregates all child metrics
- Filter by client
- Sort alphabetically or by client

### 6.2 Monthly Budget Chart

Bar chart showing estimated vs. spent per month across the portfolio.  
Pass-through costs shown as a separate series.  
Variance highlighting (green when under budget, red when over).

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
| Start / End date | YYYYMM | Defaults to project dates |
| Monthly distribution | % per month | Required for multi-month tasks |
| Resources | role + sold hours + rate | Breakdown of sold effort |

**Edit modes:** Visual form or raw JSON editor.

### 7.2 Clients

Simple registry: ID + name. Used to group projects in portfolio view. A client can belong to at most one client group.

Each client row has a **💲 Costgrid** button that opens a rate card modal. The modal lists all roles with two columns:

| Column | Content |
|---|---|
| Agency default | Rate from the global rate card (falls back to `role.hourly_rate` if no global card exists) |
| Client custom (€/h) | Editable override for this client; blank = use agency default |

Saving creates or updates a per-client rate card. Custom rates are applied automatically when the client is selected in a new proposal. Rate card management is **not** available from admin.html — it lives exclusively here.

### 7.3 Client Groups

Named bundles of clients (e.g. "Italian Public Sector"). Used as the target for POT targets when multiple clients share a revenue goal. CRUD: create, rename, delete. Members: assign/remove individual clients.

### 7.4 Pipelines & POTs

Master/detail tab in config.html:

**View A — Pipeline list:** table of all pipeline years with Visible / Hidden status badge. Actions: toggle visibility (Show/Hide), delete (blocked if cost grid versions reference the year), + Add year. Clicking a row drills into View B.

**View B — POT targets for selected year:**

Layout (top to bottom):
1. Navigation row — ← Pipelines button · "Pipeline YYYY" title · Visible/Hidden status badge
2. **5 stage summary cards** (SIP, Expected, Anticipated, Committed, Canceled) — each shows count of proposals and total professional-fee value (days × 8 × rate; pass-through costs excluded). Cards are populated via `GET /api/pots/pipeline-summary?year=`.
3. "POT Targets" section header with "+ New POT" button
4. POT table — lists all POTs for the year. Each row has: client/group name, type badge (Individual / Group), target amount, and action buttons: 🔍 View Details · ✏️ Edit · 🗑.

**+ New POT form:** targets either an individual client or a client group; amount only; year is fixed to the current View B year.

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

Accessed via the "Roles" button on the Pipeline board toolbar.

| Field | Notes |
|---|---|
| Label | Display name (e.g. "Senior Developer") |
| Code | Must match the role code in the XLS actuals (e.g. "HWGDEV") |
| Team | Group label for Resource Planning filters |
| Rate (€/h) | Default hourly rate; can be overridden per cost grid version |

Actions: Add, edit, delete, JSON export/import.

---

## 8. Excel Timesheet Upload

### 8.1 Purpose

Import actuals (hours consumed) from a weekly timesheet export.  
Actuals are matched to projects and tasks to compute budget spent.

### 8.2 Expected Columns

| Column | Format | Notes |
|---|---|---|
| Date | MM/DD/YYYY | Week ending date |
| Job Role: Name | `CODE - LABEL` | Matched to role code in Roles Registry |
| Owner: Name | Text | Person who logged the hours |
| Hours | Decimal | Comma or period accepted |
| Task/Issue | Text | Must match task name in project config |
| D365 Project ID | Text | Used to identify the project |
| WF Project Name | Text | Display name |
| Notes | Text | Free text, not used in calculations |

### 8.3 Behaviour

- Rows with missing date or zero hours are ignored
- Hours are grouped by project ID and persisted to PostgreSQL via the API (`timesheets` routes); the frontend loads them into an in-memory cache on each page load
- Uploading a new file for a project replaces the previous actuals for that project
- Triggers refresh of all reporting views

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
| Cost Grids | One row per task — Grid, Version, Pipeline, Phase, Task, Description, Dates, PTC%, one column per role-code (days) | All users (own/shared grids only) |
| Project Portfolio | One row per project — Name, Program Name, Program ID, Client, Pipeline, Status, Dates, Currency | All users (own/shared projects only) |
| Roles in Rate Cards | One row per role — Role Code, Role Label, Default rate, one column per client ratecard | Admin only |

Clicking an export button triggers a server-side CSV generation; the file is sent immediately as an email attachment to the logged-in user's address.

#### Backup

- **Full Backup (.json):** Downloads a dated JSON snapshot of all API data (projects, roles, programs, clients, cost grids)
- **Restore from Backup:** Admin-only. Restores from a previously downloaded backup JSON file.

#### Send Notification

Any authenticated user can compose and send an in-app notification to a specific colleague; broadcasting to all active users is admin-only. Supports an optional deep-link URL (e.g. `/pipeline.html`, `/costgrid.html?cgId=...`) with a custom label.

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
| Admin message | Admin composes a custom message targeting a user or all users |
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
      pipeline           // "SIP" | "Expected" | "Anticipated" | "Committed" | "Canceled"
      startDate, endDate
      currency
      note
      linkedProjects: [{ projectId, projectName }]
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
| Persistence | PostgreSQL (source of truth); localStorage used as a read cache |
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
