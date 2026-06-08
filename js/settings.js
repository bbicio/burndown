// ── SETTINGS MODAL ────────────────────────────────────────────────────────────

function openSettingsModal() {
  document.getElementById('stgAnthropicKey').value  = appSettings.anthropicApiKey || '';
  document.getElementById('stgOpenaiKey').value     = appSettings.openaiApiKey    || '';
  document.getElementById('stgGeminiKey').value     = appSettings.geminiApiKey    || '';
  document.getElementById('stgAiProvider').value    = appSettings.aiProvider      || 'anthropic';
  stgUpdateModelDropdown(appSettings.aiProvider || 'anthropic', appSettings.aiModel || '');
  document.getElementById('stgEmailjsKey').value      = appSettings.emailjsKey      || '';
  document.getElementById('stgEmailjsService').value  = appSettings.emailjsService  || '';
  document.getElementById('stgEmailjsTemplate').value = appSettings.emailjsTemplate || '';
  document.getElementById('stgGithubPat').value        = appSettings.githubPat        || '';
  // Reset to API tab
  document.querySelectorAll('.stg-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'api'));
  document.getElementById('stgTabApi').style.display  = 'block';
  document.getElementById('stgTabData').style.display = 'none';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('settingsModal')).show();
}

function stgUpdateModelDropdown(provider, selectedModel) {
  const sel = document.getElementById('stgAiModel');
  if (!sel) return;
  const models = AI_MODELS[provider] || [];
  sel.innerHTML = models.map(m =>
    `<option value="${m.id}"${m.id === selectedModel ? ' selected' : ''}>${m.label}</option>`
  ).join('');
  if (!sel.value && models.length) sel.value = models[0].id;
}

function saveSettingsModal() {
  appSettings.anthropicApiKey = document.getElementById('stgAnthropicKey').value.trim();
  appSettings.openaiApiKey    = document.getElementById('stgOpenaiKey').value.trim();
  appSettings.geminiApiKey    = document.getElementById('stgGeminiKey').value.trim();
  appSettings.aiProvider      = document.getElementById('stgAiProvider').value || 'anthropic';
  appSettings.aiModel         = document.getElementById('stgAiModel').value    || '';
  appSettings.emailjsKey      = document.getElementById('stgEmailjsKey').value.trim();
  appSettings.emailjsService  = document.getElementById('stgEmailjsService').value.trim();
  appSettings.emailjsTemplate = document.getElementById('stgEmailjsTemplate').value.trim();
  appSettings.githubPat       = document.getElementById('stgGithubPat').value.trim();
  persistSettings();
  updateAiButtonVisibility();
  bootstrap.Modal.getInstance(document.getElementById('settingsModal'))?.hide();
}

// ── DATA MANAGER ──────────────────────────────────────────────────────────────

function renderDataManager() {
  renderSyncPanel();
  const container = document.getElementById('stgDataManagerList');
  if (!container) return;

  const stores = [
    {
      key: CONFIG_KEY, label: 'Portfolio Config',
      desc: `${(config.projects || []).length} projects`,
      getData: () => config,
      onImport: data => { config = data; persistConfig(); showPortfolioView(); }
    },
    {
      key: 'PDash_roles', label: 'Roles',
      desc: `${getRoles().length} roles`,
      getData: () => getRoles(),
      onImport: data => { if (!Array.isArray(data)) throw new Error('Must be an array'); roles = data; saveRoles(); }
    },
    {
      key: 'PDash_cg_index', label: 'Cost Grids',
      desc: `${cgGetIndex().length} grids`,
      getData: () => { const idx = cgGetIndex(); return { index: idx, grids: idx.map(id => cgLoad(id)).filter(Boolean) }; },
      onImport: data => {
        if (!data.index || !data.grids) throw new Error('Invalid format');
        cgSaveIndex(data.index);
        data.grids.forEach(cg => cgSave(cg));
      }
    },
    {
      key: PROGRAMS_KEY, label: 'Programs',
      desc: `${getPrograms().length} program(s)`,
      getData: () => getPrograms(),
      onImport: data => { if (!Array.isArray(data)) throw new Error('Must be an array'); _programs = data; savePrograms(); }
    },
    {
      key: CLIENTS_KEY, label: 'Clients',
      desc: `${getClients().filter(c => c.id !== '__unassigned__').length} client(s)`,
      getData: () => _clients.filter(c => c.id !== '__unassigned__'),
      onImport: data => { if (!Array.isArray(data)) throw new Error('Must be an array'); _clients = data; saveClients(); }
    },
    {
      key: SETTINGS_KEY, label: 'App Settings (API keys)',
      desc: hasAiKey() ? 'AI key configured' : 'no AI key',
      getData: () => appSettings,
      onImport: data => { appSettings = { ...appSettings, ...data }; persistSettings(); updateAiButtonVisibility(); }
    },
    {
      key: SUMMARY_KEY, label: 'Portfolio Summary selection',
      desc: `${portfolioSummaryProjects.size} projects pinned`,
      getData: () => [...portfolioSummaryProjects],
      onImport: data => { portfolioSummaryProjects = new Set(data); saveSummarySelection(); }
    }
  ];

  container.innerHTML = stores.map((s, i) => {
    const raw = storageGet(s.key) || '';
    const kb  = raw ? (new Blob([raw]).size / 1024).toFixed(1) + ' KB' : '—';
    return `
      <div class="d-flex align-items-center gap-3 py-2 border-bottom flex-wrap" style="font-size:var(--text-md)">
        <div style="min-width:200px">
          <div class="fw-semibold">${s.label}</div>
          <div class="text-muted small">${s.desc} · ${kb}</div>
        </div>
        <div class="d-flex gap-2 ms-auto">
          <button class="btn btn-sm btn-outline-secondary" data-dm-dl="${i}">⬇ Download</button>
          <button class="btn btn-sm btn-outline-secondary" data-dm-import="${i}">⬆ Import</button>
        </div>
      </div>`;
  }).join('');

  // Wire download/import per-store
  container.querySelectorAll('[data-dm-dl]').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = stores[+btn.dataset.dmDl];
      const blob = new Blob([JSON.stringify(s.getData(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${s.label.toLowerCase().replace(/[^a-z0-9]+/g,'_')}_${new Date().toISOString().slice(0,10)}.json`;
      a.click(); URL.revokeObjectURL(a.href);
    });
  });

  container.querySelectorAll('[data-dm-import]').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = stores[+btn.dataset.dmImport];
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
      inp.onchange = e => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          try {
            const data = JSON.parse(ev.target.result);
            s.onImport(data);
            renderDataManager();
          } catch(err) { alert('Import error: ' + err.message); }
        };
        reader.readAsText(file);
      };
      inp.click();
    });
  });
}

function downloadFullBackup() {
  const cgIndex = cgGetIndex();
  const backup = {
    version: 1,
    created: new Date().toISOString(),
    stores: {
      config:    config,
      roles:     getRoles(),
      programs:  getPrograms(),
      clients:   _clients.filter(c => c.id !== '__unassigned__'),
      costgrids: { index: cgIndex, grids: cgIndex.map(id => cgLoad(id)).filter(Boolean) },
      settings:  appSettings,
      summary:   [...portfolioSummaryProjects]
    }
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `burndown_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(a.href);
}

function restoreFromBackup(file) {
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const backup = JSON.parse(ev.target.result);
      if (!backup.stores) throw new Error('Not a valid backup file (missing "stores" key)');
      showConfirm(
        'Restore from backup?\n\nThis will overwrite Portfolio Config, Roles, Cost Grids, App Settings and Summary selection.\nXLS data is not affected.',
        () => {
          const s = backup.stores;
          if (s.config)    { config = s.config; persistConfig(); }
          if (s.roles)     { roles = s.roles; saveRoles(); }
          if (s.programs)  { _programs = s.programs; savePrograms(); }
          if (s.clients)   { _clients  = s.clients;  saveClients();  }
          if (s.costgrids) { cgSaveIndex(s.costgrids.index || []); (s.costgrids.grids || []).forEach(cg => cgSave(cg)); }
          if (s.settings)  { appSettings = { ...appSettings, ...s.settings }; persistSettings(); updateAiButtonVisibility(); }
          if (s.summary)   { portfolioSummaryProjects = new Set(s.summary); saveSummarySelection(); }
          bootstrap.Modal.getInstance(document.getElementById('settingsModal'))?.hide();
          showPortfolioView();
        },
        null, '⬆ Restore Backup'
      );
    } catch(err) { alert('Restore error: ' + err.message); }
  };
  reader.readAsText(file);
}
