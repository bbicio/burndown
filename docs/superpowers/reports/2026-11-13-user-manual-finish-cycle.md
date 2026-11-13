# Finish-cycle report — user-manual

**Date:** 2026-11-13
**Branch:** user-manual → main
**Execution started:** 2026-11-13 01:21  (pre-flight step 6)
**Merged at:** 2026-11-13 01:34  (merge commit `7a10e41`)
**Gate durations:** Gate 1 1m · Gate 2 10m · Gate 3 2m · Gate 4 1m · Gate 5 (to report) unknown — total unknown
**Cycle counters:** subagent dispatches 1 · review rounds 1 · full test-suite runs unknown
**Gate 5 tests:** docs-only → npx vitest run scripts/ js/lib/test-cases-parse.test.js ×2 (red, then green; the first run failed on the pinned case count after HB-09 was added, fixed by bumping the pin 1013 → 1014 in js/lib/test-cases-parse.test.js)
**Risk class:** standard (the Plan's path, `docs/superpowers/plans/2026-11-13-user-manual.md`) · review effort medium
**Claims pre-check:** Gate 1 step 0 ran as a `git grep` for the removed HTML over the live Markdown and read the hits (all historical or in the guard's `GONE` list), under a minute, no defect; the Gate 3 re-checks had no fix to re-check; round 1 had two findings, none in the four mechanical classes.
**Acceptance:** items 1, 2, 5, 6, 7 pre-ticked from commands (greps and `doc-paths-guard`), item 8 from `npm test` (121 files, 3127 tests, run before the last one-section commit; `handbook-guard` re-run green after it); items 3 and 4 verified by hand by the user on the branch stack with a positive outcome.

## What was done

Nine commits: the manual written chapter by chapter into `handbook/public/manual.md` (Getting started and Account, Pipeline and offers, Resource planning, Project reporting and configuration, Timesheet upload and Master data, Team / Attribute lists / User administration), a Help section added after the acceptance list showed the viewer had no section, `docs/OPERATIONAL_MANUAL.html` retired with its references retargeted (`scripts/classify-cycle.mjs` and test, a `GONE` entry in `scripts/doc-paths-guard.test.js`), and the `operational-manual` skill, `/sync-docs` (its §5b removed) and `PROCESS.md` §5 retargeted to the Markdown manual.

## Gate outcomes

- Gate 1: passed (frontend only; no `api/` change, so no backend run).
- Gate 2: ordinary cycle; branch stack up and torn down after the user's yes; acceptance list answered.
- Gate 3: round 1, two Minor findings; one routed to follow-up (B-475), one a verified non-defect; a scoped review of the later Help commit found nothing.
- Gate 4: merged with `--no-ff`, pushed; no migration, backup or restart needed; worktree removed and branch deleted.
- Gate 5: sync-docs touched `docs/prd/notifications.md` and `handbook/restricted/TEST_CASES.md` (HB-09), plus `docs/BACKLOG.md`.

## Code review follow-ups

- Round 1, Minor: the manual says viewers cannot use the timesheet upload, but Load XLS in Planning is not hidden for viewers and the endpoint only requires sign-in (`handbook/public/manual.md` line 491). Tracked as B-475; check: `grep -n "viewers cannot" handbook/public/manual.md`.

## Roadmap notes

- Helper scripts for extracting the old HTML and checking labels lived in the scratchpad and were not committed, as the plan intended; a heredoc with `[\s\S]` lost its backslashes once (the known shell-drops-backslashes trap), caught by the script's own self-test.
- The old HTML's "Gantt view" and the PRD's "Share Program" wording are stale against the pages (no Gantt view in `planning.html`, the program button reads "Share"): the manual follows the pages; `docs/prd/planning.md` §5.4 and `docs/prd/access.md` §18.2 still carry the old wording.
- `docs/handoff-ciclo4.md` and old reports still name the removed HTML in the past tense; left as history.

## Sync-docs outcome

Scope pass: ARCHITECTURE no (no route, table or module change); CLAUDE.md no (no file-structure or Pages-table change); TEST_CASES yes (HB-09 added); test-api.js no; PRD evaluated and updated: `docs/prd/notifications.md` no longer calls the manual a placeholder; PROCESS.md already changed inside the cycle (§5 `operational-manual` bullet); memory evaluated.

## Memory outcome

See the Gate 6 summary: the `project_handbook_and_nginx_allowlist.md` line in `MEMORY.md` is updated to record the user manual cycle.
