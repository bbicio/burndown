# Finish-cycle report — worktree-export-xls-exceljs

**Date:** 2026-07-29
**Branch:** worktree-export-xls-exceljs → main

## What was done

1 commit, merged via `--no-ff` (main had not diverged since branch-off, so this was a fast-forward-eligible merge forced into a merge commit per process):

- `bbdc4fe` fix: load ExcelJS via CDN so Export XLS works on costgrid.html and planning.html

This is the second of two Briefs split from the `vue-migration-roadmap-cold-review`'s Cycle D ("Export XLS" item) — the first (phasing-panel rounding) was merged in the previous cycle. **This closes out Cycle D entirely.**

No page in the repo loaded the `ExcelJS` library, yet two independent export functions were written entirely against its API (rich cell styling via `argb` colors, fonts, borders — not achievable with the CDN library that actually *was* loaded, `xlsx@0.18.5`/SheetJS, whose free build has no write-side styling support). `planning.html`'s `buildStyledExcelExport()` threw an uncaught `ReferenceError`; `js/costgrid.js`'s `cgExportXls()` (reachable from `costgrid.html`) had a defensive guard that showed a native `alert()` instead of crashing, but was equally non-functional. Fixed by adding the ExcelJS CDN `<script>` tag (`https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js`) to both pages, immediately after each page's existing `xlsx@0.18.5` tag — no code logic changes needed, since both export functions were already correctly written against the real API.

## Code review follow-ups

None. Given the diff is a two-line, purely-additive CDN script-tag insertion (identical on both pages) with no logic change, the standard 8-angle `/code-review` dispatch was explicitly scaled down (confirmed with the user, not applied by default) to a direct single-pass review, matching the same exception already used in several prior small cycles this session. Zero findings.

## Roadmap notes

- **This closes Cycle D of the cold-review backlog entirely** (both the phasing-panel rounding and Export XLS Briefs are now merged).
- **Separately confirmed during the Brief-drafting investigation for this cycle, not part of it, and still open:** `costgrid.html` and `planning.html` both load a completely unused library, `xlsx@0.18.5` (SheetJS), via CDN — confirmed dead weight (XLS upload/parsing goes entirely through the backend API, never referenced by client-side JS). Candidate for a future cleanup cycle if ever prioritized; deliberately not touched here (removing a loaded library needs its own careful verification pass, separate from adding one).
- Remaining backlog, still unscheduled: the repo-wide FOUC/`v-cloak` finding (surfaced during the `pipeline-version-management` cycle, scoped to cover all Vue pages, not just one) and the two Cycle B2 follow-ups (session-expiry race in Clone's structure-load warning, `showConfirm()` OK/Cancel affordance mismatch).
- Also still open from before the Vue migration roadmap (surfaced during a broader backlog review this session, not part of any cold-review cycle): missing sold-hours input validation (no technical constraint enforcing {integers, 0.25, 0.4, 0.75}); `js/ai.js`'s divergent, case-sensitive task/role matching logic (independent reimplementation of the fixed `planning.html` logic); orphaned `_resolveCgIdForVersion()` (`js/api-sync.js:205`, confirmed zero callers); XLS column-mapping keyword-breadth ambiguity; stale "role" wording in the "To be planned" tooltip; and a known `/finish-cycle` Gate 2 blind spot (can't find spec/plan files committed to `main` before the branch existed). None of these are part of the Vue migration roadmap's cold-review backlog — listed here only because they surfaced during this session's broader backlog review and remain unaddressed.

## Sync-docs outcome

- **CLAUDE.md** / **ARCHITECTURE.md**: updated the stale "pre-existing bug, not fixed" notes for Export XLS in the `planning.html` entries to reflect the fix and point to this cycle.
- **PRD.md**: no update needed — its Export XLS entry already described the correct intended behavior, never documented the broken state.
- **TEST_CASES.md** / **test-cases.html**: added CG-50 (Export XLS produces a styled workbook, `costgrid.html`); `planning.html`'s existing PL-05 already described the correct expected behavior, so left unchanged.
- **test-api.js**: not touched — no API endpoint or auth changes.
- **PROCESS.md gate**: none of the three trigger conditions applied (no process-skill change; the Gate-3 scaling-down exception used here is a repeat of an already-documented one, not a *new* recurring exception; no change to the 7-phase skeleton or scenario guardrails). Not touched.
