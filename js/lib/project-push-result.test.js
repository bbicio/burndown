import { describe, it, expect } from 'vitest';
import { summarizePushResult, summarizeGenerateResult } from './project-push-result.js';

describe('summarizePushResult', () => {
  it('reports ok with no message when nothing failed', () => {
    expect(summarizePushResult([])).toEqual({ ok: true, message: '' });
  });

  it('treats a missing failure list as ok', () => {
    expect(summarizePushResult(undefined)).toEqual({ ok: true, message: '' });
  });

  it('names the untried sections when the core upsert failed', () => {
    const r = summarizePushResult([{ part: 'project', code: 'PROJECT_RULE', reason: 'why' }]);
    expect(r.ok).toBe(false);
    expect(r.message).toBe('Save failed: project details were not saved, so tasks, phasing, PTC, monthly planning and role groups were not attempted. Fix the issue and press Save again. Reason: why');
  });

  it('a project failure without a server reason has no Reason suffix', () => {
    const r = summarizePushResult([{ part: 'project', error: 'HTTP 500' }]);
    expect(r.message).toBe('Save failed: project details were not saved, so tasks, phasing, PTC, monthly planning and role groups were not attempted. Fix the issue and press Save again.');
  });

  it('a tasks failure carried with the period names the period', () => {
    const r = summarizePushResult([{ part: 'tasks', withPeriod: true }]);
    expect(r.message).toContain('tasks and the project period were not saved');
  });

  it('names a single failed sub-resource with a readable label', () => {
    const r = summarizePushResult([{ part: 'phasing', error: 'x' }]);
    expect(r.ok).toBe(false);
    expect(r.message).toBe('Save failed: phasing was not saved. Fix the issue and press Save again.');
  });

  it('joins several failed parts in a readable list', () => {
    const r = summarizePushResult([
      { part: 'tasks', error: 'a' },
      { part: 'ptc', error: 'b' },
      { part: 'groups', error: 'c' },
    ]);
    expect(r.message).toBe('Save failed: tasks, PTC and role groups were not saved. Fix the issue and press Save again.');
  });

  it('falls back to the raw part name for an unknown part', () => {
    const r = summarizePushResult([{ part: 'mystery', error: 'x' }]);
    expect(r.message).toContain('mystery');
    expect(r.ok).toBe(false);
  });
});

describe('summarizePushResult — server reason', () => {
  const reason = 'Project end date (2026-07) is before its start date (2026-09).';
  it('appends the server reason for DATE_RULE', () => {
    const r = summarizePushResult([{ part: 'project', error: 'x', code: 'DATE_RULE', reason }]);
    expect(r.message.endsWith(` Reason: ${reason}`)).toBe(true);
  });
  it('appends it for PROJECT_RULE and STRUCTURE_RULE too', () => {
    for (const code of ['PROJECT_RULE', 'STRUCTURE_RULE']) {
      expect(summarizePushResult([{ part: 'project', error: 'x', code, reason }]).message).toContain(` Reason: ${reason}`);
    }
  });
  it('leaves the message unchanged for another code or an empty reason', () => {
    const base = summarizePushResult([{ part: 'project', error: 'x' }]).message;
    expect(summarizePushResult([{ part: 'project', error: 'x', code: 'OTHER', reason }]).message).toBe(base);
    expect(summarizePushResult([{ part: 'project', error: 'x', code: 'DATE_RULE', reason: '' }]).message).toBe(base);
  });
});

describe('summarizePushResult — MONEY_RULE', () => {
  it('appends the reason for MONEY_RULE', () => {
    const r = summarizePushResult([{ part: 'ptc', code: 'MONEY_RULE', reason: 'PTC has too many decimals' }]);
    expect(r.message.endsWith(' Reason: PTC has too many decimals')).toBe(true);
  });
});

describe('summarizeGenerateResult', () => {
  it('is empty when nothing failed', () => {
    expect(summarizeGenerateResult('X', [])).toBe('');
    expect(summarizeGenerateResult('X', undefined)).toBe('');
  });
  it('ignores a lone project failure', () => {
    expect(summarizeGenerateResult('X', [{ part: 'project', error: 'HTTP 500' }])).toBe('');
  });
  it('names one failed part with its reason', () => {
    expect(summarizeGenerateResult('X', [{ part: 'ptc', code: 'MONEY_RULE', reason: 'bad PTC' }]))
      .toBe('Project "X" was created, but its PTC was not saved. Reason: bad PTC');
  });
  it('joins several parts and takes the first reason', () => {
    expect(summarizeGenerateResult('X', [
      { part: 'tasks', code: 'DATE_RULE', reason: 'out of period' },
      { part: 'ptc', code: 'MONEY_RULE', reason: 'bad PTC' },
    ])).toBe('Project "X" was created, but its tasks and PTC were not saved. Reason: out of period');
  });
  it('has no Reason suffix without a server reason', () => {
    expect(summarizeGenerateResult('X', [{ part: 'phasing', error: 'HTTP 500' }]))
      .toBe('Project "X" was created, but its phasing was not saved.');
  });
});
