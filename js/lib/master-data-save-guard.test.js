// Guard for the Master Data pages' save contract (cycle 6): reads go through apiFetch, writes through apiSave.
// One describe per page script; the source reader is shared.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rawReadFileSync } from '../../scripts/lib/page-source.setup.mjs';

const read = f => readFileSync(join(process.cwd(), f), 'utf8');

// The body of `async name(...) {` up to the next method at the same indent.
function methodBody(src, name) {
  const m = src.match(new RegExp('^(\\s*)async ' + name + '\\(', 'm'));
  expect(m, name + ' exists').not.toBeNull();
  const start = m.index;
  const indent = m[1].replace(/^\r?\n/, '');
  const rest = src.slice(start + m[0].length);
  const next = rest.search(new RegExp('^' + indent + '(async )?[A-Za-z]+\\(.*\\) \\{', 'm'));
  return src.slice(start, next === -1 ? undefined : start + m[0].length + next);
}

describe('team.js', () => {
  const src = read('js/pages/team.js');
  it('has no raw fetch and no res.json()', () => {
    expect(src.replace(/apiFetch\(/g, '')).not.toMatch(/\bfetch\(/);
    expect(src).not.toMatch(/res\.json\(\)/);
  });
  it('has no "Network error." text', () => {
    expect(src).not.toContain("'Network error.'");
    expect(src).not.toContain('Network error. Please');
  });
  for (const name of ['postAlias', 'removeAlias', 'rescan', 'submitForm', 'toggleStatus', 'deleteResource']) {
    it(name + ' writes with apiSave', () => {
      expect(methodBody(src, name)).toContain('apiSave(');
    });
  }
  it('submitForm sends only the changed fields', () => {
    expect(methodBody(src, 'submitForm')).toContain('changedResourceFields(');
  });
});

describe('attribute-lists.js', () => {
  const src = read('js/pages/attribute-lists.js');
  const html = rawReadFileSync(join(process.cwd(), 'attribute-lists.html'), 'utf8');
  it('has no raw fetch, no request() and no errorText()', () => {
    expect(src.replace(/apiFetch\(/g, '')).not.toMatch(/\bfetch\(/);
    expect(src).not.toMatch(/\brequest\(/);
    expect(src).not.toMatch(/errorText\(/);
  });
  it('every write goes through apiSave, with a path that has no /api prefix', () => {
    const calls = src.match(/apiSave\(\s*'[A-Z]+',\s*[^,)]+/g) || [];
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c).toMatch(/apiSave\(\s*'(POST|PATCH)',\s*('\/(attribute-lists|topics)|base\b)/);
    expect(src).not.toMatch(/'\/api\//);
    expect(src).not.toMatch(/`\/api\//);
  });
  it('reads go through read() on apiFetch', () => {
    expect(methodBody(src, 'read')).toContain('apiFetch(');
    for (const name of ['loadLists', 'loadTopics', 'loadItems']) expect(methodBody(src, name)).toContain('this.read(');
  });
  it('keeps the reload banners', () => {
    expect(src).toContain("couldn't be reloaded");
    expect(src).toContain("'The list was reloaded. Server: '");
  });
  it('loads save.js before the page script', () => {
    const save = html.indexOf('js/lib/save.js?v=3');
    expect(save).toBeGreaterThan(-1);
    expect(save).toBeLessThan(html.indexOf('js/pages/attribute-lists.js?v=2'));
  });
});
