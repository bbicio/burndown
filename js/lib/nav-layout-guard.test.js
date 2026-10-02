import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = f => readFileSync(join(process.cwd(), f), 'utf8');
const css = read('css/style.css');

describe('navigation CSS (css/style.css)', () => {
  it('removed the footer and the old top-tab styles', () => {
    expect(css).not.toContain('.app-footer');
    expect(css).not.toContain('.nav-main-tab');
    expect(css).not.toContain('.nav-role-menu-trigger');
  });
  it('switches the layout at 1024px and sets the sidebar widths from CSS (no JS, no jump)', () => {
    expect(css).toContain('@media (min-width: 1024px)');
    expect(css).toContain('@media (max-width: 1023.98px)');
    expect(css).toContain('--sidebar-w: var(--sidebar-w-open)');
    expect(css).toContain('html[data-sidebar="collapsed"] { --sidebar-w: var(--sidebar-w-rail); }');
    expect(css).toMatch(/--sidebar-w-open:\s*240px/);
    expect(css).toMatch(/--sidebar-w-rail:\s*68px/);
  });
  it('reserves #nav-container (navy, fixed column on large screens) before the script renders', () => {
    expect(css).toMatch(/#nav-container\s*\{\s*background:\s*var\(--brand-navy\);\s*\}/);
    expect(css).toMatch(/#nav-container\s*\{[^}]*position:\s*fixed[^}]*width:\s*var\(--sidebar-w\)/);
    expect(css).toMatch(/#nav-container\s*\{\s*height:\s*var\(--nav-top-h\);\s*\}/);
  });
  it('keeps the navigation below Bootstrap modals (1055): base token, raised to 1050 only while a menu or panel is open', () => {
    const tokens = read('css/tokens.css');
    const z = Number(tokens.match(/--z-fixed:\s*(\d+)/)[1]);
    expect(z).toBeLessThan(1055);
    const raise = sel => {
      const m = css.match(new RegExp(sel + ':has\\(\\.dropdown-menu\\.show, \\.pd-nav-group\\.open\\)\\s*\\{\\s*z-index:\\s*(\\d+)'));
      expect(m, sel).not.toBeNull();
      const v = Number(m[1]);
      expect(v).toBeLessThan(1055);
      expect(v).toBeGreaterThan(1045);
    };
    raise('#nav-container');
    raise('\\.pd-nav');
    expect(css).toMatch(/#nav-container\s*\{[^}]*z-index:\s*var\(--z-fixed\)/);
    expect(css).toMatch(/\.pd-nav\s*\{[^}]*z-index:\s*var\(--z-fixed\)/);
  });
  it('hides the breadcrumb and zeroes its height below 1024px', () => {
    expect(css).toMatch(/@media \(max-width: 1023\.98px\)\s*\{[\s\S]*?\.breadcrumb-bar\s*\{\s*display:\s*none;/);
    expect(css).toMatch(/body\.has-breadcrumbs\s*\{\s*--breadcrumb-h:\s*0px;\s*\}/);
  });
  it('sizes the pipeline board from the navbar and breadcrumb heights only (no footer term)', () => {
    expect(css).toContain('height: calc(100vh - var(--nav-top-h) - var(--breadcrumb-h));');
    expect(css).not.toContain('206px');
  });
  it('shows the group panels permanently on large screens and the toggle only below 1024px', () => {
    expect(css).toMatch(/@media \(min-width: 1024px\)\s*\{[\s\S]*?\.pd-nav-group-toggle,\s*\.pd-nav-dot\s*\{\s*display:\s*none;\s*\}/);
    expect(css).toMatch(/\.pd-nav-group\.open \.pd-nav-group-panel\s*\{\s*display:\s*block;\s*\}/);
  });
  it('truncates a very long email instead of widening the sidebar', () => {
    expect(css).toMatch(/\.pd-account-email\s*\{[^}]*text-overflow:\s*ellipsis/);
  });
  it('unread notifications use the magenta tint tokens, not literals', () => {
    expect(css).not.toMatch(/#fdf0f5|#f9e8f0/i);
    expect(css).toMatch(/\.notif-item\.unread\s*\{[^}]*var\(--brand-magenta-tint\)/);
  });
  it('the unread bell is white with a red icon and border', () => {
    expect(css).toMatch(/\.pd-bell-btn\.has-unread\s*\{[^}]*background:\s*var\(--surface-white\)[^}]*var\(--color-danger\)/);
  });
});

describe('rail tooltip CSS (#pd-tooltip)', () => {
  const block = (css.match(/#pd-tooltip\s*\{([^}]*)\}/) || [])[1] || '';
  it('is a fixed, non-interactive element, centred on the anchor point, hidden until .show', () => {
    expect(block).toMatch(/position:\s*fixed/);
    expect(block).toMatch(/transform:\s*translateY\(-50%\)/);
    expect(block).toMatch(/pointer-events:\s*none/);
    expect(block).toMatch(/visibility:\s*hidden/);
    expect(css).toMatch(/#pd-tooltip\.show\s*\{[^}]*visibility:\s*visible/);
  });
  it('sits above the raised navigation (1050) and below Bootstrap modals (1055)', () => {
    const z = Number((block.match(/z-index:\s*(\d+)/) || [])[1]);
    expect(z).toBeGreaterThan(1050);
    expect(z).toBeLessThan(1055);
  });
  it('uses design tokens only (navy background, white text), no literal colours', () => {
    expect(block).toMatch(/background:\s*var\(--brand-navy\)/);
    expect(block).toMatch(/color:\s*var\(--text-inverse\)/);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });
  it('keeps a long email on one line with an ellipsis', () => {
    expect(block).toMatch(/white-space:\s*nowrap/);
    expect(block).toMatch(/text-overflow:\s*ellipsis/);
    expect(block).toMatch(/max-width:\s*\d+px/);
  });
});

describe('public pages carry no fixed footer', () => {
  for (const f of ['login.html', 'activate.html', 'reset-password.html', 'terms.html']) {
    it(`${f} has no <footer>`, () => expect(read(f)).not.toMatch(/<footer/i));
  }
});
