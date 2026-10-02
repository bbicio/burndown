import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'js/notifications.js'), 'utf8');
const n = new Function(src + '\nreturn { updateBadge, refreshBrowserNotifBanner };')();

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
