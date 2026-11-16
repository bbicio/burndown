
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('clientNewBtn')?.addEventListener('click', () => openClientEditModal(null));
  document.getElementById('clientSaveBtn')?.addEventListener('click', () => saveClientFromModal());

function updateNavState() {}
function cgHideAll() {}

// ── PAGE-SPECIFIC NAVIGATION OVERRIDES ───────────────────────────────────────

function showPipelineBoardView() {
  window.location.href = '/pipeline.html';
}

function showPortfolioView() {
  window.location.href = '/portfolio.html';
}

function showPortfolioPlanningView() {
  window.location.href = '/planning.html';
}

function showDashboardView(pid) {
  window.location.href = '/portfolio.html?projectId=' + encodeURIComponent(pid);
}

function renderPipelineBoard() {
  window.location.href = '/pipeline.html';
}

Vue.createApp({
  data() {
    return {
      cgId: null, verId: null,
      cg: null, draft: null,
      shareListRefreshTick: 0, // bumped when #shareModal closes, to reload the inline share-list
      loading: true, loadError: null,
      clients: [], currencies: [], formatMoney: window.formatMoney, moneyFormatExample: window.moneyFormatExample, cgRateIsMissing: window.cgRateIsMissing,
      rateFocusedRole: null, rateRaw: '', rateInvalid: false, rateEdited: false, rateSnapshot: null,
      ratecardMap: {}, ratecardOverrides: {}, isClientRatecard: false, allRatecards: [],
      offerDetailsCollapsed: false, summaryCollapsed: false, sharingCollapsed: false, tagsCollapsed: false,
      attributeLists: [], versionTagItemIds: [], versionTagRows: [], tagSaving: false,
      compactHeader: localStorage.getItem('PDash_cgCompactHeader') === '1',
      selectionMode: false, selectedTaskIds: new Set(), addToProjectMode: 'new', // Task 4, 2026-10-07: 'new' | 'existing' segmented control
      phasingCollapsed: false, // Task 4, 2026-10-07: Monthly Phasing card collapse (not persisted)
      openRoleMenuCode: null, removeColumnConfirm: null, roleMenuPos: { top: 0, left: 0 }, // Task 3, 2026-10-07: role ⋮ menu
      ptcFocusedTask: null, ptcRaw: '', ptcInvalid: false, ptcSnapshot: null, hoursEditing: null, addToProjectSel: '',
      addToProjectModal: { projId: '', projName: '', taskNames: [], taskIds: [] },
      backSaving: false, headerBadge: window.headerBadge,
      proposalBusy: false, // true while cloneProposal is in flight (2026-10-07)
      editingVersionLabel: false, versionLabelBeforeEdit: '', // Task 2, 2026-10-07: inline version-label rename
      shareSummary: { count: 0, initials: [], myRole: '' }, // Task 2, 2026-10-07: Sharing card closed-state summary
      prevCurrency: 'EUR', // last-committed currency, used by Task 5's onCurrencyChange to detect+revert a change
      roleModalMode: 'add', roleModalSourceCode: null, roleSearch: '', roleActiveTeam: '', roleAllRoles: [], roleRcName: '',
      roleSelectionCount: 0, // G-28: "Add selected" stays disabled until something is checked
      myRole: '',
      reassignOwnerOptions: [], reassignOwnerOptionsLoaded: false, reassignOwnerBusy: false,
      // Reactive copy of js/programs.js's own module-level cache — getPrograms() itself is a
      // classic-script global a runtime-compiled Vue template can't resolve (its `with(_ctx)`
      // proxy only sees `_ctx.*`/component `data`/`methods`, the same landmine already documented
      // for openShareModal on this page), so the Create
      // Program modal's "link to existing" dropdown reads this instead.
      programs: [],
      createProgramModal: { existingId: '', name: '', id: '', error: '', saving: false },
      projectNameModal: { name: '', code: '', error: '', submitting: false },
    };
  },
  computed: {
    isAdminUser() { return ['admin', 'sysadmin'].includes(this.myRole); },
    roleModalTeams() {
      const teams = [...new Set(this.roleAllRoles.map(r => r.code.indexOf(' - ') > 0 ? r.code.slice(0, r.code.indexOf(' - ')).trim() : '—'))].sort();
      return ['', ...teams];
    },
    roleModalCurrentCodes() {
      const codes = new Set(this.draft.roles.map(r => r.roleCode));
      if (this.roleModalMode === 'change' && this.roleModalSourceCode) codes.delete(this.roleModalSourceCode);
      return codes;
    },
    roleModalFilteredGroups() {
      let filtered = this.roleAllRoles;
      if (this.roleActiveTeam) {
        filtered = filtered.filter(r => (r.code.indexOf(' - ') > 0 ? r.code.slice(0, r.code.indexOf(' - ')).trim() : '—') === this.roleActiveTeam);
      }
      if (this.roleSearch.trim()) {
        const q = this.roleSearch.trim().toLowerCase();
        filtered = filtered.filter(r => r.label.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
      }
      const groups = {};
      filtered.forEach(r => {
        const team = r.code.indexOf(' - ') > 0 ? r.code.slice(0, r.code.indexOf(' - ')).trim() : '—';
        if (!groups[team]) groups[team] = [];
        groups[team].push(r);
      });
      return Object.entries(groups).sort(([a],[b]) => a.localeCompare(b)).map(([team, roles]) => ({
        team, roles: roles.slice().sort((a,b) => a.label.localeCompare(b.label)).map(r => this.roleModalRoleRow(r)),
      }));
    },
    lockState() {
      this.cg; // reactive dependency — see Global Constraint 9
      if (!this.cgId || !this.verId) return { locked: false, reason: '', message: '' };
      return cgGetVersionLockState(this.cgId, this.verId);
    },
    isLocked() { return this.lockState.locked; },
    // isLocked is the version's own lock state (cgGetVersionLockState) and knows nothing
    // about sharing, so every editable field has to combine it with the viewer check. The
    // server already refuses a viewer's writes (routes/cost-grids.js:89 allows owner and
    // editor only); without this the grid merely *looked* editable and autosaves failed
    // silently, while the neighbouring swapped controls were correctly read-only.
    isReadOnly() { return this.isLocked || this.cg?.myPermission === 'viewer'; },
    // Whether a project has been generated from this version. Reads `this.cg` first: "Generate project" pushes
    // into the raw _cgDraft.linkedProjects (invisible to Vue) and then reassigns `cg` (renderCgVersionTabs),
    // which is the signal that makes this recompute without a reload.
    versionHasProjects() {
      const stored = (this.cg?.versions || []).find(v => v.versionId === this.verId);
      return window.versionCurrencyLocked(stored?.linkedProjects) || window.versionCurrencyLocked(this.draft?.linkedProjects);
    },
    currencyLocked() { return this.isLocked || this.versionHasProjects; },
    currencyLockTitle() { return this.versionHasProjects ? window.PROJECT_RULE_MESSAGES.costgridCurrency : ''; },
    isDraft() { return this.draft?.pipeline === 'Draft'; },
    headerStageDotColor() { const s = this.draft?.pipeline; return s && s !== 'Draft' ? 'var(--pipeline-' + s.toLowerCase() + '-color)' : 'var(--text-muted)'; },
    hasFreeTasks() {
      if (!this.draft) return false;
      return window.cgFreeTasksOf((this.draft.phases || []).flatMap(ph => ph.tasks), this.draft.linkedProjects).length > 0;
    },
    grand() { return this.draft ? cgComputeGrandTotals(this.draft) : { hrs: 0, fee: 0, ptc: 0 }; },
    colTotals() { return this.draft ? cgComputeColumnTotals(this.draft) : {}; },
    // Task 3, 2026-10-07: total column count for full-width colspan rows, including the extra
    // no-roles placeholder column when there are no role columns to span instead.
    gridColspan() {
      const roleCount = this.draft?.roles?.length || 0;
      return 6 + roleCount + (roleCount === 0 ? 1 : 0);
    },
    // Task 3, 2026-10-07: the role whose ⋮ menu (Teleported to body) is currently open, or null.
    activeMenuRole() {
      if (!this.openRoleMenuCode || !this.draft) return null;
      return this.draft.roles.find(r => r.roleCode === this.openRoleMenuCode) || null;
    },
    resolvedClientName() {
      if (!this.draft?.clientId) return '';
      return this.clients.find(c => c.id === this.draft.clientId)?.name || '';
    },
    resolvedRatecardName() {
      if (!this.draft?.ratecardId) return '';
      const rc = this.allRatecards.find(r => String(r.id) === String(this.draft.ratecardId));
      return rc ? (rc.client_name ? rc.name + ' (' + rc.client_name + ')' : rc.name) : '';
    },
    offerDetailsSummary() {
      if (!this.draft) return { period: '', stage: '', client: '', ratecard: '', currency: '', owner: '' };
      return window.cgOfferDetailsSummary(this.draft, { clientName: this.resolvedClientName, ratecardName: this.resolvedRatecardName });
    },
    tagsSummaryGroups() {
      return this.attributeLists.map(list => {
        const active = (list.items || []).filter(it => this.versionTagItemIds.includes(it.id)).map(it => it.label);
        const inactive = this.inactiveAssignedForList(list.id).map(r => r.label);
        return { name: list.name, labels: [...active, ...inactive] };
      }).filter(g => g.labels.length);
    },
    ratecardIdInput: {
      get() { return this.draft?.ratecardId ? String(this.draft.ratecardId) : ''; },
      set(val) { if (this.draft) this.draft.ratecardId = val || null; },
    },
    clientIdInput: {
      get() { return this.draft?.clientId || '__unassigned__'; },
      set(val) { if (this.draft) this.draft.clientId = (val && val !== '__unassigned__') ? val : null; },
    },
    filteredRatecards() {
      const clientId = this.draft?.clientId && this.draft.clientId !== '__unassigned__' ? String(this.draft.clientId) : null;
      return this.allRatecards.filter(rc => rc.client_id == null || (clientId && String(rc.client_id) === clientId));
    },
    // ── Option lists for the <cg-select> controls (2026-10-07 fidelity cycle) ──
    stageOptions() {
      // In Draft a 'Draft' row is present and selected and every real stage is disabled:
      // the control looks and behaves as read-only until the proposal is published (G-12).
      const inDraft = this.isDraft;
      const list = ['SIP', 'Expected', 'Anticipated', 'Committed', 'Canceled'].map(p => ({
        value: p, label: p, dot: 'var(--pipeline-' + p.toLowerCase() + '-color)',
        disabled: inDraft, disabledReason: inDraft ? 'Publish the Draft to choose a stage' : '',
      }));
      if (inDraft) list.unshift({ value: 'Draft', label: 'Draft', dot: 'var(--text-disabled)' });
      return list;
    },
    clientOptions() {
      return (this.clients || []).map(c => ({ value: c.id, label: c.name }));
    },
    ratecardOptions() {
      const cur = this.draft?.currency || 'EUR';
      // Label matches the closed Offer-details summary and board 5.13 ("None — global rates"),
      // so the trigger and the summary never disagree.
      const list = [{ value: '', label: '— None (use global role rates) —', sub: cur + ' · Master Data default rates' }];
      (this.filteredRatecards || []).forEach(rc => {
        // No role count is invented: when the loaded entry carries no entries array, the
        // sub-line is the currency alone.
        const count = Array.isArray(rc.entries) ? rc.entries.length : null;
        const parts = [cur];
        if (count !== null) parts.push(count + ' role' + (count === 1 ? '' : 's'));
        if (rc.client_name) parts.push('client-specific');
        list.push({ value: String(rc.id), label: rc.name, sub: parts.join(' · ') });
      });
      return list;
    },
    currencyOptions() {
      const list = this.currencies.length ? this.currencies : [{ code: 'EUR', symbol: '€', name: 'Euro' }];
      return list.map(cu => ({ value: cu.code, label: `${cu.symbol} ${cu.code} — ${cu.name}` }));
    },
    linkedProjectOptions() {
      return (this.draft?.linkedProjects || []).map(lp => ({ value: lp.projectId, label: lp.projectName || lp.projectId }));
    },
    createdAtLong() {
      if (!this.draft?.createdAt) return '—';
      const d = new Date(this.draft.createdAt);
      if (isNaN(d)) return '—';
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    },
    reassignOwnerPeople() {
      return (this.reassignOwnerOptions || []).map(u => ({ id: u.id, name: u.name, email: u.email }));
    },
    linkedProjectDisplay() {
      if (!this.draft) return [];
      const pipeline = this.draft.pipeline || 'SIP';
      return (this.draft.linkedProjects || []).map(lp => {
        let proj = (config.projects || []).find(p => p.id === lp.projectId);
        if (!proj) {
          proj = (config.projects || []).find(p => p.costGridRef?.cgId === this.cgId && p.costGridRef?.versionId === this.verId);
        }
        const currentProjId = proj?.id || lp.projectId;
        const resolvedTaskNames = (lp.taskIds || []).map(tid => {
          for (const ph of this.draft.phases || []) {
            const t = ph.tasks.find(t => t.taskId === tid);
            if (t?.taskName?.trim()) return t.taskName.trim();
          }
          return null;
        }).filter(Boolean);
        return {
          currentProjId,
          pname: lp.projectName || proj?.name || lp.projectId,
          pcode: proj?.code || '',
          pstatus: proj?.status || '',
          ppipe: (typeof getProjectPipeline === 'function' ? getProjectPipeline(currentProjId) : null) || pipeline,
          taskNames: resolvedTaskNames.length ? resolvedTaskNames : (lp.taskNames || []),
          hasProj: !!proj,
        };
      });
    },
    phasingMonths() {
      const v = this.draft;
      if (!v?.startDate || !v?.endDate || v.startDate.length < 6 || v.endDate.length < 6) return [];
      const sy = parseInt(v.startDate.slice(0, 4)), sm = parseInt(v.startDate.slice(4, 6));
      const ey = parseInt(v.endDate.slice(0, 4)), em = parseInt(v.endDate.slice(4, 6));
      const months = [];
      let y = sy, m = sm;
      while (y < ey || (y === ey && m <= em)) {
        months.push(`${y}-${String(m).padStart(2, '0')}`);
        if (++m > 12) { m = 1; y++; }
      }
      return months;
    },
    phasingByMonth() {
      const months = this.phasingMonths;
      if (!months.length) return { hours: {}, amount: {}, outsideHours: 0, outsideAmount: 0 };
      const monthHours = {}, monthAmount = {};
      let outsideHours = 0, outsideAmount = 0;
      months.forEach(mo => { monthHours[mo] = 0; monthAmount[mo] = 0; });
      (this.draft.phases || []).forEach(ph => (ph.tasks || []).forEach(task => {
        (this.draft.roles || []).forEach(r => {
          const h = parseFloat(task.hours[r.roleCode]) || 0;
          if (!h) return;
          const dist = window.distributeTaskHours(h, task.taskStartDate, task.taskEndDate, months);
          for (const [mo, hh] of Object.entries(dist.byMonth)) {
            if (mo in monthHours) { monthHours[mo] += hh; monthAmount[mo] += hh * (r.rate || 0); }
          }
          outsideHours += dist.outside;
          outsideAmount += dist.outside * (r.rate || 0);
        });
      }));
      return { hours: monthHours, amount: monthAmount, outsideHours, outsideAmount };
    },
    // Dates C3: tasks that leave the version period, and the banner text built from them.
    outOfPeriod() {
      const d = this.draft;
      if (!d) return [];
      const tasks = (d.phases || []).flatMap(ph => (ph.tasks || []).map(t => ({
        name: t.taskName || 'Untitled task', start: t.taskStartDate, end: t.taskEndDate, ref: t,
      })));
      return window.outOfPeriodTasks(tasks, d.startDate, d.endDate, 'version');
    },
    outOfPeriodRefs() { return new Set(this.outOfPeriod.map(o => o.ref)); },
    outOfPeriodMessage() {
      const d = this.draft;
      return window.outOfPeriodMessage({ list: this.outOfPeriod, start: d?.startDate, end: d?.endDate, noun: 'proposal' });
    },
    periodTaskDates() {
      return (this.draft?.phases || []).flatMap(ph => (ph.tasks || []).flatMap(t => [t.taskStartDate, t.taskEndDate]));
    },
    periodStartBounds() { return window.periodBounds(this.periodTaskDates, 'start', this.draft?.endDate || ''); },
    periodEndBounds() { return window.periodBounds(this.periodTaskDates, 'end', this.draft?.startDate || ''); },
    phasingTotals() {
      const { hours, amount } = this.phasingByMonth;
      const months = this.phasingMonths;
      return {
        totalAmt: months.reduce((s, mo) => s + (amount[mo] || 0), 0),
        totalH: months.reduce((s, mo) => s + (hours[mo] || 0), 0),
      };
    },
    // Task 4, 2026-10-07: largest monthly Budget amount, used to size the proportional bar under
    // each month's Budget cell (0 when there's no period / no amounts, so the bars don't divide by zero).
    maxMonthAmount() {
      const vals = Object.values(this.phasingByMonth.amount || {});
      return vals.length ? Math.max(...vals) : 0;
    },
  },
  // Task 3, 2026-10-07: role ⋮ menu — close on outside click/Escape, reposition on scroll/resize
  // while open. Registered once; the menu's own open/close state lives in openRoleMenuCode.
  mounted() {
    this._cgRoleMenuOutsideClick = (e) => {
      if (this.openRoleMenuCode && !e.target.closest('.cg-col-menu') && !e.target.closest('.cg-col-menu-btn')) {
        this.openRoleMenuCode = null;
      }
    };
    this._cgRoleMenuEscape = (e) => {
      if (e.key === 'Escape' && this.openRoleMenuCode) this.openRoleMenuCode = null;
    };
    this._cgRoleMenuReposition = () => {
      if (!this.openRoleMenuCode) return;
      if (this._cgRoleMenuBtnEl?.isConnected) this.positionRoleMenu({ currentTarget: this._cgRoleMenuBtnEl });
      else this.openRoleMenuCode = null;
    };
    document.addEventListener('click', this._cgRoleMenuOutsideClick);
    document.addEventListener('keydown', this._cgRoleMenuEscape);
    window.addEventListener('scroll', this._cgRoleMenuReposition, true);
    window.addEventListener('resize', this._cgRoleMenuReposition);
  },
  beforeUnmount() {
    document.removeEventListener('click', this._cgRoleMenuOutsideClick);
    document.removeEventListener('keydown', this._cgRoleMenuEscape);
    window.removeEventListener('scroll', this._cgRoleMenuReposition, true);
    window.removeEventListener('resize', this._cgRoleMenuReposition);
  },
  watch: {
    // The role-modal checkboxes live in the DOM, not in Vue state, so filtering the list
    // destroys the checked rows while roleSelectionCount still counts them: "Add selected"
    // stayed enabled for a selection that no longer existed, and cgAddSelectedRoles() then
    // added only whatever happened to be visible. Recount once the filtered list is drawn.
    roleSearch() { this.$nextTick(() => this.refreshRoleSelectionCount()); },
    roleActiveTeam() { this.$nextTick(() => this.refreshRoleSelectionCount()); },
  },
  methods: {
    esc, pipelineBadge, statusBadgeLarge, cgScheduleAutoSave, openShareModal,
    async loadReassignOwnerOptions() {
      try {
        const users = await Api.users.activeList();
        this.reassignOwnerOptions = users.map(u => ({
          id: u.id,
          name: `${u.first_name} ${u.last_name}`.trim() || u.email,
          email: u.email,
          label: `${u.first_name} ${u.last_name} (${u.email})`,
        }));
      } catch (e) {
        console.warn('[reassign-owner] failed to load active users:', e.message);
        this.reassignOwnerOptions = [];
      } finally {
        this.reassignOwnerOptionsLoaded = true;
      }
    },
    // 2026-10-07: takes the chosen user id from <cg-people-picker>'s `select` event; the
    // picker is a trigger, not a persistent selection, so there is nothing to reset.
    onReassignOwnerChange(newOwnerId) {
      if (!newOwnerId) return;
      const label = this.reassignOwnerOptions.find(u => u.id === newOwnerId)?.label || 'this user';
      showConfirm(`Reassign this proposal to ${label}?\n\nThey will become the owner, and will gain editor access to every project already linked to this proposal.`, () => this.reassignOwner(newOwnerId));
    },
    async reassignOwner(newOwnerId) {
      this.reassignOwnerBusy = true;
      try {
        const result = await Api.costGrids.reassignOwner(this.cgId, newOwnerId);
        if (this.cg) { this.cg.ownerId = newOwnerId; this.cg.ownerName = result.newOwner; }
        this.shareListRefreshTick++;
        this.loadShareSummary();
      } catch (e) {
        showInfo(`Failed to reassign owner: ${e.message}`, 'Reassignment failed');
      } finally {
        this.reassignOwnerBusy = false;
      }
    },
    roleModalRoleRow(r) {
      const already = this.roleModalCurrentCodes.has(r.code);
      const currency = this.draft?.currency || 'EUR';
      const currencyRate = parseFloat(this.draft?.currencyRate) || 1.0;
      const resolved = resolveRoleRate({
        roleId: r.id, globalRate: r.rate || 0, currency, currencyRate,
        ratecardMap: this.ratecardMap, ratecardOverrides: this.ratecardOverrides, roleOverrides: r.rateOverrides || {},
      });
      const rcRate = this.ratecardMap[String(r.id)];
      return {
        ...r,
        already,
        effectiveRate: resolved.effectiveRate,
        curCode: currency,   // the badge formats the rate with formatMoney in this currency ("€ 135,00/h")
        hasOverride: resolved.isOverride,
        hasCustom: this.isClientRatecard && rcRate !== undefined && rcRate !== (r.rate || 0),
        zeroRate: !resolved.effectiveRate || resolved.effectiveRate === 0,
        isSingleMode: this.roleModalMode === 'change' || this.roleModalMode === 'duplicate',
        isSource: r.code === this.roleModalSourceCode,
      };
    },
    openProjectNameModal(defaultName) {
      this.projectNameModal = { name: defaultName || '', code: '', error: '', submitting: false };
      bootstrap.Modal.getOrCreateInstance(document.getElementById('cgProjectNameModal')).show();
    },
    // Chains a follow-up (which may itself open another modal, e.g. Bootstrap's own show()) off
    // this modal's own hidden.bs.modal event rather than firing it synchronously right after
    // hide() — hide() only starts the fade-out; calling show() on a second modal before it
    // finishes can leave body scroll-locking/backdrop state in a bad spot (round-2 code-review
    // fix).
    hideModalThen(modalId, fn) {
      const modalEl = document.getElementById(modalId);
      const instance = bootstrap.Modal.getInstance(modalEl);
      if (!instance) {
        // No live instance to hide (already closed / never shown) — run the follow-up directly
        // rather than registering a listener that would otherwise never fire.
        console.warn('[hideModalThen] no Modal instance for #' + modalId + ', running follow-up directly');
        fn();
        return;
      }
      modalEl.addEventListener('hidden.bs.modal', fn, { once: true });
      instance.hide();
    },
    submitProjectNameModal() {
      if (this.projectNameModal.submitting) return; // already in flight -- ignore a fast repeat click/Enter
      const name = this.projectNameModal.name.trim();
      if (!name) { this.projectNameModal.error = 'Project name is required.'; return; }
      const code = this.projectNameModal.code.trim();
      this.projectNameModal.submitting = true;
      this.hideModalThen('cgProjectNameModal', () => cgSubmitProjectName(name, code));
    },
    openCreateProgramModal() {
      this.createProgramModal = { existingId: '', name: '', id: '', error: '', saving: false };
      bootstrap.Modal.getOrCreateInstance(document.getElementById('cgCreateProgramModal')).show();
    },
    async saveCreateProgramModal() {
      if (this.createProgramModal.saving) return; // already in flight -- ignore a fast repeat click
      // Linking to an already-established program (e.g. after a duplicate-ID create attempt, or
      // two proposals meant to share one program from the start) needs no API call of its own.
      if (this.createProgramModal.existingId) {
        this.hideModalThen('cgCreateProgramModal', () => cgResumePendingGeneration(this.createProgramModal.existingId));
        return;
      }
      const name = this.createProgramModal.name.trim();
      const id = this.createProgramModal.id.trim();
      if (!name) { this.createProgramModal.error = 'Name is required.'; return; }
      if (!id) { this.createProgramModal.error = 'Program ID is required.'; return; }
      this.createProgramModal.saving = true;
      try {
        const created = await Api.programs.create(id, name);
        this.programs.push(created);
        this.hideModalThen('cgCreateProgramModal', () => cgResumePendingGeneration(created.id));
      } catch (e) {
        this.createProgramModal.error = e.message || 'Save failed.';
      } finally {
        this.createProgramModal.saving = false;
      }
    },
    async openRoleModal(mode, sourceRoleCode) {
      this.roleModalMode = mode || 'add';
      this.roleModalSourceCode = sourceRoleCode || null;
      // cgAddSelectedRoles() (js/costgrid.js, kept unchanged by this task) reads these
      // module-level globals to decide add/change/duplicate behavior — must stay in sync
      // even though addRoleColumn/changeRole/duplicateRole call this method directly and
      // never go through the openCgRoleSelectModal() bridge.
      _cgRoleModalMode = this.roleModalMode;
      _cgRoleModalSourceCode = this.roleModalSourceCode;
      this.roleAllRoles = getRoles();
      this.roleActiveTeam = '';
      this.roleSearch = '';
      await cgUpdateActiveRatecardMap();
      this.ratecardMap = { ..._cgActiveRatecardMap };
      this.ratecardOverrides = { ..._cgActiveRatecardOverrides };
      this.isClientRatecard = _cgIsClientRatecard;
      this.roleSelectionCount = 0;
      this.roleRcName = '';
      // Vue binds :disabled/:value on these inputs but not `checked`, so ticks survive an
      // Esc/Cancel dismissal. Clearing them here keeps the DOM and roleSelectionCount in
      // step — otherwise the reopened modal shows checked rows with "Add selected" greyed.
      document.querySelectorAll('#cgRoleSelectModal .cg-role-checkbox').forEach(cb => { cb.checked = false; });
      const rcId = this.draft?.ratecardId;
      if (rcId) {
        const rc = this.allRatecards.find(r => String(r.id) === String(rcId));
        if (rc) this.roleRcName = rc.name;
      }
      bootstrap.Modal.getOrCreateInstance(document.getElementById('cgRoleSelectModal')).show();
      this.$nextTick(() => document.getElementById('cgRoleSearch')?.focus());
    },
    // The checkboxes are plain DOM inputs read back by cgAddSelectedRoles(); this only
    // mirrors how many are checked so the footer button can be disabled (G-28).
    refreshRoleSelectionCount() {
      this.roleSelectionCount = document.querySelectorAll('#cgRoleSelectModal .cg-role-checkbox:checked:not(:disabled)').length;
    },
    confirmRoleSelection() { cgAddSelectedRoles(); },
    versionTabLabel(v) {
      const projCount = (v.linkedProjects || []).length;
      return v.versionLabel + (projCount > 0 ? ` (${projCount})` : '');
    },
    versionTabTitle(v) {
      const lockState = cgGetVersionLockState(this.cgId, v.versionId);
      return lockState.locked ? lockState.message : '';
    },
    resyncFromGlobals() {
      // `this.draft` and `_cgDraft` are kept as the SAME object reference (see openVersion) —
      // every kept-unchanged global mutates _cgDraft's fields in place, which Vue's v-model
      // reads/writes go through too. Re-cloning `this.draft` here would silently break that
      // invariant (cgAutoSave() would then keep saving a stale snapshot of the FIRST clone
      // forever, since it reads `_cgDraft` directly, not `this.draft`). What raw external
      // mutation *doesn't* get automatically is a re-render trigger (Vue's reactivity fires
      // only on writes that go through its own proxy) — $forceUpdate() supplies that without
      // touching the reference. See Global Constraint 9.
      if (_cgActiveCgId) this.cg = cgLoad(_cgActiveCgId);
      const wasSelecting = this.selectionMode;
      this.selectionMode = _cgSelectionMode;
      if (this.selectionMode && !wasSelecting) this.addToProjectMode = 'new';
      this.selectedTaskIds = new Set(_cgSelectedTaskIds);
      this.$forceUpdate();
    },
    async openVersion(cgId, versionId) {
      this.loading = true; this.loadError = null;
      let cgRec = cgLoad(cgId);
      if (!cgRec) { this.loadError = 'Cost grid not found or access denied.'; this.loading = false; return; }
      let resolvedVerId = versionId;
      if (!cgRec.versions.find(v => v.versionId === resolvedVerId)) {
        resolvedVerId = cgRec.versions[0]?.versionId;
        if (!resolvedVerId) { this.loadError = 'Version not found.'; this.loading = false; return; }
      }
      await cgLoadStructureFromApi(cgId, resolvedVerId);
      cgRec = cgLoad(cgId);
      const version = cgRec.versions.find(v => v.versionId === resolvedVerId);
      if (!version) { this.loadError = 'Version not found.'; this.loading = false; return; }

      this.cgId = cgId; this.verId = resolvedVerId;
      _cgActiveCgId = cgId; _cgActiveVersionId = resolvedVerId;
      _cgDraft = cgMigrateVersion(JSON.parse(JSON.stringify(version)));
      _cgSelectionMode = false; _cgSelectedTaskIds = new Set();
      this.editingVersionLabel = false;
      this.summaryCollapsed = false;
      // A menu or removal confirmation left open on the previous version must not follow the switch.
      this.openRoleMenuCode = null;
      this.removeColumnConfirm = null;
      this._cgRoleMenuBtnEl = null;
      {
        const isDraftVersion = version.pipeline === 'Draft';
        const defaults = window.cgSectionDefaults(isDraftVersion);
        let stored = null;
        try {
          const raw = localStorage.getItem('PDash_cgSections:' + cgId);
          const parsed = raw ? JSON.parse(raw) : null;
          stored = (parsed && typeof parsed === 'object') ? parsed : null;
        } catch (e) { stored = null; }
        this.offerDetailsCollapsed = stored?.od ?? defaults.od;
        this.tagsCollapsed = stored?.tags ?? defaults.tags;
        this.sharingCollapsed = stored?.sh ?? defaults.sh;
      }
      this.cg = cgRec;
      // `this.draft` is assigned the SAME object as `_cgDraft` — not a clone of it — and this
      // is the ONLY place that reference is ever swapped (see Global Constraint 9). Every
      // subsequent Vue v-model edit and every kept-unchanged global's in-place mutation of
      // `_cgDraft.foo = ...` both land on this one object, so cgAutoSave() (which reads
      // `_cgDraft` directly) always sees the current edited state.
      this.draft = _cgDraft;
      this.prevCurrency = this.draft.currency || 'EUR';
      this.selectionMode = false; this.selectedTaskIds = new Set(); this.addToProjectMode = 'new';

      try {
        const tagRows = await Api.costGrids.versions.tags.list(cgId, resolvedVerId);
        this.versionTagItemIds = tagRows.map(r => r.item_id);
        this.versionTagRows = tagRows;
      } catch (e) {
        console.warn('[costgrid] load version tags failed:', e.message);
        this.versionTagItemIds = [];
        this.versionTagRows = [];
      }

      await cgUpdateActiveRatecardMap(); // loads the ratecard maps only — saved rates are not re-priced
      this.ratecardMap = { ..._cgActiveRatecardMap };
      this.ratecardOverrides = { ..._cgActiveRatecardOverrides };
      this.isClientRatecard = _cgIsClientRatecard;

      if (typeof loadRatecardsForDropdown === 'function') {
        this.allRatecards = await loadRatecardsForDropdown().catch(() => []);
      }

      const url = new URL(window.location.href);
      url.searchParams.set('cgId', cgId);
      url.searchParams.set('verId', resolvedVerId);
      window.history.replaceState(null, '', url.toString());
      document.title = 'PDash — ' + (this.cg?.name || 'Cost Grid');

      this.loadShareSummary();

      this.loading = false;
    },
    async loadShareSummary() {
      if (!this.cgId) { this.shareSummary = { count: 0, initials: [], myRole: '' }; return; }
      try {
        const rows = await Api.costGrids.shares.list(this.cgId);
        const myRole = this.cg?.myPermission || (window.__navUser?.id === this.cg?.ownerId ? 'owner' : '');
        this.shareSummary = {
          count: rows.length,
          initials: rows.slice(0, 4).map(r => navInitials(r)),
          myRole,
        };
      } catch (e) {
        console.warn('[costgrid] loadShareSummary failed:', e.message);
        this.shareSummary = { count: 0, initials: [], myRole: '' };
      }
    },
    persistSectionState() {
      if (!this.cgId) return;
      try {
        localStorage.setItem('PDash_cgSections:' + this.cgId, JSON.stringify({
          od: this.offerDetailsCollapsed, tags: this.tagsCollapsed, sh: this.sharingCollapsed,
        }));
      } catch (e) { /* storage unavailable — non-fatal */ }
    },
    toggleOfferDetails() { this.offerDetailsCollapsed = !this.offerDetailsCollapsed; this.persistSectionState(); },
    toggleTagsCollapsed() { this.tagsCollapsed = !this.tagsCollapsed; this.persistSectionState(); },
    toggleSharingCollapsed() { this.sharingCollapsed = !this.sharingCollapsed; this.persistSectionState(); },
    // Task 4, 2026-10-07: Monthly Phasing's own collapse — not persisted (spec §6), default open.
    togglePhasingCollapsed() { this.phasingCollapsed = !this.phasingCollapsed; },
    versionIsLocked(v) { return cgGetVersionLockState(this.cgId, v.versionId).locked; },
    startEditingVersionLabel() {
      this.versionLabelBeforeEdit = this.draft?.versionLabel || '';
      this.editingVersionLabel = true;
      this.$nextTick(() => {
        const el = document.getElementById('cgVersionLabelInput');
        el?.focus();
        el?.select();
      });
    },
    commitVersionLabelEdit() {
      if (this.draft) {
        const trimmed = (this.draft.versionLabel || '').trim();
        const finalLabel = trimmed || this.versionLabelBeforeEdit || '';
        this.draft.versionLabel = finalLabel;
        // `this.cg` is a separate clone from `this.draft`/`_cgDraft` (see openVersion) — the
        // segmented control's non-editing display reads versionTabLabel(v) off `cg.versions`,
        // not off `draft`, so without this the label would revert to the stale value as soon
        // as editingVersionLabel flips false, only catching up after a version switch/reload.
        const verInCg = (this.cg?.versions || []).find(v => v.versionId === this.verId);
        if (verInCg) verInCg.versionLabel = finalLabel;
      }
      this.editingVersionLabel = false;
      cgScheduleAutoSave();
    },
    cancelVersionLabelEdit() {
      if (this.draft) this.draft.versionLabel = this.versionLabelBeforeEdit || this.draft.versionLabel || '';
      this.editingVersionLabel = false;
    },
    async createNewVersionDirect() {
      await cgCreateNewVersionDirect();
    },
    async switchVersion(verId) {
      if (verId === this.verId) return;
      cgAutoSave();
      await this.openVersion(this.cgId, verId);
    },
    async goBack() {
      cgAutoSave();
      this.backSaving = true;
      await new Promise(r => setTimeout(r, 500));
      window.location.href = '/pipeline.html';
    },
    onHeaderFieldChange() {
      // @change fires on blur, so trimming here cannot rewrite an input the user is still
      // typing into — unlike cgAutoSave(), whose 2 s debounce is also kicked by unrelated
      // controls (hours, PTC, task fields) and used to eat a just-typed trailing space.
      if (this.draft) {
        this.draft.projectName = (this.draft.projectName || '').trim();
        this.draft.note = (this.draft.note || '').trim();
      }
      cgScheduleAutoSave();
    },
    // ── <cg-select> / <cg-date-picker> adapters (2026-10-07) ──────────────────
    // Each writes the value the control emitted and then calls the unchanged handler,
    // which reads it back from this.draft exactly as the native control's @change did.
    onPeriodChange(field, value) {
      if (!this.draft) return;
      this.draft[field] = value || '';
      this.onHeaderFieldChange();
    },
    onStageSelect(value) {
      if (!this.draft || !value || value === this.draft.pipeline) return;
      this.draft.pipeline = value;
      this.onPipelineChange();
    },
    onClientSelect(value) {
      if (!this.draft) return;
      this.clientIdInput = value;
      return this.onClientChange();
    },
    onRatecardSelect(value) {
      if (!this.draft) return;
      this.ratecardIdInput = value;
      return this.onRatecardChange();
    },
    onCurrencySelect(value) {
      if (!this.draft || !value) return;
      this.draft.currency = value;
      this.onCurrencyChange();
    },
    async toggleTag(itemId, event) {
      if (this.isLocked || this.cg?.myPermission === 'viewer') return;
      // In-flight guard: the checkbox is also :disabled while tagSaving is true, so this
      // is a defense-in-depth fallback for the brief window before Vue re-renders that
      // disabled state. The native checkbox has already visually flipped by the time
      // @change fires — if we're bailing out, flip it back so it doesn't show a state
      // that was never applied to versionTagItemIds or saved.
      if (this.tagSaving) { if (event) event.target.checked = !event.target.checked; return; }
      const idx = this.versionTagItemIds.indexOf(itemId);
      const prevItemIds = [...this.versionTagItemIds];
      const prevRows = [...this.versionTagRows];
      const savingForVerId = this.verId;   // the rollback below must not paint this version's tags on another one
      if (idx === -1) {
        this.versionTagItemIds.push(itemId);
      } else {
        this.versionTagItemIds.splice(idx, 1);
        this.versionTagRows = this.versionTagRows.filter(r => r.item_id !== itemId);
      }
      this.tagSaving = true;
      try {
        await Api.costGrids.versions.tags.replace(this.cgId, this.verId, this.versionTagItemIds, { background: true });
      } catch (e) {
        console.warn('[costgrid] saveTags:', e.message);
        if (this.verId === savingForVerId) {
          this.versionTagItemIds = prevItemIds;
          this.versionTagRows = prevRows;
        }
      } finally {
        this.tagSaving = false;
      }
    },
    // An assigned tag whose item was later deactivated stays assigned (per spec) but
    // no longer appears in `attributeLists` (active items only) — render it separately
    // so it stays visible and removable.
    inactiveAssignedForList(listId) {
      return this.versionTagRows.filter(r => r.list_id === listId && r.status !== 'active');
    },
    onPipelineChange() {
      cgPropagatePipelineToProjects();
      const cgFresh = cgLoad(this.cgId);
      if (cgFresh) this.cg = cgFresh;
      cgAutoSave();
    },
    async onClientChange() {
      await this.refreshRatecards();
      cgScheduleAutoSave();
    },
    openClientsModal() {
      showClientsModal();
      document.getElementById('clientsModal')?.addEventListener('hidden.bs.modal', () => {
        this.clients = getClients();
      }, { once: true });
    },
    async onRatecardChange() {
      // this.draft IS _cgDraft (same reference — see openVersion), so this.draft.ratecardId
      // is already current; cgUpdateActiveRatecardMap() reads _cgDraft.ratecardId directly.
      await cgUpdateActiveRatecardMap({ syncRates: true }); // re-prices the non-Custom roles in place
      this.ratecardMap = { ..._cgActiveRatecardMap };
      this.ratecardOverrides = { ..._cgActiveRatecardOverrides };
      this.isClientRatecard = _cgIsClientRatecard;
      this.$forceUpdate(); // reflect the in-place role-rate adjustment (Global Constraint 9)
      cgScheduleAutoSave();
    },
    async refreshRatecards() {
      // Mirrors the filtering cgPopulateRatecardDropdown() used to do — the actual <option>
      // filtering now lives in the filteredRatecards computed; this only resets an
      // out-of-range selection and re-syncs the active ratecard map.
      const clientId = this.draft?.clientId && this.draft.clientId !== '__unassigned__' ? String(this.draft.clientId) : null;
      const valid = this.allRatecards.find(rc => String(rc.id) === String(this.draft.ratecardId) && (rc.client_id == null || (clientId && String(rc.client_id) === clientId)));
      const cleared = !!(this.draft.ratecardId && !valid);
      if (cleared) this.draft.ratecardId = null; // this.draft IS _cgDraft
      // Clearing the ratecard is a ratecard change: re-price the non-Custom roles; otherwise nothing is re-priced.
      await cgUpdateActiveRatecardMap({ syncRates: cleared });
      this.ratecardMap = { ..._cgActiveRatecardMap };
      this.ratecardOverrides = { ..._cgActiveRatecardOverrides };
      this.isClientRatecard = _cgIsClientRatecard;
      this.$forceUpdate();
    },
    saveVersion() { cgSaveVersion(); },
    deleteVersion() {
      if (!this.cg || !this.verId) return;
      const v = this.cg.versions.find(v => v.versionId === this.verId);
      if (!v) return;
      cgConfirmDeleteVersion(this.cgId, this.verId, v.versionLabel, () => { window.location.href = 'pipeline.html'; });
    },
    publishDraft() { cgPublishDraft(); },
    openLinkedProject(projId) { cgAutoSave(); showDashboardView(projId); },
    exportXls() { cgExportXls(); },
    generateProject() { if (this.isReadOnly) return; cgGenerateProject(); },
    moneyInput(amount) { return window.formatMoneyInput(amount, this.draft?.currency || 'EUR', window.__currencies); },
    onPtcFocus(task) {
      this.ptcFocusedTask = task.taskId;
      this.ptcSnapshot = task.ptc;
      this.ptcRaw = this.moneyInput(task.ptc);
      this.ptcInvalid = false;
    },
    onPtcInput(task, event) {
      this.ptcRaw = event.target.value;
      const v = window.readMoneyInput(this.ptcRaw, this.draft.currency || 'EUR', this.currencies);
      if (Number.isNaN(v)) { this.ptcInvalid = true; return; }
      this.ptcInvalid = false;
      task.ptc = v === null ? 0 : v;
      cgScheduleAutoSave();
    },
    onPtcBlur(task) {
      if (this.ptcInvalid && this.ptcSnapshot !== null) {
        task.ptc = this.ptcSnapshot;
        cgScheduleAutoSave();
      }
      this.ptcFocusedTask = null; this.ptcRaw = ''; this.ptcInvalid = false; this.ptcSnapshot = null;
    },
    addPhase() {
      if (this.isReadOnly) return;
      this.draft.phases.push({ phaseId: cgNewPhId(), phaseName: 'New phase', tasks: [] });
      cgScheduleAutoSave();
    },
    roleBaseline(role) {
      const roleObj = getRoles().find(gr => gr.code === role.roleCode);
      const roleId = roleObj?.id;
      const globalRate = roleObj?.rate;
      if (roleId == null) return { eurRate: globalRate || 0, effectiveRate: role.rate, isOverride: false };
      return resolveRoleRate({
        roleId, globalRate,
        currency: this.draft.currency || 'EUR',
        currencyRate: parseFloat(this.draft?.currencyRate) || 1.0,
        ratecardMap: this.ratecardMap, ratecardOverrides: this.ratecardOverrides,
        roleOverrides: roleObj?.rateOverrides || {},
      });
    },
    onRateFocus(role) {
      this.rateFocusedRole = role.roleCode;
      this.rateSnapshot = { rate: role.rate, rateIsCustom: role.rateIsCustom, baseline: this.roleBaseline(role).effectiveRate };
      this.rateRaw = role.rateIsCustom
        ? window.formatMoneyInput(role.rate, this.draft.currency || 'EUR', this.currencies, { keepZero: true })
        : window.formatMoneyInput(role.rate, this.draft.currency || 'EUR', this.currencies);
      this.rateEdited = false;
      this.rateInvalid = false;
    },
    onRateInput(role, event) {
      this.rateRaw = event.target.value;
      this.rateEdited = true;
      const v = window.readMoneyInput(this.rateRaw, this.draft.currency || 'EUR', this.currencies);
      if (v === null) { this.rateInvalid = false; return; }
      if (Number.isNaN(v)) { this.rateInvalid = true; return; }
      this.rateInvalid = false;
      const baseline = this.rateSnapshot ? this.rateSnapshot.baseline : this.roleBaseline(role).effectiveRate;
      role.rate = v;
      role.rateIsCustom = v !== baseline;
      cgScheduleAutoSave();
    },
    onRateBlur(role) {
      if (this.rateInvalid && this.rateSnapshot) {
        role.rate = this.rateSnapshot.rate;
        role.rateIsCustom = this.rateSnapshot.rateIsCustom;
        cgScheduleAutoSave();
      } else if (this.rateEdited && this.rateRaw.trim() === '') this.resetRoleRate(role);
      this.rateFocusedRole = null; this.rateRaw = ''; this.rateInvalid = false; this.rateEdited = false; this.rateSnapshot = null;
    },
    moveRole(role, dir) {
      const idx = this.draft.roles.findIndex(r => r.roleCode === role.roleCode);
      const newIdx = idx + dir;
      if (idx < 0 || newIdx < 0 || newIdx >= this.draft.roles.length) return;
      const roles = this.draft.roles;
      [roles[idx], roles[newIdx]] = [roles[newIdx], roles[idx]];
      cgScheduleAutoSave();
    },
    // Task 3, 2026-10-07: role ⋮ menu — the only way the menu opens/closes. Outside-click/Escape/
    // scroll handlers (registered in mounted()) close the menu by setting openRoleMenuCode = null
    // directly, bypassing this method, so they deliberately do NOT reset removeColumnConfirm —
    // only opening a (possibly different) menu via this method does.
    openRoleMenu(code) {
      if (this.isReadOnly) return;
      this.removeColumnConfirm = null;
      this.openRoleMenuCode = this.openRoleMenuCode === code ? null : code;
    },
    positionRoleMenu(event) {
      const btn = event?.currentTarget;
      if (!btn) return;
      this._cgRoleMenuBtnEl = btn;
      const rect = btn.getBoundingClientRect();
      const menuWidth = 260;
      this.roleMenuPos = {
        top: rect.bottom + 4,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8)),
      };
    },
    resetRoleRate(role) {
      if (this.isReadOnly) return;
      const baseline = this.roleBaseline(role);
      role.rate = baseline.effectiveRate;
      role.rateIsCustom = false;
      cgScheduleAutoSave();
    },
    onRemoveColumnClick(role) {
      if (this.isReadOnly) return;
      const code = role.roleCode;
      if (this.removeColumnConfirm !== code) { this.removeColumnConfirm = code; return; }
      this.draft.roles = this.draft.roles.filter(r => r.roleCode !== code);
      this.draft.phases.forEach(ph => ph.tasks.forEach(t => delete t.hours[code]));
      cgScheduleAutoSave();
      this.removeColumnConfirm = null;
      this.openRoleMenuCode = null;
    },
    addRoleColumn() { if (this.isReadOnly) return; this.openRoleModal('add', null); },
    changeRole(code) { if (this.isReadOnly) return; this.openRoleModal('change', code); },
    duplicateRole(code) { if (this.isReadOnly) return; this.openRoleModal('duplicate', code); },
    toggleCompactHeader() {
      this.compactHeader = !this.compactHeader;
      localStorage.setItem('PDash_cgCompactHeader', this.compactHeader ? '1' : '0');
    },
    toggleSummaryCollapsed() { this.summaryCollapsed = !this.summaryCollapsed; },
    taskTotals(task) { return cgComputeTaskTotals(task, this.draft.roles); },
    phaseTotals(phase) { return cgComputePhaseTotals(phase, this.draft.roles); },
    phaseDatesLabel(phase) {
      const dates = phase.tasks.flatMap(t => [t.taskStartDate, t.taskEndDate]).filter(Boolean).sort();
      return dates.length ? `${cgFmtMonth(dates[0])} – ${cgFmtMonth(dates[dates.length-1])}` : '';
    },
    isTaskAssigned(task) {
      return window.cgIsTaskAssigned(task, this.draft?.linkedProjects);
    },
    // Task 3, 2026-10-07: returns the linked project's display name for an assigned task, or ''
    // for a free task — resolved the same way linkedProjectDisplay resolves its taskNames (an
    // id match first, falling back to a case-insensitive name match, since older linked-project
    // records only carry taskNames).
    taskAssignedProjectName(task) {
      if (!this.draft) return '';
      const nameLower = task.taskName?.trim().toLowerCase();
      const lp = (this.draft.linkedProjects || []).find(l =>
        (l.taskIds || []).includes(task.taskId) ||
        (l.taskNames || []).some(n => n?.trim().toLowerCase() === nameLower)
      );
      return lp ? (lp.projectName || lp.projectId || '') : '';
    },
    deletePhase(phase) {
      if (this.isReadOnly) return;
      if (phase.tasks.some(t => this.isTaskAssigned(t))) {
        showInfo("Can't delete: this phase has tasks linked to a project.");
        return;
      }
      showConfirm(`Delete phase "${phase.phaseName}" and all its tasks?`, () => {
        this.draft.phases = this.draft.phases.filter(p => p.phaseId !== phase.phaseId);
        cgScheduleAutoSave();
      }, null, '✕ Delete phase');
    },
    deleteTask(phase, task) {
      if (this.isReadOnly) return;
      if (this.isTaskAssigned(task)) {
        showInfo("Can't delete: this task is linked to a project.");
        return;
      }
      showConfirm(`Delete task "${task.taskName || 'this task'}"?`, () => {
        phase.tasks = phase.tasks.filter(t => t.taskId !== task.taskId);
        cgScheduleAutoSave();
      }, null, '✕ Delete task');
    },
    addTask(phase) {
      if (this.isReadOnly) return;
      phase.tasks.push({ taskId: cgNewTkId(), taskName: '', taskDescription: '', ptc: 0, taskStartDate: '', taskEndDate: '', hours: {} });
      cgScheduleAutoSave();
    },
    // 2026-10-07: accepts either the ISO value emitted by <cg-date-picker> or a native
    // input event, so the method's older call shape keeps working.
    onTaskDateChange(task, field, valueOrEvent) {
      const iso = (valueOrEvent && valueOrEvent.target)
        ? (parseDayText(valueOrEvent.target.value) || '')
        : (valueOrEvent || '');
      task[field] = iso;
      cgScheduleAutoSave();
    },
    onHoursInput(task, roleCode, event) {
      if (this.hoursEditing && this.hoursEditing.taskId === task.taskId && this.hoursEditing.roleCode === roleCode) {
        this.hoursEditing.raw = event.target.value;
      }
      const val = parseFloat(event.target.value) || 0;
      if (val > 0) task.hours[roleCode] = val; else delete task.hours[roleCode];
      cgScheduleAutoSave();
    },
    onHoursBlur(task, roleCode, event) {
      const val = parseFloat(event.target.value) || 0;
      if (val > 0 && !isValidSoldHours(val)) {
        showInfo(`Invalid sold hours "${val}". Allowed values: whole numbers, or with a fraction of .25, .5, or .75.`);
        delete task.hours[roleCode];
        event.target.value = '';
        cgScheduleAutoSave();
      }
      this.hoursEditing = null;
    },
    toggleTaskSelection(task) {
      if (this.selectedTaskIds.has(task.taskId)) { this.selectedTaskIds.delete(task.taskId); _cgSelectedTaskIds.delete(task.taskId); }
      else { this.selectedTaskIds.add(task.taskId); _cgSelectedTaskIds.add(task.taskId); }
    },
    // The three helpers below work on any list of tasks: a phase's, or the whole draft's (the six methods after
    // them are one-line wrappers). The free tasks are the ones in no project, see cgFreeTasksOf.
    freeStateOf(tasks) {
      const free = window.cgFreeTasksOf(tasks, this.draft.linkedProjects);
      if (!free.length) return 'none';
      return free.every(t => this.selectedTaskIds.has(t.taskId)) ? 'all' : 'some';
    },
    // 'all' selected → clear them; otherwise select every free task.
    toggleFreeOf(tasks) {
      const clear = this.freeStateOf(tasks) === 'all';
      window.cgFreeTasksOf(tasks, this.draft.linkedProjects).forEach(task => {
        if (clear) { this.selectedTaskIds.delete(task.taskId); _cgSelectedTaskIds.delete(task.taskId); }
        else { this.selectedTaskIds.add(task.taskId); _cgSelectedTaskIds.add(task.taskId); }
      });
    },
    freeLabelOf(tasks, labels) {
      const state = this.freeStateOf(tasks);
      if (state === 'none') return labels.none;
      if (state === 'all') return labels.all;
      return labels.some(window.cgFreeTasksOf(tasks, this.draft.linkedProjects).length);
    },
    // A phase's "Select free"/"Clear phase" toggle.
    phaseFreeState(phase) { return this.freeStateOf(phase.tasks); },
    toggleFreeInPhase(phase) { if (this.isReadOnly) return; this.toggleFreeOf(phase.tasks); },
    phaseFreeLabel(phase) {
      return this.freeLabelOf(phase.tasks, { none: 'All in projects', all: 'Clear phase', some: n => `Select free (${n})` });
    },
    // The same three, over the whole draft.
    selectAllFreeState() { return this.freeStateOf((this.draft.phases || []).flatMap(ph => ph.tasks)); },
    toggleSelectAllFree() { if (this.isReadOnly) return; this.toggleFreeOf((this.draft.phases || []).flatMap(ph => ph.tasks)); },
    selectAllFreeLabel() {
      return this.freeLabelOf((this.draft.phases || []).flatMap(ph => ph.tasks),
        { none: 'Select all free (0)', all: 'Clear selection', some: n => `Select all free (${n})` });
    },
    cancelSelection() { cgExitSelectionMode(); },
    confirmAndGenerate() { if (this.isReadOnly) return; cgConfirmAndGenerate(); },
    // Task 4, 2026-10-07: switching to "Existing project" preselects the single linked project
    // when there's exactly one, so the dropdown isn't a pointless extra step.
    setAddToProjectMode(mode) {
      this.addToProjectMode = mode;
      if (mode === 'existing' && (this.draft.linkedProjects || []).length === 1) {
        this.addToProjectSel = this.draft.linkedProjects[0].projectId;
      }
    },
    addToProject() {
      if (this.isReadOnly) return;
      const projId = this.addToProjectSel;
      if (!projId) { showInfo('Select a project from the dropdown.'); return; }
      if (this.selectedTaskIds.size === 0) { showInfo('Select at least one task.'); return; }
      const lp = (this.draft.linkedProjects || []).find(l => l.projectId === projId);
      const projName = lp?.projectName || projId;
      const selectedIds = [...this.selectedTaskIds];
      const taskNames = selectedIds.map(tid => {
        for (const ph of this.draft.phases || []) {
          const t = ph.tasks.find(t => t.taskId === tid);
          if (t?.taskName?.trim()) return t.taskName.trim();
        }
        return tid;
      });
      this.addToProjectModal = { projId, projName, taskNames, taskIds: selectedIds };
      bootstrap.Modal.getOrCreateInstance(document.getElementById('cgAddToProjectModal')).show();
    },
    async confirmAddToProject() {
      if (this.isReadOnly) return;
      const { projId, taskIds } = this.addToProjectModal;
      bootstrap.Modal.getInstance(document.getElementById('cgAddToProjectModal'))?.hide();
      await cgDoAddTasksToProject(projId, taskIds);
    },
    phasingFmtAmount(n) { return window.formatMoney(n, this.draft.currency || 'EUR', window.__currencies, { rounded: true }); },
    phasingFmtHours(n) { return fmtH(n); },
    taskDateBounds(task, side) {
      const twin = side === 'start' ? task.taskEndDate : task.taskStartDate;
      return window.taskDateBounds(this.draft?.startDate, this.draft?.endDate, twin || '', side);
    },
    isTaskOutOfPeriod(task) { return this.outOfPeriodRefs.has(task); },
    phasingFmtMonth(mo) {
      const [my, mm] = mo.split('-');
      return new Date(parseInt(my), parseInt(mm) - 1).toLocaleString('en', { month: 'short' }) + ' ' + my;
    },
    async cloneProposal() {
      if (!this.cgId || !this.verId) return;
      this.proposalBusy = true;
      let result;
      try {
        result = await cgCloneGrid(this.cgId, this.verId);
      } finally {
        // null: a clone already in flight ignored this call, and that one still owns the button.
        if (result !== null) this.proposalBusy = false;
      }
    },
    onCurrencyChange() {
      const newCurrency = this.draft.currency;
      const prevCurrency = this.prevCurrency;
      if (newCurrency === prevCurrency) return;

      if (!this.draft.roles?.length) {
        this.draft.currencyRate = parseFloat((this.currencies || []).find(c => c.code === newCurrency)?.current_rate) || 1.0;
        cgSyncRoleRatesToBaseline(true);
        this.prevCurrency = newCurrency;
        this.$forceUpdate();
        cgAutoSave();
        return;
      }

      const preview = cgPreviewRateChange(newCurrency);
      const fmtR = (n, code) => window.formatMoney(n, code, window.__currencies);
      const hasCustom = preview.some(r => r.isCustom);
      const roleRows = preview.map(r =>
        `<tr>
          <td style="padding:3px 8px;font-size:.82rem">${esc(r.roleLabel)}</td>
          <td style="padding:3px 8px;font-size:.82rem;text-align:right;color:var(--text-muted)">${fmtR(r.currentRate, prevCurrency)}</td>
          <td style="padding:3px 8px;font-size:.82rem;text-align:right;font-weight:600">${fmtR(r.newRate, newCurrency)}</td>
          ${r.isCustom ? `<td style="padding:3px 8px;font-size:.75rem;color:var(--color-danger-text)">custom → reset</td>` : '<td></td>'}
        </tr>`
      ).join('');

      const modalId = 'cgCurrencyChangeModal';
      let modalEl = document.getElementById(modalId);
      if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = modalId;
        modalEl.className = 'modal fade';
        modalEl.tabIndex = -1;
        modalEl.innerHTML = `
          <div class="modal-dialog modal-dialog-centered" style="max-width:480px">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title" style="font-size:var(--text-base)">Change currency to ${esc(newCurrency)}?</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body" id="${modalId}Body"></div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary btn-sm" id="${modalId}Cancel">Cancel</button>
                <button type="button" class="btn btn-primary btn-sm" id="${modalId}Confirm">Change to ${esc(newCurrency)}</button>
              </div>
            </div>
          </div>`;
        document.body.appendChild(modalEl);
      } else {
        modalEl.querySelector('.modal-title').textContent = `Change currency to ${newCurrency}?`;
        document.getElementById(`${modalId}Confirm`).textContent = `Change to ${newCurrency}`;
      }

      document.getElementById(`${modalId}Body`).innerHTML = `
        <p style="font-size:var(--text-sm);margin-bottom:8px">
          All role rates will be reset to their <strong>${esc(newCurrency)} baseline</strong>.
          ${hasCustom ? '<span style="color:var(--color-danger-text)">Custom rates will be lost.</span>' : ''}
        </p>
        <table style="width:100%;border-collapse:collapse;border:1px solid var(--border-light);border-radius:4px;overflow:hidden">
          <thead style="background:var(--surface-light)">
            <tr>
              <th style="padding:4px 8px;font-size:.75rem;font-weight:600;text-align:left">Role</th>
              <th style="padding:4px 8px;font-size:.75rem;font-weight:600;text-align:right">Current (${esc(prevCurrency)})</th>
              <th style="padding:4px 8px;font-size:.75rem;font-weight:600;text-align:right">New (${esc(newCurrency)})</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${roleRows}</tbody>
        </table>`;

      const bsModal = new bootstrap.Modal(modalEl);
      bsModal.show();

      document.getElementById(`${modalId}Cancel`).onclick = () => {
        bsModal.hide();
        this.draft.currency = prevCurrency; // revert — a genuine Vue-driven mutation, no forceUpdate needed
      };
      document.getElementById(`${modalId}Confirm`).onclick = () => {
        bsModal.hide();
        this.draft.currencyRate = parseFloat((this.currencies || []).find(c => c.code === newCurrency)?.current_rate) || 1.0;
        cgSyncRoleRatesToBaseline(true); // mutates _cgDraft.roles[].rate in place — this.draft IS _cgDraft; reads the rate just set
        this.prevCurrency = newCurrency;
        this.$forceUpdate();
        cgMarkCurrencyChange(); // the save below re-syncs the rates if the server applied another rate
        cgAutoSave();
      };
      modalEl.addEventListener('hidden.bs.modal', () => {
        if (this.draft.currency !== prevCurrency && this.prevCurrency === prevCurrency) {
          this.draft.currency = prevCurrency;
        }
      }, { once: true });
    },
  },
  async created() {
    loadConfig();

    const user = await initNav('pipeline', { breadcrumbs: [
      { label: 'Home', href: '/pipeline.html' },
      { label: 'Pipeline', href: '/pipeline.html' },
      { label: '…' },
    ]});
    if (!user) { this.loadError = 'Failed to connect to the server. Please check your connection and try again.'; this.loading = false; return; }
    this.myRole = user.role || '';
    if (this.isAdminUser) this.loadReassignOwnerOptions();

    try {
      await Promise.all([loadClientsFromApi(), loadProgramsFromApi(), loadRolesFromApi(), loadCurrenciesFromApi(), loadConfigFromApi()]);
    } catch (e) { console.warn('[init] loadClientsFromApi/loadProgramsFromApi/loadRolesFromApi failed:', e.message); }
    this.programs = getPrograms();

    try { await cgSyncFromApi(); } catch (e) { console.warn('[init] cgSyncFromApi failed:', e.message); }

    this.attributeLists = await loadActiveAttributeListsForTagging().catch(e => { console.warn('[costgrid] loadActiveAttributeListsForTagging:', e.message); return []; });

    this.clients = getClients();
    this.currencies = window.__currencies || [];

    const params = new URLSearchParams(window.location.search);
    const cgId = params.get('cgId');
    const versionId = params.get('verId');
    if (!cgId) { window.location.href = '/pipeline.html'; return; }
    const cgRec = cgLoad(cgId);
    if (!cgRec) { this.loadError = 'Cost grid not found or access denied.'; this.loading = false; return; }
    const targetVerId = (versionId && cgRec.versions.find(v => v.versionId === versionId)) ? versionId : cgRec.versions[0]?.versionId;
    if (!targetVerId) { this.loadError = 'Cost grid not found or access denied.'; this.loading = false; return; }

    _cgVueApp = this; // wire the bridge — Global Constraint 7

    document.addEventListener('hidden.bs.modal', e => {
      if (e.target && e.target.id === 'shareModal') { this.shareListRefreshTick++; this.loadShareSummary(); }
      // Any dismissal path (Cancel, X, backdrop, Esc) must abort the whole pending generation —
      // saveCreateProgramModal() already cleared the pending state via cgResumePendingGeneration()
      // on a successful Create, so this is a harmless no-op in that case.
      if (e.target && e.target.id === 'cgCreateProgramModal') cgAbortPendingGeneration();
      // Reset the "Add to project" dropdown on every close of that modal, Confirm or Cancel
      // alike, so it doesn't keep showing the previously-selected project next time.
      if (e.target && e.target.id === 'cgAddToProjectModal') this.addToProjectSel = '';
    });

    await this.openVersion(cgId, targetVerId);
    if (typeof updateBreadcrumbs === 'function' && this.cg) updateBreadcrumbs([
      { label: 'Home', href: '/pipeline.html' },
      { label: 'Pipeline', href: '/pipeline.html' },
      { label: this.cg.name },
    ]);

    // "+ New Proposal" (pipeline.html) opens here with focus=name so the placeholder name
    // can be renamed at once (2026-10-07) — removed from the URL so a reload doesn't repeat it.
    if (params.get('focus') === 'name') {
      this.$nextTick(() => {
        const nameInput = document.getElementById('cgProjectName');
        if (nameInput && !nameInput.disabled) { nameInput.focus(); nameInput.select(); }
      });
      const curUrl = new URL(window.location.href);
      curUrl.searchParams.delete('focus');
      window.history.replaceState(null, '', curUrl.toString());
    }
  },
})
  .component('ph-icon', window.PhIcon)
  .component('share-list', window.ShareListComponent)
  .component('cg-date-picker', window.CgDatePicker)
  .component('cg-select', window.CgSelect)
  .component('cg-people-picker', window.CgPeoplePicker)
  .mount('#costGridEditorSection');

}); // end DOMContentLoaded
