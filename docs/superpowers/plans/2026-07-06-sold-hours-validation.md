# Sold-Hours Input Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sold-hours entry (task × role, in both Proposal and Project) accepts only integers or values whose fractional part is exactly `0.25`, `0.5`, or `0.75` — enforced client-side for immediate feedback and server-side as a hard safety net, at the two real editable input points and their two corresponding save endpoints.

**Architecture:** One pure, testable validator function defined once per runtime (frontend: `js/lib/cfg-parse.js`; backend: new `api/src/lib/sold-hours.js`, mirroring the `date-parse.js` pattern from the prior cycle), wired into two client-side input points and two server-side save endpoints. No shared cross-runtime module — frontend and backend are separate runtimes with no natural shared file, consistent with how `distributeHoursExact` (frontend-only) and `parseFlexibleDate` (backend-only) were each handled in the two prior cycles on this audit.

**Tech Stack:** Vanilla JS (frontend), Node.js/Express (backend). `vitest` for the frontend validator's characterization tests (extends the existing `js/lib/cfg-parse.test.js`). `node:test` for the backend validator's tests (new `api/src/lib/sold-hours.test.js`, following the XLS-date-parser cycle's established convention).

## Global Constraints

- Allowed set: integers, or a value whose fractional part (`value - Math.trunc(value)`) is exactly `0.25`, `0.5`, or `0.75` (with a small floating-point epsilon, `1e-9`, consistent with the tolerance style already used in `distributeHoursExact`). **This is a corrected value** — the audit's original brief said `{0.25, 0.4, 0.75}`; confirmed during brainstorming to be a transcription error, corrected to `{0.25, 0.5, 0.75}` (standard quarter-hour granularity).
- Negative values are invalid (existing `min="0"` HTML attributes are the pre-existing safeguard; the validator itself also rejects negatives directly, since server-side validation has no HTML `min` to rely on).
- `0` itself is valid (matches the allowed set's `0` fractional-part entry).
- On an invalid value: reject explicitly with a clear message naming the value and the allowed set — **no automatic rounding or silent correction**, at every one of the four wiring points.
- Only 2 real client-side editable input points exist (confirmed during brainstorming by reading the code — `pipeline.html`/`portfolio.html` are navigation/display only, not editable):
  1. `js/costgrid.js:507` — the cost-grid task/role hours `<input class="cg-hours-input">`.
  2. `js/config-form.js:453` — the project task/resource sold-hours `<input class="cfg-res-hours">`.
- 2 corresponding server-side save endpoints, each persisting the value with zero validation today:
  3. `api/src/routes/cost-grids.js:532`, `PUT /:id/versions/:vId/structure` — persists `task_roles.days` (`numeric(6,2)`, no `CHECK`).
  4. `api/src/routes/projects.js:210`, `PUT /:id/tasks` — persists `project_tasks.resources` (`jsonb`, no schema-level validation possible).
- Server-side validation happens for the **entire** request payload before any database write (matching the whole-request-rejection pattern already established in the XLS date-parser fix) — not per-row skip.
- **Known, accepted limitation, not to be fixed here:** both `js/api-sync.js`'s `_pushProjectToApi()` (project save) and `_cgUpsertVersionToApi()` (cost-grid save) wrap their respective save calls in `try { ... } catch (e) { console.warn(...) }` — a pre-existing, deliberate fire-and-forget architecture used throughout this app's whole in-memory↔API sync layer (per `CLAUDE.md`'s "Data strategy" section), not something introduced by this fix. This means a server-side `400` rejection from either endpoint reaches only the browser console today, not a user-visible message. **This is why client-side validation is the primary, user-facing gate** — it must run and block *before* either `_pushProjectToApi`/`_cgUpsertVersionToApi` is ever invoked, so the server-side check only ever fires as a silent-but-safe data-integrity backstop (e.g. for a hypothetical non-UI API caller), not as this feature's main UX. Do not attempt to fix the console-only swallowing in this plan — out of scope, a pre-existing architectural pattern.
- Out of scope (confirmed during brainstorming): no audit or fix of `roundToQuarterHour`/`cfgFmtHours`/`distributeHoursExact` call sites; no verification/migration of existing DB data; the three queued Resource Planning cycles remain future work.

---

### Task 1: `isValidSoldHours` — frontend, characterization tests then implementation

**Files:**
- Modify: `js/lib/cfg-parse.js`
- Modify: `js/lib/cfg-parse.test.js`

**Interfaces:**
- Produces: `isValidSoldHours(value: number) => boolean` and `SOLD_HOURS_FRACTIONS = [0, 0.25, 0.5, 0.75]`, exported from `js/lib/cfg-parse.js` and bridged to `window.isValidSoldHours`/`window.SOLD_HOURS_FRACTIONS`. Consumed by Task 3 (client wiring, `js/costgrid.js` and `js/config-form.js`).

- [ ] **Step 1: Write the failing characterization tests**

In `js/lib/cfg-parse.test.js`, update the import line at the top of the file:

```js
import { cfgParseHours, roundToQuarterHour, cfgFmtHours, distributeHoursExact, isValidSoldHours } from './cfg-parse.js';
```

Then append this block at the end of the file:

```js
describe('isValidSoldHours', () => {
  it('accepts a whole number', () => {
    expect(isValidSoldHours(5)).toBe(true);
  });

  it('accepts a .25 fraction', () => {
    expect(isValidSoldHours(2.25)).toBe(true);
  });

  it('accepts a .5 fraction', () => {
    expect(isValidSoldHours(3.5)).toBe(true);
  });

  it('accepts a .75 fraction', () => {
    expect(isValidSoldHours(1.75)).toBe(true);
  });

  it('accepts zero', () => {
    expect(isValidSoldHours(0)).toBe(true);
  });

  it('rejects a .4 fraction (not in the allowed set)', () => {
    expect(isValidSoldHours(2.4)).toBe(false);
  });

  it('rejects a .6 fraction (not in the allowed set)', () => {
    expect(isValidSoldHours(2.6)).toBe(false);
  });

  it('rejects a negative value', () => {
    expect(isValidSoldHours(-2.25)).toBe(false);
  });

  it('rejects a non-finite value', () => {
    expect(isValidSoldHours(NaN)).toBe(false);
    expect(isValidSoldHours(Infinity)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: `isValidSoldHours` tests FAIL with an error like "isValidSoldHours is not defined" or "is not a function." The pre-existing `cfgParseHours`/`roundToQuarterHour`/`cfgFmtHours`/`distributeHoursExact` tests still pass.

- [ ] **Step 3: Implement `isValidSoldHours`**

In `js/lib/cfg-parse.js`, add this after the existing `distributeHoursExact` function (before the `window.*` bridge lines):

```js
export const SOLD_HOURS_FRACTIONS = [0, 0.25, 0.5, 0.75];

export function isValidSoldHours(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return false;
  const frac = n - Math.trunc(n);
  return SOLD_HOURS_FRACTIONS.some(f => Math.abs(frac - f) < 1e-9);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests in `js/lib/cfg-parse.test.js` PASS, including the new `isValidSoldHours` block (9 tests), with no change to any pre-existing test.

- [ ] **Step 5: Add the `window.*` bridge**

In `js/lib/cfg-parse.js`, add these two lines alongside the existing bridge lines at the bottom of the file:

```js
window.SOLD_HOURS_FRACTIONS = SOLD_HOURS_FRACTIONS;
window.isValidSoldHours = isValidSoldHours;
```

- [ ] **Step 6: Commit**

```bash
git add js/lib/cfg-parse.js js/lib/cfg-parse.test.js
git commit -m "feat(cfg-parse): add isValidSoldHours for the {int, .25, .5, .75} sold-hours set"
```

---

### Task 2: `isValidSoldHours` — backend, characterization tests then implementation

**Files:**
- Create: `api/src/lib/sold-hours.js`
- Create: `api/src/lib/sold-hours.test.js`

**Interfaces:**
- Produces: `isValidSoldHours(value)` and `SOLD_HOURS_FRACTIONS`, exported from `api/src/lib/sold-hours.js` (CommonJS `module.exports`). Consumed by Task 4 (server wiring, `api/src/routes/cost-grids.js` and `api/src/routes/projects.js`).

- [ ] **Step 1: Write the failing tests**

Create `api/src/lib/sold-hours.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidSoldHours } = require('./sold-hours');

test('accepts a whole number', () => {
  assert.equal(isValidSoldHours(5), true);
});

test('accepts a .25 fraction', () => {
  assert.equal(isValidSoldHours(2.25), true);
});

test('accepts a .5 fraction', () => {
  assert.equal(isValidSoldHours(3.5), true);
});

test('accepts a .75 fraction', () => {
  assert.equal(isValidSoldHours(1.75), true);
});

test('accepts zero', () => {
  assert.equal(isValidSoldHours(0), true);
});

test('rejects a .4 fraction (not in the allowed set)', () => {
  assert.equal(isValidSoldHours(2.4), false);
});

test('rejects a .6 fraction (not in the allowed set)', () => {
  assert.equal(isValidSoldHours(2.6), false);
});

test('rejects a negative value', () => {
  assert.equal(isValidSoldHours(-2.25), false);
});

test('rejects a non-finite value', () => {
  assert.equal(isValidSoldHours(NaN), false);
  assert.equal(isValidSoldHours(Infinity), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && node --test src/lib/sold-hours.test.js`
Expected: FAIL — `Error: Cannot find module './sold-hours'` (the module doesn't exist yet).

- [ ] **Step 3: Implement `sold-hours.js`**

Create `api/src/lib/sold-hours.js`:

```js
const SOLD_HOURS_FRACTIONS = [0, 0.25, 0.5, 0.75];

function isValidSoldHours(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return false;
  const frac = n - Math.trunc(n);
  return SOLD_HOURS_FRACTIONS.some(f => Math.abs(frac - f) < 1e-9);
}

module.exports = { isValidSoldHours, SOLD_HOURS_FRACTIONS };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && npm test`
Expected: all tests PASS across `src/lib/date-parse.test.js` and the new `src/lib/sold-hours.test.js` (`node --test src/**/*.test.js` picks up both — this pure module has no Express/DB dependency, so it also runs standalone via `node --test src/lib/sold-hours.test.js` directly on the bare host, unlike files that `require` route modules).

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/sold-hours.js api/src/lib/sold-hours.test.js
git commit -m "feat(api): add isValidSoldHours for the {int, .25, .5, .75} sold-hours set"
```

---

### Task 3: Wire client-side validation into both input points

**Files:**
- Modify: `js/costgrid.js:969-978` (the `.cg-hours-input` event listener block)
- Modify: `js/config-form.js:1151-1163` (the `saveConfig` function's form-tab branch)

**Interfaces:**
- Consumes: `isValidSoldHours(value)` from Task 1, via the `window.isValidSoldHours` bridge (both files are classic, non-module scripts, per `CLAUDE.md`'s "Script loading order" section — `cfg-parse.js` is loaded as a `type="module"` script that always executes before `DOMContentLoaded`, and both wiring points below only run inside event handlers/async functions invoked well after page load, so the bridged global is always available).
- Produces: nothing new for later tasks.

- [ ] **Step 1: No automated test for this step — manual verification only**

Both wiring points are DOM-coupled (event listeners, `alert()` calls) — testing them would require a heavy jsdom harness disproportionate to the risk, consistent with how `cfgDerivePhasing`/`cfgReforecast`'s DOM-coupled wiring was handled in the prior rounding-fix cycle. The underlying validator (`isValidSoldHours`) is already fully unit-tested in Task 1. Proceed directly to the implementation steps; manual verification happens in Step 4 below.

- [ ] **Step 2: Add a blur-validation handler in `js/costgrid.js`**

In `js/costgrid.js`, immediately after the existing `.cg-hours-input` `input`-event block (currently lines 969-978):

```js
  body.querySelectorAll('.cg-hours-input').forEach(inp =>
    inp.addEventListener('input', e => {
      const task = cgFindTask(e.target.dataset.phase, e.target.dataset.task);
      if (!task) return;
      const val = parseFloat(e.target.value) || 0;
      if (val > 0) task.hours[e.target.dataset.role] = val;
      else delete task.hours[e.target.dataset.role];
      cgRefreshTotals(); cgScheduleAutoSave();
    })
  );
```

add this new block right after it:

```js
  body.querySelectorAll('.cg-hours-input').forEach(inp =>
    inp.addEventListener('blur', e => {
      const val = parseFloat(e.target.value) || 0;
      if (val > 0 && !isValidSoldHours(val)) {
        alert(`Invalid sold hours "${val}". Allowed values: whole numbers, or with a fraction of .25, .5, or .75.`);
        const task = cgFindTask(e.target.dataset.phase, e.target.dataset.task);
        if (task) delete task.hours[e.target.dataset.role];
        e.target.value = '';
        cgRefreshTotals(); cgScheduleAutoSave();
      }
    })
  );
```

- [ ] **Step 3: Add a pre-save validation check in `js/config-form.js`**

In `js/config-form.js`'s `saveConfig` function, find this block (currently lines 1151-1163):

```js
    if (cfgActiveTab === 'form') {
      if (cfgProjectIdx >= 0) cfgSaveCurrentToState();
      // Warn if active project has tasks but no phasing configured
      if (cfgProjectIdx >= 0) {
        const editedProj = cfgEditConfig.projects[cfgProjectIdx];
        if (editedProj) {
          const hasBillable = (editedProj.tasks || []).some(t => t.billable !== false && (t.resources || []).length);
          const phasingEmpty = !Object.values(editedProj.phasing || {}).some(v => v > 0);
          if (hasBillable && phasingEmpty) {
            if (!window.confirm('The budget phasing for this project is empty — no monthly budget is configured.\n\nSave anyway?')) return;
          }
        }
      }
```

Replace it with (adding the new validation check right after `cfgSaveCurrentToState()`, before the existing phasing-empty warning):

```js
    if (cfgActiveTab === 'form') {
      if (cfgProjectIdx >= 0) cfgSaveCurrentToState();
      // Reject an explicit save if any sold-hours value is outside the allowed set —
      // no automatic rounding, the user must correct it before the save proceeds.
      if (cfgProjectIdx >= 0) {
        const editedProj = cfgEditConfig.projects[cfgProjectIdx];
        if (editedProj) {
          for (const task of (editedProj.tasks || [])) {
            for (const r of (task.resources || [])) {
              if (r.soldHours && !isValidSoldHours(r.soldHours)) {
                alert(`Invalid sold hours "${r.soldHours}" for role "${r.role}" on task "${task.name}". Allowed values: whole numbers, or with a fraction of .25, .5, or .75.`);
                return;
              }
            }
          }
        }
      }
      // Warn if active project has tasks but no phasing configured
      if (cfgProjectIdx >= 0) {
        const editedProj = cfgEditConfig.projects[cfgProjectIdx];
        if (editedProj) {
          const hasBillable = (editedProj.tasks || []).some(t => t.billable !== false && (t.resources || []).length);
          const phasingEmpty = !Object.values(editedProj.phasing || {}).some(v => v > 0);
          if (hasBillable && phasingEmpty) {
            if (!window.confirm('The budget phasing for this project is empty — no monthly budget is configured.\n\nSave anyway?')) return;
          }
        }
      }
```

- [ ] **Step 4: Manual verification (documented in the task report, not an automated test)**

Using the browser dev environment (`docker compose up`, then `http://localhost`):
1. Open `costgrid.html` for an existing proposal. Type `2.4` into a task/role hours cell, then click/tab away (blur). Confirm an alert appears naming `2.4` and the allowed set, and the cell is cleared (the value was not saved into `task.hours`).
2. In the same editor, type `2.5` into a cell, blur. Confirm no alert, the value persists normally.
3. Open `project-config.html` for an existing project. Set a resource's sold hours to `2.6`, click the page's Save button. Confirm an alert appears naming `2.6` and the allowed set, the save is aborted (page does not navigate/close), and no API call for tasks was made (check the browser Network tab, or confirm via `docker exec pdash-db psql -U pdash -d pdash -c "SELECT resources FROM project_tasks WHERE project_id = '<id>'"` that the stored value is unchanged).
4. In the same form, set sold hours to `2.75`, Save. Confirm the save proceeds normally.

Record the exact values observed in the task report.

- [ ] **Step 5: Commit**

```bash
git add js/costgrid.js js/config-form.js
git commit -m "fix(client): reject sold-hours values outside {int, .25, .5, .75}"
```

---

### Task 4: Wire server-side validation into both save endpoints, and final acceptance

**Files:**
- Modify: `api/src/routes/cost-grids.js:539` (insert validation before the transaction in `PUT /:id/versions/:vId/structure`)
- Modify: `api/src/routes/projects.js:216` (insert validation before any DB write in `PUT /:id/tasks`)

**Interfaces:**
- Consumes: `isValidSoldHours(value)` from Task 2, via `require('../lib/sold-hours')`.
- Produces: nothing new for later tasks — this is the plan's final task.

- [ ] **Step 1: No automated test for this step — manual verification only, per the approved spec**

Same reasoning as the XLS-date-parser cycle's whole-upload-rejection task: these are Express route handlers with DB persistence; the underlying validator is already fully unit-tested in Task 2. Proceed directly to the implementation steps.

- [ ] **Step 2: Add the require and validation loop to `api/src/routes/cost-grids.js`**

Add this require near the top of the file, alongside the other requires:

```js
const { isValidSoldHours } = require('../lib/sold-hours');
```

In the `PUT /:id/versions/:vId/structure` handler, find this line (currently line 539):

```js
  const { phases = [], roles: rolesBody = [] } = req.body;
```

Immediately after it (and before the `roleByCode`/`rateByCode` setup that follows), insert:

```js
  // Reject the whole request — no partial writes — if any role's sold hours
  // fall outside the allowed set. No automatic rounding.
  for (const ph of phases) {
    for (const tk of (ph?.tasks || [])) {
      if (tk?.hours && typeof tk.hours === 'object') {
        for (const [code, days] of Object.entries(tk.hours)) {
          if (!isValidSoldHours(days)) {
            return res.status(400).json({
              error: `Invalid sold hours "${days}" for role "${code}" in task "${tk.taskName || tk.title || ''}". Allowed values: whole numbers, or with a fraction of .25, .5, or .75.`,
            });
          }
        }
      }
      for (const tr of (tk?.roles || [])) {
        if (tr?.days != null && !isValidSoldHours(tr.days)) {
          return res.status(400).json({
            error: `Invalid sold hours "${tr.days}" in task "${tk.taskName || tk.title || ''}". Allowed values: whole numbers, or with a fraction of .25, .5, or .75.`,
          });
        }
      }
    }
  }
```

- [ ] **Step 3: Add the require and validation loop to `api/src/routes/projects.js`**

Add this require near the top of the file, alongside the other requires:

```js
const { isValidSoldHours } = require('../lib/sold-hours');
```

In the `PUT /:id/tasks` handler, find this line (currently line 216):

```js
    if (!Array.isArray(tasks)) return res.status(400).json({ error: 'Body must be an array' });
```

Immediately after it (and before the `DELETE FROM project_tasks` that follows), insert:

```js
    // Reject the whole request — no partial writes — if any resource's sold
    // hours fall outside the allowed set. No automatic rounding.
    for (const t of tasks) {
      for (const r of (t?.resources || [])) {
        if (r?.soldHours != null && !isValidSoldHours(r.soldHours)) {
          return res.status(400).json({
            error: `Invalid sold hours "${r.soldHours}" for role "${r.role || ''}" on task "${t.name || ''}". Allowed values: whole numbers, or with a fraction of .25, .5, or .75.`,
          });
        }
      }
    }
```

- [ ] **Step 4: Run the full automated test suite**

Run: `npm test` (frontend, from repo root) and `docker exec pdash-api node --test src/lib/date-parse.test.js src/lib/sold-hours.test.js src/routes/timesheets.test.js` (backend, via the container per the established convention since `timesheets.test.js` requires Express).
Expected: all tests PASS — frontend `js/lib/cfg-parse.test.js` (now including `isValidSoldHours`), backend `date-parse.test.js` + `sold-hours.test.js` + `timesheets.test.js`.

- [ ] **Step 5: Manual end-to-end acceptance trace, including the server-side safety net**

Using `curl` against the running dev stack (same approach as the XLS-date-parser cycle's manual verification, exercising the exact HTTP+DB path):
1. `PUT /api/cost-grids/:id/versions/:vId/structure` with a payload containing one role's `hours` set to `2.4` → confirm `400` naming the role/task and the allowed set; confirm via `docker exec pdash-db psql` that no `task_roles` rows were written for that version (the whole request was rejected, not just the bad role).
2. `PUT /api/projects/:id/tasks` with a payload containing one resource's `soldHours` set to `2.6` → confirm `400` naming the task/role; confirm via `psql` that `project_tasks` for that project is unchanged (no partial write).
3. Repeat both with only valid values (e.g. `2.5`, `2.75`) → confirm `200`/success and the values are persisted correctly, exactly as before this fix (no regression to the common case).

Document the exact requests/responses and DB query results in the task report — this is the plan's explicit final acceptance criterion.

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/cost-grids.js api/src/routes/projects.js
git commit -m "fix(api): reject sold-hours values outside {int, .25, .5, .75}"
```

---

## Self-Review Notes (completed by the plan author, not a task step)

**Spec coverage:** the corrected allowed set ({0.25, 0.5, 0.75}, not the original brief's {0.25, 0.4, 0.75}) is stated verbatim in the Global Constraints and used identically in both Task 1 and Task 2's implementations. The 2-real-input-points scope correction (not 4) is reflected in Task 3 touching exactly `costgrid.js` and `config-form.js`, and Task 4 touching exactly `cost-grids.js` and `projects.js` — no unnecessary changes to `pipeline-board.js`/`portfolio.js`. The "reject explicitly, no silent rounding" requirement is implemented identically at all four wiring points (Tasks 3-4). The "whole-request rejection, not partial" requirement for server-side validation is implemented in both Task 4 endpoints, validating the entire payload before touching the transaction/DB. The known, accepted `console.warn`-swallowing limitation in `_pushProjectToApi`/`_cgUpsertVersionToApi` is documented in the Global Constraints as a reason client-side validation is the primary gate, and is explicitly not touched by any task.

**Placeholder scan:** no TBD/TODO; every step contains complete, runnable code, not a description of it.

**Type/reference consistency:** `isValidSoldHours(value)`'s signature and behavior are defined identically in Task 1 (frontend, ES module + `window` bridge) and Task 2 (backend, CommonJS) — same allowed-set constant, same epsilon, same negative/non-finite rejection. Task 3's `js/costgrid.js` and `js/config-form.js` wiring both call `isValidSoldHours` exactly as Task 1 exports it (via the `window` bridge, consistent with the file's classic-script, non-module nature). Task 4's `cost-grids.js`/`projects.js` wiring both `require('../lib/sold-hours')` exactly as Task 2 exports it.
