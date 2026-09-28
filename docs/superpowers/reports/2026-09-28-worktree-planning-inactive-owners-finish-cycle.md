# Finish-cycle report — worktree-planning-inactive-owners

**Date:** 2026-09-28
**Branch:** worktree-planning-inactive-owners → main

## What was done

10 commits:

- `a1503ac` feat: add POST /api/resources/match-owners for planning.html inactive-owner detection
- `6dbdf28` feat: add redistributeExcludingInactive pure function for planning-calc
- `b348a7f` feat: fetch owner active/inactive status map on planning.html load
- `86f1d66` feat: exclude inactive owners from future-hours split in By Project view
- `3b11104` fix: add synthetic TBD row when all owners on a task+role are inactive
- `c04e0da` feat: exclude inactive owners from By Owner view, add inactive badges and help text
- `f546a40` docs: sync planning.md and bump planning-calc.js cache-bust for inactive-owner cycle
- `b3c41aa` fix: correct blank-owner placeholder handling in future-hours redistribution
- `ae3df4e` fix: address code review findings for planning inactive-owners cycle
- `70c90e4` fix: keep By Owner Sold-hours attribution inactive-agnostic (round 2 review)

Built via `superpowers:subagent-driven-development`: a fresh implementer + fresh task reviewer per task (Tasks 1–6 of `docs/superpowers/plans/2026-09-28-planning-inactive-owners.md`), plus a final whole-branch review on the most capable model. Two mid-execution rulings were made by the coordinator (not in the original plan/spec text) — see the plan's self-review note and the SDD ledger (deleted after merge per the skill's own cleanup step) for full detail:
1. The plan's Task 4 Step 2b claimed `byProjectView`'s `displayOwners` needed no change; the design spec actually requires a visible TBD row when every owner on a task+role is inactive. Fixed in Task 4, carried forward proactively into Task 5's `byOwnerView`.
2. The final whole-branch review found a genuine regression (a real blank-owner `'—'` placeholder row losing its future/sold share whenever real named actuals coexisted on the same task+role) — fixed in one dispatch, re-verified clean by a scoped re-review.

## Code review follow-ups

- **Round 1 (fixed this cycle):** `byOwnerView`'s `ownerFutureProps` was computed from the unfiltered `ownerTotals` while `ownerNames`/`displayOwners` filter to >0.01h — a near-zero owner's computed future share could be silently dropped from displayed totals. Fixed by pre-filtering `ownerTotals` before the redistribution call. Also: the "inactive" badge markup was duplicated 4×, extracted into a shared `INACTIVE_BADGE_HTML` constant + `inactiveBadgeSuffix()` helper. Also: `POST /api/resources/match-owners` now caches the `resources`/`resource_aliases` query results for 30s instead of re-querying on every page load/XLS upload, invalidated by `rescanAll()` on any write.
- **Round 2 (fixed this cycle, explicit scope expansion beyond the original spec, requested by the user):** By Owner's `ownerSold` had always scaled with the same proportion as future hours — the design spec explicitly left this as pre-existing, intentional behavior, and the final whole-branch review had already declined to flag it citing that spec line. Round 2's independent reviewer re-surfaced it as counter-intuitive (an inactive owner showing `Sold=0` next to nonzero `Actuals`); the user chose to fix it. Restored a separate `ownerActualsProp` (the original, inactive-agnostic formula) used only for `ownerSold`, leaving `ownerTbpH` on the inactive-excluding proportion.
- **Round 2, duplication finding: accepted as-is.** `displayOwners`/`ownerProp` logic duplicated between `byProjectView`/`byOwnerView` — already reviewed and declined by the final whole-branch review as mirroring pre-existing duplication in the file, per explicit prior instruction not to refactor it.
- **Round 3 (accepted as follow-up, not fixed — user's explicit choice, low likelihood at this project's actual scale):**
  - `api/src/routes/resources.js:58` — the 2000-name cap on `match-owners` could theoretically be hit on a very large deployment (names aren't normalized before the client-side uniqueness check, so case variants count separately); the frontend fails open silently (no visible error) on any non-2xx response, so the whole feature would quietly stop working with no signal to the user.
  - `api/src/routes/resources.js:32` — the new 30s cache has no in-flight request de-duplication; a burst of concurrent requests right at cache expiry can each trigger their own DB query instead of one.

## Roadmap notes

- **Worktree `.env` gap (environment/tooling, not a code bug):** a freshly created worktree (via `EnterWorktree`) does not inherit the main checkout's gitignored `.env` file, since `git worktree add` only copies tracked files. This broke both `scripts/run-tests.sh` (Gate 1's backend integration test — skipped this cycle by explicit user choice) and `scripts/test-branch.sh up` (Gate 2 — recovered by the user copying `.env` into the worktree by hand after the Write tool correctly refused to write plaintext secrets itself, flagged as credential leakage). Worth a documented fix in a future cycle — e.g. `scripts/test-branch.sh`/`scripts/run-tests.sh` could check for a missing `.env` up front and print a clear one-line remediation (`cp ../../.env .env` or similar) instead of failing 60s later with an opaque Postgres "superuser password is not specified" error, or CLAUDE.md's worktree-setup guidance could mention this explicitly.
- No dead code or other candidate bugs surfaced beyond what's already listed under Code review follow-ups above.

## Sync-docs outcome

- **ARCHITECTURE.md** — added `POST /api/resources/match-owners` to the Resources & Attribute Lists API Reference table (Auth: ✅, matching the `attribute-lists.js` convention for `requireAuth`-only routes in an otherwise admin-gated router).
- **CLAUDE.md** — `api/src/routes/resources.js`'s file-structure entry updated to mention the new route. `planning.html`'s Pages-table/File-structure entries were already routed to `docs/pages/planning.md` from an earlier cycle — no change needed there (purpose/scope unchanged).
- **docs/api/resources.md** — corrected the file's opening line (no longer "every route is admin-gated") and added a new section for the match-owners route, its matching-rule reuse, auth placement rationale, and the 30s cache.
- **docs/js/lib.md** — added a full entry for the new `redistributeExcludingInactive` export, matching this file's existing per-function narrative style.
- **docs/pages/planning.md** — extended the in-cycle "Inactive-owner handling" section with everything found and fixed during `/finish-cycle`'s own code-review gate (the plan-defect TBD-row fix, the byOwnerView owner-set mismatch, the blank-owner placeholder regression, the Sold-hours carve-out, badge dedup, and backend caching) plus the accepted-as-follow-up items.
- **TEST_CASES.md** / **test-cases.html** — added PL-24 through PL-29 (mirrored exactly between both files): inactive-owner exclusion in both views, the all-inactive TBD case, unmatched-name fail-open, XLS export parity, the Sold-hours carve-out, and fail-open on a fetch failure.
- **test-api.js** — added `POST /api/resources/match-owners` to the SEC-01 unauthenticated-401 loop, and a new MA-15/16/17 block in `testResourceMatching()` (status resolution for an inactive resource, input validation, and — MA-17 — confirming the route is reachable by a plain non-admin user via the existing `getPlainUserCookie()` helper, unlike every other route in that file).
- **PRD.md** — evaluated: **updated**. This is user-visible behavior (a new badge, a changed hour-distribution rule visible in two views and their exports), so it clears the "ask, don't guess" bar from the 2026-09 PRD revision without needing to ask — the change is unambiguously user-facing. Added a new bullet under §5.3's Formulas list describing the owner-level split, the inactive-exclusion rule, the Sold/Actuals invariant, and the badge.
- **`.claude/skills/operational-manual/SKILL.md`** — PRD.md was updated, and the changed section (§5 Resource Planning) falls within the manual's own inlined reference (its own §5 mirrors PRD §5.3 point-by-point) — added a matching point 8b at the same level of detail as its neighbors.
- **PROCESS.md gate:** **none of the three conditions applied** — this cycle didn't touch a process skill, didn't establish a new *recurring* process exception (the `.env`-in-worktree issue above is an environment/tooling gap, not a process rule), and didn't modify the 7-phase skeleton or any scenario's guardrails. `PROCESS.md` left untouched.
