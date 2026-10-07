# Cost Grid — visual fidelity to the boards + custom form controls — design

Date: 2026-10-07. Type: evolution (Scenario 2), UI redesign follow-up cycle.
Input: `docs/superpowers/design/costgrid/2026-10-07-costgrid-fidelity-gap-report.md`
(30 findings G-01…G-30 + user decisions D1–D4, binding).
Predecessor: `docs/superpowers/specs/2026-10-07-costgrid-redesign-cycle-a-design.md`
(merge `8f69105`, fixes `e0ae807`, `0b5557b`).

## Goal

Close the gap between `costgrid.html` and its design boards, and replace the native
form controls the boards specify as custom ones. One cycle, because both halves touch
the same two files (`costgrid.html`, `css/costgrid.css`) and the per-cycle fixed
overhead would otherwise be paid twice.

**In scope:** the 24 S items, the 4 M items, the custom controls (L), plus two items
the report had parked (G-06, G-28) that the user pulled in.
**Out of scope:** smartphone (D4) and, as its consequence, portrait tablet (D1); the
success-toast variant of board 5.18-3 (the existing dialog stays — it carries the link
to `project-config.html`, which a toast would drop).

## Board → section map (PROCESS.md §6.6.1)

Every board in `docs/superpowers/design/costgrid/` was opened in this brainstorming.

| Board | Implemented by |
|---|---|
| `5.11-datepciker-start-date.png` | §1.2 (day mode of `CgDatePicker`, applied to task From/To — **not** to the Offer-details Period, superseded by D2); §2 G-03, G-11 |
| `5.12-datepicker-end-date.png` | §1.2 (day mode, `min` = Start: disabled earlier days + range tint) |
| `5.13-dropdown-ratecard.png` | §1.3 (`CgSelect`, two-line rows) |
| `5.14-dropdown-stage.png` | §1.3 (`CgSelect`, colour dots, disabled rows in Draft); §3 G-12 |
| `5.15-reassign-dropdown-utenti.png` | §1.4 (`CgPeoplePicker`); §3 G-09 |
| `5.16-popu-add-role.png` | §6 (G-28) |
| `5.17-costgrid-con-task-inseriti.png` | §4 (G-14…G-26) |
| `5.17-costgrid-con-opioni-roles.png` | §4 G-16 (⋮ button shape); role menu content unchanged from cycle A |
| `5-18.visualizzazione-resume-pannelli-chiusi.png` / `5.18-visualizzazione-costgrid.png` (identical) | §2 G-01, G-06; §3 G-08; §4 G-17 |
| `5-18-tags-e-sharing.png` | §3 G-07; Tags/Sharing open states |
| `5.18-selezione-task-nuovo progetto-1.png` | §5 (phasing bar G-27); selection-mode states unchanged from cycle A |
| `5.18-selezione-task-nuovo progetto-2.png` | Generate-project modal — unchanged (cycle A §5.5 already matches) |
| `5.18-selezione-task-nuovo progetto-3.png` | **Deliberately not implemented**: success toast; the dialog stays (see Goal) |
| `5.18.add-project-o-program.png` | Link-to-a-program modal — unchanged (cycle A §5.5 already matches) |
| `5.18-aggiunta-task-progetto-esistente-monthly-phasing.png` | §5 (G-27) |
| `5.20-tablet-view.png` | **No target**: byte-identical duplicate of the board above; D1 rules orientation, not a tablet design |
| `5.21-situazione-di-partenza-dopo-create.png` | Canonical Offer-details layout (D3): §3 G-07, G-10, G-11, G-12; §4 G-17, G-18 |
| `monthlypicker.jpg` | §1.2 (month mode) — supersedes 5.11/5.12 for the Period |
| `mobile-view-1/2/4.png`, `mobil-view-3.png` | **Deferred to cycle B** (D4). Not used as a target here. |
| `Costgrif_ciclo1*.jpg`, `costgrid_fix1.jpg` | Not boards — the user's renders of the current page; evidence for G-14 only |

## Decisions taken in this brainstorming

1. **Where cycle A's spec deliberately contradicts a board, the board wins** — this is
   a fidelity cycle. Applies to G-03 (back link → bordered button), G-09 (Reassign
   `<select>` → people picker), G-12 (Draft Stage plain text → disabled control),
   G-15 (fixed column 280 → 225px).
2. **Task From/To get the day picker** (5.11/5.12), not just restyled text inputs.
   Both pickers keep their editable typed input; typed-value End≥Start *validation*
   stays with the separate "cycle C dates" backlog item — here the picker only
   prevents **choosing** an invalid value.
3. **G-06 is in:** on a non-Draft proposal the version tray shows the disabled
   "New version" segment and the note "Published · versions locked after Publish to
   SIP". The segment is inert — cycle A's rule (versions only created in Draft) is
   unchanged, only made visible.
4. **G-28 is in:** `#cgRoleSelectModal` is restyled to 5.16, same id and same handlers.
5. **The Client list reuses the Ratecard list style, plus a search box** (clients are
   many); single-line rows, no sub-line. No board exists for it.
6. **`scripts/shoot.mjs` gains `--eval` / `--eval-file`** so the interactive states can
   be captured and compared (§8).

## Current behaviour (verified in code, 2026-10-07)

- `costgrid.html:29` `.cg-back-link` is a plain `<a>`; `:62-69` header actions are
  `btn-sm btn-primary` (Save) + `btn-sm btn-outline-secondary` (Clone/Export/Share) and
  the state action; `:38` stage pill takes an inline `border` from `headerStageStyle`.
- `:40` `.cg-version-seg` renders `v-if="isDraft"` for the "+ New version" segment only;
  nothing is shown in its place otherwise.
- `:88-105` closed Offer-details summary already renders label+value pairs in groups —
  they sit on the same line (G-08 is a CSS/markup restructure, not new data).
- `:114` Reassign is a native `<select class="form-select form-select-sm">`;
  `:134/:138` Start/End are `<input type="month">`; `:145` Stage, `:156` Client,
  `:164` Ratecard, `:171` Currency are native `<select>`, with `-sm` on Client and
  Ratecard only (G-10's mixed heights).
- `:281` `<table class="table mb-0" id="cgGridTable">` — the Bootstrap `table` class is
  the cause of G-14: `.table > :not(caption) > * > *` (specificity 0,1,1) overrides
  `.cg-role-col-header { background }` (0,1,0).
- Task rows (`:362-410`): name and description are `<textarea>`s with `resize:vertical`
  and `min-height:48px`/`72px` (G-22); From/To are `type="text"` with the **Italian**
  placeholder `gg/mm/aaaa` (English-copy violation) going through `onTaskDateChange`
  and `cgIsoToIt`.
- Inline hex still in the grid markup: `#333` (`:319,325-329`), `#444` (`:290,295`),
  `#555` (`:388`), `#888` (`:284`), `#93c5fd` (`:322,347,353`), `#e2e8ff` (`:355-358`),
  `#c8d0ee` (`:359`), `#fff` (`:301,319,325-329`), `#fcd34d`/`#f8877a` (`:348-349`)
  — G-26.
- The role ⋮ menu already uses `<Teleport to="body">` + fixed positioning computed from
  `getBoundingClientRect()`, with outside-click/Escape/scroll close handlers
  (`costgrid.html:437-452`, `:1007-1018`, `:1465-1480`). The new controls reuse this
  exact mechanism.
- `scripts/shoot.mjs`: `parseArgs` at `:24-36`, settle at `:176`, capture at `:178`.
  No hook to run page script before capture.
- Current versions: `css/costgrid.css?v=1`, `css/tokens.css?v=9`, `css/style.css?v=21`,
  `js/core.js?v=12`, `js/costgrid.js?v=40`, `js/lib/costgrid-calc.js?v=7`.

## Design

### 1. New form controls

**1.1 Boundaries.** Three Vue components in one new classic script
`js/cg-controls.js` (`?v=1`), following `js/share-list-component.js`'s pattern:
`window.CgDatePicker` / `window.CgSelect` / `window.CgPeoplePicker`, registered on
`costgrid.html`'s app via `app.component('cg-date-picker', …)` etc. Loaded only by
`costgrid.html`. Pure logic lives in a new `js/lib/cg-controls-calc.js` (`?v=1`, ES
module with the usual `window.*` bridge), vitest-covered:

- `monthGridYear(year) → [{ key:'YYYYMM', label:'Jan', disabled }]` (12 entries, 3×4).
- `dayGridMonth(year, month, { min, max }) → weeks[]` — Monday-first, leading/trailing
  blanks, per-day `{ iso, day, disabled, inRange, isToday }`.
- `parseItDate('dd/mm/yyyy') → 'YYYY-MM-DD' | null` and `formatItDate(iso)` — the page's
  `cgIsoToIt`/`onTaskDateChange` conversion, extracted so both the typed and the picked
  path share one implementation.
- `parseMonthInput('mm/yyyy') → 'YYYYMM' | null`, `formatMonthInput('YYYYMM')`.
- `clampMin(valueIso, minIso) → boolean` used for the disabled rules.

No component holds business logic; each emits `update:modelValue` and the page's
existing handlers run unchanged.

**1.2 `CgDatePicker`** — props `modelValue`, `mode: 'month' | 'day'`, `min`, `disabled`,
`placeholder`, `ariaLabel`.
- Field: white, 1px `--border-light`, `--radius-md`, calendar glyph (inline SVG) at the
  right, grey placeholder (`mm/yyyy` or `dd/mm/yyyy`), **focus = magenta border +
  `--focus-ring` glow**. The input stays editable and typed values go through
  `parseMonthInput`/`parseItDate`; an unparseable value reverts on blur.
- Popover (Teleport to body, fixed, ~250px, white, `--radius-md`, `--shadow-lg`):
  - `mode="month"` — header `‹ {year} ›` (year only, bold navy, chevrons step the year);
    body 3×4 grid of month abbreviations, navy semibold; **selected month is an outline
    pill** (magenta border, magenta bold text, white fill — *not* a filled chip);
    footer, visually separated by a hairline: outline buttons "This month" and
    "Next month", muted "Clear" text link right-aligned. Exactly `monthlypicker.jpg`.
  - `mode="day"` — header `‹ October 2026 ›`; weekday row **MO TU WE TH FR SA SU**;
    6-row day grid, navy ~12px; today = magenta **outline**; selected = **filled**
    magenta; with `min` set, earlier days are greyed and `disabled` and the days between
    `min` and the selected value are tinted (`--brand-magenta-tint`), per 5.12.
    No shortcut row (none is legible in any board — the one in 5.12 is cut off).
- Keyboard: Esc closes and restores focus to the field, Enter commits the typed value,
  arrows move within the grid when it has focus. Closes on outside click and on scroll
  of the grid container, like the ⋮ menu.
- Applied to: Offer-details Start (`mode="month"`) and End (`mode="month"`, `:min="start"`);
  every task From (`mode="day"`) and To (`mode="day"`, `:min="task.taskStartDate"`).
  The Italian `gg/mm/aaaa` placeholder becomes `dd/mm/yyyy`.

**1.3 `CgSelect`** — props `modelValue`, `options`, `disabled`, `locked`, `searchable`,
`placeholder`, `ariaLabel`. An option is
`{ value, label, sub?, dot?, disabled?, disabledReason? }`.
- Trigger: white, 1px border, `--radius-md`, chevron right, magenta focus ring, same
  ~36px height as the date field. `locked` renders the grey box with a **padlock** icon
  inside and no chevron (Currency, G-11), keeping the existing `currencyLockTitle`
  tooltip.
- List (Teleport, fixed, white, `--shadow-lg`): optional search input with a magnifier
  when `searchable`; rows with an optional colour dot, bold label and optional muted
  sub-line; **selected row = pink tint + left magenta bar + magenta check right**;
  disabled rows muted and inert; scrollable with a max height.
- Keyboard: ↑/↓/Home/End move the active row, Enter selects, Esc closes, type-ahead
  jumps to the first matching label.
- Applied to, with the data each one needs:
  - **Stage** — options from the existing stage list with the token colour per stage as
    `dot`; in Draft, a `Draft` entry is present and selected and **every other stage is
    disabled** (5.14 — a disabled-looking control, G-12), so the control replaces today's
    `form-control-plaintext`. Outside Draft, behaviour and handler (`onPipelineChange`)
    are unchanged and `Draft` is not offered.
  - **Ratecard** — two-line rows: name, then `"{currency} · {n} roles"` plus
    `" · client-specific"` when the card belongs to a client; the "None" row reads
    `"EUR · Master Data default rates"`. The role count comes from the ratecard list
    already loaded for `filteredRatecards`; **if an entry has no role count available,
    the sub-line shows the currency only** — no count is invented. Hint
    "Optional · filtered by client" under the field (G-11).
  - **Client** — `searchable`, single-line rows, "Unassigned" placeholder; the existing
    "+ New" button stays beside it (5.13/5.21).
  - **Currency** — same control, `locked` when `currencyLocked`; the "1 EUR = x" line
    below stays.
  - The Add-roles modal's group filters are *not* `CgSelect` (they are chips, §6). The
    "Add people by name or email / Viewer / Share" row that board
    `5-18-tags-e-sharing.png` shows inside the open Sharing card is **not implemented**:
    adding a share stays exclusive to `#shareModal` (`js/shares.js`), a cycle-A decision
    the gap report did not challenge. The open Sharing card keeps `<share-list>` only.

**1.4 `CgPeoplePicker`** — props `people` (`{ id, name, email }[]`), `currentId`,
`disabled`; emits `select(id)`.
- Trigger: outlined button "⇄ Reassign" (SVG icon + text), right-aligned on the Owner
  row, admin-only exactly as today's `<select>` is.
- Popover ~280px, right-aligned under the button: uppercase micro-label
  "REASSIGN OWNER"; search input with magnifier, placeholder "Search by name or email";
  scrollable rows of circular initials avatar + bold name + muted email; the current
  owner's row is pink-tinted with a "Current owner" pill and is **not** selectable.
- Footer note "The previous owner keeps editor access via Sharing." is rendered **only
  if the backend actually does that** — the implementer must verify
  `onReassignOwnerChange`'s server path (`api/src/routes/cost-grids.js` owner
  reassignment) before shipping the line. If it does not, the line is omitted; it is
  not reworded into another unverified claim.
- Avatar initials reuse the helper already used by the closed Sharing summary.

### 2. Header card

| ID | Change |
|---|---|
| G-01 | Save becomes a secondary (white) button. The only magenta button in the header is the single state action (Publish to SIP / Generate project); "Selecting tasks…" stays a disabled secondary and "All tasks are in projects" stays muted text. |
| G-02 | One secondary-button style for the page (`.cg-btn-secondary` in `css/costgrid.css`): white fill, `--text-base` ~13px dark text, ~34px tall, `--radius-md`, 1px `--border-light`. Replaces `btn-sm btn-outline-secondary` in the header **and** on "Add roles"/"+ Add phase". |
| G-03 | `.cg-back-link` becomes a bordered white button of the same family, still `@click.prevent="goBack"` with the "Saving…" state. |
| G-04 | The hairline between `.cg-header-row1` and `.cg-header-row2` is removed. |
| G-05 | `.cg-stage-pill` drops the inline `border` (so `headerStageStyle` no longer supplies one): light tinted fill, no border, small bold. |
| G-06 | Outside Draft the tray renders a disabled "New version" segment (lock icon + label, `aria-disabled`, no handler) followed by the version chips, then the muted note "Published · versions locked after Publish to SIP". No change to when a version can be created. |

### 3. Offer details / Tags / Sharing

| ID | Change |
|---|---|
| G-07 | `.cg-section-title` → 15px, weight 800, navy; chevron enlarged. |
| G-08 (M) | Closed Offer-details summary restructured: each fact becomes an uppercase ~10px muted label **stacked above** a bold ~11.5px value; three groups (Period+Stage \| Client+Ratecard+Currency \| Owner) separated by vertical hairlines; "Edit" vertically centred at the far right of the row, not in flow after it. Target: one line at 1440 and a ~50px card. Below 1200px the groups may wrap, the "Edit" control stays vertically centred. |
| G-09 | Reassign `<select>` → `CgPeoplePicker` (§1.4). The Owner row reads "Owner: **{name}**  Created: **{long date}**" with bold values and the long date format (`Oct 4, 2026`). |
| G-10 | All Offer-details controls on one height (~36px): `form-select-sm` dropped from Client and Ratecard (they become `CgSelect`), date fields match. Labels "Start month" / "End month". The PERIOD and STAGE groups are boxed/shaded panels with uppercase section labels, per 5.21 and `monthlypicker.jpg`. |
| G-11 | Currency = locked `CgSelect` with the padlock inside; "Optional · filtered by client" hint under Ratecard. |
| G-12 | Draft Stage is the disabled `CgSelect` of §1.3, not plain text. |
| G-13 | Resolved by D3: 5.21 is canonical; boards 5.11–5.15's older arrangement is not a target. |

Tags and Sharing closed states already match; only §3 G-07's typography changes there.

### 4. Grid

| ID | Change |
|---|---|
| **G-14** | Remove the Bootstrap `table` class from `#cgGridTable` and carry the handful of base rules the grid actually relies on (border-collapse, cell padding reset) into `css/costgrid.css`. Rationale: the grid is already fully custom-styled, so dropping the class is smaller and more durable than escalating specificity on every themed cell. This restores the navy role headers, the white role name, the muted code and the deep-red missing-rate header. **Any cell that visibly changes after the class is dropped must be re-checked in the renders** — this is the one change that can silently alter every row. |
| G-15 | Fixed column `min-width` 280 → **225px**; Description 240 → **150px**; the four totals columns to ~95/75/50/70px. Target: 5–6 role columns visible at 1440 (960px of fixed chrome today → ~440px). |
| G-16 (M) | Header row ~65px: role name 2-line clamp (`-webkit-line-clamp`), code one line with ellipsis, ⋮ as a **bordered 24px square button at the top-right** of the cell instead of a bare centred glyph. Role column `min-width` reduced accordingly. |
| G-17 | "Compact columns" moves to the grid-card header as a toggle switch on the right; the ⊟ icon inside the "Phase / Task" cell is removed. Same `compactHeader` state and persistence. |
| G-18 | "+ Add role" → "Add roles" with a people icon. |
| G-19 | "▼ Summary (click to collapse)" → a muted collapsible bar "Totals by role" with a chevron; rows "Hours by role" / "Fees by role". |
| G-20 | Column headings → "Total cost & fee", "Pass-through", "Hrs", "Fees", "Description"; first cell "Phase / Task"; "+ add task" → "+ Add task". |
| G-21 | Phase row: "+ Task" as a muted translucent pill, ✕ small and grey (not red); phase band stays brand-navy-mid. |
| G-22 (M) | Task name becomes a **single-line bordered `<input>`** (bold); description becomes a borderless 2-line field with **no resize handle** that reads as the board's plain text while staying editable. Row height drops to ~65–85px. The lock icon sits inline with the name, not floating. |
| G-23 | The "In {project}" line becomes a short grey **pill with a link icon**, single line, truncated with ellipsis. |
| G-24 | Hours cells: bordered white input boxes; a filled value is bold with a darker border (`.cg-cell-filled`); empty shows "—" inside the box. |
| G-25 | The table sits inside the card with inner padding and a rounded inner frame; the horizontal scrollbar is visible at the bottom of that frame. |
| G-26 | Every inline hex listed in "Current behaviour" moves to tokens (`color-mix()` on existing tokens where a shade is needed — no new tokens). Enforced by the new guard test (§7). |

### 5. Monthly Phasing

G-27: the budget bar becomes **navy on a light-grey track** (`--brand-navy` fill,
`--surface-medium` track) instead of magenta. Proportions and calculation unchanged.

### 6. Add-roles modal (G-28, M)

`#cgRoleSelectModal` keeps its id, its three titles' *conditions* and every handler
(`confirmAddRoles`, the `roleModalTeams` chips, `roleModalSearch`). Restyled to 5.16:

- Header: inline SVG people icon + "Add roles" + muted " · {current ratecard name}"
  (`None — global rates` when none). The emoji in the three titles is removed
  (`👥 Add roles` / `⇄ Change role` / `⊕ Duplicate column` → SVG + text).
- Search input with a magnifier icon, placeholder "Search by name or code".
- Group filters as **pill chips**, active = magenta fill, white text; "All" first.
- Rows: checkbox, bold name, muted code, **right-aligned rate pill** (`135.00 EUR/h`);
  rows for roles already in the grid are disabled, with the footer note
  "Roles already in the grid are disabled."
- Footer: "Cancel" secondary, "Add selected" magenta, disabled while nothing is checked.

### 7. Responsive (D1)

No `@media (orientation: …)`. Verified at **1440 / 1024 / 768** only. 1024 keeps the
desktop path and the hidden legend already in `css/costgrid.css`; since G-15 brings the
desktop fixed column to 225px, the existing `max-width: 1024px` override to 220px is now
all but redundant — it is **dropped**, leaving one column width for every width above the
mobile breakpoint. **Portrait tablet inherits the mobile layout, which does not exist
for this page yet, and is therefore deferred together with the smartphone cycle** —
stated here so it cannot resurface as a Gate 2 surprise.

### 8. `scripts/shoot.mjs --eval` (Decision 6)

New optional flags, both no-ops when absent:

- `--eval '<js>'` — JavaScript evaluated in the page after the settle wait and before
  the capture.
- `--eval-file <path>` — the same, read from a file (preferred: Windows shell quoting
  makes long inline snippets fragile).
- `--eval-settle <ms>` — extra wait after the evaluation, default 400.

Implementation: one `Runtime.evaluate` RPC (`awaitPromise: true, returnByValue: true`)
inserted at `scripts/shoot.mjs:177`, between the settle and `Page.captureScreenshot`;
a thrown `exceptionDetails` fails the run loudly rather than capturing a misleading
screenshot. The snippet runs once per width (each width re-navigates). Usage is
documented in the script's own `--help` text and in `CLAUDE.md`'s `scripts/shoot.mjs`
entry.

This makes the report's "Needs interactive capture" states (open Offer details, open
Tags/Sharing, the role ⋮ menu, selection mode, the modals, open popovers) capturable
and therefore comparable against the boards — the exact gap that produced cycle A's
Gate 2 outcome.

### 9. Files

| File | Change |
|---|---|
| `costgrid.html` | §2–§6 markup; the four control swaps; component registration; `?v=` bumps. |
| `css/costgrid.css` (`?v=1` → `?v=2`) | All of §2–§6's styles plus the three controls' styles. Tokens only. |
| `js/cg-controls.js` (new, `?v=1`) | The three components. |
| `js/lib/cg-controls-calc.js` (new, `?v=1`) | The pure helpers of §1.1. |
| `js/lib/cg-controls-calc.test.js` (new) | vitest for those helpers. |
| `js/lib/costgrid-guard.test.js` (new) | Guard: no hex / no emoji inside `#costGridEditorSection` and its modals; `?v=` agreement for `costgrid.css`, `cg-controls.js`, `cg-controls-calc.js`. Modelled on `js/lib/pipeline-guard.test.js`. |
| `scripts/shoot.mjs` | §8. |
| `js/costgrid.js` | Only if a swapped control needs a handler signature change — **expected: none**. If it is touched, `?v=40` → `?v=41` everywhere. |
| `CLAUDE.md`, `docs/pages/costgrid.md` | §11. |

Not touched: any API route, `js/api-sync.js`, `js/shares.js`,
`js/share-list-component.js`, `js/tags.js`, `css/tokens.css`, `css/style.css`, autosave,
lock/permission logic, rate resolution, phasing calculation, the Generate-project /
program / add-to-project modals' markup and handlers.

### 10. Testing

- **vitest, new:** `cg-controls-calc.test.js` — `monthGridYear` (12 entries, labels,
  disabled by `min`), `dayGridMonth` (Monday-first alignment, leading/trailing blanks,
  28/30/31-day and leap months, `min` disabling, `inRange` tinting, `isToday`),
  `parseItDate`/`formatItDate` round-trip plus rejection of `32/13/2026` and `''`,
  `parseMonthInput`/`formatMonthInput` round-trip.
- **vitest, new:** `costgrid-guard.test.js` (§9).
- **Green to keep:** `foundations-guard`, `nav-shell-guard`, `money-guard`,
  `project-rules-guard`, `costgrid-calc`, `costgrid-clone`,
  `costgrid-currency-change`, `costgrid-new-version`, `proposal-modals-guard`.
- Full suite once at the end of execution, then Gate 1.

### 11. Documentation

`CLAUDE.md`: the `css/costgrid.css` entry (new `?v=2` and the controls), a new
`js/cg-controls.js` + `js/lib/cg-controls-calc.js` entry, and the `scripts/shoot.mjs`
entry (`--eval`). `docs/pages/costgrid.md`: the fidelity narrative, the three controls
and their props, the G-14 root cause, and the deferred portrait-tablet note.
`PROCESS.md` §6.6.4 gains the `--eval` usage line (this *is* a change to a documented
process tool, so it qualifies under §7).

### 12. Verification (PROCESS.md §6.6.3 — assigned to who can run it)

**Mine, with `scripts/shoot.mjs` at 1440/1024/768, PNGs read back and compared board by
board** — each plan task carries a `Boards:` line with the paths it must reproduce:
1. Populated SIP proposal, cards closed (vs `5-18.visualizzazione-resume-pannelli-chiusi`).
2. Empty new Draft (vs `5.21`).
3. Offer details open, populated (vs `5.21`, `monthlypicker.jpg` for the PERIOD panel).
4. Grid with roles and tasks (vs `5.17-costgrid-con-task-inseriti`).
5. Via `--eval`: month picker open, day picker open with a Start set, Stage list open in
   Draft, Ratecard list open, Client list open, Reassign popover open, role ⋮ menu,
   selection mode with mixed free/assigned tasks, Add-roles modal
   (vs `monthlypicker`, `5.11`/`5.12`, `5.14`, `5.13`, `5.15`, `5.17-con-opioni-roles`,
   `5.18-selezione-1`, `5.16`).

**Yours, at Gate 2** (behaviour, not pixels): keyboard navigation of the three controls;
End-before-Start blocked in both pickers; typed dates still saved; Stage change on a
non-Draft proposal still propagates; Currency still locked when a project exists;
Reassign actually reassigns; Add-roles / Change role / Duplicate still work from the
restyled modal; viewer and locked-version variants.

## Out of scope

Smartphone layout and portrait tablet (D4/D1, cycle B); the success toast of 5.18-3;
typed-date End≥Start validation and the app-wide date-order checks (backlog "cycle C
dates"); any API change; extending the three controls to other pages (they stay
`costgrid.html`-only until a second consumer exists); `--sand-*`/`--brand-mid` cleanup
in `style.css`; re-opening D1–D4.

## Acceptance criteria

1. Period uses the month picker of `monthlypicker.jpg` (outline-pill selection, year
   chevrons, This month / Next month / Clear); task From/To use the day picker of
   5.11/5.12 with Monday-first, today outlined, and days before Start disabled and the
   span tinted on the To field.
2. Stage, Client, Ratecard, Currency and the Sharing role select are `CgSelect`:
   colour dots on Stage with every non-Draft stage disabled while in Draft; two-line
   Ratecard rows; searchable Client list; padlocked Currency. All keyboard-operable.
3. Reassign is the outlined button + searchable people popover, current owner marked and
   unselectable; the footer note appears only if verified true of the backend.
4. Role column headers render navy with white names (G-14), the header row is ~65px, and
   at least 5 role columns are visible at 1440 with 10 roles.
5. Every G-01…G-28 item in §2–§6 is implemented; `js/lib/costgrid-guard.test.js` finds no
   hex or emoji inside `#costGridEditorSection` or its modals.
6. `scripts/shoot.mjs --eval`/`--eval-file` work, fail loudly on a page exception, and are
   documented in `--help`, `CLAUDE.md` and `PROCESS.md` §6.6.
7. Every touched versioned file's `?v=` is bumped at every reference to it; `v-cloak`,
   the page shell and all money call sites are unchanged.
8. The §12 renders exist, were read back, and each is reported as matching or as a
   named, accepted deviation.
