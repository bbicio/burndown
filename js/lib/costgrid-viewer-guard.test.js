import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';

// B-029: a viewer (myPermission === 'viewer') must neither see nor run the editor's structural controls.
// isReadOnly (isLocked || viewer) is the one gate: the template hides the controls with it, and every method
// they call returns first when it is true, so a viewer calling a method directly (keyboard, devtools) changes
// nothing. costgrid.html's Vue methods are cut out of the page and run against stubs.
const html = readFileSync('costgrid.html', 'utf8');

describe('costgrid.html template', () => {
  it('no structural control is gated by !isLocked alone', () => {
    expect(html).not.toMatch(/v-if="[^"]*!isLocked/);
  });

  it('the version-label controls use isReadOnly instead of a viewer check of their own', () => {
    expect(html).not.toMatch(/v-if="[^"]*myPermission !== 'viewer'/);
  });
});

// [method name, source head, arguments]
const METHODS = [
  ['addPhase', 'addPhase() {', []],
  ['addTask', 'addTask(phase) {', [{ tasks: [] }]],
  ['deletePhase', 'deletePhase(phase) {', [{ phaseId: 'ph1', phaseName: 'P1', tasks: [] }]],
  ['deleteTask', 'deleteTask(phase, task) {', [{ tasks: [] }, { taskId: 't1', taskName: 'T1' }]],
  ['addRoleColumn', 'addRoleColumn() {', []],
  ['openRoleMenu', 'openRoleMenu(code) {', ['PM']],
  ['onRemoveColumnClick', 'onRemoveColumnClick(role) {', [{ roleCode: 'PM' }]],
  ['changeRole', 'changeRole(code) {', ['PM']],
  ['duplicateRole', 'duplicateRole(code) {', ['PM']],
  ['resetRoleRate', 'resetRoleRate(role) {', [{ roleCode: 'PM', rate: 10, rateIsCustom: true }]],
  ['toggleSelectAllFree', 'toggleSelectAllFree() {', []],
  ['toggleFreeInPhase', 'toggleFreeInPhase(phase) {', [{ tasks: [] }]],
  ['confirmAndGenerate', 'confirmAndGenerate() {', []],
  ['addToProject', 'addToProject() {', []],
  ['confirmAddToProject', 'async confirmAddToProject() {', []],
];

function setup(isReadOnly) {
  const spies = {
    cgScheduleAutoSave: vi.fn(), showConfirm: vi.fn(), showInfo: vi.fn(),
    cgConfirmAndGenerate: vi.fn(), cgDoAddTasksToProject: vi.fn(),
    cgNewPhId: vi.fn(() => 'ph-new'), cgNewTkId: vi.fn(() => 'tk-new'),
  };
  const modalShow = vi.fn();
  const bootstrap = { Modal: { getOrCreateInstance: vi.fn(() => ({ show: modalShow })), getInstance: vi.fn(() => ({ hide: vi.fn() })) } };
  const documentStub = { getElementById: () => ({}) };
  const self = {
    isReadOnly,
    draft: { phases: [{ phaseId: 'ph1', phaseName: 'P1', tasks: [{ taskId: 't1', taskName: 'T1', hours: { PM: 1 } }] }], roles: [{ roleCode: 'PM', rate: 10 }], linkedProjects: [] },
    openRoleMenuCode: null, removeColumnConfirm: null,
    selectedTaskIds: new Set(),
    addToProjectSel: 'p1', addToProjectModal: { projId: 'p1', projName: 'P', taskNames: [], taskIds: ['t1'] },
    isTaskAssigned: () => false,
    openRoleModal: vi.fn(), selectAllFree: vi.fn(), selectAllFreeInPhase: vi.fn(),
    phaseFreeState: () => 'none', selectAllFreeState: () => 'none',
    roleBaseline: () => ({ effectiveRate: 5 }),
  };
  self.selectedTaskIds.add('t1');
  const build = (head) => new Function('showConfirm', 'showInfo', 'cgScheduleAutoSave', 'cgConfirmAndGenerate', 'cgDoAddTasksToProject',
    'cgNewPhId', 'cgNewTkId', 'bootstrap', 'document', '_cgSelectedTaskIds',
    `return { ${extractBlock(html, head)} };`)(
    spies.showConfirm, spies.showInfo, spies.cgScheduleAutoSave, spies.cgConfirmAndGenerate, spies.cgDoAddTasksToProject,
    spies.cgNewPhId, spies.cgNewTkId, bootstrap, documentStub, new Set());
  return { self, spies, modalShow, build };
}

describe('structural methods as a viewer', () => {
  for (const [name, head, args] of METHODS) {
    it(`${name} changes nothing and calls nothing when isReadOnly`, async () => {
      const { self, spies, modalShow, build } = setup(true);
      const before = JSON.stringify({ d: self.draft, s: [...self.selectedTaskIds], m: self.openRoleMenuCode, r: self.removeColumnConfirm, a: self.addToProjectModal });
      await build(head)[name.replace(/^async /, '')].apply(self, args);
      const after = JSON.stringify({ d: self.draft, s: [...self.selectedTaskIds], m: self.openRoleMenuCode, r: self.removeColumnConfirm, a: self.addToProjectModal });
      expect(after).toBe(before);
      for (const fn of [...Object.values(spies).filter(f => f !== spies.cgNewPhId && f !== spies.cgNewTkId),
        self.openRoleModal, self.selectAllFree, self.selectAllFreeInPhase, modalShow]) {
        expect(fn).not.toHaveBeenCalled();
      }
      expect(spies.cgNewPhId).not.toHaveBeenCalled();
      expect(spies.cgNewTkId).not.toHaveBeenCalled();
    });
  }

  it('the same methods still act when the version is editable (the guard is not a blanket return)', () => {
    const { self, build } = setup(false);
    build('addPhase() {').addPhase.call(self);
    expect(self.draft.phases).toHaveLength(2);
    const phase = { tasks: [] };
    build('addTask(phase) {').addTask.call(self, phase);
    expect(phase.tasks).toHaveLength(1);
    build('openRoleMenu(code) {').openRoleMenu.call(self, 'PM');
    expect(self.openRoleMenuCode).toBe('PM');
  });
});
