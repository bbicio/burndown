import { describe, it, expect } from 'vitest';
import { versionHasFreeTasks, isVersionCommittedLocked } from './costgrid-calc.js';

describe('versionHasFreeTasks', () => {
  it('returns true when a task has no matching entry in any linkedProjects', () => {
    const ver = {
      phases: [{ tasks: [{ taskId: 't1', taskName: 'Design' }] }],
      linkedProjects: [],
    };
    expect(versionHasFreeTasks(ver)).toBe(true);
  });

  it('returns false when every task is covered across multiple linkedProjects entries (one task each, multiple projects)', () => {
    const ver = {
      phases: [{ tasks: [
        { taskId: 't1', taskName: 'Design' },
        { taskId: 't2', taskName: 'Build' },
      ] }],
      linkedProjects: [
        { projectId: 'p1', taskIds: ['t1'], taskNames: [] },
        { projectId: 'p2', taskIds: ['t2'], taskNames: [] },
      ],
    };
    expect(versionHasFreeTasks(ver)).toBe(false);
  });

  it('returns false when multiple tasks map to the same linkedProjects entry (many tasks, one project)', () => {
    const ver = {
      phases: [{ tasks: [
        { taskId: 't1', taskName: 'Design' },
        { taskId: 't2', taskName: 'Build' },
      ] }],
      linkedProjects: [
        { projectId: 'p1', taskIds: ['t1', 't2'], taskNames: [] },
      ],
    };
    expect(versionHasFreeTasks(ver)).toBe(false);
  });
});

describe('isVersionCommittedLocked', () => {
  it('returns false when pipeline is not Committed, regardless of task mapping', () => {
    const ver = { pipeline: 'Anticipated', phases: [], linkedProjects: [] };
    expect(isVersionCommittedLocked(ver)).toBe(false);
  });

  it('returns false when Committed but at least one task is unmapped (the original bug scenario)', () => {
    const ver = {
      pipeline: 'Committed',
      phases: [{ tasks: [
        { taskId: 't1', taskName: 'Design' },
        { taskId: 't2', taskName: 'Build' },
      ] }],
      linkedProjects: [{ projectId: 'p1', taskIds: ['t1'], taskNames: [] }],
    };
    expect(isVersionCommittedLocked(ver)).toBe(false);
  });

  it('returns true only when Committed and every task is mapped', () => {
    const ver = {
      pipeline: 'Committed',
      phases: [{ tasks: [{ taskId: 't1', taskName: 'Design' }] }],
      linkedProjects: [{ projectId: 'p1', taskIds: ['t1'], taskNames: [] }],
    };
    expect(isVersionCommittedLocked(ver)).toBe(true);
  });
});
