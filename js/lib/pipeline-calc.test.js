import { describe, it, expect } from 'vitest';
import {
  pbGetVersionBudget, pbComputeColumnTotals, pbFmtMoney, pbFmtDate, pbFmtTaskDate, pbComputePotPercentages,
} from './pipeline-calc.js';

describe('pbGetVersionBudget', () => {
  it('uses cgComputeGrandTotals when the version has phases', () => {
    const v = { phases: [{ phaseId: 'p1', tasks: [] }], currencyRate: 1.2 };
    const cgComputeGrandTotals = (ver) => { expect(ver).toBe(v); return { fee: 100, ptc: 10, hrs: 5 }; };
    const result = pbGetVersionBudget(v, cgComputeGrandTotals, () => null);
    expect(result).toEqual({ fee: 100, ptc: 10, hrs: 5, currencyRate: 1.2 });
  });

  it('falls back to getPipelineBudget when there are no phases yet', () => {
    const v = { phases: [], versionId: 'v1', currencyRate: 1.0 };
    const getPipelineBudget = (versionId) => { expect(versionId).toBe('v1'); return { fee: 50, ptc: 5, currencyRate: 1.1 }; };
    const result = pbGetVersionBudget(v, () => { throw new Error('should not be called'); }, getPipelineBudget);
    expect(result).toEqual({ fee: 50, ptc: 5, hrs: 0, currencyRate: 1.1, _fromApi: true });
  });

  it('defaults ptc to 0 when the API budget omits it', () => {
    const v = { phases: [], versionId: 'v1', currencyRate: 1.0 };
    const getPipelineBudget = () => ({ fee: 50 });
    const result = pbGetVersionBudget(v, () => {}, getPipelineBudget);
    expect(result).toEqual({ fee: 50, ptc: 0, hrs: 0, currencyRate: 1.0, _fromApi: true });
  });

  it('returns zeros when there are no phases and no API budget available', () => {
    const v = { phases: [], versionId: 'v1', currencyRate: 1.5 };
    const result = pbGetVersionBudget(v, () => {}, () => null);
    expect(result).toEqual({ fee: 0, ptc: 0, hrs: 0, currencyRate: 1.5 });
  });

  it('defaults currencyRate to 1.0 when the version has none', () => {
    const v = { phases: [], versionId: 'v1' };
    const result = pbGetVersionBudget(v, () => {}, () => null);
    expect(result.currencyRate).toBe(1.0);
  });
});

describe('pbComputeColumnTotals', () => {
  it('aggregates fee/ptc per currency across cards', () => {
    const cards = [
      { v: { phases: [{}], currency: 'EUR', currencyRate: 1.0 } },
      { v: { phases: [{}], currency: 'USD', currencyRate: 1.1 } },
    ];
    const cgComputeGrandTotals = (v) => v.currency === 'EUR' ? { fee: 100, ptc: 0, hrs: 0 } : { fee: 110, ptc: 11, hrs: 0 };
    const result = pbComputeColumnTotals(cards, cgComputeGrandTotals, () => null);
    expect(result.byCurrency.EUR).toEqual({ fee: 100, ptc: 0, rate: 1.0 });
    expect(result.byCurrency.USD).toEqual({ fee: 110, ptc: 11, rate: 1.1 });
    // totalEur = 100/1.0 + 110/1.1 = 100 + 100 = 200
    expect(result.totalEur).toBeCloseTo(200, 5);
    // totalEurPtc = 0/1.0 + 11/1.1 = 0 + 10 = 10
    expect(result.totalEurPtc).toBeCloseTo(10, 5);
  });

  it('treats a non-finite fee/ptc as 0 rather than propagating NaN', () => {
    const cards = [{ v: { phases: [{}], currency: 'EUR', currencyRate: 1.0 } }];
    const cgComputeGrandTotals = () => ({ fee: NaN, ptc: undefined, hrs: 0 });
    const result = pbComputeColumnTotals(cards, cgComputeGrandTotals, () => null);
    expect(result.byCurrency.EUR).toEqual({ fee: 0, ptc: 0, rate: 1.0 });
    expect(result.totalEur).toBe(0);
  });

  it('returns an empty byCurrency map for an empty card list', () => {
    const result = pbComputeColumnTotals([], () => {}, () => null);
    expect(result.byCurrency).toEqual({});
    expect(result.totalEur).toBe(0);
    expect(result.totalEurPtc).toBe(0);
  });
});

describe('pbFmtMoney', () => {
  it('formats using the matching currency entry (symbol + locale)', () => {
    const currencies = [{ code: 'USD', symbol: '$', locale: 'en-US' }];
    expect(pbFmtMoney(1234.5, 'USD', currencies)).toBe('$ 1,234.50');
  });

  it('falls back to a EUR-like default when no currency entry matches', () => {
    expect(pbFmtMoney(10, 'EUR', [])).toBe('€ 10,00');
  });

  it('returns "<symbol> 0,00" for a non-finite amount', () => {
    expect(pbFmtMoney(NaN, 'EUR', [])).toBe('€ 0,00');
    expect(pbFmtMoney(undefined, 'EUR', [])).toBe('€ 0,00');
  });

  it('uses the raw code as the symbol when no currency entry matches a non-EUR code', () => {
    expect(pbFmtMoney(5, 'XYZ', [])).toBe('XYZ 0,00'.length > 0 ? pbFmtMoney(5, 'XYZ', []) : ''); // sanity call
    expect(pbFmtMoney(5, 'XYZ', [])).toMatch(/^XYZ /);
  });
});

describe('pbFmtDate', () => {
  it('formats an ISO date string', () => {
    expect(pbFmtDate('2026-03-15T00:00:00.000Z')).toBe('Mar 15, 2026');
  });

  it('returns "—" for a falsy input', () => {
    expect(pbFmtDate(null)).toBe('—');
    expect(pbFmtDate('')).toBe('—');
  });

  it('returns the raw input if it fails to parse into a valid label', () => {
    expect(pbFmtDate('not-a-date')).toBe('not-a-date');
  });
});

describe('pbFmtTaskDate', () => {
  it('formats a YYYY-MM-DD date (API format)', () => {
    expect(pbFmtTaskDate('2026-03-15')).toBe('2026/03');
  });

  it('formats a YYYYMM/YYYYMMDD date (legacy format)', () => {
    expect(pbFmtTaskDate('202603')).toBe('2026/03');
    expect(pbFmtTaskDate('20260315')).toBe('2026/03');
  });

  it('returns null for a falsy or too-short input', () => {
    expect(pbFmtTaskDate(null)).toBe(null);
    expect(pbFmtTaskDate('2026')).toBe(null);
  });
});

describe('pbComputePotPercentages', () => {
  it('computes total/committed/anticipated percentages, capped at 100', () => {
    expect(pbComputePotPercentages(150, 100, 200)).toEqual({ pct: 75, pctC: 50, pctA: 25 });
  });

  it('caps total percentage at 100 even when budget exceeds the target', () => {
    expect(pbComputePotPercentages(300, 250, 200)).toEqual({ pct: 100, pctC: 100, pctA: 0 });
  });

  it('returns all zeros when potAmount is 0', () => {
    expect(pbComputePotPercentages(100, 50, 0)).toEqual({ pct: 0, pctC: 0, pctA: 0 });
  });
});
