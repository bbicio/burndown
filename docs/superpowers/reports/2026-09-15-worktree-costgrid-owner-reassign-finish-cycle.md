# Finish-cycle report — worktree-costgrid-owner-reassign

**Date:** 2026-09-15
**Branch:** worktree-costgrid-owner-reassign → main

## What was done

5 commits:

- `5942b92` feat: rename Portfolio button to Project Dashboard; add owner reassignment to costgrid.html
- `e7b63bd` fix: address code review findings on owner-reassignment feature
- `991ff0c` fix: keep shared_by current on reassign; add regression test for owner-downgrade guard
- `14eec2d` fix: guard rollback, use APP_URL fallback, align reset.js owner-reassign logic
- `cbe9a25` fix: reset.js owner-reassign route attributes shared_by to the actor, not the new owner

Feature summary: renamed the "📊 Portfolio" button to "📊 Project Dashboard" in both `pipeline.html`'s
detail panel and `costgrid.html`'s linked-projects area. Added a new owner-reassignment capability
directly in `costgrid.html`: an admin-or-sysadmin-visible "Reassign to…" dropdown next to the Owner
line, available regardless of version lock state. Selecting a different active user, after an explicit
confirm, calls a new `PATCH /api/cost-grids/:id/reassign-owner` route which: updates `cost_grids.owner_id`;
syncs the cost grid's `resource_shares` (`owner` row moves to the new user); grants the new owner an
`editor` `resource_shares` row on every project linked to any version of the proposal (without ever
downgrading a project the new owner already owns outright); and emails the new owner a notification
listing the linked projects, via a new `sendOwnerReassignedEmail` (`api/src/services/email.js`).

## Code review follow-ups

5 rounds of code review were run (round 3 hit the finish-cycle process's 3-round cap; the user
explicitly opted to continue past it — round 4 found one residual issue, round 5 came back clean).
All findings were fixed in this cycle, none deferred:

- **Round 1** (4 findings, fixed): linked-project editor grant could downgrade an existing project
  owner to editor; `js/api.js`'s `?v=` cache-bust wasn't bumped after adding `reassignOwner()`
  (bumped to `v=5` across all 10 consuming pages); the inline `<share-list>` went stale after a
  reassignment (now bumps `shareListRefreshTick`); `loadReassignOwnerOptions()` used a raw `fetch`
  instead of the existing `Api.users.activeList()` wrapper (lost the 401-redirect behavior).
- **Round 2** (2 findings, fixed): no regression test covered the exact owner-downgrade scenario the
  round-1 fix addressed (added `CGR-09`); `ON CONFLICT DO UPDATE` left `shared_by` stale on both the
  cost-grid and project grants (now refreshes it).
- **Round 3** (3 findings, fixed): the new route's `ROLLBACK` was unguarded (added `.catch(() => {})`,
  matching the sibling route in the same file); the reassignment email's link used bare
  `process.env.APP_URL` instead of `email.js`'s own fallback-carrying constant (exported and adopted
  it); the pre-existing sysadmin-only reassignment route in `reset.js` hadn't received the round-2
  `shared_by` fix, so the two owner-reassignment code paths were diverging (applied the same fix there).
- **Round 4** (1 finding, fixed): the round-3 fix to `reset.js` still bound `shared_by` to the new
  owner's own id instead of the actor performing the reassignment — corrected to `req.user.id`,
  matching the parallel `cost-grids.js` route.
- **Round 5**: no findings.

## Roadmap notes

- `sendShareNotification` (an earlier, pre-existing call in `cost-grids.js`) still builds its email
  link from bare `process.env.APP_URL` rather than `email.js`'s own fallback-carrying `APP_URL`
  constant — the same class of bug fixed in this cycle for `sendOwnerReassignedEmail`, left as-is
  since it predates this cycle and wasn't part of its diff. Flagged by round-3 code review as a
  known, accepted minor.
- Two independent code paths now perform cost-grid owner reassignment — `cost-grids.js`'s new
  `PATCH /:id/reassign-owner` (admin/sysadmin, also grants project-editor access, sends email) and
  `reset.js`'s pre-existing `PATCH /admin/reset/cost-grid/:cgId/owner` (sysadmin-only, cost-grid-only,
  no project grants, no email). They were kept deliberately separate rather than merged/deduped in
  this cycle (round-3 code review raised this as an architectural observation, not a blocking defect)
  — a future cycle could consider unifying them if the divergence causes real maintenance friction.

## Sync-docs outcome

- **CLAUDE.md**: updated the `costgrid.html` file-structure entry with a new "Owner reassignment
  (2026-09)" paragraph describing the dropdown, the new route, and the linked-project editor grant
  logic; updated the `pipeline.html` entry with the button-rename note; updated `api/src/routes/reset.js`'s
  entry with the round-3/4 hardening detail; updated `api/src/services/` entry to list
  `sendOwnerReassignedEmail` and the new exported `APP_URL` constant.
- **ARCHITECTURE.md**: added a bullet under the ownership/sharing section describing the new
  in-editor reassignment path and how it differs from the `_db-reset.html` one; added the new
  `PATCH /api/cost-grids/:id/reassign-owner` row to the API Reference table.
- **TEST_CASES.md** / **test-cases.html**: added SH-15 (dropdown visibility), SH-16 (reassignment
  effect, marked `auto` — covered by `test-api.js`'s CGR-01..09), and SH-17 (button rename) to
  §15 Sharing, mirrored identically in both files.
- **test-api.js**: already updated as part of the feature's own commits (`CGR-01`..`CGR-09`); no
  further sync needed.
- **PRD.md**: updated — this is genuinely new user-visible admin capability. §18.1 Ownership gained
  a paragraph describing the new in-editor reassignment flow (cross-referencing §4.9 and §16.6);
  §4.4 Detail Panel's linked-project button description updated from "Portfolio" to "Project
  Dashboard".
- **PROCESS.md gate**: none of the three trigger conditions applied (no process-skill change, no new
  recurring exception, no change to the 7-phase skeleton or scenario guardrails) — this cycle
  followed `feature-brief` → `brainstorming` (bounded) → implementation → `/finish-cycle` exactly as
  documented. Left untouched.
