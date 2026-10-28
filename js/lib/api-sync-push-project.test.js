import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';

// _pushProjectToApiDetailed: a refused project PATCH (PROJECT_RULE, DATE_RULE) is final, never retried as a POST.
const js = readFileSync('js/api-sync.js', 'utf8');
let api;

function build() {
  return new Function('Api', 'window', `${extractBlock(js, 'async function _pushProjectToApiDetailed(')}; return _pushProjectToApiDetailed;`)(api, {});
}

describe('_pushProjectToApiDetailed — refusals are final', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    api = { projects: { update: vi.fn(), create: vi.fn(async () => {}) } };
  });

  for (const code of ['PROJECT_RULE', 'DATE_RULE']) {
    it(`${code} on the PATCH is not retried as a POST and carries code and reason`, async () => {
      api.projects.update.mockRejectedValue(Object.assign(new Error('400'), { data: { code, error: 'why' } }));
      const r = await build()({ id: 'p1', name: 'P' });
      expect(api.projects.create).not.toHaveBeenCalled();
      expect(r.ok).toBe(false);
      expect(r.failed[0]).toMatchObject({ part: 'project', code, reason: 'why' });
    });
  }

  it('any other PATCH failure still falls back to a POST', async () => {
    api.projects.update.mockRejectedValue(Object.assign(new Error('404'), { data: { code: 'NOPE' } }));
    await build()({ id: 'p1', name: 'P' });
    expect(api.projects.create).toHaveBeenCalledTimes(1);
  });

  it('a sub-resource failure carries the server code and reason', async () => {
    api.projects.update.mockResolvedValue();
    api.projects.saveTasks = vi.fn().mockRejectedValue(Object.assign(new Error('400'), { data: { code: 'DATE_RULE', error: 'bad task' } }));
    const r = await build()({ id: 'p1', name: 'P', tasks: [{}] });
    expect(r.failed[0]).toMatchObject({ part: 'tasks', code: 'DATE_RULE', reason: 'bad task' });
  });
});

describe('_pushProjectToApiDetailed — the period travels with the tasks', () => {
  const period = { startDate: '202601', endDate: '202612' };
  let calls;
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    calls = [];
    const rec = (n, v) => vi.fn(async (...a) => { calls.push(n); return v; });
    api = { projects: { update: rec('patch'), create: rec('post'), saveTasks: rec('tasks'), phasing: rec('phasing'), ptc: rec('ptc'), planning: rec('planning'), groups: rec('groups') } };
  });

  it('with tasks to send, the PATCH carries no period and saveTasks gets { tasks, period }', async () => {
    await build()({ id: 'p1', name: 'P', ...period, tasks: [{ id: 't' }] });
    const body = api.projects.update.mock.calls[0][1];
    expect(body).not.toHaveProperty('startDate');
    expect(body).not.toHaveProperty('endDate');
    expect(api.projects.saveTasks).toHaveBeenCalledWith('p1', { tasks: [{ id: 't' }], period });
  });

  it('without tasks (skipEmpty and []), the PATCH carries the period and saveTasks is not called', async () => {
    await build()({ id: 'p1', name: 'P', ...period, tasks: [] }, { skipEmpty: true });
    expect(api.projects.update.mock.calls[0][1]).toMatchObject(period);
    expect(api.projects.saveTasks).not.toHaveBeenCalled();
  });

  it('a PATCH 404 falls back to a POST with the full period, then saveTasks with the same period', async () => {
    api.projects.update.mockRejectedValue(Object.assign(new Error('404'), { data: {} }));
    await build()({ id: 'p1', name: 'P', ...period, tasks: [{ id: 't' }] });
    expect(api.projects.create.mock.calls[0][0]).toMatchObject({ id: 'p1', ...period });
    expect(api.projects.saveTasks).toHaveBeenCalledWith('p1', { tasks: [{ id: 't' }], period });
  });

  it('a refused saveTasks is reported with withPeriod: true', async () => {
    api.projects.saveTasks.mockRejectedValue(Object.assign(new Error('400'), { data: { code: 'DATE_RULE', error: 'bad' } }));
    const r = await build()({ id: 'p1', name: 'P', ...period, tasks: [{}] });
    expect(r.failed[0]).toMatchObject({ part: 'tasks', withPeriod: true, code: 'DATE_RULE', reason: 'bad' });
  });

  it('calls PATCH, tasks, phasing, ptc, planning, groups in order', async () => {
    await build()({ id: 'p1', name: 'P', ...period, tasks: [{}], phasing: {}, ptc: [], planning: {}, groups: [] });
    expect(calls).toEqual(['patch', 'tasks', 'phasing', 'ptc', 'planning', 'groups']);
  });
});
