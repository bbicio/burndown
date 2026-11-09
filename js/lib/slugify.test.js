import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
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

  it('gives an empty slug for a symbols-only name', () => {
    expect(slugify('!!!')).toBe('');
  });
});
