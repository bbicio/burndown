# Finish-cycle report — project-config-redesign

**Date:** 2026-11-02
**Branch:** project-config-redesign → main
**Execution started:** 2026-11-02 19:34  (pre-flight step 6)
**Merged at:** 2026-11-02 21:01  (Gate 4's merge commit `3d9a472`)
**Gate durations:** Gate 1 3m · Gate 2 75m · Gate 3 8m · Gate 4 2m · Gate 5 (to report) 5m — total 93m
**Cycle counters:** subagent dispatches 3 · review rounds 3 · full test-suite runs 1
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-02-project-config-redesign.md`) · review effort high
**Claims pre-check:** at Gate 1 it cost about 2 minutes and caught 1 defect, a predicate made false by this branch (`docs/css/stylesheets.md` still gave `css/costgrid.css` the shared section-header and Tags-summary rules), fixed in `d83698e`; the Gate 3 re-checks had no `*.md` to check, since every fix touched code and CSS only; none of round 1's 8 findings fell in the four mechanical classes.
**Acceptance:** 18 items (the Spec's 10 criteria + `TEST_CASES.md` PC-38…PC-45) · 1 pre-ticked from an automated run: criterion 8, `js/lib/project-config-layout-guard.test.js`, green in Gate 1's `npm test` (2003/2003) · 17 verified by hand with a positive outcome on the branch stack · none not verifiable here.

## What was done

15 commits (plus the merge):
- `b2e4d46` feat(config-form-calc): spreadEvenly, splitState, phasingBalance
- `d0ecc69` feat(icons): trash, eye, refresh, trend-up
- `bf19170` refactor(css): share the collapsible-section and tag-summary rules via style.css
- `55b360d` feat(project-config): page head with Save/Discard, project-config.css
- `545601b` feat(project-config): section index, totals, client/info/actuals cards
- `64593f6` feat(project-config): task table with one open task, spread/clear split
- `f9cc6d8` feat(project-config): one phasing card with Budget/Hours, bars, balance
- `23dd9bc` feat(project-config): PTC, groups, Tags as on the cost grid, modals
- `751b53c` feat(project-config): tablet tabs and phone one-section view with bottom sheet
- `beddcf6` fix(project-config): phone task detail no longer overflows its card
- `ebc152e` fix(project-config): board fidelity — one-row months, phasing actions on the title row, narrow-desktop task table, phone card title
- `2fd03d9` docs(project-config): redesign narrative, stylesheets, test cases
- `d83698e` docs: costgrid.css no longer owns the shared section-header and Tags-summary rules
- `db4ff9f` fix(project-config): Gate 3 round 1 — phasing balance tolerates per-month rounding and compares against billable totals; sticky index below the viewer banner
- `755103e` fix(project-config): Gate 3 round 2 — viewer banner grows when its text wraps on a phone

## Gate outcomes

- Gate 1: passed — claims pre-check 1 defect fixed; `npm test` 86 files / 2003 tests green; no `api/` change, `scripts/run-tests.sh` not needed.
- Gate 2: ordinary cycle; branch stack reused (started for Task 10's screenshots); acceptance checklist 1 pre-ticked + 17 verified by hand; browser question answered yes; stack torn down.
- Gate 3: 3 rounds (8 → 2 → 0 findings): round 1 — 3 fixed (phasing balance vs per-month rounding, balance vs billable totals, viewer banner vs sticky index), 5 to follow-up; round 2 — 1 fixed under the user's rule (phone banner height), 1 to follow-up; round 3 clean. 0 findings on frozen spec/plan files, 0 on pre-existing prose.
- Gate 4: merged with `--no-ff` (main had not diverged), pushed; no migration, no DB backup needed, `pdash-api` not restarted (no `api/` change); worktree removed, branch deleted.
- Gate 5: sync-docs touched 3 files (`ARCHITECTURE.md`, `docs/prd/project-config.md`, `.claude/skills/operational-manual/SKILL.md`); 6 rows added to `docs/BACKLOG.md` (B-239…B-244).

## Code review follow-ups

- Round 1 #3 — `splitState` (in-range sum, gap ≤ 0.5) disagrees with Derive/Reforecast (all keys, gap < 0.5) on stale keys — `js/lib/config-form-calc.js` line 230 → B-239.
- Round 1 #4 — split warning and Tasks dot count tasks the page cannot fix (one-month null split, completed) — `project-config.html` line 588 → B-240.
- Round 1 #6 — IntersectionObserver overrides the clicked `activeSection` for short bottom cards — `project-config.html` line 805 → B-241.
- Round 1 #7 — Discard after a partial save failure returns to the pre-save state — `project-config.html` line 859 → B-242.
- Round 1 #8 — a11y: `role="button"` on the task `<tr>`, `aria-label` on plain-span dots (uncertain) — `project-config.html` line 165 → B-243.
- Round 2 #2 — Totals (all tasks) vs balance (billable tasks) not labelled — `project-config.html` line 710 → B-244.

## Roadmap notes

- Executed natively (`superpowers:executing-plans`); the skill's separate final reviewer was not dispatched because Gate 3 (high, whole branch) is that review in native execution (PROCESS.md §6.4).
- Rulings taken during execution (the ledger lived in a gitignored workspace, so they are listed here): `nav-shell-guard`'s pinned `style.css?v=27` literal bumped with the file; the Not found state lost "← Back to Portfolio" and its emoji (now a `Portfolio` `.ph-btn`); "Excluded" pill on `billable === false` (as the calculations), not `!billable`; scroll offset ignores the breadcrumb (not sticky); `actualMonths` reads ISO dates only (what the upload stores); Tags header without "· optional" (cost grid parity); hex guard scans the whole page minus `href="#"`; the phone picker is shown by CSS; picking a section on the phone also scrolls to it; viewer/no-period states were shot by flipping fields through `--eval` (no viewer credentials, no undated project in the branch data); CLAUDE.md/stylesheets.md dropped their stylesheet count instead of updating it; File structure pin 13,134 → 13,148 and TEST_CASES case pin 887 → 895.
- Task 10 deviations decided by the user: fixed — one-row months when they fit, phasing actions on the title row, no-wrap labels, narrow-desktop task table below 1280px (a breakpoint beyond the plan's two, the user's choice), phone card title hidden; accepted and recorded in `docs/pages/project-config.md` — currency symbol in phasing inputs (money rule), uppercase `.ph-badge`.
- Screenshot method worth reusing: `--eval` checks that throw on clipped inputs (`scrollWidth > clientWidth`) or table overflow found layout defects the PNGs alone did not make obvious; in the production Vue build the instance is `document.querySelector('#app')._vnode.component.proxy` (`__vue_app__._instance` is null).
- Gate 5's report could not be written with the Write tool on `main` (the background-session isolation guard rejects edits in the shared checkout); it was copied in by a script, which Gate 5 permits.

## Sync-docs outcome

Scope pass: 1 ARCHITECTURE.md yes · 2 CLAUDE.md no (updated on the branch) · 3 TEST_CASES.md no (PC-38…PC-45 added on the branch) · 4 test-api.js no (no API change) · 5 PRD yes · 5b operational-manual reference yes · 6 PROCESS.md no · 7 memory yes.
- `ARCHITECTURE.md`: new `css/project-config.css` line in the directory tree; `style.css` line names the shared section-card/Tags-summary rules; `project-config.html` entry names its stylesheet.
- `docs/prd/project-config.md` (§7.1): navigation and saving rewritten (page-head buttons, Discard, no bottom row), new section-index paragraph (dots, Totals, tablet tabs, phone one-section view), task table with Spread evenly / Clear / Spread all evenly, Monthly phasing as one Budget | Hours card with balance, "Any task", actuals button labels without emoji, out-of-period notice under the page head.
- `.claude/skills/operational-manual/SKILL.md`: §7 reference gains the redesign bullet (reconciled from `docs/prd/project-config.md`) and "Any task".
- PRD: updated — `docs/prd/project-config.md`; `PRD.md` not touched (no page added or removed).
- PROCESS.md gate: none of the three conditions applied; not touched.

## Memory outcome

- `project_ui_redesign_cycles.md`: appended "Project configuration v2 (tavola 8) — MERGED 2026-11-02 (`3d9a472`)" with scope, report path, Gate 3 3 rounds (8 → 2 → 0), and three lessons (balance tolerance + billable totals, `display:none` + full `colspan` phantom columns, `--eval` overflow checks).
- `MEMORY.md`: the UI redesign line now also says "Project configuration v2 MERGED 2026-11-02 (`3d9a472`)" before "then other page-by-page cycles".
- Checked, no change: `project_manual_test_findings_money_cleanup.md` (its "next the redesign" still reads true — the redesign is a series), `feature_state.md`.
