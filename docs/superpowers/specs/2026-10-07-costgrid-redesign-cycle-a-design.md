# Cost Grid redesign (cycle A of 2: desktop + tablet) — design

Date: 2026-10-07. Type: evolution (Scenario 2), UI redesign page cycle. Source: brief `docs/superpowers/design/costgrid/2026-10-07-costgrid-brief.md` (all sections), boards in the same folder (5.11–5.21, `5-18-*`, `mobile-view-*`). Decisions taken in this cycle's `/brainstorming` (below) prevail over the brief's own "da confermare" rows (§10) where they disagree. Smartphone layout (brief §7, smartphone part) is **cycle B**, a separate spec/plan.

## Goal

Restyle `costgrid.html` (desktop + tablet) to the 5.17–5.21 boards: one header card replacing the title bar/toolbar/version tabs, three collapsible cards (Offer details/Tags/Sharing) with per-proposal persistence, a redesigned grid (sticky first column on every row, role actions collapsed into a ⋮ menu, custom/missing-rate/assigned-task states as classes), a reworked task-selection flow (single CTA, New/Existing segmented control), and a Monthly Phasing card that stays visible with no period set. Same Vue app, same bridge, same business rules — only two small rule changes and one bug fix, all listed below.

## Decisions taken in this cycle's brainstorming

These resolve the brief's §10 "da confermare" rows and one undocumented gap; they are the rulings this design follows (brief text is reference material, not the final word, where it disagrees):

1. **"+ New version" stays hidden outside Draft** (brief §10 #3, code wins) — versions can only be created/deleted while the proposal is in Draft, by design; nothing changes there.
2. **"+ New version" drops its name modal.** Today it opens `#cgNewVersionModal` (a single "version label" field, `costgrid.html:548`, `openNewVersionModal` at `:1346`) before creating the version. This has no board and no usable mobile shape. Resolution: follow the same pattern as the 2026-10-07 "New Proposal/Clone without a modal" cycle — clicking "+ New version" creates immediately with a default label (`v{n}`, `n` = `cg.versions.length + 1`), selects the new tab, and the label becomes editable **inline**, the same click-to-edit affordance already used for `phase.phaseName` (`costgrid.html:286`). `#cgNewVersionModal` and `openNewVersionModal`/`cgCreateNewVersion` (name-prompt path) are removed.
3. **Delete phase with assigned tasks is newly blocked** (brief §10 #4): a phase containing any task that `isTaskAssigned()` reports true for cannot be deleted. `deletePhase` refuses via `showInfo` (not just a disabled ✕), so a direct call can't bypass it.
4. **The name field keeps its current label, "Proposal name"** (brief §10 #5) — only the board says "Project name"; `draft.projectName` and its label are unchanged.
5. **Remove column uses the second-click-in-menu pattern** (brief §10 #6), replacing `showConfirm` for this one action only; every other destructive action (`deletePhase`, `deleteTask`, `deleteVersion`) keeps `showConfirm`.
6. **Drive-by fix: `PDash_cgCompactHeader` never actually persisted.** `core.js`'s `cleanLegacyStorage()` IIFE (`js/core.js:1-8`) runs at script-execution time, before Vue's `data()` reads `localStorage.getItem('PDash_cgCompactHeader')` inside the `DOMContentLoaded` handler — the key isn't in its `keep` Set, so it's wiped on every load before it's ever read. Fixed in the same edit that adds the new `PDash_cgSections:*` prefix to `keep` (§3).

## Current behaviour (verified in code)

- `costgrid.html:28-45`: `.page-title-bar` (bare `<h4>`) + `.page-toolbar` (Delete version / Publish to SIP / New version, all Draft-only; Clone; Share, non-Draft; Export XLS; Generate Project, non-Draft+unlocked+`hasFreeTasks`; Save).
- `:47-56`: version tabs, `v-if="cg.versions.length > 0"`, `versionTabLabel`/`versionTabTitle` (`:1011-1020`) add a lock-icon emoji and linked-project count to the plain label.
- `:58-69`: lock/Draft banners, inline hex (`#ffc107`, `#f8f9fa`, `#adb5bd`).
- `:74-205`: three `.section-card` blocks (Offer details, Tags, Sharing), each with a clickable `.section-header` toggling a `*Collapsed` data flag (`offerDetailsCollapsed`/`tagsCollapsed`/`sharingCollapsed`), all plain booleans, no persistence, reset to `false` in `openVersion()`. `offerDetailsSummary` (`:765-768`) is one interpolated string.
- `:92-139`: Offer details open form — Owner+Reassign row, Project name / Start / End / Currency / Pipeline stage in one `row g-2`, then Client / Ratecard in a second row. Order today is **name+dates+currency+stage, then client+ratecard** — not the brief's Client→Ratecard→Currency order.
- `:207-368`: grid card — legend-less header (just "📊 Cost Grid" + Add role/Add phase), outer `div[style="overflow:auto;max-height:calc(100vh - 300px)"]`, `<table id="cgGridTable">`. Summary rows (`:219-250`) use `--sand-*` vars and hex (`#888`,`#444`,`#fff0f0`,`#ffe58f`…). Role header (`:263-277`) always shows Move left/right + change/dup/remove inline; `compactHeader` (`:255`, `PDash_cgCompactHeader`) only hides the code/buttons, doesn't change sticky behaviour. First column (`Phase/Task`, `:252`) is `position:sticky;left:0` only on `<th>`; phase/task/tfoot rows are not sticky.
- `:282-353`: phase row has inline ✕ (`deletePhase`, always enabled) and, in selection mode, a "☑ free" link calling `selectAllFreeInPhase` (add-only, id-only check — see bug below); task row has a checkbox in selection mode (`isTaskAssigned(task)` id+name check, correct) and an inline ✕ for unassigned tasks (no lock icon, no "In {project}" badge — `linkedProjectDisplay` data exists but isn't surfaced per-task).
- `:371-387`: sticky selection bar — "{n} tasks selected" + "☑ All free tasks" (`selectAllFree`, same id-only bug) on the left; on the right, **both** CTAs always rendered together: the Existing-project dropdown+"＋ Add to project" button (only if `linkedProjects.length`) and "▶ Create project", with no segmented switch between them.
- `:390-417`: Monthly Phasing, `v-if="phasingMonths.length"` — disappears entirely with no period set.
- Bug (brief §5, round-3 finding, `docs/superpowers/reports/2026-09-16-…-generate-program-finish-cycle.md`): `selectAllFreeInPhase` (`:1304-1309`), `selectAllFree` (`:1310-1315`), and the free-task count in `cgGenerateProject` (`js/costgrid.js:1029-1030`) check only `cgGetAssignedTaskIds()` — not names, and not `taskName?.trim()` — unlike the Vue `hasFreeTasks` computed (`:755-762`) and `isTaskAssigned` (`:1255-1259`), which correctly check both. `js/lib/costgrid-calc.js:1-11` already has a correct, pure `versionHasFreeTasks(ver)` (id+name, used today only by `isVersionCommittedLocked`) that none of the three buggy call sites reuse.
- `js/core.js:1-8`: `cleanLegacyStorage()` keep Set = `{PDash_summary, PDash_browserNotifDisabled, PDash_sidebarCollapsed}` — `PDash_cgCompactHeader` is not in it (see Decision 6).
- `js/lib/costgrid-calc.js` exports (bridged to `window`): `versionHasFreeTasks`, `isVersionCommittedLocked`, `resolveRoleRate`, `cgComputeTaskTotals`, `cgComputePhaseTotals`, `cgComputeGrandTotals`, `cgComputeColumnTotals`, `stripCloneTaskIds`, `findExistingProgramForProposal`, `cgApiClientId`. No vitest file for this module yet (checked: none found).
- Current versions: `css/tokens.css?v=9`, `css/style.css?v=21`, `js/core.js?v=11`, `js/costgrid.js?v=39`, `js/lib/costgrid-calc.js?v=6`. No `css/costgrid.css` exists yet.

## Design

### 1. Files and boundaries

| File | Change |
|---|---|
| `costgrid.html` | Header card, collapsible cards, grid markup/menu, selection bar, Monthly Phasing — restyled per §2–§7 below; new Vue data/computed/methods (§8); `#cgNewVersionModal` removed; `css/costgrid.css?v=1` link added; `tokens.css`/`style.css` refs bumped only if their own content changes (they don't here — refs stay `?v=9`/`?v=21`). |
| `css/costgrid.css` (new, `?v=1`) | All new `.cg-*` classes: header, collapsible cards, grid (sticky column, role menu, state classes), selection bar, modal restyle, tablet media query. Tokens only, no hex. |
| `js/costgrid.js` (`?v=39` → `?v=40`) | `cgGenerateProject`'s free-task count switches to `versionHasFreeTasks`/a shared helper (§8.3); `openNewVersionModal`/`cgCreateNewVersion` removed, replaced by `cgCreateNewVersionDirect()` (no modal, §8.1). |
| `js/lib/costgrid-calc.js` (`?v=6` → `?v=7`) | New pure helpers: `cgOfferDetailsSummary`, `cgFreeTasksOf` (shared by the three bug-fixed call sites), `cgSectionDefaults`. See §8. |
| `js/core.js` (`?v=11` → `?v=12`) | `keep` Set gains `PDash_cgCompactHeader` (Decision 6) and the `PDash_cgSections:` prefix is handled by a startsWith check (keys are per-proposal, see §3.2) — `cleanLegacyStorage` extended, not the Set alone. |
| `js/lib/costgrid-calc.test.js` (new) | Unit tests for the new pure helpers. |
| `CLAUDE.md`, `docs/pages/costgrid.md` | Docs (§10). |

Not touched: API routes, `js/api-sync.js`, `js/shares.js`, `js/share-list-component.js` (read-only consumer, §4.4), `js/tags.js`, `css/tokens.css`, autosave/lock/permission logic, rate resolution, Monthly Phasing's calculation, `#cgRoleSelectModal`/`#cgCreateProgramModal`/`#cgProjectNameModal`/`#cgAddToProjectModal`/`#cgCloneModal`/`#confirmModal` (restyled only, same markup IDs and JS hooks).

### 2. Header card (replaces `.page-title-bar` + `.page-toolbar` + version tabs)

Single `.cg-header` card:

- **Row 1:** `cg.name` (21px/800) · subtitle "Cost Grid · Client: {client} · {n} linked project(s))" or "No linked projects" (reuses `linkedProjectDisplay`/client name already in scope) · stage pill right-aligned (existing stage-token colors; Draft pill unchanged).
- **Row 2 left:** `.cg-version-seg` — "+ New version" segment, `v-if="isDraft"` (Decision 1), `@click="createNewVersionDirect"` (Decision 2, no modal); then one segment per version (`versionTabLabel` minus the lock emoji — lock state moves to a small SVG icon + `versionTabTitle` tooltip, kept), active segment navy-filled; the active segment's label is click-to-edit (same affordance as phase name, writes `v.versionLabel`, triggers `cgScheduleAutoSave`).
- **Row 2 right:** Save (`saveVersion`, same double-submit guard), Clone (`cloneProposal`, `proposalBusy`), Export XLS (`exportXls`), divider, then exactly one primary action:
  - `isDraft` → "Publish to SIP" (`publishDraft`);
  - `!isDraft && !isLocked && hasFreeTasks && !selectionMode` → "Generate project" (`generateProject`);
  - `selectionMode` → same button, disabled, text "Selecting tasks…";
  - `!isDraft && !hasFreeTasks` → plain muted text "All tasks are in projects" (no button).
  - Share (`openShareModal('cost_grid', cgId, cg.name)`), `v-if="!isDraft"`, placed after Export XLS as a secondary (outline) button — unchanged visibility/handler.
  - Delete version moves out of this row into the Draft banner (§2 below), `v-if="isDraft"`, same `deleteVersion` handler.
- **← Pipeline** (`goBack`, `backSaving`) stays as a plain link above the card, unchanged.
- Lock/Draft banners (today `:58-69`) keep their conditions (`isLocked` / `isDraft`) and content, restyled with `--color-warning-bg`/`--surface-light` tokens and an inline SVG icon instead of 🔒/✏️; the Draft banner's right side gains the "Delete version" text link (red, `--color-danger-text`).

### 3. Collapsible cards (Offer details / Tags / Sharing)

**3.1 Collapse state and persistence.** `offerDetailsCollapsed`/`tagsCollapsed`/`sharingCollapsed` stay as data flags, but:
- Default on `openVersion()`: `isDraft ? false : true` for each, instead of the current unconditional `false`.
- A `watch` (or an explicit call at the end of the three toggle handlers) persists `{od, tags, sh}` to `localStorage['PDash_cgSections:' + cgId]` as JSON; `openVersion()` reads it back (`JSON.parse`, guarded) and overrides the default when present and valid.
- `js/core.js`'s `cleanLegacyStorage` keeps per-proposal keys alive: since the key includes `cgId`, the exact-match `keep` Set approach doesn't scale — change the filter to `k.startsWith('PDash') && !keep.has(k) && !k.startsWith('PDash_cgSections:')`. `PDash_cgCompactHeader` is added to the literal `keep` Set (Decision 6).

**3.2 Header.** Each `.cg-section-header` becomes `role="button" tabindex="0" :aria-expanded="!xCollapsed"`, `@click`/`@keydown.enter`/`@keydown.space` toggle; chevron is an inline SVG rotated via a CSS class instead of the `▶`/`▼` glyphs; right-aligned muted label: closed → "Edit" (Offer details/Tags) or "Manage" (Sharing), open → "Collapse".

**3.3 Offer details, closed.** `offerDetailsSummary` becomes a computed **object** (not a string): `{ period, stage, client, ratecard, currency, owner }`, each a display string with the existing "Not set"/"Unassigned"/"— None —" fallbacks already used in the open form. Rendered as three label/value groups (Period+Stage | Client+Ratecard+Currency | Owner) separated by a vertical rule, `flex-wrap` under 1200px.

**3.4 Offer details, open.** Reordered to match the board, logic unchanged:
1. Owner/Reassign row — unchanged markup, restyled; `<select>` kept (brief allows it), not replaced with the searchable dropdown (out of scope, §9).
2. Proposal name field — same `draft.projectName` binding, label stays "Proposal name" (Decision 4).
3. Period (Start/End, `type="month"`, unchanged inputs — brief §10 #1 keeps month granularity) | Stage box, side by side, 280px stage box.
4. **Client → Ratecard → Currency** row (brief's fixed order, moved from today's Name-row+Client-row split): Client select + "+ New"; Ratecard select (unchanged `filteredRatecards`, depends on `clientIdInput` so stays after Client); Currency select, **unchanged** disabled/tooltip logic (`currencyLocked`/`currencyLockTitle`, brief §10 #2 — code wins, no ratecard-derived auto-currency), "1 EUR = x" line kept below when non-EUR.
5. Description (`draft.note`), unchanged.
6. Linked projects cards (`linkedProjectDisplay`), unchanged, moved to the bottom of the open card (already there today).

**3.5 Tags.** Closed: pills "{list.name} · {item labels}" per list with any selection, or "None selected" when `versionTagItemIds` is empty across all lists (computed from existing `attributeLists`/`versionTagItemIds`). Open: unchanged `.tag-group`/`.tag-pill` markup, only visual tokens change.

**3.6 Sharing.** Closed: stacked avatar circles (initials, max 4 + "+n") + "{n} people · you are {role}" (`owner`/`editor`/`viewer`, from `cg.myPermission` plus owner check). Data source: a dedicated `loadShareSummary()` method calling `Api.shares.list('cost_grid', cgId)` once per `openVersion()` (brief's preferred option — `js/share-list-component.js` is not touched, no new event). Open: unchanged `<share-list>`.

### 4. Grid (`#cgGridTable`)

**4.1 Container.** Drop `max-height: calc(100vh - 300px)` + inner scroll (the outer `<div style="overflow:auto;...">` loses its `max-height`, keeps horizontal `overflow-x:auto`); the page scrolls instead.

**4.2 Sticky first column.** `.cg-col-fixed` applied to the first `<td>`/`<th>` of every row type (header, rate row, phase row, task row, add-task row, tfoot): `position:sticky; left:0; z-index` tiered per row type (header highest), opaque background matching that row's own background token, 1px right-edge shadow via `box-shadow`. Width 280px (`min-width`) desktop, overridden to 220px at the tablet breakpoint (§7).

**4.3 Grid card header.** "Cost Grid" title; inline legend — three `.cg-legend-item`s (Custom rate swatch, Missing rate swatch, Task-in-a-project icon), `v-if="!selectionMode"`; Compact columns toggle (same `compactHeader`/`PDash_cgCompactHeader` state, now actually persisting — Decision 6); "Add roles"/"+ Add phase", `v-if="!isLocked && !selectionMode"` (today they're `!isLocked` only — selection mode hiding them is new per brief §4, "In selezione Add roles e + Add phase spariscono").

**4.4 Summary row.** Unchanged `summaryCollapsed` toggle; labels become "Hours by role"/"Fees by role" (was "Total Hrs/Fee by Role"); row restyled with `--surface-light`/`--surface-medium` instead of `--sand-*`/hex. `v-if="!selectionMode"` default to collapsed is **not** changed automatically by entering selection — brief says "in selezione parte chiusa"; implemented as: entering selection mode (`cgGenerateProject`/global `_cgSelectionMode = true`) sets `summaryCollapsed = true` once, same as today's existing toggle, no new persistence.

**4.5 Rate row.** First cell: currency badge (unchanged `draft.currency`) + "Hourly rates" label (was bare). Role cells: `.is-custom` / `.is-zero` modifier classes replace the inline `:style` ternaries (`rateIsCustom`, `!r.rate`); "Custom · reset {baseline}" replaces "✎ custom" as a clickable link invoking the existing reset logic (`role.rate = roleBaseline(r).effectiveRate; role.rateIsCustom = false; cgScheduleAutoSave()`); "Missing rate" replaces "⚠️ 0". Column header for a zero-rate role also gets `.is-zero` (danger-text background) instead of inline `#7f0b0b`.

**4.6 Role column header + ⋮ menu.** Header shows role name (2-line clamp), muted code (hidden when `compactHeader`), and a `.cg-col-menu-btn` (⋮, 24px) replacing the five always-visible inline actions. Menu component (`.cg-col-menu`, a small Vue-rendered popover, `v-if="openRoleMenuCode === r.roleCode"`):
- Header: role label, code, `colTotals[r.roleCode]?.hrs || 0` + "h planned".
- Move left / Move right (`moveRole(r, ∓1)`), disabled at the array edges — unchanged logic.
- "Change role…" / "Duplicate with another role…" (`changeRole`/`duplicateRole`) — unchanged, open `#cgRoleSelectModal`.
- "Reset rate to {baseline}" — `v-if="r.rateIsCustom"`, same reset logic as §4.5's link.
- "Remove column" (danger) — **two-click pattern** (Decision 5/brief #6): first click sets `removeColumnConfirm = r.roleCode` and re-renders the same menu item as "Click again to remove · {hrs}h across all tasks will be deleted" (`hrs` from `colTotals`); a second click on it runs today's removal body (`draft.roles = draft.roles.filter(...)`, delete `hours[code]` from every task, `cgScheduleAutoSave()`) without the `showConfirm` call. Clicking anything else, or reopening the menu, resets `removeColumnConfirm`.
- Positioning: rendered via Vue `Teleport` to `document.body`, `position: fixed`, computed from the button's `getBoundingClientRect()` on open (recomputed on scroll/resize while open). Closes on outside click, `Escape`, and on the grid container's `scroll` event.
- `v-if="!isLocked && !selectionMode"` gates the ⋮ button itself (today's actions are already hidden when `isLocked`; selection-mode hiding is new, matching §4.3).

**4.7 No-roles state.** Replaces the current "No roles added yet…" row: a single dashed 260px-wide placeholder column (`.cg-col-placeholder`) spans the header ("+ Add roles" button, calling `addRoleColumn`) through every row type (phase/task cells show "Add roles to estimate hours for each task." in task rows, nothing in phase rows); totals show "—" (already the case via `grand.hrs > 0` checks — no logic change, just the removed banner row).

**4.8 Phase rows.** Unchanged navy band, inline-editable name, "+ Task" pill, totals, `phaseDatesLabel`. ✕ delete: `:disabled` and tooltip "Can't delete: this phase has tasks linked to a project" when `phase.tasks.some(isTaskAssigned)` (Decision 3); `deletePhase()` itself gains the same guard before its `showConfirm` call, returning via `showInfo(...)` if any task is assigned. `v-if="selectionMode"` swaps "+ Task"/✕ for the "Select free (n)" / "Clear phase" toggle (§5).

**4.9 Task rows.** Fixed cell unchanged (name input + ✕ for free&unlocked tasks) except: assigned tasks (`isTaskAssigned(task)`) now show a lock icon (SVG, tooltip "Linked to a project: it can't be deleted") in place of the ✕, plus a new "In {project name}" badge line under the name — project name resolved the same way `linkedProjectDisplay` resolves it (`draft.linkedProjects[].taskIds`/`taskNames` lookup; a small helper `taskAssignedProjectName(task)` added as a Vue method, not a global, since it only needs `this.draft`). Dates/description/PTC/hours cells: unchanged bindings, restyled (filled value = bold + darker border, via `.cg-cell-filled`; empty = "—" via `.cg-cell-empty`, replacing the inline `color:#bbb`). "+ Add task" row restyled, same handler. `tfoot` TOTAL row: `.cg-row-total` class replaces the `--indigo-*`/hex inline styles.

### 5. Task selection / Generate project flow

**5.1 Grid in selection mode.** Checkbox styling (`.cg-select-checkbox`, 18px) unchanged binding (`isTaskAssigned(task) || selectedTaskIds.has(task.taskId)`, disabled when assigned); selected free row gets `.is-selected` (magenta-tint background, replacing none today — today only the checkbox state shows); assigned row gets `.is-assigned` (greyed, muted name) replacing "already assigned" text with the §4.9 "In {project}" badge + a tooltip "Already in {project}" on the disabled checkbox.

**5.2 Phase "Select free" toggle.** New computed per phase, `phaseFreeState(phase)`, returning one of `{ none, some, all }` by comparing `cgFreeTasksOf(phase.tasks, draft.linkedProjects)` (new shared helper, §8.2 — fixes the id-only bug) against `selectedTaskIds`. Label/handler:
- `none` → disabled text "All in projects".
- `some` → "Select free (n)", click adds all free ids in the phase to `selectedTaskIds` (today's `selectAllFreeInPhase`, now built on `cgFreeTasksOf`).
- `all` (every free task in the phase already selected) → "Clear phase", click removes exactly the phase's free ids from `selectedTaskIds`.

**5.3 "Select all free" (top-level).** Same `{none/some/all}` pattern at the draft level: "Select all free (n)" ⇄ "Clear selection", built on `cgFreeTasksOf(allTasks, draft.linkedProjects)` (fixes `selectAllFree`'s bug).

**5.4 Sticky bottom bar.** `.cg-selection-bar` — left: "{n} tasks selected" + the toggle from §5.3. Right: new `addToProjectMode` data (`'new' | 'existing'`, default `'new'`), rendered as a two-segment control:
- "New project" segment — always enabled.
- "Existing project" segment — `:disabled="!draft.linkedProjects.length"` with a tooltip when disabled; selecting it reveals the existing `addToProjectSel` dropdown (preselected when `linkedProjects.length === 1`).
- Divider, Cancel (`cancelSelection`), one CTA: `addToProjectMode === 'new' ? 'Create project' (confirmAndGenerate) : 'Add {n} to project' (addToProject)`, `:disabled` when `selectedTaskIds.size === 0`, or (`existing` mode) `!addToProjectSel`.
- Replaces today's always-both-visible buttons (`:371-387`).

**5.5 Modals.** `#cgProjectNameModal`: adds a "Step 1 of 2" label `v-if="!findExistingProgramForProposal(...) && <partial selection>"` (same condition `cgSubmitProjectName` already evaluates — surfaced as a computed, no logic change) and a task-summary box ("{n} tasks selected · {hrs}h · {amount}" + per-task list) built from `taskTotals`/existing data already in scope; restyle only otherwise. `#cgCreateProgramModal`: "Step 2 of 2" label, two radio **cards** replacing the `<select>` (same `createProgramModal.existingId` binding: `''` ⇄ `'new'` card). `#cgAddToProjectModal`: adds a totals row to the existing task list. All three keep their JS handlers (`submitProjectNameModal`, `saveCreateProgramModal`, `confirmAddToProject`) unchanged.

**5.6 Outcome.** The existing "✓ Project created…" dialog (link to `project-config.html`) stays, emoji removed from its text only (brief §10 #7 — code wins over the board's toast).

**5.7 Fix.** `onHoursBlur`'s `alert(...)` (`:1293`) becomes `showInfo(...)` with the identical message — the one remaining native dialog on this page.

### 6. Monthly Phasing

- `.cg-phasing` card header becomes collapsible (new `phasingCollapsed` data, default `false`/open, **not** persisted — brief doesn't ask for persistence here, only the three Offer-details/Tags/Sharing cards get it) — "Monthly Phasing" + `phasingTotals` summary, unchanged calculation.
- Table unchanged (`phasingByMonth`); Budget row gets a thin proportional bar (`width: value/maxMonthValue*100%`, a `<div>` under the amount, computed inline from `phasingByMonth.amount`, no new global function needed — pure template expression is enough at this scale, or a one-line Vue method if the template gets unwieldy).
- **No period:** card condition changes from `v-if="phasingMonths.length"` to always-rendered; when `phasingMonths.length === 0`, body shows "Set Start and End in Offer details to see the monthly breakdown. Values fill in as you add roles and hours." and the header's total line reads "no period set" instead of the Total/months summary.

### 7. Tablet (~1024px, `css/costgrid.css` media query)

Same page and logic as desktop — no new state, no behavior change:
- `.cg-col-fixed` width 220px below 1024px (and down to the existing nav breakpoint, 768px, since there is no separate "tablet-only" band defined elsewhere in the app — the grid's own container scrolls horizontally regardless).
- Grid-card legend (`.cg-legend`) hidden below 1024px — tooltips on the Custom/Missing/In-project visual cues carry the meaning instead.
- `.cg-offer-summary` (§3.3) and `.cg-selection-bar` (§5.4) wrap via existing `flex-wrap` rules, no extra markup.
- `⋮` menu, modals, and the full flow are unchanged below 1024px.

### 8. Pure functions and shared logic

**8.1 `js/costgrid.js` — `cgCreateNewVersionDirect()` (replaces `openNewVersionModal`/`cgCreateNewVersion`, `js/costgrid.js:765-` onward).** `cgCreateNewVersion()` today: reads `label` from `#cgNewVersionLabel`, flushes the editor via `cgAutoSave(true)`, then does one atomic server-side copy (header/phases/tasks/roles/rates/tags) keyed by `label`. The new function keeps every step except the first: `label` becomes `'v' + (cg.versions.length + 1)` computed inline instead of read from the (now-removed) modal input; the flush-then-copy body, error handling, and the final `switchVersion(serverId)` are unchanged. No new API call shape, no modal, no `errEl`.

**8.2 `js/lib/costgrid-calc.js` additions (bridged to `window`):**
- `cgFreeTasksOf(tasks, linkedProjects) → Task[]`: same id+name double-check as `versionHasFreeTasks`, generalized to take an arbitrary task array (a phase's `tasks`, or the whole draft's flattened tasks) instead of a whole version — returns the actual free tasks (not just a boolean), so `selectAllFreeInPhase`/`selectAllFree`/`cgGenerateProject`'s count and the new §5.2/§5.3 toggles all call the one implementation. `versionHasFreeTasks(ver)` becomes `cgFreeTasksOf((ver.phases||[]).flatMap(ph=>ph.tasks||[]), ver.linkedProjects).length > 0` internally (no external behavior change, no caller changes required there).
- `cgOfferDetailsSummary(draft, { clientName, ratecardName }) → { period, stage, client, ratecard, currency, owner }`: pure formatter for §3.3, given the already-resolved client/ratecard display names (resolution itself stays in the Vue instance, which already has `clients`/`allRatecards` in scope).

**8.3 `js/costgrid.js` — `cgGenerateProject`.** Line 1029-1030's manual filter is replaced with `window.cgFreeTasksOf(flattenedTasks, v.linkedProjects)`.

### 9. Constraints

No build step; no hardcoded hex (`var(--token)` only, `color-mix()` on existing tokens if a shade is needed — no new tokens per brief §9); no emoji anywhere in `#costGridEditorSection` or its modals (SVG `stroke="currentColor"` 14–16px, or text); `formatMoney`/`formatMoneyInput`/`parseMoney` for every amount (unchanged call sites); every touched versioned file bumped and every `?v=` reference to it grepped and updated (`costgrid.js` → 40, `costgrid-calc.js` → 7, `core.js` → 12, new `costgrid.css` → 1); `v-cloak` stays on `#costGridEditorSection`; `#app-shell`/`#app-main` untouched; HTML edited via the Edit tool only (no PowerShell `Set-Content`, which adds a BOM — see memory `feedback_powershell_bom_html_edits`); English copy per brief §8 exactly.

### 10. Testing

- **vitest** (`js/lib/costgrid-calc.test.js`, new file): `cgFreeTasksOf` (id-only assigned, name-only assigned via alias, nameless task excluded, empty `linkedProjects`); `versionHasFreeTasks` still correct after the refactor (regression); `cgOfferDetailsSummary` (all fields present, each falling back to "Not set"/"Unassigned"/"— None —" individually).
- **Guard tests to keep green:** `foundations-guard.test.js`, `nav-shell-guard.test.js`, `money-guard.test.js`, `project-rules-guard.test.js` (per brief §13 checklist) — no page-shell/money/project-rule changes expected, but these must be re-run since `costgrid.html` is edited.
- **No existing `costgrid`-specific guard test** (e.g. a hex/emoji scanner like `pipeline-guard.test.js`) — out of scope to add one in this cycle unless the implementer finds it necessary to catch regressions across the many inline-style removals; if added, model it on `pipeline-guard.test.js`'s region-scoped hex/emoji check over `#costGridEditorSection`.
- **Manual verification (Gate 2, real branch stack, per brief §13):** 1440/1024/390px (390 only to confirm nothing breaks pre-Cycle-B, not full mobile coverage) on: new empty Draft (5.21), filled Draft, SIP with linked projects, locked version, viewer permission. Specifically check: section collapse persists across reload per-proposal; ⋮ menu actions (move/change/duplicate/reset/remove-with-second-click); Select free/Clear phase/Clear selection toggles with a mix of free+assigned tasks; New/Existing segmented control disabled state with zero linked projects; phase delete blocked when it has an assigned task; Monthly Phasing visible with its message when Start/End are empty; "+ New version" creates immediately and the new label is inline-editable; Compact columns toggle survives a reload (Decision 6).

### 11. Documentation

`CLAUDE.md`: rewrite the `costgrid.html` row's narrative pointer and the `css/*` file-structure block to mention `css/costgrid.css`; "Version tab switching (editor)" section updated for the no-modal "+ New version" flow. `docs/pages/costgrid.md`: full cycle narrative (card persistence, ⋮ menu, selection segmented control, the three brief-divergence rulings, the two fixed bugs). `TEST_CASES.md`/`test-cases.html` per brief §11 bullets, via `/sync-docs` at closeout.

### 12. Execution and verification

Subagent-driven, Sonnet implementers, Opus final whole-branch review. Suggested task split:
1. `costgrid-calc.js` additions (`cgFreeTasksOf`, `cgOfferDetailsSummary`) + vitest, and the `core.js` `keep`/compact-header fix.
2. Header card + collapsible cards (§2–§3), including the no-modal "+ New version" flow and inline version-label editing.
3. Grid restyle (§4): sticky column, rate-state classes, ⋮ menu with Teleport, no-roles placeholder, phase-delete guard.
4. Selection flow (§5) + Monthly Phasing (§6) + tablet media query (§7) + docs + full suite.

Full test suite run once at the end per `PROCESS.md` §6.2 rhythm, then Gate 1 → `/finish-cycle`.

## Out of scope

Cycle B (smartphone tabs/sheets, brief §7 smartphone part); the searchable Reassign-owner dropdown (brief allows keeping the plain `<select>`, so it's kept); `#cgRoleSelectModal`'s own restyle (brief: optional, light-touch — not pursued here to keep this cycle bounded); the Pipeline "New proposal" popup (separate cycle per brief §12); `--sand-*`/`--brand-mid` var cleanup in `style.css`; any API change (none needed); rate resolution, autosave, lock/permission logic (unchanged); a dedicated costgrid hex/emoji guard test (optional, see §10).

## Acceptance criteria

1. Header is one card with the version segmented control (no name modal, inline-editable label), one primary action per state, Share/Delete-version/← Pipeline preserved per §2.
2. Offer details/Tags/Sharing collapse per proposal, persisted in `localStorage['PDash_cgSections:{cgId}']`, defaulting Draft-open/non-Draft-closed; Client→Ratecard→Currency order; Currency lock behavior unchanged.
3. Grid: sticky first column on every row type; role actions only via the ⋮ menu (two-click remove); custom/zero-rate/assigned states are classes, no inline hex; no-roles placeholder column.
4. Selection mode: Select-free/Clear-phase/Clear-selection toggles use the id+name-correct `cgFreeTasksOf`; bottom bar has exactly one CTA, gated by the New/Existing segment.
5. Phase delete is blocked (with `showInfo`) when any of its tasks is assigned; the last native `alert()` is replaced with `showInfo()`.
6. Monthly Phasing card is always visible, with its own empty-period message.
7. No hex/emoji in `#costGridEditorSection` or its modals; every touched versioned file's `?v=` bumped everywhere it's referenced; `css/costgrid.css` loaded only by `costgrid.html`.
8. `costgrid-calc.test.js` covers the new/refactored pure helpers; all pre-existing guard suites stay green.
