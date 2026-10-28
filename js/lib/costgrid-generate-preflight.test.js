import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';
import { isOrdered, outOfPeriodTasks, periodError, formatMonthText, toYmd } from './dates.js';

// R2-2: a refused generation must not leave a program behind, so the period is checked before the Create Program modal.
const js = readFileSync('js/costgrid.js', 'utf8');
const src = ['function cgGeneratedPeriod(', 'function cgOutOfPeriodNotice(', 'function cgGenerationPlan(', 'function cgGenerationRefusal(', 'function cgSubmitProjectName(']
  .map(h => extractBlock(js, h)).join('\n');

function build({ selected, start, end }) {
  const showInfo = vi.fn();
  const openCreateProgramModal = vi.fn();
  const create = vi.fn();
  const draft = {
    startDate: start || '202604', endDate: end || '202612', currency: 'EUR', roles: [], linkedProjects: [],
    phases: [{ tasks: [
      { taskId: 't1', taskName: 'Early task', taskStartDate: '2026-03-03', taskEndDate: '2026-03-10', hours: {}, ptc: 0 },
      { taskId: 't2', taskName: 'Fine task', taskStartDate: '2026-05-04', taskEndDate: '2026-05-08', hours: {}, ptc: 0 },
      { taskId: 't3', taskName: 'Free task', taskStartDate: '2026-06-04', taskEndDate: '2026-06-08', hours: {}, ptc: 0 },
    ] }],
  };
  const stubs = {
    window: { outOfPeriodTasks, periodError, formatMonthText, cgFreeTasksOf: ts => ts }, showInfo, toYmd, isOrdered, _cgDraft: draft,
    config: { projects: [] }, _cgActiveCgId: 'cg1', _cgActiveVersionId: 'v1', findExistingProgramForProposal: () => null,
    _cgSelectedTaskIds: new Set(selected), _cgPendingGeneration: null, _cgVueApp: { openCreateProgramModal }, cgDoGenerateProject: vi.fn(async () => {}),
    Api: { programs: { create } },
  };
  const names = Object.keys(stubs);
  const submit = new Function(...names, `${src}; return cgSubmitProjectName;`)(...names.map(n => stubs[n]));
  return { submit, config: stubs.config, draft, showInfo, openCreateProgramModal, create, gen: stubs.cgDoGenerateProject };
}

describe('generate project: period check before any program is created', () => {
  it('an out-of-period selected task opens no Create Program modal and creates nothing', () => {
    const t = build({ selected: ['t1'] }); // partial selection (t2, t3 left free) would otherwise open the modal
    t.submit('Proj', 'C1');
    expect(t.showInfo).toHaveBeenCalledTimes(1);
    expect(t.showInfo.mock.calls[0][0]).toContain('"Early task"');
    expect(t.openCreateProgramModal).not.toHaveBeenCalled();
    expect(t.create).not.toHaveBeenCalled();
    expect(t.gen).not.toHaveBeenCalled();
  });

  it('an in-period partial selection still opens the Create Program modal, without a notice', () => {
    const t = build({ selected: ['t2'] });
    t.submit('Proj', 'C1');
    expect(t.showInfo).not.toHaveBeenCalled();
    expect(t.openCreateProgramModal).toHaveBeenCalledTimes(1);
  });

  it('an invalid version period (end before start) is refused before any write (criterion 12)', () => {
    const t = build({ selected: ['t2'], start: '202612', end: '202604' });
    t.submit('Proj', 'C1');
    expect(t.showInfo).toHaveBeenCalledTimes(1);
    expect(t.showInfo.mock.calls[0][0]).toBe(periodError('202612', '202604', { kind: 'month', label: 'proposal' }));
    expect(t.openCreateProgramModal).not.toHaveBeenCalled();
    expect(t.create).not.toHaveBeenCalled();
    expect(t.gen).not.toHaveBeenCalled();
    expect(t.config.projects).toEqual([]);
    expect(t.draft.linkedProjects).toEqual([]);
  });
});
