// ── ROLES MODULE ──────────────────────────────────────────────────────────────
// Manages the global role registry used by Cost Grid to populate columns.
// Each role: { id, label, code, rate }
// Stored in localStorage under ROLES_KEY.

const ROLES_KEY = 'PDash_roles';

let roles = [];          // in-memory array, loaded on showRolesView()
let _roleEditId = null;  // ID of the role being edited (null = new)

// ── PERSISTENCE ──────────────────────────────────────────────────────────────

function loadRoles() {
  try {
    const s = storageGet(ROLES_KEY);
    roles = s ? JSON.parse(s) : [];
  } catch(e) { roles = []; }
}

function saveRoles() {
  storageSet(ROLES_KEY, JSON.stringify(roles));
}

function getRoles() {
  if (!roles.length) loadRoles();
  return roles;
}

// ── NAVIGATION ───────────────────────────────────────────────────────────────

function showRolesView() {
  loadRoles();
  renderRolesTable();
  bootstrap.Modal.getOrCreateInstance(document.getElementById('rolesModal')).show();
}

function hideRolesView() {
  bootstrap.Modal.getInstance(document.getElementById('rolesModal'))?.hide();
}

// ── RENDER ────────────────────────────────────────────────────────────────────

function renderRolesTable() {
  const tbody = document.getElementById('rolesTableBody');
  const emptyRow = document.getElementById('rolesEmptyRow');

  // Remove all rows except the empty placeholder
  Array.from(tbody.querySelectorAll('tr:not(#rolesEmptyRow)')).forEach(r => r.remove());

  if (!roles.length) {
    emptyRow.style.display = '';
    return;
  }

  emptyRow.style.display = 'none';

  // Group by team prefix (part before first space-dash-space or first dash)
  const grouped = {};
  roles.forEach(r => {
    const team = extractTeam(r.code);
    if (!grouped[team]) grouped[team] = [];
    grouped[team].push(r);
  });

  Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).forEach(([team, teamRoles]) => {
    // Team separator row
    const sep = document.createElement('tr');
    sep.innerHTML = `<td colspan="5" style="background:#f0f2ff;font-size:var(--text-xs);font-weight:600;color:#5468c4;padding:4px 10px;border-top:2px solid #c5cef7">${esc(team)}</td>`;
    tbody.appendChild(sep);

    teamRoles.sort((a, b) => a.label.localeCompare(b.label)).forEach(role => {
      const zeroRate = !role.rate || role.rate === 0;
      const tr = document.createElement('tr');
      tr.dataset.roleId = role.id;
      if (zeroRate) tr.style.background = '#fff5f5';
      tr.innerHTML = `
        <td style="padding:6px 10px;font-weight:500">${esc(role.label)}</td>
        <td style="padding:6px 10px;color:#555;font-family:monospace;font-size:var(--text-base)">${esc(role.code)}</td>
        <td style="padding:6px 10px">
          <span style="background:#e9ecef;color:#495057;border-radius:var(--radius-xs);padding:1px 7px;font-size:var(--text-xs);font-weight:500">${esc(team)}</span>
        </td>
        <td style="padding:6px 10px;text-align:right;font-weight:500;${zeroRate ? 'color:#dc3545' : ''}">
          ${zeroRate ? '<span title="Rate not set" style="margin-right:4px">⚠️</span>' : ''}${fmtMoney(role.rate)}
        </td>
        <td style="padding:4px 8px;text-align:center">
          <div class="d-flex gap-1 justify-content-center">
            <button class="btn btn-outline-secondary btn-sm py-0 px-2 role-edit-btn" style="font-size:var(--text-xs)" title="Edit">✏️</button>
            <button class="btn btn-outline-danger btn-sm py-0 px-2 role-delete-btn" style="font-size:var(--text-xs)" title="Delete">🗑</button>
          </div>
        </td>`;
      tr.querySelector('.role-edit-btn').addEventListener('click',   () => openRoleModal(role.id));
      tr.querySelector('.role-delete-btn').addEventListener('click', () => deleteRole(role.id));
      tbody.appendChild(tr);
    });
  });
}

function extractTeam(code) {
  if (!code) return '—';
  // Team is the prefix before the first ' - ' separator
  const idx = code.indexOf(' - ');
  return idx > 0 ? code.slice(0, idx).trim() : code.split(/[\s_-]/)[0] || '—';
}

// ── MODAL ────────────────────────────────────────────────────────────────────

function openRoleModal(roleId) {
  _roleEditId = roleId || null;
  const role  = roleId ? roles.find(r => r.id === roleId) : null;

  document.getElementById('roleModalTitle').textContent = role ? '✏️ Edit role' : '➕ New role';
  document.getElementById('roleLabel').value  = role?.label || '';
  document.getElementById('roleCode').value   = role?.code  || '';
  document.getElementById('roleRate').value   = role?.rate  ?? '';
  document.getElementById('roleModalError').classList.add('d-none');

  bootstrap.Modal.getOrCreateInstance(document.getElementById('roleModal')).show();
}

function saveRoleFromModal() {
  const label = document.getElementById('roleLabel').value.trim();
  const code  = document.getElementById('roleCode').value.trim();
  const rate  = parseFloat(document.getElementById('roleRate').value);
  const errEl = document.getElementById('roleModalError');

  errEl.classList.add('d-none');

  if (!label) { showRoleError('Label is required.'); return; }
  if (!code)  { showRoleError('Code is required.'); return; }
  if (isNaN(rate) || rate < 0) { showRoleError('Enter a valid rate (≥ 0).'); return; }

  // Check for duplicate code (excluding self when editing)
  const duplicate = roles.find(r => r.code.toLowerCase() === code.toLowerCase() && r.id !== _roleEditId);
  if (duplicate) { showRoleError(`The code "${code}" is already assigned to role "${duplicate.label}".`); return; }

  if (_roleEditId) {
    const idx = roles.findIndex(r => r.id === _roleEditId);
    if (idx >= 0) roles[idx] = { id: _roleEditId, label, code, rate };
  } else {
    roles.push({ id: 'role_' + Date.now(), label, code, rate });
  }

  saveRoles();
  bootstrap.Modal.getInstance(document.getElementById('roleModal')).hide();
  renderRolesTable();
}

function showRoleError(msg) {
  const el = document.getElementById('roleModalError');
  el.textContent = msg;
  el.classList.remove('d-none');
}

function deleteRole(roleId) {
  const role = roles.find(r => r.id === roleId);
  if (!role) return;
  showConfirm(
    `Delete the role "${role.label}"?\n\nWarning: if this role is used in a Cost Grid, the corresponding columns will remain but will no longer be linked to the registry.`,
    () => {
      roles = roles.filter(r => r.id !== roleId);
      saveRoles();
      renderRolesTable();
    },
    null,
    '🗑 Delete role'
  );
}

// ── IMPORT / EXPORT ──────────────────────────────────────────────────────────

function exportRoles() {
  const json = JSON.stringify(roles, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `roles_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importRoles() {
  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (!Array.isArray(imported)) throw new Error('Invalid format');
        showConfirm(
          `Import ${imported.length} roles? This will replace all existing roles.`,
          () => {
            roles = imported;
            saveRoles();
            renderRolesTable();
          },
          null,
          '⬆ Import roles'
        );
      } catch(err) {
        alert('JSON file error: ' + err.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}
