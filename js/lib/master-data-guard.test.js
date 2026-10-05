import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = f => readFileSync(join(process.cwd(), f), 'utf8');

describe('Master Data sub-menu styles (css/style.css)', () => {
  const css = read('css/style.css');
  it('defines the layout, the menu and the content wrapper', () => {
    expect(css).toMatch(/\.md-layout\s*\{/);
    expect(css).toMatch(/\.md-subnav\s*\{/);
    expect(css).toMatch(/\.md-subnav a\.active\s*\{/);
    expect(css).toMatch(/\.md-content\s*\{/);
  });
  it('is a column beside the sidebar from 1024px up and a row below', () => {
    const wide = css.slice(css.indexOf('/* ── Master Data sub-navigation'));
    expect(wide).toMatch(/@media \(min-width: 1024px\)\s*\{[\s\S]*\.md-subnav[\s\S]*flex-direction:\s*column/);
  });
});

const PAGES = [
  { file: 'master-clients.html',       href: '/master-clients.html',
    api: ['clients', 'ratecards', 'roles'],
    must: ['id="clientRcModal"', 'window.__cfgApp'] },
  { file: 'master-client-groups.html', href: '/master-client-groups.html',
    api: ['clientGroups', 'clients'],
    must: ['this.clients  = clients;', 'this.groups   = groups.map('] },
  { file: 'master-pipelines.html',     href: '/master-pipelines.html',
    api: ['clientGroups', 'clients', 'currencies', 'pipelineYears', 'pots', 'reporting'],
    must: ['id="potDetailsModal"', 'this.yearTotals    = yearTotals;'] },
  { file: 'master-roles.html',         href: '/master-roles.html',
    api: ['currencies', 'roles'],
    must: ['this.currencies    = currencies;', 'groupedRoles'] },
  { file: 'master-currencies.html',    href: '/master-currencies.html',
    api: ['currencies'],
    must: ['id="crHistoryModal"', 'id="crRateConfirmModal"', 'this.crEdit'] },
];
const LINKS = PAGES.map(p => p.href);

describe.each(PAGES)('Master Data page: $file', ({ file, href, api, must }) => {
  const html = read(file);

  it('has the same five sub-menu links in order, only its own marked active', () => {
    const nav = html.match(/<nav class="md-subnav"[\s\S]*?<\/nav>/)[0];
    expect([...nav.matchAll(/href="([^"]+)"/g)].map(m => m[1])).toEqual(LINKS);
    expect([...nav.matchAll(/<a href="([^"]+)"[^>]*aria-current="page"/g)].map(m => m[1])).toEqual([href]);
  });

  it('wraps the Vue root in .md-layout > .md-content inside #app-main', () => {
    expect(html).toMatch(/<div id="app-main">\s*<div class="md-layout">\s*<nav class="md-subnav"/);
    expect(html).toMatch(/<div class="md-content">\s*<div id="app" v-cloak>/);
  });

  it('is a Master Data page for the nav (id config, title, breadcrumb)', () => {
    expect(html).toContain('<title>PDash — Master Data</title>');
    expect(html).toContain("initNav('config'");
    expect(html).toContain("{ label: 'Master Data' }");
  });

  it('keeps the admin-or-sysadmin check and the access-denied block', () => {
    expect(html).toContain("['admin', 'sysadmin'].includes(user.role)");
    expect(html).toContain('Admin access required.');
  });

  it('has no Programs UI/API and no leftover tab switching', () => {
    expect(html).not.toMatch(/program/i);
    expect(html).not.toContain('activeTab');
  });

  it('calls only the API namespaces of its own panel', () => {
    const used = new Set([...html.matchAll(/Api\.([A-Za-z]+)\./g)].map(m => m[1]));
    for (const ns of used) expect(api, `unexpected Api.${ns}`).toContain(ns);
  });

  it('keeps the pieces its panel depends on', () => {
    for (const s of must) expect(html, s).toContain(s);
  });
});

describe('config.html is only a redirect to the Clients page', () => {
  const html = read('config.html');
  it('redirects (meta refresh + script) to /master-clients.html', () => {
    expect(html).toContain('http-equiv="refresh" content="0; url=/master-clients.html"');
    expect(html).toContain("location.replace('/master-clients.html')");
  });
  it('runs no Vue and has no shell', () => {
    expect(html).not.toMatch(/vue/i);
    expect(html).not.toContain('app-shell');
  });
});

describe('Admin menu entry', () => {
  it('Master Data leads to the Clients page', () => {
    const nav = new Function(read('js/nav.js') + '\nreturn { NAV_GROUPS };')();
    const item = nav.NAV_GROUPS.flatMap(g => g.items).find(i => i.id === 'config');
    expect(item.label).toBe('Master Data');
    expect(item.href).toBe('/master-clients.html');
  });
});
