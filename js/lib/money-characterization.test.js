import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { pbFmtMoney } from './pipeline-calc.js';
import './money.js'; // sets window.formatMoney, which the wrappers read at call time

// core.js and costgrid.js are classic scripts full of globals: pull one top-level function out of the
// source text and build it with the globals it reads passed in as parameters. Path is relative to the
// repo root (vitest's cwd).
function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found`);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { i++; break; }
  }
  return src.slice(start, i);
}

const coreSrc = readFileSync('js/core.js', 'utf8');

// After Task 4 the wrappers call window.formatMoney; the bridge is read at call time.
const bridge = () => ({ formatMoney: window.formatMoney });

function loadFmtMoney(currencies, currentCfg = null) {
  const win = { __currencies: currencies, ...bridge() };
  return new Function('window', 'currentCfg', `${extractFn(coreSrc, 'fmtMoney')}; return fmtMoney;`)(win, currentCfg);
}

const USD = { code: 'USD', symbol: '$', locale: 'en-US' };

describe('fmtMoney (js/core.js) — current behaviour', () => {
  it.each([
    [1234.5, 'USD', [USD], '$ 1,234.50'],
    [12345.5, 'EUR', [], '€ 12.345,50'],
    [5, 'XYZ', [], 'XYZ 5,00'],
    [0, 'EUR', [], '€ 0,00'],
    [10, undefined, [], '€ 10,00'],
  ])('fmtMoney(%s, %s) -> %s', (n, code, currencies, expected) => {
    expect(loadFmtMoney(currencies)(n, code)).toBe(expected);
  });

  it('returns an em dash for null and undefined', () => {
    const fmt = loadFmtMoney([]);
    expect(fmt(null)).toBe('—');
    expect(fmt(undefined)).toBe('—');
  });

  it('defaults the currency to currentCfg.currency', () => {
    expect(loadFmtMoney([USD], { currency: 'USD' })(10)).toBe('$ 10.00');
  });
});

describe('pbFmtMoney (js/lib/pipeline-calc.js) — current behaviour', () => {
  it.each([
    [1234.5, 'USD', [USD], '$ 1,234.50'],
    [12345.5, 'EUR', [], '€ 12.345,50'],
    [5, 'XYZ', [], 'XYZ 5,00'],
    [NaN, 'EUR', [], '€ 0,00'],
  ])('pbFmtMoney(%s, %s) -> %s', (n, code, currencies, expected) => {
    expect(pbFmtMoney(n, code, currencies)).toBe(expected);
  });
});
