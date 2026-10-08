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
| A-14 | Public pages look (pre-login restyling, 2026-10-06) | Open `/login.html`, `/reset-password.html` and `/activate.html` (no token) at 1440, 1024 and 390px | Navy page, white card centred (400px login, 420px reset/activate; `calc(100% - 32px)` on a phone), same "P / Dash / PROJECT DASHBOARD" logo on all three, "© <year> PDash" under the card, one magenta button per view, no emoji, no Bootstrap blue on hover/press | |
| A-15 | Forgot password pre-fills the email | Type an email on Sign In → click "Forgot password?" → "← Back to sign in" → change the email in Sign In → "Forgot password?" again | The Forgot email shows the Sign In email the first time; an email already typed in Forgot is kept (never overwritten) | |
| A-16 | Password strength meter | On the reset or activate form type `abcdefgh`, `abcdefgh1`, `Abcdefgh1`, `Abcdefgh1234!`, then clear the field | 4 segments coloured by position: Weak = 1 red; Fair = red + amber; Good = red + amber + green; Strong = all four (last two green); empty = all grey, label blank; the confirm field does not move | |
| A-17 | Link states with icons | Open `/reset-password.html?token=x` and `/activate.html?token=x`; complete a reset with a valid link | Invalid: red warning icon, "Link expired or invalid", full-width magenta button to sign in; success: green check icon and full-width "Go to sign in"; mismatched confirm: red border + "Passwords do not match." | |

---

## 2. Navigation & Navbar

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| N-01 | Nav entries (updated 2026-10-02, Nav B2) | Click each main entry: Pipeline, Portfolio, Planning | Correct page loads; active entry highlighted (magenta marker in the sidebar); others inactive | |
| N-02 | Account menu (updated 2026-10-02, Nav B2) | Click the initials/email block (bottom of the sidebar, top-right avatar on small screens) | Menu shows My Profile, Settings, Send Notification, Change password, Sign out, each with an icon | |
| N-03 | Settings opens a page (2026-09-30) | Click ⚙ Settings in the account dropdown | Navigates to `/settings.html`; no modal opens | |
| ST-01 | Settings page content | Open `/settings.html` | Standard navigation and breadcrumb Home › Settings (no footer); white content area whose only content is the title "Settings", sized like other admin page titles | |
| ST-02 | Settings requires login | Log out, open `/settings.html` | Redirected to login | |
| ST-03 | No stale settings.js | Open any of the 14 pages with the console open | No 404 for `js/settings.js`, no JS errors | |
| N-04 | Non-admin access to the Master Data pages | Navigate to `/master-clients.html` as role=user (repeat for `/master-client-groups.html`, `/master-pipelines.html`, `/master-roles.html`, `/master-currencies.html`) | "Admin access required" on each page — no panel content accessible (the sub-menu stays visible) | |
| N-05 | Non-admin admin.html | Navigate to `/admin.html` as role=user | "Admin access required" or redirect | |
| N-06 | Non-admin timesheets.html | Navigate to `/timesheets.html` as role=user | Redirected to pipeline.html or access denied | |
| N-07 | Page shell leaves layout unchanged (2026-10-02, Nav B1) | On each of the 14 authenticated pages compare layout, fixed/sticky panels, an open modal and the account menu with the previous version | Identical; `#app-shell`/`#app-main` change nothing visible; breadcrumb right under the navbar | |
| N-08 | Sidebar-state key inert and kept (2026-10-02, Nav B1) | Set `PDash_sidebarCollapsed=1` in `localStorage`, change page, read `document.documentElement.dataset.sidebar` and the key | `data-sidebar="collapsed"`, key kept; since Nav B2 the sidebar renders as the icon rail; a stray `PDash_*` key is removed | |
| N-09 | Sidebar open by default (2026-10-02, Nav B2) | As user, admin and sysadmin, open any page at ≥ 1024px for the first time (clear `PDash_sidebarCollapsed`) | Left sidebar open (240px): logo, Pipeline/Portfolio/Planning, groups per role, initials + email + bell, "© 2026 PDash" at the bottom; no top navbar, no footer | |
| N-10 | Collapse to the icon rail and remember it (Nav B2) | Click the collapse button, change page, reload, click it again | Rail (68px, icons only, no labels/email/copyright) persists across pages and reloads; expanding persists too; content shifts with the width | |
| N-11 | Admin / Sysadmin sections by role (Nav B2, replaces AD-35) | Log in as role=user, admin, sysadmin | user: no ADMIN/SYSADMIN section and no stray separator. admin: ADMIN only (Master Data, Timesheets, User Admin, Team, Attribute Lists). sysadmin: both (SYSADMIN: DB Reset, Terms & Conditions). Sections are always expanded on wide screens | |
| N-12 | Active highlighting (Nav B2, replaces AD-36) | Open `/team.html`, `/_db-reset.html`, `/settings.html`, `/profile-jobs.html` | Team / DB Reset entry highlighted (below 1024px the Admin / Sysadmin icon is highlighted); settings highlights nothing; profile-jobs highlights Timesheets | |
| N-13 | Icon navbar below 1024px (Nav B2) | Resize below 1024px (and to 360px) as admin | Dark top bar: logo left; bell then initials right; icon-only entries; Admin and Sysadmin icons with a dot; no horizontal scroll; no breadcrumb | |
| N-14 | Group panel on small screens (Nav B2) | Below 1024px tap the Admin icon, then Sysadmin; then Esc; then tap outside; then widen past 1024px with a panel open | Full-width card (10px side margins) with the uppercase title and icon + label rows, current page pink with magenta icon; only one panel open at a time; Esc / outside tap close it; widening shows the sidebar sections and closes the panel | |
| N-15 | Account menu placement (Nav B2) | Open the account menu with the sidebar open, collapsed, and below 1024px | Open: to the right, anchored to the email row; rail: to the right of the rail; small: 230px wide under the avatar; never leaves the viewport | |
| N-16 | Notification panel and bell states (Nav B2) | Open the bell panel in the three layouts; with and without unread items; "Mark all read" | Panel anchored to the bell, wider than the account menu (10px side margins on small screens); unread items pink with a magenta edge and an "Open →" link; with unread items the bell is white with red icon/border plus the count badge (99+ cap); marking all read clears it | |
| N-17 | Pipeline board fills the page exactly (Nav B2, replaces AD-37) | Open `/pipeline.html` with the sidebar open, collapsed and below 1024px; in the console compare `.pb-board-root`'s `getBoundingClientRect().bottom` with `innerHeight` and `scrollHeight - innerHeight` | Bottom equals `innerHeight` (±1) and no page scroll in all three layouts; the sticky column totals stay visible | |
| N-18 | No footer anywhere (Nav B2) | Open each authenticated page, `/login.html`, `/activate.html?token=x`, `/reset-password.html?token=x` | No fixed footer or empty band at the bottom; on the three public pages the card stays vertically centred | |
| N-19 | One name per page (Nav B2) | Visit the 10 menu pages | Menu entry, browser-tab title and breadcrumb show the same name: Pipeline, Portfolio, Planning, Master Data, Timesheets, User Admin, Team, Attribute Lists, DB Reset, Terms & Conditions | |
| N-20 | SVG icons, no emoji in navigation (Nav B2) | Inspect the sidebar/navbar, the account menu, the notification banner and the titles of the profile, change-password and send-notification modals | Every icon is a line SVG that follows the text colour; no emoji | |
| N-21 | No layout jump on load (Nav B2) | Reload `/pipeline.html` with network throttling | The navy sidebar column (or top bar) is present from the first paint and the content does not shift when the navigation appears | |
| N-22 | Initials follow a profile edit (Nav B2) | Edit first/last name in My Profile and save | The avatar initials and the email in the account block update immediately, without reload | |
| N-23 | Open menus are not clipped by page panels (Nav B2) | On `/team.html` open a resource's detail panel, then open the account menu and the bell panel | Both menus appear above the panel (not hidden behind it); a modal still appears above the navigation | |
| N-24 | Rail tooltips (2026-10-02, follow-up to B2) | Collapse the sidebar (≥ 1024px); hover each icon (Pipeline, Portfolio, Planning, the Admin/Sysadmin entries), the initials and the bell; also Tab to one | A small navy tooltip appears 10px to the right of the rail, vertically centred on the icon: the entry name, the user's email for the initials, "Notifications" for the bell; no browser tooltip appears at the same time (the items have no `title` in the rail) | |
| N-25 | Rail tooltips hide correctly (follow-up to B2) | With a tooltip visible: move the pointer away; press Esc; click the initials or the bell; scroll the items list; resize the window; expand the sidebar | The tooltip disappears each time and never overlaps the avatar/bell menu; it never stays stuck on screen | |
| N-26 | Native title stays elsewhere (follow-up to B2) | Hover the icons with the sidebar open (240px) and below 1024px | No custom tooltip; the items carry the standard browser `title` (and every item has an `aria-label` in all layouts) | |

---

## 3. Pipeline Board

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| P-01 | Board renders | Open `/pipeline.html` | Six columns (Draft, SIP, Expected, Anticipated, Committed, Canceled), each with its count and total in the column header (no footer row, 2026-10-06) | |
| P-02 | Year dropdown | Click the pipeline year selector | Only visible (active) years listed — hidden years absent | |
| P-03 | Year switch | Select a different year | URL updates to `?year=YYYY`; board reloads with that year's cost grids | |
| P-04 | Invalid year in URL | Navigate to `?year=9999` | Redirected to default active year silently | |
| P-05 | Inactive year (non-admin) | Navigate to URL with a hidden year | 403 from API; empty board or error shown | |
| P-06 | Draft invisible to others | Create Draft as User A; log in as User B | User B does not see User A's Draft grid | |
| P-07 | Draft visible to creator | Create Draft; remain logged in | Draft appears on creator's own board | |
| P-08 | New Proposal button | Click "+ New Proposal" on an active year | Proposal created at once as "New proposal" (no modal, 2026-10-07) and opens in the editor with the name field focused/selected; appears on board on return | |
| P-09 | New Proposal hidden on inactive year | Admin views an inactive year board | "+ New Proposal" button not displayed | |
| P-10 | Detail panel opens | Click a cost grid card | Panel opens (480px, 2026-10-07) on the Overview tab, with header, version segments and the Overview · Tasks · Linked projects · POT tabs | |
| P-11 | Detail panel closes | Click the ✕ in the panel header | Panel closes; full board visible | |
| P-12 | POT tab — with target | Open detail for CG whose client has a POT this year, tab POT | Percentage, segmented bar (Committed/Anticipated/Expected/SIP) with "Target" notch, 2×2 grid, Contributing and Other lists | |
| P-13 | POT tab — no target | Open detail for CG whose client has no POT this year, tab POT | "No POT target for {target} in {year}." | |
| P-14 | Edit button | Click ✏️ Edit in detail panel | Navigates to `/costgrid.html?cgId=...&verId=...` | |
| P-15 | Share button | Click 🔗 Share in detail panel | Share modal opens | |
| P-16 | Column totals | Multiple grids in same stage | Column header total = correct sum of budgets for that stage | |
| P-17 | Budget on card — all version types | Open board with a Draft cost grid that has tasks/roles | Card shows a fee amount (not "No budget") — `/api/cost-grids/budgets` covers Draft versions | |
| P-18 | PTC shown separately | Open board with a proposal that has pass-through costs | Fee shown on first line; PTC shown on second line as "+ €X PTC"; not merged into fee | |
| P-19 | Client on card after reload | Set client on a cost grid version → save → reload board | Client name appears below the pipeline badge on the card | |
| P-20 | Rate card in detail panel | Set a rate card on a version → open detail panel | "Rate card: [name]" appears below client name in the panel header | |
| P-21 | Project name on card after reload | Enter a project name in the editor → save → reload board | Card shows the saved project name (not the cost grid name) | |
| P-22 | Column total — fee only | Grid with both fees and PTC in same column | Column header main value = professional fees only; no PTC included in main total | |
| P-23 | Column total — PTC secondary line | Grid with PTC > 0 in the same column | PTC shown as a smaller muted "+ € X PTC" line under the header total ("+ ≈ € X PTC" when the column has a non-EUR card) | |
| P-24 | Column total — no PTC line when zero | Grid with no PTC | Only the fee line shown; no empty PTC line | |
| P-25 | Version selector — single version | Open detail for a grid with only one version | Header shows "Version" with a single segment (label + stage dot) | |
| P-26 | Version selector — multiple versions | Open detail for a grid with V1 and V2 | "Version" segmented control with one segment per version (label + stage dot), active one in magenta | |
| P-27 | Version tab switch | Click a different version tab | Panel content reloads for that version; clicked tab highlighted as active | |
| P-28 | Clone from detail panel | Click ⧉ Clone in the detail panel header | Clone created at once, named "{source name} — Copy" (no modal, 2026-10-07) | |
| P-29 | Clone creates v1 | Clone any version (V2, V3, etc.) | Resulting new cost grid has a single version labelled "v1", not the source label | |
| P-30 | Clone result opens editor | Complete clone flow | Navigated to `costgrid.html?cgId=<new>&verId=<new>`; editor shows cloned structure | |
| P-31 | Delete button hidden for non-Draft | Open detail panel for a version in SIP/Expected/Anticipated/Committed/Canceled | `🗑 Delete` button absent from panel header | |
| P-32 | Delete button visible for Draft | Open detail panel for a Draft version | `🗑 Delete` button visible in panel header (red outline style) | |
| P-33 | Delete Draft — confirmation | Click `🗑 Delete` on a Draft version in the panel | Confirm modal appears before any deletion | |
| P-34 | Delete Draft — only version blocked | Click `🗑 Delete` on a Draft that is the only version of its cost grid | Alert shown: "Cannot delete the only version"; no deletion occurs | |
| P-35 | Delete Draft — from panel success | Confirm deletion of a Draft version that has siblings | Version deleted via API; panel closes; board re-renders without that version | |
| P-36 | Pipeline stage on the board | View a card for a Committed proposal | Card sits in the Committed column (green top border); since 2026-10-06 cards carry no stage badge — the column is the stage; the project status "Started" is never used as the stage | |
| P-37 | POT visible to non-owner user | User A has Committed proposal for a client; User B (who can't see User A's proposal) opens any proposal for the same client | POT section shows full committed+anticipated total including User A's proposal; not 0 | |
| P-38 | Detail panel closes on click outside | Open a detail panel; click an empty area of the board outside the panel (not a card) | Panel closes (`mousedown` outside the panel, 200ms delayed registration); a click on another card switches content instead (2026-10-07) | |
| P-39 | Task list in linked-project chips — detail panel (R5) | Open detail panel for a cost grid whose linked project has assigned tasks | Each linked-project chip in the left column shows the assigned task names from `lp.taskNames` | |
| P-40 | Delete proposal from card | Click 🗑 on a Draft card | Confirm modal appears; on confirm, the whole cost grid is deleted via API and the card disappears from the board — no error alert | |
| P-41 | Detail panel Edit button navigates correctly | Open a detail panel, click ✏️ Edit | Navigates to `costgrid.html?cgId=<real-id>&verId=<real-id>` — not `cgId=null&verId=null` | |
| P-42 | Outside-click ignores clicks inside spawned modals | Open a detail panel, click 🗑 Delete/🔗 Share to open the respective modal, then click inside that modal (e.g. its Confirm/input field) | Detail panel stays open; the modal's own action completes normally (⧉ Clone no longer opens a modal, 2026-10-07 — it acts at once and navigates to the editor) | |
| P-43 | Detail panel loading state | Open a detail panel for a version whose structure isn't yet cached | A spinner shows while phases/tasks load, before content appears | |
| P-44 | Detail panel load-failure state | Open a detail panel for a `cgId` that fails to resolve (e.g. stale/missing cost grid) | An explicit "Could not load cost grid. Try reloading the page." message shows instead of a silently empty/missing panel | |
| P-45 | Refresh-rate failure uses in-app modal | Trigger a refresh-rate failure (e.g. API error) | Error shown via the app's own confirm-style modal, not a native browser `alert()` | |
| P-46 | Toolbar layout (2026-10-06) | Open `/pipeline.html` at ≥ 768px | Below the header: search field first, then Owner/Client/Currency/Value dropdowns in that order, then on the right "Amounts" with Original currency / All in EUR | |
| P-47 | Free-text search — live filtering | Type a substring of a proposal's name into the search field | Board updates immediately (no button/reload) to only the columns/cards whose name or client matches, case-insensitive | |
| P-48 | Free-text search — matches client name | Type a substring of a client name (not the proposal name) | Matching proposals for that client remain visible | |
| P-49 | Owner/Client filters — multi-select OR | Select two different owners in the Owner dropdown | Cards from either selected owner are shown (OR within the filter); the dropdown stays open after each checkbox click | |
| P-50 | Filters combine with AND across categories | Select an Owner AND a Client that don't both appear on the same proposal | No cards match; each filter category narrows independently | |
| P-51 | Owner/Client option lists exclude Draft | Create a Draft-only proposal for an owner/client with no other non-Draft proposals | That owner/client does not appear as a selectable option in the Owner/Client dropdowns | |
| P-52 | Draft column never filtered | Apply any combination of filters that would exclude all other columns' cards | The Draft column still shows all of the current user's own Draft proposals, unaffected | |
| P-53 | Value (price bucket) filter + Include PTC | Select a price bucket; toggle "Include PTC in value" on and off | With PTC off, bucketing uses fee-only totals (same total the card's main value already shows); with PTC on, bucketing uses fee+PTC — results change accordingly, not two separate filters | |
| P-54 | Column counts/totals reflect filters | Apply any filter that hides some cards in a column | That column's numeric badge and header total both drop to match only the visible (filtered) cards | |
| P-55 | Clear filters | With at least one filter active, click "Clear filters" | All filters (search, Owner, Client, Currency, Value, Include PTC) reset to empty/off; full board returns; the Clear-filters link disappears | |
| P-56 | Filters reset on reload | Apply filters, then reload the page | All filters are back to empty — no persistence in the URL or storage | |
| P-57 | Year menu — offers, Current, Closed (2026-10-06) | Click the "Pipeline YYYY" title | Menu "AVAILABLE PIPELINES": one row per year with "N offers" (SIP…Committed proposals you can see; Draft and Canceled excluded); the open year has the "Current" pill; inactive years (admin only) a "Closed" pill; Esc and outside click close it | |
| P-58 | `offers` count follows board visibility | `GET /api/pipeline-years` as admin and as plain user, with an admin-owned SIP proposal, a Canceled one, a Draft-only one, one whose newest version is Canceled, then share the SIP one with the user | Every row has integer `offers`; admin counts only the SIP proposal; the user counts it only after the share; a year with no proposals returns 0 (test-api PY-10..PY-14) | ✓ |
| P-59 | Open pipeline total | Read "OPEN PIPELINE" in the header; apply a filter; switch Amounts | Value = SIP + Expected + Anticipated fees in EUR ("≈" when something was converted); follows filters; unchanged by Amounts | |
| P-60 | Search suggestions | Focus the search field, then type part of a client name | Empty field shows the hint text; typing shows CLIENTS ("N proposals") and up to 4 PROPOSALS with the matched text highlighted, plus "N more results — refine your search" when more; no match shows `No results for "…"`; Esc / outside click close it | |
| P-61 | Search suggestion clicks | Click a client row; then type again and click a proposal row | Client: the board is filtered to that client (Client badge 1) and the search field clears; proposal: the detail panel opens on it | |
| P-62 | Amounts toggle | Switch to "All in EUR", then back | EUR mode: cards and column headers in EUR, foreign cards show "from CHF …"; Original: foreign cards show their currency with "≈ € …"; not persisted across reloads | |
| P-63 | Collapsible columns | Load the board; click a column header twice; create or clone a proposal | Empty columns start collapsed (44px strip, vertical name); a click collapses/expands; after create/clone the Draft column is expanded; a column emptied by a filter shows "No offers" | |
| P-64 | Column header pills | Column with at least one non-EUR card, Amounts = Original | Header shows "≈ € total" and one pill per currency (EUR first); in EUR mode no pills | |
| P-65 | Card hover / keyboard actions | Hover a card as owner; hover a Draft; hover a card shared as viewer; Tab to a card | Date is replaced by Edit · Clone · Share (owner), Edit · Clone · Delete (Draft, no Share), Share only (viewer); Tab reveals the same actions, Enter/Space open the panel, Enter on Edit only opens the editor; no actions on a touch tap | |
| P-66 | Selected card | Open the detail panel from a card | That card has a magenta border while the panel is open | |
| P-67 | Smartphone stage tabs (< 768px) | Open the board at 390px | Compact header ("+ New"), full-width search + Filters button; stage tabs with counts; one column at a time with a summary (name, N offers, total, pills) | |
| P-68 | Smartphone Filters sheet | At 390px tap "Filters", pick a filter, tap "Show results" | Bottom sheet with Amounts and Owner/Client/Currency/Value in a 2×2 grid; Show results closes it and the list is filtered (same filters as desktop) | |
| P-69 | Panel layout modes (2026-10-07) | Open a card at 1440 and 1280 (sidebar open), 1200 (open, then collapsed), 1024, 390 | Side by side (board shrinks) at ≥ 1280 open / ≥ 1108 collapsed; overlay with grey scrim below that (scrim click closes); full screen below 768px | |
| P-70 | Panel switches on another card | With the panel open, click another card or a search-suggestion proposal | Content switches without closing; tab returns to Overview | |
| P-71 | Esc layering | Panel open: press Esc with the search menu open, with a filter dropdown open, with Share/Clone/Confirm open, then with nothing open | Only the menu / dropdown / modal closes in the first three cases; the panel closes in the last | |
| P-72 | Delete the open Draft from its card | Panel open on own Draft; hover its card → Delete → confirm | Card removed and panel closed (no "Could not load cost grid") | |
| P-73 | Overview tab | Open a proposal in a non-EUR currency with a note | Three boxes (Total budget navy) with "≈ € …" lines; PERIOD "May 2026 – Dec 2026"; CURRENCY with "1 € = …" (and Refresh rate for an admin when stale); note; SHARED WITH list | |
| P-74 | Tasks and Linked projects tabs | Open a proposal with tasks and generated projects | Tasks: per phase TASK · PERIOD · HOURS · AMOUNT; Linked: one card per project with code, stage + status pills and "Project Dashboard →"; empty-state texts when none | |
| P-75 | POT special states | Tab POT on a Draft, on a proposal with no client, over a reached target | "Draft proposals don't count toward the POT."; "This proposal has no client, so it has no POT."; "OVER TARGET + € …" in green | |
| P-76 | `/api/pots/summary` extended fields | GET summary for a client and a client-group target with SIP/Expected/Anticipated/Committed proposals + a Draft | `expected_total`/`sip_total` numeric; every row has numeric `value` and `client_name`; stage totals = sum of row values; Draft absent; group target returns both clients' proposals (test-api POT-08..POT-12) | ✓ |
| P-77 | New Proposal focus flows into the editor (2026-10-07) | Click "+ New Proposal" on the board | Editor opens at `costgrid.html?cgId=…&verId=…&focus=name`; the Project name field is focused and its text selected; the URL loses `focus=name` right after (a reload doesn't repeat the focus) | |
| P-78 | Clone a proposal with no client (2026-10-07) | Set a proposal's Client to "Unassigned" in the editor, save, then Clone it from the board or from the editor | Clone succeeds with no error; the copy's Client is also empty — not an API error (was `Clone failed: invalid input syntax for type uuid: "__unassigned__"`) | |
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
| CG-08 | New version is a full copy (2026-10) | In the editor of a Draft version with phases, tasks, hours, PTC, a custom role rate and a tag, click "+ New version", enter a label | New Draft version opens with everything copied (header incl. project name/client/dates/currency/exchange rate, phases, tasks with hours/PTC/dates/description, role rates, tags) and the `+ task` buttons visible; no links to generated projects; the source is unchanged. Route-level checks `ND-01..ND-11` in test-api.js | ✓ |
| CG-08b | New version failure leaves nothing behind (2026-10) | Make the copy fail (e.g. stop `pdash-api`, or a blank label) and confirm the dialog | The dialog stays open with an error message; no new version appears in the version tabs; a failure to save the pending editor changes also aborts the copy with an error | |
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
| CG-21 | Clone from editor toolbar | Click ⧉ Clone in editor toolbar | Clone created at once, named "{source name} — Copy" (no modal, 2026-10-07); cloned grid opens in editor with v1 label | |
| CG-22 | Clone does not corrupt source | Clone from editor; navigate back to original grid | Original grid phases/tasks intact; no data loss or loop | |
| CG-23 | Clone autosave safety | Edit a task → immediately click ⧉ Clone, before the autosave timer fires | The pending edit is flushed (saved) first, then the clone is created from that saved state — the clone includes the edit; no 500 errors (2026-10-07; skipped for a viewer, who cannot save the source) | |
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
| CG-56 | "+ New Proposal" ignores a fast repeat click | On the pipeline board, click "+ New Proposal" twice in quick succession before the first request resolves (no modal, 2026-10-07) | Only one new proposal is created, not two | |
| CG-57 | Clone (toolbar/board/panel) ignores a fast repeat click | Click a Clone control (pipeline board, detail panel or editor toolbar) twice in quick succession before the first request resolves (no modal, 2026-10-07) | Only one cloned proposal is created, not two | |
| CG-44 | Clone blocks if the source version's structure fails to load | Click ⧉ Clone on a version whose structure isn't already in memory; force that fetch to fail | Clone is blocked with an app info-modal "Could not clone the proposal: could not load the source proposal's structure. Please try again." error (2026-10-07); no new cost grid/version is created on the API | |
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
| CG-71 | API refuses a new version on a published proposal (2026-10-07) | As admin, `POST /api/cost-grids/:id/versions` or `.../versions/:vId/duplicate` on a proposal that already has a non-Draft version | `400 { error, code: 'VERSION_RULE' }`; as sysadmin the same calls succeed (`201`); on a Draft-only proposal they succeed for admin too (test-api VR-01..VR-04) | ✓ |
| CG-72 | A viewer can still clone the version open in another user's editor (2026-10-07) | As a viewer (shared, non-edit access) on a proposal, open it and click ⧉ Clone | Clone succeeds; the pending-autosave flush that precedes Clone is skipped for a viewer (who cannot save the source), so it does not 403 and abort the clone | |
| CG-73 | Collapsible-card state persists per proposal (redesign cycle A, 2026-10-07) | Collapse "Offer details" on a SIP proposal, reload the page | Still collapsed after reload; a different proposal (or a fresh Draft) uses its own default (Draft open, non-Draft closed) unaffected by this one's saved state | |
| CG-74 | Role ⋮ menu: Move / Reset rate / two-click Remove | Open a role's ⋮ menu: use Move left/right, then set a custom rate and use "Reset rate", then click "Remove column" once (label changes to a confirm prompt) and click again | Move reorders the column; Reset rate restores the baseline rate and clears the custom styling; Remove column only deletes on the second click, and opening a different role's ⋮ menu does not carry over an armed remove-confirm from another role | |
| CG-75 | Select free / Clear phase and Select all free / Clear selection toggle correctly | Enter task selection (Generate project) on a phase with a mix of free and already-assigned tasks (some assigned by name only, after a rename, not by id) | "Select free (n)" selects only the genuinely free tasks (name-only-assigned tasks are correctly excluded); once all free tasks in the phase are selected the control becomes "Clear phase" and deselects them; the top-level "Select all free (n)"/"Clear selection" behaves the same way across the whole draft | |
| CG-76 | "Existing project" selection mode disabled with no linked projects | Enter task selection on a proposal with zero linked projects | The "Existing project" segment is disabled with a tooltip; only "New project" is selectable, and exactly one CTA ("Create project") renders | |
| CG-77 | Assigned-task lock icon and phase-delete guard | On a proposal with a linked project, open the grid: locate a task already in that project, and its parent phase | The task shows a lock icon (not a delete ✕) and an "In {project name}" line; the phase's delete ✕ is disabled with a tooltip, and attempting to delete the phase directly shows an info message instead of the confirm dialog | |
| CG-78 | Monthly Phasing stays visible with no period set | Open a fresh Draft proposal with no Start/End set | The "Monthly Phasing" card is still shown (not hidden), with "no period set" in its header and a message explaining Start/End need to be set in Offer details | |
| CG-79 | Offer details boxed field groups and header stage pill (Gate 2 fix, 2026-10-07) | Open any proposal in the redesigned editor | Period+Stage render inside two bordered panels side by side, and Client/Ratecard/Currency inside one "Client & rates" panel; the stage pill at the top of the header is a light pill (colored text on a tinted background matching the stage), not a solid dark chip | |
| CG-80 | Tags render in a 2-column grid when open | Open "Tags" on any proposal with more than one attribute list configured | The lists lay out in two columns side by side (one column only below ~768px), not stacked one under another | |
| CG-81 | Header fields survive an autosave (regression, 2026-10-07) | Open a populated non-Draft proposal (client, ratecard, currency, Period all set), change any field so an autosave fires, wait ~3 s, then reload the page | Stage, currency, client, ratecard and both Period months are unchanged. Before the fix every autosave reset them to SIP / EUR / Unassigned / none / empty, because cgSyncHeaderFromForm() read them from DOM ids the redesign had removed | |
| CG-82 | Stage can be changed on a non-Draft proposal | Open a SIP proposal, open the Stage control and pick a different stage | The trigger shows the new stage immediately, the header pill follows, and the change survives a reload. On a Draft proposal every real stage stays disabled with the "Publish the Draft to choose a stage" tooltip (G-12) | |
| CG-83 | Date pickers bound in both directions | On a task with From 11/05/2026 and To 31/12/2026, open To and page back before May; then open From and page forward past December. Repeat on the Offer details Start/End month pickers | In the To picker every day before the Start is disabled and the span between them is tinted; in the From picker every day after the To is disabled. Same for the month pickers. Typing an out-of-order date by hand is still accepted — deliberately deferred to the "cycle C dates" backlog | |
| CG-84 | Dropdowns are operable by keyboard | Tab to the Stage (or Currency / Rate card) control, press Space to open, then use Down/Up, Home/End, Enter and Esc | Space opens the list, the arrows move the highlighted row skipping disabled ones, Home/End jump to the first/last selectable row, Enter picks it and returns focus to the trigger, Esc closes without changing the value. Typing a letter jumps to the first row starting with it | |
| CG-85 | Calendar is operable by keyboard | Tab to a date field, then Tab once more to its calendar button and press Enter | The popover opens with focus on the currently selected day (or the first selectable one); the arrow keys move between cells, Enter picks, Esc closes. Clicking the text field instead keeps focus there so a date can still be typed | |
| CG-86 | Searchable Client picker after filtering | Open the Client control on a proposal whose client sits far down the list, type a query that leaves one or two matches, press Enter | The top matching client is selected. Before the fix the highlighted row was still the one from the unfiltered list, so Enter picked an unrelated client or did nothing at all | |
| CG-87 | Add roles modal selection state | Open "Add roles", tick two roles, dismiss with Esc, reopen; then tick three roles and type in the search box to filter them out | On reopen no checkbox is ticked and "Add selected" is disabled. After filtering away the ticked rows the count drops and the button disables again — it never offers to add a selection that is no longer on screen | |
| CG-88 | Viewer cannot edit the grid fields | Open a proposal shared with you as viewer, on a version that is not locked | Hours, PTC, task name and description, rate inputs, phase name, the Period/Stage/Client/Ratecard/Currency controls and Reassign are all read-only. KNOWN GAP (2026-10-07): the structural controls — Add roles, Add/Delete phase and task, the role menu, the selection bar, Generate project — are still gated on the version lock alone, so a viewer can trigger them; the server refuses the write, but the UI does not say so | |

---

## 5. Project Reporting (Portfolio)

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| R-01 | Portfolio loads | Open `/portfolio.html` | Header shows "Project Portfolio" and "N programs · N projects"; all accessible programs and projects listed in the Card grid (uniform cards, 3/2/1 columns by container width), mixed into one alphabetical order — corrected 2026-10-08, the former 2-column Bootstrap grid with full-width program rows and nested child grids is gone | |
| R-02 | Filter by client | Open the `Client` dropdown and tick one or more clients | Only projects of the ticked clients shown; the trigger reads "Client: N selected" and a "Clear filters" link appears — corrected 2026-10-08, the filter is a multi-select checkbox dropdown, no longer a single-select `<select>` | |
| R-03 | KPI cards | View project with phasing + actuals | Budget Estimated, Spent, Variance correctly calculated | |
| R-04 | Upload XLS actuals | On a project's detail page, click 📂 Load Actuals → select Excel file | Rows parsed and stored; KPIs and burndown chart update (chart redraws even when the upload happens without leaving the detail page) — corrected 2026-09, Load Actuals moved from the list-view card to the detail page's header action row | |
| R-05 | Burndown chart | Project with multi-month data | Estimated vs. spent per month rendered correctly | |
| R-06 | Gantt view | Switch to Gantt for project with phase dates | Phase bars aligned to correct date ranges | |
| R-08 | Share project | Owner clicks Share on a project | Share modal opens; can grant Viewer or Editor access | |
| R-09 | Navigate to project config | On a project's detail page, click ⚙️ Configure | Navigates to `/project-config.html?projectId=...` — corrected 2026-09, Configure is detail-page-only, no longer duplicated on the list-view card | |
| R-12 | KPI cards and burndown chart don't crash on a timesheet record with a missing task/role field | Have timesheet actuals containing a record whose `task` or `role` field is missing/undefined for a project with budget phasing configured; view that project's KPI cards and burndown chart | Budget Spent/Variance and the burndown chart render without a `TypeError` — `findRate()`'s task/role match (`js/core.js`) is null-safe; the malformed record simply doesn't match any configured rate (treated as €0) instead of crashing the whole page | |
| R-13 | List-view card shows identity + totals, no monthly table (2026-09) | Open `/portfolio.html`, inspect any project card | Card shows title, code, pipeline/status badges, an actuals-availability badge (`No actuals available` when no actuals uploaded), Duration, Sold, Spent, and a colored Variance (green when positive, red when negative) — no per-month breakdown table, no PTC column | |
| R-14 | List-view entry button always enabled, even with no actuals (2026-09) | Open `/portfolio.html`; find a project card with the `No actuals available` badge; click `Project Dashboard` | Navigates straight into that project's detail page — the button is never disabled, unlike the old `📊 View Report →` button it replaced (later renamed `Open project →`, then `Project Dashboard`) | |
| R-15 | Detail-page header hosts the relocated Load Actuals and Summary actions (2026-09) | Open any project's detail page | Header action row shows Configure, 📂 Load Actuals, Planning, Share, and ＋/✓ Summary — none of these five is gated on the project having actuals uploaded | |
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
| R-27 | Bottom "← Portfolio" has breathing room at the bottom of the page (2026-09; the footer was removed in Nav B2, 2026-10-02) | Open a project's detail page, scroll to the very bottom | The `← Portfolio` button has visible spacing below it, not flush against the bottom edge of the window | |
| R-28 | project-config.html navigation buttons — top and bottom pairs (2026-09) | Open an existing project's `project-config.html`; check both the top (next to the title) and bottom (next to Save) button rows | Both rows show `← Back to Portfolio` (goes to `/portfolio.html`) and `← Project Dashboard` (goes to `/portfolio.html?projectId=<id>`); for a brand-new, not-yet-saved project, `← Project Dashboard` is absent from both rows | |
| R-29 | List-view search matches project name, code, and client (2026-09) | On `/portfolio.html`, type a project's D365 code (e.g. a `HITA.xxx` value) into the search field | The list narrows to only the matching project; typing part of the project's own name or its client's name behaves the same way | |
| R-30 | List-view search skips the "unassigned" false match (2026-09) | Type "unassigned" into the search field | Does not match every client-less project on the literal word — only matches an actual project/code/real-client-name substring | |
| R-31 | List-view Status filter — multi-select OR, empty-status default (2026-09) | Open the Status dropdown; check "Started" and "Completed" together; separately, check "Not started yet" alone on a proposal known to have an empty `status` field | Checking two values shows the union (OR) of both; a project with no status stored is included under "Not started yet" — the same default its own status badge already shows | |
| R-32 | List-view filters combine with AND (2026-09) | Select a Client filter, then also check a Status value that excludes some of that client's projects | Only projects matching both the Client and the Status selection remain | |
| R-33 | Clear filters resets search/Client/Status but not Sort (2026-09) | Set a search term, a Client filter, and a Status selection; change Sort away from its default; click "✕ Clear filters" | Search, Client, and Status all reset; Sort is left unchanged; the "✕ Clear filters" link itself disappears once nothing is active | |
| R-34 | No-match empty state (2026-09) | Type a search term that matches no project | "No projects match the current filters." appears; no project cards are shown | |
| R-35 | Program groups auto-expand while filtering; manual toggle disabled (2026-09) | Search for a term that matches only a project inside a collapsed program group | The group expands automatically and shows the matching child, with no manual click needed; the "Show/Hide Child Projects" button is replaced by a non-interactive "▼ Shown (filtered)" badge while any filter is active; clearing the filter reverts the group to its last manually-set collapsed/expanded state | |
| R-36 | List-view Configure button (2026-09) | On a project card (grouped-child or ungrouped) where the viewer has owner/editor access, click "⚙️ Configure" | Navigates to `/project-config.html?projectId=<that project's id>`; the button is hidden entirely on a card where the viewer's permission on that project is `viewer` | |
| R-37 | Card/List toggle persists (2026-10-08) | Click `List` in the toolbar's segmented control, then reload the page (F5) | The List view is still selected after the reload (stored in `localStorage['PDash_portfolioLayout']`) | |
| R-38 | Invalid stored layout (2026-10-08) | Delete `PDash_portfolioLayout` (or set it to a junk value like `grid`), reload; repeat in a private window where storage throws | The overview opens in Card view, never blank | |
| R-39 | Same order in both views (2026-10-08) | Set `Sort: Client A–Z`, note the order in Card, switch to List | Identical order in both views (one shared row list); within the same client, programs come before projects | |
| R-40 | Alphabetical sort ignores kind (2026-10-08) | Set `Sort: Alphabetical` | Programs and projects interleave by name only, with no program-first grouping | |
| R-41 | Project without phasing (2026-10-08) | Open the overview with a project that has dates but no phasing and no actuals | The card is shown (not hidden) with `—` in Sold/Spent/Variance and `No budget` under an empty bar; a project with sold > 0 and nothing spent instead reads `0% spent` with an empty bar | |
| R-42 | Stage filter (2026-10-08) | Open the `Stage` dropdown and tick e.g. `Committed` | Only projects whose pipeline stage matches remain; combines with Client/Status/search by AND, multiple ticks within one filter by OR | |
| R-43 | New Project stays disabled (2026-10-08) | Hover and click `+ New Project` | Visibly disabled, shows the direct-creation tooltip, does not navigate | |
| R-44 | Program Dashboard inactive (2026-10-08) | Click a program card's `Dashboard`, and `Program Dashboard →` in the children panel | Neither navigates; both show `Program Dashboard — coming soon`. A project card's `Dashboard` does open the project detail | |
| R-45 | One program open at a time in Card (2026-10-08) | Click `Show N projects` on a program, then on another one; repeat at window widths giving 3, 2 and 1 columns | Only the second stays open; the children panel spans the full grid width and sits below the complete row containing its card, never mid-row | |
| R-46 | Children always visible while filtering (2026-10-08) | Type anything in the search box | Every program's children panel is shown, the footer toggle is replaced by the non-interactive `Shown (filtered)` label, and the panel's `Close` link is hidden (it would have nothing to close) | |
| R-47 | Expansion shared by the two views (2026-10-08) | Open a program in Card, switch to List, switch back to Card; then close it in Card (either `Hide projects` or the panel's `Close`) and switch to List and back | It is expanded in List and still open on return; after closing, it is collapsed in List and does not re-open on return — the close propagates through both close paths | |
| R-48 | Filtered-out open program (2026-10-08) | Open a program in Card, then apply a filter that excludes it | No orphan children panel is left behind | |
| R-49 | List child rows (2026-10-08) | In List, expand a program | Child rows are indented on a grey background, with empty Stage and Duration cells, a status pill, Sold/Spent/Variance and `Dashboard →`; no `Configure` anywhere in List | |
| R-50 | List program status text (2026-10-08) | In List, look at a program whose children include a `Started At Risk` one | The Status cell reads `N at risk` in dark navy (never red); with none at risk it reads `N projects` | |
| R-51 | Overview responsive (2026-10-08) | Narrow the window to ~390px in Card, then switch to List | Card: one column, no horizontal page scroll, cards and their stage pills fully visible. List: the `Duration` and `Spent` columns are hidden and the table scrolls horizontally within its own box | |

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
| PC-10 | Currency is read-only and survives a save (changed 2026-10-01: ISO codes in memory, then the currency lock) | Open a project: the Currency menu is disabled (hint under it); change another field, save; reload | The menu still shows the project's currency; DB keeps the ISO code (`EUR`, `USD`, …) and so does the in-memory project (no symbol↔code translation); the save sends the unchanged currency and is accepted (no 400, no FK violation). See PL-03 | |
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
| PC-21 | Leave-page prompt on unsaved changes (2026-09-30) | Open an existing project; (a) leave without edits; (b) click ⟳ Derive from task dates, confirm, then reload; (c) edit a field, click 💾 Save | (a) no prompt; (b) the browser's native leave-page prompt; (c) lands on the portfolio with no prompt | |
| PC-22 | No leave-page prompt for viewers | Open a project as a viewer, then reload | No prompt (editing is disabled) | |
| PC-23 | A failed sub-resource save does not look successful (2026-09-30) | On `project-config.html` make `PATCH /api/projects/:id/phasing` answer 500 (console fetch override), press 💾 Save | No redirect; red alert "Save failed: phasing was not saved. Fix the issue and press Save again."; Save enabled again; the other sub-resources were still attempted; form data intact. Verified in a browser 2026-09-30 | |
| PC-24 | A failed core save stops before the sub-resources (2026-09-30) | Make both `PATCH /api/projects/:id` and `POST /api/projects` answer 500, press 💾 Save | Alert "Save failed: project details were not saved…"; no tasks/phasing/ptc/planning/groups request is sent; no redirect. Verified in a browser 2026-09-30 | |
| PC-25 | Retry after a failed save (2026-09-30) | After PC-23/PC-24 remove the failure and press 💾 Save again (also for a new, never-saved project) | Redirect to the portfolio; the project exists once in `config.projects` (no duplicate for a new project). Existing project verified 2026-09-30; new-project path by code only | |
| PC-26 | Leave-page prompt stays armed after a failed save (2026-09-30) | After PC-23 leave the page with unsaved edits | The native leave-page prompt still appears (`savedSnapshot` is not refreshed on failure) | |
| PC-27 | Clearing a section is saved (2026-09-30) | Open a project with tasks, phasing or groups; delete every task (or empty the phasing / every group), press 💾 Save, reload the project | The section is empty after reload (before the fix the old data came back because empty sections were not sent). Other sections unchanged. Automated by `js/api-sync.test.js` | |

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
| PL-17 | Group toggle stays single-click after repeated re-renders | In By Project or By Owner view, type several characters in the Team assistant chat input (triggering re-renders; admin user), then click a group header to collapse/expand it | Group collapses/expands exactly once per click — no compounding/duplicate toggling from repeated re-renders | |
| PL-20 | By Role drill-down — collapsed by default (2026-09) | Select "By Role" | Each role row shows a ▶ toggle; no child rows visible; table looks identical to before this feature | |
| PL-21 | By Role drill-down — expand shows per-project/task breakdown (2026-09) | Click a role row's toggle (a role with hours on 2+ project/task combinations) | Row expands (▼); one child row appears per (project, task) combination, each with its own Sold/From actuals/To be planned and period cells; with "Rounded" off, the child rows' values sum exactly to the parent role row's own totals | ✓ (vitest, sumChildBreakdownHours) |
| PL-22 | By Role Expand all / Collapse all (2026-09) | In By Role, click "⊞ Expand all", then "⊟ Collapse all" | Expand all opens every role's drill-down at once (▼); Collapse all closes them all (▶) — same behavior already proven for By Project/By Owner | |
| PL-23 | By Project/By Owner unaffected by By Role's collapsed-by-default toggle (2026-09 regression check) | Select "By Project" (or "By Owner") | Groups still load fully expanded by default, as before; clicking a group header still collapses/expands it correctly on the very first click | |
| PL-24 | Inactive owner excluded from future hours (2026-09-28) | Mark a `resources` row `inactive` whose name matches an actuals owner on a task+role that also has another, active owner; open By Project and By Owner | The inactive owner's row shows unchanged past actuals with an "inactive" badge and 0 future/"To be planned" hours; the remaining active owner's future share is renormalized up (their relative ratio to any other active owners is preserved) | ✓ (node:test, `redistributeExcludingInactive` in api/src/lib/planning-distribution.test.js; server-side since 2026-09-29) |
| PL-25 | All owners on a task+role inactive → TBD row (2026-09-28) | Mark every actuals owner on a single task+role inactive | 100% of that task+role's future hours land on the `'—'`/TBD placeholder row (both views), not on any inactive owner's row and not silently dropped | ✓ (node:test, `redistributeExcludingInactive` in api/src/lib/planning-distribution.test.js; server-side since 2026-09-29) |
| PL-26 | Unmatched/ambiguous owner name treated as active (2026-09-28) | Have an actuals owner name with no matching `resources` row (or that matches multiple active resources by name) | That owner still receives its normal proportional future-hours share, no "inactive" badge | ✓ (node:test, `resolveOwnerStatuses`, now in api/src/lib/match-resource.js; tests in api/src/routes/resources.test.js and api/src/lib/match-resource.test.js) |
| PL-27 | XLS export mirrors the on-screen inactive badge (2026-09-28) | With PL-24's setup, export XLS from both By Project and By Owner | The inactive owner's row in the downloaded file has a `(inactive)` text suffix on the owner cell, on the same rows the on-screen badge appears; past-actuals numbers match the on-screen values exactly | |
| PL-28 | By Owner Sold hours stay actuals-proportional regardless of status (2026-09-28) | With PL-24's setup, open By Owner and compare the inactive owner's Sold column to their Actuals column | Sold moves with the owner's real actuals share (not zeroed out) even though their future ("To be planned") share is 0 — only future hours exclude inactive owners, Sold/Actuals attribution is unaffected by status | |

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
| CN-01 | Sub-menu order (2026-10, replaces the tab bar) | Open any Master Data page and look at the lateral menu next to the sidebar | Links from top to bottom: Clients, Client Groups, Pipelines & POTs, Roles & rates, Currencies; the current page is highlighted | |
| CN-02 | No Programs entry in Master Data (2026-10, Programs removed from Config) | Open any Master Data page, inspect the lateral menu and the page | No Programs link or panel anywhere in Master Data (programs are still managed from project-config.html / costgrid.html / portfolio.html) | |
| CN-03 | Rate-update confirmation modal appears (2026-09) | On the Currencies page (`master-currencies.html`), change an active currency's rate value and click Save | A confirmation modal opens ("Update exchange rate?") showing the old and new rate and explaining the change does not retroactively affect existing proposals/projects — the rate is not yet saved | |
| CN-04 | Rate-update confirmation — Cancel does not save | Trigger CN-03's modal, then click Cancel | Modal closes; the currency's rate in the table is unchanged | |
| CN-05 | Rate-update confirmation — Confirm saves | Trigger CN-03's modal, then click Confirm | Modal closes; the currency's rate and Last Updated date update in the table | |
| CN-06 | Rate-update confirmation ignores a fast repeat click | Trigger CN-03's modal, then click Confirm twice in quick succession before the first request resolves | Only one rate-update request reaches the API; the button shows a spinner and is disabled for the duration of the save | |
| MD-01 | Master Data — open /config.html | As admin, open `/config.html` (e.g. an old bookmark) | Lands on `/master-clients.html`; the Admin group of the sidebar shows "Master Data" highlighted | |
| MD-02 | Master Data — sub-menu on all five pages | On each of the five pages look at the lateral menu next to the sidebar, then click each link | Five links on every page, the current one highlighted; each link opens its page; no "Programs" entry anywhere | |
| MD-03 | Master Data — Clients and Client Groups | Create, rename and delete a client; open 💲 Costgrid on a client and save rates; on Client Groups create a group, assign and remove a client, delete the group | Every action behaves as it did on the old Config page | |
| MD-08 | Master Data — client rate card keeps per-currency overrides | With USD active and a client that has USD overrides on its rate card: on `/master-clients.html` open 💲 Costgrid, check the columns, change one EUR rate, Save rates, then reopen the rate card | A USD column is shown pre-filled with the stored overrides and the other non-EUR columns show "agency default" placeholders where the role has one; after saving, the USD overrides are still there on reopen | |
| MD-04 | Master Data — Pipelines & POTs | Create a pipeline year, open it, add/edit/delete a POT, open View Details, open the Proposal Phasing and Project Phasing views | Same behavior and totals as on the old Config page | |
| MD-05 | Master Data — Roles & rates | Create a role with a rate in each active currency, edit it, delete one that is unused and try to delete one assigned to a team resource | Rate fields appear for every active non-EUR currency; the blocked delete shows its error banner and scrolls to the top | |
| MD-06 | Master Data — Currencies | Activate a currency, change a rate (Cancel then Confirm in the confirmation modal), open a currency history | Same behavior as CN-03…CN-05 | |
| MD-07 | Master Data — layouts | On each page check three layouts: sidebar open, sidebar collapsed to the rail, and a window narrower than 1024px | The lateral menu is a column beside the sidebar at ≥1024px (also with the rail) and a scrollable row above the content below 1024px; no horizontal page scroll, no overlap with the sidebar or the breadcrumb | |

---

## 8. Configuration (`config.html`) — Clients

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| CF-01 | Clients page loads | Open `/master-clients.html` | All clients listed alphabetically; each row has 💲 Costgrid · ✏️ Edit · 🗑 buttons | ✓ |
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
| CG-G-01 | Client Groups page loads | Open `/master-client-groups.html` | All groups listed with assigned clients | ✓ |
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
| PP-01 | Pipeline list loads | Open `/master-pipelines.html` | All years listed with Visible/Hidden badges, POT Target column, Achievement column | ✓ |
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
| PP-39 | Phasing — Canceled/Draft excluded | Open "Proposal Phasing" view in `master-pipelines.html` | Canceled and Draft proposals not shown in the table regardless of stage filter applied | |
| PP-40 | Phasing — non-EUR EUR equivalent | Non-EUR proposal in Phasing view | Monthly cells show local amount on first line and EUR equivalent in parentheses below; Total column also shows EUR equivalent | |
| PP-41 | POT split — proposal preview panel | Open detail panel for a CG with a POT; client has both Committed and Anticipated proposals | POT section shows: "X% total" label + dual-segment progress bar (green=Committed, orange=Anticipated); three rows below bar: Total (C+A) with color, Committed in green, Anticipated in orange (only if > 0) | |
| PP-42 | POT split — master-pipelines.html POT list | Open Master Data → Pipelines & POTs → POT list for a year with proposals | Table shows three columns: "Total (C+A)" / "Committed" / "Anticipated" — all as EUR amounts; no single "Achievement" column | |
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
| AD-09 | Pipeline years absent | Open admin.html | No pipeline years section — managed in Master Data → Pipelines & POTs (`master-pipelines.html`) | |
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
| AD-34 | Sysadmin sees every admin-gated page and action | Log in as sysadmin; visit Config, Actuals Repository, User Admin; open Send Notification | All three admin pages reachable via the ADMIN section of the navigation (names since Nav B2: Master Data, Timesheets, User Admin) and functional; broadcast option present in Send Notification — sysadmin is a strict superset of admin everywhere except the two exclusives | |
| AD-35 | OBSOLETE since Nav B2 (2026-10-02) — superseded by N-11 (sidebar sections by role); was: Admin/Sysadmin navbar dropdowns — role visibility (2026-09) | Log in as role=user, then role=admin, then role=sysadmin; inspect the top navbar | user: neither "⚙ Admin" nor "🔒 Sysadmin" trigger shown. admin: only "⚙ Admin" shown (Config/Actuals Repository/User Admin inside). sysadmin: both triggers shown, "🔒 Sysadmin" holds DB Reset/Terms & Conditions | |
| AD-36 | OBSOLETE since Nav B2 (2026-10-02) — superseded by N-12; was: Admin/Sysadmin navbar dropdowns — active state | As sysadmin, open `/admin.html`, then `/_db-reset.html` | "⚙ Admin" trigger shows active state on `/admin.html`; "🔒 Sysadmin" trigger shows active state on `/_db-reset.html` — each trigger highlights only for pages inside its own submenu | |
| AD-37 | OBSOLETE since Nav B2 (2026-10-02) — superseded by N-17 (the navbar and footer it measured no longer exist); was: Admin/Sysadmin navbar dropdowns — pipeline board height unaffected | As sysadmin, open `/pipeline.html` | Both new dropdown triggers measure the same height as the other navbar tabs (44px); the pipeline board's sticky column-totals footer remains fully visible, not clipped | |
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
| NT-23 | Export ready notifies the requester in-app too (2026-09) | `POST /api/exports/{portfolio|cost-grids|ratecards}` (no UI since 2026-09-30) | Alongside the existing email, an in-app notification appears for the requester themselves — "Your export is ready" — previously email only | |

---

## 14. Exports (OBSOLETE 2026-09-30 — UI removed; `/api/exports/*` routes kept without UI)

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| EX-01 | OBSOLETE: Portfolio CSV | Settings → Data Manager → Export Portfolio | Email received with CSV attachment | |
| EX-02 | OBSOLETE: Cost Grids CSV | Click Export Cost Grids | Email with CSV: one row per task, role-code columns | |
| EX-03 | OBSOLETE: Rate Cards CSV (admin) | Click Export Rate Cards as admin | Email with matrix CSV: roles × clients | |
| EX-04 | OBSOLETE: Rate Cards hidden (non-admin) | Open Settings as role=user | Export Rate Cards button absent | |
| EX-05 | OBSOLETE: Full backup | Click Download Full Backup | JSON file downloaded with timestamp in filename | |
| EX-06 | OBSOLETE: Restore (admin) | Upload valid backup JSON | Data restored; success message shown | |

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
| TM-04 | Create resource — role dropdown (revised 2026-09-25, role by id) | Open `/team.html` → + New resource → fill name/email → pick a role from the Role dropdown (options read `label (code)`) → Create | Resource created with `role_id` = that role's id; row appears in the table with the role's label and code | ✓ |
| TM-05 | ~~Create resource — custom job title~~ **Obsolete 2026-09-25** | The free-text "Other…" job title no longer exists: every resource must have a role from `roles` (create the role in Config → Roles first) | — | |
| TM-06 | Create resource — role required (revised 2026-09-25) | + New resource → fill name/email, leave Role on its placeholder → Create | "Role is required" error shown; nothing created (the dropdown visibly shows the placeholder, not a role that looks pre-selected) | |
| TM-07 | Edit resource — current role pre-selected (revised 2026-09-25) | Edit an existing resource | The Role dropdown pre-selects the resource's current role; changing it and saving persists | |
| TM-08 | Deactivate / reactivate resource | Click Deactivate on an active resource, then toggle "Show inactive" | Resource disappears from the default view; reappears (status: inactive) once "Show inactive" is checked; Activate button restores it | |
| TM-09 | Delete resource | Click Delete on a resource → confirm in the modal (not a native browser dialog) | Resource permanently removed; disappears from the table (hard delete, unlike attribute list items below) | ✓ |
| TM-10 | PATCH resource — empty required field rejected | `PATCH /api/resources/:id` with `{"firstName": ""}` or `{"firstName": null}` | 400 "firstName cannot be empty" — not a 500, and the existing value is left unchanged | ✓ |
| TM-11 | Resource linked to a PDash user | Create/edit a resource with "Linked PDash user" set to an active user | Table's "Linked user" column shows that user's name instead of "—" | |
| TM-12 | `roleId` validated on create (2026-09-25) | `POST /api/resources` without `roleId`, with a non-UUID, with an unknown UUID, and with a valid role but an unknown `userId` | 400 for each; the unknown-role case says "Role not found" and the unknown-user case reports the user, not the role (both are FK violations, told apart by constraint name) | ✓ |
| TM-13 | Resource rows carry the role (2026-09-25) | `GET /api/resources` | Each row has `role_id`, `role_label`, `role_code`; there is no `job_title` | ✓ |
| TM-14 | Change / validate the role on update (2026-09-25) | `PATCH /api/resources/:id` with another `roleId`, then with an empty, non-UUID and unknown `roleId` | 200 with the new `role_id`; 400 for each bad value | ✓ |
| TM-15 | Renaming a role propagates (2026-09-25) | In Config → Roles (or `PATCH /api/roles/:id`) change a role's label/code | The resource shows the new label/code with no other action — the link is by id, not by string | ✓ |
| TM-16 | A role assigned to a resource cannot be deleted (2026-09-25) | `DELETE /api/roles/:id` for a role a resource uses, then after moving the resource to another role | 400 "Cannot delete role assigned to a team resource" (shown in the Config banner — the page scrolls up to it), then 200 | ✓ |
| TM-17 | Migration `025` backfill (2026-09-25) | Apply `025_resource_role_id.sql` on a DB whose `resources` still has `job_title`: (a) with a row matching no `roles.code`/`roles.label`, (b) after removing it, (c) applied again | (a) explicit `ERROR: Migration 025: N resource(s)…`, `job_title` kept; (b) success, `role_id` set by code (then label), `job_title` dropped; (c) no-op. Not automatable in `test-api.js` (no DB access) — verified manually on a throw-away DB; on the 2026-09-25 rollout `resources` had 0 rows | |
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
| TAG-10 | Duplicating a version copies its tags | Assign a tag to a proposal version, then `POST .../duplicate` with `{ label }` | The new version's tags include the same assignment | ✓ |
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

## 20. Resource Matching (2026-09, Cycle 3b)

Third cycle toward AI-assisted resource allocation, first sub-cycle of the resource profile (see `docs/superpowers/specs/2026-09-25-resource-profile-design.md` §4, `docs/api/resources.md`). The free-text owner names in uploaded actuals are matched to `resources` by an order-insensitive normalized name; names that don't match (or match ambiguously) land in a queue in `team.html`'s "Unmatched names" panel, where an admin assigns them to a resource or ignores them (an alias). Matching is exact — no fuzzy matching.

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| MA-01 | Endpoints require auth | `GET /api/resources/unmatched` and `/aliases` with no session | 401 | ✓ |
| MA-02 | Alias input validation | `POST /api/resources/aliases` with neither `resourceId` nor `ignore`, with both, an empty name, a punctuation-only name, a non-UUID or an unknown `resourceId` | 400 for each | ✓ |
| MA-03 | Re-adding an alias upserts | `POST` the same name again (different case) | 200 (an update, not 201 and not a 500); still exactly one alias row for that normalized name | ✓ |
| MA-04 | Upload feeds the queue | Upload a CSV/XLS of actuals (task/role valid on the project) | 201; the upload is unaffected if the queue refresh fails | ✓ |
| MA-05 | Automatic matching | Upload owners "SURNAME  Name" (inverted, different case) for an existing resource, an unknown person, and a blank owner | The inverted name is matched (not queued); the unknown person is queued with its hours and project count; the blank owner never enters the queue | ✓ |
| MA-06 | Assign a name | `POST` an alias for a queued name → resource | 201; the name leaves the queue; listed in `GET /aliases` | ✓ |
| MA-07 | Remove an alias | `DELETE /api/resources/aliases/:id` | 200; the name returns to the queue; a second `DELETE` → 404 | ✓ |
| MA-08 | Ignore a name | `POST` an alias with `ignore: true` | 201; the name leaves the queue | ✓ |
| MA-09 | Inactive resource matched only as a fallback (changed Cycle 3c) | Deactivate the matched resource, then reactivate; and create an active namesake of an inactive resource | An inactive resource still matches its name when no active one shares it (its history is kept, name stays out of the queue); an active namesake always wins; reactivating changes nothing | ✓ |
| MA-10 | Resource delete re-queues its names | Delete the resource; `POST /api/resources/unmatched/rescan` | 200; its names are queued again (aliases cascade-deleted); rescan → `{ ok: true }` | ✓ |
| MA-11 | Alias to an inactive resource | `POST` an alias pointing at an inactive resource (a leaver) | 201; the name leaves the queue | ✓ |
| MA-12 | Alias keeps the typed name | `POST` an alias, then `GET /aliases` | `display_name` is the name as sent, not only the normalized key | ✓ |
| MA-13 | Re-assignment is audited | Another admin re-assigns an existing alias | 200; `created_by` unchanged, `updated_by` is the second admin | ✓ |
| MA-14 | Hours have no float noise | Upload rows of 0.1 and 0.2 h for one unknown owner | Queue shows 0.3, not 0.30000000000000004 | ✓ |
| MA-15 | Panel end to end | In `team.html`, create a resource matching a name in the actuals, then press **Rescan** | The unmatched name lists with hours/projects; after creating the matching resource it disappears; **Assign**/**Ignore** remove a row and it appears under "Existing aliases" (showing the name as typed); **Remove** returns it | |
| MA-16 | Assign menu covers leavers | Open the "Assign to" select for a queued name | Ambiguous candidates first, then active resources, then inactive ones marked "(inactive)" | |
| MA-17 | Ambiguous name | Two active resources with the same name in different order; queue a matching owner | The row carries an "ambiguous" badge and is never auto-matched | |

---

## 21. Team UX (2026-09-25)

Frontend-only cycle for `team.html` (spec `docs/superpowers/specs/2026-09-25-team-ux-design.md`, `docs/pages/team.md`). The pure helpers are unit-tested with vitest (`js/lib/team-ui.test.js`, 17 cases — not counted as "Auto" here, which means `test-api.js` coverage); everything else is verified manually in the browser.

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| TU-01 | Sort helper (vitest) | `sortResources` by name/email/role/status, both directions, missing fields, equal rows | Last-then-first name order; case/accent-insensitive; desc flips only the primary key (ties stay name-ascending, then original order); input array not mutated; unknown key → name | |
| TU-02 | Combo filter helper (vitest) | `filterComboOptions` with accents, capitals, several words, blank/no-match queries | Every query word must be in the label (any order); accents/case ignored; blank query returns a copy of all options in order; no match → empty | |
| TU-03 | Page tabs | Open `/team.html`; click "Unmatched names" then "Team" | Opens on Team; the Unmatched tab shows a live counter that updates after Assign/Ignore/Rescan/Remove alias; switching tab closes an open detail panel | |
| TU-04 | Sortable table | Click Name, Email, Role, Status headers, then again | First click ▲ ascending, second ▼ descending, arrow only on the active column; search and "Show inactive" keep working; Linked user is not sortable | |
| TU-05 | Open/close the detail panel | Click a row; then ×, Esc, a click outside; then click a row's Edit/Deactivate/Delete | The panel opens for that resource; it closes with ×, Esc and an outside click; a row's action buttons do not open it (they close an open one and run their action); clicking another row switches resource | |
| TU-06 | Details tab and Edit | In the panel, read the Details tab; click Edit; press Esc in the modal; click inside the modal; Save | All fields incl. job description and linked user; Edit opens the modal on top of the panel; clicking inside the modal does not close the panel; **Esc with the modal open closes only the modal**; after Save the panel shows the new values | |
| TU-07 | Aliases accordion (moved 2026-09-25, Cycle 3c: from its own tab into a collapsed accordion at the bottom of Details) | Open the panel of a resource with aliases; expand the Aliases accordion; Remove one | Only this resource's aliases (as typed); Remove works and the name returns to the queue (tab counter updates); "No aliases for this resource." when empty; a failed Remove shows its error inside the panel | |
| TU-08 | Experience profile tab | Open the tab (superseded by PE-15 to PE-18 in Cycle 3c: it now shows the calculated profile, not a placeholder) | Loading, then the tree, or "Not calculated yet" / "No actuals matched to this person yet" | |
| TU-09 | Panel follows the data | With the panel open, delete the resource (via the API or another session) / reload the list | The panel closes instead of showing stale data; after an Edit → Save it shows the new values | |
| TU-10 | Searchable assign control | In Unmatched names, type in a row's "Assign to": an accented name, "surname name" in reverse order, part of a name | The list filters live; "(inactive)" resources are marked; possible namesakes are first; "No matches" when nothing fits | |
| TU-11 | Assign control — choice and keyboard | Pick an option with the mouse; then clear via "— none —"; arrows/Enter/Esc; Tab through several rows | A mouse pick registers (not lost to the outside-click handler); "— none —" clears and **Assign** goes disabled again; arrows move (the active row scrolls into view), Enter picks, Esc closes; Tabbing away closes the list (no stacked lists); Enter on a no-match query does not clear an existing choice | |
| TU-12 | No regression on the page | Create/edit/toggle/delete a resource, Rescan, Assign, Ignore | All work as before; narrow window (~700px): the panel takes the full width and is closable | |
| TU-13 | Team tab paging | Team tab with 26+ active resources | Shows "Page 1 of 2" and Previous/Next controls; Next shows the remaining rows; changing the search text or clicking a sortable header resets to page 1 | |
| TU-14 | Team tab paging — no controls under threshold | Team tab with 25 or fewer resources | No pagination controls shown | |
| TU-15 | Unmatched names — search | Unmatched names tab: type in the search box | Filters rows by name (case/accent-insensitive); clearing it shows all rows again | |
| TU-16 | Unmatched names — sort | Unmatched names tab: click the Name/Hours/Projects headers | Sorts ascending, a second click reverses it, with an arrow on the active header | |
| TU-17 | Unmatched names — expandable project list | Unmatched names tab: click a row's Projects count | Expands "Project name (CODE)" for each project that name appears in, sorted alphabetically by name; clicking again collapses it | |
| TU-18 | Unmatched names — paging | Unmatched names tab with 26+ rows: page, then assign/ignore a name that empties the last page | Pagination controls shown; assigning/ignoring a name that empties the last page returns to a valid page instead of a blank one | |
| TU-19 | Team tab paging — edit does not reset the page | On page 2+ of the Team tab, Edit/Save, Activate/Deactivate, or Delete a row (without emptying the current page) | The current page stays the same — only changing the search text, "Show inactive", or clicking a sortable header resets to page 1 | |

---

## 22. Profile Engine (2026-09-25, Cycle 3c)

Third sub-cycle of the resource profile (`docs/api/profile-engine.md`, `docs/pages/team.md`). Per-person hours from matched actuals are computed in the background (queue plus a 60 s worker, 10-minute default interval) into a cached profile shown on `team.html`'s Experience profile tab. PE-01 to PE-14 are covered by `test-api.js`; PE-15 to PE-21 are the manual checklist. Pure logic is unit-tested with `node:test` (`resource-profile.test.js`, `job-schedule.test.js`, `match-resource.test.js`) and vitest (`buildProfileTree`).

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| PE-01 | Profile endpoints require auth | `POST /api/profile-jobs/run` and `GET /api/resources/:id/profile` with no session | 401 for both | ✓ |
| PE-02 | Profile of an unknown resource | `GET /api/resources/:id/profile` with an unknown UUID and with a non-UUID id (admin) | 404 for both (not a 500) | ✓ |
| PE-03 | Upload, run, profile | Upload actuals for two project codes (one owner matches a resource, one does not); `POST /api/profile-jobs/run`; `GET` the profile | 201, then 200 `{ ok: true }`; the resource has a profile and `profile_computed_at`; totals are 13 h over 2 projects, 2026-01 to 2026-03; the unmatched owner is excluded | ✓ |
| PE-04 | Market dimension | Tag project P1 with a Market value, leave P2 untagged; run; read the profile | The Market value covers P1 (10 h); the 3 h of P2 are `untaggedHours` | ✓ |
| PE-05 | Tasks and roles | Read the profile after PE-03 | Tasks are listed per project; roles are the role codes of the actuals | ✓ |
| PE-06 | Project isolation | Re-upload P1 with fewer hours (10 h to 2 h); run | Total becomes 5 h; P2's entry is identical to before | ✓ |
| PE-07 | Tag change re-queues | Tag P2 with the same Market value via the projects tags route; run | The value now covers 7 h and nothing is untagged, without a new upload | ✓ |
| PE-08 | Alias change re-queues | Assign an extra owner name as an alias of the resource; run | Before the alias the hours are unchanged (7 h); after it the name's hours count (8 h) | ✓ |
| PE-09 | Deleting actuals removes hours | `DELETE /api/timesheets/:projectCode` for P2; run | 200; P2 disappears from the profile (1 project, 2 h left) | ✓ |
| PE-10 | Rebuild is reproducible | Trigger a resource change that queues every code; run | The rebuilt profile is identical to the previous one | ✓ |
| PE-11 | Inactive resource keeps its name match | Create an inactive resource whose name is in the actuals; run | Matched by name with no alias: hours and last month present | ✓ |
| PE-11b | Deactivating keeps the hours | Give a resource a profile, deactivate it, run | The hours are still there (8 h) | ✓ |
| PE-12 | List value rename and project code change | Rename an attribute-list value; change a project's code; run | The new label shows in the profile; both the old and the new code are queued and the run completes without errors | ✓ |
| PE-13 | Resource without matched actuals | Create a resource whose name is in no actuals; run | Profile is `null` but `profile_computed_at` is set (the UI reads "No actuals matched") | ✓ |
| PE-14 | Project rename re-queues | Rename a project that has actuals; run | The profile shows the new project name | ✓ |
| PE-15 | New people get a profile within the run interval | Upload actuals whose owners match new resources; wait for the worker (default 10 min) without pressing anything | Each person's Experience profile tab shows their hours after the next run |  |
| PE-16 | Tags produce the tree | Tag projects with Market values; open a person's Experience profile tab | Tree Market, then value, then project, then tasks; hours and share per value; an "N h on projects without a value" note for untagged projects; a Roles block below |  |
| PE-17 | Person without matched actuals | Open the tab for a person whose name is in no actuals, and for a brand-new person right after creating them | First: "No actuals matched to this person yet" with a link to the Unmatched names tab (link switches tab). Brand-new before any run: "Not calculated yet" |  |
| PE-18 | Alias adds hours; deactivating keeps them | Assign an unmatched name to a person; wait for the next run; then deactivate that person and wait again | The hours appear after the run; after deactivation the name-matched hours are still shown |  |
| PE-19 | Interval and on/off via app_settings | Change `profile_job_interval_min`, then set `profile_job_enabled` to `false`, then back to `true`, directly in `app_settings` (no API restart) | The worker follows the new interval; while `false` no scheduled run happens and the queue waits; on `true` it resumes within a minute |  |
| PE-20 | Bootstrap rebuild | With actuals uploaded, empty `resource_project_contributions` and restart the API | About 5 s after start a `bootstrap` run rebuilds contributions and profiles (run row in `profile_job_runs`) |  |
| PE-21 | Unmatched list and aliases accordion | Upload actuals with an unknown name; open the panel of a person | The name is in the Unmatched names list immediately (no wait for the worker); in the Details tab the Aliases accordion is collapsed by default with a count badge and opens to the person's aliases |  |

---

## 23. Profile Jobs Console (2026-09-28, Cycle 3d)

Admin-only console for the profile engine (`docs/pages/profile-jobs.md`, `docs/api/profile-engine.md`): see the queue, force a recalculation (all/one code/a full rebuild), pull a code out of the queue, tune the worker schedule, read recent run history. Hidden page, no menu entry, reached only via a "Profile processing →" button on `timesheets.html`. PJ-01 to PJ-13 are covered by `test-api.js`; the rest are the manual checklist (§8 of the design spec calls these non-deterministic). Pure logic (`nextRunInfo`, `shouldRecordRun`, `jobSettingsError`, `deriveProjectStatus`) is unit-tested with `node:test` (`job-schedule.test.js`); the frontend helpers (`filterJobProjects`, `sortJobProjects`, etc.) with vitest (`profile-jobs-ui.test.js`).

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| PJ-01 | Console routes require auth | Every console route (`GET /`, `PUT /settings`, `POST /run`, `POST /rebuild`, `POST /projects/:code/process`, `DELETE /projects/:code/queue`, `GET /runs`) with no session | 401 for all | ✓ |
| PJ-02 | Console routes require admin | Every console route as a plain (non-admin) user | 403 for all | ✓ |
| PJ-03 | Console state shape | `GET /api/profile-jobs` | `{ settings, schedule: { state, lastRunAt, nextRunAt }, queuedCount, projects[] }`; `queuedCount` equals the number of rows with `queued_at`; each row carries code, name, row/resource counts, queue state, last error and status | ✓ |
| PJ-04 | Settings validation | `PUT /api/profile-jobs/settings` with `enabled`/`intervalMin` of the wrong JSON type (strings, floats, 0, 1441, missing fields, empty body) | 400 for every case; the stored settings are left unchanged | ✓ |
| PJ-05 | Settings bounds and pause | `PUT` with `intervalMin` 1 and 1440 (accepted); `enabled: false` | 200, echoes saved settings; `GET` reads them back and `schedule.state` is `'paused'` with `nextRunAt: null` | ✓ |
| PJ-06 | Process one code | Upload actuals for two codes (both queued); `POST /projects/:code1/process` | 200, exactly one project processed; that code leaves the queue and is "updated"; the other code is still "queued"; recorded as a `manual` run with 1 project | ✓ |
| PJ-07 | Remove from queue leaves the profile alone | `DELETE /projects/:code/queue` on a queued code | 200; the code is no longer queued; the already-computed profile is byte-identical to before | ✓ |
| PJ-08 | Unknown/invalid codes | `process`/`queue` on an unknown code, a blank code, a 101-character code | 404 for unknown, 400 for blank/too-long; the unknown code never appears in the list | ✓ |
| PJ-09 | Code with dots and a space | Create a project whose code has dots and a space (`HITA.000001586.001`-style); process it via the URL-encoded code | 200, processed; listed under its exact code with the project name, 0 rows, status "updated" | ✓ |
| PJ-10 | Code known only to `profile_project_state` | Delete a project with no actuals (the delete hook re-queues its code) | The code stays listed with its own code as name, 0 rows, queued; still processable and removable from the queue | ✓ |
| PJ-11 | Rebuild all | `POST /rebuild` | 200, every queued code processed, no errors; queue is empty afterward; recorded as one `manual` run with the same project count | ✓ |
| PJ-12 | Run history cap | Run the engine 51+ times | `GET /runs` returns exactly 50 rows, newest first | ✓ |
| PJ-13 | Concurrent actions never 500 | `Rebuild all` and `Process` on the same code at (nearly) the same time | Each answers 200, or 409 with "A profile job is already running — try again in a moment." plus a note that the codes stay queued — never a 500 or a duplicate run | ✓ (timing-tolerant) |
| PJ-14 | Badge on Timesheets | Upload actuals for a new code, reload Timesheets | The "Profile processing →" button shows a badge with the queue count; hidden when the queue is empty |  |
| PJ-15 | Settings widget, no restart | Toggle scheduled processing off, wait ~2 min, confirm no new `scheduled` history rows, toggle back on | Applies without an API restart; "Saved — applies on the next tick (within 60 s)" shown after every save |  |
| PJ-16 | Filters and sort | Search by part of a code and by project name; filter by status; sort by Code/Status/Last processed | Matches only the expected rows; never-processed rows sort last in both directions |  |
| PJ-17 | Error row expand | With a row in Error status, hover the badge and click it | Tooltip and expanded row show the full error message |  |
| PJ-18 | Auto-refresh | Leave the page open across a worker tick; switch tabs for a minute and back | List updates within 15 s automatically; refreshes immediately on return to the tab |  |
| PJ-19 | Network error banner | Stop the API container briefly (isolated branch stack only, never the main stack) while the page is open | A global network-error banner appears and clears on the next successful refresh |  |
| PJ-20 | Non-admin permissions | Log in as a non-admin user, navigate to `/profile-jobs.html` | Redirected to `/pipeline.html`; `GET /api/profile-jobs` in devtools returns 403 |  |

---

## 24. Profile descriptions and topics (2026-09-29)

Project/task descriptions, the shared competence-topic vocabulary and its LLM extraction (`docs/api/topics.md`, `docs/api/profile-engine.md`). `PD-*`, `TP-*`, `TX-*`, `PT-*` run in `test-api.js`; the `TX-*` extraction cases need the local LLM stub that only exists in the isolated stack (`scripts/run-tests.sh`, `docs/scripts/run-tests.md`) and are skipped elsewhere. Pure logic is unit-tested with `node:test` (`topic-extract.test.js`, `resource-profile.test.js`) and `buildProfileTree` topics with vitest (`team-ui.test.js`).

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| PD-01 | Project description stored | Create a project with a `description`; `GET /api/projects/:id` | The description is returned | ✓ |
| PD-02 | PATCH updates it | `PATCH /api/projects/:id { description }` | 200; the new text is returned | ✓ |
| PD-03 | Empty description | `PATCH` with `description: ""` | 200; stored as an empty string (not NULL) | ✓ |
| PD-04 | Task descriptions | `PUT /api/projects/:id/tasks` with per-task `description`; `GET .../tasks` and `GET /api/projects` | Descriptions round-trip; `""` when none | ✓ |
| PD-05 | Queue only on change | Save identical task descriptions / an unchanged project description, then change each | The project code is queued only when a description actually changed | ✓ |
| PD-06 | Description in project-config | Open a project, type a project and a task description, Save, reload | Both persist; a viewer sees them disabled |  |
| PD-07 | Generate project copies text | In a proposal fill Description and a task description, Generate project, open the project | Project and task descriptions are pre-filled; editing them later does not change the proposal |  |
| TP-01 | Topics API requires auth | `GET /api/topics` with no session | 401 | ✓ |
| TP-02 | Create validation | `POST /api/topics` with a duplicate name (case/space-insensitive), an empty name, more than 4 words | 409 for the duplicate; 400 for the others | ✓ |
| TP-03 | Attribute-list values are not topics | Create or rename a topic to the label of an active attribute-list item | 400 | ✓ |
| TP-04 | Rename | `PATCH /api/topics/:id` with a new name; with a name already used | 200 renamed; 409 on the duplicate | ✓ |
| TP-05 | List filter | `GET /api/topics?status=approved`; `?status=bogus` | Only approved topics with `usage_count`; 400 for an unknown status | ✓ |
| TP-06 | Reject / restore / approve | reject, reject again, restore, approve an approved topic | 200 rejected; 409; 200 approved; 409 | ✓ |
| TP-07 | Merge | Merge into itself; merge b into a; re-merge / merge into a merged or a rejected topic; rename a merged topic | 400; 200 and b leaves the list; 409 for the others | ✓ |
| TP-08 | Malformed id | Any `/api/topics/:id/...` with a non-UUID id | 404 | ✓ |
| TP-09 | Topics tab | In `attribute-lists.html` open the Topics tab; approve, rename, merge, reject, restore a topic | Queue/approved/rejected lists update; server errors are shown; the tab badge counts proposed topics |  |
| TP-10 | Approved topic cannot be merged into a non-approved one | Merge an approved topic into a proposed topic; then a proposed topic into an approved one | 409 and the approved topic is untouched; 200 for the reverse (labelled `TX-11` in `test-api.js`) | ✓ |
| TX-01 | Saving never calls the LLM | Save project and task descriptions (also with no API key) | 200, no error | ✓ |
| TX-02 | Extraction on the worker | Run the profile queue after a description change | The stub LLM received the project text | ✓ |
| TX-03 | New topics are proposed | Answer with new competences for the project and a task | Created as `proposed` | ✓ |
| TX-04 | Server-side filtering | Stub answers with a list-value equivalent, a name equal to a list value, and a rejected topic | None of them is created or linked | ✓ |
| TX-05 | Process re-extracts | Unchanged text: run the queue (no call); `POST /projects/:code/process` | No call for the unchanged text; Process sends it again | ✓ |
| TX-06 | Short text | A description under 20 characters | Never sent to the LLM | ✓ |
| TX-07 | Errors do not leak | Stub answers with an HTML body / an HTTP 500 / a text answer that is not JSON | Profile still built; `topic_error` set; the message does not echo the response body | ✓ |
| TX-08 | Retry clears the error | After a failure, the stub works again; run again | `topic_error` cleared; topics created | ✓ |
| TX-09 | Kill switch | `PUT /api/profile-jobs/topic-settings { enabled: false }`, change a description, run; then `{ enabled: true }` and run again | While off the LLM is not called; on re-enabling, texts edited meanwhile are re-queued and extracted | ✓ |
| TX-10 | Persistent failure is not work | Stub keeps failing; run three times, then succeed | The first failure counts as work, repeats do not and add no run errors; the later run is clean | ✓ |
| TX-11 | Console UI | On `profile-jobs.html` toggle Topic extraction; provoke a failure | "extraction failed" with the error as tooltip; the switch state persists |  |
| PT-01 | Proposed topics hidden | `GET /api/resources/:id/profile` while topics are proposed | `profile.topics` is an empty array | ✓ |
| PT-02 | Approve shows at once | Approve a project topic and a task topic | Project topic appears for contributors; task topic only for the person with actuals on that task; no recalculation | ✓ |
| PT-03 | Rename shows at once | Rename an approved topic | New name in the profile | ✓ |
| PT-04 | Merge shows at once | Merge two approved topics | One chip, no duplicates | ✓ |
| PT-05 | Reject removes at once | Reject an approved topic | Gone from the profile | ✓ |
| PT-06 | Every contributor | Two people with actuals on the same project | Both receive the project topics | ✓ |
| PT-07 | Topics block | Open team.html, a person, Experience profile | "Topics" chips with project counts and a project tooltip; "No topics yet." when empty |  |

---

## 25. Planning model (2026-09-29)

`POST /api/planning/model` and the page that renders it (`docs/api/planning-model.md`, `docs/pages/planning.md`). `PM-01..PM-07` run in `test-api.js`; the calculation itself is unit-tested with `node:test` (`planning-calendar`, `planning-distribution`, `planning-model`, `planning-request`, `match-resource` incl. `resolveOwnerStatuses`) and the client adapter with vitest (`planning-model-ui.test.js`). Manual cases cover visibility and the page behaviour. The removed browser calculation is covered by these backend tests (the earlier `PL-*` cases about it, e.g. PL-06/07/09/10/11, now describe rules enforced by `planning-model.test.js` / `planning-distribution.test.js`).

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| PM-01 | Auth required | `POST /api/planning/model` with no session | 401 | ✓ |
| PM-02 | Request validation | POST with an unknown `view` and an unparseable `from` | 400 with per-field errors (`fields.view`, `fields.from`) | ✓ |
| PM-03 | Role view | Project with a 100 h Consultant task and 10 h of actuals; POST `view: "role"` with a duplicate and an unknown project id | 200; Consultant role with sold 100, actuals 10, cells over several weeks whose planned hours add up to the 90 h residual; duplicate/unknown ids ignored | ✓ |
| PM-04 | Project and owner views | POST `view: "project"` and `view: "owner"` for the same project | Project view returns the task/role tree with consumed hours; owner view returns the owner map and `ownerStatus` (unmatched owner = active) | ✓ |
| PM-05 | Team filter | POST with `teams: ["NoSuchTeam"]` | 200 with no roles | ✓ |
| PM-06 | Cache invalidation | Re-upload actuals for the project, then POST again | The new hours are visible immediately (write invalidates the 30 s cache) | ✓ |
| PM-07 | Visibility | As a non-admin user who is neither owner nor shared on a project, request the model with that project id | 200 with an empty projection (`roles`/`projects` `[]`, `ownerMap` `{}`, `ownerStatus` `{}`: no owner name leaks) | ✓ |
| PM-08 | Loading and error states | On `/planning.html` switch view/window quickly; then make `POST /api/planning/model` fail (devtools request blocking) and change a filter | Only the latest response is rendered (no flicker back to an older one); while loading the view shows "Loading planning data…"; on failure a red "Could not load the planning data" message and Export XLS does nothing | |
| PM-09 | Parity procedure (baseline vs migrated page) | Seed `api/src/scripts/seed-planning-golden.js`; on `/planning.html` run `window.__planningGoldenStart({label})` (`scripts/planning-golden-capture.js`) detached in the console, poll `window.__golden`; do it with the old code (baseline) and the migrated page on the same calendar day and compare | 144/144 combinations identical on `exportRows`, `periodMeta` and HTML hash (Phase 1). After Phase 2 only By Role combinations may differ (28 of 144 on the seeded data) |  |
| PM-10 | Sunday actuals row (known quirk) | Upload an actuals row dated on a Sunday in a past week; compare By Role / By Project with By Owner | The hours count in Sold/Actuals totals everywhere; By Role and By Project do NOT place them in any week cell, By Owner does. Replicated on purpose for parity; will change when the quirk is fixed deliberately |  |
| PM-11 | Monthly distribution independent of the window (Phase 2) | A task with a 40/30/30 monthly distribution over three future months; open By Role with a window showing all three, then only two of them | The same per-week hours in the shared months in both windows (no 57/43 re-scaling); "To be planned" is smaller in the narrow window; By Project and By Owner unchanged |  |

## 26. Team assistant (2026-09-30)

`POST /api/planning-assistant/rank` and `/chat` and the Team assistant panel in `planning.html` (`docs/api/planning-assistant.md`, `docs/pages/planning.md`). `PA-01..PA-12` run in `test-api.js` (the chat cases `PA-09..PA-11` need the LLM stub of `scripts/run-tests.sh`); the pure logic is unit-tested with `node:test` (`team-params`, `team-load`, `team-requirement`, `team-scoring`, `team-ranking`, `assistant-chat`, `planning-compute`, `services/llm`) and vitest (`team-assistant-ui`, `team-ui`). `PA-M1..PA-M3` belong to `/finish-cycle` Gate 2.

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| PA-01 | Auth required | `POST /api/planning-assistant/rank` with no session | 401 | ✓ |
| PA-02 | Admin only | `/rank` as a plain (non-admin) user | 403 | ✓ |
| PA-03 | Request validation | `/rank` with `params: { topN: 99, bogus: 1 }`; then with `asOf: "x"` | 400 with per-field errors (`fields.topN`, `fields.bogus`); an invalid `asOf` is 400 | ✓ |
| PA-04 | Unknown project and project without work | `/rank` with an unknown project id; then with a project that has no role with planned hours | 404 for the unknown id; 422 for the project with nothing to allocate | ✓ |
| PA-05 | Best team and requirement | Person with 50 h of history on the role (profile rebuilt), target project needing that role; `/rank` | 200; the person is in the best team with score > 0 and `roleHours` 50; `requirement.roles[0].code` is the required role | ✓ |
| PA-06 | Availability from the planning model | (a) nobody else loads the person; (b) upload actuals and a large residual on another project in the same weeks; `/rank` each time | (a) `freeAvg` 32 h/week; (b) almost no free hours, and in the available table `rank` is lower than `score` | ✓ |
| PA-07 | Exclusions and unknown names/roles | `params.excludeResources` with the person; with an unknown name; `params.roles` with an unknown role | The excluded person is in no table; unknown name and unknown role are 400 with `fields.excludeResources` / `fields.roles` | ✓ |
| PA-08 | Chat validation and auth | `POST /api/planning-assistant/chat` with no session; with `messages: []`; with a last message from the assistant; with a user message over 4000 chars; with an assistant message over 4000 chars in the history | 401; 400; 400; 400 `fields.messages`; accepted (truncated, not 400) | ✓ |
| PA-09 | Chat tool round trip (LLM stub) | `/chat` while the stub model answers with a `rank_team` tool call (`topN: 2`) and then a summary | 200; the reply is the model summary; `params.topN` is 2; `tables.best` come from the backend ranking; the tool result was fed back to the model; the project summary is sent inside `<project_data>` | ✓ |
| PA-10 | Invalid tool parameters | Stub model calls `rank_team` with `topN: 99` | 200 with `tables: null`; the model receives "Invalid parameters" and the conversation continues | ✓ |
| PA-11 | LLM failure | Stub model answers HTTP 500; then `/rank`; then the stub calls `rank_team` and fails on the next call | `/chat` 503 `Assistant unavailable` with no provider body in the response; `/rank` still 200; after a successful ranking the failure gives 200 with the tables and a fallback reply | ✓ |
| PA-12 | Unknown tag list/value | `/rank` with `requireTags` on an existing list with a value that does not exist; `preferTags` on an unknown list | 400 with `fields.requireTags` / `fields.preferTags` naming the entry and listing the valid ones | ✓ |
| PA-M1 | Real Anthropic chat round trip (Gate 2) | With `ANTHROPIC_API_KEY` set, open a project in the Team assistant, press a starter prompt, then add a constraint ("exclude <name>") and ask "Why is <name> not among the best?" | A short summary in the language typed, tables refreshed with the constraint kept on the second turn, an explanation citing score components and availability; no invented people or hours |  |
| PA-M2 | Weight tuning review on real data (Gate 2) | On real data (about 150 people, profiles rebuilt), run "Calculate team" for 3-5 known projects and compare the top rows of each table with the planner's expectation | The planner agrees with most of the top rows; disagreements are recorded with the project/role so the initial weights in `team-scoring.js` can be adjusted (record the proposed changes) |  |
| PA-M3 | /rank response time on real data (Gate 2) | Press "Calculate team" twice (second call with a warm planning cache) and read the request time in devtools | Under 3 s with a warm cache; record the measured numbers (cold and warm) |  |
| PA-M4 | Plain user does not get the assistant | Log in as a plain user and open `/planning.html`; then call `POST /api/planning-assistant/rank` from the console | No "Team assistant" button; the API answers 403 |  |
| PA-M5 | Profile version 2 after Rebuild | Run "Rebuild" from `profile-jobs.html`, then open a person with topics in `team.html` → Experience profile | Topics appear under "Direct experience" and "Project context"; before Rebuild they show as "Topics (provenance not available — recalculate profiles)" |  |
| PA-M6 | Old personal AI keys are wiped | In a browser that still has a `PDash_settings` entry in localStorage, load any page | The key is gone after the first load |  |
| PA-M7 | Selection resets when a filter removes the project (2026-09-30) | In `planning.html` open the Team assistant, select a project, then change a page filter so that project disappears; repeat with a filter that keeps it | Removed: select returns to "Select a project…" and chat/tables clear; kept: nothing changes.  Verified in a browser 2026-09-30. | |
| PA-M8 | Enter during IME composition does not send (2026-09-30) | In the assistant textarea compose text with an IME and press Enter to confirm; then Shift+Enter; then plain Enter | IME-confirming Enter does not send; Shift+Enter inserts a newline; plain Enter sends. Verified in a browser 2026-09-30. | |
| PA-M9 | Planning shows data right after load (regression fixed 2026-09-30) | With at least one active project, open `/planning.html` | The views list the projects at once (not "No resource data found") and the Team assistant project select lists them | |

## 27. Hardening (2026-09-30)

Closing of the open findings of the tag cycle (`docs/superpowers/specs/2026-09-30-hardening-open-findings-design.md`). `HD-01..HD-03` run in `test-api.js` (`VS-01..VS-16`, `PV-01..PV-05`, `TS-01/TS-02`); `api-sync.js`'s `skipEmpty` is unit-tested in `js/api-sync.test.js`; `HD-04..HD-07` are manual.

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| HD-01 | Version routes are scoped to their grid | As a user with access to grid A, call each of the cross-grid routes (PATCH/DELETE/duplicate of a version, structure GET/PUT, linked-projects GET/POST/DELETE, refresh-rate, publish, tags GET/PUT) with a version id that belongs to grid B, and with a non-UUID version id | 404 `{ error: 'Version not found' }` for every route; no change to grid B; 401 before 404 (automated by VS-13); the 403 for a user without access stays in the handlers (canEdit/canAccess), unchanged | ✓ |
| HD-02 | PATCH project rejects a non-UUID link id | `PATCH /api/projects/:id` with `cgVersionId: 'abc'`, then `clientId: 'abc'`; then with `cgVersionId: null` and an empty string | 400 `<field> must be a valid UUID` (field = cgVersionId or clientId) for the malformed values; null and empty string still unlink the client, and the version of a project that has none (a project that is linked to a proposal can no longer be unlinked by a non-sysadmin, see PL-05 / `PR-06`) | ✓ |
| HD-03 | Admin reading a project without actuals | `GET /api/timesheets/:projectCode` for a code with no actuals as an admin, then as a plain user without access to it | Admin/sysadmin: 200 `[]`; plain user: 403 (rule unchanged) | ✓ |
| HD-04 | Tag rollback ignores a version switch | Open a version with a tag in `costgrid.html`; in the console make `PUT .../tags` answer 500 after a 2-second delay (`fetch` override); click a tag, then switch to another version within 2 s | The other version's tags and checkboxes stay as loaded (the failed PUT's rollback is not applied to the wrong version) |  |
| HD-05 | No 403 for an admin on a project without actuals | As an admin open `project-config.html` for a project that has no actuals and watch the console/network | No 403 on `GET /api/timesheets/:code`; the page loads normally |  |
| HD-06 | Stale copy cannot wipe project sections | Precondition: the project has no phasing, PTC, planning or groups when tab 1 is opened (skipEmpty only protects sections that were empty in the stale copy). Tab 1: open `costgrid.html` (leave it). Tab 2: in `project-config.html` set a phasing and save. Tab 1: press "Add tasks to project" (and, separately, Generate project) | After reopening `project-config.html` the phasing (and PTC/planning/groups) is still there; clearing a section in `project-config.html` itself still works |  |
| HD-07 | Regression walk of costgrid.html | Open a grid, switch versions, duplicate a version, link a project, delete a Draft version, refresh the rate, add tasks, Generate project | All actions work with no console errors |  |

## 28. Money formatting and parsing (2026-10-01)

Spec: `docs/superpowers/specs/2026-10-01-money-centralization-design.md`. One module (`js/lib/money.js`, server twin `api/src/lib/money-format.js`) formats and parses every amount with the locale of the currency (`currencies.locale`); the unit cases (round trip for it-IT/en-US/de-CH/sv-SE/hi-IN/ja-JP/ar-EG, strict parse, fallbacks, thousands always separated, the guard against a second `Intl.NumberFormat`, the costgrid currency-change handler) run in vitest (`js/lib/money*.test.js`, `costgrid-currency-change.test.js`) and `node:test` (`api/src/lib/money-format.test.js`). `MN-01..MN-09` below are manual (browser). Verified in a browser on a branch stack 2026-10-01.

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| MN-01 | Focus + blur never changes a money field | `project-config.html`, EUR project with phasing 350,28: click into a phasing cell and leave it without typing; same on a PTC Amount | The cell shows `350,28` while focused and `€ 350,28` again after blur; the stored value is unchanged (it used to become 35.028, x100) | |
| MN-02 | A value typed in the currency's own format is stored as typed | In an EUR project type `150,75` in a phasing cell and in a PTC Amount; save and reload | `€ 150,75`; stored 150.75 | |
| MN-03 | Other currencies use their own convention | Projects in USD, CHF and JPY: same fields | USD `$ 1,234.50`; CHF `CHF 1'234.50` (de-CH); JPY `¥ 1,235` (no decimals); focus/blur never changes the value (JPY rounds a fractional stored value to whole units, by design) | |
| MN-04 | Thousands are always separated | Any amount of 1.000 or more in an EUR currency, e.g. 1234,5 | `€ 1.234,50` (not `€ 1234,50`); focus text for editing stays without separators | |
| MN-05 | The Currency menu follows the active currencies | Activate USD/CHF/JPY in `master-currencies.html`; open a proposal without generated projects in `costgrid.html` (and, read-only, a project in `project-config.html`) | The menu lists exactly the active currencies (symbol + name); in `project-config.html` it is read-only since the currency lock (PL-03) but still shows the project's currency, even if it was deactivated since | |
| MN-06 | Per-task PTC in the cost grid | `costgrid.html`, EUR grid: type `150,75` in a task's PTC; type `1.234,5` | `150,75` is used as 150.75 (totals update while typing, no longer truncated to 150); `1.234,5` ends as `€ 1.234,50`; focus/blur leaves the value unchanged | |
| MN-07 | Changing the currency of a cost grid (only possible while no project was generated from the version, PL-01) | `costgrid.html`, a proposal without projects: change the Currency select (e.g. CHF → USD) → confirm in the modal; then reload | The modal lists each role rate in both currencies' formats; confirming applies the new currency, the rate shown under the select is the admin rate (`1 EUR = 1.300000 $`), amounts re-render in `$`, no console error; reload shows the saved currency and rate (regression 2026-10-01: the confirm handler threw `newEntry is not defined`). Automated: `costgrid-currency-change.test.js` | |
| MN-08 | Portfolio list and detail use each project's currency | `portfolio.html`: projects in EUR/USD/CHF/JPY; open one project's dashboard | List cards (Sold/Spent/Variance, budget badge) and the dashboard show the project's own currency and format (not `€` for every project); a program whose projects share one currency totals in it, a mixed-currency program totals in `€` (raw sums, no conversion: known limitation) | |
| MN-09 | Pipeline-change notification amount | Change a version's pipeline stage (e.g. SIP → Expected) and open the admin bell | `Value: € 21.555` (locale format of the version currency, no decimals), not `€ 21,555` | |

## 29. Project currency lock (2026-10-01)

Spec: `docs/superpowers/specs/2026-10-01-project-currency-lock-design.md`. A project generated from a proposal keeps its currency, and creating a project without a proposal, deleting a project and unlinking it are inhibited, for everyone except a sysadmin. `PL-05..PL-08` run in `test-api.js` (`PR-01..PR-14`), the rules in `api/src/lib/project-rules.test.js` and `js/lib/project-rules*.test.js`, the api-sync retry in `js/api-sync.test.js`; `PL-01..PL-04` and `PL-09` are manual (browser). Verified in a browser on a branch stack 2026-10-01.

| ID | Scenario | Steps | Expected | Auto |
|---|---|---|---|---|
| PL-01 | Costgrid Currency menu locks when a project exists | `costgrid.html`, a proposal with a generated project (e.g. SIP): look at the Currency menu; then a proposal without projects | Disabled with the tooltip "Currency is locked: a project has already been generated from this proposal." on the first (client, pipeline and description stay editable); enabled on the second | |
| PL-02 | The lock appears right after Generate project | On a proposal without projects select tasks → ▶ Create project → confirm; do not reload; then reload | The Currency menu is disabled immediately after the creation (no reload needed) and stays disabled after the reload; "＋ Add to project" still works | |
| PL-03 | project-config Currency is read-only | Open any project in `project-config.html` | Menu disabled, hint "Currency cannot be changed here: amounts are not converted yet. Contact a sysadmin if it must be corrected."; changing another field and saving works (the unchanged currency is accepted) | |
| PL-04 | Direct project creation is off | `portfolio.html`: look at `＋ New project`; type `/project-config.html` without `?projectId=` in the URL bar | Button disabled with the tooltip "Projects are created from a proposal (Generate project). Creating a project directly is temporarily disabled."; the URL redirects to the portfolio, an info alert shows the same message and disappears on reload | |
| PL-05 | The API refuses what the lock forbids (non-sysadmin) | As an admin: `POST /api/projects` without `cgVersionId`; `PATCH` a linked project with another `currency`; `PATCH {cgVersionId: null}` or another version; `DELETE /api/projects/:id`; `DELETE …/linked-projects/:projectId`; `PATCH` the currency of a version with projects; `DELETE` a version/proposal that has projects | `400` `{ error, code: 'PROJECT_RULE' }` with the approved message each time ("Projects must be created from a proposal", "Currency cannot be changed: amounts are not converted yet", "Currency cannot be changed: projects are linked to this proposal", "Deleting a project or unlinking it from its proposal is temporarily disabled"); re-sending the same `currency`/`cgVersionId` is accepted (200); linking an unlinked project is still allowed | ✓ |
| PL-06 | A sysadmin may | The same requests as a sysadmin | They succeed (the sysadmin role is read from the DB, so a demoted sysadmin loses the exception at once) | ✓ |
| PL-07 | A project and its proposal share the currency at link time | As an admin: `POST /api/projects` with a `cgVersionId` and another `currency`; `PATCH` linking a project of another currency; `POST …/linked-projects` of another currency; a `cgVersionId` that points at no version | `400` "The project and the proposal must have the same currency" (sysadmin exempt); `400` "Proposal version not found" for an unknown version (also for a sysadmin); same-currency links succeed (what "Generate project" does) | ✓ |
| PL-08 | Currency change and linking cannot diverge under concurrency | Fire `PATCH` version currency and `POST /api/projects` linked to that version at the same time, several times | In every round either the project is created and the currency change is refused, or the change wins and the link is refused; never a project and a version in different currencies (`PR-14`) | ✓ |
| PL-09 | A refused save shows the rule's message | With a tampered request (e.g. console) make `PATCH /api/projects/:id` answer a rule refusal during a project-config save | The save fails with the rule's message in the usual error alert; no `POST`/duplicate-key error (api-sync does not retry a `PROJECT_RULE` refusal). Automated: `js/api-sync.test.js` | |

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
