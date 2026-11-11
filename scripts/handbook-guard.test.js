// Guard: handbook/manifest.json and the Markdown files under handbook/ agree,
// every file sits in the folder of its audience (the folder is what nginx
// protects), every document is renderable by js/lib/handbook.js, and every .png
// sits in an audience folder and is referenced by a document of that audience.
// The checks are pure functions over in-memory data so the negative cases
// below never touch the disk.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep, posix } from 'node:path';
import { docProblems } from '../js/lib/handbook.js';

const ROOT = join(import.meta.dirname, '..');
const HANDBOOK = join(ROOT, 'handbook');
const AUDIENCES = ['public', 'restricted'];
const RENDERERS = ['markdown', 'test-cases'];

function walk(dir, ext) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, ext));
    else if (e.name.endsWith(ext)) out.push(relative(HANDBOOK, p).split(sep).join('/'));
  }
  return out;
}
const walkMd = (dir) => walk(dir, '.md');
const walkPng = (dir) => walk(dir, '.png');

/**
 * Every way a .png under handbook/ can sit wrong: outside an audience folder,
 * or not referenced (by relative path or basename) by a manifest document of
 * its own audience. `readDoc(file)` returns a document's text.
 */
export function imageViolations(manifest, pngPaths, readDoc) {
  const v = [];
  const docs = (manifest && manifest.documents) || [];
  for (const png of pngPaths) {
    const audience = AUDIENCES.find((a) => png.startsWith(a + '/'));
    if (!audience) {
      v.push(`handbook/${png} is not under public/ or restricted/`);
      continue;
    }
    const name = png.slice(png.lastIndexOf('/') + 1);
    const rel = png.slice(audience.length + 1);
    const referenced = docs.some((d) => {
      if (d.audience !== audience) return false;
      const text = readDoc(d.file);
      return mentions(text, rel) || mentions(text, name);
    });
    if (!referenced) v.push(`handbook/${png} is not referenced by any ${audience} document`);
  }
  // A public document must not pull an image out of restricted/: nginx would
  // answer 403 to every user who is not an admin.
  for (const d of docs) {
    if (d.audience !== 'public') continue;
    const text = readDoc(d.file);
    for (const m of text.matchAll(/([^\s()"'<>[\]]+\.png)(?=[)\s"'#?<>\]]|$)/g)) {
      const resolved = posix.normalize(posix.join(posix.dirname(d.file), m[1]));
      if (resolved.startsWith('restricted/')) v.push(`${d.file} references restricted image handbook/${resolved}`);
    }
  }
  return v;
}

// True when `text` contains `name` as a whole path or file name, not as the
// tail or head of a longer one (data.png must not satisfy a.png).
function mentions(text, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[/(\\s"'])${esc}($|[)\\s"'#?])`).test(text);
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

  it('every .png sits in an audience folder and is referenced by a document of that audience', () => {
    const v = imageViolations(manifest, walkPng(HANDBOOK), (f) => readFileSync(join(HANDBOOK, f), 'utf8'));
    expect(v).toEqual([]);
  });

  it('every document renders', () => {
    for (const d of manifest.documents) {
      const text = readFileSync(join(HANDBOOK, d.file), 'utf8');
      const problems = docProblems(text, d.renderer);
      expect(problems, `${d.file}: ${problems.join('; ')}`).toEqual([]);
    }
  });
});

describe('imageViolations (negative controls, in memory)', () => {
  const m = {
    documents: [
      { id: 'a', audience: 'public', renderer: 'markdown', file: 'public/a.md' },
      { id: 'b', audience: 'restricted', renderer: 'markdown', file: 'restricted/b.md' },
    ],
  };
  const docs = { 'public/a.md': '![x](img/pic.png)', 'restricted/b.md': 'no images' };
  const read = (f) => docs[f];

  it('accepts an image referenced by a document of its audience', () => {
    expect(imageViolations(m, ['public/img/pic.png'], read)).toEqual([]);
  });
  it('flags an image outside an audience folder', () => {
    expect(imageViolations(m, ['loose/pic.png'], read)).toHaveLength(1);
  });
  it('flags an image referenced only by a document of the other audience', () => {
    expect(imageViolations(m, ['restricted/img/pic.png'], read)).toHaveLength(1);
  });
  it('flags an unreferenced image', () => {
    expect(imageViolations(m, ['public/img/other.png'], read)).toHaveLength(1);
  });
  it('does not take a longer file name for a reference (data.png is not a.png)', () => {
    const d = { 'public/a.md': '![x](img/data.png)', 'restricted/b.md': '' };
    expect(imageViolations(m, ['public/img/a.png'], (f) => d[f])).toHaveLength(1);
  });
  it('flags a public document that references a restricted image', () => {
    const d = { 'public/a.md': '![x](../restricted/img/diag.png)', 'restricted/b.md': '![y](img/diag.png)' };
    const v = imageViolations(m, ['restricted/img/diag.png'], (f) => d[f]);
    expect(v).toHaveLength(1);
    expect(v[0]).toContain('restricted image');
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
