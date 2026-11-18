// The site-export command's tests (scripts/site-export/) run only through `npm run test:site-export`;
// the default suite excludes that folder and nothing else of scripts/, so the guard on what becomes
// public (scripts/site-export-guard.test.js) always runs.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, matchesGlob } from 'node:path';
import defaultConfig from '../vitest.config.js';
import siteExportConfig from '../vitest.site-export.config.js';

const ROOT = join(import.meta.dirname, '..');

describe('site-export test scope', () => {
  it('the default suite excludes scripts/site-export/ and nothing else of scripts/', () => {
    const exclude = defaultConfig.test.exclude;
    expect(exclude).toContain('scripts/site-export/**');
    expect(exclude.some((p) => matchesGlob('scripts/site-export/run-copy-1.test.js', p))).toBe(true);
    for (const kept of ['scripts/site-export-guard.test.js', 'scripts/lib/site-export.test.js', 'scripts/classify-cycle.test.js']) {
      expect(exclude.some((p) => matchesGlob(kept, p)), kept).toBe(false);
    }
  });

  it('the site-export config runs only that folder', () => {
    expect(siteExportConfig.test.include).toEqual(['scripts/site-export/**/*.test.js']);
    expect(siteExportConfig.test.exclude ?? []).not.toContain('scripts/site-export/**');
  });

  it('package.json has test:site-export', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['test:site-export']).toBe('vitest run --config vitest.site-export.config.js');
  });
});
