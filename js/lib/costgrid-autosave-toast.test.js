import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';

// The autosave stays behind CG_AUTOSAVE_ENABLED (save contract cycle 2): cgAutoSave is the Save of the open
// version, and with the switch on the "saved" toast of the debounced autosave appears only when that Save went
// through. js/costgrid.js is a classic script, so the functions are cut out and run against stubs.
const js = readFileSync('js/costgrid.js', 'utf8');

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('CG_AUTOSAVE_ENABLED', () => {
  it('is off: the only switch of the autosave', () => {
    expect(js.match(/const CG_AUTOSAVE_ENABLED = (true|false);/g)).toEqual(['const CG_AUTOSAVE_ENABLED = false;']);
  });
});

describe('cgAutoSave', () => {
  function build({ active = true, outcome = { kind: 'ok' } } = {}) {
    const save = vi.fn(async () => outcome);
    const stubs = {
      _cgActiveCgId: active ? 'cg1' : null,
      _cgActiveVersionId: active ? 'v1' : null,
      _cgDraft: active ? { versionId: 'v1' } : null,
      _cgSaveVersion: save,
    };
    const names = Object.keys(stubs);
    const fn = new Function(...names, `${extractBlock(js, 'function cgAutoSave(')}; return cgAutoSave;`)(...names.map(n => stubs[n]));
    return { fn, save };
  }

  it('is the Save of the open version and resolves to its outcome', async () => {
    const { fn, save } = build({ outcome: { kind: 'rule', message: 'm' } });
    expect(await fn()).toEqual({ kind: 'rule', message: 'm' });
    expect(save).toHaveBeenCalledWith('cg1', 'v1');
  });

  it('resolves none when no version is open', async () => {
    const { fn, save } = build({ active: false });
    expect(await fn()).toEqual({ kind: 'none' });
    expect(save).not.toHaveBeenCalled();
  });
});

describe('cgScheduleAutoSave', () => {
  function build(outcome, enabled) {
    const show = vi.fn();
    const toastEl = {};
    const stubs = {
      _cgAutoSaveTimer: null,
      cgAutoSave: vi.fn(() => Promise.resolve(outcome)),
      cgRefreshSaveState: vi.fn(),
      document: { getElementById: id => (id === 'cgAutoSaveToast' ? toastEl : null) },
      bootstrap: { Toast: { getOrCreateInstance: () => ({ show }) } },
    };
    const names = Object.keys(stubs);
    const fn = new Function(...names, `const CG_AUTOSAVE_ENABLED = ${enabled}; ${extractBlock(js, 'function cgScheduleAutoSave(')}; return cgScheduleAutoSave;`)(...names.map(n => stubs[n]));
    return { fn, show, ...stubs };
  }

  it('switched off, only refreshes the save state', async () => {
    vi.useFakeTimers();
    const { fn, cgAutoSave, cgRefreshSaveState } = build({ kind: 'ok' }, false);
    fn();
    await vi.advanceTimersByTimeAsync(3000);
    expect(cgRefreshSaveState).toHaveBeenCalledTimes(1);
    expect(cgAutoSave).not.toHaveBeenCalled();
  });

  it('switched on, shows the toast when the save succeeded', async () => {
    vi.useFakeTimers();
    const { fn, show, cgAutoSave } = build({ kind: 'ok' }, true);
    fn();
    await vi.advanceTimersByTimeAsync(2000);
    expect(cgAutoSave).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('switched on, does not show the toast when the save failed', async () => {
    vi.useFakeTimers();
    const { fn, show, cgAutoSave } = build({ kind: 'unknown', message: 'x' }, true);
    fn();
    await vi.advanceTimersByTimeAsync(2000);
    expect(cgAutoSave).toHaveBeenCalledTimes(1);
    expect(show).not.toHaveBeenCalled();
  });
});
