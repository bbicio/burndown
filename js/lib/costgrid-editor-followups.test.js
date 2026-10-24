import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';
import './costgrid-calc.js'; // sets window.cgFreeTasksOf

// B-044..B-048: editor follow-ups. costgrid.html's Vue methods and js/costgrid.js's functions are classic-script
// code, so each is cut out of its file and run against stubs.
const html = readFileSync('costgrid.html', 'utf8');
const js = readFileSync('js/costgrid.js', 'utf8');

describe('cgNextVersionLabel (B-046)', () => {
  const next = new Function(`${extractBlock(js, 'function cgNextVersionLabel(')}; return cgNextVersionLabel;`)();

  it('skips a label that is taken: v1, v3 → v4', () => {
    expect(next([{ versionLabel: 'v1' }, { versionLabel: 'v3' }])).toBe('v4');
  });
  it('v1, v2 → v3', () => {
    expect(next([{ versionLabel: 'v1' }, { versionLabel: 'v2' }])).toBe('v3');
  });
  it('v2 alone → v3 (length + 1 is taken)', () => {
    expect(next([{ versionLabel: 'v2' }])).toBe('v3');
  });
});

describe('role menu on version switch (B-044)', () => {
  it('openVersion clears the open menu, the pending removal and the anchor button', () => {
    // Limit: openVersion is async and needs the whole editor, so this asserts on its source.
    const block = extractBlock(html, 'async openVersion(');
    expect(block).toMatch(/this\.openRoleMenuCode = null/);
    expect(block).toMatch(/this\.removeColumnConfirm = null/);
    expect(block).toMatch(/this\._cgRoleMenuBtnEl = null/);
  });

  const reposition = new Function(`${extractBlock(html, 'this._cgRoleMenuReposition = () => {')}; return this._cgRoleMenuReposition;`);

  it('repositions while the anchor button is in the document', () => {
    const ctx = { openRoleMenuCode: 'PM', _cgRoleMenuBtnEl: { isConnected: true }, positionRoleMenu: vi.fn() };
    reposition.call(ctx)();
    expect(ctx.positionRoleMenu).toHaveBeenCalledTimes(1);
    expect(ctx.openRoleMenuCode).toBe('PM');
  });

  it('closes the menu when the anchor button is gone', () => {
    const ctx = { openRoleMenuCode: 'PM', _cgRoleMenuBtnEl: { isConnected: false }, positionRoleMenu: vi.fn() };
    reposition.call(ctx)();
    expect(ctx.positionRoleMenu).not.toHaveBeenCalled();
    expect(ctx.openRoleMenuCode).toBeNull();
  });

  it('does nothing when no menu is open', () => {
    const ctx = { openRoleMenuCode: null, _cgRoleMenuBtnEl: { isConnected: false }, positionRoleMenu: vi.fn() };
    reposition.call(ctx)();
    expect(ctx.positionRoleMenu).not.toHaveBeenCalled();
  });
});

describe('sharing summary refresh (B-045)', () => {
  it('closing #shareModal reloads the summary', () => {
    // Limit: the listener is an anonymous function inside mounted(), so this asserts on its source.
    expect(html).toMatch(/id === 'shareModal'\)\s*\{[^}]*this\.loadShareSummary\(\)/);
  });

  const reassign = Api => new Function('Api', 'showInfo', `return { ${extractBlock(html, 'async reassignOwner(')} }.reassignOwner;`)(Api, vi.fn());

  it('a successful owner reassignment reloads the summary', async () => {
    const method = reassign({ costGrids: { reassignOwner: vi.fn().mockResolvedValue({ newOwner: 'New Owner' }) } });
    const ctx = { cgId: 'cg1', cg: {}, shareListRefreshTick: 0, loadShareSummary: vi.fn() };
    await method.call(ctx, 'u2');
    expect(ctx.loadShareSummary).toHaveBeenCalledTimes(1);
  });

  it('a failed owner reassignment does not', async () => {
    const method = reassign({ costGrids: { reassignOwner: vi.fn().mockRejectedValue(new Error('no')) } });
    const ctx = { cgId: 'cg1', cg: {}, shareListRefreshTick: 0, loadShareSummary: vi.fn() };
    await method.call(ctx, 'u2');
    expect(ctx.loadShareSummary).not.toHaveBeenCalled();
  });
});

describe('free-task selection helpers (B-048)', () => {
  const NAMES = ['phaseFreeState', 'toggleFreeInPhase', 'phaseFreeLabel', 'selectAllFreeState', 'toggleSelectAllFree', 'selectAllFreeLabel',
    'freeStateOf', 'toggleFreeOf', 'freeLabelOf'];
  const methods = new Function('window', '_cgSelectedTaskIds',
    `return { ${NAMES.map(n => extractBlock(html, `    ${n}(`)).join(',\n')} };`);

  function make({ selected = [], linked = [] } = {}) {
    const free = [{ taskId: 'a', taskName: 'A' }, { taskId: 'b', taskName: 'B' }];
    const assigned = { taskId: 'z', taskName: 'Z' };
    const draft = { phases: [{ tasks: [free[0], assigned] }, { tasks: [free[1]] }], linkedProjects: [{ taskIds: ['z'], taskNames: ['Z'] }, ...linked] };
    const mirror = new Set(selected);
    const self = { draft, isReadOnly: false, selectedTaskIds: new Set(selected) };
    Object.assign(self, methods(window, mirror));
    return { self, mirror, draft };
  }

  it('phase: state, label and toggle when nothing is selected', () => {
    const { self, draft, mirror } = make();
    const phase = draft.phases[0];
    expect(self.phaseFreeState(phase)).toBe('some');
    expect(self.phaseFreeLabel(phase)).toBe('Select free (1)');
    self.toggleFreeInPhase(phase);
    expect([...self.selectedTaskIds]).toEqual(['a']);
    expect([...mirror]).toEqual(['a']);
    expect(self.phaseFreeState(phase)).toBe('all');
    expect(self.phaseFreeLabel(phase)).toBe('Clear phase');
    self.toggleFreeInPhase(phase);
    expect([...self.selectedTaskIds]).toEqual([]);
    expect([...mirror]).toEqual([]);
  });

  it('phase with only assigned tasks: none, "All in projects", toggle selects nothing', () => {
    const { self } = make();
    const onlyAssigned = { tasks: [{ taskId: 'z', taskName: 'Z' }] };
    expect(self.phaseFreeState(onlyAssigned)).toBe('none');
    expect(self.phaseFreeLabel(onlyAssigned)).toBe('All in projects');
    self.toggleFreeInPhase(onlyAssigned);
    expect(self.selectedTaskIds.size).toBe(0);
  });

  it('whole draft: some selected → "Select all free (2)", toggle selects every free task', () => {
    const { self, mirror } = make({ selected: ['a'] });
    expect(self.selectAllFreeState()).toBe('some');
    expect(self.selectAllFreeLabel()).toBe('Select all free (2)');
    self.toggleSelectAllFree();
    expect([...self.selectedTaskIds].sort()).toEqual(['a', 'b']);
    expect([...mirror].sort()).toEqual(['a', 'b']);
  });

  it('whole draft: all selected → "Clear selection", toggle clears the free ones', () => {
    const { self } = make({ selected: ['a', 'b'] });
    expect(self.selectAllFreeState()).toBe('all');
    expect(self.selectAllFreeLabel()).toBe('Clear selection');
    self.toggleSelectAllFree();
    expect(self.selectedTaskIds.size).toBe(0);
  });

  it('whole draft: nothing free → none, "Select all free (0)"', () => {
    const { self } = make({ linked: [{ taskIds: ['a', 'b'], taskNames: [] }] });
    expect(self.selectAllFreeState()).toBe('none');
    expect(self.selectAllFreeLabel()).toBe('Select all free (0)');
  });
});

describe('editor Clone button and the in-flight guard (B-091)', () => {
  const build = (cgCloneGrid) => new Function('cgCloneGrid', `return { ${extractBlock(html, 'async cloneProposal(')} };`)(cgCloneGrid);
  const self = () => ({ cgId: 'cg1', verId: 'v1', proposalBusy: false });

  it('a call ignored by the in-flight guard (null) leaves the button busy', async () => {
    const s = self();
    await build(vi.fn(async () => null)).cloneProposal.call(s);
    expect(s.proposalBusy).toBe(true);
  });

  it('a finished or failed clone releases it', async () => {
    for (const outcome of [true, false]) {
      const s = self();
      await build(vi.fn(async () => outcome)).cloneProposal.call(s);
      expect(s.proposalBusy).toBe(false);
    }
    const s = self();
    await expect(build(vi.fn(async () => { throw new Error('boom'); })).cloneProposal.call(s)).rejects.toThrow('boom');
    expect(s.proposalBusy).toBe(false);
  });
});

describe('duplicate date converters are gone (dates C1)', () => {
  it('js/core.js no longer defines date2ymd / ym2month / month2ym / ymd2date', () => {
    const core = readFileSync('js/core.js', 'utf8');
    for (const n of ['date2ymd', 'ym2month', 'month2ym', 'ymd2date']) expect(core.includes(`function ${n}(`)).toBe(false);
  });
  it('js/costgrid.js no longer defines cgItToIso / cgIsoToIt', () => {
    expect(js).not.toMatch(/function cgItToIso\b/);
    expect(js).not.toMatch(/function cgIsoToIt\b/);
  });
});
