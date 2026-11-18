import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';
import { UNKNOWN_MESSAGE } from './save.js';
import './project-draft.js';

// The project Save (save contract cycle 3): js/api-sync.js is a classic script, so _saveProject and the mapping it
// uses are cut out of it and run against a fake apiFetch, with the real apiSave and projectChanges.
const syncJs = readFileSync('js/api-sync.js', 'utf8');
const fns = new Function(`
  ${extractBlock(syncJs, 'function _apiProjectToLocal(')}
  ${extractBlock(syncJs, 'async function _saveProject(')}
  ${extractBlock(syncJs, 'async function _generateProject(')}
  ${extractBlock(syncJs, 'async function _addTasksToProject(')}
  return { _saveProject, _generateProject, _addTasksToProject };
`)();

const project = () => ({
  id: 'p1', name: 'A', code: '', programId: null, clientId: null, startDate: '202601', endDate: '202612',
  currency: 'EUR', pipeline: 'SIP', status: '', description: '', costGridRef: null,
  tasks: [], phasing: {}, ptc: [], planning: {}, groups: [], version: 4,
});
const fail = (status, data, extra = {}) => Object.assign(new Error(data?.error || `HTTP ${status}`), { status, data, ...extra });

let calls;
beforeEach(() => { calls = []; });
const fakeFetch = answer => { window.apiFetch = vi.fn(async (path, opts) => { calls.push({ path, ...opts }); return answer(path, opts); }); };

describe('_saveProject', () => {
  it('a 404 on save never issues a POST', async () => {
    fakeFetch(() => { throw fail(404, { error: 'Project not found' }); });
    const base = window.projectSavable(project());
    const out = await fns._saveProject(base, { ...project(), name: 'B' });
    expect(calls.map(c => c.method)).toEqual(['PUT']);
    expect(out).toMatchObject({ kind: 'error', status: 404, message: 'Project not found' });
  });

  it('a 500 shows its own message', async () => {
    fakeFetch(() => { throw fail(500, { error: 'Internal server error' }); });
    const out = await fns._saveProject(window.projectSavable(project()), { ...project(), name: 'B' });
    expect(out.kind).toBe('unknown');
    expect(out.message).toBe(UNKNOWN_MESSAGE);
    expect(calls.map(c => c.method)).toEqual(['PUT']);
  });

  it('save sends version and only the changed parts', async () => {
    fakeFetch((path, opts) => ({ ...project(), ...JSON.parse(opts.body).header, version: 5 }));
    const draft = { ...project(), name: 'B', phasing: { '202602': 3 } };
    await fns._saveProject(window.projectSavable(project()), draft);
    expect(calls[0].path).toBe('/projects/p1');
    expect(JSON.parse(calls[0].body)).toEqual({ version: 4, header: { name: 'B' }, phasing: { '202602': 3 } });
  });

  it('ok adopts the server snapshot', async () => {
    fakeFetch(() => ({ id: 'p1', name: 'Server', version: 5, cg_version_id: 'v1', cg_id: 'cg1', links: [] }));
    const out = await fns._saveProject(window.projectSavable(project()), { ...project(), name: 'B' });
    expect(out.kind).toBe('ok');
    expect(out.project).toMatchObject({ id: 'p1', name: 'Server', version: 5, costGridRef: { cgId: 'cg1', versionId: 'v1' } });
  });

  it('a 409 STALE is a conflict', async () => {
    fakeFetch(() => { throw fail(409, { error: 'This project was changed by someone else since you opened it.', code: 'STALE', version: 6 }); });
    const out = await fns._saveProject(window.projectSavable(project()), { ...project(), name: 'B' });
    expect(out).toMatchObject({ kind: 'conflict', version: 6 });
  });
});

describe('_generateProject and _addTasksToProject', () => {
  it('post to the version routes and adopt the answer', async () => {
    fakeFetch(() => ({ id: 'p9', name: 'New', version: 0, links: [{ versionId: 'v1', taskIds: ['t'], taskNames: ['T'] }] }));
    const g = await fns._generateProject('cg1', 'v1', { name: 'New' });
    const a = await fns._addTasksToProject('cg1', 'v1', 'p9', { tasks: [] });
    expect(calls.map(c => `${c.method} ${c.path}`)).toEqual([
      'POST /cost-grids/cg1/versions/v1/projects', 'POST /cost-grids/cg1/versions/v1/projects/p9/tasks',
    ]);
    expect(g.project.links[0].taskIds).toEqual(['t']);
    expect(a.kind).toBe('ok');
  });

  it('a rule refusal leaves no project on the outcome', async () => {
    fakeFetch(() => { throw fail(400, { error: 'bad date', code: 'DATE_RULE' }); });
    const g = await fns._generateProject('cg1', 'v1', { name: 'New' });
    expect(g).toMatchObject({ kind: 'rule', code: 'DATE_RULE', message: 'bad date' });
    expect(g.project).toBeUndefined();
  });
});
