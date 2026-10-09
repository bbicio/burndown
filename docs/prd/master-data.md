# Master Data

Part of [PRD.md](../../PRD.md) — carries PRD §7 Configuration (§7.2–§7.7).

## 7. Configuration

All configuration screens described in this section are admin-only and accessible via the **Master Data** pages (2026-10-05: the former single, tabbed `config.html` is now five pages — Clients, Client Groups, Pipelines & POTs, Roles & rates, Currencies — linked by a lateral sub-menu next to the sidebar; `/config.html` redirects to the Clients page), which also manage Pipeline years and POT targets. (A separate `admin.html` page exists for user management and is out of scope for this section.)

### 7.2 Clients

Simple registry: ID + name. Used to group projects in portfolio view. A client can belong to at most one client group.

Each client row has a **💲 Costgrid** button that opens a rate card modal. The modal lists all roles with two columns:

| Column | Content |
|---|---|
| Agency default | Rate from the global rate card (falls back to `role.hourly_rate` if no global card exists) |
| Client custom (€/h) | Editable override for this client; blank = use agency default |

Saving creates or updates a per-client rate card. Custom rates are applied automatically when the client is selected in a new proposal. Rate card management is **not** available from admin.html — it lives exclusively here.

Rate cards support multiple currencies: for each active non-EUR currency (e.g. USD), the modal shows an additional column alongside EUR, pre-populated with the role's agency default for that currency when set.

### 7.3 Client Groups

Named bundles of clients (e.g. "Italian Public Sector"). Used as the target for POT targets when multiple clients share a revenue goal. CRUD: create, rename, delete. Members: assign/remove individual clients. A client can belong to at most one group at a time. Deleting a group does not delete its member clients — they simply become ungrouped.

### 7.4 Pipelines & POTs

**What a POT is:** a Client POT is the total target revenue — the maximum "wallet potential" — allocated to a specific client (or client group) for a given forecasting year. It is the financial benchmark the organization aims to capture from that client, combining existing recurring business with identified upsell/cross-sell growth opportunities. Everything below (the POT banner, the POT table, the View Details modal, the history log) is different views onto that one number and how actual/anticipated pipeline is tracking against it.

Master/detail on the Pipelines & POTs page (`master-pipelines.html`):

**View A — Pipeline list:** table of all pipeline years with Visible / Hidden status badge. Actions: toggle visibility (Show/Hide), delete (blocked if cost grid versions reference the year), "POTs →" (drills into View B), "📊 Proposal Phasing", "📋 Project Phasing", + Add year.

**Proposal Phasing / Project Phasing:** dedicated per-year views opened from the pipeline list row, each with an XLS export link. Proposal Phasing shows the monthly budget distribution across proposals for the year; Project Phasing shows the same for active projects.

**View B — POT targets for selected year:**

Layout (top to bottom):
1. Navigation row — ← Pipelines button · "Pipeline YYYY" title · Visible/Hidden status badge
2. **POT banner** (shown only when the year has at least one POT) — Total POT Target across all POTs for the year, and the Committed+Anticipated total with achievement %
3. **5 stage summary cards** (SIP, Expected, Anticipated, Committed, Canceled) — each shows count of proposals and total professional-fee value (days × 8 × rate; pass-through costs excluded). Cards are populated via `GET /api/pots/pipeline-summary?year=`.
4. "POT Targets" section header with "+ New POT" button
5. POT table — lists all POTs for the year. Each row has: client/group name, type badge (Individual / Group), target amount, and action buttons: 🔍 View Details · ✏️ Edit · 🗑.

**+ New POT form:** targets an individual client, a client group, or one of two virtual scopes — "Unassigned / To be Identified" and "New Biz" — for revenue not yet tied to a named client; amount only; year is fixed to the current View B year.

**✏️ Edit:** inline form to update the amount; every change is logged to `pot_history`.

**🔍 View Details modal** — shows:
- POT type badge (Individual / Group) and scope name
- Four KPI cards: **Target** (current `pot.amount`, most recent history entry) · **Total (C+A)** (Committed + Anticipated professional fees) · **Committed** · **Anticipated** — each scoped to this POT's client/group for the year, with a % of target
- **History** — change log newest-first: date, author, old value → new value with arrow
- **Proposals** — all cost grid versions scoped to the POT's client/group + year; Canceled included; Draft excluded; each row links to `/costgrid.html?cgId=...&verId=...`

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
| Team | Not a separate input — auto-derived from the `TEAM - Role` prefix of Code, used as a group label for Resource Planning filters |
| Rate (€/h) | Default hourly rate; can be overridden per cost grid version |
| Default rate (per active non-EUR currency) | Optional — one extra field per active currency (§7.7) appears in the same Add/Edit Role form; blank means "convert the EUR rate at the current exchange rate," a value here fixes this role's own default rate in that currency regardless of exchange-rate movement. This is the "role's per-currency agency default" link in the rate fallback chain (§4.9) — distinct from a client's own rate-card override (§7.2, which takes priority over this) and from a per-offer rate edit (which takes priority over both). |

Actions: Add, edit, delete.

### 7.7 Currencies

Accessed via the **Currencies** page (`master-currencies.html`, Master Data), alongside Roles, Clients, Client Groups, and Pipelines & POTs.

EUR is the fixed base currency (always 1:1, not editable, always active). Any other currency starts **inactive** — offered on offer/project currency dropdowns only once an admin activates it here. **"+ Activate currency"** picks an inactive currency and sets its exchange rate as "1 EUR = X"; once activated it appears in the active-currencies table alongside EUR, with its own symbol, name, rate, and last-updated date. An active currency's rate can be updated at any time directly in that table (a Save button per row); every update is timestamped. A **History** button (not available for EUR, whose rate never changes) opens a log of that currency's past rates over time.

Clicking Save on a rate change opens a confirmation dialog showing the old and new rate before it takes effect, explaining explicitly that the update does **not** retroactively change any proposal or project already in the system — each offer's own exchange rate is fixed the moment the offer is created (or last saved with that currency selected), and only applies going forward to new offers (an existing offer's rate can only change if it is re-saved with that currency selected again, which recomputes it from the then-current admin rate — there is no separate, user-facing "refresh rate" action). This mirrors, in the offer editor itself, the rate display described in §4.9 below.

**Number format (2026-10-01).** Every amount in the app is written and read with the number convention of its own currency, taken from the currency's locale: `€ 1.234,50` for EUR, `$ 1,234.50` for USD, `CHF 1'234.50` for CHF, `¥ 1,235` for JPY (currencies without fractional units show no decimals). The thousands separator is always shown for amounts of 1.000 or more. The same applies to input: in a money field (project phasing and PTC, a cost-grid task's PTC) the value is shown while editing in the same convention it is read back in (e.g. `350,28` for EUR), so clicking into a field and leaving it never changes the stored amount; a value typed in another convention is **not** guessed (typing `350.28` in an EUR field is read as 35.028 — the field then shows what was read). The pipeline-change notification sent to admins uses the same format. Known limitation: a program that mixes projects in different currencies totals them as raw sums (shown in EUR), without conversion.

This exchange rate is the same one used throughout the app wherever a non-EUR figure needs a EUR-equivalent — the pipeline board's mixed-currency column totals (§4.2), the rate card's per-currency columns (§7.2), and any other cross-currency aggregation all read this same admin-managed rate, not a separately configured one.

Actions: Add, edit, delete.

---

