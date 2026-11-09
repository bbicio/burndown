import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { slugify } from './slugify.js';

const server = createRequire(import.meta.url)('../../api/src/lib/slugify.js');

describe('slugify (client twin of api/src/lib/slugify.js)', () => {
  it.each(['Market', 'Therapeutic Area', '  Service  Type ', 'Città & Regione', 'Ünïcödé', '!!!', '', 'a'.repeat(120), 'R&D / Ops'])(
    'matches the server for %j', input => {
      expect(slugify(input)).toBe(server.slugify(input));
    });

  it('hyphenates words', () => {
    expect(slugify('Therapeutic Area')).toBe('therapeutic-area');
  });

  it('writes the combining-marks range as \\u escapes, not raw characters', () => {
    const src = readFileSync('js/lib/slugify.js', 'utf8');
    expect(src).toContain('[\\u0300-\\u036f]');
    expect(/[\u0300-\u036f]/.test(src)).toBe(false);
  });

  it('gives an empty slug for a symbols-only name', () => {
    expect(slugify('!!!')).toBe('');
  });
});
