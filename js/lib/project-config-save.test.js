import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';
import './project-draft.js';

// project-config's Save (save contract cycle 3): onSave and onReload are cut out of js/pages/project-config.js and
// run on a fake page state, with _saveProject stubbed to each outcome.
const pageJs = readFileSync('js/pages/project-config.js', 'utf8');

let config, saveProject, location;
function page(outcome) {
  saveProject = vi.fn(async () => outcome);
  const methods = new Function('config', 'persistConfig', 'isValidSoldHours', '_saveProject', 'window', `
    return { ${extractBlock(pageJs, 'async onSave(')}, ${extractBlock(pageJs, 'async onReload(')} };
  `)(config, () => {}, () => true, saveProject, window);
  const project = {
    id: 'p1', name: 'A', code: '', currency: 'EUR', pipeline: 'SIP', status: '', description: '', startDate: '202601', endDate: '202612',
    tasks: [], phasing: { '202601': 1 }, ptc: [], planning: {}, groups: [], costGridRef: null, version: 4, my_permission: 'editor',
  };
  const vm = {
    ...methods, saving: false, jsonError: '', saveReloadable: false, rateInvalid: {},
    project, savedSnapshot: JSON.stringify(project),
    moneyFieldsError: () => '', showConfirm: vi.fn(async () => true),
  };
  vm.project = { ...project, name: 'B' };
  return vm;
}

beforeEach(() => {
  config = { projects: [{ id: 'p1', name: 'A' }] };
  location = { href: '', reload: vi.fn() };
  Object.defineProperty(window, 'location', { value: location, configurable: true, writable: true });
  window.scrollTo = vi.fn();
});

describe('project-config onSave', () => {
  it('conflict shows the message and a Reload action', async () => {
    const vm = page({ kind: 'conflict', message: 'This project was changed by someone else since you opened it.', version: 6 });
    await vm.onSave();
    expect(vm.jsonError).toBe('This project was changed by someone else since you opened it.');
    expect(vm.saveReloadable).toBe(true);
    expect(vm.saving).toBe(false);
    expect(location.href).toBe('');
    expect(config.projects[0].name).toBe('A');
    await vm.onReload();
    expect(vm.showConfirm).toHaveBeenCalledWith('Discard your unsaved changes and reload this project?');
    expect(location.reload).toHaveBeenCalled();
  });

  it('a rule or a 404 shows the reason with no Reload and never recreates the project', async () => {
    const vm = page({ kind: 'error', status: 404, message: 'Project not found' });
    await vm.onSave();
    expect(vm.jsonError).toBe('Save failed: Project not found');
    expect(vm.saveReloadable).toBe(false);
    expect(saveProject).toHaveBeenCalledTimes(1);
  });

  it('ok replaces the project in config.projects and navigates', async () => {
    const vm = page({ kind: 'ok', project: { id: 'p1', name: 'B', version: 5, my_permission: 'owner' } });
    const snap = vm.savedSnapshot;
    await vm.onSave();
    expect(saveProject).toHaveBeenCalledWith(window.projectSavable(JSON.parse(snap)), vm.project);
    expect(config.projects[0]).toMatchObject({ id: 'p1', name: 'B', version: 5, my_permission: 'editor' });
    expect(location.href).toBe('/portfolio.html?projectId=p1');
  });

  it('an unchanged project navigates without a request', async () => {
    const vm = page({ kind: 'ok' });
    vm.project = JSON.parse(vm.savedSnapshot);
    await vm.onSave();
    expect(saveProject).not.toHaveBeenCalled();
    expect(location.href).toBe('/portfolio.html?projectId=p1');
  });
});
