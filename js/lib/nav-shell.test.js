import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = f => readFileSync(join(process.cwd(), f), 'utf8');
const { initNav } = new Function(read('js/nav.js') + '\nreturn { initNav };')();

const SHELL = '<div id="app-shell"><div id="nav-container"></div><div id="app-main"><div id="app">content</div></div></div>';

beforeEach(() => {
  document.body.className = '';
  document.body.innerHTML = SHELL;
  globalThis.esc = s => String(s);
  globalThis.Api = { auth: { me: async () => ({
    role: 'user', email: 'u@x.it', firstName: 'U', lastName: 'X', terms_version: 1, current_terms_version: 1 }) } };
});

describe('breadcrumb bar placement (js/nav.js)', () => {
  it('is created as the first child of #app-main, before the page content', async () => {
    await initNav('pipeline', { breadcrumbs: [{ label: 'A', href: '/a' }, { label: 'B' }] });
    const main = document.getElementById('app-main');
    expect(main.firstElementChild.id).toBe('breadcrumb-bar');
    expect(main.children[1].id).toBe('app');
    expect(document.getElementById('nav-container').nextElementSibling.id).toBe('app-main');
    expect(document.body.classList.contains('has-breadcrumbs')).toBe(true);
  });

  it('is updated in place by a second call (exactly one bar)', async () => {
    await initNav('pipeline', { breadcrumbs: [{ label: 'A' }] });
    window.updateBreadcrumbs([{ label: 'C' }]);
    const bars = document.querySelectorAll('#breadcrumb-bar');
    expect(bars.length).toBe(1);
    expect(bars[0].textContent).toBe('C');
  });

  it('falls back to the old position (right after #nav-container) on a page without #app-main', async () => {
    document.body.innerHTML = '<div id="nav-container"></div><div id="app"></div>';
    await initNav('pipeline', { breadcrumbs: [{ label: 'A' }] });
    expect(document.getElementById('nav-container').nextElementSibling.id).toBe('breadcrumb-bar');
  });
});

describe('sidebar state key survives cleanLegacyStorage (js/core.js)', () => {
  const core = read('js/core.js');
  const iife = core.slice(0, core.indexOf('// ── STATE'));

  it('lists PDash_sidebarCollapsed in the keep Set', () => {
    expect(iife).toMatch(/new Set\(\[[^\]]*'PDash_sidebarCollapsed'[^\]]*\]\)/);
  });

  it('keeps the key and still removes unknown PDash_* keys', () => {
    localStorage.clear();
    localStorage.setItem('PDash_sidebarCollapsed', '1');
    localStorage.setItem('PDash_stray', 'x');
    new Function(iife)();
    expect(localStorage.getItem('PDash_sidebarCollapsed')).toBe('1');
    expect(localStorage.getItem('PDash_stray')).toBeNull();
  });
});

describe('--sidebar-w rule (css/style.css)', () => {
  const css = read('css/style.css');
  it('defines --sidebar-w as 0px and offsets #app-main by it', () => {
    expect(css).toMatch(/:root\s*\{\s*--sidebar-w:\s*0px;\s*\}/);
    expect(css).toMatch(/#app-main\s*\{\s*margin-left:\s*var\(--sidebar-w\);\s*\}/);
  });
});
