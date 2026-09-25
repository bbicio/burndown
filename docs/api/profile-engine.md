# Profile engine (Cycle 3c, 2026-09-25)

Files: `api/src/services/profile-engine.js` (queue + processing), `api/src/services/profile-worker.js` (scheduler), `api/src/lib/resource-profile.js` and `api/src/lib/job-schedule.js` (pure logic, `docs/api/lib.md`), `api/src/routes/profile-jobs.js`, migration `026_profile_engine.sql`. Spec: `docs/superpowers/specs/2026-09-25-resource-profile-design.md`. UI: `docs/pages/team.md` (Experience profile tab).

## Model

Each person's profile is the **sum of per-project contributions**, so recalculating one project code never erases experience earned on others.
- `resource_project_contributions (resource_id, project_code) -> data JSONB`: hours, first/last month, hours per role code, hours per task (task key = lowercased whitespace-collapsed name).
- `resources.profile` (aggregated JSON: totals, dimensions by attribute-list slug with values and `untaggedHours`, roles, projects) and `resources.profile_computed_at`.
- Everything is keyed by **`project_code`**, not project id (`timesheets` is keyed by code and `projects.code` is not unique). A code resolves to its **oldest** project (`ORDER BY created_at, id`); with no project, the name comes from the actuals and there are no tags. Tags are not copied into contributions: they are read from `project_tags` at aggregation time.
- Only owner names that resolve to a resource count (alias, or exact normalized name; see `match-resource.js`). Active resources match first; inactive ones are a fallback when no active one shares the name, so deactivating a person keeps their name-matched history.

## Queue

`profile_project_state` is both queue and state: in queue = `queued_at IS NOT NULL`. `enqueueProjects(codes)` upserts and keeps the OLDEST `queued_at` (`COALESCE`); `enqueueAll()` queues every code in `timesheets` plus every code already tracked (so codes whose actuals were deleted get cleaned). The `...Quiet` variants swallow and log errors: route hooks must never fail the request.

Hooks: timesheets upload/delete (uploaded/deleted codes); projects.js tags PUT, code create/change (old and new code), seed from a version, rename, delete; attribute-lists item label rename (all); resources rescanAll (all, i.e. resource create/rename/status/delete and alias changes).

## Processing

`processQueue(trigger)` takes a session advisory lock (`pg_try_advisory_lock(hashtext('profile_engine'))`; busy returns `{skipped:true}`, the route answers 409) and loops `processNext(failed)`:
- claim one code (`UPDATE ... queued_at = NULL` on a row picked with `FOR UPDATE SKIP LOCKED`, oldest first, excluding codes that already failed in this run), all inside **one transaction per code**;
- load the match context (resources + aliases) **per code** (a cached context caused three review rounds of staleness bugs and was removed), read the code's actuals rows, build contributions, replace that code's rows, rebuild the profile of every affected resource (previous and new contributors; a resource left with none gets `profile = NULL`, `profile_computed_at = now()`);
- update the state row (`last_processed_at`, `last_rows`, `last_resources`, `last_error = NULL`), commit, then refresh the Unmatched list for that code (best-effort);
- on failure: rollback, set `last_error` and re-queue the code, and exclude it for the rest of the run so the run terminates.

After the loop: `profile_job_runs` gets a row for `manual` runs always, for `scheduled`/`bootstrap` only if they processed something or failed; history is pruned to the latest 50. If at least one code was processed, every resource with `profile_computed_at IS NULL` is stamped (so a person with no matched actuals reads "No actuals matched" instead of "Not calculated"). The advisory unlock is in `finally`; if it fails the connection is destroyed rather than returned to the pool.

## Worker and settings

`profile-worker.start()` (called from `index.js` after `listen`): a bootstrap after 5 s and a tick every 60 s (timers `unref`'d). Each tick re-reads `profile_job_enabled` / `profile_job_interval_min` from `app_settings` (defaults `true` / `10`), so changes apply without restarting the API, then runs `processQueue('scheduled')` if `isJobDue`. Bootstrap: if `resource_project_contributions` is empty but `timesheets` is not, queue everything and run once (`bootstrap`, regardless of the on/off switch); it is retried on the next tick until it succeeds. `busy`/`bootstrapping` flags prevent overlap inside one process; the advisory lock covers several.

## API

`POST /api/profile-jobs/run` (`requireAuth, requireAdmin`): `processQueue('manual')`; `{ ok, projects, resources, errors }`, or 409 `A profile job is already running`. `GET /api/resources/:id/profile`: see `docs/api/resources.md`. Integration tests PE-01..PE-14 (+PE-11b) in `test-api.js`.

## Known limits / follow-ups

- No UI yet to force a recalculation: sub-cycle 3d (console `profile-jobs.html`) will add Recalculate now / Rebuild all / interval widget / history.
- A permanently failing code re-queues itself and writes an error run row every interval, which eventually flushes the 50-row history.
- The worker's last-run timestamp is in memory only (a restart runs a scheduled run on the first tick).
- Attribute-list item active/inactive status change and resource `roleId`/`email` PATCH do not re-queue (no visible effect today).
- `profile_job_enabled`: any value other than `'false'` counts as enabled.
- Route hooks wait on a row lock while that code is being processed; a resource DELETE mid-run can error once and self-heals on the next run.
- Project/task descriptions are not in the profile yet (future cycle).
