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

describe('admin.html — row menu, busy rows and confirmations', () => {
  it('has the menu, modal and live-region hooks and the exact copy', () => {
    for (const s of ['aria-haspopup="menu"', 'role="menu"', 'role="menuitem"', 'aria-disabled', 'id="disableModal"',
      'id="anonymizeModal"', "I understand this can't be undone.", 'Disable user', 'Anonymize user',
      'aria-live="polite"', 'Updating…', 'Sending…']) expect(html).toContain(s);
  });

  it('closes the menu before the action sends any request (a row can leave the filter)', () => {
    const body = methodBody('runItem');
    expect(body, 'runItem exists').not.toBeNull();
    const close = body.indexOf('closeMenu(');
    expect(close).toBeGreaterThan(-1);
    expect(body.indexOf('fetch(')).toBe(-1); // it delegates to the action methods…
    for (const m of ['toggleRole', 'toggleSysAdmin', 'resendInvite', 'setStatus', 'askDisable', 'askAnonymize']) {
      const at = body.indexOf(m + '(');
      expect(at, m).toBeGreaterThan(close); // …every one of them after closeMenu
    }
  });

  it('invites from a right-hand drawer, not a modal', () => {
    expect(html).toContain('offcanvas offcanvas-end');
    expect(html).toContain('id="inviteDrawer"');
    expect(html).not.toContain('id="inviteModal"');
    for (const s of ['Works on pipeline, portfolio and planning', 'Also manages users and master data',
      "Sysadmin can't be assigned with an invite. Promote an admin once they're active.", 'Invite another',
      'valid for 48 hours']) expect(html).toContain(s);
  });

  it('has the tablet and phone layouts', () => {
    expect(styles).toContain('@media (max-width: 1279.98px)');
    const phone = /@media \(max-width: 767\.98px\) \{([\s\S]*?)\n    \}\n/.exec(styles);
    expect(phone, 'phone media query').not.toBeNull();
    expect(phone[1]).toContain('--bs-offcanvas-width: 100vw');
    expect(html).toMatch(/<div[^>]*class="ua-sheet"[^>]*role="menu"|<div[^>]*role="menu"[^>]*class="ua-sheet"/);
  });

  it('keeps the busy state per row', () => {
    expect(html).toContain('u._loading');
    expect(html).toContain('u._sending');
    expect(html).not.toMatch(/this\.loadingRow|this\.busy\b/);
  });
});
