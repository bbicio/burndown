# Brief — Master Data · Clients & groups (phase 2, page 1 of 4)

**Goal:** redesign the content of the "Clients & groups" section inside the Master Data shell delivered in phase 1. Client Groups is merged into this page; the client rate card moves from a modal to a sub-view of the page.

Prerequisite: the phase-1 shell is merged (shared `.ph` head "Master Data", grouped sub-nav, content card, tablet tabs, phone section selector). Do not change the shell in this cycle.

Pages touched: `master-clients.html` (main), `master-client-groups.html` (redirect only, see §8).

## 1. References

| Board | File / state | Use it for |
|---|---|---|
| 10.2a | `MDClients.dc.html` (default) | List view: toolbar, columns, row actions |
| 10.2b | `MDClients.dc.html`, `adding=true` | Inline "new client" row |
| 10.2c | `MDClients.dc.html`, `screen=rate` | Rate card sub-view |
| 10.2d | `MDClients.dc.html`, `screen=rate`, `infoOpen=true` | "How rates resolve" panel |
| 10.3a | `MDClients.dc.html`, `groupView=group` | By group view |
| 10.3b | `MDClients.dc.html`, `groupView=group`, `addingGroup`, `assignOpen` | Inline new group + "Add client" picker |
| 10.2e | `MDClientsResponsive.dc.html` | Tablet rate card (1024×768), phone list (390×844), phone rate card (390×844) |

`Section - MD Clients.dc.html` holds the board notes (Italian): current vs. new behaviour per area, plus open questions. Read it for intent; this brief is normative where they differ.

Sample data in the boards (Bayer Group, Italfarmaco archived, roles, FX rates) is illustrative.

## 2. Precedence

**The app's current rules win over the boards.** Boards define layout, hierarchy, copy and interaction; they do not change business rules, validation, permissions or API contracts unless this brief says so explicitly.

- Business rules (who can delete, uniqueness, one group per client, rate resolution order, money formatting/parsing) follow the existing code: `api/src/routes/config.js`, `api/src/routes/client-groups.js`, `js/lib/money.js`, and the existing rate card save logic in `master-clients.html`.
- Shared components and tokens (buttons, inputs, `.pd-icon`, `css/tokens.css`, breakpoints, existing confirm dialog) win over board values. Use the closest token where a board value differs.
- Where a board shows something the app cannot do today, §7 says whether to build it, adapt it, or hide it. Anything not covered: follow the app and note the deviation in the PR.

## 3. Current state in the repo

- `master-clients.html`: Vue app, single-column table (Name + 3 emoji buttons: Costgrid, Edit, Delete), "New client" form card, rate card in a Bootstrap modal (`#clientRcModal`) with role/code/agency/client €/extra-currency columns.
- `master-client-groups.html`: one card per group with client chips, "— assign a client —" select + Add, Rename form card, red delete.
- API: `GET /clients` returns `{id, name}` only. `GET /client-groups` returns groups with `clients[]`. A client has one `group_id`. `PUT /client-groups/:id/clients/:clientId` refuses a client already in another group. `DELETE /clients/:id` refuses clients with linked projects. `DELETE /client-groups/:id` cascades to the group's POTs.
- No archive/status field on clients.

## 4. List view (10.2a, 10.2b)

Content card header row (one row, wraps on narrow widths):

1. Section title "Clients & groups" (from the shell).
2. Segmented control **List / By group** (view switch; same rows and actions in both, see §5).
3. ~~Active / Archived segmented control~~ → see §7.1.
4. Spacer.
5. Search, 190px, placeholder "Search client or group…". Filters by client name and group name, client-side.
6. Secondary button **+ Add group** (opens the inline group row, switches to By group).
7. Primary button **+ Add client** (opens the inline client row).

Use the app's segmented control and button components if they exist; otherwise build them from tokens matching the board (segmented: `#EEF0F4` track, white active pill).

**Table** (header row: 10px uppercase, `#F7F8FA` background):

| Column | Content |
|---|---|
| Name | Client name, 13.5px 600 navy. Clicking the edit icon turns it into an input (see §6.2). |
| Client group | Pill-style selector showing the group or "No group" (muted, no border). Opens a menu: "No group", all groups (check on current), divider, "+ New group…". |
| Rate card | Pill: "N custom rates" (green `#E6F4EC` / `#0E7C4A`) or "Agency rates" (grey). Click opens the rate card. N = number of roles with at least one custom value in this client's rate card. |
| Status | Only if §7.1 is approved. Otherwise omit the column. |
| Actions | "Rate card →" text link, Edit icon (pencil, 30×30), "⋯" menu. |

Row height 52px; hover `#FAFBFC`. Sorted by name (as today).

**"⋯" menu:** Delete, with a one-line hint. Delete is enabled or disabled following the **server rule** (no linked projects). When disabled show "Not available: this client has projects." If the app cannot know in advance, keep Delete enabled and surface the server error inline (no `alert()`), as today via `globalError`. Confirmation uses the app's existing confirm dialog, not `confirm()`.

**Inline new client row (10.2b):** first row under the table header, `#F7F8FA`. Name input (autofocus, magenta focus ring) + optional group selector + Cancel / Create. Create disabled until the name is non-empty. Enter = Create, Esc = Cancel. Validation and errors as today ("Name is required.", duplicate name message from the current code), shown under the row. If a group is picked, call assign after create.

**Footer note** (11.5px, muted): "A client group puts affiliates under one umbrella: in Pipelines & POTs the group has a single POT." Drop the archive sentence unless §7.1 is approved.

**Empty state:** "No clients yet. Use + Add client to create the first one."

## 5. By group view (10.3a, 10.3b)

- One collapsible section per group (sorted by name), then a final **"No group"** section with ungrouped clients (only if there are any).
- Group header (46px, `#F7F8FA`): chevron, building icon (stroke SVG, no emoji), name, "N clients", optional purple POT pill, spacer, "+ Add client", Rename icon, Delete icon. "No group" has no actions.
- Rows under each header are the same client rows as the List view, indented 46px.
- **POT pill:** "POT · <name>" (`#F3E8FD` / `#7C3AED`), tooltip "Clients in a group share one POT". Shown when the group has at least one POT (see §7.3 for the data).
- **Rename:** inline on the header (input + Save / Cancel), same validation as today (required, unique name).
- **Delete group:** see §7.3. Confirmation via the app's confirm dialog: "Delete group "X"? Its clients become ungrouped."
- **"+ Add client" picker (10.3b):** popover listing active clients not in this group. Clients already in another group show "Move from <group>" in amber; ungrouped ones show "No group". See §7.2 for the move rule. Empty: "Every client is already in this group."
- **Inline new group row (10.3b):** above the sections. Placeholder "Group name, e.g. Italian Public Sector", hint "Add clients to it after creating it.", Cancel / Create group. Also opened from "+ New group…" in a client's group selector; after creation, that client is assigned to the new group.
- Empty group: "No clients in this group yet · use "+ Add client" or pick the group on a client."
- No groups at all: the view shows only "No group" plus the hint "No client groups yet. Groups bundle clients together for POT targets." (current copy).

## 6. Client rate card (10.2c, 10.2d)

### 6.1 Container

- The modal `#clientRcModal` is replaced by a **sub-view of the page**: the content area shows the rate card instead of the list. URL reflects it (`master-clients.html?client=<id>`), back/forward work, reload reopens it.
- Breadcrumb (shell): `Home / Master Data / Clients & groups / <Client> · Rate card`; "Clients & groups" links back to the list.
- Head: "← Clients" back link, title "Rate card · <Client>", green pill "N roles customized", description (current copy: custom rates applied automatically when the client is selected in a new proposal; empty field = agency rate).
- Toolbar: search "Search role or code…", toggle **Only customized**, legend (Custom / Agency / From € × rate), "How rates resolve" toggle.
- Table in its own card, vertical scroll inside the card; header row and family rows sticky.
- **Save bar** always visible below the table: status dot + "All rates saved" / "N unsaved changes", Discard, **Save rates** (primary). Leaving the sub-view with unsaved changes asks for confirmation.

### 6.2 Table

- Columns: Role (name + code in monospace 10.5px below), Agency €/h (read-only), Client €/h, one column per active non-EUR currency (header shows code and "Fallback 1 € = x"), reset icon.
- Roles grouped by **family**, collapsible, header shows code, family name and "x of y customized" / "y roles · agency rates". Family = the existing role family/group field if the roles API provides one; otherwise the code prefix before the first " - ". Do not add a field for this.
- Each input: placeholder = the effective value the proposal would use; caption under it = its source: "Custom" (green), "Agency" / "Agency GBP" (muted), "From € × rate" (purple italic), "No rate · set one" / "No rate" (amber). Custom values: bold, navy border.
- Reset icon per row (only on customized rows): clears that row's custom values (marks dirty, not saved).
- Edit client name: the pencil in the list turns the name cell into an inline input (Save / Cancel); same validation and API as today's form. The "Edit client" form card is removed.

### 6.3 Logic — unchanged

Keep the current load and save logic as is: fresh roles + rate cards on open, auto-create the client's rate card if missing, `readMoneyInput` / `formatMoney` focus/blur behaviour, validation message per currency, full-replacement save, preservation of overrides in currencies no longer active (`hidden`). Only the presentation changes.

**"How rates resolve" (10.2d)** and the placeholder/caption sources must describe the **actual** resolution in the app's code. Verify against the proposal-creation code; if it differs from the board's text (e.g. the order for non-EUR currencies, or "exchange rate saved in the proposal version"), use the code's rule and adjust the copy.

## 7. Board items that need a decision (defaults apply unless told otherwise)

1. **Archive / Restore and Status column.** Not supported (no field). Default: **not in this cycle.** Hide the Active/Archived control, the Status column and the archive copy. Delete follows the server rule (§4). Can be added later with a migration (`clients.archived_at`) and a filter on client pickers.
2. **Moving a client between groups.** The API refuses assigning a client that is in another group. The boards allow it from the row selector and the "+ Add client" picker. Default: allow it as an explicit user action, implemented as remove-from-old + assign-to-new (still one group per client). If the second call fails, restore the previous group and show the error. Alternative if not approved: list those clients disabled with "In <group>".
3. **Deleting a group with a POT.** Today the server deletes the group and cascades to its POTs (data loss). The board disables Delete with "Can't delete: used by <POT>. Remove the POT first." Default: **follow the board** and also guard it server-side: `DELETE /client-groups/:id` returns 409 if a POT references the group. Data for the pill/disabled state: the existing POTs endpoint (one call on page load, map by `client_group_id`), or add `pot_count` to `GET /client-groups` if cheaper. This is the only backend behaviour change in this brief.
4. **Client's group in the List view.** `GET /clients` has no `group_id`. Default: derive it from `GET /client-groups` (already loaded); no API change.
5. **Sub-nav count** ("Clients & groups 5"): follows the phase-1 decision (no counts unless already implemented).

## 8. Client Groups page

- `master-client-groups.html` becomes a redirect to `master-clients.html?view=group` (keep the file so old links work). Remove its Vue app and page-local styles.
- `?view=group` selects the By group view on load; the view choice is also kept in the URL when switching.
- Remove the page from guards/tests that list Master Data pages, or update them to expect the redirect.

## 9. Responsive (10.2e)

Shell behaviour is from phase 1. Content:

**Tablet (768–1023px)**
- List / By group: same table; hide the Rate card pill column below 900px if it doesn't fit (the "Rate card →" action stays). Toolbar wraps onto two rows: title + segmented on the first, search + buttons on the second. Controls 40px high.
- Rate card: Role and Client € columns sticky on the left; currency columns scroll horizontally; agency € moves to the last column. Inputs 40px. Save bar fixed at the bottom of the content.

**Smartphone (< 768px)**
- List: toolbar = search (flex) + "+ Add"; second row = List / By group segmented + "+ Group". All 44px.
- Clients as cards: name + "⋯" (44px target), group (or "Tap ⋯ to add to a group") + rate card pill, footer row "Rate card ›" (44px). "⋯" menu: Edit, Move to group, Delete.
- By group: uppercase group label, count, POT pill, "+ Add client"; cards below.
- Rate card: one currency at a time via segmented EUR · GBP · CHF · USD (active currencies only) with the hint line ("Empty = agency € rate." / "Empty = agency GBP rate; if missing, € rate × 0.86."). Families as collapsible cards; each role = name + source line + 96px input (44px). Save bar sticky at the bottom: "N roles customized" + Save rates.

## 10. Copy and icons

- All UI copy in English, sentence case, as in the boards. Keep existing validation and error strings unless listed here.
- No emoji (💲 ✏️ 🗑 🏢 go). 14/16px stroke SVGs with `currentColor` via the existing `.pd-icon` set.

## 11. Tests

- Update `master-data-guard.test.js` for the redirect of `master-client-groups.html` and the `?view=group` entry.
- Add tests for: group selector (assign, unassign, move per §7.2 incl. rollback on failure), delete-group guard (409 with POT, UI disabled), rate card sub-view URL/back, unsaved-changes guard, and that the save payload is identical to the previous modal's for the same input.
- Existing rate card money tests must pass unchanged.

## 12. Out of scope

- The shell (phase 1). Pipelines & POTs, Roles & rates, Currencies (own briefs).
- Archive (§7.1 default). Changes to how rates resolve. Client fields beyond name and group.

## 13. Definition of done

- List and By group views as in 10.2a / 10.3a, same rows and actions in both; search filters both.
- Inline add client / add group / rename group / edit client name, with current validation.
- Group assignment from the row selector and from the group picker; one group per client preserved.
- Group delete blocked when a POT exists (UI + API).
- Rate card is a sub-view with its own URL; load/save behaviour identical to the old modal.
- `master-client-groups.html` redirects to the By group view.
- Tablet and smartphone layouts as in 10.2e; touch targets ≥ 44px on phone.
- No emoji; English copy; tokens and shared components used.
