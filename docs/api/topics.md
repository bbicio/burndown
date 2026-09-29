# Topics API (profile descriptions cycle, 2026-09-29)

Files: `api/src/routes/topics.js` (admin API, mounted at `/api/topics`), `api/src/lib/topic-extract.js` (pure rules, `docs/api/lib.md`), `api/src/services/topic-extraction.js` (DB + LLM call, `docs/api/profile-engine.md`), migration `028_topics.sql`. Spec: `docs/superpowers/specs/2026-09-29-profile-descriptions-topics-design.md` (section 11 amendments win). UI: the "Topics" tab of `attribute-lists.html`, the "Topics" block of `team.html`'s Experience profile.

A **topic** is a specific competence ("Medical writing", "Data visualization"), extracted by an LLM from project and task descriptions and kept in one shared, admin-curated vocabulary. Topics are never attribute-list values.

## Data

- `topics (id, name, name_normalized UNIQUE, status approved|proposed|rejected, merged_into, created_by/updated_by, created_at/updated_at)`. No physical delete: "delete" is `rejected` (kept so the agent is told not to propose it again). `merged_into` non-null means the topic was absorbed; it always points to a final (non-merged) topic.
- `description_topic_state (project_id, task_key, text_hash, extracted_at, last_error)`, PK `(project_id, task_key)`. `task_key = ''` is the project description; otherwise the normalised task name (trim, collapse spaces, lowercase = the actuals task key). Keyed by name, not task id, because `PUT /api/projects/:id/tasks` deletes and re-inserts every task on each save.
- `description_topic_links (project_id, task_key, topic_id)`: which topics a description produced. Cascade on project delete; merge moves links to the target.
- `app_settings.topic_extraction_enabled` (default `'true'`; anything but `'false'` counts as enabled).
- `resources.profile.topics` = `[{ topicId, projectCodes }]` (ids and project codes only).

## Vocabulary rules (`api/src/lib/topic-extract.js`)

- Normalisation (`normalizeTopicName`): ASCII, lowercase, single spaces. It is the uniqueness key.
- A name must be 1 to 4 words and at most 60 characters. A name equal to an attribute-list name or to an active attribute-list item label is rejected (400 for admin input; discarded silently for LLM candidates). There is no fuzzy matching on the server; semantic similarity is the model's job only.
- Reuse first: a candidate resolves to an existing topic by the model's `existingTopicId` or by normalised name, following `merged_into`; a `rejected` target is dropped silently; otherwise a new `proposed` topic is created.

## Routes

All `requireAuth, requireAdmin` (admin or sysadmin). Malformed ids answer 404 (`:id`) or 400 (`targetId`).

| Route | Behaviour |
|---|---|
| `GET /api/topics?status=` | Live (non-merged) topics with `usage_count` = number of linked descriptions (not resources). `status` must be `approved`/`proposed`/`rejected`, else 400. |
| `POST /api/topics { name }` | Admin seeds an **approved** topic (used to seed the vocabulary and to test without the LLM). 201; 400 invalid name or attribute-list value; 409 duplicate normalised name. |
| `PATCH /api/topics/:id { name }` | Rename. 400 invalid name / list value; 409 duplicate ("use merge instead") or the topic was merged; 404 unknown. |
| `POST /api/topics/:id/approve` | proposed to approved. |
| `POST /api/topics/:id/reject` | proposed or approved to rejected. |
| `POST /api/topics/:id/restore` | rejected to approved. Wrong source status, or a merged topic: 409. |
| `POST /api/topics/:id/merge { targetId }` | Absorb `:id` into `targetId` in one transaction (both rows locked in id order): links moved to the target without duplicates, `merged_into` set, topics that pointed at the source repointed. 400 self-merge; 409 either side already merged, or target rejected, or an **approved** source into a non-approved (proposed) target (an approved topic must not silently lose its approval; the UI lists only approved targets for an approved source); 404 unknown. |

## Read-time resolution

`GET /api/resources/:id/profile` resolves `profile.topics` against `topics` on every read (`resolveProfileTopics`): follow `merged_into`, keep only `approved`, dedupe by final topic (union of project codes), attach names, return `[{ id, name, projectCodes }]` sorted by project count. Rename, approve, reject and merge therefore need **no recalculation** and show up at once; proposed and rejected topics never appear in profiles.

## UI notes (`attribute-lists.html`)

The page has two page tabs, Lists and Topics (badge = proposed count). The Topics tab: proposed queue (Approve / Rename / Merge into... / Reject), approved list (Rename, Merge, Reject), a collapsed "Rejected" list (Restore), "+ New topic" (seeds an approved topic), and a shared rename/create modal plus a merge modal. A failed action reloads the list first and then shows the server error (so the reload does not clear it). The list drill-in view (`currentList`) is a separate template branch (`v-else-if`) so it is not rendered under the Topics tab; the Topics block is gated on `!currentList && pageTab === 'topics'`.

## Tests

Integration `PD-01..05` (descriptions API and queue-on-change), `TP-01..08` (this API), `TX-01..10` (extraction against a local LLM stub; `test-api.js` also labels the merge-guard checks `TX-11`, catalogued as `TP-10`), `PT-01..06` (profile cascade) in `test-api.js`; unit tests in `api/src/lib/topic-extract.test.js` and `resource-profile.test.js`.
