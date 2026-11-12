// Site export CLI: classify the tracked files of a commit as site or process
// and copy the site files into the local Bitbucket clone.
//
//   node scripts/site-export.mjs list [ref]
//   node scripts/site-export.mjs copy [ref] [--dest <dir>] [--dry-run] [--yes --sha <sha>]
//
// Reads the commit (never the working tree), applies scripts/site-export.rules
// (scripts/lib/site-export.mjs), and never runs `git commit` or `git push`.
// Needs git >= 2.31 (`--path-format=absolute`, `--end-of-options`).
// Spec: docs/superpowers/specs/2026-11-12-site-export-classification-design.md.

import { execFileSync, spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
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
    return git(repo, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`], { encoding: 'utf8' }).trim();
  } catch (err) {
    // `--verify --quiet` exits 1 for a ref that does not exist; anything else is a real git failure.
    if (err.status === 1) throw new Error(`unknown ref: ${ref}`);
    throw new Error(`git failed while resolving ${ref}: ${String(err.stderr || err.message).trim()}`);
  }
}

/** @returns {{ path: string, mode: string }[]} every entry of the commit's tree (mode 100644/100755 = file, 120000 = symlink, 160000 = submodule) */
export function listCommitEntries(repo, sha) {
  return git(repo, ['ls-tree', '-r', '-z', '--full-tree', sha], { encoding: 'utf8' })
    .split('\0').filter(Boolean)
    .map((rec) => {
      const tab = rec.indexOf('\t');
      return { path: rec.slice(tab + 1), mode: rec.slice(0, rec.indexOf(' ')) };
    });
}

/** @returns {string[]} every file path of the commit's tree */
export function listCommitPaths(repo, sha) {
  return listCommitEntries(repo, sha).map((e) => e.path);
}

// Only plain files: the copy writes bytes, it does not carry the executable bit,
// a symlink or a submodule, so it refuses those instead of copying them wrongly.
const REGULAR_MODES = new Set(['100644']);

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
  // Windows paths are case-insensitive: compare lower-cased there.
  const key = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
  const [r, s] = [key(real), key(srcTop)];
  if (r === s || r.startsWith(s + sep) || s.startsWith(r + sep)) {
    throw new Error('destination is the source repo, inside it, or contains it');
  }
  const common = (d) => key(realpathSync.native(abs(d, ['rev-parse', '--path-format=absolute', '--git-common-dir'])));
  if (common(real) === common(repo)) throw new Error('destination shares its git directory with the source repo');
  return real;
}

/**
 * Regular files of the destination working tree (tracked + untracked, never
 * ignored). An entry that is missing on disk (tracked, deleted, not staged),
 * a symlink or a submodule folder is skipped: only regular files are compared.
 */
export function readDestFiles(dest) {
  const names = git(dest, ['ls-files', '-co', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const files = new Map();
  for (const n of new Set(names)) {
    let st;
    try { st = lstatSync(join(dest, n)); } catch { continue; }
    if (st.isFile()) files.set(n, readFileSync(join(dest, n)));
  }
  return files;
}

/** Untracked, not ignored files of the destination: they are mirror-managed too, so the summary names them. */
function untrackedFiles(dest) {
  return new Set(git(dest, ['ls-files', '-o', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean));
}

const isDir = (p) => { try { return lstatSync(p).isDirectory(); } catch { return false; } };
const isFile = (p) => { try { return lstatSync(p).isFile(); } catch { return false; } };
const isLink = (p) => { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } };

/** Of `paths`, those the destination's own .gitignore would ignore (they would never show in `git status`). */
function ignoredInDest(dest, paths) {
  if (paths.length === 0) return [];
  const res = spawnSync('git', ['-C', dest, 'check-ignore', '--no-index', '-z', '--stdin'], {
    input: paths.join('\0'), maxBuffer: MAX, encoding: 'utf8',
  });
  if (res.status !== 0 && res.status !== 1) throw new Error(`git check-ignore failed: ${res.stderr}`);
  return String(res.stdout).split('\0').filter(Boolean);
}

function holdsOther(dir, rel, deleted) {
  return readdirSync(dir).some((name) => {
    const r = `${rel}/${name}`;
    const full = join(dir, name);
    return isDir(full) ? holdsOther(full, r, deleted) : !deleted.has(r);
  });
}

/**
 * Paths where a write could not succeed once the planned deletions are done: a
 * folder that still holds files nobody deletes (e.g. an ignored cache) where a
 * file must go, or a file that stays where a folder must go. Checked before
 * anything is written, so a refusal leaves the destination untouched.
 * @returns {string[]} human-readable conflicts, empty when the plan can be applied
 */
export function planConflicts(dest, plan) {
  const deleted = new Set(plan.deleted);
  const writes = [...plan.added, ...plan.modified];
  const out = [];
  for (const p of writes) {
    const full = join(dest, p);
    if (isDir(full) && holdsOther(full, p, deleted)) out.push(`${p}: a folder with files that stay is in the way`);
    const parts = p.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const sub = parts.slice(0, i).join('/');
      if (isLink(join(dest, sub))) { out.push(`${p}: ${sub} is a symlink in the destination`); break; }
      if (i < parts.length && isFile(join(dest, sub)) && !deleted.has(sub)) { out.push(`${p}: ${sub} is a file that stays`); break; }
    }
  }
  for (const p of ignoredInDest(dest, writes)) out.push(`${p}: ignored by the destination's .gitignore, it would never be committed`);
  return out;
}

/** Deletes first (so a file can become a folder), then writes; removes the folders deletion leaves empty. */
export function applyPlan(dest, wanted, plan) {
  try {
    for (const p of plan.deleted) {
      unlinkSync(join(dest, p));
      for (let d = dirname(join(dest, p)); d !== dest && d.startsWith(dest + sep); d = dirname(d)) {
        if (readdirSync(d).length > 0) break;
        rmdirSync(d);
      }
    }
    for (const p of [...plan.added, ...plan.modified]) {
      const target = join(dest, p);
      // planConflicts guarantees only empty folders can be left here
      if (isDir(target)) rmSync(target, { recursive: true });
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, wanted.get(p));
    }
  } catch (err) {
    throw new Error(`the copy stopped half-way (${err.message}); the destination is partly updated — check it with git status`);
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
  } catch (err) {
    if (err.status === 1) return 'warning: this commit is not contained in the local origin/main (not fetched, so it may be stale)';
    return 'warning: could not compare this commit with origin/main';
  }
}

/**
 * `copy`: commit → included files → destination, after confirmation.
 * @param {{ repo: string, ref: string, dest?: string, env: object, dryRun: boolean,
 *   expectedSha?: string, confirm: (summary: object) => Promise<boolean>,
 *   out: (line: string) => void }} o `expectedSha`: refuse unless the ref resolves to it
 * @returns {Promise<number>} exit code
 */
export async function runCopy({ repo, ref, dest, env, dryRun, expectedSha, confirm, out }) {
  const { sha, items } = classifyCommit(repo, ref);
  if (expectedSha && expectedSha !== sha) {
    out(`Refusing to copy: --sha ${expectedSha} does not match ${ref} (${sha})`);
    return 1;
  }
  const unclassified = items.filter((i) => i.verdict === 'unclassified');
  if (unclassified.length > 0) {
    out('Refusing to copy: these files match no rule in scripts/site-export.rules:');
    unclassified.forEach((i) => out(`  ${i.path}`));
    return 1;
  }
  const modes = new Map(listCommitEntries(repo, sha).map((e) => [e.path, e.mode]));
  const included = items.filter((i) => i.verdict === 'include').map((i) => i.path);
  const irregular = included.filter((p) => !REGULAR_MODES.has(modes.get(p)));
  if (irregular.length > 0) {
    out('Refusing to copy: these included entries are not plain files (symlink, submodule or executable):');
    irregular.forEach((p) => out(`  ${p} (mode ${modes.get(p)})`));
    return 1;
  }
  const wanted = readBlobs(repo, sha, included);
  const target = resolveDest(repo, dest, env);
  const plan = planCopy(wanted, readDestFiles(target));
  const untracked = untrackedFiles(target);
  out(`commit ${sha}`);
  const warning = originWarning(repo, sha);
  if (warning) out(warning);
  out(`destination ${target}`);
  const conflicts = planConflicts(target, plan);
  if (conflicts.length > 0) {
    out('Refusing to copy, nothing written (the plan cannot be applied as it is):');
    conflicts.forEach((c) => out(`  ${c}`));
    return 1;
  }
  for (const k of ['added', 'modified', 'deleted']) {
    out(`${k}: ${plan[k].length}`);
    plan[k].forEach((p) => out(`  ${p}${k === 'deleted' && untracked.has(p) ? '  (untracked in the destination)' : ''}`));
  }
  const lost = plan.deleted.filter((p) => untracked.has(p)).length;
  if (lost > 0) out(`warning: ${lost} untracked file(s) in the destination will be deleted; git cannot recover them`);
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
  try {
    const answer = await rl.question('Write these changes to the destination? [y/N] ');
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

/**
 * Strict argument parser: `[ref] [--dest <dir>] [--dry-run] [--yes --sha <sha>]`. An
 * unknown flag, a `--dest` without a value, a second positional argument, `--yes`
 * without `--sha` (or the reverse) or a `--sha` that is not 40 lowercase hex
 * characters is an error. `yes` and `sha` are present in the result only when given.
 * @param {string[]} args
 * @param {{ dest?: boolean, dryRun?: boolean, yes?: boolean }} allowed which flags the command takes
 * @returns {{ ref: string, dest?: string, dryRun: boolean, yes?: boolean, sha?: string }}
 */
export function parseArgs(args, allowed = {}) {
  const out = { ref: 'main', dryRun: false };
  let positional = 0;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run' && allowed.dryRun) out.dryRun = true;
    else if (a === '--dest' && allowed.dest) {
      const v = args[++i];
      if (v === undefined || v.startsWith('-')) throw new Error('--dest needs a directory');
      out.dest = v;
    } else if (a === '--yes' && allowed.yes) out.yes = true;
    else if (a === '--sha' && allowed.yes) {
      const v = args[++i];
      if (v === undefined || !/^[0-9a-f]{40}$/.test(v)) throw new Error('--sha must be 40 lowercase hex characters');
      out.sha = v;
    } else if (a.startsWith('-')) throw new Error(`unknown option: ${a}`);
    else if (positional++ === 0) out.ref = a;
    else throw new Error(`unexpected argument: ${a}`);
  }
  if (out.yes && !out.sha) throw new Error('--yes needs --sha');
  if (out.sha && !out.yes) throw new Error('--sha needs --yes');
  return out;
}

export async function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === 'list') {
    const { ref } = parseArgs(rest);
    return runList({ repo: process.cwd(), ref, out: (l) => console.log(l) });
  }
  if (cmd === 'copy') {
    const { ref, dest, dryRun, yes, sha } = parseArgs(rest, { dest: true, dryRun: true, yes: true });
    let refused = false;
    const code = await runCopy({
      repo: process.cwd(), ref, dest, env: process.env, dryRun, expectedSha: sha, out: (l) => console.log(l),
      confirm: yes ? async () => true : async () => {
        const answer = await askInTerminal();
        if (answer === null) { refused = true; return false; }
        return answer;
      },
    });
    return refused ? 1 : code;
  }
  console.error('Usage: site-export.mjs list [ref] | copy [ref] [--dest <dir>] [--dry-run] [--yes --sha <sha>]');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (err) => { console.error(err.message); process.exitCode = 1; },
  );
}
