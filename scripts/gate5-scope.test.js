import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyGate5, parsePorcelainZ, mdReadingTests, GATE5_TEST_FILE } from './gate5-scope.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('classifyGate5', () => {
  it('only .md files is docs-only', () => {
    expect(classifyGate5(['docs/pages/costgrid.md', 'CLAUDE.md'])).toBe('docs-only');
  });

  it('.md plus the test-cases parse test is docs-only', () => {
    expect(classifyGate5(['TEST_CASES.md', 'js/lib/test-cases-parse.test.js'])).toBe('docs-only');
  });

  it('the claude-md-guard pin is other', () => {
    expect(classifyGate5(['docs/x.md', 'scripts/claude-md-guard.test.js'])).toBe('other');
  });

  it('an .html file is other', () => {
    expect(classifyGate5(['docs/x.md', 'test-cases.html'])).toBe('other');
  });

  it('a stray untracked log is other', () => {
    expect(classifyGate5(['.superpowers_up.log'])).toBe('other');
  });

  it('an empty list is other', () => {
    expect(classifyGate5([])).toBe('other');
  });
});

describe('parsePorcelainZ', () => {
  it('reads modified, untracked, deleted and renamed records, both paths of a rename, unquoted', () => {
    expect(parsePorcelainZ(' M CLAUDE.md\0?? docs/superpowers/reports/a b.md\0 D docs/old.md\0R  docs/new.md\0docs/was.md\0'))
      .toEqual(['CLAUDE.md', 'docs/superpowers/reports/a b.md', 'docs/old.md', 'docs/new.md', 'docs/was.md']);
  });

  it('a deleted .js file is other', () => {
    expect(classifyGate5(parsePorcelainZ(' D api/src/x.js\0'))).toBe('other');
  });
});

describe('mdReadingTests', () => {
  it('names a js/lib test that reads a .md literal, ignores comments and the subset test', () => {
    expect(mdReadingTests([
      { name: 'js/lib/x.test.js', text: "readFileSync('TEST_CASES.md')" },
      { name: 'js/lib/y.test.js', text: '// see docs/a.md): note' },
      { name: GATE5_TEST_FILE, text: "readFileSync('TEST_CASES.md')" },
    ])).toEqual(['js/lib/x.test.js']);
  });

  it('names a js/lib test that cites live-docs', () => {
    expect(mdReadingTests([{ name: 'js/lib/z.test.js', text: "import { liveMarkdown } from '../../scripts/lib/live-docs.mjs'" }]))
      .toEqual(['js/lib/z.test.js']);
  });

  it('guard: no js/lib test outside the Gate 5 subset reads a .md file', () => {
    const files = readdirSync(join(ROOT, 'js/lib'))
      .filter((f) => f.endsWith('.test.js'))
      .map((f) => ({ name: `js/lib/${f}`, text: readFileSync(join(ROOT, 'js/lib', f), 'utf8') }));
    const offenders = mdReadingTests(files);
    expect(offenders, `These tests read a .md file but are not in Gate 5's docs-only subset: add them to the subset command in .claude/commands/finish-cycle.md and to scripts/gate5-scope.mjs, or stop them reading .md — ${offenders.join(', ')}`).toEqual([]);
  });
});
