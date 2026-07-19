# Finish-cycle report — worktree-finish-cycle-gate2-retry

**Date:** 2026-07-20
**Branch:** worktree-finish-cycle-gate2-retry → main

## What was done

2 commits:
- `cb54565` feat: add status subcommand to test-branch.sh
- `983e894` docs: wire Gate 2 auto-detection of an already-active branch env

Closes Cycle 2 of `docs/superpowers/audits/2026-07-18-test-branch-script-process-integration-audit.md`. Adds a `status` subcommand to `scripts/test-branch.sh` (reports `up`/`down` by querying Docker's real container state, no persisted state) and wires it into `.claude/commands/finish-cycle.md`'s Gate 2: a new step 1 detects whether a branch test environment from an earlier `/finish-cycle` run is still active and asks a reuse-vs-rebuild question instead of the previous, ambiguous "spin up now?" question every time. The gate's final step gains the teardown-on-confirmed-verification / leave-running-on-not-yet-verified logic `<branch-env-active>` was introduced to support. `docs/superpowers/PROCESS.md`'s `/finish-cycle` description updated to match.

## Code review follow-ups

- **Round 1, plan-mandated** — `status()` checks only container existence (`docker ps`), not health or `nginx`'s presence (`scripts/test-branch.sh`'s `status()`). A crashed/unhealthy container, or a stack where `nginx` failed to start, would still report "up", leading a user to choose "reuse" on a non-functional environment. This is the exact tradeoff explicitly discussed and approved by the user during this cycle's brainstorming (existence-only check chosen over a `wait_healthy()`-style check) — surfaced again by Gate 3's review, accepted as follow-up rather than revisited.
- **Round 1, Minor** — The "unless it was already true earlier in this same session" clause in Gate 2 step 1 (`down` + "no" branch) is vestigial: since `status` always queries fresh Docker state at the top of step 1, this clause's condition can never actually be reached within a single Gate 2 execution. Confirmed independently by 3 separate reviews across this cycle's task review, final whole-branch review, and today's Gate 3 pass. Harmless (never causes wrong behavior), just confusing prose for a future reader.
- **Round 1, Minor** — Gate 2's new step 1 has no explicit "if `scripts/test-branch.sh up`/`down`/`status` itself fails, do X" instruction, unlike Gate 1's established convention elsewhere in the same file ("if it fails: stop immediately, show the failing output verbatim").
- **Round 1, Minor** — `status()` calls `docker ps --format '{{.Names}}'` twice (once per container check) instead of once, reusing the same `grep -qx` pattern already used inline in `up()` — no functional impact (one-shot CLI script), just duplicated work/logic.
- **Round 1, Minor, edge case** — `status()` doesn't check whether `docker-compose.branch.yml` (the override file) still exists; if it's manually deleted while containers are running, `status` would report "up" but a subsequent `down` would fail on the missing file. Low-probability external-tampering scenario.

## Roadmap notes

- **Serious, newly-discovered, isolated finding (not fixed in this cycle):** `scripts/test-branch.sh`'s `write_override()`/`up()` has a structural bug pre-existing from Cycle 1 — Docker Compose concatenates `ports` lists across multiple `-f` files instead of replacing them, so the `db` service always resolves to publish **both** port 5432 (base `docker-compose.yml`) and 5433 (branch override), guaranteeing a port conflict whenever anything is already bound to 5432 (e.g. the main stack — the tool's stated primary use case, "safe to run alongside the main stack"). Verified directly via `docker compose ... config`, which showed both `published: "5432"` and `published: "5433"` in the resolved `db` service. This surfaced while Task 1's implementer tried to exercise `status()`'s live "up" path and hit a real `docker compose up` failure. Per this project's new-finding-during-execution guard, it was isolated rather than fixed here — needs a dedicated future cycle (likely: Compose's `!override` merge key, or restructuring how ports are declared).
- All 5 Gate 3 follow-ups above are candidates for that same future cycle or a dedicated `status()`/`up()` hardening pass — not urgent, none block current usage of `status()` for its intended Gate 2 purpose.

## Sync-docs outcome

- **CLAUDE.md**: added the `status` subcommand to the Development section's command block and to the file-structure tree entry for `scripts/test-branch.sh`, noting `/finish-cycle` Gate 2's automatic use of it.
- **ARCHITECTURE.md**: updated the `scripts/test-branch.sh` directory-structure entry with the same detail.
- **TEST_CASES.md / test-cases.html / test-api.js**: not touched — developer-only CLI tooling, out of their authenticated-pages/API-routes scope.
- **PRD.md**: not touched — evaluated and found not necessary; no user-visible behavior changed.
- **PROCESS.md**: gate condition 3 (modified `/finish-cycle`'s Gate 2 behavior) applies, but the update was already made directly by this cycle's own Task 2 as part of the plan — no further sync-docs action needed.
