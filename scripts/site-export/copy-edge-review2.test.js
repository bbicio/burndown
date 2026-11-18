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
describe('runCopy, destination edge cases', () => {
  it('survives a tracked destination file that was deleted from disk', async () => {
    const repo = makeRepo(SITE);
    const dest = makeEmptyClone();
    put(dest, { 'js/core.js': 'old\n' });
    git(dest, 'add', '-A');
    git(dest, '-c', 'user.name=T', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', 'x');
    rmSync(join(dest, 'js/core.js'));
    const r = await copy(repo, dest, { dryRun: true });
    expect(r.code).toBe(0);
    expect(r.out).toContain('js/core.js');
  });

  it('turns a destination file into a folder and back', async () => {
    const repo = makeRepo({ ...SITE, 'handbook/x/y.md': 'y\n' });
    const dest = makeEmptyClone();
    put(dest, { 'handbook/x': 'i am a file' });
    expect((await copy(repo, dest)).code).toBe(0);
    expect(readFileSync(join(dest, 'handbook/x/y.md'), 'utf8')).toBe('y\n');
    git(repo, 'rm', '-q', '-r', 'handbook/x');
    put(repo, { 'handbook/x': 'now a file\n' });
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'file again');
    expect((await copy(repo, dest)).code).toBe(0);
    expect(readFileSync(join(dest, 'handbook/x'), 'utf8')).toBe('now a file\n');
  });

  it('refuses an included symlink and writes nothing', async () => {
    const repo = makeRepo(SITE);
    const oid = execFileSync('git', ['-C', repo, 'hash-object', '-w', '--stdin'], { input: 'core.js', encoding: 'utf8' }).trim();
    git(repo, 'update-index', '--add', '--cacheinfo', `120000,${oid},js/link.js`);
    git(repo, 'commit', '-q', '-m', 'symlink');
    const dest = makeEmptyClone();
    const r = await copy(repo, dest);
    expect(r.code).toBe(1);
    expect(r.out).toContain('js/link.js');
    expect(listFiles(dest)).toEqual([]);
  });

  it('refuses a destination that contains the source repo', () => {
    const parent = makeEmptyClone();
    const child = join(parent, 'src');
    mkdirSync(child);
    git(child, 'init', '-q', '-b', 'main');
    put(child, { 'login.html': 'x' });
    git(child, 'add', '-A');
    git(child, '-c', 'user.name=T', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', 'i');
    expect(() => resolveDest(child, parent, {})).toThrow(/contains it/);
  });
});

describe('review round 2', () => {
  it('works from a subdirectory of the source repo', () => {
    const repo = makeRepo(SITE);
    const root = lines();
    const sub = lines();
    runList({ repo, ref: 'main', out: root.push });
    runList({ repo: join(repo, 'js'), ref: 'main', out: sub.push });
    expect(sub.out).toEqual(root.out);
  });

  it('treats a dash-leading ref as an unknown ref, not as a git option', () => {
    const repo = makeRepo(SITE);
    expect(() => resolveCommit(repo, '-h')).toThrow('unknown ref: -h');
    expect(() => parseArgs(['-h'])).toThrow('unknown option: -h');
  });

  it('names the untracked files it is about to delete', async () => {
    const repo = makeRepo(SITE);
    const dest = makeEmptyClone();
    put(dest, { 'stray.txt': 's' });
    const r = await copy(repo, dest, { dryRun: true });
    expect(r.out).toContain('stray.txt  (untracked in the destination)');
  });

  it('refuses before writing when a folder with ignored files is where a file must go', async () => {
    const repo = makeRepo({ ...SITE, 'handbook/x': 'f' });
    const dest = makeEmptyClone();
    put(dest, { '.gitignore': '.cache', 'handbook/x/.cache': 'c', 'stray.txt': 's' });
    const r = await copy(repo, dest);
    expect(r.code).toBe(1);
    expect(r.out).toContain('handbook/x: a folder with files that stay is in the way');
    expect(existsSync(join(dest, 'stray.txt'))).toBe(true);
    expect(existsSync(join(dest, 'login.html'))).toBe(false);
  });

  it('refuses an included executable file', async () => {
    const repo = makeRepo(SITE);
    const oid = execFileSync('git', ['-C', repo, 'hash-object', '-w', '--stdin'], { input: 'x', encoding: 'utf8' }).trim();
    git(repo, 'update-index', '--add', '--cacheinfo', '100755,' + oid + ',js/run.js');
    git(repo, 'commit', '-q', '-m', 'exec');
    const dest = makeEmptyClone();
    const r = await copy(repo, dest);
    expect(r.code).toBe(1);
    expect(r.out).toContain('js/run.js (mode 100755)');
    expect(listFiles(dest)).toEqual([]);
  });
});
