// Decides for /finish-cycle whether a branch diff touches a security surface,
// and which npm packages get `npm audit`.
//
// Two gates read the verdict: Gate 1 runs `npm audit` for the packages on the
// `audit:` line, Gate 2 step 0 launches /security-review in the background on
// `review`. The list of surfaces is scripts/security-scope.test.js, not this
// header and not any document. See
// docs/superpowers/specs/2026-11-17-security-process-design.md.
//
// Paths only, never the content: a regex over code cannot tell whether a page
// renders user data, so the whole frontend runtime counts.
//
// The reader fails closed, in the opposite direction from classify-cycle.mjs:
// any first line other than the literal `skip` means `review`, and an unreadable
// `audit:` line means both packages. A broken script never removes a check.

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { audienceOf } from './classify-cycle.mjs';

const API_MANIFESTS = new Set(['api/package.json', 'api/package-lock.json']);
const ROOT_MANIFESTS = new Set(['package.json', 'package-lock.json']);
const EXACT = new Set(['nginx.conf', 'api/Dockerfile', 'handbook/manifest.json', ...API_MANIFESTS, ...ROOT_MANIFESTS]);

function isSurface(path) {
  if (typeof path !== 'string') return false;
  if (EXACT.has(path)) return true;
  const atRoot = !path.includes('/');
  // Prefix, never substring: docs/api/src/x.md is a document.
  if (path.startsWith('api/src/')) return !path.endsWith('.test.js');
  if (path.startsWith('js/')) return path.endsWith('.js') && !path.endsWith('.test.js');
  // nginx serves only the root pages (scripts/nginx-serve.test.js).
  if (atRoot && path.endsWith('.html')) return true;
  if (atRoot && path.startsWith('docker-compose') && /\.ya?ml$/.test(path)) return true;
  return false;
}

function basename(path) {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * @param {string} z stdout of `git diff --name-status --find-renames -C -C -z`
 *   (record format: see classifyNameStatus in classify-cycle.mjs).
 * @returns {{ kind: 'review'|'skip', audit: string[], paths: string[] }}
 *   `audit` is a subset of ['api', '.'] in that order; `paths` are the paths
 *   that triggered `review`.
 */
export function classifySecurityScope(z) {
  const fields = String(z ?? '').split('\0').filter((f) => f !== '');
  const changed = [];
  const hits = new Set();
  const deleted = [];
  const added = [];

  for (let i = 0; i < fields.length; ) {
    const status = fields[i++];
    const take = /^[RC]/.test(status) ? 2 : 1;
    if (i + take > fields.length) {
      // A truncated stream could hide a surface: refuse to call it a skip.
      return { kind: 'review', audit: ['api', '.'], paths: [...hits] };
    }
    const record = fields.slice(i, i + take);
    i += take;
    // A document moved to another audience changes who may read it.
    if (take === 2 && audienceOf(record[0]) !== audienceOf(record[1])) record.forEach((p) => hits.add(p));
    if (status === 'D' || status === 'A') {
      const entry = { aud: audienceOf(record[0]) ?? 'outside', name: basename(record[0]), path: record[0] };
      (status === 'D' ? deleted : added).push(entry);
    }
    // With -C -C a copy's source is untouched: only its destination changed.
    changed.push(...(status.startsWith('C') ? [record[1]] : record));
  }

  for (const d of deleted) {
    for (const a of added) {
      if (a.aud !== d.aud && a.name === d.name) { hits.add(d.path); hits.add(a.path); }
    }
  }
  for (const p of changed) if (isSurface(p)) hits.add(p);

  const audit = [];
  if (changed.some((p) => API_MANIFESTS.has(p))) audit.push('api');
  if (changed.some((p) => ROOT_MANIFESTS.has(p))) audit.push('.');

  const paths = changed.filter((p) => hits.has(p)).filter((p, k, all) => all.indexOf(p) === k);
  return { kind: paths.length > 0 ? 'review' : 'skip', audit, paths };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
// First line `review` or `skip`, second line `audit: <packages>` or
// `audit: none`, then the triggering paths. Errors: stderr, non-zero exit,
// nothing on stdout.

export function main(argv = process.argv) {
  const range = argv[2] ?? 'main...HEAD';
  const z = execFileSync('git', ['diff', '--name-status', '--find-renames', '-C', '-C', '-z', range], {
    encoding: 'utf8',
    // Captured, as in classify-cycle.mjs, so git's own message is not printed twice.
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const { kind, audit, paths } = classifySecurityScope(z);
  process.stdout.write([kind, `audit: ${audit.length ? audit.join(' ') : 'none'}`, ...paths].join('\n') + '\n');
}

// Runs only as a program, never when a test imports the pure function.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (e) {
    process.stderr.write(`security-scope: ${e.stderr || e.message}\n`);
    process.exit(1);
  }
}
