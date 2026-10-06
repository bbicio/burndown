# Brief — New Proposal and Clone without modals, Clone "__unassigned__" bug, version rule on the API

**Date:** 2026-10-07. **Scenario:** 2 — evolution of an existing feature (plus one bug fix and one server-side hardening). Screenshot of the bug: `docs/superpowers/design/Pipeline/bug_cloneproposl_from_costgrid.png`.

## Current behavior (read in code)

**New Proposal**
- `pipeline.html:51`: the "+ New Proposal" button (visible when `newProposalVisible`) calls `openNewProposalModal()` (`pipeline.html:1043-1047`), which opens `#cgNewGridModal` (`pipeline.html:461`) asking for a name.
- The modal's Create button (`#btnCgCreateGrid`, wired at `pipeline.html:1113-1117`) calls `cgCreateNewGrid()` (`js/costgrid.js:832-893`):
  - requires a non-empty name, else shows "Please enter a name." in the modal;
  - `Api.costGrids.create({ name })`, then `versions.create(cgId, { label: 'v1' })`, then `saveStructure` with one empty "Phase 1";
  - seeds `_cgStore`, hides the modal, `showCostGridEditorView(cgId, verId)` → redirect to `costgrid.html?cgId=&verId=`;
  - on API error shows "API error: …" inside the modal; double-click guarded by disabling the button.
- `costgrid.html:548` also contains a `#cgNewGridModal` markup, but no control on that page opens it.

**Clone**
- Entry points: card hover action and panel header in `pipeline.html` (`:194`, `:277`) → `openCloneModal(cgId, verId)` (`pipeline.html:1048-1057`); the "⧉ Clone" button in `costgrid.html:39` → `openCloneModal()` (`costgrid.html:1391-1399`). Both set `_pbCloneSource`, prefill the name with `"{cg.name} — Copy"` and open `#cgCloneModal` (`pipeline.html:483`, `costgrid.html:585`).
- The modal's Clone button (`#btnCgClone`) calls `cgCloneGrid()` (`js/costgrid.js:898-1009`):
  - requires a non-empty name; clears the pending autosave timer; loads the source structure;
  - creates the grid (`create({ name })`) and a version `v1` with the source's `currency`, `clientId`, `ratecardId`, `startDate`, `endDate`, `note`, `projectName: name`;
  - copies phases/tasks/roles via `saveStructure(stripCloneTaskIds(srcVer.phases), srcVer.roles)`;
  - does **not** copy the exchange-rate snapshot (the new version takes the live rate) nor the tags; stage Draft, no pipeline year, no linked projects, no shares, owner = the user who clones;
  - seeds `_cgStore`, reloads the new structure, hides the modal, opens the editor and, on `costgrid.html`, rewrites the URL with `history.replaceState`;
  - errors are shown in the modal as "Clone failed: …".
- After create/clone, `pipeline.html:1115-1124` bumps `refreshTick` and expands the Draft column.

**Bug — "Clone failed: invalid input syntax for type uuid: "__unassigned__""**
- `cgSyncHeaderFromForm()` sets `_cgDraft.clientId = document.getElementById('cgClientId')?.value || '__unassigned__'` (`js/costgrid.js:402`); the client select's "Unassigned" option has the value `'__unassigned__'` (`js/clients.js:5`, `:138`).
- `cgCloneGrid()` sends `clientId: srcVer.clientId || null` to `Api.costGrids.versions.create` (`js/costgrid.js:935-944`) without sanitising it, so a proposal without a client sends `'__unassigned__'` to a `uuid` column. The project sync path already sanitises the sentinel (`js/api-sync.js:181`, `:256-259`); the clone path does not.

**Version rule**
- The UI allows at most one non-Draft version per proposal: "+ New version" only when the open version is Draft (`costgrid.html:38`, `isDraft` `:794`); Publish deletes the other Draft versions first (`js/costgrid.js:727-748`); a published version cannot go back to Draft (`costgrid.html:117-118`). Real DB: 0 proposals with more than one non-Draft version.
- The API does not enforce it: `POST /api/cost-grids/:id/versions` (`api/src/routes/cost-grids.js:380-410`) and `POST /:id/versions/:vId/duplicate` (`:492-552`) only check `canEdit`.

## Expected behavior

1. **New Proposal without a modal.** Clicking "+ New Proposal" creates the proposal at once with the name **"New proposal"** (version `v1`, Draft, one empty "Phase 1", as today) and opens the cost grid editor with the *Project name* field focused and selected so it can be renamed immediately.
2. **Clone without a modal.** Clicking Clone (card, panel header, or the cost grid editor's button) creates the copy at once with the name **"{original name} — Copy"** and opens it in the editor. What is copied stays exactly as today (header fields, phases, tasks, hours, roles and rates; no exchange-rate snapshot, no tags; Draft, `v1`, no pipeline year, no linked projects, no shares).
3. **Bug fixed.** Cloning a proposal whose client is "Unassigned" succeeds and the copy has no client.
4. **API version rule.** `POST /api/cost-grids/:id/versions` and `POST /api/cost-grids/:id/versions/:vId/duplicate` refuse to create a version when the proposal already has a non-Draft version, with an explicit error message.
5. Errors that the modals used to show (API failure during create/clone) are still shown to the user, with the app's own in-page modal idiom (`showInfo`), and a fast repeat click still cannot create two proposals.

## Constraints

- No build step; Vue 3 runtime templates; English copy; no native `alert`/`confirm` (project convention).
- `js/costgrid.js` is shared by `pipeline.html` and `costgrid.html`: every change there must work on both, and every `?v=N` reference to an edited versioned file is bumped on every page that loads it (`js/costgrid.js`, `css/pipeline.css` if touched…).
- Board/panel guard (`js/lib/pipeline-guard.test.js`): no hex, emoji or `v-html` in `#pipelineBoardSection`.
- Backend tests only via `scripts/run-tests.sh`; never `docker compose` on the main stack.
- Workflow `docs/superpowers/PROCESS.md`, closed by `/finish-cycle`.

## Acceptance criteria

1. "+ New Proposal" opens the editor of a new Draft proposal named "New proposal" with no modal in between; the *Project name* field is focused.
2. Clone from a card, from the panel header and from `costgrid.html` opens the editor of a new Draft proposal named "{original} — Copy" with no modal; its content matches today's clone output field by field.
3. Cloning a proposal with client "Unassigned" succeeds (no uuid error) and the copy's client is empty.
4. `POST …/versions` and `POST …/versions/:vId/duplicate` on a proposal with a non-Draft version return an error status with a message; on a Draft-only proposal they still succeed (test-api cases).
5. An API failure during create/clone shows an in-page error; a double click creates one proposal only.
6. `#cgNewGridModal` and `#cgCloneModal` markup and their wiring are removed from both pages; no dead references remain.
7. All existing suites green.

## Explicitly excluded scope (confirmed)

- Copying the exchange-rate snapshot or the tags in Clone.
- Other uses of the `__unassigned__` sentinel (e.g. the generated project's `clientId`, `js/costgrid.js:1245`, already sanitised by the sync).
- Repairing existing data (a `uuid` column cannot hold `__unassigned__`).
- Other server-side version rules (PATCH back to Draft, Publish's deletion of other Drafts).

## Open questions for /brainstorming

- Exact HTTP status and message for the version-rule refusal, and whether a sysadmin gets an exception (as with the project currency lock's `liveRole` rule).
- Where the "New proposal" focus/selection happens (URL flag read by `costgrid.html`, or another mechanism).
- Whether the guard against a double click (button disabled while in flight) needs a page-level flag now that the modal's button no longer exists.
- On `costgrid.html`, whether Clone must first flush a pending autosave of the source (today it only clears the timer).
- Whether to fix the sentinel at its source (`cgSyncHeaderFromForm`) or only at the clone call site.
