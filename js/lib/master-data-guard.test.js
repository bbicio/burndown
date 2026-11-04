import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { iconSvg } from './icons.js';

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
  { file: 'master-clients.html',       active: 'clients',    section: 'Clients & groups',
    api: ['clientGroups', 'clients', 'currencies', 'ratecards', 'roles'],
    // the rate card builds its non-EUR columns from window.__currencies and its
    // "agency default" placeholders from the roles it reads afresh on each open
    must: ['window.__cfgApp', 'window.__currencies = await Api.currencies.active()',
      'Api.clientGroups.list()', 'Api.ratecards.list()', 'readUrlState('] },
  { file: 'master-pipelines.html',     active: 'pipelines',  section: 'Pipelines & POTs',
    api: ['clientGroups', 'clients', 'currencies', 'pipelineYears', 'pots', 'reporting'],
    must: ['window.__cfgApp', 'parseMdpUrl(', 'popstate', 'this.yearTotals    = yearTotals;'] },
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
      + '<div class="md-content">\\s*<div id="app" v-cloak>\\s*<section class="md-card"(?: v-show="[^"]*")?>'));
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
    const subnav = html.indexOf('<script type="module" src="js/lib/md-subnav.js?v=4"></script>');
    expect(icons).toBeGreaterThan(-1);
    expect(subnav).toBeGreaterThan(icons);
  });

  it('loads the same icons.js version that md-subnav.js imports (one module instance)', () => {
    const tag = html.match(/<script type="module" src="js\/lib\/icons\.js(\?v=\d+)"><\/script>/);
    const imp = read('js/lib/md-subnav.js').match(/from '\.\/icons\.js(\?v=\d+)'/);
    expect(tag && imp && imp[1]).toBe(tag && tag[1]);
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

describe('master-client-groups.html is only a redirect to the By group view', () => {
  const html = read('master-client-groups.html');
  it('redirects (meta refresh + script) to /master-clients.html?view=group', () => {
    expect(html).toContain('http-equiv="refresh" content="0; url=/master-clients.html?view=group"');
    expect(html).toContain("location.replace('/master-clients.html?view=group')");
    expect(html).toContain('Go to Clients &amp; groups');
  });
  it('runs no Vue and has no shell', () => {
    expect(html).not.toMatch(/vue/i);
    expect(html).not.toContain('app-shell');
    expect(html).not.toContain('Vue.createApp');
  });
});

describe('master-clients.html (Clients & groups)', () => {
  const html = read('master-clients.html');
  it('has no native dialog, emoji or form card', () => {
    expect(html).not.toContain('confirm(');
    expect(html).not.toContain('alert(');
    for (const e of ['💲', '✏️', '🗑', '🏢']) expect(html, e).not.toContain(e);
    expect(html).not.toContain('form-card');
    expect(html).not.toContain('clientRcModal');
  });
  it('carries the confirm modal that showConfirm writes into, outside the Vue root', () => {
    expect(html).toContain('showConfirm(');
    for (const id of ['confirmModal', 'confirmModalTitle', 'confirmModalMessage', 'confirmModalOk', 'confirmModalCancel']) {
      expect(html, id).toContain(`id="${id}"`);
    }
    expect(html.indexOf('id="confirmModal"')).toBeGreaterThan(html.indexOf('</div><!-- #app -->'));
  });
  it('keeps a client that was created but not grouped, instead of blocking a retry', () => {
    const body = html.slice(html.indexOf('async createClient()'), html.indexOf('startClientEdit(c) {'));
    const assignFail = body.slice(body.indexOf('catch (e) {'), body.indexOf('await this.reloadGroups()'));
    expect(assignFail).toContain('this.cf.show = false');
    expect(assignFail).toContain('this.globalError');
  });
  it('clears the banner when an action starts and never hides the real error behind a reload failure', () => {
    for (const name of ['async moveTo(', 'async createGroup()', 'async saveRename()']) {
      const from = html.indexOf(name);
      expect(from, name).toBeGreaterThan(-1);
      expect(html.slice(from, from + 700), name).toContain('this.globalError = null');
    }
    const reload = html.slice(html.indexOf('async reloadGroups()'), html.indexOf('setView(v)'));
    expect(reload).toContain('if (!this.globalError)');
  });
  it('does not re-enter the open rate card on a popstate that still names its client', () => {
    const body = html.slice(html.indexOf('async onPopState()'), html.indexOf('// true when there is nothing unsaved'));
    expect(body).toMatch(/st\.clientId === this\.rateClientId\) return/);
  });
  it('filters the rate card rows by their saved state', () => {
    expect(html).toContain('saved: true');
  });
  it('titles the third breadcrumb level Clients & groups and drops the old link', () => {
    expect(html).toContain("{ label: 'Clients & groups' }");
    expect(html).not.toContain('master-client-groups.html');
  });
  it('disables the group menu of a client while its move is running', () => {
    expect(html).toMatch(/:disabled="[^"]*_moving/);
  });
  it('loads the pure module', () => {
    expect(html).toContain('<script type="module" src="js/lib/master-clients.js?v=1"></script>');
  });
  describe('responsive layout', () => {
    const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
    const media = q => {
      const from = styles.indexOf(`@media (${q})`);
      expect(from, q).toBeGreaterThan(-1);
      let depth = 0, i = styles.indexOf('{', from);
      const start = i;
      for (; i < styles.length; i++) {
        if (styles[i] === '{') depth++;
        if (styles[i] === '}' && --depth === 0) break;
      }
      return styles.slice(start, i);
    };
    it('makes the controls 40px on tablet', () => {
      expect(media('max-width: 1023.98px')).toMatch(/height:\s*40px/);
    });
    it('makes every touch target at least 44px on phone', () => {
      const phone = media('max-width: 767.98px');
      expect(phone).toMatch(/min-height:\s*44px/);
      for (const sel of ['.cg-mcard-menu', '.cg-mcard-rc', '.rc-input-wrap']) expect(phone, sel).toContain(sel);
    });
    it('hides the rate card pill column below 900px', () => {
      expect(media('max-width: 899.98px')).toMatch(/\.cg-col-pill\s*\{[^}]*display:\s*none/);
    });
    it('keeps the Role and Client columns of the rate card sticky on tablet', () => {
      const tablet = media('max-width: 1023.98px');
      expect(tablet).toMatch(/\.rc-col-role\s*\{[^}]*position:\s*sticky/);
      expect(tablet).toMatch(/\.rc-col-client\s*\{[^}]*position:\s*sticky/);
    });
    it('shows one currency at a time on phone through rcPhoneCurrency', () => {
      expect(html).toContain('rcPhoneCurrency');
      expect(html).toContain('Empty = agency € rate.');
    });
  });
  it('has no hex colour in its inline styles', () => {
    const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe('DELETE /api/client-groups/:id refuses a group with a POT under a row lock', () => {
  const src = read('api/src/routes/client-groups.js');
  const del = src.slice(src.indexOf('async function deleteGroup'), src.indexOf("router.put('/:id/clients/:clientId'"));
  it('locks the group row in a transaction before it looks at the POTs', () => {
    expect(del).toContain("'BEGIN'");
    expect(del).toMatch(/FROM client_groups WHERE id = \$1 FOR UPDATE/);
    expect(del.indexOf('FOR UPDATE')).toBeLessThan(del.indexOf('FROM pots'));
    expect(del).toContain("'COMMIT'");
    expect(del).toContain("'ROLLBACK'");
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

describe('Master Data shared controls (css/style.css, js/lib/icons.js)', () => {
  const css = read('css/style.css');
  it('defines the segmented control and the switch', () => {
    for (const sel of ['.md-seg', '.md-seg-btn', '.md-seg-btn.active', '.md-switch']) {
      expect(css, sel).toContain(sel + ' {');
    }
  });
  it('sizes the controls 32px on desktop, 40px on tablet and 44px on phone', () => {
    expect(css).toMatch(/\.md-seg-btn\s*\{[^}]*height:\s*32px/);
    expect(css).toMatch(/@media \(max-width: 1023\.98px\)\s*\{[^@]*\.md-seg-btn\s*\{[^}]*height:\s*40px/);
    expect(css).toMatch(/@media \(max-width: 767\.98px\)\s*\{[^@]*\.md-seg-btn\s*\{[^}]*height:\s*44px/);
  });
  it('uses no hex colour in the new rules', () => {
    const from = css.indexOf('/* ── Master Data controls');
    expect(from).toBeGreaterThan(-1);
    const block = css.slice(from, css.indexOf('/* ──', from + 10));
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
  it('has the building, pencil, more and reset icons', () => {
    for (const n of ['building', 'pencil', 'more', 'reset']) {
      expect(iconSvg(n), n).not.toBe('');
    }
  });
});

describe('wide mode (Pipelines & POTs phasing)', () => {
  const css = read('css/style.css');
  it('hides the sub-nav and widens the content', () => {
    expect(css).toContain('.md-layout--wide .md-subnav { display: none');
    expect(css).toMatch(/.md-layout--wide .md-content/);
  });
});

describe('Pipelines & POTs responsive styles', () => {
  const html = read('master-pipelines.html');
  const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  const tabletAt = style.lastIndexOf('@media (max-width: 1023.98px)');
  const phoneAt = style.lastIndexOf('@media (max-width: 767.98px)');
  const tablet = style.slice(tabletAt, phoneAt);
  const phone = style.slice(phoneAt);

  it('carries the confirm modal that showConfirm writes into, outside the Vue root', () => {
    expect(html).toContain('showConfirm(');
    for (const id of ['confirmModal', 'confirmModalTitle', 'confirmModalMessage', 'confirmModalOk', 'confirmModalCancel']) {
      expect(html, id).toContain(`id="${id}"`);
    }
    expect(html.indexOf('id="confirmModal"')).toBeGreaterThan(html.indexOf('</div><!-- #app -->'));
  });

  it('Delete pipeline is blocked by proposals and by POTs, in both menus', () => {
    expect(html).toContain('deleteBlock(py) {');
    expect(html).toContain("if (this.deleteBlock(py)) return;");
    expect(html.split(':disabled="!!deleteBlock(py) || py._loading"').length - 1).toBe(2);
    expect(html).not.toContain('py.offers > 0 || py._loading');
  });

  it('has no hex colour in its inline styles and retries a failed POT details load', () => {
    const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).toContain('this.potDetails[pot.id] && !this.potDetails[pot.id].error');
    expect(html).toContain("history[replace || same ? 'replaceState' : 'pushState']");
  });

  it('round 3 fixes: fresh drawer data, retry of a failed year load, stale failure ignored, popstate clears the banner', () => {
    expect(html).toContain('this.pipelineSummary = []; this.potDetails = {};');
    expect(html).toContain('if (this.loadedPotsYear === year) this.loadedPotsYear = null;');
    expect(html).toMatch(/this\.loadedPotsYear = null;\r?\n        this\.pipelineSummary = \[\];/);
    expect(html).toContain('{ this.globalError = null; this.applyState(window.parseMdpUrl(location.search)); }');
  });

  it('review fixes: blur without symbol, declared potHistory, retry of a failed phasing, Esc left to modals', () => {
    expect(html).toContain("formatMoney(v, 'EUR', window.__currencies, { symbol: false })");
    expect(html).toMatch(/potHistory:\s+\{\}/);
    expect(html).toContain('this.phasing[mode] && !this.phasing[mode].error');
    expect(html).toContain("document.querySelector('.modal.show')");
    expect(html).toContain('} else if (!this.loadOk) {');
  });

  it('has a tablet block followed by a phone block', () => {
    expect(tabletAt).toBeGreaterThan(-1);
    expect(phoneAt).toBeGreaterThan(tabletAt);
  });

  it('tablet: controls are 40px and the POTs column is hidden', () => {
    expect(tablet).toContain('min-height: 40px');
    expect(tablet).toMatch(/\.mdp-col-pots[^}]*display: none/);
    expect(tablet).toMatch(/\.mdp-col-ca[^}]*display: none/);
  });

  it('phone: touch targets are 44px on Add year, the more menu, the card foot and proposal rows', () => {
    for (const sel of ['.mdp-head .btn', '.mdp-icon-btn', '.mdp-pcard-foot', '.mdp-prop']) {
      const i = phone.indexOf(sel);
      expect(i, sel).toBeGreaterThan(-1);
      expect(phone.slice(i, i + 200), sel).toContain('min-height: 44px');
    }
  });

  it('phasing keeps its name column sticky', () => {
    expect(style).toMatch(/\.mdp-ph-table \.mdp-ph-name \{[^}]*position: sticky/);
  });
});
