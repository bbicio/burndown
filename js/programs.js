// ── PROGRAMS MODULE ───────────────────────────────────────────────────────────
// Manages parent programs that group multiple projects.
// Each program: { id, name }
// Stored in localStorage under PROGRAMS_KEY.

const PROGRAMS_KEY = 'PDash_programs';

let _programs = [];
let _programEditId = null;

// ── PERSISTENCE ───────────────────────────────────────────────────────────────

async function loadProgramsFromApi() {
  try {
    _programs = await Api.programs.list();
  } catch(e) {
    // Fallback: load from localStorage
    try { _programs = JSON.parse(storageGet(PROGRAMS_KEY) || '[]'); } catch(_) { _programs = []; }
  }
}

function loadPrograms() {
  try { _programs = JSON.parse(storageGet(PROGRAMS_KEY) || '[]'); } catch(e) { _programs = []; }
}

function savePrograms() {
  // No-op: programs are now persisted via the API.
  // Kept for backward compatibility with backup restore (settings.js).
}

function getPrograms() {
  return _programs;
}

// ── MODAL ────────────────────────────────────────────────────────────────────

function showProgramsModal() {
  renderProgramsTable();
  bootstrap.Modal.getOrCreateInstance(document.getElementById('programsModal')).show();
}

function renderProgramsTable() {
  const tbody   = document.getElementById('programsTableBody');
  const emptyRow = document.getElementById('programsEmptyRow');
  Array.from(tbody.querySelectorAll('tr:not(#programsEmptyRow)')).forEach(r => r.remove());

  if (!_programs.length) { emptyRow.style.display = ''; return; }
  emptyRow.style.display = 'none';

  [..._programs].sort((a, b) => a.name.localeCompare(b.name)).forEach(prog => {
    const childCount = (config.projects || []).filter(p => p.programId === prog.id).length;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding:6px 10px;font-weight:600">${esc(prog.name)}</td>
      <td style="padding:6px 10px;font-family:monospace;font-size:var(--text-base);color:#555">${esc(prog.id)}</td>
      <td style="padding:6px 10px;color:#6c757d;font-size:var(--text-base)">${childCount} project${childCount===1?'':'s'}</td>
      <td style="padding:4px 8px;text-align:center">
        <div class="d-flex gap-1 justify-content-center">
          <button class="btn btn-outline-secondary btn-sm py-0 px-2 prog-edit-btn" style="font-size:var(--text-xs)">✏️</button>
          <button class="btn btn-outline-danger btn-sm py-0 px-2 prog-del-btn" style="font-size:var(--text-xs)">🗑</button>
        </div>
      </td>`;
    tr.querySelector('.prog-edit-btn').addEventListener('click', () => openProgramEditModal(prog.id));
    tr.querySelector('.prog-del-btn').addEventListener('click',  () => deleteProgram(prog.id));
    tbody.appendChild(tr);
  });
}

function openProgramEditModal(id) {
  _programEditId = id || null;
  const prog = id ? _programs.find(p => p.id === id) : null;
  document.getElementById('programModalTitle').textContent = prog ? '✏️ Edit program' : '➕ New program';
  document.getElementById('programName').value = prog?.name || '';
  document.getElementById('programId').value   = prog?.id   || '';
  document.getElementById('programModalError').classList.add('d-none');
  bootstrap.Modal.getOrCreateInstance(document.getElementById('programEditModal')).show();
}

async function saveProgramFromModal() {
  const name  = document.getElementById('programName').value.trim();
  const id    = document.getElementById('programId').value.trim();
  const errEl = document.getElementById('programModalError');
  errEl.classList.add('d-none');

  if (!name) { showProgramError('Name is required.'); return; }
  if (!id)   { showProgramError('Program ID is required.'); return; }

  const dup = _programs.find(p => p.id.toLowerCase() === id.toLowerCase() && p.id !== _programEditId);
  if (dup) { showProgramError(`ID "${id}" is already used by program "${dup.name}".`); return; }

  try {
    if (_programEditId) {
      await Api.programs.update(_programEditId, name);
      const idx = _programs.findIndex(p => p.id === _programEditId);
      if (idx >= 0) _programs[idx] = { id: _programEditId, name };
    } else {
      await Api.programs.create(id, name);
      _programs.push({ id, name });
    }
    bootstrap.Modal.getInstance(document.getElementById('programEditModal')).hide();
    renderProgramsTable();
    cfgRefreshProgramDropdown();
  } catch(err) {
    showProgramError(err.message || 'Save failed.');
  }
}

function showProgramError(msg) {
  const el = document.getElementById('programModalError');
  el.textContent = msg;
  el.classList.remove('d-none');
}

function deleteProgram(id) {
  const prog = _programs.find(p => p.id === id);
  if (!prog) return;
  const childCount = (config.projects || []).filter(p => p.programId === id).length;
  const warn = childCount > 0 ? `\n\n⚠️ ${childCount} linked project${childCount===1?'':'s'} will lose the program reference.` : '';
  showConfirm(
    `Delete program "${prog.name}"?${warn}`,
    async () => {
      try {
        await Api.programs.delete(id);
        _programs = _programs.filter(p => p.id !== id);
        renderProgramsTable();
        cfgRefreshProgramDropdown();
      } catch(err) {
        alert('Delete failed: ' + (err.message || 'Unknown error'));
      }
    }, null, '🗑 Delete program'
  );
}

// Called by config-form to refresh the program dropdown when programs change
function cfgRefreshProgramDropdown() {
  const sel = document.getElementById('cfgProgramId');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">— No program —</option>' +
    getPrograms().sort((a,b) => a.name.localeCompare(b.name)).map(p =>
      `<option value="${esc(p.id)}" ${p.id === current ? 'selected' : ''}>${esc(p.name)} (${esc(p.id)})</option>`
    ).join('');
}
