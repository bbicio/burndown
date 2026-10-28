// Classifies Gate 5's uncommitted diff for /finish-cycle: is it "docs-only"?
//
// Two decisions of Gate 5 read this verdict: step 3 runs the doc-reading test
// subset instead of the full suite, and steps 5-6 may commit and push without
// asking under the Gate 4 pre-authorisation. Both are granted ONLY on the
// literal token `docs-only`. See
// docs/superpowers/specs/2026-10-28-finish-cycle-gate5-lighter-design.md.
//
// A diff is docs-only when it is non-empty and every path ends in .md or is
// GATE5_TEST_FILE. Any other path — scripts/claude-md-guard.test.js, an .html,
// a stray untracked log — makes it `other`, and Gate 5 asks as before.
//
// The subset is safe only if no other js/**/*.test.js reads a .md file; the guard
// in gate5-scope.test.js (mdReadingTests) keeps that true. Its limit: it sees
// string literals, not a path built at runtime.

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** The one non-.md path a Gate 5 diff may touch and stay docs-only. */
export const GATE5_TEST_FILE = 'js/lib/test-cases-parse.test.js';

/**
 * @param {string} stdout of `git status --porcelain=v1 -z --untracked-files=all`:
 *   `XY path\0` per entry; for a rename or copy (R/C in X or Y) the next
 *   NUL-field is the original path. Paths are never quoted under -z.
 * @returns {string[]} every path, both paths of a rename.
 */
export function parsePorcelainZ(stdout) {
  const fields = String(stdout ?? '').split('\0').filter((f) => f !== '');
  const paths = [];
  for (let i = 0; i < fields.length; i++) {
    const rec = fields[i];
    paths.push(rec.slice(3));
    if (/[RC]/.test(rec.slice(0, 2)) && i + 1 < fields.length) paths.push(fields[++i]);
  }
  return paths;
}

/**
 * @param {string[]} paths
 * @returns {'docs-only'|'other'}
 */
export function classifyGate5(paths) {
  // An empty diff must not qualify vacuously.
  return paths.length > 0 && paths.every((p) => p.endsWith('.md') || p === GATE5_TEST_FILE)
    ? 'docs-only'
    : 'other';
}

/**
 * @param {{ name: string, text: string }[]} files js/**/*.test.js contents
 * @returns {string[]} names, other than GATE5_TEST_FILE, that look like they read a .md file
 */
export function mdReadingTests(files) {
  return files
    .filter((f) => f.name !== GATE5_TEST_FILE)
    .filter((f) => /\.md['"`]/.test(f.text) || f.text.includes('live-docs'))
    .map((f) => f.name);
}

// ── CLI ─────────────────────────────────────────────────────────────────────
// Contract: first stdout line `docs-only` or `other`, the judged paths follow
// one per line, exit 0. A git error goes to stderr with exit 1, and the gate
// treats that as `other`.

export function main() {
  const opts = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], opts).trim();
  const z = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { ...opts, cwd: root });
  const paths = parsePorcelainZ(z);
  process.stdout.write([classifyGate5(paths), ...paths].join('\n') + '\n');
}

// Runs only as a program, never when a test imports the pure functions.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (e) {
    // Nothing on stdout: a half-written first line could read as a verdict.
    process.stderr.write(`gate5-scope: ${e.stderr || e.message}\n`);
    process.exit(1);
  }
}
