const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('./planning-model');
const { isoDate, getCalendarWeeks } = require('./planning-calendar');

test('normalizeActuals: drops rows without date or hours, keeps unparsable dates as null, coerces fields', () => {
  const rows = [
    { date: '2026-09-08', role: 'DEV', owner: ' Mario ', task: 'Build', hours: '4.5' },
    { date: '', role: 'DEV', hours: 3 },
    { date: '2026-09-09', hours: 0 },
    { date: '2026-09-09', hours: 'abc' },
    { date: 'garbage', role: 'DEV', task: 'Build', hours: 2 },
    null,
  ];
  const out = M.normalizeActuals(rows);
  assert.equal(out.length, 2);
  assert.equal(out[0].hours, 4.5);
  assert.equal(out[0].owner, ' Mario ');
  assert.equal(out[0].date.toISOString().slice(0, 10), '2026-09-08');
  assert.equal(out[1].date, null);
  assert.equal(out[1].hours, 2);
});

test('groupActualsByProject: two projects sharing a code both get the rows; no code -> nothing', () => {
  const projects = [{ id: 'p1', code: 'X1' }, { id: 'p2', code: 'X1' }, { id: 'p3', code: '' }, { id: 'p4', code: 'Z' }];
  const sheets = [{ project_code: 'X1', data: [{ date: '2026-09-09', hours: 1 }, { date: '2026-09-08', hours: 2 }] }];
  const map = M.groupActualsByProject(projects, sheets);
  assert.equal(map.get('p1').length, 2);
  assert.equal(map.get('p2').length, 2);
  assert.equal(map.get('p1')[0].date.toISOString().slice(0, 10), '2026-09-08'); // sorted by date
  assert.equal(map.has('p3'), false);
  assert.equal(map.has('p4'), false);
});

test('uniqueOwnerNames: trimmed, non-empty, distinct', () => {
  const projects = [{ id: 'p1' }];
  const actuals = new Map([['p1', [{ owner: ' A ' }, { owner: 'A' }, { owner: '  ' }, { owner: '' }, { owner: 'B' }]]]);
  assert.deepEqual(M.uniqueOwnerNames(projects, actuals).sort(), ['A', 'B']);
});

test('inWeek: Sunday belongs to its own Monday-Sunday week (calendar semantics)', () => {
  const [w] = getCalendarWeeks(isoDate('2026-09-07'), isoDate('2026-09-07'), isoDate('2026-09-30'));
  assert.equal(M.inWeek({ date: isoDate('2026-09-13') }, w), true);  // Sunday
  assert.equal(M.inWeek({ date: isoDate('2026-09-07') }, w), true);  // Monday
  assert.equal(M.inWeek({ date: isoDate('2026-09-14') }, w), false); // next Monday
  assert.equal(M.inWeek({ date: null }, w), false);
});

test('ownerOf and rolePassesTeams', () => {
  assert.equal(M.ownerOf({ owner: '  Ann ' }), 'Ann');
  assert.equal(M.ownerOf({ owner: '   ' }), M.PLACEHOLDER);
  assert.equal(M.ownerOf({ owner: '' }), M.PLACEHOLDER);
  assert.equal(M.rolePassesTeams(new Set(), 'ANY'), true);
  assert.equal(M.rolePassesTeams(new Set(['HWGDEV']), 'HWGDEV - DEVELOPER'), true);
  assert.equal(M.rolePassesTeams(new Set(['HWGDEV']), 'HWGQA - TESTER'), false);
  assert.equal(M.rolePassesTeams(new Set(['DEV']), 'DEV'), true);           // no " - ": the whole role is the team
  assert.equal(M.rolePassesTeams(new Set(['DEV']), undefined), false);      // missing role only passes with no filter
  assert.equal(M.rolePassesTeams(new Set(), undefined), true);
});
