# Date / Sold-Hours / Rate Consistency Audit

**Date:** 2026-07-03
**Scope:** verification-only — date handling, sold-hours/rounding discipline, and hours×rate calculation, checked for consistency across all sections of the PDash application. No code or documentation was modified as part of this audit. See `docs/superpowers/specs/2026-07-03-date-hours-rate-consistency-audit-design.md` for the full design and taxonomy definitions.

## Domain 1 — Date Handling

### DB Column Scan

Scanned via `docker exec pdash-db psql -U pdash -d pdash -c "\d+ <table>"` for every table in `\dt`, cross-checked with `information_schema.columns` (filtered on `date`/`timestamp`/date-like names) and sample-row queries to confirm actual stored format (not just declared type).

| Table.Column | Type | Written/read by | Two-tier compliant? | Notes |
|---|---|---|---|---|
| `cost_grid_versions.start_date` | `varchar(6)` | `api/src/routes/cost-grids.js` (INSERT/UPDATE), `js/costgrid.js` (editor `<input type="month">`, `cgIsoToIt`-adjacent formatting) | Yes | Proposal-level, YYYYMM confirmed by sample rows (`"202605"`) |
| `cost_grid_versions.end_date` | `varchar(6)` | same as above | Yes | Same pattern, e.g. `"202612"` |
| `projects.start_date` | `character(6)` | `api/src/routes/projects.js`, `js/config-form.js`, `js/dashboard.js`, `js/portfolio.js` | Yes | Project-level, sample rows confirm 6-char YYYYMM (`"202601"`) |
| `projects.end_date` | `character(6)` | same as above | Yes | Same pattern |
| `tasks.start_date` | `varchar(8)` | `api/src/routes/cost-grids.js` (proposal task rows), `js/costgrid.js` (`taskStartDate`, converted ISO↔YYYYMMDD at the API boundary via `.replace(/-/g,'')` and `toInputDate()`) | Yes | Task-level (cost-grid task), full date, sample rows confirm 8-char YYYYMMDD (`"20251201"`) |
| `tasks.end_date` | `varchar(8)` | same as above | Yes | Same pattern |
| `project_tasks.start_date` | `character(8)` | `api/src/routes/projects.js`, `js/config-form.js` (`cfgYmdToIt`/`cfgItToYmd`, direct YYYYMMDD), `js/planning.js` (Gantt) | Yes | Task-level (project task / Gantt), full date, sample rows confirm 8-char (`"20260511"`). Migration `012_project_task_date_char8.sql` widened this from CHAR(6)→CHAR(8) — confirms the two-tier discipline was retrofitted here, consistent with current state |
| `project_tasks.monthly_distribution` | `jsonb` | `api/src/routes/projects.js`, `js/config-form.js`, `js/dashboard.js` | Not applicable | Keys are YYYYMM month strings inside a JSON object, not a column-level date; not evaluated as a discrete date column |
| `project_tasks.resources` | `jsonb` | `js/config-form.js` | Not applicable | No date content found |
| `projects.created_at` | `timestamptz` | server-generated on INSERT only | Out of scope | Audit-trail, never exposed as business data in any page checked (`js/portfolio.js`, `js/pipeline-board.js`, `js/dashboard.js`) |
| `cost_grids.created_at` | `timestamptz` | server-generated | Out of scope | Audit-trail only |
| `cost_grid_versions.created_at` | `timestamptz` | server-generated; read by `js/pipeline-board.js` (`sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))`), `js/costgrid.js:239` (`new Date(v.createdAt).toLocaleDateString('it-IT')`) | Out of scope? — displayed in the version table as "created" info | See **Unresolved Scope Questions** below for resolution |
| `client_groups.created_at` / `clients.created_at` / `programs.created_at` / `ratecards.created_at` / `roles.created_at` / `resource_shares.created_at` / `pipeline_years.created_at` / `pots.created_at` | `timestamptz` | server-generated | Out of scope | Audit-trail only, no evidence of business-date exposure |
| `users.created_at` | `timestamptz` | server-generated | Out of scope | Audit-trail |
| `users.invite_expires` | `timestamptz` | `api/src/routes/auth.js` (invite flow) | Out of scope | Technical control (token expiry), not business data |
| `users.reset_expires` | `timestamptz` | `api/src/routes/auth.js` (password reset flow) | Out of scope | Technical control (token expiry) |
| `users.terms_accepted_at` | `timestamptz` | `api/src/routes/app-settings.js`-adjacent T&C gate logic | Out of scope | Compliance/audit timestamp; no UI reference found |
| `notifications.created_at` | `timestamptz` | `js/notifications.js` (`timeAgo(new Date(n.created_at))`) | Out of scope | Audit/event timestamp for a notification, not project/task/proposal business data |
| `notifications.read_at` | `timestamptz` | `js/notifications.js:91` (truthiness only, not formatted/displayed as a date) | Out of scope | Technical read-state marker |
| `pot_history.changed_at` | `timestamptz` | server-generated | Out of scope | Audit-trail for POT amount changes |
| `timesheets.uploaded_at` | `timestamptz` | `api/src/routes/timesheets.js` (`GET /` returns `MAX(uploaded_at) AS last_uploaded`), `timesheets.html:79` (`{{ fmtDate(r.last_uploaded) }}` — rendered as a "Last uploaded" column) | Out of scope? — rendered in a user-facing table | See **Unresolved Scope Questions** below for resolution |
| `currency_rates.created_at` | `timestamp without time zone` | server-generated | Out of scope | Audit-trail |
| `currencies.updated_at` | `timestamp without time zone` | server-generated | Out of scope | Audit-trail |
| `app_settings.updated_at` | `timestamptz` | server-generated | Out of scope | Audit-trail |

No column was found that stores a Proposal/Project-level date in full-date (8-char) form, nor a Task-level date in month-only (6-char) form. **No INCONSISTENT finding at the DB-column level** — the two-tier discipline holds for every in-scope column, including a confirmed retrofit (`project_tasks` CHAR(6)→CHAR(8) via migration `012_project_task_date_char8.sql`).

### Findings

#### F1-1: `timesheets.js` DD/MM/YYYY assumption has no format validation (known case)
- **Type:** MISSING
- **Severity:** Important
- **Location:** `api/src/routes/timesheets.js:193-194` (DD/MM/YYYY regex branch inside `formatDate`, defined lines 186-196), consumed at line 116 (`date: colDate ? formatDate(row[colDate]) : null`)
- **Evidence:**
  ```js
  function formatDate(val) {
    if (!val) return null;
    if (val instanceof Date) return val.toISOString().slice(0, 10);
    const s = String(val).trim();
    // already ISO
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    // DD/MM/YYYY
    const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    return s;
  }
  ```
  The regex accepts any `\d{1,2}` in both the first and second capture groups with no bound check (e.g. ≤31 / ≤12) and no branch to detect MM/DD ordering — it unconditionally treats group 1 as day and group 2 as month. Confirmed via `docker exec pdash-db psql` that `timesheets.data` stores the *output* of this function as ISO strings (e.g. `"date": "2026-02-24"`), so once corrupted, a bad date silently persists in that shape with no downstream check.
- **Description:** The external XLS source (Excel timesheet export, not modifiable) exports dates in US format (MM/DD/YYYY) when cells are text-formatted (numeric/native Excel date cells are already handled correctly via the `val instanceof Date` branch, since `POST /upload` reads with `cellDates: true`). `formatDate()` unconditionally treats text-formatted cells as DD/MM/YYYY, silently swapping day and month whenever both values are ≤12, and producing invalid dates without erroring when the day is >12 in the true MM/DD source (e.g. `04/24/2026` → `2026-24-04`, an invalid month, currently silently passed through as a non-ISO string). No production data has been corrupted so far per prior verification — this is a fragile, unguarded assumption, not an active bug.

#### F1-2: dd/mm/yyyy parse-and-validate logic duplicated instead of centralized in `js/lib/`
- **Type:** INCONSISTENT
- **Severity:** Minor
- **Location:** `js/config-form.js:5-17` (`cfgYmdToIt`/`cfgItToYmd`) vs `js/costgrid.js:72-85` (`cgIsoToIt`/`cgItToIso`)
- **Evidence:**
  ```js
  // js/config-form.js:9-17
  function cfgItToYmd(it) {
    if (!it) return '';
    const parts = it.split('/');
    if (parts.length !== 3) return '';
    const [d, m, y] = parts;
    if (!d || !m || !y || y.length !== 4) return '';
    const ymd = `${y}${m.padStart(2,'0')}${d.padStart(2,'0')}`;
    return isNaN(new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`).getTime()) ? '' : ymd;
  }
  ```
  ```js
  // js/costgrid.js:77-85
  function cgItToIso(it) {
    if (!it) return '';
    const parts = it.split('/');
    if (parts.length !== 3) return '';
    const [d, m, y] = parts;
    if (!d || !m || !y || y.length !== 4) return '';
    const iso = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    return isNaN(new Date(iso).getTime()) ? '' : iso;
  }
  ```
- **Description:** Both functions implement the identical dd/mm/yyyy split-parse-validate algorithm for user-typed task date text inputs — one for project-config task dates (output: YYYYMMDD), one for cost-grid task dates (output: ISO yyyy-mm-dd). They currently behave identically, but they are two independent copies rather than one shared function, unlike `cfgParseHours`/`cfgFmtHours`/`roundToQuarterHour`, which were deliberately extracted to `js/lib/cfg-parse.js` for exactly this kind of reuse/testability. Any future validation fix applied to one copy and not the other would silently reintroduce drift between the two task-date entry surfaces.

#### F1-3: Reusable dd/mm/yyyy validation pattern already exists (informational, feeds F1-1)
- **Type:** INCOMPLETE
- **Severity:** Minor
- **Location:** `js/config-form.js:9-17`, `js/costgrid.js:77-85` (see F1-2)
- **Evidence:** Both `cfgItToYmd` and `cgItToIso` reject malformed input (`parts.length !== 3`, missing parts, `y.length !== 4`) and reject calendar-invalid dates via `isNaN(new Date(...).getTime())`, returning `''` on failure instead of silently passing through a bad string.
- **Description:** This model exists client-side, for user-typed input — not server-side, and not for disambiguating DD/MM vs MM/DD ambiguity (the `timesheets.js` problem is ordering ambiguity, not just malformed-string rejection, so this model would need adaptation, not a direct port). A reusable validation *shape* (split → check part count/lengths → round-trip through `Date` and reject NaN) already exists in this codebase and could inform a future fix, though it does not on its own solve the MM/DD-vs-DD/MM ambiguity at the root of F1-1.

### Date Import/Parsing Points Inventory

| Location | Assumed format | Validation present? |
|---|---|---|
| `api/src/routes/timesheets.js:193-194` (`formatDate`, DD/MM/YYYY branch) | DD/MM/YYYY (unconditional) | No — see F1-1 |
| `api/src/routes/timesheets.js:191` (`formatDate`, ISO branch) | `YYYY-MM-DD...` via regex `^\d{4}-\d{2}-\d{2}` | Partial — regex-shape check only, no calendar validity check |
| `api/src/routes/timesheets.js:188` (`formatDate`, `Date` instance branch) | Native Excel date cell (via `XLSX.read(..., { cellDates: true })`) | Yes — trusted, produced by the `xlsx` library's own date decoding |
| `js/config-form.js:9-17` (`cfgItToYmd`) | dd/mm/yyyy, user-typed | Yes — part-count, year-length, and `Date` round-trip check (see F1-2/F1-3) |
| `js/config-form.js:5-8` (`cfgYmdToIt`) | YYYYMMDD → dd/mm/yyyy (display only) | No explicit validation, but input is always a known-good stored value, not external |
| `js/costgrid.js:77-85` (`cgItToIso`) | dd/mm/yyyy, user-typed | Yes — same shape as `cfgItToYmd` (see F1-2/F1-3) |
| `js/costgrid.js:72-76` (`cgIsoToIt`) | ISO yyyy-mm-dd → dd/mm/yyyy (display only) | No explicit validation, input is a known-good stored value |
| `js/core.js:245-250` (`ymd2date`) | YYYYMMDD or legacy YYYYMM (length-based branch) | Length check only, no calendar validity check; input is internal, not external |
| `js/core.js:255-262` (`parseTaskDate`) | YYYYMMDD or legacy YYYYMM (length-based branch) | Length check only, no calendar validity check; input is internal |
| `api/src/routes/cost-grids.js:513` (`toInputDate`) | DB-stored YYYYMMDD (8-char) → ISO for the editor | Length check only; input is DB-controlled, not external |
| `api/src/routes/cost-grids.js:573` (`normDate`, inline arrow) | ISO or YYYYMMDD from client payload → normalized YYYYMMDD | No calendar validity check; strips non-digits blindly and truncates to 8 chars — lower risk than F1-1 since it's an authenticated internal API call, not raw external file text, but structurally the same "no bound/calendar check" pattern |
| `js/pipeline-board.js:216-221` (`pbFmtTaskDate`) | YYYY-MM-DD or YYYYMM/YYYYMMDD (legacy), display only | Length/shape branch only, no calendar validity check; display formatting, not a write path |
| `api/src/restore-backup.js:100` (`toDate`) | Backup-file YYYYMM (≥6 chars) → `YYYY-MM-01` | Length check only; trusts the app's own backup export format |
| `api/src/db/migrate-backup.js:40` (`toDate`) | Legacy backup YYYYMM → `YYYY-MM-01` | No explicit validation beyond `slice(0,6)`; one-time migration utility, not a live import path |
| `js/costgrid.js:2759-2793` (`cgImportAll`) | Cost-grid JSON export (self-produced format) re-imported | `JSON.parse` + presence check only; no per-field date validation, but the source is the app's own export, not third-party data |

### Reusable Validation Model?

Yes, partially — see F1-3. `js/config-form.js:9-17` (`cfgItToYmd`) and `js/costgrid.js:77-85` (`cgItToIso`) both implement a "split → check shape → round-trip through `new Date(...)` → reject on `NaN`" validation pattern for user-typed dd/mm/yyyy input. This is a reusable *shape* for rejecting malformed date strings, but it does not by itself resolve the DD/MM-vs-MM/DD ordering ambiguity that is the actual defect in `timesheets.js` (F1-1) — that ambiguity requires either an explicit column-format setting/heuristic, which no existing code in this repo currently implements. No other reusable model (e.g. a date-format-detection library, a per-project locale setting) was found in `api/src/` or `js/`.

---

## Domain 2 — Sold Hours & Rounding

Scope reminder: **sold hours** = `task.resources[].soldHours` (project) / `task.hours[roleCode]` (cost-grid proposal). Confirmed design: these are integers or from the exact set {0, 0.25, 0.4, 0.75} and must NEVER be rounded on the Proposal → Project → view path. Reforecast/Derive/monthly-distribution are SEPARATE forecast fields (`planning`, `phasing`, monthly distribution) where per-month rounding is intentional; what is verified here is whether that rounding stays confined to those forecast fields and whether its *totals* still reconcile with the sold value.

### Rounding Function Call-Site Inventory

| Location | Named or inline | Touches sold hours? | Notes |
|---|---|---|---|
| `js/lib/cfg-parse.js:14` `roundToQuarterHour` | Named (def) | Indirectly (via callers) | `Math.round(n*4)/4` — the quarter-hour snap. |
| `js/lib/cfg-parse.js:18-23` `cfgFmtHours` | Named (def) | Indirectly | Snaps to 0.25 then `toFixed(2)`; used to display the **planning** grid. |
| `js/config-form.js:848` `roundToQuarterHour(newPlanning[ym])` | Named | No (writes `planning`, not `soldHours`) | Reforecast future-month rounding — by design per month; see F2-3. |
| `js/config-form.js:939` `cfgFmtHours(raw)` in `cfgGridHTML(type='hours')` | Named | No (planning grid display) | Re-snaps ANY value put in the planning grid to 0.25 → double-rounds Derive output; see F2-2. |
| `js/config-form.js:957/963/973` `cfgParseHours` | Named | No | Reads planning-grid inputs (parse, not round). |
| `js/config-form.js:440` `cfgParseHours(inp.value)` | Named | No | Sums planning inputs. |
| `js/config-form.js:453` resource hours `<input value="${r.soldHours ?? 0}">` | Raw (no rounding) | **Yes** | Sold hours shown raw; `step="0.5"` only — no set enforcement (F2-1). |
| `js/config-form.js:488` `parseFloat(...cfg-res-hours...)` | Raw parseFloat | **Yes** | Reads sold hours raw. |
| `js/config-form.js:667` `Math.round(budget*100)/100` (Derive) | Inline (cents) | No (phasing €) | Budget to 2 dp; harmless. |
| `js/config-form.js:668` `Math.round(hours*10)/10` (Derive) | Inline (0.1) | No (planning) | Derive rounds monthly hours to 0.1 — different grid than Reforecast's 0.25; see F2-2/F2-4. |
| `js/config-form.js:845` `Math.round(newPhasing[ym]*100)/100` | Inline (cents) | No (phasing €) | Reforecast phasing to 2 dp; harmless. |
| `js/config-form.js:860` `fmtH` (`Math.round(abs+'e1')+'e-1'`) | Inline (0.1) | No (modal text) | Reforecast modal "remaining hours" display, 0.1. |
| `js/config-form.js:1259/1286` `fmt = identity` on `res.soldHours` | Raw (identity) | **Yes** | XLS export shows sold hours raw. |
| `js/costgrid.js:507` hours `<input value="${task.hours[r.roleCode]||''}">` | Raw | **Yes** | Cost-grid sold hours shown raw; `step="0.5"` only (F2-1). |
| `js/costgrid.js:974` `task.hours[...] = val` (from parse) | Raw | **Yes** | Stores raw. |
| `js/costgrid.js:1690/1695/1709/1718/1727` `Math.round(hrs*100)/100` | Inline (cents) | **Yes (aggregate)** | Rounds SUMS of sold hours to 2 dp — float-cleanup only; sums of {int,0.25,0.4,0.75} are already ≤2 dp, so 2.4→2.4, no distortion. |
| `js/costgrid.js:1871` `fmtH = (Math.round(n*10)/10)+' h'` | Inline (0.1) | No (derived monthly dist) | Cost-grid period-distribution preview at 0.1 resolution; see F2-5. |
| `js/core.js:297` `fmtH = n.toFixed(2)+'h'` | Inline (2 dp display) | **Yes (display)** | Dashboard sold-hours KPI; 2.4→"2.40h" — format only, no rounding. |
| `js/dashboard.js:919` `fmtH(r.soldHours)` | Named (`core.fmtH`) | **Yes (display)** | Per-role sold hours, 2-dp display, no distortion. |
| `js/planning.js:714/955/1299` `portfolioRoundHours ? Math.round(v) : v.toFixed(2)` | Inline (toggle int/2dp) | No (derived monthly dist) | Resource-planning distribution, user toggle; see F2-5. |
| `js/planning.js:306/307/377/378` `Math.round(h)` | Inline (int) | No (derived weekly cap) | Weekly heatmap load, integer display. |
| `js/planning.js:862/969/1300` `rnd = Math.round(v*10)/10` | Inline (0.1) | No (derived monthly) | Planning aggregation to 0.1. |
| `api/src/routes/exports.js:348-358` `Math.round(m.hours*10)/10` | Inline (0.1) | No (derived monthly) | Portfolio CSV monthly hours at 0.1; see F2-5. |
| `api/src/routes/reporting.js:303/310` `Math.round(hours*10)/10` | Inline (0.1) | No (derived monthly) | Reporting monthly hours at 0.1; see F2-5. |
| `api/src/routes/projects.js:231` `resources` stored as raw JSONB | Raw | **Yes** | No server-side validation / no CHECK constraint (F2-1). |

No call site was found that rounds an **individual** sold-hours value on the display/storage path — every sold-hours cell is rendered and re-read raw. All rounding lives in the derived forecast fields (planning / phasing / monthly distribution) or in float-cleanup of aggregates.

### Findings

**PRD §6.1 cross-check (verified — NOT a finding):** The portfolio-summary "Budget Estimated" reads `project.phasing[YYYYMM]` (`PRD.md:221`) while the drill-down "Total Budget" reads `Σ soldHours×rate` (`PRD.md:229-230`, `dashboard.js:100-104`). These are **legitimately independent by purpose** — one is a time-phased planning distribution, the other the contractual total — and `PRD.md:236` already documents that they can disagree when `phasing` is stale. They are NOT required to coincide, so no INCONSISTENT finding here.

#### F2-1: No technical constraint restricts sold-hours entry to {integer, 0.25, 0.4, 0.75}
- **Type:** MISSING
- **Severity:** Important
- **Location:** `js/config-form.js:453`, `js/costgrid.js:507`, `api/src/routes/projects.js:231` (and cost-grid task-role persistence)
- **Evidence:** Both entry inputs are `<input type="number" ... min="0" step="0.5">`. `step="0.5"` does not even match the allowed set (0.25, 0.4, 0.75 are not multiples of 0.5), and HTML `step` validity is never enforced — values are read with `parseFloat(...)||0` (`config-form.js:488`, `costgrid.js:974`). Server stores `resources` as raw JSONB (`projects.js:231`) with no CHECK constraint. Any decimal (e.g. 2.4, 2.4137) is accepted end-to-end.
- **Description:** Nothing anywhere — client or server or DB — enforces the discrete allowed set for sold hours. This is a gap, not an active corruption (well-behaved users enter valid values), but the design invariant is unguarded.

#### F2-2: Derive-from-Task-Dates monthly hours are double-rounded; grid disagrees with its own confirmation modal
- **Type:** INCONSISTENT
- **Severity:** Important
- **Location:** `js/config-form.js:668` (Derive rounds to 0.1) → rendered by `cfgRenderPlanningGrid` → `js/config-form.js:939` (`cfgFmtHours` re-rounds to 0.25)
- **Evidence:** Concrete trace, sold hours = 2.4 on one task spread equally over 3 months (frac 1/3 each):
  - Line 668: each month `Math.round((2.4×1/3)*10)/10 = Math.round(8)/10 = 0.8`. `newPlanning = {0.8, 0.8, 0.8}`.
  - Modal (line 672/681) sums `newPlanning` → **"Total hours distributed: 2.4 h"** ✓ matches sold.
  - Grid display (line 939) `cfgFmtHours(0.8) = roundToQuarterHour(0.8) = Math.round(3.2)/4 = 3/4 = 0.75`. Grid shows **0.75 / 0.75 / 0.75**.
  - On save `cfgReadGrid` (line 973 `cfgParseHours`) reads the displayed cells → persists **0.75×3 = 2.25 h**.
  - Result: modal promised 2.4 h, the grid the user actually sees and saves sums to **2.25 h** — a −0.15 h divergence from both the modal preview and the 2.4 sold value.
  - Note (real day-overlap dates, not idealized 1/3 splits): re-traced with task 2026-01-01→03-31, sold 2.4h → Derive line 668 produces {0.8, 0.7, 0.8} (modal sum 2.3), display/save re-snaps to {0.75, 0.75, 0.75} (saved 2.25) — the modal-vs-saved divergence holds under real calendar math too, not just the idealized equal-split illustration.
- **Description:** Derive rounds to a 0.1 grid, but the planning-grid renderer immediately re-snaps every cell to 0.25 via `cfgFmtHours`, so Derive's own output is contradicted by the display and by what gets saved. Meets Derive INCONSISTENT criteria (a) aggregate diverges AND (b) modal view ≠ grid view for the same month.

#### F2-3: Reforecast future-month redistribution total drifts from the sold-hours residual
- **Type:** INCONSISTENT
- **Severity:** Minor
- **Location:** `js/config-form.js:833-835` (even split) and `:848` (per-month `roundToQuarterHour`), residual reported at `:856-860`
- **Evidence:** Concrete trace, single task, sold hours = 7.4, zero past actuals, 3 future months:
  - Line 794: `remainHrs = max(0, 7.4 − 0) = 7.4`.
  - Line 835: each future month accumulates `7.4/3 = 2.466666…`. `newPlanning = {2.46667, 2.46667, 2.46667}`.
  - Line 848: `roundToQuarterHour(2.46667) = Math.round(2.46667×4)/4 = Math.round(9.86667)/4 = 10/4 = 2.5`. Grid = {2.5, 2.5, 2.5}.
  - **Sum of redistributed months = 2.5 × 3 = 7.5 h.**
  - Original residual (shown in modal as `fmtH(7.4)` → "7.4 h") = **7.4 h**.
  - **7.5 ≠ 7.4 → cumulative drift = +0.1 h.** Sum does NOT match the residual.
- **Description:** Per-month quarter-hour rounding is intentional, but the sum of the rounded future months no longer equals the unconsumed residual it was distributing; the modal states 7.4 h while the resulting grid sums to 7.5 h. This lives in the `planning` forecast field (soldHours itself is untouched), so severity is Minor — but the total genuinely drifts.

#### F2-4: The same `planning` field is rounded to two different grids by Derive (0.1) vs Reforecast (0.25)
- **Type:** INCONSISTENT
- **Severity:** Minor
- **Location:** `js/config-form.js:668` (`Math.round(hours*10)/10`) vs `js/config-form.js:848` (`roundToQuarterHour`), both writing `newPlanning`
- **Evidence:** Derive rounds each month to 0.1; Reforecast rounds each month to 0.25; the display layer (line 939, `cfgFmtHours`) then imposes 0.25 on whatever either produced. Reforecast is internally consistent (0.25 == display 0.25); Derive is not (0.1 ≠ display 0.25, root cause of F2-2).
- **Description:** Two sibling operations that populate the same grid disagree on rounding granularity, and only one matches the display layer — drift that was never unified.

#### F2-5: Monthly-hours display resolution differs across views (0.1 vs 0.25 vs integer vs 2-dp)
- **Type:** INCONSISTENT
- **Severity:** Minor
- **Location:** `js/costgrid.js:1871` (0.1), `js/config-form.js:939` (0.25 via `cfgFmtHours`), `js/planning.js:714/955/1299` (integer or 2-dp, user toggle), `api/src/routes/exports.js:348-358` & `api/src/routes/reporting.js:303-310` (0.1)
- **Evidence:** The same underlying derived monthly-hours quantity is shown at 0.1 in the cost-grid period preview and CSV/reporting exports, at 0.25 in the project planning grid, and at integer-or-2-dp (toggle) in the resource-planning views. A monthly value of 0.7 renders "0.7" in one view, "0.75" in the planning grid, "1" or "0.70" in resource planning.
- **Description:** No single formatter governs monthly-hours display; each surface picked its own resolution. This is a display-consistency gap on derived (non-contractual) monthly figures. Recorded as Minor; it does not corrupt sold hours.

### 2.4-Hour Trace Test Results

Sold-hours value 2.4 assigned to one task/role on a proposal, inherited by the project.

| View | Value shown | Matches 2.4? | If not, why (file:line) |
|---|---|---|---|
| Proposal (pipeline.html detail) | 2.4 (`tt.totalHrs`, `pipeline-board.js:492`; total via `Math.round(hrs*100)/100`, `costgrid.js:1695`) | Yes | 2-dp aggregate cleanup only; 2.4→2.4 |
| Proposal (costgrid.html editor) | 2.4 (raw `<input value>`, `costgrid.js:507`) | Yes | Shown raw |
| Project (portfolio.html) | 2.4 (sum `soldHours`, `portfolio.js:158`; KPI `fmtH`→"2.40h", `core.js:297`) | Yes | 2-dp display, no rounding |
| Project (project-config.html) | 2.4 (raw `<input value="${r.soldHours}">`, `config-form.js:453`) | Yes | Shown raw |
| Reporting / dashboard drill-down | 2.4 (per-role `fmtH(r.soldHours)`→"2.40h", `dashboard.js:919`) | Yes | 2-dp display, no rounding |
| XLS export (project) | 2.4 (identity `fmt`, `config-form.js:1259/1286`) | Yes | Raw |
| **Planning grid AFTER Derive** (project-config.html) | **0.75-per-month cells → 2.25 total** | **No** | Derive→display double-rounding, `config-form.js:668`+`:939` (F2-2). This is the derived `planning` distribution of the 2.4, not the sold-hours cell, which still reads 2.4. |

The sold-hours cell itself is 2.4 in every direct-display view. The only place a "2.4-derived" figure changes is the **planning distribution** produced by Derive (F2-2), which is a separate forecast field.

### Reforecast Arithmetic Trace

Concrete case: one billable task, **sold hours = 7.4 h**, **zero past actuals**, **3 future months** (even-split / non-distribution path, `config-form.js:824-836`).

```
remainHrs (line 794)      = max(0, 7.4 − 0)            = 7.4
per-month accumulation    = remainHrs / 3 = 7.4 / 3    = 2.466666…  (each of 3 months)
newPlanning (pre-round)   = { 2.46667, 2.46667, 2.46667 }

per-month rounding (line 848, roundToQuarterHour):
  roundToQuarterHour(2.46667) = Math.round(2.46667 × 4) / 4
                              = Math.round(9.86667) / 4
                              = 10 / 4
                              = 2.5
newPlanning (post-round)  = { 2.5, 2.5, 2.5 }

SUM of redistributed future months = 2.5 + 2.5 + 2.5 = 7.5 h
original residual (line 856, shown "7.4 h")           = 7.4 h

7.5  ≠  7.4   →   cumulative drift = +0.1 h    (SUM does NOT match residual)
```

Conclusion: per-month quarter-hour rounding introduces real cumulative drift; the reforecast planning-grid total (7.5) exceeds the sold-hours residual it distributes (7.4) by +0.1 h. The contractual `soldHours` field is unchanged — the drift is confined to the `planning` forecast grid (F2-3). **Independently re-verified by the task reviewer**, who re-read the code directly and reproduced the same result.

### Derive-from-Task-Dates Trace

Are the day-overlap decimals passed through `cfgFmtHours`? **Yes** — Derive writes `newPlanning` (rounded to 0.1 at `config-form.js:668`) and `cfgRenderPlanningGrid` → `cfgGridHTML(type='hours')` renders every cell through `cfgFmtHours` (`config-form.js:939`), which re-snaps to 0.25.

```
Derive (line 668): each month = Math.round((2.4/3)*10)/10 = Math.round(8)/10 = 0.8
  newPlanning = { 0.8, 0.8, 0.8 }
  modal "Total hours distributed" (line 672/681) = 0.8+0.8+0.8 = 2.4 h   ✓ equals sold

Display/save (line 939): cfgFmtHours(0.8) = roundToQuarterHour(0.8)
                       = Math.round(3.2)/4 = 3/4 = 0.75
  grid shows/saves = { 0.75, 0.75, 0.75 }
  saved total = 0.75 × 3 = 2.25 h

2.25 (grid/saved)  ≠  2.4 (modal & sold)   →   divergence = −0.15 h
```

Second case (sold 7.4 over 3 equal months): line 668 → `Math.round(24.6667)/10 = 2.5` each → modal sums 7.5 (already ≠ 7.4 sold); display `cfgFmtHours(2.5)=2.50`, saved 7.5. Drift +0.1.

Conclusion: the decimals ARE routed through `cfgFmtHours`, and because Derive's 0.1-grid output is re-rounded to a 0.25 grid on display, the aggregate total the user sees/saves diverges from BOTH the sold value AND the Derive confirmation modal. This satisfies Derive INCONSISTENT criteria (a) aggregate divergence and (b) modal-view ≠ grid-view — reported as F2-2 (root cause) with F2-4 (the Derive-vs-Reforecast rounding-grid mismatch). As with Reforecast, the contractual `soldHours` values are never mutated — divergence is confined to the derived `planning` grid.

---

## Domain 3 — Hours×Rate Interaction

Scope reminder: this domain checks ONLY whether REG-07 (`cgComputeTaskTotals` / `cgComputePhaseTotals` / `cgComputeGrandTotals` in `js/costgrid.js`) and REG-11 (rate-fallback chain in `js/costgrid.js`) round mid-computation in a way that compounds with Domain 2's rounding findings. This is not a from-scratch rounding audit.

### REG-07 / REG-11 Chain Rounding Check

**`cgComputeTaskTotals` (`js/costgrid.js:1687-1696`)**
```js
function cgComputeTaskTotals(task, roles) {
  let totalHrs = 0, totalFee = 0;
  (roles || []).forEach(r => {
    const h = parseFloat(task.hours[r.roleCode]) || 0;
    totalHrs += h;
    totalFee += h * (r.rate || 0);
  });
  const ptc = parseFloat(task.ptc) || 0;
  return { totalHrs: Math.round(totalHrs * 100) / 100, totalFee, totalCostAndFee: totalFee + ptc };
}
```
- Reads `task.hours[roleCode]` **raw** via `parseFloat` — no `roundToQuarterHour`/`cfgFmtHours` call. Matches Domain 2's finding that sold hours are never rounded on this path.
- `totalHrs` is rounded with inline `Math.round(totalHrs * 100) / 100` — the same 2-decimal float-cleanup pattern Domain 2 already catalogued (`js/costgrid.js:1690/1695/1709/1718/1727`) and classified as harmless. It is **not** `roundToQuarterHour` (÷4 grid) or `cfgFmtHours` (0.25 display grid).
- `totalFee` (the rate×hours product) is **never rounded** anywhere in this function.

**`cgComputePhaseTotals` (`js/costgrid.js:1698-1710`)** and **`cgComputeGrandTotals` (`js/costgrid.js:1712-1719`)** repeat the same pattern one/two levels up: sum already-2dp-rounded `hrs`, re-apply the same 2dp float-cleanup (idempotent, no distortion); `fee` stays an exact running sum with no rounding. Sibling `cgComputeColumnTotals` (`js/costgrid.js:1721-1732`) follows the identical pattern.

**Verdict for REG-07:** No call in the chain to `roundToQuarterHour` or `cfgFmtHours`, and no inline 0.25-grid or 0.1-grid equivalent from Domain 2's inventory. The only rounding present is inline 2-decimal float cleanup on the **hours** accumulator, applied redundantly at 3-4 levels but never compounding into a visible drift, since (a) sums of {int, 0.25, 0.4, 0.75} already sum cleanly to ≤2dp, and (b) `fee` — the rate×hours product that actually reaches the budget/PTC totals shown in the editor and pipeline board — is never rounded mid-chain at all.

**Rate-fallback chain — `cgSyncRoleRatesToBaseline` (`js/costgrid.js:1349-1373`) and `cgPreviewRateChange` (`js/costgrid.js:1377-1400`)**
```js
r.rate = rcOverride != null ? rcOverride
       : roleOverride != null ? roleOverride
       : Math.round(eurRate * currencyRate * 100) / 100;
```
Both round only the last-resort EUR-conversion branch to 2 decimal cents. This produces `r.rate`, a **per-hour rate**, not an hours value — set once (on load, currency change, or role add) and then simply multiplied by raw hours. This rounding is orthogonal to Domain 2's hours-rounding functions: it never touches `task.hours[...]`, `planning`, or `phasing`.

**Verdict for REG-11:** Rounds mid-computation (2dp on the EUR→currency conversion), but only on the rate operand, not on hours, and not using any function from Domain 2's inventory. No interaction with Domain 2's rounding findings.

### Findings

No findings — the REG-07/REG-11 chains do not round mid-computation using `roundToQuarterHour`/`cfgFmtHours` or any of Domain 2's inline hours-rounding equivalents, and therefore do not compound with Domain 2's rounding/drift findings (F2-2, F2-3, F2-4). The only mid-chain rounding present (inline 2dp float-cleanup on hours, and inline 2dp cents rounding on the EUR-converted fallback rate) is a different, already-accounted-for pattern that operates on raw sold-hours inputs and exact fee sums, never on the 0.25/0.1-grid derived fields where Domain 2's drift lives. **Independently confirmed by the task reviewer**, via their own grep (zero matches for `roundToQuarterHour|cfgFmtHours` in `js/costgrid.js`) and direct code reads.

---

## Cross-Domain Synthesis

### S-1: A date-parsing ambiguity in Domain 1 sits structurally upstream of Domain 2's Reforecast month-bucketing
- **Involves:** F1-1 (timesheets.js DD/MM/YYYY assumption), F2-3 (Reforecast future-month redistribution drift)
- **Same data:** the calendar month a timesheet actual is attributed to.
- **Handled differently how:** Reforecast's "past months" logic locks a month to real actuals and treats every other month as "future" for redistribution (confirmed at `PRD.md:309,311`: "Actual timesheet hours from the loaded XLS... Past months | ... Overwritten with actual spend and hours from the XLS"). Which month an actual belongs to is determined entirely by `formatDate()` (F1-1) — and for a text-formatted cell where both day and month are ≤12, F1-1's unconditional DD/MM reading can silently place the actual in the **wrong month entirely** (e.g. a true `03/04/2026` — 4 March — is read as 3 April, a different month, not just a different day). If that ever happens, Reforecast would lock the wrong month as "past" (using an actual that was never really incurred that month) and leave the true month it belongs to untouched — compounding a Domain 1 gap into a Domain 2 calculation it wasn't designed to guard against. No evidence either domain's subagent found that this has actually happened (F1-1 explicitly notes no production corruption observed), but the two findings are not independent: a fix to F1-1 without awareness of this link could still leave Reforecast silently trusting a mis-attributed month.

No other cross-domain connections were found. Domain 3 explicitly checked for and ruled out an interaction with Domain 2 (see Domain 3's "Findings" section above — this negative result, independently confirmed by its reviewer, is itself the relevant Domain 2↔Domain 3 synthesis outcome: no connection exists there). Domain 1's F1-2 (duplicated date-parsing functions) and Domain 2's F2-4 (duplicated rounding grids) share a structural *pattern* — logic copied instead of centralized — but operate on different underlying data (dates vs. hours) and are not a "same data" case; recorded here as an observation, not a numbered synthesis entry, to keep this section limited to genuine same-data cross-domain connections per the audit's scope.

## Unresolved Scope Questions

Two columns were tagged `out of scope? — <reason>` in Domain 1's DB Column Scan, deferred for explicit resolution here rather than decided unilaterally by the subagent:

1. **`cost_grid_versions.created_at`** — rendered in the version table (`js/costgrid.js:239`, `js/pipeline-board.js` sort). **Resolution: out of scope.** It is a system-generated creation timestamp, never user-editable, and its display purpose is provenance/sorting ("when was this draft created"), not a business fact about *when the proposal runs* (that's what `start_date`/`end_date` already capture, and they are two-tier compliant). The two-tier discipline governs schedule-relevant business dates, not record-creation metadata that happens to be shown for convenience — the mere fact of UI display doesn't convert an audit timestamp into schedule data.
2. **`timesheets.uploaded_at`** — rendered as a "Last uploaded" column in `timesheets.html:79`. **Resolution: out of scope**, for the same reasoning as above: it is upload-event/operational metadata (when was this file imported), not a business date describing a proposal, project, or task's schedule. It answers "when did this data arrive," not "when does this work happen."

Both resolutions rest on the same distinguishing principle: the two-tier discipline is about dates that describe *when scheduled business work happens* (proposal/project/task timelines), not *when a database record was created or an operation occurred* — even when the latter is shown in a UI table for operational/sorting purposes.
