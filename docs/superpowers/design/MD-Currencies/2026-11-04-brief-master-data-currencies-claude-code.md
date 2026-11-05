# Brief — Master Data · Currencies (phase 2, page 4 of 4)

**Goal:** redesign the content of the "Currencies" section inside the Master Data shell delivered in phase 1. The plain table with always-open rate inputs becomes a read-first list (rate shown as a value, edited on click); the "Activate a currency" form card becomes an inline row with a searchable picker; the Bootstrap history modal becomes a side panel with a small trend chart.

Prerequisite: the phase-1 shell is merged. Do not change the shell.

Page touched: `master-currencies.html` only. No API change.

## 1. References

| Board | File / state | Use it for |
|---|---|---|
| 10.6a | `MDCurrencies.dc.html` (default) | List: currency cell, EUR base row, rate + delta, inverse, last updated, row actions, info note |
| 10.6b | `MDCurrencies.dc.html`, `adding=true` | Inline activate row with the searchable picker open |
| 10.6c | `MDCurrencies.dc.html`, `history=true` | Rate history side panel (USD) |
| 10.6d | `MDCurrenciesResponsive.dc.html` | Tablet (1024×768) and smartphone (390×844, edit-rate bottom sheet) |

`Section - MD Currencies.dc.html` holds the board notes (Italian): current vs. new per area, plus open questions. Read it for intent; this brief is normative where they differ.

JPG captures of each board are in `docs/captures/currencies/` (file name starts with the board id). They are scaled down to fit one image: use them to see each state, take sizes and values from the HTML. Rendering artifacts in the captures are not part of the design (e.g. the scrollbars inside the picker in 10.6b).

Sample data (active set EUR/GBP/CHF/USD, rates, dates, "Admin PDash", "Used in" counts) is illustrative. The boards format numbers Italian-style ("1,3000"); the app formats rates in `en` ("1.3000") — follow the app (§7.4).

## 2. Precedence

**The app's current rules win over the boards.** Boards define layout, hierarchy, copy and interaction; they do not change business rules, permissions or API contracts unless this brief says so explicitly.

- Rules follow the existing code: `api/src/routes/currencies.js`, `api/src/db/migrations/012_currencies.sql` (closed list of 20 currencies, `DECIMAL(10,6)` rate, `currency_rates` log), `api/src/lib/version-rate.js` (versions snapshot the rate; an inactive currency is refused for new versions).
- Shared components and tokens (buttons, inputs, side drawer and confirm dialog introduced for Clients / Pipelines / Roles, `.pd-icon`, `css/tokens.css`, breakpoints) win over board values. Primary buttons use the app-wide magenta `.btn-primary` (boards draw "+ Activate currency", "Activate" and "Save" navy — same accepted deviation as Clients / Roles). No hex literals in the page.
- Where a board shows something the app cannot do today, §7 says whether to build it, adapt it, or hide it. Anything not covered: follow the app and note the deviation in the PR.

## 3. Current state in the repo

- `master-currencies.html`: Vue app. "+ Activate currency" opens a form card (`crf`): native `<select>` of inactive non-EUR currencies, `type="number"` "1 EUR =" input with the symbol (or "?") as suffix, Activate / Cancel, error under the form.
- Table of **active** currencies only: Code, Symbol, Name, "1 EUR =", Last updated, actions. EUR shows "Fixed 1:1". Every other row has an always-open number input (`crEdit[code].rate`, 6 decimals) and a per-row Save.
- Save → `confirmUpdateCurrencyRate` → Bootstrap modal `#crRateConfirmModal` ("Update exchange rate?", old → new, "does not affect any proposal or project already in the system…") → `updateCurrencyRate` → `Api.currencies.updateRate`, reload.
- History → Bootstrap modal `#crHistoryModal` with `Api.currencies.history(code)` (Date / 1 EUR = / Updated by, newest first, max 100 rows).
- Data: `Api.currencies.list()` → `{code, symbol, name, locale, active, current_rate, last_updated}`, ordered EUR first, then active, then name. `last_updated` = newest `currency_rates.created_at`. `updated_by` exists only in the history endpoint.
- Server rules: rate must be a finite number > 0 ("rate must be a positive number"); EUR cannot be activated or re-rated ("EUR is always active" / "EUR rate is fixed at 1:1"); activate on an active currency → 409 "Currency already active"; update on an inactive one → 400 "Currency is not active"; unknown code → 404. Activate and every update insert a `currency_rates` row (so the oldest history row is the activation). Updating to the same value is allowed and logged.
- **No deactivate endpoint**, no per-currency usage count, no way to add a currency outside the seeded list.
- `master-data-guard.test.js` currently requires `id="crHistoryModal"`, `id="crRateConfirmModal"` and `this.crEdit` in this page (§11).

## 4. List (10.6a)

Content card header: title "Currencies", description "Active currencies can be used in proposals and rate cards. EUR is the base currency." Right: primary **+ Activate currency** (hidden while the activate row is open).

Info note under the header (grey box, info icon): "A new rate applies to proposal versions created from now on. Existing versions keep the rate saved when they were created." (true: `cost_grid_versions.currency_rate` is a snapshot; a version can be refreshed explicitly from the cost grid — not mentioned here, it is in the confirm dialog, §5).

**Columns** (header 10px uppercase): Currency | Rate · 1 EUR = | Inverse | Last updated | ~~Used in~~ (§7.2) | actions. Rows: active currencies only, in the API order (EUR first). Min height 58px.

- **Currency:** 34×34 rounded box with `symbol` (smaller type when the symbol is longer than 2 characters, e.g. "CHF", "د.إ"), `code` bold, `name` muted below. EUR: green-tinted box (success token) and a navy "Base" pill.
- **Rate:** EUR "Fixed · 1.0000", muted, not clickable. Others: the rate as a value (§7.4), the symbol muted, a pencil icon, then the delta from the previous rate ("▲ 8.3%" / "▼ 7.0%", one decimal, muted; hidden when there is no previous rate or the change is under 0.01%). Clicking the value opens inline edit (§5).
- **Inverse:** "1 GBP = € 1.2500" (1 / rate, 4 decimals, EUR symbol from `currencyInfo`); EUR "—".
- **Last updated:** date of `last_updated` (`en-GB`, "3 Oct 2026" as today, or the board's "Oct 3, 2026" — pick the app's existing date helper and stay consistent across the page), "Updated by" name below in muted 11px (§7.3). EUR "—".
- **Actions** (non-EUR only): "History" text link (opens §6). The "⋯" menu with Deactivate is not built (§7.1).

Delta and "updated by" come from the history (§7.3). While histories are loading, show the row without them; on a history error, just omit them.

Empty state is unreachable (EUR is always active); keep the current "No active currencies." as a fallback.

## 5. Edit rate (10.6a, inline)

- Click on the value (or the pencil) → the cell turns into an input (110px, magenta focus ring, symbol suffix) prefilled with the current rate, plus **Save** and **Cancel**. Only one row in edit at a time; opening another cancels the first. Esc = Cancel, Enter = Save. Focus the input and select its content.
- The input shows the full stored precision (up to 6 decimals, §7.4); accept "." or "," as decimal separator and convert to "." before `parseFloat`.
- Save keeps **the app's confirmation step** (§7.5): validate as today ("Rate must be a positive number", shown under the input), then open the shared confirm dialog with the current copy — title "Update exchange rate?", body "You're about to change 1 EUR = <old> → <new> <symbol> for <CODE>." + "This update does not affect any proposal or project already in the system — it only applies to new ones created from now on (or to an existing cost grid version if a "refresh rate" is explicitly run on it)." — Cancel / **Confirm** (spinner while saving). Server errors stay inside the dialog, Confirm stays enabled for retry.
- When the new value equals the current one, Save still works (the server logs it as "no change", §6); no extra warning.
- After saving: close the dialog and the edit, reload the list (as today), refresh that currency's history for the delta. No banner, no scroll.
- Replaces the always-open inputs and per-row Save. Remove the Bootstrap modals and `bootstrap.Modal` calls from the page; keep Bootstrap JS only if something else on the page still needs it.

## 6. Rate history (10.6c)

Shared side drawer (560px, navy scrim; closes on scrim click, ✕, Esc), opened by "History". Replaces `#crHistoryModal`.

- Head: eyebrow "Rate history", title "<name> (<CODE>)", sub "Every change is logged with date, time and user."
- Current rate in large type: "1 EUR = **1.3000** $ · current".
- Trend chart: an inline SVG polyline of the rates in chronological order inside a grey box, first and last date under it. One point → a flat line. No axes, no tooltips. (SVG chart is fine here: it is data, not illustration.)
- "Changes · N" list, newest first, from `Api.currencies.history(code)`: dot (magenta for the newest, grey otherwise), date + time (`en-GB` as today), `updated_by` (or "—") below, delta vs. the previous (older) entry as "+0.1000" / "−0.1000" (4 decimals) or **"no change"** in amber when equal, the rate right-aligned.
- The oldest row gets "· activated" after the user name **only if the list has fewer than 100 rows** (the endpoint caps at 100, so the 100th may not be the activation).
- Loading: spinner in the body. Error: "Couldn't load the rate history." with Retry. Empty (should not happen): "No rate history yet." (current copy).

## 7. Board items that need a decision (defaults apply unless told otherwise)

1. **Deactivate** ("⋯" menu, disabled when used by proposals). No endpoint exists and an inactive currency has real effects (new versions refused via `versionRate`, cost-grid clone blocked, role overrides hidden). Default: **don't build it** in this cycle — no "⋯" menu. A `POST /currencies/:code/deactivate` with a usage check is a separate backend task; when it exists, add the menu as on the board.
2. **"Used in" column** (number of proposals). No endpoint returns it. Default: **hide the column**. A `usage` field on `GET /currencies` (distinct `cost_grid_versions` + `projects` per currency) is a separate backend task (it would also feed §7.1).
3. **Delta and "updated by" in the list.** `GET /currencies` returns only `last_updated`. Default: **build them from the history**: after the list loads, call `Api.currencies.history(code)` for each active non-EUR currency in parallel (the active set is small) and take the first two rows (delta) and the first row's `updated_by`. Cache per page load; refresh one currency after a save. No API change. Alternative: hide delta and "updated by" in the list and show them only in the drawer.
4. **Decimals.** The board shows 4 decimals with comma separator; the DB stores 6 and the app shows 6 in `en`. Default: **display the rate with 4 to 6 decimals** — minimum 4, extra digits shown only when non-zero (0.857143 stays 0.857143; 1.3 → 1.3000), `en` locale (dot). Inverse and history deltas at 4. The edit input always shows the full stored value. Nothing is rounded on save.
5. **Confirmation before a rate change.** The board saves inline with no confirmation; the app asks for one. Default: **keep the confirmation** (shared confirm dialog, current copy) — the in-header note does not replace it.
6. **Activate row validation.** Board: Activate enabled only with currency and a valid rate. App: Activate enabled with a currency, rate checked on click. Default: **board behaviour** (disabled until both are valid, same checks as the server: finite, > 0); keep the current messages for server errors.
7. **Sub-nav count** ("Currencies 4"): follows the phase-1 decision (no counts).

## 8. Activate currency (10.6b)

Replaces the form card. "+ Activate currency" inserts an inline row at the top of the table body (grey background) and opens the picker.

- **Currency picker** (combobox, magenta focus ring, placeholder "Select currency…"): dropdown 320px with a search input "Search code or name…" filtering on code, name and symbol (case-insensitive); options = `currencies` where `!active && code !== 'EUR'`, in the API order; each option shows code (bold), name, symbol (muted). Keyboard: arrows, Enter, Esc. Selected → "<CODE> — <name>". If no currency is left to activate, hide "+ Activate currency".
- **Rate** input in the "Rate · 1 EUR =" column, placeholder "e.g. 1.6500", the selected currency's symbol as suffix; "." or "," accepted (§5). The initial value is empty (today it is "1": drop it, it invites activating at a wrong rate).
- **Inverse** column: live preview "1 <CODE> = € <1/rate>" (4 decimals), "—" until valid.
- Muted hint in the remaining columns: "Starts the rate history."
- **Cancel** and primary **Activate** (disabled until valid, §7.6; spinner while saving). Calls `Api.currencies.activate(code, rate)` as today. Errors (400 / 404 / 409) shown under the row, row stays open.
- After success: close the row, reload the list; the new currency appears in its API position.

## 9. URL

No URL state is required. Optional: `?history=<CODE>` opens the drawer (replaceState). Unknown or inactive code → list only.

## 10. Responsive (10.6d)

Shell behaviour is from phase 1. Content:

**Tablet (768–1023px)**
- Header: title + "+ Activate currency" (40px). Info note stays.
- Rows: Currency | Rate (input-styled box 40px, tap to edit as in §5) with the inverse under it in 11px | Last updated | History. "Used in" and delta-badge may drop if space is short (keep delta if it fits). Controls 40px.
- Activate row: picker and rate stack in two lines inside the row if needed.
- Drawer: width min(560px, 100%).

**Smartphone (< 768px)**
- Section selector (shell), then full-width "+ Activate currency" (44px). Info note as a collapsed one-liner is fine.
- One card per currency: symbol box, code + name, rate (15px bold) with the inverse below on the right. Non-EUR cards end with two 44px actions: **Edit rate** · **History**.
- Edit rate → bottom sheet: title "Edit rate · <CODE>", Cancel; label "1 EUR =", input 48px with symbol suffix; helper "1 <CODE> = € <inverse> · applies to new proposal versions"; primary **Save rate** (46px). Save goes through the same confirm step (§7.5) — as a second bottom sheet or the dialog full width.
- Activate → bottom sheet with picker (full-height list with search) and rate, same rules as §8.
- History → full-screen drawer with a sticky header.

## 11. Copy and icons

- All UI copy in English, sentence case, as in the boards. Keep existing validation and server error strings.
- No emoji. 14/16px stroke SVGs with `currentColor` via `.pd-icon` (info, pencil, chevron, close, search). "▲ ▼ — ≈ ×" as text glyphs are fine.
- Amber for "no change" and the success tint for the EUR box from tokens, not literal hex.

## 12. Tests

- `master-data-guard.test.js`: the `master-currencies.html` entry lists `must: ['id="crHistoryModal"', 'id="crRateConfirmModal"', 'this.crEdit']`. Those markers belong to the old modals: **update the entry** to the new markers (e.g. the drawer / confirm dialog component names and the inline-edit state) in the same PR, and say so in the PR. Keep `api: ['currencies']` — the page must still call only `Api.currencies.*`. All other shared checks must pass unchanged.
- Add tests for: only active currencies listed, EUR first and not editable; rate display 4–6 decimals (§7.4); inverse = 1/rate at 4 decimals; delta from the two newest history rows, hidden under 0.01% or with one row; "no change" for equal consecutive rates; "activated" on the oldest row only under 100 rows; picker lists only inactive non-EUR and filters on code/name/symbol; Activate disabled until currency and rate > 0; "," accepted as decimal separator; rate change goes through the confirm dialog and calls `updateRate` once; server error kept inside the dialog; no `bootstrap.Modal`, `confirm()` or `alert()` left.

## 13. Out of scope

- The shell (phase 1). Clients & groups, Pipelines & POTs, Roles & rates (own briefs).
- Deactivate endpoint and usage counts (§7.1, §7.2). Adding currencies outside the seeded list. Changing how versions snapshot or refresh rates.

## 14. Definition of done

- Read-first list of active currencies with base EUR row, rate value + delta, inverse, last updated + user, History.
- Inline rate edit with the app's confirmation, inline activate row with searchable picker and live inverse, history in a side drawer with trend chart and per-change deltas.
- Tablet and smartphone layouts as in 10.6d; touch targets ≥ 44px on phone.
- No Bootstrap modals, no emoji, no `confirm()` / `alert()`; English copy; tokens and shared components used; guard test updated.
