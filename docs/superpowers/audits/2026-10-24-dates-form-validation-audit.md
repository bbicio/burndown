# Dates & Date-Form Validation Audit (manual-test findings, cycle C)

**Date:** 2026-10-24
**Scope (agreed with the user before any code was read):** verification-only. Every date a user can edit, or that an API route accepts on write — proposal/version period, project period, cost-grid task From/To, project task dates, the reporting custom range, the timesheet ingest — checked for: format validation, end ≥ start, task dates contained in the months of their proposal/project (backlog item 11), and the `cg-date-picker` bypasses (`commitTyped()` = B-030, third part). Storage/in-memory/display format conversions are mapped (backlog item 2) because a shared helper and its server twin will have to handle them; no schema change is proposed. **Out:** general form validation (item 3) and the hourly-rate input (item 5); read-only displays of server timestamps.
**Ground truth:** backlog items 1, 2, 11 (memory `project_manual_test_findings_money_cleanup`) and B-030 in `docs/BACKLOG.md`. Prior audit on the same domain: `docs/superpowers/audits/2026-07-03-date-hours-rate-consistency-audit.md` (its F1-1 is since fixed; F1-2/F1-3 are revisited in D-10/D-15).

## Method

- Grepped every `.html`/`js/`/`api/src/` file for `startDate|endDate|start_date|end_date|taskStartDate|cg-date-picker|type="date|month"` and for every date-conversion helper name, then read each write path and each control.
- Read the schema in `api/src/db/migrations/` (001, 003, 007, 012).
- Ran read-only `SELECT`s against the main stack's `pdash-db` (no container lifecycle operation) to measure existing data against each rule.
- Executed `new Date('2026-04-31')`-style checks in Node (V8, same engine as Chrome) to verify the project-config parser's behaviour.

### Field inventory

| Field | Storage | In memory | Editing control | UI end ≥ start | UI inside period | Server check |
|---|---|---|---|---|---|---|
| Proposal/version Start/End | `cost_grid_versions.start_date/end_date` `VARCHAR(6)` YYYYMM (`007_version_date_varchar.sql:4-6`) | YYYYMM | `<cg-date-picker mode="month">` `costgrid.html:139-149` | by click only (D-05, D-06) | n/a | none (D-01) |
| Cost-grid task From/To | `tasks.start_date/end_date` `VARCHAR(8)` YYYYMMDD, default `''` (`003_add_task_description_dates.sql:3-4`) | ISO `YYYY-MM-DD` (`cost-grids.js:614`) | `<cg-date-picker mode="day">` `costgrid.html:398-408` | by click only (D-05) | no (D-07) | none (D-03, D-04) |
| Project Start/End | `projects.start_date/end_date` `CHAR(6)` YYYYMM (`001_initial.sql:118-119`) | YYYYMM | native `<input type="month">` `project-config.html:83-84` | no (D-09) | n/a | none (D-02) |
| Project task dates | `project_tasks.start_date/end_date` `CHAR(8)` YYYYMMDD (`012_project_task_date_char8.sql:3-5`) | YYYYMMDD | `<input type="text" placeholder="gg/mm/aaaa">` `project-config.html:146,148` | no (D-10) | no (D-10) | none (D-03, D-04) |
| Generated project period / tasks | as the two rows above | — | none (derived in `js/costgrid.js:1256-1264`) | no (D-12) | no (D-12) | none |
| Reporting custom range | not stored | `YYYY-MM-DD` | native `<input type="date">` `portfolio.html:552-554` | no (D-13) | n/a | n/a |
| Timesheet row date | `timesheets.data` JSONB, ISO | — | XLS upload | n/a | n/a | partial (D-14) |

### Existing data (main stack, 2026-10-24)

| Rule | Violations |
|---|---|
| version end < start | 1 (`ce702b4c-…`, v1, SIP, `202609` → `202607`) |
| version/project/task bad format, project task impossible calendar day | 0 |
| version with only one side set | 0 |
| project end < start, task end < start (both kinds) | 0 |
| cost-grid task outside its version's months | 12 of 44 |
| project task outside its project's months | 9 of 28 |

The item-11 rule would therefore be violated by existing data on the first day it ships: deciding what happens to those rows is the brief's real question, as the backlog item already said.

## Findings

### D-01 — Version POST/PATCH accept any date string, in any order
- **Type:** MISSING (server) · **Severity:** High
- **Location:** `api/src/routes/cost-grids.js:391,414` (POST), `:431,436-437` (PATCH)
- **Evidence:**
  ```js
  if (startDate !== undefined)   { params.push(startDate || null);  fields.push(`start_date = $${params.length}`); }
  if (endDate !== undefined)     { params.push(endDate   || null);  fields.push(`end_date = $${params.length}`); }
  ```
- **Description:** no shape check (YYYYMM, month 01-12), no order check, and PATCH accepts one side alone, so an order check would have to read the stored sibling. A 7-character value such as `2026-05` would hit the `VARCHAR(6)` limit and surface as a 500 rather than a 400 (follows from the column type; not executed). The one inverted version in the DB shows the state is reachable. **Root cause:** the routes validate only what earlier cycles needed (label, version rule, currency lock); dates were always trusted to the client's picker.

### D-02 — Project POST/PATCH accept any date string, in any order
- **Type:** MISSING (server) · **Severity:** High
- **Location:** `api/src/routes/projects.js:156,170-171` (POST), `:239-252` (PATCH generic loop)
- **Evidence:** `startDate || null, endDate || null` go into the INSERT; PATCH maps `startDate: 'start_date', endDate: 'end_date'` and pushes `req.body[key] || null` with no check.
- **Description:** same as D-01 for `projects` (`CHAR(6)`). **Root cause:** the PATCH is a generic field-copy loop with no per-field validation; rules were added only for currency/link (`project-rules.js`).

### D-03 — Task dates are normalised by stripping, never validated (both task kinds)
- **Type:** MISSING (server) · **Severity:** High
- **Location:** `api/src/routes/cost-grids.js:718-720` (structure PUT), `api/src/routes/projects.js:408-413` (tasks PUT)
- **Evidence:**
  ```js
  const normDate = d => d ? d.replace(/-/g, '').slice(0, 8) : '';
  ```
  ```js
  t.startDate ? t.startDate.replace(/-/g, '').slice(0, 8) || null : null,
  ```
- **Description:** any string is truncated to 8 characters and stored: `15/03/2026` becomes `15/03/20`. No calendar check, no order check. The two routes repeat the same lambda inline. **Root cause:** written as a format adapter (ISO from the editor → YYYYMMDD), never as a validator; the prior audit (inventory row for `cost-grids.js` `normDate`) noted it and nothing was opened for it.

### D-04 — No server check that a task lies inside its proposal's / project's months (item 11)
- **Type:** MISSING (server) · **Severity:** High
- **Location:** same writes as D-03; plus the version/project period writes of D-01/D-02, which can move the period away from tasks already saved.
- **Evidence:** neither `PUT …/structure` nor `PUT /api/projects/:id/tasks` reads the parent period; 12 of 44 cost-grid tasks and 9 of 28 project tasks are outside it today.
- **Description:** the containment rule spans two formats (period YYYYMM, task YYYYMMDD) and two write paths per entity (task write, period write). **Root cause:** the rule never existed; item 11 is a new requirement, not a regression.

### D-05 — `cg-date-picker`'s typed path ignores `min`/`max` (B-030, third part)
- **Type:** BYPASS (UI) · **Severity:** Medium
- **Location:** `js/cg-controls.js:166-173`
- **Evidence:**
  ```js
  const parsed = this.isDay ? window.parseItDate(raw) : window.parseMonthInput(raw);
  if (parsed === null) { this.text = this.display; return; }
  this.text = this.isDay ? window.formatItDate(parsed) : window.formatMonthInput(parsed);
  if (parsed !== this.modelValue) this.$emit('update:modelValue', parsed);
  ```
- **Description:** confirmed: the typed value is checked for shape and calendar validity only; `this.min`/`this.max` are never consulted, so typing an End before Start in the header or in a task is accepted while the grid disables it. B-030's "unverified" status can be closed as **confirmed**. **Root cause:** deferred on purpose — the comment at `js/cg-controls.js:110-113` says "Validation of a hand-typed value stays with the separate 'cycle C dates' backlog item."

### D-06 — Month-mode shortcuts "This month" / "Next month" ignore `min`/`max` too
- **Type:** BYPASS (UI) · **Severity:** Medium
- **Location:** `js/cg-controls.js:185-190`, buttons in the template (`pickRelativeMonth(0)` / `(1)`)
- **Evidence:**
  ```js
  pickRelativeMonth(offset) {
    …
    this.pick(ym);
  },
  ```
  `pick(value)` (`:176-179`) emits unconditionally.
- **Description:** a second bypass, not listed in B-030: with End = 2026-03, "Next month" on Start sets a Start after End by click. **Root cause:** the shortcut buttons are not cells of `monthGridYear`, so they never received its `disabled` flag; the fidelity cycle's bound work covered the grid only.

### D-07 — Cost-grid task pickers are bounded by the sibling only, not by the proposal months; narrowing the period is unchecked
- **Type:** MISSING (UI) · **Severity:** Medium
- **Location:** `costgrid.html:398-408` (`:max="task.taskEndDate"`, `:min="task.taskStartDate"`), `costgrid.html:1446-1450` (`onPeriodChange` writes the period and autosaves)
- **Description:** the item-11 UI half. Bounds would have to combine sibling and period (`max(sibling Start, first day of Start month)`, `min(sibling End, last day of End month)`), and since the period is YYYYMM and the task bound is ISO, a conversion is needed (see D-15). Changing the period never looks at existing tasks. **Root cause:** item 11 did not exist when the fidelity cycle wired the bounds.

### D-08 — Cost-grid phasing silently drops task hours outside the proposal months, and all hours of an inverted task
- **Type:** SILENT-LOSS (UI) · **Severity:** Medium
- **Location:** `costgrid.html:1023-1040` (`phasingByMonth` → `distribute`)
- **Evidence:**
  ```js
  if (!allMonths.length) return {};
  const hpp = parseFloat(hrs) / allMonths.length;
  …
  for (const mo of allMonths) if (mo >= months[0] && mo <= months[months.length - 1]) result[mo] = …
  ```
- **Description:** hours are spread over all the task's months and only in-period months are kept, so a task half outside the period contributes half its hours; an inverted task (End month < Start month) yields an empty `allMonths` and contributes nothing. No message. This is the visible consequence of D-05/D-07. **Root cause:** the distribution clamps to the period instead of the period constraining the task.

### D-09 — Project Start/End: no order check, and an inverted period empties the phasing grid
- **Type:** MISSING (UI) · **Severity:** Medium
- **Location:** `project-config.html:83-84` (native `type="month"`, no `min`/`max`), `:496-500` (`projectMonths`), `:652-653` (`onDateChange`), `:841-858` (`onSave` validates sold hours only)
- **Evidence:**
  ```js
  onDateChange() {
    // Task 5 extends this to warn about out-of-range phasing/planning months.
  },
  ```
- **Description:** End before Start is accepted and saved (item 1). With an inverted period `projectMonths` returns `[]`, so the phasing/planning grids and the PTC month list (`:660`) are empty, with no message. **Root cause:** `onDateChange` is a stub copied from `docs/superpowers/plans/2026-07-15-project-config-vue-migration.md:255`; that plan's Task 5 built the grids but never filled the stub.

### D-10 — Project task dates: free text, Italian placeholder, impossible dates accepted, bad input silently clears the date
- **Type:** MISSING + FORMAT (UI) · **Severity:** Medium
- **Location:** `project-config.html:146,148` (inputs), `:937-949` (`ymdToIt`/`itToYmd`)
- **Evidence:**
  ```js
  const ymd = `${y}${m.padStart(2,'0')}${d.padStart(2,'0')}`;
  return isNaN(new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`).getTime()) ? '' : ymd;
  ```
  In Node/V8: `isNaN(new Date('2026-04-31'))` → `false`, `isNaN(new Date('2026-02-29'))` → `false`, `isNaN(new Date('2026-01-32'))` → `true`.
- **Description:** `31/04/2026` and `29/02/2026` are stored as `20260431` / `20260229` (V8 rolls day 29-31 over instead of rejecting it), while unparseable text returns `''` and overwrites the stored date with no message. No bounds, no order, no containment. The placeholder `gg/mm/aaaa` breaks the English-only rule. The prior audit's F1-3 statement that this round-trip "rejects calendar-invalid dates" is false for days 29-31. **Root cause:** a parser written before the strict `parseItDate` (`js/lib/cg-controls-calc.js:98`) existed, never replaced; the page does not load `cg-controls.js`, and the picker's CSS lives only in `css/costgrid.css`.

### D-11 — Project phasing derivation loses budget for task time outside the project months; hidden months still count
- **Type:** SILENT-LOSS (UI) · **Severity:** Medium
- **Location:** `js/lib/config-form-calc.js:35-44` (`deriveDistribution`), `project-config.html:504` (`phasingSum`)
- **Evidence:**
  ```js
  const tDays = Math.max(1, (tEnd - tStart) / 86400000 + 1);
  …
  const oDays = Math.max(0, (oEnd - oStart) / 86400000 + 1);
  ```
  ```js
  phasingSum() { return Object.values(this.project?.phasing || {}).reduce((s, v) => s + v, 0); },
  ```
- **Description:** only months of `projectMonths` are iterated, so a task's days outside them are dropped from the derived phasing; an inverted task gets `tDays = 1`, `oDays = 0`, i.e. zero. Conversely, after the project period is narrowed, phasing keys outside it stay stored and `phasingSum` still adds them though no grid shows them. The server's `PATCH /:id/phasing|planning|ptc` (`api/src/routes/projects.js:432-433` and siblings) store the JSON with no check of its month keys. **Root cause:** same as D-08 — the period clamps the data instead of constraining it — plus the unimplemented `onDateChange` warning of D-09.

### D-12 — Generating a project can produce an inverted period and copies out-of-period tasks
- **Type:** MISSING (UI, derived data) · **Severity:** Low
- **Location:** `js/costgrid.js:1256-1264` (period), `:1240-1241` (generate), `:1105-1106` (add tasks to an existing project)
- **Evidence:**
  ```js
  const projStart = v.startDate || (startDates.length ? toYYYYMM(startDates[0]) : null) || defaultStart;
  const projEnd   = v.endDate   || (endDates.length   ? toYYYYMM(endDates[endDates.length - 1]) : null) || defaultEnd;
  ```
- **Description:** each side picks its source independently, so a version with only Start set (e.g. `202812`) and undated tasks gets `projEnd = defaultEnd` (today + 12 months), earlier than `projStart`. Task dates are copied verbatim, and "add tasks" appends them to a project whose period is never compared. Latent today (no version has one side only), reachable because the picker allows clearing one side. **Root cause:** the fallback was designed per side; no rule ties the two results together.

### D-13 — Reporting custom range accepts To before From
- **Type:** MISSING (UI) · **Severity:** Low
- **Location:** `portfolio.html:552-554`, `:1060-1068` (`filterRange`)
- **Description:** two native `type="date"` inputs with no `min`/`max`; an inverted range silently filters everything out and the label shows the inverted span. Not persisted. **Root cause:** written as a plain filter with no validation.

### D-14 — Timesheet ingest: the ISO branch checks shape only
- **Type:** MISSING (server) · **Severity:** Low
- **Location:** `api/src/routes/timesheets.js:418`
- **Evidence:** `if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);`
- **Description:** `2026-13-45` passes, while the `dd/mm/yyyy` branch below it goes through `parseFlexibleDate` → `isValidCalendarDate` (`api/src/lib/date-parse.js:5`). The prior audit's inventory marked this "Partial"; the F1-1 fix covered the other branch only. **Root cause:** the fix was scoped to the reported branch.

### D-15 — No shared date module: conversions and parsers are re-implemented per page and per route
- **Type:** DUPLICATION · **Severity:** Medium (it is why D-03, D-10 and D-14 diverge)
- **Location / inventory:**

  | Conversion | Implementations |
  |---|---|
  | YYYYMM ↔ `YYYY-MM` | `js/core.js:162-165` (`ym2month`, `month2ym`); module-scoped copies in `project-config.html:420-427` |
  | YYYYMMDD ↔ ISO | `js/core.js:168-174` (`ymd2date`, `date2ymd`); `api/src/routes/cost-grids.js:614` (`toInputDate`), `:718` (`normDate`); `api/src/routes/projects.js:412-413` (inline); `api/src/restore-backup.js:132` (`normDate`) |
  | ISO → YYYYMM | `js/costgrid.js:1256` (`toYYYYMM`); `costgrid.html:1027-1028` (slicing) |
  | dd/mm/yyyy ↔ storage | `js/lib/cg-controls-calc.js:98` (`parseItDate`, strict) and `:118` (`parseMonthInput`); `js/costgrid.js:69-77` (`cgItToIso`, lax, still exported to `costgrid.html:1108` and used at `:1693`); `project-config.html:937-949` (`ymdToIt`/`itToYmd`, lax — D-10) |
  | parse to `Date` | `js/core.js:178-186` (`parseTaskDate`); verbatim copy `js/lib/config-form-calc.js:9-16` |
  | calendar validity (server) | `api/src/lib/date-parse.js:5` (`isValidCalendarDate`); `api/src/lib/planning-calendar.js:12-19` (`isoDate`) |
  | month enumeration of a period | `project-config.html:496-500`, `costgrid.html:1009-1018`, `js/costgrid.js:495-503`, `js/portfolio.js:10-12`, `portfolio.html:990-992,1050-1052,1399-1401` |

- **Description:** the strict client parser (`parseItDate`) and the strict server validator (`isValidCalendarDate`) already exist but are each used by one surface. **Root cause:** each cycle solved its own surface; `js/lib/` never received a date module the way money got `js/lib/money.js` + `api/src/lib/money-format.js`.

## Ruled out

- **DB formats:** every stored version/project/task date matches its declared shape, and no project task holds an impossible calendar day (queries above).
- **Planning model request:** `api/src/lib/planning-request.js:27-33` already validates ISO dates and rejects `from > to` — a precedent for the server rule, not a gap.
- **Pipeline years / POT year:** integers, validated (`api/src/routes/pipeline-years.js:54-55`, range 2000-2100) or parsed (`api/src/routes/pots.js:14,110,318`); not date ranges.
- **Timesheet `dd/mm` vs `mm/dd` ambiguity (prior F1-1):** fixed — `api/src/routes/timesheets.js:419-420` routes through `parseFlexibleDate`, which rejects impossible dates.
- **Existing inverted values in `cg-date-picker`:** render without crashing, pinned by `js/lib/cg-controls-calc.test.js:16` ("tolerates a min later than the whole year").
- **Version clone / "+ New version" server copy** (`api/src/routes/cost-grids.js:524-541`): copies dates verbatim; it can only propagate an existing violation, not create one.
- **Display-only formatters of server timestamps** (`admin.html:431`, `_terms-editor.html:219`, `timesheets.html:407`, `master-pipelines.html:1079`): outside the agreed scope.

## Out of scope / roadmap notes

- **B-030, first two parts** (four global listeners per picker, unconditional `preventDefault()` on Home/End in `js/cg-controls.js:355-356`): not date validation; still open in `docs/BACKLOG.md`.
- **Items 3 and 5** (general form validation, hourly-rate input): excluded by the agreed scope.
- **Dead code:** `cgComputePhasing` (`js/costgrid.js:494`) has no caller; `renderCgPhasing` (`js/costgrid.js:557`, called at `:407`) looks up `#cgPhasingPanel`, which `costgrid.html` no longer contains. `costgrid.html`'s `phasingByMonth` is a third copy of the same distribution.
- **`PUT /api/projects/:id/tasks`** (`api/src/routes/projects.js:402-416`) deletes then re-inserts through `query()` with no transaction: a mid-loop failure leaves the project with a partial task list.
- **Inputs for the brief (facts, not findings):** the picker's styles live only in `css/costgrid.css`, so reusing `cg-date-picker` on `project-config.html`/`portfolio.html` needs them moved to a shared stylesheet (with the `?v=N` bumps); `js/lib/money-guard.test.js` is the existing pattern for a "one implementation" guard test.

Report ready. Next step: audit-to-brief to translate the findings into fix cycles, or stop here if the audit doesn't call for immediate fixes.
