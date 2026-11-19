# Finish-cycle report — save-c5-server-atomicity

**Date:** 2026-11-19
**Branch:** save-c5-server-atomicity → main
**Execution started:** 2026-11-19 14:55
**Merged at:** 2026-11-19 15:55
**Gate durations:** Gate 1 5m · Gate 2 4m · Gate 3 28m · Gate 4 2m · Gate 5 (to report) 5m — total 67m
**Cycle counters:** subagent dispatches 3 · review rounds 2 · full test-suite runs: `npm test` 2, backend unit suite 6 standalone (and inside each of 7 `scripts/run-tests.sh` runs)
**Gate 5 tests:** docs-only → `npx vitest run scripts/ js/lib/test-cases-parse.test.js` ×1 (green on first run)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-19-save-c5-server-atomicity.md`) · review effort high
**Claims pre-check:** at Gate 1 it took about 2 minutes over the branch's `*.md` and caught 1 defect (a false predicate in `docs/api/resources.md` on the alias race, fixed in `c14a7da1`); the Gate 3 re-check of the round-1 fixes (the AX-16 row) took about 1 minute and caught nothing; of round 1's 2 findings, 1 was mechanical (the same false predicate, already fixed by Gate 1).
**Security review:** ran — `security-scope` review, triggered by the six changed routes under `api/src/routes/` · 0 findings
**Acceptance:** 9 criteria + AX-01..AX-15 listed · criteria 1-6 and AX-01..AX-15 pre-ticked from `scripts/run-tests.sh` at `36da74e9` (1236/1236), `npm test` (3407/3407) and `cd api && npm test` (639/639) · 7 (rule in CLAUDE.md) and 8 (docs) verified by hand with a positive outcome · 9 (backlog) done at Gate 5: no open row of `docs/BACKLOG.md` is about the atomicity of these routes, none closed

## What was done

9 commits:

- `ba6f8c35` test(api): AX atomicity cases with injected trigger failures
- `a14e59ec` fix(timesheets): upload and delete in one transaction, per-code lock
- `aa8f04e2` fix(pots,currencies): amount and history in one transaction
- `041ad691` fix(terms,notifications): atomic publish with 409 STALE, single-statement broadcast
- `d460296d` fix(resources): refuse re-pointing an alias resolved elsewhere (409 ALREADY_RESOLVED)
- `36da74e9` test: pin the TEST_CASES.md counts after the AX section
- `c14a7da1` docs: alias race — the losing request writes nothing
- `37dfcfdc` test(api): AX-16 alias resource id spelled another way
- `66a107a4` fix(resources): compare the alias target in PostgreSQL, not as strings

## Gate outcomes

- Gate 1: claims pre-check fixed 1 doc predicate (`c14a7da1`); `npm test` 3407/3407; site-export tests not needed; audit none (`audit: none`); `run-tests.sh` skipped — green at `36da74e9`, no backend or harness change since.
- Gate 2: ordinary path, branch stack started at pre-flight; acceptance checklist answered (7 and 8 ticked), browser verification confirmed; stack torn down.
- Gate 3: round 1 = the plan's final review (code review high, 2 Minor) + security review (0); the post-review commit `c14a7da1` was no-code and not reviewed. User chose "fix everything now": finding 1 already fixed at Gate 1; finding 2 (non-canonical UUID spellings refused by the new `isUuid` pre-check) fixed RED→GREEN with AX-16 (`37dfcfdc`, `66a107a4`). Round 2 scoped to `36da74e9..66a107a4`: no findings. `run-tests.sh` 1239/1239 at `66a107a4`, so the backend re-run had nothing left to run.
- Gate 4: merged `32437219` (`--no-ff`, main had not diverged), pushed; backup `backups/pdash-backup-2026-11-19-155526.dump`; no migration; pdash-api restarted and healthy at 2026-11-19T14:56:08Z; worktree and branch removed.
- Gate 5: sync-docs touched 3 files (ARCHITECTURE.md, PRD administration, user manual); no BACKLOG row added or closed.

## Code review follow-ups

None.

## Roadmap notes

- Executor rulings (plan ledger):
  - Task 1: AX-08b compared `MAX(version)` with the value read before AX-08, so a red AX-08 made the pin red too; it now compares with the value read right before its own PUT.
  - Task 1: the cleanup line `DELETE /api/pipeline-years/<id> → 409` is red in every `run-tests.sh` run; it is pre-existing (in the finish-cycle reports since 2026-11-11) and not caused by this cycle.
  - Task 5: `npm test` failed on `js/lib/test-cases-parse.test.js` (pinned counts 1052/37). The plan did not list that test for Task 1's 16 new cases and one section; the pin was raised to 1068/38 in its own commit (1069 after AX-16).
- The plan was executed inline (native, §6.1: tasks not independent). `run-tests.sh` ran once per task, as the plan prescribed (5 runs), against §6.2's norm of no per-task run.
- The reviewer declined to judge: AX-09 publishes a real Terms version, harmless on `run-tests.sh`'s disposable stack; `test-api.js` run against a cloned branch stack would make that stack's users accept the Terms again.

## Sync-docs outcome

Scope pass: 1 ARCHITECTURE.md yes (two stale API rows); 2 CLAUDE.md yes, already on branch; 3 TEST_CASES.md yes, already on branch; 4 test-api.js yes, already on branch; 5 PRD yes (new refusals a user can see); 5c handbook yes (manual; production checklist checked, nothing about these routes); 6 PROCESS.md no; 7 memory yes.

- `handbook/restricted/ARCHITECTURE.md`: `POST /api/resources/aliases` row now says 200 for the same resolution and `409 ALREADY_RESOLVED`; `PUT /api/app-settings/terms` row replaces "No transactional guard…" with the transaction and the `409 STALE`.
- `docs/prd/administration.md` (§16): Unmatched names — the refusal when another admin resolved the name first; T&C version history — two simultaneous publishes create one version.
- `handbook/public/manual.md`: Unmatched names — the message shown when another administrator resolved the name first.
- Already on branch: `CLAUDE.md` (Save contract rule), `docs/api/{timesheets,currencies,app-settings,notifications,resources}.md`, `handbook/restricted/TEST_CASES.md` (section 33).
- PRD: updated (`docs/prd/administration.md`). PROCESS.md gate: none of the three conditions applied.

## Memory outcome

- `project_save_contract_series.md`: description "…c4 tags MERGED 2026-11-19 (`c2fc30fb`); next c5 server atomicity" → "…; c5 server atomicity MERGED 2026-11-19 (`32437219`); next c6 master-data pages"; added a c5 MERGED paragraph (routes, AX-01..AX-16, Gate 3 outcome, next c6).
- `MEMORY.md`: the Save-contract series line "next: c5 server atomicity" → "c5 server atomicity MERGED 2026-11-19 (`32437219`); next: c6 master-data pages".
