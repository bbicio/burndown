// Guard: every file path a live document cites must resolve on disk.
//
// WHY THIS FILE EXISTS. The 2026-10-12 cold-review audit (finding F4 and its
// addendum) measured that cited file paths were guarded by nothing:
// claude-md-guard.test.js only looks for pointers at named CLAUDE.md
// *sections*, and architecture-guard.test.js checks no citations at all. The
// addendum found what was hiding there -- four sentences still asserting, in
// the present tense, that js/config-form.js and js/dashboard.js existed, three
// months after 2d4446f deleted them. Same shape as the other two guards: the
// rule lives in a test, not in prose nobody re-reads.
//
// WHAT THIS GUARD IS WORTH, stated exactly. Its value is AT THE MOMENT OF
// DELETION. Had it existed, 2d4446f would have turned it red and forced that
// author either to re-point the mentions or to allowlist the file -- which is
// what would have surfaced those four sentences in 2026-07. It does NOT
// re-detect a tense error on a file already in GONE, and it does not know
// whether a path that resolves is the RIGHT path.
//
// WHAT IS DELIBERATELY NOT CHECKED, and why -- named limits, not gaps:
//   * A path carrying a :line suffix (`js/core.js:264-272`, a form the docs
//     really use) and a path soft-wrapped across two lines inside backticks.
//     Both anchors are tight on purpose; both limits are pinned by a unit test
//     below, so nobody later assumes coverage that is not there.
//   * Shorthand citations that are not repo-rooted -- `routes/projects.js`,
//     `middleware/auth.js`, `services/llm.js`, `lib/assistant-chat.js`,
//     `sync-docs/SKILL.md`. They abbreviate real files; resolving them would
//     mean guessing a base directory, which is a judgment about content.
//   * CASE. existsSync is case-insensitive on Windows and case-sensitive on a
//     Linux checkout, so a casing-only typo passes here and fails there. Not
//     cheaply fixable; named so it is not mistaken for coverage.
//   * Whether a citation is APT. This tests existence, never content -- that
//     boundary is what keeps the guard mechanical.
//   * Scope is the walk in scripts/lib/live-docs.mjs (docs/ + .claude/, minus
//     docs/superpowers and .claude/worktrees) plus the four root documents.
//     docs/superpowers is excluded for the reason given there: specs, plans,
//     reports and audits are an immutable record and are SUPPOSED to name
//     things that have since been deleted.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, liveMarkdown, citedPaths } from './lib/live-docs.mjs';

// Paths the live documents cite that deliberately do not resolve. Eight are
// files that were deleted and are now mentioned only in the past tense; two
// never existed. Each entry is a decision somebody took on purpose -- adding
// one is how you record "this file is gone and its mentions are historical".
const GONE = new Map([
  ['js/config-form.js',          'deleted 2d4446f (2026-07-27); only historical mentions remain'],
  ['js/dashboard.js',            'deleted 2d4446f (2026-07-27); only historical mentions remain'],
  ['js/main.js',                 'deleted 2d4446f (2026-07-27)'],
  ['js/ai.js',                   'deleted 70082a5 (Cycle B, personal-API-key removal)'],
  ['docs/js/ai.md',              'deleted with js/ai.js in the same cycle'],
  ['js/pipeline-board.js',       'deleted 5a5cef5 (pipeline.html Vue migration)'],
  ['js/planning.js',             'deleted aed9679 (folded into planning.html)'],
  ['js/settings.js',             'deleted d79b6aa (Settings page cycle)'],
  ['docs/OPERATIONAL_MANUAL.md', 'an OUTPUT path of the operational-manual skill, not a citation'],
  ['scripts/gen-architecture.mjs',
    'never existed: cited only inside docs/handoff-ciclo5.md, in the quoted ' +
    'cycle-5 proposal that was rejected in favour of architecture-guard.test.js'],
]);

const DOCS = [
  ...liveMarkdown('docs'), ...liveMarkdown('.claude'),
  'CLAUDE.md', 'ARCHITECTURE.md', 'PRD.md', 'TEST_CASES.md',
];

/** path -> the documents citing it, so a failure can name both. */
function citations() {
  const out = new Map();
  for (const rel of DOCS)
    for (const p of citedPaths(readFileSync(join(ROOT, rel), 'utf8'))) {
      if (!out.has(p)) out.set(p, []);
      out.get(p).push(rel);
    }
  return out;
}

describe('every file path the live documents cite resolves', () => {
  it('scans a non-trivial set of documents and citations', () => {
    // Floors, not pins: without them a walk that silently reaches nothing
    // would make every assertion below vacuously green. Measured 2026-10-12:
    // 70 documents, 261 distinct rooted citations.
    expect(DOCS.length, 'documents scanned').toBeGreaterThan(40);
    expect(citations().size, 'distinct rooted citations').toBeGreaterThan(150);
  });

  it('every cited rooted path exists, unless allowlisted as GONE', () => {
    const missing = [...citations()]
      .filter(([p]) => !GONE.has(p) && !existsSync(join(ROOT, p)))
      .map(([p, by]) => `${p} (cited by ${by.join(', ')})`);
    expect(missing, `fix the path, or -- if the file is genuinely gone and the
      mentions are historical -- add it to GONE with its deletion commit`)
      .toEqual([]);
  });

  it('no GONE entry names a path that exists again', () => {
    // A recreated file must not keep a stale allowlist entry: it would
    // silently permit a future typo on that exact path.
    const back = [...GONE.keys()].filter(p => existsSync(join(ROOT, p)));
    expect(back, 'these paths exist again -- remove them from GONE').toEqual([]);
  });
});

describe('citedPaths', () => {
  it('finds a backticked rooted path', () =>
    expect(citedPaths('see `docs/ops/database.md` for this')).toEqual(['docs/ops/database.md']));

  it('finds a markdown-link path', () =>
    expect(citedPaths('[db](docs/ops/database.md)')).toEqual(['docs/ops/database.md']));

  it('de-duplicates', () =>
    expect(citedPaths('`js/core.js` and `js/core.js`')).toEqual(['js/core.js']));

  it('ignores a path that is not repo-rooted', () =>
    expect(citedPaths('`routes/projects.js` is shorthand')).toEqual([]));

  it('ignores a bare filename and a directory', () =>
    expect(citedPaths('`CLAUDE.md` and `docs/prd/`')).toEqual([]));

  it('ignores an unknown extension', () =>
    expect(citedPaths('`docs/notes.txt`')).toEqual([]));

  // KNOWN LIMITS, pinned so no reader assumes coverage. See the header.
  it('does NOT match a path carrying a :line suffix', () =>
    expect(citedPaths('`js/core.js:264-272` resolves the rate')).toEqual([]));

  it('does NOT match a path soft-wrapped across two lines', () =>
    expect(citedPaths('see `docs/ops/\ndatabase.md`')).toEqual([]));
});
