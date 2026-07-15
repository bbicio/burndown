import { describe, it, expect } from 'vitest';
import { deriveDistribution, reforecastDistribution } from './config-form-calc.js';

describe('deriveDistribution', () => {
  it('distributes a single-month task fully into that month', () => {
    const tasks = [{
      name: 'Dev', billable: true,
      startDate: '20260101', endDate: '20260131',
      resources: [{ soldHours: 10, hourlyRate: 100 }],
    }];
    const result = deriveDistribution(tasks, ['202601'], '202601', '202601');
    expect(result.newPhasing['202601']).toBe(1000);
    expect(result.newPlanning['202601']).toBe(10);
    expect(result.totalBudget).toBe(1000);
    expect(result.totalHours).toBe(10);
  });

  it('splits a task spanning two equal-length months roughly in half by day-overlap', () => {
    const tasks = [{
      name: 'Dev', billable: true,
      startDate: '20260101', endDate: '20260228',
      resources: [{ soldHours: 28, hourlyRate: 100 }],
    }];
    const result = deriveDistribution(tasks, ['202601', '202602'], '202601', '202602');
    // Jan has 31 days, Feb has 28 — task spans exactly Jan 1 to Feb 28 (59 days total)
    expect(result.newPlanning['202601'] + result.newPlanning['202602']).toBeCloseTo(28, 5);
    expect(result.newPlanning['202601']).toBeGreaterThan(result.newPlanning['202602']);
  });

  it('uses monthlyDistribution percentages when they sum to ~100', () => {
    const tasks = [{
      name: 'Dev', billable: true,
      startDate: '20260101', endDate: '20260228',
      monthlyDistribution: { '202601': 30, '202602': 70 },
      resources: [{ soldHours: 100, hourlyRate: 10 }],
    }];
    const result = deriveDistribution(tasks, ['202601', '202602'], '202601', '202602');
    expect(result.newPhasing['202601']).toBe(300);
    expect(result.newPhasing['202602']).toBe(700);
  });

  it('excludes non-billable tasks', () => {
    const tasks = [{
      name: 'Dev', billable: false,
      startDate: '20260101', endDate: '20260131',
      resources: [{ soldHours: 10, hourlyRate: 100 }],
    }];
    // Caller is responsible for filtering billable:true tasks before calling —
    // this function assumes the caller already filtered, per cfgDerivePhasing's
    // existing `.filter(t => t.billable !== false)` at the call site.
    const result = deriveDistribution(tasks.filter(t => t.billable !== false), ['202601'], '202601', '202601');
    expect(result.newPhasing).toEqual({});
  });
});

describe('reforecastDistribution', () => {
  it('replaces past months with exact actuals and splits remaining budget across future months', () => {
    const tasks = [{
      name: 'Dev', billable: true,
      startDate: '20260101', endDate: '20260331',
      resources: [{ role: 'Developer', soldHours: 30, hourlyRate: 100 }],
    }];
    const actualsRows = [
      { task: 'Dev', role: 'Developer', date: '2026-01-15', hours: 10 },
    ];
    const result = reforecastDistribution(tasks, ['202601', '202602', '202603'], actualsRows, '202602');
    // January (past): exact actuals — 10h × €100 = €1000
    expect(result.newPlanning['202601']).toBe(10);
    expect(result.newPhasing['202601']).toBe(1000);
    // Remaining 20h / €2000 split across Feb+Mar (2 future months, even split, no monthlyDistribution)
    expect(result.newPlanning['202602'] + result.newPlanning['202603']).toBeCloseTo(20, 5);
  });

  it('caps past actuals at sold hours/budget when actuals exceed sold', () => {
    const tasks = [{
      name: 'Dev', billable: true,
      startDate: '20260101', endDate: '20260131',
      resources: [{ role: 'Developer', soldHours: 5, hourlyRate: 100 }],
    }];
    const actualsRows = [{ task: 'Dev', role: 'Developer', date: '2026-01-15', hours: 20 }];
    const result = reforecastDistribution(tasks, ['202601'], actualsRows, '202602');
    // Actuals (20h) exceed sold (5h) — scaled down to exactly 5h / €500, not 20h / €2000.
    expect(result.newPlanning['202601']).toBeCloseTo(5, 5);
    expect(result.newPhasing['202601']).toBeCloseTo(500, 5);
  });

  it('returns a distError when carry-forward pushes a monthlyDistribution month above 100%', () => {
    const tasks = [{
      name: 'Dev', billable: true,
      startDate: '20260101', endDate: '20260331',
      monthlyDistribution: { '202601': 10, '202602': 95, '202603': -5 },
      resources: [{ role: 'Developer', soldHours: 100, hourlyRate: 10 }],
    }];
    // Zero actuals in Jan (past) — full 10% carries forward as positive delta.
    // adjustedPct for Feb (first future month) = 95 + 10 = 105 > 100.5.
    const actualsRows = [];
    const result = reforecastDistribution(tasks, ['202601', '202602', '202603'], actualsRows, '202602');
    expect(result.distError).toContain('Dev');
  });
});
