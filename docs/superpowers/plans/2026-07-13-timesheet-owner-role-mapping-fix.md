# Timesheet Owner/Role Column Mapping Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the XLS timesheet upload so real column headers with surrounding whitespace (e.g. `"Role: Name    "`, `"Owner: Name    "`) resolve correctly instead of causing `role`, `owner`, `hours`, `task`, and `projectId` to all read as empty/zero.

**Architecture:** Add a pure `trimRowKeys(row)` function to `api/src/routes/timesheets.js`, applied once to every parsed row immediately after `XLSX.utils.sheet_to_json`, so every row object's keys are trimmed before `resolveColumnMap`'s (already-trimmed, already-correct) column names are used to look values up in them.

**Tech Stack:** Node.js/Express backend, `node:test` runner (`npm test` from `api/`, per `CLAUDE.md`). No DB schema change, no frontend change.

## Global Constraints

- No change to `resolveColumnMap`'s signature, behavior, or existing tests (`api/src/routes/timesheets.test.js`) — it already receives and returns trimmed strings correctly; verified directly in `/brainstorming` with the real header list.
- No DB migration in this plan — re-uploading the 4 affected source files (project codes `HITA.000001823.001`, `.003`, `HITA.000001586.001`, `HITA.000001201`) is a manual, out-of-band action by the user after this cycle merges, not a plan task (requires the original files, which only the user has).
- No change to `js/planning.js` or any frontend file — the bug and fix are entirely within `api/src/routes/timesheets.js`.
- Real source header list confirmed (`docs/superpowers/specs/2026-07-13-timesheet-owner-role-mapping-fix-design.md`): `Date`, `Job `, `Role: Name    `, `Hour Type    `, `Owner: Name    `, `Hours    `, `Task/Issue    `, `Notes    `, `D365 Project ID    `, `WF Project Name` — every header except `Date` and `WF Project Name` has trailing whitespace.

---

## File Structure

- Modify: `api/src/routes/timesheets.js` — add `trimRowKeys`, apply it to parsed rows, simplify the now-redundant re-trim of `sampleKeys`, export `trimRowKeys` alongside the existing `resolveColumnMap`/`formatDate` exports.
- Modify: `api/src/routes/timesheets.test.js` — add `trimRowKeys` unit tests and the real-header characterization test.

---

### Task 1: Add `trimRowKeys` and wire it into the upload row-parsing path

**Files:**
- Modify: `api/src/routes/timesheets.js:93` (row parsing), `:98` (sampleKeys), end of file (new function + export)
- Test: `api/src/routes/timesheets.test.js`

**Interfaces:**
- Produces: `trimRowKeys(row: object) => object` — returns a new object with every key trimmed, values unchanged. Exported alongside `formatDate`/`resolveColumnMap` for the test file to import.

- [ ] **Step 1: Write the failing tests**

Open `api/src/routes/timesheets.test.js`. Find this line near the top:

```js
const { formatDate, resolveColumnMap } = require('./timesheets');
```

Replace it with:

```js
const { formatDate, resolveColumnMap, trimRowKeys } = require('./timesheets');
```

Then add these tests at the end of the file, immediately after the last existing test block (which ends with):

```js
  assert.notEqual(rows[0][map.colOwner], rows[0][map.colRole]);
  assert.notEqual(rows[1][map.colOwner], rows[1][map.colRole]);
});
```

```js
test('trimRowKeys: trims every key, leaves values untouched', () => {
  const row = { ' Date ': '2026-06-15', 'Role: Name    ': 'HWGDEV - DEVELOPER', 'Hours': 8 };
  const trimmed = trimRowKeys(row);
  assert.deepEqual(trimmed, { 'Date': '2026-06-15', 'Role: Name': 'HWGDEV - DEVELOPER', 'Hours': 8 });
});

test('trimRowKeys: a row with no whitespace in any key is unchanged', () => {
  const row = { Date: '2026-06-15', Role: 'Developer', Hours: 8 };
  assert.deepEqual(trimRowKeys(row), row);
});

test('trimRowKeys + resolveColumnMap: real header list resolves every field correctly, not empty', () => {
  // Exact real source headers (docs/superpowers/specs/2026-07-13-timesheet-owner-role-mapping-fix-design.md):
  // every header except Date and WF Project Name has trailing whitespace.
  const rawRow = {
    'Date': '2026-06-15',
    'Job ': 'HWGDEV',
    'Role: Name    ': 'HWGDEV - DEVELOPER',
    'Hour Type    ': 'Billable',
    'Owner: Name    ': 'Mario Rossi',
    'Hours    ': 8,
    'Task/Issue    ': 'Build API',
    'Notes    ': '',
    'D365 Project ID    ': 'HITA.000001823.001',
    'WF Project Name': 'Some Project',
  };

  const row = trimRowKeys(rawRow);
  const sampleKeys = Object.keys(row);
  const map = resolveColumnMap(sampleKeys);

  // Same field-extraction logic as POST /upload (api/src/routes/timesheets.js:121-130)
  const role        = map.colRole     ? String(row[map.colRole] ?? '').trim() : null;
  const owner       = map.colOwner    ? String(row[map.colOwner] ?? '').trim() : null;
  const hours       = map.colHours    ? (parseFloat(row[map.colHours]) || 0) : 0;
  const task        = map.colTask     ? String(row[map.colTask] ?? '').trim() : null;
  const projectCode = map.colProjId   ? String(row[map.colProjId] ?? '').trim() : '';

  assert.equal(role, 'HWGDEV - DEVELOPER');
  assert.equal(owner, 'Mario Rossi');
  assert.notEqual(role, owner); // the original symptom: these used to collapse to the same value
  assert.equal(hours, 8);
  assert.equal(task, 'Build API');
  assert.equal(projectCode, 'HITA.000001823.001'); // empty would silently drop the whole row
});
```

- [ ] **Step 2: Run the tests to verify they fail**

From the `api/` directory:

Run: `docker exec pdash-api node --test src/routes/timesheets.test.js` (or, if `api/node_modules` is installed on the host: `cd api && node --test src/routes/timesheets.test.js`)
Expected: FAIL — `trimRowKeys is not a function` (or `undefined is not a function`), since `trimRowKeys` doesn't exist yet and isn't exported.

- [ ] **Step 3: Add `trimRowKeys` and wire it in**

In `api/src/routes/timesheets.js`, find this line (around line 93):

```js
    const raw = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
```

Replace it with:

```js
    const raw = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null }).map(trimRowKeys);
```

Then find this line (around line 98):

```js
    const sampleKeys = Object.keys(raw[0]).map(k => k.trim());
```

Replace it with:

```js
    const sampleKeys = Object.keys(raw[0]); // already trimmed by trimRowKeys above
```

Then find these lines (around line 190):

```js
// ── HELPERS ───────────────────────────────────────────────────────────────────

function resolveColumnMap(headers) {
```

Add `trimRowKeys` immediately above the `// ── HELPERS ──` comment line:

```js
function trimRowKeys(row) {
  const trimmed = {};
  for (const key of Object.keys(row)) trimmed[key.trim()] = row[key];
  return trimmed;
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function resolveColumnMap(headers) {
```

Finally, find these lines at the bottom of the file (around line 222-224):

```js
module.exports = router;
module.exports.formatDate = formatDate;
module.exports.resolveColumnMap = resolveColumnMap;
```

Add one line immediately after them:

```js
module.exports.trimRowKeys = trimRowKeys;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `docker exec pdash-api node --test src/routes/timesheets.test.js`
Expected: PASS — all tests in the file passing, including the 3 new ones.

- [ ] **Step 5: Verify no regression in the rest of the backend test suite**

Run: `docker exec pdash-api node --test src/**/*.test.js` (or the project's standard backend test command per `CLAUDE.md` — from `api/`: `npm test`)
Expected: PASS — all backend tests passing, no regressions in `resolveColumnMap`'s existing tests or `formatDate`'s tests.

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/timesheets.js api/src/routes/timesheets.test.js
git commit -m "fix: trim row object keys before column-map lookup in timesheet upload

Real XLS headers can carry trailing whitespace (e.g. \"Role: Name    \",
\"Owner: Name    \"). resolveColumnMap already resolved these correctly
against a trimmed header list, but the resolved names were then used
to index into the untrimmed row objects XLSX produces, so every such
field (role, owner, hours, task, and critically projectId) read as
empty/zero. A row with an empty projectId is silently dropped, so an
affected file's upload was rejected outright (\"No valid rows found\").

Fixes audit findings F1/F2: docs/superpowers/audits/2026-07-09-planning-by-owner-name-audit.md"
```

---

## Self-Review Notes

- **Spec coverage:** the design spec's `trimRowKeys` function, its wiring point, the redundant-retrim simplification, and both required test cases (unit + real-header characterization) are all in Task 1. The spec's "data correction" section is explicitly a manual post-merge user action, not a plan task — correctly not included here, per the spec's own scope note.
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code and exact commands.
- **Type consistency:** `trimRowKeys(row) => object` is used identically in the test file and the production wiring — takes and returns a plain object, no other shape assumed anywhere.
