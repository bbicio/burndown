# UI defects that mislead or lose data — design

Date: 2026-09-30. Scenario 2 (evolution of existing features). Input: Brief from `/feature-brief` + brainstorming decisions.

## Problem

Four places where the UI either promises something it does not do or lets the user lose work silently:

1. `project-config.html` — "⟳ Derive from task dates" and "↻ Reforecast from actuals" (`derivePhasing`/`runReforecast`) only change `project.phasing`/`project.planning` in memory. Nothing warns if the user leaves before Save; there is no `beforeunload` and no dirty state anywhere on the page.
2. `config.html` `deleteProgram` — the confirm says "Projects in this program will lose the program reference", but `DELETE /api/programs/:id` (`api/src/routes/config.js`) answers 400 "Cannot delete program with linked projects" when any project is linked.
3. Programs cannot be renamed or deleted from any reachable UI: the Programs panel and its Edit/Delete methods exist in `config.html`, but its tab was hidden from the nav (comment at the tab bar).
4. Planning "Team assistant" panel (`planning.html`): (a) the project `<select>` options (`taProjectOptions`) follow the page filters, so the selected `taProjectId` can vanish from the options while chat and tables keep showing it; (b) `@keydown.enter` sends while an IME composition is active.

## Decisions

| # | Decision |
|---|---|
| D1 | `project-config.html` warns on leaving the page whenever the project differs from the last loaded/saved state (any edit, not only Derive/Reforecast), through the browser's native `beforeunload` prompt. |
| D2 | Dirty detection = JSON snapshot compare, no watcher. Pure function `isProjectDirty(snapshot, project)` in `js/lib/config-form-calc.js`. |
| D3 | Program tab is shown again in `config.html`; the existing list/Edit/Delete are reused unchanged, admin-only like the rest of the page. |
| D4 | Delete-Program confirm text becomes honest: deleting is refused while projects are linked. Backend unchanged. |
| D5 | Team assistant: when `taProjectId` is no longer in `taProjectOptions`, reset it to empty and clear the chat (same effect as changing project). Pure decision function in `js/lib/team-assistant-ui.js`. |
| D6 | Team assistant: Enter sends only when not Shift and not `isComposing`. Pure function `shouldSendOnEnter(e)` in `js/lib/team-assistant-ui.js`. |

## Design

### 1. project-config dirty warning

- New data `savedSnapshot: null`. Set to `JSON.stringify(this.project)` at the end of `mounted`/init, immediately before `this.ready = true` (after `resolveProject`, `sanitizeStatus` and all normalisations in `resolveProject`, so those never count as user edits). Skipped when `notFound`.
- `onSave`: `window.location.href` navigates right after the push, so `beforeunload` would fire on a successful save. Set `this.savedSnapshot = JSON.stringify(this.project)` immediately before that redirect (and only on that path; on error the snapshot stays stale and the project stays dirty).
- One `beforeunload` listener registered at mount: if `!this.isViewer && isProjectDirty(this.savedSnapshot, this.project)` → `e.preventDefault(); e.returnValue = ''`. Viewers never get the prompt. The listener does nothing if `savedSnapshot` is null.
- `isProjectDirty(savedJson, project)`: returns `false` if `savedJson == null` or `project == null`, else `JSON.stringify(project) !== savedJson`.
- Not covered (they persist immediately, are not "unsaved"): tags (`toggleTag` → `Api.projects.tags.replace`), actuals upload/delete, new client/program modals. `projectTags`, `actuals`, modals are separate data and are not part of `this.project`, so the compare ignores them.
- Both "← Back to Portfolio" buttons use `location.href`, so they are covered by the same prompt (native browser text; not customisable).
- Side effect to be aware of, not fixed here: `onSave` catches `_pushProjectToApi` errors, logs a warning and still redirects (`project-config.html:838-841`). A failed sync still looks like a success. Out of scope (see Excluded).

### 2. Programs

- `config.html`: add a "Programs" tab button after "Pipelines & POTs" with the same `cfg-tab-btn` pattern and count (`programs.length`); remove the stale "intentionally hidden" comment. Panel, data (`Api.programs.list()` already loaded), `openProgramForm`, `saveProgram`, `deleteProgram` stay as they are.
- `deleteProgram` confirm text: `Delete program "<name>"?\n\nThis cannot be undone. A program that still has projects linked cannot be deleted — the request will be refused.` The refused response (`globalError = e.message`) is already shown by the existing catch. Still a native `confirm()`: replacing it is the deferred point 2.
- Program IDs cannot be edited (existing `saveProgram` only sends `name` on update) — unchanged.

### 3. Team assistant

- `js/lib/team-assistant-ui.js` gains:
  - `selectionStillValid(selectedId, options)` → `true` if `selectedId` is empty or `options.some(o => o.id === selectedId)`.
  - `shouldSendOnEnter(e)` → `!!e && e.key === 'Enter' && !e.shiftKey && !e.isComposing`. Note: some IME implementations report `keyCode === 229` with `isComposing` false on the confirming Enter; the check therefore also returns `false` when `e.keyCode === 229`.
- `planning.html`: `watch: { taProjectOptions() { if (!selectionStillValid(this.taProjectId, this.taProjectOptions)) { this.taProjectId = ''; this.taNewChat(); } } }`. While a request is in flight (`taBusy`), the existing `isStaleResponse` already discards responses for a project that is no longer selected, so no extra guard is needed.
- The Enter handler becomes `@keydown.enter="e => { if (shouldSendOnEnter(e)) { e.preventDefault(); taSend(); } }"`. Shift+Enter keeps inserting a newline as today.
- `projectOptions` is unchanged.

## Acceptance criteria

- AC1: on `project-config.html`, editing any field (or running Derive/Reforecast) and then closing/reloading/navigating shows the browser's leave-page prompt; after 💾 Save the redirect to the portfolio happens with no prompt; a page with no edits never prompts; a viewer never prompts.
- AC2: `isProjectDirty` returns `false` for identical state or null inputs and `true` after any change (unit-tested).
- AC3: the Delete Program confirm text no longer says projects lose the program reference; deleting a program with linked projects shows the server's refusal message and leaves the program listed.
- AC4: an admin can open Configuration → Programs, rename a program (name only) and delete a program with no projects.
- AC5: with a project selected in the Team assistant, a page filter change that removes it from the options resets the selection to "Select a project…" and clears chat/tables; a filter change that keeps it changes nothing.
- AC6: Enter during IME composition (and `keyCode 229`) does not send; plain Enter sends; Shift+Enter inserts a newline.
- AC7: `npm test` green with new tests for `isProjectDirty`, `selectionStillValid`, `shouldSendOnEnter`.
- AC8: cache-busting: `?v=` bumped for every reference to a changed versioned file (`js/lib/config-form-calc.js` 1→2 in `project-config.html`; `js/lib/team-assistant-ui.js` 2→3 in `planning.html`; repo-wide grep before merge).

## Manual verification (browser, isolated stack via `scripts/test-branch.sh`)

Derive → leave without saving (prompt), Save (no prompt); Programs tab rename/delete (empty and linked); Planning filter removes the selected project; Enter with a Japanese/Chinese IME (or a synthetic `isComposing` event via console if no IME is available).

## Excluded scope

- Everything in Settings (Data Manager, Backup, Restore from Backup, `js/settings.js`) — a dedicated future cycle will review or remove it.
- Native `alert()`/`confirm()` replacement and inline hex colours (deferred point 2).
- Navigation rework, page redesigns.
- `planning.html` dead code, `runChat` error scrubbing, LM Studio switch.
- `onSave` swallowing `_pushProjectToApi` failures and redirecting anyway — separate finding, not addressed here.
- Backend changes to Program deletion (no unlinking of projects); editing Program IDs; Program management for non-admin editors.

## Risks

- False-positive dirty prompt if something mutates `this.project` after the snapshot (e.g. a late async normalisation). Mitigation: snapshot is the last step before `ready = true`; manual check on an existing project with no edits.
- Native `beforeunload` text cannot be customised; acceptable.
