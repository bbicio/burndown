import { describe, it, expect } from 'vitest';
import { paceJudgment, breakdownRows, taskSubtitle, roleSubtitle, groupSubtitle, entriesByMonth, hoursByMonth, monthState, todayIndex, roleColumns, areaColumns } from './project-report-calc.js';

// Stand-ins for js/core.js's billableTasks/billableData/findRate (same rules: billable filter,
// exact role on the task, else the task's first resource).
const billableTasks = cfg => (cfg?.tasks || []).filter(t => t.billable !== false);
const billableData = (data, cfg) => {
  const names = new Set(billableTasks(cfg).map(t => t.name.toLowerCase()));
  return data.filter(r => names.has(r.task.toLowerCase()));
};
const findRate = (row, cfg) => {
  const task = (cfg?.tasks || []).find(t => t.name.toLowerCase() === row.task.toLowerCase());
  if (!task) return null;
  const res = task.resources.find(r => r.role.toLowerCase() === row.role.toLowerCase());
  if (res) return res.hourlyRate;
  return task.resources.length ? task.resources[0].hourlyRate : null;
};
const DEPS = { billableData, billableTasks, findRate };
const NO_RANGE = { start: null, end: null };

// Fixture F (plan Task 1): a role on two tasks, a role in two groups (Tester on Dev),
// and Designer logged on Dev where it is not configured.
const F = {
  tasks: [
    { name: 'Dev', billable: true, resources: [{ role: 'Developer', soldHours: 100, hourlyRate: 50 }, { role: 'Tester', soldHours: 20, hourlyRate: 40 }] },
    { name: 'QA', billable: true, resources: [{ role: 'Tester', soldHours: 30, hourlyRate: 40 }] },
  ],
  groups: [
    { name: 'Build', entries: [{ role: 'Developer', task: '' }, { role: 'Tester', task: 'Dev' }] },
    { name: 'Quality', entries: [{ role: 'Tester', task: '' }] },
  ],
};
const F_ROWS = [
  { task: 'Dev', role: 'Developer', hours: 10, date: new Date(2026, 0, 10) },
  { task: 'Dev', role: 'Tester', hours: 4, date: new Date(2026, 0, 11) },
  { task: 'QA', role: 'Tester', hours: 6, date: new Date(2026, 1, 12) },
  { task: 'Dev', role: 'Designer', hours: 3, date: new Date(2026, 0, 13) },
];

describe('paceJudgment', () => {
  it('returns null without a vsTime', () => {
    expect(paceJudgment(null)).toBe(null);
  });
  it('is on-track within ±10 points, inclusive', () => {
    expect(paceJudgment(10)).toBe('on-track');
    expect(paceJudgment(-10)).toBe('on-track');
  });
  it('is ahead above +10 and behind below -10', () => {
    expect(paceJudgment(10.5)).toBe('ahead');
    expect(paceJudgment(-11)).toBe('behind');
  });
  it('accepts a custom threshold', () => {
    expect(paceJudgment(4, 3)).toBe('ahead');
  });
});

describe('breakdownRows', () => {
  const over = { label: 'PM', soldHours: 20, soldEur: 3200, totalConsumed: 22, totalConsumedEur: 3520, inPeriod: 5, inPeriodEur: 800 };

  it('uses the total consumption as Spent without a filter', () => {
    const [r] = breakdownRows([over], false).rows;
    expect(r.spentHours).toBe(22);
    expect(r.spentAmount).toBe(3520);
    expect(r.remainingHours).toBe(-2);
    expect(r.remainingAmount).toBe(-320);
    expect(r.pct).toBe(110);
    expect(r.overSold).toBe(true);
    expect(r.barState).toBe('danger');
    expect(r.label).toBe('PM');
    expect(r.soldHours).toBe(20);
    expect(r.soldAmount).toBe(3200);
  });

  it('uses the in-period consumption as Spent with a filter, Remaining and % unchanged', () => {
    const [r] = breakdownRows([over], true).rows;
    expect(r.spentHours).toBe(5);
    expect(r.spentAmount).toBe(800);
    expect(r.remainingHours).toBe(-2);
    expect(r.pct).toBe(110);
  });

  it('shows Spent 0 for a period without entries, the rest unchanged', () => {
    const [r] = breakdownRows([{ ...over, inPeriod: 0, inPeriodEur: 0 }], true).rows;
    expect(r.spentHours).toBe(0);
    expect(r.spentAmount).toBe(0);
    expect(r.remainingHours).toBe(-2);
    expect(r.pct).toBe(110);
    expect(r.overSold).toBe(true);
  });

  it('flags an unsold row with consumed hours as over sold', () => {
    const [r] = breakdownRows([{ label: 'X', soldHours: 0, soldEur: 0, totalConsumed: 5, totalConsumedEur: 500, inPeriod: 0, inPeriodEur: 0 }], false).rows;
    expect(r.pct).toBe(null);
    expect(r.overSold).toBe(true);
    expect(r.barState).toBe('danger');
  });

  it('gives warning between 85 and 100 without over sold', () => {
    const [r] = breakdownRows([{ label: 'Y', soldHours: 40, soldEur: 4000, totalConsumed: 38.75, totalConsumedEur: 3875, inPeriod: 0, inPeriodEur: 0 }], false).rows;
    expect(r.pct).toBe(97);
    expect(r.barState).toBe('warning');
    expect(r.overSold).toBe(false);
  });

  it('builds the total row with the same rules over the sums', () => {
    const other = { label: 'Dev', soldHours: 40, soldEur: 4000, totalConsumed: 10, totalConsumedEur: 1000, inPeriod: 3, inPeriodEur: 300 };
    const { total } = breakdownRows([over, other], true);
    expect(total.soldHours).toBe(60);
    expect(total.soldAmount).toBe(7200);
    expect(total.spentHours).toBe(8);
    expect(total.spentAmount).toBe(1100);
    expect(total.remainingHours).toBe(28);
    expect(total.remainingAmount).toBe(2680);
    expect(total.pct).toBe(53);
    expect(total.overSold).toBe(false);
    expect(total.barState).toBe('normal');
  });

  it('returns an empty total for no columns', () => {
    const { rows, total } = breakdownRows([], false);
    expect(rows).toEqual([]);
    expect(total.soldHours).toBe(0);
    expect(total.pct).toBe(null);
    expect(total.overSold).toBe(false);
  });
});

describe('taskSubtitle', () => {
  const task = { name: 'Project Management', resources: [{ role: 'Director' }, { role: 'PM' }, { role: 'Dev' }] };
  it('lists the role count and the areas that claim one of the task roles', () => {
    const groups = [
      { name: 'Governance', entries: [{ role: 'Director', task: 'Project Management' }] },
      { name: 'Delivery', entries: [{ role: 'dev', task: '' }] },
      { name: 'Other', entries: [{ role: 'Dev', task: 'Content' }] },
    ];
    expect(taskSubtitle(task, groups)).toBe('3 roles · Governance · Delivery');
  });
  it('omits the areas when none claims the task', () => {
    expect(taskSubtitle(task, [])).toBe('3 roles');
    expect(taskSubtitle(task, undefined)).toBe('3 roles');
  });
  it('uses the singular for one role', () => {
    expect(taskSubtitle({ name: 'T', resources: [{ role: 'A' }] }, [])).toBe('1 role');
  });
});

describe('roleSubtitle', () => {
  const rows = [
    { role: 'Director', task: 'Project Management', owner: 'Ann' },
    { role: 'director', task: 'project management', owner: 'Bob' },
    { role: 'Director', task: 'Project Management', owner: 'Ann' },
    { role: 'Director', task: 'Other', owner: 'Cy' },
  ];
  it('lists the distinct owners and the task name as first written', () => {
    expect(roleSubtitle('director', 'project management', rows)).toBe('Ann, Bob · Project Management');
  });
  it('falls back to the task name without entries', () => {
    expect(roleSubtitle('director', 'project management', [])).toBe('project management');
  });
});

describe('groupSubtitle', () => {
  it('lists the tasks covered by the group in task order, wildcards included', () => {
    const group = { name: 'A', entries: [{ role: 'Dev', task: 'FE' }, { role: 'QA', task: '' }] };
    const tasks = [
      { name: 'FE', resources: [{ role: 'Dev' }] },
      { name: 'Content', resources: [{ role: 'QA' }] },
      { name: 'QA', resources: [{ role: 'QA' }] },
      { name: 'BE', resources: [{ role: 'Dev' }] },
    ];
    expect(groupSubtitle(group, tasks)).toBe('FE, Content, QA');
  });
  it('reads legacy roles-only groups', () => {
    expect(groupSubtitle({ roles: ['Dev'] }, [{ name: 'FE', resources: [{ role: 'Dev' }] }])).toBe('FE');
  });
});

describe('entriesByMonth', () => {
  const rows = [
    { date: new Date(2026, 7, 20), hours: 2, role: 'Dev' },
    { date: new Date(2026, 8, 15), hours: 3, role: 'Dev' },
    { date: new Date(2026, 8, 2), hours: 1, role: 'Ghost' },
    { date: new Date(2026, 7, 3), hours: 4, role: 'Dev' },
  ];
  const rateFor = r => (r.role === 'Ghost' ? null : 100);

  it('groups by month, most recent first, rows by ascending date', () => {
    const months = entriesByMonth(rows, rateFor);
    expect(months.map(m => m.ym)).toEqual(['2026-09', '2026-08']);
    expect(months[0].rows.map(r => r.date.getDate())).toEqual([2, 15]);
    expect(months[1].rows.map(r => r.date.getDate())).toEqual([3, 20]);
    expect(months[1].count).toBe(2);
    expect(months[1].hours).toBe(6);
    expect(months[1].amount).toBe(600);
  });

  it('sums only the known amounts and marks an unknown rate as null', () => {
    const [sep] = entriesByMonth(rows, rateFor);
    expect(sep.amount).toBe(300);
    expect(sep.rows[0].amount).toBe(null);
    expect(sep.rows[1].amount).toBe(300);
    expect(Number.isNaN(sep.amount)).toBe(false);
  });

  it('returns an empty list for no rows', () => {
    expect(entriesByMonth([], rateFor)).toEqual([]);
  });
});

describe('hoursByMonth', () => {
  it('sums hours per YYYY-MM', () => {
    expect(hoursByMonth([
      { date: new Date(2026, 7, 1), hours: 2 },
      { date: new Date(2026, 7, 31), hours: 1.5 },
      { date: new Date(2026, 8, 1), hours: 4 },
    ])).toEqual({ '2026-08': 3.5, '2026-09': 4 });
  });
});

describe('monthState', () => {
  const today = new Date(2026, 8, 22);
  it('classifies a month against today, in both key formats', () => {
    expect(monthState('202609', today)).toBe('current');
    expect(monthState('202608', today)).toBe('past');
    expect(monthState('2026-10', today)).toBe('future');
    expect(monthState('2025-12', today)).toBe('past');
  });
});

describe('breakdownRows — float residue', () => {
  it('is not over sold when the consumption equals the sold hours up to a float residue', () => {
    const col = { label: 'T', soldHours: 0.3, soldEur: 30, totalConsumed: 0.1 + 0.1 + 0.1, totalConsumedEur: 30, inPeriod: 0, inPeriodEur: 0 };
    const { rows } = breakdownRows([col], false);
    expect(rows[0].overSold).toBe(false);
    expect(rows[0].remainingHours).toBe(0);
    expect(rows[0].soldKnown).toBe(true);
  });
});

describe('todayIndex re-export', () => {
  // Behavioural, not identity: the ?v= query makes the re-exported module a separate instance.
  it('behaves as the portfolio-calc.js function', async () => {
    const pc = await import('./portfolio-calc.js');
    const pts = [new Date(2026, 0, 1), new Date(2026, 1, 1)];
    const today = new Date(2026, 1, 10);
    expect(todayIndex(pts, today)).toBe(pc.todayIndex(pts, today));
    expect(todayIndex(pts, today)).toBe(1);
  });
});

describe('roleColumns / areaColumns — characterization (pre-fix)', () => {
  it('roleColumns has only the configured (role, task) pairs', () => {
    const cols = roleColumns(F_ROWS, F, NO_RANGE, DEPS);
    expect(cols.map(c => `${c.role}|${c.task}`)).toEqual(['Developer|Dev', 'Tester|Dev', 'Tester|QA']);
    expect(cols.map(c => c.totalConsumed)).toEqual([10, 4, 6]);
  });
  it('areaColumns counts Tester on Dev in both groups', () => {
    const cols = areaColumns(F_ROWS, F, NO_RANGE, DEPS);
    expect(cols.map(c => [c.label, c.totalConsumed])).toEqual([['Build', 14], ['Quality', 10]]);
  });
});
