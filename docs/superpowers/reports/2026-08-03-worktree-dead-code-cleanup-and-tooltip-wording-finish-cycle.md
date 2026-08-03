# Finish-cycle report — worktree-dead-code-cleanup-and-tooltip-wording

**Date:** 2026-08-03
**Branch:** worktree-dead-code-cleanup-and-tooltip-wording → main

## What was done

1 commit:

- `ec38776` chore: remove dead `_resolveCgIdForVersion`, generalize "To be planned" tooltip wording

Bundled from the backlog per explicit user request, under a deliberately lightweight process (no Brief/Spec/Plan ceremony, same deviation basis as the earlier xlsx+gitignore cycle):

- Removed `_resolveCgIdForVersion()` (`js/api-sync.js`) — confirmed zero callers anywhere in the repo (its own declaration was the only match); already superseded by resolving `cg_id` directly from `GET /api/projects`'s server-side JOIN.
- Generalized the "To be planned" column tooltip, identical across all three Resource Planning grouping views in `planning.html` (By Role, By Project, By Owner): was "when a role has multiple tasks and one is over-consumed" — inaccurate for By Owner, which groups by task, not role (per `PL-12`). Now "when this row aggregates multiple items and one is over-consumed" — true regardless of what each view's row represents.

## Backlog reconciliation

The original request bundled 4 backlog items (dead code: `_resolveCgIdForVersion`, `app.js`, `js/main.js`; plus the tooltip wording). Before touching anything, verification showed **`app.js` and `js/main.js` no longer exist** — both were already deleted in an earlier cycle (commit `2d4446f`, "chore: remove confirmed-dead js/dashboard.js, js/config-form.js, js/main.js, app.js, and openPlanningAiAnalysis()"). The backlog list presented at the start of this cycle was reconstructed from a full sweep of all 35 prior `finish-cycle` reports, but that sweep still missed that a later report had already closed these two items — a reminder that "Roadmap notes" accumulate forward-only; nothing in this project currently marks an item as closed retroactively across all the reports that once listed it as open, so reconciliation against actual repo state (not just report text) is necessary before starting any bundled cleanup cycle. Actual scope executed: just `_resolveCgIdForVersion()` + the tooltip wording.

A 5th candidate item (XLS column-mapping keyword-breadth ambiguity) was deliberately excluded from this cycle at the assistant's recommendation and the user's confirmation: unlike the other four, it's a real behavior/design decision affecting timesheet upload parsing (user-facing data ingestion), not simple cleanup — it remains in the backlog for its own dedicated cycle.

## Code review follow-ups

None. Manual review of the 2-file diff found no issues.

## Roadmap notes

Updated full backlog snapshot, superseding the previous (incomplete) list from the nginx cycle's conversation:

**Still open:**
- FOUC-adjacent: `defer` on non-order-dependent `<script>` tags across the 13 Vue pages (Efficiency follow-up from the `v-cloak` fix).
- Sold-hours input validation (no technical constraint enforcing {integers, 0.25, 0.4, 0.75}).
- `formatDate()` (`timesheets.js:193-194`) lets a garbage/unparseable date string pass through unvalidated — distinct from the sold-hours item above.
- `js/ai.js`'s divergent, case-sensitive task/role matching + residual logic — independent reimplementation that no longer matches the fixed `planning.html` logic.
- Trimmed-key vs. original-key mismatch in timesheet column mapping (`sampleKeys` are `.trim()`-ed but row objects are indexed with original, possibly-untrimmed header keys) — distinct pre-existing bug from the keyword-breadth ambiguity below.
- XLS column-mapping keyword-breadth ambiguity (e.g. owner's generic `'name'` keyword can claim a column before a more-specific field gets a chance) — explicitly excluded from this cycle, see above.
- Known `/finish-cycle` Gate 2 blind spot: can't find spec/plan files committed to `main` before the branch existed — reconfirmed again in the two most recent cycles.
- `scripts/test-branch.sh` hardening backlog, accumulated across several cycles, never addressed in a dedicated cycle: world-readable `/tmp` `pg_dump` snapshot with no cleanup and a concurrent-stack collision risk; hardcoded ports with no conflict check; non-idempotent migration application; hardcoded test-admin password in source; `status()` checks existence not health; a vestigial clause in Gate 2 of `finish-cycle.md`; missing error-handling instructions if `up`/`down`/`status` fail; a double `docker ps` call in `status()`; `status()` doesn't check override-file existence; `load_env()` has no guard for a non-blank line with no `=`, and does no whitespace trimming around keys/values.
- Recurring worktree-removal permission-denied pattern — less pressing lately (the last several cycles cleaned up fine via `ExitWorktree`), but a known environment quirk worth remembering.

**Closed, corrected from the earlier (stale) list presented this session:**
- `app.js` and `js/main.js` dead code — already deleted in commit `2d4446f`, predating this session's backlog reconstruction.
- All 4 "Cycle C" pipeline/cost-grid product-decision items (New Proposal flow, delete-only-version UX, single-version tab label, Publish validation message) — confirmed already resolved in later cycles, verified against `TEST_CASES.md`'s `CG-38`/`CG-45`/`CG-46`/`CG-47`.

## Sync-docs outcome

- **CLAUDE.md** / **ARCHITECTURE.md** — both updated: their historical mentions of `_resolveCgIdForVersion()` (describing the 2026-07 fix that made it obsolete) now also note it was confirmed callerless and deleted in this 2026-08 cycle, rather than leaving the impression the function still exists somewhere.
- **TEST_CASES.md** / **test-cases.html** — updated in lockstep: `PL-08`'s expected-tooltip text reworded to match the new generalized wording, with a note on why (the old "role" wording was inaccurate for By Owner).
- **test-api.js** — not touched. No API endpoints changed.
- **PRD.md** — evaluated, left untouched. Dead-code removal is invisible to users; the tooltip wording fix is a minor accuracy correction to existing copy, not a new feature/flow — PRD doesn't describe tooltip copy at that granularity.
- **docs/superpowers/PROCESS.md** — evaluated via the gate, left untouched. This cycle's process deviation (skipping Brief/Spec/Plan) was an explicit one-off per §3, not a proposed standing policy change; none of the three trigger conditions applied.
