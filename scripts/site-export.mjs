// Site export CLI: classify the tracked files of a commit as site or process
// and copy the site files into the local Bitbucket clone.
//
//   node scripts/site-export.mjs list [ref]
//   node scripts/site-export.mjs copy [ref] [--dest <dir>] [--dry-run]
//
// Reads the commit (never the working tree), applies scripts/site-export.rules
// (scripts/lib/site-export.mjs), and never runs `git commit` or `git push`.
// Spec: docs/superpowers/specs/2026-11-12-site-export-classification-design.md.

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseRules, classify, describeRule } from './lib/site-export.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAX = 512 * 1024 * 1024;

const git = (repo, args, opts = {}) =>
  execFileSync('git', ['-C', repo, ...args], { maxBuffer: MAX, stdio: ['ignore', 'pipe', 'pipe'], ...opts });

/** The rules are the tool's own configuration: read next to this file, not from the exported commit. */
export function loadRules() {
  return parseRules(readFileSync(join(HERE, 'site-export.rules'), 'utf8'));
}

/** @returns {string} full SHA of `ref` in `repo` */
export function resolveCommit(repo, ref) {
  try {
    return git(repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error(`unknown ref: ${ref}`);
  }
}

/** @returns {string[]} every file path of the commit's tree */
export function listCommitPaths(repo, sha) {
  return git(repo, ['ls-tree', '-r', '-z', '--name-only', sha], { encoding: 'utf8' }).split('\0').filter(Boolean);
}

/** One `git cat-file --batch` process; @returns {Map<string, Buffer>} path → blob bytes */
export function readBlobs(repo, sha, paths) {
  if (paths.length === 0) return new Map();
  if (paths.some((p) => p.includes('\n'))) throw new Error('a path with a newline cannot be read');
  const res = spawnSync('git', ['-C', repo, 'cat-file', '--batch'], {
    input: paths.map((p) => `${sha}:${p}\n`).join(''),
    maxBuffer: MAX,
  });
  if (res.status !== 0) throw new Error(`git cat-file failed: ${res.stderr}`);
  const buf = res.stdout;
  const out = new Map();
  let pos = 0;
  for (const p of paths) {
    const eol = buf.indexOf(10, pos);
    const header = buf.subarray(pos, eol).toString('utf8');
    const m = /^[0-9a-f]+ blob (\d+)$/.exec(header);
    if (!m) throw new Error(`cannot read ${p} at ${sha}: ${header}`);
    const size = Number(m[1]);
    out.set(p, Buffer.from(buf.subarray(eol + 1, eol + 1 + size)));
    pos = eol + 1 + size + 1;
  }
  return out;
}

/** Classifies the commit's files. @returns {{ sha: string, items: ReturnType<typeof classify> }} */
export function classifyCommit(repo, ref) {
  const sha = resolveCommit(repo, ref);
  return { sha, items: classify(listCommitPaths(repo, sha), loadRules()) };
}

/** `list`: prints the verdict and rule per file; returns 1 when any file is unclassified. */
export function runList({ repo, ref, out }) {
  const { sha, items } = classifyCommit(repo, ref);
  out(`commit ${sha}`);
  for (const verdict of ['include', 'exclude', 'unclassified']) {
    items
      .filter((i) => i.verdict === verdict)
      .sort((a, b) => (a.path < b.path ? -1 : 1))
      .forEach((i) => out(`${verdict} ${i.path}  [${describeRule(i.rule)}]`));
  }
  return items.some((i) => i.verdict === 'unclassified') ? 1 : 0;
}

export async function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === 'list') {
    return runList({ repo: process.cwd(), ref: rest[0] ?? 'main', out: (l) => console.log(l) });
  }
  console.error('Usage: site-export.mjs list [ref] | copy [ref] [--dest <dir>] [--dry-run]');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (err) => { console.error(err.message); process.exitCode = 1; },
  );
}
