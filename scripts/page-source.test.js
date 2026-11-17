// pageSource: tests read a root page with its js/pages/*.js scripts put back inline, so the
// assertions written against inline page scripts keep reading the same text after the move.
import { describe, it, expect } from 'vitest';
import fs, { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { pageSource, isRootPage } from './lib/page-source.mjs';
import { rawReadFileSync } from './lib/page-source.setup.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('pageSource', () => {
  const read = () => 'CODE';

  it('puts a classic js/pages script back inline', () => {
    expect(pageSource('a<script src="js/pages/x.js?v=1"></script>b', read)).toBe('a<script>CODE</script>b');
  });

  it('keeps the module type of a js/pages script', () => {
    expect(pageSource('a<script type="module" src="js/pages/x.js?v=1"></script>b', read))
      .toBe('a<script type="module">CODE</script>b');
  });

  it('reads the file the tag names', () => {
    const seen = [];
    pageSource('<script src="js/pages/costgrid.js?v=3"></script>', p => { seen.push(p); return ''; });
    expect(seen).toEqual(['js/pages/costgrid.js']);
  });

  it('leaves every other script tag alone', () => {
    const html = '<script src="js/core.js?v=16"></script><script defer src="https://unpkg.com/vue@3.5.45/dist/vue.global.prod.js"></script>';
    expect(pageSource(html, read)).toBe(html);
  });
});

describe('isRootPage', () => {
  it('is true for a page at the repo root, absolute or relative', () => {
    expect(isRootPage(join(ROOT, 'costgrid.html'), ROOT)).toBe(true);
    expect(isRootPage('costgrid.html', ROOT)).toBe(true);
  });

  it('is false below the root or outside it', () => {
    expect(isRootPage(join(ROOT, 'handbook', 'x.html'), ROOT)).toBe(false);
    expect(isRootPage(join(tmpdir(), 'costgrid.html'), ROOT)).toBe(false);
    expect(isRootPage(join(ROOT, 'nginx.conf'), ROOT)).toBe(false);
  });
});

describe('the readFileSync of every test', () => {
  it('is the setup wrapper, not the real one', () => {
    expect(readFileSync).not.toBe(rawReadFileSync);
    expect(fs.readFileSync).toBe(readFileSync);
  });

  it('returns a root page through pageSource, named and default import alike', () => {
    const raw = rawReadFileSync(join(ROOT, 'costgrid.html'), 'utf8');
    const expected = pageSource(raw, p => rawReadFileSync(join(ROOT, p), 'utf8'));
    expect(readFileSync(join(ROOT, 'costgrid.html'), 'utf8')).toBe(expected);
    expect(fs.readFileSync(join(ROOT, 'costgrid.html'), 'utf8')).toBe(expected);
  });

  it('returns every other file as it is on disk', () => {
    expect(readFileSync(join(ROOT, 'nginx.conf'), 'utf8')).toBe(rawReadFileSync(join(ROOT, 'nginx.conf'), 'utf8'));
  });
});

describe('test files read pages only through the covered readFileSync', () => {
  const UNCOVERED = /node:fs\/promises|['"]fs\/promises['"]|\bfs\.promises\b|\breadFile\(|createReadStream\(|require\(['"](?:node:)?fs['"]\)/;
  const tests = ['js', 'scripts'].flatMap((dir) => fs.readdirSync(join(ROOT, dir), { recursive: true })
    .map((n) => `${dir}/${String(n).replace(/\\/g, '/')}`).filter((n) => n.endsWith('.test.js')));
  it('finds the test files', () => {
    expect(tests.length).toBeGreaterThan(0);
  });
  it('none uses an fs form the setup does not cover', () => {
    const self = 'scripts/page-source.test.js';
    expect(tests.filter((f) => f !== self && UNCOVERED.test(rawReadFileSync(join(ROOT, f), 'utf8')))).toEqual([]);
  });
});
