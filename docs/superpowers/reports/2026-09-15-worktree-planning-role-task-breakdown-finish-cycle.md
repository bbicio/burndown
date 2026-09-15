# Finish-cycle report — worktree-planning-role-task-breakdown

**Date:** 2026-09-15
**Branch:** worktree-planning-role-task-breakdown → main

## What was done

2 commits:

- `f6b7dfd` feat: add project/task drill-down to planning.html By Role view
- `d6a35b2` chore: harden finish-cycle Gate 2 against premature test-env teardown

Feature: deferred from the `worktree-portfolio-summary-role-task-dimension` cycle per explicit user
decision — `planning.html`'s Resource Planning "By Role" view had the same fundamental "same role
label, multiple tasks blended together" visibility issue `portfolio.html`'s pre-2026-09-15 "Summary
by role" had, but for hours rather than rates. Each role row now carries a collapse/expand toggle
(collapsed by default, reusing the existing `.pp-toggle`/`data-group-id`/`data-parent-group`
mechanism already used by By Project/By Owner). Expanding a role row reveals one child row per
(project, task) combination it covers, each with its own Sold/From actuals/To be planned and period
cells. A new pure helper, `sumChildBreakdownHours()` (`js/lib/planning-calc.js`, unit-tested), sums a
role's existing per-week `breakdown` entries scoped to one child. The shared
`initTooltipsAndToggles()` group-bootstrap line was generalized to seed `collapsed` from the child
rows' actual DOM `display` state instead of hardcoding `false`, since By Role is the first
default-collapsed group this mechanism has ever had to support (By Project/By Owner default to
expanded) — without this, the first click on a default-collapsed group after any re-render would
have been a no-op.

The second commit is a small, user-requested process fix to `/finish-cycle` itself — see "Roadmap
notes" below.

## Code review follow-ups

1 round (`general-purpose` subagent, medium effort, scoped to `main..HEAD`): zero findings.

## Roadmap notes

- **Process fix, requested mid-cycle:** the isolated branch test environment was torn down
  prematurely — by the agent, after its own exploratory/verification use of it, before the user had
  been asked (let alone answered) Gate 2's manual-verification question — twice in this same session
  (once during the preceding `worktree-costgrid-owner-reassign` cycle, once again during this
  cycle's own Gate 2). The user asked for this to be fixed structurally rather than relying on
  in-session correction alone. `.claude/commands/finish-cycle.md`'s Gate 2 section now carries an
  explicit guardrail paragraph naming teardown as a one-way door gated only on the user's literal
  "yes," plus a reinforcing note at step 6 itself. Also recorded as a standing feedback memory
  (`feedback_test_env_teardown_timing.md`) for future sessions independent of this file.
- No other roadmap items surfaced.
- Backup taken automatically by `/finish-cycle` Gate 4 before this merge:
  `backups/pdash-backup-2026-09-15-185031.dump` (80K).

## Sync-docs outcome

- **CLAUDE.md** — updated: `planning.html`'s file-structure entry gained a new "By Role project/task
  drill-down (2026-09)" paragraph covering the toggle mechanism, the `roleChildMap` accumulator, the
  collapsed-by-default default and why it required generalizing `initTooltipsAndToggles()`'s
  bootstrap line, the Expand all/Collapse all addition, the unrounded-sum verification note, and the
  cache-bust bump; `js/lib/planning-calc.js`'s entry gained documentation of the new
  `sumChildBreakdownHours` export.
- **TEST_CASES.md** + **test-cases.html** — updated in lockstep: added PL-20 through PL-23 to
  "7. Resource Planning," covering collapsed-by-default, the expand/per-child-sum behavior (marked
  `auto` — covered by the new vitest suite), Expand all/Collapse all, and a regression check that By
  Project/By Owner's own default-expanded behavior is unaffected. `test-cases.html`'s embedded
  script re-validated with `node -e "new Function(...)"`.
- **test-api.js** — not touched: no API changes, this cycle is entirely frontend
  (`planning.html`, `js/lib/planning-calc.js`).
- **PRD.md** — updated (evaluated: genuinely new, interactive user-visible behavior in Resource
  Planning). §5.3 Table Structure's By Role description gained a sentence covering the new
  drill-down, Expand all/Collapse all, and that the prior tooltip-only breakdown remains available
  too.
- **PROCESS.md gate** — none of the three conditions applied: no listed process skill
  (`feature-brief`/audit skill/`audit-to-brief`) was touched; the Gate 2 hardening is a bugfix to an
  existing guardrail, not a new recurring process exception; and PROCESS.md's own 7-phase skeleton /
  scenario guardrails were not modified (only `.claude/commands/finish-cycle.md`'s own text changed,
  a separate file). Left untouched.
