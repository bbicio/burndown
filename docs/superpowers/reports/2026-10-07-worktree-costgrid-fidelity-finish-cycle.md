# Finish-cycle report — worktree-costgrid-fidelity

**Date:** 2026-10-07
**Branch:** worktree-costgrid-fidelity → main (merge `2bcb281`, `--no-ff`)

## What was done

12 commits. Cost Grid visual fidelity to the design boards (G-01…G-28) plus the three
custom form controls deferred by redesign cycle A.

- `4153b1a` feat(costgrid): pure month/day grid and date-text helpers for the custom controls
- `f571b79` feat(shoot): `--eval`/`--eval-file` to capture interaction-dependent states
- `1dd730a` feat(costgrid): custom month/day picker, select and people picker
- `e44f6c4` style(costgrid): header card and Offer details to the boards (G-01…G-13)
- `91cbf45` style(costgrid): grid and phasing to the boards (G-14…G-27)
- `4fe240c` style(costgrid): Add roles modal to the board, guard test, docs (G-28)
- `ca54eeb` fix(costgrid): board deviations found by the Task 7 render pass
- `eb36f2a` docs(process): capture-round economics for visual verification (PROCESS.md §6.6.5)
- `7cbfdc0` test(costgrid): pin the costgrid.js cache-bust guard to v=42
- `dc3e7a3` fix(costgrid): stop the autosave resetting the header, cap the Start pickers
- `4aa1ced` fix(costgrid): code review round 1 — keyboard, filtered select, modal state
- `598f2f3` fix(costgrid): code review round 2 — read-only predicate, trim on blur

16 files, +2157/−265. Frontend only: no `api/` change, no migration — so no
`scripts/run-tests.sh` run, no migration to apply, no `pdash-api` restart.

### Gate 1 failed on the first attempt

`npm test` failed immediately: `js/lib/proposal-modals-guard.test.js` pinned
`js/costgrid.js?v=41` while `ca54eeb` had already bumped both pages to `?v=42`. The
invariant the test guards (both pages agree) was never broken — only its literal lagged.
Fixed in `7cbfdc0`; the session handoff's claim that the suite was green on `ca54eeb` was
therefore inaccurate. Final run: **39 files / 740 tests**.

### Gate 2 found a severe regression the whole pipeline had missed

The user reported one symptom — "the Stage dropdown will not let me change value". The root
cause was much larger: `cgSyncHeaderFromForm()` (`js/costgrid.js`) still read the header
fields out of the DOM by id, and this cycle had replaced six of those native controls, so
`getElementById` returned `null` and each `|| default` fallback wrote a default back into
`_cgDraft` **on every `cgAutoSave()`** — stage to `SIP`, currency to `EUR`, client to
`__unassigned__`, ratecard to `null`, period to empty. Measured against the running branch
stack on a populated proposal, a single autosave also wiped the client and both period
months. Neither the render pass, nor the test suite, nor the execution-time reviews caught
it. The header is now read from `_cgDraft` (which Vue keeps current), and a guard test
fails if any `getElementById` reappears in that function.

Second Gate 2 finding: only the End pickers carried `:min`, so a Start could be *picked*
after the End. `CgDatePicker` gained a `max` prop and both Start fields are capped by their
own End value. Validating a **hand-typed** out-of-order date was explicitly deferred by the
spec (D2) and the user confirmed it stays with the "cycle C dates" backlog item.

## Code review follow-ups

Three rounds at medium effort on `main...HEAD` (the whole-branch review referenced in the
session handoff happened in a *different* session, so the scoped-review path did not apply).
Round 1: 8 findings, 6 fixed. Round 2: 6 findings, 5 fixed. Round 3: 3 findings, all
accepted as follow-up by the user's explicit decision.

- **(round 3) A viewer can still perform structural edits.** `isReadOnly` was applied to
  `:disabled`, but every structural control is gated on `v-if="!isLocked"` alone: Add roles,
  Add phase, the role menu, + Task, Delete phase, Delete task, the "+ Add task" row, the
  selection bar and Generate project. A viewer on an unlocked version can delete a task —
  the draft mutates, the row disappears, the PUT is refused by the server
  (`routes/cost-grids.js:89`) and the `.catch(e => console.warn(...))` in `cgAutoSave`
  swallows the rejection, so the edit looks like it stuck until a reload. **Note:** the
  test named "one read-only predicate for every editable field" in
  `js/lib/cg-controls-ui.test.js` only asserts the absence of `:disabled="isLocked"`; it
  does not cover these `v-if` paths and its name overstates what it checks. The round-2
  commit message makes the same overclaim.
- **(round 1 #6, restated in round 3) Four global listeners per picker instance.**
  `cgPopover.mounted()` registers document `mousedown` + `keydown` and window `scroll`
  (capture) + `resize`. Two pickers per task row means ~500 listeners on a 60-task grid,
  with the capture-phase scroll handler invoked once per instance on every scroll event. A
  shared dispatcher keyed on the open popover would fix it; the role menu this was modelled
  on had a single instance, so the pattern did not scale.
- **(round 3) `Home`/`End` call `preventDefault()` unconditionally** in `onListKey`,
  including when focus is in the search box: in the Client picker the caret cannot jump to
  the start of the query.
- **(round 2 #5) `commitTyped()` ignores `min`/`max`** — the component accepts by keyboard
  what its own picker refuses by click. Assigned to the "cycle C dates" backlog item.

## Roadmap notes

- **Cycle C backlog gained item 11** (user request during this cycle): task dates must be
  bounded by the months of the project/proposal they belong to. Today a task can sit
  entirely outside the offer period and nothing objects, in the UI or the API. It belongs
  to cycle C because it spans the `YYYYMM` (offer) vs `YYYYMMDD` (task) formats that cycle
  has to unify. `project-config.html` has the same gap with no bounds at all, and
  `PUT /api/cost-grids/:id/versions/:vId/structure` performs no validation. The real design
  question for its Brief is what happens to tasks already outside the period when the
  offer months are later narrowed.
- **G-15 only partially met.** Target was 5-6 role columns at 1440; measured 2 before, 3-4
  after. The sticky first column will not go below 323px without restructuring the task
  cell — its own cycle.
- **A disabled `.btn-primary` renders Bootstrap blue**, app-wide: `css/style.css` overrides
  `--bs-btn-bg` but not `--bs-btn-disabled-bg`. Deferred because fixing it means bumping
  the `?v=` of `style.css` on every page.
- **The keyboard fixes were not re-verified in a browser.** The branch stack had already
  been torn down at Gate 2 when they were written, and `vue` is not an npm dependency here,
  so no real mount test exists; they are covered by source-level guards only.
- `origin/main` was **2 commits behind** before this cycle started (`50469b4`, `2bfe21c` —
  the spec and plan commits had never been pushed). Both went out with this push.

## Sync-docs outcome

- **ARCHITECTURE.md** — updated: `js/cg-controls.js` added to the `js/` listing,
  `cg-controls-calc.js` added to the `lib/` module list, and the `costgrid.html` entry now
  notes that no native select or month input is left in the editor region.
- **CLAUDE.md** — updated during the cycle and corrected at review: `js/cg-controls.js`
  `?v=2` (the entry said `?v=1` while the page loaded `?v=2`), the `mode` and `max` props
  added to the documented prop list with the min/max rule, a note on the popovers taking
  focus, and `css/costgrid.css` `?v=3`.
- **docs/pages/costgrid.md** — updated: the Gate 2 findings and the three code-review rounds
  as narrative, plus an "Open follow-ups" section mirroring the list above (per the routing
  rule, the per-page detail lives here, not in CLAUDE.md).
- **TEST_CASES.md / test-cases.html** — 8 cases added (CG-81…CG-88): header survives an
  autosave, stage change on a non-Draft, date pickers bound both ways, keyboard operation of
  the dropdowns and of the calendar, the searchable Client picker after filtering, the
  Add-roles modal selection state, and the viewer case — the last one records the known gap
  above explicitly rather than asserting behaviour that does not hold. Both files kept in
  sync; the HTML data array was parsed to confirm it is still valid.
- **test-api.js** — not touched: no API endpoint and no auth rule changed in this cycle.
- **PRD.md** — evaluated and deliberately **not updated**, confirmed with the user: no new
  capability, screen or permission; the editor is restyled and its native controls replaced
  at equal semantics. The one behavioural novelty (pickers refuse an inverted range) was
  judged too small to change the product description.
- **PROCESS.md gate** — **condition 3 applied** (it modified the verification guardrails):
  `eb36f2a` added §6.6.5 on capture-round economics for visual verification. The file was
  updated inside the cycle itself, so `/sync-docs` made no further change to it.
- **`.claude/skills/operational-manual/SKILL.md`** — not touched, since PRD.md was not.

## Memory outcome

- `project_costgrid_custom_form_controls_cycle.md` — description "Future cycle (decided
  2026-10-07 …): build shared custom date-picker, styled dropdown-list, and searchable
  people-picker components" → "DELIVERED 2026-10-07 (merge `2bcb281` …)"; a "DONE" section
  added naming the delivered components and carrying the four open follow-ups.
- `project_ui_redesign_cycles.md` — "Custom form-control components … were deliberately
  deferred to their own future cycle here" → same sentence plus "**That cycle has since been
  delivered**"; a "Cost Grid fidelity cycle — MERGED" section added with the two lessons
  worth keeping (renders check pixels, Gate 2 and review check behaviour; grep for every
  reader of a DOM id a cycle removes).
- `project_manual_test_findings_money_cleanup.md` — item 11 added (task dates bounded by the
  project/proposal months) with its implementation facts, the Cycle C bullet extended to
  name it, and `commitTyped()` recorded as a concrete entry point for that cycle.
- `MEMORY.md` — the Cost Grid custom-form-controls line retitled "DELIVERED" with the merge
  hash and follow-ups; the UI-redesign line extended with the fidelity cycle; the
  manual-test-findings line restated as 11 items.
- Nothing left unverified.
