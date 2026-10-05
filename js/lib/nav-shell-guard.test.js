import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const SNIPPET =
  "<script>try{if(localStorage.getItem('PDash_sidebarCollapsed')==='1')document.documentElement.setAttribute('data-sidebar','collapsed')}catch(e){}</script>";

const code = SNIPPET.replace(/^<script>/, '').replace(/<\/script>$/, '');
const run = () => new Function(code)();

afterEach(() => {
  document.documentElement.removeAttribute('data-sidebar');
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('sidebar-state head snippet', () => {
  it("sets data-sidebar=collapsed when the key is '1'", () => {
    localStorage.setItem('PDash_sidebarCollapsed', '1');
    run();
    expect(document.documentElement.getAttribute('data-sidebar')).toBe('collapsed');
  });

  it('sets nothing when the key is absent', () => {
    run();
    expect(document.documentElement.hasAttribute('data-sidebar')).toBe(false);
  });

  it.each(['0', 'true', '', ' 1', 'collapsed'])('sets nothing for the value %j', v => {
    localStorage.setItem('PDash_sidebarCollapsed', v);
    run();
    expect(document.documentElement.hasAttribute('data-sidebar')).toBe(false);
  });

  it('does not throw and sets nothing when localStorage access throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(run).not.toThrow();
    expect(document.documentElement.hasAttribute('data-sidebar')).toBe(false);
  });
});

const PAGES = ['pipeline','portfolio','planning','costgrid','project-config','team',
  'master-clients','master-client-groups','master-pipelines','master-roles','master-currencies',
  'timesheets','admin','attribute-lists','profile-jobs','settings','_db-reset','_terms-editor'];
const readPage = n => readFileSync(join(process.cwd(), n + '.html'), 'utf8');
const OPEN = '<div id="app-shell">';
const CLOSE = '<!-- /#app-shell -->';

describe.each(PAGES)('page shell: %s.html', name => {
  const html = readPage(name);

  it('has the sidebar-state snippet once, inside <head>', () => {
    expect(html.split(SNIPPET).length - 1).toBe(1);
    expect(html.indexOf(SNIPPET)).toBeLessThan(html.indexOf('</head>'));
    expect(html.indexOf(SNIPPET)).toBeGreaterThan(html.indexOf('<head>'));
  });

  it('has #app-shell > #nav-container + #app-main in that order', () => {
    expect(html).toMatch(/<div id="app-shell">\s*<div id="nav-container"><\/div>\s*<div id="app-main">/);
  });

  it('closes the shell before the first script and keeps its divs balanced', () => {
    const start = html.indexOf(OPEN);
    const end = html.indexOf(CLOSE);
    expect(end).toBeGreaterThan(start);
    expect(html.slice(start, end)).not.toMatch(/<script/i);
    expect(html.slice(end)).toMatch(/<script/i);
    const inner = html.slice(start, end);
    expect((inner.match(/<div[\s>]/g) || []).length).toBe((inner.match(/<\/div>/g) || []).length);
  });
});

describe('shell containers carry no layout-breaking CSS (css/style.css)', () => {
  const css = readFileSync(join(process.cwd(), 'css/style.css'), 'utf8');
  const blocks = [...css.matchAll(/(^|\})\s*([^{}]*#app-(?:shell|main)[^{}]*)\{([^}]*)\}/g)].map(m => m[3]);
  it('has a rule for #app-main', () => expect(blocks.length).toBeGreaterThan(0));
  it('uses none of overflow/transform/filter/contain/will-change/position on them', () => {
    for (const b of blocks) expect(b).not.toMatch(/\b(overflow|transform|filter|contain|will-change|position)\s*:/);
  });
});

describe('?v= references of the files edited in B1 and B2', () => {
  const all = readdirSync(process.cwd()).filter(f => /^[^/]+\.html$/.test(f));
  for (const file of ['css/style.css', 'js/core.js', 'js/nav.js', 'js/notifications.js']) {
    it(`${file} is referenced with one version on every page`, () => {
      const re = new RegExp(file.replace(/[./]/g, '\\$&') + '\\?v=(\\d+)', 'g');
      const versions = new Set();
      for (const p of all) for (const m of readFileSync(join(process.cwd(), p), 'utf8').matchAll(re)) versions.add(m[1]);
      expect([...versions]).toHaveLength(1);
    });
  }
  it('uses the bumped versions', () => {
    const p = readFileSync(join(process.cwd(), 'pipeline.html'), 'utf8');
    expect(p).toContain('css/style.css?v=21');
    expect(p).toContain('js/core.js?v=11');
    expect(p).toContain('js/nav.js?v=16');
    expect(p).toContain('js/notifications.js?v=3');
    expect(p).toContain('css/tokens.css?v=9');
  });
});
