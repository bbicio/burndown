# Brief — Timesheets · Actuals and Profile processing

**Goal:** redesign the content of `timesheets.html` (Actuals) and `profile-jobs.html` (Profile processing) and link the two with an in-page sub-navigation, replacing the header button. Direction **B** was chosen for both pages:
- **Actuals:** a list grouped by client, with View and Download on the row and Delete actuals in a "⋯" menu.
- **Profile processing:** a compact status strip, settings in a side drawer, and Run history as a second view of the table card.

Pages touched: `timesheets.html`, `profile-jobs.html`. No API change.

## 1. References

| Board | File / state | Use it for |
|---|---|---|
| 11.1a | `Timesheets.dc.html`, `variant=B` | Actuals: sub-nav, filters, info note, grouped list, row actions |
| 11.1c | `Timesheets.dc.html`, `variant=B state=view` | View modal (restyle only) |
| 11.1d | `Timesheets.dc.html`, `variant=B state=menu` | "⋯" menu with Delete actuals |
| 11.1e / 11.1f | `Timesheets.dc.html`, `state=empty` / `state=nomatch` | Empty states |
| 11.2a | `ProfileProcessing.dc.html`, `variant=B` | Status strip, project codes table |
| 11.2b | `ProfileProcessing.dc.html`, `variant=B state=settings` | Settings drawer |
| 11.2c | `ProfileProcessing.dc.html`, `variant=B state=errorOpen` | Error row expanded, Queued rows |
| 11.2d | `ProfileProcessing.dc.html`, `variant=B state=alerts` | The three alerts (red / amber / green) |
| 11.2e | `ProfileProcessing.dc.html`, `variant=B state=history` | Run history view |
| 11.2g / 11.2h | `ProfileProcessing.dc.html`, `state=empty` / `state=nomatch` | Empty states |
| 11.3 | `TimesheetsResponsive.dc.html` | Tablet (1024×768) and smartphone (390×844) for both pages |

- `Section - Timesheets.dc.html` holds the board notes (in Italian) and the rejected A options (11.1b, 11.2f). The A options are not to be built.
- The JPG captures are in `docs/captures/timesheets/`; each file name starts with the board id. They are scaled down: use them to see each state, and take sizes and values from the HTML.
- The source description of the current behaviour is `docs/superpowers/design/timesheets/2026-11-05-brief-timesheets-profile-jobs.md` in the repo. It is normative for rules and data.
- The sample data is illustrative: clients, codes, names, rates, dates and error strings.

## 2. Precedence

**The app's current rules win over the boards.** Boards define layout, hierarchy, copy and interaction. They do not change business rules, permissions, polling or API contracts unless this brief says so explicitly.

- Stack unchanged: Vue 3 from CDN, Bootstrap 5, no build step.
- Use the shared components and tokens: buttons, inputs, the side drawer and confirm dialog used in Master Data, `showConfirm()`, `.pd-icon`, `css/tokens.css`, and the currency formatting helpers. These win over board values.
- Primary buttons use the app-wide magenta `.btn-primary`. The boards draw "Recalculate now" and "Save schedule" in navy; this is the same accepted deviation as in Master Data.
- No hex literals in either page. `timesheets.html` currently has hex colours in its own `<style>`: remove that debt.
- The shell (`pd-nav`, breadcrumb, `.ph`) is shared and must not be redesigned. §4 only changes the `.ph` text and adds the sub-nav inside the content.
- Anything this brief does not cover: follow the app and note the deviation in the PR.

## 3. Current state (summary)

The full description is in the source brief. Key points:

**`timesheets.html`**
- Admin and sysadmin only.
- `.ph` shows "Timesheets", the subtitle "N projects", and the button "Profile processing →". The button has a yellow queue badge, which is read once on load.
- Red error banner.
- Guide text, which wrongly says "Load XLS".
- Filters: Client and Project (multi-select checkbox dropdowns), Project code (text), Pipeline year (initial value = current year), and Reset filters.
- Flat table: Client, Project, Project code, Uploads, Rows, Last uploaded, then the View / Download / Delete buttons with emoji.
- Sort is 3-state on Client, Project and Code.
- View opens a `modal-xl`.
- Download generates the file client-side with ExcelJS.
- Delete uses the native `confirm()`.

**`profile-jobs.html`**
- No sidebar entry.
- `.ph` shows "Profile processing", the subtitle "N queued", and no buttons. The breadcrumb is "Home / Timesheets / Profile processing".
- Three alerts.
- A settings card that is always visible: schedule toggle, interval, Save, topic extraction, Recalculate now, Rebuild all, and the next/last run line.
- Project codes table with search, status filter and a counter, polled every 15 s.
- `<details>` Run history (max 50 rows).
- One action at a time.

## 4. Navigation between the two pages (both pages)

Replaces the "Profile processing →" header button. This uses the same pattern as the Master Data sub-nav from the phase-1 shell; no tabs.

- **`.ph`:**
  - Title "Timesheets" on **both** pages. Today Profile processing has its own title.
  - Subtitle "Uploaded actuals and the experience profiles built from them." on both pages (§7.2).
  - No buttons.
- **Sub-nav card** on the left of the content (184px, white card, the same markup and component as the Master Data sub-nav — reuse it, or move it to a shared place if it is page-local today):
  - Group label "TIMESHEETS".
  - Item **Actuals** → `timesheets.html`.
  - Item **Profile processing** → `profile-jobs.html`.
  - The active item uses the Master Data active style: grey background and a magenta 3px inset bar.
- **Queue badge** on "Profile processing":
  - Yellow pill with the number of queued codes. Tooltip "N project codes waiting for profile processing".
  - Hidden when the queue is 0 or the call fails.
  - On `timesheets.html` it is read once on load, as today.
  - On `profile-jobs.html` it follows the 15 s refresh (it uses the same count as the queued subtitle today).
- **No count on "Actuals"**, even though the board shows "9". This follows the phase-1 Master Data decision (no counts in the sub-nav).
- Breadcrumb and sidebar unchanged:
  - The sidebar stays on "Timesheets" for both pages.
  - Profile processing keeps "Home / Timesheets / Profile processing".

## 5. Actuals — `timesheets.html` (11.1a, 11.1d–f)

One white card to the right of the sub-nav, containing:

**Filters row** (inside the card, wraps when needed): Client ▾ · Project ▾ · Project code field (placeholder "Filter by project code…") · Pipeline year select · Reset filters (icon + text link, shown only when a filter is active). All filter rules are unchanged, including the multi-select behaviour, the "Client (2)" label, the initial year, and Reset filters setting the year to "All years".

**Info note** (grey box, info icon): "Each row represents one project code. Uploading a new XLS for a project replaces all previous data for that code. **Delete actuals** permanently removes every timesheet row for that project from the database. Use **Load Actuals** in Portfolio to import new data." The text now says "Load Actuals" instead of "Load XLS", matching the real Portfolio button.

**Grouped list** (direction B):
- Column header (10px uppercase): Client / Project | Project code | Uploads | Rows | Last uploaded | actions.
  - "Client" and "Project" in the first header are separate sort targets.
  - Project code is sortable.
  - Sorting stays 3-state (▲ / ▼ / none).
- **Client group header:** a 40px grey row with a chevron, the client name in bold, and muted meta "N codes · M rows". M is the sum of Rows for the group's filtered codes.
  - Click toggles the group. All groups start expanded. The collapse state is kept for the session only and is not persisted.
- **Group order:** alphabetical by client. Sorting by Client reverses the group order; sorting by Project or Code sorts rows inside each group. With no sort, rows follow the server order (project code).
- **Codes with no project** (client "—") form a last group labelled "No client".
- **Rows:** indented 40px.
  - Project name: 13px semibold; wraps.
  - Code: monospace in a grey chip.
  - Uploads: muted, right-aligned.
  - Rows: bold, right-aligned, with a thousands separator.
  - Last uploaded: as today ("05 Nov 2026").
- **Row actions**, right-aligned:
  - **View**: outline button with eye icon and label.
  - **Download**: icon-only outline button, tooltip "Download actuals (.xlsx)". While the file is generated, show a spinner in the button and disable it (new — today there is no indicator).
  - **"⋯"**: menu with one item, **Delete actuals** (red trash icon, red label). Under the label is a muted line: "Removes M rows and re-queues the code for profile processing. Cannot be undone." Click → `showConfirm()` with the current copy ("Delete ALL timesheet data for project "CODE"? This removes N uploads (M rows). This cannot be undone.") and a destructive confirm button. While deleting, show a spinner on the row's "⋯" button. After success, reload as today. Errors go to the red banner.
- The menu closes on outside click and on Esc.
- No pagination and no inner scroll, as today.

**States**
- Loading: centred spinner, as today.
- Error: red banner above the card, as today.
- **Empty (11.1e):** folder icon (SVG), "No timesheets uploaded yet.", and "Use **Load Actuals** in the Portfolio view to import a timesheet export for a project." The filters row and info note stay visible.
- **No match (11.1f):** search icon, "No timesheets match the current filters.", and a "Reset filters" link.

## 6. View modal (11.1c)

Restyle only: columns, order (date ascending), data and behaviour are unchanged. It stays a large modal over a navy scrim.

- **Head:** the code in a monospace chip, "N rows" muted, and ✕. Closes on ✕, scrim click and Esc.
- **Table:** sticky header (grey, 10px uppercase), 34px rows. Columns: Date (ISO, as today) · Owner · Role (ellipsis + tooltip) · Task · Hours (bold, right) · Notes (one line, ellipsis + tooltip) · Fee (right) · Spent (bold, right).
- Fee and Spent are formatted in the **project currency** with the app helpers. The board's "€ 115,00" is sample data.
- Loading spinner and error behaviour are unchanged (on error the modal closes and the red banner shows).
- If the shared drawer/modal component used elsewhere fits a wide read-only table, use it; otherwise keep the current modal with the new styling.

## 7. Decisions (defaults apply unless told otherwise)

1. **Sub-nav instead of the header button** (§4). This changes the `.ph` title of `profile-jobs.html` to "Timesheets". Profile processing stays reachable only from Timesheets, with no sidebar entry.
2. **`.ph` subtitle.** The board uses one static description on both pages. "N projects" disappears. "N queued" is covered by the sub-nav badge. Alternative: keep the per-page counts as subtitles.
3. **Grouping by client** (§5). The board's group meta ("N codes · M rows") is computed client-side from the filtered list. The rule "if a code is used by several projects, Client/Project show the oldest project" still applies.
4. **Download spinner** (§5). This is a small addition, because today there is no feedback.
5. **Status strip next/last run** (§8). One block: "Next run" followed by the value, then a muted "· last HH:mm".
6. **Merged columns in Profile processing** (§9). These are needed to fit the sub-nav at 1400px.
7. **Run history as a second view** of the table card (§10). This replaces the `<details>`.
8. **Settings drawer close behaviour** (§8). Closing the drawer with unsaved schedule changes discards them silently.
9. **Error row timestamp.** The board shows "Last run failed · <date>". Show the timestamp only if the API already returns one for the code's last error; otherwise show only the error text.

## 8. Profile processing — status strip and settings (11.2a, 11.2b)

**Guide text** (12px muted, above the strip): the current text, unchanged.

**Status strip.** A white card with one row that wraps only on narrow screens. The action group always stays together on the right. Left to right:
- **Worker state:**
  - green dot + "Scheduled · every N min" when on;
  - grey dot + "Scheduled processing paused" when off.
- **Next run** (10px uppercase label):
  - the date and time ("2026-11-05 14:30"), or "Paused", or "On the next tick (within 60 s)";
  - then a muted "· last HH:mm" when a last scheduled run exists. Tooltip with the full last-run date.
- **Topic extraction** (sparkle icon): "Topic extraction on" or "Topic extraction off". When it is on and the server has no API key, add "(no API key configured)" in amber. Tooltip: "When off, project descriptions are never sent to the AI service".
- **Actions:**
  - **Settings**: outline button with sliders icon; opens the drawer.
  - **Recalculate now**: primary; no confirmation, as today.
  - **Rebuild all**: outline with red text and border. Click → `showConfirm()` with the current copy.
- All three buttons use `white-space: nowrap`.

**Settings drawer.** The shared side drawer, 440px, navy scrim. It closes on the scrim, ✕, Close, and Esc. Head: eyebrow "Profile processing", title "Settings".
- **Schedule:**
  - Toggle "Scheduled processing on/off".
  - "Interval (minutes)" field. The validation and message are unchanged: "Enter a whole number of minutes between 1 and 1440.", with a red field.
  - Helper text: the current text about the estimate restarting after an API restart, being precise to the minute, and ignoring manual runs.
- **Topic extraction:**
  - Toggle.
  - Helper "When off, project descriptions are never sent to the AI service. Saved immediately; turning it back on queues every project code."
  - It saves immediately, as today. The "(no API key configured)" warning also appears here.
- Short note: "**Recalculate now** processes the queue immediately; **Rebuild all** queues every project code first."
- **Footer:**
  - Close (text).
  - **Save schedule** (primary). It is enabled only when the toggle or interval differs from the saved value and the interval is valid (current rule). It shows a spinner while saving. On success it shows the green alert "Saved — applies on the next tick (within 60 s)." and the drawer stays open.
- The auto-refresh must not overwrite the toggle or interval while they are dirty (current rule).
- While any page action is running, the drawer controls are disabled (current rule).

## 9. Profile processing — project codes table (11.2a, 11.2c, 11.2g–h)

A white card with a toolbar and a table.

**Toolbar:**
- The view switch (§10).
- Search field "Search code or project…" (220px). All words must match code or project; case- and accent-insensitive.
- Status select: All statuses / Queued / Error / Updated. "Not processed" codes appear only with "All".
- On the right: "X of Y project codes" with a green dot and the tooltip "Refreshes every 15 s". The board moves "· refreshes every 15 s" from the visible text into the tooltip.

**Table:** inner scroll, max height 60vh, sticky header. Columns:
- **Project · Code:** project name (13px semibold; wraps), the code in muted monospace under it, and, when topic extraction failed, a red "Topic extraction failed" with a warning icon (the error goes in the tooltip). Sorting on this column sorts by **code** (natural order, as today; it is the default sort, ascending).
- **Actuals rows:** right-aligned.
- **Matched resources:** right-aligned. Show the value as the app does today; use "—" for never-processed codes.
- **Status:** a pill badge.
  - Error: red, with a chevron, followed by "(queued)" muted.
  - Queued: amber.
  - Updated: green.
  - Not processed: grey.
  - Sortable: Error → Queued → Not processed → Updated.
- **Last · next run:**
  - line 1, the last processed date and time, or "—";
  - line 2, for codes in the queue only (Queued or Error), "Next HH:mm" in amber, or "Next paused" / "Next within 60 s" following the strip value.
  - Sortable by last processed; never-processed codes always go last.
- **Actions:**
  - "Remove from queue": red text link, shown only for queued codes. Click → `showConfirm()` with the current copy.
  - **Process**: outline button, always shown; no confirmation.
  - Both are nowrap.
- **Error expansion (11.2c):** click on the Error badge opens a band under the row. The band has a light red background, an error icon, a bold "Last run failed" (plus a timestamp, see §7.9), and the full error in monospace. A second click closes it, and the chevron rotates. The open state must survive the 15 s refresh: key it by code and re-apply it after the rows are replaced.
- **Empty states:**
  - 11.2g: "No actuals uploaded yet."
  - 11.2h: "No project codes match the current filters.", plus a link "Clear search and status" (new, small).

## 10. Run history (11.2e)

Replaces the `<details>` panel. A segmented switch at the start of the table card's toolbar:
- **Project codes Y**: the default on page open.
- **Run history N**: N = number of history rows, max 50.

- With Run history selected, the toolbar shows only the switch. The search, status select and counter are hidden.
- The card body shows the history table: When · Type (monospace, raw value) · Projects · Resource contributions · Duration · Error (red text or "—").
  - Newest first, inner scroll.
  - Same data and formatting as today.
- The selected view is not persisted. The 15 s refresh keeps updating both views.

## 11. Alerts and page-wide rules (11.2d)

- **Placement:** above the guide text. Three independent alerts, the same messages and logic as today:
  - **red:** not dismissible, disappears on a successful refresh;
  - **amber:** dismissible ✕ (failed action, "already running", "No response from the server…");
  - **green:** dismissible ✕ (success).
- Use the shared alert styles with tokens and an icon per type.
- Preserve every rule in §2.3 of the source brief:
  - 15 s polling while the browser tab is visible;
  - no overwrite of dirty settings;
  - **one action at a time** across the page: all action buttons and settings controls are disabled, and only the clicked button shows a spinner;
  - Rebuild-all timeout handling;
  - no native dialogs.

## 12. Responsive (11.3)

The sub-nav follows the Master Data responsive pattern:
- tablet: a row of buttons under the `.ph`, with the active one white with a magenta bottom bar;
- smartphone: a section selector card ("TIMESHEETS · Actuals ▾"), with the queue badge "3 queued".

**Tablet (768–1023px)**
- Actuals:
  - Filters wrap; the project code field is full-width on the first line.
  - Columns: Project (with "Client · code" muted under it, client grouping kept as on desktop) | Rows | Last uploaded | actions. Uploads is dropped.
  - Actions are 40px.
- Profile processing:
  - The status strip has two lines: state / next / last / topics on the first, then Settings on the left and Recalculate now + Rebuild all on the right.
  - The view switch, search and status sit in the toolbar.
  - Columns: Project · Code (with "rows · resources" and topic failure muted under it) | Status (with "Next HH:mm" under it for queued codes) | Last processed | Process + "⋯". The "⋯" holds Remove from queue (queued codes only; otherwise disabled).
  - The drawer is min(440px, 100%) wide.

**Smartphone (< 768px)**
- Top navbar from the shell; section selector.
- Actuals:
  - Project code search and a **Filters (n)** button. Client, Project and Pipeline year go into a bottom sheet.
  - **One card per code:** client (muted), project, code chip, "M rows · date", and a footer with 44px actions: View · Download · "⋯" (Delete actuals).
  - The group headers become small sticky labels between the cards.
  - View opens full-screen.
- Profile processing:
  - The strip becomes a card: state + settings icon (44px), "Next run … · topic extraction on", then **Recalculate now** (full width) and Rebuild all.
  - Then the view switch (full width, 44px), then search and status.
  - **One card per code:** project, status pill, "code · rows · resources", "Last … · next HH:mm", the error band inline for Error codes, and a footer with Process · Remove from queue (queued only).
  - Settings opens full-screen.
- Touch targets ≥ 44px.

## 13. Copy and icons

- All UI copy in English, sentence case, as in the boards. Keep the existing validation, confirm and server error strings.
- No emoji (replace 👁 ⬇ 🗑 📂 ⚠). Use 14/16px stroke SVGs with `currentColor` via `.pd-icon`: eye, download, more, trash, folder, search, info, sliders, refresh, sparkle, warning, chevron, close, check.
- Status and alert colours come from tokens (danger, warning, success, neutral), not hex literals.

## 14. Tests

- If an existing guard test lists markers for these pages (for example the header button, the `<details>` or the emoji labels), update those entries in the same PR and say so in the PR. All other shared checks must pass unchanged.
- Add tests for:
  - **Navigation and sub-nav:** sub-nav present on both pages with the correct active item; queue badge hidden at 0 and on error.
  - **Actuals list:** grouping by client, with "No client" last; group meta sums; sort semantics (Client reorders groups, Project/Code sort inside groups, 3-state).
  - **Actuals actions:** Delete goes through `showConfirm()` and calls the API once; Download disables while generating; "Load Actuals" copy.
  - **Profile processing table:** the merged column sorts by last processed with never-processed last; "Next" shown only for queued/error codes; the error band stays open across a refresh.
  - **Profile processing views and settings:** the Run history switch hides the search/status/counter; Save schedule is enabled only with valid changes; the topic toggle saves immediately; closing the drawer discards unsaved changes; one action at a time.
  - **Page-wide:** no `confirm()`, `alert()` or emoji left.

## 15. Out of scope

- How actuals are uploaded (Portfolio, project-config, planning). The profile computation, the worker, and the API.
- A sidebar entry for Profile processing.
- Filters, totals or search inside the View modal.
- The A options (11.1b, 11.2f).

## 16. Definition of done

- Both pages share the "Timesheets" header and the Master Data-style sub-nav, with the queue badge. The header button is removed.
- Actuals:
  - client-grouped list;
  - View + Download on the row, Delete in "⋯" with `showConfirm()`;
  - restyled View modal;
  - empty states;
  - corrected copy.
- Profile processing:
  - status strip with the actions grouped;
  - settings drawer with the current rules;
  - merged-column table with the expandable error;
  - Run history as a second view;
  - the three alerts;
  - all current behaviours preserved.
- Tablet and smartphone as in 11.3. No emoji, no native dialogs, no hex literals. English copy, tokens and shared components used.
