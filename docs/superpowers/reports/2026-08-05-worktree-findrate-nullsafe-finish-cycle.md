# Finish-cycle report — worktree-findrate-nullsafe

**Date:** 2026-08-05
**Branch:** worktree-findrate-nullsafe → main

## What was done

1 commit:

- `af0b78b` fix: null-safe task/role match in findRate()

Third and final cycle in a 3-cycle series this session fixing the same class of bug (case-sensitive/non-null-safe task-role matching): `js/core.js`'s `findRate(row, cfg)` had 4 unguarded `.toLowerCase()` calls (`task.name`, `row.task`, `res.role`, `row.role`) that threw `TypeError` on a record with a missing `task`/`role` field — plausible with incomplete XLS upload data. Fixed with the same `(x || '').toLowerCase()` idiom used in the two prior cycles. This is the widest-blast-radius fix of the three: `findRate()` is called from ~15 sites across `js/ai.js`, `js/lib/portfolio-calc.js`, `js/portfolio.js`, and directly in `portfolio.html`'s Vue instance (KPI cards, burndown chart, dashboard) — the actual live crash risk on that page, discovered incidentally while manually verifying the prior cycle's `buildProjectSummary()` fix.

## Process notes

- Lightweight, direct-implementation cycle (no Brief/brainstorming/plan) — same weight as the two prior cycles in this series.
- Manual browser verification reproduced the exact crash scenario found during the prior cycle (a malformed timesheet record with a missing `.task` field, fed through `buildProjectSummary()`) and confirmed it now succeeds; also directly called `findRate({hours:1}, cfg)` with both `.task` and `.role` missing — returns `null` cleanly. Visually confirmed `portfolio.html`'s dashboard (budget/spent/variance table) still renders correctly with real project data.
- No branch-isolated Docker test environment was spun up (Gate 2) — browser verification accepted as sufficient given the change's tiny, well-scoped, non-backend nature (same standard as the two prior cycles).

## Code review follow-ups

None blocking. Code review (medium effort, full branch diff) returned zero Critical/Important findings; 2 Minor notes, both explicitly assessed as deliberate, reasonable scope boundaries rather than gaps:
- `cfg`/`cfg.tasks` presence itself remains unguarded inside `findRate()` — every call site already guards `cfg` before calling (verified via grep across all ~15 sites), so this was intentionally left outside this fix's scope (task/role null-safety specifically, not general `cfg`-null defense).
- No new automated test was added — `js/core.js` is a classic-script global outside the project's `js/lib/` vitest convention (confirmed: `js/lib/portfolio-calc.test.js`, which tests code that *calls* `findRate`, injects its own separate mock rather than exercising the real function). Manual-only verification matches the standard already used in the two prior cycles of this series.

## Roadmap notes

None new. This closes the 3-cycle series that started with the "js/ai.js divergent matching" backlog item; the sibling backlog items from earlier re-triages (Gate 2 blind spot, XLS column-mapping ambiguity, `scripts/test-branch.sh`/`scripts/run-tests.sh` joint hardening, FOUC/`defer` across the 13 Vue pages) remain unscheduled, unchanged from the prior report.

## Sync-docs outcome

- **CLAUDE.md** — updated: added a full entry for `findRate(row, cfg)` under `js/core.js`'s file-structure description (its matching/fallback logic, the null-safety fix, its ~15 call sites, and the deliberate `cfg`-presence scope boundary); updated `js/ai.js`'s entry to point at `js/core.js`'s new entry instead of describing `findRate`'s bug as still-open.
- **TEST_CASES.md** / **test-cases.html** — updated in lockstep: added `R-12` (KPI cards and burndown chart don't crash on a timesheet record with a missing task/role field), covering the wider blast radius this fix actually addresses (not just the AI Analysis path `R-11` already covered).
- **ARCHITECTURE.md** — not touched. No architectural/API-topology change; `js/core.js` doesn't have its own detailed entry there (only in `CLAUDE.md`'s file-structure table).
- **test-api.js** — not touched. No API endpoints added or changed.
- **PRD.md** — evaluated, left untouched. Correctness fix only (prevents a crash on malformed input), not a new or changed user-visible feature/flow.
- **docs/superpowers/PROCESS.md** — evaluated via the gate, left untouched. None of the three trigger conditions applied.
