import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';
import { toYmd } from './dates.js';

// Dates C4 (criteria 8, 13): Add tasks reports a refused task save and records nothing.
const js = readFileSync('js/costgrid.js', 'utf8');
const src = extractBlock(js, 'async function cgDoAddTasksToProject(');

function build({ failed }) {
  const proj = { id: 'p1', name: 'Proj One', startDate: '202601', endDate: '202612', tasks: [{ name: 'Old', startDate: '', endDate: '' }] };
  const lp = { projectId: 'p1', taskIds: ['a'], taskNames: ['Old'] };
  const draft = {
    roles: [], linkedProjects: [lp],
    phases: [{ tasks: [{ taskId: 'n1', taskName: 'New task', taskStartDate: '2026-03-03', taskEndDate: '2026-03-10', hours: {} }] }],
  };
  const add = vi.fn(async () => {});
  const showInfo = vi.fn();
  const stubs = {
    _cgDraft: draft, config: { projects: [proj] }, showInfo, showConfirm: vi.fn(), cgOutOfPeriodNotice: () => '', toYmd,
    _pushProjectToApiDetailed: vi.fn(async () => ({ ok: failed.length === 0, failed })),
    Api: { costGrids: { versions: { linkedProjects: { add } } } },
    _cgActiveCgId: 'cg1', _cgActiveVersionId: 'v1', cgLoad: () => null, cgSave: () => {},
    _cgSelectionMode: true, _cgSelectedTaskIds: new Set(), renderCgEditor: () => {},
  };
  const names = Object.keys(stubs);
  const fn = new Function(...names, `${src}; return cgDoAddTasksToProject;`)(...names.map(n => stubs[n]));
  return { run: () => fn('p1', ['n1']), proj, lp, add, showInfo, push: stubs._pushProjectToApiDetailed };
}

describe('cgDoAddTasksToProject', () => {
  it('a refused tasks save rolls the tasks back, records no link and shows the reason', async () => {
    const t = build({ failed: [{ part: 'tasks', error: 'x', code: 'DATE_RULE', reason: 'why' }] });
    await t.run();
    expect(t.proj.tasks).toHaveLength(1);
    expect(t.lp.taskIds).toEqual(['a']);
    expect(t.lp.taskNames).toEqual(['Old']);
    expect(t.add).not.toHaveBeenCalled();
    expect(t.showInfo).toHaveBeenCalledTimes(1);
    expect(t.showInfo.mock.calls[0][0]).toBe('Tasks were not added to "Proj One": why');
  });

  it('a failed project save also rolls back, falling back to the error text', async () => {
    const t = build({ failed: [{ part: 'project', error: 'boom' }] });
    await t.run();
    expect(t.proj.tasks).toHaveLength(1);
    expect(t.add).not.toHaveBeenCalled();
    expect(t.showInfo.mock.calls[0][0]).toBe('Tasks were not added to "Proj One": boom');
  });

  it('on success the tasks and the link are recorded', async () => {
    const t = build({ failed: [] });
    await t.run();
    expect(t.proj.tasks).toHaveLength(2);
    expect(t.push).toHaveBeenCalledWith(t.proj, { skipEmpty: true });
    expect(t.lp.taskIds).toEqual(['a', 'n1']);
    expect(t.add).toHaveBeenCalledTimes(1);
    expect(t.showInfo).not.toHaveBeenCalled();
  });
});
