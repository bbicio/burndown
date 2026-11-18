import { describe, it, expect } from 'vitest';
import { cgSavableState, cgChangedHeader, cgStructureChanged, cgIsDirty } from './cg-draft.js';

const draft = () => ({
  versionId: 'v1', versionLabel: 'v1', pipeline: 'SIP', startDate: '202601', endDate: '202612',
  currency: 'EUR', currencyRate: 1, note: '', ratecardId: null, clientId: 'c1', projectName: 'P',
  status: 'draft', linkedProjects: [], createdAt: '2026-01-01',
  phases: [{ phaseId: 'ph1', phaseName: 'Phase', tasks: [
    { taskId: 't1', taskName: 'T', taskDescription: '', taskStartDate: '', taskEndDate: '', ptc: 0, hours: { DEV: 2 } },
  ] }],
  roles: [{ roleCode: 'DEV', roleLabel: 'Dev', rate: 100, rateIsCustom: false }],
});

describe('cgChangedHeader', () => {
  it('reports only the header fields that changed', () => {
    const base = cgSavableState(draft());
    const d = { ...draft(), note: 'new', pipeline: 'Expected' };
    expect(cgChangedHeader(base, d)).toEqual({ note: 'new', pipeline: 'Expected' });
  });
  it('never reports linkedProjects or status', () => {
    const base = cgSavableState(draft());
    const d = { ...draft(), linkedProjects: [{ projectId: 'p1' }], status: 'committed', createdAt: 'x', currencyRate: 2 };
    expect(cgChangedHeader(base, d)).toEqual({});
  });
  it('maps versionLabel to label', () => {
    const base = cgSavableState(draft());
    expect(cgChangedHeader(base, { ...draft(), versionLabel: 'v2' })).toEqual({ label: 'v2' });
    expect(base.header.label).toBe('v1');
    expect('versionLabel' in base.header).toBe(false);
  });
  it('normalises the unassigned client to null', () => {
    const base = cgSavableState({ ...draft(), clientId: null });
    expect(base.header.clientId).toBe(null);
    expect(cgChangedHeader(base, { ...draft(), clientId: '__unassigned__' })).toEqual({});
  });
  it('turns an undefined string field into an empty string', () => {
    const d = draft();
    delete d.note;
    delete d.projectName;
    const s = cgSavableState(d);
    expect(s.header.note).toBe('');
    expect(s.header.projectName).toBe('');
  });
  it('carries exactly the Save route header fields', () => {
    expect(Object.keys(cgSavableState(draft()).header).sort()).toEqual(
      ['clientId', 'currency', 'endDate', 'label', 'note', 'pipeline', 'projectName', 'ratecardId', 'startDate'].sort());
  });
});

describe('cgStructureChanged', () => {
  it('a changed hour marks the structure changed, a changed note does not', () => {
    const base = cgSavableState(draft());
    const hour = draft();
    hour.phases[0].tasks[0].hours.DEV = 3;
    expect(cgStructureChanged(base, hour)).toBe(true);
    expect(cgStructureChanged(base, { ...draft(), note: 'n' })).toBe(false);
  });
  it('a changed role rate marks the structure changed', () => {
    const base = cgSavableState(draft());
    const d = draft();
    d.roles[0].rate = 120;
    expect(cgStructureChanged(base, d)).toBe(true);
  });
  it('the order of the hours keys does not matter', () => {
    const a = draft();
    a.phases[0].tasks[0].hours = { DEV: 2, PM: 1 };
    const b = draft();
    b.phases[0].tasks[0].hours = { PM: 1, DEV: 2 };
    expect(cgStructureChanged(cgSavableState(a), b)).toBe(false);
  });
  it('the structure holds only what the route reads', () => {
    const s = cgSavableState(draft()).structure;
    expect(s).toEqual({
      phases: [{ phaseName: 'Phase', tasks: [
        { taskId: 't1', taskName: 'T', taskDescription: '', taskStartDate: '', taskEndDate: '', ptc: 0, hours: { DEV: 2 } },
      ] }],
      roles: [{ roleCode: 'DEV', rate: 100, rateIsCustom: false }],
    });
  });
});

describe('cgIsDirty', () => {
  it('isDirty is false right after cgSavableState of the same draft', () => {
    const d = draft();
    expect(cgIsDirty(cgSavableState(d), d)).toBe(false);
  });
  it('is true for a header change and for a structure change', () => {
    const base = cgSavableState(draft());
    expect(cgIsDirty(base, { ...draft(), note: 'x' })).toBe(true);
    const d = draft();
    d.phases[0].tasks[0].taskName = 'T2';
    expect(cgIsDirty(base, d)).toBe(true);
  });
});
