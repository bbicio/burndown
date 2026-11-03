import { describe, it, expect, afterEach, vi } from 'vitest';
import { MD_SECTIONS, mdSubnavHtml, mountMdSubnav } from './md-subnav.js';

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
});
