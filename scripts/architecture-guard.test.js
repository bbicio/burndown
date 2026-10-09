// Guard: ARCHITECTURE.md §5 (Database Schema) and §6 (API Reference) must not
// drift away from the code they describe.
//
// WHY A GUARD AND NOT A GENERATOR. The 2026-09-17 audit
// (docs/superpowers/audits/2026-09-17-architecture-claude-vs-app-behavior-audit.md)
// found 22 findings, of which 7 were these two sections stating something the
// code contradicted or omitting something the code had: a whole multi-currency
// schema missing (#1, Critical), five `currencies.js` endpoints absent (#3,
// Major), `projects.code` missing (#9), a `CHAR(6)` that is `CHAR(8)` (#10),
// `cg_version_projects.task_ids` missing (#12), and two undocumented export /
// reporting endpoints (#14, #15). Every one of those is a *divergence*, which a
// test catches as well as a generator would — and a generator would have to
// rewrite §5's 104 hand-written semantic comments and 362 lines of prose, and
// §6's 66 hand-written Description cells, none of which exist in the code.
// So: this file fails when the mechanical facts disagree, and never touches the
// prose. Same shape as scripts/classify-cycle.test.js — the rule lives in code,
// pinned by a test, instead of living in prose nobody re-reads.
//
// WHAT IS DELIBERATELY NOT CHECKED, and why — these are named limits, not gaps:
//   * The `Auth` column. 7 of the 21 route files apply their guard with
//     `router.use(requireAuth, requireAdmin)` rather than per handler, so a
//     per-handler reading is wrong for a third of the codebase. A check that is
//     wrong a third of the time is worse than no check.
//   * §6's `Description` column and §5's comments/prose. They carry business
//     rules, dated decisions and references to rule functions. Nothing in the
//     code states them, so nothing can verify them.
//   * §5 column *types*. The current schema is not the union of the `CREATE
//     TABLE` statements (30 migrations contain 33 `ALTER TABLE` and 3 `DROP
//     COLUMN`), so a static parser cannot know a column's final type. Catching
//     finding #10's class would need a live schema — `scripts/run-tests.sh`
//     builds one, but requiring Docker would make `npm test` unrunnable without
//     it. Presence is checked; type is not.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

// ─── ARCHITECTURE.md sections ────────────────────────────────────────────────

const archLines = read('ARCHITECTURE.md').split(/\r?\n/);

/** Lines of the top-level section whose heading matches `start`, up to `end`. */
function section(startRe, endRe) {
  const a = archLines.findIndex((l) => startRe.test(l));
  expect(a, `ARCHITECTURE.md heading ${startRe} not found`).toBeGreaterThan(-1);
  const b = archLines.findIndex((l, i) => i > a && endRe.test(l));
  expect(b, `ARCHITECTURE.md heading ${endRe} not found after ${startRe}`).toBeGreaterThan(a);
  return archLines.slice(a, b);
}

const s5 = section(/^## 5\. Database Schema/, /^## 6\./).join('\n');
const s6 = section(/^## 6\. API Reference/, /^## 7\./);

// ─── the live routes ─────────────────────────────────────────────────────────

const indexSrc = read('api/src/index.js');

/** router identifier -> route file basename, from the `require` lines. */
function routeFiles() {
  const out = new Map();
  const re = /(?:const\s+(\w+)|const\s*\{\s*router:\s*(\w+)\s*\})\s*=\s*require\('\.\/routes\/([\w-]+)'\)/g;
  for (const m of indexSrc.matchAll(re)) out.set(m[1] || m[2], m[3]);
  return out;
}

/** router identifier -> mount prefix, for the `/api*` mounts only. */
function mounts() {
  const out = new Map();
  for (const m of indexSrc.matchAll(/app\.use\(\s*'([^']+)'\s*,\s*(\w+)\s*\)/g)) {
    if (m[1].startsWith('/api')) out.set(m[2], m[1]);
  }
  return out;
}

const METHODS = 'get|post|patch|put|delete';

/** Every handler whose path is a string literal, as `METHOD /full/path`. */
function codeEndpoints() {
  const files = routeFiles();
  const out = [];
  for (const [ident, prefix] of mounts()) {
    const file = files.get(ident);
    expect(file, `index.js mounts ${ident} but never requires it`).toBeTruthy();
    const src = read(`api/src/routes/${file}.js`);
    for (const m of src.matchAll(new RegExp(`router\\.(${METHODS})\\(\\s*'([^']*)'`, 'g'))) {
      const tail = m[2] === '/' ? '' : m[2];
      out.push({ method: m[1].toUpperCase(), path: prefix + tail, file });
    }
  }
  return out;
}

/** Count of handlers whose path is built dynamically (template literal). */
function dynamicDeclarations() {
  const out = [];
  for (const file of readdirSync(resolve(ROOT, 'api/src/routes'))) {
    if (!file.endsWith('.js') || file.endsWith('.test.js')) continue;
    const src = read(`api/src/routes/${file}`);
    for (const m of src.matchAll(new RegExp(`router\\.(${METHODS})\\(\\s*\``, 'g'))) {
      out.push(`${file}: router.${m[1]}(\`…\`)`);
    }
  }
  return out;
}

// ─── §6's endpoint rows ──────────────────────────────────────────────────────

/**
 * Endpoint rows of §6. Two notations are handled rather than tripped over:
 *  - a combined method cell (`GET/POST`) is one row per method;
 *  - an alternation (`/:id/(approve\|reject\|restore)`) is one row per branch,
 *    which is how the three dynamically-built topics routes are documented.
 * A row whose path contains `...` is a design note about a whole family of
 * routes (the `versionScope` router-level guard), not an endpoint; skipped.
 */
function docEndpoints() {
  const out = [];
  for (const line of s6) {
    if (!line.startsWith('|')) continue;
    // Split on unescaped pipes only: a documented alternation writes its
    // separators as `\|` inside one cell, and splitting on those would truncate
    // the path to `/api/topics/:id/(approve\` and report it as stale.
    const cells = line.split(/(?<!\\)\|/).map((c) => c.trim());
    const [, method, path] = cells;
    if (!method || !path || !/^[A-Z/]+$/.test(method) || !path.startsWith('/api')) continue;
    if (path.includes('...')) continue;
    for (const verb of method.split('/')) {
      for (const p of expandAlternation(path)) out.push({ method: verb.trim(), path: p });
    }
  }
  return out;
}

function expandAlternation(path) {
  const m = path.match(/^(.*)\(([^)]*)\)(.*)$/);
  if (!m) return [path];
  return m[2].split(/\\?\|/).map((branch) => `${m[1]}${branch.trim()}${m[3]}`);
}

/** Parameter names and query strings are presentation, not identity. */
const norm = (p) => p.replace(/\?.*$/, '').replace(/:[A-Za-z_]+/g, ':p').replace(/\/+$/, '');
const key = (r) => `${r.method} ${norm(r.path)}`;

// ─── the tests ───────────────────────────────────────────────────────────────

describe('ARCHITECTURE.md §6 API Reference vs the live routes', () => {
  it('documents every route handler declared in the code', () => {
    const documented = new Set(docEndpoints().map(key));
    const undocumented = codeEndpoints()
      .filter((r) => !documented.has(key(r)))
      .map((r) => `${key(r)}  (api/src/routes/${r.file}.js)`);
    expect(undocumented).toEqual([]);
  });

  it('has no endpoint row that no longer exists in the code', () => {
    const live = new Set(codeEndpoints().map(key));
    // The three topics status transitions are built in a loop, so they have no
    // string literal to match; see the characterization test below.
    const builtInALoop = new Set(
      ['approve', 'reject', 'restore'].map((a) => `POST /api/topics/:p/${a}`),
    );
    const stale = docEndpoints()
      .map(key)
      .filter((k) => !live.has(k) && !builtInALoop.has(k));
    expect(stale).toEqual([]);
  });

  it('has exactly one dynamically-built route path', () => {
    // Characterization, deliberately exact and not a ceiling: a second dynamic
    // path would be invisible to the two tests above, so it has to be added
    // here on purpose — together with its rows in the `builtInALoop` set.
    // The one that exists is topics.js's `/:id/${action}` loop over
    // approve/reject/restore.
    expect(dynamicDeclarations()).toEqual(['topics.js: router.post(`…`)']);
  });
});

describe('ARCHITECTURE.md §5 Database Schema vs the migrations', () => {
  const migrationsDir = 'api/src/db/migrations';
  const files = readdirSync(resolve(ROOT, migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  it('mentions every table a migration creates', () => {
    const missing = [];
    const seen = new Set();
    for (const f of files) {
      const sql = read(`${migrationsDir}/${f}`);
      for (const m of sql.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([a-z_]+)/gi)) {
        const table = m[1];
        if (seen.has(table)) continue;
        seen.add(table);
        if (!new RegExp(`\\b${table}\\b`).test(s5)) missing.push(`${table}  (${f})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('mentions every column a migration adds with ALTER TABLE', () => {
    const missing = [];
    for (const f of files) {
      const sql = read(`${migrationsDir}/${f}`);
      const re = /ALTER TABLE\s+([a-z_]+)\s+ADD COLUMN(?:\s+IF NOT EXISTS)?\s+([a-z_]+)/gi;
      for (const m of sql.matchAll(re)) {
        if (!new RegExp(`\\b${m[2]}\\b`).test(s5)) missing.push(`${m[1]}.${m[2]}  (${f})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('finds the migrations directory it is guarding', () => {
    // Guards the guard: a renamed directory would otherwise make both tests
    // above pass over an empty file list.
    expect(files.length).toBeGreaterThan(25);
  });
});

describe("ARCHITECTURE.md's routes/ tree entry", () => {
  it('lists every route file that index.js mounts', () => {
    const entry = archLines.find((l) => /^\s+routes\/\s+←/.test(l));
    expect(entry, "no `routes/` entry in ARCHITECTURE.md's directory tree").toBeTruthy();
    const files = routeFiles();
    const missing = [...mounts().keys()]
      .map((ident) => files.get(ident))
      .filter((f) => f && !entry.includes(f));
    expect(missing).toEqual([]);
  });
});
