# Finish-cycle report — worktree-portfolio-overview-cycle1

**Date:** 2026-10-08
**Branch:** worktree-portfolio-overview-cycle1 → main (merge `3e5eacd`)

## What was done

Cycle 1 of the Portfolio overview redesign: the `overview` view of `portfolio.html` replaced
with two layouts from the design boards — a uniform Card grid with a full-width children panel,
and a tree-like List — both driven by one shared ordered row list so their order cannot diverge.
The `dashboard` (per-project detail) view was out of scope and untouched. Execution was native
(the plan declares its tasks are not independent, PROCESS.md §6.1).

14 commits:

- `bdac972` feat(portfolio): pure helpers for the overview redesign
- `7b195c9` fix(portfolio): round spentPercent per spec §6.3
- `1692abf` feat(portfolio): row model, stage filter, multi-client filter, dateless projects
- `b496cbb` feat(portfolio): new header and toolbar, PfIcon, portfolio.css
- `27df1c2` feat(portfolio): card view with full-width children panel
- `a7ff835` feat(portfolio): list view
- `d01de7b` test(portfolio): isolation guard; chore: cache-bust and docs
- `c407135` fix(portfolio): final-review fixes — render-blocking method registration, filtered children visibility, list column count, grid re-measure, actuals badge
- `8e53a0f` fix(portfolio): visual-verification fixes — phone overflow, list column collision, navy buttons
- `2f5e132` fix(portfolio): card borders, open-program outline and children-panel contrast
- `4f4646c` feat(portfolio): keep program expansion in sync across Card and List
- `baa9a72` fix(portfolio): code-review round 1 — five findings on the filtered/sync behaviour
- `f34b28f` fix(portfolio): code-review round 2 — close propagation, money truncation, breakpoints
- `6704682` fix(portfolio): code-review round 3 — second close path, button states, stale doc

Scope changes decided by the user during the cycle:

- **Expansion is now shared between the two views** (supersedes spec §5 / decision D5, which had
  made them deliberately independent). Asymmetric mapping, since Card shows one program and List
  several: to List the card's program moves to the end of the order, to Card the last one is
  adopted, and a collapse propagates from both close paths. Pure helpers
  `toggleCardExpansion` / `syncExpansionOnLayoutChange`.
- **Program Share modal confirmed out of scope** (Cycle 2), after the user spotted it diverging
  from `6.3-portfolio-share-modale.jpg` — which is Cycle 2's board, per spec §2/§3/§18.
- **Final verification scoped to the touched files** at the user's request (64 tests on
  `portfolio-calc` + `portfolio-guard`); the full suite was 781 green at the preceding commit.

## Code review follow-ups

- **Round 1 — `.pf-list-actions` can clip its leftmost control.** `overflow: hidden` with
  `justify-content: flex-end` clips to the left, so if the `Share` + `Dashboard →` pair ever
  outgrows the fixed 160px track (today ~145px) `Share` would be hidden and unreachable —
  `.pf-list`'s `overflow-x: auto` scrolls the row, not the cell. Accepted as follow-up because
  fixing it means retuning tracks that had just been verified on screen.
- **Round 2 — finding rejected, not deferred.** The reviewer asked to revert round 1's fix and
  bind `.pf-card-open` back to `expandedProgramId`, arguing the sibling toggle button would
  disagree. The premise is false: that button is `v-if="!portfolioFiltersActive"` and is not
  rendered while filtering (the `Shown (filtered)` label replaces it). Current behaviour stands —
  a program card whose panel is open is marked as open.

## Roadmap notes

- **Uniform the overview toolbar controls to the costgrid style** — explicit user request,
  deferred to its own cycle. `window.CgSelect` is already reusable, but its ~42 `.cg-ctl-*` /
  `.cg-pop-*` rules live in `css/costgrid.css` and `costgrid-guard.test.js` pins that stylesheet
  and `cg-controls.js` to costgrid.html only. The real work is extracting the controls into a
  shared stylesheet and updating both pages' guards — done once, it serves every page.
- **Cycle 2 (program Share modal + `GET`/`DELETE /programs/:id/shares`)** remains unstarted.
- **List view on a phone** scrolls horizontally inside its own box. The spec only prescribes
  hiding Duration and Spent below 1024px and the boards show no phone List, so this is the
  accepted outcome rather than a defect; a stacked phone layout would be its own design decision.
- **Two lessons worth carrying**, both recorded in memory and in the docs:
  1. A bare identifier in a runtime-compiled Vue 3 template resolves on the component instance
     only and never falls through to `window`. Two window-bridged pure functions called straight
     from the markup, and not registered in `methods`, rendered the whole overview as `<!---->`.
     No unit test could see it; the final review caught it and a guard test now pins it.
  2. The `shoot.mjs` visual pass found four defects that three review rounds had not — including
     the phone overflow and the List column collision. It is not substitutable by reading the diff.
     Its own Git-Bash trap (`MSYS_NO_PATHCONV=1`, without which the capture silently renders the
     wrong page) is now documented in `docs/scripts/shoot.md`.

## Sync-docs outcome

- **ARCHITECTURE.md** — updated: added `css/portfolio.css` to the stylesheet tree; shrank the
  bloated `portfolio.html` entry back to architectural facts plus its `docs/pages/` pointer (a
  routing-rule regression it had accumulated over earlier cycles) and noted the two layouts;
  added `PDash_portfolioLayout` to the localStorage key list.
- **CLAUDE.md** — updated: `PDash_portfolioLayout` (and the previously missing
  `PDash_cgCompactHeader`) added to the Data-strategy key list; two stale `core.js?v=11`
  references corrected to `?v=13`. The Pages row, the File-structure stylesheet line and
  `docs/pages/portfolio.md` had already been updated inside the cycle.
- **TEST_CASES.md / test-cases.html** — updated in step: R-01 and R-02 corrected (they still
  described the 2-column Bootstrap grid and a single-select client filter), and R-37…R-51 added
  for the two layouts, the Stage filter, layout persistence and its invalid-value fallback, the
  dateless-project rendering, the disabled actions, the filtered behaviour, the shared expansion,
  the List child rows and status text, and the responsive behaviour. None marked `auto`.
- **test-api.js** — not touched: no endpoint was added and no auth rule changed.
- **PRD.md** — **updated** (user-visible behaviour changed): §6.1 rewritten around the two
  layouts, the filter toolbar, the project and program cards, the children panel, the List view
  and the shared expansion, replacing the superseded 2026-09 "Per-project card" paragraph.
- **operational-manual skill** — updated, as §6b requires once PRD.md is touched: its §6 reference
  covered only the KPI tables and the burndown and said nothing about the overview's structure.
- **PROCESS.md gate: none of the three conditions applied** (no process skill touched, no
  recurring exception introduced, the 7-phase skeleton and the scenario guardrails unchanged) —
  file not touched. The one durable lesson of the cycle is a tool gotcha, so it went to
  `docs/scripts/shoot.md`, which has a section for exactly that.
- **docs/css/stylesheets.md** and **docs/pages/portfolio.md** — updated inside the cycle.

## Memory outcome

- `MEMORY.md` — index line for the Portfolio redesign: *"cycle 1 READY, not started — spec+plan
  committed and pushed (`aa0f07b`), native execution confirmed"* → *"cycle 1 MERGED — merged
  2026-10-08 (`3e5eacd`); D5 superseded (expansion now synced both ways); cycle 2 = program Share,
  not started"*.
- `project_portfolio_redesign_cycles.md` — description and "Stato" section: *"Esecuzione non
  iniziata"* → merged with hash and report path; added the two in-cycle scope changes (D5
  superseded by the bidirectional sync; Share modal confirmed as Cycle 2) and the two open items
  (shared-controls extraction, `.pf-list-actions`). The pre-merge worktree-safety note, now spent,
  was removed.
- `project_ui_redesign_cycles.md` — appended the Portfolio cycle-1 entry with its merge hash and
  the two carried lessons (Vue bare-identifier resolution; visual pass not substitutable), plus
  the three review rounds and the one rejected finding.
- `project_costgrid_custom_form_controls_cycle.md` — appended the new driver for extracting the
  controls into a shared stylesheet (the Portfolio toolbar request), with why it is not a CSS
  tweak.
- `feature_state.md` — checked, no change needed: its portfolio entries are a page-level
  inventory that this cycle does not contradict.
- Nothing left unverified.
