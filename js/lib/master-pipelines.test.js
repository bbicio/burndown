import { describe, it, expect } from 'vitest';
import {
  parseMdpUrl, buildMdpUrl, resolvePot, potCountByYear, achievement, gapToTarget, outsidePotCommitted,
  potClientIds, availableTargets, ACTIVE_STAGES, rowMonthAmount, rowCurrency, filterPhasingRows,
  phasingTotals, stageCounts, mdpDrawerDismiss,
} from './master-pipelines.js';

const MONTHS = ['2026-01', '2026-02'];
// Characterization fixtures: the data shape the current phasingTableHtml / projectPhasingTableHtml read.
const PROPOSAL = [
  { name: 'A', pipeline: 'Committed',   clientId: 'c1', currency: 'EUR', currencyRate: 1,   months: { '2026-01': { amount: 100 } } },
  { name: 'B', pipeline: 'Anticipated', clientId: 'c2', currency: 'GBP', currencyRate: 0.8, months: { '2026-01': { amount: 80 }, '2026-02': { amount: 40 } } },
  { name: 'C', pipeline: 'SIP',         clientId: 'c1', currency: 'EUR', currencyRate: 1,   months: {} },
  { name: 'D', pipeline: 'Draft',       clientId: 'c1', currency: 'EUR', currencyRate: 1,   months: { '2026-01': { amount: 999 } } },
  { name: 'E', pipeline: 'Canceled',    clientId: 'c2', currency: 'EUR', currencyRate: 1,   months: { '2026-01': { amount: 999 } } },
];
const PROJECT = PROPOSAL.map(r => ({
  ...r, months: Object.fromEntries(Object.entries(r.months).map(([m, v]) => [m, v.amount])),
}));

describe('characterization: phasing filter and EUR totals', () => {
  for (const [label, rows] of [['proposal', PROPOSAL], ['project', PROJECT]]) {
    it(`${label}: Draft and Canceled are always out; stage and client filters apply`, () => {
      expect(filterPhasingRows(rows, {}).map(r => r.name)).toEqual(['A', 'B', 'C']);
      expect(filterPhasingRows(rows, { stages: ['Committed'] }).map(r => r.name)).toEqual(['A']);
      expect(filterPhasingRows(rows, { clientId: 'c2' }).map(r => r.name)).toEqual(['B']);
    });
    it(`${label}: EUR totals divide by currencyRate`, () => {
      const [t] = phasingTotals(filterPhasingRows(rows, {}), MONTHS, 'eur');
      expect(t.currency).toBe('EUR');
      expect(t.months).toEqual({ '2026-01': 200, '2026-02': 50 });
      expect(t.total).toBe(250);
    });
  }
});

describe('parseMdpUrl / buildMdpUrl', () => {
  it('reads each level', () => {
    expect(parseMdpUrl('')).toEqual({ year: null, pot: null, phasing: null });
    expect(parseMdpUrl('?year=2026')).toEqual({ year: 2026, pot: null, phasing: null });
    expect(parseMdpUrl('?year=2026&pot=abc')).toEqual({ year: 2026, pot: 'abc', phasing: null });
    expect(parseMdpUrl('?year=2026&phasing=project')).toEqual({ year: 2026, pot: null, phasing: 'project' });
  });
  it('rejects invalid pieces', () => {
    expect(parseMdpUrl('?year=abc')).toEqual({ year: null, pot: null, phasing: null });
    expect(parseMdpUrl('?year=1999')).toEqual({ year: null, pot: null, phasing: null });
    expect(parseMdpUrl('?year=2026&phasing=x')).toEqual({ year: 2026, pot: null, phasing: null });
    expect(parseMdpUrl('?pot=abc')).toEqual({ year: null, pot: null, phasing: null });
    expect(parseMdpUrl('?phasing=proposal')).toEqual({ year: null, pot: null, phasing: null });
  });
  it('phasing wins over pot', () => {
    expect(parseMdpUrl('?year=2026&pot=abc&phasing=proposal')).toEqual({ year: 2026, pot: null, phasing: 'proposal' });
  });
  it('round-trips', () => {
    for (const s of [{}, { year: 2026 }, { year: 2026, pot: 'abc' }, { year: 2026, phasing: 'project' }]) {
      const back = parseMdpUrl(buildMdpUrl(s));
      expect(back).toEqual({ year: s.year ?? null, pot: s.pot ?? null, phasing: s.phasing ?? null });
    }
    expect(buildMdpUrl({})).toBe('');
    expect(buildMdpUrl({ year: 2026 })).toBe('?year=2026');
    expect(buildMdpUrl({ year: 2026, pot: 'x' })).toBe('?year=2026&pot=x');
    expect(buildMdpUrl({ year: 2026, phasing: 'proposal' })).toBe('?year=2026&phasing=proposal');
  });
});

describe('resolvePot / potCountByYear', () => {
  const pots = [{ id: 'a', year: 2026 }, { id: 'b', year: 2026 }, { id: 'c', year: 2025 }];
  it('finds a POT or returns null for a missing / other-year id', () => {
    expect(resolvePot(pots, 'b')).toBe(pots[1]);
    expect(resolvePot(pots, 'zzz')).toBeNull();
    expect(resolvePot(pots.filter(p => p.year === 2026), 'c')).toBeNull();
    expect(resolvePot(pots, null)).toBeNull();
  });
  it('counts per year', () => {
    expect(potCountByYear(pots)).toEqual({ 2026: 2, 2025: 1 });
    expect(potCountByYear([])).toEqual({});
  });
});

describe('achievement / gapToTarget / outsidePotCommitted', () => {
  it('achievement is a whole percent, null without a target', () => {
    expect(achievement(50, 0)).toBeNull();
    expect(achievement(50, -1)).toBeNull();
    expect(achievement(50, Infinity)).toBeNull();
    expect(achievement(306670, 510000)).toBe(60);
  });
  it('gap and over', () => {
    expect(gapToTarget(510000, 298170)).toEqual({ gap: 211830, over: 0 });
    expect(gapToTarget(60000, 60020)).toEqual({ gap: 0, over: 20 });
  });
  it('outside-POT Committed', () => {
    const summary = [{ pipeline: 'Committed', count: 3, total: 90040 }, { pipeline: 'SIP', count: 1, total: 5 }];
    const pots = [{ committed_total: 60020 }, { committed_total: 21520 }];
    expect(outsidePotCommitted(summary, pots)).toBe(8500);
    expect(outsidePotCommitted(summary, [{ committed_total: 90040 }])).toBeNull();
    // float residue below one cent is not an amount outside the POTs
    expect(outsidePotCommitted([{ pipeline: 'Committed', total: 0.3 }], [{ committed_total: 0.1 }, { committed_total: 0.2 }])).toBeNull();
    expect(outsidePotCommitted(summary, [{ committed_total: 100000 }])).toBeNull();
    expect(outsidePotCommitted([], pots)).toBeNull();
  });
});

describe('potClientIds', () => {
  const groups = [{ id: 'g1', clients: [{ id: 'c1' }, { id: 'c2' }] }];
  it('client, group and General POTs', () => {
    expect([...potClientIds({ client_id: 'c9' }, groups)]).toEqual(['c9']);
    expect([...potClientIds({ client_group_id: 'g1' }, groups)].sort()).toEqual(['c1', 'c2']);
    expect(potClientIds({ special_label: 'New Biz' }, groups).size).toBe(0);
    expect(potClientIds({ client_group_id: 'gX' }, groups).size).toBe(0);
  });
});

describe('availableTargets', () => {
  const clients = [{ id: 'c2', name: 'Beta' }, { id: 'c1', name: 'Alpha' }, { id: 'c3', name: 'Gamma' }];
  const groups = [{ id: 'g2', name: 'Zed' }, { id: 'g1', name: 'Acme' }];
  it('client: specials, separator, then clients by name', () => {
    expect(availableTargets({ type: 'client', pots: [], clients, groups })).toEqual([
      { value: '__unassigned__', label: 'Unassigned / To be Identified' },
      { value: '__newbiz__', label: 'New Biz' },
      { value: '__sep__', label: '──────────', disabled: true },
      { value: 'c1', label: 'Alpha' }, { value: 'c2', label: 'Beta' }, { value: 'c3', label: 'Gamma' },
    ]);
  });
  it('hides targets that already have a POT', () => {
    const pots = [{ client_id: 'c1' }, { special_label: 'New Biz' }, { client_group_id: 'g2' }];
    const c = availableTargets({ type: 'client', pots, clients, groups }).map(o => o.value);
    expect(c).toEqual(['__unassigned__', '__sep__', 'c2', 'c3']);
    expect(availableTargets({ type: 'group', pots, clients, groups })).toEqual([{ value: 'g1', label: 'Acme' }]);
    const u = availableTargets({ type: 'client', pots: [{ special_label: 'Unassigned / To be Identified' }], clients, groups });
    expect(u.map(o => o.value)).not.toContain('__unassigned__');
  });
});

describe('row helpers', () => {
  it('rowMonthAmount reads numbers and { amount }, missing = 0', () => {
    expect(rowMonthAmount({ months: { m: 5 } }, 'm')).toBe(5);
    expect(rowMonthAmount({ months: { m: { amount: 7 } } }, 'm')).toBe(7);
    expect(rowMonthAmount({ months: {} }, 'm')).toBe(0);
    expect(rowMonthAmount({}, 'm')).toBe(0);
  });
  it('rowCurrency trims and defaults to EUR', () => {
    expect(rowCurrency({ currency: 'GBP ' })).toBe('GBP');
    expect(rowCurrency({ currency: null })).toBe('EUR');
    expect(rowCurrency({ currency: '  ' })).toBe('EUR');
    expect(rowCurrency({})).toBe('EUR');
  });
  it('ACTIVE_STAGES', () => {
    expect(ACTIVE_STAGES).toEqual(['SIP', 'Expected', 'Anticipated', 'Committed']);
  });
});

describe('filterPhasingRows with potClients', () => {
  it('ANDs the POT client set with the client filter', () => {
    const pc = new Set(['c1']);
    expect(filterPhasingRows(PROPOSAL, { potClients: pc }).map(r => r.name)).toEqual(['A', 'C']);
    expect(filterPhasingRows(PROPOSAL, { potClients: pc, clientId: 'c2' })).toEqual([]);
    expect(filterPhasingRows(PROPOSAL, { potClients: new Set() })).toEqual([]);
  });
});

describe('phasingTotals', () => {
  it('currencyRate 0 or null counts as 1, never Infinity/NaN', () => {
    for (const currencyRate of [0, null, undefined]) {
      const [t] = phasingTotals([{ currency: 'EUR', currencyRate, months: { '2026-01': 50 } }], MONTHS, 'eur');
      expect(t.months['2026-01']).toBe(50);
      expect(Number.isFinite(t.total)).toBe(true);
    }
  });
  it('original: one entry per normalized currency, EUR first, never mixed', () => {
    const rows = [
      { currency: 'GBP ', currencyRate: 0.8, months: { '2026-01': 80 } },
      { currency: null, currencyRate: 1, months: { '2026-01': 10 } },
      { currency: 'EUR', currencyRate: 1, months: { '2026-02': 5 } },
      { currency: 'CHF', currencyRate: 1, months: { '2026-01': 1 } },
    ];
    const t = phasingTotals(rows, MONTHS, 'original');
    expect(t.map(x => x.currency)).toEqual(['EUR', 'CHF', 'GBP']);
    expect(t[0]).toEqual({ currency: 'EUR', count: 2, months: { '2026-01': 10, '2026-02': 5 }, total: 15 });
    expect(t[2]).toEqual({ currency: 'GBP', count: 1, months: { '2026-01': 80, '2026-02': 0 }, total: 80 });
  });
  it('eur mode with no rows still returns one EUR entry', () => {
    expect(phasingTotals([], MONTHS, 'eur')).toEqual([{ currency: 'EUR', count: 0, months: { '2026-01': 0, '2026-02': 0 }, total: 0 }]);
  });
});

describe('stageCounts', () => {
  it('counts only the four active stages', () => {
    expect(stageCounts(PROPOSAL)).toEqual({ SIP: 1, Expected: 0, Anticipated: 1, Committed: 1 });
  });
});

describe('mdpDrawerDismiss', () => {
  it('does nothing while a save is running', () => {
    expect(mdpDrawerDismiss({ potfShow: true, hasDetails: true, loading: true })).toBe('none');
  });
  it('does nothing while a save is running, even with the close button', () => {
    expect(mdpDrawerDismiss({ pyfShow: true, loading: true, closeAll: true })).toBe('none');
  });
  it('closes the whole drawer with the close button over the details', () => {
    expect(mdpDrawerDismiss({ potfShow: true, hasDetails: true, closeAll: true })).toBe('close-drawer');
  });
  it('closes the details when no form is open', () => {
    expect(mdpDrawerDismiss({ hasDetails: true })).toBe('close-drawer');
  });
  it('goes back to the details from the edit form', () => {
    expect(mdpDrawerDismiss({ potfShow: true, hasDetails: true })).toBe('back-to-details');
  });
  it('closes a POT form opened on its own', () => {
    expect(mdpDrawerDismiss({ potfShow: true })).toBe('close-form');
  });
  it('closes the new-year form', () => {
    expect(mdpDrawerDismiss({ pyfShow: true })).toBe('close-form');
  });
  it('closes the drawer with the close button over the new-year form', () => {
    expect(mdpDrawerDismiss({ pyfShow: true, closeAll: true })).toBe('close-drawer');
  });
  it('does nothing when nothing is open', () => {
    expect(mdpDrawerDismiss({})).toBe('none');
  });
});
