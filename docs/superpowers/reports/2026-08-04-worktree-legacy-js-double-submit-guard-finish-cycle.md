# Finish-cycle report — worktree-legacy-js-double-submit-guard

**Date:** 2026-08-04
**Branch:** worktree-legacy-js-double-submit-guard → main

## What was done

1 commit:

- `e522858` fix: guard `aiPlanSend()` and `saveClientFromModal()` against rapid repeat clicks

First cycle out of a 5-cycle roadmap identified during this session to close every "user can double-click while a backend request is in flight" gap in the app. Scope for this cycle was 4 candidate files (`js/ai.js`, `js/clients.js`, `js/programs.js`, `js/roles.js`); verification before touching anything reduced this to 2 real fixes:

- `js/ai.js`'s `aiPlanSend()` — the send button was only disabled after the no-API-key and empty-message checks, so a fast double-click before either check completed could re-enter the function (confirmed instance, originally found during an earlier cycle this session). Fixed by moving the disable to the very first statement, with an explicit re-entry guard (`if (sendBtn.disabled) return;`), and re-enabling on every early-return path, not just the success/error `finally`.
- `js/clients.js`'s `saveClientFromModal()` — no disabling at all; a double-click during the network round-trip could create two clients from one submission. Fixed with the same guard-before-await idiom already established elsewhere in the codebase (`js/shares.js`, `js/ratecards.js`) — no new UI pattern introduced, per the user's explicit choice to use the existing disable-only pattern rather than a spinner for this cycle. Needed adding `id="clientSaveBtn"` to the Save button (`costgrid.html`), which previously had none.

`js/programs.js`'s `saveProgramFromModal()` and `js/roles.js`'s `saveRoleFromModal()` were investigated for the identical gap but found to be **unreachable dead code** — `showProgramsModal()`/`showRolesView()` have zero callers anywhere in the repo (their triggering modals were already removed from every page during earlier Vue-migration cycles). No live double-click bug exists there; left untouched.

Both fixes were verified interactively in the browser against a real running stack (not just statically): `aiPlanSend()`'s guard and re-enable-on-early-return were confirmed via console (simulating an in-flight state, and the no-key early-return path, both behaving correctly); `saveClientFromModal()`'s fix was verified with a rigorous race test — two overlapping calls fired without awaiting the first (`Promise.all([saveClientFromModal(), saveClientFromModal()])`) against the real API resulted in exactly one client created, not two. Test client records created during verification were cleaned up via the API before tearing down the branch stack.

## Roadmap context

This is Cycle 1 of the 5-cycle sequence agreed with the user to fully close the double-click problem app-wide:
1. **This cycle** — legacy JS standalone functions (`js/ai.js`, `js/clients.js`; `js/programs.js`/`js/roles.js` turned out to need nothing).
2. `costgrid.html`'s `saveVersion`/`cgSaveVersion()` and `publishDraft`/`cgPublishDraft()` — deferred, interacts with existing autosave logic, needs its own careful look.
3. The shared `showConfirm()` modal (`js/core.js`) — deferred, used by dozens of call sites across the app; a change here needs its own broad verification pass, not to be bundled with a narrower fix.
4. Not-yet-confirmed candidates: `portfolio.html`'s Load Actuals trigger (has partial/text-only feedback today), `pipeline.html`'s New Proposal/Clone flow, `costgrid.html`'s Generate Project flow — need investigation before it's known whether there's a real gap.
5. Closing audit — a `domain-audit` pass to confirm no other submit/save/create/delete button anywhere in the app lacks feedback, beyond what this session's investigation already mapped.

Per the user's explicit decision, this cycle used the existing disable-only pattern (no spinner) — matching the idiom already proven in `config.html`/`js/shares.js`/`js/ratecards.js`, not introducing new UI. A spinner was considered but deferred as a separate, larger design decision (would need a shared helper + its own visual-design pass) not required to close the underlying double-submit bug.

## Code review follow-ups

None. Manual review of the 3-file diff found no issues — both guard placements (top-of-function for `aiPlanSend()`, after-synchronous-validation for `saveClientFromModal()`) were confirmed equally race-safe given JS's single-threaded execution model.

## Roadmap notes

- New dead-code finding, not part of this cycle's fix (out of scope, noted for a future cleanup): `js/programs.js`'s and `js/roles.js`'s entire modal-editing UI (`showProgramsModal()`/`saveProgramFromModal()`/`renderProgramsTable()` and the roles equivalents) is confirmed unreachable — no page has matching markup wired up. Candidate for the same kind of cleanup cycle that already removed `_resolveCgIdForVersion()`, `app.js`, and `js/main.js`.
- New finding, out of scope for this cycle: `project-config.html` has its own separate `saveClientModal()` Vue method (distinct from `js/clients.js`'s `saveClientFromModal()`, a different code path for a similarly-named "add a client from a nested modal" flow) with the identical no-feedback gap. Not part of the approved 4-file scope for this cycle; candidate for Cycle 4 or its own follow-up, since it wasn't caught by the original investigation (which only scanned `js/clients.js`, not every page's own inline duplicate logic).
- Remaining backlog (unrelated to this cycle, carried forward from the previous cycle's report): sold-hours input validation; `formatDate()` unvalidated garbage-string gap; `js/ai.js`'s divergent case-sensitive task/role matching (a *different* issue in the same file than what this cycle fixed); trimmed-key/original-key mismatch in timesheet column mapping; XLS column-mapping keyword-breadth ambiguity (explicitly excluded from bundling into cleanup cycles, needs its own dedicated cycle); known `/finish-cycle` Gate 2 blind spot; `scripts/test-branch.sh` hardening backlog (10 sub-items, still unaddressed); recurring worktree-removal permission-denied pattern (currently low-friction, `ExitWorktree` has handled the last several cycles cleanly).

## Sync-docs outcome

- **CLAUDE.md** — updated: `js/ai.js`'s entry now documents `aiPlanSend()`'s re-entry guard; `js/clients.js`'s entry now documents `saveClientFromModal()`'s guard and notes the `js/programs.js`/`js/roles.js` dead-code finding for context (so a future reader doesn't wonder why those two weren't also fixed).
- **TEST_CASES.md** / **test-cases.html** — updated in lockstep: two new cases added, `CG-53` (costgrid.html's "+ New" client Save button) and `PL-18` (AI sidebar Send button).
- **ARCHITECTURE.md** — not touched. No DB/API/Docker-topology change.
- **test-api.js** — not touched. No API endpoints changed.
- **PRD.md** — evaluated, left untouched. This fix makes existing save/send actions safer against a user-error pattern (double-click); it doesn't add, remove, or change any user-facing feature or flow the PRD describes.
- **docs/superpowers/PROCESS.md** — evaluated via the gate, left untouched. The lightweight process deviation for this cycle was a one-off per §3 (matching the same reasoning as the two prior "quick cycles"), not a proposed standing policy change; none of the three trigger conditions applied.
