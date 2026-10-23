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
    Api: { costGrids: { create: api.create, versions: { create: api.versionsCreate, saveStructure: api.saveStructure } } },
    cgNewPhId: () => 'ph1',
    cgGetIndex: () => [],
    cgSaveIndex: () => {},
    cgSave: () => {},
    showInfo: (...a) => { shownInfo.push(a); },
    showCostGridEditorView: (...a) => { opened.push(a); },
    _cgCreateInFlight: false,
  };
  const names = Object.keys(stubs);
  return new Function(...names, `${extractBlock(js, 'async function cgCreateNewGrid(')}; return cgCreateNewGrid;`)(
    ...names.map(n => stubs[n]));
}

describe('cgCreateNewGrid — outcome', () => {
  beforeEach(() => {
    api = {
      create: vi.fn(async () => ({ id: 'newCg' })),
      versionsCreate: vi.fn(async () => ({ id: 'newVer' })),
      saveStructure: vi.fn(async () => {}),
    };
  });

  it('returns true and opens the editor with focusName', async () => {
    expect(await build()()).toBe(true);
    expect(opened).toEqual([['newCg', 'newVer', { focusName: true }]]);
  });

  it('returns false when the API create fails', async () => {
    api.create.mockRejectedValue(new Error('nope'));
    expect(await build()()).toBe(false);
    expect(shownInfo[0][0]).toMatch(/^Could not create the proposal: /);
    expect(opened).toEqual([]);
  });
});
