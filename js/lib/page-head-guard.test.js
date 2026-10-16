import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const read = f => readFileSync(join(process.cwd(), f), 'utf8');

// Master Data pages: out of this cycle (Spec section 10), permanent here.
const EXCLUDED = new Set([
  'master-clients.html', 'master-client-groups.html', 'master-pipelines.html',
  'master-roles.html', 'master-currencies.html',
]);
// Pages not yet moved to the shared page head; Tasks 4-9 remove entries, Task 10 empties it.
const PENDING = new Set([
  'costgrid.html', 'planning.html',
  'project-config.html', 'admin.html', 'team.html', 'attribute-lists.html',
  'profile-jobs.html', 'settings.html', 'timesheets.html', '_db-reset.html', '_terms-editor.html',
]);

const pages = readdirSync(process.cwd())
  .filter(f => f.endsWith('.html') && /initNav\(/.test(read(f)))
  .sort();
const checked = pages.filter(p => !EXCLUDED.has(p) && !PENDING.has(p));

// Forbidden selector -> pages that own it (Spec section 8).
const FORBIDDEN = {
  '.pb-header': ['pipeline.html'], '.pb-title': ['pipeline.html'],
  '.pf-header': ['portfolio.html'], '.pf-header-title': ['portfolio.html'],
  '.pr-head': ['portfolio.html'], '.pr-back': ['portfolio.html'],
  '.pg-topline': ['program.html'], '.pg-header-row': ['program.html'],
  '.pg-title': ['program.html'], '.pg-label': ['program.html'],
  '.cg-header': ['costgrid.html'], '.cg-header-name': ['costgrid.html'],
  '.cg-back-link': ['costgrid.html'],
  '.page-header': ['admin.html', 'team.html', 'attribute-lists.html', 'profile-jobs.html', 'settings.html', 'timesheets.html'],
  '.page-title-bar': ['planning.html', 'project-config.html'],
  '.page-toolbar': ['planning.html', 'project-config.html'],
};
const CSS_FILES = ['css/pipeline.css', 'css/portfolio.css', 'css/costgrid.css', 'css/admin-crud.css', 'css/style.css'];

const hasSelector = (text, sel) =>
  new RegExp(sel.replace('.', '\\.') + '(?![\\w-])').test(text);

// Text of every element whose class list contains `cls`, depth-aware for nested same-name tags.
const elementTexts = (html, cls) => {
  const out = [];
  const open = new RegExp('<(\\w+)[^>]*class="[^"]*\\b' + cls + '\\b[^"]*"[^>]*>', 'g');
  let m;
  while ((m = open.exec(html))) {
    const tag = m[1];
    const tagRe = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'g');
    tagRe.lastIndex = open.lastIndex;
    let depth = 1, t;
    while ((t = tagRe.exec(html))) {
      depth += t[1] ? -1 : 1;
      if (depth === 0) { out.push(html.slice(open.lastIndex, t.index)); break; }
    }
  }
  return out;
};

describe('guard helpers', () => {
  it('hasSelector matches exact class names only', () => {
    expect(hasSelector('.pb-header-right {', '.pb-header')).toBe(false);
    expect(hasSelector('.pb-title2 {', '.pb-title')).toBe(false);
    expect(hasSelector('xph-btn {', '.ph-btn')).toBe(false);
    for (const s of ['.pb-header {', '.pb-header,', '.pb-header.x', '.pb-header:hover']) {
      expect(hasSelector(s, '.pb-header'), s).toBe(true);
    }
  });
  it('elementTexts is depth-aware for nested same-name tags', () => {
    const html = '<span class="ph-title">a<span>x</span><span>\u{1F600}</span></span><b>z</b>';
    const texts = elementTexts(html, 'ph-title');
    expect(texts.length).toBe(1);
    expect(texts[0]).toMatch(/\p{Extended_Pictographic}/u);
  });
});
const BTN_PRIMARY = /(?<![\w-])btn-primary/;
const stripComments = t => t.replace(/\/\*[\s\S]*?\*\//g, '');
const inlineStyles = html =>
  [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n');

describe('page discovery', () => {
  it('finds the 19 pages that call initNav (14 pending/migrated + 5 excluded)', () => {
    expect(pages.length).toBe(19);
    expect(EXCLUDED.size).toBe(5);
    for (const p of EXCLUDED) expect(pages).toContain(p);
    for (const p of PENDING) expect(pages).toContain(p);
    expect(checked.length + PENDING.size + EXCLUDED.size).toBe(19);
  });
});

describe('css/style.css page head component', () => {
  const css = stripComments(read('css/style.css'));
  const classes = ['ph', 'ph-main', 'ph-back', 'ph-eyebrow', 'ph-title-row', 'ph-title', 'ph-badge',
    'ph-sub', 'ph-side', 'ph-actions', 'ph-btn-primary', 'ph-btn', 'ph-toolbar',
    'ph-toolbar-spacer', 'ph-lbl-wide', 'ph-lbl-narrow', 'pd-icon'];
  for (const c of classes) {
    it(`defines .${c}`, () => { expect(hasSelector(css, '.' + c)).toBe(true); });
  }
  const rule = sel => [...css.matchAll(new RegExp('(?:^|[}\\s,])' + sel.replace(/[.]/g, '\\.') + '\\s*\\{([^}]*)\\}', 'g'))].map(m => m[1]).join(' ');
  it('lets the head wrap and the title column shrink and break', () => {
    expect(rule('.ph')).toMatch(/flex-wrap:\s*wrap/);
    expect(rule('.ph-main')).toMatch(/min-width:\s*0/);
    expect(rule('.ph-title')).toMatch(/overflow-wrap:\s*anywhere/);
  });
  it('keeps icons from shrinking', () => {
    expect(rule('.pd-icon')).toMatch(/flex-shrink:\s*0/);
  });
  it('breadcrumb bar has no bottom border and a space-6 horizontal padding', () => {
    const r = rule('.breadcrumb-bar');
    expect(r).not.toMatch(/border-bottom/);
    expect(r).toMatch(/padding:\s*6px var\(--space-6\)/);
  });
  it('pulls the band to full width out of .app-container', () => {
    expect(css).toMatch(/\.app-container > \.ph,\s*\.app-container > \.ph-toolbar\s*\{[^}]*margin-left:\s*calc\(-1 \* var\(--space-6\)\)/);
    expect(css).toMatch(/body\.pp-fullwidth \.app-container > \.ph/);
  });
  it('stacks the side column below 1024px and shortens labels below 768px (as .pb-lbl-*)', () => {
    expect(css).toMatch(/@media \(max-width: 1023\.98px\)\s*\{[^@]*\.ph-side\s*\{[^}]*width:\s*100%/);
    expect(css).toMatch(/@media \(max-width: 767\.98px\)\s*\{[^@]*\.ph-lbl-wide\s*\{\s*display:\s*none/);
    expect(css).toMatch(/@media \(max-width: 767\.98px\)\s*\{[^@]*\.ph-lbl-narrow\s*\{\s*display:\s*inline/);
  });
});

describe('migrated pages (vacuous while everything is pending)', () => {
  it('checks every page that is neither pending nor excluded', () => {
    expect(checked.length).toBe(pages.length - PENDING.size - EXCLUDED.size);
  });
  for (const p of checked) {
    describe(p, () => {
      const html = read(p);
      it('has a .ph head', () => { expect(html).toMatch(/class="ph[ "]/); });
      it('has no emoji in .ph-title', () => {
        const titles = elementTexts(html, 'ph-title');
        for (const t of titles) expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
      });
      it('has no forbidden selector in its inline styles', () => {
        const style = stripComments(inlineStyles(html));
        for (const [sel, owners] of Object.entries(FORBIDDEN)) {
          if (owners.includes(p)) expect(hasSelector(style, sel), `${sel} in ${p}`).toBe(false);
        }
      });
    });
  }
  for (const [sel, owners] of Object.entries(FORBIDDEN)) {
    if (!owners.every(o => !PENDING.has(o))) continue;
    for (const f of CSS_FILES) {
      it(`${f} no longer defines ${sel}`, () => {
        expect(hasSelector(stripComments(read(f)), sel)).toBe(false);
      });
    }
  }
});

describe('portfolio.html (overview + project dashboard)', () => {
  const html = read('portfolio.html');
  // Depth-aware text of every <div class="ph"> (exact class, not ph-*).
  const heads = [];
  const open = /<div class="ph">/g;
  let m;
  while ((m = open.exec(html))) {
    const tagRe = /<(\/?)div\b[^>]*>/g;
    tagRe.lastIndex = open.lastIndex;
    let depth = 1, t;
    while ((t = tagRe.exec(html))) {
      depth += t[1] ? -1 : 1;
      if (depth === 0) { heads.push(html.slice(open.lastIndex, t.index)); break; }
    }
  }
  it('btn-primary matcher is exact', () => {
    expect('<button class="ph-btn-primary">').not.toMatch(BTN_PRIMARY);
    expect('<button class="btn btn-primary">').toMatch(BTN_PRIMARY);
  });
  it('has no private icon set', () => {
    expect(html).not.toMatch(/pf-icon|PF_ICON_PATHS|PfIcon/);
  });
  it('registers the shared icon component', () => {
    expect(html).toContain(".component('ph-icon', window.PhIcon)");
  });
  it('has the overview head and the dashboard head, no btn-primary inside', () => {
    expect(heads.length).toBe(2);
    for (const h of heads) expect(h).not.toMatch(BTN_PRIMARY);
    expect(heads[0]).toMatch(/class="ph-btn-primary"[^>]*>\+ New Project/);
  });
  it('dashboard secondaries are .ph-btn with the permission v-ifs', () => {
    const btns = [...heads[1].matchAll(/<button[^>]*class="ph-btn"[^>]*>/g)].map(x => x[0]);
    expect(btns.length).toBe(4);
    const guard = "v-if=\"dashboardProject?.my_permission !== 'viewer'\"";
    expect(btns[0]).toContain(guard);
    expect(btns[0]).toMatch(/goConfigure/);
    expect(btns[1]).toContain(guard);
    expect(btns[1]).toMatch(/triggerLoadActuals/);
    expect(btns[2]).not.toContain('v-if');
    expect(btns[3]).not.toContain('v-if');
  });
  it('uses headerBadge for stage and status', () => {
    expect(heads[1]).toContain("headerBadge('stage'");
    expect(heads[1]).toContain("headerBadge('status', dashboardProject?.status || 'Not started yet')");
  });
});
