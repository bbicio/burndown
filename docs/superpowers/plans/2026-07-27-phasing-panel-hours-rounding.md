# Fix Phasing Panel Hour Rounding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `costgrid.html`'s phasing panel to display exact 2-decimal hour values (matching the app-wide `fmtH()` convention) instead of rounding to the nearest tenth.

**Architecture:** Single-line change reusing an existing global function — no new code, no new abstraction.

**Tech Stack:** Vanilla JS (classic script global), Vue 3 template (`costgrid.html`).

## Global Constraints

- Reuse the existing global `fmtH()` (`js/core.js:297`) — do not reimplement 2-decimal formatting logic (Brief, Constraints).
- Do not change `phasingFmtAmount()` or any other phasing-panel formatter — only `phasingFmtHours()` is in scope (Brief, Constraints).
- Do not touch `cfgFmtHours()` (`js/lib/cfg-parse.js`) or any of its callers (Brief, Constraints).

---

### Task 1: Reuse `fmtH()` in `phasingFmtHours()`

**Files:**
- Modify: `costgrid.html:1102` (`phasingFmtHours` method)

**Interfaces:** None — this is the only task in this plan.

- [ ] **Step 1: Replace the rounding logic with a call to `fmtH()`**

Current code (`costgrid.html:1102`):

```js
    phasingFmtHours(n) { return (Math.round(n * 10) / 10) + ' h'; },
```

Change to:

```js
    phasingFmtHours(n) { return fmtH(n); },
```

`fmtH` (`js/core.js:297`) is already loaded globally via `js/core.js`'s `<script>` tag on `costgrid.html` — no new import needed.

- [ ] **Step 2: Run the test suite**

```bash
npm test
```

Expected: same pass count as before this task (no existing test covers `phasingFmtHours`, since it's a Vue template method in a classic `<script>` block, not a `js/lib/` pure function).

- [ ] **Step 3: Manual verification**

With the app running (`docker compose up`), open a cost grid's editor, then open the "📊 Proposal Phasing" panel for a proposal that has fractional task hours (e.g. a task with 0.25h sold, or a monthly aggregate like 1.333h). Expected: the total-hours summary line and each month's hours row now show exact 2-decimal values (e.g. "0.25h", "1.33h") with no leading space before "h" — not the old rounded-to-tenth format (e.g. "0.3 h").

- [ ] **Step 4: Commit**

```bash
git add costgrid.html
git commit -m "fix(costgrid): phasing panel shows exact 2-decimal hours instead of rounding to the nearest tenth"
```
