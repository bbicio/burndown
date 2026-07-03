# Date / Sold-Hours / Rate Consistency Audit — Design

**Date:** 2026-07-03
**Context:** two prior audit passes on `PRD.md` (2026-07-02) already fixed doc-vs-code drift, including one finding that surfaced a genuine code-level risk: `formatDate()` (`api/src/routes/timesheets.js:193-194`) assumes DD/MM/YYYY unconditionally for text-formatted date cells, with no validation, while the source export is US-format. That finding, plus the user's own accumulated concern about rounding rules potentially applied inconsistently across Proposal/Project/Reforecast/Derive flows, motivated this audit: a **verification-only pass across three related domains — date handling, sold-hours/rounding, and hours×rate calculation — with particular attention to the same data being handled differently by different sections of the app**, verified line-by-line against the real code, not against what any document claims.

**Goal:** produce one classified, evidence-cited report (`docs/superpowers/audits/2026-07-03-date-hours-rate-consistency-audit.md`) covering all three domains plus a dedicated cross-domain synthesis section, with zero code or documentation changes made as part of this pass. Findings become the input to one or more separate, later fix-cycle specs — not resolved here.

## Decision: audit, not build — verification-only

Unlike the `finish-cycle` and PRD-access-control cycles, this is not something to construct: it is read-only investigation across an existing codebase, producing a report as the sole artifact. No `.claude/commands/`, no application code, no `PRD.md` is touched. This distinction matters because a fix applied before all contact points are mapped risks correcting one location while leaving the same inconsistency elsewhere unresolved — exactly the failure mode this audit exists to prevent.

There is no existing repo convention for a "verification-only audit with its own report" (confirmed by checking git history: neither of yesterday's PRD audits produced a standalone report file — the §15-18 pass had a spec+plan because it *built* new PRD content, and the domain-formula pass edited `PRD.md` directly with no separate artifact at all). `docs/superpowers/audits/` is therefore a new, dedicated directory — distinct from `specs/` (designs for things to build) and `reports/` (finish-cycle closeout records) — chosen because this audit is explicitly meant to outlive a single session and seed multiple future fix-cycle specs.

## Taxonomy

Every finding gets a **type** and a **severity**.

| Type | Meaning in this audit |
|---|---|
| **FICTION** | A stated design assumption (in the user's brief for this audit, or already in `PRD.md`) that the real code contradicts. |
| **MISSING** | A technical control/validation the design would require, but that was never built — no claim was ever made that it existed, and it didn't drift from anything; the safety net simply isn't there. |
| **STALE** | Logic/an assumption that was consistent elsewhere but was not carried forward consistently to a later or related point — a drift over time or across a change. |
| **INCOMPLETE** | A behavior verified only partially — covers some cases/sections but not all the relevant ones. |
| **INCONSISTENT** | The same data is handled/rounded/formatted differently depending on which section touches it — even though each point in isolation is correct for its own context. |

**Worked example (classification anchor, to keep the three domains consistent):** the XLS date parser (`timesheets.js:193-194`) assumes DD/MM/YYYY unconditionally for text-formatted cells, with no heuristic validation, while the external, non-modifiable source exports US-format dates → **MISSING** (the technical control was never built), not FICTION (nothing claims the parsing is safe) and not STALE (it never was consistent with another piece of logic it then drifted from).

**Rule for classifying "unvalidated assumption" findings**, to prevent inconsistent labeling across the three domains:
- **FICTION** requires that *something asserts* a behavior is guaranteed/validated when it is not (a comment, this audit's own stated design premise, or `PRD.md` claiming validation that isn't there).
- **STALE** requires *drift over time*: logic that was/is consistent elsewhere and wasn't updated in step at a related point.
- **MISSING** is the default for a fragile assumption that simply never had a safety net — nobody ever claimed it was validated, and it didn't drift from anything.

**Severity:** Critical / Important / Minor (same scale as code-review), independent of type — reflects practical impact (e.g. a sold-hours value silently altered = Critical; an ugly intermediate decimal with a correct final total = Minor).

Every finding: type, severity, file:line, description, concrete evidence (the command run or the code cited) — no assertion without a direct citation to the actual code, same standard as yesterday's PRD audits.

**DB-column scope rule (Domain 1, item 2):** a date/timestamp column is out of scope for the two-tier discipline **only if** it is a system/technical field — `created_at`/`updated_at`/`deleted_at` or equivalent audit-trail/soft-delete columns — **never** exposed in a user-facing view or form as business data (task/project/proposal dates). Any date/timestamp column with **any** presence in a user-facing view or form as business data must be evaluated against the two-tier discipline regardless of how "technical" its name looks. When in doubt whether a column is technical or business, the subagent does not silently exclude it: it tags it `out of scope? — <reason for doubt>` for explicit review in the final synthesis, rather than deciding unilaterally.

## Execution flow

Sequential, one subagent at a time — Domain 2 depends on understanding Domain 1's date-model findings where relevant, and Domain 3 explicitly reuses Domain 1+2 findings rather than re-auditing from scratch. Each domain's findings go to a working file, handed to the next domain as a **file path**, never pasted into a dispatch prompt.

1. **Domain 1 (DATE)** — research subagent, read-only. Output: `docs/superpowers/audits/_domain1-dates-findings.md` (temporary working file).
2. **Domain 2 (SOLD HOURS / ROUNDING)** — dispatched after Domain 1 completes; receives the Domain 1 file path as reference context, plus its own brief. Output: `_domain2-hours-findings.md`.
3. **Domain 3 (HOURS×RATE)** — dispatched after Domain 2 completes; receives both prior file paths, a shorter brief (interaction check, not a from-scratch audit). Output: `_domain3-rate-findings.md`.
4. **Final synthesis** — done by the controller (this session), not a subagent: reads all three files, assembles the single report (three full per-domain sections + the cross-domain synthesis section), writes `docs/superpowers/audits/2026-07-03-date-hours-rate-consistency-audit.md`, then deletes the three temporary working files. Reserved for the controller because finding cross-domain INCONSISTENT cases requires holding all three domains' findings in mind at once — not delegable to a subagent that only ever sees one domain's context.

**Model selection per subagent:**
- **Domain 1 → sonnet.** Primarily research/mapping (find every date column, find every parsing site) — breadth over depth.
- **Domain 2 → opus.** Not just higher priority — a genuinely different task shape: tracing a value through indirect code transformations and reasoning non-trivially about cumulative drift (does the sum of redistributed future months equal the original fractional residual?) is a reasoning-chain task, not a search task, and benefits from more reasoning capability independent of priority.
- **Domain 3 → sonnet.** Narrow, bounded interaction check against two already-known calculation chains (REG-07, REG-11) — research/verification, not novel reasoning.

## Report structure

Four sections, **additive, not substitutive**:

1. **Domain 1 — DATE**: every finding from the Domain 1 subagent, in full (including non-cross-section FICTION/MISSING/STALE/INCOMPLETE — e.g. the XLS parser stays here as MISSING even though it won't reappear in the synthesis).
2. **Domain 2 — SOLD HOURS & ROUNDING**: every finding from the Domain 2 subagent, in full (e.g. the missing input-validation gap on the {integers, 0.25, 0.4, 0.75} set stays here as MISSING even if it's isolated, not cross-section).
3. **Domain 3 — HOURS×RATE**: every finding from the Domain 3 subagent, in full.
4. **Cross-domain synthesis** (appended, additive): **only** cases where the same data is handled differently across sections/views — a targeted subset, not a summary of sections 1-3. Each entry **references** its originating finding(s) in sections 1-3 by number (e.g. "see Domain 2, finding #4") rather than duplicating them in full.

No per-domain finding is dropped or absorbed into the synthesis — the synthesis is an additional, targeted index over a specific subset (cross-section inconsistencies), not a filter that replaces the full per-domain reports.

## Domain 1 brief — DATE

1. **Full DB scan**: query the real Postgres schema directly (`docker exec pdash-db psql -U pdash -d pdash -c "\d+ <table>"` per table, or a query against `information_schema.columns` filtered to `date`/`timestamp`/`char(6)`/`char(8)`/`varchar`-with-date-like-name) — do not rely solely on migration files, since they may not reflect final state after later `ALTER`s (exactly as discovered yesterday with `project_tasks` CHAR(6)→CHAR(8) via migration 012).
2. For every column found: current type, which frontend writes/reads it, whether it follows the two-tier discipline (YYYYMM for Proposal/Project, full date for Task) — apply the DB-column scope rule above for anything that looks like it might be out of scope.
3. **Map every date import/parsing point in the app** (not just `timesheets.js`) — grep for manual date-parsing patterns (`/` splitting regexes, `Date.parse`, date libraries) across all of `api/src/` and `js/`. For each: location, assumed format, whether validation exists.
4. For the already-known case (`timesheets.js:193-194`): classify explicitly as **MISSING** (already decided by the taxonomy's worked example above); check whether any other format-validation pattern already exists elsewhere in the codebase that could serve as a reusable model for a future fix (do not propose the fix itself — only note whether a reusable model already exists).

## Domain 2 brief — SOLD HOURS & ROUNDING

Receives the Domain 1 findings file path as reference context (not to redo that work).

1. **Map every call site of `roundToQuarterHour` and `cfgFmtHours`** (`js/lib/cfg-parse.js`) across the codebase — grep both names, direct calls and via the `window.*` bridge. **Also search for inline equivalents never unified**: patterns like `Math.round(...*4)/4`, `.toFixed(2)` applied to hour values, or any hand-written rounding logic that doesn't go through the named functions. Known precedent: before being unified, the rounding at `config-form.js:848` existed as an inline expression — check whether other such un-unified inlines still exist, which a grep on the function name alone would miss. Treat every inline found with the same standard as named call sites: does it touch sold-hours fields in Proposal or Project (not just Reforecast's own fields, where rounding is correct by design)? Any call site or inline that touches sold hours is at minimum an INCONSISTENT candidate.
2. **Explicit trace test**: follow a value of 2.4 sold hours from a Proposal task, through Project (inherited), to every view that displays it — pipeline.html (detail panel), costgrid.html (editor), portfolio.html, project-config.html, reporting. For each view: is the displayed value still 2.4? If not, where and why does it change — file:line of the transformation.
3. **Input validation**: look for a technical constraint (client or server) restricting sold-hours entry to the set {integers, 0.25, 0.4, 0.75}. If none exists, **MISSING** (not necessarily to be fixed now, just documented as a gap).
4. **PRD §6.1 KPI table**: compare the source of "Total Sold Hours"/"Total Budget" (`task.resources[].soldHours`) against "Budget Estimated" (`phasing`). Determine whether they are legitimately independent by purpose or should coincide; if they should and some scenario shows them diverging, **INCONSISTENT**.
5. **Targeted Reforecast re-check** (`config-form.js:626-905`): does the sum of the redistributed future months (with per-month quarter-hour rounding) exactly equal the original residual (which may carry 0.4-fractions)? Or does the per-month rounding introduce cumulative drift? Explicit arithmetic required, not just code reading — trace one concrete numeric case (e.g. a 7.4h residual across 3 future months) through the actual logic.
6. **Targeted Derive-from-Task-Dates re-check**: the day-overlap calculation produces decimals aligned to neither {quarter-hour} nor {0.25, 0.4, 0.75}. Check whether these decimals are ever run through `cfgFmtHours` (visual rounding) in any view, or left exact everywhere. **INCONSISTENT** only if: (a) the aggregate total diverges from the original sold value, or (b) one view shows a visibly different value than another for the same month/task — not merely because the intermediate decimals are "ugly" while the sum is correct.

## Domain 3 brief — HOURS×RATE

Receives both prior findings files' paths. Not a from-scratch audit — REG-07 (`cgComputeTaskTotals`/`cgComputePhaseTotals`/`cgComputeGrandTotals`, `js/costgrid.js`) and REG-11 (rate fallback chain: ratecard override → `role.rateOverrides[currency]` → EUR × factor) are already mapped (`TEST_CASES.md:440,444`). Check only whether these calculations **interact** with Domain 2's rounding/formatting in a way that propagates the same inconsistencies — e.g. a fractional hours value (0.4) entering the rate×hours chain gets rounded at one point in the chain but not another. Expected output shorter than the prior two domains, given the narrower scope.

## Self-review checklist (for the controller, when assembling the final report)

- Every finding has type + severity + file:line + evidence citation — no bare assertions.
- The XLS-parser finding and the sold-hours-validation-gap finding both appear in their respective per-domain sections as MISSING, independent of whether they appear in the synthesis.
- The cross-domain synthesis section references originating findings by number rather than re-describing them in full.
- Any `out of scope? — <reason>` tags from Domain 1 are explicitly resolved (not silently dropped) in the synthesis or in a dedicated note.
- No code, `PRD.md`, or any file outside `docs/superpowers/audits/` and the three temporary working files is modified during this audit.
