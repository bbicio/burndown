import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';

// js/costgrid.js is a classic script, so cgCreateNewGrid is cut out of the file and run against
// stubs. B-003: it reports its outcome so pipeline.html can keep its buttons locked after success.
const js = readFileSync('js/costgrid.js', 'utf8');

let api, shownInfo, opened;

function build() {
  shownInfo = [];
  opened = [];
  const stubs = {
    Api: { costGrids: { create: api.create, delete: api.delete, versions: { create: api.versionsCreate, saveStructure: api.saveStructure } } },
    cgNewPhId: () => 'ph1',
    cgGetIndex: () => [],
    cgSaveIndex: () => {},
    cgSave: () => {},
    showInfo: (...a) => { shownInfo.push(a); },
    showCostGridEditorView: (...a) => { opened.push(a); },
    _cgCreateInFlight: false,
  };
  const names = Object.keys(stubs);
  return new Function(...names, `${extractBlock(js, 'async function cgDiscardNewGrid(')}; ${extractBlock(js, 'async function cgCreateNewGrid(')}; return cgCreateNewGrid;`)(
    ...names.map(n => stubs[n]));
}

describe('cgCreateNewGrid — outcome', () => {
  beforeEach(() => {
    api = {
      create: vi.fn(async () => ({ id: 'newCg' })),
      versionsCreate: vi.fn(async () => ({ id: 'newVer' })),
      saveStructure: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    };
  });

  it('returns true and opens the editor with focusName', async () => {
    expect(await build()()).toBe(true);
    expect(opened).toEqual([['newCg', 'newVer', { focusName: true }]]);
  });

  it('returns false when the API create fails, and has nothing to delete', async () => {
    api.create.mockRejectedValue(new Error('nope'));
    expect(await build()()).toBe(false);
    expect(shownInfo[0][0]).toMatch(/^Could not create the proposal: /);
    expect(opened).toEqual([]);
    expect(api.delete).not.toHaveBeenCalled();
  });

  // B-086: a failure after the grid exists must not leave an empty proposal behind.
  it('deletes the new grid when creating its version fails', async () => {
    api.versionsCreate.mockRejectedValue(new Error('no version'));
    expect(await build()()).toBe(false);
    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(api.delete).toHaveBeenCalledWith('newCg');
    expect(shownInfo[0][0]).toBe('Could not create the proposal: no version');
    expect(opened).toEqual([]);
  });

  it('still reports the original error when the compensating delete fails too', async () => {
    api.versionsCreate.mockRejectedValue(new Error('no version'));
    api.delete.mockRejectedValue(new Error('delete failed'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await build()()).toBe(false);
    expect(shownInfo[0][0]).toBe('Could not create the proposal: no version');
    warn.mockRestore();
  });

  // B-091: a call ignored by the in-flight guard answers null, not false, so the caller does not release the running call's state.
  it('answers null to a second call made while the first is running', async () => {
    const fn = build();
    const first = fn();
    expect(await fn()).toBeNull();
    expect(await first).toBe(true);
  });
});
