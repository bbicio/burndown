// ── MAIN ─────────────────────────────────────────────────────────────────────
// ── WIRE UP EVENT LISTENERS ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  loadSettings();
  loadSummarySelection();
  updateAiButtonVisibility();
  refreshTimesheetData();

  if (timesheetData.length > 0) {
    populateProjectSelector();
  }

  // Pipeline is the default landing view
  showPipelineBoardView();

  // Primary nav tabs
  document.querySelectorAll('.nav-main-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.navtab === 'pipelineboard') {
        showPipelineBoardView();
      } else if (btn.dataset.navtab === 'reporting') {
        if (planningReturnToBurndown) {
          const pid = [...portfolioProjectFilters][0] || planningProjectId;
          planningReturnToBurndown = false;
          portfolioProjectFilters.clear();
          showDashboardView(pid);
        } else {
          showPortfolioView();
        }
      } else if (btn.dataset.navtab === 'planning') {
        showPortfolioPlanningView();
      }
    });
  });
  document.getElementById('btnBrandHome').addEventListener('click', showPortfolioView);

  // Back to portfolio button (dashboard view)
  document.getElementById('btnBackToPortfolio').addEventListener('click', showPortfolioView);
  document.getElementById('btnPlanningView').addEventListener('click', () => showPlanningView(selectedProjectId));

  // Full-width toggle for resource planning
  document.getElementById('btnPPFullWidth').addEventListener('click', () => {
    const isFullWidth = document.body.classList.toggle('pp-fullwidth');
    document.getElementById('btnPPFullWidth').textContent = isFullWidth ? '⊡ Compact' : '⛶ Full width';
  });

  // Portfolio Planning view toggle (By Role / By Project)
  document.querySelectorAll('#ppViewToggle [data-ppview]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ppViewToggle [data-ppview]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      portfolioPlanningView = btn.dataset.ppview;
      renderPortfolioPlanningView();
    });
  });

  // Portfolio Planning back → handled by "Project Reporting" tab click

  // Interval toggle (Mensile / Settimanale)
  document.querySelectorAll('#ppIntervalToggle [data-ppinterval]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ppIntervalToggle [data-ppinterval]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ppViewInterval = btn.dataset.ppinterval;
      renderPortfolioPlanningView();
    });
  });

  // Planning window navigation
  document.getElementById('btnPpExpandLeft').addEventListener('click', () => {
    const { axisStart } = getPpAxis();
    const ns = new Date(ppWindowStart.getFullYear(), ppWindowStart.getMonth() - 1, 1);
    ppWindowStart = ns < axisStart ? new Date(axisStart.getFullYear(), axisStart.getMonth(), 1) : ns;
    updatePpWindowWidget(); renderPortfolioPlanningView();
  });
  document.getElementById('btnPpShrinkLeft').addEventListener('click', () => {
    const ns = new Date(ppWindowStart.getFullYear(), ppWindowStart.getMonth() + 1, 1);
    if (ns <= ppWindowEnd) { ppWindowStart = ns; updatePpWindowWidget(); renderPortfolioPlanningView(); }
  });
  document.getElementById('btnPpExpandRight').addEventListener('click', () => {
    const { axisEnd } = getPpAxis();
    const ne = new Date(ppWindowEnd.getFullYear(), ppWindowEnd.getMonth() + 2, 0);
    ppWindowEnd = ne > axisEnd ? new Date(axisEnd.getFullYear(), axisEnd.getMonth() + 1, 0) : ne;
    updatePpWindowWidget(); renderPortfolioPlanningView();
  });
  document.getElementById('btnPpShrinkRight').addEventListener('click', () => {
    const ne = new Date(ppWindowEnd.getFullYear(), ppWindowEnd.getMonth(), 0);
    if (ne >= ppWindowStart) { ppWindowEnd = ne; updatePpWindowWidget(); renderPortfolioPlanningView(); }
  });
  document.getElementById('btnExportResourcePlan').addEventListener('click', () => {
    const exportBtn = document.getElementById('btnExportResourcePlan');
    if (exportBtn._ppExport) exportBtn._ppExport();
  });
  document.getElementById('chkMonthlyPulse').addEventListener('change', e => {
    portfolioMonthlyPulse = e.target.checked;
    renderPortfolioPlanningView();
  });
  document.getElementById('btnResetProjectFilter').addEventListener('click', () => {
    portfolioProjectFilters.clear();
    renderPortfolioPlanningView();
  });
  document.getElementById('chkRoundHours').addEventListener('change', e => {
    portfolioRoundHours = e.target.checked;
    renderPortfolioPlanningView();
  });
  document.getElementById('btnResetTeamFilter').addEventListener('click', () => {
    portfolioTeamFilters.clear();
    renderPortfolioPlanningView();
  });

  // AI Planning Sidebar
  document.getElementById('btnToggleAiSidebar').addEventListener('click', () => {
    document.getElementById('aiPlanSidebar').classList.toggle('open');
  });
  document.getElementById('btnCloseAiSidebar').addEventListener('click', () => {
    document.getElementById('aiPlanSidebar').classList.remove('open');
  });
  document.getElementById('btnAiPlanSend').addEventListener('click', aiPlanSend);
  document.getElementById('btnAiPlanClear').addEventListener('click', () => {
    aiPlanMessages = [];
    renderAiPlanMessages();
  });
  document.getElementById('aiPlanInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiPlanSend(); }
  });

  // Pipeline / Status rules
  document.getElementById('cfgPipeline').addEventListener('change', () => {
    cfgApplyPipelineRules(document.getElementById('cfgPipeline').value, document.getElementById('cfgStatus').value);
    cfgMarkDirty();
  });

  // Clear XLS data for current project in config form
  document.getElementById('cfgBtnClearData').addEventListener('click', () => {
    const pid = cfgProjectIdx >= 0 ? cfgEditConfig.projects[cfgProjectIdx]?.id : '';
    if (!pid) return;
    showConfirm(
      `Clear all cached XLS data for project "${pid}"?\n\nThe configuration will be kept.`,
      () => { clearProjectData(pid); populateProjectSelector(); showPortfolioView(); },
      null, '🗑 Clear XLS data'
    );
  });

  // Portfolio toolbar buttons
  document.getElementById('btnLoadXls').addEventListener('click', () => document.getElementById('fileInput').click());
  document.getElementById('btnOpenConfig').addEventListener('click', () => openConfigModal(selectedProjectId || null));

  // Dashboard Configure button — opens config modal pre-selected on current project
  document.getElementById('btnConfigureProject').addEventListener('click', () => openConfigModal(selectedProjectId || null));

  // Cost Grid toolbar buttons
  document.getElementById('btnRolesView').addEventListener('click', showRolesView);

  // File upload
  const fileInput = document.getElementById('fileInput');
  document.getElementById('dropzone').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => { const f = e.target.files[0]; if (f) readXLS(f); });

  // Drag & drop
  const dz = document.getElementById('dropzone');
  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('dragover');
    const f = e.dataTransfer.files[0]; if (f) readXLS(f);
  });

  // Email share
  document.getElementById('btnShareEmail').addEventListener('click', openEmailModal);
  document.getElementById('btnSendEmail').addEventListener('click', sendEmail);

  // AI Analysis
  document.getElementById('btnAiAnalysis').addEventListener('click', openAiAnalysis);
  document.getElementById('btnCopyAi').addEventListener('click', () => {
    const text = document.getElementById('aiResult').textContent;
    if (text) navigator.clipboard.writeText(text).catch(() => {});
  });

  // Cost Grid view
  document.getElementById('btnNewCostGrid').addEventListener('click', () => {
    document.getElementById('cgNewGridName').value = '';
    document.getElementById('cgNewGridError').classList.add('d-none');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('cgNewGridModal')).show();
  });
  document.getElementById('btnCgCreateGrid').addEventListener('click', cgCreateNewGrid);
  document.getElementById('btnCgEditorBack').addEventListener('click', () => { cgAutoSave(); showPipelineBoardView(); });
  document.getElementById('btnCgSave').addEventListener('click', cgSaveVersion);
  document.getElementById('btnCgNewVersion').addEventListener('click', () => {
    document.getElementById('cgNewVersionLabel').value = '';
    document.getElementById('cgNewVersionError').classList.add('d-none');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('cgNewVersionModal')).show();
  });
  document.getElementById('btnCgCreateVersion').addEventListener('click', cgCreateNewVersion);
  document.getElementById('btnCgExportXls').addEventListener('click', cgExportXls);
  document.getElementById('btnCgGenerateProject').addEventListener('click', cgGenerateProject);
  document.getElementById('btnCgAddSelectedRoles').addEventListener('click', cgAddSelectedRoles);
  // Roles view (btnRolesView moved to Cost Grid subnav — wired in updateNavState)
  document.getElementById('btnRolesBack').addEventListener('click', hideRolesView);
  document.getElementById('btnAddRole').addEventListener('click', () => openRoleModal(null));
  document.getElementById('btnSaveRole').addEventListener('click', saveRoleFromModal);

  // JSON Viewer Modal
  document.getElementById('btnJsonCopy').addEventListener('click', () => {
    navigator.clipboard.writeText(document.getElementById('jsonViewerContent').value).catch(() => {});
  });
  document.getElementById('btnJsonExport').addEventListener('click', () => {
    const text = document.getElementById('jsonViewerContent').value;
    const blob = new Blob([text], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = _jsonViewerFilename; a.click();
    URL.revokeObjectURL(url);
  });
  document.getElementById('btnJsonImport').addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json';
    inp.onchange = e => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          JSON.parse(ev.target.result);
          document.getElementById('jsonViewerContent').value = ev.target.result;
          document.getElementById('jsonViewerError').classList.add('d-none');
        } catch(err) {
          const el = document.getElementById('jsonViewerError');
          el.textContent = 'Invalid JSON:' + err.message;
          el.classList.remove('d-none');
        }
      };
      reader.readAsText(file);
    };
    inp.click();
  });
  document.getElementById('btnJsonApply').addEventListener('click', () => {
    const errEl = document.getElementById('jsonViewerError');
    try {
      const parsed = JSON.parse(document.getElementById('jsonViewerContent').value);
      if (_jsonViewerOnSave) { _jsonViewerOnSave(parsed); }
      bootstrap.Modal.getInstance(document.getElementById('jsonViewerModal'))?.hide();
      errEl.classList.add('d-none');
    } catch(err) {
      errEl.textContent = 'Invalid JSON:' + err.message;
      errEl.classList.remove('d-none');
    }
  });

  // Roles JSON viewer
  document.getElementById('btnRolesShowJson').addEventListener('click', () => {
    openJsonViewer('Roles', getRoles(),
      imported => {
        if (!Array.isArray(imported)) throw new Error('Deve essere un array');
        roles = imported; saveRoles(); renderRolesTable();
      },
      `roles_${new Date().toISOString().slice(0,10)}.json`
    );
  });

  // Settings modal
  document.getElementById('btnOpenSettings').addEventListener('click', openSettingsModal);
  document.getElementById('btnSaveSettings').addEventListener('click', saveSettingsModal);
  document.querySelectorAll('.stg-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stg-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('stgTabApi').style.display  = btn.dataset.tab === 'api'  ? 'block' : 'none';
      document.getElementById('stgTabData').style.display = btn.dataset.tab === 'data' ? 'block' : 'none';
      if (btn.dataset.tab === 'data') renderDataManager();
    });
  });
  document.getElementById('btnFullBackup').addEventListener('click', downloadFullBackup);
  document.getElementById('btnRestoreBackup').addEventListener('click', () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
    inp.onchange = e => { const f = e.target.files[0]; if (f) restoreFromBackup(f); };
    inp.click();
  });

  // Config modal
  document.getElementById('btnSaveConfig').addEventListener('click', saveConfig);
  document.getElementById('btnImportConfig').addEventListener('click', importConfigFile);
  document.getElementById('btnExportConfig').addEventListener('click', exportConfig);
  document.getElementById('btnResetApp').addEventListener('click', () => {
    showConfirm(
      'All data will be permanently deleted:\n\n' +
      '• Configuration (projects, tasks, resources, budget)\n' +
      '• Uploaded XLS data\n' +
      '• Cost Grids (all versions)\n' +
      '• Saved selections\n\n' +
      '✅ Preserved: Roles, Settings (API keys) and Clients.\n\n' +
      '⚠️ This operation is irreversible.\n' +
      'Download a Full Backup before proceeding.',
      () => {
        const preserve = new Set([SETTINGS_KEY, ROLES_KEY, CLIENTS_KEY]);
        try {
          Object.keys(localStorage)
            .filter(k => (k.startsWith('PDash_') || k.startsWith('reforecast_snapshot_')) && !preserve.has(k))
            .forEach(k => localStorage.removeItem(k));
        } catch(e) {}
        location.reload();
      },
      null,
      '🗑 Reset App'
    );
  });

  // Tab switching
  document.querySelectorAll('.cfg-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => cfgSwitchTab(btn.dataset.tab));
  });

  // AI provider change in Settings modal → update model dropdown
  document.getElementById('stgAiProvider').addEventListener('change', e => {
    stgUpdateModelDropdown(e.target.value, '');
  });

  // Project management
  document.getElementById('cfgProjectSel').addEventListener('change', e => {
    if (cfgProjectIdx >= 0) cfgSaveCurrentToState();
    cfgSelectProject(parseInt(e.target.value));
  });
  document.getElementById('cfgBtnNewProject').addEventListener('click', () => {
    if (cfgProjectIdx >= 0) cfgSaveCurrentToState();
    cfgEditConfig.projects.push({
      id: '', name: '', startDate: '', endDate: '',
      currency: '€', tasks: [], phasing: {}, planning: {}, groups: [],
    });
    cfgPopulateProjectDropdown();
    cfgSelectProject(cfgEditConfig.projects.length - 1);
  });
  document.getElementById('cfgBtnDelProject').addEventListener('click', () => {
    if (cfgProjectIdx < 0) return;
    const proj = cfgEditConfig.projects[cfgProjectIdx];
    const name = proj.name || proj.id || 'this project';
    showConfirm(
      `Delete project "${name}"?\n\nThis will permanently remove all tasks, resources, phasing and planning data for this project.`,
      () => {
        cfgEditConfig.projects.splice(cfgProjectIdx, 1);
        cfgPopulateProjectDropdown();
        cfgSelectProject(cfgEditConfig.projects.length > 0 ? 0 : -1);
      }
    );
  });

  // Task / Group add buttons
  document.getElementById('cfgBtnDerivePhasing').addEventListener('click', cfgDerivePhasing);
  document.getElementById('cfgBtnDerivePlanning').addEventListener('click', cfgDerivePhasing);
  document.getElementById('cfgBtnReforecastPhasing').addEventListener('click', cfgReforecast);
  document.getElementById('cfgBtnReforecastPlanning').addEventListener('click', cfgReforecast);
  document.getElementById('cfgBtnRollbackPhasing').addEventListener('click', cfgRollbackReforecast);
  document.getElementById('cfgBtnRollbackPlanning').addEventListener('click', cfgRollbackReforecast);

  document.getElementById('cfgBtnAddTask').addEventListener('click', () => {
    document.getElementById('cfgTaskList').appendChild(
      cfgMakeTaskCard({ name: '', resources: [] })
    );
    cfgUpdateGrandTotals();
  });
  document.getElementById('cfgBtnAddPtc').addEventListener('click', () => {
    document.getElementById('cfgPtcList').appendChild(
      cfgMakePtcCard({ title: '', note: '', amount: 0, month: cfgGetProjectMonths()[0] || '' })
    );
    cfgUpdateGrandTotals();
  });

  document.getElementById('cfgBtnAddGroup').addEventListener('click', () => {
    document.getElementById('cfgGroupList').appendChild(
      cfgMakeGroupCard({ name: '', roles: [] })
    );
  });

  // Date changes → warn if phasing/planning values fall outside the new range
  ['cfgStartDate', 'cfgEndDate'].forEach(id => {
    const inp = document.getElementById(id);
    // Store previous value on focus so we can revert on cancel
    inp.addEventListener('focus', () => { inp.dataset.prev = inp.value; });
    inp.addEventListener('change', () => {
      const p  = cfgReadGrid('cfg-phasing-input');
      const pl = cfgReadGrid('cfg-planning-input');
      const newMonths = new Set(cfgGetMonthRange());
      const lost = [...new Set([
        ...Object.keys(p).filter(ym => !newMonths.has(ym)),
        ...Object.keys(pl).filter(ym => !newMonths.has(ym)),
      ])].sort();

      const applyDateChange = () => {
        cfgRenderPhasingGrid(p);
        cfgRenderPlanningGrid(pl);
      };

      if (lost.length > 0) {
        const names = lost.map(ym => {
          const [y, m] = [parseInt(ym.slice(0, 4)), parseInt(ym.slice(4, 6))];
          return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        });
        const msg =
          `Changing the project dates will discard the phasing/planning values for the following months:\n\n` +
          `${names.join(', ')}\n\n` +
          `Do you want to continue?`;
        showConfirm(msg, applyDateChange, () => { inp.value = inp.dataset.prev || ''; });
      } else {
        applyDateChange();
      }
    });
  });

  // Live-update project name in dropdown as user types
  document.getElementById('cfgName').addEventListener('input', () => {
    if (cfgProjectIdx < 0) return;
    const sel = document.getElementById('cfgProjectSel');
    if (sel.options[cfgProjectIdx]) {
      sel.options[cfgProjectIdx].textContent =
        document.getElementById('cfgName').value.trim() || `Project ${cfgProjectIdx + 1}`;
    }
  });

  // Project selector
  document.getElementById('projectSelect').addEventListener('change', e => selectProject(e.target.value));

  // Burndown task filter
  document.getElementById('burndownTaskFilter').addEventListener('change', updateBurndown);

  // Burndown chart export as PNG
  document.getElementById('btnExportChart').addEventListener('click', () => {
    if (!burndownChartInst) return;
    const a = document.createElement('a');
    a.href = burndownChartInst.toBase64Image('image/png', 1);
    a.download = `burndown_${selectedProjectId || 'chart'}.png`;
    a.click();
  });

  // Burndown interval toggle
  document.querySelectorAll('#intervalToggle [data-interval]').forEach(btn => {
    btn.addEventListener('click', () => {
      burndownInterval = btn.dataset.interval;
      document.querySelectorAll('#intervalToggle [data-interval]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateBurndown();
    });
  });

  // Month filter: clears datepickers then updates tables
  document.getElementById('monthFilter').addEventListener('change', () => {
    document.getElementById('filterStart').value = '';
    document.getElementById('filterEnd').value   = '';
    updateTaskTables();
  });

  // Datepickers: clears month filter then updates tables
  document.getElementById('filterStart').addEventListener('change', () => {
    document.getElementById('monthFilter').value = '';
    updateTaskTables();
  });
  document.getElementById('filterEnd').addEventListener('change', () => {
    document.getElementById('monthFilter').value = '';
    updateTaskTables();
  });

  document.getElementById('btnResetDate').addEventListener('click', resetDateFilter);
});
