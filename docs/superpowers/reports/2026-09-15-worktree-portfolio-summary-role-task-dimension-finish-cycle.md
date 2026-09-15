# Finish-cycle report — worktree-portfolio-summary-role-task-dimension

**Date:** 2026-09-15
**Branch:** worktree-portfolio-summary-role-task-dimension → main

## What was done

3 commits (from a Brief → brainstorming → implementation cycle, `docs/superpowers/briefs/2026-09-15-portfolio-summary-role-task-dimension-brief.md`):

- `ca04c1f` feat: add task dimension to portfolio Summary by role/functional area
- `7dea0af` feat: precise per-(role,task) membership for functional area groups
- `0b9b53d` fix: null-guard entryMatchesRow and drop blank role rows on save

`portfolio.html`'s per-project reporting cards ("Summary by role", "Summary by functional area") previously blended hours/€ from different tasks under one column even when the same role is configured with a different `hourlyRate` per task (`task_roles.rate_override` is per (task, role), not global) — verified against the real Bayer AG "BERMITS Maintenance 2026" project, where role "HWGACCSVS - DIRECTOR" resolves to 168/h on one task and 130/h on another via `findRate()`'s task-scoped matching. "Summary by role" now keys by a composite `role|task` pair, so a role billed at two rates gets two internally-consistent columns. A first attempt applying the same task-split to "Summary by functional area" made that card collapse to nearly the same column count as "Summary by role" (losing its value as a coarser rollup) — the second commit reverted it to one column per area, with correctness instead coming from an explicit `entries: [{role, task}]` membership model per group (`task === ''` = wildcard, preserving legacy behavior with no DB migration). `project-config.html`'s "Functional Groups" form was changed from a free-text role-name textarea to per-role rows (text input + task dropdown). `buildSummaryCols`/`summaryTotals`/`normalizeGroupEntries`/`entryMatchesRow` were extracted to `js/lib/portfolio-calc.js`, vitest-covered (168 tests, up from 154 at cycle start).

## Code review follow-ups

Round 1 (`general-purpose` subagent, medium effort, scoped to `main..ca04c1f+7dea0af`): 2 Minor, both fixed in round 2 (commit `0b9b53d`):
1. `entryMatchesRow()` lacked a null-guard on `e.role` (unlike the already-guarded `role`/`task` params) — could throw on a blank-role entry. Fixed with `(e.role || '')`.
2. `project-config.html`'s new per-row Functional Groups form had no equivalent of the old textarea's blank-line filter — a user could save an entry with an empty role, which would then hit finding 1. Fixed: `onSave()` now drops entries with a blank/whitespace-only role before saving.

Round 2 (scoped re-review of the fix commit): both findings confirmed resolved, with a new regression test added for finding 1. One new Minor, non-blocking observation: the blank-role filter uses a bare `e.role.trim()` rather than the more defensive `(e.role || '').trim()` — confirmed unreachable today (every entry-creation path already guarantees a string), a style-only inconsistency, not fixed this cycle.

## Roadmap notes

- **Pre-existing gap found during manual verification, not introduced by this cycle, not fixed here:** "Summary by role"'s TOTAL row (334.75h/€39,897.00 on the Bayer test project) is lower than "Summary by task"'s TOTAL and the page's own KPI header (both 364.75h/€43,137.00). Cause: "Summary by role" only generates a column for `(role, task)` pairs that are formally configured on a task (`project_tasks.resources[]`); a timesheet actual whose role text doesn't match ANY configured resource on its task (e.g. "HWGDEV - DEVELOPER" logged against "Content Management", a task that doesn't have that role configured) gets no column at all and is silently excluded from that card's total — while "Summary by task" (which only filters by task name) and the page header (`computeKpis`, no role filtering) both include it. This is structural to how "Summary by role"'s entries have always been built (unchanged by this cycle's composite-key work), not a regression. Flagged to the user; explicitly left out of scope for this cycle.
- `planning.html`'s "By Role" view (`byRoleView()`) has the same fundamental "same role label, multiple tasks" issue as portfolio.html's pre-cycle "Summary by role" — already collects a `breakdown: [{project, task, hours}]` per week-cell, currently only surfaced via tooltip. Deferred to a separate cycle per explicit user decision during brainstorming.
- Backup taken automatically by `/finish-cycle` Gate 4 before this merge: `backups/pdash-backup-2026-09-15-144334.dump` (80K).

## Sync-docs outcome

- **CLAUDE.md** — updated: `portfolio.html`'s file-structure entry gained a new paragraph ("Summary by task/role/functional area — task-precise reconciliation (2026-09)") covering the composite-key change, the entries-based group-membership model, and the cache-bust bump; `js/lib/portfolio-calc.js`'s entry gained documentation of the four new/extracted exports (`buildSummaryCols`, `summaryTotals`, `normalizeGroupEntries`, `entryMatchesRow`), including the Vue-template-`window`-fallback landmine note for why `summaryTotals` keeps a thin wrapper method but `buildSummaryCols` doesn't; `project-config.html`'s entry gained a short pointer to the same feature plus its own form-specific details (blank-role filtering on save).
- **TEST_CASES.md** + **test-cases.html** — updated in lockstep: added R-21 through R-25 (5 new cases) to "5. Project Reporting (Portfolio)", covering the role/task split, the TOTAL-column reconciliation check, functional-area's one-column-per-area shape, the per-role task-scoping form interaction, and the blank-role-row save behavior. `test-cases.html`'s embedded script re-validated with `node -e "new Function(...)"`.
- **test-api.js** — not touched: no API changes (this cycle is entirely frontend — `portfolio.html`, `project-config.html`, `js/lib/portfolio-calc.js`).
- **PRD.md** — updated (evaluated: genuinely new/changed user-visible reporting behavior). Added new §6.3 "Summary by Task / Role / Functional Area" (previously undocumented in the PRD entirely) describing all three cards and the 2026-09 precision change; §7.1's "Functional Groups" description was expanded with the new per-role task-scoping form behavior.
- **PROCESS.md gate** — none of the three conditions applied (no process skill touched; no recurring process exception introduced; no change to the 7-phase skeleton or scenario guardrails) → `PROCESS.md` left untouched.
