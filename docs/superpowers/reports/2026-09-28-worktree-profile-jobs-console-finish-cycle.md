# Finish-cycle report — worktree-profile-jobs-console

**Date:** 2026-09-28
**Branch:** worktree-profile-jobs-console → main

## What was done

14 commits:

- `docs: design spec for the profile jobs console (Cycle 3d)`
- `docs: implementation plan for the profile jobs console (Cycle 3d)`
- `feat: pure helpers for the profile job console (next run, run throttle, settings validation)`
- `feat: single-code profile runs, repeated-error throttle, queue helpers and worker getters`
- `feat: profile job console API (state, settings, rebuild, per-code process/remove, runs)`
- `feat: pure helpers for the profile job console page`
- `feat: profile processing console page and its Timesheets entry point`
- `fix: keep action-network errors visible past the follow-up refresh; a skipped scheduled tick no longer counts as the last run`
- `fix: apply the same skipped-run guard to bootstrap() as tick()`
- `fix: address code review round 2 (docs drift, duplicated run-cap constant, redundant back-link)`
- `fix: restore lastRunStartedAt on a thrown processQueue error too, not only skipped:true`
- `refactor: share the 'oldest project per code' tie-break as one constant`
- `refactor: extract the shared lastRunStartedAt tracking from tick()/bootstrap() into one helper`
- `fix: include POST /run in the console's auth sweep; use the shared BUSY/runResult on it too`

Delivered: a new admin console (`profile-jobs.html`, reached only via a button on `timesheets.html`) to see the profile-engine's queue, force a recalculation (all/one code/full rebuild), pull a code out of the queue, tune the worker's schedule, and read recent run history. Backend: pure scheduling helpers (`nextRunInfo`, `shouldRecordRun`, settings validation, row status) in `job-schedule.js`; the engine gained a single-code run path, a repeated-error throttle on run history, and queue helpers (`processQueue(trigger, { only })`, `dequeueProject`, `isKnownProjectCode`); 6 new `/api/profile-jobs/*` routes. No DB migration this cycle.

## Code review follow-ups

- Round 4 (docs): `docs/api/profile-engine.md` links to `docs/pages/profile-jobs.md`, which was created in this same commit range as part of this report (Gate 5) — the link resolves as of this merge, no outstanding gap.
- Round 5 (accepted as follow-up): the run-history throttle (`shouldRecordRun`) compares a repeating scheduled/bootstrap error against whatever row is *last* in `profile_job_runs`, not specifically the last scheduled/bootstrap row — an interleaved manual run (reachable via the console's own Process/Rebuild buttons) can reset that baseline, so the same recurring scheduled failure could occasionally get re-recorded instead of staying throttled. Not a data-loss bug (history stays capped at 50); a narrower version of the exact case the throttle exists to prevent. Candidate fix: scope `shouldRecordRun`'s baseline lookup to same-trigger-kind runs only.

## Roadmap notes

- The manual verification checklist (Gate 2, spec §8's non-deterministic items: settings toggle propagation timing, auto-refresh, the 409 race, a stopped-API network error, non-admin redirect) was walked by the user on the isolated branch stack per their own confirmation at Gate 2, after a partial automated pass I ran myself (browser automation) confirmed page load, navigation, breadcrumbs, real cloned-data rendering, and the settings widget's initial state before the browser extension became unresponsive.
- Docker Desktop was not running at the start of this cycle's execution and had to be started manually before the isolated integration suite (`scripts/run-tests.sh`) or the branch stack (`scripts/test-branch.sh`) could run.
- The worktree's `.env` (gitignored) had to be copied in by hand before the first `scripts/run-tests.sh` run — its absence caused the isolated Postgres container to fail its health check on the first attempt (missing `POSTGRES_PASSWORD` etc.). Not a new issue — this is the project's own documented worktree setup step (`CLAUDE.md`'s Operational note) — but worth flagging since it was easy to miss on a worktree started via the `EnterWorktree` tool rather than a manual `git worktree add`.
- This cycle's code review went 7 rounds (the default cap is 3): rounds 1 and 3 were the same underlying bug pattern (the skipped/failed-run guard on `lastRunStartedAt`), discovered incrementally as each fix revealed the next edge case in the same small code path; round 5 then found the two fixes themselves had been duplicated verbatim and asked for a shared helper. Rounds 2, 4 and 6 were independent, smaller findings (docs drift, a duplicated SQL constant, a redundant nav link, a missing auth-sweep entry, inconsistent 409 wording). Round 7 found nothing new. Worth noting for future planning: a worker's "last run" bookkeeping is a small surface that rewarded several review passes in a row — a future cycle touching similar in-memory scheduler state might budget for this upfront (e.g. writing the shared helper the first time) rather than converging on it over 3 rounds.

## Sync-docs outcome

- **ARCHITECTURE.md**: added 6 new `/api/profile-jobs/*` routes to the API Reference table; added `profile-jobs.html` and `js/lib/profile-jobs-ui.js` to the Directory Structure listing; added a Permission Matrix row for "Manage profile-engine jobs".
- **CLAUDE.md**: added `profile-jobs.html` to the Pages table and File Structure listing; extended the `api/src/routes/profile-jobs.js` entry with the Cycle 3d console routes; added `profile-jobs-ui.js` to the `js/lib/` module list.
- **docs/pages/profile-jobs.md** (new): full page narrative.
- **docs/pages/timesheets.md**: added a Cycle 3d section for the entry-point button/badge.
- **docs/js/lib.md**: added the `profile-jobs-ui.js` section.
- **docs/api/lib.md**: added the Cycle 3d additions to the existing `job-schedule.js` section.
- **docs/api/profile-engine.md**: already updated during code review (rounds 2/4/6 findings) — stale "will add" line removed, throttle documented, Cycle 3d API summary added.
- **TEST_CASES.md** / **test-cases.html**: added section 23/24 "Profile Jobs Console" with `PJ-01`…`PJ-20` (13 automated, 7 manual), mirrored exactly between both files; both syntax-checked.
- **PRD.md**: added §16.10 "Profile Processing Console" (new user-visible page); fixed the now-stale "no button to force a recalculation yet" sentence in §16.7. PRD.md evaluation: **updated** — a new, real, admin-reachable page with its own UI and actions is unambiguously user-visible.
- **`.claude/skills/operational-manual/SKILL.md`**: mirrored the same two PRD.md changes into its detail-content reference (PRD.md was touched, so this applies).
- **test-api.js**: not touched by sync-docs — Task 3 of the plan already added full `PJ-*` coverage; no new endpoints appeared afterward.
- **PROCESS.md gate**: none of the three conditions applied (no process-skill change, no recurring process exception, no change to the 7-phase skeleton or scenario guardrails) — left untouched.
