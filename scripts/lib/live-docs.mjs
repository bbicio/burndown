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
