
  // Module-level (not reactive): timers and the refresh sequence number.
  let refreshTimer = null;
  let onVisibility = null;
  let refreshSeq = 0;

  const REFRESH_MS = 15000;
  const BUSY_TEXT = 'A profile job is already running — try again in a moment.';
  const NETWORK_TEXT = 'Could not reach the server, or it returned an unexpected response. The page retries every 15 seconds.';
  const queueTitle = n => `${n} project code${n === 1 ? '' : 's'} waiting for profile processing`;

  Vue.createApp({
    data() {
      return {
        ready: false,
        loadError: null,        // network / non-JSON failures (global alert)
        actionError: null,      // failures of an action (validation, 404, 409)
        actionInfo: null,       // confirmation of a completed action
        settings: { enabled: true, intervalMin: 10 },   // as stored on the server
        form: { enabled: true, intervalMin: 10 },       // the settings drawer
        schedule: { state: 'due', lastRunAt: null, nextRunAt: null },
        topicSettings: { enabled: true, keyConfigured: true },
        queuedCount: 0,
        projects: [],
        runs: [],
        search: '',
        statusFilter: 'all',
        sortKey: 'code',
        sortDir: 'asc',
        expanded: {},           // project_code → true when its error band is open; survives the refresh
        busyAction: null,       // anti double-click guard: the action in progress, or null
        view: 'codes',          // 'codes' | 'history'; not persisted
        drawerOpen: false,
      };
    },

    computed: {
      visibleProjects() {
        const filtered = window.filterJobProjects(this.projects, { search: this.search, status: this.statusFilter });
        return window.sortJobProjects(filtered, this.sortKey, this.sortDir);
      },
      formState() { return window.settingsState(this.form, this.settings); },
      intervalValid() { return this.formState.valid; },
      settingsDirty() { return this.formState.dirty; },
      nextRunText() {
        return window.describeNextRun(this.schedule, null);
      },
      workerLabel() {
        return this.settings.enabled ? `Scheduled · every ${this.settings.intervalMin} min` : 'Scheduled processing paused';
      },
    },

    async created() {
      const user = await initNav('timesheets', { breadcrumbs: [
        { label: 'Home', href: '/pipeline.html' },
        { label: 'Timesheets', href: '/timesheets.html' },
        { label: 'Profile processing' },
      ]});
      if (!user) return;
      if (!['admin', 'sysadmin'].includes(user.role)) { window.location.href = '/pipeline.html'; return; }
      await this.refresh();
      this.ready = true;
      this.startAutoRefresh();
      this._onKeydown = e => this.onKeydown(e);
      document.addEventListener('keydown', this._onKeydown);
    },

    beforeUnmount() {
      this.stopAutoRefresh();
      document.removeEventListener('keydown', this._onKeydown);
    },

    methods: {
      jobStatusLabel(s) { return window.jobStatusLabel(s); },
      describeNextRunShort(schedule, p) { return window.describeNextRunShort(schedule, p); },
      formatDateTime(v) { return window.formatDateTime(v); },
      formatTimeShort(v) { return window.formatTimeShort(v); },
      formatDuration(a, b) { return window.formatDuration(a, b); },
      pillKind(s) { return ['error', 'queued', 'updated'].includes(s) ? s : 'unprocessed'; },
      matchedText(p) { return p.status === 'unprocessed' ? '—' : p.resource_count; },
      resourcesText(p) {
        if (p.status === 'unprocessed') return '— resources';
        const n = Number(p.resource_count) || 0;
        return `${n} resource${n === 1 ? '' : 's'}`;
      },
      fmtCount(n) { return (Number(n) || 0).toLocaleString('en-US'); },

      // fetch wrapper: { ok, status, data, network }. network = true when the request failed or the
      // response was not JSON (e.g. a proxy error page).
      async request(method, url, body) {
        const hasBody = body !== undefined && body !== null;
        let res;
        try {
          res = await fetch(url, {
            method,
            credentials: 'same-origin',
            headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
            body: hasBody ? JSON.stringify(body) : undefined,
          });
        } catch {
          return { ok: false, status: 0, data: null, network: true };
        }
        let data;
        try { data = await res.json(); } catch { return { ok: false, status: res.status, data: null, network: true }; }
        return { ok: res.ok, status: res.status, data, network: false };
      },

      async refresh() {
        const seq = ++refreshSeq;
        const [state, runs] = await Promise.all([
          this.request('GET', '/api/profile-jobs'),
          this.request('GET', '/api/profile-jobs/runs'),
        ]);
        if (seq !== refreshSeq) return;            // a newer refresh superseded this one
        if (state.network || runs.network) { this.loadError = NETWORK_TEXT; setSubnavBadge('profileJobs', 0); return; }
        if (!state.ok || !runs.ok) {
          this.loadError = (state.data && state.data.error) || (runs.data && runs.data.error)
            || 'Failed to load the profile processing state.';
          setSubnavBadge('profileJobs', 0);
          return;
        }
        this.loadError = null;
        const keepForm = this.settingsDirty;        // never overwrite unsaved edits
        this.settings = { ...state.data.settings };
        if (!keepForm) this.form = { ...state.data.settings };
        this.schedule = state.data.schedule;
        if (state.data.topicSettings) this.topicSettings = state.data.topicSettings;
        this.queuedCount = state.data.queuedCount;
        setSubnavBadge('profileJobs', this.queuedCount, queueTitle(Number(this.queuedCount) || 0));
        this.projects = state.data.projects;
        this.runs = runs.data;
      },

      startAutoRefresh() {
        this.stopAutoRefresh();
        const tick = () => {
          if (document.visibilityState === 'visible' && !this.busyAction) this.refresh();
        };
        refreshTimer = setInterval(tick, REFRESH_MS);   // skipped while the tab is in the background
        onVisibility = tick;                            // catch up as soon as the tab is visible again
        document.addEventListener('visibilitychange', onVisibility);
      },
      stopAutoRefresh() {
        if (refreshTimer) clearInterval(refreshTimer);
        if (onVisibility) document.removeEventListener('visibilitychange', onVisibility);
        refreshTimer = null;
        onVisibility = null;
      },

      // Runs one action: guard, request, error routing, then always a refresh.
      async runAction(name, method, url, body, { onSuccess, busyNote } = {}) {
        if (this.busyAction) return;
        this.busyAction = name;
        this.actionError = null;
        this.actionInfo = null;
        try {
          const r = await this.request(method, url, body);
          // actionError (not loadError): the follow-up refresh() below runs regardless and, on
          // success, clears loadError — a network/non-JSON failure on the action itself would
          // otherwise vanish silently the moment that refresh succeeds (e.g. Rebuild all behind a
          // proxy timeout: the server keeps working after the response is lost).
          if (r.network) {
            this.actionError = 'No response from the server — the action may still be running; the list refreshes automatically.';
            return;
          }
          if (r.status === 409) { this.actionError = busyNote ? `${BUSY_TEXT} ${busyNote}` : BUSY_TEXT; return; }
          if (!r.ok) { this.actionError = (r.data && r.data.error) || 'The action failed.'; return; }
          if (onSuccess) onSuccess(r.data);
        } finally {
          this.busyAction = null;
          await this.refresh();
        }
      },

      runSummary(prefix, d) {
        const n = d.projects || 0;
        const r = d.resources || 0;
        const e = (d.errors || []).length;
        return `${prefix}: ${n} project code${n === 1 ? '' : 's'} processed, ${r} resource contribution${r === 1 ? '' : 's'} rebuilt`
          + (e ? `, ${e} failed (see the Error rows).` : '.');
      },

      // ── Settings drawer ──
      openDrawer() {
        this._returnFocus = document.activeElement;
        this.actionError = null;   // the drawer repeats only the outcome of what is done in it
        this.actionInfo = null;
        this.drawerOpen = true;
        this.$nextTick(() => { const d = document.querySelector('.pj-drawer'); d && (d.querySelector('input:not([disabled])') || d.querySelector('button')).focus(); });
      },
      // Closing discards unsaved schedule edits (spec §7).
      closeDrawer() {
        this.form = { ...this.settings };
        this.drawerOpen = false;
        this.$nextTick(() => { if (this._returnFocus && this._returnFocus.focus) this._returnFocus.focus(); });
      },
      onKeydown(e) {
        if (!this.drawerOpen || document.querySelector('.modal.show')) return;
        if (e.key === 'Escape') { e.preventDefault(); this.closeDrawer(); return; }
        if (e.key !== 'Tab') return;
        const drawer = document.querySelector('.pj-drawer');
        const items = drawer ? [...drawer.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')] : [];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || !drawer.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !drawer.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
      },

      async toggleTopicExtraction(event) {
        await this.runAction('topics', 'PUT', '/api/profile-jobs/topic-settings', { enabled: !this.topicSettings.enabled });
        // Vue does not repatch :checked when the bound value is unchanged (failed PUT) - resync the DOM
        if (event && event.target) event.target.checked = this.topicSettings.enabled;
      },

      saveSettings() {
        if (!this.formState.canSave) return;
        return this.runAction('save', 'PUT', '/api/profile-jobs/settings',
          { enabled: this.form.enabled, intervalMin: this.form.intervalMin },
          {
            onSuccess: (data) => {
              this.settings = { enabled: data.enabled, intervalMin: data.intervalMin };
              this.form = { ...this.settings };
              this.actionInfo = 'Saved — applies on the next tick (within 60 s).';
            },
          });
      },

      recalculateNow() {
        return this.runAction('run', 'POST', '/api/profile-jobs/run', null, {
          onSuccess: (d) => { this.actionInfo = this.runSummary('Recalculation finished', d); },
        });
      },

      confirmRebuild() {
        if (this.busyAction) return;
        showConfirm(
          'Rebuild every profile?\n\nAll project codes are queued and processed again now. On a large database this can take a while.',
          () => this.rebuildAll(), null, 'Rebuild all');
      },
      rebuildAll() {
        return this.runAction('rebuild', 'POST', '/api/profile-jobs/rebuild', null, {
          busyNote: 'All project codes have been queued and will be processed by the running job or the next one.',
          onSuccess: (d) => { this.actionInfo = this.runSummary('Rebuild finished', d); },
        });
      },

      processProject(p) {
        const code = p.project_code;
        return this.runAction('process:' + code, 'POST',
          `/api/profile-jobs/projects/${encodeURIComponent(code)}/process`, null, {
            busyNote: 'This project code has been queued and will be processed by the running job or the next one.',
            onSuccess: (d) => { this.actionInfo = this.runSummary(`${code} processed`, d); },
          });
      },

      confirmRemove(p) {
        if (this.busyAction) return;
        const code = p.project_code;
        showConfirm(
          `Remove "${code}" from the queue?\n\nThe profile already calculated does not change until this project code is processed again (by a new upload, a change that queues it, Process or Rebuild all).`,
          () => this.removeFromQueue(code), null, 'Remove from queue');
      },
      removeFromQueue(code) {
        return this.runAction('remove:' + code, 'DELETE',
          `/api/profile-jobs/projects/${encodeURIComponent(code)}/queue`, null, {
            onSuccess: () => { this.actionInfo = `${code} removed from the queue.`; },
          });
      },

      toggleExpanded(code) {
        this.expanded = { ...this.expanded, [code]: !this.expanded[code] };
      },
      clearFilters() {
        this.search = '';
        this.statusFilter = 'all';
      },
      sortBy(key) {
        if (this.sortKey === key) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
        else { this.sortKey = key; this.sortDir = 'asc'; }
      },
    },
  }).component('ph-icon', window.PhIcon).mount('#app');
