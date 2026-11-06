import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const html = readFileSync(join(process.cwd(), 'admin.html'), 'utf8').replace(/\r\n/g, '\n');
const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
const styleAttrs = [...html.matchAll(/\sstyle="([^"]*)"/g)].map(m => m[1]).join('\n');

// Body of a Vue method written as `name(args) {` / `async name(args) {` inside `methods`.
const methodBody = name => {
  const m = new RegExp('\\n\\s+(?:async\\s+)?' + name + '\\([^)]*\\)\\s*\\{').exec(html);
  if (!m) return null;
  let depth = 0;
  for (let i = m.index + m[0].length - 1; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) return html.slice(m.index, i + 1);
  }
  return null;
};

describe('admin.html — page rules', () => {
  it('uses no native confirm()/alert() and no action emoji', () => {
    expect(html).not.toMatch(/\bconfirm\(|\balert\(/);
    for (const e of ['⬆', '⬇', '✉️', '🗑', '🔒']) expect(html).not.toContain(e);
  });

  it('has no hex colour in <style> or style attributes', () => {
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(styleAttrs).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('loads user-admin-rules.js as a module before the Vue script', () => {
    const rules = html.indexOf('<script type="module" src="js/lib/user-admin-rules.js?v=1"></script>');
    const vue = html.indexOf('Vue.createApp');
    expect(rules).toBeGreaterThan(-1);
    expect(vue).toBeGreaterThan(rules);
  });

  it('has the accessibility hooks and the exact page copy', () => {
    for (const s of ['aria-sort', 'role="alert"', 'role="status"', 'Search name or email…', 'Loading users…',
      'Admin access required', 'Clear filters']) expect(html).toContain(s);
  });

  it('dropped the old badge classes', () => {
    expect(html).not.toMatch(/badge-role-|badge-st-/);
  });
});
