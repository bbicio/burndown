# Finish-cycle report — timesheets-redesign

**Date:** 2026-11-05
**Branch:** timesheets-redesign → main
**Execution started:** 2026-11-05 19:28  (pre-flight step 6)
**Merged at:** 2026-11-05 22:45  (Gate 4's merge commit)
**Gate durations:** Gate 1 3m · Gate 2 143m · Gate 3 50m · Gate 4 2m · Gate 5 (to report) 4m — total 202m
**Cycle counters:** subagent dispatches 5 · review rounds 5 · full test-suite runs 1
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-05-timesheets-redesign.md`) · review effort high
**Claims pre-check:** Gate 1 step 0 took about 4 minutes over the `*.md` of the branch and caught nothing (predicates, the run-history cap, the `?v=` claims and the page enumeration all held). The Gate 3 re-checks ran after rounds 1, 3 and 4 (round 2 touched no `*.md`), about 1–2 minutes each, and also caught nothing. None of round 1's 10 findings fell in the four mechanical classes; the one on numbers in prose is a writing rule, not a stale number.
**Acceptance:** 11 criteria and 16 `TEST_CASES.md` cases · 1 pre-ticked (11. Pulizia — `js/lib/timesheets-pages-guard.test.js` and `npm test` green at `eefe5ba`, 2500/2500) · 10 criteria and all 16 cases (TS-02/03/04/14/17, TS-22..26, PJ-14, PJ-21..25) verified by hand with a positive outcome on the branch stack · none left unverifiable. The hand check ran at `eefe5ba`, before Gate 3's five fix commits; those were covered by targeted tests, not by a second browser pass.
<!-- Wall-clock, human wait time included (pre-flight step 6). -->

## What was done

8 commits from the plan, then 5 review-fix commits (13 in total):

- `76fdc7f` feat(subnav): section sets and queue badge for the shared sub-nav
- `27c2d4f` feat(icons): folder, sliders, sparkle and warning icons
- `7a76e64` feat(timesheets): pure list grouping, filters and sort
- `609cb8c` feat(profile-jobs): short next-run text and settings state helpers
- `e5afb26` feat(timesheets): Actuals grouped list, row menu and restyled view modal
- `31c99e6` feat(profile-jobs): status strip, settings drawer, merged table and run history view
- `2e3a9ef` feat(timesheets): tablet and smartphone layouts for Actuals and Profile processing
- `eefe5ba` docs(timesheets): redesign narrative, lib index and manual test cases
- `264fb5f` fix(timesheets): review round 1 — dropdowns stay closable, icon rules apply, View focus
- `222ebe6` fix(timesheets): review round 2 — Esc, View focus and the phone Filters sheet
- `8e459c9` fix(timesheets): review round 3 — Esc on a closed toggle, drawer feedback, sheet on resize
- `9eebc22` fix(timesheets): review round 4 — Esc scope, drawer alerts, stale doc tense
- `55cb1c1` fix(profile-jobs): review round 5 — Settings disabled while a page action runs

## Gate outcomes

- Gate 1: passed — claims pre-check clean, `npm test` 2500/2500; no `api/` path, so no backend suite.
- Gate 2: ordinary cycle; review launched in the background at `eefe5ba`; the running branch stack reused; the acceptance checklist all verified; browser question answered yes; branch stack torn down.
- Gate 3: 5 rounds (10 + 4 + 6 + 3 + 1 findings). Round 1 by the user's mix (1, 2, 3, 4, 6, 7, 10 fixed; 5, 8, 9 follow-up) plus the dropdown defect the user reported at Gate 2; rounds 2–5 under the user's rule (correctness and visual defects fixed, the rest follow-up). Disposition by target: no finding on Spec or Plan; one on prose outside the diff (`.claude/skills/operational-manual/SKILL.md`), closed by `/sync-docs` in this gate rather than tracked. After round 3 the cap question was answered (a), round 4 and 5 scoped to the fix commits; after round 5 the user closed the gate, so `55cb1c1` (one `:disabled` attribute, guarded) was not reviewed.
- Gate 4: merged `e9df0cf` (`--no-ff`, main had not diverged), pushed; no migration, no restart, no backup (no `api/` path); worktree removed, local branch deleted.
- Gate 5: `/sync-docs` touched 4 files; 8 rows written to `docs/BACKLOG.md` (B-337..B-344: five follow-ups, two pre-existing defects, one same-pattern defect).

## Code review follow-ups

- Round 1 #5 — "· last HH:MM" in the strip and "Next HH:MM" in the table carry no date, ambiguous after a long pause or with a long interval — `profile-jobs.html` line 283, `js/lib/profile-jobs-ui.js` (`formatTimeShort`, `describeNextRunShort`).
- Round 1 #8 — Actuals sorts project codes as plain text (no `numeric: true`), Profile processing numerically — `js/lib/timesheets-list.js` (`cmpText`).
- Round 1 #9 — the 1024–1279px "sub-nav as tabs" media query is copied in both pages instead of living with the sub-nav in `css/style.css`, and it ignores the collapsed sidebar rail — `timesheets.html` line 199, `profile-jobs.html` line 229.
- Round 2 #4 — `pillKind` re-implements the status fallback of the tested `jobStatusClass`, which has no page caller left — `profile-jobs.html` line 555.
- Round 3 #6 — on a phone the toolbar's Reset filters is hidden and the Filters sheet has none — `timesheets.html` line 152.

## Roadmap notes

- Gate 2 verification was done at `eefe5ba`; the Gate 3 fixes (dropdown `.show`, icon selectors, focus, Esc, drawer alerts) were verified by targeted static guards only — a browser pass on `main` is worth doing.
- Pre-existing on `main`, surfaced by the review, not introduced by this branch: the View modal falls back to `'EUR'` when the row has no currency (`timesheets.html` lines 377–378, against CLAUDE.md's "a missing code is a bug"), and a slower View response can overwrite a newer modal (`timesheets.html` line 571). Both written to `docs/BACKLOG.md`.
- Round 5's reviewer also noted, outside its scope: the sub-nav badge is not refreshed after Delete actuals, filter values for a deleted code stay selected, and `loadRows()` replaces rows so per-row flags reset. Observations, not tracked.
- The same dead `ph-icon` CSS selector pattern fixed here exists in `master-currencies.html` lines 17 and 50 (`.mdc-note ph-icon`, `.mdc-rate-btn ph-icon`). Written to `docs/BACKLOG.md`.
- Every round from 2 on found an interaction edge of the hand-built overlays (Esc order with Bootstrap's handler, focus, stacked layers) — the same pattern as the Currencies cycle; the shared overlay/drawer component (B-335) remains the structural answer.
- Process slip: at Gate 5 one count in this report was corrected with `sed` and shell-quoted text, which Gate 5's preamble forbids; the result was checked by grep. Every other Gate 5 edit went through the Edit tool or a script file.
- Executor rulings (ledger): View modal as a local overlay; `#confirmModal` outside the Vue root; Actuals code sort kept as today; current drawer helper text kept over the board's rewording; Profile processing sort kept two-state; no emoji in confirm titles; phone cards as the same markup restyled; compact columns below 1400px and sub-nav tabs 1024–1279px (the 1024 board assumes a rail sidebar); the phone filter sheet as the same filter controls restyled.

## Sync-docs outcome

- 1 ARCHITECTURE.md — yes: the `timesheets.html` and `profile-jobs.html` tree entries now name the shared sub-menu and the `js/lib/` module each adds.
- 2 CLAUDE.md — no: the Pages row of `profile-jobs.html` was already updated on the branch.
- 3 TEST_CASES.md — no: updated on the branch (TS-22..26, PJ-21..25, six rows reworded).
- 4 test-api.js — no: no API change.
- 5 PRD — yes, user-visible: `docs/prd/timesheets.md` §8.4 rewritten (sub-navigation, grouped list, row menu, phone filters, empty states); `docs/prd/administration.md` §16.10 updated (status strip, Settings panel, merged columns, Run history as a second view, topic failure under the name). `PRD.md` §3 already correct ("the profile-processing console from Timesheets").
- 5b operational-manual reference — yes: the Profile Processing Console bullet (reconciled from `docs/prd/administration.md` §16.10) and the Timesheet Management bullet (from `docs/prd/timesheets.md` §8.4) of `.claude/skills/operational-manual/SKILL.md`.
- 6 PROCESS.md — none of the three conditions applies; not touched.
- 7 Memory — see below.

## Memory outcome

- `project_ui_redesign_cycles.md`: appended "Timesheets redesign (Actuals + Profile processing) — MERGED 2026-11-05 (`e9df0cf`)…" with the report path, the sub-nav registry, the 5 review rounds and the lessons (Vue `:class` on a Bootstrap toggle wipes `.show`; `ph-icon` is not a CSS target; Bootstrap `preventDefault()`s Esc on a closed toggle).
- `MEMORY.md`: the UI redesign line, after "phase 2 page 4 Currencies MERGED…", gains "Timesheets redesign (Actuals + Profile processing) MERGED 2026-11-05 (`e9df0cf`, 5 review rounds; Vue :class on a Bootstrap toggle wipes .show);".
- Unverified: which page-by-page redesign cycle comes next — not established by this merge.
