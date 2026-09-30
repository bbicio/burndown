# Finish-cycle report — worktree-planning-team-assistant

**Date:** 2026-09-30
**Branch:** worktree-planning-team-assistant → main (merge commit `db6a6c1`, `--no-ff`, pushed; main had not advanced since the branch diverged at `5b14ba2`)

## What was done

Cycle B of the planning/resource-allocation work: the admin/sysadmin-only **Team assistant** in `planning.html` (three same-shape tables — best / alternative / available team — with a deterministic rationale per person, refinable by chat), plus the removal of every personal-API-key AI feature from the browser. Spec `docs/superpowers/specs/2026-09-29-planning-team-assistant-design.md` (§6 rewritten 2026-09-30, `6fb1eeb`), plan `docs/superpowers/plans/2026-09-30-planning-team-assistant.md`; executed subagent-driven (11 tasks, per-task review, a final whole-branch review and one fix wave). 23 commits, 69 files (+2854 / −1417), no migration.

- `70082a5` chore: remove personal-API-key AI features from the browser (Cycle B, spec §4)
- `3ada3b7` fix: drop orphaned btnCopyAi listener and unused refreshTimesheetData (Cycle B task 1)
- `443054a` refactor: extract computePlanningModel, shared by the planning route and the team assistant
- `93caadf` feat: topic provenance (direct vs context) in resource profiles, profile version 2
- `8871e43` feat: validation of the team assistant params
- `64a4415` fix: team-params window validation and resource name handling
- `d640902` fix: strengthen 104-week boundary and null-name tests
- `bbc3cf6` feat: team assistant load curve and availability from the planning model
- `2738126` feat: team assistant requirement builder and experience scoring
- `101b31f` fix: team scoring resolves listName-only tags
- `95d4d59` feat: team assistant ranking (best/alternative/available) and rationale
- `1127c19` fix: explainResource shares scoring tags and pool filter with rankTeam
- `3240efe` feat: team assistant service and POST /api/planning-assistant/rank
- `2c6b229` feat: team assistant chat (LLM with rank_team/explain_resource tools)
- `2969233` fix: chat history trim always starts on a user message
- `5845cdb` feat: team assistant panel in planning.html
- `0b35704` docs: team assistant (Cycle B) docs, test cases, dead-code removal
- `9850b1f` docs: fix stale match-owners statements after route removal
- `ac0b0ab` fix: assistant final call keeps tools with tool_choice none, 503 fallback keeps tables, history rules, current_params, deadline
- `b0396f6` fix: assistant load window over all roles with memoized projection, tag validation, scoring tag de-dup, explain thresholds
- `510278b` fix: team assistant panel ignores stale responses, locks project while busy, sends trimmed history without local errors
- `37bfeab` refactor: move resolveOwnerStatuses tests to match-resource.test.js, drop unused route re-export
- `899aab4` docs: assistant final-review fixes, PA-12 and extended PA-08/PA-11 cases

Closeout: Gate 1 passed (vitest 258/258; isolated integration `scripts/run-tests.sh` 427/427 including PA-01..PA-12 and PM-01..PM-07); Gate 2 manual verification confirmed by the user (Team assistant panel, non-admin visibility, portfolio, Settings modal, `PDash_settings` wiped, Experience tab); Gate 3 code review round 1: no findings; Gate 4 merged, DB backup `backups/pdash-backup-2026-09-30-155358.dump`, `pdash-api` restarted and healthy (15:56 local), `/api/planning-assistant/rank` answers 401 unauthenticated (route live), worktree removed, local branch deleted.

## Code review follow-ups

None (round 1: no findings). One low-severity observation, not reported as a finding, kept as a roadmap note below. The per-task reviews and the final whole-branch review raised 6 Important findings plus minors, all fixed inside the cycle (e.g. the final tool-less chat call now keeps `tools` with `tool_choice: none`, stale-response guard in the panel, history limits, tag validation).

## Roadmap notes

- **Real-LLM check not done (Gate 2 manual cases PA-M1..M3 of `TEST_CASES.md`).** The branch stack blanks `ANTHROPIC_API_KEY` on purpose (`scripts/test-branch.sh`, opt in with `TEST_BRANCH_ALLOW_LLM=1`), so the chat against the real Anthropic API — including a forced 3-round tool loop and the `tool_choice: none` final call — was only tested against a stub. Also still to do on real data: weight tuning (initial values in `api/src/lib/team-scoring.js`) and the `/rank` response time (prepare() loads all resources with JSONB profiles plus one owner projection per request).
- **Profiles are still version 1 until "Rebuild all"** is run from `profile-jobs.html`; until then the ranking treats topics as `context` and flags it in the rationale.
- **`runChat` passes raw tool exception messages to the model** (`api/src/lib/assistant-chat.js`, ~line 97): an unexpected DB error message from `svc.explain` could reach the LLM and the reply. Scrub unexpected errors (keep validation errors).
- **Dead code left in `js/portfolio.js` (~lines 473/489):** `getElementById('btnAiAnalysis')` for an element no page defines any more (functions were already unreachable).
- **Remaining `planning.html` dead code (user follow-up 2, partly done):** `teamFilters`→`portfolioTeamFilters` watcher, unused `allOwnersInactive` alias in By Project, stale `loadModel` comment; `refreshTimesheetDataFromApi()` is still called because `js/upload.js` uses it.
- **User follow-ups from Cycle A still open:** weekend rows in By Owner (decide Sunday-only vs deliberate weekend rule), By Role tooltip aggregation.
- **Minor deferred items from the task reviews:** `loadByResource` NaN if a week entry lacks `hours` (the model always supplies it); `buildRequirement` counts consumed hours once per resource row when a task lists the same role twice (parity with the By Role view); `TEST_CASES.md` section 26 vs `test-cases.html` section 27 (pre-existing offset); the selected project can vanish from the panel's options when pipeline filters change; the Enter handler ignores IME composition.
- **New idea from the user (2026-09-30), future cycle to investigate:** a generic dataset chat (e.g. "any criticality in the project dashboard?") not tied to a single project — seed and open decisions (deterministic "criticality" rule, privacy scope) in project memory `project_assistant_general_dataset_chat.md`.
- **Process note:** a worktree has no `.env`; `scripts/run-tests.sh` needs it copied from the main checkout first (recorded in memory).

## Sync-docs outcome

- **ARCHITECTURE.md, CLAUDE.md, TEST_CASES.md, test-cases.html, test-api.js:** already updated inside the cycle (Task 11 and the final fix wave: new lib/service/route entries, `POST /api/planning-assistant/{rank,chat}` in the API table, removal of `js/ai.js`/`js/sync.js`/`appSettings`/match-owners, PA-01..PA-12 and PA-M1..M6, obsolete AI cases removed); verified by grep, no further edit needed. New per-area docs: `docs/api/planning-assistant.md`; updated `docs/api/{lib,planning-model,profile-engine,resources}.md`, `docs/pages/{planning,team,portfolio}.md`, `docs/js/{core,nav,lib}.md`.
- **PRD.md:** evaluated — user-visible change (new Team assistant, removed AI sidebar/AI Analysis); already updated in the cycle (new §11 Team assistant, localStorage keys table without `PDash_settings`); no further edit.
- **`.claude/skills/operational-manual/SKILL.md` (6b):** updated — the inlined reference's old "§11 AI Sidebar" (browser-direct provider calls, personal keys) was replaced by "§11 Team assistant", the §5 pointer to the old "no AI allocation feature" note and the guard wording were adjusted.
- **PROCESS.md gate:** none of the three conditions applies (no process skill changed, no recurring exception, no change to the skeleton/guardrails) — not touched.

## Memory outcome

Project memory evaluated and updated (outside the repo):
- `project_planning_team_assistant_cycle4.md`: "NEXT = Cycle B" → Cycle B MERGED `db6a6c1` with deploy facts, report path and a STILL-OPEN list (Gate 2 real-LLM check, profile Rebuild, `ANTHROPIC_API_KEY` of the running main container not inspected, follow-ups, deferred minors); description updated.
- `project_team_ux_backlog.md`: real NEXT order restated (Cycle B merged; LM Studio switch, hardening, new generic-dataset-chat idea).
- `project_descriptions_topics_cycle.md`: "INPUT FOR CYCLE 4" provenance marked DONE (profile v2).
- `project_resource_profile_cycle3.md`: initiative marked complete (Cycle 4 = Cycle A + B).
- New: `project_assistant_general_dataset_chat.md` (user request), `feedback_worktree_env_file.md` (worktree `.env` for run-tests); `MEMORY.md` index updated (hooks for the four changed files + two new lines).
- Unverified, left as is: whether the running main `pdash-api` container has `ANTHROPIC_API_KEY` set; the PROCESS.md "Da verificare" bullet on the memory-sync step still awaits the user's confirmation (see `project_team_ux_backlog.md`).
