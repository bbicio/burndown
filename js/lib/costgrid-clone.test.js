import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

// js/costgrid.js is a classic script, so cgCloneGrid is cut out of the file and run against stubs.
// Regression found in the final review of the "New Proposal / Clone without a modal" cycle
// (2026-10-07): when the clone's source is the version currently open in the editor, cgCloneGrid
// flushes the pending autosave first (cgAutoSave(true)) so the clone carries the latest edits. A
// viewer has no edit permission on the source grid, so that flush's PATCH/POST calls 403 and the
// whole clone throws — before this cycle there was no flush, so a viewer's clone worked. The flush
// must be skipped when the source grid's permission is 'viewer'.
const js = readFileSync('js/costgrid.js', 'utf8');

function extractFunction(src, name) {
  const start = src.indexOf(`async function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found`);
  let i = src.indexOf('{', src.indexOf(')', start));
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { i++; break; }
  }
  return src.slice(start, i);
}

let api, store, shownInfo, opened;

function build({ myPermission = 'owner' } = {}) {
  const srcVer = { versionId: 'v1', currency: 'EUR', clientId: null, ratecardId: null, startDate: '', endDate: '', note: '', roles: [], phases: [] };
  const cg = { id: 'cg1', name: 'Source', myPermission, versions: [srcVer] };
  store = { cg1: cg };
  shownInfo = [];
  opened = [];
  const stubs = {
    Api: { costGrids: { create: api.create, versions: { create: api.versionsCreate, saveStructure: api.saveStructure } } },
    cgApiClientId: id => (id && /^[0-9a-f-]{36}$/i.test(id)) ? id : null,
    cgAutoSave: vi.fn(async () => {}),
    cgLoad: id => store[id],
    cgSave: c => { store[c.id] = c; },
    cgGetIndex: () => Object.keys(store),
    cgSaveIndex: () => {},
    cgLoadStructureFromApi: vi.fn(async () => true),
    stripCloneTaskIds: phases => phases,
    showInfo: (...a) => { shownInfo.push(a); },
    showCostGridEditorView: (...a) => { opened.push(a); },
    bootstrap: { Modal: { getInstance: () => null } },
    _cgActiveCgId: 'cg1',
    _cgActiveVersionId: 'v1',
    _cgAutoSaveTimer: null,
    _cgCloneInFlight: false,
  };
  const names = Object.keys(stubs);
  const fn = new Function(...names, 'document', 'window', `${extractFunction(js, 'cgCloneGrid')}; return cgCloneGrid;`)(
    ...names.map(n => stubs[n]), document, window);
  return { fn, stubs };
}

describe('cgCloneGrid — autosave flush respects the source grid permission', () => {
  beforeEach(() => {
    api = {
      create: vi.fn(async () => ({ id: 'newCg' })),
      versionsCreate: vi.fn(async () => ({ id: 'newVer' })),
      saveStructure: vi.fn(async () => {}),
    };
    window.__pdashAuthRedirecting = false;
  });

  it('flushes the autosave when the user can edit the open source version', async () => {
    const { fn, stubs } = build({ myPermission: 'owner' });
    await fn('cg1', 'v1');
    expect(stubs.cgAutoSave).toHaveBeenCalledTimes(1);
    expect(opened).toEqual([['newCg', 'newVer']]);
    expect(shownInfo).toEqual([]);
  });

  it('skips the autosave flush for a viewer, and still clones successfully', async () => {
    const { fn, stubs } = build({ myPermission: 'viewer' });
    await fn('cg1', 'v1');
    expect(stubs.cgAutoSave).not.toHaveBeenCalled();
    expect(opened).toEqual([['newCg', 'newVer']]);
    expect(shownInfo).toEqual([]);
  });
});
