import { describe, it, expect } from 'vitest';
import {
  pbGetVersionBudget, pbComputeColumnTotals, pbFmtDate, pbFmtTaskDate, pbComputePotPercentages,
  pbPriceBucketKey, pbCardMatchesFilters,
  pbCardAmount, pbColumnHeader, pbOpenPipelineTotal, pbHighlight, pbSearchSuggestions,
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

// ── View-model functions ──
const formatMoney = (n, code) => code + ' ' + n.toFixed(2);
const mkDeps = (budgets = {}, clients = {}) => ({
  cgComputeGrandTotals: (v) => budgets[v.versionId] || { fee: 0, ptc: 0, hrs: 0 },
  getPipelineBudget: () => null,
  getClientName: (id) => clients[id] || '',
  formatMoney,
  currencies: [],
});
// card with a phase so cgComputeGrandTotals is used
const mkCard = (id, over = {}, stage = 'SIP') => ({
  stage,
  cg: { id, name: over.cgName ?? 'Grid ' + id, ownerId: 'o1' },
  v: { versionId: id, phases: [{}], currency: 'EUR', currencyRate: 1, projectName: 'Proj ' + id, clientId: 'c1', ...over.v },
});

describe('pbCardAmount', () => {
  it('EUR card, original mode', () => {
    const d = mkDeps({ a: { fee: 100, ptc: 0 } });
    expect(pbCardAmount(mkCard('a'), 'original', d)).toEqual({ noBudget: false, main: 'EUR 100.00', approx: null, from: null, ptc: null });
  });
  it('CHF card, original mode shows EUR approximation', () => {
    const d = mkDeps({ a: { fee: 110, ptc: 0 } });
    const r = pbCardAmount(mkCard('a', { v: { currency: 'CHF', currencyRate: 1.1 } }), 'original', d);
    expect(r.main).toBe('CHF 110.00');
    expect(r.approx).toBe('≈ EUR 100.00');
    expect(r.from).toBeNull();
  });
  it('CHF card, eur mode shows from line', () => {
    const d = mkDeps({ a: { fee: 110, ptc: 11 } });
    const r = pbCardAmount(mkCard('a', { v: { currency: 'CHF', currencyRate: 1.1 } }), 'eur', d);
    expect(r).toEqual({ noBudget: false, main: 'EUR 100.00', approx: null, from: 'from CHF 110.00', ptc: '+ EUR 10.00 PTC' });
  });
  it('fee 0 with PTC > 0 is "no budget" but keeps the PTC line', () => {
    const d = mkDeps({ a: { fee: 0, ptc: 5 } });
    const r = pbCardAmount(mkCard('a'), 'original', d);
    expect(r).toEqual({ noBudget: true, main: null, approx: null, from: null, ptc: '+ EUR 5.00 PTC' });
  });
  it('rate 0, negative, NaN or missing never produces Infinity/NaN', () => {
    for (const rate of [0, -2, NaN, undefined, null]) {
      const d = mkDeps({ a: { fee: 100, ptc: 10 } });
      for (const mode of ['original', 'eur']) {
        const r = pbCardAmount(mkCard('a', { v: { currency: 'CHF', currencyRate: rate } }), mode, d);
        expect(JSON.stringify(r)).not.toMatch(/Infinity|NaN/);
      }
    }
  });
});

describe('pbColumnHeader', () => {
  it('empty column', () => {
    const r = pbColumnHeader([], 'original', mkDeps());
    expect(r).toMatchObject({ count: 0, total: null, pills: [] });
  });
  it('two EUR cards: no approx, no pills, no ptc', () => {
    const d = mkDeps({ a: { fee: 100, ptc: 0 }, b: { fee: 50, ptc: 0 } });
    const r = pbColumnHeader([mkCard('a'), mkCard('b')], 'original', d);
    expect(r).toEqual({ count: 2, total: 'EUR 150.00', approx: false, ptc: null, pills: [] });
  });
  it('EUR + CHF: approx and pills EUR first; eur mode has no pills', () => {
    const d = mkDeps({ a: { fee: 100, ptc: 0 }, b: { fee: 110, ptc: 0 } });
    const cards = [mkCard('b', { v: { currency: 'CHF', currencyRate: 1.1 } }), mkCard('a')];
    const r = pbColumnHeader(cards, 'original', d);
    expect(r.approx).toBe(true);
    expect(r.total).toBe('EUR 200.00');
    expect(r.pills).toEqual([{ code: 'EUR', text: 'EUR 100.00' }, { code: 'CHF', text: 'CHF 110.00' }]);
    expect(pbColumnHeader(cards, 'eur', d).pills).toEqual([]);
  });
  it('ptc row only when > 0; bad rate gives no Infinity', () => {
    const d = mkDeps({ a: { fee: 100, ptc: 20 } });
    expect(pbColumnHeader([mkCard('a')], 'original', d).ptc).toBe('+ EUR 20.00 PTC');
    const d2 = mkDeps({ a: { fee: 100, ptc: 20 }, b: { fee: 110, ptc: 0 } });
    const mixed = [mkCard('a'), mkCard('b', { v: { currency: 'CHF', currencyRate: 1.1 } })];
    expect(pbColumnHeader(mixed, 'original', d2).ptc).toBe('+ ≈ EUR 20.00 PTC');
    const r = pbColumnHeader([mkCard('a', { v: { currency: 'CHF', currencyRate: 0 } })], 'eur', d);
    expect(JSON.stringify(r)).not.toMatch(/Infinity|NaN/);
  });
});

describe('pbOpenPipelineTotal', () => {
  const stages = ['SIP', 'Expected', 'Anticipated', 'Committed', 'Canceled', 'Draft'];
  const cols = (over = {}) => stages.map((stage, i) => ({ stage, cards: [mkCard('s' + i, over[stage] || {}, stage)] }));
  const budgets = Object.fromEntries(stages.map((_, i) => ['s' + i, { fee: 100, ptc: 0 }]));
  it('sums only SIP, Expected, Anticipated', () => {
    expect(pbOpenPipelineTotal(cols(), mkDeps(budgets))).toEqual({ text: 'EUR 300.00', approx: false });
  });
  it('CHF in Committed does not set approx; CHF in SIP does', () => {
    const chf = { v: { currency: 'CHF', currencyRate: 1 } };
    expect(pbOpenPipelineTotal(cols({ Committed: chf }), mkDeps(budgets)).approx).toBe(false);
    expect(pbOpenPipelineTotal(cols({ SIP: chf }), mkDeps(budgets)).approx).toBe(true);
  });
  it('bad rate gives no Infinity', () => {
    const r = pbOpenPipelineTotal(cols({ SIP: { v: { currency: 'CHF', currencyRate: 0 } } }), mkDeps(budgets));
    expect(r.text).not.toMatch(/Infinity|NaN/);
  });
});

describe('pbHighlight', () => {
  it('highlights case-insensitively keeping original casing', () => {
    expect(pbHighlight('Bayer AG', 'bay')).toEqual([{ text: 'Bay', hit: true }, { text: 'er AG', hit: false }]);
  });
  it('treats regex characters literally', () => {
    const r = pbHighlight('a.(b a.(b', 'A.(B');
    expect(r.filter(s => s.hit)).toHaveLength(2);
    expect(r.map(s => s.text).join('')).toBe('a.(b a.(b');
  });
  it('blank query gives one non-hit segment', () => {
    expect(pbHighlight('abc', '  ')).toEqual([{ text: 'abc', hit: false }]);
  });
});

describe('pbSearchSuggestions', () => {
  const clients = { c1: 'Bayer', c2: 'Pfizer', c3: 'Unassigned' };
  it('blank query is empty', () => {
    expect(pbSearchSuggestions([mkCard('a')], ' ', mkDeps({}, clients))).toEqual({ empty: true, clients: [], proposals: [], more: 0 });
  });
  it('limits proposals to 4 and reports more', () => {
    const cards = ['a', 'b', 'c', 'd', 'e', 'f'].map(i => mkCard(i));
    const r = pbSearchSuggestions(cards, 'proj', mkDeps({ a: { fee: 10, ptc: 0 } }, clients));
    expect(r.proposals).toHaveLength(4);
    expect(r.more).toBe(2);
    expect(r.proposals[0]).toMatchObject({ cgId: 'a', verId: 'a', title: 'Proj a', amount: 'EUR 10.00', clientName: 'Bayer' });
    expect(r.proposals[1].amount).toBeNull();
  });
  it('Draft-only client is not suggested, but its Draft proposal is', () => {
    const cards = [mkCard('a', { v: { clientId: 'c2', projectName: 'Alpha' } }, 'Draft'), mkCard('b', { v: { clientId: 'c1', projectName: 'Beta' } })];
    const r = pbSearchSuggestions(cards, 'pfiz', mkDeps({}, clients));
    expect(r.clients).toEqual([]);
    expect(r.proposals).toHaveLength(1);
    expect(r.proposals[0].title).toBe('Alpha');
  });
  it('client count counts all non-Draft cards of the client, sorted by name, Unassigned excluded', () => {
    const cards = [
      mkCard('a', { v: { clientId: 'c1' } }), mkCard('b', { v: { clientId: 'c1', projectName: 'zzz' } }),
      mkCard('c', { v: { clientId: 'c1' } }, 'Draft'), mkCard('d', { v: { clientId: 'c2' } }),
      mkCard('e', { v: { clientId: 'c3' } }),
    ];
    const r = pbSearchSuggestions(cards, 'e', mkDeps({}, clients));
    expect(r.clients.map(c => [c.id, c.name, c.count])).toEqual([['c1', 'Bayer', 2], ['c2', 'Pfizer', 1]]);
    expect(r.clients[0].segments.map(s => s.text).join('')).toBe('Bayer');
  });
  it('missing title falls back to a dash', () => {
    const card = mkCard('a', { cgName: '', v: { projectName: '', clientId: 'c1' } });
    const r = pbSearchSuggestions([card], 'bay', mkDeps({}, clients));
    expect(r.proposals[0].title).toBe('—');
    expect(JSON.stringify(r)).not.toMatch(/undefined|"null"/);
  });
  it('missing client falls back to a dash', () => {
    const card = mkCard('a', { v: { projectName: 'Xyz', clientId: null } });
    const r = pbSearchSuggestions([card], 'xyz', mkDeps({}, {}));
    expect(r.proposals[0].clientName).toBe('—');
    expect(r.clients).toEqual([]);
  });
  it('"Unassigned" from getClientName is shown as a dash', () => {
    const card = mkCard('a', { v: { projectName: 'Xyz', clientId: 'c9' } });
    const deps = { ...mkDeps({}, {}), getClientName: () => 'Unassigned' };
    const r = pbSearchSuggestions([card], 'xyz', deps);
    expect(r.proposals[0].clientName).toBe('—');
    expect(r.clients).toEqual([]);
  });
});
