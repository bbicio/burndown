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
import { mkdirSync, readFileSync, readdirSync, realpathSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseRules, classify, describeRule, planCopy } from './lib/site-export.mjs';

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

const abs = (repo, args) => git(repo, args, { encoding: 'utf8' }).trim();

/**
 * The destination: --dest, else PDASH_EXPORT_DEST. It must be the root of a git
 * clone that is neither the source repo, nor inside it, nor a linked worktree
 * of it. @returns {string} its realpath
 */
export function resolveDest(repo, dest, env) {
  const given = dest ?? env.PDASH_EXPORT_DEST;
  if (!given) throw new Error('no destination: pass --dest <dir> or set PDASH_EXPORT_DEST');
  let real;
  try { real = realpathSync.native(given); } catch { throw new Error(`destination does not exist: ${given}`); }
  let top;
  try { top = realpathSync.native(abs(real, ['rev-parse', '--show-toplevel'])); } catch { top = null; }
  if (top !== real) throw new Error(`destination is not the root of a git clone: ${real}`);
  const srcTop = realpathSync.native(abs(repo, ['rev-parse', '--show-toplevel']));
  if (real === srcTop || real.startsWith(srcTop + sep)) throw new Error('destination is the source repo or inside it');
  const common = (d) => realpathSync.native(abs(d, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
  if (common(real) === common(repo)) throw new Error('destination shares its git directory with the source repo');
  return real;
}

/** Files of the destination working tree (tracked + untracked, never ignored). */
export function readDestFiles(dest) {
  const names = git(dest, ['ls-files', '-co', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  return new Map([...new Set(names)].map((n) => [n, readFileSync(join(dest, n))]));
}

/** Writes added/modified files, deletes the deleted ones and the folders that leaves empty. */
export function applyPlan(dest, wanted, plan) {
  for (const p of [...plan.added, ...plan.modified]) {
    const target = join(dest, p);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, wanted.get(p));
  }
  for (const p of plan.deleted) {
    unlinkSync(join(dest, p));
    for (let d = dirname(join(dest, p)); d !== dest && d.startsWith(dest + sep); d = dirname(d)) {
      if (readdirSync(d).length > 0) break;
      rmdirSync(d);
    }
  }
}

function originWarning(repo, sha) {
  try {
    git(repo, ['rev-parse', '--verify', '--quiet', 'origin/main']);
  } catch {
    return 'warning: origin/main not found, cannot tell whether this commit is on GitHub';
  }
  try {
    git(repo, ['merge-base', '--is-ancestor', sha, 'origin/main']);
    return null;
  } catch {
    return 'warning: this commit is not contained in origin/main';
  }
}

/**
 * `copy`: commit → included files → destination, after confirmation.
 * @param {{ repo: string, ref: string, dest?: string, env: object, dryRun: boolean,
 *   confirm: (summary: object) => Promise<boolean>, out: (line: string) => void }} o
 * @returns {Promise<number>} exit code
 */
export async function runCopy({ repo, ref, dest, env, dryRun, confirm, out }) {
  const { sha, items } = classifyCommit(repo, ref);
  const unclassified = items.filter((i) => i.verdict === 'unclassified');
  if (unclassified.length > 0) {
    out('Refusing to copy: these files match no rule in scripts/site-export.rules:');
    unclassified.forEach((i) => out(`  ${i.path}`));
    return 1;
  }
  const wanted = readBlobs(repo, sha, items.filter((i) => i.verdict === 'include').map((i) => i.path));
  const target = resolveDest(repo, dest, env);
  const plan = planCopy(wanted, readDestFiles(target));
  out(`commit ${sha}`);
  const warning = originWarning(repo, sha);
  if (warning) out(warning);
  out(`destination ${target}`);
  for (const k of ['added', 'modified', 'deleted']) {
    out(`${k}: ${plan[k].length}`);
    plan[k].forEach((p) => out(`  ${p}`));
  }
  if (plan.added.length + plan.modified.length + plan.deleted.length === 0) {
    out('Nothing to do.');
    return 0;
  }
  if (dryRun) {
    out('Dry run: nothing written.');
    return 0;
  }
  if (!(await confirm({ sha, ...plan }))) {
    out('Cancelled: nothing written.');
    return 0;
  }
  applyPlan(target, wanted, plan);
  out('Copied. Nothing was committed or pushed.');
  return 0;
}

async function askInTerminal() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('Refusing to write without an interactive confirmation.');
    return null;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Write these changes to the destination? [y/N] ');
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

export async function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === 'list') {
    return runList({ repo: process.cwd(), ref: rest[0] ?? 'main', out: (l) => console.log(l) });
  }
  if (cmd === 'copy') {
    const dryRun = rest.includes('--dry-run');
    const di = rest.indexOf('--dest');
    const dest = di >= 0 ? rest[di + 1] : undefined;
    const ref = rest.find((a, i) => !a.startsWith('--') && i !== di + 1) ?? 'main';
    let refused = false;
    const code = await runCopy({
      repo: process.cwd(), ref, dest, env: process.env, dryRun, out: (l) => console.log(l),
      confirm: async () => {
        const yes = await askInTerminal();
        if (yes === null) { refused = true; return false; }
        return yes;
      },
    });
    return refused ? 1 : code;
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
