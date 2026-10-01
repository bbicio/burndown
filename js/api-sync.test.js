import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

// api-sync.js is a classic (non-module) script full of globals; load it the way a page would, against a fake Api.
// Path is relative to the repo root (vitest's cwd): import.meta.url is not a file: URL in the jsdom environment.
const src = readFileSync('js/api-sync.js', 'utf8');
let calls;
let failing;
let argsByPart = {};
let refused = new Set();   // parts the server answers with a project-rule refusal (400, code PROJECT_RULE)

function loadSync() {
  const fake = new Proxy({}, { get: (_, part) => (...args) => {
    calls.push(part);
    argsByPart[part] = args;
    if (refused.has(part)) return Promise.reject(Object.assign(new Error(`${part} refused by a rule`), { data: { code: 'PROJECT_RULE' } }));
    if (failing.has(part)) return Promise.reject(new Error(`${part} down`));
    return Promise.resolve({});
  } });
  const Api = { projects: {
    update: fake.update, create: fake.create, saveTasks: fake.saveTasks,
    phasing: fake.phasing, ptc: fake.ptc, planning: fake.planning, groups: fake.groups,
  } };
  return new Function('Api', `${src}\nreturn { _pushProjectToApiDetailed, _pushProjectToApi, _apiProjectToLocal };`)(Api);
}

const base = { id: 'p1', name: 'P', currency: 'EUR', clientId: null };

describe('a refusal by the project rules is final (not retried as a create)', () => {
  beforeEach(() => { calls = []; failing = new Set(); argsByPart = {}; refused = new Set(); });

  it('does not fall back to create after a PROJECT_RULE refusal and reports its message', async () => {
    refused.add('update');
    const { _pushProjectToApiDetailed } = loadSync();
    const r = await _pushProjectToApiDetailed({ ...base, currency: 'USD', tasks: [] });
    expect(r.ok).toBe(false);
    expect(r.failed).toEqual([{ part: 'project', error: 'update refused by a rule' }]);
    expect(calls).toEqual(['update']);
  });

  it('still falls back to create for any other failure of the update (a project that does not exist yet)', async () => {
    failing.add('update');
    const { _pushProjectToApiDetailed } = loadSync();
    const r = await _pushProjectToApiDetailed({ ...base, tasks: [] });
    expect(r.ok).toBe(true);
    expect(calls.slice(0, 2)).toEqual(['update', 'create']);
  });
});

describe('project currency is an ISO code in memory and on the wire', () => {
  beforeEach(() => { calls = []; failing = new Set(); argsByPart = {}; refused = new Set(); });

  it('keeps the code when loading a project from the API', () => {
    const { _apiProjectToLocal } = loadSync();
    expect(_apiProjectToLocal({ id: 'p', currency: 'USD' }).currency).toBe('USD');
    expect(_apiProjectToLocal({ id: 'p', currency: 'CHF' }).currency).toBe('CHF');
    expect(_apiProjectToLocal({ id: 'p' }).currency).toBe('EUR');
  });

  it('sends the code unchanged when saving', async () => {
    const { _pushProjectToApiDetailed } = loadSync();
    await _pushProjectToApiDetailed({ ...base, currency: 'GBP', tasks: [] });
    expect(argsByPart.update[1].currency).toBe('GBP');
  });
});

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
