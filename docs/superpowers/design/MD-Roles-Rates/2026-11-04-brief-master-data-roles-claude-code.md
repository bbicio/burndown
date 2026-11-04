# Brief — Master Data · Roles & rates (phase 2, page 3 of 4)

**Goal:** redesign the content of the "Roles & rates" section inside the Master Data shell delivered in phase 1. The flat table becomes a list grouped by team with one rate column per active currency; the inline form card becomes a side panel shared by create and edit; the native `confirm()` on delete becomes the shared confirm dialog.

Prerequisite: the phase-1 shell is merged. Do not change the shell.

Page touched: `master-roles.html` only. No API change.

## 1. References

| Board | File / state | Use it for |
|---|---|---|
| 10.7a | `MDRoles.dc.html` (default) | List grouped by team: group rows, rate columns, missing-rate states, search, "Missing rates" filter |
| 10.7b | `MDRoles.dc.html`, `panel=new` | New role side panel |
| 10.7c | `MDRoles.dc.html`, `panel=edit` | Edit role side panel (role with a missing £ rate) |
| 10.7d | `MDRoles.dc.html`, `confirm=true` | Delete confirmation |
| 10.7e | `MDRolesResponsive.dc.html` | Tablet (1024×768) and smartphone (390×844) |

`Section - MD Roles.dc.html` holds the board notes (Italian): current vs. new per area, plus open questions. Read it for intent; this brief is normative where they differ.

JPG captures of each board are in `docs/captures/roles/` (file name starts with the board id). Use them to see each state; take values from the HTML. Rendering artifacts in the captures are not part of the design — in particular at 1400px the capture cuts the table after the € column: all rate columns, "Used in" and actions are in the HTML.

Sample data (team codes, role names, £/CHF/$ rates, "Used in" counts, exchange rates 0.8 / 0.93 / 1.3) is illustrative.

## 2. Precedence

**The app's current rules win over the boards.** Boards define layout, hierarchy, copy and interaction; they do not change business rules, calculations, permissions or API contracts unless this brief says so explicitly.

- Rules follow the existing code: `api/src/routes/config.js` (`/roles`), `api/src/lib/money-rules.js`, `js/lib/money.js`, `resolveRoleRate` in `js/lib/costgrid-calc.js` (rate fallback chain).
- Shared components and tokens (buttons, inputs, switch, segmented control, side drawer and confirm dialog introduced for Clients / Pipelines, `.pd-icon`, `css/tokens.css`, breakpoints) win over board values. Primary buttons use the app-wide magenta `.btn-primary` (boards draw "+ Add role" navy — same accepted deviation as Clients). No hex literals in the page.
- Where a board shows something the app cannot do today, §7 says whether to build it, adapt it, or hide it. Anything not covered: follow the app and note the deviation in the PR.

## 3. Current state in the repo

- `master-roles.html`: Vue app, one table (Label, Code, Team, Default rate, actions) grouped by `extractTeam(code)` (prefix before the first " - "; fallback: first token), sorted by team then label. A form card on top (`rf`) for create and edit. Emoji buttons (✏️ 🗑 ⚠️). `confirm()` on delete. Errors in `globalError` with scroll-to-top watcher.
- Data: `Api.roles.list()` → `{id, label, code, team, hourly_rate, rate_overrides}`; `Api.currencies.list()` (all currencies; the form shows only `active` non-EUR ones).
- Rates: text inputs read with `readMoneyInput` (`rf.rateText`, `rf.overrideTexts[code]`, `rf.stored`), formatted on focus/blur. Blank EUR → "Default rate is required."; invalid → "Enter a valid amount in X, e.g. …". Blank override = no override; `0` = 0 override. A `0` EUR rate is accepted on save; the table shows "Not set" for 0 or null.
- Code: free text "TEAM - Role", uppercased by the server; client-side duplicate check ("Code "X" is already used by role "Y"."); server 409 "Role code already exists".
- `POST/PATCH /roles` accept `team` but the page never sends it; team is derived from the code everywhere (Resource Planning filters included).
- `DELETE /roles/:id`: **400 "Cannot delete role used in cost grids"** if any `task_roles` row uses it; **400 "Cannot delete role assigned to a team resource"** if a `resources` row uses it. Otherwise hard delete; `ratecard_entries` rows cascade (`ON DELETE CASCADE`), so client rate card entries for the role are removed.
- No endpoint returns per-role usage counts (cost grids, client rate cards).

## 4. List (10.7a)

Content card header: title "Roles & rates · N" (N = total roles), description "Agency rate card: every role with its default hourly rate in each active currency." Right side, wrapping on narrow widths:
- Search (200px, search icon), placeholder "Search role or code…". Client-side, case-insensitive on label + code (team is part of the code).
- Switch **Missing rates · N** (N = roles with no EUR rate, see below). On: only those roles. Amber track when on.
- Primary **+ Add role**.

**Columns** (header 10px uppercase, `#F7F8FA`): Role · code | one column per currency: EUR first, then each **active** non-EUR currency in the order of `Api.currencies.list()`, header "<symbol>/h" from `currencyInfo` (no hardcoded "€/h" — existing guard) | Used in (§7.2) | actions.

**Team group row** (`#FAFBFC`, clickable): chevron (rotates when open), team code 700, "N roles" / "1 role", amber pill "N without € rate" when N > 0. Groups sorted by team as today; roles by label within the group. Grouping keeps `extractTeam` unchanged. Default: all groups open; open/closed state kept in memory only. Search or the Missing filter forces matching groups open and hides groups with no match.

**Role row** (min 50px): label (13px 600, ellipsis) with the full code underneath (10.5px monospace, muted, ellipsis). Rate cells right-aligned:
- EUR set (> 0): `formatMoney(rate, 'EUR', currencies)` without "/h" (the unit is in the header). Keep the guard's `formatMoney(r.rate, 'EUR', currencies)`.
- EUR missing (null or 0, current "Not set" rule): "No rate" in amber 700, tooltip "No € rate: this role can't be priced"; the whole row gets the light amber background.
- Non-EUR override present: `formatMoney(value, code, currencies)`.
- Non-EUR override absent: "—" muted, tooltip "≈ <converted> from € × rate" with the value from `resolveRoleRate` (EUR × the currency's `current_rate`, rounded to the currency's decimals); "No rate" in the tooltip if the EUR rate is missing too.
- Overrides stored for a currency that is now inactive are not shown (no column) and are preserved on save (see §5).

Actions: "Edit" text link (opens the panel) and trash icon 30×30 (opens §6). Both stroke SVG, no emoji.

**Footer note:** "— = no rate in that currency: proposals in that currency fall back to the € rate × exchange rate. Clients can override rates in their own rate card."

**Empty state:** "No roles yet. Roles define columns in Cost Grid and drive rate calculations." (current copy). No match: "No roles match the current search."

## 5. Side panel — new / edit (10.7b, 10.7c)

Replaces the form card. Right panel 480px, navy scrim, closes on scrim click, ✕, Esc and Cancel; reuse the drawer component introduced for Pipelines if available. Opened by "+ Add role" (new) or "Edit" / row click on tablet (edit). Focus on Label when it opens.

- Head: eyebrow "New role" / "Edit role", title "New role" / the role label.
- **Label** — text, placeholder "e.g. Project Manager".
- **Team** + **Role code** side by side, and a **Full code** preview line: "Full code  TEAM - ROLE   Must match **Job Role: Name** in the XLS". See §7.1 for how these map to the single `code` field.
- **Default hourly rates** — two-column grid, one input per currency (EUR + every active non-EUR), currency code as prefix, "/h" suffix:
  - EUR: hint "Required · base rate"; amber border and hint while empty.
  - Other currency, empty: placeholder "≈ <EUR × current_rate>" formatted with `formatMoneyInput` (current placeholder logic), hint "Empty: € rate × <rate>"; "Optional" while EUR is empty too.
  - Other currency, filled: hint "Used as is in <CODE> proposals".
  - All inputs keep the current text model and handlers unchanged: `v-model="rf.rateText"`, `v-model="rf.overrideTexts[cu.code]"`, `onMoneyFocus` / `onMoneyBlur`, `readMoneyInput` with `stored`, `keepZero: true`. The rate guard test must pass as is.
- Edit only: usage block (§7.2) and the line "Changing a rate doesn't change existing cost grids." (true: cost grid versions store their own rates).
- Footer: Edit only "Delete role" (red text, opens §6 and closes the panel), Cancel, primary **Create role** / **Save changes**. The primary is disabled until label and code are non-empty; validation on save stays as today (same strings, same order), errors shown at the top of the panel body, not in a banner. Spinner on the primary while saving.
- Saving: same calls as today (`Api.roles.create` / `update` with `label, code, hourlyRate, rateOverrides`). Overrides for inactive currencies must survive an edit: today they do, because `openRoleForm` loads every stored override into `rf.overrideTexts` and `saveRole` iterates over all of them — keep that, and add a test so the redesign doesn't drop them. Duplicate-code check and server 409 shown in the panel.
- After saving: close the panel, update the row in place, open the role's group, keep search and filter.

## 6. Delete (10.7d)

Shared confirm dialog, opened from the row trash or the panel's "Delete role".

- Title: "Delete "<label>"?"
- Body, adapted to the **server rule** (the board's text says cost grids keep the role; the server refuses instead): "The role is removed from the agency rate card. Its custom rates in client rate cards are deleted too. A role used in a cost grid or assigned to a team resource can't be deleted."
- Grey info box from the board: drop the cost-grid line; keep only what is true (see §7.2).
- Buttons: Cancel, **Delete role** (danger). Spinner while deleting.
- Server 400 ("Cannot delete role used in cost grids" / "… assigned to a team resource"): keep the dialog open and show the message inside it, Delete disabled; no `alert()`, no banner scroll. Remove `confirm()` and the scroll-to-top watcher if nothing else uses it.

## 7. Board items that need a decision (defaults apply unless told otherwise)

1. **Team + Role code as two fields.** The data has one `code` ("TEAM - ROLE"); team is derived from it and some existing codes may not follow the format. Default: **build the two fields as a UI over `code`**: Team = `extractTeam(code)`, Role code = the part after the first " - "; save `code = TEAM + ' - ' + ROLE` (uppercased by the server, as today). Team is a combobox: existing teams (from the loaded roles) or a new typed value, hint "Pick a team or type a new one". If an existing code has no " - ", open the panel with Team empty and the whole code in Role code, and save it unchanged unless the user picks a team. Do **not** send the `team` field (current behaviour). Alternative: keep a single Code input with the Full code preview only.
2. **"Used in" column and usage counts** (cost grids, client rate cards). No endpoint returns them. Default: **hide the column, the usage block in the panel and the counts in the confirm dialog** in this cycle; delete relies on the server answer (§6). Adding a `usage` field to `GET /roles` (count of distinct cost grids from `task_roles`, count of `ratecard_entries` with a value, count of `resources`) is a separate backend task; when it exists, show "N cost grids" / "—", disable delete with the reason, and show the counts in the dialog as on the board.
3. **EUR rate 0.** The board treats any missing EUR rate as "No rate" and requires it. The app accepts 0 on save and shows 0 as "Not set". Default: **follow the app** — 0 and null both render as "No rate" and count in "Missing rates"; 0 remains saveable. Refusing 0 would be a new rule.
4. **Can a role without a € rate be added to a cost grid?** (open question on the board). Default: **no change** — cost grid behaviour is out of scope.
5. **Currency columns.** The board shows a fixed €, £, CHF, $. Default: **one column per active currency** (app rule), EUR first. With many active currencies the table scrolls horizontally inside the card, Role column sticky.
6. **Sub-nav count** ("Roles & rates 58"): follows the phase-1 decision (no counts).

## 8. URL

No URL state is required. Optional: `?role=<id>` opens the edit panel (replaceState), `?q=` keeps the search. If added, unknown id → list with "Role not found." in the card.

## 9. Responsive (10.7e)

Shell behaviour is from phase 1. Content:

**Tablet (768–1023px)**
- Header: title, Missing rates (as a 40px toggle button), + Add role; search moves to a second row full width.
- Table: Role (label + code below), the currency columns (80px each), chevron 36px. Edit/Delete icons and "Used in" go; tapping a row opens the panel (Delete lives in the panel footer). Team rows stay as group rows. Controls 40px.
- Panel: same, width min(480px, 100%).

**Smartphone (< 768px)**
- Section selector (shell), then search (44px) + "+ Add" (44px) on one row, then a segmented control with one segment per currency (EUR, active non-EUR) — one currency visible at a time. "Missing rates" becomes a chip under the segmented control (not on the board; keep the filter reachable).
- Team label as a small uppercase heading; each role a card (min 44px): label (wraps), code monospace below, value on the right:
  - set → amount in that currency;
  - EUR missing → "No rate" amber, card amber;
  - non-EUR missing → "≈ <converted>" in the muted/secondary colour (board uses purple: map to the nearest token).
- Tap opens the panel full screen with a sticky footer (Cancel / Save, 46px). Delete in the panel footer, confirm dialog as a bottom sheet.

## 10. Copy and icons

- All UI copy in English, sentence case, as in the boards. Keep existing validation and error strings unless listed here.
- No emoji (✏️ 🗑 ⚠️ go). 14/16px stroke SVGs with `currentColor` via the existing `.pd-icon` set. "—", "≈", "×" as text glyphs are fine.
- Amber for missing rates from the warning tokens, not literal hex.

## 11. Tests

- `master-roles-rate-input-guard.test.js` must pass unchanged.
- `master-data-guard.test.js` must pass (no native dialog, no emoji once Roles is redesigned — extend the check to this page if it lists pages).
- Add tests for: grouping and sort unchanged (`extractTeam`); search on label and code; Missing rates counts 0 and null EUR; one column per active currency; "—" tooltip value from `resolveRoleRate` rounded to the currency's decimals; Team + Role code ↔ `code` round trip incl. a code without " - " saved unchanged (§7.1); overrides for inactive currencies preserved on edit; delete 400 shown in the dialog; no `confirm()` / `alert()` left.

## 12. Out of scope

- The shell (phase 1). Clients & groups, Pipelines & POTs (done), Currencies (own brief).
- Any change to the rate fallback chain, cost grid rates, client rate cards, the `team` column, or `DELETE /roles` rules. Usage counts endpoint (§7.2).

## 13. Definition of done

- List grouped by team with collapsible groups, one rate column per active currency, missing-rate states, search and Missing rates filter.
- One side panel for create and edit with Team + Role code + Full code preview, per-currency rates with the current money input behaviour, inactive-currency overrides preserved.
- Delete through the shared confirm dialog following the server rule, errors inside the dialog.
- Tablet and smartphone layouts as in 10.7e; touch targets ≥ 44px on phone.
- No emoji, no `confirm()` / `alert()`; English copy; tokens and shared components used.
