# Finish-cycle report — master-pipelines-form-drawer

**Date:** 2026-11-05
**Branch:** master-pipelines-form-drawer → main
**Execution started:** 2026-11-05 10:12  (pre-flight step 6)
**Merged at:** 2026-11-05 10:58  (Gate 4's merge commit)
**Gate durations:** Gate 1 7m · Gate 2 20m · Gate 3 14m · Gate 4 6m · Gate 5 (to report) 5m — total 52m
**Cycle counters:** subagent dispatches 4 · review rounds 3 · full test-suite runs 4
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-05-master-pipelines-form-drawer.md`) · review effort high
**Claims pre-check:** Gate 1 took about two minutes over the two changed `*.md` files and caught one defect (MD-15's title still said "inline edits", a false predicate), fixed in `8965824`; the Gate 3 re-check of the round-1 `*.md` fix took about a minute and caught nothing; of round 1's 15 findings, 1 was mechanical (MD-15's Back step, a misleading predicate plus step order); the late round-2 addendum, which arrived after Gate 3 had closed, added 2 more mechanical ones (a number in `docs/pages/config.md` prose, `mdpDrawerDismiss` missing from the `docs/js/lib.md` enumeration), fixed in Gate 5 by `/sync-docs`.
**Acceptance:** 11 items (Spec criteria 1-10 + `TEST_CASES.md` MD-15) · pre-ticked from an automated run: 6, 7, 10 (`npm test` → 2377/2377 at `2ee84bc`, `js/lib/master-data-guard.test.js`) · verified by hand with a positive outcome: 1, 3, 4, 5, 8, 9, MD-15, and 2 after a fix-now (the New POT picker was hidden under the drawer, fixed in `2b8866d`) · not verifiable here: none.

## What was done

9 commits:

- `5a2c2df` test(master-pipelines): mdpDrawerDismiss + characterization of the moving forms
- `c6b2e5e` feat(master-pipelines): new year, new POT and edit target open in the side drawer
- `85d1133` fix(master-pipelines): Current amount in Edit target as a small hint (board 10.4e)
- `9de3949` docs(master-pipelines): MD-15 and page notes for the form drawer
- `8965824` docs: MD-15 title no longer says inline edits
- `2ee84bc` test(master-pipelines): POT details guard follows the drawerView / dismissDrawer wiring
- `2b8866d` fix(master-pipelines): New POT picker opens above the side drawer
- `a680e8c` fix(master-pipelines): review round 1 — phone width, picker Esc/scrim, MD-15 Back, dead CSS
- `6d648a1` fix(master-pipelines): scrim picker check in a method (templates cannot reach document)

## Gate outcomes

- Gate 1: first run red — `js/lib/master-pipelines-pot-details.test.js` (not in the Plan's test list) pinned the old `v-if="drawerPot"` / Esc → `closeDrawer` wiring; updated to the new contract in `2ee84bc`, `/finish-cycle` restarted, `npm test` green (2377/2377); no `api/` path, `scripts/run-tests.sh` not run.
- Gate 2: ordinary cycle; branch stack reused (started for Task 3's screenshots); acceptance item 2 failed (New POT picker under the drawer), fixed now in `2b8866d` and re-verified by the user; browser question answered yes; stack torn down.
- Gate 3: round 1 = background whole-branch review (9 findings) + scoped review of `2b8866d` (6) → 15 deduplicated, 1 already fixed, 4 fixed in `a680e8c` (B, C, D, E, J), 10 to follow-up; round 2: 1 finding (the round-1 scrim fix used `document` in an in-DOM template, so it never ran), fixed in `6d648a1` and verified in headless Chrome; round 3: no findings. A late addendum of round 2 (4 minors + 1 borderline) arrived after the gate closed and was decided by the user before the merge: the two doc defects to Gate 5, the rest to follow-up. Disposition rules: 0 findings on frozen Spec/Plan, 0 on pre-existing prose outside the diff.
- Gate 4: merged with a merge commit `207a271` (main had advanced 1 commit, `2629116`); no migration, no `api/` path, so no DB backup and no restart; branch test stack torn down on the user's answer before the worktree removal; worktree removed, branch deleted.
- Gate 5: `/sync-docs` touched 3 files (`docs/prd/master-data.md`, `docs/pages/config.md`, `docs/js/lib.md`); 11 follow-up rows written to `docs/BACKLOG.md` (B-302…B-312); `gate5-scope` printed `other` only because of the untracked, pre-existing `docs/superpowers/design/MD-Currencies/` (not committed), so `npm test` ran: first run 3 timeouts in untouched files (`scripts/decision-ledger-guard.test.js`, `js/lib/costgrid-currency-change.test.js`, `js/lib/nav-shell.test.js`, 65/65 green alone), second run 2381/2381; the pre-authorised push did not apply.

## Code review follow-ups

- Round 1 — Browser Back during a save closes the form (`applyState` sets `potf.show`/`pyf.show` to false regardless of `loading`), so a failed save writes its error into a hidden form; with the late round-2 borderline case, Back + another POT's pencil can apply the first save's result to the second form. `master-pipelines.html` line 1157.
- Round 1 — A second Enter during a save sends a duplicate request (only the footer buttons honour `loading`); pre-existing, Spec exclusion c. `master-pipelines.html`.
- Round 1 — No focus trap: Tab reaches + New POT behind the drawer and opens it over another POT's details (Spec Decision 7). `master-pipelines.html`.
- Round 1 — New POT focuses the amount, not the first field (Spec §3 chose it). `master-pipelines.html` line 1325.
- Round 1 — `editFromDrawer` only forwards to `openPotForm`; `drawerLabel` repeats the header titles. `master-pipelines.html` lines 972, 1487.
- Round 1 (scoped) — The page-local `.cg-pop` override raises every picker on the page, Phasing filters included. `master-pipelines.html` line 145.
- Round 1 (scoped) — Root cause shared: `css/controls.css`'s `.cg-pop` sits below every `--z-notification` drawer in the app. `css/controls.css` line 68.
- Round 1 (scoped) — The picker list is teleported outside the `aria-modal` dialog; screen readers may treat it as inert (unverified). `master-pipelines.html` line 705.
- Round 1 (scoped) — The z-index guard pins the exact rule text, not that it wins the cascade. `js/lib/master-data-guard.test.js` line 454.
- Round 2 (late) — Create and Update target repeat the same long `:disabled` expression and spinner, re-checked by `savePot`. `master-pipelines.html`.
- Round 2 (late) — `.mdp-drawer { height: 100vh }` can put the form footer behind a phone's browser toolbar or keyboard; `100dvh` would avoid it. `master-pipelines.html` line 140.

## Roadmap notes

- Executing-plans' own final whole-branch review was not run separately: Gate 3 ran `/code-review` at high (PROCESS.md §6.4); ledgered as a ruling.
- The Plan's test list missed `js/lib/master-pipelines-pot-details.test.js`, which pinned the drawer wiring; found only by Gate 1's full run.
- Task 3's screenshot check opened every form but never the New POT picker; the z-index defect reached the user at Gate 2.
- Plan rulings during execution: the structural guard counts `@click="savePot"` twice (Create POT and Update target keep their pinned `:disabled`), not once as the Plan said; added stacked-form field labels were removed again (Spec: texts identical); `editFromDrawer` kept `async` because the Plan's guard slices from it.
- The branch test stack was brought up a second time during Gate 3 to verify the round-2 fix in a real browser, and torn down at Gate 4 on the user's answer.

## Sync-docs outcome

- §1 ARCHITECTURE.md: no — it lists `master-pipelines.html` by name only.
- §2 CLAUDE.md: no — page purpose unchanged, no file added.
- §3 TEST_CASES.md: no — MD-15 was updated on the branch.
- §4 test-api.js: no — no API change.
- §5 PRD: updated `docs/prd/master-data.md` — the Pipelines & POTs paragraph (forms in the side drawer, close behaviour, no bottom sheet) and the ✏️ Edit paragraph (drawer form, reason required, label "New target (€)").
- §5b operational-manual reference: no — its inlined reference has no Pipelines & POTs content.
- §6 PROCESS.md gate: none of the three conditions applies.
- Also, from the late review addendum: `docs/pages/config.md` "Form drawer" bullet points at `.mdp-drawer.is-form` and the phone guard instead of stating widths, and notes the picker keeps Esc/outside click; `docs/js/lib.md` lists `mdpDrawerDismiss`.

## Memory outcome

- `project_ui_redesign_cycles.md`: the "Pipelines & POTs" entry gained the follow-up line — before: ends at "…`/api/exports/phasing` writes hours as days*8 (brief says days)." → after: adds "Follow-up 'forms in the side drawer' — MERGED 2026-11-05 (`207a271`) …" with the report path, the picker z-index finding and the "in-DOM Vue templates cannot reach `document`" lesson.
- `MEMORY.md`: the UI redesign hook — before: "…`489f4da`, 5 review rounds, next Currencies)" → after: "…next Currencies); Pipelines forms-in-drawer follow-up MERGED 2026-11-05 (`207a271`)".
