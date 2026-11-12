import { describe, it, expect } from 'vitest';
import { parseRules, classify, planCopy, describeRule } from './site-export.mjs';

const b = (s) => Buffer.from(s);

describe('parseRules', () => {
  it('skips comments and blank lines and records line numbers', () => {
    const rules = parseRules('# c\n\ninclude js/\nexclude **/*.test.js\n');
    expect(rules).toHaveLength(2);
    expect(rules.map((r) => r.line)).toEqual([3, 4]);
    expect(rules.map((r) => r.action)).toEqual(['include', 'exclude']);
  });

  it('rejects an unknown directive', () => {
    expect(() => parseRules('keep js/')).toThrow(/site-export\.rules:1/);
  });

  it('rejects a directive without a pattern', () => {
    expect(() => parseRules('include')).toThrow(/site-export\.rules:1/);
  });
});

describe('glob semantics', () => {
  const m = (line, path) => parseRules(line)[0].re.test(path);

  it('a trailing slash means the directory and everything below it', () => {
    expect(m('include js/', 'js/core.js')).toBe(true);
    expect(m('include js/', 'js/lib/a.js')).toBe(true);
    expect(m('include js/', 'jsx/a.js')).toBe(false);
  });

  it('**/ matches zero or more directories', () => {
    expect(m('exclude **/*.test.js', 'a.test.js')).toBe(true);
    expect(m('exclude **/*.test.js', 'js/lib/a.test.js')).toBe(true);
  });

  it('* does not cross a slash', () => {
    expect(m('include *.html', 'login.html')).toBe(true);
    expect(m('include *.html', 'js/x.html')).toBe(false);
  });

  it('a pattern without a slash is anchored at the root', () => {
    expect(m('include package.json', 'package.json')).toBe(true);
    expect(m('include package.json', 'api/package.json')).toBe(false);
  });

  it('? matches one non-slash character and dots are literal', () => {
    expect(m('include a?c.js', 'abc.js')).toBe(true);
    expect(m('include a?c.js', 'a/c.js')).toBe(false);
    expect(m('include a.js', 'aXjs')).toBe(false);
  });
});

describe('classify', () => {
  it('first matching rule wins; no rule means unclassified', () => {
    const rules = parseRules('exclude **/*.test.js\ninclude js/\n');
    const out = classify(['js/lib/a.test.js', 'js/lib/a.js', 'docs/x.md'], rules);
    expect(out.map((o) => o.verdict)).toEqual(['exclude', 'include', 'unclassified']);
    expect(out[0].rule.line).toBe(1);
    expect(out[1].rule.line).toBe(2);
    expect(out[2].rule).toBeNull();
  });
});

describe('describeRule', () => {
  it('names the rule and its line, or "no rule"', () => {
    const [r] = parseRules('\ninclude js/\n');
    expect(describeRule(r)).toBe('include js/ (line 2)');
    expect(describeRule(null)).toBe('no rule');
  });
});

describe('planCopy', () => {
  it('splits added, modified and deleted, each sorted', () => {
    const wanted = new Map([['a', b('x')], ['b', b('y')]]);
    const existing = new Map([['b', b('z')], ['c', b('w')]]);
    expect(planCopy(wanted, existing)).toEqual({ added: ['a'], modified: ['b'], deleted: ['c'] });
  });

  it('a text file differing only by CRLF is unchanged', () => {
    const wanted = new Map([['a', b('l1\nl2\n')]]);
    const existing = new Map([['a', b('l1\r\nl2\r\n')]]);
    expect(planCopy(wanted, existing)).toEqual({ added: [], modified: [], deleted: [] });
  });

  it('a binary file differing only by CRLF is modified', () => {
    const wanted = new Map([['a', Buffer.from([0, 10, 1])]]);
    const existing = new Map([['a', Buffer.from([0, 13, 10, 1])]]);
    expect(planCopy(wanted, existing).modified).toEqual(['a']);
  });
});
