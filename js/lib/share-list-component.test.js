// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

// js/share-list-component.js is a classic script that sets window.ShareListComponent: run it whole, against stubs.
const js = readFileSync('js/share-list-component.js', 'utf8');

let alertSpy;
let apiSave;

function component() {
  window.Api = { costGrids: { shares: { list: async () => [] } }, projects: { shares: { list: async () => [] } } };
  window.apiSave = apiSave;
  new Function(js)();
  return window.ShareListComponent;
}

// The methods run against a plain `this`, as Vue would bind them.
function instance(comp, props) {
  const vm = { ...props, shares: [], loading: false, error: '', load: vi.fn(async () => {}) };
  vm.removeShare = comp.methods.removeShare.bind(vm);
  return vm;
}

describe('share list component — removeShare', () => {
  beforeEach(() => {
    alertSpy = vi.fn();
    window.alert = alertSpy;
    apiSave = vi.fn();
  });

  it('removes through apiSave and reloads the list', async () => {
    apiSave.mockResolvedValue({ kind: 'ok', data: {} });
    const vm = instance(component(), { resourceType: 'cost_grid', resourceId: 'cg1' });
    await vm.removeShare('u1');
    expect(apiSave).toHaveBeenCalledWith('DELETE', '/cost-grids/cg1/shares/u1');
    expect(vm.load).toHaveBeenCalled();
    expect(vm.error).toBe('');
  });

  it('uses the projects path for a project', async () => {
    apiSave.mockResolvedValue({ kind: 'ok', data: {} });
    const vm = instance(component(), { resourceType: 'project', resourceId: 'p1' });
    await vm.removeShare('u1');
    expect(apiSave).toHaveBeenCalledWith('DELETE', '/projects/p1/shares/u1');
  });

  it('shows a failure inline, never with alert()', async () => {
    apiSave.mockResolvedValue({ kind: 'error', status: 403, message: 'Forbidden', data: null });
    const vm = instance(component(), { resourceType: 'cost_grid', resourceId: 'cg1' });
    await vm.removeShare('u1');
    expect(vm.error).toBe('Forbidden');
    expect(vm.load).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('has no alert( in its source', () => {
    expect(js).not.toMatch(/\balert\(/);
  });
});
