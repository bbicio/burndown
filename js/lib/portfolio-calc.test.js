import { describe, it, expect } from 'vitest';
import { computeKpis, computeBurndownPoints, buildSummaryCols, summaryTotals, normalizeGroupEntries, entryMatchesRow } from './portfolio-calc.js';

// Minimal fakes for the three injected helper functions — real behavior confirmed
// against js/core.js during Step 1; kept simple here since these tests exercise
// computeKpis'/computeBurndownPoints' own arithmetic, not the helpers' internals.
const billableTasks = cfg => (cfg?.tasks || []).filter(t => t.billable !== false);
const billableData = (data, cfg) => {
  const names = new Set(billableTasks(cfg).map(t => t.name.toLowerCase()));
  return data.filter(r => !cfg || names.has(r.task.toLowerCase()));
};
// Mirrors api/src/lib/rate-resolve.js's resolveFee()/js/core.js's findRate(): matches
// task by name, then tries an exact role match within that task's resources, falling
// back to the task's first/only resource when the row's role text doesn't match any
// of them — the real fallback that makes the same raw "role" string resolve to a
// different rate depending solely on which task it's attached to (the Bayer case
// buildSummaryCols's own tests below exercise).
const findRate = (row, cfg) => {
  const task = (cfg?.tasks || []).find(t => t.name.toLowerCase() === row.task.toLowerCase());
  if (!task) return 0;
  const resources = task.resources || [];
  const res = resources.find(r => r.role.toLowerCase() === row.role.toLowerCase());
  if (res) return res.hourlyRate ?? 0;
  return resources.length ? (resources[0].hourlyRate ?? 0) : 0;
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

describe('buildSummaryCols', () => {
  const cfg = {
    tasks: [
      { name: 'Overall Coordination', billable: true, resources: [{ role: 'Account Director', soldHours: 10, hourlyRate: 168 }] },
      { name: 'Project Management', billable: true, resources: [{ role: 'Account Services Intern', soldHours: 10, hourlyRate: 130 }] },
    ],
  };
  const noFilter = { start: null, end: null };

  it('reproduces today\'s single-key (role-only) grouping — one column per role, summed across tasks', () => {
    // Same role label used on both tasks (the real Bayer case) but grouped by role
    // ALONE (byKeyFn ignores task) — this is the pre-change "Summary by role" behavior,
    // kept as a non-regression fixture even though the real column-building code will
    // switch to a composite key.
    const rows = [
      { task: 'Overall Coordination', role: 'Account Director', hours: 2, date: new Date('2026-01-10') },
      { task: 'Project Management', role: 'Account Director', hours: 3, date: new Date('2026-01-12') },
    ];
    const entries = [{ key: 'account director', label: 'Account Director', soldHours: 10, soldEur: 1680 }];
    const result = buildSummaryCols(rows, r => r.role.toLowerCase(), entries, noFilter, cfg, findRate);
    expect(result).toHaveLength(1);
    // 2h on Overall Coordination (168/h) + 3h on Project Management (130/h) — blended.
    expect(result[0].totalConsumed).toBe(5);
    expect(result[0].totalConsumedEur).toBe(2 * 168 + 3 * 130);
  });

  it('keeps two (role, task) composite-key columns distinct — the Bayer reconciliation case', () => {
    const rows = [
      { task: 'Overall Coordination', role: 'Account Director', hours: 2, date: new Date('2026-01-10') },
      { task: 'Project Management', role: 'Account Director', hours: 3, date: new Date('2026-01-12') },
    ];
    const entries = [
      { key: 'account director|overall coordination', label: 'Account Director — Overall Coordination', soldHours: 10, soldEur: 1680 },
      { key: 'account director|project management', label: 'Account Director — Project Management', soldHours: 10, soldEur: 1300 },
    ];
    const byKeyFn = r => r.role.toLowerCase() + '|' + r.task.toLowerCase();
    const result = buildSummaryCols(rows, byKeyFn, entries, noFilter, cfg, findRate);
    expect(result).toHaveLength(2);
    // Each column now reflects a SINGLE rate — no blending across tasks.
    expect(result[0].totalConsumed).toBe(2);
    expect(result[0].totalConsumedEur).toBe(2 * 168);
    expect(result[1].totalConsumed).toBe(3);
    expect(result[1].totalConsumedEur).toBe(3 * 130);
  });

  it('restricts inPeriod/inPeriodEur to the given filterRange, leaving totalConsumed unfiltered', () => {
    const rows = [
      { task: 'Overall Coordination', role: 'Account Director', hours: 2, date: new Date('2026-01-05') },
      { task: 'Overall Coordination', role: 'Account Director', hours: 4, date: new Date('2026-02-05') },
    ];
    const entries = [{ key: 'account director|overall coordination', label: 'Account Director — Overall Coordination', soldHours: 10, soldEur: 1680 }];
    const byKeyFn = r => r.role.toLowerCase() + '|' + r.task.toLowerCase();
    const filterRange = { start: new Date('2026-02-01'), end: new Date('2026-02-28') };
    const result = buildSummaryCols(rows, byKeyFn, entries, filterRange, cfg, findRate);
    expect(result[0].totalConsumed).toBe(6); // unfiltered — both rows
    expect(result[0].inPeriod).toBe(4); // only the February row
    expect(result[0].inPeriodEur).toBe(4 * 168);
  });
});

describe('summaryTotals', () => {
  it('sums sold/consumed/residual across all columns, independent of how they were grouped', () => {
    const cols = [
      { soldHours: 10, soldEur: 1680, totalConsumed: 2, totalConsumedEur: 336, inPeriod: 0, inPeriodEur: 0 },
      { soldHours: 10, soldEur: 1300, totalConsumed: 3, totalConsumedEur: 390, inPeriod: 0, inPeriodEur: 0 },
    ];
    const totals = summaryTotals(cols, false);
    expect(totals.totSold).toBe(20);
    expect(totals.totSoldEur).toBe(2980);
    expect(totals.totSpent).toBe(5); // no filter -> totSpent == totConsumed
    expect(totals.totSpentEur).toBe(726);
    expect(totals.totResidual).toBe(15);
    expect(totals.totResidualEur).toBe(2254);
  });

  it('subtracts inPeriod from totConsumed for totSpent when a filter is active', () => {
    const cols = [
      { soldHours: 10, soldEur: 1000, totalConsumed: 6, totalConsumedEur: 600, inPeriod: 4, inPeriodEur: 400 },
    ];
    const totals = summaryTotals(cols, true);
    expect(totals.totSpent).toBe(2); // 6 total - 4 in-period
    expect(totals.totSpentEur).toBe(200);
  });
});

describe('normalizeGroupEntries', () => {
  it('returns entries as-is when already present', () => {
    const grp = { name: 'Accounting', roles: ['Legacy Role'], entries: [{ role: 'Account Director', task: 'Overall Coordination' }] };
    expect(normalizeGroupEntries(grp)).toEqual([{ role: 'Account Director', task: 'Overall Coordination' }]);
  });

  it('seeds wildcard entries (task: "") from legacy roles[] when entries is absent', () => {
    const grp = { name: 'Accounting', roles: ['Account Director', 'Account Services Intern'] };
    expect(normalizeGroupEntries(grp)).toEqual([
      { role: 'Account Director', task: '' },
      { role: 'Account Services Intern', task: '' },
    ]);
  });

  it('seeds wildcard entries when entries is present but empty', () => {
    const grp = { name: 'Accounting', roles: ['Account Director'], entries: [] };
    expect(normalizeGroupEntries(grp)).toEqual([{ role: 'Account Director', task: '' }]);
  });

  it('returns an empty array when neither entries nor roles is present', () => {
    expect(normalizeGroupEntries({ name: 'Empty' })).toEqual([]);
  });
});

describe('entryMatchesRow', () => {
  it('matches a wildcard entry (task: "") regardless of the row\'s task', () => {
    const entries = [{ role: 'Account Director', task: '' }];
    expect(entryMatchesRow(entries, 'Account Director', 'Overall Coordination')).toBe(true);
    expect(entryMatchesRow(entries, 'Account Director', 'Project Management')).toBe(true);
  });

  it('matches a task-scoped entry only on that exact task — the Bayer case', () => {
    // Same role, but the group only claims it for Overall Coordination, not
    // Project Management -- exactly the precise-membership goal this pair of
    // functions exists for (resolves the "same role, two rates" ambiguity by
    // letting the group definition itself pick which task's hours count).
    const entries = [{ role: 'HWGACCSVS - DIRECTOR', task: 'Overall Coordination' }];
    expect(entryMatchesRow(entries, 'HWGACCSVS - DIRECTOR', 'Overall Coordination')).toBe(true);
    expect(entryMatchesRow(entries, 'HWGACCSVS - DIRECTOR', 'Project Management')).toBe(false);
  });

  it('is case-insensitive on both role and task', () => {
    const entries = [{ role: 'Account Director', task: 'Overall Coordination' }];
    expect(entryMatchesRow(entries, 'account director', 'OVERALL COORDINATION')).toBe(true);
  });

  it('returns false when no entry matches the role at all', () => {
    const entries = [{ role: 'Account Director', task: '' }];
    expect(entryMatchesRow(entries, 'Developer', 'FE / BE Development')).toBe(false);
  });

  it('does not throw on an entry with a blank/missing role (e.g. an unfinished row left in project-config.html\'s form)', () => {
    const entries = [{ role: '', task: 'Overall Coordination' }, { role: 'Account Director', task: '' }];
    expect(() => entryMatchesRow(entries, 'Account Director', 'Overall Coordination')).not.toThrow();
    expect(entryMatchesRow(entries, 'Account Director', 'Overall Coordination')).toBe(true);
  });
});
