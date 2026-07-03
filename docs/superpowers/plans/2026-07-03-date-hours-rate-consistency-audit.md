# Date / Sold-Hours / Rate Consistency Audit — Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Special note on this plan's shape:** unlike a code-build plan, Tasks 1-3 each produce one findings file by directly investigating the real codebase (grep, read files, run DB queries) — there is no code to write or unit-test. Task 4 (final synthesis) is explicitly reserved for the controller/session driving this plan, not a fresh implementer subagent, per the spec's Execution Flow section — finding cross-domain INCONSISTENT cases requires holding all three domains' findings in mind at once. If executing via subagent-driven-development, dispatch Tasks 1-3 through the normal implementer/reviewer loop (the "implementation" is the findings file; "code quality" review becomes structural-completeness review), but execute Task 4 directly in the controller session, not through a dispatched implementer.

**Goal:** Produce one classified, evidence-cited audit report (`docs/superpowers/audits/2026-07-03-date-hours-rate-consistency-audit.md`) covering date-handling, sold-hours/rounding, and hours×rate consistency across the PDash codebase, plus a cross-domain synthesis of same-data-handled-differently cases — with zero code or documentation changes made during the audit itself.

**Architecture:** Three sequential, read-only research passes (one subagent per domain, each handed the prior domains' findings as a file path), followed by a controller-assembled final report. Working files live in the git-ignored `.superpowers/sdd/` scratch directory (never committed); only the final assembled report is committed, to `docs/superpowers/audits/`.

**Tech Stack:** Markdown report only. No code changes. Verification is grep-based structural checks against each produced file (taxonomy labels present, file:line citations present) plus a controller read-through for the final assembly.

## Global Constraints

- Zero code, `PRD.md`, or any other file outside `docs/superpowers/audits/` and the `.superpowers/sdd/` scratch directory may be modified during this audit (spec: "Decision: audit, not build — verification-only").
- Every finding must carry: type (FICTION / MISSING / STALE / INCOMPLETE / INCONSISTENT), severity (Critical / Important / Minor), a file:line reference, a description, and concrete evidence (the command run or the code cited) — no bare assertions.
- Classification anchor (verbatim from spec): the XLS date parser (`timesheets.js:193-194`) is **MISSING**, not FICTION or STALE — nobody ever claimed the parsing was validated (rules out FICTION) and it never drifted from another consistent piece of logic (rules out STALE); it simply never had a safety net (MISSING is the default for that shape of gap).
- DB-column scope rule (verbatim from spec): a date/timestamp column is out of scope for the two-tier discipline **only if** it is a system/technical field (`created_at`/`updated_at`/`deleted_at` or equivalent audit-trail/soft-delete columns) **never** exposed in a user-facing view or form as business data. Any column with *any* business-data UI presence must be evaluated regardless of its name. When in doubt, tag `out of scope? — <reason>` instead of silently excluding.
- Report structure is **four sections, additive, not substitutive**: full Domain 1 findings, full Domain 2 findings, full Domain 3 findings, then a cross-domain synthesis section that references (not duplicates) findings by number. No per-domain finding is dropped for not being cross-domain.
- Model assignment: Domain 1 subagent → `sonnet`. Domain 2 subagent → `opus`. Domain 3 subagent → `sonnet`. (Domain 2 requires tracing a value through indirect transformations and reasoning about cumulative arithmetic drift — a reasoning-chain task, not a search task.)

---

### Task 1: Domain 1 — DATE audit

**Files:**
- Create: `.superpowers/sdd/domain1-dates-findings.md` (scratch, not committed)

**Interfaces:**
- Consumes: nothing
- Produces: `.superpowers/sdd/domain1-dates-findings.md`, a findings file whose path is handed to Task 2 and Task 4 as-is (no transformation)

- [ ] **Step 1: Dispatch the Domain 1 research subagent**

Dispatch a subagent (model: `sonnet`) with this complete prompt:

```
You are conducting Domain 1 of a three-domain, read-only consistency audit of the PDash codebase (repo root: C:\Users\fafortini\Progetti\burndown). This domain covers DATE HANDLING. You will not modify any file — this is pure investigation, output goes to one report file.

## Confirmed design (do not re-litigate, only verify consistent application)

- Proposal (`cost_grid_versions`) and Project (`projects`) dates: month-year format (YYYYMM) — correct by design; resource planning depends on TASK dates, not these.
- Task (`tasks`, `project_tasks`) dates: full date — correct by design.

## Your job

1. **Full DB scan.** Query the real Postgres schema directly — run `docker exec pdash-db psql -U pdash -d pdash -c "\d+ <table>"` for every table, or query `information_schema.columns` filtered to `date`/`timestamp`/`char(6)`/`char(8)`/date-like `varchar` names. Do NOT rely solely on migration files — they may not reflect final state after later ALTERs (precedent: `project_tasks.start_date`/`end_date` went CHAR(6)→CHAR(8) via a migration numbered `012_project_task_date_char8.sql`, found only by reading migrations in full, not by trusting the initial schema file).

2. For every date/timestamp column found: report its current type, which frontend file writes/reads it, and whether it follows the two-tier discipline (YYYYMM for Proposal/Project-level dates, full date for Task-level dates).

   **Scope rule for this step:** a column is out of scope for the two-tier discipline ONLY IF it is a system/technical field (`created_at`/`updated_at`/`deleted_at` or equivalent audit-trail/soft-delete column) NEVER exposed in a user-facing view or form as business data. Any date/timestamp column with ANY presence in a user-facing view or form as business data (task/project/proposal dates) must be evaluated against the two-tier discipline even if its name looks technical. If you are unsure whether a column is technical or business, do NOT exclude it silently — tag it `out of scope? — <reason for doubt>` in your report instead of deciding unilaterally.

   Any column that is in scope and does NOT follow the two-tier discipline, with no clear design reason, is an **INCONSISTENT** finding.

3. **Map every date import/parsing point in the app**, not just the already-known one. Grep for manual date-parsing patterns — regex splits on `/`, `Date.parse`, date-library usage — across all of `api/src/` and `js/`. For each one found: file:line, what format it assumes, whether any validation exists around it.

4. For the already-known case, `api/src/routes/timesheets.js:193-194` (`formatDate()`, which assumes DD/MM/YYYY unconditionally for text-formatted date cells with no validation, while the real external source — not modifiable — exports US-format MM/DD/YYYY dates): classify it explicitly as **MISSING**, severity **Important** (no production data has been corrupted so far per prior verification — this is a fragile assumption without a safety net, not an active bug). Then check: does any OTHER date-format-validation pattern already exist elsewhere in this codebase that could serve as a reusable model for a future fix? Report what you find either way — do not propose a fix yourself, only note whether a reusable model already exists.

## Classification taxonomy (use exactly these five types)

- **FICTION** — a stated design assumption that the real code contradicts.
- **MISSING** — a technical control/validation that was never built; nobody claimed it existed, and it didn't drift from anything.
- **STALE** — logic/an assumption consistent elsewhere that wasn't carried forward consistently to a later/related point (drift over time or across a change).
- **INCOMPLETE** — a behavior verified only partially; covers some cases/sections but not all relevant ones.
- **INCONSISTENT** — the same data handled/formatted differently depending on which section touches it, even though each point in isolation is correct for its own context.

Also assign each finding a severity: Critical / Important / Minor (practical impact, independent of type).

## Output format

Write your complete findings to `C:\Users\fafortini\Progetti\burndown\.superpowers\sdd\domain1-dates-findings.md` with this structure:

```markdown
# Domain 1 — Date Handling: Findings

## DB Column Scan

| Table.Column | Type | Written/read by | Two-tier compliant? | Notes |
|---|---|---|---|---|
| ... | ... | ... | Yes/No/Out of scope/Out of scope? | ... |

## Findings

### F1-1: <short title>
- **Type:** FICTION | MISSING | STALE | INCOMPLETE | INCONSISTENT
- **Severity:** Critical | Important | Minor
- **Location:** `file:line`
- **Evidence:** <exact command run and its output, or exact code quoted>
- **Description:** <what's wrong, in 1-3 sentences>

### F1-2: ...
(continue numbering F1-N for every finding, including the timesheets.js MISSING finding from step 4 above)

## Date Import/Parsing Points Inventory

| Location | Assumed format | Validation present? |
|---|---|---|
| `api/src/routes/timesheets.js:193-194` | DD/MM/YYYY (unconditional) | No |
| ... | ... | ... |

## Reusable Validation Model?

<Yes, with file:line pointer to the model — or No, none found, with what you checked>
```

Number every finding sequentially (F1-1, F1-2, ...). Do not modify any file in the repo — this is read-only investigation.

Report back with ONLY:
- **Status:** DONE | BLOCKED | NEEDS_CONTEXT
- Number of findings by type (e.g. "3 INCONSISTENT, 2 MISSING, 1 STALE")
- The report file path
```

- [ ] **Step 2: Verify the findings file has the required structure**

Run: `grep -n "^# Domain 1\|^## DB Column Scan\|^## Findings\|^## Date Import/Parsing Points Inventory\|^## Reusable Validation Model" .superpowers/sdd/domain1-dates-findings.md`
Expected: all five headings present, in that order.

- [ ] **Step 3: Verify every finding has type, severity, and location**

Run: `grep -c "^- \*\*Type:\*\*" .superpowers/sdd/domain1-dates-findings.md` and `grep -c "^- \*\*Severity:\*\*" .superpowers/sdd/domain1-dates-findings.md` and `grep -c "^- \*\*Location:\*\*" .superpowers/sdd/domain1-dates-findings.md`
Expected: all three counts equal (one triple per finding) and greater than 0.

- [ ] **Step 4: Verify the known timesheets.js finding is classified correctly**

Run: `grep -B3 "timesheets.js:193" .superpowers/sdd/domain1-dates-findings.md`
Expected: the surrounding finding block shows `**Type:** MISSING` (not FICTION or STALE) — this is the classification anchor from the spec; if it's classified differently, this task fails review and must be corrected before proceeding.

No commit for this task — the findings file is scratch, kept only in `.superpowers/sdd/` (git-ignored) for Task 2 and Task 4 to consume.

---

### Task 2: Domain 2 — SOLD HOURS & ROUNDING audit

**Files:**
- Create: `.superpowers/sdd/domain2-hours-findings.md` (scratch, not committed)

**Interfaces:**
- Consumes: `.superpowers/sdd/domain1-dates-findings.md` (path only, handed as reference context — Domain 2 does not redo Domain 1's work)
- Produces: `.superpowers/sdd/domain2-hours-findings.md`, handed to Task 3 and Task 4 as-is

- [ ] **Step 1: Dispatch the Domain 2 research subagent**

Dispatch a subagent (model: `opus`) with this complete prompt:

```
You are conducting Domain 2 of a three-domain, read-only consistency audit of the PDash codebase (repo root: C:\Users\fafortini\Progetti\burndown). This domain covers SOLD HOURS AND ROUNDING across Proposal → Project → Reforecast → Derive-from-Task-Dates. You will not modify any file — this is pure investigation, output goes to one report file.

For reference only (do not redo this work), Domain 1's date-handling findings are at: C:\Users\fafortini\Progetti\burndown\.superpowers\sdd\domain1-dates-findings.md

## Confirmed design (do not re-litigate, only verify consistent application)

- Sold hours (task × role × hourly rate) are integers, or fractional according to the EXACT discrete set {0, 0.25, 0.4, 0.75} — no other fractional value is allowed.
- This data must NEVER be rounded, neither on input nor in any view, along the entire path: Proposal (pipeline.html, costgrid.html) → Project, automatically inherited (portfolio.html, project-config.html).
- Reforecast is correct by design: it locks past months to real actuals (making estimated/executed coincide), redistributes the unconsumed residual across future months, where quarter-hour/cent rounding (`config-form.js:848`, `cfgFmtHours`) is INTENTIONAL, not a bug — for the per-month value, not necessarily for the total (this is exactly what you must verify).

## Your job

1. **Map every call site of `roundToQuarterHour` and `cfgFmtHours`** (defined in `js/lib/cfg-parse.js`) across the entire codebase — grep both names, both direct calls and via the `window.roundToQuarterHour`/`window.cfgFmtHours` bridge. ALSO search for inline equivalents that were never unified into these named functions: patterns like `Math.round(...*4)/4`, `.toFixed(2)` applied to hour values, or any hand-written rounding logic bypassing the named functions. Known precedent: before being unified, the rounding at `config-form.js:848` existed as an inline expression — check whether other such un-unified inlines still exist elsewhere, which a grep on the function names alone would miss.

   For EVERY call site or inline expression found (named or inline): does it touch (even indirectly — e.g. through an intermediate function that receives `task.resources[].soldHours` as a parameter and passes it along) sold-hours fields in Proposal or Project, as opposed to only Reforecast's own fields where rounding is correct by design? Any call site or inline that touches sold hours is at minimum an **INCONSISTENT** candidate — rounding applied where the design says "never."

2. **Explicit trace test.** Pick or construct a sold-hours value of 2.4 on a Proposal task. Trace it through: Project (inherited), then every view that displays it — pipeline.html (detail panel), costgrid.html (editor), portfolio.html, project-config.html, and any reporting view. For each view: is the displayed value still 2.4? If it changes anywhere, report exactly where (file:line) and why.

3. **Input validation check.** Search for a technical constraint (client-side or server-side) that restricts sold-hours entry to the set {integers, 0.25, 0.4, 0.75}. If none exists anywhere, this is a **MISSING** finding (not necessarily to be fixed now — just document the gap with severity assessment).

4. **PRD §6.1 KPI table cross-check.** Compare the source of "Total Sold Hours" / "Total Budget" (reads `task.resources[].soldHours`) against "Budget Estimated" (reads the `phasing` field). Determine: are these two legitimately independent by purpose, or should they coincide? If they should coincide and you find or can construct a scenario where they diverge, report as **INCONSISTENT**.

5. **Targeted Reforecast re-check** (`config-form.js:626-905`). Does the SUM of the redistributed future months (each individually rounded to the nearest quarter-hour) exactly equal the original unconsumed residual — which may itself carry a 0.4-type fraction? Or does per-month rounding introduce cumulative drift so the final total no longer matches the original sold value? This requires explicit arithmetic, not just code reading: trace ONE concrete numeric case (e.g. a 7.4-hour residual redistributed across 3 future months) through the actual redistribution logic in the code, computing the real per-month values the code would produce, and sum them. Report the exact numbers.

6. **Targeted Derive-from-Task-Dates re-check.** The day-overlap calculation (`overlapDays / taskTotalDays` fraction of a task's total falling in each month) produces decimals that are generally aligned to neither the quarter-hour grid nor the {0.25, 0.4, 0.75} set. Check whether these decimals are ever passed through `cfgFmtHours` (visual rounding) in any view, or left as exact decimals everywhere they're displayed. Classify as **INCONSISTENT** ONLY if: (a) the aggregate total across all months diverges from the original sold value, OR (b) one view shows a visibly different value than another view for the same month/task. Do NOT classify as INCONSISTENT merely because intermediate decimals look "ugly" while the total is correct — that is not a finding, note it as an observation instead if you want to record it.

## Classification taxonomy (use exactly these five types)

- **FICTION** — a stated design assumption that the real code contradicts.
- **MISSING** — a technical control/validation that was never built; nobody claimed it existed, and it didn't drift from anything.
- **STALE** — logic/an assumption consistent elsewhere that wasn't carried forward consistently to a later/related point (drift over time or across a change).
- **INCOMPLETE** — a behavior verified only partially; covers some cases/sections but not all relevant ones.
- **INCONSISTENT** — the same data handled/formatted differently depending on which section touches it, even though each point in isolation is correct for its own context.

Also assign each finding a severity: Critical / Important / Minor.

## Output format

Write your complete findings to `C:\Users\fafortini\Progetti\burndown\.superpowers\sdd\domain2-hours-findings.md` with this structure:

```markdown
# Domain 2 — Sold Hours & Rounding: Findings

## Rounding Function Call-Site Inventory

| Location | Named or inline | Touches sold hours? | Notes |
|---|---|---|---|
| ... | ... | Yes/No | ... |

## Findings

### F2-1: <short title>
- **Type:** FICTION | MISSING | STALE | INCOMPLETE | INCONSISTENT
- **Severity:** Critical | Important | Minor
- **Location:** `file:line`
- **Evidence:** <exact command run and its output, or exact code quoted, or the numeric trace for arithmetic findings>
- **Description:** <what's wrong, in 1-3 sentences>

### F2-2: ...
(continue numbering F2-N for every finding)

## 2.4-Hour Trace Test Results

| View | Value shown | Matches 2.4? | If not, why (file:line) |
|---|---|---|---|
| Proposal (pipeline.html detail) | ... | Yes/No | ... |
| Proposal (costgrid.html editor) | ... | Yes/No | ... |
| Project (portfolio.html) | ... | Yes/No | ... |
| Project (project-config.html) | ... | Yes/No | ... |
| Reporting | ... | Yes/No | ... |

## Reforecast Arithmetic Trace

<Show the concrete numeric case you traced: original residual, per-month redistributed values as the actual code would compute them, sum of redistributed values, and whether sum == original residual>

## Derive-from-Task-Dates Trace

<Show whether decimals are formatted via cfgFmtHours anywhere, and the aggregate-total check>
```

Number every finding sequentially (F2-1, F2-2, ...). Do not modify any file in the repo — this is read-only investigation.

Report back with ONLY:
- **Status:** DONE | BLOCKED | NEEDS_CONTEXT
- Number of findings by type
- Whether the Reforecast sum matched the original residual (yes/no + the numbers)
- The report file path
```

- [ ] **Step 2: Verify the findings file has the required structure**

Run: `grep -n "^# Domain 2\|^## Rounding Function Call-Site Inventory\|^## Findings\|^## 2.4-Hour Trace Test Results\|^## Reforecast Arithmetic Trace\|^## Derive-from-Task-Dates Trace" .superpowers/sdd/domain2-hours-findings.md`
Expected: all six headings present, in that order.

- [ ] **Step 3: Verify every finding has type, severity, and location**

Run: `grep -c "^- \*\*Type:\*\*" .superpowers/sdd/domain2-hours-findings.md` and `grep -c "^- \*\*Severity:\*\*" .superpowers/sdd/domain2-hours-findings.md` and `grep -c "^- \*\*Location:\*\*" .superpowers/sdd/domain2-hours-findings.md`
Expected: all three counts equal and greater than 0.

- [ ] **Step 4: Verify the Reforecast arithmetic trace contains actual numbers, not a description**

Run: `grep -A5 "^## Reforecast Arithmetic Trace" .superpowers/sdd/domain2-hours-findings.md`
Expected: output contains at least one numeric value (a digit) in the lines following the heading — confirms an actual arithmetic trace was performed, not a prose-only summary. If this fails, the task is not done — re-dispatch with an explicit reminder to show the real numbers.

No commit for this task — scratch file only.

---

### Task 3: Domain 3 — HOURS×RATE interaction audit

**Files:**
- Create: `.superpowers/sdd/domain3-rate-findings.md` (scratch, not committed)

**Interfaces:**
- Consumes: `.superpowers/sdd/domain1-dates-findings.md` and `.superpowers/sdd/domain2-hours-findings.md` (paths only, reference context)
- Produces: `.superpowers/sdd/domain3-rate-findings.md`, handed to Task 4

- [ ] **Step 1: Dispatch the Domain 3 research subagent**

Dispatch a subagent (model: `sonnet`) with this complete prompt:

```
You are conducting Domain 3 of a three-domain, read-only consistency audit of the PDash codebase (repo root: C:\Users\fafortini\Progetti\burndown). This domain covers HOURS×RATE calculation, specifically whether it interacts with Domain 2's rounding findings. You will not modify any file — this is pure investigation, output goes to one report file.

For reference only, read:
- Domain 1's date-handling findings: C:\Users\fafortini\Progetti\burndown\.superpowers\sdd\domain1-dates-findings.md
- Domain 2's sold-hours/rounding findings: C:\Users\fafortini\Progetti\burndown\.superpowers\sdd\domain2-hours-findings.md

## Scope

This is NOT a from-scratch audit. Two calculation chains are already mapped in this project's test suite:
- **REG-07**: budget calc (`cgComputeTaskTotals` / `cgComputePhaseTotals` / `cgComputeGrandTotals` in `js/costgrid.js`) — Σ days × rate + PTC.
- **REG-11**: rate fallback chain (ratecard override → `role.rateOverrides[currency]` → EUR rate × factor) in `js/costgrid.js`.

Your ONLY job: check whether these two calculation chains INTERACT with Domain 2's rounding/formatting findings in a way that propagates the same kind of cross-section inconsistency — specifically, does a fractional sold-hours value (particularly 0.4, which is not a quarter-hour multiple) enter the rate×hours chain and get rounded at one point in the chain (e.g. `cgComputeTaskTotals`) but not at another point in the same chain (e.g. a display/export path reading the same underlying total)?

Read `js/costgrid.js`'s `cgComputeTaskTotals`, `cgComputePhaseTotals`, `cgComputeGrandTotals`, and the rate-fallback chain functions directly. For each, check: does it call `roundToQuarterHour` or `cfgFmtHours` (or any of the inline equivalents Domain 2 found — check Domain 2's Rounding Function Call-Site Inventory table) anywhere in the computation, versus leaving values exact until a final display-only formatting step? If a value is rounded mid-computation (not just at final display), and that rounded intermediate value then feeds into a further calculation (not just a label), that is a genuine **INCONSISTENT** or **STALE** finding depending on cause — classify using the same taxonomy as Domains 1-2.

## Classification taxonomy (use exactly these five types)

- **FICTION** — a stated design assumption that the real code contradicts.
- **MISSING** — a technical control/validation that was never built.
- **STALE** — logic/an assumption consistent elsewhere that wasn't carried forward consistently.
- **INCOMPLETE** — a behavior verified only partially.
- **INCONSISTENT** — the same data handled differently depending on which section touches it.

Also assign each finding a severity: Critical / Important / Minor.

## Output format

Write your complete findings to `C:\Users\fafortini\Progetti\burndown\.superpowers\sdd\domain3-rate-findings.md` with this structure:

```markdown
# Domain 3 — Hours×Rate Interaction: Findings

## REG-07 / REG-11 Chain Rounding Check

<For each of cgComputeTaskTotals, cgComputePhaseTotals, cgComputeGrandTotals, and the rate-fallback chain: does it round mid-computation? file:line evidence either way.>

## Findings

### F3-1: <short title>
- **Type:** FICTION | MISSING | STALE | INCOMPLETE | INCONSISTENT
- **Severity:** Critical | Important | Minor
- **Location:** `file:line`
- **Evidence:** <exact code quoted>
- **Description:** <what's wrong, in 1-3 sentences>

(continue numbering F3-N for every finding; if none are found, write "No findings — the REG-07/REG-11 chains do not round mid-computation" under this heading instead of a numbered list)
```

If you find zero findings, that is a valid and expected outcome given the narrow scope — do not manufacture a finding to fill the section.

Report back with ONLY:
- **Status:** DONE | BLOCKED | NEEDS_CONTEXT
- Number of findings by type (or "0 findings" if none)
- The report file path
```

- [ ] **Step 2: Verify the findings file has the required structure**

Run: `grep -n "^# Domain 3\|^## REG-07 / REG-11 Chain Rounding Check\|^## Findings" .superpowers/sdd/domain3-rate-findings.md`
Expected: all three headings present, in that order.

- [ ] **Step 3: Verify findings (if any) have type, severity, and location**

Run: `grep -c "^- \*\*Type:\*\*" .superpowers/sdd/domain3-rate-findings.md`
Expected: either 0 (with the file containing the literal "No findings" sentence — check with `grep -n "No findings" .superpowers/sdd/domain3-rate-findings.md`) or a count matching the number of `### F3-N` headings.

No commit for this task — scratch file only.

---

### Task 4: Final report assembly (controller-executed, not a dispatched subagent)

**Files:**
- Read: `.superpowers/sdd/domain1-dates-findings.md`, `.superpowers/sdd/domain2-hours-findings.md`, `.superpowers/sdd/domain3-rate-findings.md`
- Create: `docs/superpowers/audits/2026-07-03-date-hours-rate-consistency-audit.md`
- Delete: the three scratch files above, after the report is committed

**Interfaces:**
- Consumes: all three prior tasks' findings files, in full (this task reads their content, not just their paths — this is the one place in the plan where full content synthesis is required)
- Produces: the final committed audit report; nothing downstream in this plan consumes it

**Do this task directly in the controller session — do not dispatch it to a fresh implementer subagent.** Per the spec, finding cross-domain INCONSISTENT cases requires holding all three domains' findings in mind simultaneously; a fresh subagent seeing only this task's brief would have to re-read all three files from scratch anyway, so there is no context-isolation benefit, and the controller is explicitly named as the executor in the spec's Execution Flow.

- [ ] **Step 1: Read all three findings files**

Read `.superpowers/sdd/domain1-dates-findings.md`, `.superpowers/sdd/domain2-hours-findings.md`, and `.superpowers/sdd/domain3-rate-findings.md` in full.

- [ ] **Step 2: Identify cross-domain synthesis candidates**

Look specifically for connections BETWEEN the three files — not a summary of each file individually. Concretely: does any Domain 1 finding about a date/timestamp column feed into a Domain 2 finding about how a value derived from that column is rounded or displayed differently? Does any Domain 2 INCONSISTENT finding about sold-hours rounding also appear, differently, in a Domain 3 finding about the rate×hours chain? List every such connection as a synthesis candidate, each one naming the specific originating finding numbers (e.g. "F1-3 + F2-7") it connects.

- [ ] **Step 3: Write the assembled report**

Create `docs/superpowers/audits/2026-07-03-date-hours-rate-consistency-audit.md` with this structure:

```markdown
# Date / Sold-Hours / Rate Consistency Audit

**Date:** 2026-07-03
**Scope:** verification-only — date handling, sold-hours/rounding discipline, and hours×rate calculation, checked for consistency across all sections of the PDash application. No code or documentation was modified as part of this audit. See `docs/superpowers/specs/2026-07-03-date-hours-rate-consistency-audit-design.md` for the full design and taxonomy definitions.

## Domain 1 — Date Handling

<paste the full content of domain1-dates-findings.md's "DB Column Scan", "Findings", "Date Import/Parsing Points Inventory", and "Reusable Validation Model?" sections here, verbatim>

## Domain 2 — Sold Hours & Rounding

<paste the full content of domain2-hours-findings.md's "Rounding Function Call-Site Inventory", "Findings", "2.4-Hour Trace Test Results", "Reforecast Arithmetic Trace", and "Derive-from-Task-Dates Trace" sections here, verbatim>

## Domain 3 — Hours×Rate Interaction

<paste the full content of domain3-rate-findings.md's "REG-07 / REG-11 Chain Rounding Check" and "Findings" sections here, verbatim>

## Cross-Domain Synthesis

<For each synthesis candidate identified in Step 2, one entry:>

### S-1: <short title>
- **Involves:** <finding numbers, e.g. F1-3, F2-7>
- **Same data:** <name the specific data — e.g. "task.startDate for task X"; or "sold hours value for role Y on task Z">
- **Handled differently how:** <concrete description of the divergence between the sections/views involved>

(continue S-2, S-3, ... for every synthesis candidate; if none are found beyond what's already listed as INCONSISTENT within a single domain, state that explicitly: "No connections found beyond the within-domain INCONSISTENT findings already listed above.")

## Unresolved Scope Questions

<List every "out of scope? — <reason>" tag from Domain 1's DB Column Scan here, with your own explicit resolution (in-scope / out-of-scope / needs a follow-up decision) — do not leave any unresolved.>
```

- [ ] **Step 4: Verify the report structure**

Run: `grep -n "^# Date / Sold-Hours / Rate Consistency Audit\|^## Domain 1\|^## Domain 2\|^## Domain 3\|^## Cross-Domain Synthesis\|^## Unresolved Scope Questions" docs/superpowers/audits/2026-07-03-date-hours-rate-consistency-audit.md`
Expected: all six headings present, in that order.

- [ ] **Step 5: Verify no per-domain findings were dropped**

Run: `grep -c "^### F1-" docs/superpowers/audits/2026-07-03-date-hours-rate-consistency-audit.md` and compare against `grep -c "^### F1-" .superpowers/sdd/domain1-dates-findings.md` — the counts must match. Repeat for `F2-` and `F3-`.
Expected: all three pairs of counts are equal — confirms the "additive, not substitutive" report structure requirement from the spec was honored.

- [ ] **Step 6: Verify no unresolved scope tags remain silently dropped**

Run: `grep -c "out of scope?" .superpowers/sdd/domain1-dates-findings.md` and `grep -c "out of scope?" docs/superpowers/audits/2026-07-03-date-hours-rate-consistency-audit.md` (search the whole report, including the "Unresolved Scope Questions" section).
Expected: every occurrence in the source file has a corresponding resolution entry in the report's "Unresolved Scope Questions" section — if the source count is N, the report's "Unresolved Scope Questions" section must have N entries (one per tag), each with an explicit resolution.

- [ ] **Step 7: Commit the report**

```bash
git add docs/superpowers/audits/2026-07-03-date-hours-rate-consistency-audit.md
git commit -m "docs: add date/hours/rate consistency audit report

Verification-only audit across date handling, sold-hours rounding,
and hours×rate calculation. No code or PRD changes — findings feed
separate future fix-cycle specs."
```

- [ ] **Step 8: Delete the scratch findings files**

```bash
rm .superpowers/sdd/domain1-dates-findings.md .superpowers/sdd/domain2-hours-findings.md .superpowers/sdd/domain3-rate-findings.md
```

These were never tracked by git (`.superpowers/sdd/` is self-ignoring per the `sdd-workspace` script), so this is a plain filesystem cleanup, not a git operation.

---

## Self-Review Notes (completed by the plan author, not a task step)

**Spec coverage:** Domain 1 brief (Task 1), Domain 2 brief (Task 2), Domain 3 brief (Task 3), report structure with additive four sections (Task 4), the classification anchor for the timesheets.js finding (enforced in Task 1 Step 4's verification), the DB-column scope rule (embedded verbatim in Task 1's dispatch prompt), model assignments (sonnet/opus/sonnet, stated in each task's dispatch step) — every element of the spec has a corresponding task or verification step.

**Placeholder scan:** no TBD/TODO; every dispatch prompt is complete and self-contained; the report template in Task 4 uses `<paste ... verbatim>` placeholders that are explicitly instructions to copy real content from the scratch files being read in that same task, not unresolved plan content.

**Type/reference consistency:** finding ID prefixes (F1-, F2-, F3-) are introduced in each domain's own task and consumed identically in Task 4's verification steps (Step 5's grep counts). The scratch file paths (`domain1-dates-findings.md` etc.) are defined in Task 1-3's own "Files" blocks and consumed identically in Task 4's "Files: Read" block and Step 1.
