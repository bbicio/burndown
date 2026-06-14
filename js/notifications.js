// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
// Loaded on all pages. Provides bell icon + SSE-driven notification panel.
// esc() may not be available (pages without core.js), so we define a fallback.

const _esc = typeof esc === 'function'
  ? esc
  : s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

// Called by nav.js initNav() after navbar injection
function initNotifications(user) {
  loadUnreadCount();
  // Delay SSE: opening EventSource immediately occupies one of the browser's
  // 6 HTTP/1.1 connection slots for the lifetime of the page, causing other
  // requests to queue during page init. Defer until init API calls complete.
  setTimeout(openSseStream, 2000);
  wireNotifPanel();
}

function loadUnreadCount() {
  apiFetch('/notifications/unread-count')
    .then(d => updateBadge(d.count))
    .catch(() => {});
}

function updateBadge(count) {
  const badge = document.getElementById('nav-notif-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

function openSseStream() {
  const es = new EventSource('/api/notifications/stream', { withCredentials: true });
  es.addEventListener('message', e => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.event === 'notification') prependNotification(msg.data);
    } catch (_) {}
  });
  es.onerror = () => { /* EventSource reconnects automatically */ };
}

function wireNotifPanel() {
  const wrapper = document.getElementById('navNotifWrapper');
  if (!wrapper) return;

  // Load notifications when panel opens
  wrapper.addEventListener('show.bs.dropdown', () => renderNotifications());

  // Mark all read
  document.getElementById('nav-notif-read-all')?.addEventListener('click', async () => {
    await apiFetch('/notifications/read-all', { method: 'PATCH' }).catch(() => {});
    updateBadge(0);
    document.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
  });
}

async function renderNotifications() {
  const list = document.getElementById('nav-notif-list');
  if (!list) return;
  try {
    const notifs = await apiFetch('/notifications');
    if (!notifs.length) {
      list.innerHTML = '<div class="text-center text-muted py-4" style="font-size:.875rem">No notifications yet</div>';
      return;
    }
    list.innerHTML = notifs.map(renderNotifItem).join('');
    list.querySelectorAll('.notif-item[data-id]').forEach(el => {
      el.addEventListener('click', async () => {
        const id = el.dataset.id;
        if (el.classList.contains('unread')) {
          el.classList.remove('unread');
          await apiFetch(`/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {});
          const badge = document.getElementById('nav-notif-badge');
          const curr = parseInt(badge?.textContent || '0') - 1;
          updateBadge(Math.max(0, curr));
        }
        const url = el.dataset.url;
        if (url) window.location.href = url;
      });
    });
  } catch (_) {}
}

function renderNotifItem(n) {
  const ago = timeAgo(new Date(n.created_at));
  const unreadClass = n.read_at ? '' : 'unread';
  const urlAttr = n.url ? `data-url="${_esc(n.url)}"` : '';
  const linkHtml = n.url
    ? `<div class="mt-1"><a href="${_esc(n.url)}" style="font-size:.78rem;color:var(--brand-magenta)" onclick="event.stopPropagation()">${_esc(n.url_label || 'Open →')}</a></div>`
    : '';
  return `<div class="notif-item ${unreadClass} px-3 py-2 border-bottom" data-id="${_esc(n.id)}" ${urlAttr} style="cursor:pointer">
    <div class="d-flex justify-content-between align-items-start gap-2">
      <div class="fw-semibold" style="font-size:.825rem">${_esc(n.title)}</div>
      <div class="text-muted flex-shrink-0" style="font-size:.75rem">${ago}</div>
    </div>
    ${n.body ? `<div class="text-muted" style="font-size:.8rem;margin-top:2px">${_esc(n.body)}</div>` : ''}
    ${linkHtml}
  </div>`;
}

function prependNotification(n) {
  const list = document.getElementById('nav-notif-list');
  if (!list) return;
  const placeholder = list.querySelector('.text-center');
  if (placeholder) placeholder.remove();
  list.insertAdjacentHTML('afterbegin', renderNotifItem(n));
  const badge = document.getElementById('nav-notif-badge');
  const curr = parseInt(badge?.textContent || '0') + 1;
  updateBadge(curr);
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - date) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
