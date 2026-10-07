import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const core = fs.readFileSync(path.resolve(__dirname, '../core.js'), 'utf8');

describe('cleanLegacyStorage keep rules', () => {
  it('keeps PDash_cgCompactHeader literally', () => {
    expect(core).toMatch(/PDash_cgCompactHeader/);
  });
  it('keeps any PDash_cgSections: prefixed key', () => {
    expect(core).toMatch(/PDash_cgSections:/);
  });
});
