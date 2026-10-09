# Excel Timesheet Upload

Part of [PRD.md](../../PRD.md) — carries PRD §8 Excel Timesheet Upload.

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

