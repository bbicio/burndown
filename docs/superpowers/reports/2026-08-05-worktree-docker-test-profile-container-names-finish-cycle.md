# Finish-cycle report — worktree-docker-test-profile-container-names

**Date:** 2026-08-05
**Branch:** worktree-docker-test-profile-container-names → main

## What was done

6 commits:

- `1d83e78` docs: brief + design spec for docker test-profile isolation
- `215396b` feat: add isolated Docker Compose wrapper for the integration-test profile
- `3ac821d` docs: point finish-cycle Gate 1 at the isolated test-stack wrapper
- `b11bdab` docs: update TEST_CASES.md Auto legend to reference the isolated test-stack wrapper
- `f02a83c` chore: gitignore scripts/run-tests.sh's generated override file
- `cbf5341` docs: implementation plan for docker test-profile isolation

Backlog item 8 (re-triage from `docs/superpowers/reports/2026-08-05-worktree-timesheet-parsing-and-worktree-cleanup-finish-cycle.md`): the Docker Compose integration-test profile (`docker compose --profile test run --rm test`) shared fixed container names (`pdash-db`, `pdash-api`) and host ports with the always-running main dev stack, causing a container-name conflict whenever the main stack was up, and — more seriously — risking silent attachment to the main stack's real data volume if the main stack was merely stopped (volumes persist across `docker compose down`). Given the data-integrity severity, the full process (Brief → brainstorming → design spec → self-review → user review → writing-plans → subagent-driven-development) was used instead of this session's usual lightweight direct-implementation path.

**New file `scripts/run-tests.sh`** generates a throwaway Compose override (`docker-compose.test.yml`, gitignored) giving the test profile its own project name (`pdash_test`), container names (`pdash-db-test`/`pdash-api-test`), and no host ports at all — reusing `scripts/test-branch.sh`'s established `load_env()`/`write_override()`(`!override` merge tag)/`wait_healthy()` pattern verbatim rather than reinventing it. It explicitly applies all `api/src/db/migrations/*.sql` before starting `api` — a genuine, previously-undocumented gap: nothing in the app (`api/Dockerfile`, `create-admin.js`, `api/src/index.js`) ever applied migrations automatically, so the old bare command only ever "worked" by silently reusing the main stack's already-migrated volume. `trap cleanup EXIT` guarantees containers, the disposable volume, and the override file are removed on every exit path (pass, fail, or interrupt), and the test service's own exit code is faithfully propagated as the script's own exit code.

`.claude/commands/finish-cycle.md` Gate 1 and `TEST_CASES.md`'s "Auto" coverage legend were both updated to reference the new script.

Implemented via `superpowers:subagent-driven-development` (2 tasks, each independently task-reviewed; Task 2 required one fix round for a doc-consistency gap caught by its reviewer — `TEST_CASES.md` had been missed by the implementer's own grep triage), followed by a final whole-branch review (opus-tier) that found one further Important gap (missing `.gitignore` entry for the generated override file), fixed directly before Gate 3.

## Process notes

- **Recovered lost pre-compaction artifacts.** The brief and design-spec files, and their self-review fixes, had been written and (per the session's own record) supposedly committed before a context compaction — but neither the files nor a commit actually existed on disk afterward. Both were recreated from the compacted summary's captured content (verified identical against a stray, uncommitted, pre-compaction copy accidentally left in the main repo root) and re-committed before proceeding to `writing-plans`. No content was lost, but this cost an extra verification pass.
- **Stray untracked files blocking merge.** The same pre-compaction artifact-loss left two untracked files sitting in the main repo root (`docs/superpowers/briefs/...`, `docs/superpowers/specs/...`) at the same paths the branch's merge needed to create. Content was diffed against the worktree's committed (corrected) versions to confirm they were fully superseded, then removed before merging — git would otherwise have refused the merge ("untracked working tree files would be overwritten").
- **Uncommitted plan file caught by Gate pre-flight.** `docs/superpowers/plans/2026-08-05-docker-test-profile-isolation.md` had been written during `writing-plans` but never committed before `/finish-cycle` was invoked. Per Gate pre-flight's explicit instruction not to decide this unilaterally, the user was asked and chose to commit it (`cbf5341`) before continuing.
- **`/review` skill misfire.** Attempting Gate 3's code review via the generic `/review` skill with args `"medium, scope: diff main...HEAD on branch ..."` mis-parsed the leading `"medium,"` as a GitHub PR target and tried `gh pr view`/`gh pr diff` against a nonexistent PR. There is no PR for this branch (local-only worktree workflow). Recovered by dispatching the code review directly via a sonnet-tier subagent using the project's own code-reviewer template, scoped to the local `main...HEAD` diff — this satisfied Gate 3's intent without a GitHub PR.
- Diff does not touch `api/` — Gate 1 step 2/3 (the `docker compose --profile test run --rm test` check) was correctly skipped; frontend suite (136/136) was the only automated gate that ran directly in this session. Real-Docker verification of `scripts/run-tests.sh` itself was performed by the Task 1 implementer subagent (documented in `.superpowers/sdd/task-1-report.md`, now removed with the worktree — see below).
- No backend restart needed (Gate 4 step 5 skipped — diff doesn't touch `api/`).

## Code review follow-ups

None fixed-now; all accepted as follow-up (user confirmed, Gate 3):

1. (Round 1, Minor) No pre-run cleanup of a stale `pdash-db-test`/`pdash-api-test`/`pdash_test` project from a prior hard-killed run (e.g. `SIGKILL`) — the `trap cleanup EXIT` only fires on normal bash exit paths. Inherited unchanged from `scripts/test-branch.sh`, which has the same gap; not a regression introduced by this cycle.
2. (Round 1, Minor) Both `scripts/run-tests.sh` and `scripts/test-branch.sh` assume invocation from the repo root, with no explicit guard or error message if run elsewhere — again inherited, not new.
3. (Round 1, Minor) `--build` runs unconditionally on every invocation (rebuilds `db`/`api` images even when unchanged), adding to `/finish-cycle` Gate 1's wall-clock time — matches `test-branch.sh`'s own existing behavior, a deliberate consistency choice per the design, not an oversight.

## Roadmap notes

- The three Minor code-review follow-ups above (stale-container pre-cleanup, repo-root invocation guard, unconditional `--build`) are candidates for a future `scripts/test-branch.sh` + `scripts/run-tests.sh` joint hardening cycle — they'd naturally pair with `scripts/test-branch.sh`'s own already-known hardening backlog (world-readable `/tmp` dump file, non-idempotent migrations, hardcoded test-admin password) referenced in the design's excluded scope.
- Backlog items 1 and 2 are next per the user's explicit sequencing ("Occupiamoci del punto 8 e poi di 1 e 2"): (1) sold-hours input validation (no technical constraint currently enforcing the allowed set {integers, 0.25, 0.4, 0.75}); (2) `js/ai.js`'s divergent, case-sensitive task/role matching logic — an independent reimplementation that no longer matches the already-fixed `planning.html` logic and should be replaced with the shared, correct implementation.
- Remaining backlog beyond items 1/2, unscheduled: known `/finish-cycle` Gate 2 blind spot; XLS column-mapping keyword-breadth ambiguity (deliberately excluded from bundling, needs its own dedicated cycle); FOUC/`defer` on script tags across the 13 Vue pages.

## Sync-docs outcome

- **CLAUDE.md** — updated: added a `scripts/run-tests.sh` entry to the file-structure table (`scripts/` section), documenting its isolation mechanism, the migration-application gap it closes, and its role as `/finish-cycle` Gate 1's new documented command.
- **ARCHITECTURE.md** — updated: added `run-tests.sh` to the `scripts/` file-tree listing alongside `test-branch.sh`, with a parallel description emphasizing the contrast (never clones main-stack data; always applies migrations fresh).
- **TEST_CASES.md** / **test-cases.html** — not touched by this Gate: the branch's own commit (`b11bdab`) already updated `TEST_CASES.md`'s "Auto" legend to reference `scripts/run-tests.sh` instead of the raw command; `test-cases.html` has no corresponding hardcoded command string to mirror (checked — the "Auto" concept is rendered generically there, not as a literal command string), so no change needed.
- **test-api.js** — not touched. No API endpoints added or changed; this cycle only changed test *tooling*, not the API surface or its test coverage.
- **PRD.md** — evaluated, left untouched. This is an internal dev-tooling/CI-isolation fix with zero user-facing behavior change (no new page, feature, flow, or permission change) — not PRD material.
- **docs/superpowers/PROCESS.md** — evaluated via the gate, left untouched. None of the three trigger conditions applied: this cycle didn't modify a process skill itself, didn't introduce a *recurring* process exception (the two artifact-recovery incidents in this cycle's Process notes were one-off compaction-recovery issues specific to this session, not a repeatable pattern worth codifying yet), and didn't modify the 7-phase skeleton or any scenario's guardrails.
