# Finish-cycle report — fix/generate-project-lock-granularity

**Date:** 2026-07-09
**Branch:** worktree-fix+generate-project-lock-granularity → main

## What was done

3 commits, merged `--no-ff` as `2fcd804`:

- `47c49e7` feat(lib): add versionHasFreeTasks and isVersionCommittedLocked
- `4d6cfe7` feat: load costgrid-calc.js on pages that can render version lock state
- `8855202` fix: lock proposal version only when Committed and every task is migrated

Fixes audit finding F4 (`docs/superpowers/audits/2026-07-09-proposal-project-status-lock-audit.md`): `cgGetVersionLockState`'s `committed` reason previously fired as soon as any single linked project reached pipeline `Committed`, locking the whole editor (hiding "Generate Project", disabling every field) even when other tasks in the same version were still unmapped. Resolved in `/brainstorming` as a design decision (not a mechanical bug fix, per the source Brief's Scenario 2 framing): "Committed" is a proposal-level concept (the version's own `pipeline` field, matching `getProjectPipeline()`'s documented source-of-truth rule), and the lock is binary — it fires only once every task has been migrated to a project *and* the proposal is Committed, so no per-row/partial-lock logic was needed.

## Code review follow-ups

None. Each of the 3 tasks passed its task review clean (one Minor, non-blocking note on Task 1: `versionHasFreeTasks` isn't null-safe standalone if called directly with `undefined`, but every real call path goes through `isVersionCommittedLocked`'s optional-chaining guard first — accepted as-is, not fixed). The final whole-branch review returned no Critical/Important findings and confirmed "Ready to merge: Yes".

## Roadmap notes

- Task 3's task review caught that the plan's own manual-verification instructions (Step 2, point 6) referenced a dead-code path (`renderCostGridList`, whose `costGridListContainer` element is unreferenced by any HTML page) as evidence for the pipeline-board 🔒 badge, instead of the two real reachable consumers (`renderCgVersionTabs` and the main editor render, both in `js/costgrid.js`). This was a plan-authoring inaccuracy, not a code defect — the shipped fix is correct for both real consumers, independently verified by the task reviewer and the final whole-branch reviewer.
- During brainstorming, a quick grep surfaced ~38 direct reads of `.pipeline` on project objects across `js/`, bypassing `getProjectPipeline()`. Four were flagged as candidates resembling F4's bug pattern and deferred to a dedicated follow-up audit per the user's explicit request, rather than expanding this cycle's scope. That audit (`docs/superpowers/audits/2026-07-09-project-pipeline-direct-reads-audit.md`) has since been run and closed with zero findings — see its own report below.

## Sync-docs outcome (combined: this cycle + `fix/status-vocabulary-reconciliation` + the pipeline direct-reads audit)

Run once, together, on 2026-07-09, covering both merged cycles and the audit follow-up (no code change) at the user's explicit request, rather than immediately per-cycle.

- **CLAUDE.md** — updated. Added `js/lib/status-rules.js` and `js/lib/costgrid-calc.js` to the `js/lib/` file-structure block (purpose, exported functions, what they replaced, which pages load them). Updated the `js/core.js` row to mention `cfgApplyPipelineRules`'s new delegation to `getStatusRule`. Updated the `js/costgrid.js` row to describe `cgGetVersionLockState`'s corrected `committed` reason and to document `cgPropagatePipelineToProjects()` (discovered/verified during this session, not previously documented). Extended the "Pipeline stage: single source of truth" section with the propagation mechanism, `getProjectPipeline()`'s resolution order, why `js/planning.js` deliberately reads `config.projects[].pipeline` directly (cross-referencing the direct-reads audit), and an explicit disambiguation between pipeline *stage* and project *status* (two separate fields, prompted by this session needing to explain the distinction to the user more than once).
- **PRD.md** — updated. This is genuinely user-visible behavior: §4.3's version-lock rule (`Locked when: a Committed linked project exists...`) was inaccurate relative to the new, correct behavior — updated to the proposal-Committed-and-fully-migrated rule, with a note that Generate Project stays available for remaining tasks after partial commitment. §7.1's Status field row was extended to note that allowed values depend on Pipeline (the F1 fix).
- **TEST_CASES.md** / **test-cases.html** — updated in both (kept mirrored). `CG-14`'s scenario text was corrected (previously implied any Committed-linked project locks the version; now states the version's own pipeline must be Committed with every task migrated). Added `CG-35`/`CG-36` (Generate Project stays visible while tasks remain unmapped after partial commit; locks only once fully committed) and `CG-37` (pipeline change propagates to every linked project, not just one) for F4. Added `PC-11`/`PC-12` for F1/F2 (Started At Risk available for Committed; Completed status gets the correct badge and Planning exclusion). None marked with the Auto (✓) column — all are DOM-driven scenarios, not covered by `test-api.js` (backend), consistent with the project's existing convention for that column.
- **test-api.js** — not touched. No API endpoint or auth-rule changes in either cycle.
- **ARCHITECTURE.md** — not touched. Both cycles are frontend-only (no DB schema or API changes); this file documents schema/API/auth flows, which is a separate concern from `CLAUDE.md`'s frontend-module documentation in this repo's established convention.
- **PROCESS.md gate** — none of the three trigger conditions apply: no process skill (`feature-brief`/`domain-audit`/`audit-to-brief`) was modified; the sync-docs-timing deviation (run once at the end for two cycles plus a follow-up audit, instead of immediately per-cycle) is a one-off documented in these two reports, not proposed as a recurring exception; the 7-phase skeleton and Scenario 2/3 guardrails were followed as documented, not modified. `PROCESS.md` left untouched.
