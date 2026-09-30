import { describe, it, expect } from 'vitest';
import { localYmd, buildKeyMap, remapKeys, adaptRoleModel, adaptProjectModel, adaptOwnerModel, buildModelRequest } from './planning-model-ui.js';

const weeks = [{ weekStart: new Date(2026, 8, 7) }, { weekStart: new Date(2026, 8, 14) }];
const keyMap = buildKeyMap(weeks);

describe('planning-model-ui', () => {
  it('localYmd uses local date parts', () => {
    expect(localYmd(new Date(2026, 8, 7, 23, 30))).toBe('2026-09-07');
  });

  it('buildKeyMap maps calendar keys to the ISO string of the local week start', () => {
    expect(keyMap.get('2026-09-07')).toBe(new Date(2026, 8, 7).toISOString());
    expect([...keyMap.keys()]).toEqual(['2026-09-07', '2026-09-14']);
  });

  it('remapKeys renames known keys, keeps unknown ones', () => {
    expect(remapKeys({ '2026-09-07': 1, other: 2 }, keyMap)).toEqual({ [new Date(2026, 8, 7).toISOString()]: 1, other: 2 });
  });

  it('adaptRoleModel rebuilds the four maps of the By Role view', () => {
    const data = { roles: [{ role: 'DEV', sold: 100, actuals: 10,
      children: [{ project: 'A', task: 'T', sold: 100, actual: 10 }],
      cells: { '2026-09-07': { hours: 10, breakdown: [], isPast: true, isPulse: false } } }] };
    const m = adaptRoleModel(data, keyMap);
    expect(m.roleSoldMap).toEqual({ DEV: 100 });
    expect(m.roleActualsMap).toEqual({ DEV: 10 });
    expect(Object.values(m.roleChildMap.DEV)).toEqual([{ project: 'A', task: 'T', sold: 100, actual: 10 }]);
    expect(Object.keys(m.roleMap.DEV)).toEqual([new Date(2026, 8, 7).toISOString()]);
  });

  it('adaptProjectModel re-keys week maps at every level', () => {
    const data = { projects: [{ id: 'p', sold: 1, actuals: 0, tbp: 1, weekTotals: { '2026-09-14': 1 }, tasks: [{
      name: 'T', sold: 1, actuals: 0, tbp: 1, weekTotals: { '2026-09-14': 1 }, roles: [{
        role: 'R', weekData: { '2026-09-14': { total: 1, byOwner: {}, isPulse: false, isPast: false } }, owners: [] }] }] }] };
    const iso = new Date(2026, 8, 14).toISOString();
    const m = adaptProjectModel(data, keyMap);
    expect(Object.keys(m.projects[0].weekTotals)).toEqual([iso]);
    expect(Object.keys(m.projects[0].tasks[0].weekTotals)).toEqual([iso]);
    expect(Object.keys(m.projects[0].tasks[0].roles[0].weekData)).toEqual([iso]);
  });

  it('adaptOwnerModel re-keys owner, project and task week maps', () => {
    const cell = { hours: 1, isPulse: false, isPast: false };
    const data = { ownerMap: { A: { sold: 1, actuals: 0, tbp: 1, weekTotals: { '2026-09-07': cell },
      projects: { p: { name: 'P', sold: 1, actuals: 0, tbp: 1, weekTotals: { '2026-09-07': cell },
        tasks: { T: { sold: 1, actuals: 0, tbp: 1, weekData: { '2026-09-07': cell } } } } } } } };
    const iso = new Date(2026, 8, 7).toISOString();
    const m = adaptOwnerModel(data, keyMap);
    expect(Object.keys(m.A.weekTotals)).toEqual([iso]);
    expect(Object.keys(m.A.projects.p.weekTotals)).toEqual([iso]);
    expect(Object.keys(m.A.projects.p.tasks.T.weekData)).toEqual([iso]);
  });

  it('buildModelRequest maps the view, sorts teams and formats local dates', () => {
    const r = buildModelRequest({ view: 'byowner', projectIds: ['b', 'a'], teams: ['Z', 'A'],
      windowStart: new Date(2026, 8, 1), windowEnd: new Date(2026, 11, 31), today: new Date(2026, 8, 15, 18, 0), pulse: false });
    expect(r).toEqual({ view: 'owner', projectIds: ['b', 'a'], teams: ['A', 'Z'], from: '2026-09-01', to: '2026-12-31', asOf: '2026-09-15', pulse: false });
  });
});
