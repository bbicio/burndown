# Planning team assistant (Cycle B, 2026-09-30)

`api/src/routes/planning-assistant.js` backs the "Team assistant" panel of `planning.html`: for ONE project already in Planning it proposes who to allocate, as three tables (best team, alternative team, available team), either from a fixed set of parameters (`POST /rank`, deterministic, no LLM) or through a chat (`POST /chat`, an LLM that turns sentences into the same parameters and writes a short summary). Spec: `docs/superpowers/specs/2026-09-29-planning-team-assistant-design.md` (binding; §6 was rewritten in Cycle A); plan: `docs/superpowers/plans/2026-09-30-planning-team-assistant.md`. Page side: `docs/pages/planning.md`, `docs/js/lib.md` (`team-assistant-ui.js`). Depends on the topic/profile work (`docs/api/profile-engine.md`, `docs/api/topics.md`) and on the planning model (`docs/api/planning-model.md`). No migration, no new dependency.

The LLM never calculates anything and never writes the tables: tables always come from the backend result. The same cycle removed the browser-side AI (personal API keys in `PDash_settings`, `js/ai.js`, the planning AI chat and the portfolio "AI Analysis"): the only LLM calls left go through the server, with the server's own key.

## Endpoints

Both are mounted at `/api/planning-assistant`, `requireAuth, requireAdmin` (admin **or** sysadmin; a plain user gets 403 and the page does not show the button). The router is built by `makeRouter({ llm })` so tests can inject a fake LLM; `module.exports` is the default instance.

Common body fields (validated by `parseBase` in the route):

| Field | Rules |
|---|---|
| `projectId` | required string, at most 64 chars |
| `asOf` | required `YYYY-MM-DD`: "today" as the client sees it (the server never reads its own clock, same rule as the planning model) |
| `params` | optional flat object, see the table below |

`POST /rank` returns `{ requirement, tables, params }`. `POST /chat` additionally needs `messages` (1-40 items of `{ role: 'user' | 'assistant', content }`, each content a non-empty string, the last one from the user; a USER message over 4000 chars is a 400, an assistant message over 4000 chars is truncated to 4000 instead of rejected, because the model's own replies can be that long; `normalizeMessages` in `assistant-chat.js`). The page sends only the last 20 messages and never its local error bubbles. It returns `{ reply, params, tables, requirement }`: `tables` is `null` when the model never (successfully) called `rank_team` in this request, `params` are those of the last successful `rank_team` call (else the ones sent), `requirement` is the summary.

Errors: `400 { error: 'Invalid request', fields: { <field>: <message> } }` (body, `projectId`, `asOf`, `params`, `messages`, an unknown role in `params.roles`, an unknown/ambiguous name in `params.excludeResources`, an unknown list or value in `requireTags`/`preferTags`); `404 { error: 'Project not found' }` (unknown id, or a malformed UUID: Postgres `22P02`); `422` when the project has no role with planned hours ("nothing to allocate"); `503 { error: 'Assistant unavailable' }` from `/chat` when `ANTHROPIC_API_KEY` is unset or the LLM call fails (timeout, HTTP error, non-JSON answer) and no ranking exists yet. If a `rank_team` call had already succeeded in the same request when the LLM failed, `/chat` answers **200** with those tables and the reply "The assistant could not finish, but the team tables below are up to date.". The 503 body never carries the provider's answer. The whole `/chat` request has an 80 s deadline (an `AbortSignal` added to each call's own 30 s timeout); hitting it behaves like any other LLM error. `/rank` keeps working while the assistant is down.

## `params`

Validated by `parseParams` in `api/src/lib/team-params.js` (unknown keys are rejected, never ignored); the same object is what the LLM tool `rank_team` receives.

| Key | Type / limits | Meaning |
|---|---|---|
| `roles` | up to 20 role codes (`roles.code`) | only these of the project's required roles; a code the project does not require is a 400 |
| `excludeResources` | up to 50 full names | exact full-name match (token-set, case/accent-insensitive, `resolveExcluded`); unknown or ambiguous names are errors |
| `requireTags` | up to 20 `{ list, value }` | the person must have hours on each of these tag values (pool filter) |
| `preferTags` | up to 20 `{ list, value }` | extra tag values added to the project's own tags in the score (a value the project already carries is not counted twice) |

Tag entries are validated against the real attribute lists (`checkTags` in `team-params.js`, lists loaded once per request in `prepare()`): the list matches by slug or name, the value by label, case-insensitively. An unknown list or value is a 400 `fields.requireTags` / `fields.preferTags` naming the entry and listing the valid ones (for example `Unknown value "Oncologia" in list "Therapeutic Area". Valid values: Oncology, Cardiology`), so the model can correct itself.
| `minFreeHoursPerWeek` | number, 0-80 | filters the **available** table only: average free hours over the window |
| `topN` | integer, 1-10, default 3 | rows per table and role |
| `window` | `{ from, to }`, `YYYY-MM-DD`, from <= to, at most 104 weeks | overrides every role's own window |
| `includeAlternatives` | boolean, default true | false switches the alternative table off and removes alternatives from the available one |

## Tables and rows

`tables = { best, alternative, available }`; each is an array, one section per required role: `{ role, rows, note }` (`note` explains an empty section, e.g. "No active resource has this role." / "Nobody matches these constraints."). A row: `resourceId, name, roleCode, score, rank, roleHours, tags, projects, tasks, topics, freeAvg, freeMin, currentLoad, hoursOnProject, flags, rationale`. `rank` equals `score` except in the available table, where it is `score x availability factor`. `rationale` is a one-line text built from the same evidence (role hours, flags, top tags/projects/topics, free hours). Flags: "no actuals matched" (no profile), "no relevant experience" (same role but score under 10), "topic provenance not available, recalculate profiles" (a v1 profile).

`requirement` (summary, `summarize` in the service): `{ projectId, name, tags: [{ list, value }], roles: [{ code, tasks, soldHours, neededHours, window: { from, to } | null }] }`.

## What the project needs (`team-requirement.js`)

Per job title (`roles.code`, case-insensitive) over the project's tasks that are not completed: task names, `soldHours`, hours already consumed by matching actuals (`matchesTaskRole`), `neededHours = computeResidual(sold, consumed)` (the planning model's rule), the topics of the project description plus those of the role's tasks (approved, merged topics only), and the role's window: earliest task start to latest task end (missing task dates fall back to the project's own dates), from `max(start, asOf)`; `null` when nothing is dated or the end is already past (availability not computable). Windows are capped at 104 weeks so an undated/9999 end cannot explode the week list.

## How load is computed (`planning-compute.js`, `team-load.js`)

No load calculation is repeated: the service makes ONE `computePlanningModel` call (the same pure function behind `POST /api/planning/model`) with `view: 'owner'`, `teams: []`, `pulse: false`, for every project "as Planning sees it" (`getPlanningData`, i.e. everything that is not `Canceled` pipeline and not `Completed` status) **minus the target project**, over a window from four weeks before the current Monday to the latest end over **all** the project's role windows (not only `params.roles`, so `explain_resource` for another role still sees its weeks), never before `asOf`. The resulting loads are memoized on the request context by window end, so one `/chat` request runs at most one projection however many tool calls it makes. Because it uses the By Owner projection, the load inherits that view's rules: undated tasks are spread over the whole window and Sunday actuals are placed (Cycle A behaviour), inactive owners are redistributed. The `ownerMap` owner names are resolved to resources with `matchOwner` (alias or unambiguous name); unmatched, ambiguous, ignored and empty names (including the placeholder) count for nobody; several names resolving to one resource are summed.

Availability (`availabilityForWindow`): only weeks that are not past count; free hours per week = `max(0, 32 - load)` (`WEEKLY_TARGET_HOURS = 32`); `freeAvg` = mean of those weeks, `freeMin` = the minimum. `currentLoad` = mean weekly load of the four completed weeks before the current one (actuals only). `hoursOnProject` = actuals of the target project matched to that resource.

## Score (`team-scoring.js`)

`S(resource, role)` in 0-100 is the weighted mean of the components that apply, each a value in 0-1:

| Component | Weight | Value |
|---|---|---|
| role | 30 | `1 - e^(-roleHours/200)`: hours the person logged with this job title (included only in the best team) |
| tag | 30 | per tag dimension `1 - e^(-hours/100)` over the requirement tags (+ `preferTags`), averaged with dimension weights therapeutic-area 3, brand 3, market 2, service-type 2, others 1; only when there are tags |
| task | 25 | `1 - e^(-hours/100)` over hours on tasks whose name matches one of the role's tasks (token Jaccard >= 0.5, the "(no task)" bucket ignored) |
| topic | 15 | mean over the role's topics of 1.0 (direct) / 0.4 (context); only when the role has topics |

A component that does not apply is left out of the mean (the weights of the others are what counts). A resource without a stored profile scores 0 and is flagged. **All weights, saturations (200/100/100), the Jaccard threshold, `MIN_ALT_SCORE = 30` and `LOW_SCORE = 10` are INITIAL values, to be tuned with real data at `/finish-cycle` Gate 2**; retuning is a code change in `team-scoring.js`, nothing else.

## The three tables (`team-ranking.js`)

The pool is every resource that is `active`, not excluded and (with `requireTags`) has hours on every required tag value. Per required role:

1. **Best**: pool members whose job title is the role, scored with the role component, top N by score (ties by name). A member with no profile appears here (score 0, flagged) and only here.
2. **Alternative**: pool members with another job title **and a profile**, scored without the role component, kept when score >= 30, top N.
3. **Available**: same-role members with a profile plus the qualifying alternatives, ordered by `rank = score x min(1, freeAvg / neededPerWeek)` (`neededPerWeek` = needed hours / future weeks of the role window; factor 1 when nothing is needed or availability is not computable), then free hours, then name; `minFreeHoursPerWeek` filters here.

`explainResource` (tool `explain_resource`) returns the score breakdown for one person and role: components, evidence, `scoreWithoutRole`, `positionInBest`, availability, `minAlternativeScore` / `lowScoreThreshold` (the thresholds the score is judged by) and `notInPool` ("inactive" / "excluded" / "does not match requireTags") when relevant.

## LLM layer (`services/llm.js`, `lib/assistant-chat.js`)

- `llm.chat({ system, messages, tools, toolChoice, signal })` returns `{ text, toolCalls }`: one interface, today a single backend (Anthropic Messages API with tool use, plain `fetch`, no SDK). Model `ANTHROPIC_MODEL` (default `claude-haiku-4-5-20251001`), base `ANTHROPIC_BASE_URL` (default `https://api.anthropic.com`), 30 s timeout per call (a passed `signal`, e.g. the route's deadline, is combined with it via `AbortSignal.any`), `max_tokens` 1500; `toolChoice` is sent as `tool_choice` only when given. Error messages never include the response body. A local model (LM Studio) would be a second backend behind the same interface (postponed).
- Tool loop (`runChat`): at most 3 tool rounds, then one last call that keeps the tool definitions and sets `tool_choice: { type: 'none' }` (the history holds `tool_use`/`tool_result` blocks, which the Messages API rejects when `tools` is missing); only the last 20 messages are sent and the list always starts with a user message. Tool results sent to the model carry at most 5 rows per section. Tools: `rank_team` (the `params` object) and `explain_resource` (`name`, `role`). The `<project_data>` JSON also carries `current_params` (the validated params in force), and the prompt tells the model to start from it when calling `rank_team`. The system prompt tells the model to repeat every constraint already expressed on each `rank_team` call (that is how constraints persist across turns), never to invent people/hours/scores, to ask when a tool reports an unknown name/role, and to answer in the administrator's language. Invalid tool parameters are returned to the model as `{ error: 'Invalid parameters', fields }`; the conversation continues with no tables.
- Prompt injection: the project's data (name, tags, roles, tasks) reaches the model only inside a `<project_data>` block, with `<` escaped so text can never close it, and the prompt says it is DATA and must not be followed. Known, accepted limit: tool results (who is on which other project/task, names of other projects and tasks) sit outside that delimiter; the risk is low because the model has no write tool and no free text reaches the tables. The model has no write tool and no free text reaches the tables; the page escapes the reply (only `**bold**` and line breaks survive).
- Privacy: person names, hours and load (via the tool results) and project names/tasks are sent to the Anthropic API **until a local model exists**. The per-project topic extraction already does the same for descriptions (switch: `profile-jobs.html`).

## Deploy notes

1. Set `ANTHROPIC_API_KEY` in the server `.env` (optional `ANTHROPIC_MODEL`, `ANTHROPIC_BASE_URL`; the same variables topic extraction uses). Unset: `/chat` answers 503 and the panel says so, `/rank` and "Calculate team" still work.
2. Run **Rebuild** from `profile-jobs.html` so every stored profile becomes version 2 (topic `direct`/`context` provenance); until then rows carry the "topic provenance not available" flag and topics count as context. See `docs/api/profile-engine.md`.
3. No migration. Personal API keys are gone: a stale browser's `PDash_settings` is wiped on first load by `cleanLegacyStorage()`.
4. The weights/thresholds above are initial; review the top rows against the planner's expectation on real data (Gate 2) before relying on them.

## Verification

Unit (`node:test`): `planning-compute`, `team-params`, `team-load`, `team-requirement`, `team-scoring`, `team-ranking`, `assistant-chat`, `services/llm` (fake `fetch`); vitest for `js/lib/team-assistant-ui.js` and `team-ui.js` (`topicGroups`). Integration `PA-01..PA-12` in `test-api.js` (chat cases need the LLM stub of `scripts/run-tests.sh`, `LLM_STUB_ENABLED=1`); manual `PA-M1..PA-M6`: `TEST_CASES.md` section "Team assistant".
