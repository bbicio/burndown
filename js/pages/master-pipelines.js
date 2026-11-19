
window.__cfgApp = Vue.createApp({
  data() {
    return {
      ready:        false,
      accessDenied: false,
      globalError:  null,

      clients:  [],

      groups:   [],

      // Pipelines & POT state
      level:           'list', // 'list' | 'pots' | 'phasing' — derived from the URL (parseMdpUrl)
      year:            null,   // pipeline year of the open level, null on the list
      potId:           null,   // POT shown in the drawer (pots level)
      phasingMode:     'proposal',
      potDetails:      {},     // { potId: { loading, error, data } } cache of the drawer
      potHistory:      {},     // { potId: history }, dropped with the POT's details
      loadOk:          true,   // false when loadAll failed: a deep link is then not reported as unknown
      potCounts:       {},     // { year: number of POTs }, from GET /pots without a year
      loadedPotsYear:  null,
      potsLoadError:   '',
      phasing:         { proposal: null, project: null }, // { loading, error, data } per mode, loaded once while on the year
      phasingYearLoaded: null,
      phFilter:        { stages: [], clientId: '', potId: '' },
      phAmounts:       'eur',
      activeStages:    ['SIP', 'Expected', 'Anticipated', 'Committed'],
      pyf: { show: false, year: new Date().getFullYear() + 1, error: null, loading: false },
      pots:            [],
      potsYear:        new Date().getFullYear(),
      pipelineSummary: [],   // 5 stage cards: [{pipeline, count, total}]
      scrimOverPicker: false,
      potf: { show: false, id: null, targetType: 'client', targetId: '', year: new Date().getFullYear(), amountText: '', stored: null, targetLabel: '', error: null, loading: false },
      pipelineYears:   [],   // admin-managed pipeline years (all, active + inactive)
      yearTotals:      {},   // { year: { pot_total, achieved_total } }

      activeCurrencies: [],
      formatMoney: window.formatMoney,

    };
  },

  computed: {
    drawerPot() { return window.resolvePot(this.pots, this.potId); },
    // Which view the side drawer shows: a form wins over the POT details it was opened from.
    drawerView() {
      if (this.pyf.show) return 'year';
      if (this.potf.show) return this.potf.id ? 'editPot' : 'newPot';
      return this.drawerPot ? 'details' : null;
    },
    drawerLabel() {
      return { year: 'New pipeline year', newPot: 'New POT', editPot: 'Edit target' }[this.drawerView]
        || (this.drawerPot ? 'POT details: ' + this.potName(this.drawerPot) : '');
    },
    potfName() {
      const p = window.resolvePot(this.pots, this.potf.id);
      return p ? this.potName(p) : this.potf.targetLabel;
    },
    drawerState() { return this.drawerPot ? this.potDetails[this.drawerPot.id] || null : null; },
    drawerPct() {
      const d = this.drawerState && this.drawerState.data;
      return d ? window.achievement((+d.committed_total || 0) + (+d.anticipated_total || 0), d.pot.amount) : null;
    },
    drawerGap() {
      const d = this.drawerState && this.drawerState.data;
      return d ? window.gapToTarget(d.pot.amount, (+d.committed_total || 0) + (+d.anticipated_total || 0)) : { gap: 0, over: 0 };
    },
    drawerProposals() {
      const d = this.drawerState && this.drawerState.data;
      if (!d) return [];
      const rank = { Committed: 0, Anticipated: 1, Expected: 2, SIP: 3 };
      const r = p => (p.pipeline in rank ? rank[p.pipeline] : 4);
      return [...d.proposals].sort((a, b) => r(a) - r(b) || String(b.created_at).localeCompare(String(a.created_at)));
    },
    drawerHistory() {
      const d = this.drawerState && this.drawerState.data;
      return d ? [...d.history].sort((x, y) => String(y.changed_at).localeCompare(String(x.changed_at))) : [];
    },
    potTotal() { return this.pots.reduce((s, p) => s + Number(p.amount || 0), 0); },
    caTotal() { return this.stageTotal('Committed') + this.stageTotal('Anticipated'); },
    gapInfo() { return window.gapToTarget(this.potTotal, this.caTotal); },
    scaleMax() {
      const all = this.stageTotal('Committed') + this.stageTotal('Anticipated') + this.stageTotal('Expected') + this.stageTotal('SIP');
      return Math.max(this.potTotal, all) || 1;
    },
    stageTiles() {
      return ['SIP', 'Expected', 'Anticipated', 'Committed', 'Canceled'].map(pipeline => {
        const row = this.pipelineSummary.find(r => r.pipeline === pipeline);
        return { pipeline, count: row ? +row.count || 0 : 0, total: row ? +row.total || 0 : 0 };
      });
    },
    outsideCommitted() { return window.outsidePotCommitted(this.pipelineSummary, this.pots); },
    potTargetOptions() {
      return window.availableTargets({ type: this.potf.targetType, pots: this.pots, clients: this.clients, groups: this.groups });
    },
    moneyExample() { return window.moneyFormatExample('EUR', window.__currencies); },
    sortedYears() {
      return [...this.pipelineYears].sort((a, b) => b.year - a.year);
    },
    activePipeline() {
      return this.level === 'list' ? null : (this.pipelineYears.find(py => py.year === this.year) || null);
    },
    pyfInvalid() {
      const y = String(this.pyf.year ?? '').trim();
      if (!y) return false;
      const n = Number(y);
      return !/^[0-9]{4}$/.test(y) || n < 2000 || n > 2100 || this.pipelineYears.some(py => py.year === n);
    },
    sortedClients() {
      return [...this.clients].sort((a, b) => a.name.localeCompare(b.name));
    },
    sortedGroups() {
      return [...this.groups].sort((a, b) => a.name.localeCompare(b.name));
    },
    phState() { return this.phasing[this.phasingMode]; },
    phData() { return this.phState ? this.phState.data : null; },
    phMonths() {
      if (!this.phData) return [];
      const d = new Date();
      const now = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      return this.phData.months.map(key => {
        const [y, m] = key.split('-');
        return {
          key, current: key === now, past: key < now,
          label: new Date(+y, +m - 1).toLocaleString('en', { month: 'short', year: '2-digit' }),
        };
      });
    },
    phCounts() { return window.stageCounts(this.phData ? this.phData.projects : []); },
    phPotClients() {
      const pot = this.phFilter.potId ? window.resolvePot(this.pots, this.phFilter.potId) : null;
      return pot ? window.potClientIds(pot, this.groups) : null;
    },
    phRows() {
      if (!this.phData) return [];
      return window.filterPhasingRows(this.phData.projects, {
        stages: this.phFilter.stages, clientId: this.phFilter.clientId, potClients: this.phPotClients,
      });
    },
    phTotals() { return window.phasingTotals(this.phRows, this.phData ? this.phData.months : [], this.phAmounts); },
    phFilterActive() { return !!(this.phFilter.stages.length || this.phFilter.clientId || this.phFilter.potId); },
    phClientOptions() {
      return [{ value: '', label: 'All' }, ...this.sortedClients.map(c => ({ value: c.id, label: c.name }))];
    },
    phPotOptions() {
      const named = this.pots.filter(p => !p.special_label)
        .map(p => ({ value: p.id, label: this.potName(p) }))
        .sort((x, y) => x.label.localeCompare(y.label));
      return [{ value: '', label: 'All' }, ...named];
    },
    phForeignCurrencies() {
      return [...new Set(this.phRows.map(r => window.rowCurrency(r)).filter(c => c !== 'EUR'))].sort();
    },
  },

  async created() {
    const user = await initNav('config', { breadcrumbs: [
      { label: 'Home', href: '/pipeline.html' },
      { label: 'Master Data', href: '/master-clients.html' },
      { label: 'Pipelines & POTs' },
    ]});
    if (!user) return;
    if (!['admin', 'sysadmin'].includes(user.role)) { this.accessDenied = true; return; }
    try { window.__currencies = await Api.currencies.list(); } catch {}
    this.activeCurrencies = window.__currencies || [];
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !this.drawerView) return;
      if (document.querySelector('.modal.show')) return; // Esc belongs to the open modal
      if (document.querySelector('.cg-pop')) return; // ...and to the open picker
      this.dismissDrawer(false);
    });
    window.addEventListener('popstate', () => { if (this.ready) { this.globalError = null; this.applyState(window.parseMdpUrl(location.search)); } });
    await this.loadAll();
    await this.applyState(window.parseMdpUrl(location.search));
    this.ready = true;
  },

  watch: {
    drawerPot(pot) { if (pot) this.loadPotDetails(pot); },
    // The banner lives at the top of the page, above the tabs: a failed action on a long list
    // (e.g. a blocked role delete) would otherwise set the message where nobody is looking.
    globalError(msg) { if (msg) window.scrollTo({ top: 0, behavior: 'smooth' }); },
  },

  methods: {
    // Money helper for the template (bridged on window by js/lib/money.js)
    currencyInfo: (...a) => window.currencyInfo(...a),
    achievement: (...a) => window.achievement(...a),

    stageTotal(stage) {
      const row = this.pipelineSummary.find(r => r.pipeline === stage);
      return row ? +row.total || 0 : 0;
    },
    // Position / width on the summary bar, scaled on max(target, C + A + E + SIP).
    scalePct(amount) { return Math.min(100, (Number(amount) || 0) / this.scaleMax * 100); },
    potName(pot) { return pot.special_label || pot.client_group_name || pot.client_name || '—'; },
    potKind(pot) { return pot.special_label ? 'General' : pot.client_group_id ? 'Group' : 'Client'; },
    groupClientNames(pot) {
      const g = this.groups.find(x => x.id === pot.client_group_id);
      return g ? (g.clients || []).map(c => c.name).join(', ') : '';
    },
    setPotTargetType(type) {
      if (this.potf.targetType !== type) { this.potf.targetType = type; this.potf.targetId = ''; }
    },
    invalidatePotDetails(id) {
      delete this.potDetails[id]; delete this.potHistory[id];
      const open = this.drawerPot;
      if (open && open.id === id) this.loadPotDetails(open); // an open drawer refreshes in place
    },
    async refreshYearData() {
      try {
        const [totals, all] = await Promise.all([Api.pots.yearTotals(), Api.pots.list()]);
        this.yearTotals = totals;
        this.potCounts = window.potCountByYear(all);
      } catch { /* the list refreshes on the next load */ }
    },

    // Width of a bar segment: share of the target, clipped so that segments never overflow the bar.
    barPct(amount, target, before = 0) {
      const t = Number(target) || 0;
      if (t <= 0) return 0;
      const start = Math.min(100, (Number(before) || 0) / t * 100);
      return Math.max(0, Math.min(100 - start, (Number(amount) || 0) / t * 100));
    },

    // One URL per level: push (or replace) the history entry, then apply the state it names.
    go(state, { replace = false } = {}) {
      const url = window.buildMdpUrl(state);
      this.globalError = null; // a message belongs to the level it was raised on
      const same = location.pathname + url === location.pathname + location.search;
      history[replace || same ? 'replaceState' : 'pushState'](null, '', location.pathname + url);
      return this.applyState(window.parseMdpUrl(url));
    },

    async applyState({ year, pot, phasing }) {
      this.potf.show = false;
      this.pyf.show = false;
      if (year === null) {
        this.level = 'list'; this.year = null; this.potId = null;
        this.loadedPotsYear = null; this.resetPhasing();
      } else if (!this.loadOk) {
        return; // the years did not load: keep the URL, the banner says why
      } else if (!this.pipelineYears.some(py => py.year === year)) {
        this.globalError = `Pipeline ${year} not found.`;
        history.replaceState(null, '', location.pathname);
        return this.applyState({ year: null, pot: null, phasing: null });
      } else if (phasing) {
        this.level = 'phasing'; this.year = year; this.potId = null; this.phasingMode = phasing;
        if (this.phasingYearLoaded !== year) { this.resetPhasing(); this.phasingYearLoaded = year; }
        if (this.loadedPotsYear !== year) this.loadYearData(year);
        this.ensurePhasing(phasing);
      } else {
        this.level = 'pots'; this.year = year; this.potId = pot; this.potsYear = year; this.resetPhasing();
        if (this.loadedPotsYear !== year) this.loadYearData(year);
      }
      this.syncChrome();
    },

    // Breadcrumb and wide mode follow the level.
    syncChrome() {
      const layout = document.querySelector('.md-layout');
      if (layout) layout.classList.toggle('md-layout--wide', this.level === 'phasing');
      const card = document.querySelector('#app > .md-card');
      if (card) card.classList.toggle('mdp-bare', this.level !== 'list');
      const crumbs = [
        { label: 'Home', href: '/pipeline.html' },
        { label: 'Master Data', href: '/master-clients.html' },
      ];
      if (this.level === 'list') crumbs.push({ label: 'Pipelines & POTs' });
      else {
        crumbs.push({ label: 'Pipelines & POTs', href: '/master-pipelines.html' });
        if (this.level === 'pots') crumbs.push({ label: 'Pipeline ' + this.year });
        else {
          crumbs.push({ label: 'Pipeline ' + this.year, href: '/master-pipelines.html' + window.buildMdpUrl({ year: this.year }) });
          crumbs.push({ label: this.phasingMode === 'proposal' ? 'Proposal phasing' : 'Project phasing' });
        }
      }
      if (typeof window.updateBreadcrumbs === 'function') window.updateBreadcrumbs(crumbs);
    },

    async loadAll() {
      this.globalError = null; this.loadOk = true;
      try {
        const [clients, groups, pipelineYears, yearTotals, allPots] = await Promise.all([
          Api.clients.list(),
          Api.clientGroups.list(),
          Api.pipelineYears.list(),
          Api.pots.yearTotals(),
          Api.pots.list(),
        ]);
        this.potCounts     = window.potCountByYear(allPots);
        this.clients  = clients;
        this.groups   = groups.map(g => ({ ...g, _assignPick: '', _assignLoading: false }));
        this.pipelineYears = pipelineYears.map(py => ({ ...py, _toggling: false, _loading: false }));
        this.yearTotals    = yearTotals;
      } catch (e) {
        this.loadOk = false;
        this.globalError = e.message || 'Failed to load data.';
      }
    },

    async loadPots() {
      const year = this.year || this.potsYear;
      try {
        const pots = await Api.pots.list(year);
        if (this.loadedPotsYear != null && this.loadedPotsYear !== year) return true; // another year was opened meanwhile
        this.pots = pots;
        this.potHistory = {};
        this.potsLoadError = '';
        return true;
      } catch (e) {
        this.potsLoadError = e.message || '';
        if (this.loadedPotsYear === year) this.loadedPotsYear = null; // the next visit of this year loads again
        return false;
      }
    },

    openPyForm() {
      const nextYear = this.pipelineYears.length
        ? Math.max(...this.pipelineYears.map(py => py.year)) + 1
        : new Date().getFullYear() + 1;
      this.pyf = { show: true, year: String(nextYear), error: null, loading: false };
      this.$nextTick(() => { const el = this.$refs.pyfInput; if (el) { el.focus(); el.select(); } });
    },

    async createPipelineYear() {
      const year = parseInt(String(this.pyf.year).trim(), 10);
      this.pyf.error = null;
      if (!year || year < 2000 || year > 2100) { this.pyf.error = 'Enter a valid year (2000–2100).'; return; }
      if (this.pipelineYears.find(py => py.year === year)) { this.pyf.error = `Pipeline ${year} already exists.`; return; }
      this.pyf.loading = true;
      try {
        const res = await window.apiSave('POST', '/pipeline-years', { year, active: false });
        if (res.kind !== 'ok') {
          this.pyf.error = res.message || 'Failed to create.';
          // the write may have happened: show what the server has
          if (res.kind === 'unknown') await this.loadAll();
          return;
        }
        this.pipelineYears.push({ offers: 0, ...res.data, _toggling: false, _loading: false });
        this.pyf.show = false;
      } finally {
        this.pyf.loading = false;
      }
    },

    async togglePipelineYear(py, ev) {
      if (py._toggling) { if (ev) ev.target.checked = py.active; return; }
      py._toggling = true;
      try {
        const res = await window.apiSave('PATCH', '/pipeline-years/' + py.id, { active: !py.active });
        if (res.kind === 'ok') {
          py.active = res.data.active;
        } else {
          // the write may have happened: show what the server has (loadAll clears the banner, so it runs first)
          if (res.kind === 'unknown') await this.loadAll();
          this.globalError = res.message || 'Failed to update pipeline year.';
        }
      } finally {
        py._toggling = false;
        // loadAll (after an unknown outcome) replaced the list: read the year the server has now
        const current = this.pipelineYears.find(p => p.id === py.id) || py;
        if (ev) ev.target.checked = current.active;
      }
    },

    // Why a year cannot be deleted, '' when it can: the server only refuses a year with cost grid versions, so
    // a year that still has POTs would leave them orphaned.
    deleteBlock(py) {
      if (py.offers > 0) return 'Not available: ' + py.offers + ' ' + (py.offers === 1 ? 'proposal uses' : 'proposals use') + ' this pipeline. Hide it instead.';
      if (py.proposals > (py.offers || 0)) return 'Not available: ' + py.proposals + ' proposals (Drafts and Canceled included) use this pipeline. Hide it instead.';
      const pots = this.potCounts[py.year] || 0;
      if (pots > 0) return 'Not available: this pipeline has ' + pots + ' ' + (pots === 1 ? 'POT' : 'POTs') + '. Hide it instead.';
      return '';
    },

    async deletePipelineYear(py) {
      if (this.deleteBlock(py)) return;
      showConfirm(
        `Delete Pipeline ${py.year}? Cost grid versions linked to this year stay; the pipeline entry is removed.`,
        async () => {
          py._loading = true;
          const res = await window.apiSave('DELETE', '/pipeline-years/' + py.id);
          if (res.kind === 'ok') {
            this.pipelineYears = this.pipelineYears.filter(p => p.id !== py.id);
            return;
          }
          // the write may have happened: show what the server has (loadAll clears the banner, so it runs first)
          try {
            if (res.kind === 'unknown') await this.loadAll();
          } finally {
            py._loading = false;
          }
          this.globalError = res.message || 'Failed to delete pipeline year.';
        },
        null,
        'Delete pipeline',
      );
    },

    openPotForm(pot) {
      if (pot && this.drawerPot && this.drawerPot.id !== pot.id) this.closeDrawer(); // never a form over another POT's details
      if (pot) {
        this.potf = {
          show: true, id: pot.id,
          targetType: pot.client_group_id ? 'group' : 'client',
          targetId: pot.client_group_id || pot.client_id || '',
          targetLabel: pot.client_group_name || pot.client_name || '',
          year: pot.year,
          amountText: (pot.amount == null || pot.amount === '') ? '' : window.formatMoneyInput(pot.amount, 'EUR', window.__currencies, { keepZero: true }),
          stored: pot.amount == null || pot.amount === '' ? null : Number(pot.amount),
          note: '',
          error: null, loading: false,
        };
      } else {
        this.potf = {
          show: true, id: null,
          targetType: 'client', targetId: '',
          targetLabel: '', year: this.year || this.potsYear,
          amountText: '', stored: null, note: '', error: null, loading: false,
        };
      }
      this.$nextTick(() => { const el = this.$refs.potfAmount; if (el) el.focus(); });
    },

    // Focus shows the unformatted amount, blur the formatted one; blank or invalid text stays as typed.
    onPotAmountFocus() {
      const v = window.readMoneyInput(this.potf.amountText, 'EUR', window.__currencies, { stored: this.potf.stored });
      if (typeof v !== 'number' || Number.isNaN(v)) return;
      this.potf.amountText = window.formatMoneyInput(v, 'EUR', window.__currencies, { keepZero: true });
    },
    onPotAmountBlur() {
      const v = window.readMoneyInput(this.potf.amountText, 'EUR', window.__currencies, { stored: this.potf.stored });
      if (typeof v !== 'number' || Number.isNaN(v)) return;
      this.potf.amountText = window.formatMoney(v, 'EUR', window.__currencies, { symbol: false }); // the input carries its own symbol span
    },

    async savePot() {
      this.potf.error = null;
      const amount = window.readMoneyInput(this.potf.amountText, 'EUR', window.__currencies, { stored: this.potf.stored });
      if (amount == null || Number.isNaN(amount)) { this.potf.error = 'Enter a valid amount in EUR, e.g. ' + window.moneyFormatExample('EUR', window.__currencies) + '.'; return; }

      if (this.potf.id && !this.potf.note?.trim()) {
        this.potf.error = 'Reason for change is required when updating a POT.';
        return;
      }
      this.potf.loading = true;
      try {
        if (this.potf.id) {
          const res = await window.apiSave('PATCH', '/pots/' + this.potf.id, { amount, note: this.potf.note.trim() });
          if (res.kind !== 'ok') {
            this.potf.error = res.message || 'Save failed.';
            if (res.kind === 'unknown') await this.loadPots(); // the write may have happened
            return;
          }
          const p =this.pots.find(p => p.id === this.potf.id);
          if (p) { p.amount = res.data.amount; p.achieved_total = p.achieved_total || 0; }
          this.invalidatePotDetails(this.potf.id);
        } else {
          if (!this.potf.targetId) { this.potf.error = 'Select a target.'; this.potf.loading = false; return; }
          const specialLabels = { '__unassigned__': 'Unassigned / To be Identified', '__newbiz__': 'New Biz' };
          const body = { year: this.potf.year, amount };
          if (this.potf.targetType === 'group') {
            body.clientGroupId = this.potf.targetId;
          } else if (specialLabels[this.potf.targetId]) {
            body.specialLabel = specialLabels[this.potf.targetId];
          } else {
            body.clientId = this.potf.targetId;
          }
          // The reload fetches the list again, to get the denormalized names
          const res = await window.saveAndReload('POST', '/pots', body, () => this.loadPots());
          if (res.kind === 'ok') {
            this.potf.show = false;
            if (!res.reloaded) this.globalError = window.SAVED_NOT_RELOADED;
          } else if (res.kind === 'unknown') {
            // the reload shows whether the POT exists
            this.potf.show = false;
            this.globalError = res.message;
          } else {
            this.potf.error = res.message || 'Save failed.';
            return;
          }
        }
        this.refreshYearData();
        this.potf.show = false;
      } finally {
        this.potf.loading = false;
      }
    },

    async deletePot(pot) {
      showConfirm(
        `Delete POT target for "${pot.special_label || pot.client_group_name || pot.client_name}" (${pot.year})? This cannot be undone.`,
        async () => {
          pot._loading = true;
          const res = await window.apiSave('DELETE', '/pots/' + pot.id);
          if (res.kind === 'ok') {
            this.pots = this.pots.filter(p => p.id !== pot.id);
            if (this.potId === pot.id) this.go({ year: this.year }, { replace: true });
            this.refreshYearData();
            this.invalidatePotDetails(pot.id);
            return;
          }
          // the write may have happened: show what the server has
          try {
            if (res.kind === 'unknown') await this.loadPots();
          } finally {
            pot._loading = false;
          }
          this.globalError = res.message || 'Delete failed.';
        },
        null,
        'Delete POT target',
      );
    },

    loadYearData(year) {
      this.loadedPotsYear = year; this.potsYear = year;
      this.pots = []; this.pipelineSummary = []; this.potDetails = {}; // the drawer reads fresh totals with the table
      this.loadPots().then(ok => { if (!ok) this.globalError = this.potsLoadError || 'Failed to load POT targets.'; });
      this.loadPipelineSummary();
    },

    resetPhasing() {
      this.phasing = { proposal: null, project: null };
      this.phasingYearLoaded = null;
      this.phFilter = { stages: [], clientId: '', potId: '' };
    },

    async ensurePhasing(mode) {
      if (this.phasing[mode] && !this.phasing[mode].error) return; // a failed load is retried
      this.phasing[mode] = { loading: true, error: null, data: null };
      const entry = this.phasing[mode]; // the reactive proxy: writes through it re-render
      try {
        entry.data = mode === 'proposal' ? await Api.reporting.phasing(this.year) : await Api.reporting.projectPhasing(this.year);
      } catch (e) {
        entry.error = e.message || (mode === 'proposal' ? 'Failed to load phasing data.' : 'Failed to load project phasing data.');
      } finally {
        entry.loading = false;
      }
    },

    toggleStage(st) {
      const i = this.phFilter.stages.indexOf(st);
      if (i >= 0) this.phFilter.stages.splice(i, 1); else this.phFilter.stages.push(st);
    },
    clearPhFilter() { this.phFilter = { stages: [], clientId: '', potId: '' }; },

    // Phasing cells: rounded without the symbol, the full amount in the tooltip.
    money(v, code, rounded = false) {
      return rounded
        ? window.formatMoney(v, code, window.__currencies, { rounded: true, symbol: false })
        : window.formatMoney(v, code, window.__currencies);
    },
    rowCur(r) { return window.rowCurrency(r); },
    cellCode(r) { return this.phAmounts === 'eur' ? 'EUR' : window.rowCurrency(r); },
    cellValue(r, month) {
      const a = window.rowMonthAmount(r, month);
      return this.phAmounts === 'eur' ? a / (Number(r.currencyRate) || 1) : a;
    },
    rowTotal(r) { return this.phMonths.reduce((s, m) => s + this.cellValue(r, m.key), 0); },
    rowHasAmounts(r) { return this.phMonths.some(m => window.rowMonthAmount(r, m.key) > 0); },
    rowHref(r) {
      return this.phasingMode === 'proposal'
        ? '/costgrid.html?cgId=' + encodeURIComponent(r.cgId) + '&verId=' + encodeURIComponent(r.versionId)
        : '/portfolio.html?projectId=' + encodeURIComponent(r.projectId);
    },
    rowSub(r) {
      const c = this.clients.find(x => x.id === r.clientId);
      return this.phasingMode === 'proposal' ? [c && c.name, r.versionLabel].filter(Boolean).join(' · ') : (c ? c.name : '');
    },

    async loadPipelineSummary() {
      if (!this.activePipeline) return;
      const year = this.activePipeline.year;
      try {
        const summary = await Api.pots.pipelineSummary(year);
        if (this.loadedPotsYear != null && this.loadedPotsYear !== year) return;
        this.pipelineSummary = summary;
      } catch (e) {
        if (this.loadedPotsYear != null && this.loadedPotsYear !== year) return; // another year was opened meanwhile
        this.loadedPotsYear = null;
        this.pipelineSummary = [];
      }
    },

    async loadPotDetails(pot) {
      if (this.potDetails[pot.id] && !this.potDetails[pot.id].error) return; // a failed load is retried
      this.potDetails[pot.id] = { loading: true, error: null, data: null };
      const entry = this.potDetails[pot.id]; // the reactive proxy: writes through it re-render
      try {
        entry.data = await Api.pots.details(pot.id, this.year);
      } catch (e) {
        entry.error = e.message || 'Request failed.';
      } finally {
        entry.loading = false;
      }
    },

    closeDrawer() { return this.go({ year: this.year }); },

    // The form replaces the details in the same drawer; the URL keeps ?year=Y&pot=<id>.
    async editFromDrawer(pot) {
      this.openPotForm(pot);
    },

    // The mousedown that closed an open picker is not a request to close the drawer.
    onScrimDown() { this.scrimOverPicker = !!document.querySelector('.cg-pop'); },
    onScrimClick() {
      if (this.scrimOverPicker) { this.scrimOverPicker = false; return; }
      this.dismissDrawer(false);
    },

    // Scrim, Cancel and Esc (closeAll false), the close button (closeAll true).
    dismissDrawer(closeAll) {
      const r = window.mdpDrawerDismiss({
        pyfShow: this.pyf.show, potfShow: this.potf.show, hasDetails: !!this.drawerPot,
        loading: this.pyf.loading || this.potf.loading, closeAll,
      });
      if (r === 'none') return;
      this.pyf.show = false;
      this.potf.show = false;
      if (r === 'close-drawer' && this.drawerPot) this.closeDrawer();
    },

    fmtDate(iso) {
      return (iso && window.formatDayText(String(iso).slice(0, 10))) || '—';
    },
  },
}).component('ph-icon', window.PhIcon).component('cg-select', window.CgSelect).mount('#app');
