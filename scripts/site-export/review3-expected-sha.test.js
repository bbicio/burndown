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
describe('review round 3', () => {
  it('refuses to write through a symlinked folder in the destination', async () => {
    const repo = makeRepo(SITE);
    const dest = makeEmptyClone();
    const elsewhere = realpathSync.native(mkdtempSync(join(tmpdir(), 'site-export-elsewhere-')));
    made.push(elsewhere);
    try { symlinkSync(elsewhere, join(dest, 'js'), 'junction'); } catch { return; }
    const r = await copy(repo, dest);
    expect(r.code).toBe(1);
    expect(r.out).toContain('js is a symlink in the destination');
    expect(existsSync(join(elsewhere, 'core.js'))).toBe(false);
  });

  it('replaces an empty folder where a file must go, with nothing left half-done', async () => {
    const repo = makeRepo({ ...SITE, 'handbook/x': 'f' });
    const dest = makeEmptyClone();
    mkdirSync(join(dest, 'handbook/x'), { recursive: true });
    const r = await copy(repo, dest);
    expect(r.code).toBe(0);
    expect(readFileSync(join(dest, 'handbook/x'), 'utf8')).toBe('f');
  });

  it('refuses a file the destination .gitignore would ignore, and prints no plan', async () => {
    const repo = makeRepo({ ...SITE, 'js/a.log': 'l' });
    const dest = makeEmptyClone();
    put(dest, { '.gitignore': '*.log' });
    const r = await copy(repo, dest, { dryRun: true });
    expect(r.code).toBe(1);
    expect(r.out).toContain("js/a.log: ignored by the destination's .gitignore");
    expect(r.out).not.toContain('added:');
  });

  it('warns how many untracked files will be lost', async () => {
    const repo = makeRepo(SITE);
    const dest = makeEmptyClone();
    put(dest, { 'draft.txt': 'd' });
    const r = await copy(repo, dest, { dryRun: true });
    expect(r.out).toContain('1 untracked file(s) in the destination will be deleted');
  });

  it('reports a real git failure instead of "unknown ref"', () => {
    const plain = realpathSync.native(mkdtempSync(join(tmpdir(), 'site-export-plain-')));
    made.push(plain);
    expect(() => resolveCommit(plain, 'main')).toThrow(/git failed while resolving main/);
  });

  it('rejects a --dest value that looks like an option', () => {
    expect(() => parseArgs(['--dest', '-foo'], { dest: true })).toThrow(/--dest needs a directory/);
  });
});

describe('runCopy, expectedSha', () => {
  it('refuses before writing when the sha is not the resolved one, naming both', async () => {
    const repo = makeRepo(SITE);
    const dest = makeEmptyClone();
    const real = git(repo, 'rev-parse', 'HEAD');
    const r = await copy(repo, dest, { expectedSha: SHA });
    expect(r.code).toBe(1);
    expect(r.out).toContain(`Refusing to copy: --sha ${SHA} does not match main (${real})`);
    expect(listFiles(dest)).toEqual([]);
    expect(r.asked()).toBe(0);
  });

  it('copies when the sha is the resolved one', async () => {
    const repo = withOrigin(makeRepo(SITE));
    const dest = makeEmptyClone();
    const r = await copy(repo, dest, { expectedSha: headOf(repo) });
    expect(r.code).toBe(0);
    expect(listFiles(dest)).toEqual(INCLUDED);
  });

  it('does not take an empty or malformed sha for "no pin"', async () => {
    const repo = withOrigin(makeRepo(SITE));
    for (const bad of ['', 'abc', SHA.toUpperCase()]) {
      const dest = makeEmptyClone();
      const r = await copy(repo, dest, { expectedSha: bad });
      expect(r.code).toBe(1);
      expect(r.out).toContain('Refusing to copy: --sha must be 40 lowercase hex characters');
      expect(listFiles(dest)).toEqual([]);
    }
  });
});
