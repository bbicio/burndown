# XLS Timesheet Date Parser Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix audit finding F1-1 — `formatDate()` in `api/src/routes/timesheets.js` no longer assumes DD/MM/YYYY unconditionally for text-formatted date cells. A new pure module, `api/src/lib/date-parse.js`, disambiguates the day/month order deterministically whenever one component is `> 12`, falls back to the known-correct MM/DD default only for genuinely ambiguous cases, and rejects a calendar-invalid result instead of silently passing it through. The upload route aborts the entire file (no partial writes) if any row's date is unparseable.

**Architecture:** One new pure, unit-testable module (`api/src/lib/date-parse.js`, following the same "extract pure logic for testability" principle as the frontend's `js/lib/`) plus two small integration points in the existing `api/src/routes/timesheets.js`: swap the regex branch inside `formatDate()` to call the new module, and make the upload loop catch a thrown parse error and reject the whole request before any DB write. Since the backend has no existing pure-function unit-test convention, this plan introduces `node --test` (Node's built-in runner, zero new dependency) scoped to `api/src/`.

**Tech Stack:** Plain Node.js (no new dependencies). `node:test` + `node:assert/strict` for unit tests, run via `node --test` (Node 18+; confirmed available locally at v24.16.0).

## Global Constraints

- New module: `api/src/lib/date-parse.js`, exporting `parseFlexibleDate(a, b, year)` — pure function, no I/O, throws `Error` on any unresolvable or calendar-invalid date.
- Disambiguation algorithm (from the spec, verbatim): if `a > 12` and `b <= 12`, `a` is day and `b` is month (source used DD/MM for this value — detected, not assumed). If `b > 12` and `a <= 12`, symmetric: `b` is day, `a` is month (MM/DD detected). If both `<= 12`, genuinely ambiguous — default to MM/DD (`a`=month, `b`=day), matching the source's known convention. If both `> 12`, no valid interpretation exists — throw.
- Calendar validation must use exact days-in-month/leap-year arithmetic, not `Date`'s auto-correcting constructor (e.g. `new Date(2026, 1, 30)` silently rolls over instead of signaling February has no 30th day).
- `formatDate()`'s native-`Date`-instance branch and already-ISO-string branch are unchanged — only the DD/MM/YYYY regex branch is replaced.
- `formatDate` gains a named export (`module.exports.formatDate = formatDate`, alongside the existing `module.exports = router`) so it is unit-testable directly via `node --test`, without instantiating Express/DB/multer (requiring the file loads those packages, but `pg`'s `Pool` only connects lazily on first query — no live DB needed to call `formatDate`).
- The upload route (`POST /api/timesheets/upload`) rejects the **entire** upload (no partial DB writes) if any row's date throws during parsing — a stricter behavior than the existing "skip rows with a missing D365 Project ID," deliberately, per the spec.
- Scope: **future uploads only** — no retroactive re-verification of data already in the `timesheets` table. No per-upload/per-project date-format configuration (rejected approach). The sold-hours input-validation gap (a separate audit finding) is out of scope for this plan.
- Test scope: `node --test` runs from the `api/` directory; a new `"test": "node --test src"` script is added to `api/package.json` for explicit, discoverable invocation — no change to the existing `vitest` frontend toolchain or its `include` pattern.

---

### Task 1: `parseFlexibleDate` — characterization tests, then implementation

**Files:**
- Create: `api/src/lib/date-parse.js`
- Create: `api/src/lib/date-parse.test.js`
- Modify: `api/package.json` (add a `test` script)

**Interfaces:**
- Produces: `parseFlexibleDate(a, b, year) => string` (ISO `YYYY-MM-DD`), throws `Error` on failure. Exported from `api/src/lib/date-parse.js`. Consumed by Task 2.

- [ ] **Step 1: Write the failing tests**

Create `api/src/lib/date-parse.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFlexibleDate } = require('./date-parse');

test('a > 12, b <= 12: resolves as DD/MM without applying the ambiguous-case default', () => {
  assert.equal(parseFlexibleDate(25, 3, 2026), '2026-03-25');
});

test('b > 12, a <= 12: resolves as MM/DD without applying the ambiguous-case default', () => {
  assert.equal(parseFlexibleDate(3, 25, 2026), '2026-03-25');
});

test('both a and b <= 12: resolves via the MM/DD default (a=month, b=day)', () => {
  assert.equal(parseFlexibleDate(3, 4, 2026), '2026-03-04');
});

test('both a and b > 12: no valid interpretation exists, throws', () => {
  assert.throws(() => parseFlexibleDate(13, 14, 2026), /valid month/i);
});

test('resolvable day/month pair that is calendar-invalid (April has no 31st day) throws', () => {
  // a=31 (>12, so unambiguously the day), b=4 (<=12, the month) -> day 31, month 4 -> invalid
  assert.throws(() => parseFlexibleDate(31, 4, 2026), /valid calendar date/i);
});

test('February 30th (invalid in any year) throws, not silently rolled over to March', () => {
  // a=30 (>12, unambiguously the day), b=2 (the month) -> Feb 30 -> invalid
  assert.throws(() => parseFlexibleDate(30, 2, 2026), /valid calendar date/i);
});

test('leap year: February 29 is valid in 2024', () => {
  assert.equal(parseFlexibleDate(29, 2, 2024), '2024-02-29');
});

test('leap year: February 29 is invalid in 2026 (not a leap year)', () => {
  assert.throws(() => parseFlexibleDate(29, 2, 2026), /valid calendar date/i);
});

test('year 2000 is a leap year (divisible by 400)', () => {
  assert.equal(parseFlexibleDate(29, 2, 2000), '2000-02-29');
});

test('year 1900 is not a leap year (divisible by 100 but not 400)', () => {
  assert.throws(() => parseFlexibleDate(29, 2, 1900), /valid calendar date/i);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && node --test src/lib/date-parse.test.js`
Expected: FAIL — `Error: Cannot find module './date-parse'` (the module doesn't exist yet).

- [ ] **Step 3: Implement `date-parse.js`**

Create `api/src/lib/date-parse.js`:

```js
function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function isValidCalendarDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function parseFlexibleDate(a, b, year) {
  a = Number(a);
  b = Number(b);
  year = Number(year);

  let day, month;
  if (a > 12 && b <= 12) {
    day = a;
    month = b;
  } else if (b > 12 && a <= 12) {
    day = b;
    month = a;
  } else if (a <= 12 && b <= 12) {
    // Genuinely ambiguous — default to the source's known convention, MM/DD.
    month = a;
    day = b;
  } else {
    throw new Error(`neither "${a}" nor "${b}" can be a valid month (both greater than 12)`);
  }

  if (!isValidCalendarDate(year, month, day)) {
    throw new Error(`"${year}-${month}-${day}" is not a valid calendar date`);
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

module.exports = { parseFlexibleDate, isValidCalendarDate, isLeapYear };
```

- [ ] **Step 4: Add the `test` script to `api/package.json`**

In `api/package.json`, add a `"test"` entry to the existing `"scripts"` block (alongside `"start"`, `"dev"`, `"migrate"`):

```json
    "test": "node --test src"
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd api && npm test`
Expected: all 10 tests in `date-parse.test.js` PASS (`# pass 10`, `# fail 0`).

- [ ] **Step 6: Commit**

```bash
git add api/src/lib/date-parse.js api/src/lib/date-parse.test.js api/package.json
git commit -m "feat(api): add parseFlexibleDate for XLS date disambiguation"
```

---

### Task 2: Wire `parseFlexibleDate` into `formatDate`, with regression tests

**Files:**
- Modify: `api/src/routes/timesheets.js:186-198` (the `formatDate` function and the module's final export line)
- Create: `api/src/routes/timesheets.test.js`

**Interfaces:**
- Consumes: `parseFlexibleDate(a, b, year)` from Task 1, via `require('../lib/date-parse')`.
- Produces: `formatDate(val)` exported as a named export (`module.exports.formatDate`) alongside the existing default `module.exports = router`, so Task 3's manual verification and this task's own regression tests can call it directly.

- [ ] **Step 1: Write the failing regression tests**

Create `api/src/routes/timesheets.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatDate } = require('./timesheets');

test('formatDate: native Date instance is unaffected by this change', () => {
  const d = new Date(Date.UTC(2026, 2, 15)); // March 15, 2026
  assert.equal(formatDate(d), '2026-03-15');
});

test('formatDate: already-ISO string is unaffected by this change', () => {
  assert.equal(formatDate('2026-03-15'), '2026-03-15');
});

test('formatDate: null input returns null', () => {
  assert.equal(formatDate(null), null);
});

test('formatDate: empty string input returns null', () => {
  assert.equal(formatDate(''), null);
});

test('formatDate: text cell with day > 12 resolves unambiguously as DD/MM', () => {
  assert.equal(formatDate('25/03/2026'), '2026-03-25');
});

test('formatDate: text cell with month position > 12 resolves unambiguously as MM/DD', () => {
  assert.equal(formatDate('03/25/2026'), '2026-03-25');
});

test('formatDate: text cell genuinely ambiguous (both components <= 12) resolves via the MM/DD default', () => {
  // Previously (DD/MM default) this returned '2026-04-03'; the source is known to export
  // MM/DD/YYYY, so the correct reading is month=03, day=04.
  assert.equal(formatDate('03/04/2026'), '2026-03-04');
});

test('formatDate: calendar-invalid text-cell date throws instead of silently passing through', () => {
  assert.throws(() => formatDate('31/04/2026'), /valid calendar date/i);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && node --test src/routes/timesheets.test.js`
Expected: the ambiguous-default and calendar-invalid tests FAIL against the current code (the ambiguous case currently returns `'2026-04-03'`, not `'2026-03-04'`; the invalid-date case currently returns the string `'2026-04-31'` instead of throwing). The native-Date/ISO/null/empty tests already PASS (they exercise unchanged branches) — that's expected and fine.

- [ ] **Step 3: Replace the regex branch in `formatDate` and add the named export**

In `api/src/routes/timesheets.js`, add this require near the top of the file, after the existing `const { requireAuth } = require('../middleware/auth');` line:

```js
const { parseFlexibleDate } = require('../lib/date-parse');
```

Replace the current `formatDate` function (lines 186-196) with:

```js
function formatDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const s = String(val).trim();
  // already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return parseFlexibleDate(m[1], m[2], m[3]);
  return s;
}
```

Replace the final line of the file, `module.exports = router;`, with:

```js
module.exports = router;
module.exports.formatDate = formatDate;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && npm test`
Expected: all tests in both `src/lib/date-parse.test.js` and `src/routes/timesheets.test.js` PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/timesheets.js api/src/routes/timesheets.test.js
git commit -m "fix(api): formatDate uses parseFlexibleDate, fixes DD/MM/YYYY assumption"
```

---

### Task 3: Reject the whole upload on an unparseable date

**Files:**
- Modify: `api/src/routes/timesheets.js:110-128` (the per-row parsing loop inside `POST /upload`)

**Interfaces:**
- Consumes: `formatDate(val)` (now throwing on invalid dates, from Task 2) — same function, same call site, no new signature.
- Produces: nothing new for later tasks — this is the last code change; Task 4 is verification-only.

- [ ] **Step 1: No automated test for this step — manual verification only (documented in the task report)**

This is an Express route handler with DB persistence; testing it automatically would require the Docker-based `docker compose --profile test run --rm test` suite and `test-api.js`, which per the approved spec is deliberately out of scope for this cycle (manual verification was the agreed approach for this specific route-level behavior — the parsing logic itself is already fully covered by Tasks 1-2's unit tests). Proceed directly to the implementation step.

- [ ] **Step 2: Replace the per-row parsing loop**

In `api/src/routes/timesheets.js`, replace the current loop (originally lines 110-128):

```js
    const grouped = {};
    for (const row of raw) {
      const projectCode = colProjId ? String(row[colProjId] ?? '').trim() : '';
      if (!projectCode) continue;

      const entry = {
        date:        colDate     ? formatDate(row[colDate])          : null,
        role:        colRole     ? String(row[colRole] ?? '').trim() : null,
        owner:       colOwner    ? String(row[colOwner] ?? '').trim(): null,
        hours:       colHours    ? parseFloat(row[colHours]) || 0    : 0,
        task:        colTask     ? String(row[colTask] ?? '').trim() : null,
        notes:       colNotes    ? String(row[colNotes] ?? '').trim(): null,
        projectId:   projectCode,
        projectName: colProjName ? String(row[colProjName] ?? '').trim() : null,
      };

      if (!grouped[projectCode]) grouped[projectCode] = [];
      grouped[projectCode].push(entry);
    }
```

with:

```js
    const grouped = {};
    for (let i = 0; i < raw.length; i++) {
      const row = raw[i];
      const projectCode = colProjId ? String(row[colProjId] ?? '').trim() : '';
      if (!projectCode) continue;

      let date;
      try {
        date = colDate ? formatDate(row[colDate]) : null;
      } catch (err) {
        // Reject the whole file — no partial writes — on any unparseable date.
        // Row numbers are 1-indexed and account for the header row (raw[0] is
        // spreadsheet row 2), matching what a user sees when opening the file.
        return res.status(400).json({
          error: `Invalid date in row ${i + 2}: ${err.message}`,
        });
      }

      const entry = {
        date,
        role:        colRole     ? String(row[colRole] ?? '').trim() : null,
        owner:       colOwner    ? String(row[colOwner] ?? '').trim(): null,
        hours:       colHours    ? parseFloat(row[colHours]) || 0    : 0,
        task:        colTask     ? String(row[colTask] ?? '').trim() : null,
        notes:       colNotes    ? String(row[colNotes] ?? '').trim(): null,
        projectId:   projectCode,
        projectName: colProjName ? String(row[colProjName] ?? '').trim() : null,
      };

      if (!grouped[projectCode]) grouped[projectCode] = [];
      grouped[projectCode].push(entry);
    }
```

This aborts before any `DELETE`/`INSERT` query runs (those happen later, in the `for (const code of codes)` block), so an invalid date never results in a partial write.

- [ ] **Step 3: Run the full test suite to confirm no regression**

Run: `cd api && npm test`
Expected: all tests still PASS (this change doesn't touch `formatDate` itself, only its caller).

- [ ] **Step 4: Manual verification (documented in the task report, not an automated test)**

Using the dev environment (`docker compose up`, then `http://localhost`), on the Timesheets page (`timesheets.html`):
1. Upload a real or crafted XLS file containing one text-formatted date with a day `> 12` (e.g. `25/03/2026`) and confirm the resulting stored date is `2026-03-25` (check via the timesheet list/detail view, or `docker exec pdash-db psql -U pdash -d pdash -c "SELECT data FROM timesheets WHERE project_code = '<code>'"`).
2. Upload a file with a genuinely ambiguous date (e.g. `03/04/2026`) and confirm it resolves to `2026-03-04` (MM/DD reading), not `2026-04-03`.
3. Upload a file with a deliberately invalid date (e.g. `31/04/2026`, April has no 31st) and confirm the **entire upload is rejected** with a 400 response naming the row and the problem — and confirm via the DB query above that no rows for that upload were written at all (not even the valid ones from the same file).

Record the exact requests/responses and DB query results observed in the task report.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/timesheets.js
git commit -m "fix(api): reject entire timesheet upload on any unparseable date"
```

---

### Task 4: Final acceptance verification

**Files:**
- No file changes — this task only runs verification and documents results.

**Interfaces:**
- Consumes: the completed Task 1-3 implementation.
- Produces: a documented acceptance record for the finish-cycle report's "What was done" section.

- [ ] **Step 1: Run the full automated test suite one more time**

Run: `cd api && npm test`
Expected: all tests in `api/src/lib/date-parse.test.js` and `api/src/routes/timesheets.test.js` PASS.

- [ ] **Step 2: Manual end-to-end acceptance trace**

Repeat the three manual scenarios from Task 3 Step 4 (unambiguous day>12, genuinely ambiguous both<=12, calendar-invalid) once more against the fully assembled branch, in the browser dev environment, and additionally confirm:
- A file mixing all three cases in different rows behaves correctly per row (the two valid rows would each resolve correctly if the invalid row weren't present) — but since one row is invalid, confirm the entire file is still rejected (no partial success even when most rows are fine).
- A file with only valid dates (no ambiguity, no invalid dates) uploads successfully exactly as it did before this fix (no regression to the common case).

Document the exact values/responses observed in the task report — this is the plan's explicit final acceptance criterion from the design spec.

- [ ] **Step 3: No commit for this task** — it is verification-only; proceed to `/finish-cycle` after this task's report is recorded.

---

## Self-Review Notes (completed by the plan author, not a task step)

**Spec coverage:** the disambiguation algorithm (both directions of the `>12` check, the ambiguous-case MM/DD default) is in Task 1, with explicit test cases for each branch plus leap-year edge cases (2024 valid, 2026 invalid, 2000 valid via the /400 rule, 1900 invalid via the /100-not-/400 rule) — covers the spec's "leap-year edge case... verified explicitly" requirement precisely. The `formatDate()` integration and named export are in Task 2, with regression tests confirming the untouched native-Date/ISO/null paths still work exactly as before. The whole-upload rejection behavior is in Task 3, matching the spec's "stricter than skip-row" requirement, with the manual-verification approach for it matching what was explicitly agreed during brainstorming (no jsdom-style heavy harness, no Docker/test-api.js automation for this specific behavior). The final acceptance test (Task 4) explicitly checks the "no regression to the common case" requirement that isn't otherwise stated as a discrete spec bullet but is implied by "never silently passing through a malformed or misordered date" — added here to close that gap.

**Placeholder scan:** no TBD/TODO; every step contains complete, runnable code or an explicit, reasoned justification for why a step has no automated test (Task 3 Step 1, matching the spec's own scope decision, not a shortcut invented here).

**Type/reference consistency:** `parseFlexibleDate(a, b, year)`'s signature (three positional numeric-or-numeric-string arguments, returns ISO string, throws `Error`) is defined once in Task 1 and consumed identically in Task 2's `formatDate` replacement (`parseFlexibleDate(m[1], m[2], m[3])`, passing the regex capture groups directly — `Number(a)` etc. inside the function handles the string→number coercion, so passing regex-match strings is correct). `formatDate`'s named export (`module.exports.formatDate`) introduced in Task 2 is the exact name Task 3's manual verification and Task 4's acceptance trace refer to — no drift.
