import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'js/nav.js'), 'utf8');
const nav = new Function(src + `
return { initNav, buildNavHtml, navApplyTitles, navWireTooltips, navSetCollapsed, navRefreshAccount };`)();

const user = (over = {}) => ({ role: 'sysadmin', email: 'u@x.it', firstName: 'U', lastName: 'X',
  terms_version: 1, current_terms_version: 1, ...over });
const stubMedia = matches => { window.matchMedia = q => ({ matches, media: q }); };
const setRail = () => document.documentElement.setAttribute('data-sidebar', 'collapsed');

// Put the real nav markup in the page, titles as built (open layout), tooltips wired on it.
function mount(u = user()) {
  document.body.innerHTML = nav.buildNavHtml(u, 'pipeline');
  nav.navWireTooltips(document.body);
  return document.querySelector('.pd-nav');
}
const items = () => [...document.querySelectorAll('.pd-nav-item')];
const tip = () => document.getElementById('pd-tooltip');
const fire = (el, type, init = {}) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
const rect = (el, r) => { el.getBoundingClientRect = () => ({ left: 0, bottom: r.top + r.height, width: 68, ...r }); };

beforeEach(() => {
  document.documentElement.removeAttribute('data-sidebar');
  document.body.className = '';
  document.body.removeAttribute('style');
  document.body.innerHTML = '';
  globalThis.esc = s => String(s);
  localStorage.clear();
});
afterEach(() => { delete window.matchMedia; });

describe('markup carries the tooltip text and an accessible name', () => {
  it('gives every nav item data-tip = label and aria-label = label (the label span is hidden in the rail)', () => {
    mount();
    expect(items().length).toBeGreaterThan(3);
    for (const a of items()) {
      const label = a.querySelector('.pd-nav-label').textContent;
      expect(a.getAttribute('data-tip')).toBe(label);
      expect(a.getAttribute('aria-label')).toBe(label);
    }
  });
  it('tooltips the avatar with the email and the bell with "Notifications"', () => {
    mount();
    expect(document.getElementById('nav-account-btn').getAttribute('data-tip')).toBe('u@x.it');
    expect(document.getElementById('nav-notif-btn').getAttribute('data-tip')).toBe('Notifications');
  });
  it('falls back to "Account menu" for an account without an email', () => {
    mount(user({ email: '' }));
    expect(document.getElementById('nav-account-btn').getAttribute('data-tip')).toBe('Account menu');
  });
  it('keeps the native title on the items as built (open layout default)', () => {
    mount();
    for (const a of items()) expect(a.getAttribute('title')).toBe(a.getAttribute('data-tip'));
  });
});

describe('navApplyTitles', () => {
  it('removes the native title in the rail but keeps data-tip', () => {
    mount(); stubMedia(true); setRail();
    nav.navApplyTitles();
    for (const a of items()) {
      expect(a.hasAttribute('title')).toBe(false);
      expect(a.hasAttribute('data-tip')).toBe(true);
    }
  });
  it('restores the native title with the sidebar open and below 1024px', () => {
    mount(); stubMedia(true); setRail();
    nav.navApplyTitles();
    document.documentElement.removeAttribute('data-sidebar');
    nav.navApplyTitles();
    for (const a of items()) expect(a.getAttribute('title')).toBe(a.getAttribute('data-tip'));
    setRail(); stubMedia(false); // a small screen keeps the native title even with the stored rail state
    nav.navApplyTitles();
    for (const a of items()) expect(a.getAttribute('title')).toBe(a.getAttribute('data-tip'));
  });
  it('navSetCollapsed swaps the titles with the state', () => {
    mount(); stubMedia(true);
    nav.navSetCollapsed(true);
    expect(items()[0].hasAttribute('title')).toBe(false);
    nav.navSetCollapsed(false);
    expect(items()[0].getAttribute('title')).toBe(items()[0].getAttribute('data-tip'));
  });
});

describe('the custom tooltip (rail only)', () => {
  it('creates nothing until the first hover', () => {
    mount();
    expect(tip()).toBeNull();
  });
  it('shows to the right of the hovered item, vertically centred on it', () => {
    mount(); stubMedia(true); setRail();
    const a = items()[1];
    rect(a, { top: 100, height: 44, right: 68 });
    fire(a, 'mouseover');
    expect(tip()).not.toBeNull();
    expect(tip().textContent).toBe(a.getAttribute('data-tip'));
    expect(tip().classList.contains('show')).toBe(true);
    expect(tip().getAttribute('role')).toBe('tooltip');
    expect(tip().style.left).toBe('78px');   // right edge + 10px gap
    expect(tip().style.top).toBe('122px');   // top + height / 2 (CSS translates it up by half its own height)
    expect(tip().parentElement).toBe(document.body); // outside the scrolling items container, so it is never clipped
  });
  it('also shows on keyboard focus', () => {
    mount(); stubMedia(true); setRail();
    const a = items()[0];
    rect(a, { top: 10, height: 44, right: 68 });
    a.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(tip().classList.contains('show')).toBe(true);
  });
  it('also tooltips the Admin / Sysadmin entries: in the rail the group panels are permanent, label-less rows, not a flyout', () => {
    mount(); stubMedia(true); setRail();
    nav.navApplyTitles();
    const g = document.querySelector('.pd-nav-group-panel .pd-nav-item');
    expect(g).not.toBeNull();
    rect(g, { top: 300, height: 40, right: 68 });
    fire(g, 'mouseover');
    expect(tip().textContent).toBe(g.getAttribute('data-tip'));
    expect(tip().classList.contains('show')).toBe(true);
    expect(g.hasAttribute('title')).toBe(false);
  });
  it('tooltips the avatar (email) and the bell in the rail', () => {
    mount(); stubMedia(true); setRail();
    const av = document.getElementById('nav-account-btn');
    rect(av, { top: 700, height: 44, right: 60 });
    fire(av, 'mouseover');
    expect(tip().textContent).toBe('u@x.it');
    const bell = document.getElementById('nav-notif-btn');
    rect(bell, { top: 750, height: 36, right: 52 });
    fire(bell, 'mouseover');
    expect(tip().textContent).toBe('Notifications');
    expect(tip().style.top).toBe('768px');
  });
  it('never shows with the sidebar open or below 1024px (they keep the native title)', () => {
    mount();
    const a = items()[0];
    rect(a, { top: 10, height: 44, right: 240 });
    stubMedia(true); // open sidebar
    fire(a, 'mouseover');
    expect(tip()).toBeNull();
    stubMedia(false); setRail(); // small screen
    fire(a, 'mouseover');
    expect(tip()).toBeNull();
  });
  it('ignores elements without data-tip', () => {
    mount(); stubMedia(true); setRail();
    fire(document.querySelector('.pd-logo'), 'mouseover');
    expect(tip()).toBeNull();
  });
  describe('hiding', () => {
    let a;
    beforeEach(() => {
      mount(); stubMedia(true); setRail();
      a = items()[0];
      a.addEventListener('click', e => e.preventDefault()); // the item is a link: do not let jsdom navigate
      rect(a, { top: 10, height: 44, right: 68 });
      fire(a, 'mouseover');
      expect(tip().classList.contains('show')).toBe(true);
    });
    it('on mouseout to somewhere else', () => {
      fire(a, 'mouseout', { relatedTarget: document.body });
      expect(tip().classList.contains('show')).toBe(false);
    });
    it('not when the pointer only moves between the children of the same item', () => {
      fire(a.querySelector('.pd-nav-label'), 'mouseout', { relatedTarget: a });
      expect(tip().classList.contains('show')).toBe(true);
    });
    it('on focusout', () => {
      a.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      expect(tip().classList.contains('show')).toBe(false);
    });
    it('on Escape', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(tip().classList.contains('show')).toBe(false);
    });
    it('on click (opening the avatar or bell menu must not leave the tooltip on top of it)', () => {
      fire(a, 'click');
      expect(tip().classList.contains('show')).toBe(false);
    });
    it('when a Bootstrap dropdown opens', () => {
      a.dispatchEvent(new CustomEvent('show.bs.dropdown', { bubbles: true }));
      expect(tip().classList.contains('show')).toBe(false);
    });
    it('when the items container scrolls', () => {
      document.querySelector('.pd-nav-items').dispatchEvent(new Event('scroll'));
      expect(tip().classList.contains('show')).toBe(false);
    });
    it('on window resize (it was positioned once, from the old geometry)', () => {
      window.dispatchEvent(new Event('resize'));
      expect(tip().classList.contains('show')).toBe(false);
    });
    it('when navSetCollapsed is called programmatically (not only through the collapse button)', () => {
      nav.navSetCollapsed(false);
      expect(tip().classList.contains('show')).toBe(false);
    });
    it('when the hovered element leaves the DOM (navigation re-rendered under the pointer)', async () => {
      a.remove();
      await new Promise(r => setTimeout(r, 0)); // MutationObserver callbacks are asynchronous
      expect(tip().classList.contains('show')).toBe(false);
    });
    it('not when an unrelated element leaves the DOM', async () => {
      document.querySelector('.pd-logo').remove();
      await new Promise(r => setTimeout(r, 0));
      expect(tip().classList.contains('show')).toBe(true);
    });
    it('reuses one element for later hovers', () => {
      fire(a, 'mouseout', { relatedTarget: document.body });
      fire(items()[1], 'mouseover');
      expect(document.querySelectorAll('#pd-tooltip').length).toBe(1);
      expect(tip().classList.contains('show')).toBe(true);
    });
  });
  it('re-applies the titles when the 1024px query changes (rail <-> small)', () => {
    mount(); setRail();
    let handler;
    window.matchMedia = q => ({ matches: true, media: q, addEventListener: (t, h) => { handler = h; } });
    nav.navWireTooltips(document.body);
    nav.navApplyTitles();
    expect(items()[0].hasAttribute('title')).toBe(false);
    stubMedia(false);
    handler();
    expect(items()[0].getAttribute('title')).toBe(items()[0].getAttribute('data-tip'));
  });
});

describe('navRefreshAccount keeps the avatar tooltip in step', () => {
  it('updates data-tip with the new email, and falls back when it is empty', () => {
    mount();
    nav.navRefreshAccount({ firstName: 'Zed', lastName: 'Yu', email: 'new@x.it' });
    expect(document.getElementById('nav-account-btn').getAttribute('data-tip')).toBe('new@x.it');
    nav.navRefreshAccount({ firstName: 'Zed', lastName: 'Yu', email: '' });
    expect(document.getElementById('nav-account-btn').getAttribute('data-tip')).toBe('Account menu');
  });
});

describe('initNav integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app-shell"><div id="nav-container"></div><div id="app-main"></div></div>';
    globalThis.Api = { auth: { me: async () => user() } };
  });
  it('starts in the rail without native titles and with the tooltip wired', async () => {
    stubMedia(true); setRail();
    await nav.initNav('pipeline');
    const a = items()[0];
    expect(a.hasAttribute('title')).toBe(false);
    rect(a, { top: 90, height: 44, right: 68 });
    fire(a, 'mouseover');
    expect(tip().textContent).toBe(a.getAttribute('data-tip'));
  });
  it('starts with the sidebar open keeping the native titles and no tooltip', async () => {
    stubMedia(true);
    await nav.initNav('pipeline');
    expect(items()[0].getAttribute('title')).toBe(items()[0].getAttribute('data-tip'));
    fire(items()[0], 'mouseover');
    expect(tip()).toBeNull();
  });
  it('the collapse button switches titles and tooltip behaviour at once', async () => {
    stubMedia(true);
    await nav.initNav('pipeline');
    document.getElementById('nav-collapse-btn').click();
    expect(items()[0].hasAttribute('title')).toBe(false);
    rect(items()[0], { top: 90, height: 44, right: 68 });
    fire(items()[0], 'mouseover');
    expect(tip().classList.contains('show')).toBe(true);
    document.getElementById('nav-collapse-btn').click(); // expanding hides it and restores the titles
    expect(tip().classList.contains('show')).toBe(false);
    expect(items()[0].getAttribute('title')).toBe(items()[0].getAttribute('data-tip'));
  });
});
