const test = require('node:test');
const assert = require('node:assert/strict');
const { formatDate, resolveColumnMap } = require('./timesheets');

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
