// ── SHARING MODULE ────────────────────────────────────────────────────────────
// Generic share modal for cost grids, projects, and programs.
// Usage: openShareModal('cost_grid'|'project'|'program', id, name)

let _shareType       = null;   // 'cost_grid' | 'project' | 'program'
let _shareId         = null;
let _shareName       = '';
let _shareAllUsers   = [];     // full list (non-admin, non-self) loaded once per modal open
let _shareUserList   = [];     // filtered list (excludes already-shared users)
let _shareSelected   = null;   // { id, email, first_name, last_name }

// ── MODAL INJECTION ───────────────────────────────────────────────────────────

function _injectShareModal() {
  if (document.getElementById('shareModal')) return;
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="modal fade" id="shareModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered" style="max-width:500px">
        <div class="modal-content">
          <div class="modal-header" style="padding:14px 18px">
            <h6 class="modal-title fw-semibold mb-0" id="shareModalTitle">Share</h6>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" style="padding:16px 18px">

            <!-- Current shares -->
            <div class="fw-semibold mb-2" style="font-size:.82rem;color:var(--text-muted,#6b7280)">
              WHO HAS ACCESS
            </div>
            <div id="shareListMsg" class="small d-none mb-2"></div>
            <div id="sharesList" class="mb-3">
              <div class="text-muted" style="font-size:.82rem">Loading…</div>
            </div>

            <!-- Add person -->
            <div style="border-top:1px solid #e5e7eb;padding-top:14px">
              <div class="fw-semibold mb-2" style="font-size:.82rem;color:var(--text-muted,#6b7280)">
                ADD PERSON
              </div>

              <!-- Search input -->
              <div style="position:relative" class="mb-2">
                <input type="text" id="shareSearchInput" class="form-control form-control-sm"
                       placeholder="Search by name or email…" autocomplete="off">
                <div id="shareDropdown"
                     style="display:none;position:absolute;top:100%;left:0;right:0;z-index:1500;
                            background:#fff;border:1px solid #d1d5db;border-radius:6px;
                            box-shadow:0 4px 12px rgba(0,0,0,.12);max-height:200px;overflow-y:auto">
                </div>
              </div>

              <!-- Selected user chip -->
              <div id="shareSelectedChip" class="d-none mb-2"
                   style="display:flex;align-items:center;gap:8px;padding:6px 10px;
                          background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;font-size:.82rem">
                <div style="flex:1;min-width:0">
                  <span id="shareChipName" class="fw-semibold"></span>
                  <span id="shareChipEmail" class="text-muted ms-1" style="font-size:.75rem"></span>
                </div>
                <button id="shareClearBtn" class="btn-close" style="font-size:.65rem" aria-label="Clear"></button>
              </div>

              <!-- Permission + Share button row -->
              <div class="d-flex gap-2">
                <select id="sharePermSelect" class="form-select form-select-sm" style="width:120px">
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button class="btn btn-primary btn-sm" id="shareAddBtn"
                        style="white-space:nowrap" disabled>Share</button>
              </div>
              <div id="shareAddMsg" class="small d-none mt-1"></div>
            </div>

          </div>
          <div class="modal-footer" style="padding:10px 18px">
            <button class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Done</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el.firstElementChild);

  _bindShareModalEvents();
}

function _bindShareModalEvents() {
  const searchEl   = document.getElementById('shareSearchInput');
  const dropEl     = document.getElementById('shareDropdown');
  const clearBtn   = document.getElementById('shareClearBtn');
  const addBtn     = document.getElementById('shareAddBtn');

  searchEl.addEventListener('input', () => {
    _shareSelected = null;
    document.getElementById('shareSelectedChip').classList.add('d-none');
    addBtn.disabled = true;
    _renderDropdown(searchEl.value.trim());
  });

  searchEl.addEventListener('keydown', e => {
    if (e.key === 'Escape') { dropEl.style.display = 'none'; searchEl.blur(); }
  });

  // Close dropdown when clicking outside
  document.addEventListener('mousedown', e => {
    if (!dropEl.contains(e.target) && e.target !== searchEl) {
      dropEl.style.display = 'none';
    }
  }, true);

  clearBtn.addEventListener('click', () => {
    _shareSelected = null;
    searchEl.value = '';
    document.getElementById('shareSelectedChip').classList.add('d-none');
    addBtn.disabled = true;
    searchEl.focus();
  });

  addBtn.addEventListener('click', _shareAddUser);
}

// ── DROPDOWN ──────────────────────────────────────────────────────────────────

function _renderDropdown(q) {
  const dropEl = document.getElementById('shareDropdown');
  if (!q) { dropEl.style.display = 'none'; return; }

  const lower = q.toLowerCase();
  const matches = _shareUserList.filter(u => {
    const full = `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase();
    return full.includes(lower);
  }).slice(0, 10);

  if (!matches.length) {
    dropEl.innerHTML = `<div style="padding:8px 12px;font-size:.82rem;color:#6b7280">No users found</div>`;
    dropEl.style.display = 'block';
    return;
  }

  dropEl.innerHTML = matches.map(u => {
    const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email;
    return `<div class="share-drop-item" data-uid="${esc(u.id)}"
                 style="padding:7px 12px;cursor:pointer;font-size:.82rem;
                        border-bottom:1px solid #f3f4f6;transition:background .1s">
      <div class="fw-semibold">${esc(name)}</div>
      <div style="font-size:.75rem;color:#6b7280">${esc(u.email)}</div>
    </div>`;
  }).join('');

  dropEl.querySelectorAll('.share-drop-item').forEach(item => {
    item.addEventListener('mouseenter', () => { item.style.background = '#f0f9ff'; });
    item.addEventListener('mouseleave', () => { item.style.background = ''; });
    item.addEventListener('mousedown', e => {
      e.preventDefault(); // prevent blur before click
      const uid = item.dataset.uid;
      const user = _shareUserList.find(u => u.id === uid);
      if (!user) return;
      _selectShareUser(user);
    });
  });

  dropEl.style.display = 'block';
}

function _selectShareUser(user) {
  _shareSelected = user;
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email;

  document.getElementById('shareSearchInput').value = '';
  document.getElementById('shareDropdown').style.display = 'none';
  document.getElementById('shareChipName').textContent  = name;
  document.getElementById('shareChipEmail').textContent = user.email;
  document.getElementById('shareSelectedChip').classList.remove('d-none');
  document.getElementById('shareAddBtn').disabled = false;
  document.getElementById('shareAddMsg').className = 'small d-none';
}

// ── MESSAGES ──────────────────────────────────────────────────────────────────

// The share list's own message line (a failed remove or permission change); kind: 'error' | 'success'.
function _shareMsg(text, kind) {
  const el = document.getElementById('shareListMsg');
  if (!el) return;
  if (!text) { el.textContent = ''; el.className = 'small d-none mb-3'; return; }
  el.textContent = text;
  el.className = 'small mb-3 ' + (kind === 'success' ? 'text-success' : 'text-danger');
}

// …/shares path of the open proposal or project (apiSave paths carry no /api prefix).
function _sharesPath() {
  return (_shareType === 'cost_grid' ? '/cost-grids/' : '/projects/') + encodeURIComponent(_shareId) + '/shares';
}

// ── PERMISSION BADGE ──────────────────────────────────────────────────────────

function _permBadge(perm) {
  const styles = {
    owner:  'background:#ede9fe;color:#5b21b6',
    editor: 'background:#dcfce7;color:#166534',
    viewer: 'background:#e0f2fe;color:#0369a1',
  };
  const s = styles[perm] || 'background:#f3f4f6;color:#374151';
  return `<span style="${s};font-size:.72rem;padding:2px 8px;border-radius:999px;font-weight:600">${perm}</span>`;
}

// ── RENDER SHARES LIST ────────────────────────────────────────────────────────

async function _renderShareList() {
  const container = document.getElementById('sharesList');
  if (!container) return;

  if (_shareType === 'program') {
    container.innerHTML = `<div class="text-muted" style="font-size:.82rem">Sharing a program grants access to <strong>all its projects</strong>. The user will be notified by email and in-app.</div>`;
    _refreshEligibleList([]);   // no program-level shares: every eligible user can be picked
    return;
  }

  container.innerHTML = '<div class="text-muted" style="font-size:.82rem">Loading…</div>';

  try {
    const api = _shareType === 'cost_grid' ? Api.costGrids.shares : Api.projects.shares;
    const shares = await api.list(_shareId);

    if (!shares.length) {
      container.innerHTML = '<div class="text-muted" style="font-size:.82rem">Not shared with anyone yet.</div>';
      _refreshEligibleList(shares);
      return;
    }

    container.innerHTML = shares.map(s => {
      const name = [s.first_name, s.last_name].filter(Boolean).join(' ') || s.email;
      const isOwner = s.permission === 'owner';
      return `
        <div class="d-flex align-items-center gap-2 py-1" style="font-size:.82rem" data-share-uid="${esc(s.user_id)}">
          <div style="flex:1;min-width:0">
            <div class="fw-semibold text-truncate">${esc(name)}</div>
            <div class="text-muted text-truncate" style="font-size:.75rem">${esc(s.email)}</div>
          </div>
          ${isOwner
            ? _permBadge('owner')
            : `<select class="form-select form-select-sm share-perm-select"
                       style="width:90px;font-size:.75rem" data-uid="${esc(s.user_id)}">
                 <option value="editor"${s.permission === 'editor' ? ' selected' : ''}>Editor</option>
                 <option value="viewer"${s.permission === 'viewer' ? ' selected' : ''}>Viewer</option>
               </select>`}
          ${isOwner
            ? '<div style="width:34px"></div>'
            : `<button class="btn btn-sm btn-outline-danger py-0 px-2 share-remove-btn"
                       style="font-size:.72rem" data-uid="${esc(s.user_id)}" title="Remove">✕</button>`}
        </div>`;
    }).join('');

    container.querySelectorAll('.share-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => _shareRemoveUser(btn.dataset.uid));
    });

    container.querySelectorAll('.share-perm-select').forEach(sel => {
      sel.addEventListener('change', () => _shareUpdatePerm(sel.dataset.uid, sel.value, sel));
    });

    _refreshEligibleList(shares);
  } catch (e) {
    container.innerHTML = `<div class="text-danger" style="font-size:.82rem">Failed to load: ${esc(e.message)}</div>`;
  }
}

// Exclude already-shared users from the eligible search list
function _refreshEligibleList(currentShares) {
  const sharedIds = new Set((currentShares || []).map(s => s.user_id));
  _shareUserList = _shareAllUsers.filter(u => !sharedIds.has(u.id));
}

// ── ADD USER ──────────────────────────────────────────────────────────────────

async function _shareAddUser() {
  const perm   = document.getElementById('sharePermSelect').value;
  const msgEl  = document.getElementById('shareAddMsg');
  const addBtn = document.getElementById('shareAddBtn');

  msgEl.className = 'small d-none';

  if (!_shareSelected) {
    msgEl.textContent = 'Select a person first.';
    msgEl.className = 'small text-danger';
    return;
  }

  addBtn.disabled = true;
  addBtn.textContent = '…';
  try {
    if (_shareType === 'program') {
      // One request shares every project of the program; a permission is never lowered (save contract cycle 3).
      const res = await window.apiSave('POST', `/programs/${encodeURIComponent(_shareId)}/share`,
        { userId: _shareSelected.id, permission: perm });
      if (res.kind !== 'ok') {
        msgEl.textContent = res.message || 'Failed to share.';
        msgEl.className = 'small text-danger';
        return;
      }
      _clearShareSelection();
      msgEl.textContent = _programShareMessage(res.data);
      msgEl.className = 'small text-success';
    } else {
      const res = await window.apiSave('POST', _sharesPath(), { userId: _shareSelected.id, permission: perm });
      if (res.kind !== 'ok') {
        msgEl.textContent = res.message || 'Failed to share.';
        msgEl.className = 'small text-danger';
        // Someone else shared it first (409): show the list as it now is.
        if (res.kind === 'error' && res.status === 409) await _renderShareList();
        return;
      }
      const name = [_shareSelected.first_name, _shareSelected.last_name].filter(Boolean).join(' ') || _shareSelected.email;
      _clearShareSelection();
      msgEl.textContent = res.data?.emailSent === false
        ? `Shared with ${name}, but the email could not be sent.`
        : `Shared with ${name}.`;
      msgEl.className = 'small text-success';
      await _renderShareList();
    }
  } catch (e) {
    msgEl.textContent = e.message || 'Failed to share.';
    msgEl.className = 'small text-danger';
  } finally {
    addBtn.disabled = true; // stays disabled until a new user is selected
    addBtn.textContent = 'Share';
  }
}

// "Shared 3 projects; 2 kept their higher access." from the program share's answer.
function _programShareMessage(result) {
  const n = result?.shared || 0;
  const kept = result?.kept || 0;
  let msg = `Shared ${n} project${n === 1 ? '' : 's'}` + (kept > 0 ? `; ${kept} kept their higher access.` : '.');
  if (result?.emailSent === false) msg += ' The email could not be sent.';
  return msg;
}

function _clearShareSelection() {
  _shareSelected = null;
  document.getElementById('shareSearchInput').value = '';
  document.getElementById('shareSelectedChip').classList.add('d-none');
  document.getElementById('shareAddBtn').disabled = true;
}

// ── REMOVE USER ───────────────────────────────────────────────────────────────

async function _shareRemoveUser(userId) {
  if (_shareType === 'program') return;
  _shareMsg('');
  const res = await window.apiSave('DELETE', `${_sharesPath()}/${encodeURIComponent(userId)}`);
  if (res.kind !== 'ok') {
    _shareMsg(res.message || 'Remove failed.', 'error');
    return;
  }
  await _renderShareList();
}

// ── UPDATE PERMISSION ─────────────────────────────────────────────────────────

async function _shareUpdatePerm(userId, newPerm, selectEl) {
  const prev = newPerm === 'editor' ? 'viewer' : 'editor';
  selectEl.disabled = true;
  _shareMsg('');
  try {
    const res = await window.apiSave('PATCH', `${_sharesPath()}/${encodeURIComponent(userId)}`, { permission: newPerm });
    if (res.kind === 'ok') {
      selectEl.value = res.data?.permission || newPerm;
      // Brief visual confirmation
      selectEl.style.outline = '2px solid #16a34a';
      setTimeout(() => { selectEl.style.outline = ''; }, 800);
    } else if (res.kind === 'error' && res.status === 404) {
      await _renderShareList(); // the share is gone: show the list as it is
      _shareMsg('This person no longer has access.', 'error');
    } else {
      selectEl.value = prev; // revert on error
      _shareMsg(res.message || 'Permission update failed.', 'error');
    }
  } finally {
    selectEl.disabled = false;
  }
}

// ── PUBLIC ENTRY POINT ────────────────────────────────────────────────────────

async function openShareModal(resourceType, resourceId, resourceName) {
  _injectShareModal();
  _shareType     = resourceType;
  _shareId       = resourceId;
  _shareName     = resourceName;
  _shareSelected = null;

  document.getElementById('shareModalTitle').textContent = 'Share — ' + resourceName;
  document.getElementById('shareAddMsg').className       = 'small d-none';
  _shareMsg('');
  document.getElementById('shareSearchInput').value      = '';
  document.getElementById('shareDropdown').style.display = 'none';
  document.getElementById('shareSelectedChip').classList.add('d-none');
  document.getElementById('shareAddBtn').disabled        = true;

  // Load user list first so _shareAllUsers is populated when _renderShareList calls _refreshEligibleList
  const self     = (window.__navUser || {}).id;
  const allUsers = await Api.users.activeList();
  _shareAllUsers = (allUsers || []).filter(u => !['admin', 'sysadmin'].includes(u.role) && u.id !== self);

  await _renderShareList(); // internally calls _refreshEligibleList, which reads _shareAllUsers

  bootstrap.Modal.getOrCreateInstance(document.getElementById('shareModal')).show();
  setTimeout(() => document.getElementById('shareSearchInput')?.focus(), 300);
}
