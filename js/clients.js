// ── CLIENTS MODULE ────────────────────────────────────────────────────────────
// Each client: { id, name }
// Stored in localStorage under CLIENTS_KEY.
// '__unassigned__' is a reserved id for projects with no client.

const CLIENTS_KEY = 'PDash_clients';
const UNASSIGNED_CLIENT = { id: '__unassigned__', name: 'Unassigned' };

let _clients = [];
let _clientEditId = null;

async function loadClientsFromApi() {
  try {
    _clients = await Api.clients.list();
  } catch(e) {
    // Fallback: load from localStorage
    try { _clients = JSON.parse(storageGet(CLIENTS_KEY) || '[]'); } catch(_) { _clients = []; }
  }
}

function loadClients() {
  try { _clients = JSON.parse(storageGet(CLIENTS_KEY) || '[]'); } catch(e) { _clients = []; }
}

function saveClients() {
  // No-op: clients are now persisted via the API.
  // Kept for backward compatibility with backup restore (settings.js).
}

function getClients() {
  return [UNASSIGNED_CLIENT, ..._clients];
}

function getClientName(clientId) {
  if (!clientId || clientId === '__unassigned__') return UNASSIGNED_CLIENT.name;
  const c = getClients().find(c => c.id === clientId);
  return c?.name || UNASSIGNED_CLIENT.name;
}

// ── MODAL ─────────────────────────────────────────────────────────────────────

function showClientsModal() {
  renderClientsTable();
  bootstrap.Modal.getOrCreateInstance(document.getElementById('clientsModal')).show();
}

function renderClientsTable() {
  const tbody    = document.getElementById('clientsTableBody');
  const emptyRow = document.getElementById('clientsEmptyRow');
  Array.from(tbody.querySelectorAll('tr:not(#clientsEmptyRow)')).forEach(r => r.remove());

  if (!_clients.length) { emptyRow.style.display = ''; return; }
  emptyRow.style.display = 'none';

  [..._clients].sort((a, b) => a.name.localeCompare(b.name)).forEach(client => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding:6px 10px;font-weight:600">${esc(client.name)}</td>
      <td style="padding:4px 8px;text-align:center">
        <div class="d-flex gap-1 justify-content-center">
          <button class="btn btn-outline-secondary btn-sm py-0 px-2 cli-edit-btn" style="font-size:var(--text-xs)">✏️</button>
          <button class="btn btn-outline-danger btn-sm py-0 px-2 cli-del-btn" style="font-size:var(--text-xs)">🗑</button>
        </div>
      </td>`;
    tr.querySelector('.cli-edit-btn').addEventListener('click', () => openClientEditModal(client.id));
    tr.querySelector('.cli-del-btn').addEventListener('click',  () => deleteClient(client.id));
    tbody.appendChild(tr);
  });
}

function openClientEditModal(id) {
  _clientEditId = id || null;
  const client = id ? _clients.find(c => c.id === id) : null;
  document.getElementById('clientModalTitle').textContent = client ? '✏️ Edit client' : '＋ New client';
  document.getElementById('clientName').value = client?.name || '';
  document.getElementById('clientModalError').classList.add('d-none');
  bootstrap.Modal.getOrCreateInstance(document.getElementById('clientEditModal')).show();
}

async function saveClientFromModal() {
  const name  = document.getElementById('clientName').value.trim();
  const errEl = document.getElementById('clientModalError');
  errEl.classList.add('d-none');

  if (!name) {
    errEl.textContent = 'Name is required.';
    errEl.classList.remove('d-none');
    return;
  }

  const dup = _clients.find(c => c.name.toLowerCase() === name.toLowerCase() && c.id !== _clientEditId);
  if (dup) {
    errEl.textContent = `A client named "${dup.name}" already exists.`;
    errEl.classList.remove('d-none');
    return;
  }

  try {
    if (_clientEditId) {
      await Api.clients.update(_clientEditId, name);
      const idx = _clients.findIndex(c => c.id === _clientEditId);
      if (idx >= 0) _clients[idx] = { id: _clientEditId, name };
    } else {
      const created = await Api.clients.create(name);
      _clients.push({ id: created.id, name });
    }
    bootstrap.Modal.getInstance(document.getElementById('clientEditModal')).hide();
    renderClientsTable();
    cfgRefreshClientDropdown();
  } catch(err) {
    errEl.textContent = err.message || 'Save failed.';
    errEl.classList.remove('d-none');
  }
}

function deleteClient(id) {
  const client = _clients.find(c => c.id === id);
  if (!client) return;
  showConfirm(
    `Delete client "${client.name}"?`,
    async () => {
      try {
        await Api.clients.delete(id);
        _clients = _clients.filter(c => c.id !== id);
        renderClientsTable();
        cfgRefreshClientDropdown();
      } catch(err) {
        alert('Delete failed: ' + (err.message || 'Unknown error'));
      }
    }, null, '🗑 Delete client'
  );
}

function cfgRefreshClientDropdown() {
  const sel = document.getElementById('cfgClientId');
  if (!sel) return;
  const current = sel.value;
  const sorted = getClients(); // Unassigned first, then loaded _clients (alphabetical sort)
  const rest = sorted.slice(1).sort((a, b) => a.name.localeCompare(b.name));
  sel.innerHTML = `<option value="${esc(UNASSIGNED_CLIENT.id)}">${esc(UNASSIGNED_CLIENT.name)}</option>` +
    rest.map(c =>
      `<option value="${esc(c.id)}" ${c.id === current ? 'selected' : ''}>${esc(c.name)}</option>`
    ).join('');
}
