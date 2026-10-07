# Cost Grid fidelity + custom form controls — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `costgrid.html` to its design boards (G-01…G-28) and replace its native date/select/people controls with three custom Vue components.

**Architecture:** Pure logic in a new ES module `js/lib/cg-controls-calc.js` (vitest); three presentational Vue components in one classic script `js/cg-controls.js` (`window.CgDatePicker`/`CgSelect`/`CgPeoplePicker`, registered on the page's app like `share-list`); everything else is markup/CSS in `costgrid.html` + `css/costgrid.css`. No API change, no new dependency, no build step. The existing handlers (`onHeaderFieldChange`, `onPipelineChange`, `onClientChange`, `onRatecardChange`, `onCurrencyChange`, `onReassignOwnerChange`, `onTaskDateChange`) keep their signatures — the components only replace the widget that calls them.

**Tech Stack:** Vue 3 (CDN, runtime-compiled, no build), Bootstrap 5.3.2, vitest + jsdom (frontend), Node ≥ 22 for `scripts/shoot.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-07-costgrid-fidelity-design.md`

**Task independence (PROCESS.md §6.1):** Tasks 1 and 2 are independent of everything else and of each other. Tasks 3 → 4 → 5 → 6 all edit `costgrid.html` and `css/costgrid.css` and are **strongly sequential** — they must not be run in parallel. Task 7 depends on 3–6.

## Global Constraints

- All user-facing text in **English** (this cycle removes the Italian `gg/mm/aaaa` placeholder).
- **No hardcoded hex** in `costgrid.html`'s editor region or `css/costgrid.css` — `var(--token)` only, `color-mix()` on existing tokens for a shade; **no new tokens** in `css/tokens.css`.
- **No emoji** inside `#costGridEditorSection` or its modals — inline SVG `stroke="currentColor"` 14–16px, or text.
- Every touched versioned file gets its `?v=N` bumped at **every** reference in the repo (`grep -rn "<filename>?v=" .`).
- Every amount through `formatMoney`/`formatMoneyInput`/`parseMoney` from `js/lib/money.js` — no `Intl.NumberFormat` outside it.
- Edit HTML with the **Edit tool only** — PowerShell `Set-Content` adds a BOM to repo HTML.
- `v-cloak` on `#costGridEditorSection`, the `#app-shell`/`#app-main` page shell, autosave, lock/permission logic, rate resolution and the phasing calculation are **unchanged**.
- New cache versions when touched: `css/costgrid.css?v=2`, `js/cg-controls.js?v=1`, `js/lib/cg-controls-calc.js?v=1`.
- Run only the tests you touched during a task (`npx vitest run <file>`); the full suite runs once, in Task 6.

## Review Focus

Five failure modes the spec implies that no obvious task test covers; each has a test added to the task that owns the code.

1. **Dropping Bootstrap's `table` class (Task 5) silently restyles every cell** — padding, borders and vertical alignment of rows nobody is looking at (summary, rate row, phase band, TOTAL) come from `.table` today. Expected: those rows look unchanged. Pinned by Task 7's renders, which must include a populated grid, and by Task 5's guard assertion that the base rules were carried over.
2. **A locked version or a viewer must not be able to edit through the new controls** — the native `<select disabled>`/`<input disabled>` enforcement disappears with the widget. Expected: every swapped control is inert when `isLocked` or `myPermission === 'viewer'`. Pinned by a Task 3 markup test asserting a `:disabled`/`disabled` binding on every swapped control.
3. **An unparseable or emptied typed date must not corrupt the stored value** — `parseItDate('32/13/2026')` and `''` must not reach `onTaskDateChange` as a value. Expected: invalid reverts to the previous value, empty clears. Pinned by Task 1 tests on `parseItDate`/`parseMonthInput` and a Task 3 test that the component emits nothing on an unparseable entry.
4. **Existing data where End precedes Start must still render** — `min` disabling must not crash or blank a value already stored that way. Expected: the out-of-range value is shown and selectable rows are merely disabled. Pinned by a Task 1 `dayGridMonth`/`monthGridYear` test with `min` later than the selected value.
5. **A popover opened inside the horizontally scrolling grid, or inside a Bootstrap modal, must not be clipped or hidden** — task date pickers live in a scrolling container, and Change-role opens over a `z-index: 1055` modal. Expected: Teleported to `body`, repositioned on scroll/resize, above the grid but below a modal unless opened from inside one. Pinned by Task 3's reuse of the ⋮-menu mechanism plus Task 7's `--eval` captures of an open task-date picker after a horizontal scroll.

---

### Task 1: Pure helpers for the controls

**Files:**
- Create: `js/lib/cg-controls-calc.js`
- Create: `js/lib/cg-controls-calc.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (all `export function`, each with a `window.<name> = <name>` bridge line at the end of the file, matching the other `js/lib/` modules):
  - `monthGridYear(year: number, opts?: { min?: string, max?: string }) → { key: string, label: string, disabled: boolean }[]` — 12 entries, `key` is `'YYYYMM'`, `label` is `'Jan'`…`'Dec'`.
  - `dayGridMonth(year: number, month: number, opts?: { min?: string, max?: string, selected?: string }) → { iso: string|null, day: number|null, disabled: boolean, inRange: boolean, isToday: boolean }[][]` — array of 6 weeks × 7 days, Monday first, leading/trailing cells `{ iso: null, day: null }`. `month` is 1-based. `inRange` is true for days strictly between `min` and `selected`.
  - `parseItDate(text: string) → string|null` — `'dd/mm/yyyy'` → `'YYYY-MM-DD'`, `null` for anything invalid (including `''`).
  - `formatItDate(iso: string) → string` — inverse; `''` for a falsy/invalid input.
  - `parseMonthInput(text: string) → string|null` — `'mm/yyyy'` → `'YYYYMM'`.
  - `formatMonthInput(ym: string) → string` — `'YYYYMM'` → `'mm/yyyy'`; `''` for falsy/invalid.

- [ ] **Step 1: Write the failing tests** in `js/lib/cg-controls-calc.test.js`

```js
import { describe, it, expect } from 'vitest';
import { monthGridYear, dayGridMonth, parseItDate, formatItDate, parseMonthInput, formatMonthInput } from './cg-controls-calc.js';

describe('monthGridYear', () => {
  it('returns 12 entries with YYYYMM keys and short labels', () => {
    const g = monthGridYear(2026);
    expect(g).toHaveLength(12);
    expect(g[0]).toMatchObject({ key: '202601', label: 'Jan', disabled: false });
    expect(g[11]).toMatchObject({ key: '202612', label: 'Dec' });
  });
  it('disables months before min', () => {
    const g = monthGridYear(2026, { min: '202605' });
    expect(g[3].disabled).toBe(true);   // Apr
    expect(g[4].disabled).toBe(false);  // May == min, selectable
  });
  it('tolerates a min later than the whole year', () => {
    expect(monthGridYear(2026, { min: '202701' }).every(m => m.disabled)).toBe(true);
  });
});

describe('dayGridMonth', () => {
  it('is Monday-first and pads with null cells', () => {
    const weeks = dayGridMonth(2026, 10);           // 1 Oct 2026 is a Thursday
    expect(weeks).toHaveLength(6);
    expect(weeks[0].slice(0, 3).every(d => d.iso === null)).toBe(true);
    expect(weeks[0][3]).toMatchObject({ day: 1, iso: '2026-10-01' });
  });
  it('handles a leap February', () => {
    const days = dayGridMonth(2028, 2).flat().filter(d => d.iso);
    expect(days).toHaveLength(29);
  });
  it('disables days before min and tints the range up to selected', () => {
    const days = dayGridMonth(2026, 10, { min: '2026-10-05', selected: '2026-10-30' }).flat();
    expect(days.find(d => d.iso === '2026-10-04').disabled).toBe(true);
    expect(days.find(d => d.iso === '2026-10-05').disabled).toBe(false);
    expect(days.find(d => d.iso === '2026-10-20').inRange).toBe(true);
    expect(days.find(d => d.iso === '2026-10-31').inRange).toBe(false);
  });
  it('still renders a selected value that precedes min', () => {
    const days = dayGridMonth(2026, 10, { min: '2026-10-20', selected: '2026-10-02' }).flat();
    expect(days.find(d => d.iso === '2026-10-02')).toBeTruthy();
    expect(days.every(d => d.inRange === false)).toBe(true);
  });
});

describe('date text parsing', () => {
  it('round-trips a valid day date', () => {
    expect(parseItDate('05/10/2026')).toBe('2026-10-05');
    expect(formatItDate('2026-10-05')).toBe('05/10/2026');
  });
  it('rejects out-of-range and empty input', () => {
    ['32/13/2026', '', '5/10/26', 'abc', '29/02/2027'].forEach(v => expect(parseItDate(v)).toBeNull());
  });
  it('round-trips a month value', () => {
    expect(parseMonthInput('10/2026')).toBe('202610');
    expect(formatMonthInput('202610')).toBe('10/2026');
    expect(parseMonthInput('13/2026')).toBeNull();
    expect(formatMonthInput('')).toBe('');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run js/lib/cg-controls-calc.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the six exports** in `js/lib/cg-controls-calc.js`

Pure date arithmetic with `Date.UTC` only (no local-timezone constructors — a `new Date('2026-10-01')` in a negative-offset zone shifts the day). `isToday` compares against `new Date()` formatted the same way. End the file with the `window.*` bridge lines.

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run js/lib/cg-controls-calc.test.js`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add js/lib/cg-controls-calc.js js/lib/cg-controls-calc.test.js
git commit -m "feat(costgrid): pure month/day grid and date-text helpers for the custom controls"
```

---

### Task 2: `scripts/shoot.mjs --eval`

**Files:**
- Modify: `scripts/shoot.mjs` (args at `:24-44`, capture loop at `:164-185`)
- Modify: `CLAUDE.md` (the `scripts/shoot.mjs` entry), `docs/superpowers/PROCESS.md` (§6.6.4)

**Interfaces:**
- Produces: `--eval '<js>'`, `--eval-file <path>`, `--eval-settle <ms>` (default 400). Task 7 consumes them.

- [ ] **Step 1: Add the flags**

Parse `args.eval` / `args['eval-file']` / `args['eval-settle']` next to `settle` (`:51`); `--eval-file` is read with `readFileSync(resolve(path), 'utf8')`. Add all three to the `--help` block at `:40-42`. Error out if both `--eval` and `--eval-file` are given.

- [ ] **Step 2: Run the snippet before the capture**

Between the settle wait (`:176`) and `Page.captureScreenshot` (`:178`), when a snippet is present: `rpc(ws, pending, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)`, then wait `eval-settle` ms. If the result carries `exceptionDetails`, throw `new Error('--eval failed: ' + (exceptionDetails.exception?.description || exceptionDetails.text))` so the run fails loudly instead of saving a misleading PNG.

- [ ] **Step 3: Verify both paths against the running app**

Run:
```bash
node scripts/shoot.mjs --url /pipeline.html --out "$TMP/shoot-eval" --widths 1440 \
  --eval "document.title = 'EVAL-OK'; document.body.style.background = 'rebeccapurple'"
node scripts/shoot.mjs --url /pipeline.html --out "$TMP/shoot-eval" --widths 1440 --eval "throw new Error('boom')"
```
Expected: the first writes `1440w.png` with a purple background (read it back to confirm); the second exits non-zero printing `shoot.mjs failed: --eval failed: … boom`.

- [ ] **Step 4: Document**

`CLAUDE.md`'s `scripts/shoot.mjs` line gains the three flags and the note that they make interaction-dependent states capturable; `PROCESS.md` §6.6.4 gains one line with the same, replacing "gli stati che richiedono interazione … vanno catturati a mano" with the `--eval` route (manual capture stays the fallback for states a snippet cannot reach).

- [ ] **Step 5: Commit**

```bash
git add scripts/shoot.mjs CLAUDE.md docs/superpowers/PROCESS.md
git commit -m "feat(shoot): --eval/--eval-file to capture interaction-dependent states"
```

---

### Task 3: The three controls and their wiring

**Files:**
- Create: `js/cg-controls.js`
- Create: `js/lib/cg-controls-ui.test.js`
- Modify: `css/costgrid.css` (append a `/* ── Custom controls ── */` block; bump to `?v=2`)
- Modify: `costgrid.html` — script tag + `app.component(...)` registrations (near `:726` / `:1832`); control swaps at `:114` (Reassign), `:134`/`:138` (Start/End), `:145` (Stage), `:156` (Client), `:164` (Ratecard), `:171` (Currency), and the task From/To inputs in the task row

**Interfaces:**
- Consumes: every export of Task 1 (via the `window.*` bridge, since `js/cg-controls.js` is a classic script).
- Produces, on `window`:
  - `CgDatePicker` — props `modelValue: String`, `mode: 'month'|'day'` (default `'month'`), `min: String`, `disabled: Boolean`, `placeholder: String`, `ariaLabel: String`; emits `update:modelValue` with `'YYYYMM'` (month) or `'YYYY-MM-DD'` (day), or `''` when cleared.
  - `CgSelect` — props `modelValue: [String, Number]`, `options: Array` of `{ value, label, sub?, dot?, disabled?, disabledReason? }`, `disabled: Boolean`, `locked: Boolean`, `searchable: Boolean`, `placeholder: String`, `ariaLabel: String`; emits `update:modelValue`.
  - `CgPeoplePicker` — props `people: Array` of `{ id, name, email }`, `currentId: String`, `disabled: Boolean`, `footerNote: String` (empty = no note); emits `select` with the chosen id.
  - Registered as `cg-date-picker`, `cg-select`, `cg-people-picker`.

- [ ] **Step 1: Write the failing markup test** in `js/lib/cg-controls-ui.test.js`

A static-source guard in the style of `js/lib/pipeline-guard.test.js` (read the files, assert on the text) — the components are runtime-compiled templates, so this pins the wiring, not the rendering:

```js
const html = read('costgrid.html');
const js = read('js/cg-controls.js');

it('registers the three components and loads the script versioned', () => {
  expect(html).toMatch(/js\/cg-controls\.js\?v=\d+/);
  ['cg-date-picker', 'cg-select', 'cg-people-picker'].forEach(n => expect(html).toContain(`'${n}'`));
  ['CgDatePicker', 'CgSelect', 'CgPeoplePicker'].forEach(n => expect(js).toContain(`window.${n}`));
});

it('no native select or month input is left in the editor region', () => {
  const region = html.slice(html.indexOf('id="costGridEditorSection"'), html.indexOf('<div class="modal'));
  expect(region).not.toMatch(/type="month"/);
  expect(region).not.toMatch(/<select/);
  expect(region).not.toMatch(/gg\/mm\/aaaa/);
});

// Review Focus #2
it('every swapped control is disabled when the version is locked or read-only', () => {
  const region = html.slice(html.indexOf('id="costGridEditorSection"'), html.indexOf('<div class="modal'));
  const controls = region.match(/<cg-(date-picker|select|people-picker)[\s\S]*?>/g) || [];
  expect(controls.length).toBeGreaterThanOrEqual(8);
  controls.forEach(c => expect(c, c.slice(0, 80)).toMatch(/:disabled=|:locked=/));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run js/lib/cg-controls-ui.test.js`
Expected: FAIL — `cg-controls.js` not found / native `<select>` still present.

- [ ] **Step 3: Implement the three components** in `js/cg-controls.js`

Plain objects with a `template` string, in the `window.ShareListComponent` style (`js/share-list-component.js`). Shared behaviour, written once as a small local mixin or three copies of the same six lines, whichever reads better: open state, `<Teleport to="body">` with a `position: fixed` style computed from the trigger's `getBoundingClientRect()`, recomputed on `scroll` (capture) and `resize`, closed on outside `mousedown`, on `Escape` (restoring focus to the trigger) and on select. This is the mechanism already proven in `costgrid.html:1007-1018` and `:1465-1480` — copy it rather than inventing a second one (Review Focus #5).

Per-component specifics are §1.2–§1.4 of the spec. Three things the spec pins and the signature does not:
- `CgDatePicker` emits **nothing** when the typed text is unparseable; on blur it restores the display from `modelValue` (Review Focus #3). Empty text emits `''`.
- `CgSelect`'s `locked` renders the grey box with a padlock and no chevron, and never opens.
- `CgPeoplePicker` renders `footerNote` only when non-empty; the `currentId` row is marked and not selectable.

- [ ] **Step 4: Style them** in `css/costgrid.css`

`.cg-ctl-*` classes, tokens only: white trigger, 1px `--border-light`, `--radius-md`, ~36px tall, chevron/calendar/padlock SVG right; `:focus-within` = `--brand-magenta` border + `--focus-ring` glow. Popovers: white, `--radius-md`, `--shadow-lg`, `z-index: calc(var(--z-fixed) + 1)`. Month grid 3×4, selected = **outline pill** (magenta border + magenta bold text, white fill). Day grid 7 columns, today = magenta outline, selected = filled magenta, `inRange` = `--brand-magenta-tint`, disabled = muted and non-interactive. List rows: optional dot, bold label + muted `sub`, selected = `--brand-magenta-tint` + 3px left magenta bar + magenta check.

- [ ] **Step 5: Swap the controls in `costgrid.html`**

| Was | Becomes |
|---|---|
| `:134`/`:138` `<input type="month">` | `<cg-date-picker mode="month">` on `startDateInput` / `endDateInput`, the End one with `:min="startDateInput"`, `@update:modelValue` calling the existing `onHeaderFieldChange` path |
| `:145` Stage `<select>` | `<cg-select>` with dot-per-stage options; in Draft a `Draft` option is present and selected and every other option carries `disabled: true`; outside Draft no `Draft` option — `onPipelineChange` unchanged |
| `:156` Client `<select>` | `<cg-select searchable>`; the "+ New" button stays beside it |
| `:164` Ratecard `<select>` | `<cg-select>` with `sub` = `"{currency} · {n} roles"` + `" · client-specific"` when the card has a client, `"EUR · Master Data default rates"` for the None row; **when a role count is not available for an entry, `sub` is the currency alone** — no invented count. Hint line "Optional · filtered by client" under the field |
| `:171` Currency `<select>` | `<cg-select :locked="currencyLocked">`, keeping `currencyLockTitle` as the title |
| `:114` Reassign `<select>` | `<cg-people-picker>` fed by the same user list, `:current-id="cg?.ownerId"`, `@select="onReassignOwnerChange($event)"` |
| task From/To text inputs | `<cg-date-picker mode="day">`, the To one with `:min="task.taskStartDate"`; placeholder `dd/mm/yyyy`; `@update:modelValue` calls `onTaskDateChange(task, 'taskStartDate'\|'taskEndDate', value)` — adapt that method to accept a value as well as an `$event` if it currently only reads `$event.target.value` |

Every one of them gets `:disabled="isLocked || cg?.myPermission === 'viewer'"` (Currency uses `:locked` instead).

- [ ] **Step 6: Verify the backend claim behind the Reassign note**

Read the owner-reassignment handler in `api/src/routes/cost-grids.js`. Pass `footer-note="The previous owner keeps editor access via Sharing."` **only if** it actually creates an editor share for the previous owner; otherwise pass nothing and record the finding in the task's commit message. Do not reword it into another unverified claim.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run js/lib/cg-controls-ui.test.js js/lib/cg-controls-calc.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add js/cg-controls.js js/lib/cg-controls-ui.test.js css/costgrid.css costgrid.html
git commit -m "feat(costgrid): custom month/day picker, select and people picker"
```

---

### Task 4: Header card, Offer details, Tags, Sharing (G-01…G-13)

**Files:**
- Modify: `costgrid.html` (`:29` back link, `:31-73` header card, `:85-205` the three cards)
- Modify: `css/costgrid.css`

**Interfaces:**
- Consumes: Task 3's components (already wired).
- Produces: `.cg-btn-secondary`, the page-wide secondary button class Task 5 reuses for "Add roles"/"+ Add phase".

- [ ] **Step 1: Header card**

G-01 Save → `.cg-btn-secondary` (the magenta primary is only the state action); G-02 define `.cg-btn-secondary` (white fill, `--text-base` dark text, ~34px, `--radius-md`, 1px `--border-light`) and use it for Save/Clone/Export XLS/Share; G-03 `.cg-back-link` becomes the same bordered button, handler unchanged; G-04 remove the `.cg-header-row1` hairline; G-05 drop the inline `border` from `.cg-stage-pill` and from `headerStageStyle`'s object; G-06 outside Draft render a disabled "New version" segment (lock SVG + label, `aria-disabled="true"`, no handler) before the version chips, then the muted note "Published · versions locked after Publish to SIP".

**Boards:** `5.21-situazione-di-partenza-dopo-create.png`, `5-18.visualizzazione-resume-pannelli-chiusi.png`, `5-18-tags-e-sharing.png`. Open them and compare your markup against the image before closing the task.

- [ ] **Step 2: Closed Offer-details summary (G-08)**

Restructure `.cg-offer-summary` so each fact is an uppercase ~10px muted label **above** a bold ~11.5px value; three groups separated by vertical hairlines; "Edit" vertically centred at the far right of the row (not in flow after the groups). Target: one line and a ~50px card at 1440; wrapping allowed below 1200px with "Edit" still centred.

- [ ] **Step 3: Open Offer details (G-07, G-09…G-12)**

G-07 `.cg-section-title` 15px/800 + larger chevron; G-10 PERIOD and STAGE as boxed/shaded panels with uppercase section labels, labels "Start month"/"End month", every control the same ~36px height (no `form-select-sm` left); G-11 the "Optional · filtered by client" hint under Ratecard; G-09 the Owner row reads `Owner: **{name}**  Created: **{Oct 4, 2026}**` — bold values, long date format — with the Reassign trigger right-aligned. G-12 needs no further work (Task 3's Stage control covers it).

**Boards:** `5.21-…`, `monthlypicker.jpg` (PERIOD panel), `5.15-reassign-dropdown-utenti.png` (Owner row).

- [ ] **Step 4: Run the touched tests**

Run: `npx vitest run js/lib/cg-controls-ui.test.js js/lib/foundations-guard.test.js js/lib/nav-shell-guard.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add costgrid.html css/costgrid.css
git commit -m "style(costgrid): header card and Offer details to the boards (G-01..G-13)"
```

---

### Task 5: Grid and Monthly Phasing (G-14…G-27)

**Files:**
- Modify: `costgrid.html` (`:270-430` grid card, table and rows; phasing card)
- Modify: `css/costgrid.css`

**Interfaces:**
- Consumes: `.cg-btn-secondary` (Task 4), Task 3's day pickers in the task rows.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Drop Bootstrap's `table` class (G-14) and carry its base rules over**

`:281` becomes `<table class="cg-grid mb-0" id="cgGridTable">`. Add to `css/costgrid.css` the only `.table` rules this grid relies on: `border-collapse`, the default cell padding and `vertical-align`, so nothing shifts (Review Focus #1). This is what restores the navy role header, the white name, the muted code and the deep-red missing-rate header.

- [ ] **Step 2: Widths (G-15) and role header (G-16)**

Fixed column `min-width` 280 → **225px** and remove the now-redundant `@media (max-width: 1024px) { .cg-col-fixed { min-width: 220px } }`; Description 240 → **150px**; the four totals columns to ~95/75/50/70px (inline `min-width` on those `th`). Role header: 2-line clamp on the name, one-line ellipsis on the code, the ⋮ as a bordered 24px square button at the cell's top-right; role column `min-width` reduced to match. Target: ≥ 5 role columns visible at 1440 with 10 roles.

- [ ] **Step 3: Chrome and copy (G-17…G-21, G-25)**

"Compact columns" as a toggle switch in the grid-card header (remove the ⊟ from the "Phase / Task" cell, same `compactHeader` state); "Add roles" with a people icon; "Totals by role" / "Hours by role" / "Fees by role"; headings "Total cost & fee", "Pass-through", "Hrs", "Fees", "Description", "Phase / Task", "+ Add task"; phase row "+ Task" as a muted pill with a small grey ✕; the table inside a padded rounded inner frame with its horizontal scrollbar visible.

- [ ] **Step 4: Task rows (G-22…G-24)**

Name → single-line bordered `<input>` (bold); description → borderless 2-line field with **no** resize handle; lock icon inline with the name; "In {project}" as a short grey pill with a link icon, single line, ellipsis; hours cells as bordered boxes with `.cg-cell-filled` bold + darker border and "—" inside the box when empty. Target row height ~65–85px.

- [ ] **Step 5: Hex sweep (G-26) and the phasing bar (G-27)**

Replace every inline hex in the editor region (`#333`, `#444`, `#555`, `#888`, `#93c5fd`, `#e2e8ff`, `#c8d0ee`, `#fff`, `#fcd34d`, `#f8877a`) with tokens or `color-mix()` on them. `.cg-phasing-bar-fill` → `var(--brand-navy)` on the existing `--surface-medium` track.

**Boards for steps 1–5:** `5.17-costgrid-con-task-inseriti.png`, `5.17-costgrid-con-opioni-roles.png`, `5-18.visualizzazione-resume-pannelli-chiusi.png`, `5.18-aggiunta-task-progetto-esistente-monthly-phasing.png`. Open them and compare before closing the task.

- [ ] **Step 6: Run the touched tests**

Run: `npx vitest run js/lib/costgrid-calc.test.js js/lib/cg-controls-ui.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add costgrid.html css/costgrid.css
git commit -m "style(costgrid): grid and phasing to the boards (G-14..G-27)"
```

---

### Task 6: Add-roles modal, guard test, docs, full suite

**Files:**
- Modify: `costgrid.html` (`#cgRoleSelectModal`, `:520-565`)
- Modify: `css/costgrid.css`
- Create: `js/lib/costgrid-guard.test.js`
- Modify: `CLAUDE.md`, `docs/pages/costgrid.md`

**Interfaces:**
- Consumes: `.cg-btn-secondary`.
- Produces: nothing.

- [ ] **Step 1: Restyle `#cgRoleSelectModal` (G-28)**

Same id, same conditions, same handlers (`confirmAddRoles`, `roleModalTeams`, `roleModalSearch`). To `5.16-popu-add-role.png`: header = people SVG + "Add roles" + muted " · {ratecard name or 'None — global rates'}" (and the SVG equivalents for the Change-role / Duplicate titles — **no emoji**); search input with a magnifier, placeholder "Search by name or code"; group filters as pill chips with "All" first and magenta active; rows = checkbox + bold name + muted code + right-aligned rate pill (`135.00 EUR/h`); roles already in the grid disabled with the footer note "Roles already in the grid are disabled."; footer "Cancel" secondary + magenta "Add selected", disabled while nothing is checked.

**Board:** `5.16-popu-add-role.png`. Open it and compare before closing the task.

- [ ] **Step 2: Write the guard test** `js/lib/costgrid-guard.test.js`

Modelled on `js/lib/pipeline-guard.test.js`, over `costgrid.html` from `id="costGridEditorSection"` to the end of the file (so the modals are included) and over `css/costgrid.css`:

```js
it('has no hex colour literals in costgrid.css or the editor region', () => {
  expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  expect(region).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
});
it('has no emoji in the editor region or its modals', () => {
  expect(region).not.toMatch(/\p{Extended_Pictographic}/u);
});
it('costgrid.css and cg-controls.js are loaded, versioned, by costgrid.html only', () => {
  expect(html).toMatch(/css\/costgrid\.css\?v=\d+/);
  expect(html).toMatch(/js\/cg-controls\.js\?v=\d+/);
  others.forEach(f => { expect(read(f)).not.toContain('costgrid.css'); expect(read(f)).not.toContain('cg-controls.js'); });
});
```

- [ ] **Step 3: Run it and fix what it finds**

Run: `npx vitest run js/lib/costgrid-guard.test.js`
Expected: PASS (fix any remaining hex/emoji rather than relaxing the assertion).

- [ ] **Step 4: Documentation**

`CLAUDE.md`: update the `css/costgrid.css` entry (`?v=2`, the controls) and add entries for `js/cg-controls.js` and `js/lib/cg-controls-calc.js`. `docs/pages/costgrid.md`: the fidelity narrative, the three components and their props, G-14's root cause (Bootstrap `.table` specificity) and the deferred portrait-tablet note.

- [ ] **Step 5: Full suite**

Run: `npm test`
Expected: PASS, whole suite (~48 s).

- [ ] **Step 6: Commit**

```bash
git add costgrid.html css/costgrid.css js/lib/costgrid-guard.test.js CLAUDE.md docs/pages/costgrid.md
git commit -m "style(costgrid): Add roles modal to the board, guard test, docs (G-28)"
```

---

### Task 7: Render and compare against the boards

**Files:** none (verification only; any fix found goes into a follow-up commit on the same branch).

**Owner:** the main session — it has `scripts/shoot.mjs` and can read PNGs back. Do not delegate this to an executor without those (PROCESS.md §6.6.3).

- [ ] **Step 1: Static states**

```bash
node scripts/shoot.mjs --url "/costgrid.html?cgId=<populated SIP proposal>" --out shots/cg-sip --widths 1440,1024,768 --full
node scripts/shoot.mjs --url "/costgrid.html?cgId=<empty new Draft>"       --out shots/cg-draft --widths 1440 --full
```
Compare `cg-sip/1440w.png` against `5-18.visualizzazione-resume-pannelli-chiusi.png` and `5.17-costgrid-con-task-inseriti.png`; `cg-draft/1440w.png` against `5.21-situazione-di-partenza-dopo-create.png`.

- [ ] **Step 2: Interactive states via `--eval`**

One run per state, each `--eval` clicking the relevant trigger (`document.querySelector(...).click()`) and awaiting a short delay. Cover: month picker open, day picker open with a Start already set (after a horizontal scroll of the grid — Review Focus #5), Stage list open in Draft, Ratecard list open, Client list open, Reassign popover open, role ⋮ menu, selection mode with mixed free/assigned tasks, Add-roles modal. Compare each against `monthlypicker.jpg`, `5.11`/`5.12`, `5.14`, `5.13`, (no board — Ratecard style expected), `5.15`, `5.17-costgrid-con-opioni-roles`, `5.18-selezione-task-nuovo progetto-1`, `5.16`.

- [ ] **Step 3: Read every PNG back and report**

Each capture is reported as matching, or as a named deviation with a decision (fix now / accept and record). Fixes of a few lines are made directly here with the targeted test re-run — no dedicated subagent (PROCESS.md §6.3).

- [ ] **Step 4: Commit any fixes, then `/finish-cycle`**

---

## Notes for the executor

- `scripts/shoot.mjs` needs `SHOOT_EMAIL`/`SHOOT_PASSWORD` in the gitignored `.env`; do **not** `. ./.env` first.
- A fresh worktree has no `node_modules` and no `.env`: run `npm ci` once and copy `.env` from the main checkout.
- Gate 2's manual list (behaviour, not pixels) is in the spec's §12 — keyboard navigation, End-before-Start, typed dates still saved, Stage/Currency rules, Reassign, Change role / Duplicate from the restyled modal, viewer and locked variants.
