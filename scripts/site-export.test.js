import { describe, it, expect, afterAll, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, existsSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCommit, readBlobs, runList, runCopy, resolveDest, classifyCommit, parseArgs } from './site-export.mjs';

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
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'site-export-')));
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

// ── copy ────────────────────────────────────────────────────────────────────

/** Temp git repo with no commit: a destination "clone" with no files. */
function makeEmptyClone() {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'site-export-dest-')));
  made.push(dir);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'core.autocrlf', 'false');
  return dir;
}

const listFiles = (dir) => git(dir, '-c', 'core.quotepath=off', 'ls-files', '-co', '--exclude-standard')
  .split('\n').filter(Boolean).sort();

const SITE = {
  'login.html': '<html>\n',
  'js/core.js': 'core\n',
  'js/core.test.js': 'test\n',
  'docs/a.md': 'doc\n',
  'api/src/index.js': 'idx\n',
  '.gitignore': 'node_modules/\n',
};
const INCLUDED = ['.gitignore', 'api/src/index.js', 'js/core.js', 'login.html'];

async function copy(repo, dest, extra = {}) {
  const o = lines();
  let asked = 0;
  const code = await runCopy({
    repo, ref: 'main', dest, env: {}, dryRun: false, out: o.push,
    confirm: async () => { asked += 1; return true; }, ...extra,
  });
  return { code, out: o.out.join('\n'), asked: () => asked };
}

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

// ── review round 1 ─────────────────────────────────────────────────────────

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

// ── --yes --sha ────────────────────────────────────────────────────────────

const SHA = 'a'.repeat(40);
const ALLOW = { dest: true, dryRun: true, yes: true };

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
    const repo = makeRepo(SITE);
    const dest = makeEmptyClone();
    const r = await copy(repo, dest, { expectedSha: git(repo, 'rev-parse', 'HEAD') });
    expect(r.code).toBe(0);
    expect(listFiles(dest)).toEqual(INCLUDED);
  });
});

describe('the command line, --yes --sha', () => {
  const script = join(dirname(fileURLToPath(import.meta.url)), 'site-export.mjs');
  const cli = (repo, args) => {
    try {
      const stdout = execFileSync(process.execPath, [script, 'copy', ...args], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { code: 0, stdout, stderr: '' };
    } catch (e) {
      return { code: e.status, stdout: String(e.stdout), stderr: String(e.stderr) };
    }
  };

  it('writes without a terminal when --yes and the right --sha are given', () => {
    const repo = makeRepo(SITE);
    const dest = makeEmptyClone();
    const r = cli(repo, ['--yes', '--sha', git(repo, 'rev-parse', 'HEAD'), '--dest', dest]);
    expect(r.code).toBe(0);
    expect(listFiles(dest)).toEqual(INCLUDED);
  });

  it('exits 1 and writes nothing when the --sha is wrong', () => {
    const repo = makeRepo(SITE);
    const dest = makeEmptyClone();
    const r = cli(repo, ['--yes', '--sha', SHA, '--dest', dest]);
    expect(r.code).toBe(1);
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
