# Derive/Reforecast Rounding Consistency Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared `distributeHoursExact()` function (largest-remainder rounding, guaranteed-exact sum) to `js/lib/cfg-parse.js`, and wire it into both `cfgDerivePhasing` and `cfgReforecast` in `js/config-form.js`, eliminating the audit's F2-2 (Derive round-trip lossy save) and F2-3 (Reforecast per-month independent-rounding drift) findings — both are the same root cause: a distribution computed at fine precision but discovered/rounded uncontrolled after the fact, instead of producing the final, exact-sum result before it ever reaches the DOM.

**Architecture:** One new pure, testable function (largest-remainder distribution) in the existing `js/lib/cfg-parse.js` module (same pattern as `roundToQuarterHour`/`cfgFmtHours`), test-first. Two callers in `js/config-form.js` are each modified to call it once, replacing their own independent per-month rounding — Reforecast needs only its final rounding step replaced; Derive needs a small internal restructuring (accumulate raw values during its existing loop, compute the exact total after the loop, call the new function once) to avoid recreating the "two sources of truth" pattern this fix removes.

**Tech Stack:** Vanilla JS, vitest for pure-function characterization tests (no jsdom needed for `distributeHoursExact` itself — it has no DOM dependency).

## Global Constraints

- `distributeHoursExact(total, rawValues, grid = 0.25)` lives in `js/lib/cfg-parse.js`, exported and bridged to `window.distributeHoursExact`, same pattern as the existing `cfgParseHours`/`roundToQuarterHour`/`cfgFmtHours`.
- Validation, no silent failures: any `rawValues` entry `< 0` throws an `Error`; `|Σ rawValues − total| > 0.05` throws an `Error` reporting both values.
- Algorithm: round `total` to `grid` first (`Math.round(total / grid) * grid`, a generalization of `roundToQuarterHour`'s formula — this is where the 0.4-fraction edge case is handled: `roundToQuarterHour(0.4) = 0.5`); floor each raw value to `grid`; give one `grid`-sized bump each to the `stepsNeeded` containers with the largest remainder; tie-break by container key **ascending**, via an explicit sort over `Object.entries()` — never by relying on native object key iteration order (which happens to already sort `YYYYMM`-style integer-like keys ascending in modern JS engines, but `distributeHoursExact` is a generic utility and must not depend on that incidental behavior).
- Sold hours (the original values in {integers, 0.25, 0.4, 0.75}) are never altered by this fix — only how the derived `planning` field is rounded when Derive/Reforecast populate it.
- Budget/phasing (currency) rounding is untouched in both callers — the audit found no drift there; this fix's scope is the hours/`planning` grid only.
- No further extraction of `cfgDerivePhasing`/`cfgReforecast` into `js/lib/` in this cycle (confirmed during brainstorming) — they remain DOM-coupled classic-script functions; caller correctness is verified by careful code reading during task review plus manual browser verification, not a jsdom harness.
- Test-first: every characterization test is written and confirmed against **today's** behavior before any implementation change.
- Single branch, single `/finish-cycle` run at the end, after both fixes are done (not one per bug).

---

### Task 1: `distributeHoursExact()` — characterization tests, then implementation

**Files:**
- Modify: `js/lib/cfg-parse.js`
- Modify: `js/lib/cfg-parse.test.js`

**Interfaces:**
- Produces: `distributeHoursExact(total: number, rawValues: {[key: string]: number}, grid: number = 0.25) => {[key: string]: number}`, exported from `js/lib/cfg-parse.js` and bridged to `window.distributeHoursExact`. Consumed by Task 2 (Reforecast) and Task 3 (Derive).

- [ ] **Step 1: Write the failing characterization tests**

Append to `js/lib/cfg-parse.test.js` (add the import and the new `describe` block; the existing `import` line becomes):

```js
import { cfgParseHours, roundToQuarterHour, cfgFmtHours, distributeHoursExact } from './cfg-parse.js';
```

Then append this block at the end of the file:

```js
describe('distributeHoursExact', () => {
  it('REG-15: Reforecast 7.4h/3-month residual sums exactly to the rounded total (audit F2-3 traced case)', () => {
    // Today's bug: 7.4/3 = 2.46667 each, roundToQuarterHour → 2.5 each, sum 7.5 ≠ 7.4 (drift).
    // distributeHoursExact must guarantee the sum equals roundToQuarterHour(7.4) = 7.5 by construction,
    // not by accident — every distributed value must be grid-aligned and the total must reconcile.
    const raw = { '202601': 7.4 / 3, '202602': 7.4 / 3, '202603': 7.4 / 3 };
    const result = distributeHoursExact(7.4, raw);
    const sum = Object.values(result).reduce((s, v) => s + v, 0);
    expect(sum).toBe(7.5);
    Object.values(result).forEach(v => {
      expect(v % 0.25).toBeCloseTo(0, 10);
    });
  });

  it('REG-16: Derive 2.4h/3-month real day-overlap fractions sum exactly to the rounded total (audit F2-2 traced case)', () => {
    // Task 2026-01-01..2026-03-31 (31+28+31=90 days, 2026 not a leap year), 2.4h split by day-overlap.
    // These are the RAW (pre-rounding) values — not the already-degraded {0.8, 0.7, 0.8} (summing to 2.3)
    // that today's buggy code produces after its own Math.round(hours*10)/10.
    const raw = {
      '202601': 2.4 * 31 / 90,
      '202602': 2.4 * 28 / 90,
      '202603': 2.4 * 31 / 90,
    };
    const result = distributeHoursExact(2.4, raw);
    expect(result).toEqual({ '202601': 1, '202602': 0.75, '202603': 0.75 });
    const sum = Object.values(result).reduce((s, v) => s + v, 0);
    expect(sum).toBe(2.5);
  });

  it('handles a total with a 0.4 fraction explicitly (sold-hours set edge case)', () => {
    const result = distributeHoursExact(0.4, { '202601': 0.4 });
    expect(result).toEqual({ '202601': 0.5 });
  });

  it('throws when the sum of rawValues diverges from total beyond the 0.05 epsilon', () => {
    expect(() => distributeHoursExact(7.4, { '202601': 2, '202602': 2, '202603': 1 }))
      .toThrow(/7\.4/);
  });

  it('throws when a rawValues entry is negative', () => {
    expect(() => distributeHoursExact(5, { '202601': -1, '202602': 6 }))
      .toThrow(/202601/);
  });

  it('never gives a bump to a zero-value container when others have positive remainders', () => {
    const result = distributeHoursExact(2.5, { '202601': 2.5, '202602': 0 });
    expect(result['202602']).toBe(0);
  });

  it('breaks remainder ties by container key ascending, deterministically', () => {
    // Both containers have the same raw value (0.30), so an identical remainder (0.05)
    // after flooring to the 0.25 grid — an exact tie. floorSum = 0.25+0.25 = 0.5;
    // roundToQuarterHour(0.63) = 0.75 (0.63*4=2.52, round=3, /4=0.75), so exactly one
    // grid-step bump is needed ((0.75-0.5)/0.25 = 1) and the tie-break must pick a single
    // winner. 0.63 is within the 0.05 epsilon of the raw sum (0.60), so this does not throw.
    const result = distributeHoursExact(0.63, { '202603': 0.30, '202601': 0.30 });
    expect(result).toEqual({ '202601': 0.5, '202603': 0.25 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: `distributeHoursExact` tests FAIL with an error like "distributeHoursExact is not defined" or "is not a function" (the function doesn't exist yet). The pre-existing `cfgParseHours`/`roundToQuarterHour`/`cfgFmtHours` tests still pass.

- [ ] **Step 3: Implement `distributeHoursExact`**

In `js/lib/cfg-parse.js`, add this function after `cfgFmtHours` (before the `window.*` bridge lines):

```js
export function distributeHoursExact(total, rawValues, grid = 0.25) {
  const keys = Object.keys(rawValues);

  keys.forEach(key => {
    if (rawValues[key] < 0) {
      throw new Error(`distributeHoursExact: negative rawValues entry for "${key}" (${rawValues[key]})`);
    }
  });

  const rawSum = keys.reduce((s, key) => s + rawValues[key], 0);
  if (Math.abs(rawSum - total) > 0.05) {
    throw new Error(
      `distributeHoursExact: sum of rawValues (${rawSum}) diverges from total (${total}) by more than 0.05`
    );
  }

  const roundedTotal = Math.round(total / grid) * grid;

  const entries = keys.map(key => {
    const raw = rawValues[key];
    const floorValue = Math.floor(raw / grid) * grid;
    const remainder = raw - floorValue;
    return { key, floorValue, remainder };
  });

  const floorSum = entries.reduce((s, e) => s + e.floorValue, 0);
  const stepsNeeded = Math.round((roundedTotal - floorSum) / grid);

  entries.sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  const result = {};
  entries.forEach((e, i) => {
    result[e.key] = i < stepsNeeded ? Math.round((e.floorValue + grid) * 1e10) / 1e10 : e.floorValue;
  });
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests in `js/lib/cfg-parse.test.js` PASS, including the new `distributeHoursExact` block (7+ tests), with no change to the existing `cfgParseHours`/`roundToQuarterHour`/`cfgFmtHours` tests.

- [ ] **Step 5: Add the `window.*` bridge**

In `js/lib/cfg-parse.js`, add this line alongside the existing three bridge lines at the bottom of the file:

```js
window.distributeHoursExact = distributeHoursExact;
```

- [ ] **Step 6: Commit**

```bash
git add js/lib/cfg-parse.js js/lib/cfg-parse.test.js
git commit -m "feat(cfg-parse): add distributeHoursExact for exact-sum largest-remainder rounding"
```

---

### Task 2: Wire `distributeHoursExact` into Reforecast (`cfgReforecast`)

**Files:**
- Modify: `js/config-form.js:842-856`

**Interfaces:**
- Consumes: `distributeHoursExact(total, rawValues, grid)` from Task 1, via the `window.distributeHoursExact` bridge (this file is a classic, non-module script, per `CLAUDE.md`'s "Script loading order" section — `cfg-parse.js` is loaded as a `type="module"` script and always executes before `DOMContentLoaded`, so the bridged global is available by the time `cfgReforecast` runs, which only happens in response to a user click well after page load).
- Produces: nothing new for later tasks — this is the second-to-last task before final verification.

**Known edge case, deliberately left unguarded (confirmed via brainstorming):** when the over-consumption cap (`hrsScale`, `config-form.js:791`) is active for at least one task, `remainingHours` (computed from unscaled `pastHrsTotal`) can diverge from the true sum of raw future-month values (built from scaled past contributions internally). This is a pre-existing inconsistency in the codebase, outside the audit's traced scope (which used a zero-past-actuals case). Rather than add a speculative defensive guard for an untested scenario, this task lets `distributeHoursExact`'s own validation surface the divergence as an explicit error if it's ever hit in practice — consistent with "no silent failures." **Flag this in your task report as a known behavior change to call out during final review**, not something to design around here.

- [ ] **Step 1: Write the failing test — none possible at the caller level (see Global Constraints: no jsdom harness for these callers)**

This task has no automated test step of its own — its correctness is fully covered by Task 1's characterization tests for the underlying function, and is verified in this task's own steps below by careful reading plus a manual trace, not by a new automated test. Proceed directly to the implementation step.

- [ ] **Step 2: Replace the Reforecast rounding block**

In `js/config-form.js`, replace lines 842-856 (from the comment `// Round future months only...` through the `const remainingHours  = totalHours  - pastHrsTotal;` line) with:

```js
  // Round phasing (currency) per month — budget/phasing drift is out of scope for this fix
  Object.keys(newPhasing).forEach(ym => {
    if (!pastYMs.has(ym)) newPhasing[ym] = Math.round(newPhasing[ym] * 100) / 100;
  });

  const pastSpendTotal = Object.values(taskActuals).reduce((s, ta) =>
    s + pastMonths.reduce((ps, ym) => ps + ((ta[ym] || {}).spend || 0), 0), 0);
  const pastHrsTotal = Object.values(taskActuals).reduce((s, ta) =>
    s + pastMonths.reduce((ps, ym) => ps + ((ta[ym] || {}).hours || 0), 0), 0);
  const remainingBudget = totalBudget - pastSpendTotal;
  const remainingHours  = totalHours  - pastHrsTotal;

  // Distribute future months' hours to the exact remaining-hours residual —
  // replaces independent per-month roundToQuarterHour (audit finding F2-3).
  const rawFuturePlanning = {};
  futureMonths.forEach(ym => {
    if (newPlanning[ym] !== undefined) rawFuturePlanning[ym] = newPlanning[ym];
  });
  if (Object.keys(rawFuturePlanning).length > 0) {
    Object.assign(newPlanning, distributeHoursExact(remainingHours, rawFuturePlanning));
  }
```

- [ ] **Step 3: Run the existing test suite to confirm no regression**

Run: `npm test`
Expected: all existing tests still PASS (this change is in `js/config-form.js`, which has no direct vitest coverage of its own — this step confirms the unrelated `js/lib/cfg-parse.test.js` suite is unaffected).

- [ ] **Step 4: Manual trace verification (documented in the task report, not an automated test)**

Using the browser (dev environment per `CLAUDE.md`: `docker compose up`, then `http://localhost`), open a project with a task whose sold hours total 7.4h, no past actuals recorded, and 3 future months in its date range. Run Reforecast. Confirm:
- The confirmation modal's "Remaining hours" reads 7.5 h (not 7.4h, and not silently different from what gets saved).
- After confirming, the planning grid's 3 future-month cells sum to exactly 7.5h (e.g. by reading each cell's displayed value and adding them).
- Save the project, reload the page, and confirm the reloaded planning grid still sums to 7.5h (persisted correctly, no further drift on reload).

Record the exact values observed in the task report.

- [ ] **Step 5: Commit**

```bash
git add js/config-form.js
git commit -m "fix(config-form): Reforecast uses distributeHoursExact, no more per-month drift"
```

---

### Task 3: Wire `distributeHoursExact` into Derive (`cfgDerivePhasing`)

**Files:**
- Modify: `js/config-form.js:626-705`

**Interfaces:**
- Consumes: `distributeHoursExact(total, rawValues, grid)` from Task 1, via the same `window.distributeHoursExact` bridge as Task 2.
- Produces: nothing new for later tasks.

- [ ] **Step 1: No automated test possible at this caller either — same reasoning as Task 2's Step 1.** Proceed directly to implementation.

- [ ] **Step 2: Replace the entire `cfgDerivePhasing` function**

In `js/config-form.js`, replace the complete function body (lines 626-705) with:

```js
function cfgDerivePhasing() {
  const tasks  = cfgReadTasks().filter(t => t.billable !== false);
  const months = cfgGetMonthRange();
  if (!months.length) { alert('Set project dates first.'); return; }

  const cfgStart = month2ym(document.getElementById('cfgStartDate').value);
  const cfgEnd   = month2ym(document.getElementById('cfgEndDate').value);
  const cur      = document.getElementById('cfgCurrency')?.value || '€';

  // Pre-compute new grids — planning hours are accumulated RAW (unrounded) here;
  // the exact final rounding happens once, after this loop, via distributeHoursExact.
  const newPhasing = {}, rawPlanning = {};
  months.forEach(ym => {
    const [y, m]   = [parseInt(ym.slice(0,4)), parseInt(ym.slice(4,6))];
    const mStart   = new Date(y, m-1, 1);
    const mEnd     = new Date(y, m, 0);
    let budget = 0, hours = 0;
    tasks.forEach(task => {
      const taskBudget = task.resources.reduce((s, r) => s + (r.soldHours||0) * (r.hourlyRate||0), 0);
      const taskHours  = task.resources.reduce((s, r) => s + (r.soldHours||0), 0);
      const dist    = task.monthlyDistribution;
      const distSum = dist ? Object.values(dist).reduce((s, v) => s + v, 0) : 0;
      if (dist && Math.abs(distSum - 100) < 0.5) {
        // Use monthly % distribution
        const pct = (dist[ym] || 0) / 100;
        budget += taskBudget * pct;
        hours  += taskHours  * pct;
      } else {
        // Day-proportional distribution
        const tStart = parseTaskDate(task.startDate || cfgStart, false);
        const tEnd   = parseTaskDate(task.endDate   || cfgEnd,   true);
        const tDays  = Math.max(1, (tEnd - tStart) / 86400000 + 1);
        const oStart = new Date(Math.max(mStart, tStart));
        const oEnd   = new Date(Math.min(mEnd,   tEnd));
        const oDays  = Math.max(0, (oEnd - oStart) / 86400000 + 1);
        if (oDays > 0) {
          const frac = oDays / tDays;
          budget += taskBudget * frac;
          hours  += taskHours  * frac;
        }
      }
    });
    if (budget > 0) newPhasing[ym]  = Math.round(budget * 100) / 100;
    if (hours  > 0) rawPlanning[ym] = hours;
  });

  const totalHoursExact = tasks.reduce((s, t) =>
    s + t.resources.reduce((rs, r) => rs + (r.soldHours || 0), 0), 0);
  const newPlanning = totalHoursExact > 0 ? distributeHoursExact(totalHoursExact, rawPlanning) : {};

  const totalBudget = Object.values(newPhasing).reduce((s, v) => s + v, 0);
  const totalHours  = Object.values(newPlanning).reduce((s, v) => s + v, 0);
  const fmtB = n => cfgFmtMoney(n, cur);

  const modalEl = document.getElementById('confirmModal');
  document.getElementById('confirmModalTitle').textContent = '⟳ Derive from task dates';
  document.getElementById('confirmModalMessage').innerHTML = `
    <p class="mb-2">Phasing and planning will be computed from task date ranges, distributing each task's budget proportionally to the days of overlap with each month.</p>
    <ul class="mb-3">
      <li>Total budget distributed: <strong>${fmtB(totalBudget)}</strong> across ${months.length} months</li>
      <li>Total hours distributed: <strong>${totalHours.toLocaleString('en-US')} h</strong></li>
    </ul>
    <p class="mb-0 text-muted small">The current values will be saved as a snapshot for rollback.</p>`;

  const okOld = document.getElementById('confirmModalOk');
  const okBtn = okOld.cloneNode(true);
  okOld.replaceWith(okBtn);

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  let confirmed = false;
  okBtn.addEventListener('click', () => { confirmed = true; modal.hide(); });
  modalEl.addEventListener('hidden.bs.modal', () => {
    if (!confirmed) return;
    cfgSaveReforecastSnapshot();
    cfgRenderPhasingGrid(newPhasing);
    cfgRenderPlanningGrid(newPlanning);
    cfgRebuildAllDistUI();
  }, { once: true });
  modalEl.addEventListener('shown.bs.modal', () => {
    modalEl.style.zIndex = '1200';
    const bd = document.querySelectorAll('.modal-backdrop');
    if (bd.length > 0) bd[bd.length-1].style.zIndex = '1190';
  }, { once: true });
  modal.show();
}
```

- [ ] **Step 3: Run the existing test suite to confirm no regression**

Run: `npm test`
Expected: all tests still PASS.

- [ ] **Step 4: Manual trace verification (documented in the task report)**

Using the browser dev environment, open a project with a task spanning 2026-01-01 to 2026-03-31 with sold hours totaling 2.4h. Run "Derive from task dates". Confirm:
- The confirmation modal's "Total hours distributed" reads 2.5 h (not 2.4h, and not a value that later changes on save).
- After confirming, the planning grid's January/February/March cells read 1.0 / 0.75 / 0.75 (or an equivalent exact-sum-to-2.5 split — the specific per-month split depends on which month has the largest fractional remainder, but the **sum** must be exactly 2.5, matching the modal).
- Save the project, reload the page, confirm the reloaded grid still sums to exactly 2.5h.

Record the exact values observed in the task report.

- [ ] **Step 5: Commit**

```bash
git add js/config-form.js
git commit -m "fix(config-form): Derive uses distributeHoursExact, no more modal/save divergence"
```

---

### Task 4: Final acceptance verification

**Files:**
- No file changes — this task only runs verification and documents results.

**Interfaces:**
- Consumes: the completed Task 1-3 implementation.
- Produces: a documented acceptance record for the finish-cycle report's "What was done" section.

- [ ] **Step 1: Run the full automated test suite one more time**

Run: `npm test`
Expected: all tests in `js/lib/cfg-parse.test.js` PASS (including all `distributeHoursExact` characterization tests from Task 1).

- [ ] **Step 2: Manual end-to-end acceptance trace, including the 0.4-fraction edge case**

In the browser dev environment, using a project with a task whose sold hours are exactly `2.4` (a case with a 0.4-type fraction, per the sold-hours set {integers, 0.25, 0.4, 0.75}):
1. Run Derive from task dates. Confirm the modal total, the grid after save, and the grid after a page reload all show the same total (2.5h, per Task 3's trace).
2. Separately, on a project with a task with 7.4h sold and some actuals loaded (a realistic Reforecast scenario, not the zero-actuals case already covered in Task 2), run Reforecast. Confirm the modal's "Remaining hours", the grid after save, and the grid after reload all agree with each other (no fixed expected number here — the point is internal consistency across all three checkpoints, not a specific value, since actuals data varies).
3. Confirm no browser console errors were thrown during either flow (unless the known over-consumption edge case from Task 2 is deliberately exercised, in which case an explicit thrown error — not a silent wrong number — is the expected and correct outcome).

Document the exact values observed for both traces in the task report — this is the plan's explicit final acceptance criterion from the design spec.

- [ ] **Step 3: No commit for this task** — it is verification-only; proceed to `/finish-cycle` after this task's report is recorded.

---

## Self-Review Notes (completed by the plan author, not a task step)

**Spec coverage:** `distributeHoursExact` with validation (negative rejection, divergence-threshold throw), largest-remainder algorithm with explicit 0.4-total handling, and explicit non-native-order tie-break are all in Task 1. The Reforecast caller change (replacing the per-month rounding loop with one call, reordering `remainingHours` computation ahead of it) is in Task 2. The Derive caller restructuring (raw accumulation during the loop, exact total computed after, single call) is in Task 3, matching the spec's explicit rejection of the lighter alternative. The final acceptance test (known cases including the 0.4 edge case, end-to-end from computation to save, no silent exceptions) is in Task 4. Budget/phasing being out of scope is stated in the Global Constraints and reiterated in both Task 2 and Task 3's replacement code (only the `hours`/`planning` path changes; `Math.round(...*100)/100` on phasing is left untouched in both).

**Placeholder scan:** no TBD/TODO; every step contains complete code, not a description of it. The one open question surfaced during this plan's own writing (the over-consumption `hrsScale` divergence edge case in Reforecast) was resolved explicitly during brainstorming rather than left as a placeholder — Task 2 documents the decision and its rationale inline, and instructs the implementer to flag it again in their task report for final-review visibility, rather than silently absorbing it.

**Type/reference consistency:** `distributeHoursExact(total, rawValues, grid = 0.25)`'s signature is defined once in Task 1 and used identically (same parameter order, same names) in both Task 2 and Task 3's replacement code. `newPlanning`/`newPhasing`/`rawPlanning` variable names are consistent between the two callers' restructured code and the spec's own description. The `window.distributeHoursExact` bridge introduced in Task 1 Step 5 is the exact global both Task 2 and Task 3 rely on (no naming drift).
