import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as web from './notification-url.js';

const server = createRequire(import.meta.url)('../../api/src/lib/notification-url.js');

const VALUES = [
  '/pipeline.html', '/costgrid.html?cgId=1&verId=2#x', 'http://localhost/pipeline.html',
  'http://localhost:80/x', 'http://evil.com@localhost/x', '/%5Cevil', '/%2F%2Fevil',
  'https://app.example.com/x', 'https://app.example.com.evil.com/x',
  'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', '//example.com', '/\\evil',
  '\\\\host\\x', 'https://example.com/x', 'http://localhost.evil.com/x', 'http://localhost@evil.com/x',
  'https://localhost/x', '/a\nb', '/a\u0000b', '/a b', '   ', 'pipeline.html', '/' + 'a'.repeat(2048),
  123, {}, ['/a'], null, undefined, ''
];

describe('notificationUrl: browser and server twins agree', () => {
  for (const origin of ['http://localhost', 'https://app.example.com']) {
    it(`gives identical results for every case at ${origin}`, () => {
      for (const v of VALUES) {
        expect(web.notificationUrl(v, origin), JSON.stringify(v)).toBe(server.notificationUrl(v, origin));
      }
    });
  }
});

const read = p => readFileSync(join(process.cwd(), p), 'utf8');
const lines = p => read(p).split('\n');

describe('notification url consumers go through the rule (S-01)', () => {
  it('js/notifications.js navigates only to a url that safeNotifUrl returned', () => {
    const nav = lines('js/notifications.js').filter(l => l.includes('location.href ='));
    expect(nav.length).toBeGreaterThan(0);
    for (const l of nav) expect(l.trim()).toBe('if (url) window.location.href = url;');
    const decl = lines('js/notifications.js').filter(l => /\bconst url =/.test(l));
    expect(decl.length).toBeGreaterThan(0);
    for (const l of decl) expect(l).toContain('safeNotifUrl(');
  });
  it('js/notifications.js reads a notification url nowhere but inside safeNotifUrl()', () => {
    const raw = lines('js/notifications.js').filter(l => /\bn\.url\b|dataset\.url/.test(l));
    expect(raw.length).toBeGreaterThan(0);
    for (const l of raw) expect(l).toMatch(/safeNotifUrl\((n\.url|el\.dataset\.url)\)/);
  });
  it('the notification email builds its link through the rule', () => {
    const email = read('api/src/services/email.js');
    expect(email).not.toContain("startsWith('http')");
    expect(email).toContain('notificationLink(');
  });
  it('terms.html follows ?next= only through the rule, falling back to /pipeline.html', () => {
    const html = read('terms.html');
    const next = html.split('\n').filter(l => /^\s*next:/.test(l));
    expect(next).toHaveLength(1);
    expect(next[0]).toContain('notificationUrl(');
    expect(next[0]).toContain("'/pipeline.html'");
    expect(next[0]).not.toContain("get('next') ||");
    const moduleTag = html.indexOf('js/lib/notification-url.js?v=');
    expect(moduleTag).toBeGreaterThan(-1);
    expect(moduleTag).toBeLessThan(html.indexOf('Vue.createApp'));
  });
  it('every page that loads js/notifications.js loads js/lib/notification-url.js, with one ?v=', () => {
    const pages = readdirSync(process.cwd()).filter(f => /^[^/]+\.html$/.test(f));
    const versions = new Set();
    let withNotifications = 0;
    for (const p of pages) {
      const html = read(p);
      if (!html.includes('js/notifications.js')) continue;
      withNotifications++;
      const m = html.match(/js\/lib\/notification-url\.js\?v=(\d+)/);
      expect(m, p).not.toBeNull();
      versions.add(m[1]);
    }
    expect(withNotifications).toBeGreaterThan(0);
    expect([...versions]).toHaveLength(1);
  });
});
