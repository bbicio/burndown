import { describe, it, expect } from 'vitest';
import {
  parseReportBranch,
  parseBriefStarted,
  mergeSubjectMatches,
  containedSlugs,
  pickBySlug,
  compareByMerge,
  isPlanningOnly,
  minutesBetween,
  buildRow,
} from './cycle-times.mjs';

describe('parseReportBranch', () => {
  it('reads the branch, CRLF tolerated', () => {
    expect(parseReportBranch('# R\r\n**Branch:** backlog-follow-up → main\r\n')).toBe('backlog-follow-up');
  });
  it('ignores what follows "→ main"', () => {
    expect(parseReportBranch('**Branch:** worktree-claudemd-split-phase3 → main (merge `639f57a`)\n'))
      .toBe('worktree-claudemd-split-phase3');
  });
  it('returns null without a Branch line', () => {
    expect(parseReportBranch('# R\n**Date:** 2026-10-14\n')).toBeNull();
  });
});

describe('parseBriefStarted', () => {
  it('reads a timestamp, CRLF tolerated', () => {
    expect(parseBriefStarted('# S\r\n**Brief started:** 2026-10-14 11:17\r\n')).toBe('2026-10-14 11:17');
  });
  it('treats unknown as null', () => {
    expect(parseBriefStarted('**Brief started:** unknown\n')).toBeNull();
  });
  it('returns null when absent', () => {
    expect(parseBriefStarted('# S\n**Date:** 2026-10-14\n')).toBeNull();
  });
});

describe('mergeSubjectMatches', () => {
  it('matches the subject literally, dots included', () => {
    expect(mergeSubjectMatches("Merge branch 'a.b'", 'a.b')).toBe(true);
    expect(mergeSubjectMatches("Merge branch 'axb'", 'a.b')).toBe(false);
  });
  it('rejects a subject with any other suffix', () => {
    expect(mergeSubjectMatches("Merge branch 'm1-x' into main", 'm1-x')).toBe(false);
  });
  it('accepts a subject carrying a description after ": "', () => {
    expect(mergeSubjectMatches("Merge branch 'worktree-money': centralize money", 'worktree-money')).toBe(true);
    expect(mergeSubjectMatches("Merge branch 'worktree-money-x': y", 'worktree-money')).toBe(false);
  });
});

describe('containedSlugs', () => {
  it('lists every dated file whose slug the branch contains', () => {
    const names = ['2026-10-13-backlog-follow-up-design.md', '2026-10-12-approval-economy-design.md'];
    expect(containedSlugs('backlog-follow-up', names, '-design.md')).toEqual(['2026-10-13-backlog-follow-up-design.md']);
  });
  it('for plans, skips design and brief files', () => {
    const names = ['2026-10-13-backlog-follow-up.md', '2026-10-13-backlog-follow-up-design.md', '2026-10-13-backlog-brief.md'];
    expect(containedSlugs('backlog-follow-up', names, '.md')).toEqual(['2026-10-13-backlog-follow-up.md']);
  });
});

describe('pickBySlug', () => {
  const from = '2026-10-01T00:00:00+02:00';
  const to = '2026-10-10T00:00:00+02:00';
  const inside = '2026-10-05T10:00:00+02:00';
  it('takes the longest contained slug', () => {
    const c = [
      { name: '2026-07-02-finish-cycle-design.md', addedAt: inside },
      { name: '2026-10-05-finish-cycle-gate2-retry-design.md', addedAt: inside },
    ];
    expect(pickBySlug('worktree-finish-cycle-gate2-retry', c, '-design.md', from, to)).toBe('2026-10-05-finish-cycle-gate2-retry-design.md');
  });
  it('rejects a file added outside the cycle window', () => {
    const c = [{ name: '2026-07-27-dead-code-cleanup-design.md', addedAt: '2026-07-27T10:00:00+02:00' }];
    expect(pickBySlug('worktree-dead-code-cleanup-and-tooltip-wording', c, '-design.md', from, to)).toBeNull();
  });
  it('takes an exact slug (branch, minus any worktree- prefixes) even outside the window', () => {
    const c = [{ name: '2026-07-18-portfolio-vue-migration-design.md', addedAt: '2026-07-18T12:13:00+02:00' }];
    expect(pickBySlug('worktree-portfolio-vue-migration', c, '-design.md', from, to)).toBe(c[0].name);
    expect(pickBySlug('worktree-worktree-portfolio-vue-migration', c, '-design.md', null, null)).toBe(c[0].name);
  });
  it('is null on a tie in slug length, and without a window', () => {
    const c = [
      { name: '2026-10-05-aa-design.md', addedAt: inside },
      { name: '2026-10-06-bb-design.md', addedAt: inside },
    ];
    expect(pickBySlug('aa-bb', c, '-design.md', from, to)).toBeNull();
    expect(pickBySlug('x-aa', [c[0]], '-design.md', null, to)).toBeNull();
  });
});

describe('compareByMerge', () => {
  it('orders by merge time, unknown last', () => {
    const rows = [{ merge: null }, { merge: '2026-10-14T00:36:00+02:00' }, { merge: '2026-10-13T22:48:00+02:00' }];
    expect(rows.sort(compareByMerge).map((r) => r.merge)).toEqual(['2026-10-13T22:48:00+02:00', '2026-10-14T00:36:00+02:00', null]);
  });
});

describe('isPlanningOnly', () => {
  it('is true when every path is a spec, plan or brief', () => {
    expect(isPlanningOnly(['docs/superpowers/specs/x.md'])).toBe(true);
    expect(isPlanningOnly(['docs/superpowers/briefs/b.md', 'docs/superpowers/plans/p.md'])).toBe(true);
  });
  it('is false with any other path, or none', () => {
    expect(isPlanningOnly(['docs/superpowers/specs/x.md', 'scripts/a.js'])).toBe(false);
    expect(isPlanningOnly([])).toBe(false);
  });
});

describe('minutesBetween', () => {
  it('counts minutes between ISO timestamps', () => {
    expect(minutesBetween('2026-10-13T23:25:00+02:00', '2026-10-13T23:28:00+02:00')).toBe(3);
  });
  it('accepts the local YYYY-MM-DD HH:MM form', () => {
    expect(minutesBetween('2026-10-14 11:17', '2026-10-14 11:33')).toBe(16);
  });
  it('is null when either end is null', () => {
    expect(minutesBetween(null, '2026-10-13T23:28:00+02:00')).toBeNull();
    expect(minutesBetween('2026-10-14 11:17', null)).toBeNull();
  });
});

describe('buildRow', () => {
  it('prints unknown for every missing moment and interval', () => {
    const row = buildRow({ branch: 'b', brief: null, spec: null, plan: null, execFirst: null, execLast: null, merge: null, docs: null });
    const cells = row.split('\t');
    expect(cells[0]).toBe('b');
    expect(cells.slice(1)).toEqual(Array(13).fill('unknown'));
  });
  it('prints moments as YYYY-MM-DD HH:MM and intervals in minutes', () => {
    const row = buildRow({
      branch: 'b', brief: '2026-10-14 11:00', spec: '2026-10-14 11:30', plan: null,
      execFirst: null, execLast: null, merge: null, docs: null,
    });
    const cells = row.split('\t');
    expect(cells[1]).toBe('2026-10-14 11:00');
    expect(cells[2]).toBe('2026-10-14 11:30');
    expect(cells[8]).toBe('30');
    expect(cells[9]).toBe('unknown');
  });
  it('ends with the docs moment and the merge→docs interval', () => {
    const row = buildRow({
      branch: 'b', brief: null, spec: null, plan: null, execFirst: null, execLast: null,
      merge: '2026-10-28T13:52:27+01:00', docs: '2026-10-28T14:07:19+01:00',
    });
    const cells = row.split('\t');
    expect(cells).toHaveLength(14);
    expect(cells[13]).toBe('15');
  });
  it('a cycle whose report was never committed has docs and merge→docs unknown', () => {
    const row = buildRow({
      branch: 'b', brief: null, spec: null, plan: null, execFirst: null, execLast: null,
      merge: '2026-10-28T13:52:27+01:00', docs: null,
    });
    const cells = row.split('\t');
    expect(cells[7]).toBe('unknown');
    expect(cells[13]).toBe('unknown');
  });
});
