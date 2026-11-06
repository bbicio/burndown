# Finish-cycle report — save-overlay

**Date:** 2026-11-06
**Branch:** save-overlay → main
**Execution started:** 2026-11-06 09:50  (pre-flight step 6)
**Merged at:** 2026-11-06 10:57  (Gate 4's merge commit)
**Gate durations:** Gate 1 8m · Gate 2 26m · Gate 3 31m · Gate 4 3m · Gate 5 (to report) 3m — total 71m
**Cycle counters:** subagent dispatches 4 · review rounds 3 · full test-suite runs 2
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-05-save-overlay.md`) · review effort high
**Claims pre-check:** At Gate 1 it took about 4 minutes over the two added `*.md` lines and caught 1 defect: B-345 enumerated the direct-`fetch` pages incompletely (enumeration class), fixed in `04c545f`. The Gate 3 re-checks did not run: none of the three rounds changed a `*.md` file. Of round 1's 9 findings, 2 were mechanical (false predicates: the `nav.js` "created once at the end of `<body>`" comment and N-27's "writing in `costgrid.html` never shows it").
**Acceptance:** 11 items (spec criteria 1–10 + `N-27`). 4 pre-ticked from an automated run: 2 no flicker (`js/lib/save-overlay-trigger.test.js`), 8 tests (`npm test` 2546/2546 at `5000227`), 9 tokens (`js/lib/save-overlay-component.test.js` + `git diff main...HEAD -- css/style.css` hex grep), 10 backlog (`grep -n "B-345" docs/BACKLOG.md`). 7 verified by hand with a positive outcome on the branch stack under Slow 3G: criteria 1, 3, 4, 5, 6, 7 and `N-27`. None left unverifiable.

## What was done

10 commits:
- `802fab3` feat(nav): PdOverlay save layer component
- `e70c2df` feat(api): show the save overlay for slow writes
- `49be097` feat(costgrid): keep autosave and notification writes out of the save overlay
- `4df63d5` chore: bump cache versions, test case and backlog entry for the save overlay
- `a47d53c` chore: restore LF line endings in TEST_CASES.md
- `fca43bc` fix(api): keep the save overlay up between chained writes (plan-execution final review, I1)
- `04c545f` docs: B-345 names every page whose writes skip the save overlay (Gate 1 claims pre-check)
- `5000227` test: follow the save-overlay cache bumps and the new N-27 case in the pinned guards (Gate 1 first run red)
- `1f63641` fix(save-overlay): review round 1 — keys swallowed, no blink between chained writes, tag toggle in background
- `5a409c0` fix(save-overlay): review round 2 — one save spans chained writes and reads, project-config tags in background

## Gate outcomes

- Gate 1: passed (frontend; no `api/` path, so no `scripts/run-tests.sh`) on the second run. The first `npm test` failed 6 tests that pin literals the cycle changed (`?v=` in `auth-pages-guard`, `proposal-modals-guard`; the case count in `test-cases-parse`), fixed in `5000227` and `/finish-cycle` restarted from the top.
- Gate 2: ordinary cycle; branch stack reused (started during Task 4), Acceptance checklist all ticked, browser verification confirmed, stack torn down.
- Gate 3: 3 rounds at high. Round 1: 9 findings, 6 fixed (1, 2, 3, 5, 7, 8), 3 to follow-up. Round 2: 6 findings, 4 fixed (save-level grace model + project-config tags), 2 to follow-up. Round 3: 6 findings, all to follow-up by the user's choice (so the 3-round cap question did not arise). Disposition rules took 0 findings (none on specs/plans, none on pre-existing prose).
- Gate 4: merged with `--no-ff` (`b5e1312`, main had not diverged), pushed; no migration, no `api/` change so no backup and no restart; worktree `.claude/worktrees/save-overlay` removed, branch deleted.
- Gate 5: `/sync-docs` touched 7 files; 15 follow-up rows written to `docs/BACKLOG.md` (B-346…B-360; the round-2 focus variant and the plan-execution focus minor share B-351).

## Code review follow-ups

- Round 1 #4: toast containers at `z-index:9999` sit above `--z-blocking: 1090`, so an autosave toast shows over the Save version overlay — `costgrid.html` line 743, `pipeline.html` line 491.
- Round 1 #6: `setCopy()` fills the `role=status` live region while it is still hidden, so screen readers may not announce "Saving changes…" — `js/nav.js` line 322.
- Round 1 #9: `<body>` children added after `show()` (e.g. a modal) are not made inert and can take keyboard focus — `js/nav.js` line 327.
- Round 2 #5: `background` is forwarded by hand by five `Api` methods only; a generic trailing-`opts` passthrough would cover every write — `js/api.js`.
- Round 2 #6: `_pdShown` duplicates `PdOverlay.isVisible()` — `js/api.js` line 18.
- Round 2 (variant of the plan-execution deferred focus minor): the 250 ms grace makes the unconditional focus restore worse — `master-roles`'s `focusBack(opener)` is a no-op while inert, then `hide()` focuses a now-hidden button — `js/nav.js` line 353.
- Round 3 #1: making the page inert blurs the focused field, so save-on-blur handlers (`readMoneyInput`, `commitTyped`) run on half-typed text mid-save, and `hide()` refocuses it — `js/nav.js` line 329.
- Round 3 #2: `switchVersion`/`goBack`/`openLinkedProject` call background `cgAutoSave()`, so leaving the editor shows no overlay while its write can still be cut by the navigation (race pre-existing) — `costgrid.html` lines 1445, 1449, 1578.
- Round 3 #3: `cgSaveVersion`/`cgPublishDraft` do not cancel the pending 2 s autosave debounce (pre-existing race) — `js/costgrid.js` `cgSaveVersion`.
- Round 3 #4: `background: true` on a GET is ignored; such a GET still joins an open save — `js/api.js` line 37.
- Round 3 #5: an unrelated GET started in an open save (e.g. the bell) joins it and can keep the overlay up — `js/api.js` line 37.
- Round 3 #6: `hide()` sets `hidden` in the same tick as it removes `.is-visible`, so the fade-out never runs — `js/nav.js` line 351.

## Roadmap notes

- Deferred minors from the plan-execution final review (Opus, before `/finish-cycle`), also written to `docs/BACKLOG.md`: with `Promise.all` a rejected sibling's `showInfo`/`showConfirm` (z-index 1200, `js/core.js` lines 315–318, 362–365) is inert until the other writes settle; `hide()` restores focus unconditionally and without `preventScroll`; `body.pd-save-locked { overflow: hidden }` shifts the layout by a scrollbar width on Windows; a slow logout (`POST`) shows "Saving changes…". The fifth (dead `hideTimer`) was removed in round 1.
- Plan rulings (ledger): `inert` as an attribute (jsdom has no `.inert` reflection); `{ background: <bool> }` always forwarded as a third argument by `_cgUpsertVersionToApi`; pinned `?v=` literals in guard tests updated with every bump; the 1024 px shoot showed the open sidebar because the rail is a user toggle, not a breakpoint.
- The plan's Review Focus 2 ("overlay already hidden when the caller's catch opens its error") no longer holds by design since round 2: a failed save keeps the overlay up to 250 ms. Accepted by the user when choosing the round-2 fix; the spec §3 wording ("contatore → 0: … chiama hide()") describes the earlier per-request model.
- The review packaged a `TEST_CASES.md` committed with CRLF over an LF blob (`i/-text`); fixed in `a47d53c`. An editor that preserves the working copy's line endings can reintroduce it on that file.
- The per-request trigger the spec chose (Decision 1) was the root of rounds 1–2: the unit is the save, not the request. A `PdOverlay.hold()/release()` around multi-step callers remains the sturdier alternative if the grace model proves fragile.

## Sync-docs outcome

- §1 ARCHITECTURE.md: updated — the `api.js` and `nav.js` entries of the directory tree name the save overlay.
- §2 CLAUDE.md: not edited (its entries stay accurate as an index); narrative routed to `docs/js/nav.md` ("Save overlay"), `docs/js/shared-libs.md` (`js/api.js` "Save overlay trigger"), `docs/js/costgrid.md` ("Autosave stays out of the save overlay"), `docs/js/api-sync.md` ("Background flag").
- §3 TEST_CASES.md: evaluated, no change — `N-27` (added on the branch) still matches the final behaviour.
- §4 test-api.js: not applicable, no API change.
- §5 PRD: updated — `PRD.md` §13 gained a "Slow saves" row (product-wide behaviour, no area file).
- §5b operational-manual: updated — §2 Getting started gained a "Saving overlay" bullet, triggered by `PRD.md` §13.
- §6 PROCESS.md gate: none of the three conditions; untouched.

## Memory outcome

- `project_ui_redesign_cycles.md`: added the "Save overlay — MERGED 2026-11-06 (`b5e1312`)" paragraph (scope, 3 rounds 9+6+6, lesson "the save, not the request, is the unit", open follow-ups).
- `MEMORY.md`: UI redesign line, "…Pipelines forms-in-drawer follow-up MERGED 2026-11-05 (`207a271`); then other…" → "…(`207a271`); Save overlay MERGED 2026-11-06 (`b5e1312`, 3 review rounds, follow-ups in docs/BACKLOG.md); then other…".
- Nothing left unverified.
