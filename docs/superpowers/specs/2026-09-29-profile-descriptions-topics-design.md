# Profile descriptions → topics — design

Date: 2026-09-29. Follows Cycle 3 (resource profile, see `2026-09-25-resource-profile-design.md`) and precedes Cycle 4 (AI suggestion engine). Path: architectural.

## 1. Goal

A resource's Experience profile in `team.html` shows the **topics** of the work they did. Topics are extracted by an LLM agent from the free-text descriptions of projects and tasks, and kept in one shared, admin-curated vocabulary. Cycle 4 will use them (with tags, roles and hours) to rank candidates; **querying/ranking is out of scope here**.

## 2. Decisions (agreed with the user)

1. The proposal's version `note` becomes the project's **description**; task descriptions come from the proposal's tasks. Copied once at project generation, then independent (same philosophy as project tags, Cycle 3a). A one-shot backfill fills existing linked projects (only where the field is empty).
2. Descriptions (project + each task) are visible and editable in `project-config.html`; viewers (share permission `viewer`) see them read-only, exactly like every other field on that page.
3. The label "Note" in the proposal header form (`costgrid.html`, `#cgNote`) is renamed "Description". Field/column stay `note` (no API or export impact).
4. Extraction runs **server-side in the profile worker**, with an Anthropic key from the server `.env`. The backend has no AI integration today (keys live in browser `localStorage`, `js/ai.js`).
5. Vocabulary converges by **forced reuse + approval queue**: the agent gets the existing topics and must reuse them; a genuinely new one is created as `proposed` and waits for an admin (approve / rename / merge / reject).
6. Association is **presence-based, no hour weighting**: project topics → every resource with a contribution on that project code; task topics → only resources with actuals on that task (name match, same normalization as the engine).
7. Only **approved** topics appear in profiles. Admin edits (rename, approve, reject, merge) apply to profiles **immediately** — names/status are resolved at read time.
8. Topic management UI is a **"Topics (N)" tab in `attribute-lists.html`** (N = proposed count).
9. Topics are **competences, never attribute-list values**; equivalence and near-duplicates are judged by the LLM in the same single call per project (no second verification pass).
10. **The LLM never blocks the system.** Saving a description never calls the LLM; extraction runs only in the worker; any LLM failure (no key, timeout, HTTP error, unparsable answer) is recorded and retried next tick while the rest of the profile (hours, tags, previously extracted topics) is still built.

## 3. Data

### Migration `027_project_descriptions.sql`
- `projects.description TEXT NOT NULL DEFAULT ''`, `project_tasks.description TEXT NOT NULL DEFAULT ''`.
- One-shot backfill (apply once, like `023`): for every project with `cg_version_id`, `description = cost_grid_versions.note` where empty; for each of its `project_tasks`, `description` from the proposal task (`tasks.description`) whose normalized title equals the project task's normalized name, among the tasks mapped for that project in `cg_version_projects` (`task_ids` / `task_names_direct`), only where empty.
- Idempotent for empty fields; must not overwrite text entered later.

### Migration `028_topics.sql`
- `topics(id UUID PK, name, name_normalized UNIQUE, status CHECK IN ('approved','proposed','rejected'), merged_into UUID NULL REFERENCES topics(id), created_by, updated_by, created_at, updated_at)`. **No physical delete.** "Delete" = `rejected` (kept so the agent is told not to re-propose it). `merged_into` non-null = absorbed (always points to a final, non-merged topic).
- `description_topic_state(project_id UUID REFERENCES projects ON DELETE CASCADE, task_key, text_hash TEXT, extracted_at, last_error)`. `task_key TEXT NOT NULL DEFAULT ''` = normalized task name; the empty string = the project description (never NULL, so it can sit in a primary key). `PRIMARY KEY (project_id, task_key)`. Keyed by name, **not** task id, because `PUT /api/projects/:id` deletes and re-inserts all `project_tasks` on every save (`projects.js`).
- `description_topic_links(project_id ON DELETE CASCADE, task_key TEXT NOT NULL DEFAULT '' (same convention), topic_id REFERENCES topics, PRIMARY KEY (project_id, task_key, topic_id))`.
- `app_settings` default `topic_extraction_enabled = 'true'`.
- `resources.profile` JSONB gains `topics: [{ topicId, projects: [name…] }]` (ids only). Everything else is unchanged.

Migrations are applied by hand to the real `pdash-db` and to any test-branch stack (existing caveat).

## 4. Extraction (worker)

`api/src/lib/topic-extract.js` (pure) and `api/src/services/topic-extraction.js` (DB + HTTP; `fetch`, no new dependency).

- Runs **before** the per-code transaction in `processNext`, never inside it (no LLM call while row locks are held).
- For the project resolved from the code (oldest by `created_at, id`, as the engine already does): compute a SHA-256 of the description and of each task description; compare with `description_topic_state.text_hash`. Unchanged or empty text → no call. A text that became empty deletes its state and links.
- One request **per project** (never per resource) carries all changed texts plus the context: the vocabulary (approved + proposed as reusable; rejected as "do not use") and **all active values of every attribute list** (Market, Brand, Therapeutic Area, Service Type, …).

### Agent rules (the prompt contract)
1. A **topic is a specific competence** required to carry out the task/project (e.g. "Medical writing", "Data visualization", "Video editing") — not a subject, client, market, brand or therapeutic area. One text may require several competences.
2. 0–5 topics per text, the most characteristic ones, English, 1–4 words, nominal form. Vague/empty/too-short text → no topics; zero beats an invented topic. Only what the text states; nothing inferred from client or project names. No names of people, clients or products.
3. **Reuse first:** if a candidate means the same as an existing topic, the agent returns that topic's id instead of a new name.
4. **Attribute-list values are forbidden as topics.** A candidate that is semantically equivalent to any attribute-list value must be discarded. The agent classifies each candidate itself.
5. Near-duplicate candidates within the same response are collapsed to one.
6. Output is JSON: per text, a list of `{ name, existingTopicId | null, equivalentToListValue: boolean }`.

### Server-side enforcement (the model can be wrong)
- The server applies the verdicts: `equivalentToListValue` → discarded; `existingTopicId` valid (after following `merged_into`) → link to it; a `rejected` target → dropped silently; otherwise a new `proposed` topic.
- Safety net independent of the model: any candidate whose normalized name equals an attribute-list value or list name is discarded, and near-duplicates inside one response are collapsed by normalized name.
- The same list-value check applies to admin rename/merge into a name: 409 "matches an attribute-list value".
- Semantic ("contains", synonym) similarity is the model's job only; there is no fuzzy matching on the server.
- Cost: one call per project whose text changed, independent of team size; unchanged hash → no call.
- Configuration: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default a small/cheap model), optional `ANTHROPIC_BASE_URL` (used by tests). Timeout per call (~30 s). Passed through `docker-compose.yml`, documented in `.env.example`.
- **Failure handling:** missing key or `topic_extraction_enabled = 'false'` → skipped (reported as "not configured/disabled", not as an error). Any other failure → `last_error` set on the state rows, hash NOT updated (so it retries next tick), processing continues. A repeated identical failure must not flood `profile_job_runs` (existing throttling rule, `shouldRecordRun`).
- Extraction failures never re-queue the code in a way that could loop within a run.

## 5. Association and read-time resolution

- During profile aggregation (existing tag-style read at aggregation time), topic ids are collected: project links → every contributor of that code; task links → contributors whose `tasks` keys include the link's `task_key`. Result stored as ids only in `resources.profile.topics`.
- `GET /api/resources/:id/profile` resolves ids against `topics` at read time: follow `merged_into`, keep only `approved`, dedupe, attach names. Rename/approve/reject/merge therefore need **no recalculation**.

## 6. API

`api/src/routes/topics.js` → `/api/topics`, all `requireAuth, requireAdmin` (admin or sysadmin):
- `GET /?status=` list with usage counts (texts, resources).
- `PATCH /:id` rename (409 on duplicate normalized name → "use merge").
- `POST /:id/approve`, `POST /:id/reject`, `POST /:id/restore` (rejected → approved).
- `POST /:id/merge {targetId}`: move links to the target (no duplicates), set `merged_into`, repoint topics that already pointed at the source; reject self/absorbed targets.

Projects: `PUT /api/projects/:id` accepts and returns `description` (project and tasks); when a description changed, the code is queued with the existing `enqueueProjectsQuiet` hook (cannot fail the request). Viewers cannot write, as today.

Profile jobs: `GET /api/profile-jobs` per-code rows include the extraction error; `PUT /settings` handles `topic_extraction_enabled`; `POST /projects/:code/process` also clears that project's hashes (re-extract).

## 7. UI

- `costgrid.html`: label "Description". "Generate project" copies the version note and each task description into the new project (`api-sync.js`/`_pushProjectToApi` carry `description`).
- `project-config.html`: project Description textarea and a Description per task row; all disabled with `isViewer`.
- `attribute-lists.html`: tab "Topics (N)" — proposed queue (Approve / Reject / Rename / Merge into…), approved list (rename, merge, reject), rejected list (restore); usage counts.
- `team.html` Experience tab: "Topics" block of chips, each listing the projects it appears in; empty state "No topics yet".
- `profile-jobs.html`: extraction-error column, extraction on/off switch.
- Every touched `js/*.js`/`css/*.css` gets its `?v=N` bumped in **all** pages that load it. All text in English.

## 8. Tests

- `node:test` (`api/src/lib`): hashing, normalization, response validation (malformed JSON, >5 topics, empty names), reuse via normalized match, rejected dropped, merge-chain resolution.
- `vitest` (`js/lib/team-ui.js`): topic block builder.
- Integration (`test-api.js`, ephemeral stack): topics API (rename, duplicate 409, merge, reject/restore, admin-only), description save with **no key** (succeeds, no error), full extraction against a local stub server via `ANTHROPIC_BASE_URL`, broken/timeout answer (profile still built, error recorded, retry), cascade of rename/reject/merge into `GET …/profile`, viewer cannot write descriptions.

## 9. Out of scope

Candidate ranking/querying and the planning chatbot (Cycle 4); free-text summaries or embeddings; fuzzy topic-name matching beyond normalization; hour weighting; automatic mass re-extraction at first start (the backfill is extracted as codes flow through the queue); topic edits by non-admins. Privacy note: project descriptions may contain client information and are sent to the Anthropic API; `topic_extraction_enabled` is the kill switch.

## 10. Docs to update

New `docs/api/topics.md`; `docs/api/profile-engine.md`, `docs/pages/team.md`, `project-config.md`, `costgrid.md`, `profile-jobs.md`, `attribute-lists` entry in `CLAUDE.md`, the migrations table in `CLAUDE.md`, and the `docs/api/lib.md` list.
