// Guard: every new spec and plan carries a decision ledger.
//
// WHY THIS FILE EXISTS. PROCESS.md §6b replaced the cycle's ratification
// gates -- "do you approve this document?" -- with a ledger: the artefact
// names the decisions that could have gone another way, and with none it says
// so and the cycle proceeds without waiting. That trade only holds if the
// ledger is actually there. Without a guard, the first cycle in a hurry drops
// the section, the gate silently reverts to "approve?" with nothing to read,
// and nothing turns red. Same shape as scripts/architecture-guard.test.js,
// scripts/claude-md-guard.test.js and scripts/doc-paths-guard.test.js -- the
// rule lives in a test, not in prose nobody re-reads.
//
// WHAT IS DELIBERATELY NOT CHECKED, and why -- named limits, not gaps:
//   * WHETHER THE LEDGER IS COMPLETE. This is the big one. Two impeccable
//     entries where the cycle really took five decisions passes every
//     assertion here, and nothing mechanical can see it. Checking that would
//     mean judging the content, which PROCESS.md §6.4c forbids elsewhere for
//     exactly the same reason (see also §6b(d): a guard may require the
//     artefact to CARRY the information, never judge whether it is correct).
//     The only safeguards against an under-reported ledger are that it is
//     committed and that the Plan re-reads the Spec.
//   * WHETHER AN ENTRY IS TRUE, or whether its "Alternativa scartata" was a
//     real alternative. Form only.
//   * Files dated before the cutoff. The rule starts at this cycle; there is
//     no retroactive sweep, by design.
//   * Documents outside docs/superpowers/{specs,plans}. Briefs, audits,
//     reports and design handoffs are not decision artefacts in §6b's sense.
//   * SUBDIRECTORIES of those two are not walked -- only files directly in
//     them. docs/superpowers/plans/2026-10-05-master-data-split/ already
//     exists; it holds no .md, so nothing is missed today, but a future
//     multi-file plan directory dated after the cutoff would be silently
//     exempt. Found by the 2026-10-12 review of this file's own branch.
//   * The heading must match `## Decisioni aperte` exactly but for trailing
//     whitespace: one space between the words, no suffix. `## Decisioni aperte (3)` and a two-space variant both read
//     as missing. Entries must be `N. `-numbered; `- ` bullets read as
//     malformed. Both are deliberate -- a fuzzy match here is the start of
//     judging content -- but they are strict, not lenient, so a reader does
//     not assume the format is negotiable.
//   * Fence handling covers ``` and ~~~ of any length >= 3, with four of
//     CommonMark's rules: same closing char, closing length >= opening, no
//     info string on the closing fence, and at most 3 spaces of indent. It is
//     not a full CommonMark parser. ONE known false-pass vector remains,
//     judged not worth more machinery: a fence opened inside a BLOCKQUOTE
//     (`> ```markdown`). Fences inside list items keep the document's own
//     indentation accounting, which this ignores. HTML comments are stripped
//     AFTER fence blanking, terminated or not -- see the comment at that line
//     for why the order matters; getting it backwards cost one false pass and
//     one false fail in the same review round. An UNCLOSED
//     fence blanks everything after it and reports `missing-section` rather
//     than something diagnostic. Fail-closed, but the message will not say why.
//
// THE EXEMPT LIST BELOW IS CLOSED. The four files in it carry this cycle's
// own date but predate the rule. The cutoff cannot simply be moved one day
// forward, because that would exempt this cycle's own spec and plan -- the two
// files the guard most needs to cover. Any later addition to EXEMPT means the
// guard is being worked around, not configured.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['docs/superpowers/specs', 'docs/superpowers/plans'];
const CUTOFF = '2026-10-12';

const EXEMPT = new Set([
  'docs/superpowers/specs/2026-10-12-guards-enforcement-set-design.md',
  'docs/superpowers/specs/2026-10-12-process-md-self-description-design.md',
  'docs/superpowers/plans/2026-10-12-guards-enforcement-set.md',
  'docs/superpowers/plans/2026-10-12-process-md-self-description.md',
]);

/**
 * Is this repo-relative path one the ledger rule applies to?
 * Directly under specs/ or plans/, a .md that is not a brief, named
 * `YYYY-MM-DD-...` with that date at or after the cutoff, and not exempt.
 */
function inScope(relPath) {
  if (EXEMPT.has(relPath)) return false;
  const slash = relPath.lastIndexOf('/');
  const dir = relPath.slice(0, slash);
  const name = relPath.slice(slash + 1);
  if (!DIRS.includes(dir)) return false;
  if (!name.endsWith('.md') || name.endsWith('-brief.md')) return false;
  const date = /^(\d{4}-\d{2}-\d{2})-/.exec(name)?.[1];
  return date !== undefined && date >= CUTOFF;
}

/**
 * Does this document carry a usable decision ledger?
 * @returns {{ok: true} | {ok: false, reason: 'missing-section'|'empty-section'|'malformed-entry'}}
 */
function checkLedger(markdown) {
  // Blank out fenced code blocks first: a document that documents the ledger
  // format carries the heading as an example too, and the example must not be
  // mistaken for the real section.
  // CommonMark fences: ``` or ~~~, three or more; a fence closes only on the
  // same character and at least the same length, so a ``` inside a ```` block
  // is content. Both halves matter here -- a document documenting this very
  // format reaches for ~~~ precisely because its example contains backticks.
  let open = null; // { char, len } while inside a fence
  const lines = markdown.replace(/\r\n/g, '\n').split('\n').map((l) => {
    // Indent is capped at 3 spaces; 4+ is an indented code block, not a fence.
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(l);
    if (m) {
      const fence = { char: m[1][0], len: m[1].length };
      const info = m[2].trim();
      if (open === null) { open = fence; return ''; }
      // A closing fence carries nothing but whitespace after it, so a
      // ```markdown line inside a ```text block does not close it.
      if (info === '' && fence.char === open.char && fence.len >= open.len) { open = null; return ''; }
    }
    return open === null ? l : '';
  });
  // A commented-out ledger is not a ledger. Stripped AFTER fence blanking, so
  // a `<!--` shown inside a code fence cannot pair with a later real comment's
  // `-->` and delete the genuine ledger between them. An unterminated comment
  // runs to the end: it hides everything after it in a renderer too.
  const stripped = lines.join('\n').replace(/<!--[\s\S]*?-->|<!--[\s\S]*$/g, '').split('\n');
  const start = stripped.findIndex((l) => /^## Decisioni aperte\s*$/.test(l));
  if (start === -1) return { ok: false, reason: 'missing-section' };

  const rest = stripped.slice(start + 1);
  const end = rest.findIndex((l) => /^## /.test(l));
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
  if (body === '') return { ok: false, reason: 'empty-section' };
  if (body === 'Nessuna.') return { ok: true };

  // Split on the numbered-entry markers; index 0 is whatever precedes the
  // first one, which must be empty for the body to be a list at all.
  const parts = body.split(/^\d+\.\s/m);
  if (parts.length < 2 || parts[0].trim() !== '') return { ok: false, reason: 'malformed-entry' };
  const complete = (e) => e.includes('Alternativa scartata:') && e.includes('Perché:');
  if (!parts.slice(1).every(complete)) return { ok: false, reason: 'malformed-entry' };
  return { ok: true };
}

const OK = `## Decisioni aperte

1. **Scelta A.** Alternativa scartata: B. Perché: una ragione.
2. **Scelta C.** Alternativa scartata: D. Perché: un'altra ragione.
`;

describe('checkLedger', () => {
  it('accepts the Nessuna. sentinel', () => {
    expect(checkLedger('# T\n\n## Decisioni aperte\n\nNessuna.\n')).toEqual({ ok: true });
  });

  it('accepts a list where every entry has all three fields', () => {
    expect(checkLedger(`# T\n\n${OK}`)).toEqual({ ok: true });
  });

  it('rejects a file with no ## Decisioni aperte section', () => {
    expect(checkLedger('# T\n\n## Altro\n\ntesto\n').reason).toBe('missing-section');
  });

  it('does not accept ### Decisioni aperte as the section', () => {
    expect(checkLedger('# T\n\n### Decisioni aperte\n\nNessuna.\n').reason).toBe('missing-section');
  });

  it('rejects a section whose body is blank', () => {
    expect(checkLedger('# T\n\n## Decisioni aperte\n\n\n## Dopo\n\nx\n').reason).toBe('empty-section');
  });

  it('rejects an entry missing Alternativa scartata:', () => {
    const md = '# T\n\n## Decisioni aperte\n\n1. **A.** Perché: una ragione.\n';
    expect(checkLedger(md).reason).toBe('malformed-entry');
  });

  it('rejects an entry missing Perché:', () => {
    const md = '# T\n\n## Decisioni aperte\n\n1. **A.** Alternativa scartata: B.\n';
    expect(checkLedger(md).reason).toBe('malformed-entry');
  });

  it('rejects Perche: written without the accent', () => {
    const md = '# T\n\n## Decisioni aperte\n\n1. **A.** Alternativa scartata: B. Perche: una ragione.\n';
    expect(checkLedger(md).reason).toBe('malformed-entry');
  });

  it('rejects when only the second of two entries is complete', () => {
    const md = '# T\n\n## Decisioni aperte\n\n1. **A.** nessun campo.\n2. **C.** Alternativa scartata: D. Perché: r.\n';
    expect(checkLedger(md).reason).toBe('malformed-entry');
  });

  it('stops the section at the next ## heading', () => {
    // The following section talks ABOUT the fields in prose; it must not be
    // read as part of the ledger, and must not rescue an incomplete entry.
    const md = `# T\n\n${OK}\n## Note\n\nQui si parla di Alternativa scartata e di Perché in prosa.\n`;
    expect(checkLedger(md)).toEqual({ ok: true });
  });

  it('ignores a ## Decisioni aperte that sits inside a fenced code block', () => {
    // Any document that DOCUMENTS the ledger format -- PROCESS.md 6b, and the
    // spec this guard was born in -- carries the heading twice: once as a
    // fenced example, once for real. Reading the example instead was the first
    // thing the live sweep caught.
    const md = `# T\n\n## Formato\n\n\`\`\`markdown\n## Decisioni aperte\n\n1. **X.** senza campi.\n\`\`\`\n\n${OK}`;
    expect(checkLedger(md)).toEqual({ ok: true });
  });

  it('ignores a ledger heading inside a tilde fence too', () => {
    // ~~~ is standard CommonMark and is the natural choice exactly here: an
    // example that itself contains backticks. Handling only ``` let a document
    // with no real ledger PASS on a well-formed ~~~-fenced example of one.
    const md = `# T\n\n~~~markdown\n## Decisioni aperte\n\n1. **X.** Alternativa scartata: Y. Perché: z.\n~~~\n\n## Altro\n\nx\n`;
    expect(checkLedger(md).reason).toBe('missing-section');
  });

  it('treats a shorter fence inside a longer one as content, per CommonMark', () => {
    // A 4-backtick fence is how you show a ``` block. The inner ``` must not
    // close the outer one, or everything after it is read as live markup.
    const md = `# T\n\n\`\`\`\`markdown\n\`\`\`\n## Decisioni aperte\n\nNessuna.\n\`\`\`\n\`\`\`\`\n\n## Altro\n\nx\n`;
    expect(checkLedger(md).reason).toBe('missing-section');
  });

  it('does not let a fence carrying an info string close an open fence', () => {
    // CommonMark: a closing fence has nothing but whitespace after it. Without
    // that rule a ```text block illustrating a ```markdown block is read as
    // closed at the inner line, and the example ledger after it counts as real
    // -- a document with no ledger PASSING. Verified as a false green before
    // this test existed.
    const md = '# T\n\n```text\n```markdown\n## Decisioni aperte\n\nNessuna.\n```\n```\n\n## Altro\n\nx\n';
    expect(checkLedger(md).reason).toBe('missing-section');
  });

  it('ignores a ledger commented out in an HTML comment', () => {
    // The realistic way to end up with no ledger while looking like you have
    // one: drafting it, commenting it out, and never uncommenting.
    const md = '# T\n\n<!--\n## Decisioni aperte\n\nNessuna.\n-->\n\n## Altro\n\nx\n';
    expect(checkLedger(md).reason).toBe('missing-section');
  });

  it('ignores a ledger inside an UNTERMINATED HTML comment', () => {
    // One keystroke from the case above, and the likelier typo of the two.
    const md = '# T\n\n<!--\n## Decisioni aperte\n\nNessuna.\n';
    expect(checkLedger(md).reason).toBe('missing-section');
  });

  it('does not let a <!-- inside a code fence swallow the real ledger', () => {
    // A document SHOWING html. Stripping comments before handling fences let
    // this `<!--` pair with a later genuine comment's `-->`, deleting the real
    // ledger in between -- a false FAIL, introduced by the first comment fix.
    const md = '# T\n\n```text\n<!-- oops\n```\n\n## Decisioni aperte\n\nNessuna.\n\n<!-- nota -->\n';
    expect(checkLedger(md)).toEqual({ ok: true });
  });

  it('does not treat a line indented 4+ spaces as a fence', () => {
    // 4 spaces is an indented code block, not a fence. Treating it as one lets
    // an indented example toggle the real fence state.
    const md = '# T\n\n    ```\n\n## Decisioni aperte\n\nNessuna.\n';
    expect(checkLedger(md)).toEqual({ ok: true });
  });

  it('rejects a document whose only ledger heading is inside a fence', () => {
    const md = '# T\n\n```markdown\n## Decisioni aperte\n\nNessuna.\n```\n';
    expect(checkLedger(md).reason).toBe('missing-section');
  });

  it('parses a CRLF document identically to its LF twin', () => {
    const lf = `# T\n\n${OK}`;
    expect(checkLedger(lf.replace(/\n/g, '\r\n'))).toEqual(checkLedger(lf));
  });
});

describe('inScope', () => {
  it('skips *-brief.md under specs/', () => {
    expect(inScope('docs/superpowers/specs/2026-10-20-something-brief.md')).toBe(false);
  });

  it('skips a filename with no leading date', () => {
    expect(inScope('docs/superpowers/specs/README.md')).toBe(false);
  });

  it('skips files dated before the cutoff', () => {
    expect(inScope('docs/superpowers/specs/2026-10-11-whatever-design.md')).toBe(false);
  });

  it('skips the four exempt files', () => {
    for (const f of EXEMPT) expect(inScope(f), f).toBe(false);
  });

  it("includes this cycle's own spec and plan", () => {
    expect(inScope('docs/superpowers/specs/2026-10-12-approval-economy-design.md')).toBe(true);
    expect(inScope('docs/superpowers/plans/2026-10-12-approval-economy.md')).toBe(true);
  });
});

describe('live specs and plans', () => {
  it('every in-scope spec and plan carries a valid ledger', () => {
    const failures = [];
    for (const dir of DIRS) {
      const abs = join(ROOT, dir);
      if (!existsSync(abs)) continue;
      for (const name of readdirSync(abs)) {
        const rel = `${dir}/${name}`;
        if (!inScope(rel)) continue;
        const res = checkLedger(readFileSync(join(abs, name), 'utf8'));
        if (!res.ok) failures.push(`${rel} -- ${res.reason}`);
      }
    }
    expect(failures, `these files have no usable "## Decisioni aperte" section
      (PROCESS.md 6b). Add one, or "Nessuna." if the cycle genuinely took no
      decision that could have gone another way:\n  ${failures.join('\n  ')}`)
      .toEqual([]);
  });
});
