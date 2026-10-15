import { describe, it, expect } from 'vitest';
import { paceJudgment, breakdownRows, taskSubtitle, roleSubtitle, groupSubtitle, entriesByMonth, hoursByMonth, monthState, todayIndex } from './project-report-calc.js';

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

describe('todayIndex', () => {
  const pts = [new Date(2026, 0, 1), new Date(2026, 1, 1), new Date(2026, 2, 1)];
  it('returns the last point on or before today', () => {
    expect(todayIndex(pts, new Date(2026, 1, 15))).toBe(1);
    expect(todayIndex(pts, new Date(2026, 1, 1))).toBe(1);
  });
  it('returns null before the first point', () => {
    expect(todayIndex(pts, new Date(2025, 11, 31))).toBe(null);
  });
  it('keeps the last point within one interval after it, null beyond', () => {
    expect(todayIndex(pts, new Date(2026, 2, 20))).toBe(2);
    expect(todayIndex(pts, new Date(2026, 3, 10))).toBe(null);
  });
  it('uses a 31-day window with a single point', () => {
    expect(todayIndex([new Date(2026, 0, 1)], new Date(2026, 0, 20))).toBe(0);
    expect(todayIndex([new Date(2026, 0, 1)], new Date(2026, 1, 15))).toBe(null);
  });
  it('with axis bounds, keeps the last point until the axis end, whatever the last step', () => {
    const bounds = { start: new Date(2026, 0, 1), end: new Date(2026, 2, 31) };
    expect(todayIndex(pts, new Date(2026, 2, 29, 12), bounds)).toBe(2);
    expect(todayIndex(pts, new Date(2026, 2, 31, 18), bounds)).toBe(2);
    expect(todayIndex(pts, new Date(2026, 3, 1), bounds)).toBe(null);
    const q = [new Date(2026, 0, 1), new Date(2026, 3, 1)];
    expect(todayIndex(q, new Date(2026, 5, 30), { start: new Date(2026, 0, 1), end: new Date(2026, 5, 30) })).toBe(1);
  });
  it('with axis bounds, returns null before the axis start even if a point precedes it', () => {
    const weekly = [new Date(2025, 11, 29), new Date(2026, 0, 5)];
    expect(todayIndex(weekly, new Date(2025, 11, 30), { start: new Date(2026, 0, 1), end: new Date(2026, 0, 31) })).toBe(null);
  });
  it('returns null without points or without today', () => {
    expect(todayIndex([], new Date())).toBe(null);
    expect(todayIndex(null, new Date())).toBe(null);
    expect(todayIndex(pts, null)).toBe(null);
  });
});
