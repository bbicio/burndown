# Timesheet Column-Mapping Specificity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `resolveColumnMap()`'s fixed-declaration-order, first-substring-match column detection with a specificity-scored global assignment, so a more specific keyword match always wins regardless of field-declaration order or header column position.

**Architecture:** A single pure function rewrite in `api/src/routes/timesheets.js`: compute every (header, field) match with a specificity score (exact-match tier, then keyword length), sort all matches by score, and assign greedily so the highest-specificity matches win first. No change to the function's external signature or the 8-field candidate-keyword table.

**Tech Stack:** Plain Node.js (no new dependencies), `node:test` + `node:assert/strict` (existing backend test toolchain), run via `docker exec pdash-api node --test src/routes/timesheets.test.js` (no `api/node_modules` on this host).

## Global Constraints

- `resolveColumnMap(headers)`'s signature and return shape must not change: receives a trimmed `string[]`, returns `{ colDate, colRole, colOwner, colHours, colTask, colNotes, colProjId, colProjName }`, each value `string | undefined`.
- The 8-field candidate-keyword table (`colDate: ['date','data']`, etc.) is unchanged — only the matching/assignment algorithm changes.
- The real production header set (`Date | Job | Role: Name | Hour Type | Owner: Name | Hours | Task/Issue | Notes | D365 Project ID | WF Project Name`, from `docs/superpowers/specs/2026-07-13-timesheet-owner-role-mapping-fix-design.md`) must resolve identically to today after this change.
- All 3 existing `resolveColumnMap` tests in `api/src/routes/timesheets.test.js` (lines 48-77, including `"Resource Name"` resolving to `colRole` not `colOwner`) must still pass unmodified.
- No new external dependency.
- No change to `formatDate()`/`parseFlexibleDate()` or row-level validation logic — out of scope.

---

## File Structure

- **Modify:** `api/src/routes/timesheets.js` — replace the body of `resolveColumnMap` (currently `:198-215`) with the specificity-scored version; add two new helper functions (`isBoundaryChar`, `matchSpecificity`) and a `FIELD_CANDIDATES`/`FIELD_ORDER` constant pair, all colocated in the same "HELPERS" section of the file where `resolveColumnMap` already lives.
- **Modify:** `api/src/routes/timesheets.test.js` — add 6 new test cases (5 audit-scenario regressions + 1 bonus word-boundary case) alongside the existing `resolveColumnMap` tests.

No other files change. Single self-contained unit — no sub-project decomposition needed.

---

### Task 1: Specificity-scored `resolveColumnMap`

**Files:**
- Modify: `api/src/routes/timesheets.js:198-215` (replace `resolveColumnMap`, add helpers)
- Test: `api/src/routes/timesheets.test.js` (add new test cases after the existing ones, i.e. after line 77)

**Interfaces:**
- Consumes: nothing from another task — this is the only task in the plan.
- Produces: `resolveColumnMap(headers: string[]): { colDate, colRole, colOwner, colHours, colTask, colNotes, colProjId, colProjName }` (each value `string | undefined`) — same signature as today, already consumed by `POST /upload` (`api/src/routes/timesheets.js:99-101`), which needs no changes since the signature is unchanged.

- [ ] **Step 1: Write the failing tests**

Add these test cases to `api/src/routes/timesheets.test.js`, immediately after the existing test ending at line 77 (`resolveColumnMap: two owners sharing a role resolve to distinct row values, not collapsed onto role`) and before the `trimRowKeys` tests that currently start at line 80:

```js
test('resolveColumnMap: "Project Name" resolves to colProjName, not colOwner (no separate Owner column)', () => {
  const map = resolveColumnMap(['Date', 'Role', 'Project Name', 'Hours', 'Task', 'Project ID']);
  assert.equal(map.colProjName, 'Project Name');
  assert.notEqual(map.colOwner, 'Project Name');
});

test('resolveColumnMap: "Project Name" still resolves correctly even when it appears before the real Owner column', () => {
  const map = resolveColumnMap(['Date', 'Role', 'Project Name', 'Owner', 'Hours', 'Task', 'Project ID']);
  assert.equal(map.colProjName, 'Project Name');
  assert.equal(map.colOwner, 'Owner');
});

test('resolveColumnMap: "Task Name" alone resolves to colTask, not colOwner', () => {
  const map = resolveColumnMap(['Date', 'Role', 'Task Name', 'Hours', 'Project ID']);
  assert.equal(map.colTask, 'Task Name');
  assert.notEqual(map.colOwner, 'Task Name');
});

test('resolveColumnMap: Italian "Nome Progetto" + "Nome Risorsa" both resolve to their correct fields', () => {
  const map = resolveColumnMap(['Data', 'Ruolo', 'Nome Progetto', 'Nome Risorsa', 'Ore', 'Attività', 'Codice']);
  assert.equal(map.colProjName, 'Nome Progetto');
  assert.equal(map.colOwner, 'Nome Risorsa');
});

test('resolveColumnMap: "Data" (exact match) wins over "Data Chiusura" (partial match) for colDate', () => {
  const map = resolveColumnMap(['Data Chiusura', 'Data', 'Ruolo', 'Ore', 'Codice']);
  assert.equal(map.colDate, 'Data');
  assert.notEqual(map.colDate, 'Data Chiusura');
});

test('resolveColumnMap: "Surname" is not misassigned to colOwner via a bare substring match on "name"', () => {
  const map = resolveColumnMap(['Date', 'Role', 'Surname', 'Hours', 'Task', 'Project ID']);
  assert.notEqual(map.colOwner, 'Surname');
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `docker exec pdash-api node --test src/routes/timesheets.test.js`
Expected: the 6 new tests FAIL (the current implementation misassigns `"Project Name"`, `"Task Name"`, and `"Nome Progetto"`/`"Nome Risorsa"` to `colOwner`, picks `"Data Chiusura"` over `"Data"`, and misassigns `"Surname"` to `colOwner`); all pre-existing tests still PASS. This confirms the tests actually exercise the bug before it's fixed.

- [ ] **Step 3: Replace `resolveColumnMap` with the specificity-scored implementation**

In `api/src/routes/timesheets.js`, find the current `resolveColumnMap` function (starts at line 198, in the `// ── HELPERS ─...` section):

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

Replace it entirely with:

```js
const FIELD_CANDIDATES = {
  colDate:     ['date', 'data'],
  colRole:     ['role', 'ruolo', 'resource'],
  colOwner:    ['owner', 'worker', 'name', 'nome'],
  colHours:    ['hours', 'ore', 'qty', 'quantity'],
  colTask:     ['task', 'attività', 'activity'],
  colNotes:    ['notes', 'note', 'description'],
  colProjId:   ['projectid', 'project id', 'project_id', 'codice'],
  colProjName: ['projectname', 'project name', 'project_name', 'progetto'],
};
const FIELD_ORDER = Object.keys(FIELD_CANDIDATES);

// Unicode-aware "not a letter/digit" check -- a plain regex \b word boundary doesn't treat
// accented letters (e.g. the "à" in "attività") as word characters, which would create a
// false boundary in the middle of that word and silently break the 'attività' candidate.
function isBoundaryChar(ch) {
  return ch === undefined || !/[\p{L}\p{N}]/u.test(ch);
}

// Returns null if `candidate` doesn't appear in `header` as a whole word (or the whole
// header), otherwise a specificity score: tier 2 = header equals candidate exactly,
// tier 1 = candidate appears as a whole word inside a longer header. Within a tier,
// a longer candidate is more specific than a shorter one.
function matchSpecificity(header, candidate) {
  const h = header.toLowerCase();
  const c = candidate.toLowerCase();
  if (h === c) return { tier: 2, length: c.length };
  const idx = h.indexOf(c);
  if (idx === -1) return null;
  if (isBoundaryChar(h[idx - 1]) && isBoundaryChar(h[idx + c.length])) {
    return { tier: 1, length: c.length };
  }
  return null;
}

function resolveColumnMap(headers) {
  const matches = [];
  headers.forEach((header, headerIdx) => {
    FIELD_ORDER.forEach((field, fieldIdx) => {
      let best = null;
      for (const candidate of FIELD_CANDIDATES[field]) {
        const score = matchSpecificity(header, candidate);
        if (score && (!best || score.tier > best.tier ||
            (score.tier === best.tier && score.length > best.length))) {
          best = score;
        }
      }
      if (best) matches.push({ header, headerIdx, field, fieldIdx, ...best });
    });
  });

  // Highest specificity first; ties broken by field-declaration order then header
  // position, matching today's behavior exactly when specificity doesn't differ.
  matches.sort((a, b) =>
    b.tier - a.tier ||
    b.length - a.length ||
    a.fieldIdx - b.fieldIdx ||
    a.headerIdx - b.headerIdx
  );

  const result = {};
  const usedHeaders = new Set();
  const usedFields = new Set();
  for (const m of matches) {
    if (usedHeaders.has(m.header) || usedFields.has(m.field)) continue;
    result[m.field] = m.header;
    usedHeaders.add(m.header);
    usedFields.add(m.field);
  }
  for (const field of FIELD_ORDER) if (!(field in result)) result[field] = undefined;
  return result;
}
```

- [ ] **Step 4: Run tests to verify everything passes**

Run: `docker exec pdash-api node --test src/routes/timesheets.test.js`
Expected: ALL tests PASS — the 6 new tests from Step 1, the 3 pre-existing `resolveColumnMap` tests (lines 48-77), the `trimRowKeys` tests, and the `formatDate` tests (all in the same file, unaffected by this change but must still be green since the whole file runs as one suite).

- [ ] **Step 5: Manually verify the real production header set is unaffected**

Run (from the repo root):

```bash
docker exec pdash-api node -e "
const { resolveColumnMap } = require('/app/src/routes/timesheets.js');
const headers = ['Date','Job','Role: Name','Hour Type','Owner: Name','Hours','Task/Issue','Notes','D365 Project ID','WF Project Name'];
console.log(JSON.stringify(resolveColumnMap(headers), null, 2));
"
```

Expected output (each field resolves to the same header it does today):

```json
{
  "colDate": "Date",
  "colRole": "Role: Name",
  "colOwner": "Owner: Name",
  "colHours": "Hours",
  "colTask": "Task/Issue",
  "colNotes": "Notes",
  "colProjId": "D365 Project ID",
  "colProjName": "WF Project Name"
}
```

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/timesheets.js api/src/routes/timesheets.test.js
git commit -m "fix: score column-mapping matches by specificity instead of field-declaration order"
```

---

## Self-Review

**1. Spec coverage:**
- F1 (cross-field greedy matching) → Task 1's specificity-scored assignment (tier + length scoring across all fields, not fixed order) directly addresses it; regression tests cover `"Project Name"`, `"Task Name"`, `"Nome Progetto"`/`"Nome Risorsa"`.
- F2 (same-field exact-vs-substring) → the `tier` dimension of `matchSpecificity` (exact match = tier 2, beats any tier-1 substring match); regression test covers `"Data Chiusura"` vs `"Data"`.
- Word-boundary matching (spec's design decision) → `isBoundaryChar`/`matchSpecificity`'s adjacent-character check; regression test covers `"Surname"`.
- Unicode/accented-character handling (spec's design note re: `attività`) → `isBoundaryChar` uses `\p{L}\p{N}` instead of `\b`; not independently tested by a new test case, but the existing `colTask: ['task', 'attività', 'activity']` candidate is exercised implicitly by any test with an `'Attività'` header (the Italian regression test above uses it) — passing confirms it isn't broken.
- No regression on production header set (spec's acceptance criteria) → Task 1 Step 5.
- No regression on existing tests (spec's acceptance criteria) → Task 1 Step 4.
- Signature/return-shape unchanged (Global Constraints) → confirmed by inspection: the new `resolveColumnMap` takes the same `headers` parameter and returns an object with the same 8 keys.

**2. Placeholder scan:** No TBD/TODO; every step shows literal code and exact commands with expected output.

**3. Type consistency:** Single task, single function — no cross-task signature risk. `FIELD_CANDIDATES`/`FIELD_ORDER`/`isBoundaryChar`/`matchSpecificity` are all new, colocated, internal helpers with no external callers to keep in sync.

No gaps found.
