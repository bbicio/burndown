import { describe, it, expect, afterEach } from 'vitest';
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

  it('7: TEST_CASES.md is runtime-loaded code, other root .md files are not', () => {
    // test-cases.html fetches it and parses it at load (2026-10-09), so a cycle
    // touching only this file still changes what a page renders.
    expect(RUNTIME_LOADED_ROOT_MD).toEqual(['TEST_CASES.md']);
    expect(classifyNameStatus(Z('M', 'TEST_CASES.md')).kind).toBe('ordinary');
    expect(classifyNameStatus(Z('M', 'PRD.md')).kind).toBe('no-code');
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

  it('refuses a record whose status has no path rather than dropping it', () => {
    // A truncated stream is the ONE shape that can fabricate a no-code verdict:
    // dropping the dangling 'M' would leave only docs/a.md and hide whatever
    // path belonged to it. Not reachable through main() today (execFileSync
    // throws on a non-zero exit and on maxBuffer overflow), but this is an
    // exported function and the next caller may stream.
    expect(classifyNameStatus(Z('M', 'docs/a.md', 'M')).kind).toBe('ordinary');
  });

  it('a browser-only deliverable under docs/ is code', () => {
    // docs/OPERATIONAL_MANUAL.html is the file the guard rationale names: it can
    // be verified only in a browser, so a cycle regenerating it must keep the
    // browser question. Today the shared .md check covers it; this pins it
    // against a later refactor that splits the clauses and relaxes docs/.
    expect(classifyNameStatus(Z('M', 'docs/OPERATIONAL_MANUAL.html')).kind).toBe('ordinary');
  });

  it('treats a named exception as code', () => {
    const r = classifyNameStatus(Z('M', 'TEST_CASES.md'), ['TEST_CASES.md']);
    expect(r.kind).toBe('ordinary');
  });
});

// ── Integration: these run the script against throwaway git repositories. ────
// Only these can pin the git command itself; the unit tests above take its
// output as given. Without them, reintroducing --name-only (which hides a
// rename's old path) would pass the whole suite.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

// Resolved from the project root rather than import.meta.url: under vitest's
// transform that is not a file: URL, so fileURLToPath rejects it. vitest runs
// with the project root as cwd (vitest.config.js lives there).
const SCRIPT = join(process.cwd(), 'scripts', 'classify-cycle.mjs');
const made = [];

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'cc-'));
  made.push(dir);
  git(dir, 'init', '-q', '-b', 'main', '.');
  return dir;
}

function git(cwd, ...args) {
  return execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd,
    encoding: 'utf8',
    // Same reason as run() below: without it the throwaway repos' CRLF warnings
    // are forwarded into the suite's own stderr.
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function write(dir, rel, body) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), body);
}

function run(cwd, ...args) {
  try {
    // Same explicit stdio as main() uses, and for the same reason: with the
    // default, execFileSync forwards the child's stderr to the parent, so the
    // non-repo case (git implies --no-index and dumps its whole option list)
    // ends a green `npm test` in a wall of help text that reads like a crash.
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    return { status: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

const firstLine = (s) => s.split(/\r?\n/)[0];

afterEach(() => {
  while (made.length) rmSync(made.pop(), { recursive: true, force: true, maxRetries: 3 });
});

describe('classify-cycle.mjs end to end', () => {
  it('sees both sides of a rename that moves a live file into docs/', () => {
    const d = repo();
    write(d, 'api/src/foo.js', 'console.log(1);\n');
    git(d, 'add', '-A');
    git(d, 'commit', '-qm', 'base');
    mkdirSync(join(d, 'docs'), { recursive: true }); // git mv needs the destination dir
    git(d, 'mv', 'api/src/foo.js', 'docs/foo.md');
    git(d, 'commit', '-qm', 'move');

    const r = run(d, 'HEAD~1...HEAD');
    expect(firstLine(r.stdout)).toBe('ordinary');
    expect(r.stdout).toContain('api/src/foo.js');
    expect(r.stdout).toContain('docs/foo.md');
  }, 30000);

  it('does not qualify when the diff is empty although commits exist', () => {
    const d = repo();
    write(d, 'docs/a.md', 'one\n');
    git(d, 'add', '-A');
    git(d, 'commit', '-qm', 'base');
    write(d, 'docs/a.md', 'two\n');
    git(d, 'commit', '-qam', 'change');
    write(d, 'docs/a.md', 'one\n');
    git(d, 'commit', '-qam', 'revert');

    const r = run(d, 'HEAD~2...HEAD');
    expect(firstLine(r.stdout)).toBe('ordinary');
  }, 30000);

  it('is ordinary on a mixed diff', () => {
    const d = repo();
    write(d, 'docs/a.md', 'x\n');
    git(d, 'add', '-A');
    git(d, 'commit', '-qm', 'base');
    write(d, 'docs/x.md', 'x\n');
    write(d, 'js/y.js', 'x\n');
    git(d, 'add', '-A');
    git(d, 'commit', '-qm', 'mixed');

    expect(firstLine(run(d, 'HEAD~1...HEAD').stdout)).toBe('ordinary');
  }, 30000);

  it('classifies the diff of a linked worktree it is invoked from', () => {
    // Review Focus 4: this is where /finish-cycle actually runs.
    const d = repo();
    write(d, 'docs/a.md', 'x\n');
    git(d, 'add', '-A');
    git(d, 'commit', '-qm', 'base');
    const wt = join(d, 'wt');
    git(d, 'worktree', 'add', '-q', wt, '-b', 'feature');
    write(wt, 'docs/b.md', 'y\n');
    git(wt, 'add', '-A');
    git(wt, 'commit', '-qm', 'docs only');

    const r = run(wt);
    expect(firstLine(r.stdout)).toBe('no-code');
    expect(r.stdout).toContain('docs/b.md');
  }, 30000);

  it('reports a git failure once, not twice', () => {
    // execFileSync forwards the child's stderr to the parent even with the
    // default 'pipe', so git's own message was printed raw AND again inside the
    // wrapper. Outside a repository git implies --no-index and dumps its whole
    // option list, which turned the end of a green `npm test` into a wall of
    // help text that reads like a crash.
    const d = repo();
    write(d, 'docs/a.md', 'x\n');
    git(d, 'add', '-A');
    git(d, 'commit', '-qm', 'base');

    const r = run(d, 'nosuchbranch...HEAD');
    expect(r.stderr.match(/fatal:/g) ?? []).toHaveLength(1);
  }, 30000);

  it('never prints no-code when it cannot read a repository', () => {
    // Review Focus 5: fail closed. The gate grants the branch only on the
    // literal token, so anything else here means "ordinary cycle".
    const d = mkdtempSync(join(tmpdir(), 'cc-norepo-'));
    made.push(d);

    const r = run(d);
    expect(firstLine(r.stdout)).not.toBe('no-code');
    expect(r.status).not.toBe(0);
    expect(r.stderr).not.toBe('');
  }, 30000);
});
