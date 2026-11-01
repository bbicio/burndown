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
