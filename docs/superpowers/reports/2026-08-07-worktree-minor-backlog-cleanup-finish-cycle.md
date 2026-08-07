# Finish-cycle report — worktree-minor-backlog-cleanup

**Date:** 2026-08-07
**Branch:** worktree-minor-backlog-cleanup → main

## What was done

7 commits:

- `6ede86b` fix: detect partially-migrated schema in test-branch.sh instead of silently skipping remaining migrations
- `284f609` fix: clean up test-branch.sh's data-clone dump file on a mid-pg_dump/pg_restore failure
- `71944bb` fix: declare load_env()'s line/key/val as local in both scripts
- `343105f` chore: remove dead, unreachable modal-editing UI from js/programs.js
- `ee2323a` chore: remove dead, unreachable modal-editing UI from js/roles.js
- `e77ebd6` fix: resolveColumnMap() checks all substring occurrences and tracks header index (not text) for duplicate-header safety
- `f48a574` test: replace resolveColumnMap's non-triggering regression test with a genuine before/after case

Bundled cleanup of 7 independent minor backlog items, none user-facing — closes out the last remaining open items surveyed across the session's full backlog history (2 items from the `test-scripts-correctness-hardening` Cycle 1 report, 1 from `test-scripts-hardening-cycle3`, and dead code / column-mapping hardening items from earlier cycles). Executed via Brief → Brainstorming (6 design decisions resolved one at a time) → Spec → Plan → Subagent-Driven Development (6 tasks, each independently reviewed) → a final whole-branch review.

## Code review follow-ups

None deferred as unfixed. Task 6 required one fix round, initiated by the controller (not the task reviewer): while generating the review package for the final whole-branch review, the controller noticed both of the *plan's own* prescribed regression tests didn't actually exercise the bugs they claimed to guard against — confirmed by hand-tracing both against the pre-fix algorithm, which passed them unchanged. Since this was a defect in the plan text itself (written by the controller during `/brainstorming`), the user was asked before proceeding rather than silently fixed. Resolution: replaced test 1 with a genuinely-triggering case (`'afterhours Hours'` vs. candidate `'hours'` — independently verified: pre-fix `matchSpecificity()` returns `null` for this input via a plain Node one-liner reproducing the old algorithm; post-fix correctly finds the boundary-clean second occurrence) and corrected test 2's comment to honestly document it as an invariant check rather than a demonstrated regression trigger (confirmed no two fields in the current `FIELD_CANDIDATES` table share an overlapping candidate word, so a genuine cross-field collision on identical header text isn't currently constructible).

The final whole-branch review (opus model) found only Minor findings, all triaged as non-blocking:
- `schema_exists()`'s second `psql` query (checking the last-migration marker) has no exit-status check of its own — inherited from the plan's own prescribed code, low likelihood, and the printed remediation resolves it regardless of cause.
- The `usedHeaders` index fix's real-world benefit is narrower than its own framing suggests: `result[field]` still stores the header *string* (dereferenced by callers), so two identically-named columns still resolve to the same value — the fix upgrades "silently dropped" to "duplicate", not true disambiguation. Correct as defensive hardening regardless; the test file's own comment is already honest about this.
- `_roleEditId`/`_programEditId` module variables in `js/roles.js`/`js/programs.js` are now unreferenced (only readers/writers were the deleted functions) — the plan explicitly listed them as state to keep, so left as-is; a 2-line future cleanup candidate.
- `CLAUDE.md` was stale on `js/roles.js`/`js/programs.js`'s descriptions and a cross-reference to the now-deleted `saveProgramFromModal`/`saveRoleFromModal` — corrected in this cycle's own doc sync (see below), not deferred.
- Task 5's live-browser check on `costgrid.html` was substituted with static grep + `npm test` (no browser access to that implementer) — the final reviewer independently confirmed no plausible browser-only failure mode exists given zero references anywhere and Vue-instance-method scoping of the same-named symbols, and explicitly said they'd accept it without a re-run. The controller nonetheless ran a real live-browser check during this cycle's own Gate 2 (see below), closing that gap for real.

## Process notes

- **Two originally-candidate backlog items were found already resolved before the brief was written** (duplicate `docker ps` calls, `status()`'s override-file dependency) — investigated by re-reading current code, confirmed eliminated as side effects of Cycle 1's `status()` rewrite, and dropped from scope with the user's explicit confirmation rather than assumed.
- **The brief itself needed two design corrections mid-brainstorming**, both caught before implementation: (1) the initially-proposed fix for a partially-migrated schema ("re-apply all migrations from scratch") would itself fail with "already exists" on migrations that already succeeded, since files don't use `IF NOT EXISTS` — corrected to a fail-loud-with-remediation-message approach instead; (2) `trap ... RETURN` (initially proposed for the dump-cleanup fix) has unreliable behavior when a `set -e`-triggered exit unwinds a non-conditionally-called function — corrected to `trap ... EXIT`, which fires deterministically regardless of cause. Both corrections were verified with the user before locking into the design.
- **Task 1's live verification correctly declined to follow the brief's literal Docker setup steps.** The brief's Steps 3/4 implied exercising `up()`'s fresh-DB path directly, but the main stack was already running — the implementer instead extracted the real, unmodified `schema_exists()` function and ran it directly against the isolated branch stack's own DB container, exercising the identical code path/shell contract without ever touching the main stack. The task reviewer confirmed this substitute was genuinely equivalent, not just a good-faith approximation.
- **Both dead-code-removal tasks hit unexpected grep collisions** (`deleteProgram`/`extractTeam`/`deleteRole`/`openRoleModal` matching same-named Vue component methods in `config.html`/`costgrid.html`) — both implementers stopped, investigated (confirming the colliding pages either don't load the file in question at all, or the match is a Vue-instance method rather than a bare global), and only proceeded once genuinely confirmed safe, exactly the caution their briefs asked for.
- Diff touches `api/src/routes/timesheets.js`, so the backend integration suite (`scripts/run-tests.sh`, 97/97) and the file-specific unit suite (`node --test src/routes/timesheets.js`, 24/24) were both run in addition to the frontend suite (136/136), per Gate 1's "ambiguous relevance to backend behavior" clause.
- **Live manual verification (Gate 2) was performed against a real cloned-from-main isolated stack**, specifically to exercise the dead-code removal in a live browser — closing the one verification gap the final review had flagged as accepted-but-not-ideal. User confirmed no problems across the pages loading `js/programs.js`/`js/roles.js`.
- An untracked `api/package-lock.json` (a side effect of `npm install` run during Task 6's local test verification — this repo has never committed one for `api/`, confirmed in a prior cycle) was found at pre-flight and removed with the user's confirmation before proceeding.
- Since the diff touches `api/`, `pdash-api` was restarted post-merge and confirmed healthy.

## Roadmap notes

- Two smaller items surfaced by the final review, both accepted as non-blocking and not scheduled:
  - `schema_exists()`'s second `psql` query still lacks its own exit-status check.
  - `_roleEditId`/`_programEditId` are now dead module variables (2-line removal candidate).
- The `resolveColumnMap()` non-optimal greedy assignment (explicitly excluded from this cycle, per the design) remains documented backlog with no demonstrated real-world trigger.
- This closes out every backlog item surfaced by the full-history survey performed at the start of this session — no further items are currently tracked as open.

## Sync-docs outcome

- **CLAUDE.md**: updated the `js/roles.js`/`js/programs.js` entries to drop the stale "roles management modal"/"program CRUD helpers" framing and describe the current load-only state plus the 2026-08 dead-code removal; corrected the `js/clients.js` cross-reference to the now-deleted `showProgramsModal()`/`showRolesView()`; updated `scripts/test-branch.sh`'s entry with the partial-migration detection, `psql` exit-status check, dump-cleanup trap, and `load_env()` locals; extended the `resolveColumnMap()` entry with the two 2026-08 fixes and their bounded real-world benefit.
- **ARCHITECTURE.md**: mirrored the same `scripts/test-branch.sh` updates (partial-migration detection, dump-cleanup trap, `load_env()` locals) in its own file-tree entry; the `js/roles.js`/`js/programs.js`/dead-markup mentions elsewhere in this file were already accurate (they describe page-loading decisions and already-removed HTML markup from earlier cycles, not these files' own JS content) and needed no change.
- **TEST_CASES.md / test-cases.html / test-api.js**: not touched — `resolveColumnMap()`'s coverage lives in `api/src/routes/timesheets.test.js` (backend unit tests), which this project's convention has never tracked in `TEST_CASES.md`'s manual-QA/integration-test list, matching precedent from prior `resolveColumnMap()` cycles.
- **PRD.md**: evaluated, not necessary — dead code removal and internal script/matching-logic hardening, no user-visible feature or flow changed.
- **docs/superpowers/PROCESS.md**: gate evaluated — none of the three trigger conditions applied. Left untouched.
