import { describe, it, expect } from 'vitest';
import { summarizePushResult } from './project-push-result.js';

describe('summarizePushResult', () => {
  it('reports ok with no message when nothing failed', () => {
    expect(summarizePushResult([])).toEqual({ ok: true, message: '' });
  });

  it('treats a missing failure list as ok', () => {
    expect(summarizePushResult(undefined)).toEqual({ ok: true, message: '' });
  });

  it('names the project details when the core upsert failed', () => {
    const r = summarizePushResult([{ part: 'project', error: 'HTTP 500' }]);
    expect(r.ok).toBe(false);
    expect(r.message).toBe('Save failed: project details were not saved. Fix the issue and press Save again.');
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
