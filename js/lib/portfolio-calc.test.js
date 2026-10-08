import { describe, it, expect } from 'vitest';
import { computeKpis, computeBurndownPoints, buildSummaryCols, summaryTotals, normalizeGroupEntries, entryMatchesRow, commonCurrency, buildPortfolioRows, spentPercent, spentBarState, programAtRisk, readLayoutPreference, columnsForWidth, resolveExpandedProgramId, syncExpansionOnLayoutChange, toggleCardExpansion } from './portfolio-calc.js';

describe('commonCurrency', () => {
  it('returns the currency code shared by all the projects', () => {
    expect(commonCurrency([{ currency: 'CHF' }, { currency: 'CHF' }])).toBe('CHF');
    expect(commonCurrency([{ currency: 'USD' }])).toBe('USD');
  });
  it('treats a missing currency as EUR', () => {
    expect(commonCurrency([{}, { currency: 'EUR' }])).toBe('EUR');
  });
  it('falls back to EUR when the projects mix currencies or the list is empty', () => {
    expect(commonCurrency([{ currency: 'CHF' }, { currency: 'EUR' }])).toBe('EUR');
    expect(commonCurrency([])).toBe('EUR');
    expect(commonCurrency(undefined)).toBe('EUR');
  });
});

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

describe('buildPortfolioRows', () => {
  const rows = [
    { kind: 'project', id: 'p1', name: 'TEST PROPOSAL', clientName: 'Bayer AG' },
    { kind: 'project', id: 'p2', name: 'BERMITS', clientName: 'Bayer AG' },
    { kind: 'program', id: 'g1', name: 'Field Force', clientName: 'Bayer AG' },
    { kind: 'project', id: 'p3', name: 'Pharmacovigilance', clientName: 'Angelini Pharma' },
  ];

  it('sorts by client asc, then programs before projects within a client, then name', () => {
    expect(buildPortfolioRows(rows, 'client').map(r => r.id)).toEqual(['p3', 'g1', 'p2', 'p1']);
  });

  it('sorts by name only when sortMode is name, programs and projects undistinguished', () => {
    expect(buildPortfolioRows(rows, 'name').map(r => r.name)).toEqual(['BERMITS', 'Field Force', 'Pharmacovigilance', 'TEST PROPOSAL']);
  });

  it('does not throw on an empty clientName, sorting it first', () => {
    expect(() => buildPortfolioRows([{ kind: 'project', id: 'x', name: 'X', clientName: '' }], 'client')).not.toThrow();
  });

  it('does not mutate the input array', () => {
    const input = [...rows];
    buildPortfolioRows(input, 'client');
    expect(input).toEqual(rows);
  });
});

describe('spentPercent', () => {
  it('returns 0 when sold is set but nothing has been spent yet — Review Focus 4', () => {
    expect(spentPercent(0, 1000)).toBe(0);
  });
  it('returns the percentage spent relative to sold', () => {
    expect(spentPercent(500, 1000)).toBe(50);
    expect(spentPercent(1200, 1000)).toBe(120);
  });
  it('returns null when sold is falsy or missing', () => {
    expect(spentPercent(100, 0)).toBeNull();
    expect(spentPercent(100, null)).toBeNull();
    expect(spentPercent(100, undefined)).toBeNull();
  });
});

describe('spentBarState', () => {
  it('returns the exact boundary states', () => {
    expect(spentBarState(null)).toBe('none');
    expect(spentBarState(0)).toBe('normal');
    expect(spentBarState(84)).toBe('normal');
    expect(spentBarState(85)).toBe('warning');
    expect(spentBarState(100)).toBe('warning');
    expect(spentBarState(101)).toBe('danger');
  });
});

describe('programAtRisk', () => {
  it('counts children whose status is exactly "Started At Risk"', () => {
    expect(programAtRisk([{ status: 'Started At Risk' }, { status: 'Started' }, {}])).toBe(1);
  });
  it('returns 0 for an empty children array', () => {
    expect(programAtRisk([])).toBe(0);
  });
});

describe('readLayoutPreference', () => {
  it('reads a valid stored layout', () => {
    expect(readLayoutPreference('list')).toBe('list');
    expect(readLayoutPreference('card')).toBe('card');
  });
  it('falls back to card for null, empty, or any unrecognized value — Review Focus 1', () => {
    expect(readLayoutPreference(null)).toBe('card');
    expect(readLayoutPreference('')).toBe('card');
    expect(readLayoutPreference('grid')).toBe('card');
  });
});

describe('columnsForWidth', () => {
  it('returns 3 columns at or above 1000px', () => {
    expect(columnsForWidth(1200)).toBe(3);
    expect(columnsForWidth(1000)).toBe(3);
  });
  it('returns 2 columns between 640px and 999px', () => {
    expect(columnsForWidth(999)).toBe(2);
    expect(columnsForWidth(640)).toBe(2);
  });
  it('returns 1 column below 640px', () => {
    expect(columnsForWidth(639)).toBe(1);
    expect(columnsForWidth(0)).toBe(1);
  });
});

describe('resolveExpandedProgramId', () => {
  const live = [{ kind: 'program', id: 'g1', name: 'A', clientName: 'C' }];
  it('keeps the id when its program row is still present', () => {
    expect(resolveExpandedProgramId('g1', live)).toBe('g1');
  });
  it('resolves to null when the program row is gone — Review Focus 2', () => {
    expect(resolveExpandedProgramId('gone', live)).toBeNull();
  });
  it('returns null when no id is currently expanded', () => {
    expect(resolveExpandedProgramId(null, live)).toBeNull();
  });
  it('does not count a project with the same id as a program', () => {
    expect(resolveExpandedProgramId('p1', [{ kind: 'project', id: 'p1', name: 'P', clientName: 'C' }])).toBeNull();
  });
});

describe('syncExpansionOnLayoutChange', () => {
  it('carries the card\'s open program into the list when switching to List', () => {
    expect(syncExpansionOnLayoutChange('list', 'g1', [])).toEqual({ expandedProgramId: 'g1', listExpandedIds: ['g1'] });
  });

  it('does not duplicate a program already open in the list', () => {
    expect(syncExpansionOnLayoutChange('list', 'g1', ['g2', 'g1'])).toEqual({ expandedProgramId: 'g1', listExpandedIds: ['g2', 'g1'] });
  });

  it('moves an already-open program to the end so it counts as the most recent', () => {
    // Without this the Card's explicit choice is lost on the way back: it keeps its old
    // position and some other program is still "last".
    expect(syncExpansionOnLayoutChange('list', 'g1', ['g1', 'g2'])).toEqual({ expandedProgramId: 'g1', listExpandedIds: ['g2', 'g1'] });
  });

  it('brings the Card\'s chosen program back when several are open in the list', () => {
    // List: g1 then g2 open. Card adopts g2, user explicitly opens g1 instead.
    const toList = syncExpansionOnLayoutChange('list', 'g1', ['g1', 'g2']);
    const back = syncExpansionOnLayoutChange('card', toList.expandedProgramId, toList.listExpandedIds);
    expect(back.expandedProgramId).toBe('g1');
    expect(back.listExpandedIds).toEqual(['g2', 'g1']);
  });

  it('leaves the list untouched when nothing is open in the card', () => {
    expect(syncExpansionOnLayoutChange('list', null, ['g2'])).toEqual({ expandedProgramId: null, listExpandedIds: ['g2'] });
  });

  it('adopts the most recently opened list program when switching to Card', () => {
    // Card shows one program at a time, so of several open in List the newest wins;
    // the list's own set is preserved so switching back does not collapse the others.
    expect(syncExpansionOnLayoutChange('card', null, ['g1', 'g2', 'g3'])).toEqual({ expandedProgramId: 'g3', listExpandedIds: ['g1', 'g2', 'g3'] });
  });

  it('closes the card program when the list has nothing open', () => {
    expect(syncExpansionOnLayoutChange('card', 'g1', [])).toEqual({ expandedProgramId: null, listExpandedIds: [] });
  });

  it('round-trips a single program without losing it', () => {
    const toList = syncExpansionOnLayoutChange('list', 'g1', []);
    const back = syncExpansionOnLayoutChange('card', toList.expandedProgramId, toList.listExpandedIds);
    expect(back.expandedProgramId).toBe('g1');
  });

  it('does not mutate the array it is given', () => {
    const ids = ['g2'];
    syncExpansionOnLayoutChange('list', 'g1', ids);
    expect(ids).toEqual(['g2']);
  });
});

describe('toggleCardExpansion', () => {
  it('opening a program also expands it in the list, at the end', () => {
    expect(toggleCardExpansion('g1', null, ['g2'])).toEqual({ expandedProgramId: 'g1', listExpandedIds: ['g2', 'g1'] });
  });

  it('closing the open program also collapses it in the list', () => {
    // Without this a close never propagates: the id stayed in the list set and the next
    // Card <-> List round trip re-opened the panel the user had explicitly closed.
    expect(toggleCardExpansion('g1', 'g1', ['g2', 'g1'])).toEqual({ expandedProgramId: null, listExpandedIds: ['g2'] });
  });

  it('switching to another program leaves the previous one expanded in the list', () => {
    expect(toggleCardExpansion('g2', 'g1', ['g1'])).toEqual({ expandedProgramId: 'g2', listExpandedIds: ['g1', 'g2'] });
  });

  it('re-opening a program already in the list moves it to the end', () => {
    expect(toggleCardExpansion('g1', null, ['g1', 'g2'])).toEqual({ expandedProgramId: 'g1', listExpandedIds: ['g2', 'g1'] });
  });

  it('does not mutate the array it is given', () => {
    const ids = ['g1', 'g2'];
    toggleCardExpansion('g1', 'g1', ids);
    expect(ids).toEqual(['g1', 'g2']);
  });
});

describe('commonCurrency — characterization for Review Focus 5', () => {
  it('falls back to EUR for a program whose children have different currencies', () => {
    expect(commonCurrency([{ currency: 'CHF' }, { currency: 'CHF' }])).toBe('CHF');
    expect(commonCurrency([{ currency: 'CHF' }, { currency: 'USD' }])).toBe('EUR');
  });
});
