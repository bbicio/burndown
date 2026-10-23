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

function build() {
  const cg = { id: 'cg1', name: 'Grid', versions: [{ versionId: 'v1', versionLabel: 'v1', currency: 'EUR', phases: [{ phaseName: 'P', tasks: [] }], roles: [] }] };
  const stubs = { Api: api, cgLoad: () => cg, _cgStructureRuleNotified: notified, showInfo };
  const names = Object.keys(stubs);
  return new Function(...names, 'window', `${extractBlock(js, 'async function _cgUpsertVersionToApi(')}; return _cgUpsertVersionToApi;`)(
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
    expect(showInfo.mock.calls[0][0]).toContain('"T1"');
    expect(showInfo.mock.calls[0][1]).toContain('Changes not saved');
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
