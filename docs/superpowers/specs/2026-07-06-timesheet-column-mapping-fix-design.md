# Timesheet Column Mapping Fix — Design Spec

**Source:** Resource Planning Audit, Finding 1 (Ciclo 1 of 3)

## Problem

`findCol()` in `api/src/routes/timesheets.js` resolves each field (`role`, `owner`, `hours`, etc.) by independently searching for the first uploaded-file column whose header contains one of that field's candidate keywords. It never excludes a column already assigned to a different field. When a single header matches keywords for two fields at once — e.g. `"Resource Name"` matches `colRole`'s `'resource'` keyword *and* `colOwner`'s `'name'` keyword — both fields resolve to the same physical column.

**Observed effect:** with a `"Resource Name"` header, `entry.owner` is populated with the same value as `entry.role`. The planning "By Owner" view then displays role names in place of person names (confirmed in the audit screenshot).

**Unverified indirect consequence:** the proportional future-hours split between multiple owners sharing a role (`ownerProp` in `js/planning.js`, based on "whoever has worked more so far will continue to, proportionally") has never been exercised against real multi-owner data, because with the bug active every "owner" coincides 1:1 with the role (a single contributor → proportion always 1).

## Fix

Extract the column-detection logic out of the POST `/upload` handler's inline closure into a new top-level function in `api/src/routes/timesheets.js`, following the same extraction pattern this file already uses for `formatDate` (a plain function, exported via `module.exports.<name> = <name>`, tested directly by `require`-ing the route module):

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

The POST `/upload` handler replaces its 8 inline `findCol(...)` calls with:

```js
const { colDate, colRole, colOwner, colHours, colTask, colNotes, colProjId, colProjName } = resolveColumnMap(sampleKeys);
```

Same keyword lists per field, same call order, same matching rule (case-insensitive substring). The only behavioral change: once a column has been claimed by an earlier-declared field, later fields skip it instead of matching it again.

**Disambiguation rule:** first-come-first-served by call order. The field declaration order inside `resolveColumnMap` — `date > role > owner > hours > task > notes > projId > projName` — *is* the priority order: whichever field is declared first wins any column conflict. This is the same order the code already calls `findCol` in today, so it requires no new ordering decision, only making the existing order load-bearing.

**Export:** `module.exports.resolveColumnMap = resolveColumnMap;` (alongside the existing `module.exports.formatDate = formatDate;`).

## Backward compatibility

For any file where every field already maps to a distinct column today (the working, non-ambiguous case), the `used` Set never blocks a match — output is identical to current behavior. Exclusion only changes behavior when a later field's candidates would otherwise match a column already claimed by an earlier field, which is exactly the bug being fixed.

## Edge case: ambiguous column with no separate owner column

If a file's only owner-like header is the same one already claimed by role (e.g. `"Resource Name"` with no other owner column present), `colOwner` resolves to `undefined` — the same outcome as today for any file that simply has no owner column at all. This is already handled safely downstream:

- `owner: colOwner ? String(row[colOwner] ?? '').trim() : null` (`timesheets.js:132`) is null-safe.
- `js/planning.js` already falls back to a `'—'` placeholder owner (`displayOwners = hasOwners ? ownerNames : ['—']`) when no owner data exists.

No new handling is required for this case.

## Testing

Two new characterization test blocks added to `api/src/routes/timesheets.test.js`, driving `resolveColumnMap` directly (pure function, no XLSX parsing needed):

**Test A — reproduces the audit's "Resource Name" case, proves owner and role no longer collapse onto the same column:**

```js
test('resolveColumnMap: "Resource Name" is claimed by role, not duplicated onto owner', () => {
  const map = resolveColumnMap(['Date', 'Resource Name', 'Hours', 'Task', 'Project ID']);
  assert.equal(map.colRole, 'Resource Name');
  assert.notEqual(map.colOwner, 'Resource Name');
  assert.equal(map.colOwner, undefined);
});
```

**Test B — synthetic two-owner-one-role scenario, sets up (but does not compute) the proportional-split precondition:**

```js
test('resolveColumnMap: distinct role and owner columns both resolve correctly when unambiguous', () => {
  const map = resolveColumnMap(['Date', 'Role', 'Owner Name', 'Hours', 'Task', 'Project ID']);
  assert.equal(map.colRole, 'Role');
  assert.equal(map.colOwner, 'Owner Name');
});

test('resolveColumnMap output correctly separates two owners sharing a role in row data', () => {
  const map = resolveColumnMap(['Date', 'Role', 'Owner Name', 'Hours', 'Task', 'Project ID']);
  const rows = [
    { Date: '2026-03-01', Role: 'Backend Developer', 'Owner Name': 'Alice', Hours: 7, Task: 'Build API', 'Project ID': 'P1' },
    { Date: '2026-03-01', Role: 'Backend Developer', 'Owner Name': 'Bob',   Hours: 3, Task: 'Build API', 'Project ID': 'P1' },
  ];
  assert.equal(rows[0][map.colOwner], 'Alice');
  assert.equal(rows[1][map.colOwner], 'Bob');
  assert.notEqual(rows[0][map.colOwner], rows[0][map.colRole]);
});
```

**Why this satisfies acceptance criterion 4 without touching `planning.js`:** `ownerProp` (`js/planning.js`) is frontend code with DOM dependencies and cannot be `require()`-d into a Node test, and the brief excludes modifying or extracting it. Test B proves the fix's actual job — producing correctly-separated, distinct owner data (Alice: 7h, Bob: 3h, a 70/30 split) for a same-role/two-owner case — without independently computing or asserting the proportion itself. The already-correct, untouched `ownerProp` formula is trusted to do the right thing once fed this correctly-shaped data; duplicating that formula inside the test file was explicitly rejected as a source of silent drift risk.

Run via `cd api && node --test src/routes/timesheets.test.js` (this file `require`s `./timesheets`, so — per the existing project convention documented in `CLAUDE.md` — it needs the container's `node_modules`: `docker exec pdash-api node --test src/routes/timesheets.test.js`).

## Explicitly out of scope

- Fixes for Findings 2, 3, 4, 5 (remain in Cicli 2 and 3).
- Any modification to `js/planning.js` (`ownerProp` is validated indirectly via Test B, never touched).
- Any modification to `formatDate` or the rest of the upload pipeline.
- Any broader redesign of `findCol`/column-mapping beyond resolving the overlap (no collateral refactor).
