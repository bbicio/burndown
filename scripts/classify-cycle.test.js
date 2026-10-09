import { describe, it, expect } from 'vitest';
import { classifyNameStatus, RUNTIME_LOADED_ROOT_MD } from './classify-cycle.mjs';

// Builds the exact shape of `git diff --name-status --find-renames -z` stdout:
// NUL-separated fields, trailing NUL. Verified byte-for-byte 2026-10-09:
//   M\0path\0                  for M / A / D
//   R100\0old\0new\0           for a rename (status token carries the similarity)
const Z = (...fields) => fields.join('\0') + '\0';

describe('classifyNameStatus', () => {
  it('1: .claude/ and docs/ markdown only is a no-code cycle', () => {
    const r = classifyNameStatus(Z('M', '.claude/commands/finish-cycle.md', 'M', 'docs/superpowers/PROCESS.md'));
    expect(r.kind).toBe('no-code');
    expect(r.paths).toEqual(['.claude/commands/finish-cycle.md', 'docs/superpowers/PROCESS.md']);
  });

  it('2: matches the start of the path, not anywhere inside it', () => {
    // api/docs/helper.md contains "docs/" but is a file under api/
    expect(classifyNameStatus(Z('M', 'api/docs/helper.md')).kind).toBe('ordinary');
  });

  it('3: one non-whitelisted path makes the whole diff ordinary', () => {
    expect(classifyNameStatus(Z('M', 'docs/pages/pipeline.md', 'M', 'pipeline.html')).kind).toBe('ordinary');
  });

  it('4: a deleted root .md and an added docs/ .md still qualify', () => {
    expect(classifyNameStatus(Z('D', 'CLAUDE.md', 'A', 'docs/architecture/x.md')).kind).toBe('no-code');
  });

  it('5: a rename is judged on BOTH of its paths', () => {
    // Review Focus 3. This is the H1 defect of the previous cycle: with
    // --name-only the js/a.js side is invisible and this reads as no-code.
    const r = classifyNameStatus(Z('R100', 'js/a.js', 'docs/a.md'));
    expect(r.kind).toBe('ordinary');
    expect(r.paths).toEqual(['js/a.js', 'docs/a.md']);
  });

  it('6: a rename with a similarity other than 100 is parsed the same way', () => {
    // Review Focus 3: the status token is R + digits, not a bare "R".
    const r = classifyNameStatus(Z('R087', 'docs/a.md', 'docs/b.md'));
    expect(r.kind).toBe('no-code');
    expect(r.paths).toEqual(['docs/a.md', 'docs/b.md']);
  });

  it('7: a root .md qualifies while the named-exception list is empty', () => {
    expect(RUNTIME_LOADED_ROOT_MD).toEqual([]);
    expect(classifyNameStatus(Z('M', 'TEST_CASES.md')).kind).toBe('no-code');
  });

  it('8: an empty diff does not qualify vacuously', () => {
    expect(classifyNameStatus('').kind).toBe('ordinary');
    expect(classifyNameStatus('').paths).toEqual([]);
  });

  it('9: scripts/ is not whitelisted', () => {
    expect(classifyNameStatus(Z('M', 'scripts/gen.mjs', 'M', 'ARCHITECTURE.md')).kind).toBe('ordinary');
  });

  it('10: a non-ASCII path qualifies', () => {
    // Review Focus 1. Without -z git emits "docs/caff\303\250.md" (quoted and
    // escaped), which fails both the prefix and the .md suffix check.
    const r = classifyNameStatus(Z('A', 'docs/caffè.md'));
    expect(r.kind).toBe('no-code');
    expect(r.paths).toEqual(['docs/caffè.md']);
  });

  it('11: a path containing a space qualifies', () => {
    // Review Focus 2: splitting on whitespace would break this into two tokens.
    const r = classifyNameStatus(Z('A', 'docs/due parole.md'));
    expect(r.kind).toBe('no-code');
    expect(r.paths).toEqual(['docs/due parole.md']);
  });

  it('12: a non-markdown file under .claude/ is code', () => {
    // Spec criterion 3: relaxing the .md guard on .claude/ flips this to
    // no-code, so this test is the one that fails if the clause is loosened.
    // .claude/settings.json holds hooks and is trackable — .gitignore covers
    // only settings.local.json.
    expect(classifyNameStatus(Z('M', '.claude/settings.json')).kind).toBe('ordinary');
  });

  it('treats a named exception as code', () => {
    const r = classifyNameStatus(Z('M', 'TEST_CASES.md'), ['TEST_CASES.md']);
    expect(r.kind).toBe('ordinary');
  });
});
