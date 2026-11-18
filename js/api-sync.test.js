import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractBlock } from '../scripts/lib/extract-source.mjs';

// api-sync.js is a classic (non-module) script full of globals: the mapping of a server project is cut out of it.
// Path is relative to the repo root (vitest's cwd): import.meta.url is not a file: URL in the jsdom environment.
const src = readFileSync('js/api-sync.js', 'utf8');
const _apiProjectToLocal = new Function(`${extractBlock(src, 'function _apiProjectToLocal(')}; return _apiProjectToLocal;`)();

describe('_apiProjectToLocal', () => {
  it('keeps the currency code when loading a project from the API', () => {
    expect(_apiProjectToLocal({ id: 'p', currency: 'USD' }).currency).toBe('USD');
    expect(_apiProjectToLocal({ id: 'p', currency: 'CHF' }).currency).toBe('CHF');
    expect(_apiProjectToLocal({ id: 'p' }).currency).toBe('EUR');
  });

  it('carries the version and the links', () => {
    const p = _apiProjectToLocal({ id: 'p', version: 7, links: [{ versionId: 'v', taskIds: ['t'], taskNames: ['T'] }] });
    expect(p.version).toBe(7);
    expect(p.links).toEqual([{ versionId: 'v', taskIds: ['t'], taskNames: ['T'] }]);
    expect(_apiProjectToLocal({ id: 'p' }).links).toEqual([]);
  });
});
