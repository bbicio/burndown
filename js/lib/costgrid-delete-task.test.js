import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';

// costgrid.html's deleteTask is a Vue method inside an inline script, so it is cut out of the page and run
// against stubs. A task linked to a project must not be deletable (B-043, client side): the server now refuses
// a save that drops it, so the editor must not offer the deletion in the first place.
const html = readFileSync('costgrid.html', 'utf8');

function run({ assigned }) {
  const showConfirm = vi.fn();
  const showInfo = vi.fn();
  const cgScheduleAutoSave = vi.fn();
  const method = new Function('showConfirm', 'showInfo', 'cgScheduleAutoSave',
    `return { ${extractBlock(html, 'deleteTask(phase, task) {')} }.deleteTask;`)(showConfirm, showInfo, cgScheduleAutoSave);
  const task = { taskId: 't1', taskName: 'T1' };
  const phase = { tasks: [task, { taskId: 't2', taskName: 'T2' }] };
  method.call({ isTaskAssigned: () => assigned }, phase, task);
  return { showConfirm, showInfo, phase };
}

describe('deleteTask', () => {
  it('refuses an assigned task: info message, no confirmation, tasks untouched', () => {
    const { showConfirm, showInfo, phase } = run({ assigned: true });
    expect(showConfirm).not.toHaveBeenCalled();
    expect(showInfo).toHaveBeenCalledWith("Can't delete: this task is linked to a project.");
    expect(phase.tasks.map(t => t.taskId)).toEqual(['t1', 't2']);
  });

  it('a free task still asks for confirmation', () => {
    const { showConfirm, showInfo } = run({ assigned: false });
    expect(showConfirm).toHaveBeenCalledTimes(1);
    expect(showInfo).not.toHaveBeenCalled();
  });
});
