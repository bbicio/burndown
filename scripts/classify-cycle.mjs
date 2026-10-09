// Classifies the current cycle for Gate 2 of /finish-cycle: is the branch diff
// a "no-code cycle" — one containing no file the running app loads or executes?
//
// The rule used to live as ~540 words of English inside the gate itself. It is
// code here because that prose produced 21 code-review findings across three
// rounds and every one of them was about how to express a mechanical rule in
// English, never about what the rule should do. See
// docs/superpowers/specs/2026-10-09-classify-cycle-script-design.md.
//
// A path qualifies when it is a .md file under .claude/, a .md file under
// docs/, or a root-level .md — and is not a named exception.
//
// Why each guard exists (this is the rationale the gate no longer carries):
//
//   * .md under docs/, not everything under docs/ — docker-compose.yml mounts
//     the whole repo root into nginx and its `location /` serves it, so
//     docs/** is reachable over HTTP. 66 tracked files under docs/ are not
//     Markdown, and one of them, docs/OPERATIONAL_MANUAL.html, can only be
//     verified in a browser. A cycle regenerating it must never be told there
//     is nothing to verify there.
//
//   * .md under .claude/, not everything under .claude/ — git tracks only .md
//     there today, but that is the ONLY thing protecting this rule, not
//     .gitignore, which covers just .claude/settings.local.json.
//     .claude/settings.json — the shared file holding hooks, permissions and
//     env vars, which this project's own update-config skill exists to write —
//     is fully trackable and merely absent. A hook runs on every tool call of
//     every later session, so a cycle adding one is never a no-code cycle.
//
//   * Named exceptions — a root .md the running app fetches at runtime is code
//     for this purpose, because changing it changes what a page renders. The
//     list below is the single place to add one, and the cycle that introduces
//     such a fetch is the cycle that must add it.

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/**
 * Root-level .md files the running app loads at runtime, which therefore count
 * as code. Empty today: nothing fetches a .md yet (test-cases.html inlines its
 * data). The planned test-cases.html <- TEST_CASES.md cycle must add
 * 'TEST_CASES.md' here, in that same cycle.
 */
export const RUNTIME_LOADED_ROOT_MD = [];

/**
 * @param {string} z stdout of `git diff --name-status --find-renames -z`:
 *   NUL-separated fields, `M\0path\0` per change, `R100\0old\0new\0` per
 *   rename (the status token carries the similarity index).
 * @param {string[]} exceptions root .md files that count as code.
 * @returns {{ kind: 'no-code'|'ordinary', paths: string[] }}
 */
export function classifyNameStatus(z, exceptions = RUNTIME_LOADED_ROOT_MD) {
  const fields = String(z ?? '').split('\0').filter((f) => f !== '');
  const paths = [];

  for (let i = 0; i < fields.length; ) {
    const status = fields[i++];
    // A rename or copy record carries two paths; everything else carries one.
    const take = /^[RC]/.test(status) ? 2 : 1;
    if (i + take > fields.length) {
      // A status token with no path left is a truncated stream, and dropping it
      // is the one way this function can fabricate a `no-code`: the paths that
      // belonged to it would simply be missing from the verdict. Refuse instead.
      return { kind: 'ordinary', paths };
    }
    for (let n = 0; n < take; n++) paths.push(fields[i++]);
  }

  // An empty diff must not qualify vacuously: "every path qualifies" is true of
  // no paths at all. Pre-flight check 3 only guarantees that commits exist, not
  // that the diff is non-empty — a change plus its revert has both.
  const kind = paths.length > 0 && paths.every((p) => qualifies(p, exceptions))
    ? 'no-code'
    : 'ordinary';

  return { kind, paths };
}

function qualifies(path, exceptions) {
  if (typeof path !== 'string' || !path.endsWith('.md')) return false;
  if (exceptions.includes(path)) return false;
  // Prefix, never substring: api/docs/helper.md contains "docs/" but is a file
  // under api/, so it is code.
  return path.startsWith('.claude/') || path.startsWith('docs/') || !path.includes('/');
}

// ── CLI ─────────────────────────────────────────────────────────────────────
// The contract Gate 2 depends on: the first stdout line is `no-code` or
// `ordinary`, the paths follow one per line, errors go to stderr and the exit
// code is non-zero. The gate grants the no-code branch ONLY on the literal
// token `no-code`, so every failure mode here — a throw, an empty stdout, a
// missing file — lands on "ordinary cycle" without needing a rule of its own.

export function main(argv = process.argv) {
  const range = argv[2] ?? 'main...HEAD';
  const z = execFileSync('git', ['diff', '--name-status', '--find-renames', '-z', range], {
    encoding: 'utf8',
    // Capture the child's stderr instead of letting it through: execFileSync
    // forwards it to the parent even with the default 'pipe', so git's own
    // message would be printed raw and again inside the wrapper below — and
    // outside a repository git implies --no-index and dumps its whole option
    // list, which made the end of a green `npm test` read like a crash.
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const { kind, paths } = classifyNameStatus(z);
  process.stdout.write([kind, ...paths].join('\n') + '\n');
}

// Runs only as a program, never when a test imports the pure function.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (e) {
    // Nothing on stdout: a half-written first line could read as a verdict.
    process.stderr.write(`classify-cycle: ${e.stderr || e.message}\n`);
    process.exit(1);
  }
}
