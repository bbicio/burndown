import { describe, it, expect, test } from 'vitest';
import { matchesTaskRole, computeResidual, distributeFutureResidual } from './planning-calc.js';

describe('matchesTaskRole', () => {
  it('matches identical role and task name', () => {
    expect(matchesTaskRole({ role: 'Developer', task: 'Build API' }, 'Build API', 'Developer')).toBe(true);
  });
  it('is case-insensitive on role', () => {
    expect(matchesTaskRole({ role: 'developer', task: 'Build API' }, 'Build API', 'Developer')).toBe(true);
  });
  it('is case-insensitive on task name', () => {
    expect(matchesTaskRole({ role: 'Developer', task: 'build api' }, 'Build API', 'Developer')).toBe(true);
  });
  it('does not crash when taskName is missing, matches on role alone', () => {
    expect(matchesTaskRole({ role: 'Developer', task: 'Build API' }, undefined, 'Developer')).toBe(true);
  });
  it('does not crash when record.task is missing', () => {
    expect(matchesTaskRole({ role: 'Developer', task: undefined }, 'Build API', 'Developer')).toBe(false);
  });
  it('does not crash when record.role is missing', () => {
    expect(matchesTaskRole({ role: undefined, task: 'Build API' }, 'Build API', 'Developer')).toBe(false);
  });
  it('rejects a different role even with matching task', () => {
    expect(matchesTaskRole({ role: 'QA', task: 'Build API' }, 'Build API', 'Developer')).toBe(false);
  });
  it('rejects a different task name when taskName is provided', () => {
    expect(matchesTaskRole({ role: 'Developer', task: 'Write docs' }, 'Build API', 'Developer')).toBe(false);
  });
});

describe('computeResidual', () => {
  it('returns sold minus consumed when positive', () => {
    expect(computeResidual(100, 40)).toBe(60);
  });
  it('floors at zero when consumed exceeds sold (over-consumed task)', () => {
    expect(computeResidual(20, 30)).toBe(0);
  });
  it('returns zero when sold and consumed are equal', () => {
    expect(computeResidual(50, 50)).toBe(0);
  });
});

test('per-task floor can make aggregate To-be-planned exceed aggregate Sold-Actuals (accepted, documented behavior)', () => {
  // Role with 2 tasks: one under-consumed, one over-consumed — mirrors the
  // HWGDEV-DEVELOPER case from the audit (Sold 1236h, Actuals 44h, but
  // "To be planned" showed 1204h instead of 1192h).
  const taskA = { sold: 100, consumed: 40 };  // residual 60
  const taskB = { sold: 20,  consumed: 30 };  // over-consumed, residual floors to 0
  const aggregateTbp = computeResidual(taskA.sold, taskA.consumed) + computeResidual(taskB.sold, taskB.consumed);
  const aggregateSoldMinusActuals = (taskA.sold + taskB.sold) - (taskA.consumed + taskB.consumed);
  expect(aggregateTbp).toBe(60);
  expect(aggregateSoldMinusActuals).toBe(50);
  expect(aggregateTbp).toBeGreaterThan(aggregateSoldMinusActuals);
});

describe('distributeFutureResidual', () => {
  it('activates pulse based on canonical totalFutureWeeks, independent of the visible week window', () => {
    // residual 5h over 10 canonical future weeks = 0.5h/week (<1, pulse should activate)
    // even though the visible window (weeksByMonth) only covers 3 weeks total — this is
    // exactly the case the old by-owner bug (roleTbp < taskWeeks.length) got wrong:
    // 5 < 3 is false, so the old code would NOT have activated pulse here.
    const weeksByMonth = [{ monthKey: '202601', weekKeys: ['w1', 'w2', 'w3'] }];
    const result = distributeFutureResidual(5, 10, weeksByMonth, true);
    expect(result).toEqual([{ key: 'w1', hours: 1.5, isPulse: true }]); // 0.5 * 3 weeks
  });

  it('does not activate pulse when hPerWeek >= 1, regardless of visible window', () => {
    const weeksByMonth = [{ monthKey: '202601', weekKeys: ['w1', 'w2'] }];
    const result = distributeFutureResidual(20, 10, weeksByMonth, true); // hPerWeek = 2
    expect(result.every(r => !r.isPulse)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it('distributes proportional to calendar weeks per month, not equally per month', () => {
    // month1 has 2 weeks, month2 has 1 week — should NOT split 50/50
    const weeksByMonth = [
      { monthKey: '202601', weekKeys: ['w1', 'w2'] },
      { monthKey: '202602', weekKeys: ['w3'] },
    ];
    const result = distributeFutureResidual(1.5, 3, weeksByMonth, true); // hPerWeek = 0.5
    expect(result).toEqual([
      { key: 'w1', hours: 1.0, isPulse: true },  // 0.5 * 2 weeks
      { key: 'w3', hours: 0.5, isPulse: true },  // 0.5 * 1 week
    ]);
  });

  it('places the pulse-aggregated entry on the first week of the month, not the last', () => {
    const weeksByMonth = [{ monthKey: '202601', weekKeys: ['w1', 'w2', 'w3'] }];
    const result = distributeFutureResidual(1, 10, weeksByMonth, true);
    expect(result[0].key).toBe('w1');
  });

  it('falls back to even split across all weeks when pulseEnabled is false', () => {
    const weeksByMonth = [{ monthKey: '202601', weekKeys: ['w1', 'w2'] }];
    const result = distributeFutureResidual(1, 10, weeksByMonth, false); // hPerWeek = 0.1, but pulse disabled
    expect(result).toEqual([
      { key: 'w1', hours: 0.1, isPulse: false },
      { key: 'w2', hours: 0.1, isPulse: false },
    ]);
  });

  it('falls back to residual / visible-week-count when totalFutureWeeks is 0', () => {
    const weeksByMonth = [{ monthKey: '202601', weekKeys: ['w1', 'w2'] }];
    const result = distributeFutureResidual(4, 0, weeksByMonth, false);
    expect(result).toEqual([
      { key: 'w1', hours: 2, isPulse: false },
      { key: 'w2', hours: 2, isPulse: false },
    ]);
  });

  it('returns an empty array when weeksByMonth is empty', () => {
    expect(distributeFutureResidual(5, 10, [], true)).toEqual([]);
  });
});
