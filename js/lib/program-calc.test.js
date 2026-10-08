import { describe, it, expect } from 'vitest';
import { programCurrency, programRange, projectMetrics, programTotals, timeElapsed, needsAttention, sortProjectRows } from './program-calc.js';

const deps = {
  findRate: (r, cfg) => 100,
  billableTasks: cfg => (cfg.tasks || []).filter(t => t.billable !== false),
  billableData: (rows, cfg) => rows,
  pipelineBudget: () => null,
  today: new Date(2026, 8, 22), // Sep 22 2026, la "Today" della tavola 7.5a
};
const task = (soldHours, rate) => ({ billable: true, resources: [{ soldHours, hourlyRate: rate }] });
const cfg = (over = {}) => ({ id: 'p1', name: 'PMO', startDate: '202601', endDate: '202703', status: 'Started', currency: 'EUR', tasks: [task(10, 100)], ...over });

describe('programCurrency', () => {
  it('returns the single code', () => expect(programCurrency([cfg(), cfg()])).toBe('EUR'));
  it('returns null when codes diverge', () => expect(programCurrency([cfg(), cfg({ currency: 'CHF' })])).toBeNull());
  it('treats a missing code as EUR', () => expect(programCurrency([{ }, cfg()])).toBe('EUR'));
  it('returns null for no projects', () => expect(programCurrency([])).toBeNull());
});

describe('programRange', () => {
  it('spans first start to last end', () => {
    const r = programRange([cfg({ startDate: '202603', endDate: '202612' }), cfg({ startDate: '202601', endDate: '202703' })]);
    expect([r.startYm, r.endYm]).toEqual(['202601', '202703']);
    expect(r.months.length).toBe(15);
  });
  it('ignores undated projects', () => {
    const r = programRange([cfg(), cfg({ startDate: null, endDate: null })]);
    expect(r.startYm).toBe('202601');
  });
  it('returns null when nothing is dated', () => expect(programRange([cfg({ startDate: null, endDate: null })])).toBeNull());
});

describe('projectMetrics', () => {
  it('sums sold hours and money from billable tasks', () => {
    const m = projectMetrics(cfg({ tasks: [task(10, 100), task(5, 200)] }), [], deps);
    expect(m.soldHours).toBe(15);
    expect(m.soldMoney).toBe(2000);
  });
  it('falls back to the pipeline budget fee when tasks carry no budget', () => {
    const m = projectMetrics(cfg({ tasks: [], costGridRef: { versionId: 'v1' } }), [], { ...deps, pipelineBudget: () => ({ fee: 900 }) });
    expect(m.soldMoney).toBe(900);
  });
  it('computes spent hours and money from the rows', () => {
    const m = projectMetrics(cfg(), [{ hours: 4 }, { hours: 1 }], deps);
    expect(m.spentHours).toBe(5);
    expect(m.spentMoney).toBe(500);
    expect(m.remainingHours).toBe(5);
  });
  it('returns null percentages and hasBudget false when nothing is sold', () => {
    const m = projectMetrics(cfg({ tasks: [] }), [{ hours: 4 }], deps);
    expect(m.hasBudget).toBe(false);
    expect(m.consumptionPct).toBeNull();
    expect(m.vsTime).toBeNull();
  });
  it('marks a project with no rows as hasActuals false', () => {
    expect(projectMetrics(cfg(), [], deps).hasActuals).toBe(false);
  });
  it('clamps timePct to [0,100] outside the project window', () => {
    expect(projectMetrics(cfg({ startDate: '202701', endDate: '202703' }), [], deps).timePct).toBe(0);
    expect(projectMetrics(cfg({ startDate: '202501', endDate: '202503' }), [], deps).timePct).toBe(100);
  });
  it('leaves timePct and vsTime null without dates', () => {
    const m = projectMetrics(cfg({ startDate: null, endDate: null }), [{ hours: 4 }], deps);
    expect(m.timePct).toBeNull();
    expect(m.vsTime).toBeNull();
  });
  it('reports started false before the start month', () => {
    expect(projectMetrics(cfg({ startDate: '202701', endDate: '202703' }), [], deps).started).toBe(false);
  });
});

describe('programTotals', () => {
  it('uses sum(spent)/sum(sold), not the mean of the percentages', () => {
    const a = projectMetrics(cfg({ tasks: [task(100, 100)] }), [{ hours: 90 }], deps);
    const b = projectMetrics(cfg({ tasks: [task(10, 100)] }), [{ hours: 1 }], deps);
    expect(programTotals([a, b]).consumptionPct).toBe(83); // 91/110, non (90+10)/2
  });
  it('excludes a project without budget from the denominator but keeps its spend', () => {
    const withBudget = projectMetrics(cfg({ tasks: [task(100, 100)] }), [{ hours: 50 }], deps);
    const noBudget = projectMetrics(cfg({ tasks: [] }), [{ hours: 10 }], deps);
    const t = programTotals([withBudget, noBudget]);
    expect(t.soldHours).toBe(100);
    expect(t.spentHours).toBe(60);
  });
});

describe('timeElapsed', () => {
  it('counts started projects and the elapsed percentage', () => {
    const range = programRange([cfg({ startDate: '202601', endDate: '202612' })]);
    const metrics = [{ started: true }, { started: false }];
    const r = timeElapsed(range, metrics, deps.today);
    expect(r.startedCount).toBe(1);
    expect(r.totalCount).toBe(2);
    expect(r.pct).toBeGreaterThan(0);
    expect(r.pct).toBeLessThanOrEqual(100);
  });
  it('is 0 before the range and 100 after it', () => {
    expect(timeElapsed(programRange([cfg({ startDate: '202701', endDate: '202703' })]), [], deps.today).pct).toBe(0);
    expect(timeElapsed(programRange([cfg({ startDate: '202501', endDate: '202503' })]), [], deps.today).pct).toBe(100);
  });
  it('returns null pct without a range', () => expect(timeElapsed(null, [], deps.today).pct).toBeNull());
});

describe('needsAttention', () => {
  const entry = (id, status, consumptionPct, timePct) => ({ id, name: id, status, endYm: '202609', metrics: { consumptionPct, timePct, vsTime: consumptionPct !== null && timePct !== null ? consumptionPct - timePct : null } });
  it('flags Started At Risk', () => expect(needsAttention([entry('a', 'Started At Risk', 10, 10)]).ids).toEqual(['a']));
  it('flags consumption at the 85 threshold but not at 84', () => {
    expect(needsAttention([entry('a', 'Started', 85, 80)]).ids).toEqual(['a']);
    expect(needsAttention([entry('b', 'Started', 84, 80)]).ids).toEqual([]);
  });
  it('flags vs time above 10 but not at 10', () => {
    expect(needsAttention([entry('a', 'Started', 30, 19)]).ids).toEqual(['a']);
    expect(needsAttention([entry('b', 'Started', 30, 20)]).ids).toEqual([]);
  });
  it('gives a reason string naming the condition', () => {
    expect(needsAttention([entry('a', 'Started At Risk', 95, 80)]).reasons.a).toContain('95%');
  });
  it('ignores a project with null percentages', () => expect(needsAttention([entry('a', 'Not started yet', null, null)]).ids).toEqual([]));
});

describe('sortProjectRows', () => {
  it('puts flagged projects first, then orders by start date', () => {
    const rows = [
      { id: 'a', cfg: { startDate: '202601' } },
      { id: 'b', cfg: { startDate: '202603' } },
      { id: 'c', cfg: { startDate: '202602' } },
    ];
    expect(sortProjectRows(rows, ['b']).map(r => r.id)).toEqual(['b', 'a', 'c']);
  });
});
