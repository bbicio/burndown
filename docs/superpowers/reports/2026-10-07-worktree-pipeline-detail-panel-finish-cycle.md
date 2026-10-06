# Finish-cycle report — worktree-pipeline-detail-panel

**Date:** 2026-10-07
**Branch:** worktree-pipeline-detail-panel → main (merge `aea1745`, `--no-ff`; main had not diverged)

## What was done

7 commits (Pipeline redesign, cycle 2 of 2 — detail panel; brief `docs/superpowers/design/2026-10-06-pipeline-brief.md` §6/§7/§10, spec `docs/superpowers/specs/2026-10-06-pipeline-detail-panel-redesign-design.md`, plan `docs/superpowers/plans/2026-10-06-pipeline-detail-panel-redesign.md`):

- `7f3fb5e` feat(api): POT summary with expected/SIP totals and per-proposal value
- `b938a06` feat(pipeline): pbFmtMonth and pbPotView view-model functions
- `5481e1b` fix(pipeline): gap.over without target guard per spec
- `0ca5cb0` feat(pipeline): detail panel container modes, header, Overview/Tasks/Linked tabs
- `6f39990` fix(pipeline): Esc listener in capture phase, ignore open modal/offcanvas
- `79f0ad4` feat(pipeline): POT tab with extended summary, smartphone panel; docs
- `b18e38c` fix(pipeline): final review fixes — delete open card, Esc/dropdown, POT request token, group POT test, fee rate guard

Gates: Gate 1 passed — frontend `npm test` 684/684 (see Roadmap notes for a first, transient failing run), backend `scripts/run-tests.sh` 538/538. Gate 2: isolated branch stack, user verified with the 19-step checklist (including the overlay-mode decision), stack torn down after the user's "yes". Gate 3 skipped (see Roadmap notes). Gate 4: DB backup `backups/pdash-backup-2026-10-07-011302.dump` (116K), merged and pushed, no migration, `pdash-api` restarted and healthy (started 2026-10-06T23:14:06Z), worktree removed, local branch deleted.

## Code review follow-ups

Accepted as follow-up (final whole-branch review on Opus + per-task reviews):

- (final) Literal z-index values 10 / 20 / 1040 in `css/pipeline.css` (no `--z-*` token).
- (final) No test asserts that Canceled rows stay in `/api/pots/summary` (the code keeps them).
- (task 2) `pbFmtMonth` accepts odd shapes like `2026-0501` (harmless leniency).
- (task 3) Panel tabs have `role="tab"`/`aria-selected` but no `aria-controls`/`id` pairing and no arrow-key navigation.
- (task 3) The scrim's `@click` is redundant with the outside-mousedown handler (harmless).
- (task 4) The POT legend lists zero-value segments.
- (task 4) Redundant `Math.round(view.pct)` in the template; `pbComputePotPercentages` is now unused (still tested).
- (final, declined to judge) `/api/pots/summary` returns 500 on a malformed `clientId` UUID — pre-existing.
- (final, declined to judge) Switching cards briefly shows the spinner (existing loading behaviour).

## Roadmap notes

- **Gate 3 skipped (PROCESS.md §6.4):** the final whole-branch review at `79f0ad4` covered `main...HEAD`; its fix commit `b18e38c` was re-reviewed (8/8 findings addressed, no new breakage).
- **Gate 1 transient failure:** the first `npm test` run reported `1 failed | 620 passed (621)` with 3 errors and took 117 s (normal: ~35 s); the output did not name the failing file. An immediate re-run with no code change passed 684/684 in 33.8 s, and was treated as the restart of Gate 1 (pre-flight unchanged). Likely host load / jsdom timeouts; worth watching for recurrence.
- **Decisions taken in brainstorming (user):** POT lists only the pipeline year (the brief's "of any vintage" was reversed); the suspected per-version double counting is not a finding — the UI allows one non-Draft version per proposal (verified in code and in the real DB: 0 cases); server-side enforcement of that rule moved to the clone-bug cycle.
- **Rulings during execution:** `gap.over` at target 0 follows the spec (C+A > target → "OVER TARGET"); overlay-mode card click closes the panel (scrim rule) — confirmed by the user at Gate 2; literal z-index values accepted.
- **Process observations:** two TDD lapses/fix rounds — Task 2's implementer wrote code before tests (reviewer confirmed the tests are discriminating); Task 3's Esc listener raced Bootstrap's modal handler (fixed with a capture-phase listener). The final review caught a real regression (deleting the open Draft from its card left the panel on an error).
- **Pre-existing doc inaccuracy fixed:** PRD §4.4 described a rate-card name, a JSON export button and a timesheet-conditional "Project Dashboard" button in the panel — none exist in the code; the rewritten §4.4 describes only what is built.
- **Next:** the clone-proposal cycle (bug `invalid input syntax for type uuid: "__unassigned__"`, Clone without the pop-up, API enforcement of "no new version once published"); its screenshot `docs/superpowers/design/Pipeline/bug_cloneproposl_from_costgrid.png` is still untracked.

## Sync-docs outcome

- **TEST_CASES.md / test-cases.html:** P-10, P-11, P-12, P-13, P-25, P-26, P-38 updated (480px panel with tabs, ✕ close, POT tab, Version selector, outside click vs card click); P-69…P-76 added (layout modes, switch on another card, Esc layering, delete open Draft, Overview, Tasks/Linked, POT special states, `/api/pots/summary` fields — auto ✓ via test-api POT-08..POT-12).
- **PRD.md:** updated (user-visible) — §4.4 Detail Panel rewritten (layouts, close rules, header, four tabs), §4.8 POT tab rewritten.
- **`.claude/skills/operational-manual/SKILL.md` (6b):** §4 "Detail panel" bullet rewritten and a "POT tab" bullet added, matching the PRD.
- **ARCHITECTURE.md:** `/api/pots/summary` row documents the new fields; `css/pipeline.css` entry at `?v=2` with the panel scope.
- **CLAUDE.md, docs/pages/pipeline.md:** already updated inside the branch (Task 4 + final fixes); no further change.
- **test-api.js:** already extended inside the branch (POT-08..POT-12).
- **PROCESS.md:** gate answered "none" — the cycle executed the documented process.

## Memory outcome

- `project_ui_redesign_cycles.md`: description "… cycle 1 (10-06) MERGED; NEXT = Pipeline cycle 2 …" → "… cycle 1 (10-06) and cycle 2 detail panel (10-07) MERGED; Pipeline page done …"; the "NEXT: cycle 2 = detail panel" sentence → "Cycle 2 = detail panel — MERGED 2026-10-07" (merge, docs paths, user decisions, accepted gaps).
- `project_clone_proposal_bug.md`: added "Status 2026-10-07: Pipeline cycle 2 MERGED — this is now the NEXT cycle".
- `MEMORY.md`: UI redesign line gained "Pipeline cycle 2 … MERGED 2026-10-07 (`aea1745`)"; clone-bug line "own cycle right AFTER Pipeline cycle 2" → "NEXT cycle (Pipeline cycle 2 merged 2026-10-07)".
- Unverified — needs the user: `project_manual_test_findings_money_cleanup.md` item B ("pipeline detail panel + POT: ≈ €, Expected/SIP lines, original currency in POT modal") — the panel part now has "≈ €" and Expected/SIP lines; the Master Data POT modal's original-currency item was not touched; left unchanged.
