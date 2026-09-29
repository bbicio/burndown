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

const { getCalendarWeeks: weeksOf } = require('./planning-calendar');

const TODAY = isoDate('2026-09-15'); // a Tuesday
const WEEKS = weeksOf(isoDate('2026-09-01'), isoDate('2026-09-30'), TODAY); // Aug31 Sep7 Sep14 Sep21 Sep28
const rec = (date, owner, hours, role = 'DEV', task = 'Build') => ({ date: isoDate(date), owner, hours, role, task });
const PROJ = (over = {}) => ({
  id: 'p1', name: 'Alpha', startDate: '202609', endDate: '202612',
  tasks: [{ name: 'Build', startDate: '20260901', endDate: '20260930', completed: false,
            monthlyDistribution: null, resources: [{ role: 'DEV', soldHours: 100 }] }],
  ...over,
});
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('roleProjection: past actuals per week, residual spread uniformly over future weeks, totals and children', () => {
  const actuals = new Map([['p1', [rec('2026-09-08', 'Ann', 10)]]]);
  const { roles } = M.roleProjection({ projects: [PROJ()], actuals, weeks: WEEKS, today: TODAY, pulse: true, teams: new Set() });
  assert.equal(roles.length, 1);
  const dev = roles[0];
  assert.equal(dev.role, 'DEV');
  assert.equal(dev.sold, 100);
  assert.equal(dev.actuals, 10);
  assert.deepEqual(dev.children, [{ project: 'Alpha', task: 'Build', sold: 100, actual: 10 }]);
  assert.deepEqual(Object.keys(dev.cells), ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
  assert.deepEqual(dev.cells['2026-09-07'], { hours: 10, breakdown: [{ project: 'Alpha', task: 'Build', hours: 10 }], isPast: true, isPulse: false });
  near(dev.cells['2026-09-14'].hours, 30);
  assert.equal(dev.cells['2026-09-14'].isPast, false);
});

test('roleProjection: below 1 h/week and pulse on -> the whole month sits on the first future week', () => {
  const p = PROJ(); p.tasks[0].resources = [{ role: 'DEV', soldHours: 2 }];
  const { roles } = M.roleProjection({ projects: [p], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: true, teams: new Set() });
  assert.deepEqual(Object.keys(roles[0].cells), ['2026-09-14']);
  near(roles[0].cells['2026-09-14'].hours, 2);
  assert.equal(roles[0].cells['2026-09-14'].isPulse, true);
  const off = M.roleProjection({ projects: [p], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: false, teams: new Set() });
  assert.deepEqual(Object.keys(off.roles[0].cells), ['2026-09-14', '2026-09-21', '2026-09-28']);
});

test('roleProjection: a valid monthly distribution is used instead of the uniform spread', () => {
  const p = PROJ(); p.tasks[0].monthlyDistribution = { '202609': 100 };
  const { roles } = M.roleProjection({ projects: [p], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: true, teams: new Set() });
  near(roles[0].cells['2026-09-14'].hours, 100 / 3);
  assert.equal(roles[0].cells['2026-09-14'].isPulse, false);
});

test('roleProjection: completed tasks, tasks outside the window and roles outside the team filter are skipped', () => {
  const done = PROJ(); done.tasks[0].completed = true;
  assert.equal(M.roleProjection({ projects: [done], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: true, teams: new Set() }).roles.length, 0);
  const later = PROJ(); later.tasks[0].startDate = '20270101'; later.tasks[0].endDate = '20270131';
  assert.equal(M.roleProjection({ projects: [later], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: true, teams: new Set() }).roles.length, 0);
  const team = PROJ(); team.tasks[0].resources = [{ role: 'HWGDEV - DEVELOPER', soldHours: 10 }, { role: 'HWGQA - TESTER', soldHours: 10 }];
  const only = M.roleProjection({ projects: [team], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: true, teams: new Set(['HWGDEV']) });
  assert.deepEqual(only.roles.map(r => r.role), ['HWGDEV - DEVELOPER']);
});

test('roleProjection: a task falls back to the project dates; a role without a name is ignored', () => {
  const p = PROJ(); p.tasks[0].startDate = ''; p.tasks[0].endDate = '';
  p.tasks[0].resources = [{ role: '', soldHours: 5 }, { role: 'DEV', soldHours: 30 }];
  const { roles } = M.roleProjection({ projects: [p], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: true, teams: new Set() });
  assert.deepEqual(roles.map(r => r.role), ['DEV']);
});

test('roleProjection: a task with no dates anywhere yields a tiny hours/week and finishes fast (Review Focus #2)', () => {
  const p = { id: 'p1', name: 'Undated', startDate: '', endDate: '', tasks: [{ name: 'T', startDate: '', endDate: '', completed: false, resources: [{ role: 'DEV', soldHours: 100 }] }] };
  const t0 = Date.now();
  const { roles } = M.roleProjection({ projects: [p], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: true, teams: new Set() });
  assert.ok(Date.now() - t0 < 3000);
  assert.equal(Object.values(roles[0].cells).every(c => c.isPulse), true); // hours/week << 1 -> pulse
});

test('roleProjection: a Sunday actuals row is counted in its own week (Review Focus #1)', () => {
  const actuals = new Map([['p1', [rec('2026-09-13', 'Ann', 4)]]]); // Sunday of the week starting 2026-09-07
  const { roles } = M.roleProjection({ projects: [PROJ()], actuals, weeks: WEEKS, today: TODAY, pulse: true, teams: new Set() });
  near(roles[0].cells['2026-09-07'].hours, 4);
});

test('roleProjection: two projects sharing a role merge into one role node with two children', () => {
  const p2 = PROJ({ id: 'p2', name: 'Beta' });
  const { roles } = M.roleProjection({ projects: [PROJ(), p2], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: true, teams: new Set() });
  assert.equal(roles.length, 1);
  assert.equal(roles[0].sold, 200);
  assert.deepEqual(roles[0].children.map(c => c.project), ['Alpha', 'Beta']);
});
