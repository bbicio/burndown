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
//     exactly the same reason (see also §6b, "Il confine dei guard": a guard
//     may require the artefact to CARRY the information, never judge whether
//     it is correct).
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
// SECOND RULE (2026-10-14, M1): every spec dated from BRIEF_CUTOFF carries a
// `**Brief started:**` line, a `YYYY-MM-DD HH:MM` time or `unknown`. Not
// checked: whether the time is correct, and plans (only specs carry it). The
// line is matched anywhere in the file, fences and comments included.
//
// THIRD RULE (2026-10-14, M4): every plan dated from PLAN_CUTOFF carries a
// `**Branch:** `<name>`` line and exactly one `**Risk class:**` line, whose
// value is low-risk, standard or high-risk. /finish-cycle's Gate 2 reads both. Not
// checked: whether the class is right, whether the branch exists, and specs.
// Lines are matched anywhere in the file, fences and comments included.
// PLAN_EXEMPT is closed, like EXEMPT below: it holds the one plan that shares
// the cutoff date and predates the rule.
//
// FOURTH RULE (2026-10-23): every spec dated from CRITERIA_CUTOFF, and every
// plan dated from it whose `**Spec:**` line does not open with an existing Spec in
// backticks, carries a `## Criteri di accettazione` section of
// `N. **<label>** — <outcome>` entries, at least one, no sentinel.
// /finish-cycle's Gate 2 reads it as a checklist. Fences and HTML comments are
// handled as for the ledger (liveLines). Not checked: the content, whether an
// entry is verifiable, whether the list is complete, and briefs.
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
 * The document's lines with fenced code blocks and HTML comments blanked out:
 * what a renderer shows as live markup. Shared by the ledger rule and the
 * acceptance-criteria rule.
 * @returns {string[]}
 */
function liveLines(markdown) {
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
  return lines.join('\n').replace(/<!--[\s\S]*?-->|<!--[\s\S]*$/g, '').split('\n');
}

/**
 * Does this document carry a usable decision ledger?
 * @returns {{ok: true} | {ok: false, reason: 'missing-section'|'empty-section'|'malformed-entry'}}
 */
function checkLedger(markdown) {
  const stripped = liveLines(markdown);
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

// Second rule, same files: a spec's header carries the time its Brief (or its
// brainstorming, when there is no Brief) started. scripts/cycle-times.mjs
// reads it. Specs only, from its own cutoff; no exemptions.
const BRIEF_CUTOFF = '2026-10-14';

function briefInScope(relPath) {
  const slash = relPath.lastIndexOf('/');
  if (relPath.slice(0, slash) !== 'docs/superpowers/specs') return false;
  const name = relPath.slice(slash + 1);
  if (!name.endsWith('.md') || name.endsWith('-brief.md')) return false;
  const date = /^(\d{4}-\d{2}-\d{2})-/.exec(name)?.[1];
  return date !== undefined && date >= BRIEF_CUTOFF;
}

function checkBriefStarted(markdown) {
  return markdown.replace(/\r\n/g, '\n').split('\n')
    .some((l) => /^\*\*Brief started:\*\* (\d{4}-\d{2}-\d{2} \d{2}:\d{2}|unknown)\s*$/.test(l));
}

// Third rule, plans only: the header carries the two lines /finish-cycle's
// Gate 2 reads to find the cycle's Plan and its risk class (PROCESS.md 6.1b).
// From its own cutoff, with its own closed exemption.
const PLAN_CUTOFF = '2026-10-14';
const PLAN_EXEMPT = new Set([
  'docs/superpowers/plans/2026-10-14-m1-measurement-prose-rules.md',
]);

function planInScope(relPath) {
  if (PLAN_EXEMPT.has(relPath)) return false;
  const slash = relPath.lastIndexOf('/');
  if (relPath.slice(0, slash) !== 'docs/superpowers/plans') return false;
  const name = relPath.slice(slash + 1);
  if (!name.endsWith('.md')) return false;
  const date = /^(\d{4}-\d{2}-\d{2})-/.exec(name)?.[1];
  return date !== undefined && date >= PLAN_CUTOFF;
}

/**
 * @returns {{ok: true} | {ok: false, reason: 'missing-branch'|'missing-risk-class'|'multiple-risk-class'}}
 */
function checkPlanHeader(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  if (!lines.some((l) => /^\*\*Branch:\*\* `[^`]+`/.test(l))) return { ok: false, reason: 'missing-branch' };
  const classLines = lines.filter((l) => /^\*\*Risk class:\*\*/.test(l));
  if (classLines.length > 1) return { ok: false, reason: 'multiple-risk-class' };
  if (!classLines.some((l) => /^\*\*Risk class:\*\* (low-risk|standard|high-risk)(\s|$)/.test(l))) {
    return { ok: false, reason: 'missing-risk-class' };
  }
  return { ok: true };
}

// Fourth rule, specs and spec-less plans: an acceptance-criteria section that
// /finish-cycle's Gate 2 turns into a checklist (PROCESS.md 6b). From its own
// cutoff, no exemptions.
const CRITERIA_CUTOFF = '2026-10-24';

/**
 * Specs dated from the cutoff (briefs excluded), and plans dated from the
 * cutoff whose `**Spec:**` line does not open with a backticked, existing Spec.
 * @param {(relPath: string) => boolean} exists
 */
function criteriaInScope(relPath, markdown, exists) {
  const slash = relPath.lastIndexOf('/');
  const dir = relPath.slice(0, slash);
  const name = relPath.slice(slash + 1);
  if (!DIRS.includes(dir)) return false;
  if (!name.endsWith('.md') || name.endsWith('-brief.md')) return false;
  const date = /^(\d{4}-\d{2}-\d{2})-/.exec(name)?.[1];
  if (date === undefined || date < CRITERIA_CUTOFF) return false;
  if (dir === 'docs/superpowers/specs') return true;
  const specLine = markdown.replace(/\r\n/g, '\n').split('\n').find((l) => /^\*\*Spec:\*\*/.test(l));
  // Only a backticked path right after the label, under specs/, names a Spec.
  const path = specLine && /^\*\*Spec:\*\*\s*`(docs\/superpowers\/specs\/[^`]+)`/.exec(specLine)?.[1];
  return !(path && exists(path));
}

/**
 * Does this document carry a usable acceptance-criteria section?
 * @returns {{ok: true} | {ok: false, reason: 'missing-section'|'empty-section'|'malformed-entry'}}
 */
function checkCriteria(markdown) {
  const lines = liveLines(markdown);
  const start = lines.findIndex((l) => /^## Criteri di accettazione\s*$/.test(l));
  if (start === -1) return { ok: false, reason: 'missing-section' };
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^## /.test(l));
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
  if (body === '') return { ok: false, reason: 'empty-section' };
  // Same split as the ledger: index 0 is whatever precedes the first entry.
  const parts = body.split(/^\d+\.\s/m);
  if (parts.length < 2 || parts[0].trim() !== '') return { ok: false, reason: 'malformed-entry' };
  if (!parts.slice(1).every((e) => /^\*\*[^*\n]+\*\* — \S/.test(e))) return { ok: false, reason: 'malformed-entry' };
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

describe('checkBriefStarted', () => {
  it('accepts a timestamp and unknown, CRLF tolerated', () => {
    expect(checkBriefStarted('# S\n**Brief started:** 2026-10-14 11:17\n')).toBe(true);
    expect(checkBriefStarted('# S\r\n**Brief started:** unknown\r\n')).toBe(true);
  });

  it('rejects a malformed value and a missing line', () => {
    expect(checkBriefStarted('**Brief started:** 2026-10-14 9:05\n')).toBe(false);
    expect(checkBriefStarted('# S\n**Date:** 2026-10-14\n')).toBe(false);
  });
});

describe('briefInScope', () => {
  it('covers specs dated from the Brief cutoff, never plans or briefs', () => {
    expect(briefInScope(`docs/superpowers/specs/${BRIEF_CUTOFF}-x-design.md`)).toBe(true);
    expect(briefInScope('docs/superpowers/specs/2026-10-13-backlog-follow-up-design.md')).toBe(false);
    expect(briefInScope(`docs/superpowers/plans/${BRIEF_CUTOFF}-x.md`)).toBe(false);
    expect(briefInScope(`docs/superpowers/specs/${BRIEF_CUTOFF}-x-brief.md`)).toBe(false);
  });
});

describe('live specs: Brief started', () => {
  it('every in-scope spec carries a Brief started line', () => {
    const dir = 'docs/superpowers/specs';
    const failures = readdirSync(join(ROOT, dir))
      .map((name) => `${dir}/${name}`)
      .filter((rel) => briefInScope(rel) && !checkBriefStarted(readFileSync(join(ROOT, rel), 'utf8')));
    expect(failures, `these specs have no "**Brief started:** YYYY-MM-DD HH:MM" (or "unknown")
      line (PROCESS.md 6b, Il ledger):\n  ${failures.join('\n  ')}`).toEqual([]);
  });
});

describe('checkPlanHeader', () => {
  const HEAD = '# P\n\n**Branch:** `x`\n\n**Risk class:** standard — r\n';

  it('accepts a backticked Branch and an in-set Risk class, CRLF tolerated', () => {
    expect(checkPlanHeader(HEAD)).toEqual({ ok: true });
    expect(checkPlanHeader(HEAD.replace(/\n/g, '\r\n'))).toEqual({ ok: true });
  });

  it('accepts a Branch line with a trailing explanation', () => {
    const md = '**Branch:** `x` — the name must contain the slug\n**Risk class:** high-risk — migration\n';
    expect(checkPlanHeader(md)).toEqual({ ok: true });
  });

  it('rejects a Risk class outside the three values, case included', () => {
    expect(checkPlanHeader('**Branch:** `x`\n**Risk class:** High-risk — r\n').reason).toBe('missing-risk-class');
    expect(checkPlanHeader('**Branch:** `x`\n**Risk class:** medium\n').reason).toBe('missing-risk-class');
  });

  it('rejects a plan with more than one Risk class line', () => {
    // Gate 2 reads "its" Risk class line: two of them, e.g. a quoted header
    // template before the real declaration, leave that read ambiguous.
    const md = '**Branch:** `x`\n**Risk class:** <low-risk|standard|high-risk> — c\n**Risk class:** high-risk — m\n';
    expect(checkPlanHeader(md).reason).toBe('multiple-risk-class');
  });

  it('rejects a missing Branch line and one without backticks', () => {
    expect(checkPlanHeader('**Risk class:** standard — r\n').reason).toBe('missing-branch');
    expect(checkPlanHeader('**Branch:** x\n**Risk class:** standard — r\n').reason).toBe('missing-branch');
  });
});

describe('planInScope', () => {
  it('covers plans dated from the plan cutoff, minus the closed exemption, never specs', () => {
    expect(planInScope('docs/superpowers/plans/2026-10-14-m4-verification-risk-class.md')).toBe(true);
    expect(planInScope('docs/superpowers/plans/2026-10-14-m1-measurement-prose-rules.md')).toBe(false);
    expect(planInScope('docs/superpowers/plans/2026-10-13-backlog-follow-up.md')).toBe(false);
    expect(planInScope('docs/superpowers/specs/2026-10-14-m4-verification-risk-class-design.md')).toBe(false);
  });
});

describe('live plans: Branch and Risk class', () => {
  it('every in-scope plan carries both header lines', () => {
    const dir = 'docs/superpowers/plans';
    const failures = readdirSync(join(ROOT, dir))
      .map((name) => `${dir}/${name}`)
      .filter((rel) => planInScope(rel))
      .map((rel) => [rel, checkPlanHeader(readFileSync(join(ROOT, rel), 'utf8'))])
      .filter(([, res]) => !res.ok)
      .map(([rel, res]) => `${rel} -- ${res.reason}`);
    expect(failures, `these plans fail the Plan header rule -- one "**Branch:** \`<name>\`" line and exactly one
      "**Risk class:** low-risk|standard|high-risk" line (PROCESS.md 6.1b):\n  ${failures.join('\n  ')}`).toEqual([]);
  });
});

const CRIT_OK = `## Criteri di accettazione

1. **A** — esito.
2. **B** — altro.
`;

describe('checkCriteria', () => {
  it('accepts numbered entries with a bold label and an em dash', () => {
    expect(checkCriteria(`# T\n\n${CRIT_OK}`)).toEqual({ ok: true });
  });

  it('rejects a document with no section, or with only ### Criteri di accettazione', () => {
    expect(checkCriteria('# T\n\n## Altro\n\nx\n').reason).toBe('missing-section');
    expect(checkCriteria('# T\n\n### Criteri di accettazione\n\n1. **A** — e.\n').reason).toBe('missing-section');
  });

  it('ignores a heading inside a ``` or ~~~ fence', () => {
    expect(checkCriteria(`# T\n\n\`\`\`markdown\n${CRIT_OK}\`\`\`\n`).reason).toBe('missing-section');
    expect(checkCriteria(`# T\n\n~~~markdown\n${CRIT_OK}~~~\n`).reason).toBe('missing-section');
  });

  it('ignores a heading inside an HTML comment', () => {
    expect(checkCriteria(`# T\n\n<!--\n${CRIT_OK}-->\n`).reason).toBe('missing-section');
  });

  it('rejects a section whose body is blank before the next ## heading', () => {
    expect(checkCriteria('# T\n\n## Criteri di accettazione\n\n\n## Dopo\n\n1. **A** — e.\n').reason).toBe('empty-section');
  });

  it('rejects Nessuno., an entry without a bold label, a hyphen for the dash, and bullets', () => {
    const sec = (body) => `# T\n\n## Criteri di accettazione\n\n${body}\n`;
    expect(checkCriteria(sec('Nessuno.')).reason).toBe('malformed-entry');
    expect(checkCriteria(sec('1. A — esito.')).reason).toBe('malformed-entry');
    expect(checkCriteria(sec('1. **A** - esito.')).reason).toBe('malformed-entry');
    expect(checkCriteria(sec('- **A** — esito.')).reason).toBe('malformed-entry');
  });

  it('stops the section at the next ## heading', () => {
    expect(checkCriteria(`# T\n\n${CRIT_OK}\n## Note\n\nprosa libera\n`)).toEqual({ ok: true });
    expect(checkCriteria('# T\n\n## Criteri di accettazione\n\n1. A senza etichetta.\n\n## Note\n\n2. **B** — e.\n').reason)
      .toBe('malformed-entry');
  });

  it('parses a CRLF document identically to its LF twin', () => {
    const lf = `# T\n\n${CRIT_OK}`;
    expect(checkCriteria(lf.replace(/\n/g, '\r\n'))).toEqual(checkCriteria(lf));
  });

  it("accepts this cycle's own spec, the first real document in the format", () => {
    const rel = 'docs/superpowers/specs/2026-10-23-acceptance-criteria-frozen-spec-design.md';
    expect(checkCriteria(readFileSync(join(ROOT, rel), 'utf8'))).toEqual({ ok: true });
  });
});

describe('criteriaInScope', () => {
  const yes = () => true;
  const no = () => false;
  const prev = '2026-10-23';

  it('covers specs dated from the cutoff, never briefs', () => {
    expect(criteriaInScope(`docs/superpowers/specs/${CRITERIA_CUTOFF}-x-design.md`, '', yes)).toBe(true);
    expect(criteriaInScope(`docs/superpowers/specs/${prev}-x-design.md`, '', yes)).toBe(false);
    expect(criteriaInScope(`docs/superpowers/specs/${CRITERIA_CUTOFF}-x-brief.md`, '', yes)).toBe(false);
  });

  it('covers a plan only when its **Spec:** line names no existing Spec', () => {
    const plan = `docs/superpowers/plans/${CRITERIA_CUTOFF}-x.md`;
    expect(criteriaInScope(plan, '# P\n\n**Spec:** nessuna — x\n', yes)).toBe(true);
    const named = '# P\n\n**Spec:** `docs/superpowers/specs/a-design.md`\n';
    expect(criteriaInScope(plan, named, yes)).toBe(false);
    expect(criteriaInScope(plan, named, no)).toBe(true);
    expect(criteriaInScope(plan, '# P\n\n**Branch:** `x`\n', yes)).toBe(true);
    // The real spec-less form cites an existing handoff or report after
    // "nessuna": that file is not a Spec and must not exempt the Plan.
    expect(criteriaInScope(plan, '**Spec:** nessuna — handoff `docs/superpowers/briefs/h.md`.\n', yes)).toBe(true);
    expect(criteriaInScope(plan, '**Spec:** `docs/superpowers/briefs/h.md`\n', yes)).toBe(true);
    expect(criteriaInScope(`docs/superpowers/plans/${prev}-x.md`, '# P\n', yes)).toBe(false);
  });
});

describe('live specs and plans: acceptance criteria', () => {
  it('every in-scope spec and spec-less plan carries a criteria section', () => {
    const failures = [];
    for (const dir of DIRS) {
      const abs = join(ROOT, dir);
      if (!existsSync(abs)) continue;
      for (const name of readdirSync(abs)) {
        const rel = `${dir}/${name}`;
        if (!name.endsWith('.md')) continue;
        const md = readFileSync(join(abs, name), 'utf8');
        if (!criteriaInScope(rel, md, (p) => existsSync(join(ROOT, p)))) continue;
        const res = checkCriteria(md);
        if (!res.ok) failures.push(`${rel} -- ${res.reason}`);
      }
    }
    expect(failures, `these files have no usable "## Criteri di accettazione" section, entries
      "N. **<label>** — <verifiable outcome>" (PROCESS.md 6b):\n  ${failures.join('\n  ')}`).toEqual([]);
  });
});
