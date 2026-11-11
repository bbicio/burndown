import { describe, it, expect } from 'vitest';
import {
  visibleDocs,
  resolveDoc,
  isHandbookPayload,
  hasMermaid,
  nextTestState,
  testStats,
  docProblems,
  MERMAID_TYPES,
} from './handbook.js';

const manifest = {
  documents: [
    { id: 'guide', audience: 'public', renderer: 'markdown' },
    { id: 'architecture', audience: 'restricted', renderer: 'markdown' },
    { id: 'tests', audience: 'public', renderer: 'test-cases' },
  ],
};
const md = { id: 'guide', renderer: 'markdown' };
const tc = { id: 'tests', renderer: 'test-cases' };

describe('visibleDocs', () => {
  it('user sees only public documents', () => {
    expect(visibleDocs(manifest, 'user').map((d) => d.id)).toEqual(['guide', 'tests']);
  });
  it('admin and sysadmin see all, in manifest order', () => {
    for (const role of ['admin', 'sysadmin']) {
      expect(visibleDocs(manifest, role).map((d) => d.id)).toEqual(['guide', 'architecture', 'tests']);
    }
  });
});

describe('resolveDoc', () => {
  it('restricted id for a user falls back to the first public one with a notice', () => {
    const r = resolveDoc(manifest, 'architecture', 'user');
    expect(r.doc.id).toBe('guide');
    expect(r.notice).toBe('Document not available');
  });
  it('empty id gives the first visible document and no notice', () => {
    const r = resolveDoc(manifest, '', 'admin');
    expect(r.doc.id).toBe('guide');
    expect(r.notice).toBe('');
  });
  it('unknown id gives the first visible document and a notice', () => {
    const r = resolveDoc(manifest, 'nope', 'admin');
    expect(r.doc.id).toBe('guide');
    expect(r.notice).toBe('Document not available');
  });
  it('a visible id resolves to that document', () => {
    expect(resolveDoc(manifest, 'architecture', 'admin')).toEqual({ doc: manifest.documents[1], notice: '' });
  });
  it('no visible document gives doc null', () => {
    const m = { documents: [{ id: 'a', audience: 'restricted', renderer: 'markdown' }] };
    expect(resolveDoc(m, 'a', 'user')).toEqual({ doc: null, notice: 'Document not available' });
  });
});

describe('isHandbookPayload', () => {
  it('rejects the login HTML', () => {
    expect(isHandbookPayload('<!DOCTYPE html><html></html>', md)).toBe(false);
  });
  it('accepts the test-cases title, BOM stripped', () => {
    expect(isHandbookPayload('﻿# PDash — Test Cases\n', tc)).toBe(true);
  });
  it('rejects another title for test-cases', () => {
    expect(isHandbookPayload('# Other', tc)).toBe(false);
  });
  it('accepts any non-HTML text for markdown', () => {
    expect(isHandbookPayload('# Title', md)).toBe(true);
  });
});

describe('hasMermaid', () => {
  it('finds a mermaid fence', () => {
    expect(hasMermaid('```mermaid\ngraph TD\n```')).toBe(true);
  });
  it('ignores other fences', () => {
    expect(hasMermaid('```js\nx\n```')).toBe(false);
  });
  it('ignores a mermaid fence nested inside another block', () => {
    expect(hasMermaid('~~~\n```mermaid\n~~~')).toBe(false);
  });
});

describe('test state', () => {
  it('cycles untested -> pass -> fail -> untested', () => {
    expect(nextTestState('untested')).toBe('pass');
    expect(nextTestState('pass')).toBe('fail');
    expect(nextTestState('fail')).toBe('untested');
  });
  it('counts missing state as untested', () => {
    expect(testStats([{ id: 'a' }, { id: 'b' }, { id: 'c' }], { a: 'pass', b: 'fail' })).toEqual({
      p: 1,
      f: 1,
      u: 1,
      total: 3,
    });
  });
});

describe('docProblems', () => {
  it('reports a markdown document that starts with "<"', () => {
    expect(docProblems('<!-- note -->\n# T', 'markdown')).toHaveLength(1);
    expect(docProblems('﻿  \n<div>x</div>', 'markdown')).toHaveLength(1);
    expect(docProblems('# T\n<div>x</div>', 'markdown')).toEqual([]);
  });
  it('flags an unclosed fence', () => {
    expect(docProblems('```\nx', 'markdown')).toHaveLength(1);
  });
  it('a longer fence contains a shorter one', () => {
    expect(docProblems('````\n```\n````', 'markdown')).toEqual([]);
  });
  it('a tilde fence contains a backtick fence', () => {
    expect(docProblems('~~~\n```\n~~~', 'markdown')).toEqual([]);
  });
  it('flags an empty mermaid block', () => {
    expect(docProblems('```mermaid\n\n```', 'markdown')).toHaveLength(1);
  });
  it('flags a mermaid block with an unknown type', () => {
    expect(docProblems('```mermaid\nfoo\n```', 'markdown')).toHaveLength(1);
  });
  it('accepts a kanban mermaid block', () => {
    expect(docProblems('```mermaid\nkanban\n  todo[Todo]\n```', 'markdown')).toEqual([]);
  });
  it('accepts a mermaid block after a %% comment', () => {
    expect(docProblems('```mermaid\n%% c\nflowchart LR\n```', 'markdown')).toEqual([]);
  });
  it('turns parseTestCases warnings into problems', () => {
    const text = '# PDash — Test Cases\n\n## 1. A\n\n| ID | Scenario | Steps | Expected | Auto |\n|---|---|---|---|---|\n| A-01 | only | three |\n';
    expect(docProblems(text, 'test-cases').length).toBeGreaterThanOrEqual(1);
  });
  it('flags a missing test-cases title', () => {
    expect(docProblems('# Other', 'test-cases')).toHaveLength(1);
  });
  it('accepts flowchart-elk and info blocks', () => {
    expect(docProblems('```mermaid\nflowchart-elk TD\nA-->B\n```', 'markdown')).toEqual([]);
    expect(docProblems('```mermaid\ninfo\n```', 'markdown')).toEqual([]);
  });
  it('MERMAID_TYPES contains the core types', () => {
    expect(MERMAID_TYPES).toContain('flowchart');
    expect(MERMAID_TYPES).toContain('xychart-beta');
  });
});
