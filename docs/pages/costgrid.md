# costgrid.html

Cost grid editor (phase/task/role table, phasing panel, version tabs, toolbar), Vue 3 (CDN, no build step, same pattern as `pipeline.html`/`portfolio.html`).

This file holds the full implementation narrative for this page — cycle-by-cycle detail, methods involved, first-attempt bugs, and report references. `CLAUDE.md`'s Pages table keeps only a one-line purpose description; when working on this page, read this file, not that row, for the detail. See `/sync-docs`'s routing rule for where future changes to this page should be written.

## Current state

How the editor's version switching and the proposal create/clone flow work **today** — reference description, as opposed to the dated cycle entries below. Moved verbatim from `CLAUDE.md` on 2026-10-10 (phase 3 of the context-size split).

### Version tab switching (editor)

As of the 2026-10-07 redesign cycle, the former `.page-title-bar`/`.page-toolbar`/version-tabs row is one `.cg-header` card (`costgrid.html`): row 1 is the proposal name, client/linked-project subtitle and stage pill; row 2 is the `.cg-version-seg` segmented control (a "+ New version" segment, `v-if="isDraft"`, then one segment per version, the active one navy-filled) on the left and Save/Clone/Export XLS/Share plus exactly one primary action (Publish to SIP / Generate project / "Selecting tasks…" / "All tasks are in projects") on the right.

`costgrid.html`'s Vue instance handles version-tab clicks directly via `switchVersion(verId)` (a Vue method, `@click` on each segment), which calls `cgAutoSave()` then `await this.openVersion(this.cgId, verId)` — `openVersion()` itself awaits `cgLoadStructureFromApi(cgId, verId)` before assigning `_cgDraft`/`this.draft`, ensuring the structure is fetched before rendering. `js/costgrid.js`'s `renderCgVersionTabs(cg)` (called by other, unchanged global functions like `cgPublishDraft`) is now just a bridge that reassigns `_cgVueApp.cg` — it no longer owns the tab click-handling itself.

**"+ New version" has no name-prompt modal.** `#cgNewVersionModal`/`openNewVersionModal`/`cgCreateNewVersion`'s modal path were removed. Clicking the segment calls `createNewVersionDirect` (Vue) → `js/costgrid.js`'s `cgCreateNewVersionDirect()`, which creates the version immediately with a default label (`'v' + (cg.versions.length + 1)`), flushes the editor (`cgAutoSave(true)`) before the atomic server-side copy (header/phases/tasks/roles/rates/tags) exactly as the old `cgCreateNewVersion` did, then selects the new tab via `switchVersion(serverId)`. The new segment's label is editable inline — the same click-to-edit affordance already used for `phase.phaseName`: clicking the small pencil icon next to the active segment (`startEditingVersionLabel()`) swaps the label for a text input bound to `draft.versionLabel`, committed on blur/Enter (`commitVersionLabelEdit`) or reverted on Esc (`cancelVersionLabelEdit`), both scheduling an autosave. "+ New version" stays Draft-only (`v-if="isDraft"`) — versions can still only be created/deleted while the proposal is a Draft.

### New Proposal / Clone (no modal, 2026-10-07)

`cgCreateNewGrid()` and `cgCloneGrid(srcCgId, srcVerId)` (`js/costgrid.js`) no longer go through a name-prompt modal (`#cgNewGridModal`/`#cgCloneModal`, removed from both `pipeline.html` and `costgrid.html`, along with `_pbCloneSource`) — both act at once and open the editor on the result:

- **New Proposal**: creates a Draft `v1` named `'New proposal'`, then calls `showCostGridEditorView(cgId, verId, { focusName: true })`. On `pipeline.html` that appends `&focus=name`; `costgrid.html`'s cold-load `created()` hook, after `openVersion()`, focuses and selects `#cgProjectName` (skipped if `isLocked`) via `this.$nextTick`, then strips `focus` from the URL with `history.replaceState` so a reload doesn't repeat it.
- **Clone**: entry points call `cgCloneGrid(cgId, verId)` directly (card action, panel header, and `costgrid.html`'s own Clone button) — no shared source variable needed. If the source is the version currently open in the editor, `cgAutoSave(true)` is awaited first (after clearing `_cgAutoSaveTimer`) so the clone carries the latest unsaved edits, not a stale snapshot. The new proposal is named `"{source name} — Copy"`. The client id sent to the API goes through `cgApiClientId()` (`js/lib/costgrid-calc.js`) — the frontend's "Unassigned" sentinel (`'__unassigned__'`, see `js/clients.js`) is not a valid UUID and previously caused `Clone failed: invalid input syntax for type uuid: "__unassigned__"` when the source had no client; `cgApiClientId` returns the id unchanged only when it matches the UUID shape, else `null` (same regex as `js/api-sync.js`'s existing project-save sanitization).
- A module-level in-flight flag in each function (`_cgCreateInFlight`/`_cgCloneInFlight`) replaces the old disabled-button guard against a fast repeat click; the page-level `proposalBusy` (Vue data on both pages) disables the New Proposal/Clone controls for the same window.
- Errors surface via `showInfo('Could not create/clone the proposal: ' + e.message, 'Error')` instead of inline modal text.

Clone flow otherwise unchanged:
1. Creates a new cost grid + version via API; new version label is always `'v1'` regardless of the source label
2. Copies phase/task/role structure from the source version via `cgLoadStructureFromApi` + `saveStructure` — the copied `phases` array is passed through `stripCloneTaskIds()` (`js/lib/costgrid-calc.js`) first, removing every `taskId`/`phaseId` so the backend mints fresh UUIDs instead of reusing the source version's (still-existing) ones, which previously caused `duplicate key value violates unique constraint "tasks_pkey"`
3. On `costgrid.html`: updates URL to the new `cgId`/`verId` via `history.replaceState` (prevents stale URL state loops)
4. Redirects to the new grid in the editor, re-fetching the server-assigned structure via `cgLoadStructureFromApi` (the in-memory seed used only `phases: []` since the real IDs aren't known client-side until the server assigns them)
5. Not copied, by design: the exchange-rate snapshot (the new version takes the live rate) and tags

**API version rule (2026-10-07):** `POST /api/cost-grids/:id/versions` and `POST /:id/versions/:vId/duplicate` refuse (`400 { error, code: 'VERSION_RULE' }`) to create a version on a proposal that already has a non-Draft version — closing the gap left by the UI-only enforcement (`+ New version` only on a Draft, Publish deletes the other Drafts) against a direct API call. A sysadmin (live role) is exempt. Rule: `versionCreationError({ role, hasPublishedVersion })` in `api/src/lib/project-rules.js`, same pattern as the project-currency-lock rules in that file (`VERSION_RULE_CODE`, distinct from their `RULE_CODE`/`PROJECT_RULE`).

## Base state

Single monolithic `Vue.createApp` — its only registered sub-component is the shared `<share-list>` (2026-09, see `js/share-list-component.js`'s own entry in `CLAUDE.md`), everything else stays inline template. `js/costgrid.js` stays loaded unmodified as the shared library for `pipeline.html`/`planning.html` — a "bridge pattern" redefines `renderCgEditor()`/`renderCgVersionTabs(cg)`/`showCostGridEditorView(cgId, versionId)` in `js/costgrid.js` to delegate into the mounted Vue instance via a module-level `_cgVueApp` reference, so ~15 other unchanged `js/costgrid.js` functions that call these three at their tail (`cgPublishDraft`, `cgCreateNewVersion`, `cgCloneGrid`, `cgGenerateProject`, etc.) require zero code changes. `_cgDraft`/`this.draft` are the SAME object reference (assigned once per version load in `openVersion()`, never independently re-cloned) since `cgAutoSave()` (a kept-unchanged global) reads `_cgDraft` directly. Locked/Committed-version edit enforcement restored via `:disabled="isLocked"`/`v-if="!isLocked"` on every input/select/textarea and mutation button inside the editor body (both the offer-details header form and the grid table) — matches the pre-Vue `cgApplyEditorLock()`'s exact coverage (it swept the whole editor body, header included). `#confirmModal`/`#jsonViewerModal` stay unmodified shared Vanilla utilities; `#cgNewVersionModal`/`#cgCloneModal`/`#cgRoleSelectModal` are Vue-triggered. Deletes confirmed-dead `#rolesModal`/`#roleModal`/`#programsModal`/`#programEditModal` markup (only reachable via the unloaded `js/main.js`) — `#clientsModal`/`#clientEditModal` were investigated and found genuinely reachable (`showClientsModal()`, a live "+ New" button next to the Client dropdown), so kept, along with `js/clients.js`/`js/roles.js`/`js/programs.js`'s `<script>` tags (all three define `load*FromApi()`/`get*()` functions this page's own init still calls, not just their now-removed dead CRUD modals). Adds a `clientIdInput` computed (mirrors `startDateInput`/`endDateInput`/`ratecardIdInput`) bridging `draft.clientId`'s `null` "no client" state to the Client `<select>`'s `'__unassigned__'` sentinel option value, since Vue's native `v-model` select binding requires an exact match.

## Sharing (2026-09)

This page previously had no sharing UI at all: gained a "🔗 Share" toolbar button (`v-if="!isDraft"`, opens the existing `#shareModal`) and a new "Sharing" `section-card` between "Offer details" and "Cost Grid" holding the inline `<share-list>` component (same one used by `pipeline.html`'s detail panel, see `js/share-list-component.js`). `openShareModal` had to be added to this page's own `methods: {}` block (a real bug found during manual verification — referencing it only as a bare global inside the `@click` handler threw `openShareModal is not a function`, since this Vue build does not reliably fall back to `window` globals from inside compiled template click handlers; `pipeline.html`'s own pre-existing Share button already worked around this the same way, see its Global Constraint 5 note).

## Layout follow-up (2026-09)

Owner name and version creation date moved out of the Sharing card into a new `Owner: 👤 <name>, Created at: <date>` line at the top of the (already-collapsible) "Offer details" body, so the Sharing card now shows only the share list itself. The Sharing card itself gained the identical collapse/expand header pattern "Offer details" already had (own `sharingCollapsed` flag in `data()`, same arrow/`@click`/`v-show` idiom) — previously it was always expanded, non-collapsible.

## Owner reassignment (2026-09)

The `Owner: 👤 <name>, Created at: <date>` line at the top of "Offer details" gained a `<select>` (visible whenever `isAdminUser`, i.e. `role === 'admin' || 'sysadmin'`, regardless of the version's lock state — reassignment is an ownership change, not a content edit) populated from `GET /api/users/active-list` via `Api.users.activeList()`. Selecting a user (the currently-owner option is `:disabled`) opens `showConfirm()` naming the target and what they'll gain, then calls the new `Api.costGrids.reassignOwner(cgId, ownerId)` (`PATCH /cost-grids/:id/reassign-owner`, `js/api.js`); on success updates `cg.ownerId`/`ownerName` locally and bumps `shareListRefreshTick` so the inline `<share-list>` picks up the new owner immediately, without waiting for the Share modal to open/close. Linked-project button in this page's own linked-projects area (`openLinkedProject`) relabeled "📊 Portfolio" → "📊 Project Dashboard", matching `pipeline.html`'s detail panel's identical rename.

The backend route (`PATCH /api/cost-grids/:id/reassign-owner`, `api/src/routes/cost-grids.js`) is open to any admin or sysadmin (`isAdminRole()`) — distinct from `reset.js`'s pre-existing sysadmin-exclusive `PATCH /api/admin/reset/cost-grid/:cgId/owner` (used by `_db-reset.html`'s "Change proposal owner" widget), which only updates the cost grid's own ownership; this new route additionally grants the new owner an `editor` `resource_shares` row on every project linked to any version of the cost grid (skipped via a `WHERE ... permission != 'owner'` guard if the new owner already owns that project outright, so an existing project-owner is never downgraded) and sends `sendOwnerReassignedEmail` (`api/src/services/email.js`, lists any linked project names) to the new owner. Both this route and `reset.js`'s route keep `resource_shares.shared_by` set to the actor performing the reassignment (`req.user.id`) on every `INSERT`/`ON CONFLICT DO UPDATE`, not the new owner themselves.

## Generate Project / program auto-link (2026-09)

When generating a project from a partial task selection (any pipeline stage except Draft) with no program yet established for the proposal, a "Create program" step is now required before generation completes (see `js/costgrid.js`'s own entry in `CLAUDE.md` for the full flow); three new modals back this on this page — `#cgProjectNameModal` (project name + optional code, replaces a former native `prompt()`), `#cgCreateProgramModal` (create-new name+id fields, or a `<select>` reading a new reactive `programs` array in `data()` to link to an already-existing program instead — `getPrograms()` itself can't be read from inside a compiled Vue template, the same landmine documented for `openShareModal` above), and `#cgAddToProjectModal` (replaces the old hand-rolled `_cgEnsureAddToProjectModal()` non-Bootstrap modal for the "Add selected tasks to an existing project" flow). A shared `hideModalThen(modalId, fn)` Vue method chains a modal-to-modal transition off the first modal's own `hidden.bs.modal` event (falling back to calling `fn()` directly if there's no live `Modal` instance to hide) rather than firing `fn` synchronously right after `.hide()`, avoiding a Bootstrap backdrop/scroll-lock race when the second modal's `show()` could otherwise race the first's fade-out.

## Proposal exchange-rate display (2026-09)

The Currency selector in "Offer details" now shows "1 EUR = {{ rate }} {{ symbol }}" underneath it whenever `draft.currency !== 'EUR'`, formatted with the same fixed 6-decimal `toLocaleString('en', {minimumFractionDigits:6})` the Currencies confirm modal (`config.html`) uses; sourced from `draft.currencyRate`, a pre-existing field (`js/api-sync.js`'s `_cgApiVersionToLocal`, from `cost_grid_versions.currency_rate`) that was never actually rendered anywhere in the UI before this cycle. Added deliberately as the frozen per-version rate, not a live currency lookup, to reinforce the same non-retroactivity point as the Currencies tab's own confirm modal.

A real bug was found and fixed during manual verification: `onCurrencyChange()`'s two code paths (no roles yet / roles-exist-confirm-modal) synced role rates to the new currency's baseline but never updated `draft.currencyRate` itself, so the newly-added display showed a stale value (e.g. "1.000000" right after switching from EUR to USD) until a full page reload — even though the backend autosave (`_cgUpsertVersionToApi`, `js/api-sync.js`) already recomputes and persists the live rate on every save. Both paths now also set `this.draft.currencyRate` to the live rate (from the already-loaded `this.currencies` array) at the same point `cgSyncRoleRatesToBaseline(true)` is called.

## Tags (2026-09, Cycle 2 of the resource-allocation initiative)

New collapsible "🏷 Tags" `section-card` between "Offer details" and "Sharing" — lets an editor/owner assign `attribute_lists` tags (Market, Brand, Service Type, Therapeutic Area, or any future list) to the currently-open version. See `docs/superpowers/specs/2026-09-23-tag-linking-design.md` and `docs/superpowers/plans/2026-09-23-tag-linking.md` for the full design/plan; `js/tags.js`'s own entry in `CLAUDE.md`'s File Structure for the shared catalog-loading helper both this page and `project-config.html` use.

State: `attributeLists` (loaded once in `created()` via `loadActiveAttributeListsForTagging()`), `versionTagItemIds` + `versionTagRows` (loaded per-version in `openVersion()` via `Api.costGrids.versions.tags.list(cgId, verId)` — `versionTagRows` carries the full row shape, including `status`, so `inactiveAssignedForList(listId)` can render an assigned-but-later-deactivated item as a distinguishable, still-removable entry even though it no longer appears in the active `attributeLists` catalog), `tagSaving` (guards concurrent toggles). `toggleTag(itemId, event)` mutates local state optimistically, disables the whole Tags section (`:disabled="... || tagSaving"`) for the duration of the save so a second click can't race the first, and on failure both rolls back the local mutation and — defense in depth for the brief window before Vue's `disabled` re-render lands — flips the native checkbox back via `event.target.checked = !event.target.checked` (a fix-round-2 finding: the checkbox's own default click behavior flips it before the Vue `@change` handler even runs, so a silently-bailed guard alone left it visually out of sync).

**UI redesign (same cycle, post-implementation):** the original checkbox+label rows were replaced with a tag-pill/chip component (`.tag-pill` etc., `css/style.css`) after user feedback that checkboxes read as a settings form, not as tags. The real `<input type="checkbox">` stays in the DOM, visually hidden (not `display:none`) via `.tag-pill input[type="checkbox"]`'s clip-rect technique, so Tab/Space/focus/screen-reader behavior is unchanged — only the visual presentation moved onto the surrounding `<label class="tag-pill">`. Selected = navy fill + checkmark SVG (`.tag-pill:has(input:checked):not(.tag-pill--inactive)`); available = white/outline; inactive-assigned = dashed border + muted text + italic "inactive" suffix (`.tag-pill--inactive`). Colors reuse `--brand-navy`/`--border-medium`/`--text-muted`/`--text-disabled` from `css/tokens.css` — no new hardcoded hex. A real specificity bug was found and fixed during this redesign: `.tag-pill:has(input:checked)` (one class + one `:has()` pseudo-class, specificity (0,2,1)) was overriding `.tag-pill--inactive` (0,1,0) even though the inactive rule is more specific *in intent* — an inactive-assigned tag is always `checked` by construction, so without the `:not(.tag-pill--inactive)` exclusion it always rendered fully navy-filled instead of dashed/muted. Read-only sections (locked version, viewer permission) dim only the pills that AREN'T assigned (`.tags-section--readonly .tag-pill:not(:has(input:checked))`) — a selected or inactive-assigned pill stays at full opacity, since a faded navy fill would otherwise drop white-on-navy text below 4.5:1 contrast, and what's actually tagged is the one thing that must stay legible when the section can't be edited.

**Known deferred findings** (code review round 3, accepted as follow-up rather than a 4th review round — see project memory `project_known_findings_tag_cycle.md`): `toggleTag()`'s error-path rollback can write stale data if the user switches version tabs while a save for the previous version is still in flight (no version-identity check on the rollback) **[closed 2026-09-30, see Hardening below]**; `PUT .../tags` and its sibling `GET` don't verify `:vId` belongs to `:id` (a pre-existing cross-cutting gap shared with `structure`/`linked-projects`/`duplicate` in the same file, not introduced by this cycle) **[closed 2026-09-30, see Hardening below]**; the backend replace-all uses a sequential per-item `INSERT` loop instead of this codebase's `unnest($n::uuid[])` bulk-array idiom (`timesheets.js:297`).

## Description and Generate project (profile descriptions cycle, 2026-09-29)

The proposal header field formerly labelled "Notes" (`#cgNote`) is now labelled **Description**; the field and column stay `note` (no API or export impact). "Generate project" (`js/costgrid.js`, `?v=33` on `costgrid.html` and `pipeline.html`) copies the version note into the new project's `description` and each mapped task's `taskDescription` into that project task's `description` (`js/api-sync.js` `?v=16` carries both to the API). The copy happens once at generation; the project's descriptions are then independent and editable in `project-config.html` (`docs/pages/project-config.md`). Migration `027_project_descriptions.sql` backfilled existing linked projects once (apply-once, only where the field is empty; task descriptions matched by normalised name against the linked version's tasks). The descriptions feed the topic extraction for team profiles (`docs/api/topics.md`, `docs/api/profile-engine.md`).

## Hardening (2026-09-30)

- **Version routes are scoped to their grid.** `api/src/routes/cost-grids.js` has a router-level guard `router.use('/:id/versions/:vId', requireAuth, versionScope)`: a version that does not belong to grid `:id` (or a non-UUID id) answers `404 { error: 'Version not found' }` on every `/:id/versions/:vId/...` route (PATCH, DELETE, duplicate, structure GET/PUT, linked-projects GET/POST/DELETE, refresh-rate, publish, tags). Order is 401, then 404, then 403 (`canEdit`/`canAccess` stay in the handlers). Automated as `VS-01..VS-16`.
- **`toggleTag` rollback guard.** The error rollback after a failed tag `PUT` is applied only if `this.verId` is still the version the request was sent for; switching version while the PUT is in flight no longer overwrites the other version's tags (closes the open finding; manual case `HD-04`).
- **`skipEmpty` callers.** `js/costgrid.js` (`?v=34`) pushes projects through `_pushProjectToApi(project, { skipEmpty: true })` from `addTasksToProject` and Generate project, so a stale in-memory copy cannot wipe phasing/PTC/planning/groups saved meanwhile from `project-config.html` (which does not pass the option, so clearing a section there still works). A stale copy that holds an older non-empty phasing/PTC/planning/groups, or the `tasks` list that `addTasksToProject` always re-sends, is still last-writer-wins: unchanged behaviour, accepted in spec D6. See `js/api-sync.js` (`?v=19`).

## Money formatting and the currency-change modal (2026-10-01, money centralization cycle)

Per-task PTC: `moneyInput` on focus and `parseMoneyInput` (`window.parseMoney` with the draft currency) on every keystroke instead of `parseFloat` (a typed `150,75` was truncated to 150); totals and autosave still follow each keystroke. `phasingFmtAmount` uses `formatMoney(..., { rounded: true })` and the role-rate preview in the currency-change modal formats both columns with `formatMoney` per currency. **Regression found in manual testing and fixed the same cycle:** the refactor had removed the `newEntry` lookup that the modal's confirm handler still read, so confirming a currency change threw `ReferenceError: newEntry is not defined` and the modal's `hidden.bs.modal` handler then reverted the currency; the handler now looks the rate up inline, and `js/lib/costgrid-currency-change.test.js` extracts `onCurrencyChange` from the page and runs it against stubs (modal opens with both formats, confirm applies currency + admin rate + autosave, cancel reverts, no-roles path). Tip: the browser caches the unversioned `.html` pages, so a fix to an HTML page needs a hard reload to be seen.
## Currency menu lock (2026-10-01, project currency lock cycle)

`#cgCurrency` is disabled when `isLocked` (the existing version lock) **or** `versionHasProjects` (a project has been generated from the version), with the title "Currency is locked: a project has already been generated from this proposal." (`js/lib/project-rules.js`); the rest of the proposal stays editable. `versionHasProjects` reads `this.cg` first: "Generate project" pushes into the raw `_cgDraft.linkedProjects` (invisible to Vue) and then reassigns the reactive `cg` (`renderCgVersionTabs`), and `isLocked` stays `false` so a computed that only depended on it never recomputed — found in the browser, fixed, pinned by an assertion in `js/lib/project-rules-guard.test.js`. The server refuses the change too (`docs/api/lib.md`).

## "+ New version" is a full atomic copy (2026-10-01, new-version-full-copy cycle)

`cgCreateNewVersion` (`js/costgrid.js`) used to create the version, then re-send the source's `_cgDraft.phases` to `PUT …/structure` **with the source's task ids**: the server reuses a supplied `taskId` as the task PK, so the PUT failed with `tasks_pkey` (swallowed by a `.catch(console.warn)`), leaving a version with no phase and therefore no `+ task` button. It now flushes the editor with `cgAutoSave(true)` (strict: a failed save aborts with an error in `#cgNewVersionError`, so stale server data is never copied) and calls `POST …/versions/:vId/duplicate` with `{ label }`: one server transaction copies header (incl. the source's `currency_rate` snapshot, client, project name, note, rate card, dates), phases/tasks/task_roles (fresh ids) and tags; always Draft, no pipeline year, no project links; rollback on any failure, so no half-built version. The client seeds the store header-only (`phases: []`) and loads the structure with `cgLoadStructureFromApi`, like `cgCloneGrid`. Tests: `js/lib/costgrid-new-version.test.js` (extracts the function from `js/costgrid.js`), `test-api.js` `ND-01..ND-11`. `js/costgrid.js` `?v=37`, `js/api.js` `?v=8` (`Api.costGrids.versions.duplicate(cgId, vId, body)` now sends a body). "Clone proposal" still does not copy tags (out of scope, unchanged); versions that were already left empty by the old bug are not repaired (one test version on real data).

## Redesign cycle A (2026-10-07): header card, collapsible cards, grid, selection flow, Monthly Phasing

Full visual/behavioral spec: `docs/superpowers/specs/2026-10-07-costgrid-redesign-cycle-a-design.md`. Four-task plan; this page's own stylesheet, `css/costgrid.css?v=1`, is new and loaded only here (tokens only, no hardcoded hex). `js/costgrid.js` moved `?v=39` → `?v=41` across the cycle (Task 2's no-modal new-version flow, Task 4's `cgGenerateProject` bug fix and `onHoursBlur`'s `showInfo` swap); `js/lib/costgrid-calc.js` moved `?v=6` → `?v=7` (new `cgFreeTasksOf`/`cgOfferDetailsSummary`/`cgSectionDefaults`).

**Header card.** The former `.page-title-bar`/`.page-toolbar`/version-tabs row became one `.cg-header` card — see this file's "Version tab switching (editor)" subsection under "Current state" for the no-modal "+ New version" flow and inline version-label rename this introduced.

**Collapsible cards and persistence.** Offer details/Tags/Sharing keep their own `*Collapsed` flags, but now default `isDraft ? open : closed` (`cgSectionDefaults`, `js/lib/costgrid-calc.js`) and persist per-proposal to `localStorage['PDash_cgSections:' + cgId]` (`{od, tags, sh}`, read back in `openVersion()`). This closes a real bug: `PDash_cgCompactHeader` (the grid's "compact columns" toggle) was never actually persisting, because `js/core.js`'s `cleanLegacyStorage()` IIFE runs at script-execution time, before Vue's `data()` ever reads it — the key wasn't in the `keep` Set, so it was wiped on every page load before being read even once. Fixed by adding `PDash_cgCompactHeader` to the literal `keep` Set and widening the filter to a `startsWith('PDash_cgSections:')` exemption (the per-proposal keys can't be enumerated individually, since `cgId` varies).

**Grid.** Sticky first column (`.cg-col-fixed`) on every row type instead of just the header `<th>`; the five always-visible per-role actions (move left/right, change/duplicate role, reset rate, remove column) collapsed into a `.cg-col-menu` ⋮ popover (Vue `Teleport`), with "Remove column" using a second-click-in-menu confirm instead of `showConfirm` (every other destructive action on this page keeps `showConfirm`); custom/missing-rate/assigned-task states became CSS classes (`.is-custom`/`.is-zero`/`.cg-cell-filled`/`.cg-cell-empty`) instead of inline `:style` ternaries and hex; a dashed `.cg-col-placeholder` column replaces the old "No roles added yet" banner row when there are no role columns. `deletePhase` now refuses (via `showInfo`, not just a disabled ✕) when any of the phase's tasks `isTaskAssigned()`.

**Selection / Generate project flow — bug fix.** `selectAllFreeInPhase`, `selectAllFree`, and `cgGenerateProject`'s free-task count all used to check only `cgGetAssignedTaskIds()` (an id-only check) instead of the id+name double-check the Vue `hasFreeTasks` computed and `isTaskAssigned()` already used correctly — so a task assigned only by name alias (no `taskId` match) could be "selected" again or miscounted as free. All three now build on the shared `cgFreeTasksOf(tasks, linkedProjects)` helper (`js/lib/costgrid-calc.js`), which does the id+name check once. New `phaseFreeState(phase)`/`selectAllFreeState()` methods return `{none|some|all}` by comparing `cgFreeTasksOf(...)` against `selectedTaskIds`, driving a single toggle per scope: "Select free (n)" ⇄ "Clear phase" per phase, "Select all free (n)" ⇄ "Clear selection" for the whole draft (`toggleFreeInPhase`/`toggleSelectAllFree`).

**Selection bar — single CTA.** The sticky bottom bar used to render both the "Add to project" (existing-project dropdown + button) and "Create project" controls simultaneously, with no way to express which one the user meant. Replaced with a `addToProjectMode` (`'new'|'existing'`, default `'new'`) two-segment control (`.cg-addmode-seg`): "Existing project" is disabled with a tooltip when the draft has no linked projects yet, and selecting it auto-preselects the dropdown when there's exactly one (`setAddToProjectMode`). Exactly one CTA renders at a time — "Create project" (`confirmAndGenerate`) in `'new'` mode, "Add {n} to project" (`addToProject`) in `'existing'` mode — both disabled with zero tasks selected (the existing-mode CTA also disabled with no project picked). The mode resets to `'new'` every time selection mode is freshly entered (`resyncFromGlobals`, `openVersion`).

**Monthly Phasing — always visible.** The card used to disappear entirely (`v-if="phasingMonths.length"`) when the proposal had no Start/End set. It's now always rendered as its own collapsible card (`.cg-phasing`, header click same affordance as the three section cards, not persisted); with no period it shows "Set Start and End in Offer details to see the monthly breakdown. Values fill in as you add roles and hours." in place of the table and "no period set" in the header in place of the Total/months summary. The Budget row gained a thin proportional bar under each month's amount (`maxMonthAmount` computed, `width: amount/max*100%`).

**Last native dialog removed.** `onHoursBlur`'s invalid-sold-hours message was the one remaining `alert()` on this page; now `showInfo(...)` with the identical text, consistent with every other validation message here.

**Tablet (~1024px).** `.cg-col-fixed` narrows to 220px and `.cg-legend` is hidden below 1024px (`css/costgrid.css`); the offer-summary and selection-bar rows already wrap via their existing `flex-wrap` rules, so no new markup was needed.

**Gate 2 fixes (found only once a human could render the page — no task/review in this cycle could).** Three real gaps the automated build+review process could not catch, fixed directly on the branch before merge:
- The Period+Stage and Client/Ratecard/Currency fields were never actually wrapped in the bordered/shaded box panels the design boards show (spec §3.4 points 3–4) — Task 2 built them as flat Bootstrap rows. Added `.cg-field-box`/`.cg-field-row` (tokens only) to box them as "Period | Stage" and "Client & rates", matching the boards.
- The header's own stage pill reused `js/core.js`'s `pipelineBadge()` — a solid, color-as-background chip meant for secondary badges (Linked projects cards) — instead of the light bg+border+text pill the boards show for this prominent position. Added a local `CG_HEADER_STAGE_STYLE` const (same `var(--pipeline-*-bg/color)` pattern as `pipeline.html`'s `PB_STAGE_STYLE`, see CLAUDE.md's "Pipeline stage" sync list) scoped to this one pill; `pipelineBadge()` itself and its other call site on this page (Linked projects) are untouched.
- Tags (open) rendered every attribute list in a single stacked column instead of the spec's 2-column grid — wrapped in `.cg-tag-groups` (CSS grid, 1 column below 768px) without touching the shared `.tag-group`/`.tag-group__list` classes other pages also use.

**Known, deliberately deferred to a separate future cycle (not a bug in this one):** the native browser controls for the month date pickers (`<input type="month">`), the Stage/Client/Ratecard `<select>` dropdowns, and the Reassign-owner `<select>` all render as plain OS/browser chrome — the design boards (5.11–5.15) show a custom calendar, a custom styled dropdown list, and a searchable people-picker with avatars respectively. The original brief explicitly allowed keeping a plain `<select>` for Reassign as a fallback; it did not flag the same gap for Stage/Client/Ratecard or the date inputs, and nothing in the build process could render the page to catch how far those would look from the boards until a human checked after merge. Matching the boards here means building shared custom form-control components (a date-picker, a styled dropdown-list, a people-picker) — real new scope for its own brainstorm/spec/plan cycle, not a quick restyle. The `#cgRoleSelectModal` ("Add roles") modal's plain `<select>`-era look is unrelated and was already explicitly out of scope per the original brief (§12).

**Code review follow-ups accepted, not fixed this cycle** (see the finish-cycle report for this branch): `openRoleMenuCode`/`removeColumnConfirm` not reset on a version switch (could let a stale armed "remove" fire on the wrong role if the new version happens to reuse a role code); the structure-save API route has no server-side mirror of the new "can't delete an assigned phase/task" rule (client-only guard, consistent with this cycle's "no API changes" scope); the Sharing card's closed-summary avatars go stale after the share modal closes without a version switch; a default new-version label (`v{n+1}`) can collide with an existing label after a Draft is deleted; `hasFreeTasks`/`isTaskAssigned` still duplicate `cgFreeTasksOf`'s matching rule inline instead of calling it; `phaseFreeState`/`selectAllFreeState` duplicate the same none/some/all logic at two scopes with no shared helper.

## Fidelity cycle (2026-10-07): the boards, pixel by pixel, and three custom form controls

Spec: `docs/superpowers/specs/2026-10-07-costgrid-fidelity-design.md` (from the gap report
`docs/superpowers/design/costgrid/2026-10-07-costgrid-fidelity-gap-report.md`, findings G-01…G-28
plus user decisions D1–D4). Follow-up to cycle A above: that cycle built the structure, this one
closes the distance to the boards and replaces the native form controls cycle A left behind — the
item its own "deliberately deferred" paragraph named.

### The three custom controls

`js/cg-controls.js` (`?v=1`, loaded only by this page) defines three presentational Vue components,
registered on the page's app exactly like `share-list`:

| Component | Tag | Props | Emits |
|---|---|---|---|
| `window.CgDatePicker` | `<cg-date-picker>` | `modelValue`, `mode` (`'month'`\|`'day'`), `min`, `disabled`, `placeholder`, `ariaLabel` | `update:modelValue` — `'YYYYMM'` (month) or `'YYYY-MM-DD'` (day), `''` when cleared, **nothing** when the typed text is unparseable |
| `window.CgSelect` | `<cg-select>` | `modelValue`, `options` (`{ value, label, sub?, dot?, disabled?, disabledReason? }`), `disabled`, `locked`, `lockedTitle`, `searchable`, `placeholder`, `ariaLabel`, `width` | `update:modelValue` |
| `window.CgPeoplePicker` | `<cg-people-picker>` | `people` (`{ id, name, email }`), `currentId`, `disabled`, `footerNote`, `label` | `select` with the chosen id |

They hold no business logic. Every existing handler (`onHeaderFieldChange`, `onPipelineChange`,
`onClientChange`, `onRatecardChange`, `onCurrencyChange`, `onTaskDateChange`) is unchanged; thin
adapter methods (`onPeriodChange`, `onStageSelect`, `onClientSelect`, `onRatecardSelect`,
`onCurrencySelect`) write the emitted value and then call them, so each handler still reads the
value back from `this.draft` the way the native `@change` left it. Pure logic lives in
`js/lib/cg-controls-calc.js` (`?v=1`, vitest).

Three things to know before touching them:

1. **Bind the event as `@update:model-value`, hyphenated.** In an in-DOM template (this page has no
   build step) the browser lowercases attribute names, so `@update:modelValue` never matches. Vue's
   `emit()` falls back to the hyphenated handler name for model listeners, which is why the
   hyphenated form works. Do **not** combine `v-model` with an explicit `@update:modelValue` on the
   same component: `emit()` short-circuits on the first match, so only one of the two handlers runs.
2. **The popover mechanism is the role ⋮ menu's**, copied deliberately: `<Teleport to="body">` plus a
   `position: fixed` box computed from the trigger's `getBoundingClientRect()`, recomputed on
   `scroll` (capture) and `resize`, closed on outside `mousedown`, on Escape (restoring focus) and on
   select. That is what keeps a task date picker from being clipped by the horizontally scrolling
   grid. It lives in one `cgPopover` mixin inside the file — do not invent a second one.
3. **The Offer-details month pickers bind `draft.startDate`/`draft.endDate` directly** (`'YYYYMM'`).
   The old `startDateInput`/`endDateInput` computeds existed only to convert to `<input
   type="month">`'s `'YYYY-MM'` and were deleted with it.

### G-14: why the role headers rendered sand instead of navy

`#cgGridTable` carried Bootstrap's `table` class, whose `.table > :not(caption) > * > *` rule has
specificity (0,1,1) and therefore beat every (0,1,0) per-cell rule in `css/costgrid.css` —
`.cg-role-col-header { background: var(--brand-navy) }` among them. The class is gone
(`<table class="cg-grid mb-0">`) and the handful of base rules the grid actually relied on
(`border-collapse`, cell padding, `vertical-align`) are carried over **as
`:where(.cg-grid) :where(th, td)`**. `:where()` contributes nothing to specificity, so the base layer
sits at 0 and every per-cell class wins without `!important`. The row-level rules
(`:where(.cg-task-row) > :where(td)` and friends) are written the same way for the same reason.
Writing these as ordinary descendant selectors would recreate the exact bug they replace.

### What else changed

- **Header card:** Save/Clone/Export XLS/Share and the back link are one white `.cg-btn-secondary`
  family; the only magenta button is the single state action (Publish to SIP / Generate project).
  The row-1/row-2 hairline is gone, the stage pill lost its border (`CG_HEADER_STAGE_STYLE` no longer
  carries a `border` key), and outside Draft the tray shows an inert "New version" segment with a
  padlock plus the note "Published · versions locked after Publish to SIP" — a visual statement of
  cycle A's existing rule, not a change to it.
- **Offer details:** the closed summary stacks an uppercase micro-label above a bold value in three
  hairline-separated groups with "Edit" vertically centred at the far right; the Owner row reads
  `Owner: **name**  Created: **Oct 4, 2026**` with the Reassign trigger right-aligned; the Ratecard
  field gained the hint "Optional · filtered by client"; every control is one ~36px height.
- **The Reassign footer note from board 5.15 is deliberately NOT rendered.** The spec made it
  conditional on the backend actually doing what it claims. It does not:
  `PATCH /api/cost-grids/:id/reassign-owner` (`api/src/routes/cost-grids.js`) DELETEs the previous
  owner's `'owner'` `resource_shares` row and creates no replacement share for them — only the *new*
  owner gets editor grants on the linked projects. The line would be false, so it is omitted rather
  than reworded into another unverified claim. If the backend ever grants the outgoing owner an
  editor share, pass `footer-note="…"` to the component and the note appears.
- **Grid:** fixed column 225px (the former 220px tablet override is dropped — one width above the
  mobile breakpoint), Description 150px, totals columns ~95/75/50/70px, a ~65px header row with a
  2-line clamped role name, an ellipsised code and the ⋮ as a bordered 24px square button at the
  cell's top-right. "Compact columns" moved out of the "Phase / Task" cell into a toggle switch in
  the grid-card header (same `compactHeader` state and persistence). Copy: "Totals by role" /
  "Hours by role" / "Fees by role", "Total cost & fee", "Pass-through", "Hrs", "Fees",
  "+ Add task", "Add roles". Task names are single-line bordered bold inputs, descriptions are
  borderless two-line fields with no resize handle, "In {project}" is a short grey pill with a link
  icon, hours and PTC are bordered boxes that go bold with a darker border when filled.
- **Monthly Phasing:** the budget bar is navy on the light-grey track (was magenta).
- **Add-roles modal** (`#cgRoleSelectModal`, same id, same handlers): SVG icons instead of the three
  emoji titles, a magnifier search box, group filters as pill chips with "All" first and magenta
  active, rows of checkbox + bold name + muted code + a right-aligned rate pill, the footnote
  "Roles already in the grid are disabled.", and "Add selected" disabled until something is checked
  (`roleSelectionCount`, refreshed by `refreshRoleSelectionCount` — the checkboxes are still plain
  DOM inputs read back by `cgAddSelectedRoles()`).
- **No hex, no emoji** anywhere from `#costGridEditorSection` to the end of the file, including the
  JSON-viewer/Clients/Confirm modals, the autosave toast and the currency-change modal built in JS.
  `js/lib/costgrid-guard.test.js` pins it, together with the `?v=` references and G-14's class swap.
- **`scripts/shoot.mjs --eval` / `--eval-file` / `--eval-settle`** were added in the same cycle so the
  interaction-dependent states (an open picker, the role menu, the modal) can be captured and
  compared at all — the gap that produced cycle A's Gate 2 surprises. See `CLAUDE.md` and
  `PROCESS.md` §6.6.

**Deferred, stated so it cannot resurface as a Gate 2 surprise:** portrait tablet inherits the
mobile layout, which does not exist for this page yet, so it is deferred together with the
smartphone cycle (D1/D4). Verified widths are 1440 / 1024 / 768 only.

### Render-vs-board pass (Task 7, 2026-10-07)

Captured with `scripts/shoot.mjs` against an isolated `scripts/test-branch.sh` stack — **not**
`http://localhost`, which serves the main checkout (`docker-compose.yml:100` mounts `./` of the
directory the stack was started from, so a worktree's edits are invisible there). Interactive
states came from `--eval-file`; because the popovers close on `mousedown`, two that do not overlap
on screen can be opened in one capture.

Ten deviations were fixed in a follow-up commit: the full-width Proposal name field, the Ratecard
trigger label ("— None (use global role rates) —", so the control and the closed summary agree),
the month-picker footer on one line, the magenta border while a popover is open (`.cg-ctl--open`,
not only `:focus-within` — a searchable list moves focus into its own search box), the magenta
tint + magenta checkbox on a selected task row, the magenta (was green/yellow) selection-bar CTAs,
`EUR/h` instead of the currency symbol in the Add-roles rate pill, the no-roles placeholder column
(one continuous column taking each row's own look, instead of a per-cell dashed outline that
rendered as a stack of boxes), the English phase-band date range, and the G-15 width trim below.

**`cgFmtMonth` formatted with `'it-IT'`** (`js/costgrid.js`), so the phase band read
"11 mag 2026 – 31 dic 2026". Pre-existing, not introduced by the redesign; now `'en-GB'`, per the
English-only constraint.

**G-15 is only partially met, by measurement.** Target: 5-6 role columns visible at 1440. Measured
before: fixed column 323px, Description 150, totals 128/77/69/112, role columns 130 → **2 of 10
visible**. After trimming the role-header cap to 112px, the totals columns' side padding, the TOTAL
row's font and the task date pickers (112 → 84px): table scroll width 2030 → 1853px, **3-4 role
columns visible**. The sticky first column stays at **323px** and is the remaining blocker: probing
it in the browser (`min-width:1px !important`, emptying each cell in turn) showed the floor comes
from the phase-header and task-header cells, but neither narrowing the date pickers nor removing
the `<input>` intrinsic contribution (`width:1px`, `width:100%`) moves it — the column absorbs the
freed space instead. Reaching the board's density needs the task cell restructured (or a
`table-layout`/explicit-`<colgroup>` approach), which is a cycle of its own. The boards themselves
show only 2 role columns, with shorter role names and amounts without cents.

**Accepted, not changed** (recorded so they are not re-found as bugs): Reassign avatars are navy
with white initials and the current-owner row is grey-tinted, where the board has light-grey
avatars and a magenta row; the grid card header has no leading icon and no "Missing rate (0)"
count (neither is in G-01…G-28); at 1024px the collapsed Offer-details summary wraps and "Edit"
drops to its own line; the day picker keeps a fixed 6-week height, so a 5-week month leaves a gap
below the grid (variable height would move the popover between months and is pinned by
`dayGridMonth`'s tests); the phase "Select free (n)" pill is magenta where the board is amber and
"Select all free (n)" is a button where the board has a link; the grid's horizontal scrollbar
could not be verified from a render at all (headless Chrome does not paint overlay scrollbars) —
`overflow-x: auto` is set, so this is a Gate 2 manual check, not a code change.

**Open, deliberately not fixed here:** a **disabled `.btn-primary` renders Bootstrap blue**, because
`css/style.css`'s `.btn-primary` block overrides `--bs-btn-bg`/`-hover`/`-active` but not
`--bs-btn-disabled-bg`/`--bs-btn-disabled-border-color`. Visible on this page as the greyed-out
"Add selected" in the Add-roles modal, where board 5.16 shows pale magenta. It is app-wide and
fixing it means bumping `style.css`'s `?v=` on every page, so it belongs to its own cycle.

### Gate 2 findings (2026-10-07)

**`cgSyncHeaderFromForm()` silently reset the whole header on every autosave.** The
function (`js/costgrid.js`) read the header fields back out of the DOM by id, which was
right while the editor was vanilla. This cycle replaced six of those native controls with
`<cg-select>`/`<cg-date-picker>`, so `#cgPipeline`, `#cgCurrency`, `#cgClientId`,
`#cgRatecardId`, `#cgStartDate` and `#cgEndDate` no longer exist — `getElementById`
returned `null` and each `|| default` fallback wrote a default back into `_cgDraft` on
*every* `cgAutoSave()`: stage → `SIP`, currency → `EUR`, client → `__unassigned__`,
ratecard → `null`, period → empty. The reported symptom ("the Stage dropdown will not
change value") was only its most visible facet; measured on a populated proposal, one
autosave also wiped the client and both period months. The header now comes from
`_cgDraft`, which the Vue instance already keeps current (`this.draft` **is** `_cgDraft`,
`costgrid.html:1319`) — `#cgProjectName`/`#cgNote` are `v-model`-bound and the custom
controls write through the `on*Select`/`onPeriodChange` adapters. `costgrid-guard.test.js`
now fails if any `getElementById` reappears in that function.

**The Start pickers had no upper bound.** Only the To/End pickers carried `:min`, so a
Start could be *picked* after the End — against §1.2's "the picker prevents choosing an
invalid value". `CgDatePicker` gained a `max` prop (both pure helpers already supported
it) and the Offer-details Start month and the task From field are now capped by their
own End value. Validation of a **hand-typed** out-of-order date remains deliberately out
of scope (D2 → the "cycle C dates" backlog item, which plans the check app-wide, server
and UI).

### Code review rounds (2026-10-07, same cycle)

Three rounds, all on the same theme once the Gate 2 fixes were in: the parts of the editor
the control swap did *not* reach.

**The teleported popovers were unreachable by keyboard.** All three controls put their
popover in `<Teleport to="body">`, so Tab order never walks into it: the `keydown` handlers
written on the listbox and on the calendar grid could never fire. A non-searchable
`<cg-select>` opened with Space accepted nothing but Esc — a regression against the native
`<select>` it replaced, and against the spec's "All keyboard-operable". A listbox with no
search box now focuses itself; the calendar button is back in the tab order (it had
`tabindex="-1"`) and moves focus to the selected cell. Clicking the date text input
deliberately still keeps focus there, or the typed `dd/mm/yyyy` path would break.

**`activeIndex` indexed a list that shrinks.** It was set once when the popover opened,
against the *unfiltered* options; typing in the searchable Client picker then left it
pointing at an unrelated row (Enter picked the wrong client) or past the end (Enter did
nothing). A `query` watcher re-anchors it.

**`isReadOnly()` replaced a half-applied viewer guard.** `isLocked` is `cgGetVersionLockState`
and knows nothing about sharing, so the swapped controls spelled out
`isLocked || myPermission === 'viewer'` while the grid inputs around them kept a bare
`:disabled="isLocked"`. One computed now covers both. The server already refused a viewer's
writes (`routes/cost-grids.js:89` allows owner and editor only), so the grid merely *looked*
editable while autosaves failed silently — which is also why the remaining gap below matters.

**Smaller:** the role-modal checkboxes are plain DOM inputs Vue does not own, so ticks
survived an Esc dismissal and filtering the list discarded checked rows while the counter
still counted them; both are reconciled on open and in watchers. The ratecard "None" row
claimed EUR on a non-EUR proposal. `.cg-role-col-header` declared `position: sticky` and
then `relative` in the same rule, so the role headers were never sticky — inert only while
`.cg-grid-frame` has no height.

**A trim that had to move.** The first Gate 2 fix normalised `projectName`/`note` inside
`cgSyncHeaderFromForm()`, i.e. on the debounced autosave path — but that function mutates
the object Vue binds to the inputs, and the 2 s debounce is also kicked by unrelated
controls, so a trailing space typed into Description could vanish mid-edit. Trimming
happens in `onHeaderFieldChange` (which runs on blur) instead.

### Open follow-ups

- **A viewer can still perform structural edits.** Every structural control is gated on
  `v-if="!isLocked"` alone: Add roles, Add phase, the role ⋮ menu, + Task, Delete phase,
  Delete task, the "+ Add task" row, the selection bar and Generate project. A viewer on an
  unlocked version can delete a task: the local draft mutates, the row disappears, the PUT is
  refused, and `cgAutoSave`'s `.catch(e => console.warn(...))` swallows it — so the edit looks
  like it stuck until a reload. Note `js/lib/cg-controls-ui.test.js`'s "one read-only predicate
  for every editable field" only asserts the absence of `:disabled="isLocked"`; it does **not**
  cover these `v-if` paths, and its name overstates what it checks.
- **Four global listeners per picker instance** (`cgPopover.mounted`): document `mousedown`
  and `keydown`, window `scroll` in capture and `resize`. Two pickers per task row means
  ~500 listeners on a 60-task grid, with the capture-phase scroll handler invoked once per
  instance on every scroll. A single shared dispatcher keyed on the open popover would fix it;
  the role ⋮ menu this was modelled on had exactly one instance, so the pattern did not scale.
- **`Home`/`End` `preventDefault()` unconditionally** in `onListKey`, including when focus is
  in the search box: in the Client picker the caret will not jump to the start of the query.
- **`commitTyped` ignores `min`/`max`** — the component accepts typed what its own picker
  refuses. Assigned to the "cycle C dates" backlog item, together with item 11 (task dates
  bounded by the project/proposal months).
