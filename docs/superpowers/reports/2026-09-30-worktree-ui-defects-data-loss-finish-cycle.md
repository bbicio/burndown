# Finish-cycle report — worktree-ui-defects-data-loss

**Date:** 2026-09-30
**Branch:** worktree-ui-defects-data-loss → main (merge `8fa3aa6`)

## What was done

- `10e383e` fix: team assistant resets selection when filtered out, ignores IME Enter
- `226468c` feat: warn before leaving project-config with unsaved changes
- `b4f249d` fix: show Programs tab again and correct the delete confirmation text

Spec `docs/superpowers/specs/2026-09-30-ui-defects-data-loss-design.md`, plan `docs/superpowers/plans/2026-09-30-ui-defects-data-loss.md`. Settings features (incl. Restore from Backup) were excluded by the user from this and all other cycles; a dedicated future cycle will review/delete them.

Gates: 1 passed (269 tests; no `api/` change, so `run-tests.sh` skipped); 2 isolated stack verified by the user for cases 1–2, case 3 deferred; 3 no findings; 4 merged with a merge commit, no migration, no backend restart.

## Code review follow-ups

None.

## Roadmap notes

- **Not verified in a browser:** Team assistant wiring in `planning.html` (selection reset when a filter removes the project; IME Enter) — Planning had no data in the test stack. Unit tests cover the pure helpers only. Test cases PA-M7/PA-M8.
- `project-config.html` `onSave` swallows `_pushProjectToApi` errors and redirects anyway, so a failed sync looks like a success (excluded from this cycle; surfaced by the code review too).
- Program delete still uses a native `confirm()` (deferred point 2).
- Settings features to be reviewed/deleted in a dedicated cycle.

## Sync-docs outcome

Updated: `PRD.md` (unsaved-changes warning, Programs tab restored, delete confirm text), `.claude/skills/operational-manual/SKILL.md` reference (same three points), `TEST_CASES.md` and `test-cases.html` (CN-02 updated, CN-07/CN-08 added; `TEST_CASES.md` also PC-21/PC-22, PA-M7/PA-M8 — `test-cases.html` has no PC/PA sections), `docs/pages/config.md`, `docs/pages/project-config.md`, `docs/pages/planning.md`, `docs/js/lib.md`. Not changed: `CLAUDE.md`/`ARCHITECTURE.md` (no file, endpoint, module or migration added; per-page detail routed to `docs/pages/`), `test-api.js` (no API change). PRD.md: updated. PROCESS.md gate: none of the three conditions applied.

## Memory outcome

- `project_next_cycle_ui_defects_consistency.md`: "next cycle, not started" → MERGED 2026-09-30 (`8fa3aa6`), report path, open items.
- `MEMORY.md`: hook line for that file updated; line for `project_ui_defects_cycle_deferred_check.md` added (new memory: the deferred browser check).
- Left as is: `project_team_ux_backlog.md` (unverified whether its NEXT order changed).
