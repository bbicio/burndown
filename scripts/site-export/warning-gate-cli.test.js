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
describe('runCopy, what the warning gate hangs on', () => {
  it('a pin alone does not stop a human from answering: an interactive confirm goes past a warning', async () => {
    const repo = makeRepo(SITE);
    const dest = makeEmptyClone();
    const r = await copy(repo, dest, { expectedSha: headOf(repo) });
    expect(r.code).toBe(0);
    expect(r.asked()).toBe(1);
    expect(listFiles(dest)).toEqual(INCLUDED);
  });

  it('an automatic yes without a pin still refuses past a warning', async () => {
    const repo = makeRepo(SITE);
    const dest = makeEmptyClone();
    const r = await copy(repo, dest, { assumeYes: true, confirm: async () => true });
    expect(r.code).toBe(1);
    expect(r.out).toContain('Refusing to write: --yes does not proceed past a warning');
    expect(listFiles(dest)).toEqual([]);
  });

  it('a malformed pin is reported before the ref is resolved', async () => {
    const repo = makeRepo(SITE);
    const r = await copy(repo, makeEmptyClone(), { ref: 'no-such-ref', expectedSha: 'abc' });
    expect(r.code).toBe(1);
    expect(r.out).toContain('Refusing to copy: --sha must be 40 lowercase hex characters');
  });
});

describe('the command line, --yes --sha', () => {
  const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'site-export.mjs');
  const cli = (repo, args) => {
    try {
      const stdout = execFileSync(process.execPath, [script, 'copy', ...args], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { code: 0, stdout, stderr: '' };
    } catch (e) {
      return { code: e.status, stdout: String(e.stdout), stderr: String(e.stderr) };
    }
  };

  it('writes without a terminal when --yes and the right --sha are given', () => {
    const repo = withOrigin(makeRepo(SITE));
    const dest = makeEmptyClone();
    const r = cli(repo, ['--yes', '--sha', headOf(repo), '--dest', dest]);
    expect(r.code).toBe(0);
    expect(listFiles(dest)).toEqual(INCLUDED);
  });

  it('exits 1 and writes nothing when the --sha is wrong, naming both shas', () => {
    const repo = withOrigin(makeRepo(SITE));
    const dest = makeEmptyClone();
    const r = cli(repo, ['--yes', '--sha', SHA, '--dest', dest]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain(`Refusing to copy: --sha ${SHA} does not match main (${headOf(repo)})`);
    expect(listFiles(dest)).toEqual([]);
  });

  it('accepts --dry-run with --yes and writes nothing', () => {
    const repo = withOrigin(makeRepo(SITE));
    const dest = makeEmptyClone();
    const r = cli(repo, ['--yes', '--sha', headOf(repo), '--dry-run', '--dest', dest]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Dry run: nothing written.');
    expect(listFiles(dest)).toEqual([]);
  });

  it('still refuses to write without --yes and without a terminal', () => {
    const repo = makeRepo(SITE);
    const dest = makeEmptyClone();
    const r = cli(repo, ['--dest', dest]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('Refusing to write without an interactive confirmation.');
    expect(listFiles(dest)).toEqual([]);
  });
});
