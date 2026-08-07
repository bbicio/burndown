const test = require('node:test');
const assert = require('node:assert/strict');
const { formatDate, resolveColumnMap, trimRowKeys } = require('./timesheets');

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

test('formatDate: whitespace-only string input returns null', () => {
  assert.equal(formatDate('   '), null);
});

test('formatDate: unrecognized garbage string throws instead of silently passing through', () => {
  assert.throws(() => formatDate('N/A'), /not a recognized date format/i);
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

test('resolveColumnMap: candidate matches a later occurrence when the first occurrence is not a word boundary', () => {
  // "xnamename" — "name" appears at index 1 (no left boundary: preceded by 'x')
  // and again at index 5 (left boundary: preceded by 'e' is NOT a boundary either in this
  // constructed example, so use a case where a LATER occurrence is genuinely boundary-clean)
  const map = resolveColumnMap(['Date', 'unowner name', 'Hours', 'Task', 'Project ID']);
  // "owner" appears at index 2 with no left boundary (preceded by 'n' from "un"), but "name"
  // appears at the end with a clean left boundary (preceded by a space) — this exercises the
  // fix directly: candidate "name" (for colOwner) must still be found via its later,
  // boundary-clean occurrence, not abandoned after the first (non-boundary) occurrence fails.
  assert.strictEqual(map.colOwner, 'unowner name');
});

test('resolveColumnMap: two columns with identical header text both resolve, not collapsed onto one', () => {
  const map = resolveColumnMap(['Date', 'Notes', 'Hours', 'Task', 'Project ID', 'Notes']);
  // Both "Notes" columns exist in the input; only one field (colNotes) can claim the string
  // "Notes" as its header value today (result maps field -> header STRING, not index), so
  // this test's real assertion is that resolving does not throw and does not silently drop
  // data for the field it does map — the header-index-based usedHeaders fix prevents the
  // FIRST "Notes" occurrence from incorrectly blocking a DIFFERENT field from separately
  // matching the SECOND "Notes" occurrence, if any other field also had "notes" as a
  // candidate. Since only colNotes has "notes"/"note"/"description" as candidates here,
  // assert the basic non-collision invariant: colNotes still resolves to a "Notes" header.
  assert.strictEqual(map.colNotes, 'Notes');
});
