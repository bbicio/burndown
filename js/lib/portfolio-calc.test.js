import { describe, it, expect } from 'vitest';
import { computeKpis, computeBurndownPoints } from './portfolio-calc.js';

// Minimal fakes for the three injected helper functions — real behavior confirmed
// against js/core.js during Step 1; kept simple here since these tests exercise
// computeKpis'/computeBurndownPoints' own arithmetic, not the helpers' internals.
const billableTasks = cfg => (cfg?.tasks || []).filter(t => t.billable !== false);
const billableData = (data, cfg) => {
  const names = new Set(billableTasks(cfg).map(t => t.name.toLowerCase()));
  return data.filter(r => !cfg || names.has(r.task.toLowerCase()));
};
const findRate = (row, cfg) => {
  const task = (cfg?.tasks || []).find(t => t.name.toLowerCase() === row.task.toLowerCase());
  const res = task?.resources.find(r => r.role.toLowerCase() === row.role.toLowerCase());
  return res?.hourlyRate ?? 0;
};

describe('computeKpis', () => {
  it('returns dashes-equivalent (null) fields when cfg is absent', () => {
    const data = [{ task: 'Dev', role: 'Developer', hours: 5, date: new Date('2026-01-15') }];
    const result = computeKpis(data, null, billableData, billableTasks, findRate);
    expect(result.consumedHours).toBe(5);
    expect(result.soldHours).toBeNull();
    expect(result.budgetTotal).toBeNull();
  });

  it('computes sold/consumed/left correctly with a configured project', () => {
    const cfg = {
      tasks: [{ name: 'Dev', billable: true, resources: [{ role: 'Developer', soldHours: 20, hourlyRate: 100 }] }],
      ptc: [{ amount: 500 }],
    };
    const data = [
      { task: 'Dev', role: 'Developer', hours: 8, date: new Date('2026-01-10') },
      { task: 'Dev', role: 'Developer', hours: 4, date: new Date('2026-01-20') },
    ];
    const result = computeKpis(data, cfg, billableData, billableTasks, findRate);
    expect(result.consumedHours).toBe(12);
    expect(result.soldHours).toBe(20);
    expect(result.budgetTotal).toBe(2500); // 20*100 + 500 PTC
    expect(result.consumedEur).toBe(1200); // 12*100
    expect(result.hoursLeft).toBe(8);
    expect(result.budgetLeft).toBe(1300);
  });

  it('excludes non-billable tasks from sold/consumed totals', () => {
    const cfg = {
      tasks: [
        { name: 'Dev', billable: true, resources: [{ role: 'Developer', soldHours: 10, hourlyRate: 50 }] },
        { name: 'Excluded', billable: false, resources: [{ role: 'Developer', soldHours: 100, hourlyRate: 50 }] },
      ],
    };
    const data = [{ task: 'Dev', role: 'Developer', hours: 5, date: new Date('2026-01-10') }];
    const result = computeKpis(data, cfg, billableData, billableTasks, findRate);
    expect(result.soldHours).toBe(10);
  });
});

describe('computeBurndownPoints', () => {
  it('generates one point per month for the monthly interval within the project date range', () => {
    const cfg = {
      startDate: '202601', endDate: '202603',
      tasks: [{ name: 'Dev', billable: true, resources: [{ role: 'Developer', soldHours: 30, hourlyRate: 10 }] }],
    };
    const data = [{ task: 'Dev', role: 'Developer', hours: 10, date: new Date('2026-01-15') }];
    const result = computeBurndownPoints(data, cfg, '', 'monthly', billableData, billableTasks, findRate);
    expect(result.labels.length).toBe(3);
    // Monthly points sit at the 1st of each month; `date <= point` means a
    // month's own consumption isn't reflected until the NEXT point (real,
    // existing behavior in js/dashboard.js:213-216, not a bug to fix here).
    // Point 0 = Jan 1 (before the Jan 15 entry) -> full budget remaining.
    expect(result.burnValues[0]).toBeCloseTo(30, 5);
    // Point 1 = Feb 1 (Jan 15 entry now counted: 10 consumed) -> 20 remaining.
    expect(result.burnValues[1]).toBeCloseTo(20, 5);
    // Point 2 = Mar 1 (no new entries since) -> still 20 remaining.
    expect(result.burnValues[2]).toBeCloseTo(20, 5);
  });

  it('returns cumulative (not remaining) hours when the project has no config (no sold-hours budget)', () => {
    const data = [
      { task: 'Dev', role: 'Developer', hours: 3, date: new Date('2026-01-05') },
      { task: 'Dev', role: 'Developer', hours: 2, date: new Date('2026-01-25') },
    ];
    const result = computeBurndownPoints(data, null, '', 'monthly', billableData, billableTasks, findRate);
    // No cfg -> axisStart = month of earliest data point (Jan 2026), 14-month span.
    // Point 0 = Jan 1, before either entry -> 0 consumed.
    expect(result.burnValues[0]).toBeCloseTo(0, 5);
    // Point 1 = Feb 1, both January entries now counted -> 3+2 = 5.
    expect(result.burnValues[1]).toBeCloseTo(5, 5);
  });

  it('filters to a single task when taskFilter is set', () => {
    const cfg = {
      startDate: '202601', endDate: '202601',
      tasks: [
        { name: 'Dev', billable: true, resources: [{ role: 'Developer', soldHours: 10, hourlyRate: 10 }] },
        { name: 'QA', billable: true, resources: [{ role: 'Tester', soldHours: 5, hourlyRate: 10 }] },
      ],
    };
    const data = [
      { task: 'Dev', role: 'Developer', hours: 4, date: new Date('2026-01-10') },
      { task: 'QA', role: 'Tester', hours: 2, date: new Date('2026-01-10') },
    ];
    const result = computeBurndownPoints(data, cfg, 'Dev', 'monthly', billableData, billableTasks, findRate);
    // Single-month project -> exactly one point, at Jan 1, before any entries.
    // This only exercises the budget/task-filter selection (budget=10 for 'Dev' alone),
    // not the consumption-accumulation path, since the lone point predates all data.
    expect(result.points.length).toBe(1);
    expect(result.burnValues[0]).toBeCloseTo(10, 5);
  });
});
