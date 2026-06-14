// ── CONFIG FORM ───────────────────────────────────────────────────────────────
// ── CONFIG FORM ────────────────────────────────────────────────────────────────
let cfgEditConfig = null;
let cfgProjectIdx = -1;
let cfgActiveTab  = 'form';

function openConfigModal(projectId) {
  cfgEditConfig = JSON.parse(JSON.stringify(config));
  if (!Array.isArray(cfgEditConfig.projects)) cfgEditConfig.projects = [];
  document.getElementById('cfgJsonError').classList.add('d-none');
  cfgActiveTab = 'form';
  document.getElementById('cfgTabForm').style.display = 'block';
  document.getElementById('cfgTabJson').style.display = 'none';
  document.querySelectorAll('.cfg-tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === 'form'));
  cfgPopulateProjectDropdown();

  // Pre-select the given project if provided, otherwise default to first
  let startIdx = cfgEditConfig.projects.length > 0 ? 0 : -1;
  if (projectId) {
    const found = cfgEditConfig.projects.findIndex(
      p => p.id && p.id.trim().toLowerCase() === projectId.trim().toLowerCase()
    );
    if (found >= 0) startIdx = found;
  }
  cfgSelectProject(startIdx);

  if (!window.__cfgFullPage) {
    new bootstrap.Modal(document.getElementById('configModal')).show();
  }
}

function cfgUpdateModelDropdown(provider, selectedModel) {
  const sel = document.getElementById('cfgAiModel');
  if (!sel) return;
  const models = AI_MODELS[provider] || [];
  sel.innerHTML = models.map(m =>
    `<option value="${m.id}"${m.id === selectedModel ? ' selected' : ''}>${m.label}</option>`
  ).join('');
  if (!sel.value && models.length) sel.value = models[0].id;
}

function cfgPopulateProjectDropdown() {
  const sel = document.getElementById('cfgProjectSel');
  sel.innerHTML = '';
  if (!cfgEditConfig.projects.length) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = '— No projects —';
    sel.appendChild(o);
    return;
  }
  cfgEditConfig.projects.forEach((p, i) => {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = p.name || p.id || `Project ${i + 1}`;
    sel.appendChild(o);
  });
}

function cfgSelectProject(idx) {
  cfgProjectIdx = idx;
  const has = idx >= 0 && idx < cfgEditConfig.projects.length;
  document.getElementById('cfgFormSections').style.display = has ? 'block' : 'none';
  document.getElementById('cfgNoProjectMsg').style.display = has ? 'none'  : 'block';
  document.getElementById('cfgBtnDelProject').disabled = !has;
  if (has) {
    document.getElementById('cfgProjectSel').value = idx;
    cfgLoadProject(cfgEditConfig.projects[idx]);
  }
}

function cfgSaveCurrentToState() {
  if (cfgProjectIdx < 0 || cfgProjectIdx >= cfgEditConfig.projects.length) return;
  cfgEditConfig.projects[cfgProjectIdx] = cfgReadFormProject();
}

// ── LOAD / READ PROJECT ────────────────────────────────────────────────────────
function cfgLoadProject(proj) {
  document.getElementById('cfgId').value        = proj.id       || '';
  document.getElementById('cfgName').value      = proj.name     || '';
  document.getElementById('cfgStartDate').value = ym2month(proj.startDate);
  document.getElementById('cfgEndDate').value   = ym2month(proj.endDate);
  document.getElementById('cfgCurrency').value  = proj.currency || '€';
  const effectivePipeline = getProjectPipeline(proj.id) || proj.pipeline || '';
  document.getElementById('cfgPipeline').value = effectivePipeline;
  const hasCgRef = !!(proj.costGridRef?.cgId);
  const pipelineSel = document.getElementById('cfgPipeline');
  pipelineSel.disabled = hasCgRef;
  pipelineSel.title    = hasCgRef ? 'Pipeline is managed from the Cost Grid' : '';
  cfgApplyPipelineRules(effectivePipeline, proj.status || '');
  // Panel 0: program assignment
  cfgRefreshProgramDropdown();
  const progSel = document.getElementById('cfgProgramId');
  if (progSel) progSel.value = proj.programId || '';
  cfgRefreshClientDropdown();
  const clientSel = document.getElementById('cfgClientId');
  if (clientSel) clientSel.value = proj.clientId || '__unassigned__';
  cfgRenderTasks(proj.tasks    || []);
  cfgRenderPhasingGrid(proj.phasing  || {});
  cfgRenderPlanningGrid(proj.planning || {});
  cfgRenderPtcList(proj.ptc    || []);
  cfgRenderGroups(proj.groups  || []);
  cfgSyncRollbackButtons();
  cfgRenderCostGridRef(proj.costGridRef);
}

function cfgReadFormProject() {
  const existing = cfgProjectIdx >= 0 ? cfgEditConfig.projects[cfgProjectIdx] : null;
  return {
    id:           document.getElementById('cfgId').value.trim(),
    name:         document.getElementById('cfgName').value.trim(),
    startDate:    month2ym(document.getElementById('cfgStartDate').value),
    endDate:      month2ym(document.getElementById('cfgEndDate').value),
    currency:     document.getElementById('cfgCurrency').value,
    pipeline:     document.getElementById('cfgPipeline').disabled
                    ? (getProjectPipeline(document.getElementById('cfgId').value) || document.getElementById('cfgPipeline').value)
                    : document.getElementById('cfgPipeline').value,
    status:       document.getElementById('cfgStatus').value,
    tasks:        cfgReadTasks(),
    phasing:      cfgReadGrid('cfg-phasing-input'),
    planning:     cfgReadGrid('cfg-planning-input'),
    ptc:          cfgReadPtcList(),
    groups:       cfgReadGroups(),
    costGridRef:  existing?.costGridRef || null,
    programId:    document.getElementById('cfgProgramId')?.value || null,
    clientId:     document.getElementById('cfgClientId')?.value || '__unassigned__',
  };
}

function cfgRenderCostGridRef(ref) {
  let el = document.getElementById('cfgCostGridRefBadge');
  if (!ref || !ref.cgId) {
    if (el) el.remove();
    return;
  }
  const cg = cgLoad(ref.cgId);
  const cgName  = cg?.name || ref.cgId;
  const version = cg?.versions.find(v => v.versionId === ref.versionId);
  const verLabel = version?.versionLabel || ref.versionId;
  if (!el) {
    el = document.createElement('div');
    el.id = 'cfgCostGridRefBadge';
    const anchor = document.getElementById('cfgId')?.closest('.mb-2, .row, .mb-3');
    if (anchor) anchor.after(el);
    else document.getElementById('cfgFormSections')?.prepend(el);
  }
  el.innerHTML = `
    <div class="alert alert-info py-2 px-3 mb-2 d-flex align-items-center gap-2" style="font-size:var(--text-base)">
      <span>📋</span>
      <span>Generated from Cost Grid <strong>${esc(cgName)}</strong> — version <strong>${esc(verLabel)}</strong></span>
      <button class="btn btn-sm btn-outline-secondary py-0 px-2 ms-auto" style="font-size:var(--text-xs)"
        onclick="bootstrap.Modal.getInstance(document.getElementById('configModal'))?.hide(); showCostGridEditorView('${esc(ref.cgId)}','${esc(ref.versionId)}')">
        Open →
      </button>
    </div>`;
}

function cfgMarkDirty() {
  // Called when a config form field changes; no-op here (state is read on save).
}

function cfgRenderTasks(tasks) {
  const c = document.getElementById('cfgTaskList');
  c.innerHTML = '';
  tasks.forEach(t => c.appendChild(cfgMakeTaskCard(t)));
  cfgUpdateGrandTotals();
}

// ── MONTHLY % DISTRIBUTION ────────────────────────────────────────────────────

function cfgTaskMonthRange(startYMD, endYMD) {
  const projStart = month2ym(document.getElementById('cfgStartDate').value);
  const projEnd   = month2ym(document.getElementById('cfgEndDate').value);
  const s = startYMD || (projStart ? projStart + '01' : '');
  const e = endYMD   || (projEnd   ? projEnd   + '01' : '');
  if (!s || !e) return [];
  const tStart = parseTaskDate(s, false);
  const tEnd   = parseTaskDate(e, true);
  const months = [];
  let cy = tStart.getFullYear(), cm = tStart.getMonth() + 1;
  const ey = tEnd.getFullYear(), em = tEnd.getMonth() + 1;
  while (cy < ey || (cy === ey && cm <= em)) {
    months.push(`${cy}${String(cm).padStart(2, '0')}`);
    cm++; if (cm > 12) { cm = 1; cy++; }
  }
  return months;
}

function cfgUpdateDistSum(card) {
  let sum = 0;
  card.querySelectorAll('.cfg-dist-input').forEach(inp => { sum += parseFloat(inp.value) || 0; });
  const badge = card.querySelector('.cfg-dist-sum');
  if (!badge) return;
  const rounded = Math.round(sum * 10) / 10;
  if (Math.abs(sum - 100) < 0.05) {
    badge.className = 'cfg-dist-sum badge bg-success';
    badge.textContent = 'Σ = 100%';
  } else if (sum > 100) {
    badge.className = 'cfg-dist-sum badge bg-danger';
    badge.textContent = `Σ = ${rounded}% (${Math.round((sum - 100) * 10) / 10}% too much)`;
  } else {
    badge.className = 'cfg-dist-sum badge bg-warning text-dark';
    badge.textContent = `Σ = ${rounded}% (${Math.round((100 - sum) * 10) / 10}% missing)`;
  }
}

function cfgRebuildDistUI(card, existingDist) {
  const startVal    = card.querySelector('.cfg-task-start').value;
  const endVal      = card.querySelector('.cfg-task-end').value;
  const isCompleted = card.querySelector('.cfg-task-completed').checked;
  const months      = cfgTaskMonthRange(date2ymd(startVal), date2ymd(endVal));
  const container   = card.querySelector('.cfg-task-dist-container');
  if (!months.length) { container.innerHTML = ''; return; }

  const isSingle  = months.length === 1;
  const hasSnap   = cfgHasReforecastSnapshot();
  const now       = new Date();
  const currentYM = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  const cells = months.map(ym => {
    const [y, m] = [parseInt(ym.slice(0, 4)), parseInt(ym.slice(4, 6))];
    const label   = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const val     = isSingle ? 100 : (existingDist[ym] != null ? existingDist[ym] : '');
    const isPast  = hasSnap && ym < currentYM;
    const ro      = isSingle || isCompleted || isPast ? ' readonly' : '';
    const bg      = isPast ? 'background:#f0f0f0;' : '';
    return `<div class="cfg-month-cell">
      <div class="cfg-month-label">${label}</div>
      <div class="d-flex align-items-center gap-1">
        <input type="number" class="form-control form-control-sm text-end cfg-dist-input"
               data-ym="${ym}" min="0" max="100" step="1" value="${val}" placeholder="0" style="${bg}"${ro}>
        <span style="font-size:var(--text-xs);color:#888">%</span>
      </div>
    </div>`;
  }).join('');

  const note = isSingle ? ' <span class="text-muted" style="font-size:var(--text-sm)">(single month)</span>'
             : isCompleted ? ' <span class="text-muted" style="font-size:var(--text-sm)">(completed — locked)</span>'
             : hasSnap ? ' <span class="text-muted" style="font-size:var(--text-sm)">(past months locked — reforecast applied)</span>' : '';

  container.innerHTML = `
    <div class="mt-1 pt-2" style="border-top:1px solid #e9ecef">
      <div class="d-flex align-items-center gap-2 mb-1">
        <span class="text-muted small">Monthly % distribution:</span>
        <span class="cfg-dist-sum badge bg-secondary">Σ = 0%</span>${note}
      </div>
      <div class="cfg-month-grid">${cells}</div>
    </div>`;

  cfgUpdateDistSum(card);
  if (!isSingle && !isCompleted) {
    container.querySelectorAll('.cfg-dist-input:not([readonly])').forEach(inp => {
      inp.addEventListener('input', () => cfgUpdateDistSum(card));
    });
  }
}

function cfgMakeTaskCard(task) {
  const card = document.createElement('div');
  card.className = 'cfg-task-card border rounded p-3 mb-3';
  const isBillable = task.billable !== false;
  card.innerHTML = `
    <div class="d-flex align-items-center gap-2 mb-3">
      <span class="text-muted small text-nowrap">Task name:</span>
      <input type="text" class="form-control form-control-sm cfg-task-name fw-semibold"
             placeholder="must match Task/Issue column in XLS"
             value="${esc(task.name || '')}">
      <div class="form-check form-switch mb-0 flex-shrink-0 d-flex align-items-center gap-1" title="Uncheck to exclude this task from all reports and charts">
        <input class="form-check-input cfg-task-billable" type="checkbox" role="switch" ${isBillable ? 'checked' : ''}>
        <label class="form-check-label small text-nowrap">Include in report</label>
      </div>
      <div class="form-check form-switch mb-0 flex-shrink-0 d-flex align-items-center gap-1" title="Mark task as completed">
        <input class="form-check-input cfg-task-completed" type="checkbox" role="switch" ${task.completed ? 'checked' : ''}>
        <label class="form-check-label small text-nowrap">Completed</label>
      </div>
      <button class="btn btn-sm btn-outline-danger flex-shrink-0 cfg-btn-del-task">🗑 Remove</button>
    </div>
    <div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
      <span class="text-muted small text-nowrap">Period:</span>
      <input type="date" class="form-control form-control-sm cfg-task-start" style="width:160px"
             value="${ymd2date(task.startDate || '')}">
      <span class="text-muted small">→</span>
      <input type="date" class="form-control form-control-sm cfg-task-end" style="width:160px"
             value="${ymd2date(task.endDate || '')}">
      <span class="text-muted small">(optional — defaults to project dates)</span>
    </div>
    <div class="cfg-task-dist-container mb-2"></div>
    <div class="table-responsive mb-2">
      <table class="table table-sm table-bordered mb-0" style="table-layout:fixed;width:100%">
        <colgroup>
          <col>
          <col style="width:110px">
          <col style="width:110px">
          <col style="width:110px">
          <col style="width:32px">
        </colgroup>
        <thead style="background:var(--surface-light)">
          <tr>
            <th>Job Role: Name <span class="fw-normal text-muted small">(must match XLS)</span></th>
            <th class="text-end">Sold Hours</th>
            <th class="text-end">Hourly Rate</th>
            <th class="text-end">Subtotal</th>
            <th></th>
          </tr>
        </thead>
        <tbody class="cfg-res-tbody">
          ${(task.resources || []).map(cfgResRowHTML).join('')}
        </tbody>
        <tfoot>
          <tr style="background:var(--surface-light)">
            <td colspan="3" class="text-end small fw-bold py-1">Task total</td>
            <td class="text-end fw-bold cfg-task-total py-1">—</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <button class="btn btn-sm btn-primary cfg-add-res-btn">+ Add resource</button>`;

  const updateTotals = () => cfgUpdateTaskTotals(card);

  card.querySelector('.cfg-btn-del-task').addEventListener('click', () => {
    const name = card.querySelector('.cfg-task-name').value.trim() || 'this task';
    showConfirm(`Delete task "${name}" and all its resources?`, () => { card.remove(); cfgUpdateGrandTotals(); });
  });
  card.querySelector('.cfg-add-res-btn').addEventListener('click', () => {
    const tr = document.createElement('tr');
    tr.innerHTML = cfgResRowHTML({ role: '', soldHours: 0, hourlyRate: 0 });
    cfgBindResRow(tr, updateTotals);
    card.querySelector('.cfg-res-tbody').appendChild(tr);
    updateTotals();
  });
  card.querySelectorAll('.cfg-res-tbody tr').forEach(tr => cfgBindResRow(tr, updateTotals));
  updateTotals();

  // Monthly % distribution
  const captureAndRebuild = () => {
    const saved = {};
    card.querySelectorAll('.cfg-dist-input').forEach(inp => {
      const v = parseFloat(inp.value) || 0;
      if (v > 0) saved[inp.dataset.ym] = v;
    });
    cfgRebuildDistUI(card, saved);
  };
  card.querySelector('.cfg-task-start').addEventListener('change', captureAndRebuild);
  card.querySelector('.cfg-task-end').addEventListener('change', captureAndRebuild);
  card.querySelector('.cfg-task-completed').addEventListener('change', captureAndRebuild);
  cfgRebuildDistUI(card, task.monthlyDistribution || {});

  return card;
}

function cfgUpdateTaskTotals(card) {
  const cur = document.getElementById('cfgCurrency')?.value || '€';
  const fmt = n => cfgFmtMoney(n, cur);
  let total = 0;
  card.querySelectorAll('.cfg-res-tbody tr').forEach(tr => {
    const h   = parseFloat(tr.querySelector('.cfg-res-hours').value) || 0;
    const r   = parseFloat(tr.querySelector('.cfg-res-rate').value)  || 0;
    const sub = h * r;
    total += sub;
    tr.querySelector('.cfg-res-subtotal').textContent = sub > 0 ? fmt(sub) : '—';
  });
  card.querySelector('.cfg-task-total').textContent = total > 0 ? fmt(total) : '—';
  cfgUpdateGrandTotals();
}

function cfgUpdateGrandTotals() {
  const cur = document.getElementById('cfgCurrency')?.value || '€';
  const fmt = n => cfgFmtMoney(n, cur);
  let totalHours = 0, totalBudget = 0;
  document.querySelectorAll('.cfg-task-card .cfg-res-tbody tr').forEach(tr => {
    const h     = parseFloat(tr.querySelector('.cfg-res-hours').value) || 0;
    const r     = parseFloat(tr.querySelector('.cfg-res-rate').value)  || 0;
    totalHours  += h;
    totalBudget += h * r;
  });
  const hoursEl  = document.getElementById('cfgGrandTotalHours');
  const budgetEl = document.getElementById('cfgGrandTotalBudget');
  if (hoursEl)  hoursEl.textContent  = totalHours  > 0 ? totalHours.toLocaleString('en-US')  : '—';
  if (budgetEl) budgetEl.textContent = totalBudget > 0 ? fmt(totalBudget) : '—';
  let totalPtc = 0;
  document.querySelectorAll('.cfg-ptc-card .cfg-ptc-amount').forEach(el => {
    totalPtc += cfgParseMoney(el.value);
  });
  const ptcEl = document.getElementById('cfgGrandTotalPtc');
  if (ptcEl) ptcEl.textContent = totalPtc > 0 ? fmt(totalPtc) : '—';
  cfgUpdateGridTotals(totalBudget, totalHours);
}

function cfgUpdateGridTotals(totalBudget, totalHours) {
  const cur = document.getElementById('cfgCurrency')?.value || '€';
  const fmt = n => cfgFmtMoney(n, cur);

  let phasingSum = 0;
  document.querySelectorAll('.cfg-phasing-input').forEach(inp => { phasingSum += cfgParseMoney(inp.value); });
  const phasingTotalEl = document.getElementById('cfgPhasingTotal');
  if (phasingTotalEl) {
    const ref = totalBudget > 0 ? ` / ${fmt(totalBudget)}` : '';
    phasingTotalEl.textContent = (phasingSum > 0 ? fmt(phasingSum) : '—') + ref;
  }

  let planningSum = 0;
  document.querySelectorAll('.cfg-planning-input').forEach(inp => { planningSum += cfgParseMoney(inp.value); });
  const planningTotalEl = document.getElementById('cfgPlanningTotal');
  if (planningTotalEl) {
    const ref = totalHours > 0 ? ` / ${totalHours.toLocaleString('en-US')} h` : '';
    planningTotalEl.textContent = (planningSum > 0 ? `${planningSum.toLocaleString('en-US')} h` : '—') + ref;
  }
}

function cfgResRowHTML(r) {
  return `<tr>
    <td><input type="text" class="form-control form-control-sm cfg-res-role"
               placeholder="e.g. HWGDEV - DEVELOPER" value="${esc(r.role || '')}"></td>
    <td><input type="number" class="form-control form-control-sm text-end cfg-res-hours"
               min="0" step="0.5" value="${r.soldHours ?? 0}"></td>
    <td><input type="number" class="form-control form-control-sm text-end cfg-res-rate"
               min="0" step="1" value="${r.hourlyRate ?? 0}"></td>
    <td class="text-end cfg-res-subtotal small fw-semibold align-middle">—</td>
    <td class="text-center"><button class="btn btn-sm btn-link text-danger p-0">✕</button></td>
  </tr>`;
}

function cfgBindResRow(tr, onUpdate) {
  tr.querySelector('button').addEventListener('click', () => {
    const role = tr.querySelector('.cfg-res-role').value.trim() || 'this resource';
    showConfirm(`Remove resource "${role}"?`, () => { tr.remove(); onUpdate?.(); });
  });
  if (onUpdate) {
    tr.querySelector('.cfg-res-hours').addEventListener('input', onUpdate);
    tr.querySelector('.cfg-res-rate').addEventListener('input', onUpdate);
  }
}

function cfgReadTasks() {
  return [...document.querySelectorAll('.cfg-task-card')].map(card => {
    const dist = {};
    card.querySelectorAll('.cfg-dist-input').forEach(inp => {
      const v = parseFloat(inp.value) || 0;
      if (v > 0) dist[inp.dataset.ym] = v;
    });
    return {
      name:               card.querySelector('.cfg-task-name').value.trim(),
      billable:           card.querySelector('.cfg-task-billable').checked,
      completed:          card.querySelector('.cfg-task-completed').checked,
      startDate:          date2ymd(card.querySelector('.cfg-task-start').value),
      endDate:            date2ymd(card.querySelector('.cfg-task-end').value),
      monthlyDistribution: Object.keys(dist).length ? dist : undefined,
      resources: [...card.querySelectorAll('.cfg-res-tbody tr')].map(tr => ({
        role:       tr.querySelector('.cfg-res-role').value.trim(),
        soldHours:  parseFloat(tr.querySelector('.cfg-res-hours').value) || 0,
        hourlyRate: parseFloat(tr.querySelector('.cfg-res-rate').value)  || 0,
      })).filter(r => r.role),
    };
  });
}

function cfgGetMonthRange() {
  const s = document.getElementById('cfgStartDate').value;
  const e = document.getElementById('cfgEndDate').value;
  if (!s || !e) return [];
  const [sy, sm] = s.split('-').map(Number);
  const [ey, em] = e.split('-').map(Number);
  const months = [];
  let cy = sy, cm = sm;
  while (cy < ey || (cy === ey && cm <= em)) {
    months.push(`${cy}${String(cm).padStart(2, '0')}`);
    cm++; if (cm > 12) { cm = 1; cy++; }
  }
  return months;
}

function cfgGridFooterHTML(totalId) {
  return `<div class="d-flex align-items-center gap-2 mt-2" style="font-size:var(--text-base)">
    <span class="text-muted">=</span>
    <strong id="${totalId}">—</strong>
  </div>`;
}

function cfgRenderPhasingGrid(phasing) {
  const months = cfgGetMonthRange();
  const pastRO = cfgHasReforecastSnapshot();
  const el = document.getElementById('cfgPhasingGrid');
  el.innerHTML = months.length
    ? cfgGridHTML(months, phasing, 'cfg-phasing-input', 'currency', pastRO) + cfgGridFooterHTML('cfgPhasingTotal')
    : '<p class="text-muted small mb-0">Set Start and End month first.</p>';
  cfgBindGridFormatting('cfgPhasingGrid');
}

function cfgRenderPlanningGrid(planning) {
  const months = cfgGetMonthRange();
  const pastRO = cfgHasReforecastSnapshot();
  const el = document.getElementById('cfgPlanningGrid');
  el.innerHTML = months.length
    ? cfgGridHTML(months, planning, 'cfg-planning-input', 'hours', pastRO) + cfgGridFooterHTML('cfgPlanningTotal')
    : '<p class="text-muted small mb-0">Set Start and End month first.</p>';
  cfgBindGridFormatting('cfgPlanningGrid');
}

function cfgReforecastSnapshotKey() {
  const pid = document.getElementById('cfgId')?.value.trim();
  return pid ? `reforecast_snapshot_${pid}` : null;
}

function cfgHasReforecastSnapshot() {
  const key = cfgReforecastSnapshotKey();
  return !!(key && localStorage.getItem(key));
}

function cfgRebuildAllDistUI() {
  document.querySelectorAll('.cfg-task-card').forEach(card => {
    const saved = {};
    card.querySelectorAll('.cfg-dist-input').forEach(inp => {
      const v = parseFloat(inp.value) || 0;
      if (v > 0) saved[inp.dataset.ym] = v;
    });
    cfgRebuildDistUI(card, saved);
  });
}

function cfgSaveReforecastSnapshot() {
  const key = cfgReforecastSnapshotKey();
  if (!key) return;
  localStorage.setItem(key, JSON.stringify({
    phasing:  cfgReadGrid('cfg-phasing-input'),
    planning: cfgReadGrid('cfg-planning-input'),
    savedAt:  Date.now(),
  }));
  cfgSyncRollbackButtons();
}

function cfgSyncRollbackButtons() {
  const key      = cfgReforecastSnapshotKey();
  const raw      = key ? localStorage.getItem(key) : null;
  const snapshot = raw ? JSON.parse(raw) : null;
  const hasSnap  = !!snapshot;
  const dateStr  = hasSnap
    ? new Date(snapshot.savedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
  ['cfgBtnRollbackPhasing', 'cfgBtnRollbackPlanning'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = !hasSnap;
    btn.title    = hasSnap ? `Restore snapshot saved on ${dateStr}` : 'No snapshot available';
    btn.querySelector('.rollback-date').textContent = hasSnap ? dateStr : '';
  });
}

function cfgRollbackReforecast() {
  const key = cfgReforecastSnapshotKey();
  if (!key) return;
  const raw = key ? localStorage.getItem(key) : null;
  if (!raw) return;
  const snapshot = JSON.parse(raw);
  const savedDate = new Date(snapshot.savedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

  const modalEl = document.getElementById('confirmModal');
  document.getElementById('confirmModalTitle').textContent = '↩ Rollback reforecast';
  document.getElementById('confirmModalMessage').innerHTML = `
    <p class="mb-2">This will restore phasing and planning to the snapshot saved on <strong>${savedDate}</strong>.</p>
    <p class="text-danger fw-semibold mb-0">⚠ Current reforecast values will be lost.</p>`;

  const okOld = document.getElementById('confirmModalOk');
  const okBtn = okOld.cloneNode(true);
  okOld.replaceWith(okBtn);

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  let confirmed = false;

  okBtn.addEventListener('click', () => { confirmed = true; modal.hide(); });
  modalEl.addEventListener('hidden.bs.modal', () => {
    if (!confirmed) return;
    localStorage.removeItem(key);
    cfgRenderPhasingGrid(snapshot.phasing   || {});
    cfgRenderPlanningGrid(snapshot.planning || {});
    cfgRebuildAllDistUI();
    cfgSyncRollbackButtons();
  }, { once: true });

  modalEl.addEventListener('shown.bs.modal', () => {
    modalEl.style.zIndex = '1200';
    const backdrops = document.querySelectorAll('.modal-backdrop');
    if (backdrops.length > 0) backdrops[backdrops.length - 1].style.zIndex = '1190';
  }, { once: true });

  modal.show();
}

function cfgDerivePhasing() {
  const tasks  = cfgReadTasks().filter(t => t.billable !== false);
  const months = cfgGetMonthRange();
  if (!months.length) { alert('Set project dates first.'); return; }

  const cfgStart = month2ym(document.getElementById('cfgStartDate').value);
  const cfgEnd   = month2ym(document.getElementById('cfgEndDate').value);
  const cur      = document.getElementById('cfgCurrency')?.value || '€';

  // Pre-compute new grids
  const newPhasing = {}, newPlanning = {};
  months.forEach(ym => {
    const [y, m]   = [parseInt(ym.slice(0,4)), parseInt(ym.slice(4,6))];
    const mStart   = new Date(y, m-1, 1);
    const mEnd     = new Date(y, m, 0);
    let budget = 0, hours = 0;
    tasks.forEach(task => {
      const taskBudget = task.resources.reduce((s, r) => s + (r.soldHours||0) * (r.hourlyRate||0), 0);
      const taskHours  = task.resources.reduce((s, r) => s + (r.soldHours||0), 0);
      const dist    = task.monthlyDistribution;
      const distSum = dist ? Object.values(dist).reduce((s, v) => s + v, 0) : 0;
      if (dist && Math.abs(distSum - 100) < 0.5) {
        // Use monthly % distribution
        const pct = (dist[ym] || 0) / 100;
        budget += taskBudget * pct;
        hours  += taskHours  * pct;
      } else {
        // Day-proportional distribution
        const tStart = parseTaskDate(task.startDate || cfgStart, false);
        const tEnd   = parseTaskDate(task.endDate   || cfgEnd,   true);
        const tDays  = Math.max(1, (tEnd - tStart) / 86400000 + 1);
        const oStart = new Date(Math.max(mStart, tStart));
        const oEnd   = new Date(Math.min(mEnd,   tEnd));
        const oDays  = Math.max(0, (oEnd - oStart) / 86400000 + 1);
        if (oDays > 0) {
          const frac = oDays / tDays;
          budget += taskBudget * frac;
          hours  += taskHours  * frac;
        }
      }
    });
    if (budget > 0) newPhasing[ym]  = Math.round(budget);
    if (hours  > 0) newPlanning[ym] = Math.round(hours * 10) / 10;
  });

  const totalBudget = Object.values(newPhasing).reduce((s, v) => s + v, 0);
  const totalHours  = Object.values(newPlanning).reduce((s, v) => s + v, 0);
  const fmtB = n => cfgFmtMoney(n, cur);

  const modalEl = document.getElementById('confirmModal');
  document.getElementById('confirmModalTitle').textContent = '⟳ Derive from task dates';
  document.getElementById('confirmModalMessage').innerHTML = `
    <p class="mb-2">Phasing and planning will be computed from task date ranges, distributing each task's budget proportionally to the days of overlap with each month.</p>
    <ul class="mb-3">
      <li>Total budget distributed: <strong>${fmtB(totalBudget)}</strong> across ${months.length} months</li>
      <li>Total hours distributed: <strong>${totalHours.toLocaleString('en-US')} h</strong></li>
    </ul>
    <p class="mb-0 text-muted small">The current values will be saved as a snapshot for rollback.</p>`;

  const okOld = document.getElementById('confirmModalOk');
  const okBtn = okOld.cloneNode(true);
  okOld.replaceWith(okBtn);

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  let confirmed = false;
  okBtn.addEventListener('click', () => { confirmed = true; modal.hide(); });
  modalEl.addEventListener('hidden.bs.modal', () => {
    if (!confirmed) return;
    cfgSaveReforecastSnapshot();
    cfgRenderPhasingGrid(newPhasing);
    cfgRenderPlanningGrid(newPlanning);
    cfgRebuildAllDistUI();
  }, { once: true });
  modalEl.addEventListener('shown.bs.modal', () => {
    modalEl.style.zIndex = '1200';
    const bd = document.querySelectorAll('.modal-backdrop');
    if (bd.length > 0) bd[bd.length-1].style.zIndex = '1190';
  }, { once: true });
  modal.show();
}

function cfgReforecast() {
  const projectId = document.getElementById('cfgId').value.trim();
  const tasks     = cfgReadTasks().filter(t => t.billable !== false);
  const months    = cfgGetMonthRange();

  if (!months.length) { alert('Set project start and end dates first.'); return; }

  const now        = new Date();
  const currentYM  = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const pastMonths   = months.filter(ym => ym <  currentYM);
  const futureMonths = months.filter(ym => ym >= currentYM);
  const futureCount  = futureMonths.length || 1;

  // Rate map: role (lowercase) → hourlyRate
  const rateMap = new Map();
  tasks.forEach(t => t.resources.forEach(r => {
    if (r.role && !rateMap.has(r.role.toLowerCase()))
      rateMap.set(r.role.toLowerCase(), r.hourlyRate || 0);
  }));

  const billableNames = new Set(tasks.map(t => t.name.toLowerCase()));
  const projData = timesheetData.filter(r =>
    r.projectId === projectId && billableNames.has(r.task?.toLowerCase())
  );

  // Per-task actuals: taskActuals[taskNameLower][ym] = { spend, hours }
  const taskActuals = {};
  projData.forEach(r => {
    if (!r.date) return;
    const ym    = `${r.date.getFullYear()}${String(r.date.getMonth() + 1).padStart(2, '0')}`;
    const tName = (r.task || '').toLowerCase();
    const rate  = rateMap.get((r.role || '').toLowerCase()) ?? 0;
    if (!taskActuals[tName]) taskActuals[tName] = {};
    if (!taskActuals[tName][ym]) taskActuals[tName][ym] = { spend: 0, hours: 0 };
    taskActuals[tName][ym].spend += r.hours * rate;
    taskActuals[tName][ym].hours += r.hours;
  });

  // Totals from config tasks
  const totalBudget = tasks.reduce((s, t) => s + t.resources.reduce((rs, r) => rs + (r.soldHours||0)*(r.hourlyRate||0), 0), 0);
  const totalHours  = tasks.reduce((s, t) => s + t.resources.reduce((rs, r) => rs + (r.soldHours||0), 0), 0);

  // Pre-compute new grids and validate distribution errors
  const newPhasing = {}, newPlanning = {};
  let distError = null;

  for (const task of tasks) {
    const tName      = task.name.toLowerCase();
    const tActuals   = taskActuals[tName] || {};
    const taskBudget = task.resources.reduce((s, r) => s + (r.soldHours||0)*(r.hourlyRate||0), 0);
    const taskHours  = task.resources.reduce((s, r) => s + (r.soldHours||0), 0);
    const dist    = task.monthlyDistribution;
    const distSum = dist ? Object.values(dist).reduce((s, v) => s + v, 0) : 0;
    const useDist = dist && Math.abs(distSum - 100) < 0.5;

    if (useDist) {
      // Compute carry-forward delta from past months
      let deltaPct = 0;
      pastMonths.forEach(ym => {
        const plannedPct   = dist[ym] || 0;
        const actualBudget = (tActuals[ym] || {}).spend || 0;
        const actualPct    = taskBudget > 0 ? (actualBudget / taskBudget * 100) : 0;
        deltaPct += plannedPct - actualPct;
        const actualHrs = (tActuals[ym] || {}).hours || 0;
        if (actualBudget > 0) newPhasing[ym]  = (newPhasing[ym]  || 0) + actualBudget;
        if (actualHrs    > 0) newPlanning[ym] = (newPlanning[ym] || 0) + actualHrs;
      });

      if (futureMonths.length > 0) {
        const firstFuture = futureMonths[0];
        const adjustedPct = (dist[firstFuture] || 0) + deltaPct;
        if (adjustedPct > 100.5) {
          distError = `Task "${task.name}": carry-forward (${deltaPct.toFixed(1)}%) pushes ${firstFuture} above 100%.\nAdjust the monthly distribution manually before running Reforecast.`;
          break;
        }
        futureMonths.forEach((ym, i) => {
          const pct = (i === 0 ? adjustedPct : (dist[ym] || 0));
          const bud = taskBudget * pct / 100;
          const hrs = taskHours  * pct / 100;
          if (bud > 0.01) newPhasing[ym]  = (newPhasing[ym]  || 0) + bud;
          if (hrs > 0.01) newPlanning[ym] = (newPlanning[ym] || 0) + hrs;
        });
      }
    } else {
      // Even split: remaining after actuals distributed across future months
      const pastSpend = pastMonths.reduce((s, ym) => s + ((tActuals[ym] || {}).spend || 0), 0);
      const pastHrs   = pastMonths.reduce((s, ym) => s + ((tActuals[ym] || {}).hours || 0), 0);
      const remainBud = taskBudget - pastSpend;
      const remainHrs = taskHours  - pastHrs;
      pastMonths.forEach(ym => {
        const bud = (tActuals[ym] || {}).spend || 0;
        const hrs = (tActuals[ym] || {}).hours || 0;
        if (bud > 0) newPhasing[ym]  = (newPhasing[ym]  || 0) + bud;
        if (hrs > 0) newPlanning[ym] = (newPlanning[ym] || 0) + hrs;
      });
      futureMonths.forEach(ym => {
        if (remainBud > 0) newPhasing[ym]  = (newPhasing[ym]  || 0) + remainBud / futureCount;
        if (remainHrs > 0) newPlanning[ym] = (newPlanning[ym] || 0) + remainHrs / futureCount;
      });
    }
  }

  if (distError) { alert('Cannot reforecast:\n\n' + distError); return; }

  // Round
  Object.keys(newPhasing).forEach(ym  => { newPhasing[ym]  = Math.round(newPhasing[ym]); });
  Object.keys(newPlanning).forEach(ym => { newPlanning[ym] = Math.round(newPlanning[ym] * 10) / 10; });

  const pastSpendTotal = Object.values(taskActuals).reduce((s, ta) =>
    s + pastMonths.reduce((ps, ym) => ps + ((ta[ym] || {}).spend || 0), 0), 0);
  const pastHrsTotal = Object.values(taskActuals).reduce((s, ta) =>
    s + pastMonths.reduce((ps, ym) => ps + ((ta[ym] || {}).hours || 0), 0), 0);
  const remainingBudget = totalBudget - pastSpendTotal;
  const remainingHours  = totalHours  - pastHrsTotal;

  const cur  = document.getElementById('cfgCurrency')?.value || '€';
  const fmtB = n => cfgFmtMoney(Math.abs(n), cur);
  const fmtH = n => `${+(Math.round(Math.abs(n) + 'e1') + 'e-1')} h`;

  const distTaskCount = tasks.filter(t => {
    const d = t.monthlyDistribution;
    return d && Math.abs(Object.values(d).reduce((s, v) => s + v, 0) - 100) < 0.5;
  }).length;

  const modalEl = document.getElementById('confirmModal');
  document.getElementById('confirmModalTitle').textContent = '↻ Reforecast from actuals';
  document.getElementById('confirmModalMessage').innerHTML = `
    <p class="mb-2">Phasing and planning grids will be fully overwritten:</p>
    <ul class="mb-3">
      <li><strong>Past months (${pastMonths.length})</strong> — replaced with actual spend &amp; hours from loaded XLS data</li>
      <li><strong>Current &amp; future months (${futureMonths.length})</strong> — distributed per task settings
        ${distTaskCount > 0 ? `<em>(${distTaskCount} task${distTaskCount > 1 ? 's' : ''} use monthly distribution)</em>` : '(even split)'}:
        <ul class="mt-1 mb-0">
          <li>Remaining budget: <strong>${fmtB(remainingBudget)}</strong>${remainingBudget < 0 ? ' <span class="text-danger">(over budget)</span>' : ''}</li>
          <li>Remaining hours:&nbsp; <strong>${fmtH(remainingHours)}</strong>${remainingHours < 0 ? ' <span class="text-danger">(over hours)</span>' : ''}</li>
        </ul>
      </li>
    </ul>
    <p class="mb-0 text-muted small">The current values will be saved as a snapshot for rollback.</p>`;

  const okOld = document.getElementById('confirmModalOk');
  const okBtn = okOld.cloneNode(true);
  okOld.replaceWith(okBtn);

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  let confirmed = false;

  okBtn.addEventListener('click', () => { confirmed = true; modal.hide(); });
  modalEl.addEventListener('hidden.bs.modal', () => {
    if (!confirmed) return;
    cfgSaveReforecastSnapshot();
    cfgRenderPhasingGrid(newPhasing);
    cfgRenderPlanningGrid(newPlanning);
  }, { once: true });

  modalEl.addEventListener('shown.bs.modal', () => {
    modalEl.style.zIndex = '1200';
    const backdrops = document.querySelectorAll('.modal-backdrop');
    if (backdrops.length > 0) backdrops[backdrops.length - 1].style.zIndex = '1190';
  }, { once: true });

  modal.show();
}

function cfgCurrencyLocale(cur) {
  return (cur === '$' || cur === '£') ? 'en-US' : 'de-DE';
}

function cfgFmtMoney(amount, currency) {
  const cur = currency || document.getElementById('cfgCurrency')?.value || '€';
  const n = Math.round(amount || 0);
  const f = n.toLocaleString(cfgCurrencyLocale(cur));
  return cur === 'CHF' ? `CHF ${f}` : `${cur} ${f}`;
}

function cfgParseMoney(str) {
  const s   = String(str).trim().replace(/ /g, ' ');  // normalise non-breaking spaces
  const cur = document.getElementById('cfgCurrency')?.value || '€';
  // Strip currency prefix (€, $, £, CHF) and leading/trailing spaces
  const digits = s.replace(/^(CHF|[€$£])\s*/i, '');
  if (cfgCurrencyLocale(cur) === 'de-DE') {
    // de-DE: '.' = thousands, ',' = decimal  →  '1.500,50' → 1500.50
    return parseFloat(digits.replace(/\./g, '').replace(',', '.')) || 0;
  } else {
    // en-US: ',' = thousands, '.' = decimal  →  '1,500.50' → 1500.50
    return parseFloat(digits.replace(/,/g, '')) || 0;
  }
}

function cfgFmtHours(n) {
  return n > 0 ? Math.round(n).toLocaleString('en-US') : '';
}

function cfgGridHTML(months, existing, cls, type = 'currency', pastReadonly = false) {
  const now       = new Date();
  const currentYM = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return '<div class="cfg-month-grid">' + months.map(ym => {
    const [y, m] = [parseInt(ym.slice(0, 4)), parseInt(ym.slice(4, 6))];
    const label  = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const raw    = existing[ym];
    const disp   = raw > 0 ? (type === 'hours' ? cfgFmtHours(raw) : cfgFmtMoney(raw)) : '';
    const isPast = pastReadonly && ym < currentYM;
    const ro     = isPast ? ' readonly' : '';
    const bg     = isPast ? 'background:#f0f0f0;' : '';
    return `<div class="cfg-month-cell">
      <div class="cfg-month-label">${label}</div>
      <input type="text" class="form-control form-control-sm text-end ${cls}"
             data-ym="${ym}" data-grid-type="${type}" placeholder="—" value="${disp}" style="${bg}"${ro}>
    </div>`;
  }).join('') + '</div>';
}

function cfgBindGridFormatting(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.addEventListener('focusin', e => {
    if (!e.target.matches('input[data-ym]')) return;
    const raw = cfgParseMoney(e.target.value);
    e.target.value = raw > 0 ? raw : '';
  });
  el.addEventListener('focusout', e => {
    if (!e.target.matches('input[data-ym]')) return;
    const raw = cfgParseMoney(e.target.value);
    const isHours = e.target.dataset.gridType === 'hours';
    e.target.value = raw > 0 ? (isHours ? cfgFmtHours(raw) : cfgFmtMoney(raw)) : '';
    cfgUpdateGrandTotals();
  });
}

function cfgReadGrid(cls) {
  const result = {};
  document.querySelectorAll(`.${cls}`).forEach(inp => {
    const val = cfgParseMoney(inp.value);
    if (val > 0) result[inp.dataset.ym] = val;
  });
  return result;
}

// ── PASS THROUGH COSTS (PTC) ──────────────────────────────────────────────────
function cfgGetProjectMonths() {
  const months = cfgGetMonthRange();
  return months;
}

function cfgPtcMonthOptions(selected) {
  const months = cfgGetProjectMonths();
  if (!months.length) return '<option value="">— set project dates first —</option>';
  return months.map(ym => {
    const [y, m] = [parseInt(ym.slice(0, 4)), parseInt(ym.slice(4, 6))];
    const label  = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const sel    = ym === selected ? ' selected' : '';
    return `<option value="${ym}"${sel}>${label}</option>`;
  }).join('');
}

function cfgRenderPtcList(ptcItems) {
  const c = document.getElementById('cfgPtcList');
  c.innerHTML = '';
  ptcItems.forEach(item => c.appendChild(cfgMakePtcCard(item)));
  cfgUpdateGrandTotals();
}

function cfgMakePtcCard(item) {
  const card = document.createElement('div');
  card.className = 'cfg-ptc-card border rounded p-3 mb-2';
  card.innerHTML = `
    <div class="row g-2 align-items-start">
      <div class="col-sm-3">
        <label class="form-label small text-muted mb-1">Title</label>
        <input type="text" class="form-control form-control-sm cfg-ptc-title"
               placeholder="e.g. Software licence" value="${esc(item.title || '')}">
      </div>
      <div class="col-sm-4">
        <label class="form-label small text-muted mb-1">Note</label>
        <input type="text" class="form-control form-control-sm cfg-ptc-note"
               placeholder="optional description" value="${esc(item.note || '')}">
      </div>
      <div class="col-sm-2">
        <label class="form-label small text-muted mb-1">Amount</label>
        <input type="text" class="form-control form-control-sm text-end cfg-ptc-amount"
               placeholder="—" value="${item.amount > 0 ? cfgFmtMoney(item.amount) : ''}">
      </div>
      <div class="col-sm-2">
        <label class="form-label small text-muted mb-1">Month</label>
        <select class="form-select form-select-sm cfg-ptc-month">
          ${cfgPtcMonthOptions(item.month || '')}
        </select>
      </div>
      <div class="col-sm-1 d-flex align-items-end">
        <button class="btn btn-sm btn-outline-danger w-100 cfg-ptc-del-btn">🗑</button>
      </div>
    </div>`;
  card.querySelector('.cfg-ptc-del-btn').addEventListener('click', () => {
    const title = card.querySelector('.cfg-ptc-title').value.trim() || 'this entry';
    showConfirm(`Remove PTC "${title}"?`, () => { card.remove(); cfgUpdateGrandTotals(); });
  });
  const amtInp = card.querySelector('.cfg-ptc-amount');
  amtInp.addEventListener('focus', e => {
    const raw = cfgParseMoney(e.target.value);
    e.target.value = raw > 0 ? raw : '';
  });
  amtInp.addEventListener('input', cfgUpdateGrandTotals);
  amtInp.addEventListener('blur', e => {
    const raw = cfgParseMoney(e.target.value);
    e.target.value = raw > 0 ? cfgFmtMoney(raw) : '';
    cfgUpdateGrandTotals();
  });
  return card;
}

function cfgReadPtcList() {
  return [...document.querySelectorAll('.cfg-ptc-card')].map(card => ({
    title:  card.querySelector('.cfg-ptc-title').value.trim(),
    note:   card.querySelector('.cfg-ptc-note').value.trim(),
    amount: cfgParseMoney(card.querySelector('.cfg-ptc-amount').value),
    month:  card.querySelector('.cfg-ptc-month').value,
  })).filter(p => p.title || p.amount);
}

// ── GROUPS ─────────────────────────────────────────────────────────────────────
function cfgRenderGroups(groups) {
  const c = document.getElementById('cfgGroupList');
  c.innerHTML = '';
  groups.forEach(g => c.appendChild(cfgMakeGroupCard(g)));
}

function cfgMakeGroupCard(grp) {
  const card = document.createElement('div');
  card.className = 'cfg-group-card border rounded p-3 mb-2';
  card.innerHTML = `
    <div class="d-flex align-items-center gap-2 mb-2">
      <span class="text-muted small text-nowrap">Group name:</span>
      <input type="text" class="form-control form-control-sm cfg-group-name"
             placeholder="e.g. Development" value="${esc(grp.name || '')}">
      <button class="btn btn-sm btn-outline-danger flex-shrink-0">🗑</button>
    </div>
    <label class="form-label small text-muted mb-1">Roles (one per line, must match Job Role: Name column in XLS):</label>
    <textarea class="form-control form-control-sm cfg-group-roles font-monospace" rows="3"
              placeholder="HWGDEV - DEVELOPER&#10;HWGINTERN - ACCSVS">${esc((grp.roles || []).join('\n'))}</textarea>`;
  card.querySelector('button').addEventListener('click', () => card.remove());
  return card;
}

function cfgReadGroups() {
  return [...document.querySelectorAll('.cfg-group-card')].map(card => ({
    name:  card.querySelector('.cfg-group-name').value.trim(),
    roles: card.querySelector('.cfg-group-roles').value
               .split('\n').map(s => s.trim()).filter(Boolean),
  })).filter(g => g.name);
}

// ── TAB SWITCHING ──────────────────────────────────────────────────────────────
function cfgSwitchTab(tab) {
  if (tab === 'json' && cfgActiveTab === 'form') {
    if (cfgProjectIdx >= 0) cfgSaveCurrentToState();
    document.getElementById('configEditor').value = JSON.stringify(cfgEditConfig, null, 2);
  }
  if (tab === 'form' && cfgActiveTab === 'json') {
    try {
      cfgEditConfig = JSON.parse(document.getElementById('configEditor').value);
      if (!Array.isArray(cfgEditConfig.projects)) cfgEditConfig.projects = [];
      cfgPopulateProjectDropdown();
      const idx = Math.min(Math.max(cfgProjectIdx, 0), cfgEditConfig.projects.length - 1);
      cfgSelectProject(cfgEditConfig.projects.length > 0 ? idx : -1);
      document.getElementById('cfgJsonError').classList.add('d-none');
    } catch(e) {
      document.getElementById('cfgJsonError').textContent = 'Cannot switch: invalid JSON — ' + e.message;
      document.getElementById('cfgJsonError').classList.remove('d-none');
      return;
    }
  }
  cfgActiveTab = tab;
  document.getElementById('cfgTabForm').style.display = tab === 'form' ? 'block' : 'none';
  document.getElementById('cfgTabJson').style.display = tab === 'json' ? 'block' : 'none';
  document.querySelectorAll('.cfg-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
}

// ── SAVE CONFIG ────────────────────────────────────────────────────────────────
function saveConfig() {
  try {
    const editedProjectId = cfgActiveTab === 'form' && cfgProjectIdx >= 0
      ? cfgEditConfig.projects[cfgProjectIdx]?.id
      : null;

    if (cfgActiveTab === 'form') {
      if (cfgProjectIdx >= 0) cfgSaveCurrentToState();
      // Warn if active project has tasks but no phasing configured
      if (cfgProjectIdx >= 0) {
        const editedProj = cfgEditConfig.projects[cfgProjectIdx];
        if (editedProj) {
          const hasBillable = (editedProj.tasks || []).some(t => t.billable !== false && (t.resources || []).length);
          const phasingEmpty = !Object.values(editedProj.phasing || {}).some(v => v > 0);
          if (hasBillable && phasingEmpty) {
            if (!window.confirm('The budget phasing for this project is empty — no monthly budget is configured.\n\nSave anyway?')) return;
          }
        }
      }
      // Clean up XLS data for any projects that were deleted in this editing session
      const oldIds = new Set((config.projects || []).map(p => p.id).filter(Boolean));
      const newIds = new Set((cfgEditConfig.projects || []).map(p => p.id).filter(Boolean));
      oldIds.forEach(id => {
        if (!newIds.has(id)) {
          clearProjectData(id);
          if (typeof _deleteProjectFromApi !== 'undefined')
            _deleteProjectFromApi(id).catch(e => console.warn('[sync] project delete:', e.message));
        }
      });
      config = cfgEditConfig;
    } else {
      config = JSON.parse(document.getElementById('configEditor').value);
    }
    persistConfig();
    // Sync all projects to API (fire-and-forget)
    if (typeof _pushProjectToApi !== 'undefined') {
      (config.projects || []).forEach(p =>
        _pushProjectToApi(p).catch(e => console.warn('[sync] project push:', e.message))
      );
    }
    if (typeof updateAiButtonVisibility === 'function') updateAiButtonVisibility();

    if (window.__cfgFullPage) {
      window.location.href = '/portfolio.html';
      return;
    }

    // Capture active section BEFORE hiding the modal (modal hide is async/animated).
    const inCgEditor  = document.getElementById('costGridEditorSection')?.style.display !== 'none';
    const inPipelineBoard     = document.getElementById('pipelineBoardSection')?.style.display    !== 'none';
    const inPortfolio         = document.getElementById('portfolioSection').style.display         !== 'none';
    const inPortfolioPlanning = document.getElementById('portfolioPlanningSection').style.display !== 'none';

    bootstrap.Modal.getInstance(document.getElementById('configModal'))?.hide();
    document.getElementById('cfgJsonError').classList.add('d-none');

    if (inCgEditor || inPipelineBoard) {
      // User was inside the pipeline/cost grid — stay there, just refresh badges and editor.
      renderPipelineBoard();
      if (inCgEditor && typeof _cgActiveCgId !== 'undefined' && _cgActiveCgId) {
        const _refreshCg = cgLoad(_cgActiveCgId);
        if (_refreshCg) renderCgVersionTabs(_refreshCg);
        renderCgEditor();
      }
    } else if (inPortfolioPlanning) {
      renderPortfolioPlanningView();
    } else if (selectedProjectId) {
      if (editedProjectId && editedProjectId !== selectedProjectId) {
        showDashboardView(editedProjectId);
      } else {
        renderDashboard(selectedProjectId);
      }
    } else if (inPortfolio) {
      renderPortfolioView();
    }
  } catch(e) {
    document.getElementById('cfgJsonError').textContent = 'Save failed: ' + e.message;
    document.getElementById('cfgJsonError').classList.remove('d-none');
  }
}

// ── IMPORT / EXPORT ────────────────────────────────────────────────────────────
function importConfigFile() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json';
  inp.addEventListener('change', e => {
    const fr = new FileReader();
    fr.onload = ev => {
      try {
        cfgEditConfig = JSON.parse(ev.target.result);
        if (!Array.isArray(cfgEditConfig.projects)) cfgEditConfig.projects = [];
        // Populate the editor so cfgSwitchTab can parse it correctly
        document.getElementById('configEditor').value = JSON.stringify(cfgEditConfig, null, 2);
        cfgActiveTab = 'json';
        cfgSwitchTab('form');
      } catch(err) {
        cfgActiveTab = 'form';
        cfgSwitchTab('json');
        document.getElementById('configEditor').value = ev.target.result;
        document.getElementById('cfgJsonError').textContent = 'Invalid JSON: ' + err.message;
        document.getElementById('cfgJsonError').classList.remove('d-none');
      }
    };
    fr.readAsText(e.target.files[0]);
  });
  inp.click();
}

function exportConfig() {
  const content = cfgActiveTab === 'form'
    ? (cfgProjectIdx >= 0 && cfgSaveCurrentToState(), JSON.stringify(cfgEditConfig, null, 2))
    : document.getElementById('configEditor').value;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  a.download = 'burndown_config.json';
  a.click();
}
