import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { cgRatecardMaps, resolveRoleRate } from './costgrid-calc.js';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';

// Spec currency-f3 §1/§5: a saved version is never re-priced by itself. js/costgrid.js and
// costgrid.html are classic scripts, so the functions are cut out of the files and run against stubs.
const js = readFileSync('js/costgrid.js', 'utf8');
const html = readFileSync('costgrid.html', 'utf8');

const roles = () => [{ id: 1, code: 'PM', rate: 100, rateOverrides: {} }, { id: 2, code: 'DEV', rate: 80, rateOverrides: {} }];

describe('cgUpdateActiveRatecardMap({ syncRates })', () => {
  let draft, fn;
  beforeEach(() => {
    draft = { currency: 'EUR', currencyRate: 1, ratecardId: 7, roles: [
      { roleCode: 'PM', rate: 100, rateIsCustom: false }, { roleCode: 'DEV', rate: 95, rateIsCustom: true },
    ] };
    const stubs = {
      _cgDraft: draft,
      getRoles: roles,
      loadRatecardsForDropdown: async () => [{ id: 7, client_id: null, entries: [{ role_id: 1, hourly_rate: 150 }, { role_id: 2, hourly_rate: 120 }] }],
      cgRatecardMaps, resolveRoleRate,
    };
    const names = Object.keys(stubs);
    fn = new Function(...names, `let _cgActiveRatecardMap = {}, _cgActiveRatecardOverrides = {}, _cgIsClientRatecard = false;
      ${extractBlock(js, 'async function cgUpdateActiveRatecardMap(')}
      ${extractBlock(js, 'function cgSyncRoleRatesToBaseline(')}
      return cgUpdateActiveRatecardMap;`)(...names.map(n => stubs[n]));
  });

  it('opening leaves saved rates as they are', async () => {
    await fn();
    expect(draft.roles.map(r => r.rate)).toEqual([100, 95]);
  });

  it('syncRates realigns non-Custom roles and keeps Custom', async () => {
    await fn({ syncRates: true });
    expect(draft.roles.map(r => r.rate)).toEqual([150, 95]);
  });
});

describe('cgUpdateActiveRatecardMap callers (costgrid.html)', () => {
  it('opening the version and the role modal never sync', () => {
    for (const head of ['async openVersion(', 'async openRoleModal(']) {
      const src = extractBlock(html, head);
      expect(src).toContain('cgUpdateActiveRatecardMap()');
      expect(src).not.toContain('syncRates');
    }
  });

  it('a ratecard change syncs', () => {
    expect(extractBlock(html, 'async onRatecardChange(')).toContain('cgUpdateActiveRatecardMap({ syncRates: true })');
  });

  it('there are exactly four call sites', () => {
    expect(html.match(/await cgUpdateActiveRatecardMap\(/g)).toHaveLength(4);
  });
});

describe('refreshRatecards', () => {
  function run(allRatecards) {
    const update = vi.fn(async () => {});
    const ctx = { draft: { clientId: 'c1', ratecardId: 9 }, allRatecards, $forceUpdate: vi.fn() };
    const stubs = { cgUpdateActiveRatecardMap: update, _cgActiveRatecardMap: {}, _cgActiveRatecardOverrides: {}, _cgIsClientRatecard: false };
    const names = Object.keys(stubs);
    const m = new Function(...names, `const o = { ${extractBlock(html, 'async refreshRatecards(')} }; return o.refreshRatecards;`)(...names.map(n => stubs[n]));
    return m.call(ctx).then(() => ({ ctx, update }));
  }

  it('a ratecard no longer valid for the client is cleared and the rates re-synced', async () => {
    const { ctx, update } = await run([{ id: 9, client_id: 'c2' }]);
    expect(ctx.draft.ratecardId).toBe(null);
    expect(update).toHaveBeenCalledWith({ syncRates: true });
  });

  it('a ratecard still valid is kept and nothing is re-priced', async () => {
    const { ctx, update } = await run([{ id: 9, client_id: 'c1' }]);
    expect(ctx.draft.ratecardId).toBe(9);
    expect(update).toHaveBeenCalledWith({ syncRates: false });
  });
});
