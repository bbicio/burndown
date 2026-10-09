// Parses TEST_CASES.md into the data model test-cases.html renders.
// The page fetches the Markdown at runtime, so this file is the only copy of
// the test cases' structure — there is no inline duplicate to keep in sync.
//
// Tolerant by design: a malformed row produces a warning and is skipped, never
// an exception. A typo in the Markdown degrades the page instead of blanking it.

const HEADERS = [
  ['id', 'scenario', 'steps', 'expected', 'auto'],
  ['id', 'scenario', 'expected', 'auto'],
];

function slugify(title, taken) {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

// Splits a table line into trimmed cells. A pipe escaped as \| is part of the
// cell's text, not a boundary.
function cells(line) {
  const parts = line.split(/(?<!\\)\|/);
  parts.shift();
  if (parts.length && parts[parts.length - 1].trim() === '') parts.pop();
  return parts.map((c) => c.trim().replace(/\\\|/g, '|'));
}

const isSeparator = (cs) => cs.length > 0 && cs.every((c) => /^:?-{3,}:?$/.test(c));

function matchHeader(cs) {
  const lower = cs.map((c) => c.toLowerCase());
  return HEADERS.find((h) => h.length === lower.length && h.every((name, i) => name === lower[i])) || null;
}

function readAuto(cell) {
  if (!cell.includes('✓')) return null;
  return /vitest/i.test(cell) ? 'vitest' : 'api';
}

export function parseTestCases(markdown) {
  const lines = String(markdown ?? '').replace(/^﻿/, '').split(/\r?\n/);

  const sections = [];
  const warnings = [];
  const slugs = new Set();
  const seenIds = new Set();
  let updated = null;
  let section = null;
  let sub = null;
  let layout = null; // null = no table open, 'skip' = unrecognised table

  lines.forEach((line, i) => {
    const lineNo = i + 1;

    if (updated === null) {
      const m = line.match(/^\*\*Updated:\*\*\s*(.*?)\s*$/);
      if (m) {
        updated = m[1];
        return;
      }
    }

    const heading = line.match(/^(#{2,3})\s+(.*?)\s*$/);
    if (heading) {
      layout = null;
      const title = heading[2];
      if (heading[1] === '##') {
        sub = null;
        section = { id: slugify(title, slugs), title, cases: [] };
        sections.push(section);
      } else if (!section) {
        warnings.push(`Line ${lineNo}: "### ${title}" appears before any ## section — ignored`);
      } else {
        sub = title;
      }
      return;
    }

    if (!line.startsWith('|')) {
      layout = null;
      return;
    }

    const cs = cells(line);
    if (isSeparator(cs)) return;

    if (layout === null) {
      const header = matchHeader(cs);
      if (!header) {
        layout = 'skip';
        warnings.push(`Line ${lineNo}: unrecognised table header "${cs.join(' | ')}" — table skipped`);
        return;
      }
      layout = header;
      return;
    }
    if (layout === 'skip') return;

    if (cs.length !== layout.length) {
      warnings.push(
        `Line ${lineNo}: expected ${layout.length} cells, found ${cs.length} — row "${cs[0] ?? ''}" skipped (an unescaped | in a cell?)`,
      );
      return;
    }

    const by = (name) => {
      const at = layout.indexOf(name);
      return at === -1 ? '' : cs[at];
    };
    const id = by('id');
    if (seenIds.has(id)) warnings.push(`Line ${lineNo}: duplicate case id "${id}"`);
    seenIds.add(id);

    if (!section) {
      section = { id: slugify('section', slugs), title: '', cases: [] };
      sections.push(section);
    }
    section.cases.push({
      id,
      scenario: by('scenario'),
      steps: by('steps'),
      expected: by('expected'),
      auto: readAuto(by('auto')),
      sub,
    });
  });

  return { updated, sections, warnings };
}

// Escapes first, formats second: no markup coming from the Markdown can ever
// reach the DOM as markup. Only two inline forms are supported, and an
// unbalanced marker is left as literal text.
export function formatCell(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
