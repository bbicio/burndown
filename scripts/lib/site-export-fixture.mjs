// Fixtures shared by the scripts/site-export/*.test.js files: throw-away git repositories and
// destinations, and the copy wrapper the tests drive. Each test file calls afterAll(cleanupMade).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runCopy } from '../site-export.mjs';

/** Every temp directory a test makes is pushed here; cleanupMade removes them all. */
export const made = [];
export const cleanupMade = () => { for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true }); };

export const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();

export function put(dir, files) {
  for (const [p, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), content);
  }
}

/** Temp git repo on `main` with `files` committed; returns its real path. */
export function makeRepo(files) {
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

export const lines = () => {
  const out = [];
  return { out, push: (l) => out.push(l) };
};

/** Temp git repo with no commit: a destination "clone" with no files. */
export function makeEmptyClone() {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'site-export-dest-')));
  made.push(dir);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'core.autocrlf', 'false');
  return dir;
}

export const listFiles = (dir) => git(dir, '-c', 'core.quotepath=off', 'ls-files', '-co', '--exclude-standard')
  .split('\n').filter(Boolean).sort();

export const SITE = {
  'login.html': '<html>\n',
  'js/core.js': 'core\n',
  'js/core.test.js': 'test\n',
  'docs/a.md': 'doc\n',
  'api/src/index.js': 'idx\n',
  '.gitignore': 'node_modules/\n',
};
export const INCLUDED = ['.gitignore', 'api/src/index.js', 'js/core.js', 'login.html'];

export async function copy(repo, dest, extra = {}) {
  const o = lines();
  let asked = 0;
  const code = await runCopy({
    repo, ref: 'main', dest, env: {}, dryRun: false, out: o.push,
    confirm: async () => { asked += 1; return true; }, ...extra,
  });
  return { code, out: o.out.join('\n'), asked: () => asked };
}

export const SHA = 'a'.repeat(40);
export const ALLOW = { dest: true, dryRun: true, yes: true };
/** Makes the repo's origin/main equal its HEAD, so the copy has no origin warning. */
export const withOrigin = (repo) => { git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD'); return repo; };
export const headOf = (repo) => git(repo, 'rev-parse', 'HEAD');
