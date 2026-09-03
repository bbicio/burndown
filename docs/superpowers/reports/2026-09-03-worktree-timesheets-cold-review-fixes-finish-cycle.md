# Finish-cycle report — worktree-timesheets-cold-review-fixes

**Date:** 2026-09-03
**Branch:** worktree-timesheets-cold-review-fixes → main

## What was done

1 commit:

- `253fe2e` fix: defer XLSX export object-URL revocation to avoid canceling the download on some browsers

Follows a cold review of the previous cycle (`worktree-timesheets-fee-pipeline-year`, merged earlier the same day) that flagged `timesheets.html`'s `downloadXlsx()` calling `URL.revokeObjectURL(a.href)` synchronously right after `a.click()` — on Safari and some older Firefox/Chromium builds the click-to-download hand-off is asynchronous, so a synchronous revoke can invalidate the blob before the download actually starts. Fixed by deferring the revoke one tick via `setTimeout(() => URL.revokeObjectURL(a.href), 0)`.

The same cold review raised a second candidate finding — that the pipeline-year default selection and dropdown in `timesheets.html` don't filter by `pipeline_years.active` — but investigation before touching any code showed this is **not a bug**: `pipeline.html`'s own default-year resolution (the pattern this page was explicitly built to match) also never filters by `active` for admins, and `GET /api/pipeline-years`'s server-side `active`-only filter only ever applies to non-admins — a case this admin-only page never hits. The implementation is correct and consistent with the established pattern; only the design doc's prose ("tra i pipeline years attivi") was imprecise. `CLAUDE.md`'s `timesheets.html` entry was corrected to describe the actual, intentional behavior instead of repeating that imprecise wording, to prevent a future review from re-raising the same false positive.

## Code review follow-ups

- **(deferred, out of scope):** the same synchronous-revoke-after-click pattern this fix corrects in `timesheets.html` still exists, unfixed, in `js/costgrid.js` (`cgExportXls`, `cgExportAll`), `planning.html`, `js/settings.js`, and `project-config.html`. A future cycle extracting a shared download helper (or applying the same one-line deferred-revoke fix at each site) would close this class of bug everywhere at once, rather than one file at a time.

## Roadmap notes

- `projects.code`'s lack of a DB-level uniqueness constraint remains a known, only-partially-audited area (see the previous cycle's own report) — this cycle didn't touch it further.
- The transient nginx `auth_request unexpected status: 404` → `500` seen intermittently on `scripts/test-branch.sh up` (self-resolving on retry) recurred again during this cycle's manual verification. Still not investigated — noted again since it's now been observed on two separate cycles in the same day.

## Sync-docs outcome

- **CLAUDE.md** — updated: corrected the `timesheets.html` entry's pipeline-year default-selection description (previously implied an `active`-only filter that was never actually implemented, matching a design-doc wording imprecision rather than a real gap — investigated and confirmed intentional/correct, not fixed), and added a note on the deferred `URL.revokeObjectURL` fix plus the unfixed sibling instances of the same pattern elsewhere in the codebase.
- **ARCHITECTURE.md** — not touched: no architectural change (single-line client-side timing fix).
- **PRD.md** — evaluated, not updated: this is a reliability fix (a download that could silently fail on some browsers now works reliably) with no change to what a user can do, see, or configure — internal-only per the PRD.md trigger rule.
- **TEST_CASES.md** / **test-cases.html** — not touched: TS-17 ("XLSX export replaces CSV", added in the previous cycle) already covers "click ⬇ XLSX → file downloads"; this fix makes that existing case's guarantee hold on more browsers, it doesn't add a new user-facing scenario to test.
- **test-api.js** — not touched: no API endpoint or auth change.
- **docs/superpowers/PROCESS.md** — not touched: gate evaluated as none of the 3 conditions apply.
