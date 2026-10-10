// Guard: CLAUDE.md must not regrow, and no live document may point at a
// CLAUDE.md section that no longer exists.
//
// WHY THIS FILE EXISTS. CLAUDE.md is the only project document loaded in full
// at every session start, so its size is a cost paid per session, not per
// cycle. Phases 1+2 of the context-size split (merge 8b24f9c, 2026-10-08) took
// it from 115,196 B to 88,827 B. Two days later it was back at 91,694 B: +2,867 B
// across the three cycles in between, and the File structure block had drifted
// from ~11,300 to 12,563 LF bytes. One of those regressions was an 8-line entry added by the very
// session that had just been told the rule, and it was shrunk (39f2d8d) only
// because a human noticed. Phase 3 then moved another 32,972 B out. Nothing
// failed while any of that happened, which is the whole problem: the routing
// rule in .claude/skills/sync-docs/SKILL.md §2 was enforced by attention alone.
// Same shape as scripts/architecture-guard.test.js and scripts/classify-cycle.test.js
// -- the rule lives in a test, not in prose nobody re-reads.
//
// The pins are EXACT, not floors or ceilings. That is deliberate and comes from
// a measured mistake: js/lib/test-cases-parse.test.js first used a 797-case
// floor, and nine cases disappeared with the suite green. An exact pin fails in
// both directions, so shrinking the block is a decision somebody takes on
// purpose by lowering the number here, not something that happens quietly.
//
// WHAT IS DELIBERATELY NOT CHECKED, and why -- named limits, not gaps:
//   * The pointer regex only catches a name quoted right after "CLAUDE.md"
//     (optionally via 's / own / an arrow). It MISSES `CLAUDE.md, section "X"`,
//     `CLAUDE.md (section "X")`, and the 2nd and later names in a list such as
//     `CLAUDE.md's "A", "B" and "C"` — only "A" is checked. Widening it swept up
//     `CLAUDE.md`'s Pages table ... the "Purpose" column, a table column rather
//     than a section, so the narrow form is deliberate. `startsWith` also accepts
//     any heading with the cited name as a prefix.
//   * Scope is docs/ and .claude/ only. Pointers in TEST_CASES.md,
//     ARCHITECTURE.md, js/** comments and *.html are NOT checked (all were
//     verified clean by hand at 2026-10-10, but nothing keeps them that way).
//   * docs/superpowers/ is excluded from the pointer check. Specs, plans,
//     reports and audits are an immutable record of what was true when written;
//     they are supposed to name sections that have since moved or been renamed,
//     and rewriting them would destroy the record. (This cycle left ~60 such
//     references untouched on purpose.)
//   * The pointer check proves a named section EXISTS. It cannot judge whether
//     the pointer is apt -- a reference to the wrong-but-real section passes.
//   * The size checks cannot judge whether an entry's content BELONGS in the
//     block. They measure bytes and lines. A 2-line entry full of narrative
//     passes; §2 is still the rule, this is only its floor.
//   * The 13 over-length entries are pinned, NOT fixed. They predate phase 3
//     (auth.js and "HTML pages" run to 8 lines each) and rewriting them by hand
//     is the activity that produced six false claims in the PRD-split cycle, so
//     the debt is held visible and measured instead.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const read = p => readFileSync(join(ROOT, p), 'utf8');
const CLAUDE = read('CLAUDE.md');

// --- the File structure fenced block -------------------------------------
// Line endings: these files are CRLF in this working tree, but the git blobs are
// LF and `autocrlf` is per-machine, so a CI or Linux checkout sees LF. Split on
// either and measure in a normalised LF unit, otherwise the pins are off by one
// byte per line and the heading lookup silently finds nothing. Same convention as
// architecture-guard.test.js and classify-cycle.test.js.
const LINES = s => s.split(/\r?\n/);

function fileStructureBlock() {
  const lines = LINES(CLAUDE);
  const h = lines.findIndex(l => l.startsWith('### File structure'));
  expect(h, '### File structure heading').toBeGreaterThan(-1);
  const open = lines.findIndex((l, i) => i > h && l.startsWith('```'));
  const close = lines.findIndex((l, i) => i > open && l.startsWith('```'));
  expect(close, 'closing fence of the File structure block').toBeGreaterThan(open);
  return lines.slice(open + 1, close);
}

// An entry starts at a block line with no leading whitespace; its continuation
// lines are indented.
function entries(block) {
  const out = [];
  let cur = null;
  for (const l of block) {
    if (l && !l.startsWith(' ')) {
      if (cur) out.push(cur);
      cur = [l];
    } else if (cur) {
      cur.push(l);
    }
  }
  if (cur) out.push(cur);
  return out;
}

describe('CLAUDE.md size (it is loaded in full every session)', () => {
  it('stays at or under 64,000 B (a ceiling, not an exact pin)', () => {
    // Measured in LF bytes so the figure does not depend on the checkout's line
    // endings. The ceiling was NOT raised when the C1 review finding put 3,345 B
    // of testing/tooling rules back into the file: raising a limit to fit content
    // is precisely what sync-docs §2 forbids. Headroom is therefore ~2 cycles of
    // ordinary growth, not the ~5 KB originally planned.
    const bytes = Buffer.byteLength(LINES(CLAUDE).join('\n'), 'utf8');
    expect(bytes, `CLAUDE.md is ${bytes} B. Move narrative out to its docs/ file per
      .claude/skills/sync-docs/SKILL.md §2 -- do not raise this ceiling to fit it`)
      .toBeLessThanOrEqual(64_000);
  });

  it('keeps the File structure block at exactly 12,538 LF bytes', () => {
    const bytes = Buffer.byteLength(fileStructureBlock().join('\n'), 'utf8');
    expect(bytes, `the File structure block is ${bytes} LF bytes, pinned at 12,538. It is an INDEX:
      one or two lines per entry, pointing at the docs/ file that holds the narrative.
      If you shrank it on purpose, lower this number in the same commit`)
      .toBe(12_538);
  });

  it('keeps exactly 13 entries longer than two lines', () => {
    // Pre-existing debt, pinned so a 14th cannot be added quietly.
    const long = entries(fileStructureBlock()).filter(e => e.length > 2);
    const names = long.map(e => e[0].split('—')[0].trim());
    expect(long.length, `${long.length} entries exceed two lines: ${names.join(', ')}.
      §2 allows one or two. The 13 known ones are pre-existing debt; a new one is a
      regression -- move its text to the entry's docs/ file instead`).toBe(13);
  });
});

describe('CLAUDE.md pointers resolve', () => {
  it('every docs/ path it cites exists on disk', () => {
    const cited = [...CLAUDE.matchAll(/docs\/[A-Za-z0-9._\-/]+\.(?:md|html)/g)]
      .map(m => m[0]);
    expect(cited.length, 'CLAUDE.md should cite docs/ files').toBeGreaterThan(20);
    const missing = [...new Set(cited)].filter(p => !existsSync(join(ROOT, p)));
    expect(missing, `CLAUDE.md cites docs/ files that do not exist: ${missing.join(', ')}`)
      .toEqual([]);
  });

  it('every internal #anchor link resolves to one of its own headings', () => {
    const slug = s => s.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
    const headings = [...CLAUDE.matchAll(/^#{2,4} (.+)$/gm)].map(m => slug(m[1]));
    const anchors = [...CLAUDE.matchAll(/\]\(#([A-Za-z0-9-]+)\)/g)].map(m => m[1]);
    const dangling = anchors.filter(a => !headings.includes(a));
    expect(dangling, `CLAUDE.md has internal links to anchors it does not define: ${dangling.join(', ')}`)
      .toEqual([]);
  });
});

// --- live documents must not name a section CLAUDE.md no longer has -------
const SKIP_DIRS = new Set([
  'docs/superpowers',    // immutable record -- see the header
  '.claude/worktrees',   // other branches' checkouts: their docs belong to THEIR
                         // CLAUDE.md, not this one. Without this, running the
                         // suite on main scans every live worktree, and a branch
                         // cut before this cycle (still naming "Filter bar") turns
                         // main's npm test red for a reason that is not main's.
]);

function liveMarkdown(dir, acc = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (SKIP_DIRS.has(rel)) continue;
    if (statSync(join(ROOT, rel)).isDirectory()) liveMarkdown(rel, acc);
    else if (name.endsWith('.md')) acc.push(rel);
  }
  return acc;
}

describe('live documents do not point at a CLAUDE.md section that is gone', () => {
  // Named targets in CLAUDE.md: its headings, plus the bold labels it uses for
  // blocks that are not headings ("Infrastructure safety ...", which several
  // files cite by name and which must never become a heading-only check).
  const targets = [
    ...[...CLAUDE.matchAll(/^#{2,4} (.+)$/gm)].map(m => m[1].trim()),
    ...[...CLAUDE.matchAll(/\*\*([^*]{3,120})\*\*/g)].map(m => m[1].trim()),
  ];
  // .claude/ is included as well as docs/: finish-cycle.md and the sync-docs
  // skill cite CLAUDE.md sections by name, and an agent executes those files.
  const files = [...liveMarkdown('docs'), ...liveMarkdown('.claude')];

  it('scans a non-trivial set of live files', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it.each(files)('%s', rel => {
    const text = read(rel);
    // A pointer is "CLAUDE.md" immediately followed by a quoted name, allowing
    // only the connectives actually used in this repo: an optional closing
    // backtick, a possessive, " own", and an arrow. Near-adjacency is the point:
    // a wider window swept up `CLAUDE.md`'s Pages table ... the "Purpose" column,
    // which names a table column, not a section.
    const claimed = [...text.matchAll(
      /CLAUDE\.md`?(?:'s|’s)?(?: own)?(?: ?(?:→|->))?[ \t]{0,2}"([^"\n]{3,120})"/g)]
      .map(m => m[1].trim());
    const dangling = claimed.filter(
      name => !targets.some(t => t === name || t.startsWith(name)));
    expect(dangling, `${rel} points at CLAUDE.md section(s) that no longer exist: ${
      dangling.join(' | ')} -- re-point them at the docs/ file the text moved to`)
      .toEqual([]);
  });
});
