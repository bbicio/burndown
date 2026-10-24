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
