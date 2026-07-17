# Finish-cycle report — worktree-alert-modal-retrofit

**Date:** 2026-07-17
**Branch:** worktree-alert-modal-retrofit → main

## What was done

3 commits:
- `f41a5be` refactor(db-reset): remove native alert(), standardize modal idiom
- `fb79c0b` refactor(project-config): showConfirm() becomes Promise-based
- `f71046d` refactor(project-config): remove remaining native alert() calls

A small follow-up cleanup cycle, itself a result of a cold cross-cycle review of the three completed Vue migrations (`terms.html`, `_db-reset.html`, `project-config.html` — see `docs/superpowers/reports/2026-07-16-worktree-project-config-vue-migration-finish-cycle.md`), removed every native `alert()`/`window.confirm()` from `_db-reset.html` and `project-config.html` in favor of reactive inline messages or the existing shared confirm modal, and standardized both files on the per-call `bootstrap.Modal.getOrCreateInstance()` idiom (`_db-reset.html` previously pre-instantiated its modal in `mounted()`).

`project-config.html`'s `showConfirm()` helper changed signature from `(message, onConfirm)` to `(message) → Promise<boolean>`, needed to preserve the blocking semantics of the `onSave()` empty-phasing "Save anyway?" confirmation (previously a native `window.confirm()`). Every existing caller (`confirmRemoveTask`/`Resource`/`Ptc`, `onClearData`, `derivePhasing`, `runReforecast`) migrated to the same `await`-based style — one consistent signature, no leftover callback-style call anywhere in the file.

No behavior change beyond presentation: every converted message keeps its exact original text, every guard that returned early still returns early, the empty-phasing save confirmation still blocks the save when declined.

## Code review follow-ups

None outstanding. Each of the 3 tasks was independently reviewed and approved (0 Critical/Important per task). The final whole-branch review (opus) also found 0 Critical/Important, confirming the goal of this cleanup cycle was substantively achieved — though it noted the four new error-message fields across the two files still show mild cosmetic styling drift (different alert-box padding, one field using plain text instead of a box) and one misleadingly-named internal variable (`_confirmResolve`, which is actually a flag-setter, not the Promise's own `resolve`). Both are cosmetic, not behavioral, and were left as-is per the review's own recommendation (not worth a follow-up cycle).

The Task 2 reviewer flagged a theoretical, currently-unreachable re-entrancy risk in `showConfirm()`'s Promise mechanism (if called a second time before a prior modal's `hidden.bs.modal` fires, the shared `_confirmAccepted`/`_confirmResolve` instance properties could be clobbered) — confirmed not reachable in this file's actual usage (one modal shown at a time), re-confirmed by the final whole-branch review.

## Roadmap notes

This closes out the follow-up identified by the 2026-07-16 cold review. The convention itself (no native `alert()`/`confirm()`, one modal idiom) is now recorded as project memory (`feedback_vue_migration_conventions.md`) for the next Tier 2 Vue migration Brief to state explicitly rather than re-derive.

Forward-looking observation from the final review (not an action item): `showConfirm()`'s Promise mechanism is currently page-local to `project-config.html`. If a third page needs the same confirm-as-Promise pattern, it risks being reinvented slightly differently unless deliberately extracted into a shared helper at that point — worth keeping in mind when the next Tier 2 page's design touches confirmation flows, but explicitly out of scope for this cycle (no new `js/lib/*` module was part of this plan).

## Sync-docs outcome

Updated:
- `PRD.md` — corrected one line (the Reforecast `distError` blocking-error description) that explicitly said "shows a blocking `alert()`," now inaccurate since this cycle converted it to an inline message. Noted the 2026-07 cleanup cycle inline for context.

Not updated:
- `ARCHITECTURE.md`/`CLAUDE.md` — no mention of `alert()`/`confirm()` usage on either page to correct.
- `TEST_CASES.md`/`test-cases.html` — no existing test case describes `alert()`/`confirm()` behavior for either page; nothing to update.
- `test-api.js` — no new or changed API endpoints/auth rules.
- `docs/superpowers/PROCESS.md` — gate answer: no. This cycle executed the documented process; it didn't modify a process skill, introduce a recurring exception, or change the 7-phase skeleton/scenario guardrails.
