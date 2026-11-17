
  const BLANK_PROJECT = () => ({
    id: '', code: '', name: '', description: '', startDate: '', endDate: '', currency: 'EUR',
    pipeline: '', status: '', tasks: [], phasing: {}, planning: {},
    ptc: [], groups: [], costGridRef: null, programId: null,
    clientId: '__unassigned__', my_permission: 'owner',
  });

  Vue.createApp({
    data() {
      return {
        ready: false,
        currencies: [],
        formatMoney: window.formatMoney,
        moneyFormatExample: window.moneyFormatExample,
        rateInvalid: {},
        ptcInvalid: {},
        phasingInvalid: {},
        notFound: false,
        project: null,
        isNewProject: false,
        savedSnapshot: null,
        jsonError: '',
        attributeLists: [],
        projectTags: [],
        tagSaving: false,
        saving: false,
        clientModal: { name: '', error: '', saving: false },
        programModal: { name: '', id: '', error: '', saving: false },
        confirmModal: { message: '', infoMode: false },
        reforecastVisible: false,
        actuals: { info: 'Save the project first to enable actuals upload.', status: '', statusClass: '', exportRows: null, guardMsg: '', deleting: false },
        tasksXlsxError: '',
        phasingActionError: '',
        headerBadge: window.headerBadge,
        openTaskIndex: null,
        activeSection: 'client',
        phasingMode: 'budget',
        tagsCollapsed: true,
        isPhone: false,
        mobileSection: 'client',
      };
    },
    computed: {
      isViewer() {
        return this.project?.my_permission === 'viewer';
      },
      isDirty() { return window.isProjectDirty(this.savedSnapshot, this.project); },
      // The section index, in page order; Tags exists only for a saved project.
      sections() {
        const all = [
          { key: 'client', label: 'Client & program', optional: false },
          { key: 'info', label: 'Project info', optional: false },
          { key: 'actuals', label: 'Actuals', optional: false },
          { key: 'tasks', label: 'Tasks & resources', optional: false },
          { key: 'phasing', label: 'Monthly phasing', optional: false },
          { key: 'ptc', label: 'Pass-through costs', optional: true },
          { key: 'groups', label: 'Functional groups', optional: true },
          { key: 'tags', label: 'Tags', optional: true },
        ];
        return this.isNewProject ? all.filter(x => x.key !== 'tags') : all;
      },
      // The single warning of the task table: tasks with months whose split is not valid.
      splitWarning() {
        const tasks = this.project?.tasks || [];
        const n = tasks.filter(t => { const ms = this.taskMonthRange(t); return ms.length && !window.splitState(t.monthlyDistribution, ms).valid; }).length;
        return { n, m: tasks.length };
      },
      currencySymbol() { return window.currencyInfo(this.project?.currency, this.currencies).symbol; },
      // Months (YYYYMM) present in the loaded actuals; the upload stores ISO dates, Reforecast reads them the same way.
      actualMonths() {
        const set = new Set();
        (this.actuals.exportRows || []).forEach(r => { if (r && typeof r.date === 'string' && r.date) set.add(r.date.slice(0, 7).replace('-', '')); });
        return set;
      },
      currentYm() {
        const now = new Date();
        return now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0');
      },
      // One bar per project month for the series on screen, scaled on its largest month.
      phasingBars() {
        const src = (this.phasingMode === 'hours' ? this.project?.planning : this.project?.phasing) || {};
        const months = this.projectMonths;
        const max = Math.max(0, ...months.map(ym => src[ym] || 0));
        return months.map(ym => ({
          ym, value: src[ym] || 0, pct: max > 0 ? Math.round((src[ym] || 0) / max * 100) : 0,
          past: this.actualMonths.has(ym), current: ym === this.currentYm,
        }));
      },
      phasingStatus() {
        const hours = this.phasingMode === 'hours';
        const sum = hours ? this.planningSum : this.phasingSum;
        const total = hours ? this.distributedHours : this.distributedBudget;
        const b = window.phasingBalance(sum, total, hours ? 2 : this.currencyDigits, this.projectMonths.length);
        const fmt = v => hours ? (v > 0 ? this.cfgFmtHours(v) : '0') + 'h' : this.formatMoney(v, this.project.currency, this.currencies);
        const tail = b.balanced ? 'balanced' : b.diff > 0 ? fmt(b.diff) + ' to allocate' : fmt(-b.diff) + ' over';
        return { balanced: b.balanced, text: fmt(sum) + ' of ' + fmt(total) + ' · ' + tail };
      },
      phonePickerIssue() { return this.sectionIssues[this.mobileSection] || null; },
      mobileSectionIndex() {
        return Math.max(0, this.sections.findIndex(x => x.key === this.mobileSection));
      },
      currencyDigits() { return window.currencyInfo(this.project?.currency, this.currencies).digits; },
      // Why a section needs attention (the amber dot of the index), or null.
      sectionIssues() {
        const p = this.project;
        const out = { tasks: null, phasing: null, ptc: null };
        if (!p) return out;
        const tasks = p.tasks || [];
        const unsplit = tasks.filter(t => { const ms = this.taskMonthRange(t); return ms.length && !window.splitState(t.monthlyDistribution, ms).valid; }).length;
        if (unsplit) out.tasks = unsplit + ' of ' + tasks.length + ' tasks have no valid monthly split';
        else if (this.outOfPeriod.length) out.tasks = 'Some tasks are outside the project period';
        else if (Object.keys(this.rateInvalid).length) out.tasks = 'Some hourly rates are not valid amounts';
        if (Object.keys(this.phasingInvalid).length) out.phasing = 'Some phasing amounts are not valid';
        else if (this.projectMonths.length && this.distributedBudget > 0) {
          if (!window.phasingBalance(this.phasingSum, this.distributedBudget, this.currencyDigits, this.projectMonths.length).balanced) out.phasing = 'The budget phasing does not add up to the total budget';
          else if (!window.phasingBalance(this.planningSum, this.distributedHours, 2, this.projectMonths.length).balanced) out.phasing = 'The hour planning does not add up to the total hours';
        }
        if (Object.keys(this.ptcInvalid).length) out.ptc = 'Some PTC amounts are not valid';
        return out;
      },
      // Page head sub-line: client · D365 code · period · currency, each part omitted when empty.
      headMeta() {
        const p = this.project;
        if (!p || this.isNewProject) return '';
        const client = p.clientId && p.clientId !== '__unassigned__' ? getClientName(p.clientId) : '';
        const period = p.startDate && p.endDate ? window.formatMonthText(p.startDate) + ' – ' + window.formatMonthText(p.endDate) : '';
        return [client, p.code, period, p.currency].filter(Boolean).join(' · ');
      },
      // Dates C3: tasks that leave the project period, and the notice built from them.
      outOfPeriod() {
        const p = this.project;
        if (!p) return [];
        const tasks = (p.tasks || []).map(t => ({ name: t.name || 'Untitled task', start: t.startDate, end: t.endDate, ref: t }));
        return window.outOfPeriodTasks(tasks, p.startDate, p.endDate, 'project');
      },
      outOfPeriodRefs() { return new Set(this.outOfPeriod.map(o => o.ref)); },
      outOfPeriodMessage() {
        const p = this.project;
        return window.outOfPeriodMessage({ list: this.outOfPeriod, start: p?.startDate, end: p?.endDate, noun: 'project' });
      },
      periodTaskDates() {
        return (this.project?.tasks || []).flatMap(t => [t.startDate, t.endDate]);
      },
      periodStartBounds() { return window.periodBounds(this.periodTaskDates, 'start', this.project?.endDate || ''); },
      periodEndBounds() { return window.periodBounds(this.periodTaskDates, 'end', this.project?.startDate || ''); },
      // Read-only for viewers and for every existing project (amounts are not converted yet); only a brand-new
      // project, reachable again when direct creation is re-enabled, chooses its currency.
      currencyLocked() { return this.isViewer || !this.isNewProject; },
      currencyHint() { return window.PROJECT_RULE_MESSAGES.projectConfigCurrency; },
      currencyOptions() {
        const list = (this.currencies || []).slice();
        const cur = this.project?.currency;
        if (cur && !list.some(cu => cu.code === cur)) list.push({ code: cur, symbol: cur, name: '(inactive)' });
        return list;
      },
      pipelineLocked() {
        return !!(this.project?.costGridRef?.cgId);
      },
      tagsReadOnly() { return this.isViewer; },
      // Closed Tags header: one pill per list with its assigned labels (as costgrid.html).
      tagsSummaryGroups() {
        return this.attributeLists.map(list => {
          const active = (list.items || []).filter(it => this.isTagChecked(it.id)).map(it => it.label);
          const inactive = this.inactiveAssignedForList(list.id).map(row => row.label);
          return { name: list.name, labels: [...active, ...inactive] };
        }).filter(g => g.labels.length);
      },
      statusRule() {
        return this.project ? getStatusRule(this.project.pipeline) : { options: null, disabled: true };
      },
      grandTotalHours() {
        return (this.project?.tasks || []).reduce((s, t) => s + t.resources.reduce((rs, r) => rs + (r.soldHours || 0), 0), 0);
      },
      grandTotalBudget() {
        return (this.project?.tasks || []).reduce((s, t) => s + t.resources.reduce((rs, r) => rs + (r.soldHours || 0) * (r.hourlyRate || 0), 0), 0);
      },
      // The totals Derive/Reforecast distribute (billable tasks only): the phasing balance compares against these.
      distributedBudget() {
        return (this.project?.tasks || []).filter(t => t.billable !== false).reduce((s, t) => s + t.resources.reduce((rs, r) => rs + (r.soldHours || 0) * (r.hourlyRate || 0), 0), 0);
      },
      distributedHours() {
        return (this.project?.tasks || []).filter(t => t.billable !== false).reduce((s, t) => s + t.resources.reduce((rs, r) => rs + (r.soldHours || 0), 0), 0);
      },
      projectMonths() {
        if (!this.project?.startDate || !this.project?.endDate) return [];
        const [sy, sm] = [parseInt(this.project.startDate.slice(0,4)), parseInt(this.project.startDate.slice(4,6))];
        const [ey, em] = [parseInt(this.project.endDate.slice(0,4)), parseInt(this.project.endDate.slice(4,6))];
        const months = [];
        let cy = sy, cm = sm;
        while (cy < ey || (cy === ey && cm <= em)) { months.push(`${cy}${String(cm).padStart(2,'0')}`); cm++; if (cm > 12) { cm = 1; cy++; } }
        return months;
      },
      phasingSum() { return window.sumWithinMonths(this.project?.phasing, this.projectMonths); },
      planningSum() { return window.sumWithinMonths(this.project?.planning, this.projectMonths); },
      totalPtc() { return (this.project?.ptc || []).reduce((s, p) => s + (p.amount || 0), 0); },
    },
    async created() {
      // Below 768px one section at a time; the listener keeps isPhone in step with the window width.
      this._phoneMq = window.matchMedia('(max-width: 767.98px)');
      this._onPhoneChange = e => { this.isPhone = e.matches; };
      this.isPhone = this._phoneMq.matches;
      this._phoneMq.addEventListener('change', this._onPhoneChange);
      // Leave-page warning for unsaved edits (incl. Derive/Reforecast, which only change on-screen values until Save).
      window.addEventListener('beforeunload', e => {
        if (this.isViewer) return;
        if (window.isProjectDirty(this.savedSnapshot, this.project)) {
          e.preventDefault();
          e.returnValue = '';
        }
      });
      const user = await initNav('portfolio', { breadcrumbs: [
        { label: 'Home', href: '/pipeline.html' },
        { label: 'Portfolio', href: '/portfolio.html' },
        { label: '…' },
      ]});
      if (!user) return;

      await Promise.all([loadClientsFromApi(), loadProgramsFromApi(), loadCurrenciesFromApi()]);
      this.currencies = window.__currencies || [];
      await loadConfigFromApi();

      if (config.projects.length === 0 && new URLSearchParams(window.location.search).get('projectId')) {
        await new Promise(r => setTimeout(r, 600));
        await loadConfigFromApi();
      }

      this.resolveProject();
      if (this.project && !this.notFound) this.sanitizeStatus();
      if (this.project && !this.notFound) await this.updateReforecastVisibility();
      if (this.project && !this.notFound) await this.loadActuals();
      if (this.project && !this.notFound && !this.isNewProject) {
        this.attributeLists = await loadActiveAttributeListsForTagging().catch(e => { console.warn('[project-config] loadActiveAttributeListsForTagging:', e.message); return []; });
        await this.loadTags();
      }
      // Snapshot last, after resolveProject's normalisations, so those never count as user edits.
      if (this.project && !this.notFound) this.savedSnapshot = JSON.stringify(this.project);
      this.ready = true;
      if (this.project && !this.notFound) { await this.$nextTick(); this.observeSections(); }
    },
    beforeUnmount() {
      if (this._sectionObserver) this._sectionObserver.disconnect();
      if (this._phoneMq) this._phoneMq.removeEventListener('change', this._onPhoneChange);
    },
    methods: {
      getClients,
      getPrograms,
      // cfgFmtHours/cfgParseHours are bridged from a deferred ES module (js/lib/cfg-parse.js) onto
      // window; a bare shorthand re-export here would evaluate before the module has run (this
      // object literal builds at classic-script parse time), so these wrap the call in a method
      // body instead, which only executes later, once the bridge is guaranteed to exist.
      cfgFmtHours(n) { return window.cfgFmtHours(n); },
      cfgParseHours(s) { return window.cfgParseHours(s); },
      // Index click: scroll the card under the sticky tab bar (below 1024px) plus a margin, with window.scrollTo.
      scrollToSection(key) {
        const el = document.getElementById('pc-sec-' + key);
        if (!el) return;
        this.activeSection = key;
        const index = document.querySelector('.pc-index');
        const tabs = index && window.matchMedia('(max-width: 1023.98px)').matches ? index.offsetHeight : 0;
        const banner = document.querySelector('.pc-viewer-banner');
        const bannerH = banner ? banner.offsetHeight : 0;
        const margin = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - tabs - bannerH - margin, behavior: 'smooth' });
      },
      pickMobileSection(key) {
        this.mobileSection = key;
        this.activeSection = key;
        const el = document.getElementById('pcSectionsSheet');
        if (el) bootstrap.Offcanvas.getOrCreateInstance(el).hide();
        this.$nextTick(() => this.scrollToSection(key));
      },
      // The active index entry follows the first card crossing the upper part of the viewport.
      observeSections() {
        if (!('IntersectionObserver' in window)) return;
        const visible = new Set();
        this._sectionObserver = new IntersectionObserver(entries => {
          entries.forEach(e => { if (e.isIntersecting) visible.add(e.target.dataset.section); else visible.delete(e.target.dataset.section); });
          const first = this.sections.find(x => visible.has(x.key));
          if (first) this.activeSection = first.key;
        }, { rootMargin: '-10% 0px -60% 0px' });
        document.querySelectorAll('.pc-card[data-section]').forEach(el => this._sectionObserver.observe(el));
      },
      resolveProject() {
        const params = new URLSearchParams(window.location.search);
        const projectId = params.get('projectId');
        if (!projectId) {
          if (!window.DIRECT_PROJECT_CREATION_ENABLED) {
            window.location.replace('/portfolio.html?notice=direct-creation-disabled');
            return;
          }
          this.project = BLANK_PROJECT();
          this.isNewProject = true;
          this.updateBreadcrumb('New Project');
          return;
        }
        const found = (config.projects || []).find(
          p => p.id && p.id.trim().toLowerCase() === projectId.trim().toLowerCase()
        );
        if (!found) {
          this.notFound = true;
          return;
        }
        this.project = this.normalizeProject(JSON.parse(JSON.stringify(found)));
        this.isNewProject = false;
        this.updateBreadcrumb(this.project.name || projectId);
      },
      // The normalisations of a loaded project, shared by resolveProject and onDiscard.
      normalizeProject(p) {
        // The API can return monthlyDistribution: null for a task (seen on real data); the Monthly %
        // distribution grid's v-model writes directly into task.monthlyDistribution[ym], which throws
        // if the object itself is null. Normalize once here, matching the same default the "+ Add task"
        // button already uses for brand-new tasks.
        (p.tasks || []).forEach(t => { if (!t.monthlyDistribution) t.monthlyDistribution = {}; });
        (p.tasks || []).forEach(t => { if (typeof t.description !== 'string') t.description = ''; });
        if (typeof p.description !== 'string') p.description = '';
        // Legacy groups only had roles: string[] (no task association) -- seed
        // entries: [{role, task: ''}] (wildcard = "any task", matching the old
        // behavior) so this form can bind directly to grp.entries[].role/.task.
        // Mirrors js/lib/portfolio-calc.js's normalizeGroupEntries(), duplicated
        // here rather than shared: this is a one-time UI-seeding convenience, not
        // the correctness-critical path (that's portfolio.html's own summary
        // aggregation, which calls the real js/lib function).
        (p.groups || []).forEach(g => { if (!g.entries || !g.entries.length) g.entries = (g.roles || []).map(role => ({ role, task: '' })); });
        return p;
      },
      // Back to the last saved state; tags, actuals and new clients/programs are saved at once and stay as they are.
      async onDiscard() {
        if (this.saving || !this.isDirty) return;
        if (!(await this.showConfirm('Discard all unsaved changes?'))) return;
        this.project = this.normalizeProject(JSON.parse(this.savedSnapshot));
        this.phasingInvalid = {};
        this.ptcInvalid = {};
        this.rateInvalid = {};
        this.openTaskIndex = null;
      },
      async loadTags() {
        try {
          this.projectTags = await Api.projects.tags.list(this.project.id);
        } catch (e) {
          console.warn('[project-config] loadTags:', e.message);
          this.projectTags = [];
        }
      },
      isTagChecked(itemId) {
        return this.projectTags.some(t => t.item_id === itemId);
      },
      // An assigned tag whose item was later deactivated stays assigned (per spec) but
      // no longer appears in `attributeLists` (active items only) — render it separately
      // so it stays visible and removable.
      inactiveAssignedForList(listId) {
        return this.projectTags.filter(t => t.list_id === listId && t.status !== 'active');
      },
      async toggleTag(itemId, event) {
        if (this.tagsReadOnly) return;
        // In-flight guard: the checkbox is also :disabled while tagSaving is true, so this
        // is a defense-in-depth fallback for the brief window before Vue re-renders that
        // disabled state. The native checkbox has already visually flipped by the time
        // @change fires — if we're bailing out, flip it back so it doesn't show a state
        // that was never applied to projectTags or saved.
        if (this.tagSaving) { if (event) event.target.checked = !event.target.checked; return; }
        const newIds = this.isTagChecked(itemId)
          ? this.projectTags.filter(t => t.item_id !== itemId).map(t => t.item_id)
          : [...this.projectTags.map(t => t.item_id), itemId];
        this.tagSaving = true;
        try {
          await Api.projects.tags.replace(this.project.id, newIds, { background: true });
          await this.loadTags();
        } catch (e) {
          console.warn('[project-config] toggleTag:', e.message);
        } finally {
          this.tagSaving = false;
        }
      },
      // Not persisted: Tags opens closed on every visit.
      toggleTagsCollapsed() {
        this.tagsCollapsed = !this.tagsCollapsed;
      },
      focusRef(name) {
        this.$nextTick(() => {
          const ref = this.$refs[name];
          (Array.isArray(ref) ? ref[0] : ref)?.focus();
        });
      },
      updateBreadcrumb(label) {
        if (typeof updateBreadcrumbs === 'function') {
          updateBreadcrumbs([
            { label: 'Home', href: '/pipeline.html' },
            { label: 'Portfolio', href: '/portfolio.html' },
            { label },
          ]);
        }
      },
      onNameInput() {
        this.updateBreadcrumb(this.project.name.trim() || 'New Project');
      },
      onPipelineChange() {
        this.sanitizeStatus();
      },
      sanitizeStatus() {
        const rule = getStatusRule(this.project.pipeline);
        if (rule.options && !rule.options.includes(this.project.status)) {
          this.project.status = '';
        }
      },
      monthLabelLong(ym) {
        const [y, m] = [parseInt(ym.slice(0,4)), parseInt(ym.slice(4,6))];
        return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      },
      addPtc() {
        this.project.ptc.push({ title: '', note: '', amount: 0, month: this.projectMonths[0] || '' });
        this.focusRef('ptcTitle-' + (this.project.ptc.length - 1));
      },
      async confirmRemovePtc(pi) {
        const title = this.project.ptc[pi].title.trim() || 'this entry';
        if (await this.showConfirm(`Remove PTC "${title}"?`)) {
          this.project.ptc.splice(pi, 1);
          this.dropPtcInvalid(pi);
        }
      },
      addGroup() {
        this.project.groups.push({ name: '', entries: [] });
        this.focusRef('groupName-' + (this.project.groups.length - 1));
      },
      addGroupEntry(gi) {
        this.project.groups[gi].entries.push({ role: '', task: '' });
      },
      // A plain Vue method, not an inline `@click="window.location...` expression: a
      // compiled Vue template does not reliably fall back to a bare `window` global from
      // inside its own `with()` block (the same landmine already fixed elsewhere in this
      // codebase, e.g. pipeline.html/costgrid.html's openShareModal) — only a real method
      // body, called via `@click="goProjectDashboard"`, resolves `window` normally.
      goProjectDashboard() {
        window.location.href = '/portfolio.html?projectId=' + this.project.id;
      },
      async loadActuals() {
        if (!this.project.code) { this.actuals.info = 'Save the project first to enable actuals upload.'; return; }
        this.actuals.info = 'Loading…';
        try {
          const rows = await Api.timesheets.get(this.project.code);
          if (!rows || !rows.length) {
            this.actuals.info = `<span class="text-muted">No actuals uploaded for project <code>${esc(this.project.code)}</code>.</span>`;
            this.actuals.exportRows = null;
            return;
          }
          const row = rows[0];
          const dt = row.uploaded_at ? new Date(row.uploaded_at).toLocaleString('en-GB', { dateStyle:'medium', timeStyle:'short' }) : '—';
          const cnt = row.row_count ?? 0;
          const approxKb = row.data ? Math.round(JSON.stringify(row.data).length / 1024) : '?';
          this.actuals.info = `Last upload: <strong>${esc(dt)}</strong> &nbsp;·&nbsp; <strong>${cnt}</strong> rows &nbsp;·&nbsp; ~${approxKb} KB`;
          this.actuals.exportRows = row.data;
        } catch (e) {
          this.actuals.info = `<span class="text-danger">Could not load actuals: ${esc(e.message)}</span>`;
        }
      },
      openActualsViewModal() {
        bootstrap.Modal.getOrCreateInstance(document.getElementById('actualsViewModal')).show();
      },
      // Sets a transient actuals-section status message (success or error) that
      // auto-clears after `ms` — used for every actuals status EXCEPT the
      // "Uploading…" in-progress message, which is meant to be overwritten by
      // the success/failure message right after, not to auto-clear on its own.
      // Cancels any previously-scheduled clear first, so two flashes within `ms`
      // of each other don't have the first one's timer wipe the second's message.
      flashActualsStatus(message, cls, ms = 4000) {
        clearTimeout(this._actualsStatusTimer);
        this.actuals.status = message;
        this.actuals.statusClass = cls;
        this._actualsStatusTimer = setTimeout(() => { this.actuals.status = ''; }, ms);
      },
      async downloadActualsXlsx() {
        if (typeof ExcelJS === 'undefined') {
          this.flashActualsStatus('Export library not available.', 'text-danger');
          return;
        }
        try {
          const rows = this.actuals.exportRows || [];
          const wb = new ExcelJS.Workbook();
          const ws = wb.addWorksheet(this.project.code || 'Actuals');
          ws.addRow(['Date', 'Owner', 'Role', 'Task', 'Hours', 'Notes', 'Fee', 'Spent']).font = { bold: true };
          rows.forEach(r => {
            const fee = r.fee || 0;
            ws.addRow([r.date, r.owner, r.role, r.task, r.hours, r.notes, fee, fee * (r.hours || 0)]);
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
          a.download = this.buildActualsFilename();
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 0);
        } catch (e) {
          this.flashActualsStatus(`Export failed: ${e.message}`, 'text-danger');
        }
      },
      buildActualsFilename() {
        const sanitize = s => String(s || '').trim().replace(/\s+/g, '-').replace(/[\\/:*?"<>|]/g, '');
        const client = sanitize(getClientName(this.project.clientId) || 'NoClient');
        const proj = sanitize(this.project.name || 'NoProject');
        const code = sanitize(this.project.code);
        const now = new Date();
        const yyyymmdd = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
        return `${client}_${proj}_${code}_${yyyymmdd}.xlsx`;
      },
      async onActualsFileChange(e) {
        const file = e.target.files[0];
        if (!file) return;
        this.actuals.guardMsg = '';
        if (!this.project.code) { this.actuals.guardMsg = 'Set the D365 Project ID first before uploading actuals.'; return; }
        clearTimeout(this._actualsStatusTimer); // cancel any pending clear from a prior action's flash
        this.actuals.status = 'Uploading…'; this.actuals.statusClass = 'text-muted';
        try {
          const result = await Api.timesheets.upload(file, this.project.code);
          this.actuals.status = `Uploaded ${result.totalRows} rows.`; this.actuals.statusClass = 'text-success';
          await this.loadActuals();
          await this.updateReforecastVisibility();
          // Start the 4s auto-clear only now, after the reload settles — starting it
          // right after upload (like flashActualsStatus does) would race the reload
          // and could clear the message before the user ever sees it confirmed.
          this._actualsStatusTimer = setTimeout(() => { this.actuals.status = ''; }, 4000);
        } catch (err) {
          if (err.data && err.data.inconsistencies) {
            this.actuals.status = '';
            await this.showConfirm(formatUploadInconsistencies(err.data.inconsistencies), { infoMode: true });
          } else {
            this.flashActualsStatus(`Upload failed: ${err.message}`, 'text-danger');
          }
        }
        e.target.value = '';
      },
      exportTasksXlsx() {
        this.tasksXlsxError = '';
        if (typeof XLSX === 'undefined') { this.tasksXlsxError = 'XLSX library not available.'; return; }
        const proj = this.project;
        const fmt = n => typeof n === 'number' ? n : (parseFloat(n) || 0);
        const rows = [];
        rows.push(['Project', proj.name || '']);
        rows.push(['Project ID (D365)', proj.code || '']);
        rows.push(['Pipeline', proj.pipeline || '']);
        rows.push(['Status', proj.status || '']);
        rows.push([]);
        rows.push(['Task', 'Role', 'Hours', 'Hourly Rate (€)', 'Total (€)']);
        let grandHours = 0, grandTotal = 0;
        (proj.tasks || []).forEach(task => {
          const resources = task.resources || [];
          let taskHours = 0, taskTotal = 0;
          if (resources.length === 0) {
            rows.push([task.name || '', '', '', '', '']);
          } else {
            resources.forEach((res, ri) => {
              const h = fmt(res.soldHours), r = fmt(res.hourlyRate), sub = h * r;
              taskHours += h; taskTotal += sub;
              rows.push([ri === 0 ? (task.name || '') : '', res.role || '', h, r, sub]);
            });
          }
          rows.push(['', 'Subtotal', taskHours, '', taskTotal]);
          rows.push([]);
          grandHours += taskHours; grandTotal += taskTotal;
        });
        rows.push(['', 'GRAND TOTAL', grandHours, '', grandTotal]);
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 36 }, { wch: 30 }, { wch: 10 }, { wch: 16 }, { wch: 14 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Tasks & Resources');
        const safe = s => String(s || '').replace(/[^a-z0-9]/gi, '_').slice(0, 30);
        XLSX.writeFile(wb, `tasks_${safe(proj.code || proj.name)}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      },
      async onDeleteActuals() {
        if (!this.project.code) return;
        if (this.actuals.deleting) return; // already in flight -- ignore a fast repeat click
        const n = this.actuals.exportRows?.length || 0;
        const msg = n
          ? `Delete ALL actuals for project "${this.project.code}"?\n\nThis removes ${n} row${n !== 1 ? 's' : ''}. This cannot be undone.`
          : `Delete actuals for project "${this.project.code}"?`;
        if (!(await this.showConfirm(msg))) return;
        this.actuals.deleting = true;
        try {
          await Api.timesheets.delete(this.project.code);
          this.actuals.info = `<span class="text-muted">No actuals uploaded for project <code>${esc(this.project.code)}</code>.</span>`;
          this.actuals.exportRows = null;
          this.reforecastVisible = false;
          this.flashActualsStatus('Actuals deleted.', 'text-success');
        } catch (e) {
          this.flashActualsStatus(`Delete failed: ${e.message}`, 'text-danger');
        } finally {
          this.actuals.deleting = false;
        }
      },
      async onSave() {
        if (this.saving) return;
        // Drop blank role rows (e.g. "+ Add role" clicked then left empty) before saving —
        // the old textarea-based form filtered blank lines via .filter(Boolean); this per-row
        // form has no equivalent, and a saved {role: '', task: '...'} would otherwise reach
        // entryMatchesRow() on portfolio.html (js/lib/portfolio-calc.js) as a real entry.
        (this.project.groups || []).forEach(g => { g.entries = (g.entries || []).filter(e => e.role.trim()); });
        // Sold-hours validation — reject the save if any value is outside the allowed set.
        this.jsonError = '';
        // A rate field still holding invalid text would otherwise save its previous value silently.
        if (Object.keys(this.rateInvalid).length) {
          this.jsonError = `Fix the highlighted hourly rates before saving: enter amounts in ${this.project.currency}, e.g. ${window.moneyFormatExample(this.project.currency, window.__currencies)}.`;
          return;
        }
        const moneyError = this.moneyFieldsError();
        if (moneyError) { this.jsonError = moneyError; return; }
        for (const task of this.project.tasks) {
          for (const r of task.resources) {
            if (r.soldHours && !isValidSoldHours(r.soldHours)) {
              this.jsonError = `Invalid sold hours "${r.soldHours}" for role "${r.role}" on task "${task.name}". Allowed values: whole numbers, or with a fraction of .25, .5, or .75.`;
              return;
            }
          }
        }
        // Warn if there are billable tasks with resources but no phasing configured.
        const hasBillable = this.project.tasks.some(t => t.billable !== false && t.resources.length);
        const phasingEmpty = !Object.values(this.project.phasing).some(v => v > 0);
        if (hasBillable && phasingEmpty) {
          const proceed = await this.showConfirm('The budget phasing for this project is empty — no monthly budget is configured.\n\nSave anyway?');
          if (!proceed) return;
        }

        this.saving = true;
        try {
          // config/cfgEditConfig/persistConfig are the existing in-memory-state contract (js/core.js, no-ops
          // by design per CLAUDE.md's "Data strategy" section) — mirror the original's single-project write-back.
          // Replace-or-push for new projects too: after a failed save the user stays here and may press Save
          // again, and a plain push would add the same new project to config.projects a second time.
          const idx = config.projects.findIndex(p => p.id === this.project.id);
          if (idx >= 0) config.projects[idx] = this.project; else config.projects.push(this.project);
          persistConfig();

          const push = await _pushProjectToApiDetailed(this.project);
          const outcome = summarizePushResult(push.failed);
          if (!outcome.ok) {
            // Not confirmed by the server: stay on the page, keep the leave-page prompt armed (savedSnapshot untouched).
            this.jsonError = outcome.message;
            this.saving = false;
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }
          // Saved: the redirect below must not trigger the leave-page prompt. Reached only when nothing above threw.
          this.savedSnapshot = JSON.stringify(this.project);
          window.location.href = '/portfolio.html?projectId=' + this.project.id;
        } catch (e) {
          this.jsonError = 'Save failed: ' + e.message;
          this.saving = false;
        }
      },
      openClientModal() {
        this.clientModal = { name: '', error: '', saving: false };
        bootstrap.Modal.getOrCreateInstance(document.getElementById('clientEditModal')).show();
      },
      async saveClientModal() {
        if (this.clientModal.saving) return; // already in flight -- ignore a fast repeat click
        const name = this.clientModal.name.trim();
        if (!name) { this.clientModal.error = 'Name is required.'; return; }
        this.clientModal.saving = true;
        try {
          const created = await Api.clients.create(name);
          await loadClientsFromApi();
          this.project.clientId = created.id;
          bootstrap.Modal.getInstance(document.getElementById('clientEditModal'))?.hide();
        } catch (e) {
          this.clientModal.error = e.message || 'Save failed.';
        } finally {
          this.clientModal.saving = false;
        }
      },
      openProgramModal() {
        this.programModal = { name: '', id: '', error: '', saving: false };
        bootstrap.Modal.getOrCreateInstance(document.getElementById('programEditModal')).show();
      },
      async saveProgramModal() {
        if (this.programModal.saving) return; // already in flight -- ignore a fast repeat click
        const name = this.programModal.name.trim();
        const id = this.programModal.id.trim();
        if (!name) { this.programModal.error = 'Name is required.'; return; }
        if (!id) { this.programModal.error = 'Program ID is required.'; return; }
        this.programModal.saving = true;
        try {
          const created = await Api.programs.create(id, name);
          await loadProgramsFromApi();
          this.project.programId = created.id;
          bootstrap.Modal.getInstance(document.getElementById('programEditModal'))?.hide();
        } catch (e) {
          this.programModal.error = e.message || 'Save failed.';
        } finally {
          this.programModal.saving = false;
        }
      },
      // Money formatting/parsing: one implementation in js/lib/money.js, driven by the locale of the project currency.
      moneyInput(amount) { return window.formatMoneyInput(amount, this.project?.currency, window.__currencies); },
      // Resource hourly rate blur: blank -> 0, a number -> stored, invalid text -> flagged, nothing written.
      onResRateBlur(ti, ri, e) {
        const res = this.project.tasks[ti].resources[ri];
        const key = ti + '-' + ri;
        const v = window.readMoneyInput(e.target.value, this.project?.currency, window.__currencies, { stored: res.hourlyRate });
        if (Number.isNaN(v)) { this.rateInvalid[key] = e.target.value; return; }
        res.hourlyRate = v === null ? 0 : v;
        delete this.rateInvalid[key];
        e.target.value = res.hourlyRate > 0 ? this.formatMoney(res.hourlyRate, this.project.currency, this.currencies) : '';
      },
      // Monthly phasing blur: blank or 0 -> month removed, a number -> stored, invalid text -> flagged, nothing written.
      onPhasingBlur(ym, e) {
        const stored = this.project.phasing[ym];
        const v = window.readMoneyInput(e.target.value, this.project?.currency, window.__currencies, { stored });
        if (Number.isNaN(v)) { this.phasingInvalid[ym] = e.target.value; return; }
        delete this.phasingInvalid[ym];
        if (v > 0) this.project.phasing[ym] = v; else delete this.project.phasing[ym];
        e.target.value = v > 0 ? this.formatMoney(v, this.project.currency, this.currencies) : '';
      },
      // PTC amount blur: blank -> 0, a number -> stored, invalid text -> flagged, nothing written.
      onPtcBlur(pi, e) {
        const item = this.project.ptc[pi];
        const v = window.readMoneyInput(e.target.value, this.project?.currency, window.__currencies, { stored: item.amount });
        if (Number.isNaN(v)) { this.ptcInvalid[pi] = e.target.value; return; }
        delete this.ptcInvalid[pi];
        item.amount = v === null ? 0 : v;
        e.target.value = item.amount > 0 ? this.formatMoney(item.amount, this.project.currency, this.currencies) : '';
      },
      // ptcInvalid is keyed by PTC index: after a splice, drop the removed entry and shift the ones below it.
      dropPtcInvalid(pi) {
        const next = {};
        for (const [key, text] of Object.entries(this.ptcInvalid)) {
          const i = Number(key);
          if (i === pi) continue;
          next[i > pi ? i - 1 : i] = text;
        }
        this.ptcInvalid = next;
      },
      // Save gate for the PTC and phasing amounts; a phasing entry for a month outside the period is dropped, not blocking.
      moneyFieldsError() {
        const months = this.projectMonths;
        for (const ym of Object.keys(this.phasingInvalid)) if (!months.includes(ym)) delete this.phasingInvalid[ym];
        if (Object.keys(this.ptcInvalid).length || Object.keys(this.phasingInvalid).length) {
          return `Fix the highlighted PTC and phasing amounts before saving: enter amounts in ${this.project.currency}, e.g. ${window.moneyFormatExample(this.project.currency, window.__currencies)}.`;
        }
        return '';
      },
      toIso(x) { return window.toIso(x); },
      toYmd(x) { return window.toYmd(x); },
      taskDateBounds(task, side) {
        const twin = side === 'start' ? task.endDate : task.startDate;
        return window.taskDateBounds(this.project?.startDate, this.project?.endDate, twin || '', side);
      },
      isTaskOutOfPeriod(task) { return this.outOfPeriodRefs.has(task); },
      monthLabel(ym, locale = 'en-US') {
        const [y, m] = [parseInt(ym.slice(0,4)), parseInt(ym.slice(4,6))];
        return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'short', year: '2-digit' });
      },
      taskMonthRange(task) {
        const s = task.startDate || (this.project.startDate ? this.project.startDate + '01' : '');
        const e = task.endDate   || (this.project.endDate   ? this.project.endDate   + '01' : '');
        if (!s || !e) return [];
        // parseTaskDate is defined in js/core.js and stays unchanged — same semantics as today.
        const tStart = parseTaskDate(s, false), tEnd = parseTaskDate(e, true);
        const months = [];
        let cy = tStart.getFullYear(), cm = tStart.getMonth() + 1;
        const ey = tEnd.getFullYear(), em = tEnd.getMonth() + 1;
        while (cy < ey || (cy === ey && cm <= em)) { months.push(`${cy}${String(cm).padStart(2,'0')}`); cm++; if (cm > 12) { cm = 1; cy++; } }
        return months;
      },
      rebuildTaskDist(ti) {
        const task = this.project.tasks[ti];
        const inverted = window.periodError(task.startDate || '', task.endDate || '', { kind: 'day', label: 'task' }) !== null;
        task.monthlyDistribution = window.keepDistribution(task.monthlyDistribution, this.taskMonthRange(task), inverted);
      },
      distBadgeClass(task) {
        return 'pc-pill pc-pill--' + window.splitState(task.monthlyDistribution, this.taskMonthRange(task)).tone;
      },
      distBadgeText(task) {
        return window.splitState(task.monthlyDistribution, this.taskMonthRange(task)).label;
      },
      // The split grid is read-only for a one-month or completed task, and for the viewer.
      isSplitReadonly(task) {
        return this.taskMonthRange(task).length === 1 || task.completed || this.isViewer;
      },
      spreadTask(ti) {
        const task = this.project.tasks[ti];
        if (this.isSplitReadonly(task)) return;
        task.monthlyDistribution = window.spreadEvenly(this.taskMonthRange(task));
      },
      clearTaskSplit(ti) {
        const task = this.project.tasks[ti];
        if (this.isSplitReadonly(task)) return;
        task.monthlyDistribution = {};
      },
      // Only tasks whose split is not valid, over more than one month and not completed: a valid split is never overwritten.
      spreadAllTasks() {
        if (this.isViewer) return;
        this.project.tasks.forEach(task => {
          const months = this.taskMonthRange(task);
          if (months.length > 1 && !task.completed && !window.splitState(task.monthlyDistribution, months).valid) {
            task.monthlyDistribution = window.spreadEvenly(months);
          }
        });
      },
      toggleTask(ti) {
        this.openTaskIndex = this.openTaskIndex === ti ? null : ti;
      },
      taskPeriodLabel(task) {
        const months = this.taskMonthRange(task);
        return months.length ? this.monthLabel(months[0]) + ' – ' + this.monthLabel(months[months.length - 1]) : 'No period';
      },
      taskHours(task) {
        return task.resources.reduce((s, r) => s + (r.soldHours || 0), 0);
      },
      taskTotal(task) {
        return task.resources.reduce((s, r) => s + (r.soldHours || 0) * (r.hourlyRate || 0), 0);
      },
      addTask() {
        this.project.tasks.push({ name: '', description: '', billable: true, completed: false, startDate: '', endDate: '', monthlyDistribution: {}, resources: [] });
        const ti = this.project.tasks.length - 1;
        this.openTaskIndex = ti;
        this.focusRef('taskName-' + ti);
      },
      async confirmRemoveTask(ti) {
        const name = this.project.tasks[ti].name.trim() || 'this task';
        if (await this.showConfirm(`Delete task "${name}" and all its resources?`)) {
          this.project.tasks.splice(ti, 1);
          this.dropRateInvalid(ti, null);
          if (this.openTaskIndex === ti) this.openTaskIndex = null;
          else if (this.openTaskIndex > ti) this.openTaskIndex -= 1;
        }
      },
      // rateInvalid is keyed `${ti}-${ri}`: after a splice, drop the removed row's entries and
      // shift the keys below it, so no other row loses or inherits invalid text.
      dropRateInvalid(ti, ri) {
        const next = {};
        for (const [key, text] of Object.entries(this.rateInvalid)) {
          let [t, r] = key.split('-').map(Number);
          if (ri === null) {
            if (t === ti) continue;
            if (t > ti) t -= 1;
          } else if (t === ti) {
            if (r === ri) continue;
            if (r > ri) r -= 1;
          }
          next[`${t}-${r}`] = text;
        }
        this.rateInvalid = next;
      },
      addResource(ti) {
        this.project.tasks[ti].resources.push({ role: '', soldHours: 0, hourlyRate: 0 });
      },
      async confirmRemoveResource(ti, ri) {
        const role = this.project.tasks[ti].resources[ri].role.trim() || 'this resource';
        if (await this.showConfirm(`Remove resource "${role}"?`)) {
          this.project.tasks[ti].resources.splice(ri, 1);
          this.dropRateInvalid(ti, ri);
        }
      },
      // opts.infoMode renders a single neutral "OK" button (no Cancel, no red styling) for a
      // pure acknowledgment with nothing to actually confirm — e.g. the upload-blocked
      // inconsistency message below, where the action already happened (server-side reject)
      // and the resolved boolean is never read by the caller either way.
      showConfirm(message, opts = {}) {
        this.confirmModal = { message, infoMode: !!opts.infoMode };
        return new Promise(resolve => {
          const el = document.getElementById('confirmModal');
          this._confirmAccepted = false;
          this._confirmClicked = false; // guards confirmModalOk() against a fast repeat click, same idiom as js/core.js's showConfirm()
          this._confirmResolve = () => { this._confirmAccepted = true; };
          const onHidden = () => {
            el.removeEventListener('hidden.bs.modal', onHidden);
            resolve(this._confirmAccepted);
          };
          el.addEventListener('hidden.bs.modal', onHidden);
          bootstrap.Modal.getOrCreateInstance(el).show();
        });
      },
      confirmModalOk() {
        if (this._confirmClicked) return; // ignore a fast repeat click before the hide animation completes
        this._confirmClicked = true;
        if (this._confirmResolve) this._confirmResolve();
        bootstrap.Modal.getInstance(document.getElementById('confirmModal'))?.hide();
      },
      async updateReforecastVisibility() {
        this.reforecastVisible = false;
        if (!this.project?.code) return;
        try {
          const uploads = await Api.timesheets.get(this.project.code);
          this.reforecastVisible = (uploads || []).some(u => (u.data || []).length > 0);
        } catch (_) { /* stays hidden */ }
      },
      async derivePhasing() {
        this.phasingActionError = '';
        const tasks = this.project.tasks.filter(t => t.billable !== false);
        const months = this.projectMonths;
        if (!months.length) { this.phasingActionError = 'Set project dates first.'; return; }
        const result = deriveDistribution(tasks, months, this.project.startDate, this.project.endDate, window.currencyInfo(this.project.currency, window.__currencies).digits);
        const fmtB = n => window.formatMoney(n || 0, this.project?.currency, window.__currencies);
        const message = `Phasing and planning will be computed from task date ranges, distributing each task's budget proportionally to the days of overlap with each month.\n\n`
          + `Total budget distributed: ${fmtB(result.totalBudget)} across ${months.length} months\n`
          + `Total hours distributed: ${result.totalHours.toLocaleString('en-US')} h`
          + (result.outsideBudget > 0 || result.outsideHours > 0
            ? `

Outside the project period, not distributed: ${fmtB(result.outsideBudget)} · ${result.outsideHours.toLocaleString('en-US', { maximumFractionDigits: 1 })} h`
            : '');
        if (await this.showConfirm(message)) {
          this.project.phasing = result.newPhasing;
          this.phasingInvalid = {};
          this.project.planning = result.newPlanning;
        }
      },
      async runReforecast() {
        this.phasingActionError = '';
        const tasks = this.project.tasks.filter(t => t.billable !== false);
        const months = this.projectMonths;
        if (!months.length) { this.phasingActionError = 'Set project start and end dates first.'; return; }
        if (!this.project.code) { this.phasingActionError = 'Set the D365 Project ID first before running Reforecast.'; return; }

        let actualsRows = [];
        try {
          const uploads = await Api.timesheets.get(this.project.code);
          actualsRows = (uploads || []).flatMap(u => u.data || []);
        } catch (e) { this.phasingActionError = 'Could not load actuals from server: ' + e.message; return; }

        const now = new Date();
        const currentYm = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}`;
        const result = reforecastDistribution(tasks, months, actualsRows, currentYm, window.currencyInfo(this.project.currency, window.__currencies).digits);
        if (result.distError) { this.phasingActionError = 'Cannot reforecast:\n\n' + result.distError; return; }

        const fmtB = n => window.formatMoney(Math.abs(n) || 0, this.project?.currency, window.__currencies);
        const fmtH = n => `${+(Math.round(Math.abs(n) + 'e1') + 'e-1')} h`;
        const futureCount = result.futureMonths.length;
        const distTaskCount = tasks.filter(t => {
          const d = t.monthlyDistribution;
          return d && Math.abs(Object.values(d).reduce((s,v)=>s+v,0) - 100) < 0.5;
        }).length;
        const distNote = distTaskCount > 0 ? `(${distTaskCount} task${distTaskCount>1?'s':''} use monthly distribution)` : '(even split)';
        const overB = result.overBudget ? ` (over budget: ${fmtB(result.consumedBudget)} consumed of ${fmtB(result.soldBudget)} sold)` : '';
        const overH = result.overHours ? ` (over hours: ${fmtH(result.consumedHours)} consumed of ${fmtH(result.soldHours)} sold)` : '';

        const message = `Phasing and planning grids will be fully overwritten:\n\n`
          + `Months with actuals — replaced with actual spend & hours from loaded XLS data\n`
          + (futureCount === 0
            ? `No current or future month in the project period — the net remaining is not distributed:\n`
              + `  Remaining budget: ${fmtB(result.remainingBudget)}${overB}\n`
              + `  Remaining hours: ${fmtH(result.remainingHours)}${overH}`
            : `Current & future months (${futureCount}) — net remaining distributed per task settings ${distNote}:\n`
              + `  Remaining budget: ${fmtB(result.remainingBudget)}${overB}\n`
              + `  Remaining hours: ${fmtH(result.distributedRemainingHours)}${overH}`);

        if (await this.showConfirm(message)) {
          this.project.phasing = result.newPhasing;
          this.phasingInvalid = {};
          this.project.planning = result.newPlanning;
        }
      },
    },
  }).component('ph-icon', window.PhIcon).component('cg-date-picker', window.CgDatePicker).mount('#app');
