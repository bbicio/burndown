import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = f => readFileSync(join(process.cwd(), f), 'utf8');

// Pages migrated to css/auth.css (Tasks 2-4 of the pre-login restyling append theirs).
const AUTH_PAGES = ['login.html', 'reset-password.html', 'activate.html'];
// Pages with the position-coloured strength meter.
const STRENGTH_PAGES = ['reset-password.html', 'activate.html'];

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

  it('sets the Bootstrap button variables so active and disabled stay magenta', () => {
    const btn = block('.btn-primary');
    expect(btn).toContain('--bs-btn-active-bg: var(--brand-magenta-active)');
    expect(btn).toContain('--bs-btn-disabled-bg: var(--brand-magenta)');
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
    describe(f, () => {
      const t = read(f);
      it('links Bootstrap, tokens.css then auth.css', () => {
        const bs = t.indexOf('bootstrap@5.3.2/dist/css/bootstrap.min.css');
        const tok = t.indexOf('css/tokens.css?v=9');
        const auth = t.indexOf('css/auth.css?v=1');
        expect(bs).toBeGreaterThanOrEqual(0);
        expect(tok).toBeGreaterThan(bs);
        expect(auth).toBeGreaterThan(tok);
      });
      it('has no inline styles', () => {
        expect(t).not.toMatch(/<style[\s>]/);
        expect(t).not.toMatch(/\sstyle="/);
        expect(t).not.toMatch(/:style=/);
      });
      it('has no hex literal', () => {
        expect(t).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      });
      it('has no emoji', () => {
        expect(t.replace(/©/g, '')).not.toMatch(/\p{Extended_Pictographic}/u);
      });
      it('drops the old utility and brand classes', () => {
        for (const c of ['text-secondary', 'btn-sm', 'btn-outline-secondary', 'brand-name', 'brand-sub']) {
          expect(t).not.toContain(c);
        }
      });
      it('has the shared stack, logo and copyright', () => {
        expect(t).toContain('class="auth-stack"');
        expect(t).toContain('class="auth-logo-mark" aria-hidden="true">P</span>');
        expect(t).toContain('<div class="auth-logo-sub">Project Dashboard</div>');
        expect(t).toContain('class="auth-copyright"');
        expect(t).toContain('year: new Date().getFullYear()');
      });
      it('keeps v-cloak on #app', () => {
        expect(t).toContain('<div id="app" v-cloak>');
      });
    });
  }

  for (const f of STRENGTH_PAGES) {
    describe(`${f} strength meter and states`, () => {
      const t = read(f);
      it('uses strengthClass, not strengthColor', () => {
        expect(t).toContain("strengthClass() { return 'strength-' + this.strength; }");
        expect(t).toContain(':class="strengthClass"');
        expect(t).not.toContain('strengthColor');
      });
      it('has the meter markup', () => {
        expect(t).toContain('class="strength-meter"');
        expect(t).toContain('<span v-for="i in 4" :key="i" class="strength-seg"></span>');
        expect(t).toContain('class="strength-label"');
      });
      it('uses the wide card and compact logo', () => {
        expect(t).toContain('class="auth-card auth-card--wide"');
        expect(t).toContain('class="auth-logo auth-logo--compact"');
      });
      it('has the danger and success state icons as decorative SVGs', () => {
        for (const m of ['danger', 'success']) {
          const tag = t.match(new RegExp(`<svg[^>]*auth-state-icon auth-state-icon--${m}[^>]*>`));
          expect(tag, m).not.toBeNull();
          expect(tag[0]).toContain('stroke="currentColor"');
          expect(tag[0]).toContain('aria-hidden="true"');
        }
      });
      it('keeps checkStrength() unchanged', () => {
        expect(t).toContain('if (p.length >= 12) score++;');
        expect(t).toContain('/[0-9!@#$%^&*]/');
      });
    });
  }

  it('the logo markup is identical in the three pages', () => {
    const END = '<div class="auth-logo-sub">Project Dashboard</div>';
    const logo = f => {
      const t = read(f);
      const start = t.indexOf('<div class="auth-logo-row">');
      expect(start, f).toBeGreaterThanOrEqual(0);
      return t.slice(start, t.indexOf(END) + END.length);
    };
    const [a, b, c] = ['login.html', 'reset-password.html', 'activate.html'].map(logo);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  describe('activate.html specifics', () => {
    const t = read('activate.html');
    it('has the user chip with a decorative envelope SVG', () => {
      const m = t.match(/class="user-chip[^"]*"[^>]*>([\s\S]*?)<\/div>/);
      expect(m).not.toBeNull();
      const svg = m[1].match(/<svg[^>]*>/);
      expect(svg).not.toBeNull();
      expect(svg[0]).toContain('aria-hidden="true"');
      expect(svg[0]).toContain('stroke="currentColor"');
    });
    it('uses a primary full-width button in the invalid state', () => {
      expect(t).not.toContain('btn-outline-secondary');
      expect(t).toMatch(/<a href="\/login\.html" class="btn btn-primary w-100 mt-2">Go to sign in<\/a>/);
    });
    it('keeps the loading copy', () => {
      expect(t).toContain('Validating invitation…');
    });
  });

  describe('login.html specifics', () => {
    const t = read('login.html');
    it('pre-fills the Forgot email without overwriting it', () => {
      const line = t.split('\n').find(l => l.includes('switchToForgot()'));
      expect(line).toContain('this.forgotEmail ||= this.email');
    });
    it('compacts the logo in the Forgot view', () => {
      expect(t).toContain("'auth-logo--compact': view === 'forgot'");
    });
  });
});
