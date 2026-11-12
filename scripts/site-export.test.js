import { describe, it, expect, afterAll, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { resolveCommit, readBlobs, runList } from './site-export.mjs';

vi.setConfig({ testTimeout: 60000 }); // each test builds temp git repos; slow on Windows

const made = [];
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();

function put(dir, files) {
  for (const [p, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), content);
  }
}

/** Temp git repo on `main` with `files` committed; returns its real path. */
function makeRepo(files) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'site-export-')));
  made.push(dir);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 'T');
  git(dir, 'config', 'user.email', 't@example.invalid');
  git(dir, 'config', 'core.autocrlf', 'false');
  put(dir, files);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  return dir;
}

const lines = () => {
  const out = [];
  return { out, push: (l) => out.push(l) };
};

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
