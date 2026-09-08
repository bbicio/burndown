# Finish-cycle report — worktree-timesheets-delete-auth-fix

**Date:** 2026-09-08
**Branch:** worktree-timesheets-delete-auth-fix → main

## What was done

1 commit:

- `6247c18` fix: correct DELETE /api/timesheets/:projectCode non-admin auth check to match project code, not name; add double-submit guard and export error handling to Delete/Download actuals

Follows a cold review of the previous cycle (`worktree-project-config-actuals-block`, merged 2026-09-07) that re-confirmed and escalated the severity of a roadmap item already logged in that cycle's own report: `api/src/routes/timesheets.js:212`'s `DELETE /:projectCode` non-admin authorization check compared the route's `:projectCode` parameter against `projects.name` instead of `projects.code`. Every non-admin owner/editor clicking the newly-shipped `🗑 Delete actuals` button on `project-config.html` got a 403 "Access denied" — the feature was effectively broken for anyone but an admin, since `timesheets.html`'s own delete button (the only prior caller of this endpoint) is admin-only and never exercised this path.

Fixed with a one-column change (`p.name` → `p.code`). Live-verified: demoted a test user to `role='user'`, made them the `owner_id` of a project with existing timesheet data, logged in as that user, and confirmed `🗑 Delete actuals` now succeeds (DB query confirmed 0 rows remain afterward) — previously this exact flow 403'd.

Two smaller, related robustness gaps found by the same cold review were bundled into the same fix:
- `onDeleteActuals()` had no in-flight guard against a fast repeat click (unlike this file's own established `clientModal.saving`/`programModal.saving` convention) — added `actuals.deleting`, checked first, set before the request, cleared in `finally`, and wired to the button's `:disabled`.
- `downloadActualsXlsx()` had no `try/catch` around the ExcelJS workbook-build/blob/download steps — an ExcelJS runtime error would have been an unhandled rejection with zero user feedback. Added a `try/catch` surfacing failures via `actuals.status`, matching the file's existing error-message idiom.

## Code review follow-ups

None — the task-scoped `/code-review medium` pass after implementation returned zero findings (verified: the `actuals.deleting` guard's apparent race — a fast double-click before the flag is set — is not exploitable in practice, since `showConfirm()` synchronously raises a blocking Bootstrap modal backdrop before its Promise resolves, and JS's single-threaded execution means a second click can't reach the button again until that synchronous work completes).

## Roadmap notes

- **Resolved this cycle:** roadmap item 3 from `docs/superpowers/reports/2026-09-07-worktree-project-config-actuals-block-finish-cycle.md` (the `DELETE /:projectCode` `p.name`/`p.code` mismatch) is now fixed. Items 1 (new-project creation never persists) and 2 (`visibleCodes()` admin-branch 403 after a delete empties a project code) from that same report remain open and unaffected by this cycle.
- **New, minor:** `api/src/routes/timesheets.js`'s `DELETE /:projectCode` endpoint has zero automated coverage in `test-api.js` — this bug shipped and went unnoticed through the previous cycle's own task reviews and final review specifically because nothing exercises this endpoint as a non-admin. Adding real coverage would require standing up a non-admin session in `test-api.js` (invite/activate flow — no shortcut currently exists in that script for a second, non-admin user), which is more than this narrow fix cycle's scope justifies on its own. Flagged here rather than attempted partially; a natural fit for whichever future cycle addresses roadmap items 1/2 above, since all three live in the same file/endpoint family.

## Sync-docs outcome

- **CLAUDE.md** — updated: `api/src/routes/timesheets.js`'s entry now documents the `p.name`→`p.code` fix and its cause; `project-config.html`'s entry now documents the `actuals.deleting` guard and the export `try/catch`.
- **PRD.md** — not touched: this is a bugfix restoring already-documented intended behavior ("🗑 Delete actuals — permanently removes all imported actuals... after a confirmation prompt", added last cycle) — the PRD's description was accurate to intent, not to the buggy implementation, so no correction is needed per the PRD trigger rule.
- **TEST_CASES.md** / **test-cases.html** — not touched: PC-16 ("Delete actuals is a real, permanent delete") already describes the intended behavior this fix restores, without an admin/non-admin distinction that would need updating; it was never wrong, just unexercised for non-admins in practice.
- **test-api.js** — not touched, deliberately (see Roadmap notes above): the auth-rule fix qualifies for this file's trigger condition, but adding real regression coverage requires a non-admin session flow this script doesn't currently have, which is disproportionate scope for this fix. Logged as an explicit gap rather than silently skipped or partially attempted.
- **ARCHITECTURE.md** — not touched: no schema/API-shape/architectural-pattern change (a one-column bugfix and two client-side robustness guards).
- **docs/superpowers/PROCESS.md** — not touched: gate evaluated as none of the 3 conditions apply.
