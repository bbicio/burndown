// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
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

function load() {
  const Api = {
    users: { activeList: async () => USERS },
    projects: { shares: { list: async () => shares } },
    costGrids: { shares: { list: async () => shares } },
  };
  const bootstrap = { Modal: { getOrCreateInstance: () => ({ show() {}, hide() {} }) } };
  const esc = s => String(s ?? '');
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
