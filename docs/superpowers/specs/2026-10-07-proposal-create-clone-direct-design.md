# New Proposal and Clone without modals, Clone "__unassigned__" fix, API version rule — design

Date: 2026-10-07. Type: evolution (Scenario 2) + bug fix + server-side hardening. Source: Brief `docs/superpowers/briefs/2026-10-07-proposal-create-clone-direct-brief.md` (its "Current behavior" section has the verified file:line references; not repeated here). Screenshot: `docs/superpowers/design/Pipeline/bug_cloneproposl_from_costgrid.png`.

## Decisions (user, brief + brainstorming)

1. New Proposal is created at once with the name **"New proposal"**; the editor opens with *Project name* focused and selected.
2. Clone is created at once with the name **"{original cost grid name} — Copy"**; what is copied stays exactly as today (no exchange-rate snapshot, no tags).
3. The `#cgNewGridModal` / `#cgCloneModal` markup and wiring are removed from `pipeline.html` and `costgrid.html`; Clone without a modal applies to all entry points (card, panel header, `costgrid.html`).
4. API version rule: same pattern as the project currency lock — `400 { error, code: 'VERSION_RULE' }`, with a **sysadmin exception** (live role).
5. Approach A: keep the client-side orchestration in `js/costgrid.js` (no new clone endpoint). A server-side atomic clone is a follow-up.

## Design

### 1. New Proposal (`js/costgrid.js`, `pipeline.html`, `costgrid.html`)

- `cgCreateNewGrid() → Promise<void>`: no DOM read; constant name `'New proposal'`; same API calls and `_cgStore` seeding as today; then opens the editor with the focus flag.
- `pipeline.html`'s page override `window.showCostGridEditorView(cgId, versionId, opts)` gains an optional `opts = { focusName: true }` that appends `focus=name` to the URL (`/costgrid.html?cgId=…&verId=…&focus=name`). Other callers are unchanged.
- `costgrid.html`: after the initial `openVersion` of a cold load, if the URL has `focus=name`, focus and select `#cgProjectName` (when not disabled) and remove `focus` from the URL with `history.replaceState`, so a reload does not repeat it.
- The "+ New Proposal" button calls a page method `createNewProposal()` (replaces `openNewProposalModal`).

### 2. Clone (`js/costgrid.js`, both pages)

- `cgCloneGrid(srcCgId, srcVerId) → Promise<void>`: no DOM read; `_pbCloneSource` is no longer needed by the clone itself (removed if nothing else reads it); name = `cgLoad(srcCgId).name + ' — Copy'`; `projectName` of the new version = that name (as today); everything else copied exactly as today.
- On `costgrid.html`, when the source is the version open in the editor (`_cgActiveCgId === srcCgId && _cgActiveVersionId === srcVerId`), clear the pending timer and **await `cgAutoSave(true)`** before loading the source, so the latest edits are in the copy; if that save throws, abort the clone and show the error.
- After success: open the new copy in the editor (`showCostGridEditorView`), and on `costgrid.html` rewrite the URL to the new ids (as today).
- Entry points call it directly: `pipeline.html` card action and panel header → page method `cloneProposal(cgId, verId)`; `costgrid.html` Clone button → `cloneProposal()` (current `cgId`/`verId`). On `pipeline.html` the method keeps today's post-success bookkeeping (`refreshTick++`, expand Draft) before the redirect.

### 3. Errors and repeat clicks

- A module-level in-flight flag in `js/costgrid.js` (one for create, one for clone) makes a second call return immediately while the first is running.
- Pages expose a reactive `proposalBusy` (true while either runs) that disables the New Proposal and Clone controls.
- Errors are shown with `showInfo(message, title)`: "Could not create the proposal: {error}" / "Could not clone the proposal: {error}", title "Error". The existing post-clone warning ("The new proposal was created, but its structure may not have loaded correctly…") stays, via `showInfo`.

### 4. Bug fix — client id sent to the API

- New pure function in `js/lib/costgrid-calc.js`: `cgApiClientId(id) → string|null` — returns `id` when it is a UUID (same regex as `js/api-sync.js:256-259`), else `null`; bridged on `window`.
- `cgCloneGrid` uses `cgApiClientId(srcVer.clientId)` for the version it creates and for the in-memory seed. `cgSyncHeaderFromForm` (`js/costgrid.js:402`) is not changed (excluded scope).

### 5. API version rule (`api/src/lib/project-rules.js`, `api/src/routes/cost-grids.js`)

- `versionCreationError({ role, hasPublishedVersion }) → string|null`: `null` when `role === 'sysadmin'` or `!hasPublishedVersion`; else `"A published proposal cannot get a new version."`. Exported with `VERSION_RULE_CODE = 'VERSION_RULE'`.
- `POST /:id/versions` and `POST /:id/versions/:vId/duplicate`: after the existing `canEdit` check, compute `hasPublishedVersion` (`EXISTS (SELECT 1 FROM cost_grid_versions WHERE cost_grid_id = $1 AND pipeline <> 'Draft')`) and `role = await liveRole(req.user.id)`; on a message respond `400 { error: message, code: 'VERSION_RULE' }`.

### 6. Cleanup and versions

- Remove `#cgNewGridModal`, `#cgCloneModal`, their inputs/buttons, their `shown.bs.modal`/click listeners and `openNewProposalModal`/`openCloneModal` from both pages.
- Bump every reference: `js/costgrid.js?v=38` → `?v=39`, `js/lib/costgrid-calc.js?v=5` → `?v=6` (both pages).

## Testing

- **vitest:** `cgApiClientId` (UUID kept; `'__unassigned__'`, `''`, `null`, `undefined`, `'abc'` → `null`); new guard `js/lib/proposal-modals-guard.test.js`: `pipeline.html` and `costgrid.html` contain none of `cgNewGridModal`, `cgCloneModal`, `cgNewGridName`, `cgCloneGridName`, `btnCgCreateGrid`, `btnCgClone`, and both pages reference the same `?v=` for `js/costgrid.js` and `js/lib/costgrid-calc.js`.
- **node:test** (`api/src/lib/project-rules.test.js`): `versionCreationError` — Draft-only → null; published + admin/user → message; published + sysadmin → null.
- **test-api.js** (`VR-01…VR-04`): on a published proposal, admin `POST /versions` → 400 `VERSION_RULE`, admin `POST /duplicate` → 400 `VERSION_RULE`; sysadmin `POST /versions` → 201; on a Draft-only proposal, admin `POST /versions` → 201. Cleanup through the sysadmin reset route.
- Full `npm test` once at the end; backend via `scripts/run-tests.sh`.

### Gate 2 checklist (user, branch stack)

1. "+ New Proposal" opens the editor on "New proposal" with the name selected; reload does not repeat the focus.
2. Clone from a card, from the panel header and from `costgrid.html` opens "{name} — Copy" with the same content today's clone produced.
3. Clone of a proposal with client "Unassigned" succeeds; the copy has no client.
4. Edit a field in `costgrid.html` and Clone at once: the edit is in the copy.
5. Fast double click on New Proposal / Clone creates one proposal only; errors appear in the app's info modal.

## Documentation

`CLAUDE.md`: "Clone (`cgCloneGrid`)" (no modal, name, autosave flush, `cgApiClientId`), "Cost grid editor ↔ pipeline board integration" (New Proposal flow, `focus=name`), the `_pbCloneSource` line if removed, cache versions; `docs/js/costgrid.md`. PRD and test cases via `/sync-docs`.

## Execution

Small cycle (PROCESS.md §6.1): native execution (`superpowers:executing-plans`); the user switches the session to Sonnet for implementation and back to Opus for the final whole-branch review and `/finish-cycle`.

## Out of scope

Copying the exchange-rate snapshot or tags; other `__unassigned__` uses; data repair; other server-side version rules; a server-side atomic clone endpoint (follow-up).

## Acceptance criteria

1. New Proposal and Clone open the editor with no modal, names per Decisions 1–2.
2. Clone content identical to today's; latest unsaved edits included when cloning from the editor.
3. "Unassigned" clone succeeds with an empty client.
4. Version rule enforced on both routes with the sysadmin exception (tests VR-01…04).
5. In-page errors; one proposal per double click.
6. Modals removed from both pages; versions bumped; all suites green.
