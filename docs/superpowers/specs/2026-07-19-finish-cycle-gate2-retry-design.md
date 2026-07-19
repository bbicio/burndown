# Design — Gate 2 auto-detects an already-active branch test environment

**Date:** 2026-07-19
**Brief:** `docs/superpowers/briefs/2026-07-18-finish-cycle-gate2-retry-behavior-brief.md`
**Scenario:** 2 — Evolution (Finding 3, `docs/superpowers/audits/2026-07-18-test-branch-script-process-integration-audit.md`)

## Problem

`finish-cycle.md`'s Gate 2 has no wiring to `scripts/test-branch.sh` yet (confirmed: `grep -n "test-branch" .claude/commands/finish-cycle.md` returns nothing). The originally-reviewed offline proposal would have added a "Spin up an isolated test environment for this branch now? [yes/no]" question to Gate 2 step 1, leaving the stack running if the manual-verification answer is "no" so the user can keep testing after a fix. But a second `/finish-cycle` run (after that fix) would hit the same question again while the previous run's stack is still up, with no defined behavior for that case — reuse it? rebuild it? does the question even still make sense as worded?

## Expected behavior

Gate 2 detects whether a branch-specific test stack is already running and adapts its question accordingly, rather than asking the same "spin up now?" question regardless of state.

## Design

### 1. `scripts/test-branch.sh status` (new subcommand — dependency on Cycle 1's script)

A third subcommand alongside `up`/`down`. Reuses the same container-naming variables already computed in the script (`DB_CONTAINER`, `API_CONTAINER`, derived from the current branch name — no new logic duplicated).

```bash
status() {
  if docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER" && \
     docker ps --format '{{.Names}}' | grep -qx "$API_CONTAINER"; then
    echo "up"
    exit 0
  else
    echo "down"
    exit 1
  fi
}
```

Added to the existing dispatch:
```bash
case "${1:-up}" in
  up) up ;;
  down) down ;;
  status) status ;;
  *) echo "Usage: $0 [up|down|status]" >&2; exit 1 ;;
esac
```

- Checks **both** the DB and API containers' existence via `docker ps`, matching the same "does this look genuinely up" bar the rest of the script uses (`up()` already gates on `wait_healthy "$API_CONTAINER"` before considering the stack ready) — a stack where only the DB container exists (partway through `up`, or after a crash) reports `down`, prompting the normal from-scratch flow rather than a false "reuse".
- No new persisted state — always queries Docker's actual state, never a session variable. Consistent with the brief's constraint against introducing a new state file.
- No changes to the existing `up()`/`down()` functions or their behavior.

### 2. `finish-cycle.md` Gate 2 — new step 1

Inserted before the gate's existing steps (which are renumbered but otherwise unchanged — spec/plan lookup, the "have you verified in the browser?" question, and the conditional teardown on "yes" all stay exactly as already written):

```markdown
1. Run `scripts/test-branch.sh status`.
   - If `down` (exit 1): ask explicitly "Spin up an isolated test environment
     for this branch now? [yes/no]"
     - If yes: run `scripts/test-branch.sh up`. Record `<branch-env-active>` = true.
     - If no: record `<branch-env-active>` = false (unless already true from
       earlier this session).
   - If `up` (exit 0): ask explicitly "An isolated test environment for this
     branch is already running (from an earlier `/finish-cycle` run on this
     branch) — reuse it, or rebuild it with fresh data from main?
     [reuse/rebuild]"
     - If reuse: do nothing further. Record `<branch-env-active>` = true.
     - If rebuild: run `scripts/test-branch.sh down`, then
       `scripts/test-branch.sh up`. Record `<branch-env-active>` = true.
```

The rest of Gate 2 (spec/plan lookup, the manual-verification question, and the `<branch-env-active>`-conditioned teardown) is renumbered to follow this new step 1 but is otherwise identical to what was already reviewed and approved in Cycle 1's audit.

### 3. `PROCESS.md` update

Line 26's `/finish-cycle` description gains a clause noting Gate 2 auto-detects an already-running branch stack and adapts its question (reuse vs. rebuild) instead of asking the same "spin up now?" question unconditionally. This keeps `PROCESS.md` aligned with the new Gate 2 wording, per the brief's acceptance criteria.

## Testing

`scripts/test-branch.sh status` is a small, deterministic shell function — verified manually (no automated shell-test framework in this repo, consistent with Cycle 1):
1. No containers running for the current branch → `status` prints `down`, exit 1.
2. Both `$DB_CONTAINER` and `$API_CONTAINER` running (after a real `up`) → `status` prints `up`, exit 0.
3. Only `$DB_CONTAINER` running (partial/crashed `up`) → `status` prints `down`, exit 1 (not a false "reuse").

`finish-cycle.md`'s new Gate 2 step 1 is prose consumed by an LLM executing the command, not code — verified by manual walkthrough of both branches (down-path asks the original question; up-path asks the new reuse/rebuild question) during execution of the implementation plan, not by an automated test.

## Scope excluded

- No changes to `up()`/`down()` internals beyond adding the new `status()` function and the dispatch case.
- No changes to Gate 2's existing steps beyond inserting the new step 1 ahead of them and renumbering.
- No changes to Gates 1, 3, 4, 5, 6 of `finish-cycle.md`.
- The pre-existing `CLAUDE.md` hot-reload/nodemon discrepancy — out of scope, as already noted in the originating audit.
