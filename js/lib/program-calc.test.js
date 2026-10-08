import { describe, it, expect } from 'vitest';
import { programCurrency, programRange, projectMetrics, programTotals, timeElapsed, needsAttention, sortProjectRows, programBurndown, timelineBars, todayPosition } from './program-calc.js';

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
  it('ranks ids worst-first (final review finding 4): at-risk status beats a high consumption-only flag', () => {
    const mild = entry('mild', 'Started', 90, 85); // flagged on consumption, vsTime only +5
    const risky = entry('risky', 'Started At Risk', 92, 90); // flagged on status, vsTime only +2
    expect(needsAttention([mild, risky]).ids).toEqual(['risky', 'mild']);
  });
  it('among non-at-risk flags, ranks the higher consumption first', () => {
    const lower = entry('lower', 'Started', 86, 80);
    const higher = entry('higher', 'Started', 99, 80);
    expect(needsAttention([lower, higher]).ids).toEqual(['higher', 'lower']);
  });
  it('treats two at-risk projects with no budget as equal instead of comparing -Infinity to itself', () => {
    // -Infinity - -Infinity is NaN, which makes Array#sort order implementation-defined
    // and the "Needs attention" tile show an arbitrary one of them.
    const a = entry('a', 'Started At Risk', null, null);
    const b = entry('b', 'Started At Risk', null, null);
    expect(needsAttention([a, b]).ids).toEqual(['a', 'b']);
    expect(needsAttention([b, a]).ids).toEqual(['b', 'a']);
  });
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

describe('programBurndown', () => {
  const range = programRange([cfg({ startDate: '202601', endDate: '202603' })]);
  it('has one label per month of the program range', () => {
    const s = programBurndown(range, [{ cfg: cfg({ startDate: '202601', endDate: '202603' }), rows: [] }], deps);
    expect(s.labels.length).toBe(3);
  });
  it('sums the remaining hours of all projects', () => {
    const a = { cfg: cfg({ tasks: [task(100, 100)], startDate: '202601', endDate: '202603' }), rows: [] };
    const b = { cfg: cfg({ tasks: [task(50, 100)], startDate: '202601', endDate: '202603' }), rows: [] };
    expect(programBurndown(range, [a, b], deps).actual[0]).toBe(150);
  });
  it('holds a project at its full budget for months before it starts', () => {
    const early = { cfg: cfg({ tasks: [task(100, 100)], startDate: '202601', endDate: '202601' }), rows: [] };
    const late = { cfg: cfg({ tasks: [task(40, 100)], startDate: '202603', endDate: '202603' }), rows: [] };
    expect(programBurndown(range, [early, late], deps).actual[0]).toBe(140);
  });
  it('holds a finished project at its last value for months after it ends', () => {
    const done = { cfg: cfg({ tasks: [task(100, 100)], startDate: '202601', endDate: '202601' }), rows: [{ hours: 30, date: new Date(2026, 0, 15) }] };
    const s = programBurndown(range, [done], deps);
    expect(s.actual[2]).toBe(s.actual[0]);
  });
  it('returns empty series without a range', () => {
    expect(programBurndown(null, [], deps).labels).toEqual([]);
  });
  it('does not crash on an undated project with no actuals (final review finding 1)', () => {
    const undated = { cfg: cfg({ startDate: null, endDate: null, tasks: [task(10, 100)] }), rows: [] };
    const dated = { cfg: cfg({ startDate: '202601', endDate: '202603', tasks: [task(50, 100)] }), rows: [] };
    expect(() => programBurndown(range, [dated, undated], deps)).not.toThrow();
  });
  it('excludes an undated project from the aggregated sum (it has no position on the axis)', () => {
    const undated = { cfg: cfg({ startDate: null, endDate: null, tasks: [task(999, 100)] }), rows: [] };
    const dated = { cfg: cfg({ startDate: '202601', endDate: '202603', tasks: [task(50, 100)] }), rows: [] };
    expect(programBurndown(range, [dated, undated], deps).actual[0]).toBe(50);
  });
  it('still includes an undated project that has actuals: its axis comes from the rows, so it has a position', () => {
    const dated = { cfg: cfg({ startDate: '202601', endDate: '202603', tasks: [task(50, 100)] }), rows: [] };
    const undatedWithActuals = { cfg: cfg({ id: 'p2', startDate: null, endDate: null, tasks: [task(100, 100)] }), rows: [{ hours: 10, date: new Date(2026, 0, 15) }] };
    const withIt = programBurndown(range, [dated, undatedWithActuals], deps).actual[0];
    const without = programBurndown(range, [dated], deps).actual[0];
    expect(withIt).toBeGreaterThan(without);
  });
});

describe('todayPosition', () => {
  it('is null when today is outside the range', () => {
    expect(todayPosition(programRange([cfg({ startDate: '202701', endDate: '202703' })]), deps.today)).toBeNull();
  });
  it('is a percentage inside the range', () => {
    const p = todayPosition(programRange([cfg({ startDate: '202601', endDate: '202612' })]), deps.today);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(100);
  });
});

describe('timelineBars', () => {
  const range = programRange([cfg({ startDate: '202601', endDate: '202612' })]);
  it('places a bar proportionally to its months', () => {
    const [bar] = timelineBars(range, [{ id: 'a', cfg: cfg({ startDate: '202604', endDate: '202606' }), metrics: { consumptionPct: 50, started: true } }]);
    expect(bar.leftPct).toBeCloseTo(25, 0);
    expect(bar.widthPct).toBeCloseTo(25, 0);
    expect(bar.fillPct).toBe(50);
  });
  it('uses the amber state at 85 and the danger state above 100', () => {
    const mk = pct => timelineBars(range, [{ id: 'a', cfg: cfg(), metrics: { consumptionPct: pct, started: true } }])[0].state;
    expect(mk(84)).toBe('normal');
    expect(mk(85)).toBe('warning');
    expect(mk(101)).toBe('danger');
  });
  it('marks a not-started project with no fill', () => {
    const [bar] = timelineBars(range, [{ id: 'a', cfg: cfg({ status: 'Not started yet' }), metrics: { consumptionPct: 0, started: false } }]);
    expect(bar.started).toBe(false);
    expect(bar.fillPct).toBe(0);
  });
  it('skips an undated project', () => {
    expect(timelineBars(range, [{ id: 'a', cfg: cfg({ startDate: null, endDate: null }), metrics: { consumptionPct: 10, started: true } }])).toEqual([]);
  });
});
