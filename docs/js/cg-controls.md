# js/cg-controls.js + js/lib/cg-controls-calc.js

The custom form controls of the Cost Grid editor (2026-10-07, Cost Grid fidelity cycle). `js/cg-controls.js` (`?v=2`) is loaded only by `costgrid.html`; `js/lib/cg-controls-calc.js` (`?v=1`) holds its pure helpers.

This file holds the full detail for both. `CLAUDE.md`'s File structure entries keep only a short summary plus a pointer; when working on these controls, read this file, not those lines. See `/sync-docs`'s routing rule for where future changes belong. Page side: [docs/pages/costgrid.md](../pages/costgrid.md).

## The three components

Registered on `costgrid.html`'s Vue app the same way `share-list` is:

- **`window.CgDatePicker`** (`<cg-date-picker>`), `mode="month"|"day"`, props `modelValue`/`mode`/`min`/`max`/`disabled`/`placeholder`/`ariaLabel`. Emits `update:modelValue` with `'YYYYMM'` or `'YYYY-MM-DD'`, `''` when cleared, and **nothing** when the typed text is unparseable.
  `min`/`max` are the pickers' only guard against an out-of-order span: each End field is floored by its Start and each Start field capped by its End, so an invalid range cannot be *chosen* — validating a hand-typed one is deliberately left to the "cycle C dates" backlog item.
- **`window.CgSelect`** (`<cg-select>`), props `modelValue`/`options` (`{ value, label, sub?, dot?, disabled?, disabledReason? }`)/`disabled`/`locked`/`lockedTitle`/`searchable`/`placeholder`/`ariaLabel`.
- **`window.CgPeoplePicker`** (`<cg-people-picker>`), props `people`/`currentId`/`disabled`/`footerNote`/`label`, emits `select` with the chosen id.

They hold no business logic — the page's existing `onHeaderFieldChange`/`onPipelineChange`/`onClientChange`/`onRatecardChange`/`onCurrencyChange`/`onTaskDateChange` handlers run unchanged through thin adapter methods.

## Popovers

`<Teleport to="body">` + fixed position from the trigger's `getBoundingClientRect()`, recomputed on scroll/resize — the same mechanism as the role ⋮ menu, so a picker opened inside the horizontally scrolling grid is not clipped.

Both popovers take focus when opened with no text field to hold it (the listbox itself, or the calendar's selected cell when opened from the calendar button): they are teleported to `<body>`, so Tab order never walks into them and their keydown handlers would otherwise be unreachable.

## Binding rule (a real bug, not a style note)

**In-DOM templates lowercase attribute names, so the event must be bound as `@update:model-value`** (hyphenated). And `v-model` must not be combined with an explicit `@update:modelValue` — Vue's `emit()` finds only the first match.

## Pure helpers (`js/lib/cg-controls-calc.js`)

Vitest-covered (`cg-controls-calc.test.js`): `monthGridYear`, `dayGridMonth` (Monday-first, 6×7, `{ iso, day, disabled, inRange, isToday }`), `parseItDate`/`formatItDate`, `parseMonthInput`/`formatMonthInput`, plus `monthLabel` (bridged as `window.cgMonthLabel`). All date arithmetic uses `Date.UTC` only.
