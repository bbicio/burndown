import { describe, it, expect, afterEach, vi } from 'vitest';
import { MD_SECTIONS, SUBNAV_SETS, mdSubnavHtml, mountMdSubnav, setSubnavBadge } from './md-subnav.js';

const parse = html => { const d = document.createElement('div'); d.innerHTML = html; return d; };

describe('MD_SECTIONS', () => {
  it('lists the two groups and four sections in order', () => {
    expect(MD_SECTIONS).toEqual([
      { group: 'COMMERCIAL', items: [
        { id: 'clients', label: 'Clients & groups', href: '/master-clients.html' },
        { id: 'pipelines', label: 'Pipelines & POTs', href: '/master-pipelines.html' },
      ] },
      { group: 'FINANCIAL', items: [
        { id: 'roles', label: 'Roles & rates', href: '/master-roles.html' },
        { id: 'currencies', label: 'Currencies', href: '/master-currencies.html' },
      ] },
    ]);
  });
});

describe('mdSubnavHtml', () => {
  it('renders the grouped list with the active item marked', () => {
    const d = parse(mdSubnavHtml('roles'));
    expect([...d.querySelectorAll('.md-subnav-group')].map(g => g.textContent)).toEqual(['COMMERCIAL', 'FINANCIAL']);
    expect([...d.querySelectorAll('a.md-subnav-item')].map(a => a.getAttribute('href'))).toEqual(
      ['/master-clients.html', '/master-pipelines.html', '/master-roles.html', '/master-currencies.html']);
    const cur = d.querySelectorAll('[aria-current="page"]');
    expect(cur).toHaveLength(1);
    expect(cur[0].getAttribute('href')).toBe('/master-roles.html');
    expect(cur[0].classList.contains('active')).toBe(true);
  });

  it.each([
    ['clients', '/master-clients.html'],
    ['pipelines', '/master-pipelines.html'],
    ['roles', '/master-roles.html'],
    ['currencies', '/master-currencies.html'],
  ])('marks exactly one item active for %s', (id, href) => {
    const d = parse(mdSubnavHtml(id));
    const active = d.querySelectorAll('a.md-subnav-item.active');
    expect(active).toHaveLength(1);
    expect(active[0].getAttribute('href')).toBe(href);
    expect(d.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(d.querySelector('option[selected]').value).toBe(href);
  });

  it('marks nothing for an unknown id', () => {
    const d = parse(mdSubnavHtml('nope'));
    expect(d.querySelector('[aria-current]')).toBeNull();
    expect(d.querySelector('.active')).toBeNull();
    expect(d.querySelector('option[selected]')).toBeNull();
  });

  it('escapes the ampersand in labels', () => {
    const html = mdSubnavHtml('clients');
    expect(html).toContain('Clients &amp; groups');
    expect(html).not.toContain('Clients & groups');
    expect(parse(html).querySelector('a.md-subnav-item').textContent).toBe('Clients & groups');
  });

  it('renders the phone selector with grouped options', () => {
    const d = parse(mdSubnavHtml('clients'));
    expect(d.querySelector('.md-subnav-select-group').textContent).toBe('COMMERCIAL');
    expect(d.querySelector('.md-subnav-select-label').textContent).toBe('Clients & groups');
    expect(d.querySelector('.md-subnav-select svg.md-subnav-select-chevron')).not.toBeNull();
    const sel = d.querySelector('select.md-subnav-select-input');
    expect(sel.getAttribute('aria-label')).toBe('Master Data section');
    expect([...sel.querySelectorAll('optgroup')].map(g => g.getAttribute('label'))).toEqual(['COMMERCIAL', 'FINANCIAL']);
    expect([...sel.querySelectorAll('option')].map(o => o.value)).toEqual(
      ['/master-clients.html', '/master-pipelines.html', '/master-roles.html', '/master-currencies.html']);
    expect(sel.querySelector('option[selected]').value).toBe('/master-clients.html');
  });
});

describe('mountMdSubnav', () => {
  afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

  it('fills a nav carrying data-md-active and leaves others alone', () => {
    document.body.innerHTML = '<nav class="md-subnav" data-md-active="pipelines"></nav><nav class="md-subnav" id="bare"></nav>';
    mountMdSubnav(document);
    expect(document.querySelector('nav[data-md-active]').innerHTML).toBe(parse(mdSubnavHtml('pipelines')).innerHTML);
    expect(document.getElementById('bare').innerHTML).toBe('');
  });

  it('navigates to the chosen section on change', () => {
    const loc = { href: '/master-pipelines.html' };
    vi.stubGlobal('location', loc);
    document.body.innerHTML = '<nav class="md-subnav" data-md-active="pipelines"></nav>';
    mountMdSubnav(document);
    const sel = document.querySelector('select.md-subnav-select-input');
    sel.value = '/master-currencies.html';
    sel.dispatchEvent(new Event('change'));
    expect(loc.href).toBe('/master-currencies.html');
  });

  it('puts the select back on the current section when the page is shown again', () => {
    document.body.innerHTML = '<nav class="md-subnav" data-md-active="pipelines"></nav>';
    mountMdSubnav(document);
    const sel = document.querySelector('select.md-subnav-select-input');
    sel.value = '/master-currencies.html';
    window.dispatchEvent(new Event('pageshow'));
    expect(sel.value).toBe('/master-pipelines.html');
  });

  it('survives pageshow with no current section and does not stack listeners on a remount', () => {
    document.body.innerHTML = '<nav class="md-subnav" data-md-active="nope"></nav>';
    mountMdSubnav(document);
    mountMdSubnav(document);
    expect(() => window.dispatchEvent(new Event('pageshow'))).not.toThrow();
    expect(document.querySelectorAll('select.md-subnav-select-input')).toHaveLength(1);
  });
});

describe('SUBNAV_SETS', () => {
  it('keeps Master Data as the default set and adds the Timesheets set', () => {
    expect(SUBNAV_SETS.masterData).toEqual({ label: 'Master Data', sections: MD_SECTIONS });
    expect(SUBNAV_SETS.timesheets).toEqual({ label: 'Timesheets', sections: [
      { group: 'TIMESHEETS', items: [
        { id: 'actuals', label: 'Actuals', href: '/timesheets.html' },
        { id: 'profileJobs', label: 'Profile processing', href: '/profile-jobs.html' },
      ] },
    ] });
  });

  it('renders the Timesheets set with its own group, active item and select label', () => {
    const d = parse(mdSubnavHtml('profileJobs', 'timesheets'));
    expect([...d.querySelectorAll('.md-subnav-group')].map(g => g.textContent)).toEqual(['TIMESHEETS']);
    const active = d.querySelectorAll('a.md-subnav-item.active');
    expect(active).toHaveLength(1);
    expect(active[0].getAttribute('href')).toBe('/profile-jobs.html');
    expect(d.querySelector('select.md-subnav-select-input').getAttribute('aria-label')).toBe('Timesheets section');
    expect(d.querySelector('.md-subnav-select-label').textContent).toBe('Profile processing');
  });

  it('falls back to Master Data for an unknown set', () => {
    expect(mdSubnavHtml('roles', 'nope')).toBe(mdSubnavHtml('roles'));
  });
});

describe('mountMdSubnav with data-subnav-set', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('renders the set named on the nav', () => {
    document.body.innerHTML = '<nav class="md-subnav" data-subnav-set="timesheets" data-md-active="actuals"></nav>';
    mountMdSubnav(document);
    expect(document.querySelector('nav').innerHTML).toBe(parse(mdSubnavHtml('actuals', 'timesheets')).innerHTML);
  });
});

describe('setSubnavBadge', () => {
  afterEach(() => { document.body.innerHTML = ''; });
  const mount = active => {
    document.body.innerHTML = '<nav class="md-subnav" data-subnav-set="timesheets" data-md-active="' + active + '"></nav>';
    mountMdSubnav(document);
  };
  const item = () => document.querySelector('a.md-subnav-item[href="/profile-jobs.html"]');

  it('shows the count on the item and "N queued" on the phone selector', () => {
    mount('actuals');
    setSubnavBadge('profileJobs', 3, '3 project codes waiting for profile processing');
    const b = item().querySelector('.md-subnav-badge');
    expect(b.textContent).toBe('3');
    expect(b.getAttribute('title')).toBe('3 project codes waiting for profile processing');
    expect(document.querySelectorAll('.md-subnav-select-badge')).toHaveLength(1);
    expect(document.querySelector('.md-subnav-select-badge').textContent).toBe('3 queued');
  });

  it('accepts a numeric string and updates in place', () => {
    mount('profileJobs');
    setSubnavBadge('profileJobs', 3);
    setSubnavBadge('profileJobs', '5');
    expect(item().querySelectorAll('.md-subnav-badge')).toHaveLength(1);
    expect(item().querySelector('.md-subnav-badge').textContent).toBe('5');
    expect(document.querySelector('.md-subnav-select-badge').textContent).toBe('5 queued');
  });

  it.each([0, -1, undefined, 'x', null, 2.5])('hides the badge for %s', v => {
    mount('profileJobs');
    setSubnavBadge('profileJobs', 4);
    setSubnavBadge('profileJobs', v);
    expect(document.querySelector('.md-subnav-badge')).toBeNull();
    expect(document.querySelector('.md-subnav-select-badge')).toBeNull();
  });

  it('does nothing for an id that is not on the page', () => {
    mount('actuals');
    expect(() => setSubnavBadge('nope', 3)).not.toThrow();
    expect(document.querySelector('.md-subnav-badge')).toBeNull();
  });
});

describe('the profile set', () => {
  it('renders hash links, the active one current, and the PRIVACY group', () => {
    const d = parse(mdSubnavHtml('password', 'profile'));
    expect([...d.querySelectorAll('.md-subnav-group')].map(g => g.textContent)).toEqual(['ACCOUNT', 'PRIVACY']);
    const cur = d.querySelector('[aria-current="page"]');
    expect(cur.getAttribute('href')).toBe('#password');
    expect(SUBNAV_SETS.profile.label).toBe('My profile');
  });
  it('does not render a group with no items', () => {
    SUBNAV_SETS.__empty = { label: 'X', sections: [{ group: 'EMPTY', items: [] }, { group: 'FULL', items: [{ id: 'a', label: 'A', href: '#a' }] }] };
    try {
      const d = parse(mdSubnavHtml('a', '__empty'));
      expect([...d.querySelectorAll('.md-subnav-group')].map(g => g.textContent)).toEqual(['FULL']);
      expect(d.querySelectorAll('optgroup')).toHaveLength(1);
    } finally { delete SUBNAV_SETS.__empty; }
  });
});
