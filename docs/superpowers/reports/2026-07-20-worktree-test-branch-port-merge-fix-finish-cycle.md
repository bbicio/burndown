# Finish-cycle report — worktree-test-branch-port-merge-fix

**Date:** 2026-07-20
**Branch:** worktree-test-branch-port-merge-fix → main

## What was done

1 commit:
- `7dd2994` fix: use !override merge tag for branch-specific ports

Fixes a structural bug in `scripts/test-branch.sh`'s `write_override()` discovered during the prior cycle (`worktree-finish-cycle-gate2-retry`): Docker Compose concatenates `ports` lists across multiple `-f` files instead of replacing them, so the branch-specific override always tried to publish both the base port (e.g. 5432) and the branch port (e.g. 5433) — guaranteeing a conflict whenever the main stack was already running, which defeated the tool's entire stated purpose ("safe to run alongside the main stack"). Adds the Compose Specification's `!override` YAML merge tag to all four `ports:` declarations (db, api, nginx, adminer), forcing a full replace instead of concatenation. Verified both via `docker compose ... config` (each service resolves to publish only its branch-specific port) and via a live `scripts/test-branch.sh up` run while the main stack was actually running, producing no port-conflict error.

## Code review follow-ups

- **Round 1, already-accepted trade-off** — `!override` requires Docker Compose ≥ v2.24; no version guard was added (explicit YAGNI decision made during this cycle's brainstorming, re-surfaced by Gate 3's review but not new).
- **Round 1, out of scope** — Branch names containing special characters (`:`, `#`, `&`) could theoretically produce invalid `container_name` values or break YAML parsing — but this concerns pre-existing code (`scripts/test-branch.sh:46`'s `tr` sanitization and the `container_name` lines) untouched by this diff; the plan's Global Constraints explicitly excluded touching `container_name` handling.
- **Round 1, Minor** — A future fifth service or new list-type field added to `write_override()`'s heredoc could omit `!override` and silently reintroduce the same bug class; the explanatory comment is a block above the function rather than inline per-line. Already noted by the prior cycle's final whole-branch review.
- **Round 1, Minor** — The explanatory comment (7 lines) could be condensed to ~3-4 lines without losing technical content (root cause + fix + version requirement).

## Roadmap notes

- **Serious, newly-discovered, isolated finding (not fixed in this cycle):** `load_env()` (`scripts/test-branch.sh`, introduced in an earlier cycle) crashes with "invalid variable name" on any blank line when `.env` has CRLF line endings. Confirmed real, not theoretical: this developer's actual `.env` file has CRLF endings and 4 blank section-separator lines. Root cause: a blank CRLF line has no `=` character, so the entire line (just `\r`) is read into `$key` by `IFS='=' read -r key val`; `\r` is neither empty (fails the `-z` check) nor `#`-prefixed, so it reaches `${!key+x}` where bash errors on the invalid identifier. Comment lines are accidentally safe (still `#`-prefixed despite the trailing `\r`). This blocks `scripts/test-branch.sh up`/`status`/`down` entirely whenever a real `.env` file (with blank lines, as this one has) is present in the script's working directory — discovered while the controller independently ran a live verification of this cycle's own fix. Needs a dedicated future cycle (likely: strip trailing `\r` from `$key` too, not just `$val`, before the emptiness check).
- All Gate 3 follow-ups above remain candidates for a future `write_override()`/`load_env()` hardening cycle, alongside the 5 follow-ups already accumulated from the prior cycle (`status()` health-vs-existence, vestigial Gate 2 clause, missing error-handling instructions, double `docker ps` call, no override-file-existence check).

## Sync-docs outcome

- **CLAUDE.md / ARCHITECTURE.md**: not touched — both already describe the script's intended behavior (distinct ports, safe alongside the main stack) accurately; this fix makes that already-documented intent actually true, no correction needed.
- **TEST_CASES.md / test-cases.html / test-api.js**: not touched — developer-only CLI tooling, out of scope.
- **PRD.md**: not touched — evaluated and found not necessary; no user-visible behavior changed.
- **PROCESS.md**: gate evaluated explicitly, none of the three trigger conditions applied.
