// ── SHARING MODULE ────────────────────────────────────────────────────────────
// Generic share modal for cost grids, projects, and programs.
// Usage: openShareModal('cost_grid'|'project'|'program', id, name)

let _shareType = null;   // 'cost_grid' | 'project' | 'program'
let _shareId   = null;
let _shareName = '';

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
            <div id="sharesList" class="mb-4">
              <div class="text-muted" style="font-size:.82rem">Loading…</div>
            </div>

            <!-- Add person -->
            <div style="border-top:1px solid #e5e7eb;padding-top:14px">
              <div class="fw-semibold mb-2" style="font-size:.82rem;color:var(--text-muted,#6b7280)">
                ADD PERSON
              </div>
              <div class="d-flex gap-2 mb-2">
                <input type="email" id="shareEmailInput" class="form-control form-control-sm"
                       placeholder="colleague@example.com" autocomplete="off" style="flex:1">
                <select id="sharePermSelect" class="form-select form-select-sm" style="width:110px">
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button class="btn btn-primary btn-sm" id="shareAddBtn" style="white-space:nowrap">Share</button>
              </div>
              <div id="shareAddMsg" class="small d-none"></div>
            </div>

          </div>
          <div class="modal-footer" style="padding:10px 18px">
            <button class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Done</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el.firstElementChild);

  document.getElementById('shareAddBtn').addEventListener('click', _shareAddUser);
  document.getElementById('shareEmailInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') _shareAddUser();
  });
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
    return;
  }

  container.innerHTML = '<div class="text-muted" style="font-size:.82rem">Loading…</div>';

  try {
    const api = _shareType === 'cost_grid' ? Api.costGrids.shares : Api.projects.shares;
    const shares = await api.list(_shareId);

    if (!shares.length) {
      container.innerHTML = '<div class="text-muted" style="font-size:.82rem">Not shared with anyone yet.</div>';
      return;
    }

    container.innerHTML = shares.map(s => {
      const name = [s.first_name, s.last_name].filter(Boolean).join(' ') || s.email;
      const canRemove = s.permission !== 'owner';
      return `
        <div class="d-flex align-items-center gap-2 py-1" style="font-size:.82rem" data-share-uid="${esc(s.user_id)}">
          <div style="flex:1;min-width:0">
            <div class="fw-semibold text-truncate">${esc(name)}</div>
            <div class="text-muted text-truncate" style="font-size:.75rem">${esc(s.email)}</div>
          </div>
          ${_permBadge(s.permission)}
          ${canRemove
            ? `<button class="btn btn-sm btn-outline-danger py-0 px-2 share-remove-btn"
                       style="font-size:.72rem" data-uid="${esc(s.user_id)}" title="Remove">✕</button>`
            : '<div style="width:34px"></div>'}
        </div>`;
    }).join('');

    container.querySelectorAll('.share-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => _shareRemoveUser(btn.dataset.uid));
    });
  } catch (e) {
    container.innerHTML = `<div class="text-danger" style="font-size:.82rem">Failed to load: ${esc(e.message)}</div>`;
  }
}

// ── ADD USER ──────────────────────────────────────────────────────────────────

async function _shareAddUser() {
  const email  = (document.getElementById('shareEmailInput').value || '').trim();
  const perm   = document.getElementById('sharePermSelect').value;
  const msgEl  = document.getElementById('shareAddMsg');
  const addBtn = document.getElementById('shareAddBtn');

  msgEl.className = 'small d-none';
  if (!email) {
    msgEl.textContent = 'Enter an email address.';
    msgEl.className = 'small text-danger';
    return;
  }

  addBtn.disabled = true;
  addBtn.textContent = '…';
  try {
    const user = await Api.users.search(email);

    if (_shareType === 'program') {
      const result = await Api.programs.share(_shareId, user.id, perm);
      document.getElementById('shareEmailInput').value = '';
      msgEl.textContent = `Shared program with ${user.first_name || user.email} (${result.shared} project${result.shared === 1 ? '' : 's'}).`;
      msgEl.className = 'small text-success';
    } else {
      const api = _shareType === 'cost_grid' ? Api.costGrids.shares : Api.projects.shares;
      await api.add(_shareId, user.id, perm);
      document.getElementById('shareEmailInput').value = '';
      msgEl.textContent = `Shared with ${user.first_name || user.email}.`;
      msgEl.className = 'small text-success';
      await _renderShareList();
    }
  } catch (e) {
    msgEl.textContent = e.message || 'Failed to share.';
    msgEl.className = 'small text-danger';
  } finally {
    addBtn.disabled = false;
    addBtn.textContent = 'Share';
  }
}

// ── REMOVE USER ───────────────────────────────────────────────────────────────

async function _shareRemoveUser(userId) {
  try {
    const api = _shareType === 'cost_grid' ? Api.costGrids.shares : Api.projects.shares;
    if (_shareType === 'program') return;
    await api.remove(_shareId, userId);
    await _renderShareList();
  } catch (e) {
    alert('Remove failed: ' + (e.message || 'Unknown error'));
  }
}

// ── PUBLIC ENTRY POINT ────────────────────────────────────────────────────────

async function openShareModal(resourceType, resourceId, resourceName) {
  _injectShareModal();
  _shareType = resourceType;
  _shareId   = resourceId;
  _shareName = resourceName;

  document.getElementById('shareModalTitle').textContent = 'Share — ' + resourceName;
  document.getElementById('shareAddMsg').className = 'small d-none';
  document.getElementById('shareEmailInput').value = '';

  await _renderShareList();
  bootstrap.Modal.getOrCreateInstance(document.getElementById('shareModal')).show();
  setTimeout(() => document.getElementById('shareEmailInput').focus(), 300);
}
