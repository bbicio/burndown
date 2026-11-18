import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';

// Save contract cycle 2: the editor says whether the draft is saved, asks before leaving a draft that is not, and
// asks "Save first?" before the four actions that start from the saved version. The page's Vue methods are cut out
// of costgrid.html (its js/pages/ script inlined by the test setup), the actions out of js/costgrid.js.
const html = readFileSync('costgrid.html', 'utf8');
const js = readFileSync('js/costgrid.js', 'utf8');

const LEAVE = ['You have unsaved changes. Leave without saving?', 'Leave', 'Stay'];
const SAVE_FIRST = ['You have unsaved changes. Save them first?', 'Save and continue', 'Cancel'];

function method(head, stubs) {
  const names = Object.keys(stubs);
  const src = `const o = { ${extractBlock(html, head)} }; return o;`;
  return new Function(...names, 'window', src)(...names.map(n => stubs[n]), stubs.window || window);
}

describe('leaving the editor', () => {
  let dirty, cgAsk, loc, ctx, writes;
  const pageStubs = () => ({
    cgIsDraftDirty: () => dirty,
    cgAsk,
    showDashboardView: vi.fn(id => { loc.href = '/portfolio.html#' + id; }),
    cgAutoSave: vi.fn(() => { writes++; }),
    cgSaveVersion: vi.fn(() => { writes++; }),
    window: { location: loc },
  });
  beforeEach(() => {
    dirty = false; writes = 0;
    cgAsk = vi.fn();
    loc = { href: '/costgrid.html' };
    ctx = { verId: 'v1', cgId: 'cg1', openVersion: vi.fn(async () => {}), backSaving: false };
  });

  const methods = () => {
    const s = pageStubs();
    return {
      s,
      goBack: method('async goBack() {', s).goBack,
      switchVersion: method('async switchVersion(verId) {', s).switchVersion,
      openLinkedProject: method('openLinkedProject(projId) {', s).openLinkedProject,
    };
  };

  it('goBack, switchVersion and openLinkedProject ask before leaving a dirty draft and do not ask on a clean one', async () => {
    const m = methods();
    await m.goBack.call(ctx);
    await m.switchVersion.call(ctx, 'v2');
    m.openLinkedProject.call(ctx, 'p1');
    expect(cgAsk).not.toHaveBeenCalled();
    expect(ctx.openVersion).toHaveBeenCalledWith('cg1', 'v2');
    expect(m.s.showDashboardView).toHaveBeenCalledWith('p1');

    dirty = true;
    const d = methods();
    ctx.openVersion.mockClear();
    loc.href = '/costgrid.html';
    await d.goBack.call(ctx);
    await d.switchVersion.call(ctx, 'v2');
    d.openLinkedProject.call(ctx, 'p1');
    expect(cgAsk).toHaveBeenCalledTimes(3);
    for (const call of cgAsk.mock.calls) expect(call.slice(0, 3)).toEqual(LEAVE);
    expect(loc.href).toBe('/costgrid.html');
    expect(ctx.openVersion).not.toHaveBeenCalled();
    expect(d.s.showDashboardView).not.toHaveBeenCalled();
  });

  it('Leave proceeds without any write', async () => {
    dirty = true;
    const m = methods();
    await m.goBack.call(ctx);
    await m.switchVersion.call(ctx, 'v2');
    m.openLinkedProject.call(ctx, 'p1');
    expect(cgAsk).toHaveBeenCalledTimes(3);
    expect(loc.href).toBe('/costgrid.html');
    for (const call of cgAsk.mock.calls) await call[3]();
    expect(loc.href).toBe('/portfolio.html#p1');
    expect(ctx.openVersion).toHaveBeenCalledWith('cg1', 'v2');
    expect(writes).toBe(0);
    expect(m.s.cgAutoSave).not.toHaveBeenCalled();
  });

  it('goBack goes straight to the pipeline, with no wait', async () => {
    vi.useFakeTimers();
    const m = methods();
    m.goBack.call(ctx);
    expect(loc.href).toBe('/pipeline.html');
    vi.useRealTimers();
  });

  it('beforeunload prevents only when dirty', () => {
    const { onBeforeUnload } = method('onBeforeUnload(e) {', pageStubs());
    const ev = () => ({ preventDefault: vi.fn(), returnValue: undefined });
    const clean = ev();
    onBeforeUnload.call({}, clean);
    expect(clean.preventDefault).not.toHaveBeenCalled();
    dirty = true;
    const d = ev();
    const { onBeforeUnload: f } = method('onBeforeUnload(e) {', pageStubs());
    f.call({}, d);
    expect(d.preventDefault).toHaveBeenCalled();
    expect(d.returnValue).toBe('');
    const leaving = ev();
    f.call({ leaving: true }, leaving);
    expect(leaving.preventDefault).not.toHaveBeenCalled();
  });
});

describe('the save status', () => {
  const text = status => {
    const { saveStateText } = new Function(`return { ${extractBlock(html, 'saveStateText() {')} };`)();
    return saveStateText.call({ saveState: status });
  };

  it('the status element shows each of the four texts', () => {
    expect(text({ status: 'saved' })).toBe('All changes saved');
    expect(text({ status: 'dirty' })).toBe('Unsaved changes');
    expect(text({ status: 'saving' })).toBe('Saving…');
    expect(text({ status: 'failed', message: 'Task "T" is outside the version period.' })).toBe('Not saved: Task "T" is outside the version period.');
  });

  it('sits in the page head before Save, as a role="status" element, with Reload only for a reloadable failure', () => {
    const actions = html.slice(html.indexOf('<div class="ph-actions">'), html.indexOf('id="btnCgSave"'));
    expect(actions).toMatch(/role="status"/);
    expect(actions).toMatch(/v-if="saveState\.status === 'failed' && saveState\.reloadable"[^>]*@click="reloadVersion"/);
    expect(html).toMatch(/id="btnCgSave"[^>]*:disabled="saveState\.status === 'saved'"/);
  });

  it('Reload asks before discarding and reopens the version from the server', async () => {
    const cgAsk = vi.fn();
    const pending = new Set(['v1']);
    const stubs = { cgAsk, cgSyncFromApi: vi.fn(async () => {}), _cgCurrencyChangePending: pending };
    const { reloadVersion } = method('reloadVersion() {', stubs);
    const ctx = { cgId: 'cg1', verId: 'v1', openVersion: vi.fn(async () => {}) };
    reloadVersion.call(ctx);
    expect(cgAsk.mock.calls[0].slice(0, 3)).toEqual(['Discard your unsaved changes and reload this version?', 'Reload', 'Cancel']);
    expect(ctx.openVersion).not.toHaveBeenCalled();
    await cgAsk.mock.calls[0][3]();
    expect(stubs.cgSyncFromApi).toHaveBeenCalled();
    expect(ctx.openVersion).toHaveBeenCalledWith('cg1', 'v1');
    expect(pending.has('v1')).toBe(false);
  });
});

describe('Save first?', () => {
  function confirmWith({ dirty, outcome }) {
    const cgAsk = vi.fn();
    const stubs = { cgIsDraftDirty: () => dirty, cgAsk, cgSaveVersion: vi.fn(async () => outcome) };
    const names = Object.keys(stubs);
    const fn = new Function(...names, `${extractBlock(js, 'function cgConfirmSaveFirst(')}; return cgConfirmSaveFirst;`)(...names.map(n => stubs[n]));
    return { fn, cgAsk, stubs };
  }

  it('a clean draft proceeds at once', () => {
    const { fn, cgAsk } = confirmWith({ dirty: false });
    const proceed = vi.fn();
    fn(proceed);
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(cgAsk).not.toHaveBeenCalled();
  });

  it('Save and continue saves, then proceeds on ok', async () => {
    const { fn, cgAsk, stubs } = confirmWith({ dirty: true, outcome: { kind: 'ok' } });
    const proceed = vi.fn();
    fn(proceed);
    expect(cgAsk.mock.calls[0].slice(0, 3)).toEqual(SAVE_FIRST);
    expect(proceed).not.toHaveBeenCalled();
    await cgAsk.mock.calls[0][3]();
    expect(stubs.cgSaveVersion).toHaveBeenCalledTimes(1);
    expect(proceed).toHaveBeenCalledTimes(1);
  });

  it('a failed Save and continue does not run the action', async () => {
    for (const outcome of [{ kind: 'rule', message: 'm' }, { kind: 'unknown', message: 'u' }, { kind: 'conflict', message: 'c' }, { kind: 'none' }]) {
      const { fn, cgAsk } = confirmWith({ dirty: true, outcome });
      const proceed = vi.fn();
      const abort = vi.fn();
      fn(proceed, abort);
      await cgAsk.mock.calls[0][3]();
      expect(proceed).not.toHaveBeenCalled();
      expect(abort).toHaveBeenCalledTimes(1);
    }
  });

  it('Cancel runs the abort and not the action', () => {
    const { fn, cgAsk } = confirmWith({ dirty: true });
    const proceed = vi.fn();
    const abort = vi.fn();
    fn(proceed, abort);
    cgAsk.mock.calls[0][4]();
    expect(proceed).not.toHaveBeenCalled();
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it('Generate, Publish, New version and Clone of the open version ask "Save first?" when dirty', async () => {
    const asked = [];
    const base = {
      cgIsDraftDirty: () => true,
      cgConfirmSaveFirst: vi.fn((proceed, abort) => { asked.push('ask'); if (abort) abort(); }),
      _cgActiveCgId: 'cg1', _cgActiveVersionId: 'v1',
      _cgDraft: { versionId: 'v1', pipeline: 'Draft', projectName: 'P', phases: [], linkedProjects: [] },
      cgSyncHeaderFromForm: () => {}, showInfo: vi.fn(), showConfirm: vi.fn(),
      cgLoad: () => ({ id: 'cg1', versions: [{ versionId: 'v1', pipeline: 'Draft' }], myPermission: 'owner' }),
      Api: { costGrids: { create: vi.fn(), versions: { duplicate: vi.fn(), publish: vi.fn() } } },
      _cgNewVersionInFlight: false, _cgCloneInFlight: false,
    };
    const names = Object.keys(base);
    const run = head => new Function(...names, 'window', `${extractBlock(js, head)}; return ${head.match(/function (\w+)/)[1]};`)(...names.map(n => base[n]), window);

    run('function cgGenerateProject(')();
    await run('async function cgPublishDraft(')();
    await run('async function cgCreateNewVersionDirect(')();
    expect(await run('async function cgCloneGrid(')('cg1', 'v1')).toBe(false);
    expect(asked).toEqual(['ask', 'ask', 'ask', 'ask']);
    expect(base.showConfirm).not.toHaveBeenCalled();
    expect(base.showInfo).not.toHaveBeenCalled();
    expect(base.Api.costGrids.versions.duplicate).not.toHaveBeenCalled();
    expect(base.Api.costGrids.create).not.toHaveBeenCalled();
  });

  it('Clone of another version than the open one does not ask', async () => {
    const ask = vi.fn();
    const stubs = {
      cgIsDraftDirty: () => true, cgConfirmSaveFirst: ask,
      _cgActiveCgId: 'cg1', _cgActiveVersionId: 'v1', _cgCloneInFlight: false,
      cgLoadStructureFromApi: vi.fn(async () => false), showInfo: vi.fn(), cgLoad: () => null,
    };
    const names = Object.keys(stubs);
    const clone = new Function(...names, 'window', `${extractBlock(js, 'async function cgCloneGrid(')}; return cgCloneGrid;`)(...names.map(n => stubs[n]), window);
    await clone('cg2', 'v9');
    expect(ask).not.toHaveBeenCalled();
  });
});
