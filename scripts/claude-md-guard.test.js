// Guard: CLAUDE.md must not regrow, and no live document may point at a
// CLAUDE.md section that no longer exists.
//
// WHY THIS FILE EXISTS. CLAUDE.md is the only project document loaded in full
// at every session start, so its size is a cost paid per session, not per
// cycle. Phases 1+2 of the context-size split (merge 8b24f9c, 2026-10-08) took
// it from 115,196 B to 88,827 B. Two days later it was back at 91,694 B: +2,867 B
// across the three cycles in between. Those three historical figures are CRLF
// byte counts, as originally measured; the pins below are LF, so they are not
// directly comparable (91,694 CRLF is 91,147 LF at 8580c3f). The File structure
// block had drifted from ~11,300 to 12,563 LF bytes over the same window.
// One of those regressions was an 8-line entry added by the very
// session that had just been told the rule, and it was shrunk (39f2d8d) only
// because a human noticed. Phase 3 then moved another 32,972 B out. Nothing
// failed while any of that happened, which is the whole problem: the routing
// rule in .claude/skills/sync-docs/SKILL.md §2 was enforced by attention alone.
// Same shape as scripts/architecture-guard.test.js and scripts/classify-cycle.test.js
// -- the rule lives in a test, not in prose nobody re-reads.
//
// The block-size and entry-count pins are EXACT, not floors; only the total-size
// check is a ceiling, for the reason given at that test. Exactness is deliberate
// and comes from a measured mistake: js/lib/test-cases-parse.test.js first used a
// 797-case floor, and nine cases disappeared with the suite green. An exact pin
// fails in both directions, so shrinking the block is a decision somebody takes
// on purpose by lowering the number here, not something that happens quietly.
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
//   * The 12 over-length entries are pinned, NOT fixed. They predate phase 3
//     (auth.js and "HTML pages" among them) and rewriting them by hand
//     is the activity that produced six false claims in the PRD-split cycle, so
//     the debt is held visible and measured instead.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, liveMarkdown } from './lib/live-docs.mjs';

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
    // is precisely what sync-docs §2 forbids. Headroom was then ~2 cycles of
    // ordinary growth, not the ~5 KB originally planned.
    // 2026-10-12, approval-economy cycle: the file ended at 63,585 B, so
    // headroom is 415 B -- LESS THAN HALF ONE cycle of the +955 B/cycle
    // measured above. (This comment first said 63,488 / ~500 B, measured at
    // the commit that wrote it rather than at the end of the cycle, which
    // then added 97 B more. Re-measure at HEAD, last, after every edit.) The
    // next /sync-docs that adds an index line can turn this red, and Gate 5
    // runs npm test AFTER the merge, so that red lands on main. Reshaping the
    // ceiling (the ~20 KB of irreducible index here is summed with ~43 KB of
    // narrative, so index growth squeezes narrative) is an open backlog item.
    // Until it is done, a cycle adding a file should expect to move content out
    // in the same commit. Do not raise this number to make room.
    const bytes = Buffer.byteLength(LINES(CLAUDE).join('\n'), 'utf8');
    expect(bytes, `CLAUDE.md is ${bytes} B. Move narrative out to its docs/ file per
      .claude/skills/sync-docs/SKILL.md §2 -- do not raise this ceiling to fit it`)
      .toBeLessThanOrEqual(64_000);
  });

  it('keeps the File structure block at exactly 12,914 LF bytes', () => {
    // 12,538 at the phase-3 merge; raised to 12,758 by the same /sync-docs run,
    // for this file's own 2-line index entry. That is the allowed kind of growth
    // -- a new file needs an index line -- and it is why the pin is exact rather
    // than a ceiling: raising it is a visible decision, not a silent drift.
    // 13,156 on 2026-10-12, for doc-paths-guard.test.js and lib/live-docs.mjs.
    // 13,399 later the same day: +243 B in three parts, measured, not
    // estimated -- 218 B for decision-ledger-guard.test.js's own two-line index
    // entry; 6 B correcting the backup-db.sh entry, which still said the Gate 4
    // snapshot runs "right after merge" after that cycle made it conditional;
    // 19 B rewriting the lib/live-docs.mjs entry, whose "the two guards above"
    // had become ambiguous once a fourth guard was listed. All three are the
    // allowed kind of growth -- a new file needs an index line, and a false
    // sentence has to be fixed where it is.
    // That raise is also the first thing Gate 5's new `npm test` ever caught:
    // before it existed, /sync-docs edited CLAUDE.md and this pin in the same
    // unverified commit and pushed (3edd128).
    // 13,398 on 2026-10-14 (M1): the decision-ledger-guard entry reworded to
    // name its Brief started check, -1 B.
    // 12,914 on 2026-10-21: dates and justifications cut by hand from five
    // entries (HTML pages, js/costgrid.js, js/lib/, pipeline-years.js, auth.js).
    const bytes = Buffer.byteLength(fileStructureBlock().join('\n'), 'utf8');
    expect(bytes, `the File structure block is ${bytes} LF bytes, pinned at 12,914. It is an INDEX:
      one or two lines per entry, pointing at the docs/ file that holds the narrative.
      If you shrank it on purpose, lower this number in the same commit`)
      .toBe(12_914);
  });

  it('keeps exactly 12 entries longer than two lines', () => {
    // Pre-existing debt, pinned so a new one cannot be added quietly.
    // 12 on 2026-10-21: js/costgrid.js shrank to two lines.
    const long = entries(fileStructureBlock()).filter(e => e.length > 2);
    const names = long.map(e => e[0].split('—')[0].trim());
    expect(long.length, `${long.length} entries exceed two lines: ${names.join(', ')}.
      §2 allows one or two. The 12 known ones are pre-existing debt; a new one is a
      regression -- move its text to the entry's docs/ file instead`).toBe(12);
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
// The walk itself (and the two reasons for its skip list) lives in
// scripts/lib/live-docs.mjs, shared with scripts/doc-paths-guard.test.js.

describe('live documents do not point at a CLAUDE.md section that is gone', () => {
  // Named targets in CLAUDE.md: its headings, plus an explicit allowlist of the
  // bold blocks that are cited as if they were sections and are not headings.
  // The allowlist used to be the whole bold class -- every **span** in the file.
  // That admitted 69 targets where one was wanted (measured at ef9c2bf). The
  // 2026-10-12 cold review, finding F6, counted 65 at c3354d8 -- five commits
  // to CLAUDE.md over the following day took it to 69, headings unchanged at
  // 25. That a target set grows by four in a day, from edits that touch no
  // section structure, is itself the argument against using the bold class as
  // one. So a pointer naming "Snapshot before touching it." resolved while
  // naming no section.
  // Measured before narrowing: of the 13 live pointers, 11 resolve on a heading
  // and 2 resolve only here, and both are Infrastructure safety -- the one case
  // the class was ever there to cover. Matching stays prefix-based below, so the
  // entry is the start of that block's bold label, not the whole sentence.
  const BOLD_BLOCK_TARGETS = ['Infrastructure safety'];
  // One definition of "a pointer", shared by the file scan below and by the
  // allowlist-minimality test. Two copies could drift, which is the defect
  // class these guards exist to catch.
  const POINTER =
    /CLAUDE\.md`?(?:'s|’s)?(?: own)?(?: ?(?:→|->))?[ \t]{0,2}"([^"\n]{3,120})"/g;
  const targets = [
    ...[...CLAUDE.matchAll(/^#{2,4} (.+)$/gm)].map(m => m[1].trim()),
    ...BOLD_BLOCK_TARGETS,
  ];
  // .claude/ is included as well as docs/: finish-cycle.md and the sync-docs
  // skill cite CLAUDE.md sections by name, and an agent executes those files.
  const files = [...liveMarkdown('docs'), ...liveMarkdown('.claude')];

  it('scans a non-trivial set of live files', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  // What the 2026-10-13 narrowing bought, demonstrated rather than asserted in
  // a comment (brief 2026-10-12-guard-matcher-precision, criterion 4). Before
  // it, every bold span was a target, so a pointer could name any of these and
  // resolve while naming no section at all. The case is DERIVED from the file,
  // not hardcoded: a hardcoded string would silently stop proving anything the
  // day CLAUDE.md stopped containing it.
  //
  // What this test does and does not reach, measured rather than assumed. It
  // catches a WIDENING of `targets` -- restore the whole bold class and it goes
  // red on 68 spans, among them ones as meaningless as "not", "all" and "API".
  // It cannot catch BLOAT of the allowlist: `vacuous` excludes whatever
  // BOLD_BLOCK_TARGETS contains, so adding junk entries keeps it green. That
  // hole is closed by the next test, not by this one.
  it('rejects a bold span that is neither a heading nor allowlisted', () => {
    const resolves = (name) => targets.some(t => t === name || t.startsWith(name));
    const headings = [...CLAUDE.matchAll(/^#{2,4} (.+)$/gm)].map(m => m[1].trim());
    const covered = (list, s) => list.some(x => x === s || x.startsWith(s));
    const vacuous = [...CLAUDE.matchAll(/\*\*([^*]{3,120})\*\*/g)]
      .map(m => m[1].trim())
      .filter(s => !covered(headings, s) && !covered(BOLD_BLOCK_TARGETS, s));

    expect(vacuous.length,
      'CLAUDE.md has no bold span outside its headings and the allowlist, so this test proves nothing -- check whether the narrowing is still needed')
      .toBeGreaterThan(0);
    expect(vacuous.filter(resolves),
      `these bold spans are accepted as pointer targets but name no CLAUDE.md section: ${vacuous.filter(resolves).join(' | ')}`)
      .toEqual([]);
  });

  // The allowlist is the one hand-maintained part of the target set, so it is
  // the one part that can rot. Every entry must earn its place: a heading entry
  // would be redundant (headings are already targets), and an entry nothing
  // cites is dead weight that only widens what resolves. This is what stops the
  // allowlist from drifting back towards the bold class it replaced.
  it('every allowlist entry is a non-heading that some live document cites', () => {
    const headings = [...CLAUDE.matchAll(/^#{2,4} (.+)$/gm)].map(m => m[1].trim());
    const cited = files.flatMap(rel => [...read(rel).matchAll(POINTER)].map(m => m[1].trim()));

    for (const entry of BOLD_BLOCK_TARGETS) {
      expect(headings.some(h => h === entry || h.startsWith(entry)),
        `"${entry}" is already reachable as a heading -- drop it from BOLD_BLOCK_TARGETS`)
        .toBe(false);
      expect(cited.some(c => entry === c || entry.startsWith(c)),
        `no live document cites "${entry}" -- an allowlist entry nothing cites only widens what resolves`)
        .toBe(true);
    }
  });

  it.each(files)('%s', rel => {
    const text = read(rel);
    // A pointer is "CLAUDE.md" immediately followed by a quoted name, allowing
    // only the connectives actually used in this repo: an optional closing
    // backtick, a possessive, " own", and an arrow. Near-adjacency is the point:
    // a wider window swept up `CLAUDE.md`'s Pages table ... the "Purpose" column,
    // which names a table column, not a section.
    const claimed = [...text.matchAll(POINTER)].map(m => m[1].trim());
    const dangling = claimed.filter(
      name => !targets.some(t => t === name || t.startsWith(name)));
    expect(dangling, `${rel} points at CLAUDE.md section(s) that no longer exist: ${
      dangling.join(' | ')} -- re-point them at the docs/ file the text moved to`)
      .toEqual([]);
  });
});
