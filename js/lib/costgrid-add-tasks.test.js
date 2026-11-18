import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';
import { toYmd } from './dates.js';

// Add tasks (save contract cycle 3): one request with the new tasks only; memory changes only on success.
const js = readFileSync('js/costgrid.js', 'utf8');
const src = extractBlock(js, 'async function cgDoAddTasksToProject(');

function build(outcome) {
  const proj = { id: 'p1', name: 'Proj One', status: 'Started', startDate: '202601', endDate: '202612', my_permission: 'editor',
    tasks: [{ name: 'Old', startDate: '', endDate: '' }] };
  const lp = { projectId: 'p1', taskIds: ['a'], taskNames: ['Old'] };
  const draft = {
    roles: [{ roleCode: 'DEV', rate: 100 }], linkedProjects: [lp],
    phases: [{ tasks: [{ taskId: 'n1', taskName: 'New task', taskStartDate: '2026-03-03', taskEndDate: '2026-03-10', hours: { DEV: 2 } }] }],
  };
  const showInfo = vi.fn();
  const addTasks = vi.fn(async () => outcome);
  const config = { projects: [proj] };
  const stubs = {
    _cgDraft: draft, config, showInfo, cgOutOfPeriodNotice: () => '', toYmd, _addTasksToProject: addTasks,
    _cgActiveCgId: 'cg1', _cgActiveVersionId: 'v1', cgLoad: () => null, cgSave: () => {},
    _cgSelectionMode: true, _cgSelectedTaskIds: new Set(), renderCgEditor: () => {},
  };
  const names = Object.keys(stubs);
  const fn = new Function(...names, `${src}; return cgDoAddTasksToProject;`)(...names.map(n => stubs[n]));
  return { run: () => fn('p1', ['n1']), proj, lp, addTasks, showInfo, config };
}

describe('cgDoAddTasksToProject', () => {
  it('Add tasks sends only the new tasks', async () => {
    const t = build({ kind: 'ok', project: { id: 'p1', name: 'Proj One', tasks: [], links: [] } });
    await t.run();
    expect(t.addTasks).toHaveBeenCalledTimes(1);
    const [cgId, vId, projectId, body] = t.addTasks.mock.calls[0];
    expect([cgId, vId, projectId]).toEqual(['cg1', 'v1', 'p1']);
    expect(body.tasks.map(x => x.name)).toEqual(['New task']);
    expect(body.tasks[0].resources).toEqual([{ role: 'DEV', soldHours: 2, hourlyRate: 100 }]);
    expect(body.taskIds).toEqual(['n1']);
    expect(body.taskNames).toEqual(['New task']);
    expect(Object.keys(body).sort()).toEqual(['taskIds', 'taskNames', 'tasks']);
  });

  it('Add tasks failure leaves the link in memory unchanged', async () => {
    const t = build({ kind: 'rule', code: 'DATE_RULE', message: 'why' });
    await t.run();
    expect(t.proj.tasks).toHaveLength(1);
    expect(t.config.projects[0]).toBe(t.proj);
    expect(t.lp.taskIds).toEqual(['a']);
    expect(t.lp.taskNames).toEqual(['Old']);
    expect(t.showInfo).toHaveBeenCalledWith('Tasks were not added to "Proj One": why');
  });

  it('on success the project and the link adopt the server answer', async () => {
    const t = build({ kind: 'ok', project: {
      id: 'p1', name: 'Renamed meanwhile', tasks: [{ name: 'Old' }, { name: 'New task' }],
      links: [{ versionId: 'v1', taskIds: ['a', 'n1'], taskNames: ['Old', 'New task'] }],
    } });
    await t.run();
    expect(t.config.projects[0]).toMatchObject({ name: 'Renamed meanwhile', my_permission: 'editor' });
    expect(t.config.projects[0].tasks).toHaveLength(2);
    expect(t.lp.taskIds).toEqual(['a', 'n1']);
    expect(t.lp.taskNames).toEqual(['Old', 'New task']);
    expect(t.showInfo).not.toHaveBeenCalled();
  });
});
