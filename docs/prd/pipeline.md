# Pipeline

Part of [PRD.md](../../PRD.md) — carries PRD §4 Pipeline Board.

## 4. Pipeline Board

### 4.1 Purpose

Organise all commercial offers (cost grids) by deal stage. Each offer is a card in a kanban column. The board gives a quick read of what is in the pipeline, the value at each stage, and the current status of each deal.

### 4.2 Deal Stages (Columns)

Six fixed stages, displayed left to right:

| Stage | Meaning |
|---|---|
| Draft | Private working copy — visible only to its creator; excluded from column totals |
| SIP | Strategic intent / early prospect |
| Expected | Qualified opportunity, likely to close |
| Anticipated | High-confidence, close imminent |
| Committed | Deal signed / Committed revenue |
| Canceled | Opportunity withdrawn or lost |

**Column header totals (2026-10-06, replaces the former footer row):** each column's header shows its name, the number of offers and the fee total of the offers in it (PTC on a smaller "+ € X PTC" line). If every offer in the column is in EUR, the total is a plain EUR figure. If at least one offer is in another currency, the total is "≈ € …" — every offer's fee converted to EUR with that offer's own exchange rate, not a naive sum of raw numbers — and, with Amounts set to Original currency, one pill per currency underneath shows that currency's own subtotal. Clicking a header collapses the column to a narrow strip (name and total shown vertically) and clicking again expands it; columns that are empty when the page loads start collapsed, and the Draft column opens again after a new proposal is created or cloned.

**Open pipeline (2026-10-06):** the header of the board shows "OPEN PIPELINE ≈ € …", the fee total in EUR of the SIP, Expected and Anticipated columns (Draft, Committed and Canceled are not part of it). It follows the active filters and is always in EUR.

### 4.3 Offer Cards

Each card represents one cost grid (the version shown on the board). Since 2026-10-06 a card shows, top to bottom:

- Client name, a "Linked" pill when the version has generated projects, and the version label
- Offer name (at most two lines; the full name appears on mouse-over)
- Fee amount in the offer's currency, with "≈ € …" next to it for a non-EUR offer ("No budget" when there is none); "+ X PTC" underneath when there are pass-through costs
- Creation date and owner

The column is the stage (no stage badge on the card); Draft cards have a dashed border; the card whose detail panel is open has a magenta border. With a mouse, hovering a card replaces the date with text actions: **Edit** and **Clone** (hidden for viewers), **Share** (not on Draft) and **Delete** (red, Draft only, with edit permission — see §18.3). The same actions appear when the card is reached with the keyboard (Tab); on touch screens the card shows no actions and the detail panel carries them.

Clicking a card (anywhere other than the actions), or pressing Enter/Space on it, opens the **Detail Panel**.

### 4.3a Filtering (2026-09)

A filter bar sits below the title, above the columns, so the board stays readable as the number of offers grows. In order: a free-text search box (matches offer name or client name), then four multi-select dropdown filters — Owner, Client, Currency, and Value (deal size, bucketed €0–20K / €20K–50K / €50K–100K / €100K–200K / €200K+, with an "Include PTC" toggle deciding whether pass-through costs count toward the bucket). Selecting multiple values within one filter is an OR (e.g. two owners at once); different filters combine as AND. All filtering updates the board instantly as selections change, and a "Clear filters" control appears once any filter is active. Filters never change which offers a user is allowed to see (§18) — they only narrow what's already visible — and the Draft column is always shown in full, unaffected by any filter, since it's a private working copy. Filters reset whenever the page is reloaded.

**Search suggestions (2026-10-06):** while the search box has focus, a menu under it suggests matches in the selected pipeline year: CLIENTS (with their number of proposals — clicking one filters the board to that client and clears the search text) and up to four PROPOSALS (amount, stage, client — clicking one opens its detail panel), with "N more results — refine your search" when there are more. The board keeps filtering as you type; the menu is only a shortcut. Esc or a click elsewhere closes it.

**Amounts (2026-10-06):** an "Amounts" switch on the right of the filter bar toggles cards and column headers between **Original currency** (each offer in its own currency, "≈ € …" beside foreign ones) and **All in EUR** (every amount converted with the offer's own exchange rate, with "from CHF …" under foreign ones). It is not remembered across page loads and does not change the Value filter or the Open pipeline figure.

**Small screens (< 768px, 2026-10-06):** the board shows one stage at a time, chosen from a row of scrollable stage tabs (each with its count), with a summary of the selected stage (number of offers, total, currency pills) above the cards. The search box stays visible; the four filters and the Amounts switch move into a **Filters** panel that slides up from the bottom and closes with **Show results**.

### 4.4 Detail Panel

**Since 2026-10-07** the panel is a 480px column. On wide screens (from 1280px with the sidebar open, from about 1110px with it collapsed) it sits beside the board, which shrinks; on narrower screens it slides over the board with a light grey veil (clicking the veil closes it); on phones (< 768px) it fills the screen. Clicking another card (or a proposal in the search suggestions) switches the panel to that offer without closing it; clicking elsewhere closes it; Esc closes it — but if a menu, a filter dropdown or a dialog opened from the panel is showing, Esc closes only that.

**Header:** stage pill, "Linked project" pill when projects were generated, and a **Version** selector with one segment per version (label + stage dot; clicking one reloads the panel for that version); the client, the offer title and "Owner … · Created on …"; the actions **Edit** and **Clone** (hidden for viewers), **Share** (not on Draft) and **Delete** (Draft only, with edit permission). Deleting a proposal's only remaining version deletes the entire proposal, since every proposal always has at least one version (see §18.3 for viewer rules).

**Tabs** (the panel always opens on Overview):

- **Overview** — Professional fees, PTC and Total budget in the offer's currency (with "≈ €" for a non-EUR offer); Period ("May 2026 – Dec 2026"); Currency with its "1 € = x" snapshot rate and, for admins when the snapshot is out of date, a **Refresh rate** button; the version note; **Shared with** (who has access, with removal for those who can manage it).
- **Tasks (n)** — per phase, its total and one row per task: name, period, hours, amount.
- **Linked projects (n)** — one card per generated project: name, project code, stage and project-status pills, the tasks assigned to it, and a "Project Dashboard →" link to that project's reporting view. Without projects the tab explains they are created from the Cost Grid with "Generate project".
- **POT** — see §4.8.

### 4.5 Board Toolbar

- **Pipeline year dropdown** (replaces the static "Pipeline" title) — shows the selected year and a caret; clicking opens the "Available pipelines" menu with one row per visible pipeline year and, under each, the number of offers it holds for you (the proposals you can see in its SIP…Committed columns — Draft and Canceled are not counted). The open year is marked "Current"; an admin also sees inactive years, marked "Closed". Esc or a click elsewhere closes it. Switching year reloads the board via `?year=YYYY` URL param.
- **Open pipeline** figure — see §4.2.
- **+ New Proposal** button (2026-10-07: no name prompt) — creates a blank Draft grid named "New proposal" at once and opens the Cost Grid Editor on it, with the project name field focused and selected so it can be renamed right away (hidden for non-admins on inactive years)

### 4.6 Pipeline Stages

See §4.2 for the full list of stages and their meanings.

### 4.7 Pipeline Years

Admin-managed via **Configuration → Pipelines & POTs**. Each year is either Visible (appears on the board) or Hidden (suppressed for all users). The board enforces visibility: `GET /api/cost-grids?year=YYYY` returns 404 for unknown years and 403 for inactive ones.

### 4.8 POT Summary in Detail Panel

The detail panel's **POT** tab (2026-10-07) compares the offer's client (or client group) target for the offer's pipeline year with the proposals of that target in that year only:

- the percentage of the target reached by **Committed + Anticipated** (it can exceed 100%);
- a bar split into Committed, Anticipated, Expected and SIP (SIP striped) with a "Target" mark, and a legend with each amount; only Committed + Anticipated count toward progress and gap — SIP and Expected are shown as upcoming pipeline;
- four figures: Committed and Anticipated (each with % of target), Total (C+A), and **Gap to target** — or **Over target** in green once the target is exceeded;
- **Contributing proposals** (Committed and Anticipated) and **Other proposals · not in total** (SIP and Expected, greyed), each with client, year, stage and amount. These lists include every proposal of the target, also those not shared with you, so their rows cannot be opened.

When there is nothing to compare, the tab says so: Draft versions don't count toward the POT; an offer without a client has no POT; a client without a target for that year shows "No POT target for … in …".

### 4.9 Cost Grid Editor (overlay)

Accessed via "+ New Proposal" or the Edit button on a card. The editor opens as a full-page overlay that keeps the Pipeline tab highlighted in the nav.

**Header card** (2026-10-07 redesign): one card replaces the former toolbar — title/subtitle/stage pill, a version segmented control ("+ New version", Draft only, plus one segment per version — see "Versioning" below), and the action row: 💾 Save · ⧉ Clone · ⬇ Export XLS · 🔗 Share (opens the same share modal described in §18.2, with the same inline "Shared with" list and removal described in §18.3 — the full-page editor is not a separate sharing surface, it's the same mechanism as the pipeline board's detail panel) · one primary action per state (🚀 Publish to SIP on Draft, "Generate project" otherwise when free tasks remain). 🗑 Delete version (Draft stage only) moved into the Draft banner. The grid card's own header carries a ⊟/⊞ compact-columns toggle (hides the per-role code/label polish only — see "Role columns" below for where the move/change/duplicate/remove/reset controls actually live now).

**Grid-level fields:**
- Grid name

**Version-level fields:**
- Version label
- Pipeline stage (SIP / Expected / Anticipated / Committed / Canceled)
- Start date / End date
- Currency (any currency an admin has activated, see §7.7). **Locked once a project has been generated from the offer** (2026-10-01, any pipeline stage; the rest of the offer stays editable): the menu is disabled with the tooltip "Currency is locked: a project has already been generated from this proposal." — it locks right after "Generate project", and a sysadmin can still correct it through the API. Whenever a non-EUR currency is selected, the field shows the offer's own frozen "1 EUR = X" exchange rate underneath it (the rate this offer was last saved with, not a live lookup — see §7.7 for why)
- Client and rate card selection (drives the effective rate for each role column)
- Description (free text; labelled "Notes" before 2026-09-29). "Generate project" copies it into the new project's Description once (§7.1)
- Linked projects (multi-select from configured projects)

**Structure:** Phases → Tasks → Roles

- A grid has one or more **phases** (named work packages)
- Each phase has one or more **tasks**
- Each task has estimated **hours** per **role** (despite the "days" terminology used loosely elsewhere in this document's own history — the actual stored, calculated, and displayed unit throughout the cost grid is hours, entered directly, not converted from a day count)
- Pass-through costs (PTC) can be added at task level

**Role columns:**
- Added/removed dynamically
- Each role has a label, a code (matching the actuals XLS), a team, and an hourly rate (€/h)
- Effective rate follows a fallback chain: client rate card override → role's per-currency agency default → EUR rate × currency exchange factor
- Each role column header carries a ⋮ menu (2026-10-07; previously four always-visible icon controls) with: ◀ / ▶ to move the column left/right, "Change role…" to replace that role with a different one (keeping its position and hours), "Duplicate with another role…" to duplicate the column under a different role, "Reset rate to {baseline}" (only shown when the rate is a custom override), and "Remove column" — which requires a second click on the same menu item to confirm (its label changes to show the hours that will be deleted) rather than a separate confirmation dialog.

**Cost calculation:**
- Task budget = Σ(hours × hourly rate) per role + PTC
- Phase budget = Σ task budgets
- Total budget = Σ phase budgets

**Versioning:**
- Multiple versions per grid
- **Publishing a Draft to SIP** (🚀 Publish to SIP, Draft versions only): a one-way transition — once published, a version can never be set back to Draft. Publishing makes it visible to the rest of the team for the first time (a Draft is private to its creator, see §4.2). If the same proposal has *other* Draft versions besides the one being published, they are **permanently deleted** as part of publishing — the confirmation dialog names them and warns of this before it happens.
- **+ New version** (full-page editor, Draft versions only; 2026-10-07: no name prompt) — creates immediately with a default label (`v{n}`) and opens it; the label is editable afterward by clicking it in the version segmented control (same click-to-edit affordance as a phase name). Creates a new Draft version of the same proposal as a **full copy** of the version being viewed — project name, client, dates, currency (and its exchange-rate snapshot), description, rate card, every phase, task (hours per role, PTC, dates, description), role rates (including custom rates) and tags. Not copied: links to generated projects and the pipeline stage/year (the new version always starts as Draft). Pending editor changes are saved first; if that save or the copy fails, an info message is shown and no version is created.
- **Clone** (⧉, available from a card, the pipeline board's detail panel, and the full-page editor; 2026-10-07: no name prompt) — acts at once: creates a brand-new, separate proposal named "{source name} — Copy" — not a new version of the current one — copying the current version's full phase/task/role structure, and opens it in the editor. The new proposal's first version is always labeled "v1" regardless of what the source version was labeled. Not copied: the exchange-rate snapshot (the copy takes the live rate) and tags. If cloning the version currently open in the editor, any pending unsaved edit is saved first so the copy carries it (skipped for a viewer, who cannot save).
- A version is **locked** when: (a) the proposal itself is Committed **and** every task has already been migrated to a project, or (b) another version in the same grid has a linked project
- Locked versions display a lock icon (SVG, 2026-10-07; previously a 🔒 emoji) and are read-only
- While the proposal is Committed but tasks remain unmapped, the version stays fully editable and "Generate Project" stays available for the remaining tasks — a proposal can generate more than one project over time, and being Committed does not by itself block that
- **Program auto-link (2026-09):** generating a project from only a subset of the proposal's available tasks (any stage except Draft), when the proposal has no program established yet, opens a "Create program" step (name + ID, or link to an already-existing program) before the project is created; canceling that step aborts the whole generation with nothing created. Once a program is established this way, every later project generated from the same proposal — partial selection or the remaining full set — auto-links to that same program with no further prompt. Any authenticated user with editor access to the proposal can establish a program this way, not just admins.
- **Selecting every remaining task at once** produces a single project with no program prompt at all — the program step only triggers when the selection leaves at least one task unassigned (see above); a proposal generated in one full pass never needs a program unless the user chooses to link one anyway via a later partial generation.
- **Adding tasks to an already-linked project** (as opposed to generating a brand-new one): the task-selection bar (2026-10-07: a "New project" / "Existing project" segmented control, replacing two always-visible buttons) switches to "Existing project" — disabled with a tooltip if the proposal has no linked project yet — revealing a dropdown of its existing linked project(s) (auto-selected if there's only one) and a single "Add {n} to project" button in place of "Create project". Selecting tasks and confirming appends them to that existing project rather than creating another one. A confirmation step lists exactly which tasks will be added before it happens; the dropdown always resets to unselected after use, so it never silently retains a previous choice.

**Version actions:** Duplicate, Delete, JSON export/import

**Saving:** every field edit inside the editor (phase/task names, descriptions, PTC, header fields, role rates, etc.) schedules an autosave in the background, confirmed by a brief "💾 Auto-saved" toast — there is no need to click anything for an edit to persist. A `💾 Save` button is also available in the toolbar for an explicit, immediate save (shows "💾 Saving…" while in flight).

**Back button:** Returns to Pipeline Board (also triggers an autosave of the current draft state before navigating, on top of the continuous per-edit autosave above).

---

