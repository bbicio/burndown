import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';
import { isOrdered, outOfPeriodTasks, periodState, periodError, formatMonthText, toYmd } from './dates.js';
import { UNKNOWN_MESSAGE } from './save.js';

// Generate project (save contract cycle 3): one request; memory receives the project and the link only on success.
const js = readFileSync('js/costgrid.js', 'utf8');
const names = ['window', 'showInfo', 'showConfirm', 'config', '_cgDraft', '_generateProject', 'persistConfig', 'toYmd', 'isOrdered',
  '_cgActiveCgId', '_cgActiveVersionId', 'cgLoad', 'cgSave', 'renderCgEditor', '_cgSelectionMode', '_cgSelectedTaskIds', 'renderCgVersionTabs'];
const src = ['function cgGeneratedPeriod(', 'function cgOutOfPeriodNotice(', 'function cgGenerationPlan(', 'async function cgDoGenerateProject(']
  .map(h => extractBlock(js, h)).join('\n');

let showInfo, showConfirm, config, draft, generate;
const task = (id, name) => ({ taskId: id, taskName: name, taskStartDate: '2026-05-04', taskEndDate: '2026-05-08', hours: {}, ptc: 0 });

function run(outcome) {
  generate = vi.fn(async () => outcome);
  const stubs = {
    window: { outOfPeriodTasks, periodState, periodError, formatMonthText }, showInfo, showConfirm, config, _cgDraft: draft,
    _generateProject: generate, persistConfig: vi.fn(), toYmd, isOrdered, _cgActiveCgId: 'cg1', _cgActiveVersionId: 'v1',
    cgLoad: () => null, cgSave: vi.fn(), renderCgEditor: vi.fn(), _cgSelectionMode: true, _cgSelectedTaskIds: new Set(),
    renderCgVersionTabs: vi.fn(),
  };
  const gen = new Function(...names, `${src}; return cgDoGenerateProject;`)(...names.map(n => stubs[n]));
  return gen(['t1'], 'New', 'PRG', 'C1');
}

beforeEach(() => {
  showInfo = vi.fn();
  showConfirm = vi.fn();
  config = { projects: [{ id: 'p0' }] };
  draft = {
    startDate: '202604', endDate: '202612', currency: 'USD', pipeline: 'Expected', clientId: '__unassigned__', note: ' Desc ',
    roles: [], linkedProjects: [], phases: [{ tasks: [task('t1', 'Fine task')] }],
  };
});

describe('cgDoGenerateProject', () => {
  it('sends the version route body without id, currency or pipeline', async () => {
    await run({ kind: 'ok', project: { id: 'p9', name: 'New', links: [{ versionId: 'v1', taskIds: ['t1'], taskNames: ['Fine task'] }] } });
    const [cgId, vId, body] = generate.mock.calls[0];
    expect([cgId, vId]).toEqual(['cg1', 'v1']);
    expect(body).toMatchObject({ name: 'New', code: 'C1', programId: 'PRG', clientId: null, startDate: '202604', endDate: '202612',
      description: 'Desc', taskIds: ['t1'], taskNames: ['Fine task'] });
    expect(body.tasks.map(t => t.name)).toEqual(['Fine task']);
    for (const k of ['id', 'currency', 'pipeline']) expect(k in body).toBe(false);
  });

  it('Generate adds the project to memory only on ok', async () => {
    await run({ kind: 'rule', code: 'DATE_RULE', message: 'A task falls outside the period' });
    expect(config.projects).toHaveLength(1);
    expect(draft.linkedProjects).toEqual([]);
    expect(showInfo).toHaveBeenCalledWith('Project "New" was not created: A task falls outside the period');
    expect(showConfirm).not.toHaveBeenCalled();

    await run({ kind: 'ok', project: { id: 'p9', name: 'New', links: [{ versionId: 'v1', taskIds: ['t1'], taskNames: ['Fine task'] }] } });
    expect(config.projects.map(p => p.id)).toEqual(['p0', 'p9']);
    expect(draft.linkedProjects).toMatchObject([{ projectId: 'p9', projectName: 'New', taskIds: ['t1'], taskNames: ['Fine task'] }]);
    expect(showConfirm).toHaveBeenCalledTimes(1);
  });

  it('an unknown Generate outcome adds nothing to memory', async () => {
    await run({ kind: 'unknown', message: UNKNOWN_MESSAGE });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(config.projects).toHaveLength(1);
    expect(draft.linkedProjects).toEqual([]);
    expect(showInfo).toHaveBeenCalledWith(UNKNOWN_MESSAGE);
  });
});
