# Finish-cycle report — worktree-project-config-vue-migration

**Date:** 2026-07-16
**Branch:** worktree-project-config-vue-migration → main

## What was done

9 commits:
- `8cb0b2b`/`24059cd` docs(plan): pre-flight fixes to Global Constraint 2's script list (added `js/clients.js`/`js/programs.js`/`js/lib/status-rules.js`, all required but omitted from the original plan text)
- `8c1ac97` feat: Vue 3 skeleton, project resolution, project info section (Task 1)
- `1a6046f` feat: client/program dropdown + add-modal, local Vue implementation (Task 2)
- `2d9d28f` feat: Tasks & Resources section, shared confirm modal (Task 3)
- `e63a0de` feat: extract derive/reforecast math into `js/lib/config-form-calc.js` (Task 4, TDD)
- `292428f` feat: phasing/planning grids, wire derive/reforecast (Task 5)
- `348f1a5` feat: PTC, functional groups, actuals, save/clear-data, XLSX export (Task 6)
- `70304d8` fix: sanitize status via `getStatusRule()` instead of a broken DOM helper (final-review fix)

`project-config.html` — the largest remaining Vanilla JS page in PDash, previously driven by the 1369-line shared `js/config-form.js` — was rewritten as a Vue 3 (CDN, no build step) app. First Tier 2 page of the Vue migration roadmap. All 8 form sections (client/program, project info, actuals, tasks & resources, phasing/planning with derive/reforecast, PTC, functional groups) ported 1:1, plus a new vitest-covered module `js/lib/config-form-calc.js` extracting the pure derive/reforecast calculation core.

Three confirmed-dead-on-this-page features were deliberately not ported (verified during design/brainstorming, not discovered mid-implementation): the rollback/snapshot mechanism, the Form/JSON tab toggle, and the hidden multi-project dropdown/New/Delete machinery. An unknown `?projectId=` now shows an explicit "Project not found" state instead of the original's silent fallback to a random project — a confirmed, deliberate fix. Client/program dropdown+add-modal got its own local Vue implementation, not shared with `config.html`'s independent Vue CRUD.

## Code review follow-ups

None outstanding. This cycle used subagent-driven-development across 7 tasks, each independently reviewed and approved (0 Critical/Important per task). A final whole-branch review (opus) found 1 Important issue — `onPipelineChange()` called a DOM-manipulation helper (`cfgApplyPipelineRules`) targeting a `#cfgStatus` element that no longer exists in the Vue template, throwing on every pipeline change and failing to clear an invalid status before save — plus 1 Minor (SIP pipeline's status select wasn't disabled). Both were fixed in `70304d8` and independently re-verified correct by a second review pass (opus).

Notable process incidents during implementation, both caught and resolved before merge:
- Task 4's implementer found two flaws in its own brief: a `parseTaskDateLocal` helper that didn't match the real `parseTaskDate` in `js/core.js` (fixed by porting the real function verbatim instead), and a mathematically-unreachable `distError` test case (the brief's single-future-month construction could never exceed the 100.5% threshold with realistic percentages; fixed with a corrected 2-future-month/negative-percentage construction, hand-verified by the controller before re-dispatch).
- Task 1's implementer accidentally committed directly to `main` in the primary checkout instead of the feature worktree. Caught immediately (via `git branch --contains`), the commit was cherry-picked onto the correct branch and `main` was reset to remove the stray commit — it was never pushed, so no remote impact.

## Roadmap notes

This is the first Tier 2 page (`docs/superpowers/specs/2026-07-14-vue-migration-roadmap-design.md`) migrated. Remaining Tier 2 pages (`pipeline.html`, `portfolio.html`, `costgrid.html`, `planning.html`) are unscheduled — order not yet decided.

Two follow-up items surfaced but explicitly deferred to future cycles (not this one):
- `portfolio.html`'s `#configModal` is confirmed orphaned dead code (its own "⚙️ Configure" trigger actually navigates to `/project-config.html` via `window.location.href`, never opening that modal) — a candidate for a future cleanup cycle, per the design spec's explicit deferral.
- `js/config-form.js` itself remains untouched, still loaded by `portfolio.html` for that same orphaned modal — its `cfgSwitchTab`/rollback-snapshot functions are now provably dead everywhere reachable, but cleanup is out of scope here.

## Sync-docs outcome

Updated:
- `ARCHITECTURE.md` — file-tree entry for `project-config.html` now notes Vue 3 + single-project-object architecture; the `reforecast_snapshot_<projectId>` localStorage entry updated to state it's no longer written (confirmed dead on this page).
- `CLAUDE.md` — Pages table / file-structure entry for `project-config.html` updated similarly; `js/core.js`'s `cfgApplyPipelineRules` description clarified to note `project-config.html` no longer calls it (uses a reactive `sanitizeStatus()` method instead).
- `PRD.md` — three corrections, all cases where the PRD's description was already inaccurate before this migration (not behavior this migration changed): (1) removed "snapshot / rollback" from the Derive/Reforecast comparison table and replaced the blocking-error/unsaved-navigation prose that assumed a snapshot existed; (2) "Edit modes: Visual form or raw JSON editor" corrected to "Visual form only," since the JSON toggle was never reachable on this page.

Not updated:
- `TEST_CASES.md` / `test-cases.html` — existing Project Configuration test cases (PC-01 through PC-12) describe outcomes unaffected by this migration (form loads, saves, status/pipeline rules) — no behavior change to describe.
- `test-api.js` — no new or changed API endpoints/auth rules.
- `docs/superpowers/PROCESS.md` — gate answer: no. This cycle executed the documented process; it didn't modify a process skill, introduce a recurring exception, or change the 7-phase skeleton/scenario guardrails.
