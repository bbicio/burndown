
  // DOM id for a Breakdown block key (task names carry spaces and punctuation): readable prefix plus a hash.
  function prBlockId(key) {
    let h = 5381;
    for (let i = 0; i < key.length; i++) h = ((h * 33) ^ key.charCodeAt(i)) >>> 0;
    return 'blk-' + key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24) + '-' + h.toString(36);
  }

  // The shared Entries block of the Breakdown (spec 2026-11-03-breakdown-v2): months, Role/Resource filter
  // and column sort over the entries of one expanded row. The logic is pure (js/lib/report-entries.js);
  // `state` is the parent's entriesState[blockKey], so it survives collapsing and changing view.
  const PrEntries = {
    template: '#pr-entries-tpl',
    props: {
      entries: { type: Array, default: () => [] },
      rateFor: { type: Function, required: true },
      filterKind: { type: String, default: 'role' },
      state: { type: Object, required: true },
      periodLabel: { type: String, default: '' },
      currency: { type: String, default: '' },
      currencies: { type: Array, default: () => [] },
      isPhone: { type: Boolean, default: false },
      blockKey: { type: String, required: true },
      menuOpen: { type: Boolean, default: false },
    },
    emits: ['export', 'toggle-menu', 'open-sheet'],
    computed: {
      block() { return entriesBlock(this.entries, { ...this.state, filterKind: this.filterKind }, this.rateFor); },
      options() { return filterOptions(this.entries, this.filterKind); },
      chipLabel() { return filterChipLabel(this.state.filter, this.filterKind); },
      // "Role: " and the value after it, so the value can be bold (boards 7.4e, 7.4h).
      chipPrefix() { return this.chipLabel.slice(0, this.chipLabel.indexOf(' ') + 1); },
      chipValue() { return this.chipLabel.slice(this.chipLabel.indexOf(' ') + 1); },
      filterTitle() { return this.filterKind === 'resource' ? 'Filter by resource' : 'Filter by role'; },
      filterNote() { return (this.filterKind === 'resource' ? 'Resources' : 'Roles') + ' with entries in ' + this.periodLabel; },
      sortLabel() { return { date: 'Date', who: this.filterKind === 'resource' ? 'Resource' : 'Role', hours: 'Hours', amount: 'Amount' }[this.state.sort.key]; },
      whoLabel() { return this.filterKind === 'resource' ? 'Resource' : 'Role (resource)'; },
    },
    watch: {
      menuOpen(v) {
        if (!v || this.isPhone) return;
        this.$nextTick(() => { const i = this.$refs.menu && this.$refs.menu.querySelector('input'); if (i) i.focus(); });
      },
    },
    methods: {
      fmtH(v) { return window.fmtH(v); },
      fmtDate(d) { return window.fmtDate(d); },
      money(v) { return window.formatMoney(v, this.currency, this.currencies); },
      monthLabelLong(ym) {
        const k = String(ym).replace('-', '');
        return new Date(parseInt(k.slice(0, 4)), parseInt(k.slice(4, 6)) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      },
      monthId(m) { return prBlockId(this.blockKey) + '-' + m.ym; },
      whoText(e) {
        if (this.filterKind === 'resource') return e.owner || '—';
        return e.owner ? e.role + ' (' + e.owner + ')' : e.role;
      },
      ariaSort(key) {
        const s = this.state.sort;
        return s.key === key ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
      },
      sortBy(key) { this.state.sort = nextSort(this.state.sort, key); },
      // Without a filter one month is open at a time; with one, each month closes on its own.
      toggleMonth(m) {
        const s = this.state;
        if (s.filter.length) {
          s.closedMonths = s.closedMonths.includes(m.ym) ? s.closedMonths.filter(x => x !== m.ym) : [...s.closedMonths, m.ym];
        } else {
          s.openMonth = m.open ? '' : m.ym;
        }
      },
      setFilter(values) {
        const s = this.state;
        const hadFilter = s.filter.length > 0;
        s.filter = values;
        if (hadFilter !== values.length > 0) { s.closedMonths = []; s.openMonth = null; }
      },
      clearFilter() { this.setFilter([]); },
      onAll(ev) { this.clearFilter(); ev.target.checked = true; },
      toggleOption(v) {
        const f = this.state.filter;
        this.setFilter(f.includes(v) ? f.filter(x => x !== v) : [...f, v]);
      },
      onFilterClick(ev) {
        if (this.isPhone) this.$emit('open-sheet', 'filter');
        else this.$emit('toggle-menu', ev.currentTarget);
      },
      // Up/Down move between the checkboxes; Space (native) toggles; Esc is the page's.
      onMenuKey(ev) {
        if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
        const boxes = [...ev.currentTarget.querySelectorAll('input')];
        const i = boxes.indexOf(document.activeElement);
        const next = ev.key === 'ArrowDown' ? Math.min(boxes.length - 1, i + 1) : Math.max(0, i - 1);
        if (boxes[next]) { ev.preventDefault(); boxes[next].focus(); }
      },
    },
  };

  Vue.createApp({
    data() {
      return {
        formatMoney: window.formatMoney,
        currencies: [],
        view: 'overview',
        portfolioSort: 'name',
        portfolioClientFilter: [],
        portfolioStageFilter: [],
        portfolioSearch: '',
        portfolioStatusFilter: [],
        portfolioLayout: (() => {
          try { return readLayoutPreference(localStorage.getItem('PDash_portfolioLayout')); }
          catch (e) { return 'card'; }
        })(),
        expandedProgramId: null,
        listExpandedPrograms: new Set(),
        gridColumns: 3,
        dashboardProjectId: null,
        dashboardReady: false,
        dashboardTags: [],
        reportToday: new Date(), // fixed when the view opens (showDashboard), read by the KPI, the Today marker and the month states
        burndownInterval: 'monthly',
        burndownTaskFilter: '',
        progressView: 'burndown', // 'burndown' | 'monthly' | 'ptc' — the Progress card's segmented control
        breakdownView: 'task', // 'task' | 'role' | 'area' — the Breakdown card's segmented control
        filterMonth: '',
        filterStart: '',
        filterEnd: '',
        switchMenuOpen: false,
        isPhone: false, // matchMedia('(max-width: 767.98px)'), see mounted()
        sheet: { kind: null, blockKey: null, filterKind: 'role', draftFilter: [], draftSort: { key: 'date', dir: 'desc' } }, // the open bottom sheet (openSheet) and its draft
        openMenu: null, // null | 'period' | 'filter:<blockKey>' — the Breakdown's popover menus (toggleMenu/closeMenu)
        entriesState: {}, // { [blockKey]: { expanded, openMonth, closedMonths, filter, sort } } — Breakdown row expansion and its Entries block (blockState)
        notice: '',
        directCreationEnabled: window.DIRECT_PROJECT_CREATION_ENABLED,
        directCreationMessage: window.PROJECT_RULE_MESSAGES.directCreation,
        refreshTick: 0, // bumped after mutating non-reactive globals (config.projects/timesheetData/portfolioSummaryProjects) that Vue can't see; forces computed re-evaluation
      };
    },
    computed: {
      projects() {
        this.refreshTick; // establishes reactive dependency: bumped by toggleSummary() and after Load Actuals upload
        return (config.projects || []).filter(p => p.id);
      },
      allClientIds() {
        return [...new Set(
          this.projects.filter(p => p.clientId && p.clientId !== '__unassigned__').map(p => p.clientId)
        )].sort((a, b) => getClientName(a).localeCompare(getClientName(b)));
      },
      // Fixed enum, not derived from live data — matches js/lib/status-rules.js's exact spellings
      // (project.status is a free-standing field, independent of any one pipeline stage's own
      // allowed-values list).
      statusFilterOptions() {
        return ['Not started yet', 'Started', 'Started At Risk', 'Put on hold', 'Completed'];
      },
      stageFilterOptions() {
        return ['SIP', 'Expected', 'Anticipated', 'Committed', 'Canceled'];
      },
      portfolioFiltersActive() {
        return !!this.portfolioSearch.trim() || this.portfolioClientFilter.length > 0 || this.portfolioStageFilter.length > 0 || this.portfolioStatusFilter.length > 0;
      },
      sortedFilteredProjects() {
        const sortFn = this.portfolioSort === 'client'
          ? (a, b) => getClientName(a.clientId).localeCompare(getClientName(b.clientId)) || (a.name||a.id).localeCompare(b.name||b.id)
          : (a, b) => (a.name||a.id).localeCompare(b.name||b.id);
        const term = this.portfolioSearch.trim().toLowerCase();
        return [...this.projects]
          .filter(p => !this.portfolioClientFilter.length || this.portfolioClientFilter.includes(p.clientId))
          .filter(p => !this.portfolioStageFilter.length || this.portfolioStageFilter.includes(getProjectPipeline(p.id) || p.pipeline))
          // p.status || 'Not started yet' matches statusBadgeLarge()'s own default (js/core.js) — a
          // project with no status stored still displays as "Not started yet" on its card, so it must
          // match that same filter option, not disappear from it.
          .filter(p => !this.portfolioStatusFilter.length || this.portfolioStatusFilter.includes(p.status || 'Not started yet'))
          .filter(p => !term
            || (p.name||'').toLowerCase().includes(term)
            || (p.code||'').toLowerCase().includes(term)
            || (p.clientId && p.clientId !== '__unassigned__' && getClientName(p.clientId).toLowerCase().includes(term)))
          .sort(sortFn);
      },
      visibleProgramGroups() {
        const programs = getPrograms();
        const grouped = {};
        this.sortedFilteredProjects.forEach(cfg => {
          if (cfg.programId && programs.find(p => p.id === cfg.programId)) {
            (grouped[cfg.programId] = grouped[cfg.programId] || []).push(cfg);
          }
        });
        return programs
          .filter(prog => grouped[prog.id]?.length)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(prog => {
            const children = [...grouped[prog.id]].sort((a, b) => (a.id||'').localeCompare(b.id||''));
            const pipelines = children.map(c => getProjectPipeline(c.id) || c.pipeline).filter(Boolean);
            const clientIds = children.map(c => c.clientId).filter(c => c && c !== '__unassigned__');
            const domClientId = clientIds.length ? clientIds[0] : '';
            return {
              ...prog,
              children,
              domPipeline: pipelines.length ? pipelines[0] : '',
              domClientName: domClientId ? getClientName(domClientId) : '',
            };
          });
      },
      ungroupedProjects() {
        const programs = getPrograms();
        return this.sortedFilteredProjects.filter(cfg =>
          !(cfg.programId && programs.find(p => p.id === cfg.programId))
        );
      },
      cardDataMap() {
        const map = {};
        this.projects.forEach(cfg => { map[cfg.id] = this.cardData(cfg); });
        return map;
      },
      programStatsMap() {
        const map = {};
        this.visibleProgramGroups.forEach(prog => {
          map[prog.id] = { summary: this.programSummary(prog.children), duration: this.programDuration(prog.children) };
        });
        return map;
      },
      // "N programs · N projects" (spec §6.5) — both follow the active filters;
      // the project count includes every program's children.
      portfolioCounts() {
        const progCount = this.visibleProgramGroups.length;
        const projCount = this.sortedFilteredProjects.length;
        return `${progCount} program${progCount === 1 ? '' : 's'} · ${projCount} project${projCount === 1 ? '' : 's'}`;
      },
      // Single ordered row list consumed by both the Card and List views, so their
      // order can never diverge (spec §6.2).
      portfolioRows() {
        const programRows = this.visibleProgramGroups.map(prog => ({
          kind: 'program',
          id: prog.id,
          name: prog.name,
          clientName: prog.domClientName,
          children: prog.children,
          stats: this.programStatsMap[prog.id]?.summary,
          duration: this.programStatsMap[prog.id]?.duration,
          pipeline: prog.domPipeline,
          atRisk: programAtRisk(prog.children),
        }));
        const projectRows = this.ungroupedProjects.map(cfg => ({
          kind: 'project',
          id: cfg.id,
          name: cfg.name || cfg.id,
          clientName: (cfg.clientId && cfg.clientId !== '__unassigned__') ? getClientName(cfg.clientId) : '',
          cfg,
          card: this.cardDataMap[cfg.id],
        }));
        return buildPortfolioRows([...programRows, ...projectRows], this.portfolioSort);
      },
      // Card: which program ids currently show a children panel. While a filter is active
      // every program's children stay visible (spec §10, mirrored from the List view's
      // auto-expand-all) — otherwise just the one manually expanded program, if it still
      // resolves to a present row (Review Focus 2).
      expandedProgramIds() {
        if (this.portfolioFiltersActive) {
          return new Set(this.portfolioRows.filter(r => r.kind === 'program').map(r => r.id));
        }
        const id = resolveExpandedProgramId(this.expandedProgramId, this.portfolioRows);
        return id ? new Set([id]) : new Set();
      },
      // Rows chunked into gridColumns-sized groups so the full-width children panel
      // can be inserted after a complete grid row rather than mid-row (spec §13).
      cardChunks() {
        const cols = Math.max(1, this.gridColumns);
        const rows = this.portfolioRows;
        const chunks = [];
        for (let i = 0; i < rows.length; i += cols) chunks.push(rows.slice(i, i + cols));
        return chunks;
      },
      pinnedSummary() {
        const cfgs = this.projects.filter(p => portfolioSummaryProjects.has(p.id));
        if (!cfgs.length) return null;
        const monthSet = new Set();
        cfgs.forEach(cfg => this.getMonthRangeFromCfg(cfg).forEach(ym => monthSet.add(ym)));
        const months = [...monthSet].sort();
        const phasing = {}, spent = {};
        months.forEach(ym => { phasing[ym] = 0; spent[ym] = 0; });
        cfgs.forEach(cfg => {
          months.forEach(ym => { phasing[ym] += cfg.phasing?.[ym] || 0; });
          timesheetData.filter(r => r.projectId === cfg.id).forEach(r => {
            if (!r.date) return;
            const ym = `${r.date.getFullYear()}${String(r.date.getMonth()+1).padStart(2,'0')}`;
            if (spent[ym] !== undefined) spent[ym] += r.hours * (findRate(r, cfg) ?? 0);
          });
        });
        const grandEst = months.reduce((s, ym) => s + phasing[ym], 0);
        const grandSpent = months.reduce((s, ym) => s + spent[ym], 0);
        return { cfgs, months, phasing, spent, grandEst, grandSpent, grandVar: grandEst - grandSpent };
      },
      dashCurrency() {
        return this.dashboardProject?.currency || 'EUR';
      },
      dashboardProject() {
        this.refreshTick; // see computed.projects: guards against a future dashboard-view mutation of config.projects going unnoticed
        return this.dashboardProjectId ? (config.projects || []).find(p => p.id === this.dashboardProjectId) : null;
      },
      dashboardData() {
        this.refreshTick; // see computed.projects: guards against a future dashboard-view mutation of timesheetData going unnoticed
        return this.dashboardProjectId ? timesheetData.filter(r => r.projectId === this.dashboardProjectId) : [];
      },
      kpis() {
        if (!this.dashboardReady) return { consumedHours: 0, soldHours: null, budgetTotal: null, consumedEur: null, hoursLeft: null, budgetLeft: null, futureHours: null };
        return computeKpis(this.dashboardData, this.dashboardProject, billableData, billableTasks, findRate, this.reportToday);
      },
      kpiHoursPct() {
        return spentPercent(this.kpis.consumedHours, this.kpis.soldHours);
      },
      kpiBudgetPct() {
        // Fees only (B-072): consumedEur holds no pass-through cost, so PTC stay out of both sides.
        return spentPercent(this.kpis.consumedEur, this.kpis.feesOnly);
      },
      // Same deps object as program.html's projectMetrics() calls, so the Time elapsed tile,
      // the pace judgment and the sibling switch agree with the Program Dashboard.
      reportDeps() {
        return { findRate, billableTasks, billableData, pipelineBudget: getPipelineBudget, today: this.reportToday };
      },
      dashboardMetrics() {
        const cfg = this.dashboardProject;
        return cfg ? projectMetrics(cfg, this.dashboardData, this.reportDeps) : null;
      },
      kpiPace() {
        return this.dashboardMetrics ? paceJudgment(this.dashboardMetrics.vsTime) : null;
      },
      reportTodayLabel() {
        return this.reportToday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      },
      dashboardTitle() {
        return this.dashboardProject?.name || this.dashboardProject?.code || this.dashboardProjectId;
      },
      dashboardClientName() {
        const cfg = this.dashboardProject;
        const name = cfg?.clientId ? getClientName(cfg.clientId) : '';
        return name && name !== 'Unassigned' ? name : '';
      },
      dashboardProgram() {
        const cfg = this.dashboardProject;
        return cfg?.programId ? (getPrograms().find(p => p.id === cfg.programId) || null) : null;
      },
      // Every project of the program, the current one included (flag `current`), ordered by
      // code then name, each with its projectMetrics() for the switch's consumption bar.
      // The metrics are only computed while the switch menu is open (switchMenuOpen), with one
      // pass over timesheetData; the header's project count reads dashboardSiblingList.
      dashboardSiblingList() {
        this.refreshTick;
        const progId = this.dashboardProject?.programId;
        if (!progId) return [];
        return (config.projects || [])
          .filter(p => p.programId === progId)
          .sort((a, b) => (a.code || '').localeCompare(b.code || '') || (a.name || '').localeCompare(b.name || ''));
      },
      dashboardSiblings() {
        const list = this.dashboardSiblingList;
        if (!this.switchMenuOpen || !list.length) return [];
        const ids = new Set(list.map(p => p.id));
        const rowsById = {};
        timesheetData.forEach(r => { if (ids.has(r.projectId)) (rowsById[r.projectId] ||= []).push(r); });
        return list.map(s => ({
          ...s,
          current: s.id === this.dashboardProjectId,
          metrics: projectMetrics(s, rowsById[s.id] || [], this.reportDeps),
        }));
      },
      dashboardProgramTotals() {
        return programTotals(this.dashboardSiblings.map(s => s.metrics));
      },
      // The burndown series of the current view, shared by the chart and the HTML legend.
      burndownSeries() {
        if (!this.dashboardData.length) return null;
        return computeBurndownPoints(this.dashboardData, this.dashboardProject, this.burndownTaskFilter, this.burndownInterval, billableData, billableTasks, findRate, this.reportToday);
      },
      burndownTodayIndex() {
        const s = this.burndownSeries, cfg = this.dashboardProject;
        // No project dates: the axis is synthetic (14 months from the first actual), so no Today.
        if (!s || !cfg?.startDate || !cfg?.endDate) return null;
        // computeBurndownPoints() already placed today on the axis (and stopped the line there).
        return s.todayIndex;
      },
      billableTaskNames() {
        return this.dashboardReady ? billableTasks(this.dashboardProject).map(t => t.name) : [];
      },
      monthlySummary() {
        const data = this.dashboardData, cfg = this.dashboardProject;
        if (!data.length) return null;
        let startY, startM, endY, endM;
        if (cfg?.startDate && cfg?.endDate) {
          startY = parseInt(cfg.startDate.slice(0,4)); startM = parseInt(cfg.startDate.slice(4,6));
          endY = parseInt(cfg.endDate.slice(0,4)); endM = parseInt(cfg.endDate.slice(4,6));
        } else {
          const dates = data.map(r => r.date);
          const minD = dates.reduce((a,b) => a<b?a:b), maxD = dates.reduce((a,b) => a>b?a:b);
          startY = minD.getFullYear(); startM = minD.getMonth()+1;
          endY = maxD.getFullYear(); endM = maxD.getMonth()+1;
        }
        const ptcItems = cfg?.ptc || [];
        const ptcByMonth = {};
        ptcItems.forEach(p => { if (p.month) ptcByMonth[p.month] = (ptcByMonth[p.month]||0) + (p.amount||0); });
        const hasPtc = ptcItems.length > 0;
        const bData = billableData(data, cfg);
        const months = [];
        let cy = startY, cm = startM;
        while (cy < endY || (cy === endY && cm <= endM)) {
          const ym = `${cy}${String(cm).padStart(2,'0')}`;
          const start = new Date(cy, cm-1, 1), end = new Date(cy, cm, 0, 23, 59, 59);
          const rows = bData.filter(r => r.date >= start && r.date <= end);
          const hours = rows.reduce((s,r) => s+r.hours, 0);
          const spent = cfg ? rows.reduce((s,r) => s+r.hours*(findRate(r,cfg)??0), 0) : null;
          const estimatedHours = cfg?.planning?.[ym] ?? 0;
          const estimated = cfg?.phasing?.[ym] ?? 0;
          const ptc = ptcByMonth[ym] || 0;
          const label = start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          const hVar = cfg ? estimatedHours - hours : null;
          const bVar = spent !== null ? estimated - spent : null;
          months.push({ ym, label, hours, estimatedHours, spent, estimated, ptc, hVar, bVar });
          cm++; if (cm > 12) { cm = 1; cy++; }
        }
        const totHours = months.reduce((s,m) => s+m.hours, 0);
        const totEstimatedHours = cfg ? months.reduce((s,m) => s+m.estimatedHours, 0) : null;
        const totHoursVariance = totEstimatedHours !== null ? totEstimatedHours - totHours : null;
        const totSpent = cfg ? months.reduce((s,m) => s+(m.spent??0), 0) : null;
        const totEstimated = cfg ? months.reduce((s,m) => s+m.estimated, 0) : null;
        const totBudgetVariance = (totEstimated !== null && totSpent !== null) ? totEstimated - totSpent : null;
        const totPtc = hasPtc ? months.reduce((s,m) => s+m.ptc, 0) : null;
        return { months, hasPtc, totHours, totEstimatedHours, totHoursVariance, totSpent, totEstimated, totBudgetVariance, totPtc };
      },
      ptcReport() {
        const ptcItems = this.dashboardProject?.ptc || [];
        if (!ptcItems.length) return null;
        const total = ptcItems.reduce((s,p) => s+(p.amount||0), 0);
        const rows = [...ptcItems].sort((a,b) => {
          if (a.month !== b.month) return (a.month||'').localeCompare(b.month||'');
          return (a.title||'').localeCompare(b.title||'');
        }).map(p => {
          let monthLabel = '—';
          if (p.month && p.month.length === 6) {
            const y = parseInt(p.month.slice(0,4)), m = parseInt(p.month.slice(4,6));
            monthLabel = new Date(y, m-1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
          }
          return { ...p, monthLabel };
        });
        return { rows, total };
      },
      filterMonthOptions() {
        const cfg = this.dashboardProject, data = this.dashboardData;
        const months = [];
        if (cfg?.startDate && cfg?.endDate) {
          let cy = parseInt(cfg.startDate.slice(0,4)), cm = parseInt(cfg.startDate.slice(4,6));
          const ey = parseInt(cfg.endDate.slice(0,4)), em = parseInt(cfg.endDate.slice(4,6));
          while (cy < ey || (cy === ey && cm <= em)) { months.push(`${cy}-${String(cm).padStart(2,'0')}`); cm++; if (cm>12){cm=1;cy++;} }
        } else {
          const monthSet = new Set(data.map(r => `${r.date.getFullYear()}-${String(r.date.getMonth()+1).padStart(2,'0')}`));
          [...monthSet].sort().forEach(ym => months.push(ym));
        }
        return months;
      },
      filterRange() {
        if (this.filterMonth) {
          const [y, m] = this.filterMonth.split('-').map(Number);
          return { start: new Date(y, m-1, 1), end: new Date(y, m, 0, 23, 59, 59) };
        }
        return {
          start: this.filterStart ? new Date(this.filterStart + 'T00:00:00') : null,
          end: this.filterEnd ? new Date(this.filterEnd + 'T23:59:59') : null,
        };
      },
      filterHasFilter() { return !!(this.filterRange.start || this.filterRange.end); },
      filterRangeLabel() {
        if (this.filterMonth) return this.filterMonthLabel(this.filterMonth);
        const { start, end } = this.filterRange;
        const fmtD = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        if (start && end) return `${fmtD(start)} – ${fmtD(end)}`;
        if (start) return `from ${fmtD(start)}`;
        if (end) return `until ${fmtD(end)}`;
        return '';
      },
      summaryByTask() {
        if (!this.dashboardProject) return null;
        const cfg = this.dashboardProject;
        const bTasks = billableTasks(cfg);
        const entries = bTasks.map(t => ({
          key: t.name.toLowerCase(), label: t.name,
          soldHours: t.resources.reduce((s,r) => s+r.soldHours, 0),
          soldEur: t.resources.reduce((s,r) => s+r.soldHours*r.hourlyRate, 0),
        }));
        return buildSummaryCols(this.dashboardData, r => r.task.toLowerCase(), entries, this.filterRange, cfg, findRate);
      },
      // Logic and rationale: roleColumns()/areaColumns() in js/lib/project-report-calc.js.
      summaryByRole() {
        const cfg = this.dashboardProject;
        return cfg ? roleColumns(this.dashboardData, cfg, this.filterRange, { billableData, billableTasks, findRate }) : null;
      },
      summaryByGroup() {
        const cfg = this.dashboardProject;
        if (!cfg || !cfg.groups?.length) return null;
        return areaColumns(this.dashboardData, cfg, this.filterRange, { billableData, billableTasks, findRate });
      },
      // Rows of the Breakdown card for the current view (spec §6 "Card Breakdown"): Spent follows
      // the period filter, Remaining and the consumption % stay on the whole project.
      // Spec §7 "Nessun budget": nothing sold on the project, so Sold, Remaining and % read "—".
      breakdownNoBudget() {
        return !(this.kpis.soldHours > 0);
      },
      breakdown() {
        const b = this.breakdownBase;
        if (!b || !this.breakdownNoBudget) return b;
        return { rows: b.rows.map(r => this.withoutSold(r)), total: this.withoutSold(b.total) };
      },
      breakdownBase() {
        const cfg = this.dashboardProject;
        if (!cfg) return null;
        const hasFilter = this.filterHasFilter;
        if (this.breakdownView === 'role') {
          const cols = this.summaryByRole || [];
          const { rows, total } = breakdownRows(cols, hasFilter);
          return { total, rows: rows.map((r, i) => ({ ...r, key: 'r:' + cols[i].role + '|' + cols[i].task, blockKey: 'role:' + cols[i].role + '|' + cols[i].task, label: cols[i].role, subtitle: roleSubtitle(cols[i].role, cols[i].task, this.dashboardData) })) };
        }
        if (this.breakdownView === 'area' && cfg.groups?.length) {
          const cols = this.summaryByGroup || [];
          const deps = { billableData, billableTasks, findRate };
          // Areas may overlap, so the Total is computed once over every billable entry (B-073).
          const totalCol = areaTotalColumn(this.dashboardData, cfg, this.filterRange, deps);
          const { rows, total } = breakdownRows(cols, hasFilter, totalCol);
          return { total, rows: rows.map((r, i) => {
            const areaIndex = cols[i].ungrouped ? 'ungrouped' : i;
            // The area's tasks (second level); the subtitle lists the same columns the expansion shows.
            const areaCols = areaTaskColumns(this.dashboardData, cfg, this.filterRange, deps, areaIndex);
            const n = areaCols.length;
            return { ...r, key: 'g:' + areaIndex, areaIndex, areaCols, blockKey: 'area:' + areaIndex,
              subtitle: cols[i].ungrouped ? 'Not in any functional area' : n + (n === 1 ? ' task' : ' tasks') + (n ? ' · ' + areaCols.map(c => c.task).join(', ') : '') };
          }) };
        }
        const tasks = billableTasks(cfg);
        const { rows, total } = breakdownRows(this.summaryByTask || [], hasFilter);
        return { total, rows: rows.map((r, i) => ({ ...r, key: 't:' + tasks[i].name, taskName: tasks[i].name, subtitle: taskSubtitle(tasks[i], cfg.groups || []) })) };
      },
      // The Breakdown's rendered sequence: rows, Total, then (By task only) the non-billable tasks.
      breakdownAreaOverlap() {
        const cfg = this.dashboardProject;
        return !!cfg?.groups?.length && areaOverlap(this.dashboardData, cfg, { billableData, billableTasks, findRate });
      },
      breakdownItems() {
        const b = this.breakdown;
        if (!b) return [];
        const items = [];
        b.rows.forEach(r => {
          const blockKey = this.breakdownView === 'task' ? 'task:' + r.taskName : r.blockKey || null;
          // An area row only opens its task rows; every other row opens an Entries block.
          items.push({ kind: 'row', key: r.key, row: r, taskName: this.breakdownView === 'task' ? r.taskName : null, blockKey, entries: this.breakdownView !== 'area' });
          if (this.breakdownView === 'area' && blockKey && this.entriesState[blockKey]?.expanded) {
            const { rows: taskRows } = breakdownRows(r.areaCols, this.filterHasFilter);
            taskRows.forEach((tr, j) => {
              const col = r.areaCols[j];
              const row = { ...tr, subtitle: col.roles + (col.roles === 1 ? ' role' : ' roles') };
              items.push({ kind: 'area-task', key: 'at:' + r.areaIndex + '|' + col.task, row: this.breakdownNoBudget ? this.withoutSold(row) : row, taskName: col.task, blockKey: 'area:' + r.areaIndex + '|' + col.task, areaIndex: r.areaIndex, entries: true });
            });
          }
        });
        items.push({ kind: 'total', key: 'total' });
        if (this.breakdownView === 'task') {
          const excluded = this.taskDetailData.filter(e => e.task.billable === false);
          if (excluded.length) {
            items.push({ kind: 'excluded-head', key: 'excluded-head' });
            excluded.forEach(e => items.push({ kind: 'excluded', key: 'x:' + e.task.name, taskName: e.task.name, blockKey: 'task:' + e.task.name, entries: true, hours: e.totPeriod }));
          }
        }
        return items;
      },
      sheetOptions() {
        return this.sheet.blockKey ? filterOptions(this.blockEntries(this.sheet.blockKey), this.sheet.filterKind) : [];
      },
      taskDetailByName() {
        const map = {};
        this.taskDetailData.forEach(e => { map[e.task.name] = e; });
        return map;
      },
      // The same, keyed lower-case: a logged-only By role pair carries the task as the timesheet wrote it.
      taskDetailByLowerName() {
        const map = {};
        this.taskDetailData.forEach(e => { const k = e.task.name.toLowerCase(); if (!map[k]) map[k] = e; });
        return map;
      },
      periodLabel() {
        if (!this.filterHasFilter) return 'Whole project';
        return this.filterMonth ? this.monthLabelLong(this.filterMonth) : this.filterRangeLabel;
      },
      wholeProjectRange() {
        const cfg = this.dashboardProject;
        return cfg?.startDate && cfg?.endDate ? `${this.monthLabelLong(cfg.startDate)} – ${this.monthLabelLong(cfg.endDate)}` : '';
      },
      // Months up to the current one, most recent first (the 7.4d board lists no future month).
      periodMonths() {
        return [...this.filterMonthOptions].reverse().filter(ym => monthState(ym, this.reportToday) !== 'future');
      },
      periodHours() {
        return hoursByMonth(billableData(this.dashboardData, this.dashboardProject));
      },
      taskDetailData() {
        const cfg = this.dashboardProject;
        if (!cfg) return [];
        const { start, end } = this.filterRange;
        const data = this.dashboardData;

        return cfg.tasks.map(task => {
          const taskData = data.filter(r => r.task.toLowerCase() === task.name.toLowerCase());
          const periodData = taskData.filter(r => (!start || r.date >= start) && (!end || r.date <= end)).sort((a,b) => a.date - b.date);

          // Roles from every entry of the task, not only the period's: a role whose entries all
          // fall outside the period still counts in the task row's Remaining, so it keeps its row.
          const roleMap = new Map();
          taskData.forEach(r => {
            const key = r.role.toLowerCase();
            if (!roleMap.has(key)) roleMap.set(key, { role: r.role, owners: new Set(), consumedPeriod: 0 });
            if (r.owner) roleMap.get(key).owners.add(r.owner);
          });
          periodData.forEach(r => { roleMap.get(r.role.toLowerCase()).consumedPeriod += r.hours; });
          task.resources.forEach(res => {
            if (!roleMap.has(res.role.toLowerCase())) roleMap.set(res.role.toLowerCase(), { role: res.role, owners: new Set(), consumedPeriod: 0 });
          });

          const rows = [...roleMap.values()].map(({ role, owners, consumedPeriod }) => {
            const owner = [...owners].filter(Boolean).join(', ') || '—';
            const cfgRes = task.resources.find(r => r.role.toLowerCase() === role.toLowerCase());
            // findRate(), as the task row (buildSummaryCols): a role not configured on the task
            // takes the task's first resource rate, so row, sub-rows and entries reconcile.
            const rate = cfgRes?.hourlyRate ?? findRate({ role, task: task.name }, cfg) ?? 0;
            const soldHours = cfgRes?.soldHours ?? null;
            const soldEur = soldHours !== null ? soldHours * rate : null;
            const consumedTotal = taskData.filter(r => r.role.toLowerCase() === role.toLowerCase()).reduce((s,r) => s+r.hours, 0);
            const remaining = cfgRes != null ? cfgRes.soldHours - consumedTotal : null;
            const consumedPeriodEur = periodData.filter(r => r.role.toLowerCase() === role.toLowerCase()).reduce((s,r) => s+r.hours*rate, 0);
            const remainingEur = cfgRes != null ? rate * (cfgRes.soldHours - consumedTotal) : null;
            const consumedTotalEur = consumedTotal * rate;
            return { label: `${role} (${owner})`, role, owners: [...owners].filter(Boolean).join(', '), rate, soldHours, soldEur, consumedPeriod, consumedPeriodEur, consumedTotal, consumedTotalEur, remaining, remainingEur };
          });

          const totSold = rows.reduce((s,r) => s+(r.soldHours??0), 0);
          const totSoldEur = rows.reduce((s,r) => s+(r.soldEur??0), 0);
          const totPeriod = periodData.reduce((s,r) => s+r.hours, 0);
          const totPeriodEur = periodData.reduce((s,r) => s + r.hours * (findRate(r, cfg) ?? 0), 0);
          const totRemaining = rows.reduce((s,r) => s+(r.remaining??0), 0);
          const totRemainingEur = rows.reduce((s,r) => s+(r.remainingEur??0), 0);

          return { task, rows, totSold, totSoldEur, totPeriod, totPeriodEur, totRemaining, totRemainingEur, periodData };
        });
      },
    },
    async created() {
      this._burndownChart = null;
      loadSummarySelection();

      const user = await initNav('portfolio', { breadcrumbs: [
        { label: 'Home', href: '/pipeline.html' },
        { label: 'Portfolio' },
      ]});
      if (!user) return;

      const noticeCode = new URLSearchParams(window.location.search).get('notice');
      if (noticeCode === 'direct-creation-disabled') {
        this.notice = window.PROJECT_RULE_MESSAGES.directCreation;
        window.history.replaceState(null, '', window.location.pathname);
      } else if (noticeCode === 'program-not-found') {
        this.notice = 'Program not found.';
        window.history.replaceState(null, '', window.location.pathname);
      }
      await Promise.all([loadClientsFromApi(), loadProgramsFromApi(), loadCurrenciesFromApi()]);
      this.currencies = window.__currencies || [];
      await Promise.all([loadConfigFromApi(), refreshTimesheetDataFromApi(), loadPipelineBudgetsFromApi()]);
      this.refreshTick++; // mount() runs before this async data load resolves, so `projects` (and everything chained off it) must be nudged once data is actually in

      document.getElementById('fileInput').addEventListener('change', async e => {
        const f = e.target.files[0]; e.target.value = '';
        if (f) {
          await readXLSForProject(f, window._loadActualsProjectId);
          this.refreshTick++;
          if (this.view === 'dashboard') this.$nextTick(() => this.renderBurndownChart());
        }
      });

      const params = new URLSearchParams(window.location.search);
      const urlProjectId = params.get('projectId');
      if (urlProjectId) {
        this.showDashboard(urlProjectId);
      } else {
        this.showOverview();
      }
    },
    mounted() {
      this.attachCardGridObserver();
      this._phoneMq = window.matchMedia('(max-width: 767.98px)');
      this.isPhone = this._phoneMq.matches;
      this._phoneMqHandler = e => { this.isPhone = e.matches; this.closeMenu(false); if (!e.matches) this.hideSheet(); };
      this._phoneMq.addEventListener('change', this._phoneMqHandler);
    },
    beforeUnmount() {
      this.removeMenuListeners();
      if (this._phoneMq) this._phoneMq.removeEventListener('change', this._phoneMqHandler);
      if (this._cardGridObserver) { this._cardGridObserver.disconnect(); this._cardGridObserver = null; }
    },
    methods: {
      getClientName,
      pipelineBadge,
      fmtDate,
      fmtH,
      getProjectPipeline,
      statusBadgeLarge,
      headerBadge,
      openShareModal,
      spentPercent,
      spentBarState,
      isPinnedSummary(id) {
        // template expressions resolve bare identifiers through the component instance only (never
        // fall through to window in Vue 3's runtime-compiled mode), so the global Set must be read
        // dynamically here rather than referenced bare in the template or captured once by value
        return portfolioSummaryProjects.has(id);
      },
      // The state of one Breakdown row's expansion and Entries block, created on first access.
      // Keys: 'task:<name>', 'role:<role>|<task>', 'area:<groupIndex|ungrouped>' (the area row) and 'area:<groupIndex|ungrouped>|<task>'.
      blockState(key) {
        if (!this.entriesState[key]) {
          this.entriesState[key] = { expanded: false, openMonth: null, closedMonths: [], filter: [], sort: defaultSort() };
        }
        return this.entriesState[key];
      },
      blockDomId(key) { return prBlockId(key); },
      blockInfo(key) {
        const i = key.indexOf(':');
        return { prefix: key.slice(0, i), rest: key.slice(i + 1) };
      },
      // The entries of the block inside the selected Period.
      blockEntries(key) {
        const { prefix, rest } = this.blockInfo(key);
        if (prefix === 'task') return this.taskDetailByName[rest]?.periodData || [];
        const task = this.blockTaskName(key);
        const data = (this.taskDetailByName[task] || this.taskDetailByLowerName[task.toLowerCase()])?.periodData || [];
        if (prefix === 'role') {
          const role = rest.slice(0, rest.indexOf('|')).toLowerCase();
          return data.filter(r => r.role.toLowerCase() === role);
        }
        if (prefix === 'area') {
          const gi = rest.slice(0, rest.indexOf('|'));
          const claims = areaEntryClaims(this.dashboardProject, gi === 'ungrouped' ? gi : Number(gi));
          return data.filter(r => claims(r.role, task));
        }
        return [];
      },
      blockFilterKind(key) { return this.blockInfo(key).prefix === 'role' ? 'resource' : 'role'; },
      // One stable rate function per block, so the component's computed block is not rebuilt on every parent render.
      blockRate(key) {
        this._rateFns = this._rateFns || {};
        if (!this._rateFns[key]) {
          const task = { name: this.blockTaskName(key) };
          this._rateFns[key] = r => this.entryRate(task, r);
        }
        return this._rateFns[key];
      },
      blockTaskName(key) {
        const { prefix, rest } = this.blockInfo(key);
        return prefix === 'task' ? rest : rest.slice(rest.indexOf('|') + 1);
      },
      blockExportName(key) {
        const { prefix, rest } = this.blockInfo(key);
        let label = rest;
        if (prefix === 'area') {
          const gi = rest.slice(0, rest.indexOf('|'));
          label = (gi === 'ungrouped' ? 'Ungrouped' : this.dashboardProject.groups[Number(gi)].name) + '|' + this.blockTaskName(key);
        }
        return prefix + '_' + label.replace(/[^a-zA-Z0-9]/g, '_') + '_entries.xlsx';
      },
      exportBlock(key) {
        this.exportEntriesXls(this.blockEntries(key), this.blockRate(key), this.blockFilterKind(key), this.blockExportName(key));
      },
      // A Period change can remove the roles/resources a block was filtered on: drop them, and a filter
      // that ends up empty goes back to "one month open".
      pruneEntryFilters() {
        Object.keys(this.entriesState).forEach(key => {
          const st = this.entriesState[key];
          if (!st.filter.length) return;
          st.filter = pruneFilter(st.filter, filterOptions(this.blockEntries(key), this.blockFilterKind(key)));
          if (!st.filter.length) { st.closedMonths = []; st.openMonth = null; }
        });
      },
      // The rows render after Bootstrap has positioned the (still empty) menu: position it again.
      onSwitchShow() {
        this.switchMenuOpen = true;
        this.$nextTick(() => {
          const btn = this.$refs.switchBtn;
          const dd = btn && window.bootstrap ? window.bootstrap.Dropdown.getInstance(btn) : null;
          if (dd) dd.update();
        });
      },
      onSwitchHidden() { this.switchMenuOpen = false; },
      // One task open per area: opening one closes the others of the same area (their state stays).
      toggleBlock(key) {
        const st = this.blockState(key);
        st.expanded = !st.expanded;
        const bar = key.indexOf('|');
        if (st.expanded && key.startsWith('area:') && bar > 0) {
          const areaPrefix = key.slice(0, bar + 1);
          Object.keys(this.entriesState).forEach(k => { if (k !== key && k.startsWith(areaPrefix)) this.entriesState[k].expanded = false; });
        }
        // A filter menu left open on a block that just collapsed, or sits under one (a keyboard toggle fires no mousedown).
        const menuKey = this.openMenu && this.openMenu.startsWith('filter:') ? this.openMenu.slice('filter:'.length) : null;
        if (menuKey && (!this.entriesState[menuKey]?.expanded || (!st.expanded && menuKey.startsWith(key + '|')))) this.closeMenu(false);
      },
      // A task's role rows in the Breakdown's expansion (spec §6 "By task"): Spent is the
      // period consumption, Remaining and % the whole-project ones, like the task row above.
      roleSubRows(entry) {
        const cols = entry.rows.map(r => ({
          label: r.role,
          soldHours: r.soldHours ?? 0, soldEur: r.soldEur ?? 0,
          totalConsumed: r.consumedTotal, totalConsumedEur: r.consumedTotalEur,
          inPeriod: r.consumedPeriod, inPeriodEur: r.consumedPeriodEur,
        }));
        return breakdownRows(cols, true).rows.map((row, i) => {
          const r = entry.rows[i];
          const rate = r.rate ? `${this.formatMoney(r.rate, this.dashCurrency, this.currencies)}/h` : '';
          const out = { ...row, key: r.role, subtitle: [r.owners, rate].filter(Boolean).join(' · ') };
          // A role not sold on the task has nothing to compare against: no Sold, Remaining, % or Over sold.
          return r.soldHours === null || this.breakdownNoBudget ? this.withoutSold(out) : out;
        });
      },
      // A Breakdown row with no sold reference (spec §7 "Nessun budget", or a role not sold on the task).
      withoutSold(row) {
        return { ...row, soldKnown: false, overSold: false, pct: null, barState: 'none' };
      },
      // findRate(), as the task row: null (amount "—") only when the task has no rate at all.
      entryRate(task, row) {
        return this.dashboardProject ? findRate({ role: row.role || '', task: task.name }, this.dashboardProject) : null;
      },
      // The block's whole Period (not its filter or sort), oldest first.
      exportEntriesXls(rows, rateFor, kind, fileName) {
        const aoa = [['Date', kind === 'resource' ? 'Resource' : 'Role (resource)', 'Hours', 'Amount', 'Note']];
        [...rows].sort((a, b) => a.date - b.date).forEach(r => {
          const rate = rateFor(r);
          aoa.push([fmtDate(r.date), kind === 'resource' ? (r.owner || '') : (r.owner ? `${r.role} (${r.owner})` : r.role), r.hours, rate === null ? '' : Math.round(r.hours * rate * 100) / 100, r.notes || '']);
        });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Data');
        XLSX.writeFile(wb, fileName);
      },
      filterMonthLabel(ym) {
        const [y, m] = ym.split('-').map(Number);
        return new Date(y, m-1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      },
      resetDateFilter() { this.filterMonth = ''; this.filterStart = ''; this.filterEnd = ''; },
      // A month (or '' for the whole project) picked in the Period menu or sheet; both close here,
      // since a click inside the menu (the custom-range pickers included) keeps it open.
      pickPeriod(ym) {
        this.filterMonth = ym; this.filterStart = ''; this.filterEnd = '';
        this.closeMenu();
        this.hideSheet();
      },
      onPeriodClick(ev) {
        if (this.isPhone) this.openSheet('period');
        else this.toggleMenu('period', ev.currentTarget);
      },
      // Smartphone bottom sheets (offcanvas), one per kind, bound to the block that opened them. Filter and sort
      // edit a draft that Apply copies into the block's state; the Period sheet applies directly.
      openSheet(kind, blockKey) {
        this.closeMenu(false);
        if (kind === 'period') {
          this.sheet = { kind, blockKey: null, filterKind: 'role', draftFilter: [], draftSort: defaultSort() };
        } else {
          const st = this.blockState(blockKey);
          this.sheet = { kind, blockKey, filterKind: this.blockFilterKind(blockKey), draftFilter: [...st.filter], draftSort: { ...st.sort } };
        }
        const id = kind === 'filter' ? 'prFilterSheet' : kind === 'sort' ? 'prSortSheet' : 'prPeriodSheet';
        this.$nextTick(() => window.bootstrap.Offcanvas.getOrCreateInstance(document.getElementById(id)).show());
      },
      hideSheet() {
        ['prFilterSheet', 'prSortSheet', 'prPeriodSheet'].forEach(id => {
          const el = document.getElementById(id);
          const inst = el && window.bootstrap ? window.bootstrap.Offcanvas.getInstance(el) : null;
          if (inst) inst.hide();
        });
      },
      toggleDraft(v) {
        const f = this.sheet.draftFilter;
        this.sheet.draftFilter = f.includes(v) ? f.filter(x => x !== v) : [...f, v];
      },
      applySheet() {
        const sh = this.sheet, st = this.blockState(sh.blockKey);
        if (sh.kind === 'filter') {
          const had = st.filter.length > 0;
          st.filter = [...sh.draftFilter];
          if (had !== st.filter.length > 0) { st.closedMonths = []; st.openMonth = null; }
        } else {
          st.sort = { ...sh.draftSort };
        }
        this.hideSheet();
      },
      // "Clear" in the filter sheet, "Reset" in the sort sheet: back to the defaults, still a draft until Apply.
      resetSheet() {
        if (this.sheet.kind === 'filter') this.sheet.draftFilter = [];
        else this.sheet.draftSort = defaultSort();
      },
      // Popover menus: one open at a time, closed by a click outside it and by Esc (focus goes back to
      // its button). The custom-range pickers live inside the menu's DOM, so a click in them is inside.
      toggleMenu(name, btnEl) {
        if (this.openMenu === name) { this.closeMenu(); return; }
        this.removeMenuListeners();
        this.openMenu = name;
        this._menuBtn = btnEl || null;
        this._menuDocHandlers = {
          mousedown: e => { if (!this.isInsideMenu(e.target)) this.closeMenu(false); },
          keydown: e => { if (e.key === 'Escape') this.closeMenu(); },
        };
        document.addEventListener('mousedown', this._menuDocHandlers.mousedown);
        document.addEventListener('keydown', this._menuDocHandlers.keydown);
      },
      closeMenu(restoreFocus = true) {
        const btn = this._menuBtn;
        this.removeMenuListeners();
        this.openMenu = null;
        this._menuBtn = null;
        if (restoreFocus && btn && btn.focus) btn.focus();
      },
      removeMenuListeners() {
        const h = this._menuDocHandlers;
        if (!h) return;
        document.removeEventListener('mousedown', h.mousedown);
        document.removeEventListener('keydown', h.keydown);
        this._menuDocHandlers = null;
      },
      isInsideMenu(target) {
        if (!this.openMenu || !target || !target.closest) return false;
        const menu = target.closest('[data-menu]'), btn = target.closest('[data-menu-btn]');
        return (!!menu && menu.getAttribute('data-menu') === this.openMenu) || (!!btn && btn.getAttribute('data-menu-btn') === this.openMenu);
      },
      exportBreakdownXls() {
        const b = this.breakdown;
        if (!b) return;
        // Numbers, not formatted text, so the sheet can sum and sort; a row without a sold
        // reference leaves Sold, Remaining and % empty, as the page shows "—".
        const num = v => (v == null ? '' : Math.round(v * 100) / 100);
        const line = (r, detail) => r.soldKnown
          ? [r.label, detail, num(r.soldHours), num(r.soldAmount), num(r.spentHours), num(r.spentAmount), num(r.remainingHours), num(r.remainingAmount), r.pct === null ? '' : r.pct]
          : [r.label, detail, '', '', num(r.spentHours), num(r.spentAmount), '', '', ''];
        const aoa = [['Name', 'Detail', 'Sold h', `Sold amount (${this.dashCurrency})`, 'Spent h', `Spent amount (${this.dashCurrency})`, 'Remaining h', `Remaining amount (${this.dashCurrency})`, 'Consumption %']];
        b.rows.forEach(r => aoa.push(line(r, r.subtitle || '')));
        aoa.push(line(b.total, ''));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Data');
        XLSX.writeFile(wb, 'breakdown_' + this.breakdownView + '.xlsx');
      },
      showOverview() {
        this.view = 'overview';
        selectedProjectId = null;
        history.replaceState(null, '', '/portfolio.html');
        if (typeof updateBreadcrumbs === 'function') updateBreadcrumbs([
          { label: 'Home', href: '/pipeline.html' },
          { label: 'Portfolio' },
        ]);
      },
      toggleProgramExpanded(id) {
        // Keeps the List's set in step, so a collapse here propagates there too.
        const next = toggleCardExpansion(id, this.expandedProgramId, [...this.listExpandedPrograms]);
        this.expandedProgramId = next.expandedProgramId;
        this.listExpandedPrograms = new Set(next.listExpandedIds);
      },
      toggleListExpanded(id) {
        if (this.listExpandedPrograms.has(id)) this.listExpandedPrograms.delete(id);
        else this.listExpandedPrograms.add(id);
      },
      getMonthRangeFromCfg(cfg) {
        if (!cfg?.startDate || !cfg?.endDate) return [];
        const sy = parseInt(cfg.startDate.slice(0,4)), sm = parseInt(cfg.startDate.slice(4,6));
        const ey = parseInt(cfg.endDate.slice(0,4)), em = parseInt(cfg.endDate.slice(4,6));
        const months = [];
        let cy = sy, cm = sm;
        while (cy < ey || (cy === ey && cm <= em)) { months.push(`${cy}${String(cm).padStart(2,'0')}`); cm++; if (cm > 12) { cm = 1; cy++; } }
        return months;
      },
      monthLabel(ym) {
        return new Date(parseInt(ym.slice(0,4)), parseInt(ym.slice(4,6))-1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      },
      // 'YYYYMM' or 'YYYY-MM' → "Dec 2025" (the 7.4 header and Time elapsed tile).
      monthLabelLong(ym) {
        const k = String(ym).replace('-', '');
        return new Date(parseInt(k.slice(0,4)), parseInt(k.slice(4,6))-1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      },
      varColor(v) { return v > 0 ? 'var(--color-success)' : v < 0 ? 'var(--color-danger)' : 'var(--text-muted)'; },
      goNewProject() { if (this.directCreationEnabled) window.location.href = '/project-config.html'; },
      fmtVar(v, cur) { return `${v >= 0 ? '+' : ''}${this.formatMoney(v, cur || this.dashCurrency, this.currencies)}`; },
      fmtProjectTitle(cfg) {
        const client = getClientName(cfg.clientId);
        const name = cfg.name || cfg.id;
        return client && client !== 'Unassigned' ? `${client} — ${name}` : name;
      },
      programSummary(cfgs) {
        const monthSet = new Set();
        cfgs.forEach(cfg => this.getMonthRangeFromCfg(cfg).forEach(ym => monthSet.add(ym)));
        const months = [...monthSet].sort();
        if (!months.length) return null;
        const phasing = {}, spent = {};
        months.forEach(ym => { phasing[ym] = 0; spent[ym] = 0; });
        cfgs.forEach(cfg => {
          months.forEach(ym => { phasing[ym] += cfg.phasing?.[ym] || 0; });
          timesheetData.filter(r => r.projectId === cfg.id).forEach(r => {
            if (!r.date) return;
            const ym = `${r.date.getFullYear()}${String(r.date.getMonth()+1).padStart(2,'0')}`;
            if (spent[ym] !== undefined) spent[ym] += r.hours * (findRate(r, cfg) ?? 0);
          });
        });
        const grandEst = months.reduce((s, ym) => s + phasing[ym], 0);
        const grandSpent = months.reduce((s, ym) => s + spent[ym], 0);
        return { grandEst, grandSpent, grandVar: grandEst - grandSpent, currency: commonCurrency(cfgs) };
      },
      programDuration(cfgs) {
        const starts = cfgs.map(cfg => cfg.startDate).filter(Boolean).sort();
        const ends = cfgs.map(cfg => cfg.endDate).filter(Boolean).sort();
        if (!starts.length || !ends.length) return null;
        return { start: starts[0], end: ends[ends.length - 1] };
      },
      cardData(cfg) {
        const data = timesheetData.filter(r => r.projectId === cfg.id);
        const months = this.getMonthRangeFromCfg(cfg);
        const hasDuration = months.length > 0;
        const monthSpend = {};
        data.forEach(r => {
          if (!r.date) return;
          const ym = `${r.date.getFullYear()}${String(r.date.getMonth()+1).padStart(2,'0')}`;
          monthSpend[ym] = (monthSpend[ym]||0) + r.hours * (findRate(r, cfg) ?? 0);
        });
        const hasData = data.length > 0;
        const hasPhasing = cfg.phasing && Object.keys(cfg.phasing).length > 0;
        const totalPtc = (cfg.ptc||[]).reduce((s,p) => s+(p.amount||0), 0);
        const totalSpent = months.reduce((s, ym) => s + (monthSpend[ym]||0), 0);
        const totalPhasing = months.reduce((s, ym) => s + (cfg.phasing?.[ym]||0), 0);
        const totalVar = totalPhasing - totalSpent;
        const totalHours = (cfg.tasks||[]).reduce((s,t) => s+(t.resources||[]).reduce((rs,r) => rs+(r.soldHours||0),0), 0);
        const totalBudget = (cfg.tasks||[]).reduce((s,t) => s+(t.resources||[]).reduce((rs,r) => rs+(r.soldHours||0)*(r.hourlyRate||0),0), 0);
        const cgRef = cfg.costGridRef;
        const apiBudget = (typeof getPipelineBudget === 'function' && cgRef?.versionId) ? getPipelineBudget(cgRef.versionId) : null;
        const displayFee = totalBudget > 0 ? totalBudget : (apiBudget?.fee || 0);
        const displayHours = totalHours > 0 ? totalHours : 0;
        const displayTotal = displayFee + totalPtc;
        const cur = cfg.currency || 'EUR';
        const budgetBadgeHtml = (displayFee > 0 || displayHours > 0)
          ? `<span class="portfolio-budget-badge">${displayHours > 0 ? displayHours.toLocaleString('en-US') + ' h &nbsp;/&nbsp; ' : ''}${displayTotal == null ? '—' : window.formatMoney(displayTotal, cur, window.__currencies)}${totalPtc > 0 ? `<span class="text-muted" style="font-size:.8em;font-weight:400"> &nbsp;(${displayFee == null ? '—' : window.formatMoney(displayFee, cur, window.__currencies)} fees + ${window.formatMoney(totalPtc, cur, window.__currencies)} PTC)</span>` : ''}${apiBudget && totalBudget === 0 ? '<span class="text-muted" style="font-size:.75em;margin-left:4px">(from cost grid)</span>' : ''}</span>`
          : '';
        return { hasData, hasPhasing, hasDuration, totalSpent, totalPhasing, totalVar, budgetBadgeHtml };
      },
      toggleSummary(id) {
        if (portfolioSummaryProjects.has(id)) portfolioSummaryProjects.delete(id); else portfolioSummaryProjects.add(id);
        saveSummarySelection();
        this.refreshTick++;
      },
      triggerLoadActuals(projectId) {
        window._loadActualsProjectId = projectId;
        document.getElementById('fileInput').click();
      },
      goPlanningForProject(id) {
        window.location.href = '/planning.html?projectId=' + encodeURIComponent(id);
      },
      goConfigure(id) {
        window.location.href = '/project-config.html?projectId=' + encodeURIComponent(id);
      },
      goProgramDashboard(id) {
        window.location.href = '/program.html?programId=' + encodeURIComponent(id);
      },
      clearPortfolioFilters() {
        this.portfolioSearch = '';
        this.portfolioClientFilter = [];
        this.portfolioStageFilter = [];
        this.portfolioStatusFilter = [];
      },
      setLayout(v) {
        this.portfolioLayout = v;
        try { localStorage.setItem('PDash_portfolioLayout', v); } catch (e) {}
      },
      // Review Focus 3: the Card grid isn't mounted while in List, and the initial
      // mount can happen before the project data has loaded (projects.length === 0),
      // so re-measuring is triggered again whenever the layout switches back to
      // Card or the data load bumps refreshTick — not just once at mounted().
      attachCardGridObserver() {
        if (this._cardGridObserver) { this._cardGridObserver.disconnect(); this._cardGridObserver = null; }
        if (this.portfolioLayout !== 'card') return;
        this.$nextTick(() => {
          const el = this.$refs.cardGrid;
          if (!el) return;
          this._cardGridObserver = new ResizeObserver(entries => {
            for (const entry of entries) this.gridColumns = columnsForWidth(entry.contentRect.width);
          });
          this._cardGridObserver.observe(el);
        });
      },
      cardSpentPct(card) {
        return spentPercent(card?.totalSpent ?? 0, card?.hasPhasing ? card.totalPhasing : 0);
      },
      cardSpentLabel(pct) {
        return pct === null ? 'No budget' : pct + '% spent';
      },
      fmtK(n, cur) {
        return `${currencyInfo(cur, this.currencies).symbol} ${Math.round((n || 0) / 1000)}k`;
      },
      esc,
      kpiLeftColor(left, total) {
        if (left === null) return '';
        if (left < 0) return 'var(--color-danger)';
        if (total && left < total * 0.1) return 'var(--kpi-orange)';
        return 'var(--color-success)';
      },
      showDashboard(pid) {
        this.view = 'dashboard';
        this.dashboardProjectId = pid;
        this.dashboardReady = true;
        this.reportToday = new Date();
        selectedProjectId = pid;
        history.replaceState(null, '', '/portfolio.html?projectId=' + encodeURIComponent(pid));
        const cfg = this.dashboardProject;
        if (typeof updateBreadcrumbs === 'function') updateBreadcrumbs([
          { label: 'Home', href: '/pipeline.html' },
          { label: 'Portfolio', href: '/portfolio.html' },
          { label: cfg?.name || pid },
        ]);
        this.burndownInterval = 'monthly';
        this.burndownTaskFilter = '';
        this.progressView = 'burndown';
        this.breakdownView = 'task';
        this.resetDateFilter();
        this.entriesState = {};
        this.closeMenu(false);
        this.hideSheet();
        this.switchMenuOpen = false;
        this.loadDashboardTags(pid);
        this.$nextTick(() => this.renderBurndownChart());
      },
      async loadDashboardTags(pid) {
        this.dashboardTags = [];
        try {
          const tags = await Api.projects.tags.list(pid);
          if (this.dashboardProjectId === pid) this.dashboardTags = tags || [];
        } catch (e) {
          if (this.dashboardProjectId === pid) this.dashboardTags = [];
        }
      },
      // Chart.js cannot resolve var(); read the token's computed value instead.
      chartColor(name, fallback) {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
      },
      renderBurndownChart() {
        if (this._burndownChart) { this._burndownChart.destroy(); this._burndownChart = null; }
        const series = this.burndownSeries;
        if (!series || !this.$refs.burndownCanvas) return;

        const currencyForChart = this.dashCurrency;
        const { labels, burnValues, idealValues, budget, totalBudgetEur, tooltipBudgetConsumed, tooltipPhasingEur, hasPhasingEur, todayValue } = series;
        const index = this.burndownTodayIndex;

        const datasets = [{
          label: budget !== null ? 'Remaining hours (actual)' : 'Cumulative hours',
          data: burnValues,
          borderColor: this.chartColor('--chart-actual', 'gray'), backgroundColor: 'rgba(13,110,253,0.07)',
          fill: true, tension: 0.2, pointHoverRadius: 4,
          pointRadius: labels.map((_, i) => i === index ? 5 : 0),
          pointBackgroundColor: this.chartColor('--brand-navy', 'navy'),
        }];
        if (idealValues) {
          datasets.push({
            label: 'Remaining hours planned',
            data: idealValues,
            borderColor: this.chartColor('--chart-phasing', 'gray'), borderDash: [6, 4], borderWidth: 2,
            fill: false, pointRadius: 0, tension: 0,
          });
        }
        const todayPlugin = window.todayLabelPlugin({
          id: 'prTodayLabel',
          index,
          text: index !== null ? `${fmtH(todayValue)} ${budget !== null ? 'left' : 'consumed'}` : '',
          bg: this.chartColor('--brand-navy', 'navy'),
          fg: this.chartColor('--surface-white', 'white'),
        });

        this._burndownChart = new Chart(this.$refs.burndownCanvas, {
          type: 'line',
          data: { labels, datasets },
          plugins: [todayPlugin],
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              tooltip: {
                mode: 'index', intersect: false,
                // After today the actual line has no value: show the planned line's point instead.
                filter: item => item.datasetIndex === (burnValues[item.dataIndex] == null ? 1 : 0),
                displayColors: false,
                callbacks: {
                  label: context => {
                    const i = context.dataIndex;
                    const future = burnValues[i] == null;
                    const lines = ['── Hours ──────────────────'];
                    if (!future && budget !== null) {
                      lines.push(`  Consumed:   ${fmtH(Math.max(0, budget - burnValues[i]))}`);
                      lines.push(`  Remaining:  ${fmtH(Math.max(0, burnValues[i]))}`);
                    } else if (!future) {
                      lines.push(`  Consumed:   ${fmtH(burnValues[i])}`);
                    }
                    if (idealValues) lines.push(`  Planned:    ${fmtH(idealValues[i])}`);
                    const budgetLines = [];
                    if (tooltipBudgetConsumed && !future) {
                      const consumed = tooltipBudgetConsumed[i] ?? 0;
                      budgetLines.push(`  Consumed:   ${window.formatMoney(consumed, currencyForChart, window.__currencies)}`);
                      budgetLines.push(`  Remaining:  ${window.formatMoney(totalBudgetEur - consumed, currencyForChart, window.__currencies)}`);
                    }
                    if (tooltipBudgetConsumed && hasPhasingEur && tooltipPhasingEur?.[i] != null) budgetLines.push(`  Planned:    ${window.formatMoney(tooltipPhasingEur[i], currencyForChart, window.__currencies)}`);
                    if (budgetLines.length) lines.push('', '── Budget ─────────────────', ...budgetLines);
                    return lines;
                  },
                },
              },
              legend: { display: false },
            },
            scales: {
              x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
              y: { beginAtZero: true },
            },
          },
        });
      },
      monthState(ym, today) { return monthState(ym, today); },
      // Built from monthlySummary, not from the rendered table (B-075): numbers stay numbers, the
      // "current" pill and the future months' "—" are not exported.
      exportMonthlyXls() {
        const ms = this.monthlySummary;
        if (!ms) return;
        const cur = this.dashCurrency, hasCfg = !!this.dashboardProject;
        const digits = currencyInfo(cur, this.currencies).digits;
        const h = v => (v == null ? '' : Math.round(v * 100) / 100);
        const money = v => (v == null ? '' : Number(v.toFixed(digits)));
        const head = ['Month', 'Planned hours (resource plan)', 'Consumed h', 'Hours variance', `Est. budget (${cur})`, `Spent (${cur})`, `Budget variance (${cur})`];
        if (ms.hasPtc) head.push(`PTC (${cur})`);
        const aoa = [head];
        ms.months.forEach(m => {
          const future = monthState(m.ym, this.reportToday) === 'future';
          const line = [m.label, hasCfg ? h(m.estimatedHours) : '', future ? '' : h(m.hours), future ? '' : h(m.hVar),
            hasCfg ? money(m.estimated) : '', future ? '' : money(m.spent), future ? '' : money(m.bVar)];
          if (ms.hasPtc) line.push(m.ptc > 0 ? money(m.ptc) : '');
          aoa.push(line);
        });
        const total = ['Total', h(ms.totEstimatedHours), h(ms.totHours), h(ms.totHoursVariance), money(ms.totEstimated), money(ms.totSpent), money(ms.totBudgetVariance)];
        if (ms.hasPtc) total.push(money(ms.totPtc));
        aoa.push(total);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Data');
        XLSX.writeFile(wb, 'monthly_summary.xlsx');
      },
      exportChartPng() {
        if (!this._burndownChart) return;
        const a = document.createElement('a');
        a.href = this._burndownChart.toBase64Image('image/png', 1);
        a.download = `burndown_${this.dashboardProjectId || 'chart'}.png`;
        a.click();
      },
    },
    watch: {
      burndownInterval() { this.renderBurndownChart(); },
      burndownTaskFilter() { this.renderBurndownChart(); },
      progressView(v) {
        if (v === 'burndown') this.$nextTick(() => this.renderBurndownChart());
        else if (this._burndownChart) { this._burndownChart.destroy(); this._burndownChart = null; }
      },
      portfolioLayout(v) {
        // Card and List keep their own expansion state (one open vs. many); this carries
        // it across when the layout switches, so a program opened in one view is still
        // open in the other. See syncExpansionOnLayoutChange for the asymmetric mapping.
        const next = syncExpansionOnLayoutChange(v, this.expandedProgramId, [...this.listExpandedPrograms]);
        this.expandedProgramId = next.expandedProgramId;
        this.listExpandedPrograms = new Set(next.listExpandedIds);
        this.attachCardGridObserver();
      },
      refreshTick() { this.attachCardGridObserver(); this.pruneEntryFilters(); },
      filterRange() { this.pruneEntryFilters(); },
      breakdownView() { if (this.openMenu && this.openMenu.startsWith('filter:')) this.closeMenu(false); },
      // The grid container only exists while view === 'overview' (showDashboard swaps the whole
      // template out); without this, returning from the dashboard (or landing on it first via
      // ?projectId= and then going "back to portfolio") leaves gridColumns stuck at its last value.
      view() { this.attachCardGridObserver(); },
    },
  }).component('ph-icon', window.PhIcon).component('cg-date-picker', window.CgDatePicker).component('pr-entries', PrEntries).mount('#app');
