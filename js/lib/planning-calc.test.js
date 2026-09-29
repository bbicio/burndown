import { describe, it, expect, test } from 'vitest';
import { matchesTaskRole, computeResidual } from './planning-calc.js';
import { getCalendarWeeks, workingDaysInWeek, getPlanningPeriods } from './planning-calc.js';
import { sumChildBreakdownHours } from './planning-calc.js';

describe('sumChildBreakdownHours', () => {
  const weekMap = {
    w1: { hours: 10, isPast: true, isPulse: false, breakdown: [
      { project: 'Alpha', task: 'Build', hours: 6 },
      { project: 'Beta',  task: 'Design', hours: 4 },
    ] },
    w2: { hours: 8, isPast: false, isPulse: true, breakdown: [
      { project: 'Alpha', task: 'Build', hours: 8 },
    ] },
    w3: { hours: 5, isPast: false, isPulse: false, breakdown: [
      { project: 'Alpha', task: 'Deploy', hours: 5 },
    ] },
  };

  it('sums hours across weeks for a matching (project, task) pair', () => {
    expect(sumChildBreakdownHours(weekMap, ['w1', 'w2'], 'Alpha', 'Build')).toEqual({ hours: 14, isPulse: true });
  });

  it('excludes entries from a different project or task', () => {
    expect(sumChildBreakdownHours(weekMap, ['w1'], 'Beta', 'Design')).toEqual({ hours: 4, isPulse: false });
    expect(sumChildBreakdownHours(weekMap, ['w1', 'w2', 'w3'], 'Alpha', 'Deploy')).toEqual({ hours: 5, isPulse: false });
  });

  it('isPulse reflects only weeks that actually contributed matching hours', () => {
    // w2 is a pulse week but only contains Alpha/Build — a different child must not inherit isPulse from it
    expect(sumChildBreakdownHours(weekMap, ['w1', 'w2'], 'Beta', 'Design')).toEqual({ hours: 4, isPulse: false });
  });

  it('returns zero hours and isPulse false when no week key is present in the map', () => {
    expect(sumChildBreakdownHours(weekMap, ['missing'], 'Alpha', 'Build')).toEqual({ hours: 0, isPulse: false });
  });

  it('handles a cell with no breakdown array without crashing', () => {
    const sparse = { w1: { hours: 3, isPast: true, isPulse: false } };
    expect(sumChildBreakdownHours(sparse, ['w1'], 'Alpha', 'Build')).toEqual({ hours: 0, isPulse: false });
  });
});

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

describe('getCalendarWeeks', () => {
  it('anchors the first week to the Monday on or before startDate', () => {
    // 2026-01-07 is a Wednesday; the Monday on/before it is 2026-01-05
    const weeks = getCalendarWeeks(new Date(2026, 0, 7), new Date(2026, 0, 7));
    expect(weeks).toHaveLength(1);
    expect(weeks[0].weekStart).toEqual(new Date(2026, 0, 5));
    expect(weeks[0].weekEnd).toEqual(new Date(2026, 0, 11));
  });

  it('anchors correctly when startDate is itself a Monday', () => {
    const weeks = getCalendarWeeks(new Date(2026, 0, 5), new Date(2026, 0, 5));
    expect(weeks[0].weekStart).toEqual(new Date(2026, 0, 5));
  });

  it('anchors correctly when startDate is a Sunday (dow=0 wraps back 6 days)', () => {
    // 2026-01-11 is a Sunday; Monday on/before is 2026-01-05
    const weeks = getCalendarWeeks(new Date(2026, 0, 11), new Date(2026, 0, 11));
    expect(weeks[0].weekStart).toEqual(new Date(2026, 0, 5));
  });

  it('enumerates one week per 7-day span, inclusive of endDate', () => {
    const weeks = getCalendarWeeks(new Date(2026, 0, 5), new Date(2026, 0, 18));
    expect(weeks).toHaveLength(2);
    expect(weeks[1].weekStart).toEqual(new Date(2026, 0, 12));
    expect(weeks[1].weekEnd).toEqual(new Date(2026, 0, 18));
  });

  it('labels a single-month week as "DD-DD Mon"', () => {
    const weeks = getCalendarWeeks(new Date(2026, 0, 5), new Date(2026, 0, 5));
    expect(weeks[0].label).toBe('05-11 Jan');
  });

  it('labels a week spanning two months as "DD Mon-DD Mon"', () => {
    // Week of 2026-01-26 (Mon) to 2026-02-01 (Sun) spans January into February
    const weeks = getCalendarWeeks(new Date(2026, 0, 26), new Date(2026, 0, 26));
    expect(weeks[0].label).toBe('26 Jan-01 Feb');
  });

  it('sets monthKey from the week\'s start date', () => {
    const weeks = getCalendarWeeks(new Date(2026, 0, 5), new Date(2026, 0, 5));
    expect(weeks[0].monthKey).toBe('Jan 2026');
  });
});

describe('workingDaysInWeek', () => {
  it('counts Mon-Fri days that fall within both the week and the task range', () => {
    const week = { weekStart: new Date(2026, 0, 5), weekEnd: new Date(2026, 0, 11) }; // Mon 5 - Sun 11
    const count = workingDaysInWeek(week, new Date(2026, 0, 5), new Date(2026, 0, 11));
    expect(count).toBe(5); // Mon-Fri, weekend excluded
  });

  it('excludes days before the task start', () => {
    const week = { weekStart: new Date(2026, 0, 5), weekEnd: new Date(2026, 0, 11) };
    const count = workingDaysInWeek(week, new Date(2026, 0, 8), new Date(2026, 0, 11)); // task starts Thu
    expect(count).toBe(2); // Thu, Fri only
  });

  it('excludes days after the task end', () => {
    const week = { weekStart: new Date(2026, 0, 5), weekEnd: new Date(2026, 0, 11) };
    const count = workingDaysInWeek(week, new Date(2026, 0, 5), new Date(2026, 0, 7)); // task ends Wed
    expect(count).toBe(3); // Mon, Tue, Wed
  });

  it('returns 0 when the task range does not overlap any weekday of the week', () => {
    const week = { weekStart: new Date(2026, 0, 5), weekEnd: new Date(2026, 0, 11) };
    const count = workingDaysInWeek(week, new Date(2026, 0, 10), new Date(2026, 0, 11)); // Sat-Sun only
    expect(count).toBe(0);
  });
});

describe('getPlanningPeriods', () => {
  it('returns monthly periods keyed YYYYMM, one per month in the config\'s date range, when interval is monthly', () => {
    const cfg = { startDate: '20260101', endDate: '20260301' };
    // getPlanningPeriods relies on the global getMonthRangeFromCfg (js/portfolio.js) — the real
    // function is loaded as a page global, not imported, so this test stubs it directly on
    // globalThis (this    // is the first planning-calc function with an external global dependency).
    globalThis.getMonthRangeFromCfg = c => ['202601', '202602', '202603'];
    const periods = getPlanningPeriods(cfg, 'monthly');
    expect(periods).toHaveLength(3);
    expect(periods[0]).toMatchObject({ key: '202601' });
    expect(periods[0].start).toEqual(new Date(2026, 0, 1));
    expect(periods[0].end).toEqual(new Date(2026, 0, 31));
    delete globalThis.getMonthRangeFromCfg;
  });

  it('returns an empty array when the config has no resolvable month range', () => {
    globalThis.getMonthRangeFromCfg = () => [];
    expect(getPlanningPeriods({}, 'monthly')).toEqual([]);
    delete globalThis.getMonthRangeFromCfg;
  });

  it('returns one weekly period per calendar week spanning the full month range, when interval is weekly', () => {
    globalThis.getMonthRangeFromCfg = () => ['202601'];
    const periods = getPlanningPeriods({}, 'weekly');
    // January 2026: 1st is a Thursday, so the anchor Monday is 2025-12-29; last day is 2026-01-31 (Saturday)
    expect(periods[0].start).toEqual(new Date(2025, 11, 29));
    // Last calendar week is Mon 2026-01-26 - Sun 2026-02-01: its end date is never clamped to the
    // project's own end-of-month (2026-01-31) -- the original js/planning.js always let the last
    // week's end spill into the following month, uncapped. Traced by hand: anchor 2025-12-29,
    // projectEnd 2026-01-31, weeks step by 7 days -> 12/29, 01/05, 01/12, 01/19, 01/26 (last cur
    // <= projectEnd), whose +6-day end is 2026-02-01.
    expect(periods[periods.length - 1].start).toEqual(new Date(2026, 0, 26));
    expect(periods[periods.length - 1].end).toEqual(new Date(2026, 1, 1));
    delete globalThis.getMonthRangeFromCfg;
  });
});
