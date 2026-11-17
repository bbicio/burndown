
document.addEventListener('DOMContentLoaded', () => {

let _pbDetailOutsideClickHandler = null;

// After a successful create/clone the page navigates to the editor. If the navigation is cancelled nothing
// unloads the page, so this long enough delay releases New/Clone again and refreshes the board.
const PB_PROPOSAL_FALLBACK_MS = 5000;
const PB_STAGES = ['Draft', 'SIP', 'Expected', 'Anticipated', 'Committed', 'Canceled'];
const PB_STAGE_STYLE = {
  Draft:       { bg: 'var(--surface-light)',             border: 'var(--text-disabled)',              badge: 'var(--text-muted)'                  },
  SIP:         { bg: 'var(--pipeline-sip-bg)',           border: 'var(--pipeline-sip-color)',         badge: 'var(--pipeline-sip-color)'          },
  Expected:    { bg: 'var(--pipeline-expected-bg)',      border: 'var(--pipeline-expected-color)',    badge: 'var(--pipeline-expected-color)'     },
  Anticipated: { bg: 'var(--pipeline-anticipated-bg)',  border: 'var(--pipeline-anticipated-color)', badge: 'var(--pipeline-anticipated-color)' },
  Committed:   { bg: 'var(--pipeline-committed-bg)',    border: 'var(--pipeline-committed-color)',   badge: 'var(--pipeline-committed-color)'   },
  Canceled:    { bg: 'var(--pipeline-canceled-bg)',     border: 'var(--pipeline-canceled-color)',    badge: 'var(--pipeline-canceled-color)'    },
};

// Returns the version to display for a cost grid on the pipeline board.
function pbGetDisplayVersion(cg) {
  const nonDraft = cg.versions.filter(v => v.pipeline !== 'Draft');
  if (nonDraft.length) {
    const withLinks = nonDraft.filter(v => (v.linkedProjects || []).length > 0);
    if (withLinks.length) return withLinks.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    return nonDraft.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  }
  return cg.versions.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
}

function pbGetStage(v) {
  if (v.pipeline) return v.pipeline;
  for (const lp of (v.linkedProjects || [])) {
    const p = (config.projects || []).find(proj => proj.id === lp.projectId)?.pipeline;
    if (p) return p;
  }
  return 'SIP';
}

Vue.createApp({
  data() {
    return {
      refreshTick: 0, // bumped after any _cgStore mutation (see Global Constraint 4)
      shareListRefreshTick: 0, // bumped when #shareModal closes, to reload the inline share-list
      pipelineYears: [],
      selectedYear: new Date().getFullYear(),
      yearDropdownOpen: false,
      newProposalVisible: false,
      selectedCgId: null,
      selectedVerId: null,
      detailLoading: false,
      detailTab: 'overview', // 'overview' | 'tasks' | 'linked' | 'pot'
      currencies: [],
      formatMoney: window.formatMoney,
      potState: null,
      clientGroups: [],
      filterSearch: '',
      filterOwnerIds: [],
      filterClientIds: [],
      filterCurrencies: [],
      filterPriceBuckets: [],
      filterIncludePtc: false,
      currencyMode: 'original', // 'original' | 'eur'
      searchOpen: false,
      collapsedStages: [], // stage names; emptied-on-load columns start collapsed (see created)
      mobileStage: null, // smartphone: selected stage tab (null = first stage with cards)
      proposalBusy: false, // true while createNewProposal/cloneProposal is in flight (2026-10-07)
    };
  },
  computed: {
    activeMobileStage() {
      if (this.mobileStage) return this.mobileStage;
      const first = this.stagesData.find(c => c.cards.length);
      return first ? first.stage : 'Draft';
    },
    activeMobileCol() {
      return this.stagesData.find(c => c.stage === this.activeMobileStage) || this.stagesData[0];
    },
    activeFilterCount() {
      return this.filterOwnerIds.length + this.filterClientIds.length + this.filterCurrencies.length + this.filterPriceBuckets.length;
    },
    filterGroups() {
      return [
        { key: 'owner',    label: 'Owner',    options: this.ownerOptions,       model: 'filterOwnerIds' },
        { key: 'client',   label: 'Client',   options: this.clientOptions,      model: 'filterClientIds' },
        { key: 'currency', label: 'Currency', options: this.currencyOptions,    model: 'filterCurrencies' },
        { key: 'value',    label: 'Value',    options: this.priceBucketOptions, model: 'filterPriceBuckets', withPtc: true },
      ];
    },
    yearCards() {
      this.refreshTick;
      const index = cgGetIndex();
      const cards = [];
      index.forEach(cgId => {
        const cg = cgLoad(cgId);
        if (!cg || !cg.versions?.length) return;
        const v = pbGetDisplayVersion(cg);
        if (!v) return;
        cards.push({ cg, v, stage: pbGetStage(v) });
      });
      return cards;
    },
    openPipeline() {
      return pbOpenPipelineTotal(this.stagesData, this.pbDeps());
    },
    searchSuggestions() {
      return pbSearchSuggestions(this.yearCards, this.filterSearch, this.pbDeps());
    },
    filterableCards() {
      this.refreshTick;
      const index = cgGetIndex();
      const cards = [];
      index.forEach(cgId => {
        const cg = cgLoad(cgId);
        if (!cg || !cg.versions?.length) return;
        const v = pbGetDisplayVersion(cg);
        if (!v) return;
        if (pbGetStage(v) === 'Draft') return;
        cards.push({ cg, v });
      });
      return cards;
    },
    ownerOptions() {
      const seen = new Map();
      this.filterableCards.forEach(({ cg }) => {
        if (cg.ownerId && !seen.has(cg.ownerId)) seen.set(cg.ownerId, cg.ownerName || cg.ownerId);
      });
      return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
    },
    clientOptions() {
      const seen = new Map();
      this.filterableCards.forEach(({ v }) => {
        if (!v.clientId || seen.has(v.clientId)) return;
        const name = getClientName(v.clientId);
        if (name && name !== 'Unassigned') seen.set(v.clientId, name);
      });
      return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
    },
    currencyOptions() {
      const seen = new Set();
      this.filterableCards.forEach(({ v }) => seen.add(v.currency || 'EUR'));
      return Array.from(seen).sort().map(c => ({ value: c, label: c }));
    },
    priceBucketOptions() {
      return [
        { value: '0-20k',    label: '€0 – 20K' },
        { value: '20-50k',   label: '€20K – 50K' },
        { value: '50-100k',  label: '€50K – 100K' },
        { value: '100-200k', label: '€100K – 200K' },
        { value: '200k+',    label: '€200K+' },
      ];
    },
    activeFilters() {
      return {
        search: this.filterSearch,
        ownerIds: this.filterOwnerIds,
        clientIds: this.filterClientIds,
        currencies: this.filterCurrencies,
        priceBuckets: this.filterPriceBuckets,
        includePtc: this.filterIncludePtc,
      };
    },
    filtersActive() {
      return !!this.filterSearch.trim() || this.filterOwnerIds.length > 0 || this.filterClientIds.length > 0 ||
        this.filterCurrencies.length > 0 || this.filterPriceBuckets.length > 0;
    },
    stagesData() {
      this.refreshTick;
      const index = cgGetIndex();
      const grouped = {};
      PB_STAGES.forEach(s => { grouped[s] = []; });
      const filters = this.activeFilters;
      index.forEach(cgId => {
        const cg = cgLoad(cgId);
        if (!cg || !cg.versions?.length) return;
        const v = pbGetDisplayVersion(cg);
        if (!v) return;
        const stage = pbGetStage(v);
        const card = { cg, v };
        // Draft is a private working copy — filters never apply to it.
        if (stage !== 'Draft' && !pbCardMatchesFilters(card, filters, cgComputeGrandTotals, getPipelineBudget, getClientName)) return;
        if (stage === 'Draft') grouped['Draft'].push(card);
        else if (grouped[stage]) grouped[stage].push(card);
        else grouped['SIP'].push(card);
      });
      return PB_STAGES.map(stage => {
        const cards = grouped[stage];
        const st = PB_STAGE_STYLE[stage];
        const header = pbColumnHeader(cards, this.currencyMode, this.pbDeps());
        return { stage, st, cards, header };
      });
    },
    selectedCg() {
      this.refreshTick;
      return this.selectedCgId ? cgLoad(this.selectedCgId) : null;
    },
    selectedVersion() {
      const cg = this.selectedCg;
      if (!cg) return null;
      return cg.versions.find(v => v.versionId === this.selectedVerId) || pbGetDisplayVersion(cg);
    },
    detailStage() {
      return this.selectedVersion ? pbGetStage(this.selectedVersion) : 'SIP';
    },
    detailStageStyle() {
      return PB_STAGE_STYLE[this.detailStage] || PB_STAGE_STYLE.SIP;
    },
    detailBudget() {
      if (!this.selectedVersion) return { fee: 0, ptc: 0 };
      return pbGetVersionBudget(this.selectedVersion, cgComputeGrandTotals, getPipelineBudget);
    },
    projsByRef() {
      if (!this.selectedVersion) return [];
      const v = this.selectedVersion;
      return (config.projects || []).filter(p =>
        p.costGridRef?.cgId === this.selectedCgId && p.costGridRef?.versionId === v.versionId
      );
    },
    detailLinkedProjects() {
      if (!this.selectedVersion || !this.selectedCg) return [];
      const v = this.selectedVersion;
      const projsByRef = this.projsByRef;
      const lps = (v.linkedProjects && v.linkedProjects.length)
        ? v.linkedProjects
        : projsByRef.map(p => ({ projectId: p.id, projectName: p.name }));
      return lps.map(lp => {
        let proj = (config.projects || []).find(p => p.id === lp.projectId);
        if (!proj && projsByRef.length) {
          proj = projsByRef.find(p => p.name === lp.projectName)
              || projsByRef.find(p => lp.projectName && p.name &&
                   (lp.projectName.startsWith(p.name) || p.name.startsWith(lp.projectName)))
              || (projsByRef.length === 1 ? projsByRef[0] : null);
        }
        const navId = proj?.id || lp.projectId;
        return {
          navId,
          pcode: proj?.code || '',
          pname: lp.projectName || proj?.name || lp.projectId,
          pipeline: getProjectPipeline(navId) || proj?.pipeline || '',
          projStatus: proj?.status || '',
          taskNames: lp.taskNames || [],
        };
      });
    },
    detailClientName() {
      if (!this.selectedVersion) return '';
      const v = this.selectedVersion;
      const effectiveClientId = v.clientId
        || this.detailLinkedProjects.map(lp => (config.projects || []).find(p => p.id === lp.navId)?.clientId).find(Boolean)
        || this.projsByRef[0]?.clientId
        || null;
      const name = effectiveClientId ? getClientName(effectiveClientId) : '';
      return name && name !== 'Unassigned' ? name : '';
    },
    detailHasTasks() {
      const phases = this.selectedVersion?.phases || [];
      return phases.some(ph => ph.tasks?.length);
    },
    detailTaskCount() {
      return (this.selectedVersion?.phases || []).reduce((n, ph) => n + (ph.tasks?.length || 0), 0);
    },
    liveRate() {
      if (!this.selectedVersion || this.selectedVersion.currency === 'EUR') return null;
      const entry = this.currencies.find(c => c.code === this.selectedVersion.currency);
      return entry ? parseFloat(entry.current_rate) : null;
    },
    rateStale() {
      const isAdmin = ['admin', 'sysadmin'].includes(window.__navUser?.role);
      return isAdmin && this.liveRate != null && Math.abs(this.liveRate - (this.selectedVersion.currencyRate || 1.0)) > 0.0001;
    },
  },
  methods: {
    esc,
    pipelineBadge,
    pbFmtDate,
    pbFmtMonth,
    getClientName,
    openShareModal,
    showCostGridEditorView,
    deleteGridCard(cgId, name) {
      cgConfirmDeleteGrid(cgId, name, () => { if (cgId === this.selectedCgId) this.closeDetailPanel(); this.refreshTick++; });
    },
    cardClientName(card) {
      const clientId = card.v.clientId;
      const name = clientId ? getClientName(clientId) : '';
      return name && name !== 'Unassigned' ? name : '';
    },
    pbDeps() {
      return { cgComputeGrandTotals, getPipelineBudget, getClientName, formatMoney: window.formatMoney, currencies: window.__currencies };
    },
    offersLabel(py) {
      if (typeof py.offers !== 'number') return '';
      return py.offers === 1 ? '1 offer' : py.offers + ' offers';
    },
    stagePillStyle(stage) {
      if (!PB_STAGE_STYLE[stage] || stage === 'Draft') return { background: 'var(--surface-light)', color: 'var(--text-muted)' };
      const k = stage.toLowerCase();
      return { background: 'var(--pipeline-' + k + '-bg)', color: 'var(--pipeline-' + k + '-color)' };
    },
    projectStatusStyle(status) {
      const key = {
        'Not started yet': 'not-started', 'Started': 'started', 'Started At Risk': 'at-risk',
        'Put on hold': 'on-hold', 'Completed': 'completed',
      }[status || 'Not started yet'] || 'not-started';
      return { background: 'var(--status-' + key + '-bg)', color: 'var(--status-text)' };
    },
    eurEquivalent(n) {
      const v = this.selectedVersion;
      if (!v || !(n > 0) || !v.currency || v.currency === 'EUR') return '';
      const rate = parseFloat(v.currencyRate);
      if (!(rate > 0)) return '';
      return '≈ ' + window.formatMoney(n / rate, 'EUR', this.currencies);
    },
    stageDotColor(stage) {
      return (PB_STAGE_STYLE[stage] || PB_STAGE_STYLE.SIP).badge;
    },
    onSearchFocusOut(e) {
      const wrap = e.currentTarget;
      if (e.relatedTarget && wrap.contains(e.relatedTarget)) return;
      this.searchOpen = false;
    },
    pickClient(c) {
      this.filterClientIds = [c.id];
      this.filterSearch = '';
      this.searchOpen = false;
    },
    pickProposal(p) {
      this.searchOpen = false;
      this.openDetailPanel(p.cgId, p.verId);
    },
    clearFilters() {
      this.filterSearch = '';
      this.filterOwnerIds = [];
      this.filterClientIds = [];
      this.filterCurrencies = [];
      this.filterPriceBuckets = [];
      this.filterIncludePtc = false;
    },
    cardTitle(card) {
      return card.v.projectName || card.cg.name || '—';
    },
    cardAmount(card) {
      return pbCardAmount(card, this.currencyMode, this.pbDeps());
    },
    isCollapsed(stage) {
      return this.collapsedStages.includes(stage);
    },
    toggleStage(stage) {
      this.collapsedStages = this.isCollapsed(stage)
        ? this.collapsedStages.filter(s => s !== stage)
        : this.collapsedStages.concat(stage);
    },
    selectYear(year) {
      this.yearDropdownOpen = false;
      storePipelineYear(year);
      window.location.href = '/pipeline.html?year=' + year;
    },
    async openDetailPanel(cgId, verId) {
      this.selectedCgId = cgId;
      this.selectedVerId = verId;
      this.detailLoading = true;
      this.detailTab = 'overview';

      // Delayed registration avoids the same click that opened the panel
      // (e.g. a card click) immediately triggering the outside-click close.
      if (_pbDetailOutsideClickHandler) document.removeEventListener('mousedown', _pbDetailOutsideClickHandler);
      const handler = (e) => {
        const panel = document.getElementById('pbDetailPanel');
        if (!panel || panel.contains(e.target)) return;
        // Modals opened from the panel (Share/Clone/Confirm/etc.) live outside
        // #pbDetailPanel in the DOM — a click inside one of them must not close the panel.
        if (e.target.closest('.modal') || e.target.classList.contains('modal-backdrop')) return;
        // Clicking another card or a search suggestion switches the panel's content (openDetailPanel) instead of closing it.
        if (e.target.closest('.pb-card') || e.target.closest('.pb-suggest')) return;
        this.closeDetailPanel();
      };
      _pbDetailOutsideClickHandler = handler;
      setTimeout(() => {
        // Superseded by a later openDetailPanel() call before this delay elapsed — don't register.
        if (_pbDetailOutsideClickHandler === handler) document.addEventListener('mousedown', handler);
      }, 200);

      if (typeof cgLoadStructureFromApi === 'function') {
        await cgLoadStructureFromApi(cgId, verId).catch(() => {});
      }
      this.refreshTick++; // structure just loaded into _cgStore — see Global Constraint 4
      this.detailLoading = false;
      this.potRequestSeq = (this.potRequestSeq || 0) + 1;
      const v = this.selectedVersion;
      if (v) this.loadPotSection(v, pbGetStage(v), this.potRequestSeq);
    },
    closeDetailPanel() {
      this.selectedCgId = null;
      this.selectedVerId = null;
      if (_pbDetailOutsideClickHandler) {
        document.removeEventListener('mousedown', _pbDetailOutsideClickHandler);
        _pbDetailOutsideClickHandler = null;
      }
    },
    verStageBadgeColor(ver) {
      return (PB_STAGE_STYLE[pbGetStage(ver)] || PB_STAGE_STYLE.SIP).badge;
    },
    async loadPotSection(v, stage, seq) {
      const isStale = () => this.selectedCgId === null || seq !== this.potRequestSeq;
      this.potState = { kind: 'loading' };
      const year = v.pipelineYear;
      if (stage === 'Draft') { this.potState = { kind: 'draft' }; return; }
      if (!year) { this.potState = { kind: 'noClient' }; return; }

      let clientId = null;
      for (const lp of (v.linkedProjects || [])) {
        const proj = (config.projects || []).find(p => p.id === lp.projectId);
        if (proj?.clientId) { clientId = proj.clientId; break; }
      }
      if (!clientId) clientId = v.clientId || null;
      if (!clientId) { this.potState = { kind: 'noClient' }; return; }

      const group = this.clientGroups.find(g => (g.clients || []).some(c => c.id === clientId));
      const params = group ? { year, clientGroupId: group.id } : { year, clientId };
      const targetName = group ? group.name : getClientName(clientId);

      try {
        const summary = await Api.pots.summary(params);
        // A newer openDetailPanel() may have replaced the selection while the request was in flight.
        if (isStale()) return;
        if (!summary.pot) { this.potState = { kind: 'noTarget', targetName, year }; return; }
        this.potState = { kind: 'ok', targetName, year, view: pbPotView(summary) };
      } catch (e) {
        if (isStale()) return;
        this.potState = { kind: 'error' };
      }
    },
    deleteSelectedVersion() {
      cgConfirmDeleteVersion(this.selectedCgId, this.selectedVerId, this.selectedVersion.versionLabel, () => {
        this.closeDetailPanel();
        this.refreshTick++;
      });
    },
    confirmRefreshRate() {
      const cgId = this.selectedCgId, verId = this.selectedVerId, cur = this.selectedVersion.currency;
      const snapStr = Number(this.selectedVersion.currencyRate || 1).toLocaleString('en', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
      const liveStr = Number(this.liveRate).toLocaleString('en', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
      showConfirm(
        `Update the exchange rate snapshot?\n\nCurrent snapshot: 1 € = ${snapStr} ${cur}\nLatest rate: 1 € = ${liveStr} ${cur}\n\nBudget amounts and role rates remain in ${cur}. Only the EUR equivalent changes. In the editor, a change of ratecard or a rate reset uses the new rate.`,
        async () => {
          try {
            await Api.costGrids.versions.refreshRate(cgId, verId);
            await cgSyncFromApi();
            await loadPipelineBudgetsFromApi();
            this.refreshTick++;
            await this.openDetailPanel(cgId, verId);
          } catch (e) {
            showConfirm('Failed to refresh rate: ' + e.message, null, null, '⚠️ Error');
          }
        },
        null,
        'Update exchange rate'
      );
    },
    statusBadgeLarge,
    getProjectPipeline,
    pbGoToPortfolio(projectId) {
      window.location.href = '/portfolio.html?projectId=' + encodeURIComponent(projectId);
    },
    phaseTotal(ph) {
      const t = cgComputePhaseTotals(ph, this.selectedVersion.roles);
      return t.fee + t.ptc;
    },
    taskTotals(task) {
      return cgComputeTaskTotals(task, this.selectedVersion.roles);
    },
    taskDateRange(task) {
      return [pbFmtMonth(task.taskStartDate), pbFmtMonth(task.taskEndDate)].filter(Boolean).join(' – ') || '—';
    },
    async createNewProposal() {
      this.proposalBusy = true;
      // true: the page is navigating to the editor, so New/Clone stay disabled until the unload (the fallback timer
      // covers a navigation that never happens). null: the call was ignored because one is already running, so the
      // state is left to that one. Only false, or a throw, releases the buttons here.
      let ok = false;
      try {
        // Only a year the server knows and keeps open: otherwise the Draft is created without one.
        ok = await cgCreateNewGrid(this.pipelineYears.some(py => py.year === this.selectedYear && py.active !== false) ? this.selectedYear : null);
        if (ok === true) {
          this.collapsedStages = this.collapsedStages.filter(st => st !== 'Draft');
          setTimeout(() => { this.proposalBusy = false; this.refreshTick++; }, PB_PROPOSAL_FALLBACK_MS);
        }
      } finally {
        if (ok === false) this.proposalBusy = false;
      }
    },
    async cloneProposal(cgId, verId) {
      this.proposalBusy = true;
      // true: the page is navigating to the editor, so New/Clone stay disabled until the unload (the fallback timer
      // covers a navigation that never happens). null: the call was ignored because one is already running, so the
      // state is left to that one. Only false, or a throw, releases the buttons here.
      let ok = false;
      try {
        ok = await cgCloneGrid(cgId, verId, this.pipelineYears.some(py => py.year === this.selectedYear && py.active !== false) ? this.selectedYear : null);
        if (ok === true) {
          this.collapsedStages = this.collapsedStages.filter(st => st !== 'Draft');
          setTimeout(() => { this.proposalBusy = false; this.refreshTick++; }, PB_PROPOSAL_FALLBACK_MS);
        }
      } finally {
        if (ok === false) this.proposalBusy = false;
      }
    },
  },
  async created() {
    // A page restored from the back/forward cache keeps proposalBusy from the run that navigated away.
    window.addEventListener('pageshow', e => { if (e.persisted) this.proposalBusy = false; });

    const user = await initNav('pipeline', { breadcrumbs: [
      { label: 'Home', href: '/pipeline.html' },
      { label: 'Pipeline' },
    ]});
    if (!user) return;

    await Promise.all([loadClientsFromApi(), loadProgramsFromApi(), loadRolesFromApi()]);

    let pipelineYears = [];
    try { pipelineYears = await Api.pipelineYears.list(); } catch (e) {}
    this.pipelineYears = pipelineYears;

    // ?year= first, then the year remembered from the last visit, then the current year (js/lib/pipeline-year.js).
    const urlParams = new URLSearchParams(window.location.search);
    const urlYear = urlParams.get('year') ? parseInt(urlParams.get('year')) : null;
    const reqYear = resolvePipelineYear({
      urlYear,
      storedYear: readStoredPipelineYear(),
      availableYears: pipelineYears.map(py => py.year),
      currentYear: new Date().getFullYear(),
    });
    if (reqYear !== urlYear) window.history.replaceState({}, '', '?year=' + reqYear);
    this.selectedYear = reqYear;
    const selPy = pipelineYears.find(py => py.year === this.selectedYear);
    this.newProposalVisible = selPy?.active !== false;

    document.addEventListener('click', () => { this.yearDropdownOpen = false; });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      // Capture phase: runs before Bootstrap removes `.show`, so an open modal/offcanvas still counts. Then Bootstrap closes only that.
      if (document.querySelector('.modal.show, .offcanvas.show, .dropdown-menu.show')) return;
      // Esc closes one layer: the search/year menu first, else the panel.
      if (this.yearDropdownOpen || this.searchOpen) { this.yearDropdownOpen = false; this.searchOpen = false; return; }
      if (this.selectedCgId) this.closeDetailPanel();
    }, true);
    document.addEventListener('mousedown', e => {
      if (this.searchOpen && !(e.target.closest && e.target.closest('.pb-search'))) this.searchOpen = false;
    });
    document.addEventListener('hidden.bs.modal', e => {
      if (e.target && e.target.id === 'shareModal') this.shareListRefreshTick++;
    });

    await loadCurrenciesFromApi();
    this.currencies = window.__currencies || [];
    Api.clientGroups.list().then(gs => { this.clientGroups = gs; }).catch(() => {});
    await cgSyncFromApi(this.selectedYear);
    await Promise.all([loadConfigFromApi(), loadPipelineBudgetsFromApi()]);
    this.refreshTick++; // initial load completed — see Global Constraint 4
    // Columns without cards start collapsed (once). Later changes are user actions only.
    this.collapsedStages = this.stagesData.filter(c => !c.cards.length).map(c => c.stage);
  },
})
  .component('share-list', window.ShareListComponent)
  .mount('#pipelineBoardSection');

}); // end DOMContentLoaded
