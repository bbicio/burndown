# Fix Export XLS `ExcelJS is not defined` Bug Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `costgrid.html`'s and `planning.html`'s Export XLS features actually work by loading the `ExcelJS` library both already assume is present.

**Architecture:** Add one CDN `<script>` tag to each page — no code logic changes, since both export functions already call the real `ExcelJS` API correctly.

**Tech Stack:** Vanilla JS (classic `<script>` tag), CDN-hosted third-party library (no build step, no npm install — matches this project's existing pattern for Bootstrap/Vue/`xlsx`).

## Global Constraints

- Only add the CDN `<script>` tag — do not modify `cgExportXls()` (`js/costgrid.js`) or `buildStyledExcelExport()` (`planning.html`) (Brief, Constraints).
- Do not add the tag to `pipeline.html` — confirmed no reachable code path there needs it (Brief, Constraints).
- Do not remove or touch the existing `xlsx@0.18.5` CDN tag on either page — separate, out-of-scope finding (Brief, Constraints).
- Use exactly `https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js` — verified to exist during `/brainstorming` via a live CDN directory listing fetch (design spec, Components).

---

### Task 1: Add the ExcelJS CDN script tag to both pages

**Files:**
- Modify: `costgrid.html:552` (immediately after the existing `xlsx@0.18.5` tag)
- Modify: `planning.html:220` (immediately after the existing `xlsx@0.18.5` tag)

**Interfaces:** None — this is the only task in this plan.

- [ ] **Step 1: Add the script tag to `costgrid.html`**

Current code (`costgrid.html:551-553`):

```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
```

Change to:

```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"></script>
<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
```

- [ ] **Step 2: Add the identical script tag to `planning.html`**

Current code (`planning.html:219-221`):

```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
```

Change to:

```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"></script>
<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
```

- [ ] **Step 3: Run the test suite**

```bash
npm test
```

Expected: same pass count as before this task (136 tests, no existing test covers either export function or script-tag presence).

- [ ] **Step 4: Manual verification**

With the app running (`docker compose up`), open `costgrid.html`'s editor for any cost grid and click "Export XLS" in the toolbar. Expected: a `.xlsx` file downloads with no `alert()` and no console error; open it in a spreadsheet application (or inspect the file) and confirm cell styling (colors, borders, fonts) is present, matching the dark/sand color scheme the code defines.

Then open `planning.html` and click each of the 3 export buttons in turn (Resource Planning view, By Project view, By Owner view). Expected: each downloads a correctly-named, styled `.xlsx` file with no console error.

Then open `pipeline.html` and confirm it still loads and functions normally (sanity check that adding the new script tag to the other two pages didn't affect this untouched page).

- [ ] **Step 5: Commit**

```bash
git add costgrid.html planning.html
git commit -m "fix: load ExcelJS via CDN so Export XLS works on costgrid.html and planning.html"
```
