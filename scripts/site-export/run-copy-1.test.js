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
  it('into an empty destination makes its file list equal the included set', async () => {
    const repo = makeRepo(SITE);
    const dest = makeEmptyClone();
    const r = await copy(repo, dest);
    expect(r.code).toBe(0);
    expect(listFiles(dest)).toEqual(INCLUDED);
    expect(readFileSync(join(dest, 'js/core.js'), 'utf8')).toBe('core\n');
  });

  it('a second copy of the same commit changes nothing and asks nothing', async () => {
    const repo = makeRepo(SITE);
    const dest = makeEmptyClone();
    await copy(repo, dest);
    const r = await copy(repo, dest);
    expect(r.code).toBe(0);
    expect(r.asked()).toBe(0);
  });

  it('a file deleted in the source is deleted in the destination, with its folder', async () => {
    const repo = makeRepo(SITE);
    const dest = makeEmptyClone();
    await copy(repo, dest);
    git(repo, 'rm', '-q', 'api/src/index.js');
    git(repo, 'commit', '-q', '-m', 'rm');
    await copy(repo, dest);
    expect(listFiles(dest)).toEqual(['.gitignore', 'js/core.js', 'login.html']);
    expect(existsSync(join(dest, 'api'))).toBe(false);
  });

  it('removes a stray untracked file but leaves a gitignored one', async () => {
    const repo = makeRepo(SITE);
    const dest = makeEmptyClone();
    put(dest, { '.gitignore': 'node_modules/\n', 'stray.txt': 's', 'node_modules/x.js': 'n' });
    const r = await copy(repo, dest);
    expect(r.out).toContain('stray.txt');
    expect(existsSync(join(dest, 'stray.txt'))).toBe(false);
    expect(existsSync(join(dest, 'node_modules/x.js'))).toBe(true);
  });

});
