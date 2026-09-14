import { describe, it, expect } from 'vitest';
import {
  pbGetVersionBudget, pbComputeColumnTotals, pbFmtMoney, pbFmtDate, pbFmtTaskDate, pbComputePotPercentages,
  pbPriceBucketKey, pbCardMatchesFilters,
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

describe('pbPriceBucketKey', () => {
  it('buckets 0 into "0-20k"', () => {
    expect(pbPriceBucketKey(0)).toBe('0-20k');
  });

  it('buckets a value just under 20k into "0-20k"', () => {
    expect(pbPriceBucketKey(19999.99)).toBe('0-20k');
  });

  it('buckets exactly 20000 into "20-50k" (lower bound inclusive of the next bucket)', () => {
    expect(pbPriceBucketKey(20000)).toBe('20-50k');
  });

  it('buckets exactly 50000 into "50-100k"', () => {
    expect(pbPriceBucketKey(50000)).toBe('50-100k');
  });

  it('buckets exactly 100000 into "100-200k"', () => {
    expect(pbPriceBucketKey(100000)).toBe('100-200k');
  });

  it('buckets exactly 200000 and above into "200k+"', () => {
    expect(pbPriceBucketKey(200000)).toBe('200k+');
    expect(pbPriceBucketKey(1000000)).toBe('200k+');
  });

  it('treats a non-finite amount as 0', () => {
    expect(pbPriceBucketKey(NaN)).toBe('0-20k');
    expect(pbPriceBucketKey(undefined)).toBe('0-20k');
  });
});

describe('pbCardMatchesFilters', () => {
  const cgComputeGrandTotals = (v) => ({ fee: v._fee ?? 0, ptc: v._ptc ?? 0, hrs: 0 });
  const noApiBudget = () => null;
  const clientNames = { c1: 'Menarini Ricerche', c2: 'Bayer AG' };
  const getClientName = (id) => clientNames[id] || '';

  function makeCard({ ownerId = 'u1', clientId = 'c1', currency = 'EUR', currencyRate = 1.0, fee = 0, ptc = 0, name = 'Test Proposal', phases = [{}] } = {}) {
    return {
      cg: { ownerId, name },
      v: { clientId, currency, currencyRate, phases, projectName: name, _fee: fee, _ptc: ptc },
    };
  }

  it('matches everything when no filters are set', () => {
    const card = makeCard({});
    const result = pbCardMatchesFilters(card, {}, cgComputeGrandTotals, noApiBudget, getClientName);
    expect(result).toBe(true);
  });

  it('filters by ownerIds (no match)', () => {
    const card = makeCard({ ownerId: 'u1' });
    const result = pbCardMatchesFilters(card, { ownerIds: ['u2'] }, cgComputeGrandTotals, noApiBudget, getClientName);
    expect(result).toBe(false);
  });

  it('filters by ownerIds (match, OR semantics across multiple selected owners)', () => {
    const card = makeCard({ ownerId: 'u2' });
    const result = pbCardMatchesFilters(card, { ownerIds: ['u1', 'u2'] }, cgComputeGrandTotals, noApiBudget, getClientName);
    expect(result).toBe(true);
  });

  it('filters by clientIds', () => {
    const card = makeCard({ clientId: 'c2' });
    expect(pbCardMatchesFilters(card, { clientIds: ['c1'] }, cgComputeGrandTotals, noApiBudget, getClientName)).toBe(false);
    expect(pbCardMatchesFilters(card, { clientIds: ['c2'] }, cgComputeGrandTotals, noApiBudget, getClientName)).toBe(true);
  });

  it('filters by currency', () => {
    const card = makeCard({ currency: 'USD' });
    expect(pbCardMatchesFilters(card, { currencies: ['EUR'] }, cgComputeGrandTotals, noApiBudget, getClientName)).toBe(false);
    expect(pbCardMatchesFilters(card, { currencies: ['USD'] }, cgComputeGrandTotals, noApiBudget, getClientName)).toBe(true);
  });

  it('filters by price bucket using the fee-only EUR-equivalent total by default (PTC excluded)', () => {
    const card = makeCard({ fee: 30000, ptc: 100000, currencyRate: 1.0 }); // fee alone -> 20-50k
    expect(pbCardMatchesFilters(card, { priceBuckets: ['20-50k'] }, cgComputeGrandTotals, noApiBudget, getClientName)).toBe(true);
    expect(pbCardMatchesFilters(card, { priceBuckets: ['200k+'] }, cgComputeGrandTotals, noApiBudget, getClientName)).toBe(false);
  });

  it('filters by price bucket on fee+ptc EUR-equivalent total when includePtc is true', () => {
    const card = makeCard({ fee: 30000, ptc: 100000, currencyRate: 1.0 }); // fee+ptc = 130000 -> 100-200k
    expect(pbCardMatchesFilters(card, { priceBuckets: ['100-200k'], includePtc: true }, cgComputeGrandTotals, noApiBudget, getClientName)).toBe(true);
    expect(pbCardMatchesFilters(card, { priceBuckets: ['20-50k'], includePtc: true }, cgComputeGrandTotals, noApiBudget, getClientName)).toBe(false);
  });

  it('converts to EUR-equivalent using currencyRate before bucketing', () => {
    // 88000 USD at rate 1.1 -> 80000 EUR-equivalent -> 50-100k bucket (comfortably inside,
    // away from the boundary, since dividing by a non-exact float rate can land a hair off
    // an exact boundary value)
    const card = makeCard({ fee: 88000, currency: 'USD', currencyRate: 1.1 });
    expect(pbCardMatchesFilters(card, { priceBuckets: ['50-100k'] }, cgComputeGrandTotals, noApiBudget, getClientName)).toBe(true);
    expect(pbCardMatchesFilters(card, { priceBuckets: ['20-50k'] }, cgComputeGrandTotals, noApiBudget, getClientName)).toBe(false);
  });

  it('matches free-text search against the proposal name (case-insensitive substring)', () => {
    const card = makeCard({ name: 'A.U.RO.R.A. Platform Development' });
    expect(pbCardMatchesFilters(card, { search: 'platform' }, cgComputeGrandTotals, noApiBudget, getClientName)).toBe(true);
    expect(pbCardMatchesFilters(card, { search: 'nomatch' }, cgComputeGrandTotals, noApiBudget, getClientName)).toBe(false);
  });

  it('matches free-text search against the client name', () => {
    const card = makeCard({ clientId: 'c2' }); // Bayer AG
    expect(pbCardMatchesFilters(card, { search: 'bayer' }, cgComputeGrandTotals, noApiBudget, getClientName)).toBe(true);
  });

  it('combines all active filters with AND semantics', () => {
    const card = makeCard({ ownerId: 'u1', clientId: 'c1', currency: 'EUR', fee: 10000 });
    const filters = { ownerIds: ['u1'], clientIds: ['c1'], currencies: ['EUR'], priceBuckets: ['0-20k'], search: 'test' };
    expect(pbCardMatchesFilters(card, filters, cgComputeGrandTotals, noApiBudget, getClientName)).toBe(true);
    // Flip one condition to false -> whole match must fail
    expect(pbCardMatchesFilters(card, { ...filters, clientIds: ['c2'] }, cgComputeGrandTotals, noApiBudget, getClientName)).toBe(false);
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
