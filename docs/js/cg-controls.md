# js/cg-controls.js + js/lib/cg-controls-calc.js

The custom form controls first built for the Cost Grid editor (2026-10-07, Cost Grid fidelity cycle). `js/cg-controls.js` is loaded by `costgrid.html`, and since 2026-10-24 (dates C2) also by `project-config.html` and `portfolio.html` for the date picker; `js/lib/cg-controls-calc.js` holds its pure helpers; the styles are in `css/controls.css`.

This file holds the full detail for both. `CLAUDE.md`'s File structure entries keep only a short summary plus a pointer; when working on these controls, read this file, not those lines. See `/sync-docs`'s routing rule for where future changes belong. Page side: [docs/pages/costgrid.md](../pages/costgrid.md).

## The three components

Registered on each page's Vue app the same way `share-list` is (`.component('cg-date-picker', window.CgDatePicker)`):

- **`window.CgDatePicker`** (`<cg-date-picker>`), `mode="month"|"day"`, props `modelValue`/`mode`/`min`/`max`/`disabled`/`placeholder`/`ariaLabel`/`inlinePopover`. Emits `update:modelValue` with `'YYYYMM'` or `'YYYY-MM-DD'`, `''` when cleared, and **nothing** when the typed text is unparseable.
  The text shown and typed is `Dec 1, 2025` / `Dec 2025` (default placeholders too), produced and parsed only by `js/lib/dates.js` through `parseDateInput`; an out-of-range value shows `Must be on or after …`/`… before …` under the field. The `modelValue` watcher also clears a shown error (B-137). `min`/`max` floor each End by its Start and cap each Start by its End.
- **`window.CgSelect`** (`<cg-select>`), props `modelValue`/`options` (`{ value, label, sub?, dot?, disabled?, disabledReason? }`)/`disabled`/`locked`/`lockedTitle`/`searchable`/`placeholder`/`ariaLabel`.
- **`window.CgPeoplePicker`** (`<cg-people-picker>`), props `people`/`currentId`/`disabled`/`footerNote`/`label`, emits `select` with the chosen id.

They hold no business logic — the page's existing `onHeaderFieldChange`/`onPipelineChange`/`onClientChange`/`onRatecardChange`/`onCurrencyChange`/`onTaskDateChange` handlers run unchanged through thin adapter methods.

## Popovers

By default, `<Teleport to="body">` + fixed position from the trigger's `getBoundingClientRect()`, recomputed on scroll/resize — the same mechanism as the role ⋮ menu, so a picker opened inside the horizontally scrolling grid is not clipped.

Both popovers take focus when opened with no text field to hold it (the listbox itself, or the calendar's selected cell when opened from the calendar button): they are teleported to `<body>`, so Tab order never walks into them and their keydown handlers would otherwise be unreachable.

**Inline mode (`inline-popover`, 2026-10-24).** Used by the portfolio Period menu's Custom range, which lives in a Bootstrap dropdown with `data-bs-auto-close="outside"`: a teleported calendar would count as "outside" and its clicks would close the menu, and Popper's `transform` on `.dropdown-menu` would misplace a fixed popover. With the prop, the Teleport is disabled, the calendar renders inside `.cg-ctl` with class `cg-pop--inline` (`position: absolute`, right-aligned; the portfolio anchors the From field's left), and `cgReposition` is skipped. Bootstrap's dropdown keydown handler runs in the capture phase on `document`, so a `window` capture listener (`_cgInlineKeys`, inline mode only, while the calendar is open) keeps Esc (from the grid or the input: reverts typed text, closes only the calendar) and ArrowUp/ArrowDown (routed to `onGridKey`) from reaching it. Known limits are in `docs/BACKLOG.md`.

## Binding rule (a real bug, not a style note)

**In-DOM templates lowercase attribute names, so the event must be bound as `@update:model-value`** (hyphenated). And `v-model` must not be combined with an explicit `@update:modelValue` — Vue's `emit()` finds only the first match.

## Pure helpers (`js/lib/cg-controls-calc.js`)

Vitest-covered (`cg-controls-calc.test.js`): `monthGridYear`, `dayGridMonth` (Monday-first, 6×7, `{ iso, day, disabled, inRange, isToday }`), plus `monthLabel` (bridged as `window.cgMonthLabel`). All date arithmetic uses `Date.UTC` only.
