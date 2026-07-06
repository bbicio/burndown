import { describe, it, expect } from 'vitest';
import { cfgParseHours, roundToQuarterHour, cfgFmtHours, distributeHoursExact, isValidSoldHours } from './cfg-parse.js';

describe('cfgParseHours', () => {
  it('REG-13: does not inflate "22.25" via de-DE thousands-separator stripping', () => {
    expect(cfgParseHours('22.25')).toBe(22.25);
  });

  it('parses a plain integer string', () => {
    expect(cfgParseHours('10')).toBe(10);
  });

  it('parses a decimal string', () => {
    expect(cfgParseHours('7.5')).toBe(7.5);
  });

  it('strips non-numeric characters (e.g. currency symbols) before parsing', () => {
    expect(cfgParseHours('€10.5')).toBe(10.5);
  });

  it('returns 0 for an empty string', () => {
    expect(cfgParseHours('')).toBe(0);
  });

  it('returns 0 for a non-numeric string', () => {
    expect(cfgParseHours('abc')).toBe(0);
  });

  it('returns 0 for null-ish input coerced to string', () => {
    expect(cfgParseHours(null)).toBe(0);
  });

  it('characterization: comma-decimal input has the comma stripped, not treated as a decimal separator (documented quirk, not fixed in this cycle)', () => {
    expect(cfgParseHours('22,25')).toBe(2225);
  });

  it('characterization: a leading minus sign is stripped, not treated as a negative sign (documented quirk, not fixed in this cycle)', () => {
    expect(cfgParseHours('-5')).toBe(5);
  });
});

describe('roundToQuarterHour', () => {
  it('REG-14: rounds a fractional carry-over value to the nearest quarter-hour (reforecast site, config-form.js:848) and returns a plain number, matching the reforecast site which writes the result straight into newPlanning[ym]', () => {
    const result = roundToQuarterHour(10.125);
    expect(typeof result).toBe('number');
    expect(result).toBe(10.25);
  });

  it('rounds down when closer to the lower quarter-hour', () => {
    expect(roundToQuarterHour(10.05)).toBe(10);
  });

  it('leaves an exact quarter-hour value unchanged', () => {
    expect(roundToQuarterHour(7.5)).toBe(7.5);
  });
});

describe('cfgFmtHours', () => {
  it('rounds to the nearest quarter-hour before formatting', () => {
    expect(cfgFmtHours(10.125)).toBe('10.25');
  });

  it('formats a whole number without decimals', () => {
    expect(cfgFmtHours(10)).toBe('10');
  });

  it('formats a fractional value with two decimals', () => {
    expect(cfgFmtHours(7.5)).toBe('7.50');
  });

  it('returns an empty string for zero (the n > 0 guard, absent from the reforecast site)', () => {
    expect(cfgFmtHours(0)).toBe('');
  });

  it('returns an empty string for a negative value', () => {
    expect(cfgFmtHours(-5)).toBe('');
  });
});

describe('distributeHoursExact', () => {
  it('REG-15: Reforecast 7.4h/3-month residual sums exactly to the rounded total (audit F2-3 traced case)', () => {
    // Today's bug: 7.4/3 = 2.46667 each, roundToQuarterHour → 2.5 each, sum 7.5 ≠ 7.4 (drift).
    // distributeHoursExact must guarantee the sum equals roundToQuarterHour(7.4) = 7.5 by construction,
    // not by accident — every distributed value must be grid-aligned and the total must reconcile.
    const raw = { '202601': 7.4 / 3, '202602': 7.4 / 3, '202603': 7.4 / 3 };
    const result = distributeHoursExact(7.4, raw);
    const sum = Object.values(result).reduce((s, v) => s + v, 0);
    expect(sum).toBe(7.5);
    Object.values(result).forEach(v => {
      expect(v % 0.25).toBeCloseTo(0, 10);
    });
  });

  it('REG-16: Derive 2.4h/3-month real day-overlap fractions sum exactly to the rounded total (audit F2-2 traced case)', () => {
    // Task 2026-01-01..2026-03-31 (31+28+31=90 days, 2026 not a leap year), 2.4h split by day-overlap.
    // These are the RAW (pre-rounding) values — not the already-degraded {0.8, 0.7, 0.8} (summing to 2.3)
    // that today's buggy code produces after its own Math.round(hours*10)/10.
    const raw = {
      '202601': 2.4 * 31 / 90,
      '202602': 2.4 * 28 / 90,
      '202603': 2.4 * 31 / 90,
    };
    const result = distributeHoursExact(2.4, raw);
    expect(result).toEqual({ '202601': 1, '202602': 0.75, '202603': 0.75 });
    const sum = Object.values(result).reduce((s, v) => s + v, 0);
    expect(sum).toBe(2.5);
  });

  it('handles a total with a 0.4 fraction explicitly (sold-hours set edge case)', () => {
    const result = distributeHoursExact(0.4, { '202601': 0.4 });
    expect(result).toEqual({ '202601': 0.5 });
  });

  it('throws when the sum of rawValues diverges from total beyond the 0.05 epsilon', () => {
    expect(() => distributeHoursExact(7.4, { '202601': 2, '202602': 2, '202603': 1 }))
      .toThrow(/7\.4/);
  });

  it('throws when a rawValues entry is negative', () => {
    expect(() => distributeHoursExact(5, { '202601': -1, '202602': 6 }))
      .toThrow(/202601/);
  });

  it('never gives a bump to a zero-value container when others have positive remainders', () => {
    const result = distributeHoursExact(2.5, { '202601': 2.5, '202602': 0 });
    expect(result['202602']).toBe(0);
  });

  it('breaks remainder ties by container key ascending, deterministically', () => {
    // Both containers have the same raw value (0.30), so an identical remainder (0.05)
    // after flooring to the 0.25 grid — an exact tie. floorSum = 0.25+0.25 = 0.5;
    // roundToQuarterHour(0.63) = 0.75 (0.63*4=2.52, round=3, /4=0.75), so exactly one
    // grid-step bump is needed ((0.75-0.5)/0.25 = 1) and the tie-break must pick a single
    // winner. 0.63 is within the 0.05 epsilon of the raw sum (0.60), so this does not throw.
    const result = distributeHoursExact(0.63, { '202603': 0.30, '202601': 0.30 });
    expect(result).toEqual({ '202601': 0.5, '202603': 0.25 });
  });
});

describe('isValidSoldHours', () => {
  it('accepts a whole number', () => {
    expect(isValidSoldHours(5)).toBe(true);
  });

  it('accepts a .25 fraction', () => {
    expect(isValidSoldHours(2.25)).toBe(true);
  });

  it('accepts a .5 fraction', () => {
    expect(isValidSoldHours(3.5)).toBe(true);
  });

  it('accepts a .75 fraction', () => {
    expect(isValidSoldHours(1.75)).toBe(true);
  });

  it('accepts zero', () => {
    expect(isValidSoldHours(0)).toBe(true);
  });

  it('rejects a .4 fraction (not in the allowed set)', () => {
    expect(isValidSoldHours(2.4)).toBe(false);
  });

  it('rejects a .6 fraction (not in the allowed set)', () => {
    expect(isValidSoldHours(2.6)).toBe(false);
  });

  it('rejects a negative value', () => {
    expect(isValidSoldHours(-2.25)).toBe(false);
  });

  it('rejects a non-finite value', () => {
    expect(isValidSoldHours(NaN)).toBe(false);
    expect(isValidSoldHours(Infinity)).toBe(false);
  });
});
