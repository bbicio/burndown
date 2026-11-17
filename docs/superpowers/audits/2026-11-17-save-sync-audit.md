# Save / Sync Layer Audit (frontend → API writes)

**Date:** 2026-11-17
**Scope (agreed with the user before any code was read):** verification-only. Every frontend write to the API (`POST`/`PUT`/`PATCH`/`DELETE`) on every page: `js/api-sync.js`, the `Api.*` namespace in `js/api.js`, and direct `apiFetch`/raw `fetch` calls in `js/*.js` and `js/pages/*.js` (tests excluded), including admin, master-data, profile, auth, notification, share and upload paths. The server is read only as far as needed to tell, per endpoint, whether it has concurrency control, whether the write is a full replacement or a field patch, and which refusals it returns.
**Finding:** (a) an error or refusal lost, i.e. not shown, or shown as success; (b) a stale-overwrite path, where a local copy (page open a long time, another tab, another user, another page) can overwrite newer server data, including whole-list or whole-section replacements; (c) UI/server divergence left after an error, with no rollback and no reload; (d) inconsistent outcome contracts across pages. (d) is input for the single save contract.
**Ground truth:** open-ended, checked against CLAUDE.md "Data strategy" and `docs/js/api-sync.md`.
**Context:** Phase 1 of a single save contract with a confirmed outcome and the server as the only source of truth, introduced page by page, with no build step.

## Method

- Read `js/api.js` and `js/api-sync.js` in full. Grepped `api/src` for concurrency primitives: `If-Match`, `ETag`, `updated_at` comparisons, `version`, `FOR UPDATE`, advisory locks.
- Four read-only agents read the write call sites by area: cost grid/pipeline; project-config/portfolio/program/planning; master data/team/timesheets/profile-jobs; auth/admin/nav/notifications/shares. They also swept all of `js/` for raw-fetch writes, `sendBeacon`/`keepalive` and `beforeunload`/`pagehide`/`visibilitychange`, and the root `*.html` for inline write logic.
- Every High finding below, and the specific claims it rests on, was re-read by hand at the cited lines. Medium/Low findings rest on the agents' reading plus spot checks.
- I did not run the app, and no race was reproduced. Where a race is possible by construction but was not observed, the finding says so.

## Inventory: write call sites by outcome contract

| Area | Call sites | Contract | Outcome shown to the user |
|---|---|---|---|
| Cost-grid autosave (`cgAutoSave` → `_cgUpsertVersionToApi`) | debounce `js/costgrid.js:755-765`; Save button `:767-784`; `switchVersion`/`goBack`/`openLinkedProject` `js/pages/costgrid.js:658-668,793`; `onPipelineChange`/`onCurrencyChange`; generate/publish/new version | `Promise<boolean>`; `strict` throws | Success: a toast (debounce) or the button label. Failure: only for 4 rule codes, otherwise console only |
| Cost-grid lifecycle (new/clone grid, new version, duplicate, publish, delete grid/version, refresh-rate, reassign owner) | `js/costgrid.js:272-316,788-1122`, `js/pages/pipeline.js:438-458`, `js/pages/costgrid.js:371-383` | awaited, throws | shown (`showInfo`/`showConfirm`/native `alert`) |
| Project push (`_pushProjectToApiDetailed`) | `project-config.js:595-653` (Save); `costgrid.js:1185` (add tasks), `:1411` (generate) | `{ok, failed}`, never throws | project-config: a banner. costgrid: partial |
| Version↔project link (`linkedProjects.add`) | `costgrid.js:1417`, `:1214-1217` | throws, but caught and swallowed | not shown |
| Tags (`PUT …/tags`, replace-all) | `js/pages/costgrid.js:707-737`, `project-config.js:354-374` | awaited; error to console | the checkbox reverts (costgrid) or stays flipped (project-config) |
| Master data via `Api` (clients, groups, roles, ratecards, pipeline years, POTs, currencies) | `master-*.js`, `js/clients.js` | throws | inline message or banner |
| Raw-fetch pages (`attribute-lists`, `profile-jobs`: wrapper `{ok,status,data}`; `team`, `admin`, `login`, `activate`, `reset-password`, `terms`, `_terms-editor`, `_db-reset`: ad hoc) | `attribute-lists.js:133-145`, `profile-jobs.js:90-106`, `team.js:421-646`, `admin.js:217-407`, … | never throws / ad hoc | inline; no 401 redirect, no overlay, no timeout |
| Uploads (`POST /timesheets/upload`) | `js/upload.js:6,34`, `project-config.js:511-536` | throws | shown |
| Notifications read state | `js/notifications.js:135-139,153-162` | `.catch(() => {})` | never |
| Shares | `js/shares.js:259-341`, `js/share-list-component.js:57-64` | throws | inline, or native `alert` |

`portfolio.js`, `program.js`, `planning.js`, `js/tags.js`, `js/core.js`, `privacy-notice.js` and `help.js` write nothing. Planning's two `POST`s (`planning.js:409`, `:518`) are computations.

## Findings

### SY-01 — Every write is last-writer-wins: only ratecard entries check a version

- **Type:** Stale overwrite (cross-cutting). **Severity:** High.
- **Location:** server: `api/src/routes/cost-grids.js:445-464` (version `PATCH`), `:841` (structure `PUT`, `DELETE FROM phases` then re-insert), `:1239-1243` (tags); `api/src/routes/projects.js:248-266` (`PATCH`), `:496` (tasks `PUT`), `:555,594,629,648` (whole-column phasing/ptc/planning/groups); `config.js:262` (role `rate_overrides`); `resources.js:184-227`; `app-settings.js:122-155`; `pots.js:405-414`. The exception is `config.js:438-445`.
- **Evidence:** the only optimistic check in `api/src` is the ratecard entries save:
  ```js
  const card = await client.query('SELECT id, version FROM ratecards WHERE id = $1 FOR UPDATE', [req.params.id]);
  …
  if (card.rows[0].version !== req.body.version) { await client.query('ROLLBACK'); return res.status(409).json(STALE); }
  ```
  Every other `FOR UPDATE` (`projects.js:309,450,539,578,617`) and the advisory lock in `api/src/lib/version-lock.js:12` exist to serialise a rule check with its write. None of them compares what the client last saw.
- **Description:** the client sends whole entities and sections from memory, and the server accepts whatever arrives last. On the client side, the ratecard pattern (`master-clients.js:510,531,548`) shows the server's 409 message but offers no reload and no `err.data.code` branch.
- **Root cause:** the data strategy treats the API as the source of truth only at page load. After that, writes are "update memory, then push". Neither side carries a token that says "this is based on what you gave me at T". The one versioned write was added for a specific race on ratecards and was never generalised.

### SY-02 — Cost-grid autosave re-sends every header field and the whole structure from the copy taken at version open

- **Type:** Stale overwrite. **Severity:** High.
- **Location:** `js/api-sync.js:200-243`; `js/pages/costgrid.js:531-538` (draft loaded once per open); `api/src/routes/cost-grids.js:445-464`, `:526-528`.
- **Evidence:** every autosave builds `serverMeta` with `label, pipeline, startDate, endDate, currency, note, status, projectName, linkedProjects, ratecardId, clientId` (`api-sync.js:200-212`) and PUTs `{phases, roles, period}` (`:239-243`). The server applies each field present (`if (pipeline !== undefined) … pipeline = $n`, `cost-grids.js:459`).
- **Description:** user B has the editor open and user A moves the stage to Committed. B edits one hour, and B's 2 s autosave sends `pipeline: 'SIP'` back. A's change is reverted silently, and the stage-change notification to admins fires (`cost-grids.js:526-528`). The same holds for currency, label, note, ratecard, client and project name, and for every phase, task, role and rate through the structure `PUT`. The grid-name `PATCH` (`api-sync.js:194`) re-sends a name the editor never edits.
- **Root cause:** `_cgUpsertVersionToApi` is a "push the draft" function, not a "send the change" function. The draft is never refreshed while the editor is open.

### SY-03 — "Add tasks to project" re-pushes the costgrid page's page-load copy of the whole project

- **Type:** Stale overwrite (cross-page). **Severity:** High.
- **Location:** `js/costgrid.js:1183-1185`; `js/api-sync.js:313-321`; `js/pages/costgrid.js:1194` (`loadConfigFromApi()` at `created()`).
- **Evidence:**
  ```js
  proj.tasks.push(...newTasks);
  const pushResult = await _pushProjectToApiDetailed(proj, { skipEmpty: true });
  ```
  `skipEmpty` skips only empty sections (`const wanted = v => skipEmpty ? nonEmpty(v) : present(v);`, `api-sync.js:318`).
- **Description:** a project-config save made after the costgrid page loaded is overwritten on every field the project `PATCH` carries: name, code, programId, clientId, pipeline, status, description and cgVersionId. The task list is replaced, the period is sent with the stale dates, and every non-empty phasing/ptc/planning/groups section is replaced.
- **Root cause:** the comment at `api-sync.js:314-315` recognises the stale copy but protects only empty sections. The operation only needs "append these tasks to project X", yet it reuses the whole-project push.

### SY-04 — A failed project `PATCH` falls back to `POST`, which recreates deleted projects and hides the real error

- **Type:** Lost error, silent divergence. **Severity:** High.
- **Location:** `js/api-sync.js:324-338`; `api/src/routes/projects.js:156-200`, `:350`.
- **Evidence:**
  ```js
  if (updateErr?.data?.code === 'PROJECT_RULE' || updateErr?.data?.code === 'DATE_RULE') { … return …; }
  try { await Api.projects.create({ ...meta, id: project.id }); }
  ```
  On the server, an admin's `PATCH` on a deleted project returns 404 (`if (!rows[0]) return res.status(404)…`, `:350`). A non-admin gets 403 from `canEdit`. `POST` then inserts with `COALESCE($1::uuid, uuid_generate_v4())`, owned by `req.user.id`, and re-seeds tags from the version (`:170-200`). `meta.cgVersionId` is always carried (`api-sync.js:304`), so the "a project needs a proposal" rule passes.
- **Description:**
  - A project deleted in another session is silently recreated with the same id by whoever saves a stale copy, even someone who could no longer edit it.
  - On a live project, a 500, a network error or a 403 becomes a duplicate-key `POST` error. That error is the one reported (`failed[0].error`), so the user never sees the cause.
- **Root cause:** the fallback dates from when project ids were created client-side and a project might "not be there yet" (comment at `:327-328`). Since the currency lock, direct creation is inhibited, so the case it served no longer exists for non-sysadmins.

### SY-05 — Cost-grid autosave failures other than four rule codes reach only the console, and memory stays diverged

- **Type:** Lost error, divergence. **Severity:** High.
- **Location:** `js/api-sync.js:224-229`, `:245-250`; `js/costgrid.js:729-765`.
- **Evidence:** `console.warn('[sync] version upsert failed:', e.message); … if (e.data?.code === 'DATE_RULE' || e.data?.code === 'CURRENCY_RULE') notifyRefusal(e, false);`. The debounce does `cgAutoSave().then(ok => { if (!ok) return; … toast.show() })` (`costgrid.js:760-763`).
- **Description:**
  - A 403, 404, 500, timeout or network failure shows nothing. The only signal is a missing toast.
  - `_cgStore` already holds the draft (`cg.versions[idx] = _cgDraft; cgSave(cg)`, `:737-738`) and is never rolled back or reloaded.
  - The user keeps editing a version the server no longer accepts.
  - The Save button (`:767-784`) shows "⚠ Not saved" for 1.5 s and gives no reason.
- **Root cause:** the header comment states the design: "All API calls are fire-and-forget: errors are logged but never block the UI" (`api-sync.js:10`). Refusal notices were added later, code by code.

### SY-06 — Pending cost-grid edits are lost on navigation; publish ignores a failed flush

- **Type:** Lost write. **Severity:** High.
- **Location:** `js/pages/costgrid.js:658-668`, `:793`; `js/costgrid.js:798-822`.
- **Evidence:**
  - `goBack() { cgAutoSave(); this.backSaving = true; await new Promise(r => setTimeout(r, 500)); window.location.href = '/pipeline.html'; }`
  - `openLinkedProject(projId) { cgAutoSave(); showDashboardView(projId); }`
  - `switchVersion` calls `cgAutoSave();` without awaiting it.
  - Publish does `await cgAutoSave(false, { background: false });`, ignores the result, publishes, then calls `window.location.reload()`.
- **Description:**
  - A three-request save chain that takes longer than 500 ms is cut off by `goBack`.
  - `openLinkedProject` navigates at once.
  - An edit still inside the 2 s debounce is lost on sidebar navigation, a reload or a tab close. There is no `beforeunload` on costgrid; only `master-clients.js:120` and `project-config.js:205` have one, and no `sendBeacon`/`keepalive` exists anywhere.
  - Publish reloads over a failed save.
- **Root cause:** saves are not awaitable as a unit: no queue, no "pending" state that navigation can wait on.

### SY-07 — Overlapping cost-grid autosaves are not serialised

- **Type:** Stale overwrite (self-race). **Severity:** Medium (possible by construction, not observed).
- **Location:** `js/costgrid.js:729-752`; the direct `cgAutoSave()` callers in `onPipelineChange`/`onCurrencyChange` (`:744-749`, `:1098`, `:1172`), `cgDoGenerateProject` (`:1442`), and the debounce.
- **Evidence:** `cgAutoSave` has no in-flight flag or queue. Each call snapshots the draft and starts its own PATCH→PATCH→PUT chain. `cgAdoptServerRate` (`:708-727`) writes `currencyRate` from whichever response returns.
- **Description:** two chains can interleave on the server. An older structure `PUT` or server-rate response can land last. The Save button does not clear the pending debounce timer, so a click followed by the debounce fires two saves.
- **Root cause:** same as SY-06.

### SY-08 — A failed link write is swallowed: tasks look free again and can be generated twice

- **Type:** Lost error, divergence. **Severity:** High.
- **Location:** `js/costgrid.js:1411-1432` (Generate), `:1214-1217` (Add tasks); `api/src/routes/cost-grids.js:938-942`.
- **Evidence:**
  - Generate: `await Api.costGrids.versions.linkedProjects.add(…)` runs inside a `try` whose `catch` only logs (`console.warn('[sync] project generation sync failed:', e.message)`). The link is then pushed into `_cgDraft.linkedProjects` and the user is told the project was created.
  - Add tasks: `.catch(e => console.warn('[sync] task_ids update failed:', e.message))`.
  - `linkedProjects.add` sends the whole `taskIds`/`taskNames` lists, and the server upsert replaces them (`ON CONFLICT DO UPDATE SET task_ids = EXCLUDED.task_ids`).
- **Description:**
  - The project exists with `cg_version_id`, but no `cg_version_projects` row carries its task ids. After a reload those tasks show as unassigned.
  - A stale `lp` also drops task ids added from another tab.
  - The autosave cannot repair this: the version `PATCH` sends `linkedProjects`, but the server ignores it (SY-09).
- **Root cause:** the link step was added after the project push, as best-effort. The in-memory `linkedProjects` and the ignored `PATCH` field make it look persisted.

### SY-09 — Stage changes never reach `projects.pipeline`; the version `PATCH` carries fields the server ignores

- **Type:** Divergence, dead payload. **Severity:** Medium.
- **Location:** `js/costgrid.js:425-437`; `js/api-sync.js:207-209`; `api/src/routes/cost-grids.js:445`; readers `api/src/services/planning-data.js:18`, `api/src/routes/exports.js:61`, `js/pages/planning.js:65-73`.
- **Evidence:**
  - `cgPropagatePipelineToProjects` sets `proj.pipeline = pipeline` in memory and ends with `if (changed) persistConfig();`. `persistConfig()` is a no-op (CLAUDE.md "Data strategy").
  - The server's destructuring is `const { label, pipeline, startDate, endDate, currency, note, ratecardId, clientId, projectName } = req.body;`, so `status` and `linkedProjects` are dropped.
- **Description:**
  - `projects.pipeline` changes only incidentally, when some page pushes the whole project. Planning (`planning-data.js:18` selects `p.pipeline`) and exports read a stale stage.
  - A project-config tab opened before the stage change reverts the project's copy on Save (SY-01).
  - `_cgDraft.status = 'sip'` after Generate is never persisted.
- **Root cause:** the propagation predates the API. It wrote to `localStorage` via `persistConfig()`, and lost its persistence when `persistConfig` became a no-op.

### SY-10 — A project save is a chain of independent transactions, so a failure leaves a partial save

- **Type:** Divergence. **Severity:** Medium.
- **Location:** `js/api-sync.js:346-361`; `api/src/routes/projects.js:549,588,623`.
- **Evidence:** `for (const [part, value, run] of steps) { if (!wanted(value)) continue; try { await run(); } catch (e) { … failed.push(…) } }`. The meta `PATCH` has already committed.
- **Description:**
  - If the tasks `PUT` fails, the period does not move. Phasing, PTC and planning are then validated against the old stored period and can fail with `DATE_RULE` in cascade.
  - project-config reports the failed parts (`summarizePushResult`), but until the user retries, the server holds a mix of the old and the new save.
- **Root cause:** each section has its own route and transaction. The client composes them.

### SY-11 — Tags: replace-all from a local list, a silent failure, and a reload failure that wipes every tag

- **Type:** Stale overwrite, lost error. **Severity:** High.
- **Location:** `js/pages/project-config.js:337-374`; `js/pages/costgrid.js:707-737`; `api/src/routes/projects.js:816-821`.
- **Evidence:**
  - `loadTags() { try { this.projectTags = await Api.projects.tags.list(…) } catch (e) { …; this.projectTags = []; } }`.
  - `toggleTag` builds `newIds` from `this.projectTags` and on error only does `console.warn('[project-config] toggleTag:', e.message);`.
- **Description:**
  - A `PUT` that succeeds followed by a reload that fails leaves `projectTags = []`. The next toggle then sends `[itemId]`, which deletes every other tag on the server.
  - Tags added elsewhere since the page loaded are removed by any toggle.
  - On failure, project-config's checkbox stays flipped to a state that was never saved. This is inferred from the native `@change` and is not reproduced.
  - On costgrid the checkbox reverts with no message.
- **Root cause:** a whole-set replace endpoint used for a single toggle, with "unknown" and "empty" collapsed into the same `[]`.

### SY-12 — Multi-statement server writes without a transaction can fail after committing

- **Type:** Divergence; the outcome cannot be confirmed. **Severity:** Medium.
- **Location and evidence:**
  - `api/src/routes/timesheets.js:224-229`: `DELETE FROM timesheets WHERE project_code` then `INSERT`, as separate `query` calls.
  - timesheet delete: `:259-263`.
  - `pots.js:405-414`: `UPDATE` then `INSERT pot_history`.
  - `currencies.js:82-89`: rate update plus history.
  - `app-settings.js:122-155`: publish is three queries, and two concurrent publishes collide on `terms_versions.version UNIQUE` with a 500.
  - `config.js:163-171`: program share loop.
  - notifications broadcast loop.
  - `resources.js:103` and others: alias/resource write, then `await rescanAll()`.
- **Description:** a failure between statements returns 500 after part of the write committed, or loses data (actuals deleted, nothing inserted). The client correctly reports "failed", but the server state is neither the old one nor the new one. A confirmed-outcome contract cannot be honest on top of these.
- **Root cause:** these routes use the pooled `query()` helper instead of a `pool.connect()` + `BEGIN` client.

### SY-13 — A successful write is reported as failed when a follow-up read shares its `try`

- **Type:** Wrong outcome shown. **Severity:** Medium.
- **Location and evidence:**
  - `js/pages/master-pipelines.js:447-449` (`await Api.pots.create(body); this.pots = await Api.pots.list(…)`): a retry then hits 409 "A POT already exists" (`pots.js:280`).
  - `js/upload.js:6-8,34-36`: upload, then `await refreshTimesheetDataFromApi()`, all in one `try` that shows "Upload failed".
  - `master-currencies.js:153`: rate saved, then `loadAll()` fails and the page shows "Failed to load".
- **Root cause:** there is no distinction between "the write failed" and "the refresh after the write failed". attribute-lists and team already make it (SY-15).

### SY-14 — Fire-and-forget writes whose failure leaves the UI diverged

- **Type:** Lost error, divergence. **Severity:** Low.
- **Location and evidence:**
  - Notifications:
    - Mark all read: `js/notifications.js:136`, `await apiFetch('/notifications/read-all', …).catch(() => {}); updateBadge(0);`.
    - Mark one read: `:156-161`, which removes the `unread` class first and decrements the badge by parsing its text.
  - `js/costgrid.js:944`: structure `PUT` of a new grid with `.catch(() => {})`.
  - `refreshRatecards()` (`master-clients.js:440`), `refreshYearData()` (`master-pipelines.js`): not awaited, errors swallowed.
- **Root cause:** the same fire-and-forget convention as SY-05, for writes judged unimportant.

### SY-15 — At least five outcome contracts coexist, and three pages bypass `apiFetch`

- **Type:** Inconsistent contracts. **Severity:** Medium (it blocks a single contract).
- **Evidence:**
  1. `apiFetch` throws an `Error` with `err.data` (`js/api.js:90-96`). It covers the save overlay, the 401 redirect and the 30 s timeout. `JSON.parse(text)` on a non-JSON error body (an nginx 502) throws a bare `SyntaxError` with no `err.data` (`:89`).
  2. `_cgUpsertVersionToApi` returns a `boolean` (with `strict` throwing), `_pushProjectToApi` a `boolean`, `_pushProjectToApiDetailed` an object `{ok, failed}`.
  3. Never-throwing wrappers return `{ok, status, data}`: `attribute-lists.js:133-145` and `profile-jobs.js:90-106` (which adds `network`).
  4. Ad hoc raw `fetch` + `res.json()` is used by `team.js`, `admin.js`, `login.js`, `activate.js`, `reset-password.js`, `terms.js`, `_terms-editor.js` and `_db-reset.js`. Here a non-JSON 5xx becomes "Network error." even when the write committed (`team.js:525` `const data = await res.json();`).
  5. `.catch(() => {})` and a native `alert()` (`js/clients.js:126`, `js/shares.js:320,336`, `js/share-list-component.js:62`).
- **Description:**
  - The raw-fetch pages have no 401 redirect, no save overlay and no timeout.
  - Callers branch on refusal codes inconsistently: by `err.data.code` in api-sync, by message text in `master-roles.js:334`, by `err.data.inconsistencies` in `upload.js`.
  - The positive pattern already exists in attribute-lists/team: the server's answer, then a reload, then a banner that says whether the reload worked.
- **Root cause:** pages were written or migrated one at a time, with no shared write helper beyond `apiFetch`.

### SY-16 — After a successful write, local state is rebuilt from client values instead of the server response

- **Type:** Divergence. **Severity:** Low.
- **Location and evidence:**
  - `master-roles.js:281-283` (`await Api.roles.update(…); … r.label = label; r.code = saved; r.rate = rate;`, discarding `RETURNING *`).
  - `master-clients.js:251` (rename) and the ratecard "stored" values (`:533-545`).
  - `_terms-editor.js:54-55` (`updatedAt`/`updatedBy` set locally).
  - `profile.js:163` (`password_changed_at = new Date().toISOString()`).
  - `admin.js:355` (one field patched from a full-row response).
- **Root cause:** the in-memory cache is treated as authoritative once the write "worked".

### SY-17 — Uniqueness and safety rules checked only on the client, against a stale list

- **Type:** Stale overwrite (rule bypass). **Severity:** Medium.
- **Location and evidence:**
  - Client rename: `PATCH /clients/:id` has no duplicate check (`config.js:35-46`); the only guard is `master-clients.js:246`.
  - Client-group names: none on the server (`client-groups.js:34-44`).
  - Deleting a pipeline year that still has POTs: `deleteBlock` in `master-pipelines.js:356-362` uses counts loaded with the page. The server refuses only when proposals use the year (`pipeline-years.js:94-112`).
- **Root cause:** the rule was placed where the list was, not where the write is.

### SY-18 — Terms acceptance records the latest version, not the version the user read

- **Type:** Stale view, wrong record. **Severity:** Medium.
- **Location:** `js/pages/terms.js:33-48`; `api/src/routes/auth.js:204-212`.
- **Evidence:** `const currentTermsVersion = await getCurrentTermsVersion(); await query('UPDATE users SET terms_version = $1 …', [currentTermsVersion, req.user.id]);`. The client sends no body.
- **Description:** if a new version is published while a user is reading the old one, their click records acceptance of a version they never saw.
- **Root cause:** the accept request carries no identifier of what was displayed.

### SY-19 — Share writes use upserts: a permission change can recreate a removed share, and a program share overwrites permissions

- **Type:** Stale overwrite. **Severity:** Low.
- **Location:** `js/shares.js:326-341`; `api/src/routes/config.js:163-171`; share routes in `cost-grids.js:1006-1040` and `projects.js`.
- **Evidence:**
  - A permission change is `await api.add(_shareId, userId, newPerm); // POST uses ON CONFLICT DO UPDATE`. A change on a share removed elsewhere recreates it, and every toggle re-sends the "shared with you" email and notification.
  - The program share loop runs `ON CONFLICT … DO UPDATE SET permission = $3`, with no transaction. Sharing a program as viewer demotes an existing editor on its projects. `canEdit` also accepts `p.owner_id` (`projects.js:34-41`), so a real owner keeps access.
- **Root cause:** one endpoint serves both "add" and "change".

### SY-20 — Alias and resource writes: unconditional upsert, then a 500 after commit

- **Type:** Stale overwrite, wrong outcome. **Severity:** Medium.
- **Location:** `api/src/routes/resources.js:92-104`; `js/pages/team.js:421-437`, `:512-532`.
- **Evidence:** `ON CONFLICT (alias_normalized) DO UPDATE SET resource_id = EXCLUDED.resource_id …` then `await rescanAll();`. The resource edit always sends six fields: `firstName, lastName, email, roleId, jobDescription, userId`.
- **Description:**
  - A stale "Assign" re-points a name another admin just resolved.
  - A `rescanAll` failure returns 500 for an alias that was saved.
  - A stale resource drawer reverts another admin's edits.
- **Root cause:** SY-01, plus a follow-up step inside the write's response path.

### SY-21 — Removing a device that is already gone shows an error instead of removing it from the list

- **Type:** Divergence. **Severity:** Low.
- **Location:** `js/pages/profile.js:102-116`; `api/src/routes/auth.js:380`.
- **Evidence:** a 404 "Device not found" goes to `devices.error`, and the row stays in the list.
- **Root cause:** the client has no "already in the target state" outcome; every non-2xx is treated as failure.

## Ruled out (checked, not divergent)

| Area | Why | Where |
|---|---|---|
| Delete grid / delete version | awaited; memory updated only after success; error shown | `js/costgrid.js:272-316` |
| New version (duplicate) | strict flush, one server transaction, errors shown, in-flight guard | `js/costgrid.js:846-907`; `cost-grids.js:572-620` |
| New/clone grid | rollback via `cgDiscardNewGrid`, error shown (except the structure step of new grid, SY-14) | `js/costgrid.js:926-1122` |
| Refresh rate | awaited, then full `cgSyncFromApi` reload | `js/pages/pipeline.js:438-458` |
| Reassign owner, single shares add/remove | single field or row, awaited, error shown | `js/pages/costgrid.js:371-383`; `js/shares.js:259-322` |
| project-config Save, the outcome itself | awaited, double-click guarded, failed parts shown, success only after every part | `project-config.js:595-653` |
| Client group move | optimistic update, rollback on error, server reload in `finally` | `master-clients.js:283-290` |
| `_db-reset` writes | transactional with ROLLBACK, no local state | `api/src/routes/reset.js` |
| login / two-step / activate / reset-password | status-mapped one-shot token writes | `login.js:107-184`, `activate.js:42-62`, `reset-password.js:39-59` |
| profile-jobs actions | one funnel, honest "may still be running", always a server refresh | `profile-jobs.js:151-173` |
| attribute-lists / topics | server answer, reload, banner says whether the reload worked; uniqueness on the server (409) | `attribute-lists.js:253-456` |
| Pipeline board | no drag/drop, no stage writes from the board | `js/pages/pipeline.js` |
| Root `*.html` | no inline scripts, no `on…=`, no write logic | root pages |
| Unload saves | no `sendBeacon`/`keepalive` exists, so no hidden write path either | `js/` sweep |

## Out of scope / roadmap notes

- **Accidental broadcast** (correctness, not sync). The "Loading…" and "Failed to load users" options in the Send Notification modal have `value=""`, the same value as "All users (broadcast)". An admin who clicks Send before the list loads, or after it failed, broadcasts to every user (`js/nav.js:36,523,533,542`). The email failure inside the broadcast is swallowed (`api/src/routes/notifications.js:186`).
- **`PATCH /projects/:id/groups`** has no validation, no lock and no 404: an `UPDATE` touching 0 rows answers `{ ok: true }` (`api/src/routes/projects.js:642-651`).
- **`terms.js`'s load does not check `r.ok`**, so a 500 shows an empty text whose Accept button still works (`js/pages/terms.js:20-27`).
- **Dead write code with no callers:** `cgImportAll` (`js/costgrid.js:1712`), `_deleteProjectFromApi` (`js/api-sync.js:377`), and `cgDeleteLinkedProject` (`js/costgrid.js:1471-1510`, per the agent's grep).
- **Documentation sentences that this audit found false:**
  - CLAUDE.md "Pipeline stage" says planning's direct read of `config.projects[].pipeline` "is safe because of the propagation". The propagation is in memory only (SY-09).
  - The `js/api-sync.js:10` header says every call is fire-and-forget. Some now return outcomes.
- **Notification badge drift:** `parseInt('99+')`, and the stale text kept after `updateBadge(0)` (`js/notifications.js:102-106,159,194-196`).
- **`forgotPassword`** reports success even on a 500. This is by design, for enumeration resistance (`js/pages/login.js:186-204`).
- **Actuals upload keys on `this.project.code`** from memory, which can be an unsaved edit (`project-config.js:511-536`).

Report ready. Next step: audit-to-brief to translate the findings into fix cycles, or stop here if the audit doesn't call for immediate fixes.
