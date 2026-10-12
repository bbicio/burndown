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
  let fenced = false;
  const lines = markdown.replace(/\r\n/g, '\n').split('\n').map((l) => {
    if (/^\s*```/.test(l)) { fenced = !fenced; return ''; }
    return fenced ? '' : l;
  });
  const start = lines.findIndex((l) => /^## Decisioni aperte\s*$/.test(l));
  if (start === -1) return { ok: false, reason: 'missing-section' };

  const rest = lines.slice(start + 1);
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
