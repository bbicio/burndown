# Finish-cycle report — worktree-load-env-crlf-fix

**Date:** 2026-07-21
**Branch:** worktree-load-env-crlf-fix → main

## What was done

1 commit:
- `bd5f910` fix: strip trailing CR from load_env()'s key, not just its value

Fixes a crash in `scripts/test-branch.sh`'s `load_env()`, found during the prior cycle (`worktree-test-branch-port-merge-fix`): a blank line in a CRLF-terminated `.env` file has no `=` character, so the entire line (just `\r`) was read into `$key` instead of being skipped, crashing bash with "invalid variable name" the moment it reached `${!key+x}`. Confirmed real on this developer's actual `.env` (CRLF endings, 4 blank section-separator lines) — blocked every subcommand of `scripts/test-branch.sh` whenever `.env` was present in the script's working directory. One-line fix: strip the trailing `\r` from `$key` too, mirroring the identical handling already applied to `$val`. Verified live twice, independently (implementer + controller), with a realistic CRLF fixture.

This cycle was run intentionally light at the user's request: brainstorming skipped its extended Q&A (the fix was already fully understood going in), and Gate 3 was a direct single-pass review by the controller instead of the full 8-angle dispatch, given the diff was one line and had already passed two prior review rounds (task review + final whole-branch review) with zero findings.

## Code review follow-ups

None.

## Roadmap notes

- The brief and plan explicitly excluded (not fixed, deliberately deferred) two related `load_env()` gaps: no guard for a non-blank line with no `=` at all (would still reach `${!key+x}` with the whole line as `$key`), and no whitespace trimming around keys/values. Neither is new — both were already noted across prior cycles' reviews.
- The 5 Gate 3 follow-ups from the `worktree-finish-cycle-gate2-retry` cycle and the follow-ups from `worktree-test-branch-port-merge-fix` remain open, unrelated to this fix.

## Sync-docs outcome

- **CLAUDE.md / ARCHITECTURE.md**: not touched — neither documents `load_env()`'s internals; the script's documented interface (`up`/`down`/`status`) is unchanged.
- **TEST_CASES.md / test-cases.html / test-api.js**: not touched — developer-only CLI tooling, out of scope.
- **PRD.md**: not touched — no user-visible behavior changed.
- **PROCESS.md**: gate evaluated explicitly, none of the three trigger conditions applied.
