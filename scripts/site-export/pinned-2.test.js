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
describe('runCopy, a pinned copy keeps every other refusal', () => {
  const pinned = (repo, dest, extra = {}) => copy(repo, dest, { expectedSha: headOf(repo), assumeYes: true, ...extra });
  const addEntry = (repo, mode, path, content) => {
    const oid = execFileSync('git', ['-C', repo, 'hash-object', '-w', '--stdin'], { input: content, encoding: 'utf8' }).trim();
    git(repo, 'update-index', '--add', '--cacheinfo', `${mode},${oid},${path}`);
    git(repo, 'commit', '-q', '-m', 'entry');
  };

  it('a warning: the commit is ahead of origin/main, and the refusal says what to do', async () => {
    const repo = withOrigin(makeRepo(SITE));
    put(repo, { 'js/core.js': 'core 2\n' });
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'ahead');
    const dest = makeEmptyClone();
    const r = await pinned(repo, dest);
    expect(r.code).toBe(1);
    expect(r.out).toContain('not contained in the local origin/main');
    expect(r.out).toContain('fetch origin');
    expect(listFiles(dest)).toEqual([]);
  });

  it('a warning: origin/main cannot be compared with the commit', async () => {
    const repo = makeRepo(SITE);
    const blob = execFileSync('git', ['-C', repo, 'hash-object', '-w', '--stdin'], { input: 'x', encoding: 'utf8' }).trim();
    try { git(repo, 'update-ref', 'refs/remotes/origin/main', blob); } catch { return; }
    const dest = makeEmptyClone();
    const r = await pinned(repo, dest);
    expect(r.code).toBe(1);
    expect(r.out).toContain('could not compare this commit with origin/main');
    expect(listFiles(dest)).toEqual([]);
  });

  it('a warning: an untracked destination file that the copy would overwrite', async () => {
    const repo = withOrigin(makeRepo(SITE));
    const dest = makeEmptyClone();
    put(dest, { 'login.html': 'my own page\n' });
    const r = await pinned(repo, dest);
    expect(r.code).toBe(1);
    expect(r.out).toContain('1 file(s) in the destination have local changes that the copy would overwrite');
    expect(readFileSync(join(dest, 'login.html'), 'utf8')).toBe('my own page\n');
  });

  it('a warning: a tracked destination file with uncommitted edits that the copy would overwrite', async () => {
    const repo = withOrigin(makeRepo(SITE));
    const dest = makeEmptyClone();
    git(dest, 'config', 'user.name', 'T');
    git(dest, 'config', 'user.email', 't@example.invalid');
    put(dest, { 'login.html': 'committed\n' });
    git(dest, 'add', '-A');
    git(dest, 'commit', '-q', '-m', 'dest');
    put(dest, { 'login.html': 'edited by hand\n' });
    const r = await pinned(repo, dest);
    expect(r.code).toBe(1);
    expect(r.out).toContain('1 file(s) in the destination have local changes that the copy would overwrite');
    expect(readFileSync(join(dest, 'login.html'), 'utf8')).toBe('edited by hand\n');
  });

  it('a symlinked folder in the destination', async () => {
    const repo = withOrigin(makeRepo(SITE));
    const dest = makeEmptyClone();
    const elsewhere = realpathSync.native(mkdtempSync(join(tmpdir(), 'site-export-elsewhere-')));
    made.push(elsewhere);
    try { symlinkSync(elsewhere, join(dest, 'js'), 'junction'); } catch { return; }
    const r = await pinned(repo, dest);
    expect(r.code).toBe(1);
    expect(r.out).toContain('js is a symlink in the destination');
    expect(existsSync(join(elsewhere, 'core.js'))).toBe(false);
  });

  it('with --dry-run it writes nothing and reports the plan', async () => {
    const repo = makeRepo(SITE);
    const dest = makeEmptyClone();
    const r = await pinned(repo, dest, { dryRun: true });
    expect(r.code).toBe(0);
    expect(r.out).toContain('Dry run: nothing written.');
    expect(r.out).toContain('added: 4');
    expect(listFiles(dest)).toEqual([]);
  });
});
