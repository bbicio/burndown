# Brief — Master Data · Pipelines & POTs (phase 2, page 2 of 4)

**Goal:** redesign the content of the "Pipelines & POTs" section inside the Master Data shell delivered in phase 1. Three levels in one page: pipeline list → POT targets of one pipeline → phasing (proposal / project). The POT details modal becomes a side drawer; new year, new POT and edit target become inline.

Prerequisite: the phase-1 shell is merged. Do not change the shell, except the single hook in §8.1.

Page touched: `master-pipelines.html` only.

## 1. References

| Board | File / state | Use it for |
|---|---|---|
| 10.4a | `MDPipelines.dc.html` (default) | Pipeline list: columns, visibility toggle, achievement bar, "⋯" menu |
| 10.4b | `MDPipelines.dc.html`, `addingYear=true` | Inline new year row |
| 10.4c | `MDPipelines.dc.html`, `screen=pots` | POT targets: summary, stage tiles, POT table, outside-POT note |
| 10.4d | `MDPipelines.dc.html`, `screen=pots`, `addingPot=true` | Inline new POT row |
| 10.4e | `MDPipelines.dc.html`, `screen=pots`, `editing=true` | Edit target under the row |
| 10.4f | `MDPipelines.dc.html`, `screen=pots`, `drawer=true` | POT details drawer |
| 10.4g | `MDPipelinesResponsive.dc.html` | Tablet POT targets (1024×768), phone pipeline list and POT detail (390×844) |
| 10.5a | `MDPipelines.dc.html`, `screen=phasing`, `phasing=project` | Project phasing |
| 10.5b | `MDPipelines.dc.html`, `screen=phasing`, `phasing=proposal` | Proposal phasing |

`Section - MD Pipelines.dc.html` holds the board notes (Italian): current vs. new per area, plus open questions. Read it for intent; this brief is normative where they differ.

JPG captures of each board are in `docs/captures/pipelines/` (file name starts with the board id). Use them to see each state; take values from the HTML. Rendering artifacts in the captures (names wrapping in the POT table at 1400px, truncated sub-lines) are not part of the design: names stay on one line with ellipsis.

Sample data (Bayer AG, Menarini Group, SIFI, NH-26 in GBP, amounts, dates, history notes) is illustrative.

## 2. Precedence

**The app's current rules win over the boards.** Boards define layout, hierarchy, copy and interaction; they do not change business rules, calculations, permissions or API contracts unless this brief says so explicitly.

- Calculations and rules follow the existing code: `api/src/routes/pipeline-years.js`, `api/src/routes/pots.js`, `api/src/routes/reporting.js` (`/phasing`, `/project-phasing`), `api/src/routes/exports.js` (`/phasing`), `api/src/lib/pot-fee-sql.js`, `js/lib/money.js`.
- Shared components and tokens (buttons, inputs, segmented control and confirm dialog introduced for Clients, `.pd-icon`, `css/tokens.css`, stage tokens `--pipeline-<stage>-bg/-color`, breakpoints) win over board values. Use the closest token where a board value differs; no hex literals in the page (see existing tests).
- Where a board shows something the app cannot do today, §7 says whether to build it, adapt it, or hide it. Anything not covered: follow the app and note the deviation in the PR.

## 3. Current state in the repo

- `master-pipelines.html`: Vue app with four views switched by state (no URL): A pipeline list, B POTs of a pipeline, C proposal phasing, D project phasing. Emoji buttons (📊 📋 🔍 ✏️ 🗑 ⬇). `confirm()` for deletes. POT details in a Bootstrap modal (`#potDetailsModal`) filled with `innerHTML`.
- `GET /pipeline-years`: `{id, year, active, created_at, offers}`. `active` = Visible/Hidden. `POST` defaults `active = true`; 409 on duplicate year. `DELETE` returns 409 if **any** cost grid version has that `pipeline_year` (any stage, incl. Draft/Canceled).
- `GET /pots/year-totals`: per year `pot_total`, C, A, E, SIP, `achieved_total = C + A`.
- `GET /pots?year=`: POT rows with `special_label`, `client_group_id/name`, `client_id/name`, C/A/E/SIP totals, `achieved_total`.
- `GET /pots/pipeline-summary?year=`: count + total per stage (SIP, Expected, Anticipated, Committed, Canceled), whole pipeline.
- `POST /pots`: exactly one of `clientGroupId`, `clientId`, `specialLabel`; 409 if a POT already exists for target + year. The client select also offers two special targets: "Unassigned / To be Identified" and "New Biz" (type **General**).
- `PATCH /pots/:id`: amount + **required note** (stored in `pot_history`). `DELETE /pots/:id`: no guard.
- `GET /pots/:id/details?year=`: pot, history, C/A/E/SIP, proposals (Draft and Canceled excluded) with `client_name`, `proposal_name`, `created_at`, `owner_name`, `pipeline`, `currency`, `value` (EUR), `value_original`, `cg_id`, `version_id`.
- `GET /reporting/phasing?year=`: one row per **cost grid version** in the year with monthly `amount` in the version currency, `currency`, `currencyRate`, `clientId`, `cgId`, `versionId`. The page filters to SIP/Expected/Anticipated/Committed.
- `GET /reporting/project-phasing?year=`: one row per **project** (`projectId`, name, pipeline, currency, currencyRate, clientId, months). Draft/Canceled excluded. No link to the proposal.
- EUR conversion everywhere = local amount / `currencyRate` (snapshot of the version).
- `GET /exports/phasing?year=`: XLS of **Committed + Anticipated only**, proposal phasing, no filters, no currency conversion.

## 4. Pipeline list (10.4a, 10.4b)

Content card header: title "Pipelines", description "One pipeline per year. Each pipeline has its POT targets by client or client group.", primary **+ Add year**.

**Table** (header 10px uppercase, `#F7F8FA`), sorted by year desc (as today):

| Column | Content |
|---|---|
| Pipeline | "Pipeline 2026" (14px 700, link to its POTs; muted when hidden), sub-line "N proposals" from `offers`. |
| Visibility | Switch + "Visible" / "Hidden", tooltip "Hidden pipelines are not shown in the Pipeline page". Calls the existing toggle (`PATCH active`). Disabled while saving; on error restore and show the error. |
| POT target | `pot_total` from year-totals, or "—". |
| Achievement · C + A | % (`achieved_total / pot_total`), C+A amount, two-colour bar (Committed / Anticipated), line "C € … · A € …". "No POTs set" when `pot_total` is 0. |
| POTs | Number of POTs for the year (see §7.6), or "—". |
| Actions | "POT targets →", "⋯" menu. |

The current list also shows E and S totals in the achievement cell; the board drops them here (they appear in the POT page). Remove them and update `master-pipelines-pot-details.test.js` ("shows E and S in the year row") accordingly.

**"⋯" menu:** Proposal phasing (View →), Project phasing (View →), divider, Delete pipeline with a one-line hint.
- Delete follows the **server rule**. Disable it when `offers > 0` with "Not available: N proposals use this pipeline. Hide it instead." Otherwise keep it enabled ("Removes the pipeline year.") — the server may still refuse (Draft/Canceled versions are not in `offers`): show its 409 message inline via `globalError`, no `alert()`.
- Confirmation via the shared confirm dialog: "Delete Pipeline 2027? Cost grid versions linked to this year stay; the pipeline entry is removed." (current meaning).
- Do **not** write "and its POTs" in the hint: the server does not delete POTs.

**Inline new year (10.4b):** first row under the header. Label "Pipeline", year input prefilled with max year + 1 (current `openPyForm` logic), magenta focus ring, autofocus. Client-side checks as today (2000–2100, not existing) with the hint line turning red: "Enter a year that doesn't exist yet." Cancel / Create; Enter / Esc. Server 409 shown under the row. Visibility of the new pipeline: §7.1.

**Footer note:** "Achievement = (Committed + Anticipated) / POT target. Hidden pipelines stay in reports but don't appear in the Pipeline page."

**Empty state:** "No pipeline years yet. Use + Add year to create the first one."

## 5. POT targets (10.4c–10.4f)

### 5.1 Head and summary

- Back link "← Pipelines", title "Pipeline 2026" + Visible/Hidden pill (read-only; toggle stays in the list). Right: secondary buttons **Proposal phasing** and **Project phasing** (bar-chart stroke icon) opening §6.
- Summary card, three columns:
  - **Total POT target**: Σ POT amounts, "N POTs".
  - **Committed + Anticipated**: amount and "% of target". Use the **current source**: Committed + Anticipated totals of `pipeline-summary` (whole pipeline, as today). The board's figure (sum of POT rows) is illustrative.
  - Bar: Committed, Anticipated, Expected, SIP (striped) from `pipeline-summary`, scaled to max(target, C+A+E+SIP); a navy tick labelled "Target" at the target. Legend with the four amounts. Note: "Progress and gap to target count Committed + Anticipated only. SIP and Expected are shown as upcoming pipeline."
  - **Gap to target**: max(0, target − (C + A)), "% of target", caption "Target − (C + A)". When C + A ≥ target show "Over target" and the surplus in green (same rule as the drawer).
- Second row "Whole pipeline by stage · all clients": five compact tiles (SIP, Expected, Anticipated, Committed, Canceled) "Stage · count" + amount, stage token colours; tiles with count 0 at reduced opacity. Replaces the five large cards.
- No POTs: hide the summary bar part, keep the stage tiles (they don't depend on POTs).

### 5.2 POT table

Header "POT targets" + primary **+ New POT**. Columns:

| Column | Content |
|---|---|
| Client / group | Name (one line, ellipsis) + type pill: **Client** (blue), **Group** (purple), **General** (grey, for `special_label`). Sub-line: for a group, its clients (from `GET /client-groups`, already loaded); then "· N proposals" if the count is known (§7.6), else omit. |
| Target | Amount, 700. |
| Committed | Green. |
| Anticipated | Orange (stage token). |
| Achievement · C + A | Bar (C, A, E, SIP striped) + % (`achieved_total / amount`), green when ≥ 100%. Line "+ € … in SIP / Expected" in blue when E + SIP > 0. |
| Actions | "Details" link, Edit icon (pencil, 30×30, navy filled while its editor is open), Delete icon. |

Sorted as the API returns. Clicking the name opens the drawer. Row 58px.

The Expected and SIP columns of today's table are folded into the bar and the blue line. Update `master-pipelines-pot-details.test.js` ("has Expected and SIP columns", "renders the Expected and SIP totals") to check the new place; the values and the `achieved_total` source must not change.

**Delete POT:** shared confirm dialog: "Delete the POT target for "X" (2026)? This cannot be undone." No guard (current rule; see §7.4).

**Outside-POT note** (footer, info icon): "Committed outside POTs: € … (clients without a POT). It counts in the stage totals but not in the POT targets." Value = Committed of `pipeline-summary` − Σ `committed_total` of the POT rows. Hide the note when the value is ≤ 0 (a client POT and a group POT covering the same client can double-count; don't show a negative). Do not name example clients.

**Empty state:** "No POT targets for Pipeline 2026. Use + New POT to add the first one."

### 5.3 Inline new POT (10.4d)

First row under the header, `#F7F8FA`, wraps if needed:
- Segmented **Individual client / Client group** (replaces the Target type select).
- Target select (240px, magenta focus): Individual client → "Unassigned / To be Identified", "New Biz", divider, clients sorted by name (**keep the special targets**, current behaviour). Client group → groups sorted by name. Hide targets that already have a POT in this year (server returns 409 otherwise); keep the server error handling.
- Target € input (150px): `readMoneyInput` / `formatMoneyInput` focus/blur as today, placeholder from `moneyFormatExample`. Label from `currencyInfo` (no hardcoded "€" — existing test).
- Hint: Client group → "All clients of the group count towards one target." Individual client → see §7.3.
- Cancel / Create (disabled until target and amount are set). Enter = Create, Esc = Cancel. Errors under the row (current strings).

### 5.4 Edit target (10.4e)

Opens **under the POT row** (one at a time), `#F7F8FA`:
- "New target (€)" input prefilled, same money input behaviour.
- "Reason for change *" · "saved in the change history", placeholder "Explain why the target is changing".
- "Current € …" reference text.
- Cancel / **Update target** (primary). Disabled until the reason is non-empty and the amount valid. Keep the server-side note requirement and current error strings.
- After saving: update the row, drop the cached details/history so the drawer reloads (as today).
- Also opened from the drawer's "Edit target" (closes the drawer, opens the row editor).

### 5.5 POT details drawer (10.4f)

Replaces `#potDetailsModal`. Right side panel 560px, navy scrim, closes on scrim click, ✕ and Esc; same pattern as the proposal drawer in Pipeline if it exists in code (reuse it). Render with Vue, not `innerHTML`.
- Head: "POT · Pipeline 2026", name + pill "Client POT" / "Group POT" / "General target", sub-line (group clients), buttons **Edit target** and ✕.
- Progress: "N%" + "of € … target reached by Committed + Anticipated", bar (C, A, E, SIP), blue line "+ € … in SIP / Expected · not counted in the gap".
- Three tiles: Committed, Anticipated, **Gap to target** or **Over target** (+ surplus, green).
- "Proposals · N": rows = proposal name, "date · owner" (for a group POT prefix the client name), stage pill (tokens), value in EUR, `↗` to `/costgrid.html?cgId=…&verId=…` (current link, new tab). Non-EUR: original amount with EUR below (current rule, keep the existing test). SIP and Expected rows at 60% opacity. Footer "Only Committed and Anticipated count towards the target." Empty: "No proposals for this target in this year."
- "Target history": timeline, newest first; "old → new" (old struck through, "—" for creation), "date · user" (+ "· created" for the first entry), the note quoted in a grey chip. Empty: "No history yet."
- Data: `GET /pots/:id/details?year=` (unchanged). Loading: skeleton in the drawer; error inline in the drawer.

## 6. Phasing (10.5a, 10.5b)

### 6.1 Container

- Sub-view of the page with its own URL (see §8.2). Opened from the POT head buttons and from the list "⋯" menu.
- Uses the full content width: the Master Data sub-nav is hidden (§8.1). Breadcrumb: `Home / Master Data / Pipelines & POTs / Pipeline 2026 / Project phasing`.
- Head: back link "← Pipeline 2026 · POT targets", title "<Mode> · Pipeline 2026" + segmented **Proposal phasing / Project phasing** (switches mode, keeps filters), description per mode:
  - Proposal: "Monthly budget phasing of every proposal version in the pipeline (from its cost grid)."
  - Project: "Monthly phasing of every project in the pipeline. Open a project to see its reporting."
- Right: **Export XLS** (§7.5).
- The five stage cards of today's phasing view are removed (the stage chips carry the counts).

### 6.2 Toolbar

- **Stage** chips with count: SIP, Expected, Anticipated, Committed (Canceled and Draft always excluded, as today). Current semantics: no chip selected = all; keep it, or show all selected by default — the filter result must be identical.
- **Client** select: "All" + clients sorted by name (current filter on `clientId`).
- **POT** select: "All" + POTs of the year. Client-side: a client POT matches `clientId`; a group POT matches the group's clients; a General POT matches nothing — exclude General POTs from the list. No API change.
- "Clear" link when any filter is active (current behaviour).
- Right: **Amounts** segmented **All in EUR / Original currency** (§6.4).

### 6.3 Table

- Columns: name (sticky left, 200px+), Stage pill, 12 months of the year, Total. Header sticky. Horizontal scroll inside the card.
- Total row(s) at the top, bold, `#F3F4F6`.
- Name cell: name (ellipsis, full name in tooltip) + `↗`; sub-line = client name + currency pill (purple, e.g. "GBP") for non-EUR rows, tooltip "Proposal currency · converted at the version exchange rate".
  - Proposal mode: name = cost grid name, plus version label (current data, keep it visible in the sub-line). `↗` → `/costgrid.html?cgId=…&verId=…`.
  - Project mode: name = project name. `↗` → `/portfolio.html?projectId=…` (project reporting), tooltip "Open project reporting".
- The Start / End columns of today's proposal table are dropped (the months show the span). Keep them only if a test requires them; then update the test.
- Rows with no amount in the year: one italic muted cell spanning the months, "No phasing yet", instead of 12 dashes.
- Months: current month highlighted (blue header); past months on a light grey background. Legend: "Past months" only — do **not** say "actuals" (proposal phasing is never actuals; project phasing is actuals only after a reforecast).
- Cell values rounded to the unit in the table; full values in a tooltip. Footer: "N proposals · rounded to the unit".
- Empty: "No proposals for Pipeline 2026." / "No projects for Pipeline 2026."; no match: "No rows match the current filters."

### 6.4 Currency

- **All in EUR** (default, current behaviour): every amount = local / `currencyRate`; single Total row "Total · € · all amounts in EUR".
- **Original currency**: native amounts with their symbol (`formatMoney(v, currency)`), one Total row **per currency** present in the filtered rows ("Total EUR", "Total GBP" + row count). Never sum different currencies.
- Footer legend: currency pill + "Converted to € at the version rate".
- Today the table shows both (local + EUR in brackets) in every cell; the segmented control replaces that.

## 7. Board items that need a decision (defaults apply unless told otherwise)

1. **New pipeline created Hidden.** Board: "Created hidden: show it when POTs are ready." The API defaults to `active = true`. Default: **follow the board**, send `active: false` from the page (no API change; the API already accepts it). Alternative: keep Visible and change the hint to "Created visible."
2. **"No project yet" rows in Project phasing.** The board lists SIP proposals without projects. `project-phasing` returns projects only. Default: **not in this cycle** — Project phasing lists projects only, as today. The grouping of projects under their proposal shown in the notes is also out (the endpoint has no proposal link).
3. **"Clients already in a group POT are not listed."** Today the client list is not filtered and the server allows a client POT next to a group POT for the same client. Default: **follow the app**, don't filter; drop that hint (no hint for Individual client). Filtering would be a new business rule.
4. **Deleting a POT with linked proposals** (open question on the board). Default: **follow the app** — allowed, with confirmation. Proposals are not linked to POTs in the data, so nothing is lost but the target and its history.
5. **Export XLS.** Board: exports the current view with filters and decimals. Today: `GET /exports/phasing` = proposal phasing, Committed + Anticipated only, no filters, and its hour calculation differs from `/reporting/phasing` (`days * 8` vs. `days`). Default: **keep the existing export unchanged**, show the button only in Proposal mode, label "Export XLS" with tooltip "Committed and Anticipated proposals, all clients". Hide it in Project mode. Aligning the export with the view (filters, project mode, the hours discrepancy) is a separate backend task — report the discrepancy in the PR.
6. **POT count in the list and proposal count per POT.** Default: one `GET /pots` call (no year) on load, grouped by year for the POTs column. Proposal count per POT row: omit unless already in the data (no extra calls per row; no API change).
7. **Sub-nav count** ("Pipelines & POTs 3"): follows the phase-1 decision.

## 8. Navigation and URL

### 8.1 Wide mode for phasing

Phasing hides the Master Data sub-nav. Add one modifier (e.g. `md-layout--wide` on `.md-layout`) that hides `.md-subnav` and lets `.md-content` take the full width, on all breakpoints. This is the only shell touch; add a guard test for it. If the phase-1 shell already has an equivalent, use it.

### 8.2 URL

Each level has a URL; back/forward work; reload reopens the same view:
- `master-pipelines.html` — list
- `master-pipelines.html?year=2026` — POT targets
- `master-pipelines.html?year=2026&pot=<id>` — POT targets with the drawer open
- `master-pipelines.html?year=2026&phasing=proposal|project` — phasing (filters may be kept in the URL too, optional)

Unknown year → list with an inline error "Pipeline 2026 not found."

## 9. Responsive (10.4g)

Shell behaviour is from phase 1. Content:

**Tablet (768–1023px)**
- Pipeline list: hide the POTs column; achievement keeps bar + %. Controls 40px.
- POT targets: the head's two phasing buttons collapse into one "Phasing ▾" menu (Proposal phasing / Project phasing). Summary on two rows: "N%" + "€ C+A of € target · gap € …" on top, bar, then the stage tiles as a horizontal scroll row.
- POT table: columns Name (+ pill, sub-line), Target, Achievement (bar + % + "C € … · A € …" below), chevron. Committed and Anticipated columns are removed (they're under the bar). The row opens the drawer; Edit and Delete move into the drawer head (Edit target, ⋯ → Delete).
- Phasing: same table, name column sticky, horizontal scroll; toolbar wraps.

**Smartphone (< 768px)**
- Pipeline list: "+ Add year" full-width (44px) under the section selector. Each pipeline = card: name + "⋯" (44px target; menu = Proposal phasing, Project phasing, Delete), % "of € target" + bar (or "No POTs set"), footer row 44px with Visible switch and "N POTs →" (opens POT targets). Tap on the card opens POT targets.
- POT targets: same as tablet stacked; POT rows as cards (name + pill, target, bar + %); tap opens the detail.
- POT detail: full screen (not a drawer), "← Pipeline 2026" back (36px+), tiles in a 3-column grid, proposals as a list (44px rows), target history. Sticky bottom bar with **Edit target** (46px), which opens a bottom sheet: new value + reason (required) + Update target.
- Phasing on phone: not on the board. Default: same table with horizontal scroll and the name column sticky; toolbar = stage chips scroll row, then Client / POT / Amounts stacked. Note it in the PR.

## 10. Copy and icons

- All UI copy in English, sentence case, as in the boards. Keep existing validation and error strings unless listed here.
- No emoji (📊 📋 🔍 ✏️ 🗑 ⬇ ✕ go). 14/16px stroke SVGs with `currentColor` via the existing `.pd-icon` set. `↗` and `→` as text glyphs are fine (boards use them).
- Stage colours from the tokens (`--pipeline-*`), not from `stageColor()` / `stageBg()` (existing test); remove those helpers if unused.

## 11. Tests

- Update `master-pipelines-pot-details.test.js` for the new location of E/SIP (bar + blue line, drawer) and the drawer replacing the modal; keep the assertions on values, `achieved_total`, original currency only for non-EUR, no hex literals, stage tokens.
- `master-pipelines-pot-input-guard.test.js` must pass unchanged for both the new POT row and the edit-target row (text input, `amountText`, focus/blur, `readMoneyInput` with `stored`, `currencyInfo`, no hardcoded "Target (€)").
- `master-data-guard.test.js` must pass; add a check for the wide-mode modifier (§8.1).
- Add tests for: URL per level incl. back/forward; delete pipeline disabled when `offers > 0` and server 409 surfaced inline; new year sends `active: false` (if §7.1 approved); edit target disabled without reason; outside-POT note hidden when ≤ 0; "Original currency" never sums different currencies; POT filter matches group clients; no `confirm()` / `alert()` left.

## 12. Out of scope

- The shell (phase 1) except §8.1. Clients & groups (done), Roles & rates, Currencies (own briefs).
- Any change to how C / A / E / SIP, fees, phasing or EUR conversion are computed. Changes to `/exports/phasing` (§7.5). Proposal links on projects (§7.2).

## 13. Definition of done

- Three levels as in 10.4a / 10.4c / 10.5a–b, each with its own URL.
- Visibility switch, inline add year, delete pipeline following the server rule.
- POT summary with whole-pipeline C+A, stage tiles, outside-POT note.
- Inline new POT (incl. General targets), edit target under the row with required reason, drawer details rendered with Vue.
- Phasing with stage / client / POT filters, EUR vs. original currency without mixing currencies, links to cost grid / project reporting.
- Tablet and smartphone layouts as in 10.4g; touch targets ≥ 44px on phone.
- No emoji, no `confirm()` / `alert()`; English copy; tokens and shared components used.
