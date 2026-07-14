# Finish-cycle report — by-owner-task-grouping

**Date:** 2026-07-13
**Branch:** worktree-by-owner-task-grouping → main

## What was done

2 commits merged (fast-forward, `874baab..f2852d6`):

- `55a1229` — docs: add implementation plan for By Owner task-grouping change
- `f2852d6` — feat(planning): group By Owner view by task instead of role

Resource Planning's By Owner view (`js/planning.js`, `renderPortfolioPlanningByOwnerContent`) now groups its third hierarchy level by **Task** instead of **Role** — Owner → Project → Task instead of Owner → Project → Role. A task with multiple sold roles aggregates all roles' Sold/Actuals/To-be-planned hours into a single task row, attributed to the owner regardless of which role the hours were logged under. The pivot-building loop was collapsed from one iteration per (task, role) to one per task; `matchesTaskRole`, `computeResidual`, and `distributeFutureResidual` (`js/lib/planning-calc.js`) are reused unchanged. The CSV/Excel export header, in-app help text, and table column header were updated to match; the export row's internal `level` styling tag was deliberately left as `'role'` (an Excel-styling key, not a semantic label) to preserve correct leaf-row visual weight. By Project and By Role views are untouched.

Full history: Brief → `/brainstorming` → design spec → plan → subagent-driven-development (1 task, implementer + task reviewer + final whole-branch reviewer, all clean) → merge → push, following `docs/superpowers/PROCESS.md`'s Scenario 2 (evolution of an existing feature).

## Code review follow-ups

None. The final whole-branch review (round 1) reported zero Critical/Important findings. One Minor observation was raised (task-level "To be planned" is not the arithmetic sum of the former per-role values when one role is over-consumed and another isn't — this is the intended semantic of task-level aggregation, not a defect, and was accepted as expected behavior rather than a follow-up item).

## Roadmap notes

- **Manual browser verification not yet performed.** The plan specifies 4 manual verification scenarios (multi-task owner → one row per task; multi-role task → summed row; team filter narrowing to one role; cross-check totals against By Project). The implementer subagent had no browser access to run these; the user explicitly chose to verify post-merge rather than block on it, given the change is a mechanical, line-by-line-reviewed loop collapse. Worth a quick pass in `planning.html` → Resource Planning → By Owner.
- **Shared tooltip copy still says "role."** The "To be planned" column header tooltip (`js/planning.js:1522` and a duplicate at `:1245`) reads "...when a role has multiple tasks and one is over-consumed..." — phrasing left over from the pre-task-grouping model. Flagged by the task reviewer as a Minor, non-blocking, out-of-scope-for-this-task observation; the tooltip is shared boilerplate across all three grouping views, so any copy fix should consider whether "role" vs. "role/task" phrasing is generically correct for all three, not just By Owner.

## Sync-docs outcome

- **PRD.md** — updated. §5.3 (Table Structure) now documents By Owner's Owner → Project → Task row hierarchy and the multi-role aggregation behavior; the Sold/Residual formula bullets were updated to note that By Owner sums across a task's roles before applying `computeResidual`'s floor (so one role's over-consumption can offset another role's remaining budget on the same task — intentional given the row is now task-scoped). Stale `planning.js` line-number citations for `matchesTaskRole`/`computeResidual`/`distributeFutureResidual` calls in the By Owner branch were corrected (`:1310→:1311`, `:1330→:1331`, `:1355→:1356`) to match the shifted line numbers after the loop collapse.
- **TEST_CASES.md** and **test-cases.html** — updated in lockstep. Added PL-12 (By Owner groups by task, not role) and PL-13 (By Owner aggregates multi-role tasks into one row) to the Resource Planning section of both files.
- **ARCHITECTURE.md** — not touched. No module/endpoint/DB/architectural-pattern change; the change is entirely internal to one existing rendering function.
- **CLAUDE.md** — not touched. The file-structure table's one-line description of `js/planning.js` is high-level ("group-by role/project/owner") and doesn't enumerate sub-hierarchy detail for any of the three views, so it remains accurate without edit.
- **test-api.js** — not touched. No new API endpoints, no auth changes; this is a pure frontend rendering/aggregation change.
- **PROCESS.md gate** — none of the three trigger conditions applied (no process-skill change, no recurring process exception, no change to the 7-phase skeleton or scenario guardrails). Not touched.
