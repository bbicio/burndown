import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';

// js/api-sync.js is a classic script, so _cgUpsertVersionToApi is cut out of the file and run
// against stubs. B-004: a failed PATCH must be reported, never converted into a POST that
// creates a duplicate grid/version on the server.
const js = readFileSync('js/api-sync.js', 'utf8');

let api;

function build() {
  const cg = { id: 'cg1', name: 'Grid', versions: [{ versionId: 'v1', versionLabel: 'v1', currency: 'EUR', phases: [{ phaseName: 'P', tasks: [] }], roles: [] }] };
  const stubs = { Api: api, cgLoad: () => cg };
  const names = Object.keys(stubs);
  return new Function(...names, 'window', `${extractBlock(js, 'async function _cgUpsertVersionToApi(')}; return _cgUpsertVersionToApi;`)(
    ...names.map(n => stubs[n]), { __currencies: [] });
}

describe('_cgUpsertVersionToApi — no POST fallback', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
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

  it('non-strict failures resolve without creating anything', async () => {
    api.costGrids.update.mockRejectedValue(new Error('boom grid'));
    await expect(build()('cg1', 'v1')).resolves.toBeUndefined();
    api.costGrids.update.mockResolvedValue();
    api.costGrids.versions.update.mockRejectedValue(new Error('boom version'));
    await expect(build()('cg1', 'v1')).resolves.toBeUndefined();
    expect(api.costGrids.create).not.toHaveBeenCalled();
    expect(api.costGrids.versions.create).not.toHaveBeenCalled();
  });
});
