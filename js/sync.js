// ── REMOTE SYNC — GitHub Gist ─────────────────────────────────────────────────

const SYNC_KEY  = 'PDash_sync';
const GIST_FILE = 'pdash_backup.json';
const GIST_API  = 'https://api.github.com/gists';

function getSyncMeta() {
  try { return JSON.parse(localStorage.getItem(SYNC_KEY) || '{}'); } catch { return {}; }
}

function _writeSyncMeta(meta) {
  // Direct write — must NOT call storageSet to avoid triggering localChangedAt
  try { localStorage.setItem(SYNC_KEY, JSON.stringify(meta)); } catch(e) {}
}

function syncGetPat() {
  return appSettings.githubPat || '';
}

function syncFmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Keys included in the sync payload
function syncBuildPayload() {
  const payload = {};
  Object.keys(localStorage).forEach(k => {
    if (k === SYNC_KEY)                   return; // sync metadata
    if (k === SETTINGS_KEY)               return; // API keys — don't sync (security)
    if (k.startsWith('PDash_data_'))      return; // XLS uploads — too large
    if (k.startsWith('PDash_') || k.startsWith('reforecast_snapshot_')) {
      try      { payload[k] = JSON.parse(localStorage.getItem(k)); }
      catch(e) { payload[k] = localStorage.getItem(k); }
    }
  });
  return payload;
}

// ── PUSH ──────────────────────────────────────────────────────────────────────

async function syncPush() {
  const pat = syncGetPat();
  if (!pat) {
    alert('GitHub Personal Access Token not configured.\nGo to Settings → API → GitHub PAT.');
    return;
  }

  const btn = document.getElementById('btnSyncPush');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Pushing…'; }

  try {
    const meta    = getSyncMeta();
    const content = JSON.stringify(syncBuildPayload(), null, 2);
    const headers = {
      'Authorization': `token ${pat}`,
      'Content-Type':  'application/json',
      'Accept':        'application/vnd.github.v3+json',
    };
    const body = JSON.stringify({
      description: 'PDash remote backup',
      public: false,
      files: { [GIST_FILE]: { content } },
    });

    let resp = await fetch(
      meta.gistId ? `${GIST_API}/${meta.gistId}` : GIST_API,
      { method: meta.gistId ? 'PATCH' : 'POST', headers, body }
    );

    // Gist deleted on GitHub — retry as new
    if (resp.status === 404 && meta.gistId) {
      delete meta.gistId; delete meta.gistUrl;
      _writeSyncMeta(meta);
      resp = await fetch(GIST_API, { method: 'POST', headers, body });
    }

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(`GitHub ${resp.status}: ${err.message || resp.statusText}`);
    }

    const gist = await resp.json();
    meta.gistId       = gist.id;
    meta.gistUrl      = gist.html_url;
    meta.lastPushedAt = new Date().toISOString();
    _writeSyncMeta(meta);
    renderSyncPanel();
  } catch(e) {
    alert('Push failed: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⬆ Push'; }
  }
}

// ── FIND EXISTING REMOTE ──────────────────────────────────────────────────────

async function syncFindRemote() {
  const pat = syncGetPat();
  if (!pat) {
    alert('GitHub Personal Access Token not configured.\nGo to Settings → API → GitHub PAT.');
    return;
  }

  const btn = document.getElementById('btnSyncFind');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Searching…'; }

  try {
    const resp = await fetch(`${GIST_API}?per_page=100`, {
      headers: {
        'Authorization': `token ${pat}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    if (!resp.ok) throw new Error(`GitHub ${resp.status}: ${resp.statusText}`);

    const gists = await resp.json();
    const found = gists.find(g => g.description === 'PDash remote backup' && g.files?.[GIST_FILE]);

    if (!found) {
      alert('No existing PDash remote backup found.\nUse ⬆ Push to create one, or enter the Gist ID manually.');
      return;
    }

    const meta = getSyncMeta();
    meta.gistId  = found.id;
    meta.gistUrl = found.html_url;
    _writeSyncMeta(meta);
    renderSyncPanel();
    syncPull();
  } catch(e) {
    alert('Search failed: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔍 Find existing remote'; }
  }
}

// ── LINK MANUAL GIST ID ───────────────────────────────────────────────────────

function syncLinkManual() {
  const input = document.getElementById('syncManualGistId');
  const id = input?.value.trim();
  if (!id) { alert('Please enter a Gist ID.'); return; }

  const meta = getSyncMeta();
  meta.gistId  = id;
  meta.gistUrl = `https://gist.github.com/${id}`;
  _writeSyncMeta(meta);
  renderSyncPanel();
  syncPull();
}

// ── PULL ──────────────────────────────────────────────────────────────────────

async function syncPull() {
  const pat = syncGetPat();
  if (!pat) {
    alert('GitHub Personal Access Token not configured.\nGo to Settings → API → GitHub PAT.');
    return;
  }
  const meta = getSyncMeta();
  if (!meta.gistId) {
    alert('No remote found. Push first to create a remote backup, or use Find to connect to an existing one.');
    return;
  }

  const btn = document.getElementById('btnSyncPull');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Fetching…'; }

  try {
    const resp = await fetch(`${GIST_API}/${meta.gistId}`, {
      headers: {
        'Authorization': `token ${pat}`,
        'Accept':        'application/vnd.github.v3+json',
      },
    });
    if (!resp.ok) throw new Error(`GitHub ${resp.status}: ${resp.statusText}`);

    const gist = await resp.json();
    const raw  = gist.files?.[GIST_FILE]?.content;
    if (!raw) throw new Error(`File "${GIST_FILE}" not found in Gist.`);
    const remote = JSON.parse(raw);

    const remoteAt  = gist.updated_at;
    const pushedAt  = meta.lastPushedAt;
    const changedAt = meta.localChangedAt;
    const unsaved   = changedAt && (!pushedAt || changedAt > pushedAt);

    // Populate confirm modal
    document.getElementById('syncPullRemoteDate').textContent  = syncFmt(remoteAt);
    document.getElementById('syncPullPushedDate').textContent  = syncFmt(pushedAt);
    document.getElementById('syncPullChangedDate').textContent = syncFmt(changedAt);
    document.getElementById('syncPullWarn').style.display      = unsaved ? '' : 'none';

    window._syncPendingRemote = remote;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('syncPullModal')).show();
  } catch(e) {
    alert('Pull failed: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⬇ Pull'; }
  }
}

function syncConfirmPull() {
  const remote = window._syncPendingRemote;
  if (!remote) return;
  delete window._syncPendingRemote;

  // Smart merge: keys from remote overwrite local; keys only in local are kept
  Object.entries(remote).forEach(([k, v]) => {
    try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch(e) {}
  });

  const meta = getSyncMeta();
  meta.lastPulledAt = new Date().toISOString();
  _writeSyncMeta(meta);

  bootstrap.Modal.getInstance(document.getElementById('syncPullModal'))?.hide();
  location.reload();
}

// ── PANEL ─────────────────────────────────────────────────────────────────────

function renderSyncPanel() {
  const panel = document.getElementById('stgSyncPanel');
  if (!panel) return;

  const meta    = getSyncMeta();
  const hasPat  = !!syncGetPat();
  const hasGist = !!meta.gistId;
  const unsaved = meta.localChangedAt && (!meta.lastPushedAt || meta.localChangedAt > meta.lastPushedAt);

  const statusBadge = !hasPat
    ? `<span class="badge bg-secondary">No PAT configured</span>`
    : !hasGist
    ? `<span class="badge bg-warning text-dark">Not synced yet — push to start</span>`
    : unsaved
    ? `<span class="badge bg-warning text-dark">⚠ Unsaved local changes</span>`
    : `<span class="badge bg-success">✓ Up to date</span>`;

  panel.innerHTML = `
    <div class="cfg-section mb-4">
      <div class="cfg-section-title">☁️ Remote Sync — GitHub Gist</div>
      <div class="d-flex align-items-center gap-3 mb-3 flex-wrap">
        ${statusBadge}
        ${hasGist ? `<a href="${esc(meta.gistUrl)}" target="_blank" rel="noopener" class="small" style="font-size:var(--text-sm)">🔗 Open Gist</a>` : ''}
      </div>
      <div style="font-size:var(--text-base)" class="mb-3">
        <div class="d-flex gap-2 mb-1">
          <span class="text-muted" style="min-width:150px">Last pushed</span>
          <span class="fw-semibold">${syncFmt(meta.lastPushedAt)}</span>
        </div>
        <div class="d-flex gap-2 mb-1">
          <span class="text-muted" style="min-width:150px">Last pulled</span>
          <span class="fw-semibold">${syncFmt(meta.lastPulledAt)}</span>
        </div>
        ${hasGist ? `<div class="d-flex gap-2 mt-2">
          <span class="text-muted" style="min-width:150px">Gist ID</span>
          <code style="font-size:var(--text-sm)">${esc(meta.gistId)}</code>
        </div>` : ''}
      </div>
      ${!hasGist ? `
      <div class="d-flex gap-2 flex-wrap align-items-center mb-2">
        <button class="btn btn-sm btn-outline-primary" id="btnSyncFind" ${!hasPat ? 'disabled' : ''}>🔍 Find existing remote</button>
        <button class="btn btn-sm btn-primary" id="btnSyncPush" ${!hasPat ? 'disabled' : ''}>⬆ Push (create new)</button>
      </div>
      <div class="d-flex gap-2 align-items-center flex-wrap" style="font-size:var(--text-base)">
        <span class="text-muted">Or enter Gist ID manually:</span>
        <input type="text" id="syncManualGistId" class="form-control form-control-sm" style="max-width:260px" placeholder="e.g. abc123def456…" ${!hasPat ? 'disabled' : ''}>
        <button class="btn btn-sm btn-outline-secondary" id="btnSyncLinkManual" ${!hasPat ? 'disabled' : ''}>Connect</button>
      </div>` : `
      <div class="d-flex gap-2 flex-wrap align-items-center">
        <button class="btn btn-sm btn-primary" id="btnSyncPush">⬆ Push</button>
        <button class="btn btn-sm btn-outline-primary" id="btnSyncPull">⬇ Pull</button>
        <button class="btn btn-link btn-sm text-muted p-0 ms-1" id="btnSyncReset" style="font-size:var(--text-sm)">Unlink remote</button>
      </div>`}

      <p class="text-muted mt-2 mb-0" style="font-size:var(--text-sm)">
        Syncs: config, cost grids, programs, clients, roles, summary.<br>
        Excludes: XLS uploads (re-load manually) · API keys (enter on each device).
      </p>
    </div>`;

  document.getElementById('btnSyncPush')?.addEventListener('click', syncPush);
  document.getElementById('btnSyncPull')?.addEventListener('click', syncPull);
  document.getElementById('btnSyncFind')?.addEventListener('click', syncFindRemote);
  document.getElementById('btnSyncLinkManual')?.addEventListener('click', syncLinkManual);
  document.getElementById('btnSyncReset')?.addEventListener('click', () => {
    showConfirm(
      'Remove the remote link?\n\nLocal data is not affected. The Gist on GitHub will NOT be deleted.',
      () => {
        const m = getSyncMeta();
        delete m.gistId; delete m.gistUrl;
        delete m.lastPushedAt; delete m.lastPulledAt;
        _writeSyncMeta(m);
        renderSyncPanel();
      }
    );
  });
}
