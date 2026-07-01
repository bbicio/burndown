import { describe, it, expect } from 'vitest';
import { cfgParseHours, roundToQuarterHour, cfgFmtHours } from './cfg-parse.js';

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
