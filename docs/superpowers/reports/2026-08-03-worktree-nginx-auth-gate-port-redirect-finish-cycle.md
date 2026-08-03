# Finish-cycle report — worktree-nginx-auth-gate-port-redirect

**Date:** 2026-08-03
**Branch:** worktree-nginx-auth-gate-port-redirect → main

## What was done

4 commits (2 docs, 2 fix):

- `308f408` docs: brief + design spec for nginx auth-gate port-redirect fix
- `a2d31dc` docs: implementation plan for nginx auth-gate port-redirect fix
- `b089b28` fix(nginx): stop auth-gate redirect from dropping the external port
- `2453d1c` fix: strip stray UTF-8 BOM accidentally introduced into nginx.conf

`nginx.conf`'s auth-gate (`location / { auth_request /auth-check; error_page 401 = @to_login; }`) redirected unauthenticated visitors via `return 302 /login.html`, which nginx always expanded into an *absolute* URL it cannot construct correctly — nginx has no visibility into Docker's external port mapping, only its own internal `listen 80`. On the main stack (published on port 80) this was invisible/correct by coincidence; on any isolated branch test stack (`scripts/test-branch.sh`, always a non-80 port), an unauthenticated visitor got redirected clean out of the branch environment into the main stack's login page. Fixed with a single `absolute_redirect off;` directive, making nginx emit a relative `Location: /login.html` that the browser resolves against its own actual request URL (port included).

## Process notes

This cycle followed the full spec-driven process end to end (Brief → `/brainstorming` → Spec → `/writing-plans` → Piano → `subagent-driven-development` → `/finish-cycle`), the first cycle in a while to do so without a lightweight deviation. Two operational mistakes happened during execution, both self-corrected before merge, worth recording so they don't recur silently:

- **Stray worktree from a controller mistake:** the first implementer dispatch was given `isolation: "worktree"`, which made the Agent tool create its own separate temporary worktree instead of working in the one already prepared for this cycle. The resulting commit (`f77f3cd`) had to be cherry-picked into the correct branch (`b089b28`) and the stray worktree/branch discarded afterward. Lesson: when a worktree is already entered via `EnterWorktree` for the session, dispatch subagents *without* `isolation: "worktree"` — that parameter is for agents that need their own isolated copy, not ones meant to continue work already isolated at the session level.
- **Stray UTF-8 BOM:** whichever tool/agent edited `nginx.conf` during the first dispatch introduced a BOM at the very start of the file (absent on `main`, present in the cherry-picked commit). Caught by inspecting the file at the byte level (`xxd`) rather than trusting a clean-looking text diff, and fixed with a dedicated follow-up commit rather than amending. Also worth noting: this session's shell tool silently resets its working directory back to the entered worktree between calls in some circumstances — caught a merge attempt that had actually run against the wrong directory's stale uncommitted state (see below) by re-verifying `pwd`/`git rev-parse --show-toplevel` inline within the same command rather than trusting a prior `cd`'s effect to persist across tool calls.
- **Redundant uncommitted change in the main checkout:** at merge time, the main repo root's own working tree had an uncommitted change to `nginx.conf` — content-identical to this cycle's fix, apparently left behind by the first (mistaken) implementer dispatch reloading the actually-running `pdash-nginx` container, which is bind-mounted from the main checkout, not from any worktree copy. Confirmed identical (accounting for a line-ending difference in the raw `diff` output, resolved by comparing via `git diff` instead, which is line-ending-aware) before discarding it with `git checkout -- nginx.conf`. Same precedent as a similar stray-checkout-state finding in an earlier cycle (`worktree-pipeline-version-management`).

Gate 2's manual-verification step and Gate 3's code-review step were both satisfied by evidence already gathered during `subagent-driven-development`'s own per-task review and final whole-branch review (both clean, no findings) rather than re-run from scratch — noted explicitly rather than silently skipped, per this project's rule that any process deviation be confirmed in the moment and recorded, not assumed to carry over to future cycles.

## Code review follow-ups

None. Per-task review (spec compliance + code quality) and the final whole-branch review both reported zero findings.

## Roadmap notes

- None new. This cycle closes the nginx-port-redirect item that was itself a Roadmap note from `docs/superpowers/reports/2026-08-01-worktree-dead-xlsx-and-branch-gitignore-finish-cycle.md`.

## Sync-docs outcome

- **TEST_CASES.md** / **test-cases.html** — updated in lockstep: `A-05` ("Unauthenticated redirect") reworded to make the port-preservation guarantee explicit (redirect stays on the same host:port the request arrived on), rather than adding a new, oddly-shaped case for what's really a refinement of an existing one.
- **CLAUDE.md** — not touched. Its only `nginx.conf` mention (dev-toolchain denial rules) is unaffected and still accurate.
- **ARCHITECTURE.md** — not touched. No DB/API/Docker-topology change; its `nginx.conf` mentions (bind mount, dev-toolchain denial) are unaffected.
- **test-api.js** — not touched. No API endpoints changed; this is an nginx-level fix, outside that file's scope.
- **PRD.md** — evaluated, left untouched. Zero user-visible behavior change for the main stack (port 80 already "worked" by coincidence); the fix only corrects behavior on the isolated branch-testing workflow, not a documented product feature/flow.
- **docs/superpowers/PROCESS.md** — evaluated via the gate, left untouched. None of the three trigger conditions applied: no process-skill change, no new *recurring* process exception (the Gate 2/3 evidence-reuse was a one-off, cycle-specific call, not a proposed standing rule), and no change to the 7-phase skeleton or scenario guardrails.
