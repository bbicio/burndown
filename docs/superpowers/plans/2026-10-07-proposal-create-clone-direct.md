# New Proposal and Clone without modals, Clone fix, API version rule — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "+ New Proposal" and Clone open the cost grid editor directly (no name modals), Clone no longer fails on an "Unassigned" client, and the API refuses new versions on a published proposal (sysadmin excepted).

**Architecture:** Client-side orchestration stays in `js/costgrid.js` (`cgCreateNewGrid`, `cgCloneGrid` become parameter-driven); a pure `cgApiClientId` in `js/lib/costgrid-calc.js` sanitises the client id; the version rule is a pure function in `api/src/lib/project-rules.js` called by two routes in `api/src/routes/cost-grids.js`.

**Tech Stack:** Vue 3 (CDN, runtime-compiled), classic shared script `js/costgrid.js`, vitest, Express + PostgreSQL, `node:test`, `test-api.js`.

**Spec:** `docs/superpowers/specs/2026-10-07-proposal-create-clone-direct-design.md` (Brief with file:line references: `docs/superpowers/briefs/2026-10-07-proposal-create-clone-direct-brief.md`).

## Global Constraints

- Names: new proposal `'New proposal'`; clone `cgLoad(srcCgId).name + ' — Copy'` (em dash, spaces). Clone content exactly as today (no exchange-rate snapshot, no tags).
- Version rule message `"A published proposal cannot get a new version."`, response `400 { error, code: 'VERSION_RULE' }`, sysadmin (live role via `liveRole`) exempt.
- Error copy: `"Could not create the proposal: {message}"`, `"Could not clone the proposal: {message}"`, title `"Error"`, shown with `showInfo(message, title)`; no native `alert`/`confirm`.
- Versions: `js/costgrid.js?v=38` → `?v=39`, `js/lib/costgrid-calc.js?v=5` → `?v=6` on both `pipeline.html` and `costgrid.html`.
- No hex/emoji/`v-html` added inside `#pipelineBoardSection` (`js/lib/pipeline-guard.test.js`).
- Edit HTML with the Edit tool only (no PowerShell `Set-Content` — BOM). Git as single plain commands.
- Tests per task: only touched files (`npx vitest run <file>`, `cd api && node --test src/lib/project-rules.test.js`). Backend integration only via `scripts/run-tests.sh`. Full `npm test` once in Task 3. Never `docker compose` on the main stack.
- Execution: native (`superpowers:executing-plans`); no automated screenshots; Gate 2 checklist at the end.

## Review Focus

1. Clicking New Proposal / Clone twice quickly → exactly one proposal; the second call returns at once (Task 2, in-flight flag checked by code reading + Gate 2 item 5).
2. Cloning from `costgrid.html` right after editing a field → the edit is in the copy (Task 2, `await cgAutoSave(true)` before loading the source; Gate 2 item 4).
3. Client id values other than a UUID (`'__unassigned__'`, `''`, `null`, `undefined`, arbitrary text) → `null` sent to the API (Task 2 unit test).
4. A sysadmin creating a version on a published proposal → still allowed (Task 1 node:test + VR-03).
5. Reloading `costgrid.html` after arriving with `focus=name` → no second focus (Task 2, `history.replaceState` removes the param; Gate 2 item 1).

---

### Task 1: API version rule

**Files:**
- Modify: `api/src/lib/project-rules.js` (+ export), `api/src/routes/cost-grids.js:380-410` (`POST /:id/versions`), `:492-552` (`POST /:id/versions/:vId/duplicate`)
- Test: `api/src/lib/project-rules.test.js`, `test-api.js` (new `testVersionRule()` called from `main()`)

**Interfaces:**
- Produces: `versionCreationError({ role, hasPublishedVersion }) → string|null`, `VERSION_RULE_CODE = 'VERSION_RULE'`.

- [ ] **Step 1: Failing unit tests** in `project-rules.test.js`: `versionCreationError({ role:'admin', hasPublishedVersion:false })` → `null`; `({ role:'admin', hasPublishedVersion:true })` → `'A published proposal cannot get a new version.'`; `({ role:'user', hasPublishedVersion:true })` → same message; `({ role:'sysadmin', hasPublishedVersion:true })` → `null`; `VERSION_RULE_CODE === 'VERSION_RULE'`.
- [ ] **Step 2: Failing integration cases** `VR-01…VR-04` in `testVersionRule()`: create (as admin) a proposal, publish its version (`POST /:id/versions/:vId/publish`; it stamps the current year — create that `pipeline_years` row if missing, register cleanup), then: `VR-01` admin `POST /api/cost-grids/:id/versions {label:'v2'}` → 400 and `data.code === 'VERSION_RULE'`; `VR-02` admin `POST /:id/versions/:vId/duplicate {label:'v2'}` → 400 `VERSION_RULE`; `VR-03` sysadmin `POST /:id/versions {label:'v9'}` → 201; `VR-04` on a second, Draft-only proposal, admin `POST /:id/versions {label:'v2'}` → 201. Cleanup of the published grid via `later('POST', '/api/admin/reset/cost-grid/<id>')`.
- [ ] **Step 3: Run to verify they fail** — `cd api && node --test src/lib/project-rules.test.js` → FAIL; `bash scripts/run-tests.sh` → VR-01/VR-02 fail.
- [ ] **Step 4: Implement** the function (reuse the file's `isSysadmin`) and, in both routes after `canEdit`, `hasPublishedVersion` via `EXISTS (SELECT 1 FROM cost_grid_versions WHERE cost_grid_id = $1 AND pipeline <> 'Draft')`, `role = await liveRole(req.user.id)`, refusal `res.status(400).json({ error: msg, code: VERSION_RULE_CODE })`.
- [ ] **Step 5: Run to verify they pass** — both commands → all green.
- [ ] **Step 6: Commit**

```bash
git add api/src/lib/project-rules.js api/src/lib/project-rules.test.js api/src/routes/cost-grids.js test-api.js
git commit -m "feat(api): refuse new versions on a published proposal (sysadmin exempt)"
```

---

### Task 2: New Proposal and Clone without modals, client-id fix

**Files:**
- Modify: `js/lib/costgrid-calc.js` (+ `cgApiClientId`), `js/lib/costgrid-calc.test.js`
- Modify: `js/costgrid.js:832-1009` (`cgCreateNewGrid`, `cgCloneGrid`)
- Modify: `pipeline.html` (button `:51`, card/panel Clone `:194`, `:277`, `openNewProposalModal`/`openCloneModal` `:1043-1057`, modal markup `:461-…`, `:483-…`, listeners `:1110-1124`, page override `window.showCostGridEditorView` `:569-572`, script versions)
- Modify: `costgrid.html` (Clone button `:39`, `openCloneModal` `:1391-1399`, modal markup `:548-…`, `:585-…`, `shown.bs.modal`/click listeners around `:1531`, `created`/cold-load `openVersion` `:1546`, script versions)
- Create: `js/lib/proposal-modals-guard.test.js`

**Interfaces:**
- Produces: `cgApiClientId(id) → string|null` (exported + `window` bridge); `cgCreateNewGrid() → Promise<void>`; `cgCloneGrid(srcCgId, srcVerId) → Promise<void>`; `pipeline.html` `window.showCostGridEditorView(cgId, versionId, opts?)` with `opts.focusName`; page methods `createNewProposal()`, `cloneProposal(cgId, verId)` (pipeline) / `cloneProposal()` (costgrid); reactive `proposalBusy`.

- [ ] **Step 1: Failing tests.** In `costgrid-calc.test.js`: `cgApiClientId('3f2a9c1e-8b7d-4e6f-9a0b-1c2d3e4f5a6b')` → same string; `cgApiClientId('__unassigned__')`, `('')`, `(null)`, `(undefined)`, `('abc')` → `null`. New `proposal-modals-guard.test.js` (read files with `fs` like other guards): `pipeline.html` and `costgrid.html` contain none of `cgNewGridModal`, `cgCloneModal`, `cgNewGridName`, `cgCloneGridName`, `btnCgCreateGrid`, `btnCgClone`; the `js/costgrid.js?v=` and `js/lib/costgrid-calc.js?v=` values are `39` and `6` on both pages.
- [ ] **Step 2: Run to verify they fail** — `npx vitest run js/lib/costgrid-calc.test.js js/lib/proposal-modals-guard.test.js` → FAIL.
- [ ] **Step 3: `cgApiClientId`** — UUID regex identical to `js/api-sync.js:256-259`.
- [ ] **Step 4: `cgCreateNewGrid()`** — module flag `_cgCreateInFlight` (return if set; reset in `finally`); name `'New proposal'`; same API calls and `_cgStore` seeding; on success `showCostGridEditorView(cgId, verId, { focusName: true })`; on error `showInfo('Could not create the proposal: ' + e.message, 'Error')`. Remove all DOM reads of the modal.
- [ ] **Step 5: `cgCloneGrid(srcCgId, srcVerId)`** — module flag `_cgCloneInFlight`; if `_cgActiveCgId === srcCgId && _cgActiveVersionId === srcVerId`: `clearTimeout(_cgAutoSaveTimer)` then `await cgAutoSave(true)` (on throw: `showInfo('Could not clone the proposal: ' + e.message, 'Error')` and return); name from `cgLoad(srcCgId).name + ' — Copy'`; `clientId: cgApiClientId(srcVer.clientId)` in both the API call and the seed; the rest unchanged; errors via `showInfo` (copy above); keep the existing post-clone `showInfo` warning and the `history.replaceState` URL rewrite. Remove `_pbCloneSource` and its declaration if nothing else reads it (grep).
- [ ] **Step 6: `pipeline.html`.** Button → `createNewProposal()`; card and panel Clone → `cloneProposal(card.cg.id, card.v.versionId)` / `cloneProposal(selectedCgId, selectedVerId)`; methods set `proposalBusy = true`, await the global, then (pipeline only) `refreshTick++` and remove `'Draft'` from `collapsedStages`, finally `proposalBusy = false`; `:disabled="proposalBusy"` on New Proposal and both Clone controls; delete the two modals' markup, their listeners and the old methods; page override appends `focus=name` when `opts && opts.focusName`; bump versions.
- [ ] **Step 7: `costgrid.html`.** Clone button → `cloneProposal()` (uses `this.cgId`, `this.verId`, same busy handling, `:disabled="proposalBusy"`); delete both modals' markup, listeners and `openCloneModal`; after the cold-load `openVersion`, if `new URLSearchParams(location.search).get('focus') === 'name'`: on `nextTick` focus and `select()` `#cgProjectName` when not disabled, then remove `focus` from the URL with `history.replaceState`; bump versions.
- [ ] **Step 8: Run to verify** — `npx vitest run js/lib/costgrid-calc.test.js js/lib/proposal-modals-guard.test.js js/lib/pipeline-guard.test.js js/lib/money-guard.test.js js/lib/foundations-guard.test.js js/lib/nav-shell-guard.test.js` → PASS.
- [ ] **Step 9: Commit**

```bash
git add js/lib/costgrid-calc.js js/lib/costgrid-calc.test.js js/lib/proposal-modals-guard.test.js js/costgrid.js pipeline.html costgrid.html
git commit -m "feat(pipeline): New Proposal and Clone open the editor directly; clone sends a valid client id"
```

---

### Task 3: Docs and full suite

**Files:**
- Modify: `CLAUDE.md` ("Clone (`cgCloneGrid`)", "Cost grid editor ↔ pipeline board integration", the `_pbCloneSource` line if removed, cache versions `js/costgrid.js?v=39`), `docs/js/costgrid.md` (dated section for this cycle)

- [ ] **Step 1: Docs** — describe: no modals; names; `focus=name`; autosave flush before cloning the open version; `cgApiClientId`; the API version rule (`VERSION_RULE`, sysadmin exempt) where version creation is documented.
- [ ] **Step 2: Full suite** — `npm test` → all green (record count); `bash scripts/run-tests.sh` → all green.
- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/js/costgrid.md
git commit -m "docs: New Proposal / Clone without modals, version rule"
```

---

## Gate 2 checklist (user, branch stack)

1. "+ New Proposal" opens the editor on "New proposal" with the name selected; reloading does not repeat the focus.
2. Clone from a card, from the panel header and from `costgrid.html` opens "{name} — Copy" with the same content as today's clone (phases, tasks, hours, roles, rates, header fields).
3. Clone of a proposal with client "Unassigned": no error, the copy has no client.
4. In `costgrid.html`, edit a field and click Clone at once: the edit is in the copy.
5. Fast double click on New Proposal / Clone creates one proposal; API errors appear in the app's info modal.
