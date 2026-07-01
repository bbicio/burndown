# PDash — Test Cases

**Updated:** 2026-06-30 (rev 7)  
**Coverage scope:** All authenticated pages + API routes. Manual execution unless noted.

> **Auto** = covered by `docker compose --profile test run --rm test` (test-api.js).  
> All other cases require manual testing in the browser.

---

## 1. Authentication

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| A-01 | Login — valid credentials | POST /api/auth/login with correct email + password | 200, httpOnly JWT cookie set, user object returned | ✓ |
| A-02 | Login — wrong password | POST with incorrect password | 401 — generic "Invalid credentials", no field hint | ✓ |
| A-03 | Login — disabled user | POST with credentials of a disabled account | 403 — login refused even with valid credentials | |
| A-04 | Login — unknown email | POST with non-existent email | 401 — same generic message as A-02 (no user enumeration) | ✓ |
| A-05 | Unauthenticated redirect | Open any authenticated page without a session cookie | Redirected to `/login.html` | ✓ |
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
| P-38 | Detail panel closes on click outside | Open a detail panel; click anywhere on the pipeline board outside the `#pbDetailPanel` element | Panel closes; `_pbOutsideClickHandler` fires on `mousedown` outside the panel area | |
| P-39 | Task list in linked-project chips — detail panel (R5) | Open detail panel for a cost grid whose linked project has assigned tasks | Each linked-project chip in the left column shows the assigned task names from `lp.taskNames` | |

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
| CG-14 | Locked version | View a version linked to a committed project | All edit controls disabled; 🔒 badge visible | |
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

---

## 5. Project Reporting (Portfolio)

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| R-01 | Portfolio loads | Open `/portfolio.html` | All accessible projects listed | |
| R-02 | Filter by client | Select a client filter | Only projects for that client shown | |
| R-03 | KPI cards | View project with phasing + actuals | Budget Estimated, Spent, Variance correctly calculated | |
| R-04 | Upload XLS actuals | Click Load Actuals → select Excel file | Rows parsed and stored; KPIs and burndown update | |
| R-05 | Burndown chart | Project with multi-month data | Estimated vs. spent per month rendered correctly | |
| R-06 | Gantt view | Switch to Gantt for project with phase dates | Phase bars aligned to correct date ranges | |
| R-07 | AI analysis | Click 🤖 AI (API key configured) | AI returns RAG status + recommendations | |
| R-08 | Share project | Owner clicks Share on a project | Share modal opens; can grant Viewer or Editor access | |
| R-09 | Navigate to project config | Click configure button | Navigates to `/project-config.html?projectId=...` | |

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

---

## 7. Resource Planning

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| PL-01 | Planning loads | Open `/planning.html` | Resource table renders with roles and time-period columns | |
| PL-02 | Group by role | Select "By Role" | Rows grouped under role codes | |
| PL-03 | Group by project | Select "By Project" | Rows grouped under project names | |
| PL-04 | Date navigation | Click next/previous period | Columns shift by configured granularity; data updates | |
| PL-05 | Export XLS | Click Export XLS | .xlsx downloaded with resource planning data for visible range | |

---

## 8. Configuration (`config.html`) — Roles

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| RL-01 | Role rate override — per-currency | Set a USD hourly rate on a role via the role edit form → save | `rate_overrides` saved to DB; `GET /api/roles` returns the `rate_overrides` field; reopening the form shows the saved USD value | ✓ |
| RL-02 | Role rate override used in non-EUR proposal | Create a USD proposal; open the cost grid editor; add the role with a USD rate override | Role column shows the `rateOverrides.USD` value, not EUR rate × USD factor | |
| RL-03 | Role rate override fallback chain | Open a USD proposal with no ratecard; add a role that has no USD override | Role rate falls back to EUR rate × currency factor (last fallback); not to zero or an error | |

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
| AD-10 | Data Migration button absent | Open admin.html | No "↑ Data Migration" button — migration.html is no longer linked from the UI | |
| AD-11 | Rate Cards button absent | Open admin.html | No "💲 Rate Cards" button — rate card management moved to Config → Clients | |
| AD-12 | Anonymize button — only on disabled non-anonymized | View a disabled user row that has a real email | "🗑 Anonymize" button visible; "anonymized" badge absent | |
| AD-13 | Anonymize button — hidden on active user | View an active user row | "🗑 Anonymize" button not shown | |
| AD-14 | Anonymize — confirm dialog | Click "🗑 Anonymize" on a disabled user | Browser confirm dialog appears explaining what data will be replaced and that operational records are preserved | |
| AD-15 | Anonymize — result | Confirm anonymization | User row shows email `anon_<uuid>@deleted.local`; name "[Deleted] User"; "anonymized" badge shown; no Anonymize button | |
| AD-16 | Anonymize — operational data intact | Anonymize a user who owned cost grids | Cost grids still appear on pipeline board; proposals not deleted | |
| AD-17 | Anonymize — cannot anonymize self | API call `POST /api/users/<own-id>/anonymize` | 400 "You cannot anonymize your own account" | |
| AD-18 | T&C editor visible to admin | Open admin.html → scroll to Terms & Conditions section | Version number, last updated info, textarea with HTML content, Save draft + Publish buttons visible | |
| AD-19 | Save T&C draft | Edit T&C textarea → click Save draft | Content saved; version number unchanged; existing users not re-prompted | |
| AD-20 | Publish new T&C version | Click Publish new version | Version number incremented; next login for every user shows terms.html before continuing | |

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
| TS-01 | List loads | Open `/timesheets.html` as admin | All project codes with upload count and row count listed | |
| TS-02 | View project link | Click 📊 View | Navigates to `/portfolio.html?projectId=...` | |
| TS-03 | Delete all | Click 🗑 Delete all → confirm | All rows for that project code removed; row disappears | |
| TS-04 | Empty state | No timesheets uploaded | "No timesheets uploaded yet" with hint shown | |

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
| SH-05 | Share triggers notification | Complete SH-02 or SH-03 | Recipient gets in-app notification with deep-link | |
| SH-06 | Share project | Owner shares a project from portfolio | Same flow as CG sharing; project becomes visible to added user | |
| SH-07 | Change permission on existing share | Open share modal → change Editor/Viewer select on existing share | Permission updated via upsert; select shows green outline briefly on success; reverts on error | |
| SH-08 | Share list excludes admins and self | Open share modal; inspect search results | Admin users and the current logged-in user not shown in the dropdown | |
| SH-09 | Share search filters by name/email | Type partial name or email in the search field | Dropdown filters to up to 10 matching users in real time (client-side on `_shareAllUsers`) | |
| SH-10 | Viewer permission enforced — UI | Log in as viewer on a shared project/CG; open pipeline board, portfolio, project-config | Pipeline: Edit/Clone/Delete hidden on card and panel. Portfolio: Configure and Load Actuals absent. Project-config: sticky read-only banner; inputs disabled; save/edit buttons hidden | |

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

Admin-only hidden page for bulk data deletion by scope.

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| DR-01 | Page access — non-admin | Navigate to `/_db-reset.html` as role=user | 403 — page content blocked or navbar redirects | |
| DR-02 | Scopes listed | Open `/_db-reset.html` as admin | All 7 scopes displayed: Proposals, Projects, Clients & Client Groups, Client Ratecards, Actuals, Pipeline Years & POTs, Notifications | |
| DR-03 | Reset proposals | Click Reset → Proposals → confirm | All cost grids + versions deleted; board shows empty | |
| DR-04 | Reset actuals | Click Reset → Actuals → confirm | Timesheet table emptied; portfolio KPIs show 0 actuals | |
| DR-05 | Unknown scope | POST `/api/admin/reset/nonexistent` | 400 "Unknown scope" | |
| DR-06 | Non-admin API call | POST `/api/admin/reset/proposals` as role=user | 403 | |
| DR-07 | Reset notifications | Click Reset → Notifications → confirm | `notifications` table emptied for all users; bell badge clears on reload | |
| DR-08 | Delete single proposal widget — admin only | Navigate to `/_db-reset.html` as non-admin | Widget is not rendered until admin check passes; entering a UUID and clicking delete is impossible for non-admins | |
| DR-09 | Delete single proposal widget — confirmation | Enter a valid cost grid UUID in the "Delete single proposal" widget; click Delete | Confirmation prompt appears before deletion | |
| DR-10 | Delete single proposal widget — cascade | Confirm deletion of a cost grid that has linked projects and resource shares | Cost grid, all versions, linked projects, and resource_shares deleted in a transaction; board no longer shows the grid | |
| DR-11 | Delete single proposal widget — unknown UUID | Enter a random UUID that does not exist in the DB | API returns 404; error message shown in widget; no data changed | |
| DR-12 | Change owner widget — admin only | Navigate to `/_db-reset.html` as non-admin | Widget is hidden; `GET /api/auth/me` admin check gates visibility | |
| DR-13 | Change owner widget — dropdown populated | Open `/_db-reset.html` as admin; inspect the "Change proposal owner" widget | Dropdown lists all active non-admin users fetched from `GET /api/users/active-list` | |
| DR-14 | Change owner widget — success | Enter a valid cost grid UUID; select a user from dropdown; click Assign | `owner_id` updated in DB; success message shown in widget | |
| DR-15 | Change owner widget — unknown UUID | Enter a UUID that does not match any cost grid; click Assign | API returns 404; error message shown; no change made | |
| SEC-09 | JWT cookie not accessible from JavaScript (`document.cookie`) | `pdash_token` value not listed — httpOnly flag prevents JS access | |
| SEC-10 | Non-admin can read ratecards | Log in as `user` role; GET /api/ratecards and GET /api/ratecards/:id | 200 — read access is requireAuth; POST/PATCH/DELETE still return 403 (unauthenticated write → 401 checked in auto suite) | |

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
| REG-13 | Hours not inflated by de-DE locale | Enter 22.25 planned hours on a month cell in project-config → save → reload → reopen | Value shows 22.25 (not 2225); `cfgParseHours` bypasses `cfgParseMoney` which strips "." as thousands sep in de-DE locale | |
| REG-14 | Quarter-hour rounding on reforecast | Trigger Reforecast on a project with fractional carry-over hours | Generated future-month values are rounded to nearest 0.25h (e.g. 10.125 → 10.25) | |
