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

  it('opening prices a role that has no saved rate, and only that one (Gate 3 #2)', async () => {
    draft.roles.push({ roleCode: 'PM', rate: 100, rateIsCustom: false });
    draft.roles[0].rateUnsaved = true;
    await fn();
    expect(draft.roles.map(r => r.rate)).toEqual([150, 95, 100]);
    expect(draft.roles[0]).not.toHaveProperty('rateUnsaved');
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

describe('cgAdoptServerRate', () => {
  // Spec §8: the editor adopts the rate the server applied; rates are re-synced only after a currency change,
  // and the re-synced roles go into the same structure save (returned to _cgUpsertVersionToApi).
  let draft, store, render, schedule;
  const outgoing = () => [{ roleCode: 'PM', rate: 110, rateIsCustom: false }, { roleCode: 'DEV', rate: 95, rateIsCustom: true }];
  function adopt(activeVersionId = 'v1') {
    draft = { currency: 'USD', currencyRate: 1.1, roles: outgoing() };
    // The stored v1 no longer has DEV: the column was removed while the save was in flight.
    store = { id: 'cg1', versions: [{ versionId: 'v1', currency: 'USD', currencyRate: 1.1, roles: [{ roleCode: 'PM', rate: 110 }] }, { versionId: 'v2', currency: 'EUR', currencyRate: 1 }] };
    render = vi.fn(); schedule = vi.fn();
    const stubs = {
      _cgActiveCgId: 'cg1', _cgActiveVersionId: activeVersionId, _cgDraft: draft,
      cgLoad: () => JSON.parse(JSON.stringify(store)), cgSave: cg => { store = JSON.parse(JSON.stringify(cg)); },
      getRoles: () => [{ id: 1, code: 'PM', rate: 100, rateOverrides: {} }], resolveRoleRate,
      renderCgEditor: render, cgScheduleAutoSave: schedule,
    };
    const names = Object.keys(stubs);
    return new Function(...names, `let _cgActiveRatecardMap = {}, _cgActiveRatecardOverrides = {};
      ${extractBlock(js, 'function cgSyncRoleRatesToBaseline(')}
      ${extractBlock(js, 'function cgAdoptServerRate(')}
      return cgAdoptServerRate;`)(...names.map(n => stubs[n]));
  }
  const storedRate = id => store.versions.find(v => v.versionId === id).currencyRate;

  it('after a currency change: adopts the rate, re-prices non-Custom roles, returns them for the same save', () => {
    const sent = adopt()('cg1', 'v1', 1.2, true, 'USD', outgoing());
    expect(draft.currencyRate).toBe(1.2);
    expect(draft.roles.map(r => r.rate)).toEqual([120, 95]);
    expect(sent.map(r => r.rate)).toEqual([120, 95]);
    expect(storedRate('v1')).toBe(1.2);
    expect(store.versions[0].roles).toEqual([{ roleCode: 'PM', rate: 110 }]); // Gate 3 r2 #3: the store's roles are not rewritten
    expect(schedule).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalled();
  });

  it('otherwise: adopts the rate only, saved rates untouched, nothing returned', () => {
    const sent = adopt()('cg1', 'v1', 1.2, false, 'USD', outgoing());
    expect(draft.currencyRate).toBe(1.2);
    expect(draft.roles.map(r => r.rate)).toEqual([110, 95]);
    expect(sent).toBeUndefined();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('another version active: the draft is untouched, the stored version still gets the rate', () => {
    const sent = adopt('v2')('cg1', 'v1', 1.2, true, 'USD', outgoing());
    expect(draft.currencyRate).toBe(1.1);
    expect(draft.roles.map(r => r.rate)).toEqual([110, 95]);
    expect(sent).toBeUndefined();
    expect(storedRate('v1')).toBe(1.2);
  });

  it('a response for another currency is ignored (Gate 3 #5)', () => {
    const sent = adopt()('cg1', 'v1', 0.95, true, 'CHF', outgoing());
    expect(draft.currencyRate).toBe(1.1);
    expect(draft.roles.map(r => r.rate)).toEqual([110, 95]);
    expect(sent).toBeUndefined();
    expect(storedRate('v1')).toBe(1.1);
  });
});

// The currency-change flag after a Save (kept on failure, per version, cleared by a Save that went through) is
// pinned by js/lib/api-sync-save.test.js, where the Save lives since save contract cycle 2.
