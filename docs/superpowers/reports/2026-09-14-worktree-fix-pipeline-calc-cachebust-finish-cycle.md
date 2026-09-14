# Finish-cycle report — worktree-fix-pipeline-calc-cachebust

**Date:** 2026-09-14
**Branch:** worktree-fix-pipeline-calc-cachebust → main

## What was done

1 commit (unplanned production bugfix, no Brief/spec/plan):

- `4140ef7` fix: bump stale cache-bust versions for pipeline-calc.js, style.css, nav.js

Fixes a production error reported by the user: `ReferenceError: pbCardMatchesFilters is not defined` in `pipeline.html`'s Vue `stagesData` computed property, thrown immediately after the `pipeline-filters` cycle was merged. Root cause: `pipeline.html` loaded `js/lib/pipeline-calc.js?v=1`, but the `pipeline-filters` cycle added `pbPriceBucketKey`/`pbCardMatchesFilters` to that file without bumping the `?v=` reference — browsers that had already cached the `?v=1` response kept serving the pre-feature file, which doesn't define those functions. Fixed by bumping the tag to `?v=2`.

While scoping this fix, a structurally identical, already-merged, previously unreported instance of the same bug class was found: `css/style.css` and `js/nav.js` were both modified in the earlier `nav-admin-dropdown` cycle without their own `?v=N` ever being bumped, stale across all 10 authenticated HTML pages that load them. Bumped both (`style.css` → `?v=11`, `nav.js` → `?v=6`) across all 10 pages in the same cycle, since it's the same root cause and a mechanically simple, low-risk change — confirmed with the user before including it.

## Code review follow-ups

Round 1 (`general-purpose` subagent, medium effort, scoped to `main..HEAD`): 0 findings. Verified via full-repo grep that all 10 pages consistently reference the new version numbers with no stragglers, and that the diff contains only version-string bumps — no stray encoding/whitespace changes, no unrelated tag edits.

## Roadmap notes

- This worktree had no `.env` file (gitignored, doesn't propagate to new worktrees) — had to be copied from the main checkout before `scripts/test-branch.sh up` would work. Not a code defect, just a one-time per-worktree setup step worth remembering for future cycles.
- The isolated test-branch stack cloned data from the running main stack (via `pg_dump`/`pg_restore`), so the script's own bootstrapped `test-branch@pdash.local` admin account didn't exist in the cloned DB. A separate `verify-test@pdash.local` admin was created directly via `create-admin.js` against the isolated test-branch API container for manual verification — this only touched the isolated stack, never production.
- Documented the `?v=N` cache-busting convention in `CLAUDE.md` for the first time (see Sync-docs outcome) — this exact gap has now caused two separate production bugs across two cycles, and was previously undocumented anywhere in the project's own architecture notes.

## Sync-docs outcome

- **CLAUDE.md** — updated: added a new "Cache-busting (`?v=N` query strings)" subsection (after "Script loading order") documenting the convention, both production incidents it has caused, and an explicit rule for future changes (grep the repo for every reference to a versioned file before merging, bump all of them together).
- **TEST_CASES.md** + **test-cases.html** — not updated: this fix has no new observable user-facing behavior to test: it restores already-documented, already-tested functionality (the pipeline board's filter bar) to actually work as shipped. The underlying defect (stale browser cache) isn't something this project's manual-check test-case format can meaningfully capture.
- **test-api.js** — not touched: no API changes.
- **PRD.md** — evaluated, not updated: this is a bugfix, and the PRD's existing description of the filter feature was already accurate — the defect was a deployment/caching issue, not a spec mismatch, so per the sync-docs skill's own bugfix rule, PRD.md is left as-is.
- **PROCESS.md gate** — none of the three conditions applied (no process skill touched; no recurring process exception introduced; no change to the 7-phase skeleton or scenario guardrails) → `PROCESS.md` left untouched.
