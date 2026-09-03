# Finish-cycle report — worktree-timesheets-fee-pipeline-year

**Date:** 2026-09-03
**Branch:** worktree-timesheets-fee-pipeline-year → main

## What was done

14 commits:

- `93576e8` docs: add brief + design for timesheets Fee/Spent, pipeline-year filter, XLSX export
- `469d43d` docs: add implementation plan for timesheets Fee/Spent, pipeline-year filter, XLSX export
- `7928c05` feat: add pure fee-resolution helper for timesheet entries
- `f3ee097` feat: snapshot resolved fee onto each timesheet entry at upload time
- `16cb8de` feat: return client, project, currency and pipeline year on GET /api/timesheets
- `46396ce` feat: add client/project/pipeline-year columns, filters and sorting to Timesheets
- `299bfa7` feat: add Fee/Spent to Timesheets View grid and replace CSV export with XLSX
- `9523c51` fix: resolve final review findings — projects.code non-uniqueness, task ordering, object URL leak
- `357e409` chore: add api/package-lock.json
- `8031708` feat: name XLSX export as Client_Project_Code_YYYYMMDD.xlsx
- `7f0e87c` fix: resolve code-review findings — dedupe duplicate project codes on upload, scope project-name lookup to visibility
- `f20cded` fix: scope upload-time fee resolution to uploader visibility, parallelize page-load API calls
- `abebb27` fix: parallelize timesheets list fetch with pipeline-years/currencies
- `3dd78c2` refactor: extract shared project-visibility SQL predicate helper

**Feature summary:** the Timesheets admin page (`timesheets.html`) summary table gained Client/Project/Project-code columns (checkbox multi-select filters on Client/Project, free-text on Project code, click-to-sort on all three), a pipeline-year selector (default current/most-recent active year, plus an explicit "All years"), and the "View" modal grid gained Fee/Spent columns fed by a `fee` value snapshotted once at upload time (`api/src/lib/rate-resolve.js`'s `resolveFee()`, a backend port of `js/core.js`'s `findRate()`). The CSV export was replaced by an XLSX export (ExcelJS), named `Client_Project_ProjectCode_YYYYMMDD.xlsx`. `projects.code`'s lack of a uniqueness constraint was identified as a real risk during the final review and code-review loop and fixed with a shared `projectVisibilityPredicate()` SQL helper, applied consistently to `GET /api/timesheets`, the upload-time fee-resolution lookup, and the existing `visibleCodes()` check, so a duplicate code can never leak another user's inaccessible project's name, currency, or hourly rates.

## Code review follow-ups

- **Round 5 (accepted, not fixed):** if a single user genuinely has two *visible* projects sharing the same `project_code` (not observed in real data), the earlier-created one is picked arbitrarily for name/currency/fee resolution — could show the wrong currency. `projects.code` non-uniqueness is a pre-existing, wider data-modeling gap; this branch closes the security-relevant case (an *invisible* project's data leaking) but not this narrower visible-duplicate ambiguity.
- **Round 5 (accepted, not fixed):** the XLSX export writes Fee/Spent as raw numbers with no currency symbol/column, while the on-page "View" modal shows them with `fmtMoney`'s currency symbol — evaluated during the final whole-branch review and judged acceptable for a spreadsheet numeric column; flagged again in round 5 as a minor inconsistency for files that get shared externally.
- **Round 5 (out of scope, not fixed):** `api/src/routes/exports.js` and `api/src/routes/reporting.js` each carry their own independent, pre-existing inline copy of a similar owner/share visibility check, not unified with the new `projectVisibilityPredicate()` helper — those files are untouched by this branch's diff; a future audit cycle is the right place to consolidate all of this codebase's visibility-predicate copies, not a one-off addition here.
- **Round 5 (accepted, not fixed):** `projectVisibilityPredicate()`'s API takes raw bound-parameter placeholder strings (`'$2'`, `'$3'`) from each call site rather than owning its own parameter binding — a future edit that reorders a query's parameters could silently mis-bind the predicate. Real but minor with only 3 call sites, all in one file, easily audited; noted for awareness rather than fixed now.

## Roadmap notes

- Two transient `500 Internal Server Error` responses were observed from `nginx` on `scripts/test-branch.sh`'s stack shortly after `up` (an `auth_request unexpected status: 404` error in the nginx logs — the auth-check backend not ready yet), both times self-resolving on a retry a few seconds later. Not caused by this branch's diff (nginx.conf untouched); worth a look if it recurs often enough to be disruptive, but not investigated further here since it's pre-existing test-branch infrastructure behavior, not a product bug.
- `projects.code` has no DB-level uniqueness constraint (`012_project_code.sql`) and multiple existing queries across the codebase (`GET /api/timesheets`, the timesheets upload's fee resolution, `api/src/routes/exports.js`, `api/src/routes/reporting.js`, the pre-existing `/all-data` endpoint) all resolve "the" project for a code independently, with inconsistent (or no) tie-breaking/visibility rules. This cycle fixed the two instances it touched; a dedicated audit of every `projects.code` join in the codebase would be worthwhile to confirm none of the untouched ones have the same latent leak this cycle found and fixed.
- `timesheets.html` had zero PRD.md coverage before this cycle (only the upload mechanics were documented, not the management page itself) — filled in as part of this cycle's doc sync (PRD.md §8.4), but worth noting the gap existed independent of this feature.

## Sync-docs outcome

- **ARCHITECTURE.md** — updated: §5.8 (`timesheets` schema, new `fee` JSONB field and its resolution/visibility logic), the `GET /api/timesheets` API Reference row, and the `timesheets.html` file-tree entry.
- **CLAUDE.md** — updated: the `timesheets.html` and `api/src/routes/timesheets.js` file-tree entries (columns/filters/sort/year, Fee/Spent, XLSX export, `projectVisibilityPredicate()`), and a new `api/src/lib/rate-resolve.js` entry.
- **TEST_CASES.md** / **test-cases.html** — updated in lockstep: corrected TS-02 (previously described a navigation to `/portfolio.html?projectId=...` that doesn't match the actual View-modal behavior — a pre-existing doc/code drift unrelated to this branch, found and fixed while in this section); added TS-12 through TS-18 covering filters, sorting, the pipeline-year selector, Fee/Spent, the XLSX export, and the duplicate-project-code visibility scenario.
- **test-api.js** — not touched: no new API endpoints were added and no auth rule changed (`requireAuth` unchanged on both touched routes), so the trigger condition for this file doesn't apply.
- **PRD.md** — updated: this cycle's changes are user-visible (new columns, filters, sorting, year selector, Fee/Spent display, XLSX export replacing CSV), so PRD.md was in scope. Added a note to §8.3 on the fee snapshot behavior, and a new §8.4 documenting the `/timesheets.html` management page itself, which previously had no dedicated PRD section at all.
- **docs/superpowers/PROCESS.md** — not touched: gate evaluated as **none of the 3 conditions apply** (no process-skill change, no recurring process exception introduced, no change to the 7-phase skeleton or scenario guardrails).
