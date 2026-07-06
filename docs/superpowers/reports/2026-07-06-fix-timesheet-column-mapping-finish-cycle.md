# Finish-cycle report — fix/timesheet-column-mapping

**Date:** 2026-07-06
**Branch:** fix/timesheet-column-mapping → main

## What was done

1 commit, merged fast-forward into main:

- `713c881` — fix(api): prevent ambiguous timesheet headers from mapping to more than one field

Extracted the inline `findCol` closure in `api/src/routes/timesheets.js`'s POST `/upload` handler into a standalone, exported `resolveColumnMap(headers)` function. It now tracks already-claimed columns in a `Set`, so an ambiguous header like `"Resource Name"` (matching both role's `resource` keyword and owner's `name` keyword) is claimed by role only — role and owner no longer collapse onto the same physical column. Field declaration order (`date > role > owner > hours > task > notes > projId > projName`) is now the explicit conflict-priority order. Added 3 new `node:test` characterization tests (a no-regression case for fully-unambiguous headers, the exact "Resource Name" audit reproduction, and a synthetic two-owner-one-role scenario proving distinct row-level values without computing any proportion — `js/planning.js`'s `ownerProp` split logic was validated indirectly and never touched).

## Code review follow-ups

None. This cycle ran under `subagent-driven-development` rather than `/finish-cycle`'s own Gate 3: a task reviewer approved the single task with zero findings, and a separate final whole-branch reviewer (opus) also returned zero Critical/Important findings, confirming "Ready to merge: Yes." No fixes were deferred as follow-up.

## Roadmap notes

Two Minor, out-of-scope observations surfaced by the final whole-branch reviewer, worth carrying into a future audit cycle rather than fixing now:

1. **Broad keyword lists can shift, not just fix, ambiguity.** Because owner's keyword list contains the very generic `'name'`, a header like `"Project Name"` or `"Task Name"` — if it happened to sit ahead of a genuine owner column in priority order — would be claimed by `colOwner` (priority 3) before the more-specific field (`colProjName` priority 8 / `colTask` priority 5) gets a chance, leaving that specific field `undefined` instead of duplicated. This never regresses a currently-fully-working file (in every such case owner was already misassigned before this fix), and stems entirely from keyword breadth that this cycle's scope deliberately left untouched. Candidate for a future audit finding on keyword specificity.
2. **Trimmed-key vs. original-key mismatch, pre-existing.** `sampleKeys` are `.trim()`-ed, but rows are later indexed with those trimmed keys against row objects whose keys are the original, possibly-untrimmed header strings. If a real header carries leading/trailing whitespace, the lookup would silently miss. This predates this fix (the old inline `findCol` had the identical shape) and was out of scope here.

This is Ciclo 1 of 3 from the Resource Planning audit (Finding 1). Findings 2-5 remain for Cicli 2 and 3.

## Sync-docs outcome

- **CLAUDE.md** — updated: added a description of `resolveColumnMap(headers)` in the `api/src/routes/` file-structure section (column-detection resolver, exported for testing like `formatDate`, documents the exclusion-Set fix and field-priority order).
- **ARCHITECTURE.md** — not updated: `POST /api/timesheets/upload`'s external contract is unchanged, only internal correctness; the existing endpoint-table entry doesn't need column-mapping implementation detail.
- **TEST_CASES.md** — updated: added TS-08 ("Ambiguous header doesn't collapse owner into role"), following the TS-05/06/07 date-parser precedent style.
- **test-cases.html** — updated: mirrored TS-08 into the `timesheets` section, matching existing style (no `auto:true`, reserved for `test-api.js` coverage, not `node:test` unit coverage).
- **test-api.js** — not updated: no new API endpoint, no auth-rule change.
- **PRD.md** — evaluated, not updated: the PRD already documents "By Owner" grouping correctly and generically; the bug was an implementation defect reaching an already-correctly-documented feature, not an inaccurate PRD description — a "restores documented behaviour" fix, per the sync-docs rule.
