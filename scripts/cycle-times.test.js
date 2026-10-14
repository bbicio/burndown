import { describe, it, expect } from 'vitest';
import {
  parseReportBranch,
  parseBriefStarted,
  mergeSubjectMatches,
  matchBySlug,
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
  it('rejects a subject with a suffix', () => {
    expect(mergeSubjectMatches("Merge branch 'm1-x' into main", 'm1-x')).toBe(false);
  });
});

describe('matchBySlug', () => {
  it('returns the single file whose slug the branch contains', () => {
    const names = ['2026-10-13-backlog-follow-up-design.md', '2026-10-12-approval-economy-design.md'];
    expect(matchBySlug('backlog-follow-up', names, '-design.md')).toBe('2026-10-13-backlog-follow-up-design.md');
  });
  it('returns null when two slugs are contained in the branch', () => {
    const names = ['2026-09-25-team-ux-design.md', '2026-09-28-team-ux-polish-design.md'];
    expect(matchBySlug('worktree-team-ux-polish', names, '-design.md')).toBeNull();
  });
  it('returns null on no hit', () => {
    expect(matchBySlug('m3-m2-process-dedup', ['2026-10-13-backlog-follow-up-design.md'], '-design.md')).toBeNull();
  });
  it('for plans, skips design and brief files', () => {
    const names = ['2026-10-13-backlog-follow-up.md', '2026-10-13-backlog-follow-up-design.md', '2026-10-13-backlog-brief.md'];
    expect(matchBySlug('backlog-follow-up', names, '.md')).toBe('2026-10-13-backlog-follow-up.md');
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
    const row = buildRow({ branch: 'b', brief: null, spec: null, plan: null, execFirst: null, execLast: null, merge: null });
    const cells = row.split('\t');
    expect(cells[0]).toBe('b');
    expect(cells.slice(1)).toEqual(Array(11).fill('unknown'));
  });
  it('prints moments as YYYY-MM-DD HH:MM and intervals in minutes', () => {
    const row = buildRow({
      branch: 'b', brief: '2026-10-14 11:00', spec: '2026-10-14 11:30', plan: null,
      execFirst: null, execLast: null, merge: null,
    });
    const cells = row.split('\t');
    expect(cells[1]).toBe('2026-10-14 11:00');
    expect(cells[2]).toBe('2026-10-14 11:30');
    expect(cells[7]).toBe('30');
    expect(cells[8]).toBe('unknown');
  });
});
