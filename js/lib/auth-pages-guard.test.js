import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = f => readFileSync(join(process.cwd(), f), 'utf8');

// Pages migrated to css/auth.css (Tasks 2-4 of the pre-login restyling append theirs).
const AUTH_PAGES = [];

describe('css/auth.css', () => {
  const css = read('css/auth.css');
  const block = sel => {
    const start = css.indexOf(sel + ' {');
    return start < 0 ? '' : css.slice(start, css.indexOf('}', start));
  };

  it('has no hex literal', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('uses the hover, active and focus tokens', () => {
    expect(css).toContain('var(--brand-magenta-hover)');
    expect(css).toContain('var(--brand-magenta-active)');
    expect(css).toContain('box-shadow: 0 0 0 3px var(--focus-ring)');
    expect(css).not.toContain('#d01f6a');
    expect(css).not.toContain('rgba(240, 40, 122');
  });

  it('styles the page and the card as the boards', () => {
    const body = block('body');
    expect(body).toMatch(/background:\s*var\(--brand-navy\)/);
    expect(body).toMatch(/min-height:\s*100vh/);
    expect(body).toMatch(/font-family:\s*var\(--font-family-base\)/);
    expect(css).not.toMatch(/[^-]height:\s*100vh/);
    const card = block('.auth-card');
    expect(card).toContain('border-radius: 16px');
    expect(card).toContain('padding: 40px 38px');
    expect(card).toContain('max-width: 400px');
    expect(card).toContain('box-shadow: 0 20px 50px rgba(0,0,0,.30)');
    expect(block('.auth-card--wide')).toContain('max-width: 420px');
    expect(block('.auth-stack')).toContain('gap: 22px');
  });

  it('colours the strength segments by position', () => {
    for (const n of [1, 2, 3, 4]) {
      expect(css).toContain(`.strength-${n} .strength-seg:nth-child(-n+${n})`);
    }
    expect(css).toMatch(/:nth-child\(1\)[^{]*\{[^}]*var\(--color-danger\)/);
    expect(css).toMatch(/:nth-child\(2\)[^{]*\{[^}]*var\(--brand-gold\)/);
    expect(css).toMatch(/:nth-child\(3\)[^{]*\{[^}]*var\(--color-success\)/);
    expect(css).toMatch(/:nth-child\(4\)[^{]*\{[^}]*var\(--color-success\)/);
    expect(block('.strength-seg')).toContain('background: var(--border-light)');
    expect(block('.strength-label')).toContain('min-height');
  });

  it('neutralises Bootstrap invalid styling', () => {
    expect(css).toContain('.form-control.is-invalid:focus');
    const inv = block('.form-control.is-invalid');
    expect(inv).toContain('border-color: var(--color-danger)');
    expect(inv).toContain('background-image: none');
  });

  it('replicates the alert and spinner overrides of style.css', () => {
    expect(css).toContain('--bs-alert-bg: var(--color-success-bg)');
    expect(css).toContain('--bs-alert-bg: var(--color-danger-bg)');
    expect(css).toMatch(/\.spinner-border\s*\{[^}]*var\(--brand-magenta\)/);
    expect(css).toMatch(/\.btn \.spinner-border\s*\{[^}]*color:\s*inherit/);
  });

  it('has the 480px phone rules', () => {
    const start = css.indexOf('@media (max-width: 480px)');
    expect(start).toBeGreaterThanOrEqual(0);
    const media = css.slice(start);
    expect(media).toContain('width: calc(100% - 32px)');
    expect(media).toContain('padding: 28px 22px');
    expect(media).toMatch(/\.form-control\s*\{[^}]*font-size:\s*16px/);
  });

  it('defines every class the pages use', () => {
    const classes = ['auth-stack', 'auth-card', 'auth-card--wide', 'auth-logo', 'auth-logo--compact', 'auth-logo-row',
      'auth-logo-mark', 'auth-logo-name', 'auth-logo-sub', 'auth-title', 'auth-subtitle', 'auth-field', 'auth-field--18',
      'auth-field--22', 'auth-field--24', 'auth-back', 'auth-state', 'auth-state-icon', 'auth-state-icon--danger',
      'auth-state-icon--success', 'user-chip', 'strength-meter', 'strength-1', 'strength-2', 'strength-3', 'strength-4',
      'strength-seg', 'strength-label', 'auth-copyright', 'form-label', 'form-control', 'invalid-feedback', 'btn-primary',
      'link-muted', 'alert-success', 'alert-danger', 'spinner-border'];
    const missing = classes.filter(c => !new RegExp(`\\.${c}(?![\\w-])`).test(css));
    expect(missing).toEqual([]);
  });
});

describe('migrated auth pages', () => {
  it('lists only existing pages', () => {
    for (const f of AUTH_PAGES) expect(() => read(f)).not.toThrow();
  });
  for (const f of AUTH_PAGES) {
    it(`${f} loads css/auth.css`, () => {
      expect(read(f)).toContain('css/auth.css');
    });
  }
});
