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

test('inWeekLegacy: Sunday is excluded (browser quirk), Monday-Saturday included', () => {
  const [w] = getCalendarWeeks(isoDate('2026-09-07'), isoDate('2026-09-07'), isoDate('2026-09-30'));
  assert.equal(M.inWeekLegacy({ date: isoDate('2026-09-07') }, w), true);   // Monday
  assert.equal(M.inWeekLegacy({ date: isoDate('2026-09-12') }, w), true);   // Saturday
  assert.equal(M.inWeekLegacy({ date: isoDate('2026-09-13') }, w), false);  // Sunday
  assert.equal(M.inWeekLegacy({ date: isoDate('2026-09-14') }, w), false);  // next Monday
  assert.equal(M.inWeekLegacy({ date: null }, w), false);
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

test('legacy: a Sunday row is counted in consumed but not placed in a week cell (By Role)', () => {
  const actuals = new Map([['p1', [rec('2026-09-13', 'Ann', 4)]]]); // Sunday of the week starting 2026-09-07
  const { roles } = M.roleProjection({ projects: [PROJ()], actuals, weeks: WEEKS, today: TODAY, pulse: true, teams: new Set() });
  const cell = roles[0].cells['2026-09-07'];
  assert.ok(cell === undefined || cell.hours === 0, 'Sunday row must not appear in the week cell');
  assert.equal(roles[0].actuals, 4); // still consumed
});

test('roleProjection: two projects sharing a role merge into one role node with two children', () => {
  const p2 = PROJ({ id: 'p2', name: 'Beta' });
  const { roles } = M.roleProjection({ projects: [PROJ(), p2], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: true, teams: new Set() });
  assert.equal(roles.length, 1);
  assert.equal(roles[0].sold, 200);
  assert.deepEqual(roles[0].children.map(c => c.project), ['Alpha', 'Beta']);
});

const TWO_ROLES = () => PROJ({ tasks: [{ name: 'Build', startDate: '20260901', endDate: '20260930', completed: false,
  monthlyDistribution: { '202609': 100 }, // ignored by By Project (uniform only)
  resources: [{ role: 'DEV', soldHours: 100 }] }] });

test('projectProjection: owner split by actuals, inactive owners excluded from the future share', () => {
  const actuals = new Map([['p1', [rec('2026-09-08', 'Mario Rossi', 6), rec('2026-09-09', 'Anna Bianchi', 4)]]]);
  const out = M.projectProjection({ projects: [TWO_ROLES()], actuals, weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(),
    ownerStatus: { 'Anna Bianchi': 'inactive' } });
  const role = out.projects[0].tasks[0].roles[0];
  assert.equal(role.sold, 100);
  assert.equal(role.consumed, 10);
  near(role.tbp, 90);
  assert.equal(role.hasOwners, true);
  assert.equal(role.allOwnersInactive, false);
  near(role.weekData['2026-09-14'].total, 30);                       // uniform, NOT the monthly distribution
  near(role.weekData['2026-09-14'].byOwner['Mario Rossi'], 30);
  assert.equal(role.weekData['2026-09-14'].byOwner['Anna Bianchi'], undefined);
  near(role.weekData['2026-09-07'].byOwner['Anna Bianchi'], 4);      // past week keeps the inactive person
  assert.deepEqual(role.owners.map(o => [o.name, o.actuals]), [['Mario Rossi', 6], ['Anna Bianchi', 4]]);
  near(role.owners[0].tbp, 90);
  near(role.owners[1].tbp, 0);
});

test('legacy: a Sunday row is counted in consumed but not placed in a week cell (By Project)', () => {
  const actuals = new Map([['p1', [rec('2026-09-13', 'Mario Rossi', 4)]]]);
  const out = M.projectProjection({ projects: [TWO_ROLES()], actuals, weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(), ownerStatus: {} });
  const role = out.projects[0].tasks[0].roles[0];
  assert.equal(role.weekData['2026-09-07'], undefined);
  assert.equal(role.consumed, 4);
  assert.equal(role.owners.find(o => o.name === 'Mario Rossi').actuals, 4);
});

test('projectProjection: every owner inactive -> future hours go to the TBD row', () => {
  const actuals = new Map([['p1', [rec('2026-09-08', 'Anna Bianchi', 10)]]]);
  const out = M.projectProjection({ projects: [TWO_ROLES()], actuals, weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(),
    ownerStatus: { 'Anna Bianchi': 'inactive' } });
  const role = out.projects[0].tasks[0].roles[0];
  assert.equal(role.allOwnersInactive, true);
  assert.deepEqual(role.owners.map(o => o.name), ['Anna Bianchi', '—']);
  assert.equal(role.owners[1].isPlaceholder, true);
  near(role.owners[1].tbp, 90);
  near(role.weekData['2026-09-14'].byOwner['—'], 30);
});

test('projectProjection: no actuals -> a single TBD row; totals are summed up the tree', () => {
  const p = TWO_ROLES(); p.tasks.push({ name: 'Docs', startDate: '20260901', endDate: '20260930', completed: false, resources: [{ role: 'QA', soldHours: 30 }] });
  const out = M.projectProjection({ projects: [p], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(), ownerStatus: {} });
  const proj = out.projects[0];
  assert.equal(proj.tasks.length, 2);
  assert.equal(proj.tasks[0].roles[0].hasOwners, false);
  assert.deepEqual(proj.tasks[0].roles[0].owners.map(o => o.name), ['—']);
  assert.equal(proj.sold, 130);
  near(proj.tbp, 130);
  near(proj.weekTotals['2026-09-14'], 100 / 3 + 10);   // Build 100 h / 3 weeks + Docs 30 h / 3 weeks
});

test('projectProjection: a task with no matching role and a project with no tasks produce no nodes', () => {
  const p = TWO_ROLES();
  const out = M.projectProjection({ projects: [p], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(['NOPE']), ownerStatus: {} });
  assert.deepEqual(out.projects, []);
});

test('projectProjection: blank owner rows are attributed to the TBD placeholder owner', () => {
  const actuals = new Map([['p1', [rec('2026-09-08', '  ', 5)]]]);
  const out = M.projectProjection({ projects: [TWO_ROLES()], actuals, weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(), ownerStatus: {} });
  const role = out.projects[0].tasks[0].roles[0];
  assert.deepEqual(role.owners.map(o => o.name), ['—']);
  near(role.owners[0].actuals, 5);
});

const ROLES2 = () => PROJ({ tasks: [{ name: 'Build', startDate: '20260901', endDate: '20260930', completed: false,
  resources: [{ role: 'DEV', soldHours: 60 }, { role: 'QA', soldHours: 40 }] }] });

test('ownerProjection: task-level residual split among owners of ALL the task roles', () => {
  const actuals = new Map([['p1', [rec('2026-09-08', 'Mario', 20, 'DEV'), rec('2026-09-09', 'Anna', 10, 'QA')]]]);
  const { ownerMap } = M.ownerProjection({ projects: [ROLES2()], actuals, weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(), ownerStatus: {} });
  const mario = ownerMap.Mario, anna = ownerMap.Anna;
  near(mario.sold, 100 * (20 / 30));
  near(mario.actuals, 20);
  near(mario.tbp, 70 * (2 / 3));
  near(anna.tbp, 70 * (1 / 3));
  near(mario.weekTotals['2026-09-14'].hours, (70 / 3) * (2 / 3));
  assert.equal(mario.weekTotals['2026-09-07'].isPast, true);
  near(mario.projects.p1.tasks.Build.weekData['2026-09-14'].hours, (70 / 3) * (2 / 3));
  assert.equal(mario.projects.p1.name, 'Alpha');
});

test('ownerProjection: a Sunday row IS included in the owner week cell (inclusive rule)', () => {
  const actuals = new Map([['p1', [rec('2026-09-13', 'Mario', 4, 'DEV')]]]);
  const { ownerMap } = M.ownerProjection({ projects: [ROLES2()], actuals, weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(), ownerStatus: {} });
  near(ownerMap.Mario.weekTotals['2026-09-07'].hours, 4);
});

test('ownerProjection: the team filter changes the task residual (max(0, sum) is not a sum of maxes)', () => {
  const actuals = new Map([['p1', [rec('2026-09-08', 'Mario', 70, 'HWGDEV - DEV')]]]);
  const p = PROJ({ tasks: [{ name: 'Build', startDate: '20260901', endDate: '20260930', completed: false,
    resources: [{ role: 'HWGDEV - DEV', soldHours: 60 }, { role: 'HWGQA - QA', soldHours: 40 }] }] });
  const all = M.ownerProjection({ projects: [p], actuals, weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(), ownerStatus: {} });
  near(all.ownerMap.Mario.tbp, 30);                         // 100 sold - 70 consumed
  const dev = M.ownerProjection({ projects: [p], actuals, weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(['HWGDEV']), ownerStatus: {} });
  near(dev.ownerMap.Mario.tbp, 0);                          // 60 sold - 70 consumed, floored
});

test('ownerProjection: inactive owners get no future share; nobody active -> TBD; no owners -> TBD', () => {
  const actuals = new Map([['p1', [rec('2026-09-08', 'Anna', 10, 'DEV')]]]);
  const inactive = M.ownerProjection({ projects: [ROLES2()], actuals, weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(), ownerStatus: { Anna: 'inactive' } });
  assert.deepEqual(Object.keys(inactive.ownerMap).sort(), ['Anna', '—']);
  near(inactive.ownerMap['—'].tbp, 90);
  near(inactive.ownerMap.Anna.tbp, 0);
  const none = M.ownerProjection({ projects: [ROLES2()], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(), ownerStatus: {} });
  assert.deepEqual(Object.keys(none.ownerMap), ['—']);
  near(none.ownerMap['—'].tbp, 100);
  near(none.ownerMap['—'].sold, 100);
});

test('ownerProjection: a task without dates spreads over all visible future weeks; tasks with nothing to plan are skipped', () => {
  const p = ROLES2(); p.tasks[0].startDate = ''; p.tasks[0].endDate = '';
  const { ownerMap } = M.ownerProjection({ projects: [p], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(), ownerStatus: {} });
  assert.deepEqual(Object.keys(ownerMap['—'].weekTotals), ['2026-09-14', '2026-09-21', '2026-09-28']);
  near(ownerMap['—'].weekTotals['2026-09-14'].hours, 100 / 3);
  const zero = ROLES2(); zero.tasks[0].resources = [{ role: 'DEV', soldHours: 0 }];
  assert.deepEqual(M.ownerProjection({ projects: [zero], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(), ownerStatus: {} }).ownerMap, {});
});

test('ownerProjection: same-named tasks in one project merge (keyed by task name)', () => {
  const p = ROLES2(); p.tasks.push({ ...p.tasks[0], resources: [{ role: 'DEV', soldHours: 10 }] });
  const { ownerMap } = M.ownerProjection({ projects: [p], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(), ownerStatus: {} });
  near(ownerMap['—'].projects.p1.tasks.Build.sold, 110);
});

test('buildProjection dispatches by view and rejects unknown views', () => {
  const input = { projects: [], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(), ownerStatus: {} };
  assert.deepEqual(M.buildProjection('role', input), { roles: [] });
  assert.deepEqual(M.buildProjection('project', input), { projects: [] });
  assert.deepEqual(M.buildProjection('owner', input), { ownerMap: {} });
  assert.throws(() => M.buildProjection('nope', input), /Unknown view/);
});
