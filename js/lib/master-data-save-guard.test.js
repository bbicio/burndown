// Guard for the Master Data pages' save contract (cycle 6): reads go through apiFetch, writes through apiSave.
// One describe per page script; the source reader is shared.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
