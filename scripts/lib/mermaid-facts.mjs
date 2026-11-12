// Names written in the Mermaid diagrams of the handbook, and the list of problems
// they have against the live facts (tables, routes, stage/status rules).
// Pure: reads no file. Limits are in scripts/architecture-guard.test.js's header.

import { fenceBlocks } from '../../js/lib/handbook.js';

const ID = '[A-Za-z_][\\w-]*';
const ER_RELATION = new RegExp(`^\\s*(${ID})\\s+[|}o]{1,2}(?:--|\\.\\.)[|{o]{1,2}\\s+(${ID})`);
const ER_DECLARATION = new RegExp(`^\\s*(${ID})\\s*(?:\\[[^\\]]*\\])?\\s*\\{`);
const API_CALL = /\b(GET|POST|PATCH|PUT|DELETE)\s+(\/api\/[^\s,;)]*)/g;
const ARROW = /-->(?:\|[^|]*\|)?/g;
const OTHER_EDGE = /--|==|-\./;

const bodyLines = (body) => String(body).split(/\r?\n/);

export function erEntities(body) {
  const seen = [];
  const add = (n) => { if (!seen.includes(n)) seen.push(n); };
  for (const line of bodyLines(body)) {
    const rel = line.match(ER_RELATION);
    if (rel) { add(rel[1]); add(rel[2]); continue; }
    const decl = line.match(ER_DECLARATION);
    if (decl) add(decl[1]);
  }
  return seen;
}

// Lines of an erDiagram that erEntities cannot read (a quoted entity, no space
// around the cardinality...): returned, never skipped, so a wrong name cannot hide.
export function erUnsupported(body) {
  const bad = [];
  let inBlock = false;
  for (const raw of bodyLines(body).slice(1)) {
    const line = raw.trim();
    if (inBlock) { if (line === '}') inBlock = false; continue; }
    if (line === '' || line === '}' || line.startsWith('%%')) continue;
    if (ER_RELATION.test(line)) continue;
    if (ER_DECLARATION.test(line)) { inBlock = !line.includes('}'); continue; }
    bad.push(line);
  }
  return bad;
}

export function apiCalls(body) {
  const calls = [];
  for (const m of String(body).matchAll(API_CALL)) calls.push({ method: m[1], path: m[2] });
  return calls;
}

// Only `-->` and `-->|text|` are understood; any other line that draws an edge is
// returned in `unsupported`, so a line is never skipped without a word.
export function flowEdges(body) {
  const lines = bodyLines(body).slice(1);
  const labels = new Map();
  for (const line of lines) {
    for (const m of line.matchAll(new RegExp(`(${ID})\\s*\\["([^"]*)"\\]`, 'g'))) labels.set(m[1], m[2]);
    for (const m of line.matchAll(new RegExp(`(${ID})\\s*\\(([^()]*)\\)`, 'g'))) labels.set(m[1], m[2]);
  }
  const name = (id) => labels.get(id) ?? id;
  const edges = [];
  const unsupported = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.includes('-->') && !OTHER_EDGE.test(line)) continue;
    const bare = line.replace(/\["[^"]*"\]/g, '').replace(/\([^()]*\)/g, '').replace(ARROW, ' > ');
    if (bare.includes('&') || OTHER_EDGE.test(bare) || !line.includes('-->')) {
      unsupported.push(line);
      continue;
    }
    const ids = line.split(ARROW).map((seg) => (seg.trim().match(new RegExp(`^(${ID})`)) || [])[1]);
    for (let i = 0; i + 1 < ids.length; i++) {
      if (ids[i] && ids[i + 1]) edges.push({ from: name(ids[i]), to: name(ids[i + 1]) });
    }
  }
  return { edges, unsupported };
}

export function withoutMermaid(text) {
  const lines = String(text).split('\n');
  for (const b of fenceBlocks(text)) {
    if (b.info !== 'mermaid') continue;
    const last = b.line + b.lines.length + (b.closed ? 1 : 0);
    for (let n = b.line; n <= last && n <= lines.length; n++) lines[n - 1] = '';
  }
  return lines.join('\n');
}

const diagramType = (block) => {
  const first = block.lines.map((l) => l.trim()).find((l) => l !== '' && !l.startsWith('%%'));
  return first ? first.split(/[\s;:{(\[]/)[0] : '';
};

const requiredType = (heading) => {
  if (/^###\s+4\.\d/.test(heading)) return 'sequenceDiagram';
  if (/^###\s+5\.[1-8]\s/.test(heading)) return 'erDiagram';
  if (/^###\s+5\.9\s/.test(heading)) return 'flowchart';
  return null;
};

export function diagramProblems(markdown, facts) {
  const problems = [];
  const lines = String(markdown).split(/\r?\n/);
  const headings = [];
  lines.forEach((l, i) => { if (/^#{2,3}\s/.test(l)) headings.push({ line: i + 1, text: l.trim() }); });
  const headingOf = (n) => headings.filter((h) => h.line < n).pop() || null;

  const blocks = fenceBlocks(markdown).filter((b) => b.info === 'mermaid' && b.closed);
  const bySection = new Map();
  for (const b of blocks) {
    const h = headingOf(b.line);
    const key = h ? h.text : '';
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key).push(b);
    const body = b.lines.join('\n');
    const type = diagramType(b);
    if (type === 'erDiagram') {
      for (const u of erUnsupported(body)) problems.push(`Line ${b.line}: unsupported erDiagram line "${u}"`);
      for (const e of erEntities(body)) {
        if (!facts.tables.has(e)) problems.push(`Line ${b.line}: erDiagram entity "${e}" is not a table`);
      }
    }
    for (const call of apiCalls(body)) {
      const route = { method: call.method, path: call.path.split('?')[0] };
      if (!facts.endpoints.has(facts.keyOf(route))) {
        problems.push(`Line ${b.line}: "${call.method} ${call.path}" is not a route of the API`);
      }
    }
    if (type === 'flowchart') {
      for (const u of flowEdges(body).unsupported) problems.push(`Line ${b.line}: unsupported flowchart line "${u}"`);
    }
  }

  for (const h of headings) {
    const need = requiredType(h.text);
    if (!need) continue;
    const found = (bySection.get(h.text) || []).filter((b) => diagramType(b) === need);
    if (!found.length) {
      problems.push(`Line ${h.line}: "${h.text}" has no ${need} block`);
      continue;
    }
    if (need !== 'flowchart') continue;
    const actual = new Set(found.flatMap((b) => flowEdges(b.lines.join('\n')).edges.map((e) => `${e.from}→${e.to}`)));
    const expected = new Set();
    for (const s of facts.stages) {
      const rule = facts.statusRule(s);
      if (rule.disabled) expected.add(`${s}→status disabled`);
      else for (const o of rule.options) expected.add(`${s}→${o}`);
    }
    for (const e of expected) if (!actual.has(e)) problems.push(`Line ${h.line}: missing edge ${e}`);
    for (const e of actual) if (!expected.has(e)) problems.push(`Line ${h.line}: unexpected edge ${e}`);
  }
  return problems;
}
