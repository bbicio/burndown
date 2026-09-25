# Finish-cycle report — worktree-profile-engine

**Date:** 2026-09-25
**Branch:** worktree-profile-engine → main (merge commit `a26f834`)

Sub-cycle 3c "Profile Engine" of Cycle 3 (resource profile): per-person hours from matched actuals are computed in the background into a cached profile shown on `team.html`'s Experience profile tab. Spec: `docs/superpowers/specs/2026-09-25-resource-profile-design.md`. Design detail: `docs/api/profile-engine.md`.

Process facts: executed **subagent-driven**; three per-task SDD reviews plus a final whole-branch opus review; the code review needed **four rounds** (the user authorised going past the 3-round cap); a weekly-limit failure interrupted round 4 and it was retried.

## What was done

11 commits on the branch, merged `--no-ff`:

- `e3b72c6` pure modules — `api/src/lib/resource-profile.js`, `api/src/lib/job-schedule.js` and their `node:test` suites
- `a96f7c1` engine, manual run, profile endpoints and upload hooks — migration `026_profile_engine.sql`, `services/profile-engine.js`, `POST /api/profile-jobs/run`, `GET /api/resources/:id/profile`, enqueue on timesheet upload/delete
- `bfb9460` enqueue hooks — projects (tags, code, seed), attribute-list item rename, resources rescan
- `3bc4c02` worker — `services/profile-worker.js` (60 s tick, settings re-read each tick, bootstrap), started from `index.js`
- `56c8fd0` Experience profile tab — `buildProfileTree` in `js/lib/team-ui.js`, tab states in `team.html`
- `5e36e41` worker bootstrap retry, advisory unlock hardening, `profile_computed_at` stamped for unmatched resources
- `8f321f2` inactive resources keep their profile — match rule: active first, inactive as a fallback
- `5f2d15a` aliases moved from their own tab into a collapsed accordion at the bottom of Details
- `3448d41` project rename/delete re-queue (plus a per-run match-context cache, later removed)
- `e0a6c3d` fix for the stale cached match context mid-run
- `159c713` match-context cache removed; loaded per code again (structural fix)

Integration tests PE-01..PE-14 (+PE-11b) in `test-api.js`. The user restarted `pdash-api` themselves after the merge (not verified by the controller).

## Code review follow-ups

- Round 1, two findings, both fixed: project rename/delete did not re-queue the code; the match context should be loaded per code, not once per run.
- Round 2, one finding, fixed: a stale cached match context mid-run.
- Round 3, one finding: a code re-queued while waiting kept its old `queued_at`. Resolved structurally by removing the cache (`159c713`) rather than patching.
- Round 4: no findings.
- Minor reviewer notes left open: attribute-list item active/inactive status change does not re-queue (no visible effect today); resource `roleId`/`email` PATCH does not re-queue; hook requests wait on the claimed row lock; a resource DELETE mid-run can error once and self-heals on the next run.

## Roadmap notes

- Sub-cycle 3d: job console `profile-jobs.html` (Recalculate now, Rebuild all, interval widget, run history); today there is no UI to force a recalculation.
- Bring project/task descriptions into the profile (verify the proposal-to-project carry-over first).
- A `planning.html` inactive-team handling cycle: future hours only to active owners, TBD otherwise, a badge, a bulk `requireAuth` endpoint.
- Cycle 4: AI.
- Known limits recorded in `docs/api/profile-engine.md`: a permanently failing code writes an error run row every interval (flushes the 50-row history); the worker's last-run timestamp is in memory only; any `profile_job_enabled` value other than `'false'` means enabled.
- Older deferred items still open: costgrid `toggleTag` rollback race; the `:vId`/`:id` gap on structure/linked-projects/duplicate routes; `cgVersionId` UUID validation on `PATCH /projects`; `scripts/test-branch.sh` not applying new migrations to a restored dump.
- The local branch `worktree-profile-engine` was deleted after the merge (`git branch -d`, at the user's request) and the worktree was removed.

## Sync-docs outcome

Updated (uncommitted):
- `ARCHITECTURE.md` — schema for the 3 new tables and 2 new columns, the 2 endpoints, migration `026`, services/routes/`team-ui.js` tree entries.
- `CLAUDE.md` — migration `026` row, `resource-profile.js`/`job-schedule.js`, `profile-engine.js`/`profile-worker.js`, `profile-jobs.js` route entry, `GET /:id/profile` on resources.js, `buildProfileTree`, team.html Purpose column (Experience profile tab).
- `docs/api/profile-engine.md` (new), `docs/api/lib.md`, `docs/api/resources.md`, `docs/js/lib.md`, `docs/pages/team.md`.
- `TEST_CASES.md` and `test-cases.html` (mirrored): new section "Profile Engine" with PE-01..PE-14 (+PE-11b) `auto` and manual PE-15..PE-21; MA-09 reworded (inactive fallback), TU-07/TU-08 marked as moved/superseded. In the HTML the Regression section was renumbered 23 to 24.
- `PRD.md` §16.7 (Experience profile paragraph; panel now has two tabs, Aliases as an accordion) and the matching entry in `.claude/skills/operational-manual/SKILL.md`.

Not changed: `test-api.js` (PE tests already committed).

**PRD.md:** evaluated, updated (the Experience profile tab is a new user-visible screen). Operational-manual reference updated to match.

**PROCESS.md gate:** none of the three conditions applies (no process skill changed, no recurring exception to the standard process introduced, the 7-phase skeleton and scenario guardrails untouched; the extra review rounds were user-authorised and specific to this cycle). `PROCESS.md` not touched.
