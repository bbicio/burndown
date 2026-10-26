import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';
import { isOrdered, outOfPeriodTasks, formatMonthText, toYmd } from './dates.js';

// js/costgrid.js is a classic script: the period check and the two copy functions are cut out and run against stubs.
const js = readFileSync('js/costgrid.js', 'utf8');
const names = ['window', 'showInfo', 'config', '_cgDraft', 'Api', '_pushProjectToApi', 'persistConfig', 'toYmd', 'isOrdered',
  '_cgActiveCgId', '_cgActiveVersionId', 'cgLoad', 'cgSave', 'renderCgEditor', '_cgSelectionMode', '_cgSelectedTaskIds'];
const src = ['function cgGeneratedPeriod(', 'function cgOutOfPeriodNotice(', 'async function cgDoAddTasksToProject(', 'async function cgDoGenerateProject(']
  .map(h => extractBlock(js, h)).join('\n');

let showInfo, config, draft, api, push;

function build() {
  const stubs = {
    window: { outOfPeriodTasks, formatMonthText }, showInfo, config, _cgDraft: draft, Api: api, _pushProjectToApi: push,
    persistConfig: vi.fn(), toYmd, isOrdered, _cgActiveCgId: 'cg1', _cgActiveVersionId: 'v1',
    cgLoad: () => null, cgSave: vi.fn(), renderCgEditor: vi.fn(), _cgSelectionMode: true, _cgSelectedTaskIds: new Set(),
  };
  return new Function(...names, `${src}; return { add: cgDoAddTasksToProject, gen: cgDoGenerateProject };`)(...names.map(n => stubs[n]));
}

const task = (id, name, start, end) => ({ taskId: id, taskName: name, taskStartDate: start, taskEndDate: end, hours: {}, ptc: 0 });

beforeEach(() => {
  showInfo = vi.fn();
  push = vi.fn(async () => true);
  api = { costGrids: { versions: { linkedProjects: { add: vi.fn(async () => {}) }, update: vi.fn(), saveStructure: vi.fn() }, update: vi.fn() }, projects: {} };
  config = { projects: [{ id: 'p1', startDate: '202604', endDate: '202612', tasks: [] }] };
  draft = {
    startDate: '202604', endDate: '202612', currency: 'EUR', roles: [], linkedProjects: [{ projectId: 'p1', taskIds: [], taskNames: [] }],
    phases: [{ tasks: [task('t1', 'Early task', '2026-03-03', '2026-03-10'), task('t2', 'Fine task', '2026-05-04', '2026-05-08')] }],
  };
});

describe('copying tasks outside the project period', () => {
  it('cgDoAddTasksToProject refuses before any write', async () => {
    const before = JSON.stringify([config.projects, draft.linkedProjects]);
    await build().add('p1', ['t1', 't2']);
    expect(showInfo).toHaveBeenCalledTimes(1);
    expect(showInfo.mock.calls[0][0]).toContain('"Early task"');
    expect(showInfo.mock.calls[0][0]).not.toContain('"Fine task"');
    expect(showInfo.mock.calls[0][0]).toContain('Apr 2026 – Dec 2026');
    expect(JSON.stringify([config.projects, draft.linkedProjects])).toBe(before);
    expect(push).not.toHaveBeenCalled();
    expect(api.costGrids.versions.linkedProjects.add).not.toHaveBeenCalled();
  });

  it('cgDoAddTasksToProject refuses when the project already holds an out-of-period task', async () => {
    config.projects[0].tasks = [{ name: 'Old stray', startDate: '20260101', endDate: '20260110' }];
    const before = JSON.stringify([config.projects, draft.linkedProjects]);
    await build().add('p1', ['t2']);
    expect(showInfo).toHaveBeenCalledTimes(1);
    expect(showInfo.mock.calls[0][0]).toContain('"Old stray"');
    expect(showInfo.mock.calls[0][0]).not.toContain('"Fine task"');
    expect(JSON.stringify([config.projects, draft.linkedProjects])).toBe(before);
    expect(push).not.toHaveBeenCalled();
    expect(api.costGrids.versions.linkedProjects.add).not.toHaveBeenCalled();
  });

  it('cgDoAddTasksToProject copies tasks that fit', async () => {
    await build().add('p1', ['t2']);
    expect(showInfo).not.toHaveBeenCalled();
    expect(config.projects[0].tasks).toHaveLength(1);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('cgDoGenerateProject refuses a task outside the version period and adds no project', async () => {
    await build().gen(['t1'], 'New', null, 'C1');
    expect(showInfo).toHaveBeenCalledTimes(1);
    expect(showInfo.mock.calls[0][0]).toContain('"Early task"');
    expect(showInfo.mock.calls[0][0]).toContain('Apr 2026 – Dec 2026');
    expect(config.projects).toHaveLength(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('cgDoGenerateProject on a version without a period derives it from the tasks and is not refused', async () => {
    draft.startDate = ''; draft.endDate = '';
    await build().gen(['t1'], 'New', null, 'C1').catch(() => {});
    expect(showInfo).not.toHaveBeenCalled();
    expect(config.projects).toHaveLength(2);
    expect(config.projects[1].startDate).toBe('202603');
  });
});
