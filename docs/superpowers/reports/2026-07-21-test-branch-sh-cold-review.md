# Cold review — `scripts/test-branch.sh` and its `/finish-cycle` integration

**Date:** 2026-07-21
**Scope:** Fresh-eyes holistic review of the cumulative result of 4 development cycles (2026-07-18 → 2026-07-21), as distinct from each cycle's own per-diff code review.

**Cycles covered:**
1. `docs/superpowers/reports/2026-07-18-worktree-test-branch-env-sourcing-finish-cycle.md` — introduced `scripts/test-branch.sh` + safe `.env` parsing.
2. `docs/superpowers/reports/2026-07-20-worktree-finish-cycle-gate2-retry-finish-cycle.md` — `status` subcommand + Gate 2 auto-detection.
3. `docs/superpowers/reports/2026-07-20-worktree-test-branch-port-merge-fix-finish-cycle.md` — fixed Compose port-concatenation bug (`!override`).
4. `docs/superpowers/reports/2026-07-21-worktree-load-env-crlf-fix-finish-cycle.md` — fixed `load_env()` CRLF blank-line crash.

Originating audit: `docs/superpowers/audits/2026-07-18-test-branch-script-process-integration-audit.md`.

## Goal achievement

The tool genuinely fulfills its original purpose. Read fresh, `scripts/test-branch.sh` reads as one coherent artifact, not a patchwork — each cycle's fix landed on independent lines, none fight each other. Isolation is real on all three axes (distinct Compose project, distinct `container_name`s, distinct ports via `!override`). `.env` sourcing is shell-safe and CRLF-safe on both key and value. Independently confirmed via a live end-to-end run (both stacks up simultaneously, non-overlapping ports, `status` correct, clean teardown).

## Consolidated open items (deduplicated across all 4 reports)

| # | Item | Severity | Status |
|---|---|---|---|
| 1 | `/tmp/pdash_branch_snapshot.dump` hardcoded path: world-readable, never removed, collides under concurrent branch stacks | minor-polish | Open |
| 2 | `$COMPOSE up -d --build api nginx adminer` + `wait_healthy` duplicated in both `if`/`else` arms of `up()` | minor-polish | Open |
| 3 | `status()` checks container existence only, not health or `nginx`/`adminer` presence | minor (deliberate, user-approved tradeoff) | Open by design |
| 4 | Vestigial Gate 2 clause ("unless it was already true earlier in this same session") — unreachable dead code | minor-polish | Open |
| 5 | Gate 2 step 1 has no "if `up`/`down`/`status` itself fails, do X" instruction (unlike Gate 1's convention) | **important** — the one process-correctness gap, not just cosmetic | Open |
| 6 | `status()` calls `docker ps` twice instead of once | minor-polish | Open |
| 7 | `status()` doesn't check the override file still exists (edge case if manually deleted) | minor | Open |
| 8 | `!override` requires Compose ≥ v2.24, no version guard | minor-polish | Open (explicit YAGNI, not really actionable) |
| 9 | Branch names with `:`/`#`/`&` could break `container_name`/YAML (`tr '/ ' '__'` only maps slash and space) | minor | Open |
| 10 | A future 5th service/list field in `write_override()` could omit `!override`, reintroducing the port-concat bug | minor (maintainability) | Open |
| 11 | The `!override` explanatory comment could be condensed | trivial | Open |
| 12 | `load_env()` has no guard for a non-blank line with no `=` at all | minor | Open |
| 13 | `load_env()` does no whitespace trimming around keys/values | minor | Open |
| 14 | `load_env()` quote-stripping silently "fixes" unbalanced quotes instead of erroring | minor | Open |
| 15 | Hardcoded test-admin password (`TestBranch123!`) in source | minor (dev-only, fresh throwaway DB) | Open |
| 16 | Fresh-DB path re-applies all migrations non-idempotently | minor (only ever hits an empty DB) | Open, low real impact |

## Systemic observations (visible only from the whole-picture view)

1. **The original audit's own "Ruled out" section was wrong about the exact thing that became Cycle 3.** It asserted no port collision based on the *declared* override ports, without ever resolving the merged config via `docker compose ... config` — which would have caught the concatenation bug immediately. Lesson for future Compose-overlay audits: resolve the merged config, don't read the override file in isolation.
2. **The script's own header Usage comment (`scripts/test-branch.sh:4-6`) is stale** — documents only `up`/`down`; Cycle 2 added `status` to the `case` block and the usage-error string but never updated the top-of-file comment. No single cycle's diff review caught this since each diff's reviewer only saw its own addition, not the whole file's now-inconsistent header.
3. **Hindsight on `status()`'s existence-only check (item 3):** Cycles 3 and 4 were both about `up` failing to reach a truly working stack (port conflict; env crash) — exactly the failure class a health-aware `status()` would have caught faster. Still not wrong (Gate 2's human "verified in the browser?" step is the real safety net), but worth reconsidering if item 3 is ever revisited.
4. **No remaining doc/behavior discrepancy for this tool** — `PROCESS.md`'s `/finish-cycle` row and `finish-cycle.md`'s Gate 2 accurately describe today's behavior. (The separate, pre-existing `CLAUDE.md` hot-reload/nodemon contradiction remains unrelated and out of scope, as originally noted in the audit.)
5. **Structure held up well** across four independent cycles — each function (`load_env`, `write_override`, `wait_healthy`, `status`, `up`, `down`) stayed single-purpose. Open items are almost entirely additive robustness gaps, not tangled logic.

## Recommendation

The tool is in a good enough resting state — none of the open items block current, verified-working usage. If/when a consolidation effort is picked up, group by shared file/function rather than one-cycle-per-item or one-cycle-for-everything:

- **Cycle A — Gate 2 + `status()` hardening**: items 3, 4, 5, 6, 7. Item 5 (no failure-handling instruction in Gate 2) is the single item worth prioritizing first if only one cycle is picked — it's the one process-correctness gap, addressing the exact failure class the last two cycles actually hit.
- **Cycle B — `up()`/`write_override()` hardening**: items 1, 2, 9, 10, 11, 15, 16.
- **Cycle C — Further `load_env()` hardening**: items 12, 13, 14.

Decision as of 2026-07-21: **left in the general roadmap, no cycle opened now.** Revisit if/when any of these items starts causing real friction, or as a deliberate consolidation pass.
