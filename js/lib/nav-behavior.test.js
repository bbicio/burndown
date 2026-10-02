import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'js/nav.js'), 'utf8');
const nav = new Function(src + `
return { initNav, navLayout, navSetCollapsed, navSyncCollapseButton, navPopperConfig,
         navWireGroups, navRefreshAccount, buildNavHtml };`)();
const EMOJI = /(?![©®™])\p{Extended_Pictographic}/u; // © is "pictographic" in Unicode but is the copyright sign, not an emoji

const user = (role = 'sysadmin') => ({ role, email: 'u@x.it', firstName: 'U', lastName: 'X', terms_version: 1, current_terms_version: 1 });
const stubMedia = matches => { window.matchMedia = q => ({ matches, media: q }); };

beforeEach(() => {
  document.documentElement.removeAttribute('data-sidebar');
  document.body.className = '';
  document.body.removeAttribute('style');
  document.body.innerHTML = '<div id="app-shell"><div id="nav-container"></div><div id="app-main"><div id="app"></div></div></div>';
  globalThis.esc = s => String(s);
  globalThis.Api = { auth: { me: async () => user() } };
  localStorage.clear();
});
afterEach(() => { delete window.matchMedia; vi.restoreAllMocks(); });

describe('navLayout', () => {
  it('is small below 1024px, open on a wide screen, rail when collapsed', () => {
    stubMedia(false);
    expect(nav.navLayout()).toBe('small');
    stubMedia(true);
    expect(nav.navLayout()).toBe('open');
    document.documentElement.setAttribute('data-sidebar', 'collapsed');
    expect(nav.navLayout()).toBe('rail');
  });
  it('does not throw without matchMedia (treated as open)', () => {
    delete window.matchMedia;
    expect(nav.navLayout()).toBe('open');
  });
});

describe('navPopperConfig', () => {
  const defaults = { placement: 'bottom-start', modifiers: [{ name: 'offset', options: { offset: [0, 2] } }, { name: 'x' }] };
  const byName = (cfg, n) => cfg.modifiers.find(m => m.name === n);
  it('opens below the avatar/bell, right-aligned, on small screens', () => {
    stubMedia(false);
    const cfg = nav.navPopperConfig(defaults);
    expect(cfg.placement).toBe('bottom-end');
    expect(byName(cfg, 'flip').enabled).toBe(true);
    expect(byName(cfg, 'preventOverflow').options.padding).toBe(10);
  });
  it('opens to the right of the sidebar/rail on large screens, without flipping', () => {
    stubMedia(true);
    const cfg = nav.navPopperConfig(defaults);
    expect(cfg.placement).toBe('right-end');
    expect(byName(cfg, 'flip').enabled).toBe(false);
    expect(byName(cfg, 'offset').options.offset).toEqual([0, 10]);
    expect(byName(cfg, 'x')).toBeTruthy();
  });
  it('accepts the defaults as first or second argument (Bootstrap passes them either way)', () => {
    stubMedia(true);
    expect(nav.navPopperConfig(undefined, defaults).placement).toBe('right-end');
    expect(nav.navPopperConfig().placement).toBe('right-end');
  });
});

describe('navSetCollapsed', () => {
  beforeEach(() => { document.body.insertAdjacentHTML('beforeend', '<button id="nav-collapse-btn"></button>'); });
  it('sets the attribute and the key, and updates the button', () => {
    nav.navSetCollapsed(true);
    expect(document.documentElement.getAttribute('data-sidebar')).toBe('collapsed');
    expect(localStorage.getItem('PDash_sidebarCollapsed')).toBe('1');
    const b = document.getElementById('nav-collapse-btn');
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(b.getAttribute('aria-label')).toBe('Expand sidebar');
  });
  it('removes the attribute and the key when expanding', () => {
    nav.navSetCollapsed(true);
    nav.navSetCollapsed(false);
    expect(document.documentElement.hasAttribute('data-sidebar')).toBe(false);
    expect(localStorage.getItem('PDash_sidebarCollapsed')).toBeNull();
    expect(document.getElementById('nav-collapse-btn').getAttribute('aria-label')).toBe('Collapse sidebar');
  });
  it('does not throw when localStorage throws, and still toggles the attribute', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => nav.navSetCollapsed(true)).not.toThrow();
    expect(document.documentElement.getAttribute('data-sidebar')).toBe('collapsed');
    expect(() => nav.navSetCollapsed(false)).not.toThrow();
    expect(document.documentElement.hasAttribute('data-sidebar')).toBe(false);
  });
});

describe('navWireGroups', () => {
  let toggles, groups;
  beforeEach(() => {
    document.body.innerHTML = nav.buildNavHtml(user('sysadmin'), 'pipeline');
    nav.navWireGroups(document.body);
    toggles = [...document.querySelectorAll('.pd-nav-group-toggle')];
    groups = [...document.querySelectorAll('.pd-nav-group')];
  });
  const isOpen = g => g.classList.contains('open');
  it('opens a group on tap and reflects it in aria-expanded', () => {
    toggles[0].click();
    expect(isOpen(groups[0])).toBe(true);
    expect(toggles[0].getAttribute('aria-expanded')).toBe('true');
    toggles[0].click();
    expect(isOpen(groups[0])).toBe(false);
    expect(toggles[0].getAttribute('aria-expanded')).toBe('false');
  });
  it('keeps only one group open at a time', () => {
    toggles[0].click();
    toggles[1].click();
    expect(groups.map(isOpen)).toEqual([false, true]);
    expect(toggles[0].getAttribute('aria-expanded')).toBe('false');
  });
  it('closes on Escape and on a tap outside the groups, not on a tap inside the panel', () => {
    toggles[0].click();
    document.querySelector('.pd-nav-group-panel .pd-nav-item').addEventListener('click', e => e.preventDefault());
    document.querySelector('.pd-nav-group-panel .pd-nav-item').click();
    expect(isOpen(groups[0])).toBe(true);
    document.body.click();
    expect(isOpen(groups[0])).toBe(false);
    toggles[1].click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(groups.map(isOpen)).toEqual([false, false]);
  });
});

describe('navRefreshAccount', () => {
  it('rewrites initials and email from the updated user (camelCase or snake_case)', () => {
    document.body.innerHTML = '<span id="nav-avatar">AB</span><span id="nav-account-email">old@x.it</span>';
    nav.navRefreshAccount({ firstName: 'Zed', lastName: 'Yu', email: 'new@x.it' });
    expect(document.getElementById('nav-avatar').textContent).toBe('ZY');
    expect(document.getElementById('nav-account-email').textContent).toBe('new@x.it');
    nav.navRefreshAccount({ first_name: 'Ada', last_name: 'Lo', email: 'a@x.it' });
    expect(document.getElementById('nav-avatar').textContent).toBe('AL');
  });
  it('does not throw when the account markup is absent', () => {
    document.body.innerHTML = '';
    expect(() => nav.navRefreshAccount({ email: 'a@x.it' })).not.toThrow();
  });
});

describe('initNav integration', () => {
  it('renders the aside into #nav-container, wires the 5 account entries and the collapse button', async () => {
    await nav.initNav('pipeline', { breadcrumbs: [{ label: 'Home' }, { label: 'Pipeline' }] });
    const c = document.getElementById('nav-container');
    expect(c.querySelector('aside.pd-nav')).not.toBeNull();
    expect(document.getElementById('nav-avatar').textContent).toBe('UX');
    expect(c.querySelectorAll('.pd-account-menu .dropdown-item').length).toBe(5);
    document.getElementById('nav-collapse-btn').click();
    expect(document.documentElement.getAttribute('data-sidebar')).toBe('collapsed');
    document.getElementById('nav-collapse-btn').click();
    expect(document.documentElement.hasAttribute('data-sidebar')).toBe(false);
  });
  it('syncs the collapse button with a state already set by the head snippet', async () => {
    document.documentElement.setAttribute('data-sidebar', 'collapsed');
    await nav.initNav('pipeline');
    expect(document.getElementById('nav-collapse-btn').getAttribute('aria-expanded')).toBe('false');
  });
  it('injects no footer and adds no body padding', async () => {
    await nav.initNav('pipeline');
    expect(document.getElementById('app-footer')).toBeNull();
    expect(document.querySelector('footer')).toBeNull();
    expect(document.body.style.paddingBottom).toBe('');
  });
  it('has no emoji in the navigation or in the three modal titles', async () => {
    await nav.initNav('pipeline');
    expect(document.getElementById('nav-container').innerHTML).not.toMatch(EMOJI);
    for (const id of ['navChangePwdModal', 'navProfileModal', 'sendNotifModal']) {
      const title = document.querySelector(`#${id} .modal-title`);
      expect(title.textContent).not.toMatch(EMOJI);
      expect(title.querySelector('svg.nav-icon'), id).not.toBeNull();
    }
  });
  it('returns null and renders nothing when the user is not authenticated', async () => {
    globalThis.Api = { auth: { me: async () => { throw new Error('401'); } } };
    expect(await nav.initNav('pipeline')).toBeNull();
    expect(document.getElementById('nav-container').innerHTML).toBe('');
  });
});
