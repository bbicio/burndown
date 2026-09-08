# Finish-cycle report — worktree-project-config-confirm-guard-fix

**Date:** 2026-09-08
**Branch:** worktree-project-config-confirm-guard-fix → main

## What was done

4 commits:

- `0e34d99` fix: guard confirmModalOk() against a fast repeat click, auto-clear Delete/Download actuals error messages
- `7781301` refactor: extract flashActualsStatus() helper, fix upload-failure path missing auto-clear
- `df87dc7` fix: restore upload-success auto-clear timing (start the 4s timer after loadActuals/updateReforecastVisibility settle, not before)
- `9e833c9` fix: cancel any pending actuals-status auto-clear timer before scheduling a new one, to avoid an earlier flash wiping a later one

Follows a cold review of `worktree-timesheets-delete-auth-fix` (merged earlier the same day) that found two remaining real gaps on `project-config.html`, one of which (the missing general double-submit guard) turned out to be the more valuable fix of the two: this page's own local `showConfirm()`/`confirmModalOk()` — a Promise-based implementation structurally different from `js/core.js`'s callback-based `showConfirm()`, not a caller of it — had no protection against a fast repeat click on the shared `#confirmModal`'s Confirm button. `js/core.js`'s own `showConfirm()` already carries this exact guard (documented in `CLAUDE.md` as protecting "dozens of call sites at once"), but this page's local reimplementation never got it. Added a `_confirmClicked` flag mirroring that established idiom — it now protects all ~9 `showConfirm()` call sites on this page (PTC/task/resource removal, Delete actuals, phasing-empty-warning, reforecast confirms), not just the one flagged by the cold review.

The second flagged gap — Delete/Download actuals error messages not auto-clearing like their success counterparts do — led to consolidating all actuals status-message handling into one `flashActualsStatus()` helper. This surfaced two further bugs during implementation, each caught by a subsequent task-scoped `/code-review medium` round and fixed in the same cycle:
- Centralizing the timer broke the pre-existing upload-success timing (the auto-clear must start only after the post-upload `loadActuals()`/`updateReforecastVisibility()` reload settles, not immediately) — fixed by keeping that one call site's timer scheduling manual, while still tracking it through the same shared timer-id field so it composes with the helper.
- The straightforward "one shared setTimeout" implementation had a genuine race: two flashes within 4 seconds of each other could have the first's timer clear the second's still-fresh message early. Fixed by tracking the timer id and `clearTimeout`-ing any pending one before scheduling a new one — verified live by triggering two Delete-actuals confirmations back-to-back and confirming the second message survived its own full 4-second window.

## Code review follow-ups

None open — 4 review rounds were run across this cycle (one per commit), each finding real issues in the round it caught, each fixed in the same cycle, converging to a clean `[]` result on the 4th pass.

## Roadmap notes

None new. This cycle only touched `project-config.html`'s frontend robustness (confirm-dialog and status-message handling); it did not touch the backend or any of the previously-logged open roadmap items (new-project creation never persisting; `visibleCodes()` admin-branch 403-after-delete — both from `docs/superpowers/reports/2026-09-07-worktree-project-config-actuals-block-finish-cycle.md`, still open).

One pre-existing, unworsened concurrency gap was noted during the final code-review round and deliberately left alone: `showConfirm()`'s `_confirmClicked`/`_confirmResolve`/`_confirmAccepted` are shared instance state rather than per-call closures (unlike `js/core.js`'s pattern, which captures fresh closure state per invocation). Two genuinely overlapping `showConfirm()` calls from two different UI actions in rapid succession could in theory cross-wire which callback resolves which promise — but this predates this cycle's changes entirely (the underlying `_confirmResolve`/`_confirmAccepted` fields already existed) and this fix doesn't introduce or worsen it. Not logged as a new roadmap item since it's not new; flagged here only for visibility.

## Sync-docs outcome

- **CLAUDE.md** — updated: `project-config.html`'s entry now documents the `_confirmClicked` guard (and its broader-than-Delete-actuals reach, all ~9 call sites), the `flashActualsStatus()` helper, and the upload-success path's special timer-composition handling.
- **TEST_CASES.md** / **test-cases.html** — updated in lockstep: added PC-19 (non-admin Delete actuals succeeds — closing the loop on the previous cycle's fix, which had no test-case coverage added at the time) and PC-20 (any confirm dialog on this page ignores a fast repeat click on Confirm).
- **PRD.md** — not touched: this cycle is entirely internal robustness (race-condition and double-submit fixes) with no change to what a user can do, see, or configure.
- **test-api.js** — not touched: no backend/API change in this cycle.
- **ARCHITECTURE.md** — not touched: no schema/API/architectural-pattern change.
- **docs/superpowers/PROCESS.md** — not touched: gate evaluated as none of the 3 conditions apply.
