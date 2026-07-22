import { describe, it, expect } from 'vitest';
import {
  resolveRoleRate, cgComputeTaskTotals, cgComputePhaseTotals, cgComputeGrandTotals, cgComputeColumnTotals,
} from './costgrid-calc.js';

describe('resolveRoleRate', () => {
  it('returns the EUR baseline rate unchanged when currency is EUR', () => {
    const r = resolveRoleRate({ roleId: 5, globalRate: 100, currency: 'EUR', currencyRate: 1.0, ratecardMap: {}, ratecardOverrides: {}, roleOverrides: {} });
    expect(r).toEqual({ eurRate: 100, effectiveRate: 100, isOverride: false });
  });

  it('prefers the ratecard EUR rate over the global role rate', () => {
    const r = resolveRoleRate({ roleId: 5, globalRate: 100, currency: 'EUR', currencyRate: 1.0, ratecardMap: { '5': 120 }, ratecardOverrides: {}, roleOverrides: {} });
    expect(r).toEqual({ eurRate: 120, effectiveRate: 120, isOverride: false });
  });

  it('falls back to 0 when there is no ratecard entry and no global rate', () => {
    const r = resolveRoleRate({ roleId: 5, globalRate: undefined, currency: 'EUR', currencyRate: 1.0, ratecardMap: {}, ratecardOverrides: {}, roleOverrides: {} });
    expect(r.eurRate).toBe(0);
  });

  it('converts EUR to the target currency using currencyRate when no override exists', () => {
    const r = resolveRoleRate({ roleId: 5, globalRate: 100, currency: 'USD', currencyRate: 1.1, ratecardMap: {}, ratecardOverrides: {}, roleOverrides: {} });
    expect(r).toEqual({ eurRate: 100, effectiveRate: 110, isOverride: false });
  });

  it('rounds the converted rate to 2 decimals', () => {
    const r = resolveRoleRate({ roleId: 5, globalRate: 100, currency: 'USD', currencyRate: 1.005, ratecardMap: {}, ratecardOverrides: {}, roleOverrides: {} });
    expect(r.effectiveRate).toBe(100.5);
  });

  it('prefers the ratecard per-currency override over the computed conversion', () => {
    const r = resolveRoleRate({ roleId: 5, globalRate: 100, currency: 'USD', currencyRate: 1.1, ratecardMap: {}, ratecardOverrides: { '5': { USD: 216 } }, roleOverrides: {} });
    expect(r).toEqual({ eurRate: 100, effectiveRate: 216, isOverride: true });
  });

  it('prefers the ratecard override over the role-level override', () => {
    const r = resolveRoleRate({ roleId: 5, globalRate: 100, currency: 'USD', currencyRate: 1.1, ratecardMap: {}, ratecardOverrides: { '5': { USD: 216 } }, roleOverrides: { USD: 200 } });
    expect(r.effectiveRate).toBe(216);
  });

  it('falls back to the role-level override when there is no ratecard override', () => {
    const r = resolveRoleRate({ roleId: 5, globalRate: 100, currency: 'USD', currencyRate: 1.1, ratecardMap: {}, ratecardOverrides: {}, roleOverrides: { USD: 200 } });
    expect(r).toEqual({ eurRate: 100, effectiveRate: 200, isOverride: true });
  });

  it('treats a missing ratecardOverrides/roleOverrides entry for this role as absent, not throwing', () => {
    const r = resolveRoleRate({ roleId: 9, globalRate: 50, currency: 'GBP', currencyRate: 0.85, ratecardMap: {}, ratecardOverrides: {}, roleOverrides: {} });
    expect(r.effectiveRate).toBe(42.5);
  });
});

describe('cgComputeTaskTotals', () => {
  it('sums hours × rate across roles and adds ptc to the cost total', () => {
    const task = { hours: { PM: 10, DEV: 5 }, ptc: 100 };
    const roles = [{ roleCode: 'PM', rate: 100 }, { roleCode: 'DEV', rate: 80 }];
    expect(cgComputeTaskTotals(task, roles)).toEqual({ totalHrs: 15, totalFee: 1400, totalCostAndFee: 1500 });
  });

  it('treats a missing hours entry as 0', () => {
    const task = { hours: {}, ptc: 0 };
    const roles = [{ roleCode: 'PM', rate: 100 }];
    expect(cgComputeTaskTotals(task, roles)).toEqual({ totalHrs: 0, totalFee: 0, totalCostAndFee: 0 });
  });

  it('rounds totalHrs to 2 decimals', () => {
    const task = { hours: { PM: 0.1, DEV: 0.2 }, ptc: 0 };
    const roles = [{ roleCode: 'PM', rate: 0 }, { roleCode: 'DEV', rate: 0 }];
    expect(cgComputeTaskTotals(task, roles).totalHrs).toBe(0.3);
  });
});

describe('cgComputePhaseTotals', () => {
  it('aggregates task totals and per-role hours across the phase', () => {
    const phase = {
      tasks: [
        { hours: { PM: 10 }, ptc: 50 },
        { hours: { PM: 5, DEV: 2 }, ptc: 0 },
      ],
    };
    const roles = [{ roleCode: 'PM', rate: 100 }, { roleCode: 'DEV', rate: 80 }];
    expect(cgComputePhaseTotals(phase, roles)).toEqual({ hrs: 17, fee: 1660, ptc: 50, byRole: { PM: 15, DEV: 2 } });
  });

  it('returns zeroed totals for a phase with no tasks', () => {
    const roles = [{ roleCode: 'PM', rate: 100 }];
    expect(cgComputePhaseTotals({ tasks: [] }, roles)).toEqual({ hrs: 0, fee: 0, ptc: 0, byRole: { PM: 0 } });
  });
});

describe('cgComputeGrandTotals', () => {
  it('sums phase totals across the whole version', () => {
    const version = {
      roles: [{ roleCode: 'PM', rate: 100 }],
      phases: [
        { tasks: [{ hours: { PM: 10 }, ptc: 0 }] },
        { tasks: [{ hours: { PM: 5 }, ptc: 20 }] },
      ],
    };
    expect(cgComputeGrandTotals(version)).toEqual({ hrs: 15, fee: 1500, ptc: 20 });
  });
});

describe('cgComputeColumnTotals', () => {
  it('returns per-role hrs/fee totals across all phases', () => {
    const version = {
      roles: [{ roleCode: 'PM', rate: 100 }, { roleCode: 'DEV', rate: 50 }],
      phases: [
        { tasks: [{ hours: { PM: 3 } }] },
        { tasks: [{ hours: { PM: 2, DEV: 4 } }] },
      ],
    };
    expect(cgComputeColumnTotals(version)).toEqual({ PM: { hrs: 5, fee: 500 }, DEV: { hrs: 4, fee: 200 } });
  });
});
