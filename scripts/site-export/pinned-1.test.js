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

  it('an unclassified tracked file', async () => {
    const repo = withOrigin(makeRepo({ ...SITE, 'mystery/file.txt': 'm' }));
    const dest = makeEmptyClone();
    const r = await pinned(repo, dest);
    expect(r.code).toBe(1);
    expect(r.out).toContain('mystery/file.txt');
    expect(listFiles(dest)).toEqual([]);
  });

  it('an included symlink and an included executable', async () => {
    for (const [mode, path] of [['120000', 'js/link.js'], ['100755', 'js/run.js']]) {
      const repo = makeRepo(SITE);
      addEntry(repo, mode, path, 'x');
      withOrigin(repo);
      const dest = makeEmptyClone();
      const r = await pinned(repo, dest);
      expect(r.code).toBe(1);
      expect(r.out).toContain(`${path} (mode ${mode})`);
      expect(listFiles(dest)).toEqual([]);
    }
  });

  it('a folder with ignored files where a file must go', async () => {
    const repo = withOrigin(makeRepo({ ...SITE, 'handbook/x': 'f' }));
    const dest = makeEmptyClone();
    put(dest, { '.gitignore': '.cache', 'handbook/x/.cache': 'c', 'stray.txt': 's' });
    const r = await pinned(repo, dest);
    expect(r.code).toBe(1);
    expect(r.out).toContain('handbook/x: a folder with files that stay is in the way');
    expect(existsSync(join(dest, 'stray.txt'))).toBe(true);
    expect(existsSync(join(dest, 'login.html'))).toBe(false);
  });

  it("a file the destination's .gitignore would ignore", async () => {
    const repo = withOrigin(makeRepo({ ...SITE, 'js/a.log': 'l' }));
    const dest = makeEmptyClone();
    put(dest, { '.gitignore': '*.log' });
    const r = await pinned(repo, dest);
    expect(r.code).toBe(1);
    expect(r.out).toContain("js/a.log: ignored by the destination's .gitignore");
    expect(existsSync(join(dest, 'login.html'))).toBe(false);
  });

  it('a warning: untracked files that would be deleted', async () => {
    const repo = withOrigin(makeRepo(SITE));
    const dest = makeEmptyClone();
    put(dest, { 'stray.txt': 's' });
    const r = await pinned(repo, dest);
    expect(r.code).toBe(1);
    expect(r.out).toContain('Refusing to write: --yes does not proceed past a warning');
    expect(existsSync(join(dest, 'stray.txt'))).toBe(true);
    expect(existsSync(join(dest, 'login.html'))).toBe(false);
    expect(r.asked()).toBe(0);
  });

  it('a warning: the commit is not known to origin/main', async () => {
    const repo = makeRepo(SITE);
    const dest = makeEmptyClone();
    const r = await pinned(repo, dest);
    expect(r.code).toBe(1);
    expect(r.out).toContain('Refusing to write: --yes does not proceed past a warning');
    expect(listFiles(dest)).toEqual([]);
  });

});
