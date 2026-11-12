import { describe, it, expect } from 'vitest';
import { erEntities, apiCalls, flowEdges, withoutMermaid, diagramProblems } from './mermaid-facts.mjs';

describe('erEntities', () => {
  it('reads both sides of a relation', () => {
    expect(erEntities('erDiagram\n  users ||--o{ trusted_devices : "has"')).toEqual(['users', 'trusted_devices']);
  });
  it('reads an isolated declaration', () => {
    expect(erEntities('erDiagram\n  topics {\n  }')).toEqual(['topics']);
  });
  it('reads a declaration with an alias', () => {
    expect(erEntities('erDiagram\n  pots["POT targets"] {\n  }')).toEqual(['pots']);
  });
  it('counts a repeated entity once', () => {
    expect(erEntities('erDiagram\n  a ||--o{ b : "x"\n  c ||--o{ b : "y"')).toEqual(['a', 'b', 'c']);
  });
  it('returns nothing for an empty diagram', () => {
    expect(erEntities('erDiagram')).toEqual([]);
  });
  it('keeps a wrongly cased name verbatim', () => {
    expect(erEntities('erDiagram\n  Users ||--o{ x : "a"')).toEqual(['Users', 'x']);
  });
});

describe('apiCalls', () => {
  it('reads a method and path', () => {
    expect(apiCalls('A->>B: POST /api/auth/login')).toEqual([{ method: 'POST', path: '/api/auth/login' }]);
  });
  it('keeps :id and the query, drops trailing punctuation', () => {
    expect(apiCalls('A->>B: GET /api/users/:id?x=1)')).toEqual([{ method: 'GET', path: '/api/users/:id?x=1' }]);
    expect(apiCalls('A->>B: POST /api/auth/login,')).toEqual([{ method: 'POST', path: '/api/auth/login' }]);
  });
  it('ignores a lowercase method', () => {
    expect(apiCalls('A->>B: post /api/x')).toEqual([]);
  });
  it('ignores a path without a method', () => {
    expect(apiCalls('Note over A: see /api/x')).toEqual([]);
  });
});

describe('flowEdges', () => {
  it('resolves nodes on their label, through an edge label', () => {
    const r = flowEdges('flowchart LR\n  sip["SIP"] -->|label| dis["status disabled"]');
    expect(r.edges).toEqual([{ from: 'SIP', to: 'status disabled' }]);
    expect(r.unsupported).toEqual([]);
  });
  it('resolves a node declared after its edge', () => {
    const r = flowEdges('flowchart LR\n  a --> b\n  b["Started"]');
    expect(r.edges).toEqual([{ from: 'a', to: 'Started' }]);
  });
  it('splits a chain into two edges', () => {
    expect(flowEdges('flowchart LR\n  a --> b --> c').edges).toEqual([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ]);
  });
  it('reports & as unsupported', () => {
    const r = flowEdges('flowchart LR\n  a --> b & c');
    expect(r.unsupported).toEqual(['a --> b & c']);
  });
  it('does not take & inside a label for the operator', () => {
    expect(flowEdges('flowchart LR\n  a["Vue & Bootstrap"] --> b').unsupported).toEqual([]);
  });
});

describe('withoutMermaid', () => {
  it('blanks mermaid blocks and keeps the line count', () => {
    const md = 'text\n```mermaid\nerDiagram\n  users {\n  }\n```\n```sql\nCREATE TABLE users;\n```\nend';
    const out = withoutMermaid(md);
    expect(out.split('\n').length).toBe(md.split('\n').length);
    expect(out).not.toContain('erDiagram');
    expect(out).toContain('CREATE TABLE users;');
    expect(out).toContain('text');
  });
});

describe('diagramProblems', () => {
  const facts = {
    tables: new Set(['users', 'pots']),
    endpoints: new Set(['POST /api/auth/login']),
    keyOf: (r) => `${r.method} ${r.path}`,
    stages: ['SIP', 'Expected'],
    statusRule: (s) => (s === 'SIP' ? { options: [], disabled: true } : { options: ['Started', 'Completed'], disabled: false }),
  };
  const fence = (body) => '```mermaid\n' + body + '\n```';
  const seq = fence('sequenceDiagram\n  A->>B: POST /api/auth/login');
  const er = fence('erDiagram\n  users ||--o{ pots : "x"');
  const flow = fence(
    'flowchart LR\n  SIP --> dis["status disabled"]\n  Expected --> Started\n  Expected --> Completed',
  );
  const doc = () => ['### 4.1 Flow', seq, '### 5.1 Area', er, '### 5.9 Stage', flow].join('\n');

  it('passes a document that is all correct', () => {
    expect(diagramProblems(doc(), facts)).toEqual([]);
  });
  it('reports an unknown ER entity', () => {
    const p = diagramProblems(doc().replace('pots : "x"', 'ghosts : "x"'), facts);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('ghosts');
  });
  it('reports a table absent from the live tables', () => {
    const p = diagramProblems(doc(), { ...facts, tables: new Set(['users']) });
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('pots');
  });
  it('reports an entity written with the wrong case', () => {
    const p = diagramProblems(doc().replace('users ||', 'Users ||'), facts);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('Users');
  });
  it('reports an unknown API call but not a normalised one', () => {
    const p = diagramProblems(doc().replace('POST /api/auth/login', 'GET /api/nope'), facts);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('/api/nope');
    expect(diagramProblems(doc().replace('/api/auth/login', '/api/auth/login?x=1)'), facts)).toEqual([]);
  });
  it('reports a missing stage → status edge', () => {
    const p = diagramProblems(doc().replace('\n  Expected --> Completed', ''), facts);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('Expected→Completed');
  });
  it('reports an extra edge', () => {
    const p = diagramProblems(doc().replace('Expected --> Started', 'Expected --> Started\n  SIP --> Expected'), facts);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('SIP→Expected');
  });
  it('reports a §4.x heading without a sequenceDiagram', () => {
    const p = diagramProblems(doc().replace(seq, 'prose only'), facts);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('4.1');
  });
  it('reports a §5.x heading without an erDiagram', () => {
    const p = diagramProblems(doc().replace(er, 'prose only'), facts);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('5.1');
  });
  it('reports the §5.9 heading without a flowchart', () => {
    const p = diagramProblems(doc().replace(flow, 'prose only'), facts);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('5.9');
  });
  it('reports an unsupported flowchart line', () => {
    const p = diagramProblems(doc().replace('Expected --> Started', 'Expected --> Started & Completed'), facts);
    expect(p.some((x) => x.includes('Expected --> Started & Completed'))).toBe(true);
  });
});
