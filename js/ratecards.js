// ── RATECARDS ADMIN MODULE ─────────────────────────────────────────────────────
// Admin-only modal to manage rate cards (global + per-client).
// Usage: openRatecardsModal()

let _rcAll     = [];   // all ratecards from API
let _rcRoles   = [];   // all roles (for entry labels)
let _rcEditing = null; // ratecard currently being edited

// ── MODAL INJECTION ───────────────────────────────────────────────────────────

function _injectRatecardsModal() {
  if (document.getElementById('ratecardsModal')) return;
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="modal fade" id="ratecardsModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content">

          <!-- LIST VIEW -->
          <div id="rcListView">
            <div class="modal-header" style="padding:14px 18px">
              <h6 class="modal-title fw-semibold mb-0">Rate Cards</h6>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body" id="rcListBody" style="padding:16px 18px;min-height:200px">
              <div class="text-muted" style="font-size:.83rem">Loading…</div>
            </div>
            <div class="modal-footer" style="padding:10px 18px">
              <div class="d-flex align-items-center gap-2 w-100">
                <input id="rcNewName" type="text" class="form-control form-control-sm"
                       placeholder="New rate card name…" style="flex:1" autocomplete="off">
                <select id="rcNewClient" class="form-select form-select-sm" style="width:190px">
                  <option value="">Global (all clients)</option>
                </select>
                <button class="btn btn-primary btn-sm" id="rcCreateBtn" style="white-space:nowrap">+ Create</button>
              </div>
              <div id="rcCreateMsg" class="small d-none mt-1 w-100"></div>
            </div>
          </div>

          <!-- EDIT VIEW -->
          <div id="rcEditView" class="d-none">
            <div class="modal-header" style="padding:10px 18px">
              <button class="btn btn-sm btn-outline-secondary me-2 flex-shrink-0" id="rcBackBtn">← Back</button>
              <h6 class="modal-title fw-semibold mb-0 flex-grow-1" id="rcEditTitle">Edit rate card</h6>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body" style="padding:16px 18px">
              <div class="row g-2 mb-3 align-items-end">
                <div class="col">
                  <label class="form-label fw-semibold" style="font-size:.82rem">Name</label>
                  <input type="text" id="rcEditName" class="form-control form-control-sm">
                </div>
                <div class="col-auto">
                  <button class="btn btn-outline-secondary btn-sm" id="rcSaveNameBtn">Save name</button>
                </div>
              </div>
              <div class="fw-semibold mb-2" style="font-size:.82rem;color:#6b7280">HOURLY RATES PER ROLE</div>
              <div id="rcEditMsg" class="small d-none mb-2"></div>
              <div id="rcEntriesBody">
                <div class="text-muted" style="font-size:.83rem">Loading…</div>
              </div>
            </div>
            <div class="modal-footer" style="padding:10px 18px">
              <button class="btn btn-secondary btn-sm me-auto" data-bs-dismiss="modal">Close</button>
              <button class="btn btn-primary btn-sm" id="rcSaveEntriesBtn">Save rates</button>
            </div>
          </div>

        </div>
      </div>
    </div>`;
  document.body.appendChild(el.firstElementChild);

  document.getElementById('rcCreateBtn').addEventListener('click', _rcCreate);
  document.getElementById('rcNewName').addEventListener('keydown', e => { if (e.key === 'Enter') _rcCreate(); });
  document.getElementById('rcBackBtn').addEventListener('click', _rcBack);
  document.getElementById('rcSaveNameBtn').addEventListener('click', _rcSaveName);
  document.getElementById('rcSaveEntriesBtn').addEventListener('click', _rcSaveEntries);
}

// ── LIST VIEW ─────────────────────────────────────────────────────────────────

async function _rcLoad() {
  const body = document.getElementById('rcListBody');
  if (!body) return;
  body.innerHTML = '<div class="text-muted" style="font-size:.83rem">Loading…</div>';
  try {
    [_rcAll, _rcRoles] = await Promise.all([Api.ratecards.list(), Api.roles.list()]);
    _rcRenderList();
    await _rcPopulateClientSelect();
  } catch (e) {
    body.innerHTML = `<div class="text-danger" style="font-size:.83rem">${esc(e.message)}</div>`;
  }
}

async function _rcPopulateClientSelect() {
  const sel = document.getElementById('rcNewClient');
  if (!sel) return;
  let clients = (typeof getClients === 'function') ? getClients().filter(c => c.id !== '__unassigned__') : [];
  if (!clients.length) {
    try { clients = await Api.clients.list(); } catch { clients = []; }
  }
  sel.innerHTML = '<option value="">Global (all clients)</option>' +
    clients.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
}

function _rcRenderList() {
  const body = document.getElementById('rcListBody');
  if (!body) return;

  if (!_rcAll.length) {
    body.innerHTML = '<div class="text-muted" style="font-size:.83rem">No rate cards yet. Create one below.</div>';
    return;
  }

  // Group: global (client_id null) first, then per-client
  const globals  = _rcAll.filter(r => !r.client_id);
  const byClient = {};
  _rcAll.filter(r => r.client_id).forEach(r => {
    (byClient[r.client_name || r.client_id] = byClient[r.client_name || r.client_id] || []).push(r);
  });

  let html = '';
  if (globals.length) {
    html += `<div class="fw-semibold mb-2" style="font-size:.78rem;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">Global</div>`;
    html += globals.map(r => _rcRowHtml(r, true)).join('');
  }
  Object.keys(byClient).sort().forEach(clientName => {
    html += `<div class="fw-semibold mt-3 mb-2" style="font-size:.78rem;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">${esc(clientName)}</div>`;
    html += byClient[clientName].map(r => _rcRowHtml(r, false)).join('');
  });

  body.innerHTML = html;
  body.querySelectorAll('.rc-edit-btn').forEach(btn =>
    btn.addEventListener('click', () => _rcOpenEdit(btn.dataset.id)));
  body.querySelectorAll('.rc-delete-btn').forEach(btn =>
    btn.addEventListener('click', () => _rcDelete(btn.dataset.id, btn.dataset.name)));
  body.querySelectorAll('.rc-clone-btn').forEach(btn =>
    btn.addEventListener('click', () => _rcClonePrompt(btn.dataset.id)));
}

function _rcRowHtml(r, isGlobal) {
  const entryCount = (r.entries || []).length;
  return `
    <div class="d-flex align-items-center gap-2 py-2 border-bottom" style="font-size:.85rem">
      <div style="flex:1;min-width:0">
        <span class="fw-semibold">${esc(r.name)}</span>
        <span class="text-muted ms-2" style="font-size:.78rem">${entryCount} role${entryCount !== 1 ? 's' : ''}</span>
      </div>
      ${isGlobal
        ? `<button class="btn btn-sm btn-outline-secondary py-0 px-2 rc-clone-btn" data-id="${esc(r.id)}" style="font-size:.75rem" title="Clone to a client">Clone →</button>`
        : ''}
      <button class="btn btn-sm btn-outline-secondary py-0 px-2 rc-edit-btn" data-id="${esc(r.id)}" style="font-size:.75rem">Edit</button>
      <button class="btn btn-sm btn-outline-danger py-0 px-2 rc-delete-btn" data-id="${esc(r.id)}" data-name="${esc(r.name)}" style="font-size:.75rem">🗑</button>
    </div>`;
}

// ── CREATE ────────────────────────────────────────────────────────────────────

async function _rcCreate() {
  const nameInput = document.getElementById('rcNewName');
  const clientSel = document.getElementById('rcNewClient');
  const msgEl     = document.getElementById('rcCreateMsg');
  const btn       = document.getElementById('rcCreateBtn');
  const name      = (nameInput.value || '').trim();

  msgEl.className = 'small d-none mt-1 w-100';
  if (!name) {
    msgEl.textContent = 'Enter a name for the rate card.';
    msgEl.className = 'small text-danger mt-1 w-100';
    return;
  }
  btn.disabled = true;
  try {
    const clientId = clientSel.value || null;
    const rc = await Api.ratecards.create(name, clientId);
    nameInput.value = '';
    await _rcLoad();
    _rcOpenEdit(rc.id);
  } catch (e) {
    msgEl.textContent = e.message || 'Failed to create.';
    msgEl.className = 'small text-danger mt-1 w-100';
  } finally {
    btn.disabled = false;
  }
}

// ── CLONE ─────────────────────────────────────────────────────────────────────

async function _rcClonePrompt(globalId) {
  let clients = (typeof getClients === 'function') ? getClients().filter(c => c.id !== '__unassigned__') : [];
  if (!clients.length) { try { clients = await Api.clients.list(); } catch { clients = []; } }
  if (!clients.length) { alert('No clients configured.'); return; }

  // Build a simple prompt dialog using a quick Bootstrap modal or just prompt()
  const clientName = prompt(
    'Clone global rate card to which client?\n\nAvailable clients:\n' +
    clients.map((c, i) => `${i + 1}. ${c.name}`).join('\n') +
    '\n\nEnter client name exactly:'
  );
  if (!clientName) return;
  const client = clients.find(c => c.name.toLowerCase() === clientName.trim().toLowerCase());
  if (!client) { alert(`Client "${clientName}" not found.`); return; }

  const name = prompt(`Name for the cloned rate card (default: "${client.name} rates"):`);
  if (name === null) return;

  try {
    await Api.ratecards.clone(client.id, name.trim() || `${client.name} rates`);
    await _rcLoad();
  } catch (e) {
    alert('Clone failed: ' + (e.message || 'Unknown error'));
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

async function _rcDelete(id, name) {
  if (!confirm(`Delete rate card "${name}"?\n\nThis cannot be undone. Rate cards linked to cost grid versions will be unlinked.`)) return;
  try {
    await Api.ratecards.delete(id);
    await _rcLoad();
  } catch (e) {
    alert('Delete failed: ' + (e.message || 'Unknown error'));
  }
}

// ── EDIT VIEW ─────────────────────────────────────────────────────────────────

function _rcOpenEdit(id) {
  const rc = _rcAll.find(r => String(r.id) === String(id));
  if (!rc) return;
  _rcEditing = rc;
  document.getElementById('rcEditTitle').textContent = `Edit — ${rc.name}`;
  document.getElementById('rcEditName').value = rc.name;
  document.getElementById('rcEditMsg').className = 'small d-none mb-2';
  document.getElementById('rcListView').classList.add('d-none');
  document.getElementById('rcEditView').classList.remove('d-none');
  _rcRenderEntries(rc);
}

function _rcRenderEntries(rc) {
  const body = document.getElementById('rcEntriesBody');
  if (!body) return;

  const entryMap = {};
  (rc.entries || []).forEach(e => { entryMap[String(e.roleId)] = e.hourlyRate; });

  if (!_rcRoles.length) {
    body.innerHTML = '<div class="text-muted" style="font-size:.83rem">No roles configured.</div>';
    return;
  }

  body.innerHTML = `
    <table class="table table-sm mb-0" style="font-size:.83rem">
      <thead>
        <tr>
          <th style="width:60%;font-size:.78rem">Role</th>
          <th style="font-size:.78rem">Hourly rate</th>
          <th style="width:60px;font-size:.78rem">Currency</th>
        </tr>
      </thead>
      <tbody>
        ${_rcRoles.map(role => `
          <tr>
            <td class="fw-semibold align-middle">${esc(role.label || role.code || role.id)}</td>
            <td>
              <input type="number" min="0" step="1" class="form-control form-control-sm rc-rate-input"
                     data-role-id="${esc(role.id)}"
                     value="${entryMap[String(role.id)] !== undefined ? Number(entryMap[String(role.id)]) : ''}"
                     placeholder="—"
                     style="width:100px">
            </td>
            <td class="align-middle text-muted">€/h</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

function _rcBack() {
  _rcEditing = null;
  document.getElementById('rcEditView').classList.add('d-none');
  document.getElementById('rcListView').classList.remove('d-none');
}

async function _rcSaveName() {
  if (!_rcEditing) return;
  const name = (document.getElementById('rcEditName').value || '').trim();
  const msg  = document.getElementById('rcEditMsg');
  if (!name) {
    msg.textContent = 'Name cannot be empty.';
    msg.className = 'small text-danger mb-2';
    return;
  }
  try {
    const prevId = _rcEditing.id;
    await Api.ratecards.rename(prevId, name);
    _rcDropdownCache = null;
    await _rcLoad();
    _rcEditing = _rcAll.find(r => String(r.id) === String(prevId)) || _rcEditing;
    document.getElementById('rcEditTitle').textContent = `Edit — ${_rcEditing.name}`;
    msg.textContent = 'Name updated.';
    msg.className = 'small text-success mb-2';
  } catch (e) {
    msg.textContent = e.message;
    msg.className = 'small text-danger mb-2';
  }
}

async function _rcSaveEntries() {
  if (!_rcEditing) return;
  const msg = document.getElementById('rcEditMsg');
  const btn = document.getElementById('rcSaveEntriesBtn');

  const entries = [];
  document.querySelectorAll('.rc-rate-input').forEach(input => {
    const val = input.value.trim();
    if (val !== '') {
      entries.push({ roleId: input.dataset.roleId, hourlyRate: parseFloat(val) || 0 });
    }
  });

  btn.disabled = true;
  msg.className = 'small d-none mb-2';
  try {
    await Api.ratecards.updateEntries(_rcEditing.id, entries);
    msg.textContent = 'Rates saved.';
    msg.className = 'small text-success mb-2';
    // Refresh local data
    await _rcLoad();
    const updated = _rcAll.find(r => String(r.id) === String(_rcEditing.id));
    if (updated) { _rcEditing = updated; _rcRenderEntries(updated); }
  } catch (e) {
    msg.textContent = e.message || 'Failed to save.';
    msg.className = 'small text-danger mb-2';
  } finally {
    btn.disabled = false;
  }
}

// ── PUBLIC ENTRY POINT ────────────────────────────────────────────────────────

async function openRatecardsModal() {
  _injectRatecardsModal();
  _rcBack(); // ensure list view is shown
  bootstrap.Modal.getOrCreateInstance(document.getElementById('ratecardsModal')).show();
  await _rcLoad();
}

// ── LOAD FOR COSTGRID DROPDOWN ────────────────────────────────────────────────

let _rcDropdownCache = null;

async function loadRatecardsForDropdown() {
  if (_rcDropdownCache) return _rcDropdownCache;
  try {
    _rcDropdownCache = await Api.ratecards.list();
    return _rcDropdownCache;
  } catch {
    return [];
  }
}
