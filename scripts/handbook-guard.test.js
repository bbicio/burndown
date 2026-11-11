// Guard: handbook/manifest.json and the Markdown files under handbook/ agree,
// every file sits in the folder of its audience (the folder is what nginx
// protects), and every document is renderable by js/lib/handbook.js.
// The checks are pure functions over in-memory data so the negative cases
// below never touch the disk.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { docProblems } from '../js/lib/handbook.js';

const ROOT = join(import.meta.dirname, '..');
const HANDBOOK = join(ROOT, 'handbook');
const AUDIENCES = ['public', 'restricted'];
const RENDERERS = ['markdown', 'test-cases'];

function walkMd(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkMd(p));
    else if (e.name.endsWith('.md')) out.push(relative(HANDBOOK, p).split(sep).join('/'));
  }
  return out;
}

/** Every way the manifest and the .md files under handbook/ can disagree. */
export function manifestViolations(manifest, mdPaths, exists) {
  const v = [];
  const docs = (manifest && manifest.documents) || [];
  const listed = new Set();
  const ids = new Set();
  for (const d of docs) {
    if (ids.has(d.id)) v.push(`duplicate id "${d.id}"`);
    ids.add(d.id);
    if (!AUDIENCES.includes(d.audience)) v.push(`${d.id}: audience "${d.audience}" is not public or restricted`);
    if (!RENDERERS.includes(d.renderer)) v.push(`${d.id}: renderer "${d.renderer}" is not markdown or test-cases`);
    if (typeof d.file !== 'string' || !d.file.startsWith(d.audience + '/'))
      v.push(`${d.id}: file "${d.file}" is not under ${d.audience}/`);
    listed.add(d.file);
    if (!exists(d.file)) v.push(`${d.id}: file "${d.file}" does not exist`);
  }
  for (const p of mdPaths) if (!listed.has(p)) v.push(`handbook/${p} is not listed in the manifest`);
  return v;
}

describe('handbook manifest', () => {
  const manifest = JSON.parse(readFileSync(join(HANDBOOK, 'manifest.json'), 'utf8'));
  const mdPaths = walkMd(HANDBOOK);
  const exists = (f) => existsSync(join(HANDBOOK, f));

  it('the manifest lists every handbook .md and every listed file exists', () => {
    const v = manifestViolations(manifest, mdPaths, exists);
    expect(v.filter((x) => /not listed|does not exist/.test(x))).toEqual([]);
  });

  it('each file sits in its audience folder', () => {
    const v = manifestViolations(manifest, mdPaths, exists);
    expect(v.filter((x) => !/not listed|does not exist/.test(x))).toEqual([]);
  });

  it('every document renders', () => {
    for (const d of manifest.documents) {
      const text = readFileSync(join(HANDBOOK, d.file), 'utf8');
      const problems = docProblems(text, d.renderer);
      expect(problems, `${d.file}: ${problems.join('; ')}`).toEqual([]);
    }
  });
});

describe('manifestViolations (negative controls, in memory)', () => {
  const ok = { documents: [{ id: 'a', audience: 'public', renderer: 'markdown', file: 'public/a.md' }] };

  it('accepts a consistent manifest', () => {
    expect(manifestViolations(ok, ['public/a.md'], () => true)).toEqual([]);
  });
  it('flags a listed file that is missing', () => {
    expect(manifestViolations(ok, [], () => false)).toHaveLength(1);
  });
  it('flags a .md that is not listed', () => {
    expect(manifestViolations(ok, ['public/a.md', 'public/b.md'], () => true)).toHaveLength(1);
  });
  it('flags a restricted file declared public', () => {
    const bad = { documents: [{ id: 'x', audience: 'public', renderer: 'markdown', file: 'restricted/x.md' }] };
    expect(manifestViolations(bad, ['restricted/x.md'], () => true)).toHaveLength(1);
  });
  it('flags a duplicate id', () => {
    const dup = { documents: [...ok.documents, ...ok.documents] };
    expect(manifestViolations(dup, ['public/a.md'], () => true).length).toBeGreaterThan(0);
  });
});
