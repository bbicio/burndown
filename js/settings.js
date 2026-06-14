// ── SETTINGS MODAL ────────────────────────────────────────────────────────────

function _stgSet(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function openSettingsModal() {
  const user = window.__navUser;

  // Fill AI key fields (only on pages that have core.js / appSettings)
  if (typeof appSettings !== 'undefined') {
    _stgSet('stgAnthropicKey',  appSettings.anthropicApiKey || '');
    _stgSet('stgOpenaiKey',     appSettings.openaiApiKey    || '');
    _stgSet('stgGeminiKey',     appSettings.geminiApiKey    || '');
    _stgSet('stgAiProvider',    appSettings.aiProvider      || 'anthropic');
    stgUpdateModelDropdown(appSettings.aiProvider || 'anthropic', appSettings.aiModel || '');
    _stgSet('stgEmailjsKey',      appSettings.emailjsKey      || '');
    _stgSet('stgEmailjsService',  appSettings.emailjsService  || '');
    _stgSet('stgEmailjsTemplate', appSettings.emailjsTemplate || '');
    _stgSet('stgGithubPat',       appSettings.githubPat       || '');
  }

  // Show/hide admin-only elements
  const isAdmin = user?.role === 'admin';
  document.querySelectorAll('.stg-admin-only').forEach(el => {
    el.style.display = isAdmin ? '' : 'none';
  });

  // Set export email display
  document.querySelectorAll('.stg-export-email').forEach(el => {
    el.textContent = user?.email || '—';
  });

  // Reset to API tab
  document.querySelectorAll('.stg-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'api'));
  const tabApi  = document.getElementById('stgTabApi');
  const tabData = document.getElementById('stgTabData');
  if (tabApi)  tabApi.style.display  = 'block';
  if (tabData) tabData.style.display = 'none';

  bootstrap.Modal.getOrCreateInstance(document.getElementById('settingsModal')).show();
}

function stgUpdateModelDropdown(provider, selectedModel) {
  const sel = document.getElementById('stgAiModel');
  if (!sel) return;
  if (typeof AI_MODELS === 'undefined') return;
  const models = AI_MODELS[provider] || [];
  sel.innerHTML = models.map(m =>
    `<option value="${m.id}"${m.id === selectedModel ? ' selected' : ''}>${m.label}</option>`
  ).join('');
  if (!sel.value && models.length) sel.value = models[0].id;
}

function _stgGet(id) {
  return (document.getElementById(id)?.value || '').trim();
}

function saveSettingsModal() {
  if (typeof appSettings !== 'undefined') {
    appSettings.anthropicApiKey = _stgGet('stgAnthropicKey');
    appSettings.openaiApiKey    = _stgGet('stgOpenaiKey');
    appSettings.geminiApiKey    = _stgGet('stgGeminiKey');
    appSettings.aiProvider      = _stgGet('stgAiProvider') || 'anthropic';
    appSettings.aiModel         = _stgGet('stgAiModel');
    appSettings.emailjsKey      = _stgGet('stgEmailjsKey');
    appSettings.emailjsService  = _stgGet('stgEmailjsService');
    appSettings.emailjsTemplate = _stgGet('stgEmailjsTemplate');
    appSettings.githubPat       = _stgGet('stgGithubPat');
    if (typeof persistSettings === 'function') persistSettings();
  }
  if (typeof updateAiButtonVisibility === 'function') updateAiButtonVisibility();
  bootstrap.Modal.getInstance(document.getElementById('settingsModal'))?.hide();
}

// ── DATA EXPORTS ──────────────────────────────────────────────────────────────

async function stgExport(type) {
  const btn = document.getElementById(`btnExport_${type}`);
  const statusEl = document.getElementById('stgExportStatus');
  if (btn) btn.disabled = true;
  if (statusEl) { statusEl.style.display = 'none'; statusEl.className = 'alert py-2 px-3 small mt-2'; }

  try {
    const result = await apiFetch(`/exports/${type}`, { method: 'POST' });
    if (statusEl) {
      statusEl.textContent = `Export sent to ${result.email}`;
      statusEl.classList.add('alert-success');
      statusEl.style.display = 'block';
      setTimeout(() => { statusEl.style.display = 'none'; }, 5000);
    }
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = err.message || 'Export failed.';
      statusEl.classList.add('alert-danger');
      statusEl.style.display = 'block';
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── FULL BACKUP ───────────────────────────────────────────────────────────────

async function downloadFullBackup() {
  try {
    const [projects, roles, programs, clients, costGrids] = await Promise.all([
      apiFetch('/projects').catch(() => []),
      apiFetch('/roles').catch(() => []),
      apiFetch('/programs').catch(() => []),
      apiFetch('/clients').catch(() => []),
      apiFetch('/cost-grids').catch(() => []),
    ]);

    const backup = {
      version: 2,
      created: new Date().toISOString(),
      stores: { projects, roles, programs, clients, costGrids },
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pdash_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    alert('Backup failed: ' + (err.message || 'Unknown error'));
  }
}

// ── RESTORE FROM BACKUP ───────────────────────────────────────────────────────

function restoreFromBackup(file) {
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const backup = JSON.parse(ev.target.result);
      if (!backup.stores) throw new Error('Not a valid backup file (missing "stores" key)');

      const confirmFn = typeof showConfirm === 'function' ? showConfirm : (msg, cb) => { if (confirm(msg)) cb(); };
      confirmFn(
        'Restore from backup?\n\nThis will overwrite local data.\nXLS timesheet data is not affected.',
        () => {
          const s = backup.stores;
          if (typeof appSettings !== 'undefined') {
            if (s.config)    { if (typeof config !== 'undefined') { config = s.config; } if (typeof persistConfig === 'function') persistConfig(); }
            if (s.roles)     { if (typeof roles !== 'undefined')  { roles = s.roles; }  if (typeof saveRoles === 'function')    saveRoles(); }
            if (s.programs)  { if (typeof _programs !== 'undefined') { _programs = s.programs; } if (typeof savePrograms === 'function') savePrograms(); }
            if (s.clients)   { if (typeof _clients !== 'undefined')  { _clients  = s.clients;  } if (typeof saveClients === 'function')  saveClients(); }
            if (s.costgrids) {
              if (typeof cgSaveIndex === 'function') cgSaveIndex(s.costgrids.index || []);
              if (typeof cgSave === 'function') (s.costgrids.grids || []).forEach(cg => cgSave(cg));
            }
            if (s.settings)  { appSettings = { ...appSettings, ...s.settings }; if (typeof persistSettings === 'function') persistSettings(); if (typeof updateAiButtonVisibility === 'function') updateAiButtonVisibility(); }
            if (s.summary)   { if (typeof portfolioSummaryProjects !== 'undefined') portfolioSummaryProjects = new Set(s.summary); if (typeof saveSummarySelection === 'function') saveSummarySelection(); }
          }
          bootstrap.Modal.getInstance(document.getElementById('settingsModal'))?.hide();
          if (typeof showPortfolioView === 'function') showPortfolioView();
        },
        null, 'Restore Backup'
      );
    } catch(err) { alert('Restore error: ' + err.message); }
  };
  reader.readAsText(file);
}
