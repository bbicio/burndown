
  Vue.createApp({
    data() {
      return {
        formatMoney: window.formatMoney,
        headerBadge: window.headerBadge,
        currencies: [],
        loading: true,
        programId: null,
        program: null,
        children: [],
        today: new Date(),
        layout: 'list',
        attentionFilter: false,
      };
    },
    computed: {
      deps() {
        return { findRate, billableTasks, billableData, pipelineBudget: getPipelineBudget, today: this.today };
      },
      metricsList() {
        return this.children.map(cfg => {
          const rows = timesheetData.filter(r => r.projectId === cfg.id);
          return { id: cfg.id, cfg, rows, metrics: projectMetrics(cfg, rows, this.deps) };
        });
      },
      rangeData() { return programRange(this.children); },
      currency() { return programCurrency(this.children); },
      totals() { return programTotals(this.metricsList.map(m => m.metrics)); },
      timeElapsedData() { return timeElapsed(this.rangeData, this.metricsList.map(m => m.metrics), this.today); },
      programVsTime() {
        return (this.totals.consumptionPct !== null && this.timeElapsedData.pct !== null)
          ? this.totals.consumptionPct - this.timeElapsedData.pct
          : null;
      },
      attentionEntries() {
        return this.metricsList.map(m => ({ id: m.id, name: m.cfg.name, status: m.cfg.status, metrics: m.metrics, endYm: m.cfg.endDate }));
      },
      attention() { return needsAttention(this.attentionEntries, { consumption: 85, vsTime: 10 }); },
      attentionWorstName() {
        const id = this.attention.ids[0];
        const entry = this.attentionEntries.find(e => e.id === id);
        return entry ? (entry.name || entry.id) : '';
      },
      rows() {
        const raw = this.metricsList.map(m => ({ id: m.id, cfg: m.cfg, metrics: m.metrics, flagged: this.attention.ids.includes(m.id) }));
        return sortProjectRows(raw, this.attention.ids);
      },
      visibleRows() {
        return this.attentionFilter ? this.rows.filter(r => r.flagged) : this.rows;
      },
      timelineBarsData() { return timelineBars(this.rangeData, this.visibleRows); },
      burndownSeries() {
        const projects = this.metricsList.map(m => ({ cfg: m.cfg, rows: m.rows }));
        return programBurndown(this.rangeData, projects, this.deps);
      },
      todayPct() { return todayPosition(this.rangeData, this.today); },
      // The label column is a fixed 220px; the track beyond it is the remaining width —
      // calc() lets one percentage (0-100, from todayPosition) place a single marker
      // correctly against that mixed px+% layout without knowing the rendered width in JS.
      timelineTodayLeft() {
        if (this.todayPct === null) return null;
        return `calc(220px + (100% - 220px) * ${(this.todayPct / 100).toFixed(4)})`;
      },
      domPipeline() {
        const pipelines = this.children.map(c => getProjectPipeline(c.id) || c.pipeline).filter(Boolean);
        return pipelines.length ? pipelines[0] : '';
      },
      domClientName() {
        const ids = this.children.map(c => c.clientId).filter(c => c && c !== '__unassigned__');
        return ids.length ? getClientName(ids[0]) : '';
      },
      metaLine() {
        const parts = [];
        if (this.domClientName) parts.push(this.domClientName);
        parts.push(`${this.children.length} project${this.children.length === 1 ? '' : 's'}`);
        if (this.rangeData) parts.push(`${this.fmtMonthFull(this.rangeData.startYm)} – ${this.fmtMonthFull(this.rangeData.endYm)}`);
        if (this.currency) parts.push(this.currency);
        return parts.join(' · ');
      },
    },
    async created() {
      this._burndownChart = null;

      const user = await initNav('portfolio', { breadcrumbs: [
        { label: 'Home', href: '/pipeline.html' },
        { label: 'Portfolio', href: '/portfolio.html' },
      ]});
      if (!user) return;

      const params = new URLSearchParams(window.location.search);
      this.programId = params.get('programId');
      // programs.id is a free-form code (e.g. "HITA.000001823"), not a UUID — unlike
      // projects.id/clients.id. Presence + an existence lookup below is the real check.
      if (!this.programId) {
        window.location.href = '/portfolio.html?notice=program-not-found';
        return;
      }

      await Promise.all([loadClientsFromApi(), loadProgramsFromApi(), loadCurrenciesFromApi()]);
      this.currencies = window.__currencies || [];
      await Promise.all([loadConfigFromApi(), refreshTimesheetDataFromApi(), loadPipelineBudgetsFromApi()]);

      this.program = getPrograms().find(p => p.id === this.programId) || null;
      if (!this.program) {
        window.location.href = '/portfolio.html?notice=program-not-found';
        return;
      }

      this.children = (config.projects || [])
        .filter(p => p.id && p.programId === this.programId)
        .sort((a, b) => (a.id || '').localeCompare(b.id || ''));

      this.today = new Date();
      this.loading = false;

      if (typeof updateBreadcrumbs === 'function') updateBreadcrumbs([
        { label: 'Home', href: '/pipeline.html' },
        { label: 'Portfolio', href: '/portfolio.html' },
        { label: this.program.name },
      ]);

      this.$nextTick(() => this.renderBurndownChart());
    },
    methods: {
      getClientName,
      getProjectPipeline,
      statusBadgeLarge,
      fmtH,
      spentPercent,
      spentBarState,
      openShareModal,
      fmtMonthFull(ym) {
        return new Date(parseInt(ym.slice(0, 4), 10), parseInt(ym.slice(4, 6), 10) - 1, 1)
          .toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      },
      fmtMonthShort(ym) {
        return new Date(parseInt(ym.slice(0, 4), 10), parseInt(ym.slice(4, 6), 10) - 1, 1)
          .toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      },
      // D10: red past +10pt, green past -10pt, neutral between. A project that hasn't
      // started yet always shows '—' (Review Focus 5) rather than a misleading 0pt.
      fmtVsTime(metrics) {
        if (!metrics.started || metrics.vsTime === null) return '—';
        return (metrics.vsTime > 0 ? '+' : '') + metrics.vsTime + ' pt';
      },
      vsTimeClass(metrics) {
        if (!metrics.started || metrics.vsTime === null) return '';
        if (metrics.vsTime > 10) return 'pg-vstime-danger';
        if (metrics.vsTime < -10) return 'pg-vstime-success';
        return '';
      },
      goPortfolio() { window.location.href = '/portfolio.html'; },
      goProjectReporting(id) { window.location.href = '/portfolio.html?projectId=' + encodeURIComponent(id); },
      toggleAttentionFilter() {
        if (!this.attention.ids.length) return;
        this.attentionFilter = !this.attentionFilter;
      },
      // Chart.js cannot resolve var(); read the token's computed value instead.
      chartColor(name, fallback) {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
      },
      renderBurndownChart() {
        if (this._burndownChart) { this._burndownChart.destroy(); this._burndownChart = null; }
        if (!this.rangeData || !this.$refs.burndownCanvas) return;

        const { labels, actual, planned, todayIndex, todayRemaining } = this.burndownSeries;
        const datasets = [{
          label: 'Remaining hours (actual)',
          data: actual,
          borderColor: this.chartColor('--chart-actual', 'gray'), backgroundColor: 'rgba(13,110,253,0.07)',
          fill: true, tension: 0.2, pointRadius: 0, pointHoverRadius: 4,
        }];
        if (planned) {
          datasets.push({
            label: 'Remaining hours planned (phasing)',
            data: planned,
            borderColor: this.chartColor('--chart-phasing', 'gray'), borderDash: [6, 4], borderWidth: 2,
            fill: false, pointRadius: 0, tension: 0,
          });
        }
        if (todayIndex !== null) {
          datasets[0].pointRadius = labels.map((_, i) => i === todayIndex ? 5 : 0);
          datasets[0].pointBackgroundColor = this.chartColor('--brand-navy', 'navy');
        }

        const todayLabelPlugin = window.todayLabelPlugin({
          id: 'pgTodayLabel',
          index: todayIndex,
          text: todayIndex !== null ? `${fmtH(todayRemaining)} left · ${labels[todayIndex]}` : '',
          bg: this.chartColor('--brand-navy', 'navy'),
          fg: this.chartColor('--surface-white', 'white'),
        });

        this._burndownChart = new Chart(this.$refs.burndownCanvas, {
          type: 'line',
          data: { labels, datasets },
          plugins: [todayLabelPlugin],
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                // After today the actual line has no value: show the planned line's point instead.
                mode: 'index', intersect: false, filter: item => item.datasetIndex === (actual[item.dataIndex] == null ? 1 : 0),
                callbacks: {
                  label: context => context.datasetIndex === 0 ? `${fmtH(context.raw)} left` : `Planned: ${fmtH(context.raw)} left`,
                  afterLabel: context => context.dataIndex === todayIndex ? `Today · ${fmtH(todayRemaining)} left` : '',
                },
              },
            },
            scales: {
              x: { ticks: { maxRotation: 0, autoSkip: true } },
              y: { beginAtZero: true, title: { display: true, text: 'Hours' } },
            },
          },
        });
      },
      exportBurndownPng() {
        if (!this._burndownChart) return;
        const a = document.createElement('a');
        a.href = this._burndownChart.toBase64Image('image/png', 1);
        a.download = `program-burndown-${(this.program?.name || 'program')}.png`;
        a.click();
      },
    },
  }).component('ph-icon', window.PhIcon).mount('#app');
