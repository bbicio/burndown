// The set of "live" Markdown documents, shared by the guards that scan them.
//
// WHY THIS MODULE EXISTS. Two guards walk the same documents for different
// reasons -- claude-md-guard.test.js looks for pointers at named CLAUDE.md
// sections, doc-paths-guard.test.js looks for cited file paths. A second
// definition of "which documents are live" would let the two drift apart
// silently, which is the class of defect those guards exist to catch.

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Repository root, resolved from this file's location (scripts/lib/). */
export const ROOT = join(import.meta.dirname, '..', '..');

export const SKIP_DIRS = new Set([
  'docs/superpowers',    // immutable record -- specs, plans, reports and audits
                         // are supposed to name things that have since moved.
  '.claude/worktrees',   // other branches' checkouts: their docs belong to THEIR
                         // CLAUDE.md, not this one. Without this, running the
                         // suite on main scans every live worktree, and a branch
                         // cut before this cycle (still naming "Filter bar") turns
                         // main's npm test red for a reason that is not main's.
]);

// A cited path is "rooted" when its first segment is a real top-level
// directory of this repository. The documents also cite shorthand forms
// (`routes/projects.js`, `middleware/auth.js`, `services/llm.js`) that are
// abbreviations rather than resolvable paths; resolving those would mean
// guessing a base directory, which is a judgment about content.
const ROOTED = /^(?:docs|js|css|api|scripts|backups|\.claude)\//;
const EXT = 'md|html|js|mjs|css|sql|sh|json|png';
// Both anchors are deliberately tight: a closing backtick, or `](` ... `)`,
// immediately after the extension. See this module's consumers for the two
// citation forms this therefore does not match.
const FORMS = [
  new RegExp('`([A-Za-z0-9._/-]+\\.(?:' + EXT + '))`', 'g'),
  new RegExp('\\]\\(([A-Za-z0-9._/-]+\\.(?:' + EXT + '))\\)', 'g'),
];

/** The distinct repo-rooted file paths cited in `text`, in both forms. */
export function citedPaths(text) {
  const out = new Set();
  for (const re of FORMS)
    for (const m of text.matchAll(re)) if (ROOTED.test(m[1])) out.add(m[1]);
  return [...out];
}

/**
 * The cited paths that neither resolve nor are allowlisted, each rendered with
 * the documents citing it. `exists` is injected so the rule can be tested
 * without a filesystem -- the composition here is the whole guard, so leaving
 * it inline in a test would leave it unpinned.
 *
 * @param {Map<string,string[]>} citations path -> documents citing it
 * @param {Map<string,string>} gone allowlist: path -> why it does not resolve
 * @param {(path: string) => boolean} exists
 */
export function unresolved(citations, gone, exists) {
  return [...citations]
    .filter(([p]) => !gone.has(p) && !exists(p))
    .map(([p, by]) => `${p} (cited by ${by.join(', ')})`);
}

/** Repo-relative paths of every `.md` file under `dir`, recursively. */
export function liveMarkdown(dir, acc = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (SKIP_DIRS.has(rel)) continue;
    if (statSync(join(ROOT, rel)).isDirectory()) liveMarkdown(rel, acc);
    else if (name.endsWith('.md')) acc.push(rel);
  }
  return acc;
}
