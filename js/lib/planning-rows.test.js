import { describe, it, expect } from 'vitest';
import {
  formatCell, workingWeeks, loadLevel, initials, isoWeek, filterRows, visibleRows,
  buildRoleRows, buildProjectRows, buildOwnerRows,
} from './planning-rows.js';

describe('formatCell', () => {
  it('shows "<1h" for a pulse below half an hour', () => {
    expect(formatCell(0.3, { pulse: true, round: true })).toBe('<1h');
  });
  it('prefixes a pulse with "~"', () => {
    expect(formatCell(3.4, { pulse: true, round: true })).toBe('~3h');
  });
  it('shows "<1h" for a non-pulse value below 1h when Rounded', () => {
    expect(formatCell(0.45, { pulse: false, round: true })).toBe('<1h');
  });
  it('keeps two decimals when Rounded is off', () => {
    expect(formatCell(0.45, { pulse: false, round: false })).toBe('0.45h');
  });
  it('rounds to whole hours when Rounded', () => {
    expect(formatCell(12.6, { pulse: false, round: true })).toBe('13h');
  });
  it('leaves zero and near-zero cells empty', () => {
    expect(formatCell(0, { pulse: false, round: true })).toBe('');
    expect(formatCell(0.004, { pulse: true, round: true })).toBe('');
    expect(formatCell(undefined, { pulse: false, round: true })).toBe('');
  });
});

describe('loadLevel', () => {
  it('uses the exact 24h / 30h weekly thresholds', () => {
    expect(loadLevel(24, 1)).toBe('high');
    expect(loadLevel(23.9, 1)).toBe(null);
    expect(loadLevel(30, 1)).toBe('over');
  });
  it('normalises a monthly total on its working weeks', () => {
    expect(loadLevel(96, 4)).toBe('high');
    expect(loadLevel(110, 4.4)).toBe('high');
    expect(loadLevel(140, 4.4)).toBe('over');
  });
});

describe('workingWeeks', () => {
  it('counts the weekdays of a month (Monthly) over 5', () => {
    expect(workingWeeks({ key: 'Oct 2026' }, 'monthly')).toBeCloseTo(22 / 5);
  });
  it('counts the weekdays of a full Monday–Sunday week (Weekly) over 5', () => {
    const w = { weekStart: new Date(2026, 9, 12), weekEnd: new Date(2026, 9, 18) };
    expect(workingWeeks(w, 'weekly')).toBe(1);
  });
});

describe('initials', () => {
  it('takes the first letter of the first and last word', () => {
    expect(initials('Michal Wadowski')).toBe('MW');
    expect(initials('  Anna  Maria Rossi ')).toBe('AR');
  });
  it('takes two letters of a single word', () => {
    expect(initials('chiara')).toBe('CH');
  });
});

describe('isoWeek', () => {
  it('returns the ISO week number, including W53 and W1 across the year', () => {
    expect(isoWeek(new Date(2026, 9, 12))).toBe(42);
    expect(isoWeek(new Date(2026, 11, 31))).toBe(53);
    expect(isoWeek(new Date(2027, 0, 4))).toBe(1);
  });
});

// a > a1 > a11, b > b1
const tree = [
  { id: 'a', parentId: null, label: 'a', sub: '' },
  { id: 'a1', parentId: 'a', label: 'a1', sub: '' },
  { id: 'a11', parentId: 'a1', label: 'a11', sub: '' },
  { id: 'b', parentId: null, label: 'b', sub: 'beta client' },
  { id: 'b1', parentId: 'b', label: 'b1', sub: '' },
];
const ids = rows => rows.map(r => r.id);

describe('filterRows', () => {
  it('keeps a matching row and its ancestors, forcing the ancestors open', () => {
    const f = filterRows(tree, 'a11');
    expect([...f.visibleIds].sort()).toEqual(['a', 'a1', 'a11']);
    expect([...f.forcedOpenIds].sort()).toEqual(['a', 'a1']);
  });
  it('is case-insensitive and keeps the descendants of a matching row', () => {
    const f = filterRows(tree, 'A1');
    expect([...f.visibleIds].sort()).toEqual(['a', 'a1', 'a11']);
  });
  it('matches on the second line (sub) too', () => {
    const f = filterRows(tree, 'BETA');
    expect([...f.visibleIds].sort()).toEqual(['b', 'b1']);
  });
  it('shows everything and forces nothing on an empty query', () => {
    const f = filterRows(tree, '  ');
    expect(f.visibleIds).toBe(null);
    expect(f.forcedOpenIds.size).toBe(0);
  });
});

describe('visibleRows', () => {
  it('shows only the roots when nothing is open', () => {
    expect(ids(visibleRows(tree, new Set(), null))).toEqual(['a', 'b']);
  });
  it('shows the children of an open row', () => {
    expect(ids(visibleRows(tree, new Set(['a']), null))).toEqual(['a', 'a1', 'b']);
  });
  it('opens the ancestors of a search match without writing to openIds', () => {
    const openIds = new Set();
    expect(ids(visibleRows(tree, openIds, filterRows(tree, 'a11')))).toEqual(['a', 'a1', 'a11']);
    expect(openIds.size).toBe(0);
    // clearing the search: the parent is closed again
    expect(ids(visibleRows(tree, openIds, filterRows(tree, '')))).toEqual(['a', 'b']);
  });
});

// ── Row builders ────────────────────────────────────────────────────────────────────────────
const wk = (y, m, d) => new Date(y, m, d);
const P0 = { weekStart: wk(2026, 9, 5), weekEnd: wk(2026, 9, 11), isPast: true, isCurrent: false };
const P1 = { weekStart: wk(2026, 9, 12), weekEnd: wk(2026, 9, 18), isPast: false, isCurrent: true };
const periods = [P0, P1];
const K0 = P0.weekStart.toISOString(), K1 = P1.weekStart.toISOString();

const PROJECTS = {
  p1: { id: 'p1', name: 'Alpha', stage: 'Committed', status: 'Started', client: 'Acme', start: '20260101', end: '20261231' },
  p2: { id: 'p2', name: 'Beta <&>', stage: 'SIP', status: 'Not started yet', client: 'Bayer', start: '', end: '' },
};
const TASK_ROLES = { 'p1::Build': ['HWGDEV - Developer'], 'p1::Run': ['HWGDEV - Developer', 'HWGDEV - Director'], 'p2::Plan': ['HWGDEV - Director'] };
const baseOpts = {
  interval: 'weekly', round: true, ownerStatus: { Ann: 'active', Bob: 'inactive' },
  projectInfo: idOrName => Object.values(PROJECTS).find(p => p.id === idOrName || p.name === idOrName) || null,
  taskRoles: (pid, task) => TASK_ROLES[`${pid}::${task}`] || [],
};

const roleModel = {
  roleMap: {
    'HWGDEV - Developer': {
      [K0]: { hours: 5, isPast: true, isPulse: false, breakdown: [{ project: 'Alpha', task: 'Build', hours: 5 }] },
      [K1]: { hours: 8, isPast: false, isPulse: false, breakdown: [{ project: 'Alpha', task: 'Build', hours: 6 }, { project: 'Alpha', task: 'Run', hours: 2 }] },
    },
    'HWGDEV - Director': {
      [K1]: { hours: 0.3, isPast: false, isPulse: true, breakdown: [{ project: 'Beta <&>', task: 'Plan', hours: 0.3 }] },
    },
  },
  roleSoldMap: { 'HWGDEV - Developer': 40, 'HWGDEV - Director': 10 },
  roleActualsMap: { 'HWGDEV - Developer': 5, 'HWGDEV - Director': 0 },
  roleChildMap: {
    'HWGDEV - Developer': {
      'Alpha::Run': { project: 'Alpha', task: 'Run', sold: 10, actual: 0 },
      'Alpha::Build': { project: 'Alpha', task: 'Build', sold: 30, actual: 5 },
    },
    'HWGDEV - Director': { 'Beta <&>::Plan': { project: 'Beta <&>', task: 'Plan', sold: 10, actual: 0 } },
  },
};

describe('buildRoleRows', () => {
  const { rows, total } = buildRoleRows(roleModel, periods, baseOpts);
  it('emits one role row per role, alphabetically, with its pairs ordered by sold + actual', () => {
    expect(rows.map(r => r.id)).toEqual([
      'role:HWGDEV - Developer', 'role:HWGDEV - Developer|Alpha::Build', 'role:HWGDEV - Developer|Alpha::Run',
      'role:HWGDEV - Director', 'role:HWGDEV - Director|Beta <&>::Plan',
    ]);
    expect(rows.filter(r => r.kind === 'role').map(r => r.label)).toEqual(['HWGDEV · Developer', 'HWGDEV · Director']);
    const devPairs = rows.filter(r => r.parentId === 'role:HWGDEV - Developer');
    expect(devPairs.map(r => r.sub)).toEqual(['Build', 'Run']);
    expect(devPairs[0]).toMatchObject({ kind: 'pair', depth: 1, label: 'Alpha', stage: 'Committed', sold: 30, actuals: 5, toPlan: 25 });
  });
  it('computes the pair cells from the role breakdown, keeping the pulse flag', () => {
    const build = rows.find(r => r.id === 'role:HWGDEV - Developer|Alpha::Build');
    expect(build.cells.map(c => c.h)).toEqual([5, 6]);
    const plan = rows.find(r => r.id === 'role:HWGDEV - Director|Beta <&>::Plan');
    expect(plan.cells[1]).toMatchObject({ h: 0.3, pulse: true, past: false, current: true });
  });
  it('gives the role row its sold, actuals and future hours as To plan', () => {
    expect(rows[0]).toMatchObject({ kind: 'role', depth: 0, parentId: null, sold: 40, actuals: 5, toPlan: 8 });
    expect(rows[0].cells.map(c => c.h)).toEqual([5, 8]);
  });
  it('never colours a load', () => {
    expect(rows.flatMap(r => r.cells).every(c => c.load === null)).toBe(true);
  });
  it('totals the role rows and counts the pairs', () => {
    expect(total).toMatchObject({ count: 3, sold: 50, actuals: 5 });
    expect(total.toPlan).toBeCloseTo(8.3);
    expect(total.cells.map(c => c.h)).toEqual([5, 8.3]);
    expect(total.cells[0]).toMatchObject({ past: true, current: false });
  });
});

const projectModel = {
  projects: [
    {
      id: 'p1', sold: 40, actuals: 5, tbp: 35, weekTotals: { [K0]: 5, [K1]: 8 },
      tasks: [
        {
          name: 'Build', sold: 30, actuals: 5, tbp: 25, weekTotals: { [K0]: 5, [K1]: 6 },
          roles: [{
            role: 'HWGDEV - Developer', sold: 30, consumed: 5, tbp: 25, hasOwners: true, allOwnersInactive: false,
            weekData: { [K0]: { total: 5, byOwner: { Ann: 3, Bob: 2 }, isPulse: false }, [K1]: { total: 6, byOwner: { Ann: 6 }, isPulse: false } },
            owners: [{ name: 'Ann', isPlaceholder: false, actuals: 3, tbp: 25 }, { name: 'Bob', isPlaceholder: false, actuals: 2, tbp: 0 }],
          }],
        },
        {
          name: 'Run', sold: 10, actuals: 0, tbp: 10, weekTotals: { [K1]: 2 },
          roles: [
            {
              role: 'HWGDEV - Developer', sold: 6, consumed: 0, tbp: 6, hasOwners: false, allOwnersInactive: false,
              weekData: { [K1]: { total: 1.2, byOwner: { '—': 1.2 }, isPulse: true } },
              owners: [{ name: '—', isPlaceholder: true, actuals: 0, tbp: 6 }],
            },
            {
              role: 'HWGDEV - Director', sold: 4, consumed: 0, tbp: 4, hasOwners: false, allOwnersInactive: false,
              weekData: { [K1]: { total: 0.8, byOwner: { '—': 0.8 }, isPulse: false } },
              owners: [{ name: '—', isPlaceholder: true, actuals: 0, tbp: 4 }],
            },
          ],
        },
      ],
    },
    {
      id: 'p2', sold: 10, actuals: 0, tbp: 10, weekTotals: { [K1]: 0.3 },
      tasks: [{
        name: 'Plan', sold: 10, actuals: 0, tbp: 10, weekTotals: { [K1]: 0.3 },
        roles: [{
          role: 'HWGDEV - Director', sold: 10, consumed: 0, tbp: 10, hasOwners: true, allOwnersInactive: false,
          weekData: { [K1]: { total: 0.3, byOwner: { Ann: 0.3 }, isPulse: true } },
          owners: [{ name: 'Ann', isPlaceholder: false, actuals: 0, tbp: 10 }],
        }],
      }],
    },
  ],
};

describe('buildProjectRows', () => {
  const { rows, total } = buildProjectRows(projectModel, periods, baseOpts);
  it('builds three levels project → task → role, with stable key-derived ids', () => {
    expect(rows.map(r => [r.id, r.kind, r.depth])).toEqual([
      ['p:p1', 'project', 0], ['p:p1|t:Build', 'task', 1], ['p:p1|t:Build|r:HWGDEV - Developer', 'roleLeaf', 2],
      ['p:p1|t:Run', 'task', 1], ['p:p1|t:Run|r:HWGDEV - Developer', 'roleLeaf', 2], ['p:p1|t:Run|r:HWGDEV - Director', 'roleLeaf', 2],
      ['p:p2', 'project', 0], ['p:p2|t:Plan', 'task', 1], ['p:p2|t:Plan|r:HWGDEV - Director', 'roleLeaf', 2],
    ]);
  });
  it('carries the project pills, client and dates', () => {
    expect(rows[0]).toMatchObject({ label: 'Alpha', stage: 'Committed', status: 'Started', client: 'Acme', sub: 'Acme', start: '20260101', end: '20261231', sold: 40, actuals: 5, toPlan: 35 });
  });
  it('labels a task with its role count', () => {
    expect(rows.find(r => r.id === 'p:p1|t:Build').sub).toBe('1 role');
    expect(rows.find(r => r.id === 'p:p1|t:Run').sub).toBe('2 roles');
  });
  it('shows a role with two owners as one leaf whose hours are their sum', () => {
    const leaf = rows.find(r => r.id === 'p:p1|t:Build|r:HWGDEV - Developer');
    expect(leaf.owners).toEqual([{ name: 'Ann', initials: 'AN', inactive: false }, { name: 'Bob', initials: 'BO', inactive: true }]);
    expect(leaf).toMatchObject({ label: 'HWGDEV · Developer', sub: 'Ann, Bob', sold: 30, actuals: 5, toPlan: 25 });
    expect(leaf.cells.map(c => c.h)).toEqual([5, 6]);
  });
  it('shows no owner for the placeholder', () => {
    const leaf = rows.find(r => r.id === 'p:p1|t:Run|r:HWGDEV - Developer');
    expect(leaf.owners).toEqual([]);
    expect(leaf.sub).toBe('No owner yet');
    expect(leaf.cells[1]).toMatchObject({ h: 1.2, pulse: true });
  });
  it('marks a task or project period as pulse when a role in it is', () => {
    expect(rows.find(r => r.id === 'p:p2').cells[1].pulse).toBe(true);
    expect(rows.find(r => r.id === 'p:p1|t:Build').cells[1].pulse).toBe(false);
  });
  it('never colours a load', () => {
    expect(rows.flatMap(r => r.cells).every(c => c.load === null)).toBe(true);
  });
  it('totals the projects and counts the role leaves', () => {
    expect(total).toMatchObject({ count: 4, sold: 50, actuals: 5, toPlan: 45 });
    expect(total.cells.map(c => c.h)).toEqual([5, 8.3]);
  });
  it('skips a project the page does not know', () => {
    const r = buildProjectRows(projectModel, periods, { ...baseOpts, projectInfo: id => (id === 'p2' ? PROJECTS.p2 : null) });
    expect(r.rows[0].id).toBe('p:p2');
    expect(r.total.sold).toBe(10);
  });
  it('keeps the ids of the remaining rows when a project disappears (re-fetch)', () => {
    const fewer = { projects: projectModel.projects.slice(1) };
    const again = buildProjectRows(fewer, periods, baseOpts).rows.map(r => r.id);
    expect(again).toEqual(rows.filter(r => r.id.startsWith('p:p2')).map(r => r.id));
  });
});

const ownerModel = {
  Bob: {
    sold: 12, actuals: 2, tbp: 10, weekTotals: { [K0]: { hours: 2, isPulse: false }, [K1]: { hours: 30, isPulse: false } },
    projects: { p1: { name: 'Alpha', sold: 12, actuals: 2, tbp: 10, weekTotals: { [K0]: { hours: 2, isPulse: false }, [K1]: { hours: 30, isPulse: false } },
      tasks: { Build: { sold: 12, actuals: 2, tbp: 10, weekData: { [K0]: { hours: 2, isPulse: false }, [K1]: { hours: 30, isPulse: false } } } } } },
  },
  '—': {
    sold: 10, actuals: 0, tbp: 10, weekTotals: { [K1]: { hours: 2, isPulse: true } },
    projects: { p1: { name: 'Alpha', sold: 10, actuals: 0, tbp: 10, weekTotals: { [K1]: { hours: 2, isPulse: true } },
      tasks: { Run: { sold: 10, actuals: 0, tbp: 10, weekData: { [K1]: { hours: 2, isPulse: true } } } } } },
  },
  Ann: {
    sold: 40, actuals: 3, tbp: 35, weekTotals: { [K0]: { hours: 40, isPulse: false }, [K1]: { hours: 24, isPulse: false } },
    projects: {
      p2: { name: 'Beta <&>', sold: 10, actuals: 0, tbp: 10, weekTotals: { [K1]: { hours: 0.3, isPulse: true } },
        tasks: { Plan: { sold: 10, actuals: 0, tbp: 10, weekData: { [K1]: { hours: 0.3, isPulse: true } } } } },
      p1: { name: 'Alpha', sold: 30, actuals: 3, tbp: 25, weekTotals: { [K0]: { hours: 40, isPulse: false }, [K1]: { hours: 23.7, isPulse: false } },
        tasks: { Run: { sold: 5, actuals: 0, tbp: 5, weekData: {} }, Build: { sold: 25, actuals: 3, tbp: 20, weekData: { [K0]: { hours: 40, isPulse: false }, [K1]: { hours: 23.7, isPulse: false } } } } },
    },
  },
};

describe('buildOwnerRows', () => {
  const { rows, total } = buildOwnerRows(ownerModel, periods, baseOpts);
  const roots = rows.filter(r => r.depth === 0);
  it('puts Unassigned (TBD) first, then people alphabetically', () => {
    expect(roots.map(r => r.id)).toEqual(['o:—', 'o:Ann', 'o:Bob']);
    expect(roots[0]).toMatchObject({ kind: 'tbd', label: 'Unassigned (TBD)', sub: 'No owner found in actuals, or every owner is inactive' });
    expect(roots[1]).toMatchObject({ kind: 'person', label: 'Ann', inactive: false });
    expect(roots[2].inactive).toBe(true);
  });
  it('builds person → project → task, projects and tasks by name', () => {
    expect(rows.filter(r => r.id.startsWith('o:Ann')).map(r => r.id)).toEqual([
      'o:Ann', 'o:Ann|p:p1', 'o:Ann|p:p1|t:Build', 'o:Ann|p:p1|t:Run', 'o:Ann|p:p2', 'o:Ann|p:p2|t:Plan',
    ]);
    expect(rows.find(r => r.id === 'o:Ann|p:p1')).toMatchObject({ kind: 'project', label: 'Alpha', stage: 'Committed', status: 'Started', client: 'Acme', sub: 'Acme' });
  });
  it('describes a person by projects and roles, and a task by its single role', () => {
    expect(roots[1].sub).toBe('2 projects · HWGDEV · Developer, HWGDEV · Director');
    expect(roots[2].sub).toBe('1 project · HWGDEV · Developer');
    expect(rows.find(r => r.id === 'o:Ann|p:p1|t:Build').sub).toBe('HWGDEV · Developer');
    expect(rows.find(r => r.id === 'o:Ann|p:p1|t:Run').sub).toBe('2 roles');
  });
  it('colours the load of a person on current or future non-pulse cells only', () => {
    const bob = rows.find(r => r.id === 'o:Bob');
    expect(bob.cells[1]).toMatchObject({ h: 30, load: 'over' });
    const ann = rows.find(r => r.id === 'o:Ann');
    expect(ann.cells[0].load).toBe(null);           // 40h, but past
    expect(ann.cells[1].load).toBe('high');         // 24h in a full week
    expect(rows.find(r => r.id === 'o:—').cells[1].load).toBe(null); // pulse
    expect(rows.filter(r => r.depth > 0).flatMap(r => r.cells).every(c => c.load === null)).toBe(true);
  });
  it('normalises a monthly person cell on the working weeks of the month', () => {
    const oct = { key: 'Oct 2026', weekKeys: [K0, K1], isPast: false, isCurrent: true };
    const m = { Ann: { sold: 0, actuals: 0, tbp: 0, weekTotals: { [K0]: { hours: 60, isPulse: false }, [K1]: { hours: 50, isPulse: false } }, projects: {} } };
    const r = buildOwnerRows(m, [oct], { ...baseOpts, interval: 'monthly' }).rows[0];
    expect(r.cells[0]).toMatchObject({ h: 110, load: 'high' }); // 110h / 4.4 weeks = 25h
  });
  it('totals the owners and counts the tasks', () => {
    expect(total).toMatchObject({ count: 5, sold: 62, actuals: 5, toPlan: 55 });
    expect(total.cells.map(c => c.h)).toEqual([42, 56]);
  });
});
