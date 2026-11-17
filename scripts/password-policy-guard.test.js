// Guard: one password rule, one place that hashes a password.
//
// Fails when bcrypt.hash( appears under api/src outside api/src/services/passwords.js, when that
// service stops importing ../lib/password-policy, when a root page with a new-password field does not
// load js/lib/password-policy.js, or when such a page (its page script, or js/lib/profile-ui.js)
// writes its own strength check or an "N characters" text.
//
// LIMIT, stated exactly: it checks where the calls and texts are, not whether the rule is right.
// The rule is pinned by api/src/lib/password-policy.test.js and the parity test of
// js/lib/password-policy.test.js.

import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { rawReadFileSync } from './lib/page-source.setup.mjs';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', '.superpowers', 'docs', 'backups', 'coverage']);
const SERVICE = 'api/src/services/passwords.js';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const rel = p => p.slice(ROOT.length + 1).replace(/\\/g, '/');
const read = f => rawReadFileSync(join(ROOT, f), 'utf8');

const apiSources = walk(join(ROOT, 'api', 'src')).map(rel).filter(f => f.endsWith('.js') && !f.endsWith('.test.js'));
const newPasswordPages = readdirSync(ROOT)
  .filter(f => f.endsWith('.html') && read(f).includes('autocomplete="new-password"'));

describe('password policy guard', () => {
  it('bcrypt.hash( is called only in services/passwords.js', () => {
    expect(apiSources.filter(f => read(f).includes('bcrypt.hash('))).toEqual([SERVICE]);
  });

  it('services/passwords.js requires ../lib/password-policy', () => {
    expect(read(SERVICE)).toMatch(/require\(['"]\.\.\/lib\/password-policy['"]\)/);
  });

  it('every page with a new-password field loads the twin', () => {
    expect(newPasswordPages.length).toBeGreaterThan(0);
    expect(newPasswordPages.filter(f => !read(f).includes('src="js/lib/password-policy.js?v='))).toEqual([]);
  });

  it('no rule rewritten by hand', () => {
    const files = [
      ...newPasswordPages,
      ...newPasswordPages.map(f => `js/pages/${f.replace(/\.html$/, '.js')}`).filter(f => {
        try { statSync(join(ROOT, f)); return true; } catch { return false; }
      }),
      'js/lib/profile-ui.js',
    ];
    const offenders = files.filter(f => /checkStrength|\b\d+ characters\b/.test(read(f)));
    expect(offenders).toEqual([]);
  });
});
