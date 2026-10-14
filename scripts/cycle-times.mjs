// Prints the timeline of every closed cycle, derived from git.
//
// Usage: node scripts/cycle-times.mjs
//
// One cycle per docs/superpowers/reports/*-finish-cycle.md. Columns: branch;
// six moments (Brief started, Spec committed, Plan committed, first and last
// execution commit, merge); then the five intervals between consecutive
// moments, in minutes. A value git cannot give is `unknown`, never estimated.
// Run by hand; no gate runs it and it writes no file.
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
  return subject === `Merge branch '${branch}'`;
}

/**
 * @param {string[]} names bare filenames
 * @param {string} suffix '-design.md' for specs, '.md' for plans
 * @returns {string|null} the one name whose slug `branch` contains, else null
 */
export function matchBySlug(branch, names, suffix) {
  const hits = names.filter((n) => {
    if (!DATED.test(n) || !n.endsWith(suffix)) return false;
    if (suffix === '.md' && (n.endsWith('-design.md') || n.endsWith('-brief.md'))) return false;
    const slug = n.replace(DATED, '').slice(0, -suffix.length);
    return slug !== '' && branch.includes(slug);
  });
  return hits.length === 1 ? hits[0] : null;
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

const MOMENTS = ['brief', 'spec', 'plan', 'execFirst', 'execLast', 'merge'];

export function buildRow(c) {
  const cells = [c.branch, ...MOMENTS.map((k) => show(c[k]))];
  for (let i = 1; i < MOMENTS.length; i++) {
    const m = minutesBetween(c[MOMENTS[i - 1]], c[MOMENTS[i]]);
    cells.push(m === null ? 'unknown' : String(m));
  }
  return cells.join('\t');
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function mergeLog() {
  return git(['log', '--merges', '--first-parent', 'main', '--format=%H%x09%aI%x09%s'])
    .split('\n')
    .map((l) => l.split('\t'))
    .filter(([, , s]) => s !== undefined);
}

function findMerge(merges, branch) {
  const hits = merges.filter(([, , s]) => mergeSubjectMatches(s, branch));
  return hits.length === 1 ? { sha: hits[0][0], at: hits[0][1] } : null;
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

function cycle(root, report, specs, plans, merges) {
  const branch = parseReportBranch(readFileSync(join(root, report), 'utf8'));
  const c = { branch: branch ?? report, brief: null, spec: null, plan: null, execFirst: null, execLast: null, merge: null };
  if (branch === null) return c;
  const spec = matchBySlug(branch, specs, '-design.md');
  const plan = matchBySlug(branch, plans, '.md');
  if (spec) {
    c.spec = addedAt(`docs/superpowers/specs/${spec}`);
    c.brief = parseBriefStarted(readFileSync(join(root, 'docs/superpowers/specs', spec), 'utf8'));
  }
  if (plan) c.plan = addedAt(`docs/superpowers/plans/${plan}`);
  const merge = findMerge(merges, branch);
  if (merge) {
    c.merge = merge.at;
    const ex = execRange(merge.sha);
    if (ex) { c.execFirst = ex.first; c.execLast = ex.last; }
  }
  return c;
}

export function main() {
  const root = git(['rev-parse', '--show-toplevel']).trim();
  const ls = (d) => readdirSync(join(root, d));
  const specs = ls('docs/superpowers/specs');
  const plans = ls('docs/superpowers/plans');
  const reports = ls('docs/superpowers/reports')
    .filter((n) => n.endsWith('-finish-cycle.md'))
    .map((n) => `docs/superpowers/reports/${n}`);
  const merges = mergeLog();
  const rows = reports.map((r) => cycle(root, r, specs, plans, merges));
  const t = (r) => toDate(r.merge)?.getTime() ?? Infinity;
  rows.sort((a, b) => (t(a) === t(b) ? 0 : t(a) < t(b) ? -1 : 1));
  const header = ['branch', ...MOMENTS, 'brief→spec', 'spec→plan', 'plan→exec', 'exec', 'exec→merge'];
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
