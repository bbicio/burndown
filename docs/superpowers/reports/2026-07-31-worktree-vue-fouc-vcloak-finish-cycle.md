# Finish-cycle report — worktree-vue-fouc-vcloak

**Date:** 2026-07-31
**Branch:** worktree-vue-fouc-vcloak → main

## What was done

3 commits, merged via `--no-ff` (main had not diverged since branch-off, so this was a fast-forward-eligible merge forced into a merge commit per process):

- `61824d3` fix: eliminate repo-wide FOUC via v-cloak on all 13 Vue pages
- `6078bc2` fix: add !important to [v-cloak] rule so it overrides pipeline.html's inline display:flex
- `b9b7896` fix: address Gate-3 code review findings for v-cloak fix

This is a repo-wide fix for a FOUC (flash of uncompiled Vue template markup) issue first surfaced live during the `pipeline-version-management` cycle's Gate 2 manual verification — tracked separately from the `vue-migration-roadmap-cold-review` backlog per explicit user request, since the user had noticed the same flash on other pages too and wanted a centralized, repo-wide fix rather than a page-local patch.

No page in the repo used Vue's `v-cloak` directive, so the browser briefly painted raw, uncompiled template markup — all `v-if`/`v-else-if`/`v-else` branches simultaneously, literal `{{ }}` expressions — before each page's runtime-compiled Vue instance mounted. Fixed by adding `[v-cloak] { display: none; }` to `css/tokens.css` and a `v-cloak` attribute to each of the 13 Vue-mounted pages' actual root mount element (carefully distinguishing them from two dead, already-hidden placeholder `<div>`s on `costgrid.html`/`planning.html` that share ID names with other pages' real roots), plus a cache-bust version bump on all 13 pages so browsers pick up the new CSS.

During Task 1's own execution, the implementer discovered that `pipeline.html`'s real Vue root has a conflicting inline `style="...display:flex..."` attribute — inline styles beat external stylesheet rules in CSS specificity, so the plain `[v-cloak]` rule would not actually hide that one page during mount. Fixed in a second commit by adding `!important` to the rule (a real, user-approved finding surfaced mid-execution, not deferred).

## Code review follow-ups

Gate 3 (full 8-angle review, given the number of files touched — 14 — and the tricky dead-stub-avoidance requirement) found 6 items. 3 were fixed in this cycle (commit `b9b7896`, independently re-verified by the controller and re-tested live in the browser); 1 was explicitly accepted as follow-up because fixing it would violate this cycle's own Brief scope constraint:

- **Round 1, fixed (Altitude):** the global `!important` added in the second commit was a blunt fix for a single-page conflict (`pipeline.html`'s inline `display:flex`). Fixed properly at the source: extracted the inline style into a new `.pb-board-root` class in `css/style.css`, then removed `!important` from the `[v-cloak]` rule entirely — the plain rule now wins via normal cascade on all 13 pages.
- **Round 1, fixed with revised scope (Conventions):** the original finding said the `[v-cloak]` rule belongs in `css/style.css` per `CLAUDE.md`'s documented tokens/style split (tokens.css = design-token values only). Investigated during the fix attempt: 4 of the 13 `v-cloak`'d pages (`activate.html`, `login.html`, `reset-password.html`, `terms.html`) load only `tokens.css`, not `style.css` — moving the rule would have silently disabled the fix on those 4 pages. User was asked and explicitly chose to keep the rule in `tokens.css` as an accepted, documented convention deviation, fixing only the (now-unnecessary, thanks to the Altitude fix above) `!important`.
- **Round 1, fixed (Cross-file):** `js/costgrid.js`'s `cgHideAll()` and `js/portfolio.js`'s `showPortfolioPlanningView()` both directly set `style.display = 'none'` on the same element IDs now used as `v-cloak`'d Vue roots — confirmed both call paths are fully unreachable dead code today, but a latent risk if ever reactivated. Added a defensive comment directly above `cgHideAll()`'s definition explaining the risk (per explicit scope: only this one function's comment, not `js/portfolio.js`, per the original finding's own scope note).
- **Round 1, accepted as follow-up (Efficiency):** hiding the whole app root via `v-cloak` lengthens the "blank screen" window on slow connections, since each page loads ~15 synchronous, non-`defer`/`async` scripts (including 2 cross-origin CDN fetches) before Vue can mount and remove the cloak — previously that same window showed FOUC (something painted, if wrong) rather than a blank page. Fixing this would require adding `defer`/`async` to script tags across all 13 pages — a change to loading/script sequencing this cycle's own Brief explicitly excludes ("Any change to how/when any page's Vue instance loads its data... this Brief only hides pre-mount raw markup, it does not change loading sequencing"). User explicitly confirmed accepting this as a known, acceptable tradeoff rather than expanding scope.

All 3 applied fixes were independently verified by the controller (direct diff inspection) and then re-tested live in the browser (network-throttled reloads on `pipeline.html` confirming the extracted class renders identically and the flash stays gone without `!important`; `admin.html`/`costgrid.html`/`planning.html` confirming the plain rule still works everywhere; the four `tokens.css`-only pages confirmed unaffected; the original `costgrid.html` Publish-reload flash re-confirmed gone).

## Roadmap notes

- This closes the FOUC/`v-cloak` finding tracked separately from the cold-review backlog.
- The Efficiency follow-up (blank-screen window length on slow connections due to non-deferred scripts) remains open — a future cycle could investigate adding `defer` to non-order-dependent `<script>` tags across the 13 Vue pages, but this is a distinct, larger scope than this cycle's (touches script loading order/timing on every page, needs its own careful verification pass).
- Remaining backlog from the original `vue-migration-roadmap-cold-review`, still unscheduled: the two Cycle B2 follow-ups (session-expiry race in Clone's structure-load warning, `showConfirm()` OK/Cancel affordance mismatch).
- Also still open from a broader backlog review earlier in this session (not part of any cold-review cycle): missing sold-hours input validation; `js/ai.js`'s divergent, case-sensitive task/role matching logic; orphaned `_resolveCgIdForVersion()` (`js/api-sync.js:205`, confirmed zero callers); XLS column-mapping keyword-breadth ambiguity; stale "role" wording in the "To be planned" tooltip; a known `/finish-cycle` Gate 2 blind spot (can't find spec/plan files committed to `main` before the branch existed); and the confirmed-dead-weight `xlsx@0.18.5` CDN library on `costgrid.html`/`planning.html`, never referenced by any client-side JS (surfaced during the Export XLS cycle's investigation).

## Sync-docs outcome

- **CLAUDE.md**: added a new "`v-cloak` (all Vue pages, 2026-07)" architectural section documenting the pattern and the convention for future Vue pages; updated the `css/tokens.css`/`css/style.css` file-structure entries with the specific rules each now carries and why.
- **ARCHITECTURE.md**: mirrored the same file-tree annotations for `tokens.css`/`style.css`.
- **TEST_CASES.md** / **test-cases.html**: not touched — this is a page-load-timing/visual fix with no discrete, repeatable manual test case that fits this format's structure ("no flash" isn't a checkable step/expected-result pair in the usual sense).
- **PRD.md**: evaluated, not necessary — purely an internal rendering-timing fix, no user-facing feature or flow change.
- **test-api.js**: not touched — no API endpoint or auth changes.
- **PROCESS.md gate**: none of the three trigger conditions applied (no process-skill change; the full 8-angle Gate-3 review here was a deliberate per-cycle choice given the diff's size, not a recurring exception; no change to the 7-phase skeleton or scenario guardrails). Not touched.
