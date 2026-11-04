import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PIPELINE_YEAR_KEY, resolvePipelineYear, readStoredPipelineYear, storePipelineYear,
} from './pipeline-year.js';

// The pipeline board remembers the year the user picked (localStorage) so that navigating away and back
// reopens it. The precedence is a pure function; the storage helpers must never throw (private windows,
// blocked site data). core.js's cleanLegacyStorage() deletes every PDash* key outside its `keep` Set, so
// the key has to be listed there.
const AVAILABLE = [2027, 2026, 2025];

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('resolvePipelineYear', () => {
  const base = { urlYear: null, storedYear: null, availableYears: AVAILABLE, currentYear: 2026 };

  it('prefers a valid ?year= over everything', () => {
    expect(resolvePipelineYear({ ...base, urlYear: 2025, storedYear: 2027 })).toBe(2025);
  });
  it('falls back to the stored year when the URL has none', () => {
    expect(resolvePipelineYear({ ...base, storedYear: 2027 })).toBe(2027);
  });
  it('ignores a ?year= that is not available and uses the stored one', () => {
    expect(resolvePipelineYear({ ...base, urlYear: 1999, storedYear: 2027 })).toBe(2027);
  });
  it('ignores a stored year that is not available and uses the current year', () => {
    expect(resolvePipelineYear({ ...base, storedYear: 2031 })).toBe(2026);
  });
  it('uses the current year when nothing else applies', () => {
    expect(resolvePipelineYear(base)).toBe(2026);
  });
  it('uses the first available year when the current year is not available', () => {
    expect(resolvePipelineYear({ ...base, currentYear: 2030 })).toBe(2027);
  });
  it('returns the current year when no year is available at all', () => {
    expect(resolvePipelineYear({ ...base, availableYears: [], storedYear: 2027, urlYear: 2025 })).toBe(2026);
  });
});

describe('stored pipeline year', () => {
  it('round-trips through localStorage', () => {
    storePipelineYear(2027);
    expect(localStorage.getItem(PIPELINE_YEAR_KEY)).toBe('2027');
    expect(readStoredPipelineYear()).toBe(2027);
  });
  it('reads null when nothing, or something that is not a year, is stored', () => {
    expect(readStoredPipelineYear()).toBeNull();
    for (const bad of ['abc', '', '20x7', '2027.5']) {
      localStorage.setItem(PIPELINE_YEAR_KEY, bad);
      expect(readStoredPipelineYear()).toBeNull();
    }
  });
  it('never throws when localStorage does', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readStoredPipelineYear()).toBeNull();
    expect(() => storePipelineYear(2027)).not.toThrow();
  });
});

describe('core.js keeps the key', () => {
  it('lists PDash_pipelineYear in cleanLegacyStorage()', () => {
    const core = readFileSync('js/core.js', 'utf8');
    const keep = core.match(/const keep = new Set\(\[([^\]]*)\]\)/);
    expect(keep).not.toBeNull();
    expect(keep[1]).toContain(`'${PIPELINE_YEAR_KEY}'`);
  });
});
