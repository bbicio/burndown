import { describe, it, expect } from 'vitest';
import { extractBlock } from './extract-source.mjs';

describe('extractBlock', () => {
  it('cuts a function declaration with nested braces', () => {
    expect(extractBlock('x; async function f(a) { if (a) { return 1; } } y', 'async function f('))
      .toBe('async function f(a) { if (a) { return 1; } }');
  });

  it('cuts an object-literal method', () => {
    expect(extractBlock('  m() { return {a:1}; }\n  n() {}', 'm() {')).toBe('m() { return {a:1}; }');
  });

  it('throws when the head is missing', () => {
    expect(() => extractBlock('function g() {}', 'function f(')).toThrow(/not found/);
  });
});
