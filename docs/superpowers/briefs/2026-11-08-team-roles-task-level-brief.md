# Brief — Experience profile: Roles table gains a task level

**Scenario:** 2 (evolution). **Date:** 2026-11-08. **Page:** `team.html`, resource panel → Experience profile tab.

## Current behavior

- **Aggregation** (`api/src/lib/resource-profile.js`, `buildContributions`, lines 29-58): per resource and project code, hours accumulate per role in `c.roles[role]` (line 47) and per task in `c.tasks[key]` (lines 48-51) — two independent axes; role × task is never recorded.
- **Stored profile** (`aggregateProfile`, lines 125-130 and 154-159): `roles[] = { code, hours, share, projects, last, projectCodes }`. Tasks exist only as `projects[code].tasks[] = { name, hours }` (lines 119-122), summed over all roles. `version: 2` (line 167).
- **Task topics** are an aggregation input only (`info.taskTopics[taskKey]`, loaded in `api/src/services/profile-engine.js:118`), used to compute `topics[].direct`; they are not stored per task.
- **Read time** (`api/src/routes/resources.js:126-140`): `resolveProfileTopics` (`api/src/lib/topic-extract.js:176`) resolves `profile.topics` only — approved topics, merges followed.
- **UI tree** (`js/lib/team-ui.js:104-107`): each role node gets `projects: children(r.projectCodes)`, i.e. the whole project node with the project's total hours.
- **Markup** (`team.html:641-649`): the project row under a role is static and shows `p.hours`, the total across all roles — with two roles on one project the full hours appear under both. No task level under roles.
- **Dimension tree** (dimension → value → project → task) already shows tasks with hours, but no topics.
- **Consumer of `profile.roles`**: `api/src/lib/team-scoring.js:120` reads each role's `code`/`hours` (Team assistant).

## Expected behavior

- Roles table structure: **role → project → task**.
- Project row under a role: the person's hours **in that role** on that project. Sum of projects = the role's hours.
- Task row under role → project: task name, the person's hours **in that role** on that task, and chips of the **approved** topics linked to that task (`description_topic_links` with the task's `task_key`), merges followed, `proposed`/`rejected` never shown. Sum of tasks = the project's hours in that role.
- Dimension tree: each task row also shows the chips of its approved topics.
- A topic rename/approve/reject/merge shows on the next profile load with no recalculation (same principle as today's topics).
- Profiles stored before this cycle stay readable: role → project without tasks (and dimension tasks without topics) until a Rebuild.

## Constraints

- New profile version; a **Rebuild** from `profile-jobs.html` is needed after deploy.
- Changes to `profile.roles` are **additive only**: `team-scoring.js` keeps working unchanged.
- No LLM call, no DB migration: the data already exists (`description_topic_links`, actuals).
- Bump every `?v=` reference of `js/lib/team-ui.js` (and `css/team.css` if touched).
- Visual style consistent with the existing dimension tree in the panel. User-facing text in English.

## Acceptance criteria

1. A person with two roles on the same project: under each role the project row shows only that role's hours, and the two figures sum to the project total (unit test on `aggregateProfile` + `buildProfileTree`).
2. Under each role → project the tasks appear with that role's hours; their sum equals the project's hours in that role (unit test).
3. A task with an approved topic shows its chip, in both the Roles table and the dimension tree; a `proposed` or `rejected` topic does not appear; a merged topic shows under its target's name (unit test on read-time resolution).
4. A version 2 profile before Rebuild: the panel opens without errors and shows role → project without tasks (unit test).
5. `api/src/lib/team-scoring.test.js` and the rest of the suite pass with no change to scoring.
6. Manual check on Fabrizio Fortini after Rebuild: Roles → role → BERMITS Maintenance 2026 → tasks with hours and approved topics; the same topics on the task rows of the dimension tree.

## Explicitly excluded scope (confirmed by the user)

- Task-level tags (they do not exist; a new data model, its own cycle).
- The role's `last` month (still the project's last month, not the last month worked in that role).
- Team assistant scoring using role × task data.
- A secondary "total on project across all roles" figure.

## Open questions for /brainstorming

- Does the project row under a role become expandable (chevron button, like the dimension tree), or are tasks always shown?
- Are per-task topics stored as ids and resolved at read time (like `profile.topics`), or stored resolved?
- Do actuals rows with no role stay excluded from the Roles table, as today?
