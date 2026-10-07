# Cost Grid — visual fidelity gap report (page vs design boards)

Date: 2026-10-07. Page: `costgrid.html` + `css/costgrid.css?v=1` after merge `8f69105` + fixes `e0ae807`, `0b5557b`.
Input for the next development cycle. Method: every board image was opened and compared with real renders; causes confirmed in `costgrid.html` / `css/costgrid.css` and against the spec `2026-10-07-costgrid-redesign-cycle-a-design.md` and the brief.

Categories: **(i)** spec says it, code does not do it. **(ii)** spec contradicts the board (code follows the spec). **(iii)** neither spec nor code covers it. **(iv)** deliberately out of scope or deferred.
Sizes: **S** a few lines of CSS or copy. **M** markup restructuring. **L** new component.

## 1. Scope of this check

**Boards opened (all of them):** 5.11, 5.12, 5.13, 5.14, 5.15, 5.16, 5.17 (task inseriti), 5.17b (menu ⋮ ruoli), 5-18 resume pannelli chiusi, 5.18-visualizzazione-costgrid, 5.18 selezione nuovo progetto 1/2/3, 5.18 add-project-o-program, 5.18 aggiunta-task-progetto-esistente + monthly phasing, 5-18 tags-e-sharing, 5.20-tablet-view, 5.21 situazione di partenza, `mobile-view-1/2/4`, `mobil-view-3`. Also the user's own screenshots `Costgrif_ciclo1.jpg/.1-.6`, `costgrid_fix1.jpg`.

**Page renders compared:** 1440 viewport, 1440 full page, 1024, 768, using the populated SIP/"Anticipated" proposal AURORA (4 linked projects, all tasks assigned, 10 role columns, all rates custom).

**Limits (important):**
- The test proposal is non-Draft, non-locked-by-pending-edit, has no free tasks and has Offer details/Tags/Sharing closed. The Draft banner, Offer details OPEN, Tags OPEN, empty-Draft state (5.21), role ⋮ menu, selection mode, selection bar, all modals, date/dropdown popups, the no-period phasing message and the sticky-column behaviour on horizontal scroll could not be captured (the shoot script cannot click). For these the comparison is static (markup/CSS only) and is listed in "Needs interactive capture" below.
- **Board 5.20-tablet-view.png is a byte-identical duplicate of `5.18-aggiunta-task-progetto-esistente-monthly-phasing.png`** (same content, same size 133.1K). There is therefore **no real tablet board**; the 1024 comparison is only against the desktop boards (G-29).
- Boards 5.11-5.15 use an older Offer-details layout (Ratecard+Currency box next to Period, Stage+Client box below, "Start date/End date", "Notes") than 5.21 (Period | Stage, then Client & rates, "Start month/End month", "Description"). The spec followed 5.21 (G-13).
- The page was not captured at 390 px (smartphone is cycle B).

## 2. Discrepancies

### Header card

| ID | Board | Board shows | Page shows | Element / class | Cat | Size |
|---|---|---|---|---|---|---|
| G-01 | 5.17, 5.18, 5.21 | **Save is a white secondary button**; the only magenta button is the single primary action (Publish to SIP / Generate project / disabled "Selecting tasks…") | Save is magenta primary, so on a SIP proposal with no free tasks the page shows Save as the only primary action | Save button in `.cg-header-actions` (btn-primary style) | (i) spec §2 "exactly one primary action" | S |
| G-02 | 5.11-5.21 | Secondary buttons (Save/Clone/Export XLS/Share): white fill, dark 13px text, ~34px tall, 8px radius, dark hairline border | Small (~26px), grey-text outline buttons with grey border, visually weaker; same for "+ Add role"/"+ Add phase" | `.btn-outline-secondary` in header and grid card header | (iii) | S |
| G-03 | 5.11-5.15 | "← Pipeline" is a bordered white button above the header card | Plain grey text link | `.cg-back-link` | (ii) spec says "plain link" | S |
| G-04 | all | No divider between title row and version row | A hairline rule separates the two rows | `.cg-header-row1` border/hr | (iii) | S |
| G-05 | 5.18, 5.21 | Stage pill: light tinted fill, no border, small bold (SIP light blue, DRAFT cream) | Pill has a 1px coloured border (orange outline "ANTICIPATED"), larger | `.cg-stage-pill` inline `border` from `headerStageStyle` | (iii) | S |
| G-06 | 5-18, 5.18 | On SIP: segmented tray with a disabled, locked "New version" segment, then chip `V1`, then muted note "Published · versions locked after Publish to SIP" | No tray, no disabled "New version", no note; chip reads "v1 (4)" with a pencil | `.cg-version-seg` | (iv) brief §10 #3 ruled "hidden outside Draft"; the note was never specced | S |

### Offer details / Tags / Sharing

| ID | Board | Board shows | Page shows | Element / class | Cat | Size |
|---|---|---|---|---|---|---|
| G-07 | 5-18 tags-e-sharing, 5.21 | Card titles 15px, weight 800 (very bold navy); chevron larger | `font-size: var(--text-lg)` weight semibold (600), visibly lighter than the board | `.cg-section-title` | (iii) spec says 15px/800 only in the brief; spec §3.2 omitted the numbers | S |
| G-08 | 5-18 resume, 5.18 | Closed Offer details: ONE row; each fact is a small UPPERCASE label stacked ABOVE a bold ~11.5px value; three groups separated by hairlines; "Edit" vertically centred at far right | Label and value on the SAME line, values ~14px medium weight; the row wraps to 2 lines even at 1440 (Owner drops to line 2) and **"Edit" falls to the bottom-right corner**; at 1024/768 it wraps to 3 lines, card ~190px tall vs ~50px on board | `.cg-offer-summary*` | (iii) spec §3.3 describes groups only | M |
| G-09 | 5.15, 5.21 | Owner row: "Owner: **Admin PDash**  Created: **Oct 4, 2026**" (bold values, long date) and a **"⇄ Reassign" outlined button** opening a popover (see section 3) | Muted 11px "Owner: x, Created at: 07/10/2026" and a native `<select>` "Reassign to…" | owner row at top of open card (`costgrid.html` ~L112) | (ii) spec §3.4 and Out of scope explicitly keep the `<select>` | L (see §3) |
| G-10 | 5.21 | All inputs one height (~36px), labels "Start month / End month"; Client select the same height as Currency | Static markup: Start/End labelled "Start"/"End"; Client and Ratecard use `form-select-sm`, Currency full-size, so heights are mixed in one row | `#cgClientId`, `#cgRatecardId` (`-sm`) vs `#cgCurrency` | (iii) | S |
| G-11 | 5.13, 5.14, 5.21 | Currency is a **grey locked field with a padlock icon inside**; Ratecard has a muted hint "Optional · filtered by client"; the user's own gap list also had "Currency locked: a project exists" note | Static markup: plain disabled `<select>` (no padlock inside), no "Optional · filtered by client" hint | `#cgCurrency`, `#cgRatecardCol` | (iii) brief §3 lists the hint/lock note, spec omitted both | S |
| G-12 | 5.14, 5.21 | In Draft the Stage is a **grey disabled select-looking control with a grey dot + chevron** | Static markup: Draft stage is plain text (`form-control-plaintext`) | `.cg-field-box--stage` | (ii) spec §3.4 / brief says "Draft come testo" | S |
| G-13 | 5.11-5.15 vs 5.21 | Two different field arrangements across boards | Page follows 5.21 | n/a | (iii) boards disagree; **decide which is canonical before the next cycle** | S |

Tags and Sharing **closed** match their boards well (chevron, "None selected", stacked avatar + "N person(s) · you are owner", Edit/Manage labels). Open Tags (2-column groups, check mark in selected pill, "3 selected" on the header) and open Sharing (avatar rows, role pills, "Add people by name or email" + Viewer select + Share) could not be captured: see "Needs interactive capture".

### Grid

| ID | Board | Board shows | Page shows | Element / class | Cat | Size |
|---|---|---|---|---|---|---|
| G-14 | 5.17, 5.17b | Role column headers: **navy** with white name, muted code; missing-rate header deep red | **Role headers render WHITE with black text** (and the ⋮ in pale blue on white). Cause: the table has Bootstrap class `table` (`#cgGridTable`), whose `.table > :not(caption) > * > *` background (specificity 0,1,1) beats `.cg-role-col-header { background }` (0,1,0). The same overrides `.is-zero` red header. User's own screenshots (`costgrid_fix1.jpg`) show the same white headers: still unfixed | `.cg-role-col-header`, `.cg-role-col-header.is-zero` | (i) spec §4.5/§4.6 says it | S (give the th inline or higher-specificity background, or drop `table`) |
| G-15 | 5.17 | Fixed column ~225px, Description ~150px, totals ~95/75/50/70px: **5-6 role columns visible** in a 1190px frame | Fixed 280px + Description 240px + totals 130/115/75/120px (=960px) before the first role column: **only 2 of 10 roles visible at 1440**, the rest need horizontal scroll | `.cg-col-fixed {min-width:280px}` + inline `min-width` on the 5 fixed `th` | (ii) spec §4.2 and brief both say 280px; board is ~225 | S |
| G-16 | 5.17, 5.17b | Header row ~65px: role name max 2 lines, code truncated on one line with ellipsis, a **bordered 24px square ⋮ button at top-right** of the cell | Header row ~265px tall: names wrap to 4 lines (100px min column), code wraps to 2-3 lines, ⋮ is a bare pale glyph centred under the code | `.cg-role-col-name/code`, `.cg-col-menu-btn` | (iii) spec §4.6 says "name (2 lines) + code + ⋮ 24px" but the clamp/ellipsis was not implemented | M |
| G-17 | 5-18 resume, 5.21 | **"Compact columns" toggle switch in the grid card header**, right side | No toggle in the card header; the old ⊟ icon is still inside the "Phase / Task" header cell | `costgrid.html` ~L319 vs grid card header | (i) spec §4.3 | S |
| G-18 | 5.21, brief §8 | Button "Add roles" (with people icon) | "+ Add role" (singular, plus sign, no icon) | `costgrid.html` L276 | (i) spec §4.3 / brief §8 copy table | S |
| G-19 | 5.17, brief §8 | Collapsible bar "Totals by role" (muted, light, chevron); rows "Hours by role" / "Fees by role" | "▼ Summary (click to collapse)", "Total Hrs by Role", "Total Fee by Role" (old copy, glyph arrow) | `costgrid.html` L286-295 | (i) spec §4.4 names the new labels | S |
| G-20 | 5.17, 5.21, brief §8 | Column headings "Total cost & fee", "Pass-through", "Hrs", "Fees", "Description"; first cell "Phase / Task" | "TOTAL COST and FEE", "Total Pass through Costs", "Total hrs", "Total fees" (old copy); also "+ add task" instead of "+ Add task" | `costgrid.html` L326-329, L416 | (iii) brief §8 lists them, spec §4 did not | S |
| G-21 | 5.17, 5.18 | Phase row: "**+ Task**" as a pill (muted translucent), small grey ✕; phase band is brand-navy-mid | "+ task" as underlined azure text link, red ✕ | `costgrid.html` L347, inline `color:#93c5fd` | (i) spec §4.8 says "+ Task" pill | S |
| G-22 | 5.17 | Task row ~65-85px: single-line white **input box** for the name (bordered, bold), Description as plain 2-line text; From/To in small grey pills | Row ~115-130px: name and description are **`<textarea>`s with resize handles** (rows 2-3, min-height 48/72), the lock sits floating top-right | `costgrid.html` L369, L388 | (iii) | M |
| G-23 | 5.17, 5.18 | "In KAROMY – Discovery" is a **grey pill with a link icon**, short | Small plain muted text ("In MEN 26 AURORA Platform Dev.-Overall Proj. MNGM") wrapping to 2 lines, no pill, no icon | task-row badge | (i) spec §4.9 | S |
| G-24 | 5.17 | Hours cells: bordered white input box; filled value **bold** with darker border; empty = box with "—" | Plain unbordered numbers ("210", "—") not bold | role hours cell | (i) spec §4.9 `.cg-cell-filled/.cg-cell-empty` | S |
| G-25 | 5.17, 5.18 | Grid sits **inside the card with inner padding/rounded inner frame** and a visible horizontal scrollbar at the bottom | Table runs flush to the card edges, no inner frame; scrollbar not visible in the capture | `.cg-grid-card` | (iii) | S |
| G-26 | spec acceptance #7 | "No hex" | `costgrid.html` still carries inline hex in the grid markup: `#fff`, `#333`, `#444`, `#555`, `#93c5fd` (th inline styles, summary labels, "+ task" link) | inline `style` L290-L347, L388 | (i) spec acceptance #7 | S |

Matches well: rate row ("EUR Hourly rates", yellow custom cells with "Custom · reset x", "EUR/h" captions), phase date label in light blue, TOTAL row, Monthly Phasing header (navy bar, chevron, "Total: € … · …h · N months"), Hours row muted.

### Monthly Phasing

| ID | Board | Board shows | Page shows | Cat | Size |
|---|---|---|---|---|---|
| G-27 | 5.18 | Budget amount with a **navy bar on a light-grey track**, proportional to the month | Magenta bar (`.cg-phasing-bar-fill` = `--brand-magenta`) | (iii) spec §6 gave no colour | S |

### Modals

| ID | Board | Board shows | Page shows | Cat | Size |
|---|---|---|---|---|---|
| G-28 | 5.16 | Add roles popup: icon + "Add roles · None — global rates", search with magnifier, **pill filter chips** (active = magenta), group headings, role rows with name + code and a **rate pill right-aligned**, footer note + "Add selected" (pink, disabled when empty), "Already added" state | Old modal (`#cgRoleSelectModal`): title `👥 Add roles`/`⇄ Change role`/`⊕ Duplicate column` with emoji, square outline chips, grey Cancel button | (iv) spec "Out of scope" | M |

The other modals (Generate project step 1/2, program step 2, add-to-project) are only checkable interactively: see below.

### Responsive

| ID | Board | Finding | Cat | Size |
|---|---|---|---|---|
| G-29 | 5.20 | The "tablet" board file is a duplicate of 5.18e; **there is no tablet design to compare with**. At 1024 (sidebar still visible, content ~760px) the page works: header buttons wrap under the version chip, closed Offer details wraps to 3 lines (G-08), grid scrolls. At 768 the top navbar replaces the sidebar and the same layout holds. No overlap or breakage seen | (iii) | S (ask the designer for the real board) |
| G-30 | mobile-view-1/2/4, mobil-view-3 | Smartphone layout (Tasks/Roles/Phasing tabs, task bottom sheet, role sheet, bottom selection panel, "⋯" sheet) | (iv) cycle B, not started | L |

## Needs interactive capture

State required, and what to compare:
1. **Empty brand-new Draft (5.21):** Offer details open (labels, empty placeholders `mm/yyyy`, "Unassigned", hint lines), Draft banner (cream, pencil icon, "Delete version" red link right), Tags open with "None selected", Sharing open, grid with dashed "+ Add roles" placeholder column, "Add roles to estimate hours for each task.", Phase 1 with empty task, totals "—", Monthly Phasing card with "no period set" message.
2. **Offer details open on a populated proposal:** Linked projects cards at the bottom, Reassign, Currency lock note.
3. **Tags open:** pill with check mark when selected, 2-column grid, "3 selected" label; closed with tags: navy pills "Brand · Karomy".
4. **Sharing open:** `<share-list>` rows (avatar, name/email, role pill) and add-people row (input + Viewer + Share) vs 5-18 tags-e-sharing.
5. **Role ⋮ menu (5.17b):** header (name, code, "176h planned"), Move left/right, Change role… with sub-line "Hours are kept, rate is recalculated", Duplicate… sub-line, "Reset rate to 120", red "Remove column" with "176h across all tasks will be deleted" second click; Teleport positioning.
6. **Horizontal scroll:** sticky first column shadow on every row type.
7. **Selection mode (5.18):** checkboxes, pink-tint selected rows, grey disabled assigned rows, "Select free (n)"/"All in projects" pills in phase bands, navy bottom bar with New/Existing segmented control, "Select all free (n)", single magenta CTA, Existing dropdown.
8. **Modals:** Generate project (Step 1 of 2 label, name/code, summary box, note), Link to a program (Step 2 of 2, two radio cards, Back), Add tasks to project, success toast vs dialog (spec keeps a dialog).
9. **Open popups:** month picker, Stage list, Ratecard list, Client list, Reassign popover (see §3).
10. **Loaded viewer / locked version** variants.

## 3. Native form controls — requirements for the dedicated cycle

Page today: Start/End = native `<input type="month">` (`#cgStartDate`, `#cgEndDate`); Client, Ratecard, Currency, Stage = native `<select class="form-select">`; Reassign = native `<select>` "Reassign to…". The user's screenshots show the browser month popup (Italian "gen feb… / Cancella / Questo mese") and the OS option list for Stage (dark grey highlight). The boards specify custom controls with a common visual language: white trigger, 1px border, 8px radius, **magenta focus border**, chevron or calendar icon right, grey placeholder.

**Date picker (5.11 Start, 5.12 End).** Field shows `dd/mm/yyyy` (grey placeholder) with a calendar icon at the right; focused = pink border. Popover under the field, ~250px wide: header row with `‹` and `›` chevrons and the title "October 2026" (bold); weekday row MO TU WE TH FR SA SU (**Monday first**); 6-row day grid, day numbers bold navy ~12px; **today** is a pink-outlined circle/box (4 Oct); selected day = filled magenta. End picker (5.12): with Start set to 05/10/2026, **days before Start are greyed and disabled**, Start and End are filled magenta and **every day between is tinted pink** (range highlight); the board title says "scorciatoie" (shortcuts) but the visible part of the popover is cut off, so the shortcut list is **not visible in any board**; ask the designer. **Conflict:** the boards are day-granular (dd/mm/yyyy) but the code stores `YYYYMM` and brief §10 #1 decided to keep months (5.21 itself says "Start month / End month, mm/yyyy"). **No board shows a month picker**, so a month-only variant (12-month grid with year chevrons, like the browser's) has to be designed, or the decision reversed. Date-order validation (End ≥ Start) is implied by the disabled days.

**Stage dropdown (5.14).** Trigger: grey dot + "Draft" + chevron, pink focus border. List: one row per stage with a **coloured dot** (Draft grey, SIP blue, Expected yellow, Anticipated orange, Committed green, Canceled light grey), selected row pink-tint background with magenta check at right; the board title says "in Draft gli altri stadi sono bloccati — proposta, da validare": **in Draft all other stages are shown disabled/greyed**. The Stage control in Draft is therefore a disabled-looking select with the Draft entry, not plain text (G-12). Today the page lists only SIP…Canceled and no Draft entry outside Draft.

**Ratecard dropdown (5.13).** Trigger "None — global rates" + chevron. List rows have **two lines**: bold name, muted sub-line "EUR · Master Data default rates" / "EUR · 42 roles" / "EUR · 18 roles · client-specific" / "CHF · 24 roles". Selected row: pink tint, **left magenta bar**, magenta check on the right. Scrollable (more rows below, e.g. Healthware UK 2026). Sub-line data (currency, role count, client-specific) must come from the ratecard list; check `filteredRatecards` has role counts. Hint under the field on 5.21: "Optional · filtered by client".

**Client dropdown.** Only the closed state exists (5.13/5.14/5.21): grey "Unassigned" placeholder + chevron + a separate outlined "+ New" button on its right. The open list is **not designed**; reuse the Ratecard list style (probably with search, since clients are many).

**Currency.** Closed field only: grey disabled box "EUR" with a padlock icon at the right (locked). The open (unlocked) list is not designed; 5.21 shows "€ EUR" with a chevron when unlocked.

**Reassign owner (5.15).** Trigger: outlined button "⇄ Reassign" at the right of the Owner row (admin-only). Popover (~280px, right-aligned under the button, rounded, shadow): small uppercase label "REASSIGN OWNER"; **search input** with magnifier icon, "Search by name or email"; scrollable **people list**, each row = circular grey-blue **avatar with initials** (AP, PA, P1, MR), name in bold, email muted below; the **current owner row is pink-tinted with a pink "Current owner" pill** (and presumably not selectable); footer note "The previous owner keeps editor access via Sharing." (verify this is true of the backend before shipping the text). Initials come from the same data as the Sharing avatars (G reuse the avatar component of the closed Sharing summary).

**Not specified in boards but linked:** Sharing "Viewer" role select and the Add-roles modal group chips (5.16) use the same chip/select styling; the spec's explicit non-goals (`<select>` kept for Reassign, native month inputs) are exactly what this cycle replaces. Suggested shared components: `DatePicker` (+ month-only mode), `Dropdown` (trigger + list with optional dot, two-line rows, check, disabled rows, optional search), `PeoplePicker` (search + avatar rows + current badge). All three need keyboard support (arrows, Enter, Esc) and must keep the existing handlers (`onHeaderFieldChange`, `onPipelineChange`, `onClientChange`, `onRatecardChange`, `onCurrencyChange`, `onReassignOwnerChange`).

## 4. Summary

| Category | Count | | Size | Count |
|---|---|---|---|---|
| (i) spec says it, code doesn't | 9 (G-01, 14, 17, 18, 19, 21, 23, 24, 26) | | S | 24 |
| (ii) spec contradicts board | 4 (G-03, 09, 12, 15) | | M | 4 (G-08, 16, 22, 28) |
| (iii) nobody captured it | 14 (G-02, 04, 05, 07, 08, 10, 11, 13, 16, 20, 22, 25, 27, 29) | | L | 2 (G-09, 30) |
| (iv) out of scope / deferred | 3 (G-06, 28, 30) | | | |
| **Total** | **30** | | **Total** | **30** |

**Shape of the work.** For desktop the page is structurally close to the boards (header card, three closed cards, rate row, phase bands, phasing card all exist and mostly look right). What is left is **mostly S-sized CSS/copy polish plus three M restructurings** (closed Offer-details summary, role header, task row inputs). The one real defect is **G-14 (white role headers)**, a CSS specificity bug that makes the grid look far from the board on its own, together with G-15/G-16 (column widths and header height) that push the role columns off-screen; fixing those three would remove most of the perceived distance. Nine items are plain implementation misses against an already-correct spec (incl. copy never applied and hex left behind). Real component work is confined to the **custom controls (L)** and the **smartphone cycle (L)**; the Add-roles modal restyle is M and optional. Still to verify interactively: everything listed under "Needs interactive capture", which may add further small items.
