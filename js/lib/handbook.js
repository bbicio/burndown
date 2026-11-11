// Pure logic of help.html, the documentation viewer. No DOM, no fetch.

import { parseTestCases } from './test-cases-parse.js?v=3';

export const MERMAID_TYPES = [
  'flowchart', 'flowchart-elk', 'info', 'graph', 'sequenceDiagram', 'classDiagram', 'classDiagram-v2', 'stateDiagram', 'stateDiagram-v2',
  'erDiagram', 'journey', 'gantt', 'pie', 'mindmap', 'timeline', 'gitGraph', 'quadrantChart',
  'requirementDiagram', 'C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment',
  'block-beta', 'architecture-beta', 'sankey-beta', 'xychart-beta', 'packet-beta', 'kanban',
];

const TEST_CASES_TITLE = '# PDash — Test Cases';
const NOT_AVAILABLE = 'Document not available';

export function visibleDocs(manifest, role) {
  const privileged = role === 'admin' || role === 'sysadmin';
  return ((manifest && manifest.documents) || []).filter(
    (d) => d.audience === 'public' || (d.audience === 'restricted' && privileged),
  );
}

export function resolveDoc(manifest, id, role) {
  const docs = visibleDocs(manifest, role);
  if (!docs.length) return { doc: null, notice: NOT_AVAILABLE };
  if (!id) return { doc: docs[0], notice: '' };
  const found = docs.find((d) => d.id === id);
  return found ? { doc: found, notice: '' } : { doc: docs[0], notice: NOT_AVAILABLE };
}

const stripBom = (text) => String(text ?? '').replace(/^﻿/, '');

export function isHandbookPayload(text, doc) {
  const t = stripBom(text);
  if (t.trimStart().startsWith('<')) return false;
  if (doc && doc.renderer === 'test-cases') return t.startsWith(TEST_CASES_TITLE);
  return true;
}

// Scans fenced code blocks (CommonMark, in short): an opening line has at most 3
// spaces of indent and 3+ backticks or tildes; it closes on a line of the same
// character, at least as long, with nothing else. Inside an open block every
// other fence line is content.
function fenceBlocks(text) {
  const blocks = [];
  let cur = null;
  stripBom(text).split(/\r?\n/).forEach((line, i) => {
    if (cur) {
      const close = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
      if (close && close[1][0] === cur.char && close[1].length >= cur.len) {
        cur.closed = true;
        blocks.push(cur);
        cur = null;
      } else {
        cur.lines.push(line);
      }
      return;
    }
    const open = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!open) return;
    const info = open[2].trim();
    if (open[1][0] === '`' && info.includes('`')) return;
    cur = { char: open[1][0], len: open[1].length, info: info.split(/\s+/)[0] || '', line: i + 1, lines: [], closed: false };
  });
  if (cur) blocks.push(cur);
  return blocks;
}

export function hasMermaid(text) {
  return fenceBlocks(text).some((b) => b.info === 'mermaid');
}

export function nextTestState(s) {
  if (s === 'untested') return 'pass';
  if (s === 'pass') return 'fail';
  return 'untested';
}

export function testStats(cases, state) {
  const st = state || {};
  const stats = { p: 0, f: 0, u: 0, total: 0 };
  for (const c of cases || []) {
    stats.total++;
    const s = st[c.id];
    if (s === 'pass') stats.p++;
    else if (s === 'fail') stats.f++;
    else stats.u++;
  }
  return stats;
}

export function docProblems(text, renderer) {
  const problems = [];
  if (renderer === 'test-cases') {
    if (!stripBom(text).startsWith(TEST_CASES_TITLE)) problems.push(`Missing title "${TEST_CASES_TITLE}"`);
    for (const w of parseTestCases(text).warnings) problems.push(w);
    return problems;
  }
  if (stripBom(text).trimStart().startsWith('<')) {
    problems.push('The document starts with "<": the viewer would reject it as a login page');
  }
  for (const b of fenceBlocks(text)) {
    if (!b.closed) {
      problems.push(`Line ${b.line}: code fence is never closed`);
      continue;
    }
    if (b.info !== 'mermaid') continue;
    const first = b.lines.map((l) => l.trim()).find((l) => l !== '' && !l.startsWith('%%'));
    if (first === undefined) {
      problems.push(`Line ${b.line}: empty mermaid block`);
    } else if (!MERMAID_TYPES.some((t) => first === t || first.startsWith(t) && /^[\s;:{(\[]|^$/.test(first.slice(t.length)))) {
      problems.push(`Line ${b.line}: mermaid block starts with "${first}", not a known diagram type`);
    }
  }
  return problems;
}

if (typeof window !== 'undefined') {
  window.visibleDocs = visibleDocs;
  window.resolveDoc = resolveDoc;
  window.isHandbookPayload = isHandbookPayload;
  window.hasMermaid = hasMermaid;
  window.nextTestState = nextTestState;
  window.testStats = testStats;
  window.docProblems = docProblems;
  window.MERMAID_TYPES = MERMAID_TYPES;
}
