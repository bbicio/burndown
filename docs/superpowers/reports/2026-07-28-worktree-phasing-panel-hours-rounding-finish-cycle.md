# Finish-cycle report — worktree-phasing-panel-hours-rounding

**Date:** 2026-07-28
**Branch:** worktree-phasing-panel-hours-rounding → main

## What was done

1 commit, merged via `--no-ff` (main had not diverged since branch-off, so this was a fast-forward-eligible merge forced into a merge commit per process):

- `8d038b2` fix(costgrid): phasing panel shows exact 2-decimal hours instead of rounding to the nearest tenth

This is the first of two Briefs split from the `vue-migration-roadmap-cold-review`'s Cycle D ("phasing-panel rounding" item) — the second (Export XLS `ExcelJS is not defined`) is a separate, not-yet-started Brief with an unrelated root cause (a missing script dependency, not a display-formatting inconsistency).

`phasingFmtHours(n)` (`costgrid.html`) previously rounded hour totals to the nearest tenth (`Math.round(n * 10) / 10 + ' h'`), inconsistent with two other hour-formatting conventions already present in the codebase (`fmtH()`'s exact 2-decimal display, and `cfgFmtHours()`'s quarter-hour snapping for XLS actuals). Confirmed pre-existing, not a Vue-migration regression. User decided to align with `fmtH()`'s convention (exact 2 decimals, no rounding) rather than `cfgFmtHours()`'s (since the phasing panel shows aggregated monthly totals that don't necessarily land on quarter-hour boundaries). Fixed by having `phasingFmtHours()` simply call the existing global `fmtH()` — a one-line change, no new logic.

## Code review follow-ups

None. Given the diff is a single line reusing an already-existing global function, the standard 8-angle `/code-review` dispatch was explicitly scaled down (confirmed with the user, not applied by default) to a direct single-pass review, matching the same exception already used in prior small cycles this session (`vue-migration-roadmap-tier1-prep`, `dead-code-cleanup`, `costgrid-js-fate-docs`). Zero findings.

## Roadmap notes

- This closes the first of the two Cycle D Briefs. The second — Export XLS's `ExcelJS is not defined` bug — remains unstarted. Investigation during Brief-drafting (for the still-pending second Brief) already surfaced that the bug's scope is broader than originally reported: it affects both `planning.html`'s own export AND `js/costgrid.js`'s `cgExportXls()` (used by `costgrid.html`/`pipeline.html`), sharing one root cause — no page in the repo loads the `ExcelJS` library, even though the export code was written against its API (cell-styling via `argb` colors). A separate, unrelated observation surfaced during that same investigation: both `costgrid.html` and `planning.html` load a completely different library, `xlsx@0.18.5` (SheetJS), via CDN — but it is never referenced by any client-side JS in the repo (XLS upload/parsing goes entirely through the backend API) — confirmed dead weight, a candidate for a future cleanup cycle if ever prioritized, not part of the Export XLS fix itself.
- Remaining backlog, still unscheduled: the second Cycle D Brief (Export XLS), the repo-wide FOUC/`v-cloak` finding (surfaced during the `pipeline-version-management` cycle, explicitly scoped by the user to cover all Vue pages, not just one), and the two Cycle B2 follow-ups (session-expiry race in Clone's structure-load warning, `showConfirm()` OK/Cancel affordance mismatch).

## Sync-docs outcome

- **CLAUDE.md** / **ARCHITECTURE.md** / **PRD.md**: no update needed — none previously documented the phasing panel's specific hour-rounding behavior at a level of detail that was stale after this fix.
- **TEST_CASES.md** / **test-cases.html**: added CG-49, mirrored exactly in both files.
- **test-api.js**: not touched — no API endpoint or auth changes.
- **PROCESS.md gate**: none of the three trigger conditions applied (no process-skill change; the Gate-3 scaling-down exception used here is a repeat of an already-documented one, not a *new* recurring exception; no change to the 7-phase skeleton or scenario guardrails). Not touched.
