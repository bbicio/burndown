# Finish-cycle report — worktree-portfolio-list-view-card-restructure

**Date:** 2026-09-09
**Branch:** worktree-portfolio-list-view-card-restructure → main

## What was done

7 commits:

- `43313aa` docs: brief + design spec for portfolio list view card restructure
- `690ac22` docs: implementation plan for portfolio list view card restructure
- `3867138` feat: reduce portfolio list-view cards to identity + totals, single entry button
- `3c001a6` feat: relocate Load Actuals and Summary toggle to project detail page
- `c95d166` feat: lay out portfolio list-view project cards in a 2-column grid
- `96ee7b6` fix: align variance color convention between list and detail views; remove dead monthly-cell helpers
- `0df4f8a` fix: redraw burndown chart after detail-page actuals upload; always-navigable project switcher; drop dead totalPtc field

Restructured `portfolio.html`'s list/overview view: the user, reviewing the product as an actual analyst, reported never reading the per-project monthly Estimated/Spent/Variance table shown on each card — always clicking through to the detail page for real numbers. Went through the full process: a Brief (evolution of an existing feature) → brainstorming, including a visual-companion browser session comparing 3 card layouts, program-group nesting, and 1-vs-2-vs-3-column grid density with the user → a written design spec → a 4-task implementation plan → subagent-driven-development execution (one implementer + one dedicated task-reviewer subagent per task, all four passed clean) → the coordinator's own live browser verification (isolated `scripts/test-branch.sh` stack, a freshly bootstrapped test admin) after the grid (Task 3) and the color-parity (Task 4) tasks.

Each project card (grouped-program-child and ungrouped) now shows only identity (title, code, pipeline/status badges, an actuals-availability badge relabeled `No actuals available`, was `no XLS data`) plus a compact stats row (Duration, Sold, Spent, colored Variance) — no monthly table, no PTC column. The single remaining action, `Open project →`, is always enabled (was disabled with no actuals) since it's now the only path into the detail page, which gained the buttons dropped from the card (`📂 Load Actuals`, `＋/✓ Summary` — `⚙️ Configure` deliberately not duplicated back onto the card, per explicit user decision). Cards lay out in a 2-column Bootstrap grid (`row g-3`/`col-md-6`/`col-12`, no new CSS anywhere), with a program group spanning the full row and its children in their own nested 2-column grid.

## Code review follow-ups

**Round 1** (whole-branch review, run after all 4 tasks' own per-task reviews had already passed clean) found 2 Important + several Minor issues; all 2 Important + 1 Minor were fixed in the same cycle (commit `0df4f8a`, live-verified where practical):
- Important, fixed: the Chart.js burndown chart on the detail page went stale after an actuals upload that happened without leaving that page — a path the relocation of Load Actuals created that couldn't exist before. Fixed with an explicit `$nextTick(() => this.renderBurndownChart())` after upload when already on the dashboard view.
- Important, fixed, with an added requirement from the user: the detail page's own project-switcher dropdown still disabled siblings with no actuals — the exact restriction this whole redesign removed everywhere else. Fixed to make every sibling navigable; the user additionally asked, while approving this fix, that the dropdown's fallback label (previously the raw DB UUID when a project had no `name`) show the project's own code instead — implemented as `s.name || s.code || s.id}`.
- Minor, fixed: `cardData()`'s returned object still carried a `totalPtc` field with no remaining consumer once Task 1 removed the PTC table column. Dropped, consistent with Task 4's own `months`/`monthSpend` trim.

Three Minor items from round 1 were reviewed and explicitly left as-is (not defects, no action requested): an unreachable zero-residual edge case where list/detail color could theoretically disagree; a possible ~4px cosmetic grid-gutter bleed inside expanded program blocks (not confirmed live); no visible progress feedback on the relocated Load Actuals button (pre-existing limitation, not introduced by this branch). A fourth — the "Sold" label on the card showing `totalPhasing` (estimated budget) while "Sold" elsewhere on the page means sold-hours × rate — was raised explicitly to the user as a labeling question; the user confirmed the spec's own wording is fine as-is.

**Round 2** (re-review of the fix commit + a final full-branch sanity pass) came back clean — all 3 fixes verified correct line-by-line, no regressions, no new findings. Ready to merge.

## Roadmap notes

- The Program Summary tables and the pinned Budget Summary panel (out of scope for this cycle, per the design spec) still show the full monthly breakdown this cycle removed from individual project cards — unchanged, by design.
- The ⚙️ Configure list-card shortcut was deliberately not kept (user's explicit call, "va bene senza Configure in card") — worth remembering if a future request asks to "add Configure back to the list", since this was a considered decision, not an oversight.
- Unpinning a project from the Budget Summary panel now requires navigating into that project's own detail page (the `＋/✓ Summary` toggle moved there) — a spec-sanctioned consequence of the relocation, flagged by round-1 review as the one place this redesign costs a round-trip the old layout didn't have. Not acted on this cycle; worth reconsidering if it turns out to be a genuine friction point in practice.

## Sync-docs outcome

- **CLAUDE.md** — updated: `portfolio.html`'s file-tree entry gained a full paragraph documenting the 2026-09 card restructure (content, grid, relocated actions, color-parity fix, dead-code cleanup) — the primary source of truth for the change, everything else below is deliberately terser and points back here.
- **ARCHITECTURE.md** — updated: `portfolio.html`'s entry gained a one-line pointer to the restructure, deferring detail to CLAUDE.md (this file's own convention is high-level, not per-change granularity).
- **PRD.md** — updated (user-visible behavior changed, squarely in scope per the PRD trigger rule): §6.1 Portfolio Overview rewritten — "Purpose" now reflects the redesign's rationale, "Per-project card actions" split into the new card's single action vs. the detail-page's relocated actions, a new grid bullet added under "View features"; §18.3's viewer-enforcement table corrected (Configure/Load Actuals moved from "portfolio view" row to "single-project view" row, since the list card no longer carries either); §7.1's Load Actuals cross-reference corrected to point at the actual single-project detail view rather than a stale "portfolio-view button" description.
- **TEST_CASES.md** / **test-cases.html** — updated in lockstep: R-01/R-04/R-09 corrected for the new card/grid/relocated-actions behavior, R-13 through R-17 added (card content, always-enabled entry button, detail-page relocated actions, color parity, always-navigable project switcher), SH-10 corrected to describe the detail-page location for Configure/Load Actuals instead of the list card.
- **test-api.js** — not touched: no API/auth change, this cycle is frontend-only.
- **docs/superpowers/PROCESS.md** — not touched: gate evaluated as none of the 3 conditions apply (no process-skill change, no recurring exception introduced, no change to the 7-phase skeleton or scenario guardrails).
