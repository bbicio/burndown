import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const read = f => readFileSync(join(process.cwd(), f), 'utf8');

// Body of the first rule whose selector is exactly `selector`, or null.
export const rule = (text, selector) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp('(?:^|[}\\s])' + esc + '\\s*\\{([^}]*)\\}').exec(text);
  return m ? m[1].trim() : null;
};

// A hex colour, rgb(a)() or a literal px/rem measure.
export const LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\(|\b\d*\.?\d+(px|rem)\b/;

describe('rule helper', () => {
  it('matches the exact selector', () => {
    expect(rule('.a{x:1}.ab{y:2}', '.a')).toBe('x:1');
  });
  it('does not match a longer selector', () => {
    expect(rule('.ab{y:2}', '.a')).toBeNull();
  });
});

describe('component tokens', () => {
  const tokens = read('css/tokens.css');
  const EXPECTED = {
    'card-bg': 'var(--surface-white)',
    'card-border': '1px solid var(--border-light)',
    'card-radius': 'var(--radius-lg)',
    'card-shadow': 'none',
    'card-pad': 'var(--space-4)',
    'card-head-pad': 'var(--space-3) var(--space-4)',
    'card-danger-border': '2px solid var(--color-danger)',
    'tile-pad': 'var(--space-3) var(--space-4)',
    'tile-label-size': 'var(--text-2xs)',
    'tile-value-size': '1.375rem',
    'banner-radius': 'var(--radius-sm)',
    'banner-pad': 'var(--space-2) var(--space-3)',
    'banner-font-size': 'var(--text-sm)',
    'content-gap': 'var(--space-4)',
  };
  for (const [name, value] of Object.entries(EXPECTED)) {
    it(`defines --${name}`, () => {
      expect(tokens).toContain(`--${name}: ${value};`);
    });
  }
});

describe('excluded pages are untouched', () => {
  // sha256 of the concatenated inline <style> contents, computed on main before this cycle.
  const MASTER_SHA = 'c6dc734b8d97bda91a83b964ce34a57fd803ad1fd6f0965bfd19fc749cacc646';
  const EXCLUDED_STYLE_SHA = {
    'master-clients.html': MASTER_SHA,
    'master-client-groups.html': MASTER_SHA,
    'master-pipelines.html': MASTER_SHA,
    'master-roles.html': MASTER_SHA,
    'master-currencies.html': MASTER_SHA,
    'project-config.html': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  };
  const styleSha = file => {
    // Hashed on LF text: the repo stores LF, a Windows checkout may hand back CRLF.
    const s = [...read(file).replace(/\r\n/g, '\n').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
    return createHash('sha256').update(s).digest('hex');
  };
  for (const [file, sha] of Object.entries(EXCLUDED_STYLE_SHA)) {
    it(`${file} keeps its inline styles`, () => {
      expect(styleSha(file)).toBe(sha);
    });
  }
  it('.cfg-section in style.css is unchanged', () => {
    expect(rule(read('css/style.css'), '.cfg-section')).toBe(
      'background: var(--surface-light); border-radius: var(--radius-md); padding: 16px 18px; margin-bottom: 1rem;');
  });
});

describe('cards and tiles', () => {
  const style = read('css/style.css');
  const portfolio = read('css/portfolio.css');
  const costgrid = read('css/costgrid.css');
  const adminCrud = read('css/admin-crud.css');
  const dbReset = read('_db-reset.html');
  const body = (text, sel) => {
    const b = rule(text, sel);
    expect(b, `${sel} rule exists`).not.toBeNull();
    return b;
  };

  it('.section-card reads the card tokens', () => {
    const b = body(style, '.section-card');
    for (const t of ['--card-bg', '--card-border', '--card-radius', '--card-shadow']) expect(b).toContain(`var(${t})`);
    expect(b).not.toMatch(LITERAL);
  });
  it('card heads read --card-head-pad', () => {
    for (const [text, sel] of [[style, '.section-header'], [portfolio, '.pr-card-head'], [costgrid, '.cg-grid-card-header']]) {
      const b = body(text, sel);
      expect(b, sel).toContain('var(--card-head-pad)');
      expect(b, sel).not.toMatch(LITERAL);
    }
  });
  it('portfolio cards read border, radius and padding tokens', () => {
    for (const sel of ['.pg-card', '.pr-card', '.pf-card']) {
      const b = body(portfolio, sel);
      expect(b, sel).toContain('var(--card-border)');
      expect(b, sel).toContain('var(--card-radius)');
      expect(b, sel).not.toMatch(LITERAL);
    }
    for (const sel of ['.pg-card', '.pf-card']) expect(body(portfolio, sel)).toContain('var(--card-pad)');
  });
  it('.card in admin-crud.css reads the card tokens', () => {
    const b = body(adminCrud, '.card');
    for (const t of ['--card-border', '--card-radius', '--card-shadow']) expect(b).toContain(`var(${t})`);
    expect(b).not.toMatch(LITERAL);
  });
  it('.danger-card reads the card tokens and semantic colours', () => {
    const b = body(dbReset, '.danger-card');
    for (const t of ['--card-danger-border', '--card-radius', '--card-pad']) expect(b).toContain(`var(${t})`);
    expect(b).not.toMatch(LITERAL);
    expect(body(dbReset, '.danger-card h5')).toContain('var(--color-danger-text)');
    expect(body(dbReset, '.danger-card p')).toContain('var(--text-muted)');
  });
  it('tiles read the tile tokens', () => {
    const tile = body(portfolio, '.pg-tile');
    expect(tile).toContain('var(--tile-pad)');
    expect(tile).not.toMatch(LITERAL);
    expect(body(portfolio, '.pg-tile-label')).toContain('var(--tile-label-size)');
    expect(body(portfolio, '.pg-tile-value')).toContain('var(--tile-value-size)');
  });
  it('the project dashboard tiles no longer override padding or value size', () => {
    const t = rule(portfolio, '.pr-kpis .pg-tile');
    if (t !== null) expect(t).not.toContain('padding');
    expect(rule(portfolio, '.pr-kpis .pg-tile-value')).not.toContain('font-size');
  });
  it('.kpi-card is gone', () => {
    expect(style).not.toContain('.kpi-card');
  });
});

describe('banners and alerts', () => {
  
  const style = read('css/style.css');
  const costgrid = read('css/costgrid.css');
  const EXCLUDED = new Set(['master-clients.html', 'master-client-groups.html', 'master-pipelines.html',
    'master-roles.html', 'master-currencies.html', 'project-config.html']);
  const inScope = readdirSync(process.cwd())
    .filter(f => f.endsWith('.html') && /initNav\(/.test(read(f)) && !EXCLUDED.has(f)).sort();
  const cssFiles = readdirSync(join(process.cwd(), 'css')).filter(f => f.endsWith('.css') && f !== 'auth.css');

  it('.alert-sm reads the banner tokens', () => {
    const b = rule(style, '.alert-sm');
    expect(b).not.toBeNull();
    expect(b).toContain('font-size: var(--banner-font-size)');
    expect(b).toContain('padding: var(--banner-pad)');
    expect(b).toContain('border-radius: var(--banner-radius)');
  });
  it('.alert-sm is defined exactly once across the stylesheets and in-scope pages', () => {
    const owners = [];
    const count = text => (text.match(/\.alert-sm\s*\{/g) || []).length;
    for (const f of cssFiles) for (let i = 0; i < count(read('css/' + f)); i++) owners.push('css/' + f);
    for (const f of inScope) for (let i = 0; i < count(read(f)); i++) owners.push(f);
    expect(owners).toEqual(['css/style.css']);
  });
  it('.cg-banner reads the banner tokens', () => {
    const b = rule(costgrid, '.cg-banner');
    expect(b).not.toBeNull();
    for (const t of ['--banner-radius', '--banner-pad', '--banner-font-size', '--content-gap']) expect(b).toContain(`var(${t})`);
    expect(b).not.toMatch(LITERAL);
  });
  it('load-error alerts in the content flow use alert-sm', () => {
    expect(read('costgrid.html')).toContain('class="alert alert-danger alert-sm m-4"');
    expect(read('planning.html')).toContain('class="alert alert-danger alert-sm m-4"');
    const db = read('_db-reset.html');
    expect(db).toContain('class="alert alert-danger alert-sm mb-4">Sysadmin-only');
    expect(db).toContain('class="alert alert-danger alert-sm">Access denied');
  });
});

describe('page surface and spacing', () => {
  const EXCLUDED = new Set(['master-clients.html', 'master-client-groups.html', 'master-pipelines.html',
    'master-roles.html', 'master-currencies.html', 'project-config.html']);
  const inScope = readdirSync(process.cwd())
    .filter(f => f.endsWith('.html') && /initNav\(/.test(read(f)) && !EXCLUDED.has(f)).sort();
  const inline = f => [...read(f).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
  const style = read('css/style.css');

  it('no in-scope page nor admin-crud.css repaints body background or font', () => {
    const bad = [];
    for (const [name, text] of [['css/admin-crud.css', read('css/admin-crud.css')], ...inScope.map(f => [f, inline(f)])]) {
      const b = rule(text, 'body');
      if (b !== null && /background|font-family/.test(b)) bad.push(name);
    }
    expect(bad).toEqual([]);
  });
  it('every .page rule reads --content-gap', () => {
    for (const [name, text] of [['css/admin-crud.css', read('css/admin-crud.css')], ...inScope.map(f => [f, inline(f)])]) {
      const b = rule(text, '.page');
      if (b === null) continue;
      expect(b, name).toContain('var(--content-gap)');
      expect(b, name).not.toMatch(LITERAL);
    }
    expect(rule(read('css/admin-crud.css'), '.page')).not.toBeNull();
  });
  it('the band follows --app-pad on both sides', () => {
    const b = rule(style, '.app-container > .ph, .app-container > .ph-toolbar');
    expect(b).toContain('padding-left: var(--app-pad)');
    expect(b).toContain('padding-right: var(--app-pad)');
  });
  it('the gap under the band is --content-gap', () => {
    expect(rule(style, '.app-container .ph:not(:has(+ .ph-toolbar))')).toContain('margin-bottom: var(--content-gap)');
    expect(rule(style, '.app-container .ph-toolbar')).toContain('margin-bottom: var(--content-gap)');
  });
  it('a phone narrows --app-pad to --space-4, where the band can read it', () => {
    // The block itself, opening brace to its matching one, not to the end of the file.
    const start = style.indexOf('@media (max-width: 767.98px)');
    let depth = 0, end = start;
    for (let i = style.indexOf('{', start); i < style.length; i++) {
      depth += style[i] === '{' ? 1 : style[i] === '}' ? -1 : 0;
      if (depth === 0) { end = i; break; }
    }
    const phone = style.slice(start, end + 1);
    expect(phone).toMatch(/\.app-container\s*\{\s*--app-pad:\s*var\(--space-4\)/);
  });
  it('portfolio and program do not redefine --app-pad', () => {
    expect(read('portfolio.html')).not.toContain('--app-pad:');
    expect(read('program.html')).not.toContain('--app-pad:');
  });
});

describe('planning toolbar', () => {
  const html = read('planning.html');
  const start = html.indexOf('<div class="pl-toolbar-right">');
  const toolbar = html.slice(start, html.indexOf('</div>', start));
  const buttons = toolbar.split('</button>').slice(0, -1).map(b => b + '</button>');

  it('has four buttons', () => {
    expect(start).toBeGreaterThan(-1);
    expect(buttons.length).toBe(4);
  });
  it('carries no emoji or symbol glyphs', () => {
    expect(toolbar).not.toMatch(/\p{Extended_Pictographic}|[⛶⊡⬇]/u);
  });
  it('every button is a .ph-btn with a shared icon', () => {
    for (const b of buttons) {
      expect(b).toContain('class="ph-btn"');
      expect(b).toContain('<ph-icon');
    }
    const by = label => buttons.find(b => b.includes(label));
    expect(by('Team assistant')).toContain('name="team"');
    expect(by('Load XLS')).toContain('name="upload"');
    expect(by('Export XLS')).toContain('name="download"');
    expect(by('toggleFullWidth')).toContain(`:name="fullWidth ? 'minimize' : 'maximize'"`);
  });
  it('registers ph-icon before mounting', () => {
    const reg = html.indexOf(`app.component('ph-icon', window.PhIcon)`);
    expect(reg).toBeGreaterThan(-1);
    expect(reg).toBeLessThan(html.indexOf(`app.mount('#planningApp')`));
  });
});
