# Finish-cycle report — worktree-planning-refresh-fix

**Date:** 2026-09-30
**Branch:** worktree-planning-refresh-fix → main (merge `1a42c01`)

## What was done

- `bf25248` fix: planning.html recomputes project lists after config loads (empty Planning regression)

Cause: the `taProjectOptions` watcher added in `10e383e` (cycle "UI defects that mislead or lose data") evaluated `eligibleProjects` at component creation, before `loadConfigFromApi()` finished. `config` is a non-reactive global and the computed depends only on `refreshTick`, so the empty result stayed cached and Planning sent `projectIds: []`. Fix: `this.refreshTick++` in `created()` right after the loaders finish. It was found when the real-data Team assistant checks were attempted on the main stack; the same symptom had been misread as "no data" during the earlier Gate 2 of that cycle.

Gates: 1 passed (269 tests; no `api/` change); 2 verified in the browser by the user (Planning shows data, selection reset on filter change, IME Enter); 3 no findings; 4 merged with a merge commit, no migration, no backend restart.

## Code review follow-ups

None.

## Roadmap notes

- Lesson: a watcher (or any eager consumer) on a computed that reads the non-reactive global `config` forces early evaluation; such computeds must depend on `refreshTick` and be recomputed after loads. No automated test covers page lifecycle in `planning.html`.
- Still open: real-LLM chat check (PA-M1..M3) on the main stack (Planning now has data, so it can be run), `project-config.html` `onSave` swallowing sync errors, native `alert()`/`confirm` and hex colours (deferred consistency point).

## Sync-docs outcome

Updated: `docs/pages/planning.md` (regression and fix note; the Team assistant checks marked verified), `TEST_CASES.md` (PA-M7/PA-M8 marked verified, PA-M9 added). Not changed: `CLAUDE.md`, `ARCHITECTURE.md`, `PRD.md` (internal fix restoring documented behaviour), `test-cases.html` (has no PA section), `test-api.js`. PRD.md: not necessary. PROCESS.md gate: none of the three conditions applied.

## Memory outcome

- `project_ui_defects_cycle_deferred_check.md`: deleted (its deferred check was done); its `MEMORY.md` line removed.
- `project_next_cycle_ui_defects_consistency.md`: the pointer to that memory replaced by "DONE 2026-09-30 … merge `1a42c01`".
