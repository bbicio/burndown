// ── SHARED NAVIGATION ────────────────────────────────────────────────────────
// Call initNav(activeTab) from each page's DOMContentLoaded handler.
// Fetches /api/auth/me, renders the top navbar into #nav-container,
// injects the change-password modal and settings modal, and returns the user object.
// 401 → apiFetch already redirects to /login.html.

async function initNav(activeTab, opts = {}) {
  let user;
  try {
    user = await Api.auth.me();
  } catch (e) {
    return null;
  }

  // Store user globally so settings.js and notifications.js can access it
  window.__navUser = user;

  const tabs = [
    { id: 'pipeline',   label: 'Pipeline',          href: '/pipeline.html'   },
    { id: 'portfolio',  label: 'Project Reporting',  href: '/portfolio.html'  },
    { id: 'planning',   label: 'Resource Planning',  href: '/planning.html'   },
  ];

  const tabsHtml = tabs.map(t =>
    `<a class="nav-main-tab${activeTab === t.id ? ' active' : ''}" href="${t.href}">${esc(t.label)}</a>`
  ).join('');

  const adminHtml = user.role === 'admin'
    ? `<span style="border-left:1px solid rgba(255,255,255,.15);margin:8px 6px;align-self:stretch"></span>` +
      `<a class="nav-main-tab nav-admin-tab${activeTab === 'config'     ? ' active' : ''}" href="/config.html">⚙ Config</a>` +
      `<a class="nav-main-tab nav-admin-tab${activeTab === 'timesheets' ? ' active' : ''}" href="/timesheets.html">📂 Actuals Repository</a>` +
      `<a class="nav-main-tab nav-admin-tab${activeTab === 'admin'      ? ' active' : ''}" href="/admin.html">👤 User Admin</a>`
    : '';

  const displayName = esc([user.firstName, user.lastName].filter(Boolean).join(' ') || user.email);

  document.getElementById('nav-container').innerHTML = `
    <nav class="navbar navbar-dark"
         style="background:var(--brand-navy);border-bottom:3px solid var(--brand-magenta);padding:10px 0 0;flex-direction:column;align-items:stretch">
      <div class="d-flex align-items-center justify-content-between px-4" style="height:44px">
        <a class="d-flex align-items-center gap-2 text-white text-decoration-none" href="/pipeline.html">
          <span class="fw-bold" style="font-size:2.25rem;letter-spacing:-.02em;line-height:1"><span style="color:var(--brand-magenta)">P</span>Dash</span>
        </a>
        <div class="d-flex gap-2 align-items-center">
          <!-- Notification bell -->
          <div class="dropdown" id="navNotifWrapper">
            <button class="btn btn-outline-light btn-sm position-relative" id="nav-notif-btn"
                    data-bs-toggle="dropdown" aria-expanded="false" data-bs-auto-close="outside">
              🔔
              <span id="nav-notif-badge" class="badge rounded-pill bg-danger position-absolute top-0 start-100 translate-middle"
                    style="display:none;font-size:.6rem;min-width:1.2em;padding:.2em .4em"></span>
            </button>
            <div class="dropdown-menu dropdown-menu-end p-0" style="width:360px;max-height:480px;overflow:hidden">
              <div class="d-flex align-items-center justify-content-between px-3 py-2 border-bottom">
                <span class="fw-semibold" style="font-size:.875rem">Notifications</span>
                <button class="btn btn-link btn-sm p-0 text-muted" id="nav-notif-read-all" style="font-size:.78rem;text-decoration:none">Mark all read</button>
              </div>
              <div id="nav-notif-list" style="overflow-y:auto;max-height:420px">
                <div class="text-center text-muted py-4" style="font-size:.875rem">No notifications yet</div>
              </div>
            </div>
          </div>
          <!-- Account dropdown -->
          <div class="dropdown">
            <button class="btn btn-outline-light btn-sm dropdown-toggle" id="nav-account-btn"
                    data-bs-toggle="dropdown" aria-expanded="false">
              ${displayName}
            </button>
            <ul class="dropdown-menu dropdown-menu-end" style="min-width:180px">
              <li><button class="dropdown-item" id="nav-settings-btn">⚙ Settings</button></li>
              <li><hr class="dropdown-divider"></li>
              <li><button class="dropdown-item" id="nav-send-notif-btn">📣 Send Notification</button></li>
              <li><hr class="dropdown-divider"></li>
              <li><button class="dropdown-item" id="nav-change-pwd-btn">🔑 Change password</button></li>
              <li><hr class="dropdown-divider"></li>
              <li><button class="dropdown-item text-danger" id="nav-logout-btn">Sign out</button></li>
            </ul>
          </div>
        </div>
      </div>
      <div class="d-flex align-items-stretch px-2" style="border-top:1px solid rgba(255,255,255,.1);padding-bottom:8px">
        ${tabsHtml}
        ${adminHtml}
      </div>
    </nav>`;

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
      const navCont = document.getElementById('nav-container');
      navCont.parentNode.insertBefore(bar, navCont.nextSibling);
      document.body.classList.add('has-breadcrumbs');
    }
    bar.innerHTML = _navBcHtml(items);
  };

  if (opts.breadcrumbs && opts.breadcrumbs.length) {
    window.updateBreadcrumbs(opts.breadcrumbs);
  }

  // ── FOOTER ──────────────────────────────────────────────────────────────────
  if (!document.getElementById('app-footer')) {
    const footer = document.createElement('footer');
    footer.id = 'app-footer';
    footer.className = 'app-footer';
    footer.innerHTML = `2026 <span style="margin-left:.35em"><span style="color:var(--brand-magenta)">P</span>Dash</span>`;
    document.body.appendChild(footer);
    document.body.style.paddingBottom = '100px';
  }

  // ── CHANGE PASSWORD MODAL ───────────────────────────────────────────────────
  if (!document.getElementById('navChangePwdModal')) {
    const modalEl = document.createElement('div');
    modalEl.innerHTML = `
      <div class="modal fade" id="navChangePwdModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered" style="max-width:400px">
          <div class="modal-content">
            <div class="modal-header" style="padding:14px 18px">
              <h6 class="modal-title fw-semibold mb-0">Change Password</h6>
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

  // ── SEND NOTIFICATION MODAL (injected once by nav.js) ───────────────────────
  if (!document.getElementById('sendNotifModal')) {
    const notifEl = document.createElement('div');
    notifEl.innerHTML = `
      <div class="modal fade" id="sendNotifModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered" style="max-width:520px">
          <div class="modal-content">
            <div class="modal-header border-0 pb-1">
              <h6 class="modal-title fw-bold">📣 Send Notification</h6>
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

  // ── SETTINGS MODAL (injected once by nav.js) ────────────────────────────────
  if (!document.getElementById('settingsModal')) {
    const stgEl = document.createElement('div');
    stgEl.innerHTML = `
      <div class="modal fade" id="settingsModal" tabindex="-1">
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header border-0 pb-1">
              <h5 class="modal-title fw-bold">⚙ App Settings</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-0">
              <ul class="nav nav-tabs px-3 pt-2 mb-0">
                <li class="nav-item"><button class="nav-link active stg-tab-btn" data-tab="api">🔑 API &amp; Integrations</button></li>
                <li class="nav-item"><button class="nav-link stg-tab-btn" data-tab="data">💾 Data Manager</button></li>
              </ul>
              <div id="stgTabApi" class="p-3">
                <form autocomplete="off" onsubmit="return false">
                <div class="cfg-section mb-3">
                  <div class="cfg-section-title">🤖 AI Assistant</div>
                  <div class="row g-2 align-items-center mb-2">
                    <div class="col-auto" style="min-width:160px"><label class="form-label small mb-0 fw-semibold">Active provider</label></div>
                    <div class="col-auto">
                      <select class="form-select form-select-sm" id="stgAiProvider" style="min-width:200px">
                        <option value="anthropic">🟣 Anthropic (Claude)</option>
                        <option value="openai">🟢 OpenAI (GPT)</option>
                        <option value="gemini">🔵 Google Gemini</option>
                      </select>
                    </div>
                    <div class="col-auto">
                      <select class="form-select form-select-sm" id="stgAiModel" style="min-width:260px"></select>
                    </div>
                  </div>
                  <div class="row g-2 align-items-center mt-1">
                    <div class="col-auto" style="min-width:160px"><label class="form-label small mb-0 fw-semibold">🟣 Anthropic API Key</label></div>
                    <div class="col"><input type="password" class="form-control form-control-sm" id="stgAnthropicKey" placeholder="sk-ant-..." autocomplete="off" style="max-width:480px"></div>
                  </div>
                  <div class="row g-2 align-items-center mt-1">
                    <div class="col-auto" style="min-width:160px"><label class="form-label small mb-0 fw-semibold">🟢 OpenAI API Key</label></div>
                    <div class="col"><input type="password" class="form-control form-control-sm" id="stgOpenaiKey" placeholder="sk-..." autocomplete="off" style="max-width:480px"></div>
                  </div>
                  <div class="row g-2 align-items-center mt-1">
                    <div class="col-auto" style="min-width:160px"><label class="form-label small mb-0 fw-semibold">🔵 Gemini API Key</label></div>
                    <div class="col"><input type="password" class="form-control form-control-sm" id="stgGeminiKey" placeholder="AIza..." autocomplete="off" style="max-width:480px"></div>
                  </div>
                </div>
                </form>
              </div>
              <div id="stgTabData" class="p-3" style="display:none">
                <div class="mb-4">
                  <div class="fw-semibold mb-1" style="font-size:.875rem">Data Exports</div>
                  <p class="text-muted small mb-3">Exported files are sent by email to <strong><span class="stg-export-email">—</span></strong></p>
                  <div class="d-flex gap-2 flex-wrap">
                    <button class="btn btn-sm btn-outline-secondary" id="btnExport_cost-grids">⬇ Cost Grids</button>
                    <button class="btn btn-sm btn-outline-secondary" id="btnExport_portfolio">⬇ Project Portfolio</button>
                    <button class="btn btn-sm btn-outline-secondary stg-admin-only" id="btnExport_ratecards" style="display:none">⬇ Roles in Rate Cards</button>
                  </div>
                  <div id="stgExportStatus" style="display:none" class="alert py-2 px-3 small mt-2"></div>
                </div>
                <div class="pt-3 border-top">
                  <div class="fw-semibold mb-2" style="font-size:.875rem">Backup</div>
                  <div class="d-flex gap-2 flex-wrap">
                    <button class="btn btn-sm btn-outline-secondary" id="btnFullBackup">⬇ Full Backup (.json)</button>
                    <button class="btn btn-sm btn-outline-secondary stg-admin-only" id="btnRestoreBackup" style="display:none">⬆ Restore from Backup</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer border-0 d-flex justify-content-between">
              <small class="text-muted">API keys are saved in your browser's localStorage.</small>
              <div class="d-flex gap-2">
                <button class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
                <button class="btn btn-primary btn-sm" id="btnSaveSettings">💾 Save</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(stgEl.firstElementChild);
  }

  // ── WIRE EVENTS ─────────────────────────────────────────────────────────────
  document.getElementById('nav-logout-btn').addEventListener('click', async () => {
    try { await Api.auth.logout(); } catch (e) {}
    window.location.href = '/login.html';
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

  // ── SETTINGS MODAL EVENTS (wired once) ──────────────────────────────────────
  if (!document.getElementById('stgAlreadyWired')) {
    // Tab switching
    document.querySelectorAll('.stg-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.stg-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tabApi  = document.getElementById('stgTabApi');
        const tabData = document.getElementById('stgTabData');
        if (tabApi)  tabApi.style.display  = btn.dataset.tab === 'api'  ? 'block' : 'none';
        if (tabData) tabData.style.display = btn.dataset.tab === 'data' ? 'block' : 'none';
      });
    });

    // AI provider change
    const providerSel = document.getElementById('stgAiProvider');
    if (providerSel) {
      providerSel.addEventListener('change', e => {
        if (typeof stgUpdateModelDropdown === 'function') stgUpdateModelDropdown(e.target.value, '');
      });
    }

    // Settings save button
    const saveBtn = document.getElementById('btnSaveSettings');
    if (saveBtn) saveBtn.addEventListener('click', () => {
      if (typeof saveSettingsModal === 'function') saveSettingsModal();
    });

    // Settings open button
    document.getElementById('nav-settings-btn').addEventListener('click', () => {
      if (typeof openSettingsModal === 'function') openSettingsModal();
    });

    // Export buttons
    ['cost-grids', 'portfolio', 'ratecards'].forEach(type => {
      const btn = document.getElementById(`btnExport_${type}`);
      if (btn) btn.addEventListener('click', () => {
        if (typeof stgExport === 'function') stgExport(type);
      });
    });

    // Full backup
    const backupBtn = document.getElementById('btnFullBackup');
    if (backupBtn) backupBtn.addEventListener('click', () => {
      if (typeof downloadFullBackup === 'function') downloadFullBackup();
    });

    // Restore backup
    const restoreBtn = document.getElementById('btnRestoreBackup');
    if (restoreBtn) restoreBtn.addEventListener('click', () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
      inp.onchange = e => {
        const file = e.target.files[0];
        if (file && typeof restoreFromBackup === 'function') restoreFromBackup(file);
      };
      inp.click();
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
        targetSel.innerHTML = (window.__navUser?.role === 'admin' ? '<option value="">All users (broadcast)</option>' : '') + opts;
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
