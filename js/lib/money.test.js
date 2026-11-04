import { describe, it, expect } from 'vitest';
import { currencyInfo, formatMoney, formatMoneyInput, readMoneyInput, moneyFormatExample } from './money.js';

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
  it('always separates the thousands, even for 4-digit amounts, with the separator of the currency locale', () => {
    expect(formatMoney(1234.5, 'EUR', C)).toBe('€ 1.234,50');
    expect(formatMoney(1234.5, 'USD', C)).toBe('$ 1,234.50');
    expect(formatMoney(1234.5, 'CHF', C)).toBe("CHF 1'234.50"); // ICU 78: de-CH groups with an ASCII apostrophe
    expect(formatMoney(1234.5, 'SEK', C)).toBe('kr 1 234,50');
    expect(formatMoney(1234, 'JPY', C)).toBe('¥ 1,234');
    expect(formatMoney(1234.5, 'EUR', C, { rounded: true })).toBe('€ 1.235');
    expect(formatMoney(999.5, 'EUR', C)).toBe('€ 999,50');
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

describe('round trip (focus text and display text parse back to the same value)', () => {
  const codes = C.map(c => c.code);
  for (const code of codes) {
    it(`${code}: read(formatMoneyInput(x)) and read(formatMoney(x)) equal x rounded to the currency digits`, () => {
      const digits = currencyInfo(code, C).digits;
      for (const a of AMOUNTS) {
        const want = Number(a.toFixed(digits));
        if (!(want > 0)) continue;
        expect(readMoneyInput(formatMoneyInput(a, code, C), code, C)).toBe(want);
        expect(readMoneyInput(formatMoney(a, code, C), code, C)).toBe(want);
      }
    });
  }

  it('regression x100: focus then blur of 350.28 EUR leaves 350.28', () => {
    const focusText = formatMoneyInput(350.28, 'EUR', C);
    expect(readMoneyInput(focusText, 'EUR', C)).toBe(350.28);
  });
});

describe('readMoneyInput', () => {
  it('returns null for blank text', () => {
    for (const t of ['', '   ', null, undefined]) expect(readMoneyInput(t, 'EUR', C)).toBeNull();
  });
  it('reads the locale convention of the currency', () => {
    expect(readMoneyInput('107,5', 'EUR', C)).toBe(107.5);
    expect(readMoneyInput('175.5', 'USD', C)).toBe(175.5);
    expect(readMoneyInput("1'234.50", 'CHF', C)).toBe(1234.5);
    expect(readMoneyInput('1’234.50', 'CHF', C)).toBe(1234.5);
    expect(readMoneyInput('1.234,50', 'EUR', C)).toBe(1234.5);
    expect(readMoneyInput('1,234.50', 'USD', C)).toBe(1234.5);
    expect(readMoneyInput('1234', 'EUR', C)).toBe(1234);
    expect(readMoneyInput('0', 'EUR', C)).toBe(0);
    expect(readMoneyInput('1.075', 'EUR', C)).toBe(1075);
  });
  it('refuses the other convention', () => {
    expect(readMoneyInput('107.5', 'EUR', C)).toBeNaN();
    expect(readMoneyInput('175,5', 'USD', C)).toBeNaN();
    expect(readMoneyInput('1.23,4', 'EUR', C)).toBeNaN();
    expect(readMoneyInput('12.34.567', 'EUR', C)).toBeNaN();
  });
  it('refuses negatives, letters and extra decimals', () => {
    expect(readMoneyInput('-5', 'EUR', C)).toBeNaN();
    expect(readMoneyInput('abc', 'EUR', C)).toBeNaN();
    expect(readMoneyInput('12,345', 'EUR', C)).toBeNaN();
    expect(readMoneyInput('12.5', 'JPY', C)).toBeNaN();
  });
  it('accepts a trailing decimal separator', () => {
    expect(readMoneyInput('107,', 'EUR', C)).toBe(107);
  });
  it('ignores the currency symbol, the ISO code and spaces', () => {
    expect(readMoneyInput('€ 1.234,50', 'EUR', C)).toBe(1234.5);
    expect(readMoneyInput('$175.50', 'USD', C)).toBe(175.5);
    expect(readMoneyInput('175.50 USD', 'USD', C)).toBe(175.5);
  });
  it('round-trips formatMoneyInput for every test currency', () => {
    for (const c of C) {
      for (const a of AMOUNTS) {
        const v = Number(a.toFixed(currencyInfo(c.code, C).digits));
        if (v === 0) continue;
        expect(readMoneyInput(formatMoneyInput(v, c.code, C), c.code, C)).toBe(v);
      }
    }
  });
  it('formats with formatMoney after reading', () => {
    expect(formatMoney(readMoneyInput('175.5', 'USD', C), 'USD', C)).toBe('$ 175.50');
    expect(formatMoney(readMoneyInput('107,5', 'EUR', C), 'EUR', C)).toBe('€ 107,50');
  });
});

describe('moneyFormatExample', () => {
  it('shows the number format of the currency locale', () => {
    expect(moneyFormatExample('EUR', C)).toBe('1.234,50');
    expect(moneyFormatExample('USD', C)).toBe('1,234.50');
    expect(moneyFormatExample('JPY', C)).toBe('1,235');
  });
});

const FR = [{ code: 'EUR', symbol: '€', locale: 'fr-FR' }];

describe('readMoneyInput — strict read (f1)', () => {
  it('re-reads formatMoney for every test currency, above 1,00,000 too', () => {
    for (const c of ['EUR', 'USD', 'CHF', 'JPY', 'INR', 'SEK', 'EGP'])
      for (const a of [123456, 1234567.5, 100000000]) {
        const v = Number(a.toFixed(currencyInfo(c, C).digits));
        expect(readMoneyInput(formatMoney(v, c, C), c, C)).toBe(v);
      }
    expect(readMoneyInput(formatMoney(1234567.5, 'EUR', FR), 'EUR', FR)).toBe(1234567.5);
  });
  it('reads Indian grouping and refuses western grouping for INR', () => {
    expect(readMoneyInput('₹ 1,23,456.00', 'INR', C)).toBe(123456);
    expect(readMoneyInput('1,00,00,000', 'INR', C)).toBe(10000000);
    expect(readMoneyInput('123,456', 'INR', C)).toBeNaN();
  });
  it('refuses a symbol or a space between the digits', () => {
    expect(readMoneyInput('1 50', 'EUR', C)).toBeNaN();
    expect(readMoneyInput('15€0', 'EUR', C)).toBeNaN();
    expect(readMoneyInput('1E£ 5', 'EGP', C)).toBeNaN();
  });
  it('checks space groups (plain, U+00A0, U+202F)', () => {
    expect(readMoneyInput('1 234 567,5', 'EUR', FR)).toBe(1234567.5);
    expect(readMoneyInput('1 234 567,5', 'EUR', FR)).toBe(1234567.5);
    expect(readMoneyInput('1 234 567,5', 'EUR', FR)).toBe(1234567.5);
    expect(readMoneyInput('12 34 567,5', 'EUR', FR)).toBeNaN();
    expect(readMoneyInput('1 234,5', 'SEK', C)).toBe(1234.5);
    expect(readMoneyInput('1 234,5', 'SEK', C)).toBe(1234.5);
  });
  it('accepts the symbol or ISO code at either end', () => {
    expect(readMoneyInput('1.234,50 €', 'EUR', C)).toBe(1234.5);
    expect(readMoneyInput('EUR 1.234,50', 'EUR', C)).toBe(1234.5);
    expect(readMoneyInput('$175.50', 'USD', C)).toBe(175.5);
  });
});

describe('readMoneyInput — stored (f1)', () => {
  it('keeps an untouched stored value with more decimals than the currency', () => {
    expect(readMoneyInput(formatMoneyInput(108.7654, 'EUR', C), 'EUR', C, { stored: 108.7654 })).toBe(108.7654);
    expect(readMoneyInput(formatMoney(108.7654, 'EUR', C), 'EUR', C, { stored: 108.7654 })).toBe(108.7654);
    expect(readMoneyInput('108,7', 'EUR', C, { stored: 108.7654 })).toBe(108.7);
  });
  it('agrees with Intl on half-way values (toFixed would not)', () => {
    for (const v of [1.005, 2.675]) {
      expect(readMoneyInput(formatMoneyInput(v, 'EUR', C), 'EUR', C, { stored: v })).toBe(v);
      expect(readMoneyInput(formatMoney(v, 'EUR', C), 'EUR', C, { stored: v })).toBe(v);
    }
  });
  it('coerces a NUMERIC string and returns a number', () => {
    expect(readMoneyInput('108,77', 'EUR', C, { stored: '108.7654' })).toBe(108.7654);
  });
  it('leaves blank and invalid results alone', () => {
    expect(readMoneyInput('', 'EUR', C, { stored: 5 })).toBeNull();
    expect(readMoneyInput('x', 'EUR', C, { stored: 5 })).toBeNaN();
  });
});

describe('formatMoneyInput — keepZero (f1)', () => {
  it('opens a stored 0 as "0" only with keepZero', () => {
    expect(formatMoneyInput(0, 'EUR', C, { keepZero: true })).toBe('0');
    expect(formatMoneyInput('0.00', 'EUR', C, { keepZero: true })).toBe('0');
    expect(formatMoneyInput(0, 'EUR', C)).toBe('');
    for (const v of [null, undefined, '']) expect(formatMoneyInput(v, 'EUR', C, { keepZero: true })).toBe('');
  });
});

describe('formatMoney symbol option', () => {
  it('omits the symbol and keeps locale, digits and grouping', () => {
    expect(formatMoney(1234.5, 'EUR', C, { symbol: false })).toBe('1.234,50');
    expect(formatMoney(1234.5, 'EUR', C, { rounded: true, symbol: false })).toBe('1.235');
  });
  it('matches the rounded output minus the symbol prefix for every currency', () => {
    for (const cu of C) {
      const full = formatMoney(1234.5, cu.code, C, { rounded: true });
      expect(formatMoney(1234.5, cu.code, C, { rounded: true, symbol: false })).toBe(full.slice(cu.symbol.length + 1));
    }
    expect(formatMoney(1234.5, 'USD', C, { rounded: true, symbol: false })).toBe('1,235');
    expect(formatMoney(1234.5, 'JPY', C, { rounded: true, symbol: false })).toBe('1,235');
  });
  it('keeps the default unchanged', () => {
    expect(formatMoney(1234.5, 'EUR', C)).toBe('€ 1.234,50');
  });
});
