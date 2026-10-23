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
const PENDING = new Set([]);

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
  const open = new RegExp('<(\\w+)[^>]*class="(?:[^"]*\\s)?' + cls + '(?:\\s[^"]*)?"[^>]*>', 'g');
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

// Source of the method `name() { ... }` (brace-matched), or '' when the page defines none.
const methodBody = (html, name) => {
  const m = new RegExp('\\b' + name + '\\s*\\([^)]*\\)\\s*\\{').exec(html);
  if (!m) return '';
  let depth = 1, i = m.index + m[0].length;
  for (; i < html.length && depth; i++) depth += html[i] === '{' ? 1 : html[i] === '}' ? -1 : 0;
  return html.slice(m.index, i);
};

// Title roots that are data, not methods: their text comes from the API and cannot be
// checked statically. A root that is neither a method nor listed here fails the guard.
const DATA_TITLE_ROOTS = new Set([
  'selectedYear', 'cg', 'program', 'currentList', 'project', 'isNewProject',
]);
const JS_WORDS = new Set(['true', 'false', 'null', 'undefined', 'typeof', 'instanceof', 'in', 'new', 'this']);

// Of every {{ … }} in a title: its string literals, and its top-level identifiers
// (not after `.`/`?.`, not a JS keyword).
const titleExpressions = text => [...text.matchAll(/\{\{([\s\S]*?)\}\}/g)].map(m => {
  const literals = [];
  const code = m[1].replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, s => { literals.push(s); return '""'; });
  const roots = [...code.matchAll(/(?<![\w$.])[A-Za-z_$][\w$]*/g)]
    .map(r => r[0]).filter(r => !JS_WORDS.has(r));
  return { literals, roots };
});

// Why one title is not provably emoji-free, or [] when it is.
const titleProblems = (html, text) => {
  const out = [];
  for (const { literals, roots } of titleExpressions(text)) {
    for (const l of literals) if (/\p{Extended_Pictographic}/u.test(l)) out.push(`emoji in literal ${l}`);
    for (const r of roots) {
      if (DATA_TITLE_ROOTS.has(r)) continue;
      const body = methodBody(html, r);
      if (!body) out.push(`unknown title source ${r}`);
      else if (/\p{Extended_Pictographic}/u.test(body)) out.push(`emoji in method ${r}`);
    }
  }
  return out;
};

describe('guard helpers', () => {
  it('methodBody returns a brace-matched method and nothing for an unknown name', () => {
    const src = 'x: { title() { if (a) { return "A"; } return "B"; }, other() { return 1; } }';
    expect(methodBody(src, 'title')).toBe('title() { if (a) { return "A"; } return "B"; }');
    expect(methodBody(src, 'missing')).toBe('');
  });
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
  it('elementTexts matches whole class names, not a longer class that starts with one', () => {
    const html = '<div class="ph-title-row"><h1 class="x ph-title">T</h1><i>{{ s.name }}</i></div>';
    expect(elementTexts(html, 'ph-title')).toEqual(['T']);
  });
  it('titleProblems fails an emoji literal in a title expression', () => {
    expect(titleProblems('', "{{ cg?.name || '\u{1F4B0} Cost Grid' }}")).toEqual([`emoji in literal '\u{1F4B0} Cost Grid'`]);
  });
  it('titleProblems takes the root of a dotted path', () => {
    expect(titleProblems('', '{{ cg?.name || project.name }}')).toEqual([]);
  });
  it('titleProblems fails an unknown root and checks a method body', () => {
    expect(titleProblems('', '{{ mystery.name }}')).toEqual(['unknown title source mystery']);
    expect(titleProblems('t() { return "\u{1F600}"; }', '{{ t }}')).toEqual(['emoji in method t']);
    expect(titleProblems('t() { return "T"; }', '{{ t }}')).toEqual([]);
  });
});
const BTN_PRIMARY = /(?<![\w-])btn-primary/;
const stripComments = t => t.replace(/\/\*[\s\S]*?\*\//g, '');
const inlineStyles = html =>
  [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n');

describe('page discovery', () => {
  it('finds the 19 pages that call initNav (14 checked + 5 excluded)', () => {
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
    // .ph-side stays beside a long title until the row is narrower than the basis plus the side.
    expect(rule('.ph-main')).toMatch(/flex:\s*1 1 32rem/);
    // The back link takes its own line above the inline-flex title row.
    expect(rule('.ph-back')).toMatch(/display:\s*flex;\s*width:\s*fit-content/);
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
    expect(css).toMatch(/\.app-container > \.ph,\s*\.app-container > \.ph-toolbar\s*\{[^}]*margin-left:\s*calc\(-1 \* var\(--app-pad\)\)/);
    expect(css).toMatch(/body\.pp-fullwidth \.app-container\s*\{[^}]*--app-pad:\s*12px/);
    expect(css).not.toMatch(/body\.pp-fullwidth \.app-container > \.ph/);
  });
  it('no inline .app-container padding override without --app-pad', () => {
    for (const p of pages) {
      for (const m of read(p).matchAll(/\.app-container\s*\{([^}]*)\}/g)) {
        if (/padding/.test(m[1])) expect(m[1], p).toMatch(/--app-pad/);
      }
    }
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
      it('has no emoji in a computed .ph-title', () => {
        for (const t of elementTexts(html, 'ph-title')) expect(titleProblems(html, t), p).toEqual([]);
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

describe('_db-reset.html head', () => {
  const html = read('_db-reset.html');
  const head = elementTexts(html, 'ph-title')[0] || '';
  it('has the Database Reset title without the red 2.5rem styling', () => {
    expect(head).toContain('Database Reset');
    expect(head).not.toMatch(/\p{Extended_Pictographic}/u);
    const h1 = (html.match(/<h1[^>]*>/) || [''])[0];
    expect(h1).not.toMatch(/dc3545|font-size:\s*2\.5rem/);
  });
  it('puts the warning in an alert-danger right after the head', () => {
    expect(html).toMatch(/class="ph"[\s\S]*?<div class="page app-container">\s*<div class="alert alert-danger[^"]*">Sysadmin-only/);
  });
});

describe('costgrid.html head', () => {
  const html = read('costgrid.html');
  it('keeps the back link on goBack with the Saving text', () => {
    const backs = [...html.matchAll(/<a[^>]*class="ph-back"[^>]*>[\s\S]*?<\/a>/g)].map(x => x[0]);
    expect(backs.length).toBe(1);
    expect(backs[0]).toContain('@click.prevent="goBack"');
    expect(backs[0]).toContain("backSaving ? 'Saving…' : 'Pipeline'");
  });
  it('has no private stage style', () => {
    expect(html).not.toContain('CG_HEADER_STAGE_STYLE');
    expect(html).not.toContain('headerStageStyle');
  });
  it('uses headerBadge for the stage and the shared icons', () => {
    expect(html).toContain("headerBadge('stage', draft?.pipeline)");
    expect(html).toContain(".component('ph-icon', window.PhIcon)");
  });
  it('keeps Share on !isDraft', () => {
    expect(html).toMatch(/<button v-if="!isDraft" class="ph-btn"[^>]*openShareModal\('cost_grid'/);
  });
});

describe('final-review fixes', () => {
  const css = read('css/style.css');
  it('spaces the last band of a view inside .app-container (glued ph + toolbar)', () => {
    expect(css).toMatch(/\.app-container \.ph:not\(:has\(\+ \.ph-toolbar\)\) \{ margin-bottom: var\(--content-gap\); \}/);
    // Separate rule, so a browser without :has() still spaces the toolbar.
    expect(css).toMatch(/\n\.app-container \.ph-toolbar \{ margin-bottom: var\(--content-gap\); \}/);
  });
  it('gives .ph-btn hover, disabled and no underline', () => {
    expect(css).toMatch(/\.ph-btn:hover:not\(:disabled\)/);
    expect(css).toMatch(/\.ph-btn:disabled/);
    expect(css).toMatch(/\.ph-btn \{[^}]*text-decoration: none/);
  });
  it('does not stack .ph-eyebrow on the program row', () => {
    expect(read('portfolio.html')).not.toContain('ph-eyebrow pr-program-row');
  });
});

describe('phone page head lives in style.css (B-096) and the primary CTA is 36px, taller than .ph-btn as on the boards (B-105)', () => {
  const css = stripComments(read('css/style.css'));
  const pipeline = stripComments(read('css/pipeline.css'));
  const phone = (css.match(/@media \(max-width: 767\.98px\)\s*\{[\s\S]*?\n\}/g) || []).join('\n');
  it('style.css phone block carries the page head rules', () => {
    expect(phone).toMatch(/\.ph \{ flex-direction: column;[^}]*padding: var\(--space-3\) var\(--space-4\);[^}]*position: relative;/);
    expect(phone).toMatch(/\.ph-title \{ font-size: 20px; \}/);
    expect(phone).toMatch(/\.ph-sub \{ display: none; \}/);
    expect(phone).toMatch(/\.ph-side \{ width: 100%; justify-content: space-between; gap: var\(--space-3\); \}/);
    expect(phone).toMatch(/\.ph-btn-primary \{ min-height: 44px;/);
    expect(phone).toMatch(/\.ph-toolbar \{ padding: var\(--space-2\) var\(--space-4\); \}/);
    // A column band must not turn .ph-main's 32rem row basis into a 32rem-tall block.
    expect(phone).toMatch(/\.ph-main \{ flex: 0 0 auto; \}/);
  });
  it('only the pipeline toolbar stays on one line at phone width', () => {
    expect(phone).not.toMatch(/\.ph-toolbar \{[^}]*flex-wrap: nowrap/);
    expect(pipeline).toMatch(/#pipelineBoardSection \.ph-toolbar \{ flex-wrap: nowrap; \}/);
  });
  it('pipeline.css no longer defines the six shared head rules as standalone rules', () => {
    // Pipeline-only contexts (#pipelineBoardSection .ph, .pb-title-btn .ph-title) are not standalone rules.
    for (const c of ['.ph', '.ph-title', '.ph-sub', '.ph-side', '.ph-btn-primary', '.ph-toolbar']) {
      expect(new RegExp('(?:^|[{}\\n])\\s*' + c.replace('.', '\\.') + '\\s*\\{').test(pipeline), c).toBe(false);
    }
  });
  it('.ph-btn-primary is 36px and .ph-btn stays 32px', () => {
    const b = [...css.matchAll(/(?:^|[}\s])\.ph-btn-primary\s*\{([^}]*)\}/g)][0][1];
    const sec = [...css.matchAll(/(?:^|[}\s])\.ph-btn\s*\{([^}]*)\}/g)][0][1];
    expect(b).toContain('display: inline-flex');
    expect(b).toContain('align-items: center');
    expect(b).toContain('height: 36px');
    expect(b).toContain('white-space: nowrap');
    expect(sec).toContain('height: 32px');
    expect(b).toContain('padding: 0 var(--space-4)');
  });
});

describe('no empty badge span in the title row (B-099)', () => {
  for (const f of ['costgrid.html', 'portfolio.html']) {
    it(`${f}: every headerBadge span is guarded by a v-if with the same call`, () => {
      const html = read(f);
      const spans = [...html.matchAll(/<span[^>]*v-html="(headerBadge\([^"]*\))"[^>]*>/g)];
      expect(spans.length).toBeGreaterThan(0);
      for (const m of spans) {
        expect(m[0], m[1]).toContain(`v-if="${m[1]}"`);
      }
    });
  }
});
