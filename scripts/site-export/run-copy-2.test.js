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
describe('runCopy', () => {
  it('a dry run, or a refused confirmation, writes nothing', async () => {
    const repo = makeRepo(SITE);
    const dest = makeEmptyClone();
    const dry = await copy(repo, dest, { dryRun: true });
    expect(dry.asked()).toBe(0);
    expect(listFiles(dest)).toEqual([]);
    await copy(repo, dest, { confirm: async () => false });
    expect(listFiles(dest)).toEqual([]);
  });

  it('never copies uncommitted, modified or gitignored source files', async () => {
    const repo = makeRepo(SITE);
    put(repo, { 'js/untracked.js': 'u', 'js/core.js': 'changed\n', 'node_modules/y.js': 'y' });
    const dest = makeEmptyClone();
    await copy(repo, dest);
    expect(listFiles(dest)).toEqual(INCLUDED);
    expect(readFileSync(join(dest, 'js/core.js'), 'utf8')).toBe('core\n');
  });

  it("leaves the destination's .git and history untouched", async () => {
    const repo = makeRepo(SITE);
    const dest = makeEmptyClone();
    const before = git(dest, 'rev-parse', '--git-dir') + readFileSync(join(dest, '.git/HEAD'), 'utf8');
    await copy(repo, dest);
    expect(git(dest, 'rev-parse', '--git-dir') + readFileSync(join(dest, '.git/HEAD'), 'utf8')).toBe(before);
    expect(() => git(dest, 'rev-parse', '--verify', '-q', 'HEAD')).toThrow();
  });

  it('refuses when a tracked file is unclassified, and writes nothing', async () => {
    const repo = makeRepo({ ...SITE, 'mystery/file.txt': 'm' });
    const dest = makeEmptyClone();
    const r = await copy(repo, dest);
    expect(r.code).toBe(1);
    expect(r.out).toContain('mystery/file.txt');
    expect(listFiles(dest)).toEqual([]);
  });

  it('treats a CRLF checkout of a text file as unchanged', async () => {
    const repo = makeRepo(SITE);
    const dest = makeEmptyClone();
    await copy(repo, dest);
    writeFileSync(join(dest, 'js/core.js'), 'core\r\n');
    const r = await copy(repo, dest);
    expect(r.asked()).toBe(0);
  });

  it('warns when the commit is not in origin/main', async () => {
    const repo = makeRepo(SITE);
    const r = await copy(repo, makeEmptyClone(), { dryRun: true });
    expect(r.out).toMatch(/not (in|contained in) origin\/main|origin\/main/);
  });
});
