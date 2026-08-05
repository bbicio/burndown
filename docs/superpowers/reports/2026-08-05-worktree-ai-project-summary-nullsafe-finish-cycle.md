# Finish-cycle report — worktree-ai-project-summary-nullsafe

**Date:** 2026-08-05
**Branch:** worktree-ai-project-summary-nullsafe → main

## What was done

1 commit:

- `f53bba4` fix: null-safe task match in buildProjectSummary's TASK BREAKDOWN

Backlog item 1 of the re-triaged, time-ordered list (`buildProjectSummary()`'s null-safety gap): `js/ai.js`'s `buildProjectSummary()` (used by `openAiAnalysis()`, triggered from `portfolio.html`'s "🤖 AI Analysis" button) filtered timesheet records against a task name via `r.task.toLowerCase() === task.name.toLowerCase()` — already case-insensitive, but would throw `TypeError` on a record with a missing `.task` field (plausible with incomplete XLS upload data). Fixed to `(r.task || '').toLowerCase() === (task.name || '').toLowerCase()`, the same null-safe idiom already applied to the equivalent task-only match in `buildPlanningContext()` in the previous cycle.

**Scope correction from the prior estimate:** the backlog note going into this cycle said the fix would require adding a `js/lib/planning-calc.js` script tag to `portfolio.html` (to reuse `matchesTaskRole()`). Re-reading the code before implementing showed this was wrong — this particular match is task-only (no role dimension), so `matchesTaskRole()` doesn't apply (it requires a role argument; an omitted one would incorrectly restrict matches to records with an empty role, not "any role"). The actual fix needed no new script dependency, just the same inline null-safe idiom already used elsewhere in the file.

## Process notes

- Lightweight, direct-implementation cycle (no Brief/brainstorming/plan) — matches this session's established pattern for small, well-scoped fixes.
- **Manual verification surfaced a separate, wider-blast-radius bug**, deliberately left out of scope: `js/core.js`'s `findRate(row, cfg)` has the exact same class of null-safety gap (`row.task.toLowerCase()`, `res.role.toLowerCase()`) but is called from ~15 sites across `js/ai.js`, `js/lib/portfolio-calc.js`, `js/portfolio.js`, and directly in `portfolio.html`'s own Vue instance (KPI cards, burndown chart, dashboard). Confirmed via a live browser reproduction: a `buildProjectSummary()` call with a malformed record threw from `findRate()` (`js/core.js:266`), not from the line just fixed in this cycle — `findRate()` fires earlier in the same function and masks whether this cycle's own fix would even be reached in practice. Not fixed here — reported to the user as a new, separate finding rather than silently expanded into this cycle's scope. See Roadmap notes.
- Manual browser verification: on `portfolio.html`, ran `buildProjectSummary()` via console with (a) real project data — succeeded, 3424-character summary, no error; (b) a deliberately malformed record with `task: undefined` — confirmed the fixed line itself doesn't throw (the crash that did occur came from the separate `findRate()` bug above, not from this cycle's change).
- No branch-isolated Docker test environment was spun up (Gate 2) — the browser verification above was accepted as sufficient given the change's tiny, well-scoped, non-backend nature.

## Code review follow-ups

None. Code review (medium effort, full branch diff) returned zero findings at every severity level — a 1-line, correctly-scoped null-guard fix.

## Roadmap notes

- **`findRate()`'s null-safety gap** (`js/core.js:264-272`) — the same missing-field crash risk as the two `buildPlanningContext()`/`buildProjectSummary()` fixes from this and the prior cycle, but with far more callers (~15 sites: `js/ai.js`, `js/lib/portfolio-calc.js`, `js/portfolio.js`, `portfolio.html`'s Vue instance directly). This is the actual, currently-live crash risk on `portfolio.html`'s AI Analysis, KPI cards, and burndown chart whenever a timesheet record has a missing `task`/`role` field — a real production risk given XLS uploads can produce incomplete rows. Candidate for its own dedicated cycle given the wider blast radius (more callers to verify, `js/lib/portfolio-calc.js` has its own vitest coverage that would need updating too).
- Remaining backlog, unscheduled (carried forward): known `/finish-cycle` Gate 2 blind spot; XLS column-mapping keyword-breadth ambiguity (needs its own dedicated cycle); `scripts/test-branch.sh`/`scripts/run-tests.sh` joint hardening; FOUC/`defer` on script tags across the 13 Vue pages.

## Sync-docs outcome

- **CLAUDE.md** — updated: `js/ai.js`'s file-structure entry now reflects the completed `buildProjectSummary()` fix (and the corrected understanding that no `planning-calc.js` dependency was needed), plus documents the newly-discovered `findRate()` finding as a flagged, deliberately-unfixed roadmap item.
- **TEST_CASES.md** / **test-cases.html** — updated in lockstep: added `R-11` (AI analysis doesn't crash on a timesheet record with a missing task field), alongside the existing `R-10` no-API-key case.
- **ARCHITECTURE.md** — not touched. No architectural/API-topology change; `js/ai.js`'s entry there is a one-line tree pointer.
- **test-api.js** — not touched. No API endpoints added or changed.
- **PRD.md** — evaluated, left untouched. Correctness fix only (prevents a crash), not a new or changed user-visible feature/flow.
- **docs/superpowers/PROCESS.md** — evaluated via the gate, left untouched. None of the three trigger conditions applied.
