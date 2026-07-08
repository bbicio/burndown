# Timesheet Column Mapping Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `findCol()` in `api/src/routes/timesheets.js` so that when an uploaded timesheet's header is ambiguous (matches keywords for more than one field, e.g. `"Resource Name"` matching both `role` and `owner`), each physical column can only be assigned to one field — preventing `entry.owner` from silently duplicating `entry.role`.

**Architecture:** Extract the inline `findCol` closure (currently defined per-request inside the POST `/upload` handler) into a standalone, exported, top-level function `resolveColumnMap(headers)` in the same file — mirroring the existing `formatDate` extraction pattern in this exact file (plain function, `module.exports.<name> = <name>`, tested by `require`-ing the route module directly). The new function tracks already-claimed columns in a `Set` and skips them on later field lookups, using the field declaration order as an explicit priority order (first-declared field wins any conflict). The POST handler's 8 inline `findCol(...)` calls are replaced by one destructured call to `resolveColumnMap(sampleKeys)`.

**Tech Stack:** Node.js/Express (backend). `node:test` for characterization tests, added to the existing `api/src/routes/timesheets.test.js` (already imports `formatDate` from the same route module via `require('./timesheets')`).

## Global Constraints

- Keyword lists per field are unchanged verbatim: `colDate: ['date','data']`, `colRole: ['role','ruolo','resource']`, `colOwner: ['owner','worker','name','nome']`, `colHours: ['hours','ore','qty','quantity']`, `colTask: ['task','attività','activity']`, `colNotes: ['notes','note','description']`, `colProjId: ['projectid','project id','project_id','codice']`, `colProjName: ['projectname','project name','project_name','progetto']`.
- Matching rule is unchanged: case-insensitive substring match (`header.toLowerCase().includes(candidate.toLowerCase())`).
- Field declaration/call order is unchanged and is now the explicit conflict-priority order: `date > role > owner > hours > task > notes > projId > projName`.
- No behavior change for any file where every field already resolves to a distinct column today (the current, working, non-ambiguous case).
- No changes to `formatDate`, date-parsing, or any other part of the upload pipeline.
- No changes to `js/planning.js` (`ownerProp` logic is validated indirectly, never touched or imported).
- No broader redesign of column-mapping beyond resolving the same-column overlap — no collateral refactor.

---

### Task 1: Extract `resolveColumnMap`, wire it in, add characterization tests

**Files:**
- Modify: `api/src/routes/timesheets.js` (add `resolveColumnMap` function near `formatDate`'s section at the bottom; modify the POST `/upload` handler's column-detection block, currently lines 97-109; add the export line near the bottom)
- Modify: `api/src/routes/timesheets.test.js` (add new test blocks after the existing `formatDate` tests)

**Interfaces:**
- Produces: `resolveColumnMap(headers: string[]) => { colDate, colRole, colOwner, colHours, colTask, colNotes, colProjId, colProjName }` (each value is a matching header string from `headers`, or `undefined` if no unclaimed header matches that field's candidates). Exported via `module.exports.resolveColumnMap = resolveColumnMap;`, consumed only within this same file's POST `/upload` handler.

- [ ] **Step 1: Write the failing characterization tests**

Open `api/src/routes/timesheets.test.js`. Add this import at the top, alongside the existing `formatDate` import:

```js
const { formatDate, resolveColumnMap } = require('./timesheets');
```

(This replaces the existing line `const { formatDate } = require('./timesheets');`.)

Then append these test blocks at the end of the file:

```js
test('resolveColumnMap: unambiguous headers each resolve to their own distinct column (no regression)', () => {
  const map = resolveColumnMap(['Date', 'Role', 'Owner Name', 'Hours', 'Task', 'Project ID']);
  assert.equal(map.colDate, 'Date');
  assert.equal(map.colRole, 'Role');
  assert.equal(map.colOwner, 'Owner Name');
  assert.equal(map.colHours, 'Hours');
  assert.equal(map.colTask, 'Task');
  assert.equal(map.colProjId, 'Project ID');
});

test('resolveColumnMap: "Resource Name" is claimed by role, not duplicated onto owner', () => {
  const map = resolveColumnMap(['Date', 'Resource Name', 'Hours', 'Task', 'Project ID']);
  assert.equal(map.colRole, 'Resource Name');
  assert.notEqual(map.colOwner, 'Resource Name');
  assert.equal(map.colOwner, undefined);
});

test('resolveColumnMap: two owners sharing a role resolve to distinct row values, not collapsed onto role', () => {
  const map = resolveColumnMap(['Date', 'Role', 'Owner Name', 'Hours', 'Task', 'Project ID']);
  assert.equal(map.colRole, 'Role');
  assert.equal(map.colOwner, 'Owner Name');

  const rows = [
    { Date: '2026-03-01', Role: 'Backend Developer', 'Owner Name': 'Alice', Hours: 7, Task: 'Build API', 'Project ID': 'P1' },
    { Date: '2026-03-01', Role: 'Backend Developer', 'Owner Name': 'Bob',   Hours: 3, Task: 'Build API', 'Project ID': 'P1' },
  ];
  assert.equal(rows[0][map.colOwner], 'Alice');
  assert.equal(rows[1][map.colOwner], 'Bob');
  assert.notEqual(rows[0][map.colOwner], rows[0][map.colRole]);
  assert.notEqual(rows[1][map.colOwner], rows[1][map.colRole]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker exec pdash-api node --test src/routes/timesheets.test.js`
Expected: FAIL — `resolveColumnMap is not a function` (or `undefined`), since it doesn't exist yet. The pre-existing `formatDate` tests still pass.

- [ ] **Step 3: Implement `resolveColumnMap` and wire it into the POST handler**

In `api/src/routes/timesheets.js`, find the POST `/upload` handler's column-detection block (currently lines 97-109):

```js
    // Detect column mapping (case-insensitive, trimmed)
    const sampleKeys = Object.keys(raw[0]).map(k => k.trim());
    const findCol = (...candidates) =>
      sampleKeys.find(k => candidates.some(c => k.toLowerCase().includes(c.toLowerCase())));

    const colDate    = findCol('date', 'data');
    const colRole    = findCol('role', 'ruolo', 'resource');
    const colOwner   = findCol('owner', 'worker', 'name', 'nome');
    const colHours   = findCol('hours', 'ore', 'qty', 'quantity');
    const colTask    = findCol('task', 'attività', 'activity');
    const colNotes   = findCol('notes', 'note', 'description');
    const colProjId  = findCol('projectid', 'project id', 'project_id', 'codice');
    const colProjName= findCol('projectname', 'project name', 'project_name', 'progetto');
```

Replace it with:

```js
    // Detect column mapping (case-insensitive, trimmed)
    const sampleKeys = Object.keys(raw[0]).map(k => k.trim());
    const {
      colDate, colRole, colOwner, colHours, colTask, colNotes, colProjId, colProjName,
    } = resolveColumnMap(sampleKeys);
```

Then, in the `// ── HELPERS ──` section near the bottom of the file (where `formatDate` is defined, currently starting at line 200), add `resolveColumnMap` immediately before `formatDate`:

```js
function resolveColumnMap(headers) {
  const used = new Set();
  const findCol = (...candidates) => {
    const col = headers.find(k => !used.has(k) && candidates.some(c => k.toLowerCase().includes(c.toLowerCase())));
    if (col) used.add(col);
    return col;
  };
  return {
    colDate:     findCol('date', 'data'),
    colRole:     findCol('role', 'ruolo', 'resource'),
    colOwner:    findCol('owner', 'worker', 'name', 'nome'),
    colHours:    findCol('hours', 'ore', 'qty', 'quantity'),
    colTask:     findCol('task', 'attività', 'activity'),
    colNotes:    findCol('notes', 'note', 'description'),
    colProjId:   findCol('projectid', 'project id', 'project_id', 'codice'),
    colProjName: findCol('projectname', 'project name', 'project_name', 'progetto'),
  };
}
```

Finally, find the existing export lines at the bottom of the file:

```js
module.exports = router;
module.exports.formatDate = formatDate;
```

Replace with:

```js
module.exports = router;
module.exports.formatDate = formatDate;
module.exports.resolveColumnMap = resolveColumnMap;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker exec pdash-api node --test src/routes/timesheets.test.js`
Expected: all tests PASS — the pre-existing `formatDate` tests plus the 3 new `resolveColumnMap` tests, with no change to any pre-existing test's behavior.

- [ ] **Step 5: Manual regression check — confirm no behavior change for the currently-working case**

Read through `api/src/routes/timesheets.js`'s POST `/upload` handler after the edit and confirm: every other reference to `colDate`, `colRole`, `colOwner`, `colHours`, `colTask`, `colNotes`, `colProjId`, `colProjName` further down in the handler (the row-processing loop, currently lines 111-137) is unchanged — this task only touches the column-detection block and the new helper function, nothing in the row-extraction/grouping logic.

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/timesheets.js api/src/routes/timesheets.test.js
git commit -m "fix(api): prevent ambiguous timesheet headers from mapping to more than one field"
```

---

## Self-Review Notes (completed by the plan author, not a task step)

**Spec coverage:** the design spec's single fix (extract `resolveColumnMap`, exclusion-Set disambiguation, first-declared-field-wins priority) is implemented in Task 1 Step 3, verbatim from the spec's code block. The spec's Test A ("Resource Name" case) and Test B (two-owner distinct-column case) are both included in Step 1, plus one additional regression test (fully-unambiguous header set) explicitly called out in the spec's "Backward compatibility" section as needing zero behavior change — added as its own assertion to make that guarantee executable, not just asserted in prose. The spec's "Edge case: ambiguous column with no separate owner column" is exercised by Test A's `assert.equal(map.colOwner, undefined)` line. Out-of-scope items (Findings 2-5, `planning.js`, `formatDate`, broader redesign) are untouched by this single task.

**Placeholder scan:** no TBD/TODO; every step contains complete, runnable code, not a description of it.

**Type/reference consistency:** `resolveColumnMap(headers)`'s return shape (`colDate, colRole, colOwner, colHours, colTask, colNotes, colProjId, colProjName`) matches exactly the destructured names the POST handler already uses (Step 3's replacement code), which in turn match the pre-existing variable names used unchanged in the row-processing loop below (Step 5's regression check confirms this). Test assertions in Step 1 reference exactly these same property names.
