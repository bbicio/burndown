import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';
import './cg-draft.js';
import './save.js';

// The editor's Save (save contract cycle 2): js/costgrid.js and js/api-sync.js are classic scripts, so the
// save functions are cut out of both and run together, sharing the editor's globals, against a fake apiFetch.
const cgJs = readFileSync('js/costgrid.js', 'utf8');
const syncJs = readFileSync('js/api-sync.js', 'utf8');
const flag = cgJs.match(/const CG_AUTOSAVE_ENABLED = (true|false);/)[0];

const COST_GRID_BLOCKS = [
  'function cgSetSaveState(', 'function cgRefreshSaveState(', 'function cgCaptureBase(', 'function cgIsDraftDirty(',
  'function cgAutoSave(', 'function cgScheduleAutoSave(', 'async function cgSaveVersion(', 'function cgAdoptServerRate(',
];
const SYNC_BLOCKS = ['function _cgCurrencyFromDb(', 'function _cgApiVersionToLocal(', 'async function _cgSaveVersion('];

const header = () => ({
  versionId: 'v1', versionLabel: 'v1', pipeline: 'Draft', startDate: '202601', endDate: '202612',
  currency: 'EUR', currencyRate: 1, note: '', ratecardId: null, clientId: 'c1', projectName: 'P', version: 3,
  status: 'draft', linkedProjects: [{ projectId: 'p1' }],
});
const draftOf = () => ({
  ...header(),
  phases: [{ phaseId: 'ph1', phaseName: 'Phase', tasks: [
    { taskId: 't1', taskName: 'T', taskDescription: '', taskStartDate: '', taskEndDate: '', ptc: 0, hours: { DEV: 2 } },
  ] }],
  roles: [{ roleCode: 'DEV', roleLabel: 'Dev', rate: 100, rateIsCustom: false }],
});
// The server's answer: the cost_grid_version snapshot for the body it received.
const answer = (body, over = {}) => ({
  id: 'v1', cost_grid_id: 'cg1', label: 'v1', pipeline: 'Draft', pipeline_year: null, start_date: '202601', end_date: '202612',
  currency: 'EUR', currency_rate: 1, note: '', locked: false, ratecard_id: null, client_id: 'c1', project_name: 'P',
  ...(body.header?.note !== undefined ? { note: body.header.note } : {}),
  ...(body.header?.pipeline !== undefined ? { pipeline: body.header.pipeline } : {}),
  ...(body.header?.currency !== undefined ? { currency: body.header.currency } : {}),
  version: body.version + 1, structure: { phases: [] }, ...over,
});

let h;
function build() {
  const cg = { id: 'cg1', versions: [draftOf()] };
  const stubs = {
    window,
    cgLoad: () => JSON.parse(JSON.stringify(cg)),
    cgSave: c => { cg.versions = JSON.parse(JSON.stringify(c.versions)); },
    cgSyncHeaderFromForm: () => {},
    cgSyncRoleRatesToBaseline: vi.fn(() => { h.draft.roles.forEach(r => { r.rate = Math.round(r.rate * 2); }); }),
    cgPropagatePipelineToProjects: vi.fn(),
    renderCgEditor: () => {},
    bootstrap: { Toast: { getOrCreateInstance: () => ({ show: vi.fn() }) } },
  };
  const names = Object.keys(stubs);
  const body = `
    let _cgActiveCgId = 'cg1', _cgActiveVersionId = 'v1', _cgDraft = null, _cgBase = null, _cgSaving = false;
    let _cgAutoSaveTimer = null, _cgVueApp = null;
    ${flag}
    const cgSaveState = { status: 'saved', message: '', reloadable: false };
    const _cgCurrencyChangePending = new Set();
    ${COST_GRID_BLOCKS.map(b => extractBlock(cgJs, b)).join('\n')}
    ${SYNC_BLOCKS.map(b => extractBlock(syncJs, b)).join('\n')}
    return {
      get draft() { return _cgDraft; }, set draft(d) { _cgDraft = d; },
      open(verId, d) { _cgActiveVersionId = verId; _cgDraft = d; cgCaptureBase(); },
      cgSaveState, _cgCurrencyChangePending,
      cgCaptureBase, cgIsDraftDirty, cgScheduleAutoSave, cgSaveVersion, _cgSaveVersion,
    };`;
  const api = new Function(...names, body)(...names.map(n => stubs[n]));
  return Object.assign(api, { stubs, cg: () => cg });
}

let calls;
function fetchAnswering(fn) {
  calls = [];
  window.apiFetch = vi.fn(async (path, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : null;
    calls.push({ path, method: opts?.method, body });
    return fn(body, path);
  });
}

beforeEach(() => {
  h = build();
  h.draft = draftOf();
  h.cgCaptureBase();
  fetchAnswering(body => answer(body));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); delete window.apiFetch; });

describe('no autosave', () => {
  it('an edit followed by 3 s of fake timers sends no write', () => {
    vi.useFakeTimers();
    h.draft.note = 'edited';
    h.cgScheduleAutoSave();
    vi.advanceTimersByTime(3000);
    expect(window.apiFetch).not.toHaveBeenCalled();
    expect(h.cgSaveState.status).toBe('dirty');
  });
});

describe('_cgSaveVersion', () => {
  it('Save sends one PUT to the Save route with version, the changed header only and no linkedProjects/status', async () => {
    h.draft.note = 'n';
    h.draft.linkedProjects = [];
    h.draft.status = 'sip';
    const out = await h._cgSaveVersion('cg1', 'v1');
    expect(out.kind).toBe('ok');
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].path).toBe('/cost-grids/cg1/versions/v1');
    expect(calls[0].body).toEqual({ version: 3, header: { note: 'n' } });
  });

  it('an unchanged structure is not sent', async () => {
    h.draft.pipeline = 'SIP';
    await h._cgSaveVersion('cg1', 'v1');
    expect(calls[0].body).not.toHaveProperty('structure');
    h.draft.phases[0].tasks[0].hours.DEV = 5;
    await h._cgSaveVersion('cg1', 'v1');
    expect(calls[1].body).not.toHaveProperty('header');
    expect(calls[1].body.structure.phases[0].tasks[0].hours).toEqual({ DEV: 5 });
  });

  it('nothing changed: no write, kind none', async () => {
    expect((await h._cgSaveVersion('cg1', 'v1')).kind).toBe('none');
    expect(window.apiFetch).not.toHaveBeenCalled();
  });

  it('ok adopts the server header, version and rate and recaptures the base', async () => {
    h.draft.pipeline = 'SIP';
    fetchAnswering(body => answer(body, { pipeline_year: 2026 }));
    await h._cgSaveVersion('cg1', 'v1');
    expect(h.draft.version).toBe(4);
    expect(h.draft.pipelineYear).toBe(2026);
    expect(h.cgIsDraftDirty()).toBe(false);
    expect(h.cgSaveState.status).toBe('saved');
    expect(h.stubs.cgPropagatePipelineToProjects).toHaveBeenCalledTimes(1);
    expect(h.cg().versions[0].version).toBe(4);
  });

  it('edits made during a save stay unsaved', async () => {
    h.draft.note = 'first';
    let release;
    fetchAnswering(body => new Promise(r => { release = () => r(answer(body)); }));
    const pending = h._cgSaveVersion('cg1', 'v1');
    await Promise.resolve();
    expect(h.cgSaveState.status).toBe('saving');
    h.draft.phases[0].tasks[0].hours.DEV = 9;
    h.draft.note = 'second';
    release();
    expect((await pending).kind).toBe('ok');
    expect(h.draft.note).toBe('second');
    expect(h.cgIsDraftDirty()).toBe(true);
    expect(h.cgSaveState.status).toBe('dirty');
  });

  it('a server rate different from the preview re-syncs roles and leaves the draft unsaved', async () => {
    h.draft.currency = 'CHF';
    h.draft.currencyRate = 0.9;            // the preview's rate
    h._cgCurrencyChangePending.add('v1');
    fetchAnswering(body => answer(body, { currency: 'CHF', currency_rate: 0.8 }));
    const out = await h._cgSaveVersion('cg1', 'v1');
    expect(out.kind).toBe('ok');
    expect(h.draft.currencyRate).toBe(0.8);
    expect(h.stubs.cgSyncRoleRatesToBaseline).toHaveBeenCalledTimes(1);
    expect(h.draft.roles[0].rate).toBe(200);
    expect(h.cgIsDraftDirty()).toBe(true);
    expect(h._cgCurrencyChangePending.has('v1')).toBe(false);
    await h._cgSaveVersion('cg1', 'v1');
    expect(calls[1].body.structure.roles[0].rate).toBe(200);
  });

  it('500 and timeout give failed with the unknown message; the draft is unchanged', async () => {
    for (const err of [Object.assign(new Error('x'), { status: 500 }), Object.assign(new Error('t'), { timeout: true })]) {
      h = build(); h.draft = draftOf(); h.cgCaptureBase();
      h.draft.note = 'kept';
      h._cgCurrencyChangePending.add('v1');
      fetchAnswering(() => { throw err; });
      const out = await h._cgSaveVersion('cg1', 'v1');
      expect(out.kind).toBe('unknown');
      expect(h.cgSaveState.status).toBe('failed');
      expect(h.cgSaveState.message).toBe(window.UNKNOWN_MESSAGE ?? "The server's answer was lost — the change may have been saved. Reload to check.");
      expect(h.cgSaveState.reloadable).toBe(true);
      expect(h.draft.note).toBe('kept');
      expect(h.draft.version).toBe(3);
      expect(h.cgIsDraftDirty()).toBe(true);
      expect(h._cgCurrencyChangePending.has('v1')).toBe(true);
    }
  });

  it('409 STALE gives failed, reloadable', async () => {
    h.draft.note = 'n';
    fetchAnswering(() => { throw Object.assign(new Error('stale'), { status: 409, data: { error: 'This version was changed by someone else since you opened it.', code: 'STALE', version: 7 } }); });
    const out = await h._cgSaveVersion('cg1', 'v1');
    expect(out.kind).toBe('conflict');
    expect(h.cgSaveState).toMatchObject({ status: 'failed', message: 'This version was changed by someone else since you opened it.', reloadable: true });
  });

  it('a rule refusal gives failed with its message, not reloadable', async () => {
    h.draft.note = 'n';
    fetchAnswering(() => { throw Object.assign(new Error('r'), { status: 400, data: { error: 'Task "T" is outside the version period.', code: 'DATE_RULE' } }); });
    const out = await h._cgSaveVersion('cg1', 'v1');
    expect(out.kind).toBe('rule');
    expect(h.cgSaveState).toMatchObject({ status: 'failed', message: 'Task "T" is outside the version period.', reloadable: false });
  });

  it('cgSaveVersion ignores a second click while a Save is in flight', async () => {
    h.draft.note = 'n';
    let release;
    fetchAnswering(body => new Promise(r => { release = () => r(answer(body)); }));
    const first = h.cgSaveVersion();
    await Promise.resolve();
    const second = await h.cgSaveVersion();
    expect(second.kind).toBe('none');
    release();
    await first;
    expect(calls).toHaveLength(1);
  });
});

describe('new grid', () => {
  it('new grid: a failed initial structure save discards the grid and shows the error', async () => {
    const stubs = {
      window,
      Api: { costGrids: {
        create: vi.fn(async () => ({ id: 'cgN' })),
        versions: { create: vi.fn(async () => ({ id: 'vN', version: 0 })) },
      } },
      cgDiscardNewGrid: vi.fn(async () => {}),
      showInfo: vi.fn(),
      cgGetIndex: () => [], cgSaveIndex: () => {}, cgSave: vi.fn(), cgNewPhId: () => 'ph',
      showCostGridEditorView: vi.fn(),
    };
    fetchAnswering(() => { throw Object.assign(new Error('r'), { status: 400, data: { error: 'Bad structure', code: 'STRUCTURE_RULE' } }); });
    const names = Object.keys(stubs);
    const create = new Function(...names, `let _cgCreateInFlight = false; ${extractBlock(cgJs, 'async function cgCreateNewGrid(')}; return cgCreateNewGrid;`)(...names.map(n => stubs[n]));
    expect(await create()).toBe(false);
    expect(calls[0]).toMatchObject({ method: 'PUT', path: '/cost-grids/cgN/versions/vN' });
    expect(calls[0].body.version).toBe(0);
    expect(stubs.cgDiscardNewGrid).toHaveBeenCalledWith('cgN');
    expect(stubs.showInfo).toHaveBeenCalledWith('Could not create the proposal: Bad structure', 'Error');
    expect(stubs.showCostGridEditorView).not.toHaveBeenCalled();
  });
});

describe('_cgSaveVersion — another version opened meanwhile', () => {
  it('a version switched during its Save leaves the new version\'s base and state alone', async () => {
    h.draft.note = 'v1 edit';
    let release;
    fetchAnswering(body => new Promise(r => { release = () => r(answer(body)); }));
    const pending = h._cgSaveVersion('cg1', 'v1');
    await Promise.resolve();
    const v2 = { ...draftOf(), versionId: 'v2', note: 'v2 note' };
    h.open('v2', v2);
    release();
    expect((await pending).kind).toBe('ok');
    expect(h.draft).toBe(v2);
    expect(v2.version).toBe(3);
    expect(h.cgIsDraftDirty()).toBe(false);
    expect(h.cgSaveState.status).toBe('saved');
    expect(h.cg().versions[0].version).toBe(4);
  });

  it('a slow failed Save of one version neither shows its failure on the other nor touches its flag', async () => {
    h.draft.note = 'v1 edit';
    h._cgCurrencyChangePending.add('v1');
    let fail;
    fetchAnswering(() => new Promise((_, rej) => { fail = () => rej(Object.assign(new Error('x'), { status: 500 })); }));
    const pending = h._cgSaveVersion('cg1', 'v1');
    await Promise.resolve();
    h.open('v2', { ...draftOf(), versionId: 'v2' });
    h._cgCurrencyChangePending.add('v2');
    fail();
    expect((await pending).kind).toBe('unknown');
    expect(h.cgSaveState.status).toBe('saved');
    expect([...h._cgCurrencyChangePending].sort()).toEqual(['v1', 'v2']);
  });

  it('the currency-change flag belongs to its version: a Save of another version neither uses nor clears it', async () => {
    h._cgCurrencyChangePending.add('v2');
    h.draft.note = 'n';
    fetchAnswering(body => answer(body, { currency_rate: 1.3 }));
    await h._cgSaveVersion('cg1', 'v1');
    expect(h.stubs.cgSyncRoleRatesToBaseline).not.toHaveBeenCalled();
    expect(h._cgCurrencyChangePending.has('v2')).toBe(true);
  });
});

describe('_cgSaveVersion — what travels', () => {
  it('never sends a currency rate, and the period travels in the header, never in the structure', async () => {
    h.draft.startDate = '202602';
    h.draft.currencyRate = 1.7;
    h.draft.phases[0].tasks[0].taskStartDate = '2026-02-03';
    await h._cgSaveVersion('cg1', 'v1');
    const body = calls[0].body;
    expect(body.header).toEqual({ startDate: '202602' });
    expect(JSON.stringify(body)).not.toMatch(/currencyRate|currency_rate|period/);
    expect(Object.keys(body.structure).sort()).toEqual(['phases', 'roles']);
  });

  it('an answer at the same rate re-syncs nothing', async () => {
    h.draft.note = 'n';
    h._cgCurrencyChangePending.add('v1');
    await h._cgSaveVersion('cg1', 'v1');
    expect(h.stubs.cgSyncRoleRatesToBaseline).not.toHaveBeenCalled();
    expect(h._cgCurrencyChangePending.has('v1')).toBe(false);
    expect(h.cgIsDraftDirty()).toBe(false);
  });

  it('a 400 that is not a rule gives failed with its message, not reloadable', async () => {
    h.draft.note = 'n';
    fetchAnswering(() => { throw Object.assign(new Error('u'), { status: 400, data: { error: 'Unknown field: status' } }); });
    expect((await h._cgSaveVersion('cg1', 'v1')).kind).toBe('error');
    expect(h.cgSaveState).toMatchObject({ status: 'failed', message: 'Unknown field: status', reloadable: false });
  });

  it('a version that is not the open one is never saved', async () => {
    h.draft.note = 'n';
    expect((await h._cgSaveVersion('cg1', 'other')).kind).toBe('none');
    expect(window.apiFetch).not.toHaveBeenCalled();
  });
});

describe('cgLoadStructureFromApi', () => {
  // B-195: Custom comes from task_roles.rate_is_custom; rate_override is every role's saved rate.
  function loadWith(rows, roles, extra = {}) {
    const ver = { versionId: 'v1', roles };
    const cg = { id: 'cg1', versions: [ver] };
    const struct = { phases: [{ id: 'p1', title: 'P', tasks: [{ id: 't1', title: 'T', roles: rows }] }], ...extra };
    const load = new Function('Api', 'cgLoad', 'cgSave', `${extractBlock(syncJs, 'async function cgLoadStructureFromApi(')}; return cgLoadStructureFromApi;`)(
      { costGrids: { versions: { structure: async () => struct } } }, () => cg, () => {});
    return load('cg1', 'v1').then(() => ver);
  }

  it('reloads rateIsCustom from the flag, not from rate_override', async () => {
    const ver = await loadWith([
      { code: 'PM', rate_override: '100.00', rate_is_custom: false, days: 2 },
      { code: 'DEV', rate_override: '90.00', rate_is_custom: true, days: 1 },
    ], []);
    expect(ver.roles).toMatchObject([
      { roleCode: 'PM', rate: 100, rateIsCustom: false },
      { roleCode: 'DEV', rate: 90, rateIsCustom: true },
    ]);
  });

  it('a missing flag is not Custom', async () => {
    const ver = await loadWith([{ code: 'PM', rate_override: '100.00', days: 2 }], []);
    expect(ver.roles).toMatchObject([{ roleCode: 'PM', rate: 100, rateIsCustom: false }]);
  });

  it('rebuilds stale in-memory roles when every role has rate_override', async () => {
    const ver = await loadWith([{ code: 'PM', rate_override: '100.00', rate_is_custom: false, days: 2 }],
      [{ roleCode: 'PM', rate: 50, rateIsCustom: true }]);
    expect(ver.roles).toMatchObject([{ roleCode: 'PM', rate: 100, rateIsCustom: false }]);
  });

  it('keeps in-memory roles when a role has no rate_override', async () => {
    const kept = await loadWith([{ code: 'PM', rate_override: null, hourly_rate: '100', days: 2 }],
      [{ roleCode: 'PM', rate: 120, rateIsCustom: false }]);
    expect(kept.roles).toEqual([{ roleCode: 'PM', rate: 120, rateIsCustom: false }]);
    const rebuilt = await loadWith([{ code: 'PM', rate_override: null, hourly_rate: '100', days: 2 }], []);
    expect(rebuilt.roles).toMatchObject([{ roleCode: 'PM', rate: 100, rateIsCustom: false }]);
  });

  it('a role with no saved rate is marked rateUnsaved; a saved one is not', async () => {
    const ver = await loadWith([
      { code: 'PM', rate_override: null, hourly_rate: '100', days: 2 },
      { code: 'DEV', rate_override: '90.00', days: 1 },
    ], []);
    expect(ver.roles[0].rateUnsaved).toBe(true);
    expect(ver.roles[1]).not.toHaveProperty('rateUnsaved');
  });

  it('takes the version the structure read reports, so the Save starts from it', async () => {
    const ver = await loadWith([{ code: 'PM', rate_override: '100.00', days: 2 }], [], { version: 6 });
    expect(ver.version).toBe(6);
  });
});
