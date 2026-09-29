# profile-jobs.html

**Profile processing console** (Cycle 3d, 2026-09-28). Vue 3 (CDN, no build step, same pattern as `team.html`/`admin.html`). A separate page with **no menu entry** — the only entry point is a "Profile processing →" button (with a queue-size badge, hidden when the queue is empty) in `timesheets.html`'s header. Admin **or** sysadmin; server-side `requireAdmin` on every route, client-side redirect to `/pipeline.html` for any other role. Calls the console API with direct `fetch()` (`team.html`'s established style, not `js/api.js`). `initNav('timesheets')` keeps the Timesheets nav tab highlighted and renders a breadcrumb bar (Home / Timesheets / Profile processing) whose own "Timesheets" link is the page's only back-navigation — no separate manual link. Spec: `docs/superpowers/specs/2026-09-26-profile-jobs-console-design.md` (context: `docs/superpowers/specs/2026-09-25-resource-profile-design.md` §5b). Plan: `docs/superpowers/plans/2026-09-26-profile-jobs-console.md`. Engine/worker detail: `docs/api/profile-engine.md`.

## Why

Before this cycle there was no UI for the profile engine (Cycle 3c): a recalculation could only be forced via `POST /api/profile-jobs/run` from an authenticated client, and the worker's schedule was only changeable via SQL. This page gives an admin visibility into what's queued and when it will run, a way to force processing (globally, per-code, or a full rebuild), a way to pull a code out of the queue, control over the worker's on/off switch and interval, and a history of recent runs.

## Layout (top to bottom)

1. **Settings + global actions card**: on/off toggle and interval (1–1440 min, integer), Save disabled until something actually differs from the stored settings; a "Recalculate now" button (no confirmation) and "Rebuild all" (asks via `showConfirm()`). Below: the next-scheduled-run estimate (`describeNextRun`) and, once a scheduled run has happened, its timestamp.
2. **Project codes table**: search (matches code or project name, every whitespace-separated token) + status filter (All/Queued/Error/Updated — "Not processed" rows appear under All only, spec clarification), sortable columns (Code, Status, Last processed), internal scroll (`max-height:60vh`, sticky header), no pagination. Columns: project, code, actuals rows, matched resources, status (badge; an Error row's badge expands on click to show the full `last_error` text), last processed, next processing, and per-row **Process** / **Remove from queue** (queued rows only, confirmed).
3. **Run history** (`<details>`, collapsed by default): when, trigger type, projects, resource contributions, duration, error — newest first, capped at 50 (`GET /api/profile-jobs/runs`).

## Behaviour

- One `GET /api/profile-jobs` (+ `/runs`) on load, a 15-second auto-refresh while the tab is visible (paused in the background, catches up immediately on return via `visibilitychange`), and a refresh after every action.
- `refreshSeq` discards a stale in-flight refresh response if a newer one already landed; `keepForm` (the settings form is "dirty") stops a background refresh from clobbering an unsaved edit to the interval/toggle.
- A single page-level `busyAction` guard (not per-row) disables every action button while one is in flight — chosen because rows are wholesale-replaced on each refresh, so a per-row flag would be lost mid-action. Named per action (`'save'`, `'run'`, `'rebuild'`, `'process:'+code`, `'remove:'+code`) so the right button shows its own spinner.
- A 409 (another run already holds the engine's lock) shows the spec's fixed sentence, with a follow-up clause for Rebuild/Process noting the codes stay queued.
- A lost or non-JSON response to an *action* sets `actionError` (not `loadError`) — fixed during Cycle 3d's code review: `loadError` would otherwise be silently cleared by the action's own follow-up `refresh()` the moment that refresh succeeds, hiding a real failure (e.g. Rebuild all behind nginx's 60 s `proxy_read_timeout` on a large dataset).
- `encodeURIComponent` on every per-row API call — real project codes contain dots and can contain spaces (`HITA.000001586.001`).
- No native `alert()`/`confirm()` — `showConfirm()`/`showInfo()` from `js/core.js`.

## Pure helpers

`js/lib/profile-jobs-ui.js` (`?v=1`, loaded only by this page): `filterJobProjects`, `sortJobProjects`, `jobStatusLabel`/`jobStatusClass`, `describeNextRun`, `formatDateTime`, `formatDuration`. Vitest-covered (`docs/js/lib.md`).

## No automated UI test

This project has no browser/Vue runtime test harness. The page was verified by: a syntax check of its inline module script, a manual template/method-consistency re-read (every `v-model`/`@click`/interpolation checked against a defined data field or method), the frontend suite (helpers), the backend integration suite (`PJ-*` in `test-api.js`, `docs/api/profile-engine.md`), and a manual pass against an isolated branch stack with data cloned from `main` (settings widget, actions, filters, orphan code, error row, history, auto-refresh, the 409 race, a stopped-API network error, and non-admin permissions).


## Topic extraction additions (profile descriptions cycle, 2026-09-29)

- **On/off switch** in the settings card: "Topic extraction on/off" (`PUT /api/profile-jobs/topic-settings { enabled }`, runs through the same `runAction` guard as the other actions). Shows "(no API key configured)" while enabled and `ANTHROPIC_API_KEY` is unset (`topicSettings.keyConfigured` from `GET /api/profile-jobs`). Off means project descriptions are never sent to the AI service (privacy kill switch).
- **Topics column** in the project codes table: "extraction failed" (tooltip = the error) when the code's description state rows carry a `last_error`, else a dash. The extraction error is separate from the row's own processing error (`last_error`) and is never written to run history; it clears on the next successful extraction. The expanded error row colspan is 9.
- **Process re-extracts:** the per-row Process button clears the project's extraction hashes first, so its descriptions are sent to the LLM again even if unchanged.
- Retry behaviour, `topicRetryCodes` and the not-counted-as-work rule: `docs/api/profile-engine.md`.
