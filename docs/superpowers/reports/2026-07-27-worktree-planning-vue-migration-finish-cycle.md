# Finish-cycle report — worktree-planning-vue-migration

**Date:** 2026-07-27
**Branch:** worktree-planning-vue-migration → main

## What was done

11 commits, merged via `--no-ff` (main had not diverged since branch-off, so this was a fast-forward-eligible merge forced into a merge commit per process):

- `689a83b` feat(planning): extract getCalendarWeeks/workingDaysInWeek/getPlanningPeriods/countFutureTaskWeeks
- `e4eef8f` fix(planning): remove uninstructed cap from getPlanningPeriods weekly branch, correct test assertion
- `de8254d` feat(planning): Vue 3 skeleton — page shell, filters, view/interval toggles, window navigator
- `e595943` feat(planning): port By Role grouping view to Vue
- `d09fe3d` feat(planning): port By Project grouping view to Vue
- `8706985` fix(planning): restore ppResourceTable id on By Role/By Project views
- `2f4cf16` feat(planning): port By Owner grouping view to Vue
- `5641145` feat(planning): port XLS export/upload and AI Sidebar to Vue; translate js/ai.js:101 string
- `aed9679` chore(planning): delete js/planning.js — fully folded into planning.html
- `7b32a50` fix(planning): make Team filter reactive on all three grouping views (final whole-branch review, Critical)
- `4c09809` fix(planning): address Gate-3 code review findings

This completes the Vue 3 migration roadmap: **every page in the app is now on Vue 3 except the 9-line `index.html` redirect**, which was excluded from the roadmap entirely.

`planning.html` (Resource Planning) is now a single `Vue.createApp` instance, no build step, matching the established pattern from `pipeline.html`/`portfolio.html`/`costgrid.html`/`project-config.html`. `js/planning.js` (1558 lines) is deleted, fully folded into the page. `js/lib/planning-calc.js` gained 4 new pure exports (`getCalendarWeeks`, `workingDaysInWeek`, `getPlanningPeriods`, `countFutureTaskWeeks`). `js/config-form.js` and `js/costgrid.js` `<script>` tags were dropped from this page (confirmed dead here; files themselves untouched, still used elsewhere). `js/ai.js`, `js/upload.js`, `js/portfolio.js`, `js/roles.js`, `js/clients.js`, `js/programs.js` stay loaded unmodified as globals — the AI Sidebar is now Vue-reactive UI wired to `js/ai.js`'s unchanged functions via hidden DOM compatibility elements.

## Code review follow-ups

Gate 3, round 1: 5 findings, all fixed in the same round (commit `4c09809`), re-verified directly by the controller (no round 2 needed — all findings from round 1 were accepted and fixed, and direct inspection confirmed correctness):

1. Auth-gate ordering inversion — `created()` fired 6 API-loading calls and mounted the Vue app before `initNav()`'s 401-redirect gate was awaited. Fixed: `initNav()` now awaited first inside `created()`, with an early return on `!user`, matching every other migrated page's pattern.
2. AI Chat toggle button lost `id="btnToggleAiSidebar"`, silently breaking `js/core.js`'s `updateAiButtonVisibility()` (button always visible regardless of configured API key). Fixed: id restored.
3. `initTooltipsAndToggles()` accumulated duplicate click listeners on group-toggle rows across repeated `updated()` re-renders (e.g. every AI-chat keystroke), since `v-html` can leave the same DOM nodes in place. Fixed: `data-pp-bound` marker guards every `addEventListener` call so each element is bound at most once.
4. `sendAiMessage()` cleared the visible AI input textarea before confirming the message was actually consumed, losing the typed question when no AI API key was configured (the original vanilla flow preserved it in this case). Fixed: input is only cleared once `aiPlanMessages.length` growth proves `aiPlanSend()` consumed the message.
5. The Enter-to-send keybinding used Vue's `.exact` modifier, narrowing the original's `e.key === 'Enter' && !e.shiftKey` condition to exclude Ctrl/Meta/Alt+Enter. Fixed: replaced with an inline handler matching the original 1:1.

All 5 fixes verified: `npm test` 136/136 passing after the fix commit, `git diff --stat` confirmed only `planning.html` was touched, and each fix was independently re-read by the controller against the finding before proceeding to Gate 4.

## Roadmap notes

- **Pre-existing bug, confirmed but not fixed (per explicit user decision):** "Export XLS" throws `ReferenceError: ExcelJS is not defined`. Confirmed pre-existing — the original Vanilla code had the same unguarded call, and no page in the repo loads the ExcelJS library. Flagged for a future standalone cycle, same treatment as the previously-deferred cost-grid phasing-decimal issue.
- Minor items reconfirmed still-Minor at whole-branch review scale (not fixed, low priority): stale dead-code duplicates in `app.js`/`js/main.js` (unloaded, out of scope); the `updated()` lifecycle hook re-initializes tooltips/group-toggles on every reactive re-render including AI-chat keystrokes — functionally harmless after the Gate-3 listener-accumulation fix, but still re-runs more often than strictly necessary.
- **This cycle completes the Vue 3 migration roadmap.** Every page except `index.html` (a 9-line redirect, explicitly out of roadmap scope) is now Vue 3. No further migration cycles remain on this roadmap.

## Sync-docs outcome

- **ARCHITECTURE.md** — updated the `planning.html` file-tree entry (Vue 3, roadmap-completion note), added the `js/lib/planning-calc.js` description (new exports + `globalThis` cross-module-boundary note), fixed 3 stale cross-references (`js/costgrid.js`/`js/config-form.js` no longer loaded by `planning.html`; resolved a previously-open question about `js/config-form.js` reachability on that page).
- **CLAUDE.md** — mirrored the same set of updates: Pages table row, File structure entry, `js/lib/` `planning-calc.js` description, removed the now-stale `js/planning.js` entry (file deleted), fixed the same stale cross-references.
- **TEST_CASES.md** / **test-cases.html** — added PL-14..PL-17, covering the 4 user-facing Gate-3 fixes (AI Chat button visibility, AI input preservation on no-key path, Ctrl/Meta+Enter send, group-toggle listener stability across re-renders).
- **test-api.js** — not touched; no new or changed API endpoints this cycle.
- **PRD.md** — evaluated, left untouched: all Gate-3 fixes restore original documented behavior (regressions introduced and fixed within this same cycle), not new user-visible capability. No trigger condition met.
- **PROCESS.md gate** — none of the three trigger conditions applied (no process-skill change, no recurring exception, no change to the 7-phase skeleton or scenario guardrails); left untouched.
