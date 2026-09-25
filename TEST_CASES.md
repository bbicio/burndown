# PDash — Test Cases

**Updated:** 2026-07-01 (rev 8)  
**Coverage scope:** All authenticated pages + API routes. Manual execution unless noted.

> **Auto** = covered by `scripts/run-tests.sh` (test-api.js).  
> **✓ (vitest)** = covered by a frontend unit/characterization test (`npm test`, `js/lib/*.test.js`) — a separate, dev-only toolchain from the API's `test-api.js` (see CLAUDE.md).  
> All other cases require manual testing in the browser.

---

## 1. Authentication

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| A-01 | Login — valid credentials | POST /api/auth/login with correct email + password | 200, httpOnly JWT cookie set, user object returned | ✓ |
| A-02 | Login — wrong password | POST with incorrect password | 401 — generic "Invalid credentials", no field hint | ✓ |
| A-03 | Login — disabled user | POST with credentials of a disabled account | 403 — login refused even with valid credentials | |
| A-04 | Login — unknown email | POST with non-existent email | 401 — same generic message as A-02 (no user enumeration) | ✓ |
| A-05 | Unauthenticated redirect | Open any authenticated page without a session cookie | Redirected to `/login.html`, on the same host:port the request arrived on (never a different port/stack — `nginx.conf`'s auth-gate emits a relative `Location`, not an absolute one) | ✓ |
| A-06 | Logout | Click Logout → try to open pipeline.html | Cookie cleared; page redirects to login | |
| A-07 | Invite flow | Admin invites email → user activates via email link | Status changes to active; user can log in | |
| A-08 | Invite token expired | Use invite link older than 48 h | 400/401 — "Token expired or invalid" shown | |
| A-09 | Duplicate invite email | Invite an email that already has an account | 409 or meaningful inline error — no duplicate created | |
| A-10 | Password reset | Request reset → click link → set new password | Login succeeds with new password; old password rejected | |
| A-11 | Reset token expired | Use reset link older than 2 h | 400/401 — "Token expired" error shown | |
| A-12 | Change password — correct current | Supply correct current password + new password in modal | Password updated; old password no longer works | |
| A-13 | Change password — wrong current | Supply an incorrect current password | 400/403 — password unchanged, error shown inline | |

---

## 2. Navigation & Navbar

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| N-01 | Nav tabs | Click each top tab: Pipeline, Reporting, Planning | Correct page loads; active tab highlighted; others inactive | |
| N-02 | Account dropdown | Click user avatar/name top-right | Dropdown shows name, Settings, Change Password, Logout | |
| N-03 | Settings modal | Open Settings → switch between tabs | "API & Integrations" and "Data Manager" tabs both render | |
| N-04 | Non-admin config.html | Navigate to `/config.html` as role=user | "Admin access required" — tabs not accessible | |
| N-05 | Non-admin admin.html | Navigate to `/admin.html` as role=user | "Admin access required" or redirect | |
| N-06 | Non-admin timesheets.html | Navigate to `/timesheets.html` as role=user | Redirected to pipeline.html or access denied | |

---

## 3. Pipeline Board

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| P-01 | Board renders | Open `/pipeline.html` | Five kanban columns (SIP, Expected, Anticipated, Committed, Canceled) with budget totals | |
| P-02 | Year dropdown | Click the pipeline year selector | Only visible (active) years listed — hidden years absent | |
| P-03 | Year switch | Select a different year | URL updates to `?year=YYYY`; board reloads with that year's cost grids | |
| P-04 | Invalid year in URL | Navigate to `?year=9999` | Redirected to default active year silently | |
| P-05 | Inactive year (non-admin) | Navigate to URL with a hidden year | 403 from API; empty board or error shown | |
| P-06 | Draft invisible to others | Create Draft as User A; log in as User B | User B does not see User A's Draft grid | |
| P-07 | Draft visible to creator | Create Draft; remain logged in | Draft appears on creator's own board | |
| P-08 | New Cost Grid button | Click "+ New Cost Grid" on an active year | Modal opens; grid created and appears on board on submit | |
| P-09 | New CG hidden on inactive year | Admin views an inactive year board | "+ New Cost Grid" button not displayed | |
| P-10 | Detail panel opens | Click a cost grid card | Panel slides in with offer metadata + task/phase breakdown | |
| P-11 | Detail panel closes | Click × in detail panel | Panel closes; full board visible | |
| P-12 | POT summary — with target | Open detail for CG whose client has a POT this year | POT section shows target amount and progress bar | |
| P-13 | POT summary — no target | Open detail for CG whose client has no POT | POT section absent or shows "No target set" | |
| P-14 | Edit button | Click ✏️ Edit in detail panel | Navigates to `/costgrid.html?cgId=...&verId=...` | |
| P-15 | Share button | Click 🔗 Share in detail panel | Share modal opens | |
| P-16 | Column totals | Multiple grids in same stage | Footer total = correct sum of budgets for that stage | |
| P-17 | Budget on card — all version types | Open board with a Draft cost grid that has tasks/roles | Card shows a fee amount (not "No budget") — `/api/cost-grids/budgets` covers Draft versions | |
| P-18 | PTC shown separately | Open board with a proposal that has pass-through costs | Fee shown on first line; PTC shown on second line as "+ €X PTC"; not merged into fee | |
| P-19 | Client on card after reload | Set client on a cost grid version → save → reload board | Client name appears below the pipeline badge on the card | |
| P-20 | Rate card in detail panel | Set a rate card on a version → open detail panel | "Rate card: [name]" appears below client name in the panel header | |
| P-21 | Project name on card after reload | Enter a project name in the editor → save → reload board | Card shows the saved project name (not the cost grid name) | |
| P-22 | Column total — fee only | Grid with both fees and PTC in same column | Column footer main value = professional fees only; no PTC included in main total | |
| P-23 | Column total — PTC secondary line | Grid with PTC > 0 in the same column | PTC shown as a smaller muted line below the fee total; no standalone € symbol before the value | |
| P-24 | Column total — no PTC line when zero | Grid with no PTC | Only the fee line shown; no empty PTC line | |
| P-25 | Version tabs in detail panel — single version | Open detail for a grid with only one version | No version tab row rendered above the two-column body | |
| P-26 | Version tabs in detail panel — multiple versions | Open detail for a grid with V1 and V2 | Version tab row appears; each tab shows a colored stage dot and the version label | |
| P-27 | Version tab switch | Click a different version tab | Panel content reloads for that version; clicked tab highlighted as active | |
| P-28 | Clone from detail panel | Click ⧉ Clone in the detail panel header | Modal opens pre-filled with CG name + "— Copy"; source name shows currently viewed version | |
| P-29 | Clone creates v1 | Clone any version (V2, V3, etc.) | Resulting new cost grid has a single version labelled "v1", not the source label | |
| P-30 | Clone result opens editor | Complete clone flow | Navigated to `costgrid.html?cgId=<new>&verId=<new>`; editor shows cloned structure | |
| P-31 | Delete button hidden for non-Draft | Open detail panel for a version in SIP/Expected/Anticipated/Committed/Canceled | `🗑 Delete` button absent from panel header | |
| P-32 | Delete button visible for Draft | Open detail panel for a Draft version | `🗑 Delete` button visible in panel header (red outline style) | |
| P-33 | Delete Draft — confirmation | Click `🗑 Delete` on a Draft version in the panel | Confirm modal appears before any deletion | |
| P-34 | Delete Draft — only version blocked | Click `🗑 Delete` on a Draft that is the only version of its cost grid | Alert shown: "Cannot delete the only version"; no deletion occurs | |
| P-35 | Delete Draft — from panel success | Confirm deletion of a Draft version that has siblings | Version deleted via API; panel closes; board re-renders without that version | |
| P-36 | Pipeline stage badge on card | View a card for a Committed proposal | Card shows a "Committed" stage badge (green), not the project status "Started" | |
| P-37 | POT visible to non-owner user | User A has Committed proposal for a client; User B (who can't see User A's proposal) opens any proposal for the same client | POT section shows full committed+anticipated total including User A's proposal; not 0 | |
| P-38 | Detail panel closes on click outside | Open a detail panel; click anywhere on the pipeline board outside the `#pbDetailPanel` element | Panel closes (`mousedown` outside the panel, 200ms delayed registration) | |
| P-39 | Task list in linked-project chips — detail panel (R5) | Open detail panel for a cost grid whose linked project has assigned tasks | Each linked-project chip in the left column shows the assigned task names from `lp.taskNames` | |
| P-40 | Delete proposal from card | Click 🗑 on a Draft card | Confirm modal appears; on confirm, the whole cost grid is deleted via API and the card disappears from the board — no error alert | |
| P-41 | Detail panel Edit button navigates correctly | Open a detail panel, click ✏️ Edit | Navigates to `costgrid.html?cgId=<real-id>&verId=<real-id>` — not `cgId=null&verId=null` | |
| P-42 | Outside-click ignores clicks inside spawned modals | Open a detail panel, click 🗑 Delete/⧉ Clone/🔗 Share to open the respective modal, then click inside that modal (e.g. its Confirm/input field) | Detail panel stays open; the modal's own action completes normally | |
| P-43 | Detail panel loading state | Open a detail panel for a version whose structure isn't yet cached | A spinner shows while phases/tasks load, before content appears | |
| P-44 | Detail panel load-failure state | Open a detail panel for a `cgId` that fails to resolve (e.g. stale/missing cost grid) | An explicit "Could not load cost grid. Try reloading the page." message shows instead of a silently empty/missing panel | |
| P-45 | Refresh-rate failure uses in-app modal | Trigger a refresh-rate failure (e.g. API error) | Error shown via the app's own confirm-style modal, not a native browser `alert()` | |
| P-46 | Filter bar layout (2026-09) | Open `/pipeline.html` | A filter bar appears below the title, above the columns: search field first, then Owner/Client/Currency/Value dropdowns in that order, enclosed in its own bordered/background strip | |
| P-47 | Free-text search — live filtering | Type a substring of a proposal's name into the search field | Board updates immediately (no button/reload) to only the columns/cards whose name or client matches, case-insensitive | |
| P-48 | Free-text search — matches client name | Type a substring of a client name (not the proposal name) | Matching proposals for that client remain visible | |
| P-49 | Owner/Client filters — multi-select OR | Select two different owners in the Owner dropdown | Cards from either selected owner are shown (OR within the filter); the dropdown stays open after each checkbox click | |
| P-50 | Filters combine with AND across categories | Select an Owner AND a Client that don't both appear on the same proposal | No cards match; each filter category narrows independently | |
| P-51 | Owner/Client option lists exclude Draft | Create a Draft-only proposal for an owner/client with no other non-Draft proposals | That owner/client does not appear as a selectable option in the Owner/Client dropdowns | |
| P-52 | Draft column never filtered | Apply any combination of filters that would exclude all other columns' cards | The Draft column still shows all of the current user's own Draft proposals, unaffected | |
| P-53 | Value (price bucket) filter + Include PTC | Select a price bucket; toggle "Include PTC in value" on and off | With PTC off, bucketing uses fee-only totals (same total the card's main value already shows); with PTC on, bucketing uses fee+PTC — results change accordingly, not two separate filters | |
| P-54 | Column counts/totals reflect filters | Apply any filter that hides some cards in a column | That column's numeric badge and footer total both drop to match only the visible (filtered) cards | |
| P-55 | Clear filters | With at least one filter active, click "✕ Clear filters" | All filters (search, Owner, Client, Currency, Value, Include PTC) reset to empty/off; full board returns; the Clear-filters link disappears | |
| P-56 | Filters reset on reload | Apply filters, then reload the page | All filters are back to empty — no persistence in the URL or storage | |

---

## 4. Cost Grid Editor

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| CG-01 | Load existing grid | Click Edit on a card | Phases, tasks, role columns, days, and budgets load correctly | |
| CG-02 | Add phase | Click "+ Add Phase" | New phase row appears; nameable; persists after save | |
| CG-03 | Add task | Click "+ Add Task" inside a phase | New task row appears under that phase | |
| CG-04 | Add role column | Add a role to the grid | Column appears with the effective rate (custom if ratecard set, agency default otherwise); days × rate calculates budget | |
| CG-05 | Enter days | Type into a task × role cell | Row, phase, and grand totals update immediately | |
| CG-06 | Pass-through cost | Enter PTC on a task row | PTC added to task subtotal and rolled into grand total | |
| CG-07 | Save | Click Save | Structure persisted to API; no loss on reload; success indicator shown | |
| CG-08 | Duplicate version | Click Duplicate on a version | New version created with same structure; appears in version dropdown | |
| CG-09 | Delete version | Delete a non-locked version | Version removed; board reloads without that card | |
| CG-10 | JSON export | Click { } JSON | Modal shows valid JSON of the full grid structure | |
| CG-11 | JSON import | Import a valid JSON file | Structure replaced; saved to API; board reflects update | |
| CG-12 | Pipeline stage change | Change stage dropdown | Badge updates; card moves to new column on board | |
| CG-13 | Back button | Click ← Back | Returns to `/pipeline.html` with same year context | |
| CG-14 | Locked version | View a version whose own pipeline is Committed, with every task already migrated to a project | All edit controls disabled; 🔒 badge visible | |
| CG-15 | Add role — default rates (no ratecard) | Open a version with no ratecard selected; click 👥 + Add role | Modal shows all roles with sand-colored rate badges; no ratecard hint in header | |
| CG-16 | Add role — custom rates highlighted | Open a version with a client ratecard selected; click 👥 + Add role | Roles with custom entries show an indigo badge (✦ rate €/h) and light purple row background; modal header shows "✦ Custom rates from [ratecard name] applied." | |
| CG-17 | Add role — correct rate applied | Select a role with a custom rate and confirm | Role column added with the custom rate (not agency default); budget calculation uses the custom rate | |
| CG-18 | Hours display after API reload | Save 10 hours for a role; reload the page; reopen the grid | Hours cell shows `10,00` — no leading zeros or string-concatenation artefacts | |
| CG-19 | PTC totals after API reload | Save a task with PTC €2,000; reload the page; reopen the grid | Task PTC, phase total, and grand total all show `€2,000.00` — no inflated values caused by string coercion | |
| CG-20 | Version tab switch in editor | Open a grid with V1 + V2; click V1 tab while on V2 | V1 structure loaded from API; editor renders V1 phases/tasks; URL updated to V1 verId | |
| CG-21 | Clone from editor toolbar | Click ⧉ Clone in editor toolbar | Modal opens; source name shows current CG + version label; cloned grid opens in editor with v1 label | |
| CG-22 | Clone does not corrupt source | Clone from editor; navigate back to original grid | Original grid phases/tasks intact; no data loss or loop | |
| CG-23 | Clone autosave safety | Edit a task → wait for autosave to trigger → immediately clone | Clone completes cleanly; source not saved mid-clone; no 500 errors | |
| CG-24 | Delete Draft button — hidden for non-Draft | Open a version in any non-Draft stage (SIP, Committed, etc.) in the editor | `🗑 Delete version` button not displayed in the toolbar | |
| CG-25 | Delete Draft button — visible for Draft | Open a Draft version in the editor | `🗑 Delete version` button visible in the toolbar (red outline style) | |
| CG-26 | Delete Draft — only version blocked | Click `🗑 Delete version` on a Draft that is the only version of its cost grid | Alert shown: "Cannot delete the only version"; no deletion; user stays in editor | |
| CG-27 | Delete Draft — from editor success | Confirm deletion of a Draft version that has sibling versions | Version removed; user redirected to `pipeline.html`; board no longer shows the deleted version | |
| CG-28 | Compact header toggle | Open cost grid editor; click ⊟ in the "Phase / Task" header cell | Header row collapses to 10px font, reduced padding; move/change/dup/remove role buttons hidden; button changes to ⊞; state persists after page reload | |
| CG-29 | Assigned tasks have no ✕ button (R1) | Open a cost grid where some tasks are already assigned to a linked project; inspect task rows in the editor | Tasks with an assignment have no ✕ (remove) button; unassigned tasks retain the ✕ | |
| CG-30 | Add to project modal — singleton (R2) | Open the "Add to project" modal on a cost grid; dismiss it; reopen it | Modal is created once and appended to `document.body` (z-index:10500); reopening reuses the same element; no duplicate modals appear in the DOM | |
| CG-31 | Task assignment persists across reload (R3/R4) | Assign one or more tasks to a linked project via the "Add to project" modal; save; reload the page | Assigned task names are still shown as assigned after reload; `task_names_direct` column in DB holds the names | |
| CG-32 | Generate Project button hidden when all tasks assigned (R4) | Assign all editor tasks to an existing linked project | "Generate Project" button is hidden; all tasks are already mapped so no new project is needed | |
| CG-33 | Task list shown in linked-project chips — editor (R5) | Open a cost grid with tasks assigned to a linked project; inspect the linked-project chip in the editor | Chip lists the assigned task names below the project name | |
| CG-34 | project-config.html — no empty load after navigation | Navigate to `project-config.html?projectId=<id>` immediately after leaving portfolio | Form loads with all fields populated; if `config.projects` is empty on first attempt the page retries `loadConfigFromApi()` once after 600ms and succeeds | |
| CG-35 | Generate Project stays visible after partial commit | Version has ≥2 unmapped tasks; migrate task 1 to a project; set the version's own Pipeline to Committed; leave task 2 unmapped | "Generate Project" is still visible; editor fields still editable; no 🔒 badge — the version does not lock while any task remains unmapped, regardless of Committed status | |
| CG-36 | Version locks only once fully committed | Continuing from CG-35: migrate the remaining task (task 2) to a project too | Now that every task is migrated and the version's pipeline is Committed, the editor locks: "Generate Project" hidden, 🔒 badge and lock banner shown, all fields disabled | |
| CG-37 | Pipeline change propagates to all linked projects | Version has generated 2+ projects (from different tasks); change the version's Pipeline dropdown | Every linked project's own `pipeline` field updates to match, in the same save — not just the most recently generated one | |
| CG-38 | Clone does not throw duplicate-key error | Open a version, wait for its structure to load into memory, then click ⧉ Clone in the editor toolbar | Clone completes without a `duplicate key value violates unique constraint "tasks_pkey"` error; new proposal opens with the same phases/tasks/roles, under freshly-assigned server IDs | |
| CG-39 | Client dropdown shows "Unassigned" for a clientless grid | Open a cost grid version with no client assigned | The Client dropdown shows "Unassigned" selected, not a blank/empty selection | |
| CG-40 | New client appears in dropdown without reload | Click "+ New" next to the Client dropdown; create a new client; close the modal | The newly-created client appears as a selectable option in the Client dropdown immediately, with no page reload needed | |
| CG-41 | Clearing a custom rate on a non-EUR grid restores the converted baseline | On a grid with Currency set to a non-EUR currency (e.g. USD), set a role's rate to a custom value, then clear the input | The rate reverts to the correct currency-converted baseline (e.g. the USD-converted rate), not the raw EUR registry value; the "✎ custom" badge disappears | |
| CG-42 | Locked version blocks the offer-details header form too | Open a version that is Committed with every task already migrated to a project (locked) | Project name, Start, End, Currency, Pipeline stage, Client, Rate card, and Notes fields are all disabled, in addition to the grid table's own fields | |
| CG-43 | Clone warns if the new version's structure fails to load | Clone a grid; force the post-clone structure fetch to fail with an ordinary (non-401) error (e.g. network throttling) | A single-button "⚠️ Clone incomplete" dialog (OK only, no Cancel) explains the structure may not have loaded and to reload; the editor still opens on the new (temporarily empty) clone; reloading the page shows the correct structure | |
| CG-51 | Clone-incomplete warning suppressed during a session-expiry race | Clone a grid; force the post-clone structure fetch to fail with a 401 (session expired) instead of an ordinary error | No "⚠️ Clone incomplete" dialog appears; the browser redirects straight to `/login.html` | |
| CG-52 | showInfo() button state doesn't leak into the next showConfirm() | Trigger the "⚠️ Clone incomplete" dialog (or any `showInfo()` dialog); dismiss it with OK; immediately trigger "🗑 Delete version" on a Draft | The Delete confirmation shows both Cancel and the real red "Confirm" button — not a leftover "OK"/blue button from the prior dialog | |
| CG-53 | "+ New" client save ignores a fast repeat click | In the editor, click "+ New" next to the Client dropdown, type a name, then click Save twice in quick succession (or trigger the save call twice before the first resolves) | Only one client is created, not two | |
| CG-54 | Save button reflects real completion, ignores a fast repeat click | Click "💾 Save" in the editor toolbar twice in quick succession before the first save resolves | The button disables for the duration of the actual save (not just a fixed timer); "✓ Saved" appears only once the save has really completed; the second click is ignored, not a second save attempt | |
| CG-55 | Publish ignores a fast repeat confirm click | Click "🚀 Publish to SIP", then click "Confirm" in the dialog twice in quick succession before the first publish resolves | Only one publish attempt reaches the API; the second click is a no-op — no duplicate delete/publish calls | |
| CG-56 | "+ New Proposal" ignores a fast repeat click | On the pipeline board, click "+ New Proposal", enter a name, then click "Create" twice in quick succession before the first request resolves | Only one new proposal is created, not two | |
| CG-57 | Clone (toolbar/board) ignores a fast repeat click | Open the Clone modal (pipeline board or editor toolbar), enter a name, then click the Clone button twice in quick succession before the first request resolves | Only one cloned proposal is created, not two | |
| CG-44 | Clone blocks if the source version's structure fails to load | Click ⧉ Clone on a version whose structure isn't already in memory; force that fetch to fail | Clone is blocked with an inline "Could not load the source proposal's structure. Please try again." error; no new cost grid/version is created on the API | |
| CG-45 | Deleting a proposal's only version deletes the whole proposal | On a cost grid with exactly one version, trigger the version-delete action | The "Delete Cost Grid" confirmation appears (not a blocking alert); confirming deletes the entire proposal | |
| CG-46 | Version tabs visible with a single version | Open a cost grid with exactly one version in the editor and in the pipeline board's detail panel | A version tab/label is shown in both views (previously hidden until a 2nd version existed) | |
| CG-47 | Publish failure shows a styled dialog, not a native alert | Trigger a Publish failure (e.g. a stale local copy attempting to publish an already-non-Draft version) | A "⚠️ Publish failed" dialog appears with the error message, not a native browser alert | |
| CG-48 | Publish success reflects immediately | Publish a Draft version to SIP | The page reloads automatically; Draft-only controls (Publish, Delete version, New version) are no longer shown, no manual reload needed | |
| CG-49 | Phasing panel shows exact hour precision | Open the Proposal Phasing panel on a cost grid with fractional task hours (e.g. 0.25h, or a monthly aggregate like 1.333h) | Total-hours summary and each month's hours row show exact 2-decimal values (e.g. "0.25h") matching the app-wide hour format, not rounded to the nearest tenth (no more "0.3 h") | |
| CG-50 | Export XLS produces a styled workbook | Click "Export XLS" in the editor toolbar | A `.xlsx` file downloads with no error; opening it shows the expected cell styling (dark/sand colors, borders, fonts), not just raw unstyled data | |
| CG-58 | Partial-selection Generate Project prompts for a program when none exists | On a proposal (any pipeline stage except Draft) with no program established yet, click Generate Project, select only some of the available tasks, submit a project name | The "Create program" modal appears (centered, name + ID fields, or a select to link an existing program) instead of generating immediately | |
| CG-59 | Selecting every remaining free task skips the program prompt | Same as CG-58, but select every currently-unassigned task (including one added via "+ task" mid-selection) | Generation completes immediately with no program prompt, matching pre-existing full-selection behavior | |
| CG-60 | Canceling Create Program modal aborts generation entirely | Trigger CG-58's program prompt, then Cancel/close it (X, backdrop, or Esc) | No project is created; the version is unchanged; selection mode can be re-entered from scratch | |
| CG-61 | Established program auto-links on subsequent generation | After CG-58/CG-62 establishes a program for a proposal, generate another project (partial or full) from the same proposal | No program prompt appears; the new project is linked to the same program automatically | |
| CG-62 | Create Program modal can link to an existing program | Trigger CG-58's program prompt; in the Program select, choose an already-existing program instead of leaving "＋ Create new program" selected | Generation completes and links the new project to the selected existing program, with no `POST /api/programs` call | |
| CG-63 | Project name entry uses a real modal | Click Generate Project, select tasks, click "▶ Create project" | An HTML modal (`#cgProjectNameModal`, centered) collects the project name and optional project code — not a native browser prompt() | |
| CG-64 | Post-generation confirm navigates to project configuration | Complete a Generate Project flow; in the "Project created… Open configuration?" dialog, click Confirm | Browser navigates to `/project-config.html?projectId=<generatedId>` | |
| CG-65 | Add to project uses a real, opaque confirmation modal | With an existing linked project on the proposal, select one or more free tasks and use "Add to project" | A solid (non-transparent), centered HTML modal lists the target project and task names; confirming adds the tasks | |
| CG-66 | Add to project dropdown resets between uses | Complete an "Add to project" flow (CG-65); open "Add to project" again on a different task selection | The project dropdown does not retain the previously-selected project; starts unselected | |
| CG-67 | Non-admin can establish a program from Generate Project | As a non-admin (plain `user` role) with editor access to a proposal, complete CG-58's Create Program step | The program is created successfully (no 403), even though `POST /api/programs` requires only `requireAuth`, not admin | |
| CG-68 | Sync-failure warning shown if project generation doesn't persist server-side | Complete Generate Project while the project's core API upsert fails (e.g. network interruption) | A "⚠️ Sync failed" info dialog appears instead of the normal success/navigate confirm; the selection toolbar has already exited | |
| CG-69 | Exchange-rate display next to Currency field (2026-09) | Open a proposal in the editor; set Currency to a non-EUR currency (e.g. USD) | "1 EUR = X.XXXXXX" appears in small text under the Currency field, formatted to 6 decimals, using the offer's own frozen rate — not shown at all when Currency is EUR | |
| CG-70 | Exchange-rate display updates live on currency change | Continuing from CG-69, switch Currency from EUR to a non-EUR currency inside the editor (no page reload) | The rate line appears immediately with the currency's current admin-set rate — not stale/`1.000000` until a reload | |

---

## 5. Project Reporting (Portfolio)

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| R-01 | Portfolio loads | Open `/portfolio.html` | All accessible projects listed, each as a card in a 2-column grid (a program group spans the full row width; its child projects render in their own nested 2-column grid) | |
| R-02 | Filter by client | Select a client filter | Only projects for that client shown | |
| R-03 | KPI cards | View project with phasing + actuals | Budget Estimated, Spent, Variance correctly calculated | |
| R-04 | Upload XLS actuals | On a project's detail page, click 📂 Load Actuals → select Excel file | Rows parsed and stored; KPIs and burndown chart update (chart redraws even when the upload happens without leaving the detail page) — corrected 2026-09, Load Actuals moved from the list-view card to the detail page's header action row | |
| R-05 | Burndown chart | Project with multi-month data | Estimated vs. spent per month rendered correctly | |
| R-06 | Gantt view | Switch to Gantt for project with phase dates | Phase bars aligned to correct date ranges | |
| R-07 | AI analysis | Click 🤖 AI (API key configured) | AI returns RAG status + recommendations | |
| R-08 | Share project | Owner clicks Share on a project | Share modal opens; can grant Viewer or Editor access | |
| R-09 | Navigate to project config | On a project's detail page, click ⚙️ Configure | Navigates to `/project-config.html?projectId=...` — corrected 2026-09, Configure is detail-page-only, no longer duplicated on the list-view card | |
| R-10 | AI analysis with no key configured shows a dialog, not a crash | Click 🤖 AI with no AI provider API key set in Settings | A single-button "API Key required" dialog appears (via `showInfo()`); no console error from a missing `#confirmModal` element | |
| R-11 | AI analysis doesn't crash on a timesheet record with a missing task field | With an AI key configured, have timesheet actuals containing a record whose `task` field is missing/undefined (e.g. via console: `buildProjectSummary(data, cfg)` where one `data` row has `task: undefined`); click 🤖 AI Analysis | Summary is generated without a `TypeError` — TASK BREAKDOWN's task match is null-safe | |
| R-12 | KPI cards and burndown chart don't crash on a timesheet record with a missing task/role field | Have timesheet actuals containing a record whose `task` or `role` field is missing/undefined for a project with budget phasing configured; view that project's KPI cards and burndown chart | Budget Spent/Variance and the burndown chart render without a `TypeError` — `findRate()`'s task/role match (`js/core.js`) is null-safe; the malformed record simply doesn't match any configured rate (treated as €0) instead of crashing the whole page | |
| R-13 | List-view card shows identity + totals, no monthly table (2026-09) | Open `/portfolio.html`, inspect any project card | Card shows title, code, pipeline/status badges, an actuals-availability badge (`No actuals available` when no actuals uploaded), Duration, Sold, Spent, and a colored Variance (green when positive, red when negative) — no per-month breakdown table, no PTC column | |
| R-14 | List-view entry button always enabled, even with no actuals (2026-09) | Open `/portfolio.html`; find a project card with the `No actuals available` badge; click `Project Dashboard` | Navigates straight into that project's detail page — the button is never disabled, unlike the old `📊 View Report →` button it replaced (later renamed `Open project →`, then `Project Dashboard`) | |
| R-15 | Detail-page header hosts the relocated Load Actuals and Summary actions (2026-09) | Open any project's detail page | Header action row shows Configure, 📂 Load Actuals, Planning, AI Analysis (if key set), Share, and ＋/✓ Summary — none of these five is gated on the project having actuals uploaded | |
| R-16 | Variance color convention matches between list and detail (2026-09) | Open a project with a comfortably positive `Hours Left`/`Budget Left` residual | Both KPI cards render in green (`kpiLeftColor()`), matching the list-view card's own green Variance for the same positive-residual case; still red when negative, orange near the 10% threshold | |
| R-17 | Project switcher lists every sibling, even with no actuals (2026-09) | On a project that belongs to a program with sibling projects, open the `▾` project switcher next to the title | Every sibling in the dropdown is clickable and navigates on click — none is greyed out/disabled for lacking actuals; a sibling with no `name` shows its project code (e.g. `HITA...`) as the label instead of a raw internal ID | |
| R-18 | Program-group header shows identity + totals, no monthly table (2026-09) | Open `/portfolio.html`, inspect a program group's own header row (e.g. "Menarini Ricerche") | Header shows Duration, Sold, Spent, and a colored Variance aggregated across all child projects — no per-month breakdown table; the "N projects" count badge stays visible in the header, unaffected | |
| R-19 | List-view URL stays in sync with the viewed project (2026-09) | Click `Project Dashboard` on any card, or switch project via the `▾` dropdown, or click `← Portfolio` | The browser address bar updates to `/portfolio.html?projectId=<id>` (or bare `/portfolio.html` for the list) without a full page reload; refreshing the page while on a project detail lands back on that same project | |
| R-20 | Detail-page title area shows the project code, not the raw DB id (2026-09) | Open any project's detail page whose project has a `name` | The small chip next to the title shows the project's own code (e.g. `HITA...`), never the internal database id | |
| R-21 | Summary by role splits a same-labeled role by task when its rate differs (2026-09) | Open a project's detail page for a project where one role is configured at a different `hourlyRate` on two different tasks; scroll to "Summary by role" | Two separate columns appear for that role — one per task — each showing that task's own rate; not one blended column | |
| R-22 | Summary by role — TOTAL column stays correct | On the same project, compare the "Summary by role" TOTAL column against "Summary by task"'s TOTAL and the page's own KPI header (Total Sold Hours / Total Budget) | Sold-hours and € totals match exactly — splitting by task doesn't change the grand total, only how it's broken down | |
| R-23 | Summary by functional area stays one column per area even after gaining task precision (2026-09) | Open a project's detail page for a project with at least one Functional Group configured; scroll to "Summary by functional area" | One column per group name — never split into multiple columns per task, unlike "Summary by role" | |
| R-24 | Functional Groups form — per-role task scoping (2026-09) | On that project's `project-config.html`, open "7. Functional Groups"; for one role row, pick a specific task from the dropdown (instead of "— any task —"); save | On the project's detail page, that group's "Summary by functional area" total no longer includes hours logged against that role on any *other* task — only the selected task's hours for that role count toward the group | |
| R-25 | Functional Groups form — blank role row dropped on save | On `project-config.html`, click "+ Add role" under a group, leave the role text field empty, then click Save | The save completes without error; the blank row is silently dropped, not persisted | |
| R-26 | Bottom "← Portfolio" scoped to the detail view only (2026-09) | Open a project's detail page, scroll to the bottom, click the bottom `← Portfolio` button | Navigates to the bare `/portfolio.html` list; the list view itself never shows a `← Portfolio` button (regression check — an earlier draft of this button rendered on both views) | |
| R-27 | Bottom "← Portfolio" has breathing room above the footer (2026-09) | Open a project's detail page, scroll to the very bottom | The `← Portfolio` button has visible spacing above the page footer, not flush against it | |
| R-28 | project-config.html navigation buttons — top and bottom pairs (2026-09) | Open an existing project's `project-config.html`; check both the top (next to the title) and bottom (next to Save) button rows | Both rows show `← Back to Portfolio` (goes to `/portfolio.html`) and `← Project Dashboard` (goes to `/portfolio.html?projectId=<id>`); for a brand-new, not-yet-saved project, `← Project Dashboard` is absent from both rows | |
| R-29 | List-view search matches project name, code, and client (2026-09) | On `/portfolio.html`, type a project's D365 code (e.g. a `HITA.xxx` value) into the search field | The list narrows to only the matching project; typing part of the project's own name or its client's name behaves the same way | |
| R-30 | List-view search skips the "unassigned" false match (2026-09) | Type "unassigned" into the search field | Does not match every client-less project on the literal word — only matches an actual project/code/real-client-name substring | |
| R-31 | List-view Status filter — multi-select OR, empty-status default (2026-09) | Open the Status dropdown; check "Started" and "Completed" together; separately, check "Not started yet" alone on a proposal known to have an empty `status` field | Checking two values shows the union (OR) of both; a project with no status stored is included under "Not started yet" — the same default its own status badge already shows | |
| R-32 | List-view filters combine with AND (2026-09) | Select a Client filter, then also check a Status value that excludes some of that client's projects | Only projects matching both the Client and the Status selection remain | |
| R-33 | Clear filters resets search/Client/Status but not Sort (2026-09) | Set a search term, a Client filter, and a Status selection; change Sort away from its default; click "✕ Clear filters" | Search, Client, and Status all reset; Sort is left unchanged; the "✕ Clear filters" link itself disappears once nothing is active | |
| R-34 | No-match empty state (2026-09) | Type a search term that matches no project | "No projects match the current filters." appears; no project cards are shown | |
| R-35 | Program groups auto-expand while filtering; manual toggle disabled (2026-09) | Search for a term that matches only a project inside a collapsed program group | The group expands automatically and shows the matching child, with no manual click needed; the "Show/Hide Child Projects" button is replaced by a non-interactive "▼ Shown (filtered)" badge while any filter is active; clearing the filter reverts the group to its last manually-set collapsed/expanded state | |
| R-36 | List-view Configure button (2026-09) | On a project card (grouped-child or ungrouped) where the viewer has owner/editor access, click "⚙️ Configure" | Navigates to `/project-config.html?projectId=<that project's id>`; the button is hidden entirely on a card where the viewer's permission on that project is `viewer` | |

---

## 6. Project Configuration (`project-config.html`)

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| PC-01 | Form loads | Open `project-config.html?projectId=<id>` | All fields pre-filled from API | |
| PC-02 | Save metadata | Edit name, dates, client → Save | Changes persisted; portfolio card updates | |
| PC-03 | Add task | Click "+ Add task" | New task row appears; saved and visible in burndown | |
| PC-04 | Distribution validation | Enter monthly % that don't sum to 100% | Warning shown; save still allowed | |
| PC-05 | Resources | Add role + sold hours + rate to a task | Saved to API; budget impact reflected in portfolio KPIs | |
| PC-06 | Phasing | Edit monthly phasing amounts → save | Burndown chart on portfolio shows updated curve | |
| PC-07 | Planning | Edit monthly planning hours → save | Resource planning page reflects updated hours | |
| PC-08 | Functional groups | Add group with roles → save | Group persisted; visible on next form load | |
| PC-09 | Status change persists | Open project config; change Status dropdown from "Started" to "Put on hold" → Save | DB `status` column updated; reopening form shows new status; no FK constraint error from currency symbol | |
| PC-10 | Currency round-trip | Project has currency "€" in form; save; reload | Form still shows "€"; DB stores "EUR"; PATCH does not fail with FK violation | |
| PC-11 | Status options follow Pipeline — Committed includes Started At Risk | Set Pipeline to "Committed"; open the Status dropdown | Options include "Started At Risk" (alongside "Started", "Put on hold", "Completed") — same as "Expected"/"Anticipated" | |
| PC-12 | Completed status — badge and Planning exclusion | Set Status to "Completed"; save; view the project's badge elsewhere; open Resource Planning | Badge renders navy ("Completed" style, not the default/grey fallback); project does not appear in Resource Planning's eligible-projects list | |
| PC-13 | "+ New client"/"+ New program" Save ignores a fast repeat click | Click "+ New client" (or "+ New program") next to the respective dropdown, enter a name, then click Save twice in quick succession before the first request resolves | Only one client (or program) is created, not two; the button shows "Saving…" and is disabled for the duration of the real request | |
| PC-14 | View actuals popup | Open a project with imported actuals; click 👁 View in the Actuals section | Modal lists every imported row (Date/Owner/Role/Task/Hours/Notes/Fee/Spent), Fee/Spent correctly computed and shown in the project's currency; a row with no matching rate shows Fee/Spent as 0, not blank | |
| PC-15 | Download actuals as XLSX | Click ⬇ Download actuals | An `.xlsx` file downloads (not `.csv`), named `<Client>_<Project>_<ProjectCode>_<YYYYMMDD>.xlsx`, with the same rows/columns as PC-14's View popup | |
| PC-16 | Delete actuals is a real, permanent delete | Click 🗑 Delete actuals → confirm | Confirmation names the row count; on confirm, the Actuals section shows "No actuals uploaded..." (not an error); the data is actually gone from the database (re-opening the project or checking `timesheets.html` confirms no rows remain for that project code); the ↻ Reforecast from actuals button disappears; 👁 View/⬇ Download actuals disappear (nothing left to show) | |
| PC-17 | Delete actuals hidden without a project code | Open the "New Project" creation form (no `?projectId=`) | 🗑 Delete actuals is not shown in the Actuals section (matches 📂 Load Actuals' own `project.code`-gated visibility) | |
| PC-18 | Save returns to the saved project's own detail view | Edit an existing project's name → Save | Browser lands on that project's Project Reporting detail view (KPIs, burndown) via `portfolio.html?projectId=<id>`, not the bare project list | |
| PC-19 | Delete actuals as a non-admin owner/editor succeeds | Log in as a non-admin user who owns (or has editor access to) a project with imported actuals; click 🗑 Delete actuals → confirm | Delete succeeds (200), same as for an admin — not a 403 | |
| PC-20 | Confirm dialog ignores a fast repeat click | Trigger any confirmation dialog on this page (e.g. 🗑 Delete actuals, Delete task, Remove resource) → double-click "Confirm" in quick succession | The confirmed action runs only once, not twice | |

---

## 7. Resource Planning

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| PL-01 | Planning loads | Open `/planning.html` | Resource table renders with roles and time-period columns | |
| PL-02 | Group by role | Select "By Role" | Rows grouped under role codes | |
| PL-03 | Group by project | Select "By Project" | Rows grouped under project names | |
| PL-04 | Date navigation | Click next/previous period | Columns shift by configured granularity; data updates | |
| PL-05 | Export XLS | Click Export XLS | .xlsx downloaded with resource planning data for visible range | |
| PL-06 | Task with no name doesn't crash any view | Load planning data containing a task with no `name` set | By Role, By Project, and By Owner all render without a TypeError; the nameless task's actuals match on role alone | ✓ (vitest) |
| PL-07 | Case-insensitive task+role matching, consistent across views | Load timesheet actuals whose task/role casing differs from the project config's casing (e.g. `developer` vs `Developer`) | By Role, By Project, and By Owner all count the actuals identically — no view under- or over-counts relative to the others | ✓ (vitest) |
| PL-08 | "To be planned" tooltip on aggregate discrepancy | Hover the "To be planned" column header in any of the three views | Tooltip explains that the value can exceed Sold − Actuals when the row aggregates multiple items and one is over-consumed (wording generalized 2026-08 — no longer says "role", which was inaccurate for By Owner's per-task rows) | |
| PL-09 | Monthly Pulse threshold consistent across views, independent of visible window | Enable Monthly Pulse toggle on data where a role's canonical hours/week is `< 1`, then page to a shorter visible date window | By Owner activates the pulse in agreement with By Role/By Project; the threshold does not flip as the visible window changes | ✓ (vitest) |
| PL-10 | Monthly Pulse monthly totals match across views | With Monthly Pulse active on a role spanning months with different week counts | By Owner's monthly total for each month matches By Role/By Project's (proportional to that month's calendar weeks, not divided equally per month) | ✓ (vitest) |
| PL-11 | Monthly Pulse cell placement consistent across views | With Monthly Pulse active | All three views place the aggregated cell on the month's first week (not the last) | ✓ (vitest) |
| PL-12 | By Owner groups by task, not role | Select "By Owner"; find an owner with hours logged on 2+ tasks in the same project | Rows are grouped as Owner → Project → **Task** (not Role); one row per task, not per role | |
| PL-13 | By Owner aggregates multi-role tasks into one row | Select "By Owner"; find a task with 2+ sold roles (e.g. Developer + QA) | That task's Sold/Actuals/To be planned sum both roles into a single task row | |
| PL-14 | AI Chat button hidden when no key configured | With no AI provider API key set in Settings, open `/planning.html` | "🤖 AI Chat" button in the navbar is hidden (not just disabled) | |
| PL-15 | AI sidebar preserves typed text with no key configured | Open AI Chat sidebar with no API key configured; type a question; press Send | A single-button "API Key required" dialog (OK only, no Cancel) appears; the typed question remains in the textarea (not cleared) | |
| PL-16 | AI sidebar sends on Ctrl/Meta+Enter | With an AI key configured, type a question in the AI sidebar and press Ctrl+Enter (or Cmd+Enter) | Message sends, same as plain Enter; only Shift+Enter inserts a newline instead | |
| PL-17 | Group toggle stays single-click after repeated re-renders | In By Project or By Owner view, type several characters in the AI sidebar input (triggering re-renders), then click a group header to collapse/expand it | Group collapses/expands exactly once per click — no compounding/duplicate toggling from repeated re-renders | |
| PL-18 | AI sidebar Send ignores a fast repeat click | With an AI key configured, type a question and click Send twice in quick succession before the first request resolves | Only one request/message is sent, not two; the button re-enables normally once the (single) reply arrives | |
| PL-19 | AI sidebar context matches task/role case-insensitively | Have timesheet actuals whose task/role casing differs from the project config's casing (e.g. `developer` vs `Developer`); open the AI sidebar and inspect the built context (e.g. via console: `buildPlanningContext()`) | Consumed/to-be-planned hours for that role are counted correctly regardless of casing — matches PL-07's parity guarantee, extended to the AI sidebar's own context builder (`js/ai.js`'s `buildPlanningContext()`, previously a separate, case-sensitive reimplementation) | |
| PL-20 | By Role drill-down — collapsed by default (2026-09) | Select "By Role" | Each role row shows a ▶ toggle; no child rows visible; table looks identical to before this feature | |
| PL-21 | By Role drill-down — expand shows per-project/task breakdown (2026-09) | Click a role row's toggle (a role with hours on 2+ project/task combinations) | Row expands (▼); one child row appears per (project, task) combination, each with its own Sold/From actuals/To be planned and period cells; with "Rounded" off, the child rows' values sum exactly to the parent role row's own totals | ✓ (vitest, sumChildBreakdownHours) |
| PL-22 | By Role Expand all / Collapse all (2026-09) | In By Role, click "⊞ Expand all", then "⊟ Collapse all" | Expand all opens every role's drill-down at once (▼); Collapse all closes them all (▶) — same behavior already proven for By Project/By Owner | |
| PL-23 | By Project/By Owner unaffected by By Role's collapsed-by-default toggle (2026-09 regression check) | Select "By Project" (or "By Owner") | Groups still load fully expanded by default, as before; clicking a group header still collapses/expands it correctly on the very first click | |

---

## 8. Configuration (`config.html`) — Roles

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| RL-01 | Role rate override — per-currency | Set a USD hourly rate on a role via the role edit form → save | `rate_overrides` saved to DB; `GET /api/roles` returns the `rate_overrides` field; reopening the form shows the saved USD value | ✓ |
| RL-02 | Role rate override used in non-EUR proposal | Create a USD proposal; open the cost grid editor; add the role with a USD rate override | Role column shows the `rateOverrides.USD` value, not EUR rate × USD factor | |
| RL-03 | Role rate override fallback chain | Open a USD proposal with no ratecard; add a role that has no USD override | Role rate falls back to EUR rate × currency factor (last fallback); not to zero or an error | |
| RL-04 | Add/Edit Role form shows only active-currency rate fields (2026-09) | With exactly 2 non-EUR currencies active (e.g. USD, GBP), open the role create form, then the edit form on an existing role | Exactly 2 extra rate fields shown (USD, GBP) — no field for any inactive currency in the registry | |
| RL-05 | Activating a new currency adds its field live | With RL-04's form still open (or reopened), activate a third currency from the Currencies tab, then reopen the role form | A third rate field now appears for the newly-activated currency, in both the create and edit forms (same shared form/filter) | |

---

## 7a. Configuration (`config.html`) — Navigation

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| CN-01 | Tab order (2026-09) | Open config.html | Tabs appear left to right: Currencies, Roles, Clients, Client Groups, Pipelines & POTs | |
| CN-02 | Programs tab hidden from nav (2026-09) | Open config.html, inspect the tab bar | No "Programs" tab button — Currencies through Pipelines & POTs only; the underlying panel/data/API remain functional but have no UI entry point | |
| CN-03 | Rate-update confirmation modal appears (2026-09) | On the Currencies tab, change an active currency's rate value and click Save | A confirmation modal opens ("Update exchange rate?") showing the old and new rate and explaining the change does not retroactively affect existing proposals/projects — the rate is not yet saved | |
| CN-04 | Rate-update confirmation — Cancel does not save | Trigger CN-03's modal, then click Cancel | Modal closes; the currency's rate in the table is unchanged | |
| CN-05 | Rate-update confirmation — Confirm saves | Trigger CN-03's modal, then click Confirm | Modal closes; the currency's rate and Last Updated date update in the table | |
| CN-06 | Rate-update confirmation ignores a fast repeat click | Trigger CN-03's modal, then click Confirm twice in quick succession before the first request resolves | Only one rate-update request reaches the API; the button shows a spinner and is disabled for the duration of the save | |

---

## 8. Configuration (`config.html`) — Clients

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| CF-01 | Clients tab loads | Open config.html → Clients tab | All clients listed alphabetically; each row has 💲 Costgrid · ✏️ Edit · 🗑 buttons | ✓ |
| CF-02 | Add client | Click + Add client → submit name | Client appears; persisted to API | ✓ |
| CF-03 | Rename client | Click ✏️ Edit → change name → save | Name updated in list and all dropdowns | ✓ |
| CF-04 | Duplicate name blocked | Create a client with an existing name (case-insensitive) | API 409; inline "already exists" error — no duplicate | ✓ |
| CF-05 | Delete client | Click 🗑 on client with no linked projects → confirm | Client removed; deleting one with projects returns error | |
| CF-06 | Open Costgrid modal — client with no ratecard | Click 💲 Costgrid on a client that has no existing rate card | Modal opens; a rate card is auto-created for the client; all roles listed with Agency default column and empty Custom column | |
| CF-07 | Open Costgrid modal — client with existing ratecard | Click 💲 Costgrid on a client that already has a rate card | Modal opens; previously saved custom rates pre-filled in the Custom column | |
| CF-08 | Set custom rate | Enter a value in one or more Custom (€/h) cells → Save rates | Rates saved; reopening modal shows the saved values | ✓ |
| CF-09 | Clear custom rate (fall back to default) | Delete the value in a Custom cell → Save rates | Field left blank; that role uses agency default in proposals | ✓ |
| CF-10 | Agency default column | Open Costgrid modal with a global rate card configured | Agency default column shows values from the global rate card (not the role's bare hourly_rate) | |
| CF-11 | Agency default fallback | Open Costgrid modal with no global rate card | Agency default column shows role.hourly_rate or "—" if not set | |
| CF-12 | Ratecard API — list (requireAuth) | GET /api/ratecards as any logged-in user | 200 array — endpoint is open to all authenticated users, not admin-only | ✓ |
| CF-13 | Ratecard API — create global (admin) | POST /api/ratecards (clientId=null) as admin | 201, id in response | ✓ |
| CF-14 | Ratecard API — create per client (admin) | POST /api/ratecards with clientId as admin | 201, client_id matches | ✓ |
| CF-15 | Ratecard API — get by id (requireAuth) | GET /api/ratecards/:id as any logged-in user | 200, correct ratecard returned — accessible to all authenticated users | ✓ |
| CF-16 | Ratecard multi-currency — USD column visible | Open client ratecard modal when USD is an active currency | USD column rendered alongside EUR; no filter bug from missing `active` field on `/active` endpoint response |  |
| CF-17 | Ratecard multi-currency — agency placeholder | Open client ratecard modal for a role that has a USD rate override | USD placeholder shows `"140 (agency)"` (role.rateOverrides.USD); not generic placeholder text | |

---

## 9. Configuration — Client Groups

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| CG-G-01 | Groups tab loads | Click Client Groups tab | All groups listed with assigned clients | ✓ |
| CG-G-02 | Create group | Click + Add group → submit | New group appears with zero clients | ✓ |
| CG-G-03 | Rename group | Click ✏️ Rename → change name → save | Name updated | |
| CG-G-04 | Assign client | Select unassigned client from dropdown → Add | Client badge appears in group | ✓ |
| CG-G-05 | Remove client | Click × on a client badge | Client removed from group; becomes unassigned | ✓ |
| CG-G-06 | All clients assigned | All clients belong to some group | Assign dropdown empty or hidden | |
| CG-G-07 | Delete group | Click 🗑 → confirm | Group deleted; clients become unassigned (group_id = NULL) | |

---

## 10. Configuration — Pipelines & POTs

### View A — Pipeline list

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| PP-01 | Pipeline list loads | Click Pipelines & POTs tab | All years listed with Visible/Hidden badges, POT Target column, Achievement column | ✓ |
| PP-02 | Add year | Click + Add year → enter year → Create | New year in list, active by default | ✓ |
| PP-03 | Duplicate year | Add a year that already exists | Inline error; API 409 | ✓ |
| PP-04 | Invalid year | Enter year < 2000 or > 2100 | Validation error; API 400 | ✓ |
| PP-05 | Hide pipeline | Click Hide on active year | Badge → Hidden; year disappears from board dropdown | ✓ |
| PP-06 | Show pipeline | Click Show on hidden year | Badge → Visible; year reappears in board dropdown | ✓ |
| PP-07 | Delete (no refs) | Delete year with no CG versions | Year removed immediately | ✓ |
| PP-08 | Delete (has refs) | Delete year that has CG versions | Error "year in use"; API 409; year not deleted | |
| PP-09 | Drill into pipeline | Click POTs → or click a row | View B opens for that year; back button visible | |
| PP-28 | POT Target column — year with POTs | View pipeline list for a year that has POT entries | "POT Target" column shows the sum of all POT amounts for that year | |
| PP-29 | Achievement column — with Committed+Anticipated | View pipeline list for year with Committed or Anticipated proposals | "Achievement" column shows % (Committed+Anticipated total / POT total) and the fee amount in muted text | |
| PP-30 | Achievement column — no POTs | View pipeline list for year with no POTs | Both POT Target and Achievement columns show "—" | |

### View B — POT Targets (layout: nav title → POT banner → 5 cards → POT Targets section → table)

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| PP-10 | View B layout | Navigate into a pipeline year that has POTs | Top: ← Pipelines + Pipeline YYYY + badge. Then POT banner (total target + achievement %). Then 5 stage cards. Then "POT Targets" section + table. | |
| PP-11 | Back button | Click ← Pipelines | Returns to View A (pipeline list) | |
| PP-12 | 5 stage cards render | Navigate into any pipeline year | Cards for SIP, Expected, Anticipated, Committed, Canceled shown in order with count and professional-fee total | ✓ |
| PP-13 | Stage card value — professional fees only | Open year with proposals that include PTC | Card totals = Σ (days × 8 × rate) per version; pass-through costs (PTC) excluded from all totals | |
| PP-14 | Stage card — empty stages | Year with proposals in only 2 stages | Remaining 3 cards show count = 0 and value = € 0 | ✓ |
| PP-15 | Add POT — client | + New POT → Individual → select client → amount → Create | POT appears with client name and amount | ✓ |
| PP-16 | Add POT — group | + New POT → Client group → select group → amount → Create | POT appears labelled with group name | |
| PP-17 | Duplicate POT | Create POT for same client + year twice | API 409; inline error — only one POT per entity per year | ✓ |
| PP-31 | Add POT — Unassigned virtual | + New POT → Individual → select "Unassigned / To be Identified" → amount → Create | POT appears with label "Unassigned / To be Identified"; stored as `special_label` in DB (no client FK) | |
| PP-32 | Add POT — New Biz virtual | + New POT → Individual → select "New Biz" → amount → Create | POT appears with label "New Biz"; stored as `special_label` in DB | |
| PP-33 | POT banner — total and % | Navigate into a pipeline year with POTs and Committed/Anticipated proposals | Banner shows "Total POT Target" = sum of all POT amounts, and "Committed + Anticipated" fee total with % | |
| PP-34 | POT banner — hidden when no POTs | Navigate into a pipeline year with no POTs | Banner not rendered above the stage cards | |
| PP-35 | View Details — proposals via client_id | Open modal for a POT whose client has Committed versions (no generated project required) | Proposals list populated; versions matched via `cost_grid_versions.client_id` directly, not through linked projects table | |
| PP-18 | Edit POT amount | Click ✏️ Edit → change amount → Update | Amount updated; history entry created | ✓ |
| PP-19 | Delete POT | Click 🗑 → confirm | POT removed | |
| PP-20 | No year dropdown in form | Open + New POT form inside a pipeline year | Form shows "Pipeline YYYY" — no year picker in form | |
| PP-21 | View Details modal opens | Click 🔍 View Details on a POT row | Modal opens with: POT type badge, four KPI cards: Target / Total (C+A) / Committed / Anticipated — each with color-coded border and % of target | ✓ |
| PP-22 | View Details — history section | Open modal for a POT edited at least once | History list shows entries newest-first: date, author, old value → new value with arrow | ✓ |
| PP-23 | View Details — history creation entry | Open modal for a newly created POT (never edited) | History shows one entry with old value = — and new value = initial amount | |
| PP-24 | View Details — proposals list | Open modal for a POT with linked proposals | List shows all proposals in scoped client/group + year; Canceled included; Draft excluded | |
| PP-25 | View Details — proposal link | Click ↗ Open on a proposal row | Navigates to `/costgrid.html?cgId=...&verId=...` for that proposal (opens in new tab) | |
| PP-26 | View Details — Committed card calculation | POT with Committed proposals | Committed card value = Σ professional fees (EUR-normalised) of Committed proposals only; no PTC; Anticipated card shows Anticipated proposals only; Total = Committed + Anticipated | ✓ |
| PP-27 | View Details — no proposals | Open modal for POT with no scoped proposals | Proposals section shows empty state message | |
| PP-36 | POT section — proposal without linked project | Create a proposal with `clientId` set but no linked project; open the detail panel | POT section is shown (uses `v.clientId` as fallback — no linked project required) | |
| PP-37 | POT totalBudget — Committed+Anticipated only | Pipeline board with a SIP and a Committed proposal for the same client | POT progress bar totalBudget uses only Committed+Anticipated; SIP amount not included | |
| PP-38 | POT totalBudget — EUR conversion | Non-EUR (USD) Committed proposal; open detail panel | POT section shows EUR-equivalent value (converted via `b?.currencyRate`), not raw USD amount | |
| PP-39 | Phasing — Canceled/Draft excluded | Open "Proposal Phasing" view in config.html | Canceled and Draft proposals not shown in the table regardless of stage filter applied | |
| PP-40 | Phasing — non-EUR EUR equivalent | Non-EUR proposal in Phasing view | Monthly cells show local amount on first line and EUR equivalent in parentheses below; Total column also shows EUR equivalent | |
| PP-41 | POT split — proposal preview panel | Open detail panel for a CG with a POT; client has both Committed and Anticipated proposals | POT section shows: "X% total" label + dual-segment progress bar (green=Committed, orange=Anticipated); three rows below bar: Total (C+A) with color, Committed in green, Anticipated in orange (only if > 0) | |
| PP-42 | POT split — config.html POT list | Open Config → Pipelines & POTs → POT list for a year with proposals | Table shows three columns: "Total (C+A)" / "Committed" / "Anticipated" — all as EUR amounts; no single "Achievement" column | |
| PP-43 | POT split — year overview row | Pipeline list for year with POTs | Achievement cell shows total% + C+A amount on first line; secondary line shows "C: €X · A: €Y" in green/orange | |
| PP-44 | POT split — detail modal four cards | View Details modal for POT with Committed + Anticipated proposals | Four KPI cards rendered: Target (grey border) / Total C+A (dark border, total%) / Committed (green border, C%) / Anticipated (orange border, A%); no single "Current (Committed)" card | |

---

## 11. Admin — User Management

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| AD-01 | User list loads | Open `/admin.html` as admin | All users listed with role, status, invited-by | ✓ |
| AD-02 | Filter by status | Click Active / Pending / Disabled | Only matching users shown; tab counts update | |
| AD-03 | Invite user | Click + Invite → fill form → Send | User created (pending); invite email sent | |
| AD-04 | Make admin | Click "Make admin" on a user | Role → admin; button changes to "Make user" | |
| AD-05 | Make user | Click "Make user" on an admin | Role → user; loses admin page access | |
| AD-06 | Disable user | Click Disable on an active user | Status → disabled; user cannot log in | |
| AD-07 | Enable user | Click Enable on a disabled user | Status → active; user can log in again | |
| AD-08 | Cannot modify self | View own row in user list | No role/status buttons — "(you)" label shown instead | |
| AD-09 | Pipeline years absent | Open admin.html | No pipeline years section — managed in config.html | |
| AD-11 | Rate Cards button absent | Open admin.html | No "💲 Rate Cards" button — rate card management moved to Config → Clients | |
| AD-12 | Anonymize button — only on disabled non-anonymized | View a disabled user row that has a real email | "🗑 Anonymize" button visible; "anonymized" badge absent | |
| AD-13 | Anonymize button — hidden on active user | View an active user row | "🗑 Anonymize" button not shown | |
| AD-14 | Anonymize — confirm dialog | Click "🗑 Anonymize" on a disabled user | Browser confirm dialog appears explaining what data will be replaced and that operational records are preserved | |
| AD-15 | Anonymize — result | Confirm anonymization | User row shows email `anon_<uuid>@deleted.local`; name "[Deleted] User"; "anonymized" badge shown; no Anonymize button | |
| AD-16 | Anonymize — operational data intact | Anonymize a user who owned cost grids | Cost grids still appear on pipeline board; proposals not deleted | |
| AD-17 | Anonymize — cannot anonymize self | API call `POST /api/users/<own-id>/anonymize` | 400 "You cannot anonymize your own account" | |
| AD-18 | T&C editor removed from admin.html (2026-09) | Open admin.html | No Terms & Conditions section — moved to `_terms-editor.html` (sysadmin-exclusive, see §17a) | |

### 11a. Sysadmin role (2026-09)

Third tier above `admin` — sysadmin inherits every admin capability, plus two exclusives carved out of the plain admin tier (DB Reset §17, Terms & Conditions §17a). No user starts as sysadmin (`018_sysadmin_role.sql` has no backfill); first promotion is manual (SQL or `promote-sysadmin.js`), every one after that via the toggle below.

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| AD-21 | Base role toggle hidden on sysadmin row | View a row with role=sysadmin, as any viewer (admin or sysadmin) | No "Make admin"/"Make user" button on that row | |
| AD-22 | Grant sysadmin toggle — visible only to sysadmin viewer | View an admin row as a plain-admin viewer, then as a sysadmin viewer | Plain admin: no "⬆ Grant sysadmin" button. Sysadmin: button visible | |
| AD-23 | Grant sysadmin toggle — hidden on user rows | View a role=user row as a sysadmin viewer | No grant/revoke sysadmin button (two-step: user→admin first, then admin→sysadmin) | |
| AD-24 | Grant sysadmin | As sysadmin, click "⬆ Grant sysadmin" on an admin row | Role → sysadmin; badge turns red "sysadmin"; row's base toggle disappears; row now shows "⬇ Revoke sysadmin" | |
| AD-25 | Revoke sysadmin | As sysadmin, click "⬇ Revoke sysadmin" on a sysadmin row | Role → admin; base toggle reappears | |
| AD-26 | Direct promotion to sysadmin rejected | API call `PATCH /api/users/:id { role: 'sysadmin' }` where target is currently role=user | 400/403 "Only an admin can be promoted to sysadmin" — two-step rule enforced server-side even if the UI path is bypassed | ✓ |
| AD-27 | Direct demotion to user rejected | API call `PATCH /api/users/:id { role: 'user' }` where target is currently role=sysadmin | 403 "A sysadmin must first be demoted to admin before becoming a plain user" | ✓ |
| AD-28 | Plain admin cannot grant/revoke sysadmin | API call `PATCH /api/users/:id { role: 'sysadmin' }` (or reverse) as role=admin | 403 "Only a sysadmin can grant or revoke sysadmin" | ✓ |
| AD-29 | Plain admin cannot disable a sysadmin | Click Disable on a sysadmin row as a plain-admin viewer | Disable/Enable/Anonymize buttons not rendered on that row for a plain-admin viewer | |
| AD-30 | Plain admin cannot disable a sysadmin (API) | API call `PATCH /api/users/:id { status: 'disabled' }` where target is sysadmin, actor is admin | 403 "Only a sysadmin can modify another sysadmin" — enforced even for a status-only request with no `role` field | |
| AD-31 | Plain admin cannot anonymize a sysadmin (API) | API call `POST /api/users/:id/anonymize` where target is sysadmin, actor is admin | 403 "Only a sysadmin can modify another sysadmin" | |
| AD-32 | Sysadmin cannot self-modify | View own row as sysadmin | No toggle/action buttons — "(you)" label shown, same as any other role (pre-existing self-exclusion, unaffected) | |
| AD-33 | Revoking sysadmin takes effect immediately on DB Reset/Terms routes | As sysadmin B, revoke sysadmin A's role while A has an active session; A (still on old session) requests `GET /api/admin/reset/scopes` | 403 — `requireSysAdmin` re-reads the role from the DB rather than trusting A's JWT, so the revocation is effective immediately on these two sysadmin-exclusive route groups (not delayed up to the JWT's 8h lifetime, unlike ordinary `requireAdmin`-gated routes) | |
| AD-34 | Sysadmin sees every admin-gated page and action | Log in as sysadmin; visit Config, Actuals Repository, User Admin; open Send Notification | All three admin pages reachable via the "⚙ Admin" navbar dropdown and functional; broadcast option present in Send Notification — sysadmin is a strict superset of admin everywhere except the two exclusives | |
| AD-35 | Admin/Sysadmin navbar dropdowns — role visibility (2026-09) | Log in as role=user, then role=admin, then role=sysadmin; inspect the top navbar | user: neither "⚙ Admin" nor "🔒 Sysadmin" trigger shown. admin: only "⚙ Admin" shown (Config/Actuals Repository/User Admin inside). sysadmin: both triggers shown, "🔒 Sysadmin" holds DB Reset/Terms & Conditions | |
| AD-36 | Admin/Sysadmin navbar dropdowns — active state | As sysadmin, open `/admin.html`, then `/_db-reset.html` | "⚙ Admin" trigger shows active state on `/admin.html`; "🔒 Sysadmin" trigger shows active state on `/_db-reset.html` — each trigger highlights only for pages inside its own submenu | |
| AD-37 | Admin/Sysadmin navbar dropdowns — pipeline board height unaffected | As sysadmin, open `/pipeline.html` | Both new dropdown triggers measure the same height as the other navbar tabs (44px); the pipeline board's sticky column-totals footer remains fully visible, not clipped | |
| AD-38 | Resend invite button — pending users only | View a pending user row, then an active/disabled user row | "✉️ Resend invite" shown only on the pending row | |
| AD-39 | Resend invite — success | Click "✉️ Resend invite" on a pending user | A new invite email is sent; success message "Invite resent to {email}" shown; the old activation link no longer works | |
| AD-40 | Resend invite — fresh token, new expiry | Resend an invite whose original link had already expired (>48h old) | The new link works and is valid for a full new 48-hour window from the resend, not from the original invite | |
| AD-41 | Resend invite — rejected for a non-pending user | API call `POST /api/auth/:id/resend-invite` where target status is active or disabled | 400 "This user is not a pending invite" | |
| AD-42 | Resend invite — any admin or sysadmin can trigger it | As an admin who did not send the original invite, click "✉️ Resend invite" on a pending user invited by someone else | Succeeds — resend is not restricted to the original inviter | |

---

## 12. GDPR Features

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| GD-01 | T&C gate — first login | Log in as a user who has never accepted T&C | After navbar loads, redirected to `/terms.html?next=/pipeline.html` | |
| GD-02 | T&C gate — after version bump | Admin publishes new T&C version; user logs in | Existing users redirected to terms.html on next page load | |
| GD-03 | T&C page — button starts disabled | Open `/terms.html` | "Continue to PDash" button is greyed out and disabled | |
| GD-04 | T&C page — checkbox enables button | Tick "I have read and understood" checkbox | Button becomes active | |
| GD-05 | T&C page — accept and redirect | Tick checkbox → click Continue | POST /api/auth/accept-terms; redirect to original `?next` destination | |
| GD-06 | T&C page — no redirect loop | Already accepted; open any page | No redirect to terms.html; page loads normally | |
| GD-07 | Profile update — open modal | Account dropdown → 👤 My Profile | Modal opens with first name, last name, email pre-filled from session | |
| GD-08 | Profile update — save valid | Change first name → Save | PATCH /api/auth/profile succeeds; navbar name updates immediately | |
| GD-09 | Profile update — invalid email | Enter "notanemail" in email field → Save | 400 error shown inline; profile not saved | |
| GD-10 | Profile update — duplicate email | Enter email already used by another user → Save | 409 "Email already in use" shown inline | |

---

## 13. Timesheets <!-- was 12 -->

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| TS-01 | List loads | Open `/timesheets.html` as admin | All project codes with upload count and row count listed, with Client/Project/Project code as the first 3 columns (client_name/project_name resolved from `GET /api/timesheets`; `—` for a code with no linked project) | |
| TS-02 | View opens the row detail modal | Click 👁 View | A modal opens listing that project code's uploaded rows (Date/Owner/Role/Task/Hours/Notes/Fee/Spent) — corrected 2026-09, this case previously described a navigation to `/portfolio.html?projectId=...` that does not match the actual behavior | |
| TS-03 | Delete actuals | Click 🗑 Delete actuals → confirm | All rows for that project code removed; row disappears | |
| TS-04 | Empty state | No timesheets uploaded | "No timesheets uploaded yet" with hint shown | |
| TS-12 | Client/Project multi-select filters combine | Select 2 clients in the Client filter dropdown and 1 project in the Project filter dropdown | Only rows matching a selected client AND a selected project remain (AND, not OR, across the two filters); the filter button labels show the selected count | |
| TS-13 | Project code free-text filter | Type a substring of a known project code into the Project code filter | Only rows whose `project_code` contains that substring (case-insensitive) remain | |
| TS-14 | Column sorting limited to Client/Project/Project code | Click the Client, Project, and Project code headers | Each click cycles asc → desc → unsorted with a ▲/▼ indicator; Uploads/Rows/Last uploaded headers have no click-to-sort affordance | |
| TS-15 | Pipeline-year filter default and "All years" | Open the page fresh | Year selector defaults to the current year if it's an active pipeline year, else the most recent active year; selecting "All years" shows every row regardless of `pipeline_year`, including rows for projects with no linked cost-grid version (`pipeline_year: null`), which are otherwise hidden under any specific year | |
| TS-16 | Fee/Spent in the View modal | Open 👁 View for a project whose uploaded rows include both a task/role that matches a configured project resource and one that doesn't | Matching rows show `Fee` = that resource's `hourlyRate` and `Spent` = `Fee × Hours`, formatted with the project's currency symbol; unmatched rows show `Fee`/`Spent` as `0`, not blank | |
| TS-17 | XLSX export replaces CSV | Click ⬇ Download actuals for a project | An `.xlsx` file downloads (no `.csv` option exists), named `Client_Project_ProjectCode_YYYYMMDD.xlsx`, containing the same 8 columns as the View modal grid including Fee/Spent | |
| TS-18 | Duplicate project code doesn't leak an inaccessible project's data | As a non-admin user, upload a timesheet for a `project_code` that is also used (not DB-unique, `012_project_code.sql`) by a different, earlier-created project the user cannot see | The uploaded entries' `fee` is resolved from the user's own visible project's rates, and `GET /api/timesheets` shows that user's own project's name/client/currency for the code — never the inaccessible project's | |
| TS-05 | Unambiguous date disambiguation | Upload a file with a text-formatted date where day or month is >12 (e.g. `25/03/2026`) | Resolved correctly regardless of which position is >12 — the value >12 can only be the day, not guessed | ✓ (node:test) |
| TS-06 | Ambiguous date default | Upload a file with a text-formatted date where both day and month are ≤12 (e.g. `03/04/2026`) | Resolved as MM/DD (month=03, day=04), matching the known source export convention, not the previous DD/MM assumption | ✓ (node:test) |
| TS-07 | Invalid date rejects the whole upload | Upload a file with one valid row and one calendar-invalid date (e.g. `31/04/2026`, April has no 31st) | Entire upload rejected (400) naming the offending spreadsheet row; zero rows persisted, not even the valid one from the same file | ✓ (node:test) |
| TS-08 | Ambiguous header doesn't collapse owner into role | Upload a file with a header like `"Resource Name"` (matches both the role and owner keyword lists) | The column is claimed by role only; owner is not populated with the same value as role (left unmapped if no other owner column exists) — planning "By Owner" view shows actual person names, not role names, when a genuine owner column is present | ✓ (node:test) |
| TS-09 | Unrecognized date value rejects the whole upload | Upload a file with one valid row and one date cell containing free text that isn't a date at all (e.g. `"N/A"`) | Entire upload rejected (400) naming the offending spreadsheet row, same as a calendar-invalid date (TS-07); zero rows persisted. A whitespace-only date cell is treated as no date (row keeps a null date) rather than rejected | ✓ (node:test) |
| TS-10 | Generic keyword doesn't steal a more specific field's column | Upload a file with a `"Project Name"` header (and no separate `"Owner"` column, or one that appears later in the file) | `"Project Name"` is claimed by the project-name field, not owner — owner is left unmapped rather than populated with the project's name; same principle applies to a `"Task Name"` header not being stolen from the task field | ✓ (node:test) |
| TS-11 | Exact header match wins over a partial match for the same field | Upload a file with both `"Data Chiusura"` and `"Data"` as headers | The date field resolves to the exact-match column (`"Data"`), not the column that merely contains the keyword as a substring (`"Data Chiusura"`) | ✓ (node:test) |
| TS-19 | Role/task inconsistency blocks the entire upload (backend) | Upload a file where at least one row's Task/Issue doesn't match any configured task on the project, or whose Job Role isn't among that task's configured resources (blank role included) | Entire upload rejected (400) with `{ error, inconsistencies: [{projectCode, task, role}, ...] }`; no rows persisted for any project code in the file, not even ones with no inconsistency | ✓ (node:test) |
| TS-20 | Role/task inconsistency shows a blocking dialog at all three upload entry points | Trigger the TS-19 scenario from `project-config.html`'s 📂 Load Actuals, `portfolio.html`'s 📂 Load Actuals, and `planning.html`'s 📂 Load XLS | Each shows an informational (single-OK, no Cancel) dialog listing every distinct project/task/role combination found inconsistent (capped at 20 lines, "…and N more." beyond that); nothing is imported | |

---

## 13. Notifications

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| NT-01 | Bell badge shows count | Have unread notifications; open any page | Red numeric badge on bell icon | |
| NT-02 | Panel opens | Click bell | Dropdown lists last 50 notifications with timestamps | |
| NT-03 | Real-time push (SSE) | Admin sends notification from another tab | New notification appears without page reload | |
| NT-04 | Mark all read | Click "Mark all read" | Badge clears; all items show as read | |
| NT-05 | Mark one read | Click a notification | Item marked read; navigates to deep-link if present | |
| NT-06 | Share triggers notification | User A shares a CG with User B | User B receives notification with deep-link | |
| NT-07 | Send Notification — menu entry visible to all | Open account dropdown as role=user | "📣 Send Notification" item present | |
| NT-08 | Targeted notification (any user) | Account dropdown → Send Notification → pick a colleague → Push channel → Send | Recipient receives push notification; no broadcast option used | |
| NT-09 | Broadcast hidden for non-admin | Open Send Notification modal as role=user | Recipient dropdown has no "All users (broadcast)" option | |
| NT-10 | Broadcast available for admin | Open Send Notification modal as admin | Recipient dropdown includes "All users (broadcast)"; sending delivers to all active users | |
| NT-11 | Broadcast blocked server-side for non-admin | POST `/api/notifications` with no `userId` as role=user | 403 | |
| NT-12 | Email channel | Send Notification → check Email (uncheck Push) → Send | Recipient receives email via `sendAdminNotificationEmail`; no push/SSE event fires | |
| NT-13 | Both channels | Send Notification → check Push and Email → Send | Recipient receives both an in-app/SSE notification and an email | |
| NT-14 | No channel selected | Uncheck both Push and Email → Send | Inline validation error; request not sent | |
| NT-15 | Browser-notification row shown when permission never asked (2026-09) | Open the notification panel in a browser where this origin's Notification permission is still "default" | "🔔 Enable desktop notifications?" row shown above the notification list, with an "Enable" button | |
| NT-16 | Row switches to Disable once permission is granted | Click "Enable" and grant the browser's own permission prompt, then reopen the panel | Row now reads "🔔 Desktop notifications on" with a "Disable" button — it does not disappear | |
| NT-17 | Browser popup fires only when the tab isn't focused | With permission granted and popups enabled, have the PDash tab in the background (another tab or app focused), trigger an SSE push notification | A native OS/browser notification popup appears, titled with the notification's title; clicking it focuses the PDash tab and navigates to the notification's URL if present | |
| NT-18 | No redundant popup while looking at the page | With permission granted and popups enabled, have the PDash tab focused and visible, trigger an SSE push notification | The notification still appears in the in-app panel/badge as usual; no browser popup fires (avoids double-alerting) | ✓ (vitest, shouldShowBrowserNotification) |
| NT-19 | Disable turns popups off locally, without touching browser settings | With permission granted, click "Disable", then trigger an SSE push notification while the tab isn't focused | No native popup fires (in-app panel/badge still updates normally); row now reads "Enable" again | ✓ (vitest, shouldShowBrowserNotification with optedOut) |
| NT-20 | Re-enabling after a local disable doesn't re-prompt the browser | With popups locally disabled (NT-19) and permission already granted, click "Enable" | Popups resume immediately — no browser permission prompt appears again, since permission was never actually revoked | |
| NT-21 | Row hidden entirely if the browser itself denies permission | Deny the browser's permission prompt (or block this origin in the browser's own site settings), then open the panel | No row shown at all — this app has no way to override a browser-level block | ✓ (vitest, getBrowserNotifBannerState) |
| NT-22 | Disable survives navigating to another page (2026-09) | With permission granted, click "Disable", then navigate to a different PDash page (full page load, not the same tab's SPA state) | Row still reads "Enable" on the new page — the opt-out is not silently wiped by `js/core.js`'s legacy-localStorage cleanup, which runs on every page load | |
| NT-23 | Export ready notifies the requester in-app too (2026-09) | Trigger any of the three exports (Settings → Data Manager → Portfolio/Cost Grids/Rate Cards CSV) | Alongside the existing email, an in-app notification appears for the requester themselves — "Your export is ready" — previously email only | |

---

## 14. Exports (Settings → Data Manager)

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| EX-01 | Portfolio CSV | Settings → Data Manager → Export Portfolio | Email received with CSV attachment | |
| EX-02 | Cost Grids CSV | Click Export Cost Grids | Email with CSV: one row per task, role-code columns | |
| EX-03 | Rate Cards CSV (admin) | Click Export Rate Cards as admin | Email with matrix CSV: roles × clients | |
| EX-04 | Rate Cards hidden (non-admin) | Open Settings as role=user | Export Rate Cards button absent | |
| EX-05 | Full backup | Click Download Full Backup | JSON file downloaded with timestamp in filename | |
| EX-06 | Restore (admin) | Upload valid backup JSON | Data restored; success message shown | |

---

## 15. Sharing

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| SH-01 | Open share modal — CG | Click 🔗 Share in detail panel | Modal opens with CG name and existing shares | |
| SH-02 | Add viewer — user dropdown | Type in search field → select a platform user → Viewer → Share | Dropdown shows matching active non-admin users; selected user added as viewer | |
| SH-03 | Add editor | Select user from dropdown → Editor → Share | User can open editor and save changes | |
| SH-04 | Remove share | Click remove on an existing share entry | User loses access immediately | |
| SH-18 | Removing a project share notifies the removed user (2026-09) | Remove a project share (via the modal, or the inline "✕" on SH-12's list) | The removed user gets an email ("Your access to "{project}" was removed") and an in-app notification ("Access removed: {project}") — previously silent on both channels | |
| SH-19 | Removing a cost-grid share stays silent (2026-09, explicit scope) | Remove a cost-grid share | No email, no in-app notification to the removed user — deliberately out of scope for this cycle, unlike SH-18's project case | |
| SH-05 | Share triggers notification | Complete SH-02 or SH-03 | Recipient gets in-app notification with deep-link | |
| SH-06 | Share project | Owner shares a project from portfolio | Same flow as CG sharing; project becomes visible to added user | |
| SH-07 | Change permission on existing share | Open share modal → change Editor/Viewer select on existing share | Permission updated via upsert; select shows green outline briefly on success; reverts on error | |
| SH-08 | Share list excludes admins and self | Open share modal; inspect search results | Admin users and the current logged-in user not shown in the dropdown | |
| SH-09 | Share search filters by name/email | Type partial name or email in the search field | Dropdown filters to up to 10 matching users in real time (client-side on `_shareAllUsers`) | |
| SH-10 | Viewer permission enforced — UI | Log in as viewer on a shared project/CG; open pipeline board, portfolio, project-config | Pipeline: Edit/Clone/Delete hidden on card and panel. Portfolio: on the project's detail page, Configure and Load Actuals absent (corrected 2026-09 — both live in the detail page's header action row, not on the list-view card). Project-config: sticky read-only banner; inputs disabled; save/edit buttons hidden | |
| SH-11 | Inline share list — detail panel (2026-09) | Open a non-Draft proposal's sliding detail panel in pipeline.html | Under the title: "Owner: 👤 &lt;name&gt;, Created at: &lt;date&gt;" line (no version label — that's shown as a colored badge above), separated by an hr from Period/Currency/Fees/PTC/Total budget; below the totals (and any note), before the POT block, a "👥 Shared with" list (name, email, permission badge) with a single grey separator line before and after it — without opening the Share modal | |
| SH-12 | Inline share list — remove (2026-09) | From the detail panel's inline share list, click ✕ on a non-owner share | Share is removed immediately; row disappears from the inline list; owner row has no ✕ | |
| SH-13 | Inline share list syncs with modal (2026-09) | Add or remove a share via 🔗 Share (`#shareModal`), then close the modal | Detail panel's inline share list reflects the change without a manual page reload | |
| SH-14 | costgrid.html gains sharing UI (2026-09) | Open a non-Draft proposal in the full-page editor (costgrid.html) | Toolbar shows a working "🔗 Share" button (opens `#shareModal`); "Offer details" body starts with an "Owner: 👤 &lt;name&gt;, Created at: &lt;date&gt;" line; a new "Sharing" section between "Offer details" and "Cost Grid", collapsible exactly like "Offer details" (own ▶/▼ toggle), shows only the inline share list with remove capability as SH-11/SH-12 (no owner/date duplicated here) | |
| SH-15 | Reassign proposal owner from costgrid.html — visibility (2026-09) | Open any proposal's cost grid editor as a plain admin (not sysadmin), including a Committed/locked version | A "Reassign to…" dropdown appears next to the Owner line, populated from active users, with the current owner's own option disabled; visible regardless of version lock state | |
| SH-16 | Reassign proposal owner from costgrid.html — effect (2026-09) | Select a different active user from the "Reassign to…" dropdown, confirm the modal | `cost_grids.owner_id` updates to the new user; new owner gets an `owner` `resource_shares` row on the cost grid (old owner loses theirs) and an `editor` row on every project linked to any version of the proposal (unless they already own that project, in which case their `owner` permission is preserved); new owner receives an email listing the linked projects **and** an in-app notification (2026-09: previously email only) — "You are now the owner: {name}"; the page's inline share list updates immediately (no reload needed) | ✓ |
| SH-17 | Portfolio → Project Dashboard button rename (2026-09) | Open the "Linked projects" area in pipeline.html's detail panel, and separately in costgrid.html's editor | Both show "📊 Project Dashboard" (was "📊 Portfolio"); clicking still navigates to the project's dashboard/detail view | |

---

## 16. API — Security and Validation

| ID | Scenario | Expected | Auto |
|---|---|---|---|
| SEC-01 | Unauthenticated request to any `/api/*` (except auth endpoints) | 401 | ✓ |
| SEC-02 | `user` role calls admin-only endpoint | 403 | |
| SEC-03 | User requests another user's private (Draft) CG by ID | 403 | |
| SEC-04 | GET `/api/cost-grids?year=YYYY` where year is inactive | 403 | ✓ |
| SEC-05 | GET `/api/cost-grids?year=YYYY` where year is not in pipeline_years | 404 | ✓ |
| SEC-06 | POST `/api/pots` with non-existent clientId | 400 / 404 | |
| SEC-07 | POST `/api/pots` — duplicate (same client + year) | 409 | ✓ |
| SEC-08 | DELETE `/api/pipeline-years/:id` where year has CG versions | 409 | |

---

## 17. DB Reset (`_db-reset.html`)

**Sysadmin-exclusive** hidden page for bulk data deletion by scope (2026-09 — was admin-only; narrowed as one of two privileges carved out of the plain admin tier, alongside Terms & Conditions editing — see §11a).

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| DR-01 | Page access — non-sysadmin | Navigate to `/_db-reset.html` as role=user or role=admin | Navbar renders normally; page body shows "Access denied — sysadmin only" alert in place of the reset cards | |
| DR-02 | Scopes listed | Open `/_db-reset.html` as sysadmin | All 7 scopes displayed: Proposals, Projects, Clients & Client Groups, Client Ratecards, Actuals, Pipeline Years & POTs, Notifications | |
| DR-03 | Reset proposals | Click Reset → Proposals → confirm | All cost grids + versions deleted; board shows empty | |
| DR-04 | Reset actuals | Click Reset → Actuals → confirm | Timesheet table emptied; portfolio KPIs show 0 actuals | |
| DR-05 | Unknown scope | POST `/api/admin/reset/nonexistent` as sysadmin | 400 "Unknown scope" | |
| DR-06 | Non-authenticated API call | POST `/api/admin/reset/proposals` with no cookie | 401 | |
| DR-06b | Plain-admin API call rejected | POST `/api/admin/reset/proposals` as role=admin (not sysadmin) | 403 "Sysadmin access required" — an admin who could do this before 2026-09 can no longer | ✓ |
| DR-07 | Reset notifications | Click Reset → Notifications → confirm | `notifications` table emptied for all users; bell badge clears on reload | |
| DR-08 | Delete single proposal widget — sysadmin only | Navigate to `/_db-reset.html` as non-sysadmin (user or admin) | Widget is not rendered until sysadmin check passes; entering a UUID and clicking delete is impossible for non-sysadmins | |
| DR-09 | Delete single proposal widget — confirmation | Enter a valid cost grid UUID in the "Delete single proposal" widget; click Delete | Confirmation prompt appears before deletion | |
| DR-10 | Delete single proposal widget — cascade | Confirm deletion of a cost grid that has linked projects and resource shares | Cost grid, all versions, linked projects, and resource_shares deleted in a transaction; board no longer shows the grid | ✓ |
| DR-10b | Delete single proposal — plain admin rejected | POST `/api/admin/reset/cost-grid/:cgId` as role=admin | 403 "Sysadmin access required" | ✓ |
| DR-11 | Delete single proposal widget — unknown UUID | Enter a random UUID that does not exist in the DB (as sysadmin) | API returns 404; error message shown in widget; no data changed | ✓ |
| DR-12 | Change owner widget — sysadmin only | Navigate to `/_db-reset.html` as non-sysadmin | Widget is hidden; `GET /api/auth/me` sysadmin check gates visibility | |
| DR-13 | Change owner widget — dropdown populated | Open `/_db-reset.html` as sysadmin; inspect the "Change proposal owner" widget | Dropdown lists all active non-admin/non-sysadmin users fetched from `GET /api/users/active-list` | |
| DR-14 | Change owner widget — success | Enter a valid cost grid UUID; select a user from dropdown; click Assign (as sysadmin) | `owner_id` updated in DB; success message shown in widget | ✓ |
| DR-14b | Change owner — plain admin rejected | PATCH `/api/admin/reset/cost-grid/:cgId/owner` as role=admin | 403 "Sysadmin access required" | ✓ |
| DR-15 | Change owner widget — unknown UUID | Enter a UUID that does not match any cost grid; click Assign (as sysadmin) | API returns 404; error message shown; no change made | ✓ |
| DR-16 | Change owner — resource_shares stays in sync (2026-09) | PATCH `/api/admin/reset/cost-grid/:cgId/owner` to reassign to a genuinely different user, then GET `/api/cost-grids/:id/shares` | Previous owner's `resource_shares` row is gone; new owner has a `resource_shares` row with `permission: 'owner'`; exactly one `owner` row exists — fixes a bug where the old owner kept a stale owner row forever (un-shareable, and the real new owner never appeared in "who has access") | ✓ |
| SEC-09 | JWT cookie not accessible from JavaScript (`document.cookie`) | `pdash_token` value not listed — httpOnly flag prevents JS access | |
| SEC-10 | Non-admin can read ratecards | Log in as `user` role; GET /api/ratecards and GET /api/ratecards/:id | 200 — read access is requireAuth; POST/PATCH/DELETE still return 403 (unauthenticated write → 401 checked in auto suite) | |

---

## 17a. Terms & Conditions Editor (`_terms-editor.html`)

**Sysadmin-exclusive** hidden page (2026-09) — moved out of `admin.html`, which no longer has this card. Same content/behavior as the former in-page card, just on its own page with its own gate.

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| TE-01 | Page access — non-sysadmin | Navigate to `/_terms-editor.html` as role=user or role=admin | "Access denied — sysadmin only" alert; no editor shown | |
| TE-02 | Editor loads | Open `/_terms-editor.html` as sysadmin | Version number, last updated info, textarea with HTML content, Preview/Save draft/Publish buttons visible | |
| TE-03 | Save draft | Edit textarea → click Save draft | Content saved; version number unchanged; existing users not re-prompted | |
| TE-04 | Publish new version | Click Publish new version | Version number incremented; next login for every user shows terms.html before continuing | |
| TE-05 | Load failure shows an error, not an infinite spinner | Simulate `GET /api/app-settings/terms/draft` failing (e.g. network error) | `terms.msg` shows an error message; page does not hang on the loading spinner forever | |
| TE-06 | PUT rejected for plain admin (API) | `PUT /api/app-settings/terms` as role=admin | 403 — was 200 before 2026-09 | |

### 17a.1 Version history (2026-09)

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| TE-07 | Draft save does not affect the published gate | Edit the textarea → Save draft → open `/terms.html` (or `GET /api/app-settings/terms`) in a separate session | `terms.html` still shows the **previously published** text, unaffected by the unsaved draft edit — this is the behavior this cycle exists to fix | ✓ |
| TE-08 | Publish creates a new immutable version | Click Publish new version | `terms.html`/`GET /terms` now reflects the new text; "Version History" list gains a new row (newest first); version number increments | ✓ |
| TE-09 | Publishing does not alter earlier versions | After TE-08, click "👁 View" on the previous (now second-newest) version in the history list | Shows the exact original text, unaffected by the later publish or by any draft edits made in between | ✓ |
| TE-10 | Version History list | Open `/_terms-editor.html` as sysadmin | "📜 Version History" card lists every published version with version number, publish date, publisher | |
| TE-11 | View a past version | Click "👁 View" on any row in the Version History list | Read-only modal opens showing that version's full text, plus version/date/publisher header; "Close" dismisses it | |
| TE-12 | View error is visible, not silent | Trigger a failed `GET /api/app-settings/terms/versions/:version` (e.g. a version deleted between page load and click — API-level test) | The version-view modal opens and shows an error message, rather than the click doing nothing visible | |
| TE-13 | Sysadmin-only version-history endpoints reject a plain admin | `GET /api/app-settings/terms/versions` and `GET /api/app-settings/terms/versions/:version` and `GET /api/app-settings/terms/draft` as role=admin | 403 on all three | ✓ |

---

## 18. Team + Attribute Lists (2026-09)

First of four planned resource-allocation cycles (see `docs/superpowers/specs/2026-09-23-team-attribute-lists-design.md`). Two new admin-or-sysadmin pages, linked from the "⚙ Admin" navbar dropdown: `team.html` (standalone resource registry, separate from `users`) and `attribute-lists.html` (a generic, agnostic tag/taxonomy system — new lists can be created from the UI without any code change).

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| TM-01 | Page access — non-admin | Navigate to `/team.html` or `/attribute-lists.html` as role=user | "Admin access required" screen; "⚙ Admin" trigger (and both pages' links) absent from the navbar entirely | |
| TM-02 | GET /api/resources — non-admin rejected | `GET /api/resources` as role=user | 403 | ✓ |
| TM-03 | GET /api/attribute-lists without auth rejected | `GET /api/attribute-lists` with no session cookie | 401. Note: as of 2026-09 Cycle 2, an *authenticated* non-admin's `GET` is allowed (relaxed from admin-only, see TAG-08) — this case only covers the unauthenticated path, unaffected by that change | ✓ |
| TM-04 | Create resource — dropdown job title | Open `/team.html` → + New resource → fill name/email → pick an existing role from the Job title dropdown → Create | Resource created with that role's `label` as `job_title`; row appears in the table | ✓ |
| TM-05 | Create resource — custom job title | + New resource → select "Other…" in Job title → type a custom value → Create | Resource created with the typed free-text value as `job_title` (not tied to any `roles` row) | |
| TM-06 | Create resource — job title required | + New resource → fill name/email, leave Job title on its placeholder → Create | "Job title is required" error shown; nothing created (the dropdown visibly shows the placeholder, not a role that looks pre-selected) | |
| TM-07 | Edit resource — job title reverse-maps correctly | Edit a resource whose `job_title` matches an existing role's label, then one whose `job_title` doesn't | First: dropdown pre-selects that role. Second: dropdown shows "Other…" with the free-text input pre-filled | |
| TM-08 | Deactivate / reactivate resource | Click Deactivate on an active resource, then toggle "Show inactive" | Resource disappears from the default view; reappears (status: inactive) once "Show inactive" is checked; Activate button restores it | |
| TM-09 | Delete resource | Click Delete on a resource → confirm in the modal (not a native browser dialog) | Resource permanently removed; disappears from the table (hard delete, unlike attribute list items below) | ✓ |
| TM-10 | PATCH resource — empty required field rejected | `PATCH /api/resources/:id` with `{"firstName": ""}` or `{"firstName": null}` | 400 "firstName cannot be empty" — not a 500, and the existing value is left unchanged | ✓ |
| TM-11 | Resource linked to a PDash user | Create/edit a resource with "Linked PDash user" set to an active user | Table's "Linked user" column shows that user's name instead of "—" | |
| AL-01 | Seeded lists present | Open `/attribute-lists.html` | 4 lists shown: Brand, Market, Service Type, Therapeutic Area — each with slug and 0 active items on a fresh DB | ✓ |
| AL-02 | Create a new list | + New list → enter a name → Create | New list appears in the table with an auto-generated slug (lowercase, hyphenated) and 0 active items | ✓ |
| AL-03 | Slug is immutable across rename | Rename an existing list (e.g. "Market" → "Target Market") | Display name updates; the `slug` column value is unchanged | ✓ |
| AL-04 | Over-length slug rejected | `POST /api/attribute-lists` with a `name` long enough to produce a slug over 100 characters | 400 — not a raw 500 from the DB's `VARCHAR(100)` column limit | ✓ |
| AL-05 | No delete action exists for lists or items | Inspect the UI and the API surface | Neither `attribute-lists.html` nor `api/src/routes/attribute-lists.js` expose any delete — only rename/edit-label and active/inactive toggle | |
| AL-06 | Add / edit / deactivate an item | Drill into a list → + New item → add a label → Edit its label → Deactivate it | Item created (active); label updates in place; deactivating hides it from the default view and drops the list-of-lists "Active items" count by one, without a full page reload | ✓ |
| AL-07 | PATCH item — empty/null label rejected | `PATCH /api/attribute-lists/:id/items/:itemId` with `{"label": ""}` or `{"label": null}` | 400 "label cannot be empty" — not a 500 | ✓ |
| AL-08 | Duplicate item labels within one list are rejected | Add two items with the identical label (any case) to the same list | Second attempt → 409 "An item with this label already exists in this list" — enforced by a case-insensitive unique index on `(list_id, lower(label))` | ✓ |

---

## 19. Tag Linking (2026-09, Cycle 2)

Second of four planned resource-allocation cycles (see `docs/superpowers/specs/2026-09-23-tag-linking-design.md`). Lets an admin/editor assign `attribute_lists` tags to a proposal (cost grid version) in `costgrid.html`; a project generated from that proposal reflects the same tags read-only, resolved live (no copy/propagation) — **superseded 2026-09-25 (Cycle 3a):** the proposal's tags are now copied once at first link and the project's own tags are directly editable and independent afterwards (TAG-03/04/06 revised, TAG-13…TAG-20 added). A project with no linked proposal gets its own directly-editable tags in `project-config.html`. Tags render as toggleable pills (see `docs/pages/costgrid.md`'s "Tags" section for the visual redesign detail).

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| TAG-01 | Assign a tag on a proposal | Open a proposal in `costgrid.html`, expand "🏷 Tags", click an available pill | Pill switches to selected (navy fill + checkmark); reload the page — still selected | ✓ |
| TAG-02 | Remove a tag from a proposal | Click an already-selected pill | Pill switches back to available (outline); reload — still unselected | ✓ |
| TAG-03 | Linked project starts with the proposal's tags, editable (revised 2026-09-25, Cycle 3a) | Open `project-config.html` for a project generated from a tagged proposal | Section 8 "Tags" shows the proposal's tags already selected, checkboxes enabled, no "Managed from the linked proposal" note; toggling a tag persists on reload and leaves the proposal unchanged | |
| TAG-04 | Later proposal tag changes do not propagate (revised 2026-09-25, Cycle 3a) | Change a tag on the proposal after the project was linked, then reload the linked project's page | The project's Tags section is unchanged — the proposal's tags are copied once at first link, after which the project's own tags are independent | |
| TAG-05 | Standalone project has its own editable tags | Open `project-config.html` for a project with no linked proposal, toggle a tag | Pill toggles and persists on reload; no read-only note shown | ✓ |
| TAG-06 | Direct write to a linked project's tags allowed (revised 2026-09-25, Cycle 3a — was 409) | `PUT /api/projects/:id/tags` for a project whose `cg_version_id` is set, including `itemIds: []` | 200; the tags can be cleared independently of the proposal | ✓ |
| TAG-07 | Unknown tag item rejected | `PUT` either tags endpoint with an `itemId` that doesn't exist in `attribute_list_items` | 400 — not a 500 (FK violation translated) | ✓ |
| TAG-08 | Non-admin editor can populate and use the tag UI | Log in as a plain (non-admin) user who owns/edits a proposal, open its Tags section | Lists and active items render normally (not "No tag lists configured yet.") — regression coverage for the round-1 finding where a blanket admin-only guard on `GET /api/attribute-lists` silently broke this for every non-admin | |
| TAG-09 | Locked version rejects a tag write | Set `locked = true` directly in the DB for a test version (no route in the current codebase ever sets this column — it's a defensive check with no live producer as of this cycle), then `PUT /api/cost-grids/:id/versions/:vId/tags` | 400 "Version is locked" — verified manually during this cycle via `docker exec ... psql ... UPDATE cost_grid_versions SET locked = true`; not automatable in `test-api.js` (HTTP-only, no DB access) | |
| TAG-10 | Duplicating a version copies its tags | Assign a tag to a proposal version, then `POST .../duplicate` | The new version's tags include the same assignment | ✓ |
| TAG-11 | Assigned-then-deactivated tag stays visible and removable | Assign a tag, then deactivate that item in `attribute-lists.html`, reload the proposal/project Tags section | The item still renders as a dashed, muted, "(inactive)"-labelled pill (not silently dropped) and remains clickable to remove | |
| TAG-12 | Read-only section keeps assigned tags legible | View a proposal's Tags section as a shared viewer (or any read-only path) | Selected and inactive-assigned pills stay at full opacity/contrast; only unselected pills visibly dim | |
| TAG-13 | Creating a linked project copies the proposal's tags (Cycle 3a) | `POST /api/projects` with a `cgVersionId` whose version has tags | `GET /api/projects/:id/tags` returns exactly the version's tags | ✓ |
| TAG-14 | Linking an untagged project copies the proposal's tags (Cycle 3a) | `PATCH /api/projects/:id` with `cgVersionId` on a project that has a null link and no tags | The project's tags equal the version's tags | ✓ |
| TAG-15 | Linking never overwrites a project's own tags (Cycle 3a) | `PATCH` `cgVersionId` on a project that already has manually assigned tags | The project's tags are unchanged | ✓ |
| TAG-16 | Re-saving the link does not resurrect cleared tags (Cycle 3a) | Clear a linked project's tags, then `PATCH` the same `cgVersionId` again (the frontend re-sends it on every save) | Tags stay empty — only the first null → value transition seeds tags | ✓ |
| TAG-17 | Version from another grid rejected on tag routes (Cycle 3a) | `GET`/`PUT /api/cost-grids/:id/versions/:vId/tags` with a `:vId` belonging to a different cost grid | 404 for both | ✓ |
| TAG-18 | Malformed tag item id rejected (Cycle 3a) | `PUT` either tags endpoint with `itemIds: ["not-a-uuid"]` | 400 — not a 500 | ✓ |
| TAG-19 | Overlapping first-link saves seed tags once (Cycle 3a) | Two concurrent `PATCH` requests with the same `cgVersionId` on an untagged project | Both 200; exactly one copy of the version's tags (concurrency smoke test — not a deterministic race reproduction) | ✓ |
| TAG-20 | Backfill migration `023` seeds already-linked projects (Cycle 3a) | Apply `023_backfill_project_tags.sql` where linked projects have no tags and their version has tags | Each such project gets the version's tags; re-running fills only projects that still have none. Not automatable in `test-api.js` (no DB access); on the 2026-09-25 rollout no version had tags, so it inserted 0 rows | |

---

## 17. Regression — Cross-feature

| ID | Scenario | Expected | Auto |
|---|---|---|---|
| REG-01 | Pipeline board after year switch | Offers load for new year; totals recalculate; no bleed from other years | |
| REG-02 | Detail panel POT after client group rename | POT section still resolves and displays the updated group name | |
| REG-03 | Config pipeline toggle reflected on board | Hidden year disappears from board dropdown for all users on next load | |
| REG-04 | admin.html no longer shows pipeline section | Only user management shown — no pipeline years section anywhere | |
| REG-05 | project-config.html save + portfolio refresh | Portfolio KPIs and title reflect saved values | |
| REG-06 | Notification count consistent across pages | Bell badge count identical on Pipeline, Reporting, and Planning pages | |
| REG-07 | Cost grid totals after API reload — no string coercion | Save multi-task grid; reload page; reopen grid | All hours and fee totals are numeric; no leading zeros, no concatenated values (e.g. "10005" instead of 15) | |
| REG-08 | Detail panel shows linked projects | Open detail panel for a version linked to a project via `costGridRef` | Linked project names are listed; client name is resolved; POT section uses the correct client | |
| REG-09 | Client and ratecard persist across reloads | Set client + ratecard on a version; reload page; reopen cost grid editor | Client dropdown and ratecard dropdown both show the previously saved values; client-specific ratecard is not reset to None | |
| REG-10 | Project name persists across reloads | Enter project name in the cost grid editor; save; reload; reopen | "Project name" field shows the saved value; card on pipeline board shows the same name | |
| REG-11 | Rate consistency — editor vs. detail panel | Open a proposal with a ratecard (e.g. Bayer AG rates); open the editor (note total); open the detail panel for the same version | Editor total and detail panel total match exactly; no discrepancy from ratecard vs. global rate | |
| REG-12 | No stale data after hard refresh | Edit a proposal in the editor and save; hard refresh the page | Board shows the updated data; no stale in-memory cache from previous session carries over | |
| REG-13 | Hours not inflated by de-DE locale | Enter 22.25 planned hours on a month cell in project-config → save → reload → reopen | Value shows 22.25 (not 2225); `cfgParseHours` (now in `js/lib/cfg-parse.js`) bypasses `cfgParseMoney` which strips "." as thousands sep in de-DE locale | ✓ (vitest) |
| REG-14 | Quarter-hour rounding, single value | A carry-over value like 10.125h is rounded | `roundToQuarterHour` (`js/lib/cfg-parse.js`) rounds it to the nearest 0.25h (10.125 → 10.25); this is the low-level primitive `distributeHoursExact` (REG-15/16) builds on, not the Reforecast/Derive distribution itself | ✓ (vitest) |
| REG-15 | Reforecast future-month distribution sums exactly, no drift | Reforecast a residual (e.g. 7.4h) across several future months, each individually rounded to the nearest quarter-hour | The distributed months' sum is always exactly `roundToQuarterHour(7.4) = 7.5` — `distributeHoursExact`'s largest-remainder algorithm, not independent per-month rounding, so no cumulative drift (audit finding F2-3) | ✓ (vitest) |
| REG-16 | Derive confirmation modal always matches what gets saved | Run "Derive from task dates" on a task spanning several months with a real day-overlap split (e.g. 2.4h over Jan–Mar) | The modal's displayed total, the rendered planning grid, and the value read back on save are always identical — `distributeHoursExact` computes the final exact-sum value once, before any DOM render, so there is no longer a lossy round-trip through the grid's display formatting (audit finding F2-2) | ✓ (vitest) |
| REG-17 | Any showConfirm() action ignores a fast repeat click | On any destructive/confirm action that routes through the shared `showConfirm()` dialog (e.g. delete a client, delete a Draft version), click the dialog's action button (Confirm/Delete/etc.) twice in quick succession before the first action resolves | The underlying action (delete, publish, etc.) executes exactly once, not twice — no duplicate API call, no "not found" error from a second attempt on already-gone data | |
