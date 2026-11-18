import { describe, it, expect, afterAll, vi } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, realpathSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EVENTS, sanitize, parseLog, durations, renderLines } from './cycle-report.mjs';

vi.setConfig({ testTimeout: 60000 }); // builds temp git repos; slow on Windows

const SCRIPT = join(import.meta.dirname, 'cycle-report.mjs');
const made = [];
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
const tmp = (p) => { const d = realpathSync.native(mkdtempSync(join(tmpdir(), p))); made.push(d); return d; };
const cli = (cwd, ...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });

const at = (hhmm) => new Date(`2026-11-18T${hhmm}:00`).toISOString();

describe('parseLog', () => {
  it('keeps the first occurrence of each event and skips malformed or unknown lines', () => {
    const ev = parseLog([`${at('10:00')} preflight`, 'garbage', `${at('10:05')} gate1`, `${at('10:09')} gate1`, `${at('10:06')} lunch`, ''].join('\n'));
    expect([...ev.keys()]).toEqual(['preflight', 'gate1']);
    expect(ev.get('gate1').toISOString()).toBe(at('10:05'));
  });
});

describe('durations', () => {
  it('gives whole minutes between consecutive gate entries and unknown when an end is missing', () => {
    const ev = parseLog(['preflight 10:00', 'gate1 10:00', 'gate2 10:05', 'gate3 10:20', 'gate4 10:40', 'gate5 10:45', 'report 10:50']
      .map((l) => { const [e, t] = l.split(' '); return `${at(t)} ${e}`; }).join('\n'));
    expect(durations(ev)).toEqual({ gate1: 5, gate2: 15, gate3: 20, gate4: 5, gate5: 5, total: 50 });
    ev.delete('gate3');
    expect(durations(ev)).toMatchObject({ gate2: 'unknown', gate3: 'unknown', total: 50 });
  });
});

describe('renderLines', () => {
  it('prints the report header lines and one line per commit, unknown where missing', () => {
    const ev = parseLog(`${at('10:00')} preflight\n${at('10:00')} gate1\n${at('10:05')} gate2`);
    const out = renderLines(ev, ['abc1234 first', 'def5678 second']).join('\n');
    expect(out).toMatch(/^\*\*Execution started:\*\* 2026-11-18 10:00$/m);
    expect(out).toMatch(/^\*\*Merged at:\*\* unknown$/m);
    expect(out).toMatch(/^\*\*Gate durations:\*\* Gate 1 5m · Gate 2 unknown · Gate 3 unknown · Gate 4 unknown · Gate 5 \(to report\) unknown — total unknown$/m);
    expect(out).toMatch(/^- `abc1234` first$/m);
    expect(out).toMatch(/^- `def5678` second$/m);
  });
});

describe('the command line', () => {
  it('mark from a worktree writes once into the main checkout log; render finds the merge', () => {
    const main = tmp('cycle-report-main-');
    git(main, 'init', '-q', '-b', 'main');
    git(main, 'config', 'user.name', 'T');
    git(main, 'config', 'user.email', 't@example.invalid');
    writeFileSync(join(main, 'a.txt'), 'a');
    git(main, 'add', '-A');
    git(main, 'commit', '-q', '-m', 'init');
    git(main, 'branch', 'feat/x');
    const wt = join(tmp('cycle-report-wt-'), 'wt');
    git(main, 'worktree', 'add', '-q', wt, 'feat/x');
    writeFileSync(join(wt, 'b.txt'), 'b');
    git(wt, 'add', '-A');
    git(wt, 'commit', '-q', '-m', 'add b');

    expect(cli(wt, 'mark', 'preflight').status).toBe(0);
    expect(cli(wt, 'mark', 'gate1').status).toBe(0);
    expect(cli(wt, 'mark', 'gate1').status).toBe(0);
    const log = join(main, '.superpowers', 'cycle-log', `${sanitize('feat/x')}.log`);
    expect(existsSync(log)).toBe(true);
    const lines = readFileSync(log, 'utf8').trim().split('\n');
    expect(lines.map((l) => l.split(' ')[1])).toEqual(['preflight', 'gate1']);

    const bad = cli(wt, 'mark', 'lunch');
    expect(bad.status).not.toBe(0);
    expect(bad.stderr).toMatch(/unknown event: lunch/);

    git(main, 'merge', '-q', '--no-ff', 'feat/x', '-m', "Merge branch 'feat/x'");
    const r = cli(main, 'render', '--branch', 'feat/x');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^\*\*Execution started:\*\* \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/m);
    expect(r.stdout).toMatch(/^- `[0-9a-f]{7,}` add b$/m);
  });

  it('knows exactly the eight events', () => {
    expect(EVENTS).toEqual(['preflight', 'gate1', 'gate2', 'gate3', 'gate4', 'merged', 'gate5', 'report']);
  });
});

describe('the command line, arguments and log reuse', () => {
  const repoWithBranch = (branch) => {
    const d = tmp('cycle-report-args-');
    git(d, 'init', '-q', '-b', 'main');
    git(d, 'config', 'user.name', 'T');
    git(d, 'config', 'user.email', 't@example.invalid');
    writeFileSync(join(d, 'a.txt'), 'a');
    git(d, 'add', '-A');
    git(d, 'commit', '-q', '-m', 'init');
    if (branch) git(d, 'checkout', '-q', '-b', branch);
    return d;
  };
  const logOf = (d, b) => readFileSync(join(d, '.superpowers', 'cycle-log', `${sanitize(b)}.log`), 'utf8').trim().split('\n').map((l) => l.split(' ')[1]);

  it('refuses a --branch with no value or a flag as its value', () => {
    const d = repoWithBranch('feat');
    expect(cli(d, 'mark', 'gate1', '--branch').stderr).toMatch(/--branch needs a branch name/);
    expect(cli(d, 'mark', 'gate1', '--branch', '--x').status).not.toBe(0);
  });

  it('takes the event from the first argument that is not a flag', () => {
    const d = repoWithBranch('feat');
    expect(cli(d, 'mark', '--branch', 'feat', 'gate1').status).toBe(0);
    expect(logOf(d, 'feat')).toEqual(['gate1']);
  });

  it('refuses to mark on main without --branch', () => {
    const d = repoWithBranch(null);
    const r = cli(d, 'mark', 'gate5');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/pass --branch/);
  });

  it('a preflight on a log that already reached merged starts a new log', () => {
    const d = repoWithBranch('feat');
    for (const e of ['preflight', 'gate1', 'merged']) expect(cli(d, 'mark', e).status).toBe(0);
    const draft = join(d, '.superpowers', 'cycle-log', 'feat.draft.md');
    writeFileSync(draft, 'old judgement');
    expect(cli(d, 'mark', 'preflight').status).toBe(0);
    expect(logOf(d, 'feat')).toEqual(['preflight']);
    expect(existsSync(draft)).toBe(false);
  });
});
