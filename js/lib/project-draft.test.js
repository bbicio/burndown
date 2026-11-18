import { describe, it, expect } from 'vitest';
import { projectSavable, projectChanges, projectIsDirty } from './project-draft.js';

const clone = v => JSON.parse(JSON.stringify(v));
const base = () => ({
  id: 'p1', name: 'A', code: 'C1', programId: 'prog', clientId: '11111111-1111-4111-8111-111111111111',
  startDate: '202601', endDate: '202612', currency: 'EUR', pipeline: 'SIP', status: 'Started', description: 'd',
  costGridRef: { cgId: 'cg', versionId: '22222222-2222-4222-8222-222222222222' },
  tasks: [{ name: 'T1', startDate: '20260101', endDate: '20260110', resources: [] }],
  phasing: { '202601': 10 }, ptc: [{ month: '202601', amount: 5 }], planning: {}, groups: [],
  version: 4, my_permission: 'owner',
});

describe('projectChanges', () => {
  it('unchanged project has no changes', () => {
    const p = base();
    expect(projectChanges(projectSavable(p), clone(p))).toEqual({});
    expect(projectIsDirty(projectSavable(p), clone(p))).toBe(false);
  });

  it('a changed name sends only header.name', () => {
    const p = base();
    const d = { ...clone(p), name: 'B' };
    expect(projectChanges(projectSavable(p), d)).toEqual({ header: { name: 'B' } });
    expect(projectIsDirty(projectSavable(p), d)).toBe(true);
  });

  it('pipeline is absent when unchanged', () => {
    const p = base();
    const d = { ...clone(p), status: 'Put on hold' };
    const out = projectChanges(projectSavable(p), d);
    expect(out).toEqual({ header: { status: 'Put on hold' } });
    expect('pipeline' in out.header).toBe(false);
  });

  it('a changed phasing sends phasing only', () => {
    const p = base();
    const d = clone(p);
    d.phasing['202602'] = 3;
    expect(projectChanges(projectSavable(p), d)).toEqual({ phasing: { '202601': 10, '202602': 3 } });
  });

  it('__unassigned__ clientId becomes null', () => {
    const p = base();
    expect(projectSavable({ ...p, clientId: '__unassigned__' }).header.clientId).toBeNull();
    const d = { ...clone(p), clientId: '__unassigned__' };
    expect(projectChanges(projectSavable(p), d)).toEqual({ header: { clientId: null } });
  });

  it('costGridRef becomes cgVersionId and is not sent when unchanged', () => {
    const p = base();
    expect(projectSavable(p).header.cgVersionId).toBe('22222222-2222-4222-8222-222222222222');
    expect('cgVersionId' in (projectChanges(projectSavable(p), { ...clone(p), name: 'Z' }).header)).toBe(false);
    expect(projectSavable({ ...p, costGridRef: null }).header.cgVersionId).toBeNull();
  });

  it('blank group entries are dropped before comparing', () => {
    const p = { ...base(), groups: [{ name: 'G', entries: [{ role: 'Dev', task: '' }] }] };
    const d = clone(p);
    d.groups[0].entries.push({ role: '  ', task: '' });
    expect(projectChanges(projectSavable(p), d)).toEqual({});
    expect(projectSavable(d).groups).toEqual([{ name: 'G', entries: [{ role: 'Dev', task: '' }] }]);
  });
});
