import { describe, it, expect } from 'vitest';
import {
  formatRate, inverseRate, parseRateText, isValidRate, editText, rateDelta, formatDelta,
  historyEntries, formatHistoryDelta, pickableCurrencies, formatRateDate, formatRateDateTime, sparklinePoints,
} from './master-currencies.js';

describe('formatRate', () => {
  it('shows 4 to 6 decimals without grouping', () => {
    expect(formatRate(1.3)).toBe('1.3000');
    expect(formatRate('1.300000')).toBe('1.3000');
    expect(formatRate(0.857143)).toBe('0.857143');
    expect(formatRate(0.93)).toBe('0.9300');
    expect(formatRate(160.5)).toBe('160.5000');
    expect(formatRate(1234.5)).toBe('1234.5000');
    expect(formatRate('x')).toBe('');
  });
  it('editText is the formatted rate', () => {
    expect(editText('1.300000')).toBe('1.3000');
  });
});

describe('inverseRate', () => {
  it('uses 4 fixed decimals', () => {
    expect(inverseRate(0.8)).toBe('1.2500');
    expect(inverseRate('1.300000')).toBe('0.7692');
    expect(inverseRate(0)).toBe('');
  });
});

describe('parseRateText', () => {
  it('accepts one decimal separator', () => {
    expect(parseRateText('1,25')).toBe(1.25);
    expect(parseRateText(' 1.25 ')).toBe(1.25);
    expect(parseRateText('1.')).toBe(1);
    expect(parseRateText('')).toBeNull();
    expect(parseRateText('   ')).toBeNull();
    for (const t of ['1,2.3', '1.2.3', 'abc', '-1']) expect(parseRateText(t)).toBeNaN();
  });
});

describe('isValidRate', () => {
  it('needs a finite positive number', () => {
    expect(isValidRate(1.2)).toBe(true);
    for (const v of [0, -1, NaN, null, Infinity]) expect(isValidRate(v)).toBe(false);
  });
});

describe('rateDelta', () => {
  it('compares the two newest rows', () => {
    const up = rateDelta([{ rate: '1.3' }, { rate: '1.2' }]);
    expect(up.dir).toBe('up');
    expect(up.pct).toBeCloseTo(8.33, 1);
    expect(rateDelta([{ rate: '0.8' }, { rate: '0.86' }]).dir).toBe('down');
    expect(rateDelta([{ rate: '1.3' }])).toBeNull();
    expect(rateDelta([{ rate: '1.20001' }, { rate: '1.2' }])).toBeNull();
  });
  it('formatDelta', () => {
    expect(formatDelta(rateDelta([{ rate: '1.3' }, { rate: '1.2' }]))).toBe('▲ 8.3%');
    expect(formatDelta({ pct: -7.04, dir: 'down' })).toBe('▼ 7.0%');
  });
});

describe('historyEntries', () => {
  const rows = [1.3, 1.2, '1.200000', 1.3, 1.19, 1.09].map((rate, i) => ({ id: i, rate, created_at: 't' + i, updated_by: 'u' }));
  it('enriches rows', () => {
    const e = historyEntries(rows);
    const expected = [0.1, 0, -0.1, 0.11, 0.1, null];
    e.forEach((x, i) => {
      if (expected[i] === null) expect(x.delta).toBeNull(); else expect(x.delta).toBeCloseTo(expected[i], 6);
    });
    expect(e.map(x => x.noChange)).toEqual([false, true, false, false, false, false]);
    expect(e.map(x => x.newest)).toEqual([true, false, false, false, false, false]);
    expect(e.map(x => x.activated)).toEqual([false, false, false, false, false, true]);
  });
  it('marks none activated at 100 rows', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ id: i, rate: 1 + i / 100 }));
    expect(historyEntries(many).some(x => x.activated)).toBe(false);
  });
  it('formatHistoryDelta', () => {
    expect(formatHistoryDelta(0.1)).toBe('+0.1000');
    expect(formatHistoryDelta(-0.1)).toBe('−0.1000');
  });
});

describe('pickableCurrencies', () => {
  const list = [
    { code: 'EUR', name: 'Euro', symbol: '€', active: true },
    { code: 'GBP', name: 'Pound', symbol: '£', active: true },
    { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', active: false },
    { code: 'JPY', name: 'Japanese Yen', symbol: '¥', active: false },
  ];
  it('lists inactive non-EUR and filters', () => {
    expect(pickableCurrencies(list).map(c => c.code)).toEqual(['AUD', 'JPY']);
    expect(pickableCurrencies(list, 'yen').map(c => c.code)).toEqual(['JPY']);
    expect(pickableCurrencies(list, '¥').map(c => c.code)).toEqual(['JPY']);
    expect(pickableCurrencies(list, 'aud').map(c => c.code)).toEqual(['AUD']);
    expect(pickableCurrencies(list, 'zzz')).toEqual([]);
  });
});

describe('dates', () => {
  it('formats local date and time', () => {
    expect(formatRateDate(new Date(2026, 9, 3, 23, 30).toISOString())).toBe('Oct 3, 2026');
    expect(formatRateDate(null)).toBe('—');
    expect(formatRateDateTime(new Date(2026, 5, 26, 19, 29).toISOString())).toBe('Jun 26, 2026, 19:29');
  });
});

describe('sparklinePoints', () => {
  it('draws chronologically', () => {
    expect(sparklinePoints([], 200, 60)).toBe('');
    expect(sparklinePoints([{ rate: 1 }], 200, 60)).toBe('0,30 200,30');
    const pts = sparklinePoints([{ rate: 2 }, { rate: 1 }], 200, 60).split(' ').map(p => p.split(',').map(Number));
    expect(pts[0][0]).toBe(0);
    expect(pts[1][0]).toBe(200);
    expect(pts[0][1]).toBeGreaterThan(pts[1][1]);
  });
});
