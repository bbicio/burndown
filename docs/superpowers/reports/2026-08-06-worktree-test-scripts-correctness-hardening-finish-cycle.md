# Finish-cycle report — worktree-test-scripts-correctness-hardening

**Date:** 2026-08-06
**Branch:** worktree-test-scripts-correctness-hardening → main

## What was done

6 commits:

- `2eb7848` fix: skip malformed .env lines and trim whitespace in test-branch.sh load_env()
- `0aaab52` fix: skip malformed .env lines and trim whitespace in run-tests.sh load_env()
- `060ba30` fix: make test-branch.sh's fresh-database migration loop idempotent
- `c32cf64` fix: status() now checks container health, not just existence
- `73cd2e0` fix: status() also checks container Running state, not just stale health status
- `2b69f1f` fix: load_env() skips lines with invalid shell identifier keys

Cycle 1 of a 3-cycle hardening backlog for `scripts/test-branch.sh`/`scripts/run-tests.sh`. Executed via Brief → Brainstorming → Spec → Plan → Subagent-Driven Development (4 plan tasks, each independently reviewed) → a final whole-branch review that caught 2 additional Important findings, fixed in one follow-up wave and re-verified clean.

## Code review follow-ups

None. The final whole-branch review (run as part of SDD execution, substituting for `/code-review` which isn't self-invocable) found 2 Important findings — both fixed in this branch before merge, not deferred:
- `status()` trusted a possibly-stale `.State.Health.Status` on a stopped/crashed container (Docker doesn't reset health status on stop) — fixed by also requiring `.State.Running = true`.
- `load_env()` still hard-aborted the whole script under `set -e` on a key that isn't a valid shell identifier (e.g. a stray `export FOO=bar` line) — fixed with an identifier-validity regex guard, applied identically to both scripts.

## Roadmap notes

Surfaced during Gates 1-4 and the SDD execution, none blocking, all worth tracking for future cycles:

- **Interrupted migration loop still silent-skips on retry.** `schema_exists()` only checks for `public.users` (created by the first migration file). If a first `up` is interrupted after some migrations but before all 17 apply, the next `up` will see `public.users` exists and skip the *entire* remaining loop silently, leaving a half-migrated schema with no warning. Explicitly out of scope for this cycle (spec only required two full consecutive `up` runs not to fail) — good candidate for Cycle 2 or 3.
- **`schema_exists()` doesn't check `psql`'s own exit status.** A transient connection failure falls through to "schema absent" (safe direction — re-runs migrations rather than skipping them incorrectly) rather than propagating a real error. Low risk since `wait_healthy()` already confirms DB health immediately before this runs.
- **`status()`'s "missing" fallback string is reachable only for a genuinely nonexistent container**, not "container exists but has no healthcheck defined" (that case yields an empty string, which still correctly falls to "down"). Cosmetic; no functional impact.
- **`line`/`key`/`val` are not `local`-declared inside `load_env()`** (pre-existing style, not introduced this cycle) — they leak into the calling shell's namespace after the function returns. No live collision found, but `local line key val` would close the door on one.
- A local, uncommitted, partial duplicate of the `load_env()` fix was found sitting in the main checkout (not the worktree) during Gate 4 — discarded with the user's confirmation before merging. Unrelated to this cycle's own work; flagging only because it was an unexpected pre-merge state worth being aware could recur.
- Two implementer subagents during SDD execution reported writing detailed report files (`task-2-report.md`, `final-fix-report.md`) that were never actually found on disk — a process/reporting gap in those specific subagent runs, not a code defect. Both underlying code changes were independently re-verified against the diff regardless, so nothing shipped unverified.

## Sync-docs outcome

- **ARCHITECTURE.md**: updated the `scripts/test-branch.sh` and `scripts/run-tests.sh` entries in the file tree (around the `scripts/` section) to describe the three 2026-08 fixes: health-based `status()`, idempotent fresh-DB migrations via `schema_exists()`, and `load_env()`'s malformed-line/whitespace/invalid-identifier handling.
- **CLAUDE.md**: updated the `Development` section's `test-branch.sh status` quick-reference line and the `File structure` section's `scripts/test-branch.sh`/`scripts/run-tests.sh` entries with the same three fixes.
- **TEST_CASES.md / test-cases.html / test-api.js**: not touched — these scripts are dev tooling with no user-facing behavior or API endpoints affected; no existing test cases reference them beyond the "Auto = covered by `scripts/run-tests.sh`" legend line, which is still accurate.
- **PRD.md**: evaluated, not necessary — this cycle is a purely internal/dev-tooling change (bash script fixes for the branch-testing helper scripts), not user-visible behavior.
- **PROCESS.md**: gate evaluated — none of the three trigger conditions applied (no process-skill change, no recurring exception introduced, no change to the 7-phase skeleton or scenario guardrails). Left untouched.
