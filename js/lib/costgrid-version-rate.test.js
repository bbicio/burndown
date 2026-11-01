import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import './money.js';
import { resolveRoleRate } from './costgrid-calc.js';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';

// B-183: a version's role baselines are computed with the version's own currencyRate, not the currency's live
// current_rate. Only cgPreviewRateChange (the rate versionRate will apply on a currency change) reads current_rate.
// js/costgrid.js is a classic script, so the functions are cut out of the file and run against stubs.
const js = readFileSync('js/costgrid.js', 'utf8');

const CURRENCIES = [
  { code: 'EUR', symbol: '€', locale: 'it-IT', current_rate: '1.000000' },
  { code: 'USD', symbol: '$', locale: 'en-US', current_rate: '1.200000' },
];
const ROLES = [{ id: 1, code: 'PM', rate: 100, rateOverrides: {} }];

function buildJs(draft) {
  const stubs = {
    _cgDraft: draft,
    getRoles: () => ROLES,
    resolveRoleRate,
    _cgActiveRatecardMap: {},
    _cgActiveRatecardOverrides: {},
  };
  const names = Object.keys(stubs);
  const src = `${extractBlock(js, 'function cgSyncRoleRatesToBaseline(')}; ${extractBlock(js, 'function cgPreviewRateChange(')}; return { sync: cgSyncRoleRatesToBaseline, preview: cgPreviewRateChange };`;
  return new Function(...names, 'window', src)(...names.map(n => stubs[n]), window);
}

describe('costgrid.js role baselines use the version rate', () => {
  beforeEach(() => { window.__currencies = CURRENCIES; });

  it('sync uses the version rate, not the live one', () => {
    const draft = { currency: 'USD', currencyRate: 1.1, roles: [{ roleCode: 'PM', rate: 0, rateIsCustom: false }] };
    buildJs(draft).sync();
    expect(draft.roles[0].rate).toBe(110);
  });

  it('sync falls back to 1 without a version rate', () => {
    const draft = { currency: 'USD', currencyRate: undefined, roles: [{ roleCode: 'PM', rate: 0, rateIsCustom: false }] };
    buildJs(draft).sync();
    expect(draft.roles[0].rate).toBe(100);
  });

  it('EUR version ignores currencyRate', () => {
    const draft = { currency: 'EUR', currencyRate: 1.1, roles: [{ roleCode: 'PM', rate: 0, rateIsCustom: false }] };
    buildJs(draft).sync();
    expect(draft.roles[0].rate).toBe(100);
  });

  it("preview uses the target currency's current rate", () => {
    const draft = { currency: 'EUR', currencyRate: 1, roles: [{ roleCode: 'PM', rate: 100 }] };
    expect(buildJs(draft).preview('USD')[0].newRate).toBe(120);
  });
});

const html = readFileSync('costgrid.html', 'utf8');

function buildMethods() {
  const stubs = { getRoles: () => ROLES, resolveRoleRate };
  const names = Object.keys(stubs);
  const src = `const o = { ${extractBlock(html, 'roleBaseline(role) {')}, ${extractBlock(html, 'roleModalRoleRow(r) {')} }; return o;`;
  return new Function(...names, src)(...names.map(n => stubs[n]));
}

function makeCtx() {
  return {
    draft: { currency: 'USD', currencyRate: 1.1 },
    currencies: CURRENCIES,
    ratecardMap: {}, ratecardOverrides: {},
    roleModalCurrentCodes: new Set(), isClientRatecard: false, roleModalMode: 'add', roleModalSourceCode: null,
  };
}

describe('costgrid.html role baselines use the version rate', () => {
  beforeEach(() => { window.__currencies = CURRENCIES; });

  it('roleBaseline uses the version rate', () => {
    expect(buildMethods().roleBaseline.call(makeCtx(), { roleCode: 'PM', rate: 0 }).effectiveRate).toBe(110);
  });

  it('role selector badge uses the version rate', () => {
    const row = buildMethods().roleModalRoleRow.call(makeCtx(), { id: 1, code: 'PM', rate: 100, rateOverrides: {} });
    expect(row.effectiveRate).toBe(110);
  });

  it('current_rate is read only by the currency-change paths', () => {
    const htmlRest = html.replace(extractBlock(html, 'onCurrencyChange() {'), '');
    const jsRest = js.replace(extractBlock(js, 'function cgPreviewRateChange('), '');
    expect(htmlRest).not.toContain('current_rate');
    expect(jsRest).not.toContain('current_rate');
  });
});

// B-183 review: baselines follow the version's rate, so refreshing the snapshot recalculates the non-custom role
// rates the next time the editor opens, and the version's budget in its own currency can change.
describe('pipeline.html refresh-rate confirmation', () => {
  it('says the role rates are recalculated at the new rate', () => {
    const pipeline = readFileSync('pipeline.html', 'utf8');
    const shown = [];
    const src = `const o = { ${extractBlock(pipeline, 'confirmRefreshRate() {')} }; return o.confirmRefreshRate;`;
    const fn = new Function('showConfirm', 'Api', src)((...a) => shown.push(a), {});
    fn.call({ selectedCgId: 'cg1', selectedVerId: 'v1', selectedVersion: { currency: 'USD', currencyRate: 1.1 }, liveRate: 1.2 });
    expect(shown[0][0]).not.toContain('Only the EUR equivalent display will change');
    expect(shown[0][0]).toContain('Role rates not marked Custom are recalculated at the new rate');
  });
});
