// ── SHARED NAVIGATION ────────────────────────────────────────────────────────
// Call initNav(activeTab) from each page's DOMContentLoaded handler.
// Fetches /api/auth/me, renders the sidebar / small-screen navbar into #nav-container,
// injects the change-password modal and settings modal, and returns the user object.
// 401 → apiFetch already redirects to /login.html.

// ── NAVIGATION MODEL ─────────────────────────────────────────────────────────
// Menu entry, <title> and breadcrumb of a page use the same label (cycle B2).
const NAV_MAIN = [
  { id: 'pipeline',  label: 'Pipeline',  href: '/pipeline.html',  icon: 'pipeline'  },
  { id: 'portfolio', label: 'Portfolio', href: '/portfolio.html', icon: 'portfolio' },
  { id: 'planning',  label: 'Planning',  href: '/planning.html',  icon: 'planning'  },
];

const NAV_GROUPS = [
  { id: 'admin', title: 'Admin', icon: 'config', roles: ['admin', 'sysadmin'], items: [
    { id: 'config',         label: 'Master Data',     href: '/config.html',          icon: 'config'     },
    { id: 'timesheets',     label: 'Timesheets',      href: '/timesheets.html',      icon: 'timesheets' },
    { id: 'admin',          label: 'User Admin',      href: '/admin.html',           icon: 'user'       },
    { id: 'team',           label: 'Team',            href: '/team.html',            icon: 'team'       },
    { id: 'attributelists', label: 'Attribute Lists', href: '/attribute-lists.html', icon: 'tag'        },
  ] },
  { id: 'sysadmin', title: 'Sysadmin', icon: 'lock', roles: ['sysadmin'], items: [
    { id: 'dbreset',     label: 'DB Reset',           href: '/_db-reset.html',     icon: 'dbreset' },
    { id: 'termseditor', label: 'Terms & Conditions', href: '/_terms-editor.html', icon: 'terms'   },
  ] },
];

// Inner markup of the 16x16 line icons (stroke/fill = currentColor, see handoff §15).
const NAV_ICON_PATHS = {
  pipeline:  '<path d="M2 12V8M8 12V4M14 12V6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  portfolio: '<rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/>',
  planning:  '<rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M2 6H14M5 2V4.5M11 2V4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  config:    '<circle cx="8" cy="8" r="2.4" stroke="currentColor" stroke-width="1.3"/><path d="M8 2v1.6M8 12.4V14M14 8h-1.6M3.6 8H2M12.1 3.9l-1.1 1.1M5 9.9l-1.1 1.1M12.1 12.1l-1.1-1.1M5 6.1L3.9 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  timesheets:'<rect x="2" y="4" width="12" height="9" rx="1.2" stroke="currentColor" stroke-width="1.3"/><path d="M2 4l1.6-2h8.8L14 4" stroke="currentColor" stroke-width="1.3"/>',
  user:      '<circle cx="8" cy="5.5" r="2.3" stroke="currentColor" stroke-width="1.3"/><path d="M3 14c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5" stroke="currentColor" stroke-width="1.3"/>',
  team:      '<circle cx="5.5" cy="5.5" r="2" stroke="currentColor" stroke-width="1.2"/><circle cx="11" cy="6.5" r="1.6" stroke="currentColor" stroke-width="1.2"/><path d="M2 14c0-2.3 1.7-3.8 3.9-3.8 1.6 0 2.9.8 3.5 2M9.6 10.3c1.6 0 3 1.1 3 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  tag:       '<path d="M2 2h5.5L14 8.5 7.5 15 2 9.5V2Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><circle cx="5" cy="5" r="1" fill="currentColor"/>',
  dbreset:   '<ellipse cx="8" cy="3.5" rx="5.2" ry="1.8" stroke="currentColor" stroke-width="1.2"/><path d="M2.8 3.5v9c0 1 2.3 1.8 5.2 1.8s5.2-.8 5.2-1.8v-9M2.8 8c0 1 2.3 1.8 5.2 1.8s5.2-.8 5.2-1.8" stroke="currentColor" stroke-width="1.2"/>',
  terms:     '<path d="M4 2h5.5L13 5.5V14H4V2Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6 8h5M6 10.5h5M6 5.5h2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>',
  notify:    '<path d="M2 6.5v3l2.5.5L9 12.5V3.5L4.5 6 2 6.5Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M11 6.3c.8.5 1.3 1.3 1.3 2.2s-.5 1.7-1.3 2.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M4.5 10v2.3c0 .7.6 1.2 1.2 1l.8-.3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  key:       '<circle cx="5" cy="9" r="2.6" stroke="currentColor" stroke-width="1.2"/><path d="M7 7.2 13 1.2M11.2 3l1.6 1.6M9.4 4.8 11 6.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
  signout:   '<path d="M6.5 2H3.3c-.7 0-1.3.6-1.3 1.3v9.4c0 .7.6 1.3 1.3 1.3h3.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.5 11l3-3-3-3M13 8H6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
  bell:      '<path d="M8 2.2c-.3 0-.6.1-.8.3-1.7.4-3 2-3 3.9v2.1c0 .5-.2 1-.5 1.4L3 10.6c-.3.3-.1.9.3.9h9.4c.4 0 .6-.6.3-.9l-.7-.7c-.3-.4-.5-.9-.5-1.4V6.4c0-1.9-1.3-3.5-3-3.9-.2-.2-.5-.3-.8-.3Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.3 13c.3.6.9 1 1.7 1s1.4-.4 1.7-1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  lock:      '<rect x="3.5" y="7" width="9" height="6.5" rx="1.3" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  chevronLeft:  '<path d="M10 3.5L5.5 8 10 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  chevronRight: '<path d="M6 3.5L10.5 8 6 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
};

function navIcon(name, size = 'sm') {
  const paths = NAV_ICON_PATHS[name];
  if (!paths) return '';
  return `<svg class="nav-icon nav-icon-${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">${paths}</svg>`;
}

function navInitials(user) {
  const f = String(user.firstName || user.first_name || '').trim();
  const l = String(user.lastName || user.last_name || '').trim();
  const pair = ((f[0] || '') + (l[0] || '')).toUpperCase();
  if (pair) return pair;
  return (String(user.email || '').trim()[0] || '?').toUpperCase();
}

function navItemHtml(it, activeTab, size) {
  const active = activeTab === it.id;
  // aria-label: the visible label is hidden in the rail, so the name must not depend on it.
  // title: native tooltip, removed in the rail by navApplyTitles() (the custom tooltip takes over from data-tip).
  return `<a class="pd-nav-item${active ? ' active' : ''}" href="${it.href}"${active ? ' aria-current="page"' : ''} aria-label="${esc(it.label)}" data-tip="${esc(it.label)}" title="${esc(it.label)}">` +
    `${navIcon(it.icon, size)}<span class="pd-nav-label">${esc(it.label)}</span></a>`;
}

function navGroupHtml(g, activeTab) {
  const groupActive = g.items.some(i => i.id === activeTab);
  return `<span class="pd-nav-sep"></span>` +
    `<section class="pd-nav-group" data-group="${g.id}">` +
      `<button type="button" class="pd-nav-group-toggle${groupActive ? ' active' : ''}" aria-expanded="false" ` +
        `aria-controls="pd-nav-panel-${g.id}" aria-label="${esc(g.title)}" title="${esc(g.title)}">` +
        `${navIcon(g.icon, 'md')}<span class="pd-nav-dot"></span></button>` +
      `<div class="pd-nav-group-panel" id="pd-nav-panel-${g.id}">` +
        `<div class="pd-nav-group-title">${esc(g.title)}</div>` +
        g.items.map(i => navItemHtml(i, activeTab, 'sm')).join('') +
      `</div>` +
    `</section>`;
}

function buildNavHtml(user, activeTab) {
  const main = NAV_MAIN.map(it => navItemHtml(it, activeTab, 'md')).join('');
  const groups = NAV_GROUPS.filter(g => g.roles.includes(user.role)).map(g => navGroupHtml(g, activeTab)).join('');
  return `<aside class="pd-nav" aria-label="Main navigation">
    <div class="pd-nav-brand">
      <a class="pd-logo" href="/pipeline.html" aria-label="PDash home"><span class="pd-logo-full"><span class="pd-logo-p">P</span>Dash</span><span class="pd-logo-mini pd-logo-p">P</span></a>
      <button type="button" class="pd-nav-collapse" id="nav-collapse-btn" aria-label="Collapse sidebar" aria-expanded="true">${navIcon('chevronLeft', 'md')}${navIcon('chevronRight', 'md')}</button>
    </div>
    <div class="pd-nav-items">${main}${groups}</div>
    <div class="pd-nav-actions">
      <div class="dropdown pd-account">
        <button type="button" class="pd-account-btn" id="nav-account-btn" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Account menu" data-tip="${esc(user.email || 'Account menu')}">
          <span class="pd-avatar" id="nav-avatar">${esc(navInitials(user))}</span>
          <span class="pd-account-email" id="nav-account-email">${esc(user.email || '')}</span>
        </button>
        <ul class="dropdown-menu pd-account-menu">
          <li><button class="dropdown-item" id="nav-profile-btn">${navIcon('user')}My Profile</button></li>
          <li><button class="dropdown-item" id="nav-settings-btn">${navIcon('config')}Settings</button></li>
          <li><hr class="dropdown-divider"></li>
          <li><button class="dropdown-item" id="nav-send-notif-btn">${navIcon('notify')}Send Notification</button></li>
          <li><hr class="dropdown-divider"></li>
          <li><button class="dropdown-item" id="nav-change-pwd-btn">${navIcon('key')}Change password</button></li>
          <li><hr class="dropdown-divider"></li>
          <li><button class="dropdown-item text-danger" id="nav-logout-btn">${navIcon('signout')}Sign out</button></li>
        </ul>
      </div>
      <div class="dropdown pd-bell" id="navNotifWrapper">
        <button type="button" class="pd-bell-btn" id="nav-notif-btn" data-bs-toggle="dropdown" aria-expanded="false" data-bs-auto-close="outside" aria-label="Notifications" data-tip="Notifications">
          ${navIcon('bell', 'md')}<span id="nav-notif-badge" class="pd-badge" style="display:none"></span>
        </button>
        <div class="dropdown-menu pd-notif-panel p-0">
          <div class="d-flex align-items-center justify-content-between px-3 py-2 border-bottom">
            <span class="fw-semibold" style="font-size:.875rem">Notifications</span>
            <button class="btn btn-link btn-sm p-0 text-muted" id="nav-notif-read-all" style="font-size:.78rem;text-decoration:none">Mark all read</button>
          </div>
          <div id="nav-notif-browser-banner" class="px-3 py-2 border-bottom d-flex align-items-center justify-content-between gap-2" style="display:none;font-size:.78rem;background:var(--indigo-50,#eef2ff)">
            <span id="nav-notif-browser-label">${navIcon('bell')}Enable desktop notifications?</span>
            <button class="btn btn-primary btn-sm py-0 px-2" id="nav-notif-browser-enable" style="font-size:.75rem">Enable</button>
          </div>
          <div id="nav-notif-list" style="overflow-y:auto;max-height:420px">
            <div class="text-center text-muted py-4" style="font-size:.875rem">No notifications yet</div>
          </div>
        </div>
      </div>
      <div class="pd-copyright">© 2026 PDash</div>
    </div>
  </aside>`;
}

// ── NAVIGATION BEHAVIOUR ─────────────────────────────────────────────────────
const NAV_COLLAPSE_KEY = 'PDash_sidebarCollapsed';

// 'small' (< 1024px navbar), 'open' (sidebar) or 'rail' (collapsed sidebar).
function navLayout() {
  if (typeof window.matchMedia !== 'function') return 'open';
  if (!window.matchMedia('(min-width: 1024px)').matches) return 'small';
  return document.documentElement.getAttribute('data-sidebar') === 'collapsed' ? 'rail' : 'open';
}

function navSyncCollapseButton() {
  const collapsed = document.documentElement.getAttribute('data-sidebar') === 'collapsed';
  const btn = document.getElementById('nav-collapse-btn');
  if (!btn) return;
  btn.setAttribute('aria-expanded', String(!collapsed));
  btn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
}

function navSetCollapsed(collapsed) {
  const html = document.documentElement;
  if (collapsed) html.setAttribute('data-sidebar', 'collapsed'); else html.removeAttribute('data-sidebar');
  try {
    if (collapsed) localStorage.setItem(NAV_COLLAPSE_KEY, '1'); else localStorage.removeItem(NAV_COLLAPSE_KEY);
  } catch (e) { /* storage blocked: the state is simply not remembered */ }
  navSyncCollapseButton();
  navApplyTitles();
  const tip = document.getElementById('pd-tooltip'); // a visible tooltip belongs to the old layout
  if (tip) tip.classList.remove('show');
}

// Rail (collapsed sidebar, >= 1024px): the native title is replaced by the custom tooltip (navWireTooltips),
// so it is removed there and restored everywhere else (open sidebar, small screens keep the native one).
function navApplyTitles() {
  const rail = navLayout() === 'rail';
  document.querySelectorAll('.pd-nav-item[data-tip]').forEach(el => {
    if (rail) el.removeAttribute('title'); else el.setAttribute('title', el.getAttribute('data-tip'));
  });
}

// One tooltip element, appended to <body> and positioned with fixed coordinates: the items container scrolls
// (overflow-y:auto) and would clip a tooltip drawn inside it. Shown only in the rail, to the right of the
// hovered/focused [data-tip] element and centred on it (the CSS translates it up by half its own height).
function navWireTooltips(root) {
  let tip = null;
  let anchor = null; // the element the visible tooltip belongs to
  const hide = () => { anchor = null; if (tip) tip.classList.remove('show'); };
  const target = e => (e.target && e.target.closest ? e.target.closest('[data-tip]') : null);
  const show = el => {
    if (navLayout() !== 'rail') return;
    const text = el.getAttribute('data-tip');
    if (!text) return;
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'pd-tooltip';
      tip.setAttribute('role', 'tooltip');
      document.body.appendChild(tip);
    }
    tip.textContent = text;
    const r = el.getBoundingClientRect();
    tip.style.left = (r.right + 10) + 'px';
    tip.style.top = (r.top + r.height / 2) + 'px';
    tip.classList.add('show');
    anchor = el;
  };
  root.addEventListener('mouseover', e => { const el = target(e); if (el && root.contains(el)) show(el); });
  root.addEventListener('mouseout', e => { const el = target(e); if (el && !el.contains(e.relatedTarget)) hide(); });
  root.addEventListener('focusin', e => { const el = target(e); if (el && root.contains(el)) show(el); });
  root.addEventListener('focusout', hide);
  root.addEventListener('click', hide);
  root.addEventListener('show.bs.dropdown', hide);
  root.addEventListener('scroll', hide, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  // The tooltip is positioned once, from the geometry at show time: a resize makes it stale.
  window.addEventListener('resize', hide);
  // If the element it points at leaves the DOM (navigation re-rendered under the pointer) no mouse event
  // fires on it any more, so the tooltip would stay on screen.
  if (typeof MutationObserver === 'function') {
    new MutationObserver(() => { if (anchor && !anchor.isConnected) hide(); }).observe(root, { childList: true, subtree: true });
  }
  // rail <-> small (or open) changes which tooltip applies: re-apply the titles
  if (window.matchMedia) {
    const mq = window.matchMedia('(min-width: 1024px)');
    if (mq && mq.addEventListener) mq.addEventListener('change', () => { hide(); navApplyTitles(); });
    else if (mq && mq.addListener) mq.addListener(() => { hide(); navApplyTitles(); });
  }
}

// Bootstrap evaluates `popperConfig` each time the menu opens; the placement
// depends on the layout active at that moment. Bootstrap passes the default
// config as the first or the second argument depending on the version, so take
// the first object argument.
function navPopperConfig(...args) {
  const defaults = args.find(a => a && typeof a === 'object') || {};
  const small = navLayout() === 'small';
  const modifiers = (defaults.modifiers || []).filter(m => !['offset', 'preventOverflow', 'flip'].includes(m.name));
  modifiers.push({ name: 'offset', options: { offset: [0, small ? 8 : 10] } });
  modifiers.push({ name: 'preventOverflow', options: { padding: 10 } });
  modifiers.push({ name: 'flip', enabled: small });
  return { ...defaults, placement: small ? 'bottom-end' : 'right-end', modifiers };
}

// Admin/Sysadmin panels of the small navbar: one open at a time; closed by a tap
// outside the groups or by Escape. (On large screens the CSS shows the panels
// permanently and the toggle buttons are hidden, so this has no visible effect.)
function navWireGroups(root) {
  const groups = [...root.querySelectorAll('.pd-nav-group')];
  const setOpen = (g, open) => {
    g.classList.toggle('open', open);
    g.querySelector('.pd-nav-group-toggle').setAttribute('aria-expanded', String(open));
  };
  const closeAll = except => groups.forEach(g => { if (g !== except) setOpen(g, false); });
  groups.forEach(g => {
    g.querySelector('.pd-nav-group-toggle').addEventListener('click', () => {
      const open = !g.classList.contains('open');
      closeAll(g);
      setOpen(g, open);
    });
  });
  document.addEventListener('click', e => {
    if (!e.target.closest || !e.target.closest('.pd-nav-group')) closeAll(null);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    // Focus inside a panel (or on its toggle) goes back to the toggle, so it is not left on a hidden link.
    groups.forEach(g => {
      if (!g.classList.contains('open')) return;
      const toggle = g.querySelector('.pd-nav-group-toggle');
      const panel = g.querySelector('.pd-nav-group-panel');
      const a = document.activeElement;
      if (a && (a === toggle || (panel && panel.contains(a)))) toggle.focus();
    });
    closeAll(null);
  });
  // Growing to the large layout shows every panel permanently: drop any leftover open state.
  if (window.matchMedia) {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => closeAll(null);
    if (mq && mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq && mq.addListener) mq.addListener(onChange);
  }
}

function navRefreshAccount(u) {
  const av = document.getElementById('nav-avatar');
  if (av) av.textContent = navInitials(u);
  const em = document.getElementById('nav-account-email');
  if (em) em.textContent = u.email || '';
  const btn = document.getElementById('nav-account-btn');
  if (btn) btn.setAttribute('data-tip', u.email || 'Account menu');
}

async function initNav(activeTab, opts = {}) {
  let user;
  try {
    user = await Api.auth.me();
  } catch (e) {
    return null;
  }

  // Redirect to terms page if user hasn't accepted the current version
  if ((user.terms_version || 0) < (user.current_terms_version || 1)) {
    const dest = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = '/terms.html?next=' + dest;
    return null;
  }

  // Store user globally so notifications.js can access it
  window.__navUser = user;

  document.getElementById('nav-container').innerHTML = buildNavHtml(user, activeTab);
  navSyncCollapseButton();
  document.getElementById('nav-collapse-btn').addEventListener('click', () => {
    navSetCollapsed(document.documentElement.getAttribute('data-sidebar') !== 'collapsed');
  });
  navWireGroups(document.getElementById('nav-container'));
  navApplyTitles();
  navWireTooltips(document.getElementById('nav-container'));
  if (typeof bootstrap !== 'undefined') {
    ['nav-account-btn', 'nav-notif-btn'].forEach(id => {
      bootstrap.Dropdown.getOrCreateInstance(document.getElementById(id), { popperConfig: navPopperConfig });
    });
  }

  // ── BREADCRUMBS ─────────────────────────────────────────────────────────────
  function _navBcHtml(items) {
    return '<ol class="breadcrumb mb-0">' +
      items.map((item, i) => {
        const isLast = i === items.length - 1;
        const label = esc(item.label);
        return isLast || !item.href
          ? `<li class="breadcrumb-item${isLast ? ' active' : ''}">${label}</li>`
          : `<li class="breadcrumb-item"><a href="${item.href}">${label}</a></li>`;
      }).join('') +
      '</ol>';
  }

  window.updateBreadcrumbs = function(items) {
    let bar = document.getElementById('breadcrumb-bar');
    if (!bar) {
      bar = document.createElement('nav');
      bar.id = 'breadcrumb-bar';
      bar.className = 'breadcrumb-bar';
      bar.setAttribute('aria-label', 'breadcrumb');
      const main = document.getElementById('app-main');
      if (main) {
        main.insertBefore(bar, main.firstChild);
      } else {
        const navCont = document.getElementById('nav-container');
        navCont.parentNode.insertBefore(bar, navCont.nextSibling);
      }
      document.body.classList.add('has-breadcrumbs');
    }
    bar.innerHTML = _navBcHtml(items);
  };

  if (opts.breadcrumbs && opts.breadcrumbs.length) {
    window.updateBreadcrumbs(opts.breadcrumbs);
  }

  // ── CHANGE PASSWORD MODAL ───────────────────────────────────────────────────
  if (!document.getElementById('navChangePwdModal')) {
    const modalEl = document.createElement('div');
    modalEl.innerHTML = `
      <div class="modal fade" id="navChangePwdModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered" style="max-width:400px">
          <div class="modal-content">
            <div class="modal-header" style="padding:14px 18px">
              <h6 class="modal-title fw-semibold mb-0">${navIcon('key')}Change Password</h6>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body" style="padding:18px">
              <div id="navPwdError" class="alert alert-danger py-2 d-none" style="font-size:.82rem"></div>
              <div id="navPwdSuccess" class="alert alert-success py-2 d-none" style="font-size:.82rem">Password changed successfully.</div>
              <div class="mb-3">
                <label class="form-label fw-semibold" style="font-size:.82rem">Current password</label>
                <input type="password" class="form-control form-control-sm" id="navPwdCurrent" autocomplete="current-password">
              </div>
              <div class="mb-3">
                <label class="form-label fw-semibold" style="font-size:.82rem">New password</label>
                <input type="password" class="form-control form-control-sm" id="navPwdNew" autocomplete="new-password">
              </div>
              <div class="mb-0">
                <label class="form-label fw-semibold" style="font-size:.82rem">Confirm new password</label>
                <input type="password" class="form-control form-control-sm" id="navPwdConfirm" autocomplete="new-password">
              </div>
            </div>
            <div class="modal-footer" style="padding:10px 18px">
              <button class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
              <button class="btn btn-primary btn-sm" id="navPwdSaveBtn">Save</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modalEl.firstElementChild);
  }

  // ── MY PROFILE MODAL ────────────────────────────────────────────────────────
  if (!document.getElementById('navProfileModal')) {
    const profileEl = document.createElement('div');
    profileEl.innerHTML = `
      <div class="modal fade" id="navProfileModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered" style="max-width:420px">
          <div class="modal-content">
            <div class="modal-header" style="padding:14px 18px">
              <h6 class="modal-title fw-semibold mb-0">${navIcon('user')}My Profile</h6>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body" style="padding:18px">
              <div id="navProfileError"   class="alert alert-danger  py-2 d-none" style="font-size:.82rem"></div>
              <div id="navProfileSuccess" class="alert alert-success py-2 d-none" style="font-size:.82rem">Profile updated.</div>
              <div class="row g-3">
                <div class="col-6">
                  <label class="form-label fw-semibold" style="font-size:.82rem">First name</label>
                  <input type="text" class="form-control form-control-sm" id="navProfileFirstName" autocomplete="given-name">
                </div>
                <div class="col-6">
                  <label class="form-label fw-semibold" style="font-size:.82rem">Last name</label>
                  <input type="text" class="form-control form-control-sm" id="navProfileLastName" autocomplete="family-name">
                </div>
                <div class="col-12">
                  <label class="form-label fw-semibold" style="font-size:.82rem">Email</label>
                  <input type="email" class="form-control form-control-sm" id="navProfileEmail" autocomplete="email">
                </div>
              </div>
            </div>
            <div class="modal-footer" style="padding:10px 18px">
              <button class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
              <button class="btn btn-primary btn-sm" id="navProfileSaveBtn">Save</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(profileEl.firstElementChild);
  }

  // ── SEND NOTIFICATION MODAL (injected once by nav.js) ───────────────────────
  if (!document.getElementById('sendNotifModal')) {
    const notifEl = document.createElement('div');
    notifEl.innerHTML = `
      <div class="modal fade" id="sendNotifModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered" style="max-width:520px">
          <div class="modal-content">
            <div class="modal-header border-0 pb-1">
              <h6 class="modal-title fw-bold">${navIcon('notify')}Send Notification</h6>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div id="sendNotifError" class="alert alert-danger py-2 d-none" style="font-size:.82rem"></div>
              <div class="mb-2">
                <label class="form-label fw-semibold" style="font-size:.82rem">Recipient</label>
                <select class="form-select form-select-sm" id="sendNotifTarget"></select>
              </div>
              <div class="mb-2">
                <input type="text" class="form-control form-control-sm" id="sendNotifTitle" placeholder="Title (required)">
              </div>
              <div class="mb-2">
                <textarea class="form-control form-control-sm" id="sendNotifBody" rows="3" placeholder="Message (optional)"></textarea>
              </div>
              <div class="d-flex gap-2 mb-2">
                <input type="url" class="form-control form-control-sm" id="sendNotifUrl" placeholder="Link URL (optional, e.g. /pipeline.html)">
                <input type="text" class="form-control form-control-sm" id="sendNotifUrlLabel" placeholder="Link label">
              </div>
              <div class="mb-0">
                <label class="form-label fw-semibold mb-1" style="font-size:.82rem">Channel</label>
                <div class="d-flex gap-3">
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="sendNotifChanPush" checked>
                    <label class="form-check-label" for="sendNotifChanPush" style="font-size:.82rem">Push notification</label>
                  </div>
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="sendNotifChanEmail">
                    <label class="form-check-label" for="sendNotifChanEmail" style="font-size:.82rem">Email</label>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer border-0 d-flex justify-content-between">
              <span id="sendNotifStatus" class="text-muted small" style="display:none"></span>
              <div class="d-flex gap-2">
                <button class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
                <button class="btn btn-primary btn-sm" id="sendNotifSendBtn">Send</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(notifEl.firstElementChild);
  }

  // ── WIRE EVENTS ─────────────────────────────────────────────────────────────
  document.getElementById('nav-logout-btn').addEventListener('click', async () => {
    try { await Api.auth.logout(); } catch (e) {}
    window.location.href = '/login.html';
  });

  document.getElementById('nav-profile-btn').addEventListener('click', () => {
    const u = window.__navUser || {};
    document.getElementById('navProfileFirstName').value = u.first_name || u.firstName || '';
    document.getElementById('navProfileLastName').value  = u.last_name  || u.lastName  || '';
    document.getElementById('navProfileEmail').value     = u.email || '';
    document.getElementById('navProfileError').classList.add('d-none');
    document.getElementById('navProfileSuccess').classList.add('d-none');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('navProfileModal')).show();
    setTimeout(() => document.getElementById('navProfileFirstName').focus(), 300);
  });

  document.getElementById('navProfileSaveBtn').addEventListener('click', async () => {
    const btn    = document.getElementById('navProfileSaveBtn');
    const errEl  = document.getElementById('navProfileError');
    const okEl   = document.getElementById('navProfileSuccess');
    const firstName = document.getElementById('navProfileFirstName').value.trim();
    const lastName  = document.getElementById('navProfileLastName').value.trim();
    const email     = document.getElementById('navProfileEmail').value.trim();

    errEl.classList.add('d-none');
    okEl.classList.add('d-none');

    if (!firstName || !lastName || !email) {
      errEl.textContent = 'All fields are required.';
      errEl.classList.remove('d-none');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const updated = await Api.auth.updateProfile({ firstName, lastName, email });
      // Update in-memory user so navbar reflects new name immediately
      if (window.__navUser) {
        window.__navUser.first_name = updated.first_name;
        window.__navUser.last_name  = updated.last_name;
        window.__navUser.firstName  = updated.first_name;
        window.__navUser.lastName   = updated.last_name;
        window.__navUser.email      = updated.email;
        navRefreshAccount(window.__navUser);
      }
      okEl.classList.remove('d-none');
      setTimeout(() => {
        bootstrap.Modal.getInstance(document.getElementById('navProfileModal'))?.hide();
      }, 1500);
    } catch (e) {
      errEl.textContent = e.message || 'Failed to update profile.';
      errEl.classList.remove('d-none');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  });

  document.getElementById('nav-change-pwd-btn').addEventListener('click', () => {
    document.getElementById('navPwdCurrent').value = '';
    document.getElementById('navPwdNew').value     = '';
    document.getElementById('navPwdConfirm').value = '';
    document.getElementById('navPwdError').classList.add('d-none');
    document.getElementById('navPwdSuccess').classList.add('d-none');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('navChangePwdModal')).show();
    setTimeout(() => document.getElementById('navPwdCurrent').focus(), 300);
  });

  document.getElementById('navPwdSaveBtn').addEventListener('click', async () => {
    const btn     = document.getElementById('navPwdSaveBtn');
    const errEl   = document.getElementById('navPwdError');
    const okEl    = document.getElementById('navPwdSuccess');
    const current = document.getElementById('navPwdCurrent').value;
    const newPwd  = document.getElementById('navPwdNew').value;
    const confirm = document.getElementById('navPwdConfirm').value;

    errEl.classList.add('d-none');
    okEl.classList.add('d-none');

    if (!current || !newPwd || !confirm) {
      errEl.textContent = 'All fields are required.';
      errEl.classList.remove('d-none');
      return;
    }
    if (newPwd !== confirm) {
      errEl.textContent = 'New passwords do not match.';
      errEl.classList.remove('d-none');
      return;
    }
    if (newPwd.length < 8) {
      errEl.textContent = 'New password must be at least 8 characters.';
      errEl.classList.remove('d-none');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await Api.auth.changePassword({
        currentPassword:    current,
        newPassword:        newPwd,
        newPasswordConfirm: confirm,
      });
      okEl.classList.remove('d-none');
      document.getElementById('navPwdCurrent').value = '';
      document.getElementById('navPwdNew').value     = '';
      document.getElementById('navPwdConfirm').value = '';
      setTimeout(() => {
        bootstrap.Modal.getInstance(document.getElementById('navChangePwdModal'))?.hide();
      }, 1500);
    } catch (e) {
      errEl.textContent = e.message || 'Failed to change password.';
      errEl.classList.remove('d-none');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  });

  // Allow Enter key in any field to submit
  ['navPwdCurrent', 'navPwdNew', 'navPwdConfirm'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('navPwdSaveBtn').click();
    });
  });

  // ── SETTINGS BUTTON (wired once) ────────────────────────────────────────────
  if (!document.getElementById('stgAlreadyWired')) {
    document.getElementById('nav-settings-btn').addEventListener('click', () => {
      window.location.href = '/settings.html';
    });

    // Mark wired
    const marker = document.createElement('span');
    marker.id = 'stgAlreadyWired';
    marker.style.display = 'none';
    document.body.appendChild(marker);
  }

  // ── SEND NOTIFICATION MODAL EVENTS (wired once) ─────────────────────────────
  if (!document.getElementById('sendNotifAlreadyWired')) {
    const openBtn  = document.getElementById('nav-send-notif-btn');
    const modalEl  = document.getElementById('sendNotifModal');
    const targetSel = document.getElementById('sendNotifTarget');
    const errEl    = document.getElementById('sendNotifError');
    const statusEl = document.getElementById('sendNotifStatus');
    const sendBtn  = document.getElementById('sendNotifSendBtn');

    if (openBtn) openBtn.addEventListener('click', async () => {
      errEl.classList.add('d-none');
      statusEl.style.display = 'none';
      ['sendNotifTitle', 'sendNotifBody', 'sendNotifUrl', 'sendNotifUrlLabel'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      document.getElementById('sendNotifChanPush').checked = true;
      document.getElementById('sendNotifChanEmail').checked = false;

      targetSel.innerHTML = '<option value="">Loading…</option>';
      bootstrap.Modal.getOrCreateInstance(modalEl).show();

      try {
        const users = await apiFetch('/users/active-list');
        const opts = users
          .filter(u => u.id !== window.__navUser?.id)
          .map(u => `<option value="${u.id}">${[u.first_name, u.last_name].filter(Boolean).join(' ') || u.email}</option>`)
          .join('');
        targetSel.innerHTML = (['admin','sysadmin'].includes(window.__navUser?.role) ? '<option value="">All users (broadcast)</option>' : '') + opts;
      } catch (e) {
        targetSel.innerHTML = '<option value="">Failed to load users</option>';
      }
    });

    if (sendBtn) sendBtn.addEventListener('click', async () => {
      const title    = (document.getElementById('sendNotifTitle')?.value || '').trim();
      const body     = (document.getElementById('sendNotifBody')?.value || '').trim();
      const url      = (document.getElementById('sendNotifUrl')?.value || '').trim();
      const urlLabel = (document.getElementById('sendNotifUrlLabel')?.value || '').trim();
      const userId   = targetSel.value || undefined;
      const wantPush  = document.getElementById('sendNotifChanPush').checked;
      const wantEmail = document.getElementById('sendNotifChanEmail').checked;

      errEl.classList.add('d-none');

      if (!title) { errEl.textContent = 'Title is required.'; errEl.classList.remove('d-none'); return; }
      if (!wantPush && !wantEmail) { errEl.textContent = 'Select at least one channel.'; errEl.classList.remove('d-none'); return; }

      const channels = [];
      if (wantPush) channels.push('push');
      if (wantEmail) channels.push('email');

      sendBtn.disabled = true;
      statusEl.textContent = 'Sending…';
      statusEl.style.display = '';

      try {
        await apiFetch('/notifications', {
          method: 'POST',
          body: JSON.stringify({ userId, title, body: body || undefined, url: url || undefined, urlLabel: urlLabel || undefined, channels }),
        });
        statusEl.textContent = 'Sent!';
        setTimeout(() => {
          bootstrap.Modal.getInstance(modalEl)?.hide();
          statusEl.style.display = 'none';
        }, 900);
      } catch (err) {
        errEl.textContent = err.message || 'Failed to send.';
        errEl.classList.remove('d-none');
        statusEl.style.display = 'none';
      } finally {
        sendBtn.disabled = false;
      }
    });

    const marker = document.createElement('span');
    marker.id = 'sendNotifAlreadyWired';
    marker.style.display = 'none';
    document.body.appendChild(marker);
  }

  // ── INIT NOTIFICATIONS ───────────────────────────────────────────────────────
  if (typeof initNotifications === 'function') initNotifications(user);

  return user;
}
