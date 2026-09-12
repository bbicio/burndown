# Finish-cycle report — worktree-fix-owner-reassign-shares-sync

**Date:** 2026-09-12
**Branch:** worktree-fix-owner-reassign-shares-sync → main

## What was done

2 commits (systematic-debugging fix, no plan document):

- `5f3b737` fix: keep resource_shares in sync when reassigning a proposal owner
- `b8eed79` test: assert resource_shares sync after owner reassignment (DR-16)

`PATCH /api/admin/reset/cost-grid/:cgId/owner` (the sysadmin-only "Change proposal owner" widget on `_db-reset.html`) only ever updated `cost_grids.owner_id`. Every other part of the app — the share modal, the inline share list shipped in the previous cycle, and `GET/DELETE /api/cost-grids/:id/shares` — reads and writes `resource_shares`, not `cost_grids.owner_id`. The previous owner therefore kept a permanent `resource_shares` row with `permission='owner'` forever (making them permanently un-shareable, since "already has access" excludes them from the add-share search, and silently retaining owner-level `my_permission`), while the real new owner never got a `resource_shares` row at all and so never showed up in "who has access".

Fixed by wrapping the route in a transaction (matching this same file's own existing pattern) and, after updating `cost_grids.owner_id`, deleting the old owner's stale `resource_shares` row and upserting one for the new owner (`ON CONFLICT ... DO UPDATE SET permission = 'owner'`, since the new owner may already hold some other permission on the same cost grid).

Added `DR-16` to `test-api.js`'s existing owner-reassignment test block: reassigns to a genuinely different user (the pre-existing `DR-14` case only reassigned to the same owner — a no-op that never exercised the sync bug) and asserts via `GET /shares` that the old owner's row is gone, the new owner has an owner row, and exactly one owner row exists.

## How this was found

Reported by the user testing the sharing feature shipped in the previous cycle (`worktree-proposal-share-list`): searching the share modal for a known-active user's email returned "No users found." Investigated per `systematic-debugging`, not guessed at: confirmed via read-only queries against the production database that the reported user (`pda1@mailinator.com`) already held a `resource_shares` row with `permission='owner'` on the exact proposal being tested (`A.U.RO.R.A. Platform Development`), while `cost_grids.owner_id` for that same proposal pointed to a different user (`bbicio@gmail.com`) — the two had drifted apart. Traced to `reset.js`'s owner-reassignment route never touching `resource_shares`, confirmed by reading its source.

## Code review follow-ups

Round 1 (`general-purpose` subagent, medium effort, scoped to `main..HEAD` at the time — the fix commit only): 0 Critical, 0 Important, 2 Minor.

1. No automated test asserted the `resource_shares` sync behavior itself (only status codes were already covered). **Fixed in this cycle** — `DR-16` (commit `b8eed79`), added before merge per the user's own choice at the code-review gate.
2. The 2 already-corrupted production cost grids (see below) aren't tracked anywhere, risking the manual remediation step being forgotten. Not a code change — see Roadmap notes.

## Roadmap notes

- **2 production proposals need one manual remediation step, not yet done as of this report**: `9268585a-e696-4088-b36e-cc6283b1805a` ("A.U.RO.R.A. Platform Development") and `4e213464-a551-4bc4-a005-adf672ddf1fb` ("Bayer AG - BERMITS Maintenance 2026") — both confirmed via production `SELECT` to have a stale `resource_shares` owner row for `pda1@mailinator.com` while `cost_grids.owner_id` points to `bbicio@gmail.com`. **Remediation**: as sysadmin, open `_db-reset.html`'s "Change proposal owner" widget and reassign each of these 2 proposals to its own current owner (`bbicio@gmail.com`) — even though this is a no-op for `cost_grids.owner_id`, the now-fixed endpoint will still clean up the stale `resource_shares` row and insert the missing correct one, self-healing the data with no direct SQL needed. `pdash-api` has already been restarted with the fix live (`2026-09-12T13:30:22Z`), so this remediation can be done immediately via the UI.
- **Manual verification for this cycle was done at the API/data layer, not the browser UI** (the Chrome extension was disconnected when this cycle ran) — direct HTTP calls against an isolated Docker clone of the actual production data, covering reassignment to a new owner, idempotent re-reassignment to the same owner, and reassignment to a user who already held an 'editor' share (correct upsert, no duplicate-row constraint violation). The user explicitly chose to proceed on this basis rather than wait for a browser-based re-verification.
- Worth noting for future `_db-reset.html`/admin-tooling work: any endpoint that mutates `cost_grids.owner_id` (or, by extension, anything else with a parallel "obviously related" table) should be treated as needing to touch every table that derives access/ownership from it — `resource_shares` is the actual source of truth for "who can access this," not `cost_grids.owner_id` alone, and this is easy to miss since `cost_grids.owner_id` is also real and independently queried in several places (e.g. `owner_name` display, `my_permission` computation's first branch).

## Sync-docs outcome

- **ARCHITECTURE.md** — updated: §3.3 "Ownership and Sharing" bullet on ownership reassignment now names the actual sysadmin path and the 2026-09 fix; the API Reference table's row for `PATCH /api/admin/reset/cost-grid/:cgId/owner` corrected — its prior description ("Reassign cost grid owner_id to an active user") was itself accurate only for the buggy behavior and is now updated to describe the resource_shares sync too.
- **CLAUDE.md** — updated: `api/src/routes/reset.js`'s file-structure entry for this route now describes the transactional resource_shares sync and why it was needed.
- **TEST_CASES.md** + **test-cases.html** — updated in lockstep (done as part of the fix's own commit, before this Gate 5 pass): new `DR-16` case added right after `DR-15` in both files. `test-cases.html`'s embedded script re-validated with `node -e "new Function(...)"`.
- **test-api.js** — updated (also part of the fix's own commit): `DR-16` assertions appended to the existing owner-reassignment test block.
- **PRD.md** — **not updated** (evaluated: this is a bugfix restoring already-documented behavior — §16.5 and §18.1's existing descriptions of proposal-owner reassignment were not themselves inaccurate, they just didn't describe an internal consistency bug that never surfaced in the PRD's own language).
- **PROCESS.md gate** — none of the three conditions applied (no process skill touched; no recurring process exception introduced; no change to the 7-phase skeleton or scenario guardrails) → `PROCESS.md` left untouched.
