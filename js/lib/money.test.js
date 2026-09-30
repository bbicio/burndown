import { describe, it, expect } from 'vitest';
import { currencyInfo, formatMoney, formatMoneyInput, parseMoney } from './money.js';

const C = [
  { code: 'EUR', symbol: '€',   locale: 'it-IT' },
  { code: 'USD', symbol: '$',   locale: 'en-US' },
  { code: 'CHF', symbol: 'CHF', locale: 'de-CH' },
  { code: 'SEK', symbol: 'kr',  locale: 'sv-SE' },
  { code: 'INR', symbol: '₹',   locale: 'hi-IN' },
  { code: 'JPY', symbol: '¥',   locale: 'ja-JP' },
  { code: 'EGP', symbol: 'E£',  locale: 'ar-EG' },
];
const AMOUNTS = [0.05, 350.28, 1234.5, 12345.67, 100000.75];

describe('currencyInfo', () => {
  it('reads symbol, locale and fraction digits from the currency list', () => {
    expect(currencyInfo('USD', C)).toEqual({ code: 'USD', symbol: '$', locale: 'en-US', digits: 2 });
    expect(currencyInfo('JPY', C).digits).toBe(0);
  });
  it('falls back to it-IT, EUR symbol and 2 digits when the list is missing or empty', () => {
    expect(currencyInfo('EUR', undefined)).toEqual({ code: 'EUR', symbol: '€', locale: 'it-IT', digits: 2 });
    expect(currencyInfo(undefined, [])).toEqual({ code: 'EUR', symbol: '€', locale: 'it-IT', digits: 2 });
    expect(currencyInfo('XYZ', [])).toEqual({ code: 'XYZ', symbol: 'XYZ', locale: 'it-IT', digits: 2 });
  });
  it('never throws on a non-ISO code such as a legacy symbol', () => {
    expect(() => currencyInfo('€', C)).not.toThrow();
    expect(currencyInfo('€', C).digits).toBe(2);
  });
});

describe('formatMoney', () => {
  it('formats with the locale of the currency', () => {
    expect(formatMoney(12345, 'EUR', C)).toBe('€ 12.345,00');
    expect(formatMoney(12345, 'USD', C)).toBe('$ 12,345.00');
  });
  it('uses the currency fraction digits (JPY has none)', () => {
    expect(formatMoney(12345.6, 'JPY', C)).toBe('¥ 12,346');
  });
  it('rounded drops the decimals', () => {
    expect(formatMoney(12345.67, 'EUR', C, { rounded: true })).toBe('€ 12.346');
  });
  it('renders a non-finite amount as zero', () => {
    expect(formatMoney(NaN, 'EUR', C)).toBe('€ 0,00');
    expect(formatMoney(undefined, 'EUR', C)).toBe('€ 0,00');
    expect(formatMoney('abc', 'USD', C)).toBe('$ 0.00');
  });
  it('falls back without throwing when the currency list is missing', () => {
    expect(formatMoney(10, 'EUR', [])).toBe('€ 10,00');
    expect(formatMoney(5, 'XYZ', [])).toBe('XYZ 5,00');
    expect(formatMoney(5, 'EUR', undefined)).toBe('€ 5,00');
    expect(formatMoney(5, '€', C)).toBe('€ 5,00');
  });
});

describe('formatMoneyInput', () => {
  it('is the bare number in the locale format, without symbol or grouping', () => {
    expect(formatMoneyInput(350.28, 'EUR', C)).toBe('350,28');
    expect(formatMoneyInput(350.28, 'USD', C)).toBe('350.28');
    expect(formatMoneyInput(12345.67, 'EUR', C)).toBe('12345,67');
    expect(formatMoneyInput(350, 'EUR', C)).toBe('350');
  });
  it('is empty for zero, negative and non-numeric values', () => {
    expect(formatMoneyInput(0, 'EUR', C)).toBe('');
    expect(formatMoneyInput(-3, 'EUR', C)).toBe('');
    expect(formatMoneyInput(undefined, 'EUR', C)).toBe('');
  });
});

describe('parseMoney', () => {
  it('reads the locale convention of the currency', () => {
    expect(parseMoney('350,28', 'EUR', C)).toBe(350.28);
    expect(parseMoney('150,75', 'EUR', C)).toBe(150.75);
    expect(parseMoney('1.234,5', 'EUR', C)).toBe(1234.5);
    expect(parseMoney('1,234.50', 'USD', C)).toBe(1234.5);
  });
  it('is strict: the other convention is NOT guessed (documented behaviour)', () => {
    expect(parseMoney('350.28', 'EUR', C)).toBe(35028);
  });
  it('tolerates a symbol or ISO code before or after the number and surrounding blanks', () => {
    expect(parseMoney('  € 350,28 ', 'EUR', C)).toBe(350.28);
    expect(parseMoney('350,28 €', 'EUR', C)).toBe(350.28);
    expect(parseMoney('EUR 1.234,5', 'EUR', C)).toBe(1234.5);
    expect(parseMoney('$ 1,234.50', 'USD', C)).toBe(1234.5);
  });
  it('treats regular, non-breaking and narrow spaces alike as a group separator (sv-SE)', () => {
    expect(parseMoney('1 234,5', 'SEK', C)).toBe(1234.5);
    expect(parseMoney('1 234,5', 'SEK', C)).toBe(1234.5);
    expect(parseMoney('1 234,5', 'SEK', C)).toBe(1234.5);
  });
  it('accepts an ASCII apostrophe for the de-CH group separator', () => {
    expect(parseMoney("1'234.50", 'CHF', C)).toBe(1234.5);
    expect(parseMoney('1’234.50', 'CHF', C)).toBe(1234.5);
  });
  it('returns 0 for empty and unparseable text, keeps a negative sign', () => {
    expect(parseMoney('', 'EUR', C)).toBe(0);
    expect(parseMoney(undefined, 'EUR', C)).toBe(0);
    expect(parseMoney('abc', 'EUR', C)).toBe(0);
    expect(parseMoney('12,3,4', 'EUR', C)).toBe(0);
    expect(parseMoney('-5', 'EUR', C)).toBe(-5);
  });
  it('rounds to the fraction digits of the currency', () => {
    expect(parseMoney('1.234.567.890,123', 'EUR', C)).toBe(1234567890.12);
    expect(parseMoney('1234.6', 'JPY', C)).toBe(1235); // ja-JP: '.' is the decimal, ',' the group separator
  });
});

describe('round trip (focus text and display text parse back to the same value)', () => {
  const codes = C.map(c => c.code);
  for (const code of codes) {
    it(`${code}: parse(formatMoneyInput(x)) and parse(formatMoney(x)) equal x rounded to the currency digits`, () => {
      const digits = currencyInfo(code, C).digits;
      for (const a of AMOUNTS) {
        const want = Number(a.toFixed(digits));
        if (!(want > 0)) continue;
        expect(parseMoney(formatMoneyInput(a, code, C), code, C)).toBe(want);
        expect(parseMoney(formatMoney(a, code, C), code, C)).toBe(want);
      }
    });
  }

  it('regression x100: focus then blur of 350.28 EUR leaves 350.28', () => {
    const focusText = formatMoneyInput(350.28, 'EUR', C);
    expect(parseMoney(focusText, 'EUR', C)).toBe(350.28);
  });
});
