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

After the loop: `profile_job_runs` gets a row for `manual` runs always; for `scheduled`/`bootstrap`, only if they processed something, or failed with an error different from the last recorded run (`shouldRecordRun`, `job-schedule.js`) — a repeated identical failure is throttled rather than writing a row every interval. History is pruned to the latest 50. If at least one code was processed, every resource with `profile_computed_at IS NULL` is stamped (so a person with no matched actuals reads "No actuals matched" instead of "Not calculated"). The advisory unlock is in `finally`; if it fails the connection is destroyed rather than returned to the pool.

## Worker and settings

`profile-worker.start()` (called from `index.js` after `listen`): a bootstrap after 5 s and a tick every 60 s (timers `unref`'d). Each tick re-reads `profile_job_enabled` / `profile_job_interval_min` from `app_settings` (defaults `true` / `10`), so changes apply without restarting the API, then runs `processQueue('scheduled')` if `isJobDue`. Bootstrap: if `resource_project_contributions` is empty but `timesheets` is not, queue everything and run once (`bootstrap`, regardless of the on/off switch); it is retried on the next tick until it succeeds. `busy`/`bootstrapping` flags prevent overlap inside one process; the advisory lock covers several.

## API

`POST /api/profile-jobs/run` (`requireAuth, requireAdmin`): `processQueue('manual')`; `{ ok, projects, resources, errors }`, or 409 `A profile job is already running`. `GET /api/resources/:id/profile`: see `docs/api/resources.md`. Integration tests PE-01..PE-14 (+PE-11b) in `test-api.js`.

Cycle 3d adds the rest of the console API in the same file (`api/src/routes/profile-jobs.js`): `GET /api/profile-jobs` (settings, next-run estimate, queue size, per-code list), `PUT /settings`, `POST /rebuild`, `POST /projects/:code/process` (single-code run via `processQueue(trigger, { only })`), `DELETE /projects/:code/queue` (`dequeueProject`), `GET /runs`. Page: `profile-jobs.html`, reached only from a button on `timesheets.html`. See `docs/pages/profile-jobs.md`.

## Known limits / follow-ups

- The worker's last-run timestamp is in memory only (a restart runs a scheduled run on the first tick).
- Attribute-list item active/inactive status change and resource `roleId`/`email` PATCH do not re-queue (no visible effect today).
- `profile_job_enabled`: any value other than `'false'` counts as enabled.
- Route hooks wait on a row lock while that code is being processed; a resource DELETE mid-run can error once and self-heals on the next run.
- Project/task descriptions reach the profile as approved topics (see "Topic extraction" below, 2026-09-29).

## Topic extraction (profile descriptions cycle, 2026-09-29)

Spec: `docs/superpowers/specs/2026-09-29-profile-descriptions-topics-design.md` (section 11 amendments win). Vocabulary and admin API: `docs/api/topics.md`. Migrations `027_project_descriptions.sql` and `028_topics.sql`.

**Descriptions.** `projects.description` and `project_tasks.description` (both `TEXT NOT NULL DEFAULT ''`). Written by `PATCH /api/projects/:id` (project metadata, incl. `description`; `POST /api/projects` accepts it too) and `PUT /api/projects/:id/tasks` (bulk replace, incl. per-task `description`); returned by `GET /api/projects`, `GET /:id/tasks`. Saving a description never calls the LLM. It only queues the project code (best-effort) when the text actually changed: `PATCH` compares with the stored value, `PUT tasks` compares `descriptionsSignature` (order-independent name+description fingerprint) before and after.

**Flow.** In `processNext` the engine first "peeks" at the next queued code (`extractTopicsForNext`: oldest `queued_at`, honouring the run's exclusion list and `only`) and calls `extractForCode(code)` **before** claiming the code, so no row lock is held during the LLM call (in a rare race the claimed code may differ from the peeked one; that code then keeps its previous topics until its next run). Then the code is claimed and processed as before. `extractForCode` (`api/src/services/topic-extraction.js`) works on the oldest project owning the code:
1. Skipped (not an error) when `topic_extraction_enabled = 'false'`, when `ANTHROPIC_API_KEY` is unset, or when no project owns the code.
2. Builds one item per text (the project description plus one per distinct task name) and compares SHA-256 hashes with `description_topic_state`. Unchanged text: nothing. Text now empty or shorter than `MIN_TEXT_CHARS = 20`: not sent, links dropped, hash stored so it is not re-evaluated until edited. Tasks that no longer exist: state and links deleted.
3. Changed extractable texts go in **one request per project** (never per resource) with the vocabulary (existing and proposed topics reusable, rejected ones forbidden) and all active attribute-list values. Prompt rules: competences only, up to 5 per text (a ceiling), English 1-4 words, reuse first, attribute-list values forbidden.
4. The answer is validated (`parseExtraction`) and neutralised server-side (`resolveCandidates`): list-value equivalents and names equal to list values discarded, rejected targets dropped, near-duplicates collapsed, merge chains followed, at most 5 per text. New names are inserted as `proposed`; links and hashes are written in one transaction.

`callAnthropic` uses plain `fetch` (no new dependency) with a 30 s timeout; its error messages never include the response body (it may echo project text).

**Aggregation.** `rebuildProfile` reads `description_topic_links`: project links (`task_key = ''`) go to every contributor of that code; task links go only to contributors whose `tasks` keys include the link's task key. The result is stored as ids and project codes in `resources.profile.topics`.

**Failure and retry.** Any failure (no response, timeout, HTTP error, unparsable answer, DB error) sets `last_error` on the state rows and does **not** update the hash, so the text is retried; the rest of the profile (hours, tags, previously extracted topics) is still built. `extractTopicsForNext` returns the code on failure; after processing, `processNext` re-queues it (`queued_at = now()`) and `processQueue` excludes it for the rest of that run, so it is retried on the next scheduled run and cannot loop. The in-memory `topicRetryCodes` set (`topicRetryCodes`) tracks codes that failed last time: a code that fails the same way again is reprocessed but not counted as work (`retryOnly`), so a persistent failure does not write a `profile_job_runs` row every interval. The error is shown in the console (`topic_error`) and is never added to `profile_job_runs` errors. A later success clears `last_error`.

**Console.** `GET /api/profile-jobs` rows carry `topic_error` (state-row errors of the oldest project owning the code) and the payload has `topicSettings: { enabled, keyConfigured }`. `PUT /api/profile-jobs/topic-settings { enabled: boolean }` (400 otherwise) writes `topic_extraction_enabled`; it is the privacy kill switch (descriptions are sent to the Anthropic API). `POST /projects/:code/process` also sets `text_hash = ''` on that project's state rows, so the manual Process button forces a re-extraction. See `docs/pages/profile-jobs.md`.

**Configuration (server `.env`, passed through `docker-compose.yml`, documented in `.env.example`).** `ANTHROPIC_API_KEY` (required for extraction; unset means silently skipped), `ANTHROPIC_MODEL` (default `claude-haiku-4-5-20251001`), `ANTHROPIC_BASE_URL` (default `https://api.anthropic.com`; the tests point it at a local stub).

**Deploy.** Migrations `027` (its backfill is apply-once) and `028` must be applied by hand to the real `pdash-db` and to any `test-branch.sh` stack (it skips migrations on an existing schema); set `ANTHROPIC_API_KEY` in the server `.env`. Backfilled descriptions are extracted as their codes flow through the queue (no automatic mass re-extraction).

Integration tests: `PD-*`, `TP-*`, `TX-*`, `PT-*` in `test-api.js` (`TEST_CASES.md` section 24).
