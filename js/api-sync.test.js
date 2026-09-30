import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

// api-sync.js is a classic (non-module) script full of globals; load it the way a page would, against a fake Api.
// Path is relative to the repo root (vitest's cwd): import.meta.url is not a file: URL in the jsdom environment.
const src = readFileSync('js/api-sync.js', 'utf8');
let calls;
let failing;

function loadSync() {
  const fake = new Proxy({}, { get: (_, part) => (...args) => {
    calls.push(part);
    if (failing.has(part)) return Promise.reject(new Error(`${part} down`));
    return Promise.resolve({});
  } });
  const Api = { projects: {
    update: fake.update, create: fake.create, saveTasks: fake.saveTasks,
    phasing: fake.phasing, ptc: fake.ptc, planning: fake.planning, groups: fake.groups,
  } };
  return new Function('Api', `${src}\nreturn { _pushProjectToApiDetailed, _pushProjectToApi };`)(Api);
}

const base = { id: 'p1', name: 'P', currency: '€', clientId: null };

describe('_pushProjectToApiDetailed', () => {
  beforeEach(() => { calls = []; failing = new Set(); });

  it('pushes every sub-resource, including empty ones, so clearing a section reaches the server', async () => {
    const { _pushProjectToApiDetailed } = loadSync();
    const r = await _pushProjectToApiDetailed({ ...base, tasks: [], phasing: {}, ptc: [], planning: {}, groups: [] });
    expect(r).toEqual({ ok: true, failed: [] });
    expect(calls).toEqual(['update', 'saveTasks', 'phasing', 'ptc', 'planning', 'groups']);
  });

  it('skips a sub-resource that is absent from the project object', async () => {
    const { _pushProjectToApiDetailed } = loadSync();
    await _pushProjectToApiDetailed({ ...base, tasks: [{ name: 't' }] });
    expect(calls).toEqual(['update', 'saveTasks']);
  });

  it('reports a failed sub-resource and still attempts the others', async () => {
    failing.add('phasing');
    const { _pushProjectToApiDetailed } = loadSync();
    const r = await _pushProjectToApiDetailed({ ...base, tasks: [], phasing: {}, groups: [] });
    expect(r.ok).toBe(false);
    expect(r.failed).toEqual([{ part: 'phasing', error: 'phasing down' }]);
    expect(calls).toEqual(['update', 'saveTasks', 'phasing', 'groups']);
  });

  it('stops after a failed core upsert and skips the sub-resources', async () => {
    failing.add('update'); failing.add('create');
    const { _pushProjectToApiDetailed } = loadSync();
    const r = await _pushProjectToApiDetailed({ ...base, tasks: [], phasing: {} });
    expect(r.ok).toBe(false);
    expect(r.failed.map(f => f.part)).toEqual(['project']);
    expect(calls).toEqual(['update', 'create']);
  });
});

describe('_pushProjectToApi (legacy contract)', () => {
  beforeEach(() => { calls = []; failing = new Set(); });

  it('stays true when only a sub-resource failed', async () => {
    failing.add('tasks');
    const { _pushProjectToApi } = loadSync();
    expect(await _pushProjectToApi({ ...base, tasks: [] })).toBe(true);
  });

  it('is false when the core upsert failed', async () => {
    failing.add('update'); failing.add('create');
    const { _pushProjectToApi } = loadSync();
    expect(await _pushProjectToApi({ ...base })).toBe(false);
  });
});

describe('skipEmpty', () => {
  beforeEach(() => { calls = []; failing = new Set(); });

  it('does not push empty sections, but still pushes non-empty ones', async () => {
    const { _pushProjectToApiDetailed } = loadSync();
    const r = await _pushProjectToApiDetailed(
      { ...base, tasks: [{ name: 't' }], phasing: {}, ptc: [], planning: { '2026-09': 5 }, groups: [] },
      { skipEmpty: true });
    expect(r.ok).toBe(true);
    expect(calls).toEqual(['update', 'saveTasks', 'planning']);
  });

  it('pushes empty sections when the option is absent (project-config clearing a section)', async () => {
    const { _pushProjectToApiDetailed } = loadSync();
    await _pushProjectToApiDetailed({ ...base, tasks: [], phasing: {}, ptc: [], planning: {}, groups: [] });
    expect(calls).toEqual(['update', 'saveTasks', 'phasing', 'ptc', 'planning', 'groups']);
  });

  it('_pushProjectToApi forwards the option and keeps its boolean contract', async () => {
    const { _pushProjectToApi } = loadSync();
    expect(await _pushProjectToApi({ ...base, tasks: [], phasing: {} }, { skipEmpty: true })).toBe(true);
    expect(calls).toEqual(['update']);
  });
});
