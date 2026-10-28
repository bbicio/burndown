// Prints the timeline of every closed cycle, derived from git.
//
// Usage: node scripts/cycle-times.mjs
//
// One cycle per docs/superpowers/reports/*-finish-cycle.md. Columns: branch,
// the moments in MOMENTS, then the interval in minutes between each pair of
// consecutive moments (the header row names them). A value git cannot give is
// `unknown`, never estimated. `docs` is the author time of the commit that
// added the cycle's report, so merge→docs is Gate 5 up to its commit. Run by hand; no gate runs it and it writes no file.
//
// A spec or plan belongs to a cycle when its slug equals the branch name, with
// or without its `worktree-` prefixes. Failing that: among the files added after
// the previous merge on main and no later than the cycle's own merge, the one
// whose slug is the longest contained in the branch name. A commit counts as planning only when every
// file it touches is a spec, plan or brief: a spec committed together with any
// other file counts as execution, which can make plan→exec negative.
// Spec: docs/superpowers/specs/2026-10-14-m1-measurement-prose-rules-design.md

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const PLANNING_DIRS = ['docs/superpowers/specs/', 'docs/superpowers/plans/', 'docs/superpowers/briefs/'];
const DATED = /^\d{4}-\d{2}-\d{2}-/;

const lines = (md) => String(md ?? '').replace(/\r\n/g, '\n').split('\n');

/** @returns {string|null} the branch named by the report's `**Branch:**` line. */
export function parseReportBranch(md) {
  for (const l of lines(md)) {
    const m = /^\*\*Branch:\*\*\s+(\S+)\s+→\s+main\b/.exec(l);
    if (m) return m[1];
  }
  return null;
}

/** @returns {string|null} `YYYY-MM-DD HH:MM`, or null when absent or `unknown`. */
export function parseBriefStarted(md) {
  for (const l of lines(md)) {
    const m = /^\*\*Brief started:\*\*\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s*$/.exec(l);
    if (m) return m[1];
  }
  return null;
}

export function mergeSubjectMatches(subject, branch) {
  const exact = `Merge branch '${branch}'`;
  return subject === exact || subject.startsWith(`${exact}: `);
}

const slugOf = (name, suffix) => name.replace(DATED, '').slice(0, -suffix.length);

/**
 * @param {string[]} names bare filenames
 * @param {string} suffix '-design.md' for specs, '.md' for plans
 * @returns {string[]} the names whose slug `branch` contains
 */
export function containedSlugs(branch, names, suffix) {
  return names.filter((n) => {
    if (!DATED.test(n) || !n.endsWith(suffix)) return false;
    if (suffix === '.md' && (n.endsWith('-design.md') || n.endsWith('-brief.md'))) return false;
    const slug = slugOf(n, suffix);
    return slug !== '' && branch.includes(slug);
  });
}

/**
 * The one candidate whose slug equals the branch name, with or without its
 * `worktree-` prefixes. Otherwise, among candidates added after `from` and no
 * later than `to`, the one with the longest slug contained in `branch`; null on
 * a tie, a missing bound, or none.
 * @param {{name: string, addedAt: string|null}[]} candidates
 */
export function pickBySlug(branch, candidates, suffix, from, to) {
  const bare = branch.replace(/^(worktree-)+/, '');
  const exact = candidates.filter((c) => {
    const s = slugOf(c.name, suffix);
    return containedSlugs(branch, [c.name], suffix).length === 1 && (s === branch || s === bare);
  });
  if (exact.length === 1) return exact[0].name;
  const lo = toDate(from);
  const hi = toDate(to);
  if (lo === null || hi === null) return null;
  const inWindow = candidates.filter((c) => {
    const d = toDate(c.addedAt);
    return containedSlugs(branch, [c.name], suffix).length === 1 && d !== null && d > lo && d <= hi;
  });
  if (inWindow.length === 0) return null;
  const len = (c) => slugOf(c.name, suffix).length;
  const max = Math.max(...inWindow.map(len));
  const best = inWindow.filter((c) => len(c) === max);
  return best.length === 1 ? best[0].name : null;
}

export function isPlanningOnly(files) {
  return files.length > 0 && files.every((f) => PLANNING_DIRS.some((d) => f.startsWith(d)));
}

function toDate(t) {
  if (t === null || t === undefined) return null;
  const local = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/.exec(t);
  const d = new Date(local ? `${local[1]}T${local[2]}` : t);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function minutesBetween(a, b) {
  const da = toDate(a);
  const db = toDate(b);
  if (da === null || db === null) return null;
  return Math.round((db - da) / 60000);
}

function show(t) {
  const d = toDate(t);
  if (d === null) return 'unknown';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const MOMENTS = ['brief', 'spec', 'plan', 'execFirst', 'execLast', 'merge', 'docs'];

export function buildRow(c) {
  const cells = [c.branch, ...MOMENTS.map((k) => show(c[k]))];
  for (let i = 1; i < MOMENTS.length; i++) {
    const m = minutesBetween(c[MOMENTS[i - 1]], c[MOMENTS[i]]);
    cells.push(m === null ? 'unknown' : String(m));
  }
  return cells.join('\t');
}

/** Sort comparator: by merge time, rows without a merge last. */
export function compareByMerge(a, b) {
  const t = (r) => toDate(r.merge)?.getTime() ?? Infinity;
  return t(a) === t(b) ? 0 : t(a) < t(b) ? -1 : 1;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

let ROOT;

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// Newest first, as `git log` prints them.
function mergeLog() {
  return git(['log', '--merges', '--first-parent', 'main', '--format=%H%x09%aI%x09%s'])
    .split('\n')
    .map((l) => l.split('\t'))
    .filter(([, , s]) => s !== undefined);
}

/** The cycle's merge, plus the first-parent merge before it (the window's start). */
function findMerge(merges, branch) {
  const idx = merges.flatMap(([, , s], i) => (mergeSubjectMatches(s, branch) ? [i] : []));
  if (idx.length !== 1) return null;
  const [sha, at] = merges[idx[0]];
  const prev = merges[idx[0] + 1];
  return { sha, at, prevAt: prev ? prev[1] : null };
}

function execRange(sha) {
  // One record per commit: \0, then "<sha>\t<date>", then its files.
  const out = git(['log', '--no-merges', '--format=%x00%H%x09%aI', '--name-only', `${sha}^1..${sha}^2`]);
  const dates = out.split('\0').filter((r) => r.trim() !== '').flatMap((r) => {
    const [head, ...files] = r.split('\n').filter((l) => l !== '');
    return isPlanningOnly(files) ? [] : [head.split('\t')[1]];
  });
  dates.sort((a, b) => toDate(a) - toDate(b));
  return dates.length ? { first: dates[0], last: dates[dates.length - 1] } : null;
}

function addedAt(path) {
  const out = git(['log', '--diff-filter=A', '--format=%aI', '--', path]).trim().split('\n');
  return out[out.length - 1] || null;
}

function pick(branch, dir, names, suffix, merge) {
  const candidates = containedSlugs(branch, names, suffix)
    .map((name) => ({ name, addedAt: addedAt(`${dir}/${name}`) }));
  const name = pickBySlug(branch, candidates, suffix, merge.prevAt, merge.at);
  return name ? candidates.find((c) => c.name === name) : null;
}

function cycle(report, specs, plans, merges) {
  const branch = parseReportBranch(readFileSync(join(ROOT, report), 'utf8'));
  const c = { branch: branch ?? report, brief: null, spec: null, plan: null, execFirst: null, execLast: null, merge: null, docs: null };
  if (branch === null) return c;
  // The report's commit exists with or without a merge found.
  c.docs = addedAt(report);
  const merge = findMerge(merges, branch);
  // No merge, no window: every git field stays unknown.
  if (merge === null) return c;
  c.merge = merge.at;
  const ex = execRange(merge.sha);
  if (ex) { c.execFirst = ex.first; c.execLast = ex.last; }
  const spec = pick(branch, 'docs/superpowers/specs', specs, '-design.md', merge);
  if (spec) {
    c.spec = spec.addedAt;
    c.brief = parseBriefStarted(readFileSync(join(ROOT, 'docs/superpowers/specs', spec.name), 'utf8'));
  }
  const plan = pick(branch, 'docs/superpowers/plans', plans, '.md', merge);
  if (plan) c.plan = plan.addedAt;
  return c;
}

export function main() {
  ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const root = ROOT;
  const ls = (d) => readdirSync(join(root, d));
  const specs = ls('docs/superpowers/specs');
  const plans = ls('docs/superpowers/plans');
  const reports = ls('docs/superpowers/reports')
    .filter((n) => n.endsWith('-finish-cycle.md'))
    .map((n) => `docs/superpowers/reports/${n}`);
  const merges = mergeLog();
  const rows = reports.map((r) => cycle(r, specs, plans, merges));
  rows.sort(compareByMerge);
  const header = ['branch', ...MOMENTS, 'brief→spec', 'spec→plan', 'plan→exec', 'exec', 'exec→merge', 'merge→docs'];
  process.stdout.write([header.join('\t'), ...rows.map(buildRow)].join('\n') + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (e) {
    process.stderr.write(`cycle-times: ${e.stderr || e.message}\n`);
    process.exit(1);
  }
}
