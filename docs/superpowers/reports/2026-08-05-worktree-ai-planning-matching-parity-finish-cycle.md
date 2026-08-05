# Finish-cycle report — worktree-ai-planning-matching-parity

**Date:** 2026-08-05
**Branch:** worktree-ai-planning-matching-parity → main

## What was done

1 commit:

- `450af1d` fix: align js/ai.js task/role matching with the shared, case-insensitive logic

Backlog items 1 and 2 (re-triage from earlier cycles this session), investigated and handled:

1. **Sold-hours input validation — already resolved, no action needed.** Verified `isValidSoldHours()` is already fully implemented and enforced both server-side (`api/src/lib/sold-hours.js`, wired into `api/src/routes/cost-grids.js` and `api/src/routes/projects.js`) and client-side (`js/lib/cfg-parse.js`, used by `costgrid.html`'s live input validation and `project-config.html`'s `onSave()` blocking-save check), with full unit test coverage on both sides. This was completed in an earlier cycle of this session not covered by the assistant's current context (pre-compaction) — confirmed via direct code inspection rather than assumed.
2. **`js/ai.js`'s divergent, case-sensitive task/role matching (fixed).** `buildPlanningContext()` (feeds the `planning.html` AI sidebar chat) used raw `===` comparisons (`r.task === t.name`, `r.role === res.role`) — case-sensitive, diverging from the rest of the app's resource-planning views, already fixed in an earlier cycle to use the shared `matchesTaskRole()`/`computeResidual()` (`js/lib/planning-calc.js`, unit-tested). Replaced all 3 call sites with the shared functions. Also deleted `buildResourceAllocationSummary()` (~85 lines) — confirmed via repo-wide grep to have zero callers anywhere, an independent AI-context builder with its own similarly-diverged (case-insensitive but not null-safe) matching logic, now moot.

Scoping surfaced two additional findings, explicitly resolved with the user before implementation (not decided unilaterally):
- `buildProjectSummary()` (used by `openAiAnalysis()` on `portfolio.html`) has a related but smaller, separate bug: already case-insensitive but not null-safe (would throw on a record with a missing `task`/`role` field). Left out of scope for this cycle — fixing it would require adding a `js/lib/planning-calc.js` `<script type="module">` tag to `portfolio.html`, which doesn't currently load it. Logged as a roadmap item below.
- `buildResourceAllocationSummary()`'s dead-code status — user explicitly chose to remove it in this same cycle rather than defer it.

## Process notes

- This was a lightweight, direct-implementation cycle (no Brief/brainstorming/plan) — same weight as the earlier "items 1-3" bundle this session, appropriate given the small, well-understood, low-risk scope (single file, mechanical parity fix + verified-dead-code removal).
- **Process correction mid-cycle:** work was initially started directly on `main` (uncommitted `js/ai.js` edit) rather than on a feature branch — a deviation from this project's established convention (every code change goes through a branch + `/finish-cycle`, only doc-only fixes had been committed directly to `main` earlier in this session). Caught before committing; the uncommitted change was moved onto a new branch (`git checkout -b worktree-ai-planning-matching-parity`) before proceeding, so no direct-to-main code commit occurred.
- Diff does not touch `api/` — Gate 1 step 2/3 (`scripts/run-tests.sh`, using this session's own newly-isolated test wrapper) was correctly skipped.
- Manual browser verification: loaded `planning.html` on `localhost`, confirmed real project data renders correctly (also incidentally reconfirming the DB restore from earlier this session), then executed `buildPlanningContext()` directly via the browser console — returned a 9119-character context string with no thrown error, and confirmed `window.matchesTaskRole`/`window.computeResidual` are both correctly bridged and callable on this page.
- No branch-isolated Docker test environment was spun up for this cycle (Gate 2) — the browser verification above was accepted as sufficient given the change's small, well-scoped, non-backend nature.

## Code review follow-ups

None. Code review (medium effort, full branch diff) returned zero findings at every severity level.

## Roadmap notes

- **`buildProjectSummary()`'s null-safety gap** (`js/ai.js`, used by `portfolio.html`'s "🤖 AI Analysis" button): case-insensitive already, but `r.task.toLowerCase()`/`task.name.toLowerCase()`/`res.role.toLowerCase()` will throw if any of those fields is missing/undefined on a timesheet record or task config — plausible with incomplete XLS upload data. Fixing it requires adding a `js/lib/planning-calc.js` script tag to `portfolio.html` (not currently loaded there) to reuse `matchesTaskRole()`, or an equivalent null-safe inline fix. Candidate for its own small future cycle.
- Remaining backlog beyond items 1/2, unscheduled (carried forward from earlier reports): known `/finish-cycle` Gate 2 blind spot; XLS column-mapping keyword-breadth ambiguity (deliberately excluded from bundling, needs its own dedicated cycle); FOUC/`defer` on script tags across the 13 Vue pages; `scripts/test-branch.sh`/`scripts/run-tests.sh` joint hardening (stale-container pre-cleanup, repo-root invocation guard, unconditional `--build` — from the prior Docker test-profile isolation cycle's code review follow-ups).

## Sync-docs outcome

- **CLAUDE.md** — updated: `js/ai.js`'s file-structure entry now documents the `buildPlanningContext()` matching fix, the `buildResourceAllocationSummary()` dead-code removal, and the `buildProjectSummary()` null-safety gap left as a roadmap item.
- **TEST_CASES.md** / **test-cases.html** — updated in lockstep: added `PL-19` (AI sidebar context matches task/role case-insensitively), extending `PL-07`'s existing case-insensitivity guarantee to the AI sidebar's own context builder.
- **ARCHITECTURE.md** — not touched. `js/ai.js`'s entry there is a one-line tree pointer with no matching-logic detail to update; no architectural/API-topology change.
- **test-api.js** — not touched. No API endpoints added or changed.
- **PRD.md** — evaluated, left untouched. This is a correctness fix (restoring intended case-insensitive behavior already established elsewhere in the app) plus a dead-code removal — not a new or changed user-visible feature/flow, and the PRD's description of the AI sidebar wasn't itself inaccurate.
- **docs/superpowers/PROCESS.md** — evaluated via the gate, left untouched. None of the three trigger conditions applied: no process skill was modified, the mid-cycle branch correction (see Process notes) was a one-off self-caught deviation from an already-documented convention, not a new recurring exception, and the 7-phase skeleton/scenario guardrails were not touched.
