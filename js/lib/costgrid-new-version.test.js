import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

// js/costgrid.js is a classic script, so cgCreateNewVersionDirect is cut out of the file and run against stubs.
// Contract (2026-10-07, cost grid redesign cycle A, Task 2): "+ New version" asks the server for ONE atomic
// full copy of the source version, with no name-prompt modal — the label is a default ('v{n}') computed from
// the current version count, editable afterwards inline on the header's segmented control. It never re-sends
// the source's phases (task id collision bug) and never leaves a half-built version.
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

let api, store, saved, shownInfo, opened;

function build() {
  const cg = { id: 'cg1', versions: [{ versionId: 'v1' }] };
  store = cg;
  saved = [];
  const stubs = {
    Api: { costGrids: { versions: api } },
    cgAutoSave: vi.fn(async () => {}),
    cgLoad: () => store,
    cgSave: c => saved.push(JSON.parse(JSON.stringify(c))),
    cgLoadStructureFromApi: vi.fn(async () => true),
    showInfo: (...a) => { shownInfo.push(a); },
    showCostGridEditorView: (...a) => { opened.push(a); },
    _cgActiveCgId: 'cg1',
    _cgActiveVersionId: 'v1',
    _cgDraft: { versionId: 'v1', currency: 'CHF', phases: [{ tasks: [{ taskId: 'T1' }] }], roles: [{ roleCode: 'PM' }], projectName: 'P' },
    _cgAutoSaveTimer: null,
    _cgNewVersionInFlight: false,
  };
  const names = Object.keys(stubs);
  const fn = new Function(...names, 'document', 'window', `${extractFunction(js, 'cgCreateNewVersionDirect')}; return cgCreateNewVersionDirect;`)(
    ...names.map(n => stubs[n]), document, window);
  return { fn, stubs };
}

describe('cgCreateNewVersionDirect (no-modal full copy of the version)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    api = {
      duplicate: vi.fn(async () => ({ id: 'v2id' })),
      create: vi.fn(),
      saveStructure: vi.fn(),
    };
    shownInfo = []; opened = [];
    window.__pdashAuthRedirecting = false;
  });

  it('computes the default label from the current version count, flushes the autosave, then calls the server duplicate, never re-sending the structure', async () => {
    const { fn, stubs } = build();
    await fn();
    expect(stubs.cgAutoSave).toHaveBeenCalledTimes(1);
    expect(api.duplicate).toHaveBeenCalledWith('cg1', 'v1', { label: 'v2' });
    expect(api.create).not.toHaveBeenCalled();
    expect(api.saveStructure).not.toHaveBeenCalled();
  });

  it('seeds the store header-only (phases come from the API), loads the structure and opens the new version', async () => {
    const { fn, stubs } = build();
    await fn();
    const added = store.versions.find(v => v.versionId === 'v2id');
    expect(added).toBeTruthy();
    expect(added.versionLabel).toBe('v2');
    expect(added.pipeline).toBe('Draft');
    expect(added.phases).toEqual([]);
    expect(added.currency).toBe('CHF');
    expect(stubs.cgLoadStructureFromApi).toHaveBeenCalledWith('cg1', 'v2id');
    expect(opened).toEqual([['cg1', 'v2id']]);
  });

  it('on a server error, shows it via showInfo, changes nothing locally and does not navigate', async () => {
    api.duplicate = vi.fn(async () => { throw new Error('boom'); });
    const { fn, stubs } = build();
    await fn();
    expect(shownInfo.some(a => String(a[0]).includes('boom'))).toBe(true);
    expect(store.versions).toHaveLength(1);
    expect(saved).toHaveLength(0);
    expect(stubs.cgLoadStructureFromApi).not.toHaveBeenCalled();
    expect(opened).toHaveLength(0);
  });

  it('flushes in strict mode and, if the flush fails, shows the error via showInfo and does not copy stale server data', async () => {
    const { fn, stubs } = build();
    stubs.cgAutoSave.mockRejectedValueOnce(new Error('save down'));
    await fn();
    expect(stubs.cgAutoSave).toHaveBeenCalledWith(true);
    expect(api.duplicate).not.toHaveBeenCalled();
    expect(shownInfo.some(a => String(a[0]).includes('save down'))).toBe(true);
    expect(opened).toHaveLength(0);
  });

  it('a fast repeat call is ignored while one is already in flight', async () => {
    const { fn } = build();
    let resolveDuplicate;
    const pending = new Promise(res => { resolveDuplicate = () => res({ id: 'v2id' }); });
    api.duplicate = vi.fn(() => pending);
    const first = fn();
    const second = fn(); // should no-op immediately — the in-flight guard
    resolveDuplicate();
    await Promise.all([first, second]);
    expect(api.duplicate).toHaveBeenCalledTimes(1);
  });
});
