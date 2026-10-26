# Finish-cycle report — dates-c2-datepickers

**Date:** 2026-10-26
**Branch:** dates-c2-datepickers → main
**Execution started:** 2026-10-24 22:09  (pre-flight step 6)
**Merged at:** 2026-10-26 10:05  (Gate 4's merge commit)
**Gate durations:** Gate 1 4m · Gate 2 8m · Gate 3 2143m · Gate 4 2m · Gate 5 8m — total 2165m
**Cycle counters:** subagent dispatches 15 · review rounds 3 · full test-suite runs 3
**Risk class:** high-risk (`docs/superpowers/plans/2026-10-24-dates-c2-datepickers.md`) · review effort high
**Claims pre-check:** at Gate 1 the branch changed no `*.md`, so there was nothing to check and it cost no time; no Gate 3 round fixed a `*.md`, so the Gate 3 re-checks did not run; of round 1's 9 findings, 1 was mechanical (finding 6: two false predicates in `CLAUDE.md`, "seven stylesheets" and "loaded only by `costgrid.html`").
**Acceptance:** 9 criteria from the Spec, no `TEST_CASES.md` case in the diff · 3 pre-ticked from automated runs: 1 (`npx vitest run js/lib/dates-guard.test.js`, plus the Task 5 negative checks), 2 (`js/lib/dates.test.js`), 9 (`npm test`, 1707/1707 at `6c030bc`) · 6 verified by hand with a positive outcome on the branch stack: 3, 4, 5, 6, 7, 8 · none left as not verifiable here.
<!-- Gate 3's 2143m include the wait for a session-limit reset between its round 3 attempts (2026-10-24 night to 2026-10-26 morning). -->

## What was done

9 commits:
- `a9ed9ee` feat(dates): unambiguous English text format for typed and shown dates
- `8c86467` feat(cg-date-picker): unambiguous format, inline popover, shared controls.css
- `eb13d08` fix(costgrid): load controls.css before costgrid.css, scope Reassign trigger size
- `9c980c4` feat(project-config): date pickers for project and task periods (B-129)
- `790174e` feat(portfolio): custom range uses the shared date picker
- `b6bba45` test(dates): guard against native date inputs and numeric placeholders
- `6c030bc` test: update costgrid.js version pin to 49
- `2c51d9c` fix(cg-date-picker): Esc closes only the inline calendar; From calendar anchored left
- `5369271` fix(cg-date-picker): inline Esc from the input and vertical arrows stay in the calendar

Executed subagent-driven (Sonnet implementers, one task reviewer per task, Opus coordinator and `/code-review` rounds).

## Gate outcomes

- Gate 1: first run red (`js/lib/proposal-modals-guard.test.js` still pinned `costgrid.js?v=48`), fixed in `6c030bc`, re-run green (68 files, 1707 tests); no `api/` path, so `scripts/run-tests.sh` was not needed.
- Gate 2: ordinary cycle; branch stack reused; acceptance checklist 9/9 (3 pre-ticked, 6 by hand); browser question answered yes; stack torn down.
- Gate 3: 3 rounds at high. Round 1: 9 findings, 1 routed to `/sync-docs` (CLAUDE.md predicates), 2 fixed (`2c51d9c`), 6 to follow-up. Round 2: 2 findings, both fixed (`5369271`). Round 3 (first attempt died on a session limit and counted as not reviewed; re-run): 4 findings, cap reached, user chose (b) all remaining to follow-up; one of them (a dead branch the Spec keeps) went to Roadmap notes.
- Gate 4: merged `26a395b` (`--no-ff`, main had not moved), pushed; no migration, no `pdash-api` restart, no backup needed; worktree removed, branch deleted.
- Gate 5: sync-docs touched 11 files, plus `TEST_CASES.md` (3 cases) and its count pin; `docs/BACKLOG.md` closed B-129 and B-137, narrowed B-134, added B-139..B-148.

## Code review follow-ups

- Round 1 — task date field width 92px measured only on `Dec 31, 2026` (`css/costgrid.css` line 859) → B-139.
- Round 1 — parser rejects `Dec 1,2025`, `Sept`, `1st`, `1 Dec, 2025` (`js/lib/dates.js` line 109) → B-140.
- Round 1 — `cgFmtMonth` returns `''` for an invalid stored date (`js/costgrid.js` line 54) → B-141.
- Round 1 — stale teleport/fixed comments (`css/controls.css` line 5, `js/cg-controls.js` line 12) → B-142.
- Round 1 — inline popover widths duplicate `cgPopWidth` (`css/controls.css` line 222) → B-143.
- Round 1 — global listeners per picker now on project-config too (B-030 extension) → B-144.
- Round 3 — inline picker in the Bootstrap dropdown: Esc with the calendar closed applies typed text; calendar left open when the menu closes another way; Esc semantics differ between inline and teleported (`js/cg-controls.js` lines 163, 222) → B-145.

## Roadmap notes

- Round 3 finding 4: the native-event branch of `onTaskDateChange` in `costgrid.html` (line 1693) is dead; Spec §2.6 keeps it deliberately, so no edit (Spec frozen).
- Spec §2.2 says `.dropdown-menu` has no `transform`; the Plan's ledger 1 says Popper sets one. The inline popover is `position: absolute`, correct either way.
- The Plan has no "File Structure" section, so Gate 4's out-of-scope comparison did not run formally; against the tasks' *Files* lists, `js/lib/portfolio-guard.test.js` and `js/lib/proposal-modals-guard.test.js` were touched outside them, both only for stale `?v=` pins.
- The SDD final whole-branch review was not dispatched separately: in high-risk Gate 3 never skips, so `/code-review` round 1 served as that review.
- Out-of-scope findings from the tasks went to `docs/BACKLOG.md`: Italian month labels in project-config (B-146), guard gaps (B-147), project-config inline width and 390px task-name input (B-148).
- The branch stack containers (`pdash-*-dates-c2-datepickers`) were brought up again by the implementer for the Gate 3 probes and are still running; their mounted worktree has been removed.

## Sync-docs outcome

- `CLAUDE.md`: `css/` entry now eight stylesheets incl. `controls.css`; `js/cg-controls.js` entry names its three pages; "Dates" gains the rule that every editable date field is a `<cg-date-picker>` with text only from `js/lib/dates.js` (guard-pinned). File structure block kept at its pinned 12,914 bytes.
- `ARCHITECTURE.md`: tree gains `controls.css`; `costgrid.css` and `cg-controls.js` entries updated.
- `docs/css/stylesheets.md`: new `css/controls.css` section; `costgrid.css` section updated.
- `docs/js/cg-controls.md`: pages, format, `inlinePopover` and its keyboard handling.
- `docs/js/lib.md`: `dates.js` loaders, format, accepted forms, messages.
- `docs/pages/costgrid.md`, `docs/pages/project-config.md`, `docs/pages/portfolio.md`: one cycle section each.
- PRD: updated `docs/prd/pipeline.md` (offer dates), `docs/prd/project-config.md` (project and task date fields), `docs/prd/reporting.md` (Custom range). `PRD.md` untouched (no page added or removed). Operational-manual reference evaluated: it does not describe date formats, no change.
- `TEST_CASES.md`: CG-83 dates rewritten; CG-98, R-68, PC-29 added; `js/lib/test-cases-parse.test.js` count 846 → 849.
- `test-api.js`: not needed (no endpoint or auth change).
- PROCESS.md gate: none of the three conditions applied; untouched.

## Memory outcome

- `project_manual_test_findings_money_cleanup.md`: "NEXT: create the worktree and execute C2, then **C3** (item 11)." → "**C2 MERGED 2026-10-26 (`26a395b`)**, report … NEXT: **C3** (item 11)."
- `project_costgrid_custom_form_controls_cycle.md`: B-030 line now also notes two pickers per task in project-config plus a window keydown capture listener per date picker (since `26a395b`).
- `MEMORY.md`: the dates line "C2 spec+plan committed …, next: execute C2 then C3" → "C2 MERGED 2026-10-26 (`26a395b`), next: C3".
