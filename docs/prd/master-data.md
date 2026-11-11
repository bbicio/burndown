# Master Data

Part of [PRD.md](../../PRD.md) — carries PRD §7 Configuration (§7.2–§7.7).

## 7. Configuration

All configuration screens described in this section are admin-only and accessible via the **Master Data** pages (2026-10-05: the former single, tabbed `config.html` is now five pages — Clients, Client Groups, Pipelines & POTs, Roles & rates, Currencies — linked by a lateral sub-menu next to the sidebar; `/config.html` redirects to the Clients page). Since 2026-11-03 the five pages share one "Master Data" page head, a breadcrumb Home / Master Data / <section>, and the content in a card titled with the section; the sub-menu has two groups — COMMERCIAL (Clients & groups, Pipelines & POTs) and FINANCIAL (Roles & rates, Currencies) — and is a column beside the sidebar on wide screens, a row of tabs on tablets and a section selector on phones. Since 2026-11-04 Clients and Client Groups are one page, "Clients & groups" (`master-clients.html`); `/master-client-groups.html` redirects to its By group view. (A separate `admin.html` page exists for user management and is out of scope for this section.)

### 7.2 Clients

Simple registry: ID + name. Used to group projects in portfolio view. A client can belong to at most one client group.

The page has two views, **List** and **By group** (`?view=group`), with the same client rows and a search over client and group names. A client is added in a side drawer opened by **+ Add client** (name and optional client group; full-screen on phones), and renamed and deleted inline (the delete is refused by the server while projects use the client, and its message is shown in the page banner). The group of a client is set from the row's selector or, in By group, from the group's "+ Add client" list; a failed change puts the previous group back.

Each client row has a pill ("N custom rates" or "Agency rates") and a **Rate card →** link that open the client's rate card, a page of its own at `?client=<id>` (the browser's Back and reload work; an unknown client returns to the list with "Client not found."). It lists all roles, grouped by the prefix of their code, with these columns:

| Column | Content |
|---|---|
| Agency default | The role's own rate (`role.hourly_rate`), formatted in EUR; "—" when the role has none |
| Client custom (€/h) | Editable override for this client; blank = use agency default |

Saving creates or updates a per-client rate card. (2026-11-11) If someone else saved the same rate card after it was opened, the save is refused with "This rate card was changed by someone else. Reopen it to see the current rates." and the edits stay on screen, unsaved; a client never gets a second rate card. Custom rates are applied automatically when the client is selected in a new proposal. Rate card management is **not** available from admin.html — it lives exclusively here.

Rate cards support multiple currencies: for each active non-EUR currency (e.g. USD), the rate card shows an additional column alongside EUR. Each field's placeholder is the rate that applies when it is left empty, with a caption saying where it comes from (Custom, Agency, Agency <currency>, "From € × rate", or "No rate"); a "How rates resolve" panel explains the order. The card has a search, an "Only customized" switch, a per-row reset, and a save bar showing "All rates saved" or "N unsaved changes" with Discard; leaving with unsaved changes asks for confirmation. On a phone one currency is shown at a time.

Every rate field is a text field written and shown in its column's currency (e.g. `1.234,50` in EUR, `1,234.50` in USD); text that is not a valid amount refuses the whole save with "Enter a valid amount in <code>, e.g. …". A role may have a custom rate in another currency with the EUR field left blank: EUR then stays the agency default. Clearing every field of a role removes its custom rates for this client.

### 7.3 Client Groups

Named bundles of clients (e.g. "Italian Public Sector"), managed in the By group view of Clients & groups. Used as the target for POT targets when multiple clients share a revenue goal. CRUD: create in the same side drawer, opened by **+ Add group** or by a client's "+ New group…" (which then assigns that client to it); rename and delete inline. After a group is created the page shows the By group view. Members: assign/remove individual clients. A client can belong to at most one group at a time. A group shows a "POT · <year>" pill (with " +N" for further years). A group that has a POT cannot be deleted: the trash is disabled with the years in its hint, and the server refuses with 409. Deleting a group without a POT does not delete its member clients — they simply become ungrouped.

### 7.4 Pipelines & POTs

**What a POT is:** a Client POT is the total target revenue — the maximum "wallet potential" — allocated to a specific client (or client group) for a given forecasting year. It is the financial benchmark the organization aims to capture from that client, combining existing recurring business with identified upsell/cross-sell growth opportunities. Everything below (the POT banner, the POT table, the View Details modal, the history log) is different views onto that one number and how actual/anticipated pipeline is tracking against it.

(2026-11-04) The Pipelines & POTs page (`master-pipelines.html`) has three levels, each with its own URL (reload and Back/Forward work): the pipeline list (`/master-pipelines.html`), the POT targets of a year (`?year=`), and the Proposal/Project phasing of a year (`?year=&phasing=`). The POT details open as a side drawer (`?year=&pot=`). Layouts follow the shell: tablet drops the Committed/Anticipated columns, phone uses cards and a full-screen drawer. (2026-11-05) New pipeline year, New POT and Edit target open in the same side drawer as the POT details, not inside the tables; ✕ closes the drawer, Cancel, Esc and a click outside close the form (back to the details when Edit target was opened from them), and nothing closes while a save runs.

**View A — Pipeline list (2026-11-04):** a new year is created **Hidden**; the Visible switch saves at once and restores itself on failure; **Delete is disabled while the year has proposals or POTs** (with the reason; since 2026-11-11 also when its only proposals are Drafts or Canceled: "Not available: N proposals (Drafts and Canceled included) use this pipeline. Hide it instead."). Rest of the original description: table of all pipeline years with Visible / Hidden status badge. Actions: toggle visibility (Show/Hide), delete (blocked if cost grid versions reference the year), "POTs →" (drills into View B), "📊 Proposal Phasing", "📋 Project Phasing", + Add year. A year with POT targets shows its achievement % and C+A amount, with a second line "C: € … · A: € … · E: € … · S: € …" (E and S muted, not in the %).

**Proposal Phasing / Project Phasing:** (2026-11-04: filters by stage, client and POT; amounts in EUR or in the original currency, never mixed in one total; Project phasing has no XLS export) dedicated per-year views opened from the pipeline list row, each with an XLS export link. (2026-11-11) The Proposal Phasing XLS shows the stored hours (they used to be 8 times too high, and the amounts with them), one row per proposal, amounts in EUR. Proposal Phasing shows the monthly budget distribution across proposals for the year; Project Phasing shows the same for active projects.

**View B — POT targets for selected year:**

Layout (top to bottom):
1. Navigation row — ← Pipelines button · "Pipeline YYYY" title · Visible/Hidden status badge
2. **POT banner** (shown only when the year has at least one POT) — Total POT Target across all POTs for the year, and the Committed+Anticipated total with achievement %
3. **5 stage summary cards** (SIP, Expected, Anticipated, Committed, Canceled) — each shows count of proposals and total professional-fee value (days × 8 × rate; pass-through costs excluded). Cards are populated via `GET /api/pots/pipeline-summary?year=`. In the cards, the POT table and the year row, a proposal counts once, in the stage and year of its reference version (the version that has projects, else the newest non-Draft one) — never once per version (2026-10-29).
4. "POT Targets" section header with "+ New POT" button
5. POT table — lists all POTs for the year. Each row has: client/group name, type badge (Individual / Group), target amount, Total (C+A), Committed, Anticipated, and — muted, informative, never part of Total (C+A) — Expected and SIP (all in EUR), and action buttons: 🔍 View Details · ✏️ Edit · 🗑.

**+ New POT form:** targets an individual client, a client group, or one of two virtual scopes — "Unassigned / To be Identified" and "New Biz" — for revenue not yet tied to a named client; amount only; year is fixed to the current View B year.

**✏️ Edit:** the Edit target form in the side drawer (from the row's pencil, or from the POT details, which it replaces until Cancel or Update target) updates the amount and needs a reason for change; every change is logged to `pot_history`. (2026-10-30) The amount is typed in EUR's convention (`500.000`, `1.234,50`) and the field is labelled "New target (€)"; a blank or unreadable amount is refused with "Enter a valid amount in EUR, e.g. 1.234,50." (§7.7). Enter in the field saves.

**Details drawer (formerly a modal; 2026-11-04)** — shows, and closes with ✕, the scrim or Esc:
- POT type badge (Individual / Group) and scope name
- Four KPI cards: **Target** (current `pot.amount`, most recent history entry) · **Total (C+A)** (Committed + Anticipated professional fees) · **Committed** · **Anticipated** — each scoped to this POT's client/group for the year, with a % of target
- Below the cards, a muted line "Not in total · Expected € … · SIP € …" — informative only; Total (C+A) and the percentages never include it
- **History** — change log newest-first: date, author, old value → new value with arrow
- **Proposals** — one row per proposal scoped to the POT's client/group + year, shown through its reference version (the version that has projects, else the newest non-Draft one); Canceled and Draft excluded; each row links to `/costgrid.html?cgId=...&verId=...`. A non-EUR proposal's Value shows the amount in its own currency with the EUR equivalent in parentheses below; totals are always summed in EUR

POT progress is also visible in the Pipeline board detail panel for linked offers.

### 7.5 Programs

Simple registry: ID + name. Groups projects across the portfolio and reporting view. **A program's ID is permanently fixed once created** — it cannot be changed later (until 2026-10-05 the Programs tab's edit form showed the field disabled); a typo made at creation time cannot be corrected on this program, only worked around by creating a new one and migrating its projects.

**Deleting a program is blocked outright while any project is still linked to it** — the delete does not proceed and does not unlink the projects; every linked project must be moved off the program first. Until 2026-10-05 the Programs tab's confirm dialog said so and a refused delete showed the server's message ("Cannot delete program with linked projects") while the program stayed listed; that screen was removed with the split of `config.html`, the API rule is unchanged.

**Programs are no longer managed from Master Data (2026-10-05):** the Programs tab of the former `config.html` was removed together with the split of that page. Programs are still created from `project-config.html`'s "+ New program" or Generate Project's auto-link flow (§4.9) and still group projects in the portfolio; the API (including rename and delete) and the data are unchanged, but **no screen can rename or delete a program any more**.

### 7.6 Roles Registry

Accessed via the **Roles & rates** page (`master-roles.html`, Master Data), alongside Currencies, Clients, Client Groups, and Pipelines & POTs.

| Field | Notes |
|---|---|
| Label | Display name (e.g. "Senior Developer") |
| Code | Must match the role code in the XLS actuals (e.g. "HWGDEV") |
| Team | Not stored on its own — the `TEAM - Role` prefix of Code, used as a group label for Resource Planning filters; the form edits it as a separate Team field that is joined into Code on save (2026-11-04) |
| Rate (€/h) | Default hourly rate; can be overridden per cost grid version |
| Default rate (per active non-EUR currency) | Optional — one extra field per active currency (§7.7) appears in the same Add/Edit Role form; blank means "convert the EUR rate at the current exchange rate," a value here fixes this role's own default rate in that currency regardless of exchange-rate movement. This is the "role's per-currency agency default" link in the rate fallback chain (§4.9) — distinct from a client's own rate-card override (§7.2, which takes priority over this) and from a per-offer rate edit (which takes priority over both). |

Actions: Add, edit, delete.

(2026-10-30) Each rate is typed in the convention of its own currency (§7.7). A blank default rate is refused with "Default rate is required."; a blank per-currency field means no override, while a `0` typed there is saved as a 0 override.

**Page layout (2026-11-04).** The list is grouped by team (collapsible groups, "N roles" and an amber "N without € rate" when some role has no € rate), with one rate column per currency — € first, then each active currency — headed "€/h", "$/h"…; amounts are shown without the symbol and without decimals when whole. A role with no € rate (empty or 0) reads "No rate" on an amber row. In another currency, "—" means the role has no rate of its own there: its tooltip shows what a proposal in that currency would use (≈ the € rate × the current exchange rate). A search box (role or code) and a **Missing rates** switch narrow the list. **+ Add role** and **Edit** open a side panel with Label, **Team** (pick an existing team or type a new one) and **Role code**, a "Full code" preview (it must match **Job Role: Name** in the XLS) and one rate field per currency; the code saved is "TEAM - ROLE code", and a code that does not follow that form is kept as it is unless a team is picked. **Delete** asks for confirmation: the role and its custom rates in client rate cards are removed, and a role used in a cost grid or assigned to a team resource can't be deleted — the refusal is shown in the dialog. On tablets a tap on a role opens the panel; on phones one currency is shown at a time (a selector above the list) and roles are cards.

### 7.7 Currencies

Accessed via the **Currencies** page (`master-currencies.html`, Master Data), alongside Roles, Clients, Client Groups, and Pipelines & POTs.

EUR is the fixed base currency (always 1:1, not editable, always active). Any other currency starts **inactive** — offered on offer/project currency dropdowns only once an admin activates it here. **"+ Activate currency"** opens a row at the top of the list with a searchable currency picker (by code, name or symbol) and the "1 EUR = X" rate; Activate stays disabled until a currency and a valid rate are chosen, and the inverse ("1 X = € …") is shown as the rate is typed. Once activated it appears in the active-currencies list alongside EUR (marked "Base", "Fixed · 1.0000"), with its symbol, name, rate, the change since the previous rate (▲/▼ %), the inverse, the last-updated date and who made the change. (2026-11-05) The rate is read, not an always-open field: clicking it (or its pencil) opens an input on that row only, with Save and Cancel (Enter / Esc); a rate with "," or "." is accepted, while an unchanged rate or one outside 0.000001–9999.999999 is refused under the field; every update is timestamped. A **History** link (not available for EUR, whose rate never changes) opens a side panel with the current rate, a small trend chart and every change with date, time, user and the difference from the previous rate ("no change" when equal, "activated" on the first one). On phones each currency is a card with **Edit rate** and **History**, and editing and activation open bottom sheets.

Clicking Save on a rate change opens a confirmation dialog showing the old and new rate before it takes effect, explaining explicitly that the update does **not** retroactively change any proposal or project already in the system — each offer's own exchange rate is fixed by the server the moment the offer is created or its currency is changed, and saving the offer again never changes it (2026-10-29), even if that currency has since been deactivated. An EUR offer's rate is always 1. The rate moves only when the offer's currency changes, or when an admin uses **Refresh rate** in the Pipeline detail panel (§4) on an out-of-date snapshot. An offer cannot be created, cloned or switched to a currency that is not active: the action is refused with "Currency X is not active" (the clone notice adds "Activate it in Master Data → Currencies, then clone again."). This mirrors, in the offer editor itself, the rate display described in §4.9 below.

**Number format (2026-10-01).** Every amount in the app is written and read with the number convention of its own currency, taken from the currency's locale: `€ 1.234,50` for EUR, `$ 1,234.50` for USD, `CHF 1'234.50` for CHF, `¥ 1,235` for JPY (currencies without fractional units show no decimals). The thousands separator is always shown for amounts of 1.000 or more. The same applies to input: in a money field (project phasing and PTC, a cost-grid task's PTC) the value is shown while editing in the same convention it is read back in (e.g. `350,28` for EUR), so clicking into a field and leaving it never changes the stored amount. (2026-10-30) Every money field — a cost-grid role rate and task PTC, a project resource's hourly rate, PTC and phasing (since 2026-11-01), a role's default and per-currency rates (§7.6), a client rate card and the POT amount (§7.4) — is a text field in its currency's convention, and a value in another convention, with more decimals than the currency allows or negative is **refused** rather than read, with "Format: 1.234,50" beside the field or a message on save, and the stored value is left as it was. The symbol or currency code is accepted only at the start or the end of a pasted value, and a space between the digits is refused unless it is the currency's own thousands separator. Indian grouping (`₹ 1,23,456.00`) is read for INR (2026-11-01). A stored 0 reopens as `0` where 0 is a real amount (rates, POT), and an amount left untouched is saved back as stored. The pipeline-change notification sent to admins uses the same format. Known limitation: a program that mixes projects in different currencies totals them as raw sums (shown in EUR), without conversion.

This exchange rate is the same one used throughout the app wherever a non-EUR figure needs a EUR-equivalent — the pipeline board's mixed-currency column totals (§4.2), the rate card's per-currency columns (§7.2), and any other cross-currency aggregation all read this same admin-managed rate, not a separately configured one.

Actions: Add, edit, delete.

---

