import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';

// cgCreateNewGrid(year) and cgCloneGrid(src, ver, year) (js/costgrid.js) create a Draft for the year the pipeline
// board is showing: the year goes to POST /versions as `pipelineYear`, or is left out when no integer year is
// given (the editor's own Clone has no board year). Each function is cut out of the classic script and run
// against stubs.
const src = readFileSync('js/costgrid.js', 'utf8');

function stubs() {
  const calls = { create: [], saved: [] };
  const Api = { costGrids: {
    create: async () => ({ id: 'cg-new' }),
    versions: {
      create: async (cgId, body) => { calls.create.push(body); return { id: 'v-new', currency_rate: '1' }; },
      saveStructure: async () => ({}),
    },
  } };
  return { calls, Api, deps: {
    Api,
    cgDiscardNewGrid: async () => {},
    showInfo: () => {},
    cgNewPhId: () => 'ph1',
    cgGetIndex: () => [],
    cgSaveIndex: () => {},
    cgSave: cg => calls.saved.push(cg),
    showCostGridEditorView: () => {},
    cgLoad: () => ({ name: 'Src', myPermission: 'owner', versions: [{
      versionId: 'v-src', currency: 'EUR', roles: [], phases: [], startDate: '', endDate: '', note: '' }] }),
    cgLoadStructureFromApi: async () => true,
    cgApiClientId: () => null,
    stripCloneTaskIds: p => p,
    cgAutoSave: async () => {},
    _cgActiveCgId: null,
    _cgActiveVersionId: null,
    _cgAutoSaveTimer: null,
  } };
}

function build(head, deps, flag) {
  const names = Object.keys(deps);
  const win = { location: { href: 'http://x/pipeline.html' }, history: { replaceState() {} } };
  const fn = new Function(...names, 'window', `let ${flag} = false; return ${extractBlock(src, head)}`);
  return fn(...names.map(n => deps[n]), win);
}

describe('cgCreateNewGrid — pipeline year', () => {
  it('sends the given year to the version create call and seeds it in memory', async () => {
    const { calls, deps } = stubs();
    expect(await build('async function cgCreateNewGrid(', deps, '_cgCreateInFlight')(2027)).toBe(true);
    expect(calls.create).toEqual([{ label: 'v1', pipelineYear: 2027 }]);
    expect(calls.saved[0].versions[0].pipelineYear).toBe(2027);
  });

  it('leaves the year out when none (or a non-integer) is given', async () => {
    for (const arg of [undefined, null, '2027', NaN]) {
      const { calls, deps } = stubs();
      await build('async function cgCreateNewGrid(', deps, '_cgCreateInFlight')(arg);
      expect(calls.create).toEqual([{ label: 'v1' }]);
      expect(calls.saved[0].versions[0].pipelineYear).toBeNull();
    }
  });
});

describe('cgCloneGrid — pipeline year', () => {
  it('sends the given year with the copied header fields', async () => {
    const { calls, deps } = stubs();
    expect(await build('async function cgCloneGrid(', deps, '_cgCloneInFlight')('cg-src', 'v-src', 2027)).toBe(true);
    expect(calls.create).toHaveLength(1);
    expect(calls.create[0].pipelineYear).toBe(2027);
    expect(calls.create[0].label).toBe('v1');
    expect(calls.saved[0].versions[0].pipelineYear).toBe(2027);
  });

  it('leaves the year out when none is given', async () => {
    const { calls, deps } = stubs();
    await build('async function cgCloneGrid(', deps, '_cgCloneInFlight')('cg-src', 'v-src');
    expect('pipelineYear' in calls.create[0]).toBe(false);
    expect(calls.saved[0].versions[0].pipelineYear).toBeNull();
  });
});
