// js/lib/md-subnav.js
// The in-page sub-navigation (Master Data, Timesheets): one definition per set of sections, rendered into every
// static <nav class="md-subnav" data-md-active="<id>" [data-subnav-set="<set>"]> as a grouped list (desktop
// column, tablet tabs) plus a phone selector (native <select> laid over a styled row). Native ES module, bridged
// onto `window`.

import { iconSvg } from './icons.js?v=7';

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

// A nav without data-subnav-set (the Master Data pages) renders masterData.
export const SUBNAV_SETS = {
  masterData: { label: 'Master Data', sections: MD_SECTIONS },
  timesheets: { label: 'Timesheets', sections: [
    { group: 'TIMESHEETS', items: [
      { id: 'actuals', label: 'Actuals', href: '/timesheets.html' },
      { id: 'profileJobs', label: 'Profile processing', href: '/profile-jobs.html' },
    ] },
  ] },
};

const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function mdSubnavHtml(activeId, setId = 'masterData') {
  const set = SUBNAV_SETS[setId] || SUBNAV_SETS.masterData;
  let list = '';
  let options = '';
  let current = null;
  for (const sec of set.sections) {
    list += `<div class="md-subnav-group">${escHtml(sec.group)}</div>`;
    options += `<optgroup label="${escHtml(sec.group)}">`;
    for (const it of sec.items) {
      const on = it.id === activeId;
      if (on) current = { group: sec.group, label: it.label };
      list += `<a class="md-subnav-item${on ? ' active' : ''}" href="${escHtml(it.href)}" data-subnav-id="${escHtml(it.id)}"${on ? ' aria-current="page"' : ''}>${escHtml(it.label)}</a>`;
      options += `<option value="${escHtml(it.href)}"${on ? ' selected' : ''}>${escHtml(it.label)}</option>`;
    }
    options += '</optgroup>';
  }
  return `<div class="md-subnav-list">${list}</div>`
    + '<div class="md-subnav-select">'
    + `<span class="md-subnav-select-group">${current ? escHtml(current.group) : ''}</span>`
    + `<span class="md-subnav-select-label">${current ? escHtml(current.label) : ''}</span>`
    + iconSvg('chevronDown', 16, 'md-subnav-select-chevron')
    + `<select class="md-subnav-select-input" aria-label="${escHtml(set.label)} section">${options}</select>`
    + '</div>';
}

export function mountMdSubnav(root = document) {
  root.querySelectorAll('nav.md-subnav[data-md-active]').forEach(nav => {
    nav.innerHTML = mdSubnavHtml(nav.getAttribute('data-md-active'), nav.getAttribute('data-subnav-set') || 'masterData');
    const sel = nav.querySelector('select.md-subnav-select-input');
    sel.addEventListener('change', e => { location.href = e.target.value; });
  });
}

// A count pill on the item `id`, and "N queued" on the phone selector row whatever section is current;
// both removed unless `count` is a positive integer (a numeric string counts).
export function setSubnavBadge(id, count, title = '') {
  const n = typeof count === 'number' || typeof count === 'string' ? Number(count) : NaN;
  const show = count !== '' && Number.isInteger(n) && n > 0;
  document.querySelectorAll('nav.md-subnav').forEach(nav => {
    const item = [...nav.querySelectorAll('a.md-subnav-item')].find(a => a.getAttribute('data-subnav-id') === id);
    if (!item) return;
    item.querySelector('.md-subnav-badge')?.remove();
    nav.querySelector('.md-subnav-select-badge')?.remove();
    if (!show) return;
    const pill = document.createElement('span');
    pill.className = 'md-subnav-badge';
    pill.textContent = String(n);
    if (title) pill.title = title;
    item.appendChild(pill);
    const chevron = nav.querySelector('.md-subnav-select-chevron');
    if (chevron) {
      const tag = document.createElement('span');
      tag.className = 'md-subnav-select-badge';
      tag.textContent = `${n} queued`;
      chevron.before(tag);
    }
  });
}

// back from the bfcache a select still holds the section picked before leaving
function resetMdSubnavSelects() {
  document.querySelectorAll('select.md-subnav-select-input').forEach(sel => {
    const opt = [...sel.options].find(o => o.defaultSelected);
    sel.selectedIndex = opt ? opt.index : -1;
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', resetMdSubnavSelects);
  window.MD_SECTIONS = MD_SECTIONS;
  window.SUBNAV_SETS = SUBNAV_SETS;
  window.mdSubnavHtml = mdSubnavHtml;
  window.mountMdSubnav = mountMdSubnav;
  window.setSubnavBadge = setSubnavBadge;
}
if (typeof document !== 'undefined') mountMdSubnav();
