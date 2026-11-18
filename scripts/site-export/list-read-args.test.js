import { describe, it, expect, afterAll, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, existsSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCommit, readBlobs, runList, runCopy, resolveDest, classifyCommit, parseArgs } from '../site-export.mjs';
import {
  made, cleanupMade, git, put, makeRepo, lines, makeEmptyClone, listFiles, SITE, INCLUDED, copy,
  SHA, ALLOW, withOrigin, headOf,
} from '../lib/site-export-fixture.mjs';

vi.setConfig({ testTimeout: 60000 }); // each test builds temp git repos; slow on Windows
afterAll(cleanupMade);
describe('runList', () => {
  const files = { 'login.html': 'x', 'js/core.js': 'a', 'js/core.test.js': 't', 'docs/a.md': 'd' };

  it('prints the sha and the rule behind every verdict', () => {
    const repo = makeRepo(files);
    const o = lines();
    const code = runList({ repo, ref: 'main', out: o.push });
    expect(code).toBe(0);
    expect(o.out[0]).toBe(`commit ${git(repo, 'rev-parse', 'main')}`);
    expect(o.out[0]).toMatch(/^commit [0-9a-f]{40}$/);
    const text = o.out.join('\n');
    expect(text).toMatch(/^include login\.html {2}\[include \*\.html \(line \d+\)\]$/m);
    expect(text).toMatch(/^include js\/core\.js /m);
    expect(text).toMatch(/^exclude js\/core\.test\.js /m);
    expect(text).toMatch(/^exclude docs\/a\.md /m);
  });

  it('shows an unclassified file and exits 1', () => {
    const repo = makeRepo({ ...files, 'mystery/file.txt': 'm' });
    const o = lines();
    expect(runList({ repo, ref: 'main', out: o.push })).toBe(1);
    expect(o.out.join('\n')).toMatch(/^unclassified mystery\/file\.txt {2}\[no rule\]$/m);
  });

  it('reads the commit, not the working tree', () => {
    const repo = makeRepo(files);
    put(repo, { 'js/untracked.js': 'u', 'js/core.js': 'changed' });
    const o = lines();
    runList({ repo, ref: 'main', out: o.push });
    expect(o.out.join('\n')).not.toContain('untracked.js');
  });
});

describe('resolveCommit', () => {
  it('throws on an unknown ref', () => {
    const repo = makeRepo({ 'login.html': 'x' });
    expect(() => resolveCommit(repo, 'nope')).toThrow('unknown ref: nope');
  });
});

describe('readBlobs', () => {
  it('returns exact bytes for names with spaces and non-ASCII characters', () => {
    const name = 'js/my file é.js';
    const bytes = Buffer.from([0, 1, 13, 10, 200, 255]);
    const repo = makeRepo({ [name]: bytes, 'js/b.js': 'b' });
    const sha = resolveCommit(repo, 'main');
    const blobs = readBlobs(repo, sha, [name, 'js/b.js']);
    expect([...blobs.keys()]).toEqual([name, 'js/b.js']);
    expect(blobs.get(name).equals(bytes)).toBe(true);
  });
});

describe('resolveDest', () => {
  it('uses PDASH_EXPORT_DEST when no dest is given', () => {
    const repo = makeRepo(SITE);
    const dest = makeEmptyClone();
    expect(resolveDest(repo, undefined, { PDASH_EXPORT_DEST: dest })).toBe(dest);
  });

  it('refuses: nothing given, an empty folder, the source, inside the source, a linked worktree', () => {
    const repo = makeRepo(SITE);
    expect(() => resolveDest(repo, undefined, {})).toThrow(/--dest|PDASH_EXPORT_DEST/);
    const plain = realpathSync.native(mkdtempSync(join(tmpdir(), 'site-export-plain-')));
    made.push(plain);
    expect(() => resolveDest(repo, plain, {})).toThrow(/clone/);
    expect(() => resolveDest(repo, repo, {})).toThrow(/source/);
    const inner = join(repo, 'sub');
    mkdirSync(inner);
    git(inner, 'init', '-q');
    expect(() => resolveDest(repo, inner, {})).toThrow(/source/);
    const wt = join(realpathSync.native(tmpdir()), `site-export-wt-${Date.now()}`);
    made.push(wt);
    git(repo, 'worktree', 'add', '-q', wt, '-b', 'wt');
    expect(() => resolveDest(repo, wt, {})).toThrow(/source/);
  });
});

describe('classifyCommit', () => {
  it('lists unclassified items for the copy gate', () => {
    const repo = makeRepo({ 'mystery/file.txt': 'm' });
    expect(classifyCommit(repo, 'main').items[0].verdict).toBe('unclassified');
  });
});


describe('parseArgs', () => {
  it('takes the ref positionally with or without --dest', () => {
    expect(parseArgs(['v1.2', '--dry-run'], { dest: true, dryRun: true })).toEqual({ ref: 'v1.2', dryRun: true });
    expect(parseArgs(['--dest', 'd', 'v1.2'], { dest: true, dryRun: true })).toEqual({ ref: 'v1.2', dest: 'd', dryRun: false });
    expect(parseArgs([], { dest: true }).ref).toBe('main');
  });

  it('rejects an unknown flag, --dest without a value, an extra argument, and a flag the command lacks', () => {
    expect(() => parseArgs(['--dry_run'], { dryRun: true })).toThrow('unknown option: --dry_run');
    expect(() => parseArgs(['--dest'], { dest: true })).toThrow(/--dest needs a directory/);
    expect(() => parseArgs(['a', 'b'])).toThrow('unexpected argument: b');
    expect(() => parseArgs(['--dest', 'x'])).toThrow('unknown option: --dest');
  });
});

describe('parseArgs, --yes --sha', () => {
  it('takes both together and adds yes/sha only when given', () => {
    expect(parseArgs(['--yes', '--sha', SHA], ALLOW)).toEqual({ ref: 'main', dryRun: false, yes: true, sha: SHA });
    expect(parseArgs(['--dry-run'], ALLOW)).toEqual({ ref: 'main', dryRun: true });
  });

  it('refuses one without the other, a malformed sha, and the flags where the command lacks them', () => {
    expect(() => parseArgs(['--yes'], ALLOW)).toThrow('--yes needs --sha');
    expect(() => parseArgs(['--sha', SHA], ALLOW)).toThrow('--sha needs --yes');
    expect(() => parseArgs(['--yes', '--sha', 'ABC'], ALLOW)).toThrow('--sha must be 40 lowercase hex characters');
    expect(() => parseArgs(['--yes', '--sha', SHA.toUpperCase()], ALLOW)).toThrow('--sha must be 40 lowercase hex characters');
    expect(() => parseArgs(['--yes', '--sha'], ALLOW)).toThrow('--sha must be 40 lowercase hex characters');
    expect(() => parseArgs(['--yes', '--sha', SHA], {})).toThrow('unknown option: --yes');
  });

  it('refuses a repeated --yes or --sha instead of letting the last one win', () => {
    expect(() => parseArgs(['--yes', '--sha', SHA, '--sha', 'b'.repeat(40)], ALLOW)).toThrow('--sha given twice');
    expect(() => parseArgs(['--yes', '--yes', '--sha', SHA], ALLOW)).toThrow('--yes given twice');
  });
});
