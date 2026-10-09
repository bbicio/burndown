import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseTestCases, formatCell } from './test-cases-parse.js';

const MD = [
  '# PDash — Test Cases',
  '',
  '**Updated:** 2026-07-01 (rev 8)  ',
  '',
  '## 1. Authentication',
  '',
  '| ID | Scenario | Steps | Expected | Auto |',
  '|---|---|---|---|---|',
  '| A-01 | Login | POST /login | 200 | ✓ |',
  '| A-02 | Logout | Click | Cookie cleared | |',
  '| A-03 | Meter | Type | Four segments | ✓ (vitest) |',
  '',
  '## 2. Pots',
  '',
  '### View A — list',
  '',
  '| ID | Scenario | Expected | Auto |',
  '|---|---|---|---|',
  '| PT-01 | List loads | Rows shown | |',
].join('\n');

describe('parseTestCases', () => {
  it('reads the Updated line', () => {
    expect(parseTestCases(MD).updated).toBe('2026-07-01 (rev 8)');
  });

  it('builds one section per ## heading, with slug ids', () => {
    const { sections } = parseTestCases(MD);
    expect(sections.map((s) => s.id)).toEqual(['1-authentication', '2-pots']);
    expect(sections[0].title).toBe('1. Authentication');
    expect(sections[0].cases).toHaveLength(3);
  });

  it('reads auto in its three forms', () => {
    const [a1, a2, a3] = parseTestCases(MD).sections[0].cases;
    expect([a1.auto, a2.auto, a3.auto]).toEqual(['api', null, 'vitest']);
  });

  it('accepts the 4-column shape with an empty steps', () => {
    const c = parseTestCases(MD).sections[1].cases[0];
    expect(c).toMatchObject({ id: 'PT-01', scenario: 'List loads', steps: '', expected: 'Rows shown' });
  });

  it('turns ### into a sub-label on the following cases, not a section', () => {
    const { sections } = parseTestCases(MD);
    expect(sections).toHaveLength(2);
    expect(sections[1].cases[0].sub).toBe('View A — list');
    expect(sections[0].cases[0].sub).toBeNull();
  });

  it('parses CRLF input identically to LF', () => {
    expect(parseTestCases(MD.replace(/\n/g, '\r\n'))).toEqual(parseTestCases(MD));
  });

  it('ignores a leading UTF-8 BOM', () => {
    expect(parseTestCases('﻿' + MD)).toEqual(parseTestCases(MD));
  });

  it('reads an escaped pipe as a literal pipe inside one cell', () => {
    const md = '## S\n\n| ID | Scenario | Steps | Expected | Auto |\n|---|---|---|---|---|\n| X-01 | a\\|b | s | e | |';
    const { sections, warnings } = parseTestCases(md);
    expect(warnings).toEqual([]);
    expect(sections[0].cases[0].scenario).toBe('a|b');
  });

  it('warns and skips a row whose cell count does not match its header', () => {
    const md = '## S\n\n| ID | Scenario | Steps | Expected | Auto |\n|---|---|---|---|---|\n| X-01 | a|b | s | e | |';
    const { sections, warnings } = parseTestCases(md);
    expect(sections[0].cases).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('X-01');
  });

  it('warns on a duplicate id but keeps both cases', () => {
    const md = '## A\n\n| ID | Scenario | Steps | Expected | Auto |\n|---|---|---|---|---|\n| X-01 | a | s | e | |\n\n## B\n\n| ID | Scenario | Steps | Expected | Auto |\n|---|---|---|---|---|\n| X-01 | b | s | e | |';
    const { sections, warnings } = parseTestCases(md);
    expect(sections[0].cases).toHaveLength(1);
    expect(sections[1].cases).toHaveLength(1);
    expect(warnings.join(' ')).toContain('X-01');
  });

  it('warns on a ### before any ##', () => {
    expect(parseTestCases('### orphan\n').warnings).toHaveLength(1);
  });

  it('warns on an unrecognised table header and skips its rows', () => {
    const md = '## S\n\n| Foo | Bar |\n|---|---|\n| 1 | 2 |';
    const { sections, warnings } = parseTestCases(md);
    expect(sections[0].cases).toHaveLength(0);
    expect(warnings).toHaveLength(1);
  });

  it('gives a prose-only section zero cases without failing', () => {
    const { sections, warnings } = parseTestCases('## S\n\nJust prose.\n');
    expect(sections[0].cases).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('drops HTML comments, which a Markdown reader never shows', () => {
    const { sections } = parseTestCases('## 13. Timesheets <!-- was 12 -->\n');
    expect(sections[0].title).toBe('13. Timesheets');
  });

  it('disambiguates colliding slugs', () => {
    const { sections } = parseTestCases('## Same\n\n## Same\n');
    expect(sections.map((s) => s.id)).toEqual(['same', 'same-2']);
  });
});

describe('formatCell', () => {
  it('escapes markup before formatting it', () => {
    expect(formatCell('<aside class="pd-nav">')).toBe('&lt;aside class=&quot;pd-nav&quot;&gt;');
  });

  it('renders backticks as code and ** as strong', () => {
    expect(formatCell('open `/login.html` now')).toBe('open <code>/login.html</code> now');
    expect(formatCell('**Auto** = covered')).toBe('<strong>Auto</strong> = covered');
  });

  it('escapes inside a code span too', () => {
    expect(formatCell('`<br>`')).toBe('<code>&lt;br&gt;</code>');
  });

  it('leaves an unbalanced backtick or ** as literal text', () => {
    expect(formatCell('a ` b')).toBe('a ` b');
    expect(formatCell('a ** b')).toBe('a ** b');
  });

  it('escapes an ampersand first, so an entity is not double-decoded', () => {
    expect(formatCell('a & b')).toBe('a &amp; b');
  });
});

// The page renders this exact file, so these are the tests that stop a future
// /sync-docs from breaking it by writing malformed Markdown.
describe('the real TEST_CASES.md', () => {
  const parsed = parseTestCases(readFileSync('TEST_CASES.md', 'utf8'));
  const allCases = parsed.sections.flatMap((s) => s.cases);

  it('parses with no warnings', () => {
    expect(parsed.warnings).toEqual([]);
  });

  it('yields at least 797 cases across at least 35 sections', () => {
    expect(allCases.length).toBeGreaterThanOrEqual(797);
    expect(parsed.sections.length).toBeGreaterThanOrEqual(35);
  });

  it('gives every case a non-empty steps', () => {
    expect(allCases.filter((c) => !c.steps).map((c) => c.id)).toEqual([]);
  });

  it('has no duplicate case id', () => {
    const ids = allCases.map((c) => c.id);
    expect(ids.length).toBe(new Set(ids).size);
  });
});
