import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import './money.js'; // window.formatMoney, used by the role-rate preview in the modal

// costgrid.html's Vue method onCurrencyChange (the "Change currency?" modal) lives inside the page, so this test
// cuts its source out of the file and runs it against stubs. It caught a real regression: a variable the confirm
// handler reads had been removed together with the preview helpers it sat next to.
const html = readFileSync('costgrid.html', 'utf8');

function extractMethod(src, name) {
  const start = src.indexOf(`${name}() {`);
  if (start < 0) throw new Error(`method ${name} not found`);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { i++; break; }
  }
  return src.slice(start, i);
}

let sync, autosave, shown, hidden;

function buildMethod() {
  class FakeModal { constructor() { this.hide = () => { hidden++; }; } show() { shown++; } }
  const stubs = {
    bootstrap: { Modal: FakeModal },
    esc: s => String(s),
    cgPreviewRateChange: () => [{ roleLabel: 'PM', currentRate: 150, newRate: 142.5, isCustom: false }],
    cgSyncRoleRatesToBaseline: sync,
    cgAutoSave: autosave,
  };
  const names = Object.keys(stubs);
  const src = `const o = { ${extractMethod(html, 'onCurrencyChange')} }; return o.onCurrencyChange;`;
  return new Function(...names, 'document', 'window', src)(...names.map(n => stubs[n]), document, window);
}

function makeCtx(over = {}) {
  return {
    draft: { currency: 'CHF', roles: [{ roleCode: 'PM' }], currencyRate: 1 },
    prevCurrency: 'EUR',
    currencies: [{ code: 'EUR', current_rate: '1.000000' }, { code: 'CHF', symbol: 'CHF', locale: 'de-CH', current_rate: '0.950000' }],
    $forceUpdate: vi.fn(),
    ...over,
  };
}

describe('costgrid onCurrencyChange (currency change modal)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    sync = vi.fn(); autosave = vi.fn(); shown = 0; hidden = 0;
    window.__currencies = [{ code: 'EUR', symbol: '€', locale: 'it-IT' }, { code: 'CHF', symbol: 'CHF', locale: 'de-CH' }];
  });

  it('opens the confirmation modal with the role rates in each currency format', () => {
    const ctx = makeCtx();
    buildMethod().call(ctx);
    expect(shown).toBe(1);
    const body = document.getElementById('cgCurrencyChangeModalBody').innerHTML;
    expect(body).toContain('€ 150,00');
    expect(body).toContain('CHF 142.50');
  });

  it('confirming applies the new currency and the exchange rate of the new currency, without errors', () => {
    const ctx = makeCtx();
    buildMethod().call(ctx);
    expect(() => document.getElementById('cgCurrencyChangeModalConfirm').onclick()).not.toThrow();
    expect(ctx.draft.currencyRate).toBe(0.95);
    expect(ctx.prevCurrency).toBe('CHF');
    expect(sync).toHaveBeenCalledWith(true);
    expect(autosave).toHaveBeenCalledTimes(1);
    expect(hidden).toBe(1);
  });

  it('cancelling puts the previous currency back and does not save', () => {
    const ctx = makeCtx();
    buildMethod().call(ctx);
    document.getElementById('cgCurrencyChangeModalCancel').onclick();
    expect(ctx.draft.currency).toBe('EUR');
    expect(autosave).not.toHaveBeenCalled();
  });

  it('with no roles yet it switches straight away, taking the rate of the new currency', () => {
    const ctx = makeCtx({ draft: { currency: 'CHF', roles: [], currencyRate: 1 } });
    buildMethod().call(ctx);
    expect(shown).toBe(0);
    expect(ctx.draft.currencyRate).toBe(0.95);
    expect(ctx.prevCurrency).toBe('CHF');
    expect(autosave).toHaveBeenCalledTimes(1);
  });
});
