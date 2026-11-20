// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

// js/shares.js is a classic script: it runs here whole, against stubs for its globals.
// The program share modal has no share list of its own, but its user search must still offer
// every eligible user — not an empty list, nor the list left by the last proposal or project.
const js = readFileSync('js/shares.js', 'utf8');

const USERS = [
  { id: 'u1', email: 'pdt1@example.com', first_name: 'Pat', last_name: 'One', role: 'user' },
  { id: 'u2', email: 'boss@example.com', first_name: 'Ada', last_name: 'Admin', role: 'admin' },
];

let shares;
let apiSave;
let alertSpy;

function load() {
  const Api = {
    users: { activeList: async () => USERS },
    projects: { shares: { list: async () => shares } },
    costGrids: { shares: { list: async () => shares } },
  };
  const bootstrap = { Modal: { getOrCreateInstance: () => ({ show() {}, hide() {} }) } };
  const esc = s => String(s ?? '');
  window.apiSave = apiSave;
  window.alert = alertSpy;
  return new Function('Api', 'bootstrap', 'esc', `${js}; return { openShareModal };`)(Api, bootstrap, esc);
}

function search(q) {
  const input = document.getElementById('shareSearchInput');
  input.value = q;
  input.dispatchEvent(new Event('input'));
  return [...document.querySelectorAll('#shareDropdown .share-drop-item')].map(el => el.dataset.uid);
}

describe('share modal — program user search', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.__navUser = { id: 'self' };
    shares = [];
    apiSave = vi.fn();
    alertSpy = vi.fn();
  });

  it('offers the eligible users on a first open for a program', async () => {
    const { openShareModal } = load();
    await openShareModal('program', 'prg1', 'Program');
    expect(search('p')).toEqual(['u1']);
  });

  it('does not keep the list of a project opened before', async () => {
    const { openShareModal } = load();
    shares = [{ user_id: 'u1', email: 'pdt1@example.com', first_name: 'Pat', last_name: 'One', permission: 'viewer' }];
    await openShareModal('project', 'p1', 'Project');
    expect(search('p')).toEqual([]);
    await openShareModal('program', 'prg1', 'Program');
    expect(search('p')).toEqual(['u1']);
  });
});

describe('share modal — single shares through apiSave', () => {
  const ROW = { user_id: 'u1', email: 'pdt1@example.com', first_name: 'Pat', last_name: 'One', permission: 'editor' };

  beforeEach(() => {
    document.body.innerHTML = '';
    window.__navUser = { id: 'self' };
    shares = [ROW];
    apiSave = vi.fn();
    alertSpy = vi.fn();
  });

  const sel = () => document.querySelector('.share-perm-select');
  const tick = () => new Promise(r => setTimeout(r, 0));
  const change = async value => { sel().value = value; sel().dispatchEvent(new Event('change')); await tick(); };
  const listMsg = () => document.getElementById('shareListMsg');

  it('changes a permission with the dedicated PATCH', async () => {
    apiSave.mockResolvedValue({ kind: 'ok', data: { user_id: 'u1', permission: 'viewer' } });
    const { openShareModal } = load();
    await openShareModal('cost_grid', 'cg1', 'Grid');
    await change('viewer');
    expect(apiSave).toHaveBeenCalledWith('PATCH', '/cost-grids/cg1/shares/u1', { permission: 'viewer' });
    expect(sel().value).toBe('viewer');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('on a 404 reloads the list and says the person lost access', async () => {
    apiSave.mockResolvedValue({ kind: 'error', status: 404, message: 'Share not found', data: null });
    const { openShareModal } = load();
    await openShareModal('project', 'p1', 'Project');
    shares = [];
    await change('viewer');
    expect(apiSave).toHaveBeenCalledWith('PATCH', '/projects/p1/shares/u1', { permission: 'viewer' });
    expect(document.querySelector('.share-perm-select')).toBeNull();
    expect(listMsg().textContent).toBe('This person no longer has access.');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('on a 400 puts the select back and shows the message', async () => {
    apiSave.mockResolvedValue({ kind: 'error', status: 400, message: "Cannot change the owner's permission", data: null });
    const { openShareModal } = load();
    await openShareModal('cost_grid', 'cg1', 'Grid');
    await change('viewer');
    expect(sel().value).toBe('editor');
    expect(listMsg().textContent).toBe("Cannot change the owner's permission");
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('a failed removal shows its message in the list', async () => {
    apiSave.mockResolvedValue({ kind: 'error', status: 403, message: 'Forbidden', data: null });
    const { openShareModal } = load();
    await openShareModal('cost_grid', 'cg1', 'Grid');
    document.querySelector('.share-remove-btn').click();
    await tick();
    expect(apiSave).toHaveBeenCalledWith('DELETE', '/cost-grids/cg1/shares/u1');
    expect(listMsg().textContent).toBe('Forbidden');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('adding someone already shared (409) shows the message and reloads the list', async () => {
    shares = [];
    apiSave.mockResolvedValue({ kind: 'error', status: 409, message: 'This user already has access.', data: { code: 'ALREADY_SHARED' } });
    const { openShareModal } = load();
    await openShareModal('cost_grid', 'cg1', 'Grid');
    shares = [ROW];
    search('p');
    document.querySelector('.share-drop-item').dispatchEvent(new MouseEvent('mousedown', { cancelable: true }));
    document.getElementById('shareAddBtn').click();
    await tick();
    expect(apiSave).toHaveBeenCalledWith('POST', '/cost-grids/cg1/shares', { userId: 'u1', permission: 'editor' });
    expect(document.getElementById('shareAddMsg').textContent).toBe('This user already has access.');
    expect(document.querySelectorAll('.share-perm-select').length).toBe(1);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('has no alert( in its source', () => {
    expect(js).not.toMatch(/\balert\(/);
  });
});
