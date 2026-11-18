// The mechanical lines of a /finish-cycle report, from a per-branch timestamp log and git.
//
// Usage:
//   node scripts/cycle-report.mjs mark <event> [--branch <name>]   append the event's time, once
//   node scripts/cycle-report.mjs render [--branch <name>]         print the report's header lines
//
// The log is <main checkout>/.superpowers/cycle-log/<branch with / as ->.log (gitignored): a worktree
// writes into its main checkout's log, so the log outlives the worktree removed at Gate 4. One line per
// event, `<ISO time> <event>`; a second mark of the same event is ignored (a re-entry is not an entry).
// `render` finds the branch's merge by git's default subject, `Merge branch '<branch>'`. A time or a
// merge it cannot find prints `unknown`, never an estimate. Counters (dispatches, review rounds, suite
// runs) and every judgement stay hand-written in the report.
// Spec: docs/superpowers/specs/2026-11-18-process-speed-2-design.md

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const EVENTS = ['preflight', 'gate1', 'gate2', 'gate3', 'gate4', 'merged', 'gate5', 'report'];

const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();

export const sanitize = (branch) => String(branch).replaceAll('/', '-');

/** The main checkout's root, also when cwd is a linked worktree. */
export function mainRoot(cwd) {
  const common = git(cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  return dirname(resolve(common));
}

export const logPath = (root, branch) => join(root, '.superpowers', 'cycle-log', `${sanitize(branch)}.log`);

/** @returns {Map<string, Date>} the first time of each known event. */
export function parseLog(text) {
  const events = new Map();
  for (const line of String(text ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const m = /^(\S+)\s+(\S+)\s*$/.exec(line);
    if (!m || !EVENTS.includes(m[2]) || events.has(m[2])) continue;
    const t = new Date(m[1]);
    if (!Number.isNaN(t.getTime())) events.set(m[2], t);
  }
  return events;
}

const minutes = (events, from, to) =>
  events.has(from) && events.has(to) ? Math.round((events.get(to) - events.get(from)) / 60000) : 'unknown';

/** Each gate lasts from its entry to the next gate's entry; Gate 5 up to the report. */
export function durations(events) {
  return {
    gate1: minutes(events, 'gate1', 'gate2'),
    gate2: minutes(events, 'gate2', 'gate3'),
    gate3: minutes(events, 'gate3', 'gate4'),
    gate4: minutes(events, 'gate4', 'gate5'),
    gate5: minutes(events, 'gate5', 'report'),
    total: minutes(events, 'preflight', 'report'),
  };
}

const pad = (n) => String(n).padStart(2, '0');
const local = (t) => (t ? `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}` : 'unknown');
const m = (v) => (v === 'unknown' ? v : `${v}m`);

/** @param {string[]} commits `<short sha> <subject>` lines, oldest first. */
export function renderLines(events, commits) {
  const d = durations(events);
  return [
    `**Execution started:** ${local(events.get('preflight'))}`,
    `**Merged at:** ${local(events.get('merged'))}`,
    `**Gate durations:** Gate 1 ${m(d.gate1)} · Gate 2 ${m(d.gate2)} · Gate 3 ${m(d.gate3)} · Gate 4 ${m(d.gate4)} · Gate 5 (to report) ${m(d.gate5)} — total ${m(d.total)}`,
    '',
    ...(commits.length ? commits.map((c) => { const [h, ...s] = c.split(' '); return `- \`${h}\` ${s.join(' ')}`; }) : ['- unknown (merge not found)']),
  ];
}

/** The branch's own commits, from its merge into main. */
export function branchCommits(root, branch) {
  const merges = git(root, 'log', 'main', '--merges', '--format=%H%x09%s').split('\n').filter(Boolean);
  const hit = merges.map((l) => l.split('\t')).find(([, s]) => s === `Merge branch '${branch}'`);
  if (!hit) return [];
  return git(root, 'log', '--reverse', '--format=%h %s', `${hit[0]}^1..${hit[0]}^2`).split('\n').filter(Boolean);
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const bi = rest.indexOf('--branch');
  const branch = bi >= 0 ? rest[bi + 1] : git(process.cwd(), 'branch', '--show-current');
  const root = mainRoot(process.cwd());
  const file = logPath(root, branch);
  if (cmd === 'mark') {
    const event = rest[0];
    if (!EVENTS.includes(event)) { process.stderr.write(`unknown event: ${event}\n`); return 2; }
    const have = existsSync(file) ? parseLog(readFileSync(file, 'utf8')) : new Map();
    if (have.has(event)) return 0;
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${new Date().toISOString()} ${event}\n`);
    return 0;
  }
  if (cmd === 'render') {
    const events = existsSync(file) ? parseLog(readFileSync(file, 'utf8')) : new Map();
    process.stdout.write(renderLines(events, branchCommits(root, branch)).join('\n') + '\n');
    return 0;
  }
  process.stderr.write('usage: cycle-report.mjs mark <event> [--branch <name>] | render [--branch <name>]\n');
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main(process.argv.slice(2));
