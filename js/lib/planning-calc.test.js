import { describe, it, expect, test } from 'vitest';
import { matchesTaskRole, computeResidual } from './planning-calc.js';

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
