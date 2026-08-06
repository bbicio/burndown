# Finish-cycle report — worktree-run-tests-hardening-cycle2

**Date:** 2026-08-07
**Branch:** worktree-run-tests-hardening-cycle2 → main

## What was done

4 commits:

- `b51490d` fix: guard run-tests.sh against being invoked outside the repo root
- `24baf94` fix: unconditionally clean up leftover pdash_test state at the start of run-tests.sh
- `60c3ea7` perf: make run-tests.sh's api image build conditional on a Dockerfile/dependency hash
- `22d9c1b` fix: write docker-compose.test.yml before run-tests.sh's pre-cleanup so it isn't a silent no-op when the override file is missing

Cycle 2 of the `scripts/test-branch.sh`/`scripts/run-tests.sh` hardening backlog (Cycle 1: `docs/superpowers/reports/2026-08-06-worktree-test-scripts-correctness-hardening-finish-cycle.md`). Executed via Brief → Brainstorming → Spec → Plan → Subagent-Driven Development (3 tasks, each independently reviewed) → a final whole-branch review that caught a real ordering bug, fixed in one follow-up wave and re-verified clean.

## Code review follow-ups

None deferred. The final whole-branch review found one Important finding, fixed before merge:

- **Important**, fixed: Task 2's pre-cleanup call ran *before* `write_override`, so `$COMPOSE down -v --remove-orphans` (which references `docker-compose.test.yml` via `-f`) silently failed and no-op'd whenever the override file wasn't already on disk — a case the task's own live verification never exercised, since its tested scenario (a `SIGKILL`'d run) happens to leave the override file behind. Fixed by moving `write_override` before the pre-cleanup call, verified with two fresh live runs (override file absent → no silent no-op; simulated hard-kill → leftover container genuinely removed).

The review also confirmed, via careful reasoning about Docker's image-cache semantics (not just the diff), that the interaction between pre-cleanup (removes containers/volumes, not images) and the conditional-build hash marker (assumes an image still exists) is benign in both directions — no stale-image hole.

One deviation from the plan's literal text, confirmed with the user mid-cycle: `api/package-lock.json` (named in the plan as one of three hash inputs) doesn't exist in this repo — confirmed no lockfile exists at all, and `api/Dockerfile` only ever `COPY package.json ./`. Hashed just `api/Dockerfile` + `api/package.json` instead.

## Process notes

- Diff touches only `scripts/run-tests.sh` and `.gitignore` — since this cycle modifies the backend test-runner script itself, `scripts/run-tests.sh` was run directly (not skipped) per Gate 1 step 3's "ambiguous relevance to backend behavior" clause, in addition to the frontend suite. Both passed (136/136, 97/97).
- Live manual verification for all three tasks (and the final-review fix) was performed by task/fix implementer subagents directly against the isolated `pdash_test` Docker Compose project — no manual browser pass needed, since this cycle has no UI surface at all.
- **Recurring minor pattern, again:** the final-fix-wave implementer reported writing `final-fix-report.md` that, on inspection, didn't actually exist on disk — same pattern seen in the two prior cycles this session. The actual code fix was independently re-verified against `git log`/`git show --stat`/the diff regardless, so nothing shipped unverified. Worth flagging as a persistent session-level reliability gap in report-writing specifically (not the code changes themselves) if it keeps recurring in future cycles.

## Roadmap notes

- Two smaller items surfaced by the final review, deferred as non-blocking:
  - No concurrency guard against two simultaneous `run-tests.sh` invocations — the new pre-cleanup would now tear down a concurrently-running instance's stack mid-test (previously this collided loudly on container-name conflicts; now the failure mode is a confusing mid-run error instead). Candidate: a cheap advisory lock (`mkdir`-based) — flagged for Cycle 3.
  - The exact cleanup command (`$COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true`) is now duplicated literally in both `cleanup()` (the `EXIT` trap target) and the new pre-cleanup call — a shared helper could remove the duplication in a future cycle.
- `sha256sum` (used for the build-context hash) is GNU/Linux-specific (macOS ships `shasum -a 256` instead) — noted as out of scope since this project's tooling is Windows/Git-Bash-oriented throughout (per CLAUDE.md), not a real portability concern here.
- **Cycle 3** of the original hardening backlog remains unscheduled: `/tmp` snapshot dump file world-readable, hardcoded ports/passwords, duplicate `docker ps` calls, no check for the override-file already existing before writing it (in `test-branch.sh`) — plus the two items above surfaced by this cycle's own review.

## Sync-docs outcome

- **ARCHITECTURE.md**: updated the `scripts/run-tests.sh` file-tree entry to describe the three 2026-08 Cycle 2 hardening additions (cwd guard, pre-cleanup ordering, conditional `--build`).
- **CLAUDE.md**: updated the corresponding `scripts/run-tests.sh` entry in the file-structure section with the same three additions, including the pre-cleanup-must-run-after-`write_override` ordering detail the final review caught.
- **TEST_CASES.md / test-cases.html / test-api.js**: not touched — no user-facing behavior or API endpoints affected.
- **PRD.md**: evaluated, not necessary — purely an internal dev-tooling change.
- **docs/superpowers/PROCESS.md**: gate evaluated — none of the three trigger conditions applied. Left untouched.
