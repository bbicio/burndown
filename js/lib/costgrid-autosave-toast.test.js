import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';

// B-088: cgAutoSave reports whether every write reached the server, and the "saved" toast of the debounced
// autosave appears only then. js/costgrid.js is a classic script, so both functions are cut out and run against stubs.
const js = readFileSync('js/costgrid.js', 'utf8');

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function buildAutoSave({ upsert, active = true, cgExists = true } = {}) {
  const cg = { id: 'cg1', versions: [{ versionId: 'v1' }] };
  const stubs = {
    _cgActiveCgId: active ? 'cg1' : null,
    _cgActiveVersionId: active ? 'v1' : null,
    _cgDraft: active ? { versionId: 'v1' } : null,
    cgSyncHeaderFromForm: () => {},
    cgLoad: () => (cgExists ? cg : null),
    cgSave: () => {},
    _cgUpsertVersionToApi: upsert,
  };
  const names = Object.keys(stubs);
  return new Function(...names, `${extractBlock(js, 'function cgAutoSave(')}; return cgAutoSave;`)(...names.map(n => stubs[n]));
}

describe('cgAutoSave — outcome', () => {
  it('resolves true when the upsert reports success', async () => {
    expect(await buildAutoSave({ upsert: vi.fn(async () => true) })()).toBe(true);
  });

  it('resolves false when the upsert reports a failed write', async () => {
    expect(await buildAutoSave({ upsert: vi.fn(async () => false) })()).toBe(false);
  });

  it('resolves false, and logs, when the upsert throws and the save is not strict', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await buildAutoSave({ upsert: vi.fn(async () => { throw new Error('boom'); }) })()).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('rejects when the upsert throws and the save is strict', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(buildAutoSave({ upsert: vi.fn(async () => { throw new Error('boom'); }) })(true)).rejects.toThrow('boom');
  });

  it('resolves false when there is nothing to save (no active version, or no grid)', async () => {
    const upsert = vi.fn(async () => true);
    expect(await buildAutoSave({ upsert, active: false })()).toBe(false);
    expect(await buildAutoSave({ upsert, cgExists: false })()).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('cgScheduleAutoSave — toast', () => {
  function build(outcome) {
    const show = vi.fn();
    const toastEl = {};
    const stubs = {
      _cgAutoSaveTimer: null,
      cgAutoSave: vi.fn(() => Promise.resolve(outcome)),
      document: { getElementById: id => (id === 'cgAutoSaveToast' ? toastEl : null) },
      bootstrap: { Toast: { getOrCreateInstance: () => ({ show }) } },
    };
    const names = Object.keys(stubs);
    const fn = new Function(...names, `${extractBlock(js, 'function cgScheduleAutoSave(')}; return cgScheduleAutoSave;`)(...names.map(n => stubs[n]));
    return { fn, show, cgAutoSave: stubs.cgAutoSave };
  }

  it('shows the toast when the save succeeded', async () => {
    vi.useFakeTimers();
    const { fn, show, cgAutoSave } = build(true);
    fn();
    await vi.advanceTimersByTimeAsync(2000);
    expect(cgAutoSave).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('does not show the toast when a write failed', async () => {
    vi.useFakeTimers();
    const { fn, show, cgAutoSave } = build(false);
    fn();
    await vi.advanceTimersByTimeAsync(2000);
    expect(cgAutoSave).toHaveBeenCalledTimes(1);
    expect(show).not.toHaveBeenCalled();
  });
});

describe('cgSaveVersion — button label', () => {
  function run(outcome) {
    document.body.innerHTML = '<button id="btnCgSave"><i></i> Save</button>';
    const cgAutoSave = vi.fn(() => Promise.resolve(outcome));
    const fn = new Function('cgAutoSave', `${extractBlock(js, 'async function cgSaveVersion(')}; return cgSaveVersion;`)(cgAutoSave);
    return fn().then(() => document.getElementById('btnCgSave').textContent.trim());
  }

  it('says "✓ Saved" when every write reached the server', async () => {
    expect(await run(true)).toBe('✓ Saved');
  });

  it('says "⚠ Not saved" when a write failed', async () => {
    expect(await run(false)).toBe('⚠ Not saved');
  });
});
