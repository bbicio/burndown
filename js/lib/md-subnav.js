// js/lib/md-subnav.js
// The Master Data sub-navigation: one definition of the sections, rendered into every static
// <nav class="md-subnav" data-md-active="<id>"> as a grouped list (desktop column, tablet tabs)
// plus a phone selector (native <select> laid over a styled row). Native ES module, bridged onto `window`.

import { iconSvg } from './icons.js?v=5';

export const MD_SECTIONS = [
  { group: 'COMMERCIAL', items: [
    { id: 'clients', label: 'Clients & groups', href: '/master-clients.html' },
    { id: 'pipelines', label: 'Pipelines & POTs', href: '/master-pipelines.html' },
  ] },
  { group: 'FINANCIAL', items: [
    { id: 'roles', label: 'Roles & rates', href: '/master-roles.html' },
    { id: 'currencies', label: 'Currencies', href: '/master-currencies.html' },
  ] },
];

const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function mdSubnavHtml(activeId) {
  let list = '';
  let options = '';
  let current = null;
  for (const sec of MD_SECTIONS) {
    list += `<div class="md-subnav-group">${escHtml(sec.group)}</div>`;
    options += `<optgroup label="${escHtml(sec.group)}">`;
    for (const it of sec.items) {
      const on = it.id === activeId;
      if (on) current = { group: sec.group, label: it.label };
      list += `<a class="md-subnav-item${on ? ' active' : ''}" href="${escHtml(it.href)}"${on ? ' aria-current="page"' : ''}>${escHtml(it.label)}</a>`;
      options += `<option value="${escHtml(it.href)}"${on ? ' selected' : ''}>${escHtml(it.label)}</option>`;
    }
    options += '</optgroup>';
  }
  return `<div class="md-subnav-list">${list}</div>`
    + '<div class="md-subnav-select">'
    + `<span class="md-subnav-select-group">${current ? escHtml(current.group) : ''}</span>`
    + `<span class="md-subnav-select-label">${current ? escHtml(current.label) : ''}</span>`
    + iconSvg('chevronDown', 16, 'md-subnav-select-chevron')
    + `<select class="md-subnav-select-input" aria-label="Master Data section">${options}</select>`
    + '</div>';
}

export function mountMdSubnav(root = document) {
  root.querySelectorAll('nav.md-subnav[data-md-active]').forEach(nav => {
    nav.innerHTML = mdSubnavHtml(nav.getAttribute('data-md-active'));
    const sel = nav.querySelector('select.md-subnav-select-input');
    sel.addEventListener('change', e => { location.href = e.target.value; });
    // back from the bfcache the select still holds the section picked before leaving
    window.addEventListener('pageshow', () => { sel.value = sel.querySelector('option[selected]').value; });
  });
}

if (typeof window !== 'undefined') {
  window.MD_SECTIONS = MD_SECTIONS;
  window.mdSubnavHtml = mdSubnavHtml;
  window.mountMdSubnav = mountMdSubnav;
}
if (typeof document !== 'undefined') mountMdSubnav();
