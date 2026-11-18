import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';

// js/costgrid.js is a classic script, so cgCloneGrid is cut out of the file and run against stubs.
// Since save contract cycle 2 Clone never saves the open draft itself (cgConfirmSaveFirst asks before), and
// the copied structure goes to the Save route (PUT /api/cost-grids/:id/versions/:vId) through apiSave.
const js = readFileSync('js/costgrid.js', 'utf8');

let api, store, shownInfo, opened, calls;

function build({ myPermission = 'owner', srcOverrides = {} } = {}) {
  const srcVer = { versionId: 'v1', currency: 'EUR', clientId: null, ratecardId: null, startDate: '', endDate: '', note: '', roles: [], phases: [], ...srcOverrides };
  const cg = { id: 'cg1', name: 'Source', myPermission, versions: [srcVer] };
  store = { cg1: cg };
  shownInfo = [];
  opened = [];
  calls = [];
  const stubs = {
    Api: { costGrids: { create: api.create, delete: api.delete, versions: { create: api.versionsCreate } } },
    cgApiClientId: id => (id && /^[0-9a-f-]{36}$/i.test(id)) ? id : null,
    cgAutoSave: vi.fn(async () => { calls.push('flush'); }),
    cgLoad: id => store[id],
    cgSave: c => { store[c.id] = c; },
    cgGetIndex: () => Object.keys(store),
    cgSaveIndex: () => {},
    cgLoadStructureFromApi: vi.fn(async (...a) => { calls.push('load:' + a[0]); return true; }),
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
  window.apiSave = api.save;
  const fn = new Function(...names, 'document', 'window', `${extractBlock(js, 'async function cgDiscardNewGrid(')}; ${extractBlock(js, 'async function cgCloneGrid(')}; return cgCloneGrid;`)(
    ...names.map(n => stubs[n]), document, window);
  return { fn, stubs };
}

describe('cgCloneGrid — never saves the open source draft', () => {
  beforeEach(() => {
    api = {
      create: vi.fn(async () => ({ id: 'newCg' })),
      versionsCreate: vi.fn(async () => ({ id: 'newVer' })),
      save: vi.fn(async () => ({ kind: 'ok', data: { version: 1 } })),
      delete: vi.fn(async () => {}),
    };
    window.__pdashAuthRedirecting = false;
  });

  it('an editor of the open source version: no save, the clone is made', async () => {
    const { fn, stubs } = build({ myPermission: 'owner' });
    await fn('cg1', 'v1');
    expect(stubs.cgAutoSave).not.toHaveBeenCalled();
    expect(opened).toEqual([['newCg', 'newVer']]);
    expect(shownInfo).toEqual([]);
  });

  it('a viewer: no save, the clone is made', async () => {
    const { fn, stubs } = build({ myPermission: 'viewer' });
    await fn('cg1', 'v1');
    expect(stubs.cgAutoSave).not.toHaveBeenCalled();
    expect(opened).toEqual([['newCg', 'newVer']]);
    expect(shownInfo).toEqual([]);
  });
});

describe('cgCloneGrid — order, payload and outcome', () => {
  beforeEach(() => {
    api = {
      create: vi.fn(async () => ({ id: 'newCg' })),
      versionsCreate: vi.fn(async () => ({ id: 'newVer' })),
      save: vi.fn(async () => ({ kind: 'ok', data: { version: 1 } })),
      delete: vi.fn(async () => {}),
    };
    window.__pdashAuthRedirecting = false;
  });

  it('loads the source structure first', async () => {
    const { fn } = build();
    await fn('cg1', 'v1');
    expect(calls[0]).toBe('load:cg1');
  });

  it('sends the copied structure to the Save route of the new version, from its version', async () => {
    api.versionsCreate.mockResolvedValue({ id: 'newVer', version: 0 });
    const { fn } = build({ srcOverrides: { phases: [{ phaseName: 'P', tasks: [] }], roles: [{ roleCode: 'PM', rate: 1 }] } });
    await fn('cg1', 'v1');
    expect(api.save).toHaveBeenCalledWith('PUT', '/cost-grids/newCg/versions/newVer', {
      version: 0, structure: { phases: [{ phaseName: 'P', tasks: [] }], roles: [{ roleCode: 'PM', rate: 1 }] },
    });
  });

  it('creates the clone version with the source header', async () => {
    const { fn } = build({ srcOverrides: {
      currency: 'USD', clientId: '11111111-2222-3333-4444-555555555555', ratecardId: 'rc1',
      startDate: '2026-01', endDate: '2026-06', note: 'n',
    } });
    await fn('cg1', 'v1');
    expect(api.versionsCreate).toHaveBeenCalledWith('newCg', {
      label: 'v1', currency: 'USD', clientId: '11111111-2222-3333-4444-555555555555', ratecardId: 'rc1',
      startDate: '2026-01', endDate: '2026-06', note: 'n', projectName: 'Source — Copy',
    });
  });

  // B-183 review: role baselines read the version's currencyRate, so the in-memory clone must carry the rate
  // the server gave the new version, or an in-place clone converts at 1.0 until a reload.
  it('seeds the clone with the rate the server saved on the new version', async () => {
    api.versionsCreate.mockResolvedValue({ id: 'newVer', currency_rate: '1.200000' });
    const { fn } = build({ srcOverrides: { currency: 'USD', currencyRate: 1.1 } });
    await fn('cg1', 'v1');
    expect(store.newCg.versions[0].currencyRate).toBe(1.2);
  });

  it('passes a null clientId for the unassigned sentinel', async () => {
    const { fn } = build({ srcOverrides: { clientId: '__unassigned__' } });
    await fn('cg1', 'v1');
    expect(api.versionsCreate.mock.calls[0][1].clientId).toBeNull();
  });

  it('returns true after navigating', async () => {
    const { fn } = build();
    expect(await fn('cg1', 'v1')).toBe(true);
    expect(opened).toHaveLength(1);
  });

  it('returns false when creating the grid fails, and has nothing to delete', async () => {
    const { fn } = build();
    api.create.mockRejectedValue(new Error('no grid'));
    expect(await fn('cg1', 'v1')).toBe(false);
    expect(opened).toEqual([]);
    expect(api.delete).not.toHaveBeenCalled();
  });

  // B-086: the structure copy is part of the create path, and a failure there removes the new grid.
  it('deletes the new grid when copying the structure fails', async () => {
    const { fn } = build();
    api.save.mockResolvedValue({ kind: 'rule', code: 'STRUCTURE_RULE', message: 'structure refused' });
    expect(await fn('cg1', 'v1')).toBe(false);
    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(api.delete).toHaveBeenCalledWith('newCg');
    expect(shownInfo[0][0]).toBe('Could not clone the proposal: structure refused');
    expect(opened).toEqual([]);
  });

  it('a source currency no longer active: the refusal says how to clone again', async () => {
    const { fn } = build({ srcOverrides: { currency: 'CHF' } });
    api.versionsCreate.mockRejectedValue(Object.assign(new Error('Currency CHF is not active'), { data: { code: 'CURRENCY_RULE', error: 'Currency CHF is not active' } }));
    expect(await fn('cg1', 'v1')).toBe(false);
    expect(api.delete).toHaveBeenCalledWith('newCg');
    expect(shownInfo[0][0]).toBe('Could not clone the proposal: Currency CHF is not active. Activate it in Master Data → Currencies, then clone again.');
  });

  it('deletes the new grid when creating its version fails', async () => {
    const { fn } = build();
    api.versionsCreate.mockRejectedValue(new Error('no version'));
    expect(await fn('cg1', 'v1')).toBe(false);
    expect(api.delete).toHaveBeenCalledWith('newCg');
  });

  it('still reports the original error when the compensating delete fails too', async () => {
    const { fn } = build();
    api.save.mockResolvedValue({ kind: 'rule', code: 'STRUCTURE_RULE', message: 'structure refused' });
    api.delete.mockRejectedValue(new Error('delete failed'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await fn('cg1', 'v1')).toBe(false);
    expect(shownInfo[0][0]).toBe('Could not clone the proposal: structure refused');
    warn.mockRestore();
  });

  // B-091: a call ignored by the in-flight guard answers null, not false.
  it('answers null to a second call made while the first is running', async () => {
    const { fn } = build();
    const first = fn('cg1', 'v1');
    expect(await fn('cg1', 'v1')).toBeNull();
    expect(await first).toBe(true);
  });

  it('returns true even when the clone structure reload fails, once the warning is dismissed', async () => {
    const { fn, stubs } = build();
    stubs.cgLoadStructureFromApi.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const modal = document.createElement('div');
    modal.id = 'confirmModal';
    document.body.appendChild(modal);
    const done = fn('cg1', 'v1');
    await vi.waitFor(() => expect(shownInfo).toHaveLength(1));
    modal.dispatchEvent(new Event('hidden.bs.modal'));
    expect(await done).toBe(true);
    expect(opened).toHaveLength(1);
    modal.remove();
  });

  // B-087: showInfo is a modal; navigating at once would hide the warning before it is read.
  it('opens the clone only after the "Clone incomplete" warning is dismissed', async () => {
    const { fn, stubs } = build();
    stubs.cgLoadStructureFromApi.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const modal = document.createElement('div');
    modal.id = 'confirmModal';
    document.body.appendChild(modal);
    const done = fn('cg1', 'v1');
    await vi.waitFor(() => expect(shownInfo).toHaveLength(1));
    expect(shownInfo[0][1]).toContain('Clone incomplete');
    await Promise.resolve();
    expect(opened).toEqual([]);
    modal.dispatchEvent(new Event('hidden.bs.modal'));
    await done;
    expect(opened).toEqual([['newCg', 'newVer']]);
    modal.remove();
  });});
