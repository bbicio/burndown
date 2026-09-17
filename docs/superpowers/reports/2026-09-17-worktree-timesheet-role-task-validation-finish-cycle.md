# Finish-cycle report — worktree-timesheet-role-task-validation

**Date:** 2026-09-17
**Branch:** worktree-timesheet-role-task-validation → main

## What was done

7 commits (approx.), summarized:
- Added `findRoleTaskInconsistencies(entries, tasksByCode)` (`api/src/routes/timesheets.js`), a pure function stricter than the existing `resolveFee()` fallback — flags any row whose task isn't configured on the project, or whose role (blank included) isn't among that task's configured resources.
- Wired a validation gate into `POST /upload`, before the `resolveFee()` loop and before any DB write: on any inconsistency, rejects the entire upload (400, all project codes, no partial writes).
- `js/api.js`'s `apiFetch()` now attaches the parsed response body to a thrown error as `err.data` (additive, verified no existing caller reads `.data`).
- `js/core.js`'s new `formatUploadInconsistencies(list)` formats the blocked-upload message (capped at 20 lines + "…and N more.").
- Wired the blocking dialog into all three real upload entry points: `project-config.html`'s own local `showConfirm()` (extended with an `infoMode` option), and `js/upload.js`'s `readXLS()`/`readXLSForProject()` (used by `planning.html`'s "📂 Load XLS" and `portfolio.html`'s "Load Actuals") via the global `showInfo()`. The third entry point (`planning.html`) was a genuine mid-implementation discovery, not assumed at the start.
- Fixed a real cache-busting bug found during manual verification: `js/api.js?v=5→6` and `js/core.js?v=3→4` had to be bumped across all 10 loading pages — the modal silently never appeared until this was caught and fixed (separate, clearly-labeled commit).
- 11 new `node:test` cases for `findRoleTaskInconsistencies`.

## Code review follow-ups

Round 1: 1 Important + 3 Minor findings, all fixed in the same cycle (project-config.html's `showConfirm` infoMode addition, a `TASKS_FIXTURE` gap for the zero-resources case, and two minor clarity/consistency fixes).
Round 2: 0 findings, explicitly re-verified line-by-line.

None remain as follow-ups.

## Roadmap notes

- `resolveFee()`'s fallback-to-first-resource leniency in `api/src/lib/rate-resolve.js` is now effectively unreachable for uploads that pass the new stricter gate — left in place as accepted dead code per an explicit Brief decision (it's still exercised by other, non-upload rate-resolution paths, e.g. `js/core.js`'s `findRate()` equivalent used in the AI/portfolio-calc code, which is a separate frontend implementation, not this backend function).

## Sync-docs outcome

- **PRD.md**: updated — §8.3 gained the new blocking role/task validation bullet; §5.2 gained the third "📂 Load XLS" entry point (Resource Planning); corrected §8.3's now-inaccurate "stores a Fee of 0" fallback description (that path is now unreachable via upload once validation passes).
- **`.claude/skills/operational-manual/SKILL.md`** (§6b triggered by the PRD.md change): updated — the inlined §8 Timesheet Upload detail-content reference now describes 3 entry points and the blocking validation step as its own numbered point; the §5 Resource Planning reference gained a cross-reference to the third entry point. This is the first real exercise of the §6b rule added in the prior audit-fix cycle — it fired correctly.
- **CLAUDE.md**: updated — `api/src/routes/timesheets.js`, `js/api.js`, `js/upload.js`, `js/core.js`, and `project-config.html`'s file-structure entries all gained notes on the new validation gate, the `.data` error attachment, and `formatUploadInconsistencies`.
- **ARCHITECTURE.md**: not touched — no new endpoint, no auth-rule change; this kind of route-internals detail already lives at the CLAUDE.md level in this repo's existing split.
- **TEST_CASES.md / test-cases.html**: updated in lockstep — TS-19 (backend all-or-nothing rejection, marked `✓ node:test`) and TS-20 (blocking dialog at all three entry points, manual).
- **test-api.js**: not evaluated as needing a change — no new API endpoint, no auth-rule change.
- **PROCESS.md gate**: none of the three conditions applied (no process-skill change, no recurring exception, no skeleton/guardrail change) — a pure Scenario-2 bounded feature cycle. PROCESS.md left untouched.
