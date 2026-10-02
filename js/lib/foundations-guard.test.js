import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = f => readFileSync(join(ROOT, f), 'utf8');
const pages = readdirSync(ROOT).filter(f => /^[^/]+\.html$/.test(f));

// Text of a top-level function, from "function name(" to the first "\n}" line.
function fnText(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return '';
  return src.slice(start, src.indexOf('\n}', start) + 2);
}

describe('status badges (js/core.js)', () => {
  const core = read('js/core.js');
  for (const name of ['statusBadge', 'statusBadgeLarge']) {
    const body = fnText(core, name);
    it(`${name} exists and uses no hex colour`, () => {
      expect(body).not.toBe('');
      expect(body.match(/#[0-9a-fA-F]{3,6}\b/g) || []).toEqual([]);
    });
    it(`${name} maps all five statuses to --status-* tokens`, () => {
      for (const s of ['not-started', 'started', 'at-risk', 'on-hold', 'completed']) {
        expect(body).toContain(`var(--status-${s}-bg)`);
      }
      expect(body).toContain('var(--status-text)');
    });
    it(`${name} falls back to the not-started colours for an unknown status`, () => {
      expect(body).toMatch(/\|\|\s*'background:var\(--status-not-started-bg\);color:var\(--status-text\)'/);
    });
  }
});

describe('burndown chart colours (portfolio.html)', () => {
  const html = read('portfolio.html');
  it('contains no hardcoded line colours', () => {
    for (const lit of ["'#0d6efd'", "'#FF6F00'", "'#2E7D32'", "'var(--text-disabled)'"]) {
      expect(html).not.toContain(lit);
    }
  });
  it('reads the chart tokens through chartColor()', () => {
    for (const t of ['--chart-actual', '--chart-phasing', '--chart-committed', '--text-disabled']) {
      expect(html).toContain(`chartColor('${t}'`);
    }
  });
  it('chartColor falls back when the token is empty', () => {
    expect(html).toMatch(/chartColor\(name, fallback\)\s*\{[\s\S]*?getComputedStyle\(document\.documentElement\)[\s\S]*?\|\|\s*fallback/);
  });
});

describe('css/style.css', () => {
  const css = read('css/style.css');
  it('body uses the shared font stack', () => {
    expect(css).toMatch(/body\s*\{[^}]*font-family:\s*var\(--font-family-base\)/);
    expect(css).not.toContain("'Segoe UI', system-ui");
  });
  it('has no leftover magenta hover/active literals', () => {
    expect(css).not.toMatch(/#d01f6a|#b81860/i);
  });
  it('defines the new and restyled components', () => {
    for (const sel of ['.btn-danger', '.btn-ghost', '.btn-icon', '.spinner-border', '.alert-success', '.alert-danger',
      '.alert-warning', '.alert-info', '.dropdown-menu', '.modal {']) {
      expect(css).toContain(sel);
    }
  });
  it('modal variables are set on .modal (Bootstrap derives the inner radius there), not .modal-content', () => {
    expect(css).toMatch(/\.modal\s*\{[^}]*--bs-modal-border-radius/);
    expect(css).not.toMatch(/\.modal-content\s*\{[^}]*--bs-modal-/);
  });
  it('spinners inside buttons keep the button colour', () => {
    expect(css).toMatch(/\.btn \.spinner-border[^{]*\{[^}]*color:\s*inherit/);
  });
  it('keeps the layout invariants', () => {
    expect(css).toMatch(/height:\s*44px/);
    expect(css).toContain('calc(100vh - 206px)');
    expect(css).toContain('right: -960px');
  });
  it('is loaded after Bootstrap on every page that links it', () => {
    const bad = pages.filter(f => {
      const t = read(f);
      const s = t.indexOf('css/style.css');
      const b = t.indexOf('bootstrap.min.css');
      return s >= 0 && !(b >= 0 && b < s);
    });
    expect(bad).toEqual([]);
  });
});

describe('admin-crud.css and the public pages', () => {
  const admin = read('css/admin-crud.css');
  it('admin-crud.css uses tokens for font, card, muted text and primary hover', () => {
    expect(admin).toMatch(/body\s*\{[^}]*font-family:\s*var\(--font-family-base\)/);
    expect(admin).toMatch(/\.card\s*\{[^}]*border:\s*1px solid var\(--border-light\)[^}]*box-shadow:\s*var\(--shadow-sm\)/);
    expect(admin).toMatch(/\.table thead th\s*\{[^}]*color:\s*var\(--text-muted\)/);
    expect(admin).toContain('background: var(--brand-magenta-hover)');
    expect(admin).toContain('box-shadow: 0 0 0 3px var(--focus-ring)');
    expect(admin).not.toMatch(/#d01f6a|rgba\(240,\s*40,\s*122/i);
  });
  for (const f of ['login.html', 'activate.html', 'reset-password.html']) {
    it(`${f} uses the hover and focus tokens`, () => {
      const t = read(f);
      expect(t).not.toMatch(/#d01f6a|rgba\(240,\s*40,\s*122/i);
      expect(t).toContain('var(--brand-magenta-hover)');
      expect(t).toContain('var(--focus-ring)');
    });
  }
  it('every var() used by the public pages is defined in tokens.css', () => {
    const tokens = read('css/tokens.css');
    const missing = [];
    for (const f of ['login.html', 'activate.html', 'reset-password.html', 'terms.html']) {
      for (const m of read(f).matchAll(/var\(--([a-z0-9-]+)\)/g)) {
        if (!new RegExp(`--${m[1]}\\s*:`).test(tokens)) missing.push(`${f}: ${m[1]}`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });
});

describe('cache-busting', () => {
  const MIN = { 'css/tokens.css': 9, 'css/style.css': 15, 'css/admin-crud.css': 2, 'js/core.js': 10 };
  for (const [file, min] of Object.entries(MIN)) {
    it(`every reference to ${file} carries one shared ?v=N, at least ${min}`, () => {
      const versions = new Set();
      const unversioned = [];
      for (const f of pages) {
        const t = read(f);
        // Only real asset references (src/href attributes), not comments or prose that mention the file.
        for (const m of t.matchAll(new RegExp('(?:src|href)="[^"]*' + file.replace('.', '\\.') + '(\\?v=(\\d+))?', 'g'))) {
          if (m[2]) versions.add(Number(m[2])); else if (f !== 'test-cases.html') unversioned.push(f);
        }
      }
      expect(unversioned).toEqual([]);
      expect([...versions].length).toBe(1);
      expect([...versions][0]).toBeGreaterThanOrEqual(min);
    });
  }
});

describe('exact-match literals in CSS', () => {
  it('css/style.css has no #fff literal (use --text-inverse / --surface-white)', () => {
    expect(read('css/style.css')).not.toMatch(/#fff\b/i);
  });
  for (const f of ['login.html', 'activate.html', 'reset-password.html']) {
    it(`${f} <style> block has no literal that equals an existing token`, () => {
      const style = (read(f).match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
      expect(style).not.toMatch(/#fff\b|#e5e7eb|#6b7280/i);
    });
  }
});
