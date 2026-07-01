import { describe, it, expect } from 'vitest';
import { cfgParseHours } from './cfg-parse.js';

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
});
