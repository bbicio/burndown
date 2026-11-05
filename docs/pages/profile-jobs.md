# profile-jobs.html

**Profile processing console** (Cycle 3d, 2026-09-28). Vue 3 (CDN, no build step, same pattern as `team.html`/`admin.html`). A separate page with **no menu entry** — the only entry point is the "Profile processing" item of the Timesheets sub-nav it shares with `timesheets.html` (with a queue-size badge, hidden when the queue is empty). Admin **or** sysadmin; server-side `requireAdmin` on every route, client-side redirect to `/pipeline.html` for any other role. Calls the console API with direct `fetch()` (`team.html`'s established style, not `js/api.js`). `initNav('timesheets')` keeps the Timesheets nav tab highlighted and renders a breadcrumb bar (Home / Timesheets / Profile processing) whose own "Timesheets" link is the page's only back-navigation — no separate manual link. Spec: `docs/superpowers/specs/2026-09-26-profile-jobs-console-design.md` (context: `docs/superpowers/specs/2026-09-25-resource-profile-design.md` §5b). Plan: `docs/superpowers/plans/2026-09-26-profile-jobs-console.md`. Engine/worker detail: `docs/api/profile-engine.md`.

## Why

Before this cycle there was no UI for the profile engine (Cycle 3c): a recalculation could only be forced via `POST /api/profile-jobs/run` from an authenticated client, and the worker's schedule was only changeable via SQL. This page gives an admin visibility into what's queued and when it will run, a way to force processing (globally, per-code, or a full rebuild), a way to pull a code out of the queue, control over the worker's on/off switch and interval, and a history of recent runs.

## Layout (top to bottom)

Since the 2026-11-05 redesign (section below):

1. **Alerts**: red (load failure, not dismissible), amber (failed action), green (completed action), each with an icon.
2. **Guide text.**
3. **Status strip**: worker state ("Scheduled · every N min" / "Scheduled processing paused"), Next run with "· last HH:MM", topic extraction on/off, then Settings, Recalculate now (no confirmation) and Rebuild all (`showConfirm()`).
4. **Settings drawer** (opened from the strip): schedule toggle and interval (a whole number of minutes in the range `settingsState()` accepts), Save schedule enabled only for a valid change, topic-extraction switch saved immediately; closing it discards unsaved schedule edits.
5. **Project codes / Run history card**: a segmented switch; Project codes has search + status filter ("Not processed" rows under All only) + counter, columns Project · Code, Actuals rows, Matched resources, Status, Last · next run and the row actions (Remove from queue for queued codes, confirmed; Process); an Error pill opens a band with the full `last_error`. Run history (newest first, capped by `MAX_RUNS_KEPT` in `api/src/services/profile-engine.js`, `GET /api/profile-jobs/runs`) hides the search, the status filter and the counter.

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

## Header unification (2026-10-16)

Spec `docs/superpowers/specs/2026-10-16-header-unification-design.md`, report `docs/superpowers/reports/2026-10-16-header-unification-finish-cycle.md`. The former `.page-header` is now the shared page head (`.ph-*`, [docs/css/stylesheets.md](../css/stylesheets.md) → `css/style.css`), placed outside the `.page` wrapper so the breadcrumb and the band read as one block; `.page` keeps its own 2rem top margin.

## Redesign (2026-11-05)

Spec `docs/superpowers/specs/2026-11-05-timesheets-redesign-design.md`, plan `docs/superpowers/plans/2026-11-05-timesheets-redesign.md`, boards `docs/superpowers/design/timesheets/redesign/` (11.2a–h, 11.3).

- The page head reads "Timesheets" with the shared subtitle, and `.ph` plus the sub-nav (`js/lib/md-subnav.js`, set `timesheets`, active `profileJobs`) sit outside the Vue root; every successful `refresh()` sets the sub-nav badge with `queuedCount`, a failed one hides it.
- The settings card became the strip plus a local drawer (`.pj-drawer`, Esc, scrim, focus trap); Save schedule and the interval check read `settingsState()`; the `<details>` run history became the card's second view (`view`, not persisted).
- The error band lives inside its row and is keyed by `expanded[code]`, so it survives the auto-refresh; no timestamp is shown because the API returns none for `last_error`.
- Polling, `refreshSeq`, `keepForm`, `busyAction` and the action messages are unchanged; the sort stays two-state.
- On narrower screens the columns compact (Project · Code with "code · rows · resources", Status with the next run, Last processed, Process + ⋯ holding Remove from queue) and, where the open sidebar leaves no room for the sub-nav column, the sub-nav becomes tabs — the breakpoints are the media queries in the page's `<style>`; on a phone the strip is a card, one card per code with the error inline, Settings full screen.
- CSS is page-local `.pj-*` with tokens only; no emoji; guard `js/lib/timesheets-pages-guard.test.js`.
