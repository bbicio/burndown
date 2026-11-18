# Finish-cycle report — save-c2-costgrid-save-only

**Date:** 2026-11-18
**Branch:** save-c2-costgrid-save-only → main
**Execution started:** 2026-11-18 17:24
**Merged at:** 2026-11-18 20:00
**Gate durations:** Gate 1 8m · Gate 2 21m · Gate 3 125m · Gate 4 2m · Gate 5 (to report) 5m — total 163m
**Cycle counters:** subagent dispatches 6 · review rounds 3 · full test-suite runs 14
**Gate 5 tests:** docs-only → `npx vitest run scripts/ js/lib/test-cases-parse.test.js` ×1 (green on first run; an earlier invocation never ran, its log redirect pointed at a missing folder)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-18-save-c2-costgrid-save-only.md`) · review effort high
**Claims pre-check:** Gate 1 step 0 took about 4 minutes and caught 1 defect: a sentence in `docs/api/lib.md` the branch had not touched, made false by it, which named the removed `PUT …/structure` (fixed in `4662792`). The Gate 3 re-checks of the fixes in rounds 1 and 2 took about a minute each and caught nothing. Of round 1's findings, 3 were mechanical, all from the scoped review: the half-done fix of that sentence, the stale `docs/api/lib.md` line 94, and a false comment on the timeout.
**Security review:** ran — `security-scope` review, triggered by `api/src/routes/cost-grids.js`, `api/src/services/*`, `js/api*.js` and the pages · 1 finding (LOW, accepted as follow-up B-545)
**Acceptance:** 15 criteria and 10 `TEST_CASES.md` cases listed. Pre-ticked from automated runs: criteria 3, 6-14 and CG-89, CG-93, CG-110, CG-118 (vitest `api-sync-save`, `cg-draft`, `costgrid-save-state`, `save-contract-guard`; `scripts/run-tests.sh` green at `46b5492`, later at `861124c` with 1133/1133; `npm test` 3402/3402; `shoot.mjs` PNGs read back for criterion 11). Verified by hand on the branch stack with a positive outcome: criteria 1, 2, 4, 5 and CG-90, CG-91, CG-114..CG-117. Criterion 15 handled at Gate 5 (six rows closed).

## What was done

14 commits:

- `f19187a` feat(save): versionedWrite unchecked option and cost grid/version/project entities
- `052c543` feat(cost-grids): one transactional versioned Save route; stage propagated to linked projects
- `6dc7302` test(cost-grids): CS-06..08 versions created before the stage change; no shadowed putStructure
- `f0ef42c` feat(cost-grids): lifecycle writes logged through versionedWrite; guard retires cost-grids.js
- `817dc0c` test(api): refresh-rate pinned to the row lock then the version lock
- `46b5492` test(cost-grids): CS-11 saves on the lifecycle proposal
- `6365209` feat(costgrid): pure draft diff module
- `6d9c895` feat(costgrid): Save-only editor on the save contract; autosave behind CG_AUTOSAVE_ENABLED
- `bf00372` feat(costgrid): save status, Reload, unsaved-changes prompts and Save first
- `4e0fd92` test(guard): per-write client exemptions for the cost grid files; CLAUDE.md save contract
- `4662792` docs: missingLinkedTasks is called by the cost grid Save
- `0dc5104` test(guard): the live Docs-lines check gets the same 60 s timeout as its git-heavy sibling
- `861124c` fix(costgrid): base after pricing, no open on a failed structure load, Save follows typing, stage rule on the server
- `b4a6b26` fix(costgrid): a published Draft is clean before the reload (Gate 3 round 2)

## Gate outcomes

- Gate 1: claims pre-check fixed 1 defect (`4662792`); red at step 1 — `scripts/decision-ledger-guard.test.js` timed out at 5 s under the full suite, given 60 s in `0dc5104`, re-entered, then passed: `npm test` 3402/3402; `run-tests.sh` skipped — green at `46b5492`, no backend or harness change since; site-export tests not needed; audit none.
- Gate 2: ordinary path; branch stack reused from Task 6, all six manual items verified, browser question answered yes, stack torn down.
- Gate 3: 3 rounds. Round 1 (the plan's final review at `4e0fd92` + a scoped review of `4e0fd92..0dc5104` + `/security-review`): 14 findings, none on specs/plans or pre-existing prose; under "Critical/Important now, Minor as follow-up" 4 Important fixed in `861124c`, 10 to follow-up. Round 2 (`0dc5104..861124c`, a first run died on the session limit and was relaunched): 1 Important fixed in `b4a6b26` under the round-1 rule, the rest Low/Nit to follow-up. Round 3 (`861124c..b4a6b26`): no findings. Backend re-run: `scripts/run-tests.sh` 1133/1133 at `861124c`, no backend change after it.
- Gate 4: merged with a merge commit (`9ab1298`, main had not diverged), pushed; backup `backups/pdash-backup-2026-11-18-195956.dump`; no migration; pdash-api restarted and healthy at 2026-11-18T19:00:35Z; worktree and branch removed.
- Gate 5: sync-docs touched `docs/prd/pipeline.md` (the rest already on branch); `docs/BACKLOG.md` six rows closed, 20 added (B-536..B-555).

## Code review follow-ups

All written to `docs/BACKLOG.md` as B-536..B-555, each with its verifying command:

- Round 1 #5: a currency change confirmed during an in-flight Save loses its re-sync flag (`js/api-sync.js` line 201) — B-536
- Round 1 #6: "Not saved" never clears once the draft is clean (`js/costgrid.js` line 720) — B-537
- Round 1 #4: two Saves after a server rate differing from the preview (by the Spec) — B-538
- Round 1 #8: deleting the open version raises "Leave site?" — B-539
- Round 1 #9: a clone whose structure reload fails has no `version`, every Save 409 — B-540
- Round 1 #10: `change_log` snapshot cost under lock — B-541
- Round 1 #11: duplicated "version has projects"/currency read in `applyHeader` — B-542
- Round 1 #12: dead autosave code and a stale `saveStructure()` comment — B-543
- Round 1 #13 + round 2: stale `docs/api/lib.md` lines 94/97, false guard and service comments — B-544
- Round 1 #14 [security LOW]: stage propagation reaches projects the saver cannot edit — B-545
- Round 2: stale base while a version opens — B-546
- Round 2: a failed structure load leaves the previous version active — B-547
- Round 2: never-saved role rates priced into the base, not persisted without a structure change — B-548
- Round 2: Esc on the version label leaves "Unsaved changes" — B-549
- Round 2: stage refusals with no `code` — B-550
- Round 2: the `patchVersion` shim's publish-first branch — B-551
- Round 2: read-only drafts not excluded from `cgIsDraftDirty()` — B-552
- Round 2: page-wide input listener cost — B-553
- Round 2: duplicated `PIPELINE_STAGES` — B-554

## Roadmap notes

- Pre-existing: year 2093 is both SV-40's `hidYear` and PYP's `TEST_YEAR_D` in `test-api.js`; the cleanup prints a 409 for it, not counted as a failure — B-555.
- Visual: a long "Not saved: …" message wraps and moves the page-head actions to a second line; legible.
- The executor's rulings, from the plan ledger: Task 2 — no RED run of `run-tests.sh` (PROCESS §6.2); path-based shims; `currencyRate` dropped by the shim; CS-07 pins the new currency through the message; VS-01 moved to the Save route, VS-05 removed; extra docs fixed. Task 3 — guard `SAVE_STEPS`; refresh-rate on `versionedWrite` + `lockVersion`; publish's Draft check under the row lock. Task 5 — `_cgSaveVersion` saves only the open version; header adoption only for fields not edited in flight; a switch-in-flight guard added (found while rewriting tests); Publish's implicit save removed; `api-sync-upsert.test.js` replaced by `api-sync-save.test.js`. Task 6 — `cgAsk` relabels `showConfirm`; `cgConfirmSaveFirst(proceed, abort)`; Reload re-reads the grids. Task 7 — raw fetch writes named `<kind> <METHOD>`. The Task 5 ruling "base before pricing" was reversed by Gate 3 round 1.
- Plan Decision 1 (keep the draft's structure on a successful Save, against Spec §3.3) held through review.

## Sync-docs outcome

Scope pass: ARCHITECTURE yes (already on branch, checked against the code); CLAUDE.md yes (already on branch); TEST_CASES yes (already on branch); test-api.js yes (already on branch); PRD yes — `docs/prd/pipeline.md` updated (Saving, leaving with unsaved changes, + New version, Clone and the two refusal sentences no longer describe the autosave); production checklist checked, nothing names the removed routes; manual already on branch; PROCESS.md gate: none of the three conditions, untouched.

## Memory outcome

- `project_save_contract_series.md`: description "…c1 … MERGED 2026-11-17 …; next c2 costgrid Save-only" → "…c1 MERGED 2026-11-17 (`d1b6722`); c2 costgrid Save-only MERGED 2026-11-18 (`9ab1298`…); next c3 project/program writes"; added the c2 merge bullet; dropped the now-answered "open points" sentence.
- `feedback_shell_drops_backslashes.md`: "(3 surfaces, latest 2026-11-15)" → "(4 surfaces, latest 2026-11-18)"; added the fourth surface (heredoc-written node scripts lost escapes three times in this session).
- `MEMORY.md`: the two matching index lines updated accordingly.
