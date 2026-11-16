
  const app = Vue.createApp({
    data() {
      return {
        ready: false,
        formatMoney: window.formatMoney,
        currencies: [],
        rows:  [],
        error: null,
        modal: { show: false, loading: false, code: '', rows: [], currency: null },
        pipelineYears: [],
        filters: { year: 0, clients: [], projects: [], code: '' }, // year 0 = "All years"
        sort: { sortBy: null, sortDir: 'asc' },
        collapsed: {},          // client group key → true; session only, never persisted
        sheetOpen: false,       // phone: the Client / Project / year bottom sheet
      };
    },
    computed: {
      clientOptions() { return filterOptions(this.rows, 'client_name'); },
      projectOptions() { return filterOptions(this.rows, 'project_name'); },
      filteredRows() { return filterTimesheetRows(this.rows, this.filters); },
      groups() { return groupTimesheetRows(this.filteredRows, this.sort); },
      filtersOn() { return hasActiveFilters(this.filters); },
      sheetCount() {
        const f = this.filters;
        return (f.clients.length ? 1 : 0) + (f.projects.length ? 1 : 0) + (f.year !== 0 ? 1 : 0);
      },
    },
    async created() {
      const user = await initNav('timesheets', { breadcrumbs: [
        { label: 'Home', href: '/pipeline.html' },
        { label: 'Timesheets' },
      ]});
      if (!user) return;
      if (!['admin', 'sysadmin'].includes(user.role)) { window.location.href = '/pipeline.html'; return; }
      const [pipelineYearsResult, currenciesResult] = await Promise.allSettled([
        Api.pipelineYears.list(),
        Api.currencies.active(),
        this.loadRows(),
      ]);
      this.pipelineYears = pipelineYearsResult.status === 'fulfilled' ? pipelineYearsResult.value : [];
      window.__currencies = currenciesResult.status === 'fulfilled'
        ? currenciesResult.value
        : [{ code: 'EUR', symbol: '€', locale: 'it-IT' }];
      this.currencies = window.__currencies;
      const currentYear = new Date().getFullYear();
      const hasCurrentYear = this.pipelineYears.some(py => py.year === currentYear);
      this.filters.year = hasCurrentYear ? currentYear
        : (this.pipelineYears.length ? this.pipelineYears[0].year : 0);
      this.ready = true;
      this.loadProfileQueueCount();   // badge only: not awaited, never blocks the page
      // Capture phase, before Bootstrap's handler hides the menu: was a dropdown really open for this Esc?
      document.addEventListener('keydown', e => { this._escForDropdown = e.key === 'Escape' && !!document.querySelector('.dropdown-menu.show'); }, true);
      document.addEventListener('keydown', this.onKeydown);
      // leaving the phone breakpoint turns the sheet back into the inline filters row
      const phone = window.matchMedia('(max-width: 767.98px)');
      phone.addEventListener('change', q => { if (!q.matches && this.sheetOpen) this.closeSheet(); });
    },
    methods: {
      // One GET /api/profile-jobs for the sub-nav badge; any failure hides it.
      async loadProfileQueueCount() {
        try {
          const res = await fetch('/api/profile-jobs', { credentials: 'same-origin' });
          if (!res.ok) throw new Error();
          const n = Number((await res.json()).queuedCount) || 0;
          setSubnavBadge('profileJobs', n, n + ' project code' + (n === 1 ? '' : 's') + ' waiting for profile processing');
        } catch { setSubnavBadge('profileJobs', 0); }
      },
      toggleSort(field) { this.sort = nextSortState(this.sort, field); },
      toggleGroup(key) { this.collapsed = { ...this.collapsed, [key]: !this.collapsed[key] }; },
      groupMeta(g) {
        return `${g.codes} code${g.codes === 1 ? '' : 's'} · ${this.fmtCount(g.totalRows)} rows`;
      },
      resetFilters() {
        this.filters = { year: 0, clients: [], projects: [], code: '' };
      },
      openSheet() {
        this._sheetReturn = document.activeElement;
        this.sheetOpen = true;
        this.$nextTick(() => { const c = document.querySelector('.ts-filter-set.is-open .ts-close'); if (c) c.focus(); });
      },
      closeSheet() {
        this.sheetOpen = false;
        this.$nextTick(() => { if (this._sheetReturn && this._sheetReturn.focus) this._sheetReturn.focus(); });
      },
      onKeydown(e) {
        if (document.querySelector('.modal.show')) return;
        if (e.key === 'Escape') {
          // Bootstrap closes a dropdown on Esc only when the event comes from its toggle or menu
          if (this._escForDropdown && e.target.closest && e.target.closest('.dropdown-menu, [data-bs-toggle="dropdown"]')) return;
          if (this.modal.show) this.closeView();
          else if (this.sheetOpen) this.closeSheet();
          return;
        }
        if (e.key !== 'Tab') return;
        // Tab stays inside the open View modal, or else inside the open phone Filters sheet
        const box = this.modal.show ? document.querySelector('.ts-view')
          : this.sheetOpen ? document.querySelector('.ts-filter-set.is-open') : null;
        const items = box ? [...box.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
          .filter(el => el.offsetParent !== null) : [];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
      },
      closeView() {
        this.modal.show = false;
        this.$nextTick(() => { if (this._returnFocus && this._returnFocus.focus) this._returnFocus.focus(); });
      },
      async loadRows() {
        this.error = null;
        try {
          this.rows = await Api.timesheets.list();
        } catch (e) {
          this.error = e.message || 'Failed to load timesheets.';
        }
      },
      deleteCode(row) {
        if (row._loading) return;
        const code = row.project_code;
        showConfirm(`Delete ALL timesheet data for project "${code}"?\n\nThis removes ${row.uploads} upload${row.uploads !== 1 ? 's' : ''} (${this.fmtCount(row.total_rows)} rows). This cannot be undone.`,
          async () => {
            if (row._loading) return;
            row._loading = true;
            this.error = null;
            try {
              await Api.timesheets.delete(code);
              this.rows = this.rows.filter(r => r !== row);
              await this.loadRows();
            } catch (e) {
              this.error = e.message || 'Delete failed.';
              row._loading = false;
            }
          }, null, 'Delete actuals');
      },
      async viewRows(r) {
        this._returnFocus = document.activeElement;
        this.modal = { show: true, loading: true, code: r.project_code, rows: [], currency: r.currency || null };
        this.$nextTick(() => { const c = document.querySelector('.ts-view .ts-close'); if (c) c.focus(); });
        try {
          const records = await Api.timesheets.get(r.project_code);
          // each record has a .data array; flatten all uploads
          const flat = records.flatMap(rec => rec.data || []);
          flat.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
          this.modal.rows = flat;
        } catch (e) {
          this.error = e.message || 'Failed to load rows.';
          this.modal.show = false;
        } finally {
          this.modal.loading = false;
        }
      },
      async downloadXlsx(r) {
        if (r._downloading) return;
        r._downloading = true;
        const code = r.project_code;
        try {
          const records = await Api.timesheets.get(code);
          const flat = records.flatMap(rec => rec.data || []);
          flat.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
          const wb = new ExcelJS.Workbook();
          const ws = wb.addWorksheet(code);
          const header = ['Date', 'Owner', 'Role', 'Task', 'Hours', 'Notes', 'Fee', 'Spent'];
          ws.addRow(header).font = { bold: true };
          flat.forEach(row => {
            const fee = row.fee || 0;
            ws.addRow([row.date, row.owner, row.role, row.task, row.hours,
                       row.notes, fee, fee * (row.hours || 0)]);
          });
          ws.columns = [
            { width: 12 }, { width: 20 }, { width: 18 }, { width: 24 },
            { width: 10 }, { width: 30 }, { width: 12 }, { width: 12 },
          ];
          ws.views = [{ state: 'frozen', ySplit: 1 }];
          const buffer = await wb.xlsx.writeBuffer();
          const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = this.buildXlsxFilename(r);
          a.click();
          // Deferred: some browsers (Safari, older Firefox/Chromium) process the
          // click-to-download hand-off asynchronously — revoking synchronously can
          // invalidate the blob before the download actually starts.
          setTimeout(() => URL.revokeObjectURL(a.href), 0);
        } catch (e) {
          this.error = e.message || 'Export failed.';
        } finally {
          r._downloading = false;
        }
      },
      fmtCount(n) { return (Number(n) || 0).toLocaleString('en-US'); },
      fmtDate(iso) {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      },
      // Filesystem-safe filename part: spaces become '-', characters invalid in
      // Windows/macOS filenames are stripped (client/project names are free text
      // and can contain ':', '/', etc. — e.g. "NH-26-...:AnnualUpdate").
      sanitizeForFilename(s) {
        return String(s || '').trim().replace(/\s+/g, '-').replace(/[\\/:*?"<>|]/g, '');
      },
      buildXlsxFilename(r) {
        const client = this.sanitizeForFilename(r.client_name || 'NoClient');
        const project = this.sanitizeForFilename(r.project_name || 'NoProject');
        const code = this.sanitizeForFilename(r.project_code);
        const now = new Date();
        const yyyymmdd = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
        return `${client}_${project}_${code}_${yyyymmdd}.xlsx`;
      },
    },
  });
  app.component('ph-icon', window.PhIcon);
  app.mount('#app');
