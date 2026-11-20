import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { notificationUrl } from './notification-url.js';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'js/notifications.js'), 'utf8');
const n = new Function(src + '\nreturn { updateBadge, refreshBrowserNotifBanner, renderNotifItem, safeNotifUrl };')();

beforeEach(() => {
  document.body.innerHTML =
    '<button id="nav-notif-btn" class="pd-bell-btn"><span id="nav-notif-badge" style="display:none"></span></button>';
});
const btn = () => document.getElementById('nav-notif-btn');
const badge = () => document.getElementById('nav-notif-badge');

describe('updateBadge', () => {
  it('shows the count and marks the bell unread', () => {
    n.updateBadge(3);
    expect(badge().textContent).toBe('3');
    expect(badge().style.display).toBe('');
    expect(btn().classList.contains('has-unread')).toBe(true);
  });
  it('caps at 99+', () => {
    n.updateBadge(150);
    expect(badge().textContent).toBe('99+');
  });
  it('hides the badge and clears the unread look at 0 (mark all read, or a negative count)', () => {
    n.updateBadge(2);
    n.updateBadge(0);
    expect(badge().style.display).toBe('none');
    expect(btn().classList.contains('has-unread')).toBe(false);
    n.updateBadge(2);
    n.updateBadge(-1);
    expect(btn().classList.contains('has-unread')).toBe(false);
  });
  it('does not throw when only the badge exists', () => {
    document.body.innerHTML = '<span id="nav-notif-badge"></span>';
    expect(() => n.updateBadge(1)).not.toThrow();
  });
});

describe('desktop-notification banner icon', () => {
  it('uses an SVG icon (no emoji, no textContent) when the helper is available', () => {
    globalThis.navIcon = name => `<svg class="nav-icon" data-name="${name}"></svg>`;
    globalThis.Notification = { permission: 'default' };
    globalThis.getBrowserNotifBannerState = () => ({ visible: true, label: 'Enable' });
    document.body.innerHTML =
      '<div id="nav-notif-browser-banner"></div><span id="nav-notif-browser-label"></span><button id="nav-notif-browser-enable"></button>';
    n.refreshBrowserNotifBanner();
    const label = document.getElementById('nav-notif-browser-label');
    expect(label.querySelector('svg.nav-icon')).not.toBeNull();
    expect(label.textContent).toContain('Enable desktop notifications?');
    expect(label.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    globalThis.getBrowserNotifBannerState = () => ({ visible: true, label: 'Disable' });
    n.refreshBrowserNotifBanner();
    expect(label.textContent).toContain('Desktop notifications on');
    expect(label.querySelector('svg.nav-icon')).not.toBeNull();
  });
  it('still renders the text when the icon helper is missing', () => {
    delete globalThis.navIcon;
    globalThis.Notification = { permission: 'default' };
    globalThis.getBrowserNotifBannerState = () => ({ visible: true, label: 'Enable' });
    document.body.innerHTML =
      '<div id="nav-notif-browser-banner"></div><span id="nav-notif-browser-label"></span><button id="nav-notif-browser-enable"></button>';
    n.refreshBrowserNotifBanner();
    expect(document.getElementById('nav-notif-browser-label').textContent).toContain('Enable desktop notifications?');
  });
});

describe('notification url (S-01)', () => {
  const row = url => ({ id: 'a', title: 't', created_at: new Date().toISOString(), url });
  beforeEach(() => { globalThis.notificationUrl = notificationUrl; });

  it('renders no link and no data-url for a javascript: url', () => {
    const html = n.renderNotifItem(row('javascript:alert(1)'));
    expect(html).not.toContain('href=');
    expect(html).not.toContain('data-url');
  });
  it('renders no link for a url on another origin', () => {
    const html = n.renderNotifItem(row('http://evil.com/x'));
    expect(html).not.toContain('href=');
    expect(html).not.toContain('data-url');
  });
  it('renders the link and data-url for a path on the app', () => {
    const html = n.renderNotifItem(row('/pipeline.html'));
    expect(html).toContain('href="/pipeline.html"');
    expect(html).toContain('data-url="/pipeline.html"');
  });
  it('keeps an absolute url on the page origin', () => {
    const url = location.origin + '/pipeline.html';
    expect(n.renderNotifItem(row(url))).toContain('href="' + url + '"');
  });
  it('safeNotifUrl re-checks a data-url value that was altered after the render', () => {
    expect(n.safeNotifUrl('javascript:alert(1)')).toBeNull();
    expect(n.safeNotifUrl('/costgrid.html?cgId=1')).toBe('/costgrid.html?cgId=1');
  });
  it('safeNotifUrl gives no url when the module is not loaded', () => {
    delete globalThis.notificationUrl;
    expect(n.safeNotifUrl('/pipeline.html')).toBeNull();
    expect(n.renderNotifItem(row('/pipeline.html'))).not.toContain('href=');
  });
});

// CSP cycle 8: script-src has no 'unsafe-inline', so the link cannot carry onclick="event.stopPropagation()";
// the item's own listener leaves a click on its link to the link.
describe('the notification link under the CSP', () => {
  const row = { id: 'a', title: 't', created_at: new Date().toISOString(), url: '/pipeline.html', read_at: null };
  beforeEach(() => { globalThis.notificationUrl = notificationUrl; });

  it('renders the link without an inline handler', () => {
    expect(n.renderNotifItem(row)).not.toMatch(/\son[a-z]+=/i);
  });

  it('a click on the link does not mark the item read', async () => {
    const calls = [];
    globalThis.apiFetch = async (path, opts) => { calls.push([path, opts?.method ?? 'GET']); return path === '/notifications' ? [row] : {}; };
    document.body.innerHTML = '<div id="nav-notif-list"></div><span id="nav-notif-badge">1</span>';
    const r = new Function(src + '\nreturn { renderNotifications };')();
    await r.renderNotifications();
    const link = document.querySelector('.notif-item a');
    link.addEventListener('click', e => e.preventDefault());
    link.click();
    await new Promise(ok => setTimeout(ok, 0));
    expect(calls).toEqual([['/notifications', 'GET']]);
    expect(document.querySelector('.notif-item').classList.contains('unread')).toBe(true);
    delete globalThis.apiFetch;
  });
});

// Save contract cycle 7: read state and the badge follow the server's answer.
describe('marking read follows the server', () => {
  let calls, outcome, count, fakeWin, m;
  const rows = () => [...document.querySelectorAll('.notif-item')];
  beforeEach(() => {
    calls = [];
    outcome = { kind: 'ok' };
    count = 2;
    fakeWin = {
      apiSave: async (method, path, body, opts) => { calls.push([method, path, opts]); return outcome; },
      location: { origin: 'http://localhost', href: '' },
      notificationUrl,
    };
    globalThis.apiFetch = async path => (path === '/notifications/unread-count' ? { count } : []);
    document.body.innerHTML =
      '<button id="nav-notif-btn"><span id="nav-notif-badge">2</span></button><div id="nav-notif-list">' +
      '<div class="notif-item unread" data-id="a" data-url="/pipeline.html"></div>' +
      '<div class="notif-item unread" data-id="b"></div></div>';
    m = new Function('window', src + '\nreturn { markAllRead, markOneRead, renderNotifications };')(fakeWin);
  });

  it('markAllRead ok hides the badge and clears every unread row', async () => {
    await m.markAllRead();
    expect(calls[0]).toEqual(['PATCH', '/notifications/read-all', { background: true }]);
    expect(badge().style.display).toBe('none');
    expect(rows().some(r => r.classList.contains('unread'))).toBe(false);
  });

  for (const kind of ['error', 'unknown']) {
    it(`markAllRead ${kind} keeps the rows unread and rereads the count`, async () => {
      outcome = { kind };
      count = 2;
      await m.markAllRead();
      expect(rows().every(r => r.classList.contains('unread'))).toBe(true);
      expect(badge().textContent).toBe('2');
      count = 5;
      await m.markAllRead();
      expect(badge().textContent).toBe('5');
    });
  }

  it('markOneRead ok clears the row and lowers the badge', async () => {
    await m.markOneRead(rows()[1]);
    expect(calls[0][1]).toBe('/notifications/b/read');
    expect(rows()[1].classList.contains('unread')).toBe(false);
    expect(badge().textContent).toBe('1');
  });

  it('markOneRead error keeps the row unread and rereads the count', async () => {
    outcome = { kind: 'error' };
    count = 7;
    await m.markOneRead(rows()[1]);
    expect(rows()[1].classList.contains('unread')).toBe(true);
    expect(badge().textContent).toBe('7');
  });

  it('two concurrent markOneRead calls on one row write once and lower the badge once', async () => {
    await Promise.all([m.markOneRead(rows()[1]), m.markOneRead(rows()[1])]);
    expect(calls.length).toBe(1);
    expect(badge().textContent).toBe('1');
  });

  it('a click on a notification with a url navigates even when the PATCH failed', async () => {
    outcome = { kind: 'error' };
    globalThis.apiFetch = async path => (path === '/notifications'
      ? [{ id: 'a', title: 't', created_at: new Date().toISOString(), url: '/pipeline.html', read_at: null }]
      : { count: 1 });
    await m.renderNotifications();
    document.querySelector('.notif-item').click();
    await new Promise(ok => setTimeout(ok, 0));
    expect(fakeWin.location.href).toBe('/pipeline.html');
    expect(document.querySelector('.notif-item').classList.contains('unread')).toBe(true);
  });
});
