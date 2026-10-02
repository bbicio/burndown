import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'js/nav.js'), 'utf8');
const nav = new Function(src + '\nreturn { NAV_MAIN, NAV_GROUPS, navIcon, navInitials, buildNavHtml };')();
const EMOJI = /(?![©®™])\p{Extended_Pictographic}/u; // © is "pictographic" in Unicode but is the copyright sign, not an emoji

beforeEach(() => { globalThis.esc = s => String(s); });

const build = (role, tab = 'pipeline') => {
  const d = document.createElement('div');
  d.innerHTML = nav.buildNavHtml({ role, email: 'a@b.it', firstName: 'A', lastName: 'B' }, tab);
  return d;
};
const labels = el => [...el.querySelectorAll('.pd-nav-item .pd-nav-label')].map(n => n.textContent);

describe('navIcon', () => {
  it('returns a decorative currentColor svg with the size class', () => {
    const d = document.createElement('div');
    d.innerHTML = nav.navIcon('bell', 'md');
    const svg = d.firstElementChild;
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('viewBox')).toBe('0 0 16 16');
    expect(svg.classList.contains('nav-icon-md')).toBe(true);
    expect(svg.innerHTML).toContain('currentColor');
  });
  it('defaults to the sm size and returns an empty string for an unknown name', () => {
    expect(nav.navIcon('user')).toContain('nav-icon-sm');
    expect(nav.navIcon('nope')).toBe('');
  });
  it('defines every icon the navigation uses', () => {
    for (const n of ['pipeline', 'portfolio', 'planning', 'config', 'timesheets', 'user', 'team', 'tag',
      'dbreset', 'terms', 'notify', 'key', 'signout', 'bell', 'lock', 'chevronLeft', 'chevronRight']) {
      expect(nav.navIcon(n), n).not.toBe('');
    }
  });
});

describe('navInitials', () => {
  it('uses first + last initial, uppercased', () => {
    expect(nav.navInitials({ firstName: 'fabrizio', lastName: 'fortini' })).toBe('FF');
  });
  it('accepts the snake_case keys too', () => {
    expect(nav.navInitials({ first_name: 'Ada', last_name: 'Lovelace' })).toBe('AL');
  });
  it('falls back to a single name, then to the email letter, then to ?', () => {
    expect(nav.navInitials({ firstName: 'Ada' })).toBe('A');
    expect(nav.navInitials({ email: 'zed@x.it' })).toBe('Z');
    expect(nav.navInitials({})).toBe('?');
  });
});

describe('buildNavHtml', () => {
  it('user: 3 destinations, no group, no separator', () => {
    const el = build('user');
    expect(labels(el)).toEqual(['Pipeline', 'Portfolio', 'Planning']);
    expect(el.querySelector('.pd-nav-group')).toBeNull();
    expect(el.querySelector('.pd-nav-sep')).toBeNull();
  });
  it('admin: Admin group with the 5 entries, no Sysadmin group', () => {
    const el = build('admin');
    expect([...el.querySelectorAll('[data-group="admin"] .pd-nav-item .pd-nav-label')].map(n => n.textContent))
      .toEqual(['Master Data', 'Timesheets', 'User Admin', 'Team', 'Attribute Lists']);
    expect(el.querySelector('[data-group="sysadmin"]')).toBeNull();
  });
  it('sysadmin: both groups, Sysadmin has DB Reset and Terms & Conditions', () => {
    const el = build('sysadmin');
    expect([...el.querySelectorAll('[data-group="sysadmin"] .pd-nav-item .pd-nav-label')].map(n => n.textContent))
      .toEqual(['DB Reset', 'Terms & Conditions']);
    expect(el.querySelectorAll('.pd-nav-group').length).toBe(2);
  });
  it('marks exactly one item active and activates the group trigger of an admin page', () => {
    const el = build('sysadmin', 'team');
    const act = el.querySelectorAll('.pd-nav-item.active');
    expect(act.length).toBe(1);
    expect(act[0].getAttribute('href')).toBe('/team.html');
    expect(el.querySelector('[data-group="admin"] .pd-nav-group-toggle').classList.contains('active')).toBe(true);
    expect(el.querySelector('[data-group="sysadmin"] .pd-nav-group-toggle').classList.contains('active')).toBe(false);
  });
  it('an unknown or out-of-menu activeTab (settings) highlights nothing and does not throw', () => {
    const el = build('sysadmin', 'settings');
    expect(el.querySelector('.pd-nav-item.active')).toBeNull();
    expect(el.querySelector('.pd-nav-group-toggle.active')).toBeNull();
  });
  it('profile-jobs passes "timesheets": the Timesheets entry is active', () => {
    const el = build('admin', 'timesheets');
    expect(el.querySelector('.pd-nav-item.active').getAttribute('href')).toBe('/timesheets.html');
  });
  it('keeps every existing element id', () => {
    const el = build('user');
    for (const id of ['nav-notif-btn', 'nav-notif-badge', 'navNotifWrapper', 'nav-notif-list', 'nav-notif-read-all',
      'nav-notif-browser-banner', 'nav-notif-browser-label', 'nav-notif-browser-enable', 'nav-account-btn',
      'nav-profile-btn', 'nav-settings-btn', 'nav-send-notif-btn', 'nav-change-pwd-btn', 'nav-logout-btn']) {
      expect(el.querySelector('#' + id), id).not.toBeNull();
    }
  });
  it('shows initials and email in the account button, and the copyright line', () => {
    const el = build('user');
    expect(el.querySelector('#nav-avatar').textContent).toBe('AB');
    expect(el.querySelector('#nav-account-email').textContent).toBe('a@b.it');
    expect(el.querySelector('.pd-copyright').textContent).toContain('2026 PDash');
  });
  it('contains no emoji', () => {
    expect(build('sysadmin').innerHTML).not.toMatch(EMOJI);
  });
  it('has the three direct children brand / items / actions', () => {
    const aside = build('user').firstElementChild;
    expect([...aside.children].map(c => c.className)).toEqual(['pd-nav-brand', 'pd-nav-items', 'pd-nav-actions']);
  });
});
