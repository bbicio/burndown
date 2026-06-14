# PDash — Test Cases

**Updated:** 2026-06-14 (rev 3)  
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
| PP-01 | Pipeline list loads | Click Pipelines & POTs tab | All years listed with Visible/Hidden badges | ✓ |
| PP-02 | Add year | Click + Add year → enter year → Create | New year in list, active by default | ✓ |
| PP-03 | Duplicate year | Add a year that already exists | Inline error; API 409 | ✓ |
| PP-04 | Invalid year | Enter year < 2000 or > 2100 | Validation error; API 400 | ✓ |
| PP-05 | Hide pipeline | Click Hide on active year | Badge → Hidden; year disappears from board dropdown | ✓ |
| PP-06 | Show pipeline | Click Show on hidden year | Badge → Visible; year reappears in board dropdown | ✓ |
| PP-07 | Delete (no refs) | Delete year with no CG versions | Year removed immediately | ✓ |
| PP-08 | Delete (has refs) | Delete year that has CG versions | Error "year in use"; API 409; year not deleted | |
| PP-09 | Drill into pipeline | Click POTs → or click a row | View B opens for that year; back button visible | |

### View B — POT Targets (layout: nav title → 5 cards → POT Targets section → table)

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| PP-10 | View B layout | Navigate into a pipeline year | Top row: ← Pipelines + Pipeline YYYY + Visible/Hidden badge. Then 5 stage cards. Then "POT Targets" section-title + "+ New POT" button. Then POT table. | |
| PP-11 | Back button | Click ← Pipelines | Returns to View A (pipeline list) | |
| PP-12 | 5 stage cards render | Navigate into any pipeline year | Cards for SIP, Expected, Anticipated, Committed, Canceled shown in order with count and professional-fee total | ✓ |
| PP-13 | Stage card value — professional fees only | Open year with proposals that include PTC | Card totals = Σ (days × 8 × rate) per version; pass-through costs (PTC) excluded from all totals | |
| PP-14 | Stage card — empty stages | Year with proposals in only 2 stages | Remaining 3 cards show count = 0 and value = € 0 | ✓ |
| PP-15 | Add POT — client | + New POT → Individual → select client → amount → Create | POT appears with client name and amount | ✓ |
| PP-16 | Add POT — group | + New POT → Client group → select group → amount → Create | POT appears labelled with group name | |
| PP-17 | Duplicate POT | Create POT for same client + year twice | API 409; inline error — only one POT per entity per year | ✓ |
| PP-18 | Edit POT amount | Click ✏️ Edit → change amount → Update | Amount updated; history entry created | ✓ |
| PP-19 | Delete POT | Click 🗑 → confirm | POT removed | |
| PP-20 | No year dropdown in form | Open + New POT form inside a pipeline year | Form shows "Pipeline YYYY" — no year picker in form | |
| PP-21 | View Details modal opens | Click 🔍 View Details on a POT row | Modal opens with: POT type badge (Individual/Group), Target card (current pot.amount), Current card (sum of Committed professional fees) | ✓ |
| PP-22 | View Details — history section | Open modal for a POT edited at least once | History list shows entries newest-first: date, author, old value → new value with arrow | ✓ |
| PP-23 | View Details — history creation entry | Open modal for a newly created POT (never edited) | History shows one entry with old value = — and new value = initial amount | |
| PP-24 | View Details — proposals list | Open modal for a POT with linked proposals | List shows all proposals in scoped client/group + year; Canceled included; Draft excluded | |
| PP-25 | View Details — proposal link | Click ↗ Open on a proposal row | Navigates to `/costgrid.html?cgId=...&verId=...` for that proposal (opens in new tab) | |
| PP-26 | View Details — Current card calculation | POT with Committed proposals | Current card value = Σ professional fees (days×8×rate) of Committed proposals only; no PTC | ✓ |
| PP-27 | View Details — no proposals | Open modal for POT with no scoped proposals | Proposals section shows empty state message | |

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

---

## 12. Timesheets

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
| EX-07 | Targeted notification | Compose → select user → Send | Notification delivered to that user only | |
| EX-08 | Broadcast notification | Compose → leave user blank → Send | All active users receive the notification | |

---

## 15. Sharing

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| SH-01 | Open share modal — CG | Click 🔗 Share in detail panel | Modal opens with CG name and existing shares | |
| SH-02 | Add viewer | Search user by email → Viewer → Share | User can view CG; edit controls disabled for them | |
| SH-03 | Add editor | Share with Editor permission | User can open editor and save changes | |
| SH-04 | Remove share | Click remove on a share entry | User loses access immediately | |
| SH-05 | Share triggers notification | Complete SH-02 or SH-03 | Recipient gets in-app notification with deep-link | |
| SH-06 | Share project | Owner shares a project from portfolio | Same flow as CG sharing; project visible to added user | |

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
| DR-02 | Scopes listed | Open `/_db-reset.html` as admin | All 6 scopes displayed: Proposals, Projects, Clients & Client Groups, Client Ratecards, Actuals, Pipeline Years & POTs | |
| DR-03 | Reset proposals | Click Reset → Proposals → confirm | All cost grids + versions deleted; board shows empty | |
| DR-04 | Reset actuals | Click Reset → Actuals → confirm | Timesheet table emptied; portfolio KPIs show 0 actuals | |
| DR-05 | Unknown scope | POST `/api/admin/reset/nonexistent` | 400 "Unknown scope" | |
| DR-06 | Non-admin API call | POST `/api/admin/reset/proposals` as role=user | 403 | |
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
