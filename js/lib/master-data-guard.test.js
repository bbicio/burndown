import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = f => readFileSync(join(process.cwd(), f), 'utf8');

describe('Master Data sub-menu styles (css/style.css)', () => {
  const css = read('css/style.css');
  const start = css.indexOf('/* ── Master Data sub-navigation');
  const block = css.slice(start, css.indexOf('/* ── Notification panel', start));
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // the body of the rule for `selector` inside the given media query (up to the next @media)
  const inMedia = (media, selector) => {
    const from = block.indexOf(media);
    expect(from, media).toBeGreaterThan(-1);
    const next = block.indexOf('@media', from + media.length);
    const body = block.slice(from, next === -1 ? undefined : next);
    const hit = body.match(new RegExp('(?:^|[\\s,}])' + reEsc(selector) + '\\s*\\{([^}]*)\\}'));
    expect(hit, media + ' ' + selector).not.toBeNull();
    return hit[1];
  };
  const DESKTOP = '@media (min-width: 1024px)';
  const TABLET = '@media (min-width: 768px) and (max-width: 1023.98px)';
  const PHONE = '@media (max-width: 767.98px)';

  it('defines the layout, the menu, the content wrapper and the card', () => {
    for (const sel of ['.md-layout', '.md-subnav', '.md-subnav-item.active', '.md-content', '.md-card', '.md-card-title']) {
      expect(block, sel).toMatch(new RegExp(reEsc(sel) + '\\s*[{,]'));
    }
  });
  it('is a really sticky 196px card column from 1024px up, not stretched to the full height', () => {
    const subnav = inMedia(DESKTOP, '.md-subnav');
    expect(subnav).toMatch(/position:\s*sticky/);
    expect(subnav).toMatch(/align-self:\s*flex-start/);
    expect(subnav).not.toMatch(/align-self:\s*stretch/);
    expect(subnav).toMatch(/flex:\s*0 0 196px/);
    expect(inMedia(DESKTOP, '.md-subnav-select')).toMatch(/display:\s*none/);
    expect(inMedia(DESKTOP, '.md-subnav-item.active')).toContain('inset 3px 0 0 var(--brand-magenta)');
  });
  it('is a scrolling row of tabs without group labels on tablet', () => {
    const subnav = inMedia(TABLET, '.md-subnav');
    expect(subnav).toMatch(/overflow-x:\s*auto/);
    expect(subnav).toMatch(/scrollbar-width:\s*none/);
    expect(inMedia(TABLET, '.md-subnav-group')).toMatch(/display:\s*none/);
    expect(inMedia(TABLET, '.md-subnav-item.active')).toContain('inset 0 -3px 0 var(--brand-magenta)');
  });
  it('is a 48px section selector over a transparent native select on phone', () => {
    expect(inMedia(PHONE, '.md-subnav-list')).toMatch(/display:\s*none/);
    expect(inMedia(PHONE, '.md-subnav-select')).toMatch(/min-height:\s*48px/);
    expect(inMedia(PHONE, '.md-subnav-select-input')).toMatch(/opacity:\s*0/);
  });
  // the body of the first rule for `selector` anywhere in the block
  const rule = selector => {
    const hit = block.match(new RegExp('(?:^|[\\s,}])' + reEsc(selector) + '\\s*\\{([^}]*)\\}'));
    expect(hit, selector).not.toBeNull();
    return hit[1];
  };
  it('cancels the page wrapper padding inside the card (no double inset)', () => {
    expect(rule('.md-card-body > .app-container')).toMatch(/--app-pad:\s*0;/);
  });
  it('lays a table card flat and flush inside the content card, without a bottom margin', () => {
    const flat = rule('.md-card-body .md-table-card');
    expect(flat).toMatch(/border:\s*0;/);
    expect(flat).toMatch(/border-radius:\s*0;/);
    expect(flat).toMatch(/box-shadow:\s*none;/);
    expect(flat).toMatch(/margin:\s*0 calc\(-1 \* var\(--card-pad\)\);/);
  });
  it('drops the page-head divider above the tabs on tablet', () => {
    expect(inMedia(TABLET, '.ph:has(+ .md-layout)')).toMatch(/border-bottom:\s*0;/);
  });
  it('draws the card with the card tokens and no hex literal', () => {
    const card = block.match(/\.md-card\s*\{([^}]*)\}/)[1];
    expect(card).toContain('var(--card-bg)');
    expect(card).toContain('var(--card-border)');
    expect(card).toContain('var(--card-radius)');
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

const PAGES = [
  { file: 'master-clients.html',       active: 'clients',    section: 'Clients',
    api: ['clients', 'currencies', 'ratecards', 'roles'],
    // the rate card builds its non-EUR columns from window.__currencies and its
    // "agency default" placeholders from the roles it reads afresh on each open
    must: ['id="clientRcModal"', 'window.__cfgApp',
      'window.__currencies = await Api.currencies.active()', 'this.clients = await Api.clients.list()'] },
  { file: 'master-client-groups.html', active: 'clients',    section: 'Client Groups',
    api: ['clientGroups', 'clients'],
    must: ['this.clients  = clients;', 'this.groups   = groups.map('] },
  { file: 'master-pipelines.html',     active: 'pipelines',  section: 'Pipelines & POTs',
    api: ['clientGroups', 'clients', 'currencies', 'pipelineYears', 'pots', 'reporting'],
    must: ['id="potDetailsModal"', 'this.yearTotals    = yearTotals;'] },
  { file: 'master-roles.html',         active: 'roles',      section: 'Roles & rates',
    api: ['currencies', 'roles'],
    must: ['this.currencies    = currencies;', 'groupedRoles'] },
  { file: 'master-currencies.html',    active: 'currencies', section: 'Currencies',
    api: ['currencies'],
    must: ['id="crHistoryModal"', 'id="crRateConfirmModal"', 'this.crEdit'] },
];

describe.each(PAGES)('Master Data page: $file', ({ file, active, section, api, must }) => {
  const html = read(file);

  it('has the shared page head, then the generated sub-nav and the card as the Vue root\'s first child', () => {
    expect(html).toMatch(new RegExp(
      '<div id="app-main">\\s*<div class="ph">[\\s\\S]*?<h1 class="ph-title">Master Data</h1>[\\s\\S]*?'
      + '<div class="ph-sub">Clients, pipelines, roles, rates and currencies used across the app\\.</div>\\s*</div>\\s*</div>\\s*'
      + '<div class="md-layout">\\s*<nav class="md-subnav" data-md-active="' + active + '" aria-label="Master Data"></nav>\\s*'
      + '<div class="md-content">\\s*<div id="app" v-cloak>\\s*<section class="md-card">'));
    expect(html).not.toContain('ph-side');
  });

  it('writes no sub-nav link by hand', () => {
    const nav = html.match(/<nav class="md-subnav"[\s\S]*?<\/nav>/)[0];
    expect(nav).not.toContain('<a href=');
  });

  it('titles the card with the section name', () => {
    expect(html).toContain(`<h2 class="md-card-title">${section.replace(/&/g, '&amp;')}</h2>`);
  });

  it('loads the sub-nav module after the icon library', () => {
    const icons = html.indexOf('<script type="module" src="js/lib/icons.js');
    const subnav = html.indexOf('<script type="module" src="js/lib/md-subnav.js?v=2"></script>');
    expect(icons).toBeGreaterThan(-1);
    expect(subnav).toBeGreaterThan(icons);
  });

  it('is a Master Data page for the nav (id config, title, three-level breadcrumb)', () => {
    expect(html).toContain('<title>PDash — Master Data</title>');
    expect(html).toContain("initNav('config'");
    expect(html).toContain("{ label: 'Master Data', href: '/master-clients.html' }");
    expect(html).toContain(`{ label: '${section}' }`);
  });

  it('shows the access-denied block with the SVG lock icon, no emoji', () => {
    expect(html).toContain('<ph-icon name="lock"');
    expect(html).toContain(".component('ph-icon', window.PhIcon)");
    expect(html).not.toContain('🔒');
  });

  it('has no old page header', () => {
    expect(html).not.toContain('page-header');
    expect(html).not.toContain('font-size: 2.5rem');
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
