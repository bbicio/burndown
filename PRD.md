# PDash — Product Requirements Document

**Version:** 1.0  
**Date:** 2026-05-29  
**Status:** Current

---

## 1. Product Overview

PDash is a single-page web application for project portfolio management. It is designed for consulting and professional services teams who need to track commercial offers, plan resources, and monitor budget consumption across multiple projects.

All data is stored locally in the browser (localStorage). There is no backend server; the app runs entirely client-side from a static HTML file.

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

Five fixed stages, displayed left to right:

| Stage | Meaning |
|---|---|
| SIP | Strategic intent / early prospect |
| Expected | Qualified opportunity, likely to close |
| Anticipated | High-confidence, close imminent |
| Committed | Deal signed / Committed revenue |
| Canceled | Opportunity withdrawn or lost |

Each column has a sticky footer showing the total budget value of all offers in that column.

### 4.3 Offer Cards

Each card represents one cost grid (the active/locked version). Cards display:

- Offer name
- Pipeline stage badge (colour-coded)
- Total budget (€)
- Number of phases and tasks
- Linked project(s) with status badge
- Edit (✏️) and Delete (🗑) action buttons

Clicking a card (anywhere other than the action buttons) opens the **Detail Panel**.

### 4.4 Detail Panel

A fixed right-side panel (860 px wide) with two scrollable columns:

**Left column — Offer metadata + Linked Projects**

- Offer name, pipeline stage badge
- Version label, creation date
- Start date / end date
- Currency
- Notes
- Total budget (€) broken down as: Fee + Pass-Through Costs (PTC)
- JSON export button for the raw cost grid data
- **Linked Projects** list: for each linked project shows project ID (resolved from config), project name, status badge, and a "📊 Reporting" button that navigates to that project's reporting view (only visible when timesheet data exists for the project)

**Right column — Task and Phase breakdown**

- Phase headers (bold, indigo) with total days and total budget
- Per-task rows: task name, role breakdown (days per role), task total
- Role column totals at the bottom of each phase
- Grand total row

### 4.5 Board Toolbar

- **Roles** button — opens the Roles Registry modal
- **+ New Cost Grid** button — opens the Cost Grid Editor with a blank grid

### 4.6 Cost Grid Editor (overlay)

Accessed via "+ New Cost Grid" or the Edit button on a card. The editor opens as a full-page overlay that keeps the Pipeline tab highlighted in the nav.

**Grid-level fields:**
- Grid name

**Version-level fields:**
- Version label
- Pipeline stage (SIP / Expected / Anticipated / Committed / Canceled)
- Start date / End date
- Currency (€, $, £, CHF)
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
- Rate can be overridden at version level

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
| Pipeline filter | Dropdown — filter offers by stage |
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

### 6.3 Gantt View

Phase-level Gantt bars per project.  
Colour-coded by pipeline stage.  
Today marker highlighted.

---

## 7. Configuration

### 7.1 Project Configuration

Accessed via "Configure Portfolio" in the Reporting view.

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

Simple registry: ID + name.  
Used to group projects in portfolio view.

### 7.3 Programs

Simple registry: ID + name.  
Groups projects across the portfolio and reporting view.

### 7.4 Roles Registry

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
- Hours grouped by project ID and stored in localStorage
- Uploading a new file for a project replaces the previous actuals for that project
- Triggers refresh of all reporting views

---

## 9. Settings

Accessed via the "⚙ Settings" button in the top-right of the navbar.

### 9.1 AI Provider Configuration

| Provider | Fields |
|---|---|
| Anthropic | API Key + model selection |
| OpenAI | API Key + model selection |
| Google Gemini | API Key + model selection |

### 9.2 Email Integration (EmailJS)

- Public Key
- Service ID
- Template ID

Used to send AI-generated project status reports by email.

### 9.3 GitHub Integration

- Personal Access Token (PAT)

Used for future sync features.

### 9.4 Data Backup and Restore

- **Export per store:** Download JSON for each data type (config, roles, cost grids, settings, summary selection)
- **Full backup:** Dated JSON file containing all stores plus a version number
- **Restore from backup:** Overwrites all stores (preserves XLS/timesheet data)

---

## 10. AI Sidebar

Accessed via the "🤖 AI Chat" button in the top-right of the navbar.

### 10.1 Planning Assistant (Chat)

- Chat interface with conversation history
- Context automatically built from: project config, task breakdown, role assignments, monthly allocation, owner totals
- Calculates forward-looking allocation estimates (next 6 months)
- User can ask free-form planning questions

### 10.2 Project Analysis

- Triggered per project from the Reporting view
- Calls the configured AI provider with a structured project summary
- Returns:
  - RAG status (Red / Amber / Green) with rationale
  - Burn rate analysis
  - Budget risk assessment
  - Planning variance
  - Task-level performance notes
  - Concrete recommendations

### 10.3 Resource Allocation Analysis

- Detects overlapping task allocations per resource
- Flags overallocation (> 28 h/week on a single project)
- Produces a prioritised issue list by severity

### 10.4 Supported AI Providers

- Anthropic Claude (`https://api.anthropic.com/v1/messages`)
- OpenAI (`https://api.openai.com/v1/chat/completions`)
- Google Gemini (`https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`)

---

## 11. Data Model

All data is persisted in `localStorage` under `PDash_*` keys.

### 11.1 Keys

| Key | Contents |
|---|---|
| `PDash_config` | `{ projects[], programs[], clients[], roles[], monthlyCapacity{}, globalHourlyRate }` |
| `PDash_costGrids` | `CostGrid[]` |
| `PDash_timesheets` | Parsed XLS data keyed by project ID |
| `PDash_settings` | AI keys, email config, GitHub PAT, display preferences |

### 11.2 CostGrid Shape

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

### 11.3 Project Shape

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

## 12. Non-Functional Requirements

| Requirement | Detail |
|---|---|
| Runtime | Browser only — no server, no build step |
| Persistence | localStorage (client-side only; no cloud sync) |
| Dependencies | Bootstrap 5.3.2 (CDN), Chart.js, SheetJS (XLS parsing) |
| Language | All UI text, alerts, and labels must be in English |
| Design tokens | All colours and type sizes must reference CSS custom properties in `css/tokens.css` — no hardcoded hex values in JS or CSS |
| Performance | All views must render from localStorage data without network requests (except AI calls and favicon) |

---

## 13. Design System

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
