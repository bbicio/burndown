import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';

// js/api-sync.js is a classic script, so _cgUpsertVersionToApi is cut out of the file and run
// against stubs. B-004: a failed PATCH must be reported, never converted into a POST that
// creates a duplicate grid/version on the server.
const js = readFileSync('js/api-sync.js', 'utf8');

let api;
let notified;
let showInfo;

function build(phases = [{ phaseName: 'P', tasks: [] }], period = { startDate: '202606', endDate: '202701' }) {
  const cg = { id: 'cg1', name: 'Grid', versions: [{ versionId: 'v1', versionLabel: 'v1', currency: 'EUR', phases, roles: [], ...period }] };
  const stubs = { Api: api, cgLoad: () => cg, _cgRuleNotified: notified, showInfo };
  const names = Object.keys(stubs);
  return new Function(...names, 'window', `${extractBlock(js, 'function _cgForgetRuleNotices(')}; ${extractBlock(js, 'async function _cgUpsertVersionToApi(')}; return _cgUpsertVersionToApi;`)(
    ...names.map(n => stubs[n]), { __currencies: [] });
}

describe('_cgUpsertVersionToApi — no POST fallback', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    notified = new Set();
    showInfo = vi.fn();
    api = { costGrids: {
      update: vi.fn(async () => {}),
      create: vi.fn(async () => {}),
      versions: { update: vi.fn(async () => {}), create: vi.fn(async () => {}), saveStructure: vi.fn(async () => {}) },
    } };
  });

  it('saves grid name, version meta and structure when both PATCHes succeed', async () => {
    await build()('cg1', 'v1');
    expect(api.costGrids.update).toHaveBeenCalledWith('cg1', { name: 'Grid' });
    expect(api.costGrids.versions.update).toHaveBeenCalledWith('cg1', 'v1', expect.objectContaining({ label: 'v1', currency: 'EUR' }));
    expect(api.costGrids.versions.saveStructure).toHaveBeenCalledTimes(1);
  });

  it('grid PATCH failure does not create a grid and rethrows it in strict', async () => {
    api.costGrids.update.mockRejectedValue(new Error('boom grid'));
    await expect(build()('cg1', 'v1', { strict: true })).rejects.toThrow('boom grid');
    expect(api.costGrids.create).not.toHaveBeenCalled();
    expect(api.costGrids.versions.update).not.toHaveBeenCalled();
  });

  it('version PATCH failure does not create a version and rethrows it in strict', async () => {
    api.costGrids.versions.update.mockRejectedValue(new Error('boom version'));
    await expect(build()('cg1', 'v1', { strict: true })).rejects.toThrow('boom version');
    expect(api.costGrids.versions.create).not.toHaveBeenCalled();
    expect(api.costGrids.versions.saveStructure).not.toHaveBeenCalled();
  });

  it('non-strict failures resolve to false without creating anything', async () => {
    api.costGrids.update.mockRejectedValue(new Error('boom grid'));
    await expect(build()('cg1', 'v1')).resolves.toBe(false);
    api.costGrids.update.mockResolvedValue();
    api.costGrids.versions.update.mockRejectedValue(new Error('boom version'));
    await expect(build()('cg1', 'v1')).resolves.toBe(false);
    expect(api.costGrids.create).not.toHaveBeenCalled();
    expect(api.costGrids.versions.create).not.toHaveBeenCalled();
  });

  // B-088: the name is a grid-level field; failing to save it must not skip the version and its structure.
  it('a failed name save does not skip the version metadata and the structure, and resolves to false', async () => {
    api.costGrids.update.mockRejectedValue(new Error('boom grid'));
    await expect(build()('cg1', 'v1')).resolves.toBe(false);
    expect(api.costGrids.versions.update).toHaveBeenCalledTimes(1);
    expect(api.costGrids.versions.saveStructure).toHaveBeenCalledTimes(1);
  });

  it('in strict mode a failed name save still throws before anything else is written', async () => {
    api.costGrids.update.mockRejectedValue(new Error('boom grid'));
    await expect(build()('cg1', 'v1', { strict: true })).rejects.toThrow('boom grid');
    expect(api.costGrids.versions.update).not.toHaveBeenCalled();
    expect(api.costGrids.versions.saveStructure).not.toHaveBeenCalled();
  });

  // A refused structure is refused again on every autosave: the user is told once per version, never silently.
  it('a STRUCTURE_RULE refusal is shown once per version and resolves to false', async () => {
    const refusal = Object.assign(new Error('400'), { data: { code: 'STRUCTURE_RULE', error: 'Cannot save: tasks linked to a project would be removed: "T1"' } });
    api.costGrids.versions.saveStructure.mockRejectedValue(refusal);
    await expect(build()('cg1', 'v1')).resolves.toBe(false);
    await expect(build()('cg1', 'v1')).resolves.toBe(false);
    expect(showInfo).toHaveBeenCalledTimes(1);
    expect(showInfo.mock.calls[0][0]).toBe('Cannot save: tasks linked to a project would be removed: "T1". Your changes to this version are not being saved: reload the page to see its current structure.');
    expect(showInfo.mock.calls[0][1]).toContain('Changes not saved');
  });

  const dateRule = (m = 'Task "T" ends on 2026-12-31, after the project period (2026-01 – 2026-06).') => Object.assign(new Error('400'), { data: { code: 'DATE_RULE', error: m } });
  const period = { startDate: '202606', endDate: '202701' };

  it('with the structure loaded, the PATCH carries no period and the structure carries it', async () => {
    await expect(build()('cg1', 'v1')).resolves.toBe(true);
    const body = api.costGrids.versions.update.mock.calls[0][2];
    expect(body).not.toHaveProperty('startDate');
    expect(body).not.toHaveProperty('endDate');
    expect(api.costGrids.versions.saveStructure.mock.calls[0][2].period).toEqual(period);
    const o = [api.costGrids.update, api.costGrids.versions.update, api.costGrids.versions.saveStructure].map(m => m.mock.invocationCallOrder[0]);
    expect(o[0]).toBeLessThan(o[1]);
    expect(o[1]).toBeLessThan(o[2]);
  });

  it.each([
    ['shrink', { startDate: '202607', endDate: '202612' }],
    ['widen', { startDate: '202601', endDate: '202712' }],
    ['shift', { startDate: '202609', endDate: '203001' }],
  ])('a %s draft sends the same three calls and resolves true', async (_n, p) => {
    await expect(build(undefined, p)('cg1', 'v1')).resolves.toBe(true);
    expect(api.costGrids.update).toHaveBeenCalledTimes(1);
    expect(api.costGrids.versions.update).toHaveBeenCalledTimes(1);
    expect(api.costGrids.versions.saveStructure).toHaveBeenCalledTimes(1);
    expect(api.costGrids.versions.saveStructure.mock.calls[0][2].period).toEqual(p);
  });

  it('without the structure loaded, the PATCH carries the period and nothing else is sent', async () => {
    await expect(build([])('cg1', 'v1')).resolves.toBe(true);
    expect(api.costGrids.versions.update.mock.calls[0][2]).toMatchObject(period);
    expect(api.costGrids.versions.saveStructure).not.toHaveBeenCalled();
  });

  it('a DATE_RULE refusal of the structure resolves false and shows the §3.1 text once', async () => {
    api.costGrids.versions.saveStructure.mockRejectedValue(dateRule('why.'));
    await expect(build()('cg1', 'v1')).resolves.toBe(false);
    await expect(build()('cg1', 'v1')).resolves.toBe(false);
    expect(showInfo).toHaveBeenCalledTimes(1);
    expect(showInfo.mock.calls[0]).toEqual(['why. Tasks and the period of this version are not saved until this is fixed; other changes are saved.', '⚠️ Changes not saved']);
  });

  it('a different code or message for the same version shows a new notice', async () => {
    api.costGrids.versions.saveStructure.mockRejectedValueOnce(dateRule('why.'));
    await build()('cg1', 'v1');
    api.costGrids.versions.saveStructure.mockRejectedValueOnce(Object.assign(new Error('400'), { data: { code: 'STRUCTURE_RULE', error: 'Cannot save: x' } }));
    await build()('cg1', 'v1');
    expect(showInfo).toHaveBeenCalledTimes(2);
  });

  it('a successful structure save forgets the notices of that version', async () => {
    api.costGrids.versions.saveStructure.mockRejectedValueOnce(dateRule('why.'));
    await build()('cg1', 'v1');
    await expect(build()('cg1', 'v1')).resolves.toBe(true);
    api.costGrids.versions.saveStructure.mockRejectedValueOnce(dateRule('why.'));
    await build()('cg1', 'v1');
    expect(showInfo).toHaveBeenCalledTimes(2);
  });

  it('a refused PATCH no longer skips the structure save', async () => {
    api.costGrids.versions.update.mockRejectedValue(dateRule());
    await expect(build()('cg1', 'v1')).resolves.toBe(false);
    expect(api.costGrids.versions.saveStructure).toHaveBeenCalledTimes(1);
    api.costGrids.versions.update.mockRejectedValue(new Error('boom version'));
    await expect(build()('cg1', 'v1')).resolves.toBe(false);
    expect(api.costGrids.versions.saveStructure).toHaveBeenCalledTimes(2);
  });

  it('a DATE_RULE refusal of the PATCH (structure not loaded) keeps the pre-C4 sentence', async () => {
    api.costGrids.versions.update.mockRejectedValue(dateRule('why.'));
    await expect(build([])('cg1', 'v1')).resolves.toBe(false);
    expect(showInfo.mock.calls[0]).toEqual(['why. Your changes to this version are not being saved until this is fixed.', '⚠️ Changes not saved']);
  });

  it('a successful structure reload forgets the notices, so the same refusal is shown again', async () => {
    api.costGrids.versions.saveStructure.mockRejectedValue(dateRule('why.'));
    await build()('cg1', 'v1');
    const cg = { id: 'cg1', versions: [{ versionId: 'v1' }] };
    const load = new Function('Api', 'cgLoad', 'cgSave', '_cgRuleNotified', `${extractBlock(js, 'function _cgForgetRuleNotices(')}; ${extractBlock(js, 'async function cgLoadStructureFromApi(')}; return cgLoadStructureFromApi;`)(
      { costGrids: { versions: { structure: async () => ({ phases: [] }) } } }, () => cg, () => {}, notified);
    await expect(load('cg1', 'v1')).resolves.toBe(true);
    await build()('cg1', 'v1');
    expect(showInfo).toHaveBeenCalledTimes(2);
  });

  it('strict: a refused structure throws before anything else', async () => {
    api.costGrids.versions.saveStructure.mockRejectedValue(dateRule());
    await expect(build()('cg1', 'v1', { strict: true })).rejects.toThrow('400');
    expect(api.costGrids.versions.create).not.toHaveBeenCalled();
  });

  it('strict: the structure with the new period is sent', async () => {
    await expect(build(undefined, { startDate: '202601', endDate: '202712' })('cg1', 'v1', { strict: true })).resolves.toBe(true);
    expect(api.costGrids.versions.saveStructure.mock.calls[0][2].period).toEqual({ startDate: '202601', endDate: '202712' });
  });

  it('stored out-of-period: the PATCH succeeds, the structure is refused, one notice, false', async () => {
    api.costGrids.versions.saveStructure.mockRejectedValue(dateRule('why.'));
    await expect(build()('cg1', 'v1')).resolves.toBe(false);
    await expect(build()('cg1', 'v1')).resolves.toBe(false);
    expect(api.costGrids.versions.update).toHaveBeenCalledTimes(2);
    expect(showInfo).toHaveBeenCalledTimes(1);
  });

  it('any other structure failure shows no notice', async () => {
    api.costGrids.versions.saveStructure.mockRejectedValue(new Error('boom structure'));
    await expect(build()('cg1', 'v1')).resolves.toBe(false);
    expect(showInfo).not.toHaveBeenCalled();
  });

  it('resolves to true when every write succeeded', async () => {
    await expect(build()('cg1', 'v1')).resolves.toBe(true);
    await expect(build()('cg1', 'v1', { strict: true })).resolves.toBe(true);
  });

  it('a failed structure save resolves to false (non-strict) and throws (strict)', async () => {
    api.costGrids.versions.saveStructure.mockRejectedValue(new Error('boom structure'));
    await expect(build()('cg1', 'v1')).resolves.toBe(false);
    await expect(build()('cg1', 'v1', { strict: true })).rejects.toThrow('boom structure');
  });

  it('resolves to false when the grid or the version is not in the store (nothing was written)', async () => {
    await expect(build()('cg1', 'nope')).resolves.toBe(false);
    expect(api.costGrids.update).not.toHaveBeenCalled();
  });
});
