# Finish-cycle report — worktree-test-branch-env-sourcing

**Date:** 2026-07-18
**Branch:** worktree-test-branch-env-sourcing → main

## What was done

3 commits:
- `9724d1d` feat: add scripts/test-branch.sh with safe .env sourcing
- `ab2c180` fix: strip trailing CR in load_env() to handle CRLF .env files
- `887adac` chore: pin .sh files to LF line endings via .gitattributes

Introduces `scripts/test-branch.sh` — an isolated Docker Compose stack for testing a feature branch before merge, with a shell-safe `.env` parser (`load_env()`) mirroring `api/src/create-admin.js`'s approach (manual line-by-line read, never `source`/`eval`, since real `.env` values in this repo contain shell-special characters like `$$`). This closes Cycle 1 of the two-cycle plan from `docs/superpowers/audits/2026-07-18-test-branch-script-process-integration-audit.md`.

## Code review follow-ups

- **Round 1, Minor** — Fixed dump file left at a hardcoded path (`scripts/test-branch.sh:111-112`, `/tmp/pdash_branch_snapshot.dump`), never cleaned up, colliding under concurrent invocations. Accepted as follow-up (belongs to the deferred `up`/`down` hardening cycle — see Cycle 2 brief, `docs/superpowers/briefs/2026-07-18-finish-cycle-gate2-retry-behavior-brief.md`).
- **Round 1, Minor** — Duplicated `$COMPOSE up -d --build api nginx adminer` + `wait_healthy "$API_CONTAINER"` in both branches of the clone-vs-fresh `if/else` (`scripts/test-branch.sh:114-115` and `:122-123`). Accepted as follow-up — same deferred `up`/`down` hardening cycle.
- **Round 1, Minor** — `load_env()`'s quote-stripping silently "fixes" asymmetric/unbalanced quotes (e.g. `"value'`) instead of erroring (`scripts/test-branch.sh:29-31`). Low real-world risk; accepted as follow-up alongside the already-known missing `trim`/`eq<0` guard (noted in the task-level and final whole-branch reviews) if `load_env()` is ever revisited.

## Roadmap notes

- Final whole-branch reviewer flagged (out of scope for this cycle, not fixed): the `pg_dump`/`pg_restore` temp-file approach at `/tmp/pdash_branch_snapshot.dump` is world-readable, not cleaned up, and would collide if two branch stacks are brought up concurrently — belongs to a future cycle hardening `up`/`down`.
- Altitude-angle code review pass raised broader architectural questions about the whole `up`/`down` implementation (the `docker-compose.branch.yml` override-file workaround for fixed `container_name`s, hardcoded non-conflict-checked ports, non-idempotent migration application, hardcoded test-admin password in source) — all pre-existing in the reviewed offline proposal, carried over verbatim per this cycle's approved design (Cycle 1 scope was `load_env()` only). Candidates for the Cycle 2 follow-up work or a dedicated future hardening cycle, not this one.
- Self-surfaced during Gate 3 (not from any of the 8 review angles): `core.autocrlf=true` with no prior `.gitattributes` meant a future Windows checkout of `scripts/test-branch.sh` could silently gain CRLF line endings, which `write_override()`'s heredoc would then embed into the generated `docker-compose.branch.yml` YAML. Fixed in this cycle (`887adac`) rather than deferred, since it was a one-line, low-risk, immediately-relevant fix to the file this cycle was already touching.
- Cycle 2 (`docs/superpowers/briefs/2026-07-18-finish-cycle-gate2-retry-behavior-brief.md`) — wiring `scripts/test-branch.sh` into `finish-cycle.md`'s Gate 2 and resolving the open design question about re-running `/finish-cycle` with the branch stack already active — remains unstarted.

## Sync-docs outcome

- **ARCHITECTURE.md**: added `scripts/test-branch.sh` (and `.gitattributes`) to the directory-structure listing.
- **CLAUDE.md**: added `scripts/test-branch.sh` to the file-structure tree; added a "test a feature branch in isolation" command block to the Development section.
- **TEST_CASES.md / test-cases.html / test-api.js**: not touched — their coverage scope is authenticated pages and API routes; `scripts/test-branch.sh` is developer-only CLI tooling, out of that scope.
- **PRD.md**: not touched — evaluated and found not necessary; this cycle changed no user-visible behavior (internal dev tooling only).
- **PROCESS.md**: not touched — gate evaluated explicitly, none of the three trigger conditions applied (no process skill introduced/modified, no recurring exception taken, no change to the 7-phase skeleton or scenario guardrails).
