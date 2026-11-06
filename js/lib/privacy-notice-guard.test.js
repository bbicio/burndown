import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = f => readFileSync(join(ROOT, f), 'utf8');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git', '.claude', '.superpowers', 'docs', 'backups', 'coverage'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p.slice(ROOT.length + 1).replaceAll('\\', '/'));
  }
  return out;
}

describe('privacy-notice.html', () => {
  const html = read('privacy-notice.html');

  it('is read-only: no button, input, form, textarea or select', () => {
    expect(html).not.toMatch(/<button|<input|<form|<textarea|<select/i);
  });

  it('loads the dates module and the terms endpoint, and names the page', () => {
    expect(html).toContain('js/lib/dates.js?v=4');
    expect(html).toContain('/api/app-settings/terms');
    expect(html).toContain("initNav('privacy'");
    expect(html).toContain('<title>PDash — Privacy Notice</title>');
  });

  it('carries the empty and error messages', () => {
    expect(html).toContain('No privacy notice has been published yet.');
    expect(html).toContain('Unable to load the privacy notice. Please refresh or contact your administrator.');
  });

  it('uses no hardcoded hex colour in its style block', () => {
    const style = (html.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];
    expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe('settings.html is gone', () => {
  it('the file no longer exists', () => {
    expect(existsSync(join(ROOT, 'settings.html'))).toBe(false);
  });

  it('no root page or shared script still cites settings.html', () => {
    const offenders = walk(ROOT)
      .filter(f => (/^[^/]+\.html$/.test(f) || /^js\/.*\.js$/.test(f)) && !/\.test\.js$/.test(f))
      .filter(f => read(f).includes('settings.html'));
    expect(offenders).toEqual([]);
  });
});
