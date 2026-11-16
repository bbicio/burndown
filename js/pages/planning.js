
document.addEventListener('DOMContentLoaded', async () => {
  loadConfig();

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  // A view computed's result when it has no grid to show; exportRows/periodMeta stay empty as before.
  const emptyView = message => ({ state: 'empty', message, exportRows: [], periodMeta: [], rows: [], total: null, periods: [] });
  const placeholderView = () => ({ state: 'placeholder', exportRows: [], periodMeta: [], rows: [], total: null, periods: [] });
  const clientLabel = id => {
    const n = id && typeof getClientName === 'function' ? getClientName(id) : '';
    return n && n !== 'Unassigned' ? n : '';
  };
  const ESTIMATES_TEXT = {
    byrole: [
      'Rows are roles; expand a role to see the projects and tasks it covers.',
      'Past periods show actual hours from the loaded timesheets. Current and future periods show the remaining hours (sold − consumed) spread linearly across the rest of each task.',
      'Under 1h/week, hours are aggregated monthly (lavender, ~).',
    ],
    byproject: [
      'Rows are Project → Task → Role; the owner is shown on each role.',
      'Past periods show actuals by owner. Remaining hours are spread across the rest of the task and split among owners in proportion to their share of actuals. An owner flagged inactive gets no future share.',
      'Under 1h/week per role, hours are aggregated monthly (lavender, ~).',
    ],
    byowner: [
      'Rows are Owner → Project → Task.',
      'Past periods show actual hours. Future periods show each owner\'s share of the remaining hours (sold − consumed), among owners not flagged inactive.',
      'If no owner is found in the actuals, or every owner is inactive, the hours go to Unassigned (TBD).',
      'High load = 24h a week or more, Over-allocated = 30h a week or more, on current and future periods of a person.',
    ],
  };

  const app = Vue.createApp({
    data() {
      return {
        loading: true, loadError: null,
        view: 'byrole', interval: 'monthly',
        pipelineFilters: new Set(), projectFilters: new Set(), teamFilters: new Set(),
        windowStart: null, windowEnd: null,
        monthlyPulse: true, roundHours: true,
        returnToBurndown: false,
        refreshTick: 0, // bumped after an XLS upload to force a new modelRequest (refetch of the
                        // planning model) and to recompute computeds reading config.projects, a
                        // plain global not Vue-reactive on its own
        ownerStatusMap: {}, // { [ownerName]: 'active' | 'inactive' }, from POST /api/planning/model
                             // (ownerStatus of the last loaded model); used only for the inactive badges
        model: null, modelPending: false, modelError: null, modelSeq: 0, // server projection of the active view (spec §14)
        // Grid state, kept per view and across re-fetches (ids are derived from keys, js/lib/planning-rows.js).
        openIds: { byrole: new Set(), byproject: new Set(), byowner: new Set() },
        openInit: { byrole: false, byproject: false, byowner: false },
        search: { byrole: '', byproject: '', byowner: '' },
        // rows the search forces open but the user collapsed; all three emptied whenever any search changes
        suppressed: { byrole: new Set(), byproject: new Set(), byowner: new Set() },
        legendOpen: false, isTablet: false, isPhone: false, phonePeriodIdx: 0, phoneIdxReset: true, projectQuery: '', periodMenuOpen: false,
        taOpen: false, taProjectId: '', taMessages: [], taInput: '', taBusy: false, taTables: null, taParams: {}, taError: null, taRoles: [],
      };
    },
    computed: {
      // window.__navUser is set by initNav() in created(), after the first render; `loading` flips to
      // false only after it, so reading it makes this computed re-evaluate once the user is known.
      isAdminUser() { this.loading; return ['admin', 'sysadmin'].includes(window.__navUser?.role); },
      taProjectOptions() { this.refreshTick; return projectOptions(this.eligibleProjects); },
      taStarters() { return starterPrompts(this.taRoles); },
      allPipelines() {
        this.refreshTick; // reactive dependency
        return [...new Set((config.projects || []).map(p => p.pipeline || '').filter(p => p && p !== 'Canceled'))].sort();
      },
      eligibleProjects() {
        this.refreshTick;
        return (config.projects || []).filter(p => {
          const pipe = p.pipeline || '';
          if (pipe === 'Canceled') return false;
          if (p.status === 'Completed') return false;
          if (this.pipelineFilters.size > 0 && !this.pipelineFilters.has(pipe)) return false;
          return true;
        });
      },
      allTeams() {
        return [...new Set(
          this.eligibleProjects.flatMap(p =>
            (p.tasks || []).flatMap(t =>
              (t.resources || []).map(r => {
                const dash = r.role ? r.role.indexOf(' - ') : -1;
                return dash > 0 ? r.role.slice(0, dash).trim() : r.role || '';
              })
            )
          ).filter(Boolean)
        )].sort();
      },
      filteredProjects() {
        return this.eligibleProjects.filter(p => this.projectFilters.size === 0 || this.projectFilters.has(p.id));
      },
      modelRequest() {
        this.refreshTick; this.teamFilters; // reactive dependencies
        if (!this.windowStart || !this.windowEnd) return null;
        if (this.windowStart > this.windowEnd) return null; // degenerate window: no fetch, views show their empty state
        return buildModelRequest({
          view: this.view, projectIds: this.filteredProjects.map(p => p.id), teams: this.teamFilters,
          windowStart: this.windowStart, windowEnd: this.windowEnd, today: new Date(), pulse: this.monthlyPulse,
        });
      },
      planningTitle() {
        if (this.returnToBurndown) {
          const projName = this.projectFilters.size === 1
            ? (this.eligibleProjects.find(p => this.projectFilters.has(p.id))?.name || [...this.projectFilters][0])
            : '';
          return `Planning${projName ? ' — ' + projName : ''}`;
        }
        return 'Planning — All Projects';
      },
      weeks() {
        if (!this.windowStart || !this.windowEnd) return [];
        const weeks = getCalendarWeeks(this.windowStart, this.windowEnd);
        const now = new Date();
        const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        weeks.forEach(w => {
          w.dateTitle = `${String(w.weekStart.getDate()).padStart(2,'0')} ${monthNames[w.weekStart.getMonth()]} – ${String(w.weekEnd.getDate()).padStart(2,'0')} ${monthNames[w.weekEnd.getMonth()]}`;
          w.isPast    = w.weekEnd < todayMidnight;
          w.isCurrent = w.weekStart <= todayMidnight && w.weekEnd >= todayMidnight;
        });
        return weeks;
      },
      atLeftLimit()  { return !this.windowStart || this.windowStart <= getPpAxis().axisStart; },
      atRightLimit() { return !this.windowEnd   || this.windowEnd   >= getPpAxis().axisEnd; },
      periodLabel() { return this.interval === 'weekly' ? weeklyWindowLabel(this.weeks) || this.windowLabel : this.windowLabel; },
      isDefaultWindow() {
        this.refreshTick;
        if (!this.windowStart || !this.windowEnd) return false;
        const { axisStart, axisEnd } = getPpAxis();
        const d = defaultWindow(new Date());
        const s = d.start < axisStart ? axisStart : d.start, e = d.end > axisEnd ? axisEnd : d.end;
        return localYmd(s) === localYmd(this.windowStart) && localYmd(e) === localYmd(this.windowEnd);
      },
      // <cg-date-picker mode="month"> works on 'YYYYMM'
      fromYm() { return this.windowStart ? localYmd(this.windowStart).slice(0, 7).replace('-', '') : ''; },
      toYm() { return this.windowEnd ? localYmd(this.windowEnd).slice(0, 7).replace('-', '') : ''; },
      axisMinYm() { this.refreshTick; return localYmd(getPpAxis().axisStart).slice(0, 7).replace('-', ''); },
      axisMaxYm() { this.refreshTick; return localYmd(getPpAxis().axisEnd).slice(0, 7).replace('-', ''); },
      windowLabel() {
        if (!this.windowStart || !this.windowEnd) return '...';
        const mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return `${mn[this.windowStart.getMonth()]} ${this.windowStart.getFullYear()} – ${mn[this.windowEnd.getMonth()]} ${this.windowEnd.getFullYear()}`;
        // NOTE: the pre-migration equivalent, js/core.js's updatePpWindowWidget(), used Italian
        // month abbreviations ('Gen','Feb',...) — a pre-existing bug that violated this project's
        // English-only rule (CLAUDE.md). Since this label is freshly written Vue code (that
        // function is not called from planning.html post-migration), it uses English abbreviations
        // here, consistent with getCalendarWeeks' own month names. js/core.js itself is untouched —
        // out of scope for this cycle, since no other page calls updatePpWindowWidget with this label.
      },
      // Options of js/lib/planning-rows.js's builders: project facts and task roles come from the
      // configuration (the model carries neither), restricted to the projects the request sent.
      rowOpts() {
        this.refreshTick;
        const known = new Map();
        this.filteredProjects.forEach(p => known.set(p.name || p.id, p));
        this.filteredProjects.forEach(p => known.set(p.id, p));
        const info = p => p && ({ id: p.id, name: p.name || p.id, stage: p.pipeline || '', status: p.status || '',
          client: clientLabel(p.clientId), start: p.startDate || '', end: p.endDate || '' });
        const teams = this.teamFilters;
        const teamOf = role => { const dash = role.indexOf(' - '); return dash > 0 ? role.slice(0, dash).trim() : role; };
        return {
          interval: this.interval, round: this.roundHours, ownerStatus: this.ownerStatusMap,
          projectInfo: key => info(known.get(key)),
          taskRoles: (pid, taskName) => {
            const task = (known.get(pid)?.tasks || []).find(t => t.name === taskName);
            return [...new Set((task?.resources || []).map(r => r.role).filter(r => r && (!teams.size || teams.has(teamOf(r)))))];
          },
        };
      },
      byRoleView() {
        const weeks    = this.weeks;
        const NO_DATA = 'No resource data found for the selected filters and date range.';
        if (!this.windowStart || !this.windowEnd || this.windowStart > this.windowEnd) return emptyView(NO_DATA);
        if (this.modelPending || !this.model || this.model.view !== 'role') return placeholderView();

        const adapted = adaptRoleModel(this.model.data, this.model.keyMap);
        const { roleMap, roleSoldMap, roleActualsMap } = adapted;
        const roles = Object.keys(roleMap).sort();
        if (!roles.length) return emptyView(NO_DATA);

        const isMonthly = this.interval === 'monthly';
        const periods   = isMonthly ? buildMonthPeriods(weeks) : weeks;
        const { rows, total } = buildRoleRows(adapted, periods, this.rowOpts);

        const grandSold    = Object.values(roleSoldMap).reduce((s, v) => s + v, 0);
        const grandActuals = Object.values(roleActualsMap).reduce((s, v) => s + v, 0);
        // The former grid's "To be planned" total: future hours of the periods that are not past,
        // a role's period ignored when its hours are under 0.01h.
        const grandTbp = periods.filter(p => !p.isPast).reduce((s, p) => {
          const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()];
          return s + roles.reduce((rs, role) => {
            let h = 0, hFuture = 0;
            keys.forEach(key => { const cell = roleMap[role]?.[key]; if (cell) { h += cell.hours; if (!cell.isPast) hFuture += cell.hours; } });
            return rs + (h < 0.01 ? 0 : hFuture);
          }, 0);
        }, 0);

        const periodLabels = periods.map(p => isMonthly ? p.label : p.dateTitle);
        const periodMeta   = periods.map(p => ({ isPast: p.isPast, isCurrent: p.isCurrent ?? false }));
        const exportRows = [{ v: ['Role', 'Sold', 'From actuals', 'To be planned', ...periodLabels], level: 'header' }];
        const rnd = v => Math.round(v * 10) / 10;
        roles.forEach(role => {
          const rowTbp = Object.values(roleMap[role] || {}).reduce((s, c) => s + (c.isPast ? 0 : c.hours), 0);
          const pVals  = periods.map(p => {
            const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()];
            const h = keys.reduce((s, k) => s + (roleMap[role]?.[k]?.hours || 0), 0);
            return h > 0.01 ? rnd(h) : '';
          });
          exportRows.push({ v: [role, rnd(roleSoldMap[role] || 0), rnd(roleActualsMap[role] || 0), rnd(rowTbp), ...pVals], level: 'role' });
        });
        const totPVals = periods.map(p => {
          const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()];
          const h = keys.reduce((s, k) => roles.reduce((rs, r) => rs + (roleMap[r]?.[k]?.hours || 0), s), 0);
          return h > 0.01 ? rnd(h) : '';
        });
        exportRows.push({ v: ['Total', rnd(grandSold), rnd(grandActuals), rnd(grandTbp), ...totPVals], level: 'total' });

        return { state: 'ready', exportRows, periodMeta, rows, total, periods };
      },
      byProjectView() {
        const weeks    = this.weeks;
        const NO_DATA = 'No resource data found for the selected filters and date range.';
        if (!this.windowStart || !this.windowEnd || this.windowStart > this.windowEnd) return emptyView(NO_DATA);
        if (this.modelPending || !this.model || this.model.view !== 'project') return placeholderView();
        const adapted = adaptProjectModel(this.model.data, this.model.keyMap);
        const projectTree = adapted.projects;
        const rnd = v => Math.round(v * 10) / 10;

        const isMonthly = this.interval === 'monthly';
        const periods   = isMonthly ? buildMonthPeriods(weeks) : weeks;
        const { rows, total } = buildProjectRows(adapted, periods, this.rowOpts);
        if (!rows.length) return emptyView(NO_DATA);

        const periodLabels = periods.map(p => isMonthly ? p.label : p.dateTitle);
        const periodMeta   = periods.map(p => ({ isPast: p.isPast, isCurrent: p.isCurrent ?? false }));
        const exportRows = [{ v: ['Project', 'Task', 'Role', 'Owner', 'Sold', 'From actuals', 'To be planned', ...periodLabels], level: 'header' }];

        let grandSold = 0, grandActuals = 0, grandTbp = 0;
        const grandWeekTotals = {};
        weeks.forEach(w => { grandWeekTotals[w.weekStart.toISOString()] = 0; });

        projectTree.forEach(pNode => {
          // The server omits projects with no rows; a project the page no longer lists is skipped.
          const proj = this.filteredProjects.find(p => p.id === pNode.id);
          if (!proj) return;
          const projSold = pNode.sold, projActuals = pNode.actuals, projTbp = pNode.tbp;
          const projWeekTotals = pNode.weekTotals;
          const projExportRows = [];

          pNode.tasks.forEach(tNode => {
            const task = { name: tNode.name };
            const taskSold = tNode.sold, taskActuals = tNode.actuals, taskTbp = tNode.tbp;
            const taskWeekTotals = tNode.weekTotals;
            const taskExportRows = [];

            tNode.roles.forEach(rNode => {
              const res = { role: rNode.role };
              const soldH = rNode.sold, consumedH = rNode.consumed, roleTbp = rNode.tbp;
              const roleWeekData = rNode.weekData;

              taskExportRows.push({ v: ['', '', res.role, '', rnd(soldH), rnd(consumedH), rnd(roleTbp),
                ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (roleWeekData[k]?.total || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'role' });

              rNode.owners.forEach(o => {
                const ownerName = o.name, isPlaceholder = o.isPlaceholder, ownerActualsH = o.actuals, ownerTbpH = o.tbp;
                const ownerExportName = isPlaceholder ? 'TBD' : (ownerName + (this.ownerStatusMap[ownerName] === 'inactive' ? ' (inactive)' : ''));
                taskExportRows.push({ v: ['', '', res.role, ownerExportName, '', rnd(ownerActualsH), rnd(ownerTbpH),
                  ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const oh = keys.reduce((s, k) => s + ((roleWeekData[k]?.byOwner[ownerName]) || 0), 0); return oh > 0.01 ? rnd(oh) : ''; })], level: 'owner' });
              });
            });

            projExportRows.push(
              { v: ['', task.name, '', '', rnd(taskSold), rnd(taskActuals), rnd(taskTbp),
                ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (taskWeekTotals[k] || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'task' },
              ...taskExportRows
            );
          });

          grandSold    += projSold;
          grandActuals += projActuals;
          grandTbp     += projTbp;
          Object.entries(projWeekTotals).forEach(([key, h]) => { grandWeekTotals[key] = (grandWeekTotals[key] || 0) + h; });

          exportRows.push(
            { v: [proj.name || proj.id, '', '', '', rnd(projSold), rnd(projActuals), rnd(projTbp),
              ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (projWeekTotals[k] || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'project' },
            ...projExportRows
          );
        });

        exportRows.push(
          { v: ['Total', '', '', '', rnd(grandSold), rnd(grandActuals), rnd(grandTbp),
            ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (grandWeekTotals[k] || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'total' }
        );

        return { state: 'ready', exportRows, periodMeta, rows, total, periods };
      },
      byOwnerView() {
        const weeks    = this.weeks;
        const NO_DATA = 'No owner data found for the selected filters.';
        if (!this.windowStart || !this.windowEnd || this.windowStart > this.windowEnd) return emptyView(NO_DATA);
        if (this.modelPending || !this.model || this.model.view !== 'owner') return placeholderView();
        const rnd   = v => Math.round(v * 10) / 10;

        const isMonthly = this.interval === 'monthly';
        const periods   = isMonthly ? buildMonthPeriods(weeks) : weeks;

        const ownerMap = adaptOwnerModel(this.model.data, this.model.keyMap);
        if (Object.keys(ownerMap).length === 0) return emptyView(NO_DATA);
        const { rows, total } = buildOwnerRows(ownerMap, periods, this.rowOpts);

        const periodLabels = periods.map(p => isMonthly ? p.label : p.dateTitle);
        const periodMeta   = periods.map(p => ({ isPast: p.isPast, isCurrent: p.isCurrent ?? false }));
        const exportRows = [{ v: ['Owner', 'Project', 'Task', 'Sold', 'From actuals', 'To be planned', ...periodLabels], level: 'header' }];
        let grandSold = 0, grandActuals = 0, grandTbp = 0;
        const grandWeekTotals = {};

        Object.entries(ownerMap).sort((a, b) => a[0].localeCompare(b[0])).forEach(([ownerName, om]) => {
          const isPlaceholder = ownerName === '—';
          const displayName = isPlaceholder ? 'TBD' : ownerName;
          grandSold += om.sold; grandActuals += om.actuals; grandTbp += om.tbp;

          weeks.forEach(w => {
            const key = w.weekStart.toISOString();
            grandWeekTotals[key] = (grandWeekTotals[key] || 0) + (om.weekTotals[key]?.hours || 0);
          });

          const ownerExportDisplayName = displayName + (!isPlaceholder && this.ownerStatusMap[ownerName] === 'inactive' ? ' (inactive)' : '');
          exportRows.push({ v: [ownerExportDisplayName, '', '', rnd(om.sold), rnd(om.actuals), rnd(om.tbp),
            ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (om.weekTotals[k]?.hours || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'project' });

          Object.entries(om.projects).sort((a, b) => a[1].name.localeCompare(b[1].name)).forEach(([projId, pm]) => {
            exportRows.push({ v: ['', pm.name, '', rnd(pm.sold), rnd(pm.actuals), rnd(pm.tbp),
              ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (pm.weekTotals[k]?.hours || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'task' });

            Object.entries(pm.tasks).sort((a, b) => a[0].localeCompare(b[0])).forEach(([taskName, tm]) => {
              exportRows.push({ v: ['', '', taskName, rnd(tm.sold), rnd(tm.actuals), rnd(tm.tbp),
                ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (tm.weekData[k]?.hours || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'role' });
            });
          });
        });

        exportRows.push({ v: ['Total', '', '', rnd(grandSold), rnd(grandActuals), rnd(grandTbp),
          ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (grandWeekTotals[k] || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'total' });

        return { state: 'ready', exportRows, periodMeta, rows, total, periods };
      },
      activeRows() {
        if (this.view === 'byrole') return this.byRoleView;
        if (this.view === 'byproject') return this.byProjectView;
        return this.byOwnerView;
      },
      // the period shown by the smartphone cards, with its stepper copy
      stepper() {
        const periods = this.activeRows.periods || [];
        return { ...window.stepperState(periods, this.phonePeriodIdx, this.interval), current: !!periods[this.phonePeriodIdx]?.isCurrent };
      },
      // search-independent: "{n} assignments" must not move while the user types
      leafCountMap() { return window.leafCounts(this.activeRows.rows || []); },
      // displayRows grouped under their depth-0 row, for the smartphone cards
      phoneGroups() {
        const groups = [];
        for (const r of this.displayRows) {
          if (r.depth === 0) groups.push({ parent: r, children: [] });
          else if (groups.length) groups[groups.length - 1].children.push(r);
        }
        return groups;
      },
      parentIds() { return new Set(this.activeRows.rows.map(r => r.parentId).filter(Boolean)); },
      rawSearchFilter() { return filterRows(this.activeRows.rows, this.search[this.view]); },
      searchFilter() { return effectiveFilter(this.rawSearchFilter, this.suppressed[this.view]); },
      displayRows() {
        const { rows } = this.activeRows;
        return rows.length ? visibleRows(rows, this.openIds[this.view], this.searchFilter) : [];
      },
      planningSubtitle() {
        let s = `Hours by role, project or owner · ${this.filteredProjects.length} of ${this.eligibleProjects.length} projects`;
        const r = this.activeRows;
        if (!this.modelPending && !this.modelError && r.state === 'ready') s += ` · ${this.fmtNum(r.total.toPlan)} to plan`;
        return s;
      },
      // the badge of the tablet "Filters" button: every filter or switch away from its default
      activeFilterCount() {
        return window.countActiveFilters({
          pipelineFilters: this.pipelineFilters, projectFilters: this.projectFilters, teamFilters: this.teamFilters,
          monthlyPulse: this.monthlyPulse, roundHours: this.roundHours, search: this.search[this.view],
        });
      },
      searchPlaceholder() { return { byrole: 'Search role…', byproject: 'Search project or task…', byowner: 'Search person…' }[this.view]; },
      // the Projects popover's own search, local to the list (does not filter the grid)
      projectOptions() {
        const q = this.projectQuery.trim().toLowerCase();
        if (!q) return this.eligibleProjects;
        return this.eligibleProjects.filter(p => `${p.name || p.id}\n${this.projectClient(p)}`.toLowerCase().includes(q));
      },
      labelHeader() { return { byrole: 'Role', byproject: 'Project / Task / Role', byowner: 'Owner / Project / Task' }[this.view]; },
      viewName() { return { byrole: 'By role', byproject: 'By project', byowner: 'By owner' }[this.view]; },
      estimatesText() { return ESTIMATES_TEXT[this.view]; },
    },
    methods: {
      esc,
      // Vue 3 templates do not see arbitrary window globals: thin wrappers for the template.
      renderChatText(t) { return window.renderChatText(t); },
      shouldSendOnEnter(e) { return window.shouldSendOnEnter(e); },
      rowView(r) { return window.rowView(r); },
      tableTitle(k) { return window.tableTitle(k); },
      taNewChat() { this.taMessages = []; this.taInput = ''; this.taTables = null; this.taParams = {}; this.taError = null; this.taRoles = []; },
      async taCall(path, payload) {
        const res = await fetch(`/api/planning-assistant/${path}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify(payload), signal: AbortSignal.timeout(120000),
        });
        let data = null;
        try { data = await res.json(); } catch { /* keep null */ }
        if (!res.ok) {
          const fields = data && data.fields ? Object.values(data.fields).join(' ') : '';
          throw new Error((data && data.error ? data.error : `HTTP ${res.status}`) + (fields ? `: ${fields}` : ''));
        }
        return data;
      },
      taApply(data) {
        if (data.tables) this.taTables = data.tables;
        if (data.params) this.taParams = data.params;
        if (data.requirement) this.taRoles = data.requirement.roles.map(r => r.code);
      },
      async taRank() {
        if (!this.taProjectId || this.taBusy) return;
        const projectId = this.taProjectId;
        this.taBusy = true; this.taError = null;
        try {
          const data = await this.taCall('rank', { projectId, asOf: localYmd(new Date()), params: this.taParams });
          if (!isStaleResponse(projectId, this.taProjectId)) this.taApply(data);
        } catch (err) { if (!isStaleResponse(projectId, this.taProjectId)) this.taError = err.message; }
        finally { this.taBusy = false; }
      },
      async taSend() {
        const text = this.taInput.trim();
        if (!text || !this.taProjectId || this.taBusy) return;
        const projectId = this.taProjectId;
        this.taMessages.push({ role: 'user', content: text });
        this.taInput = ''; this.taBusy = true; this.taError = null;
        try {
          const data = await this.taCall('chat', {
            projectId, asOf: localYmd(new Date()), params: this.taParams, messages: chatPayload(this.taMessages),
          });
          if (!isStaleResponse(projectId, this.taProjectId)) {
            this.taMessages.push({ role: 'assistant', content: data.reply });
            this.taApply(data);
          }
        } catch (err) {
          // local: true keeps this bubble out of the history sent back to the server (chatPayload).
          if (!isStaleResponse(projectId, this.taProjectId)) this.taMessages.push({ role: 'assistant', local: true, content: `Sorry, the assistant could not answer (${err.message}). You can still press "Calculate team".` });
        } finally {
          this.taBusy = false;
          this.$nextTick(() => { const el = this.$refs.taChatEl; if (el) el.scrollTop = el.scrollHeight; });
        }
      },
      isPipelineActive(p) { return this.pipelineFilters.size === 0 || this.pipelineFilters.has(p); },
      togglePipelineFilter(p) {
        const next = new Set(this.pipelineFilters);
        if (next.has(p)) next.delete(p); else next.add(p);
        this.pipelineFilters = next;
      },
      isProjectChecked(pid) { return this.projectFilters.size === 0 || this.projectFilters.has(pid); },
      onProjectFilterToggle(pid) {
        const checked = new Set(this.eligibleProjects.filter(p => this.isProjectChecked(p.id)).map(p => p.id));
        if (checked.has(pid)) checked.delete(pid); else checked.add(pid);
        this.projectFilters = checked.size === this.eligibleProjects.length ? new Set() : checked;
      },
      selectAllProjects() { this.projectFilters = new Set(); },
      resetProjectFilters() { this.projectFilters = new Set(); },
      isTeamChecked(t) { return this.teamFilters.size === 0 || this.teamFilters.has(t); },
      onTeamFilterToggle(t) {
        const checked = new Set(this.allTeams.filter(tt => this.isTeamChecked(tt)));
        if (checked.has(t)) checked.delete(t); else checked.add(t);
        this.teamFilters = checked.size === this.allTeams.length ? new Set() : checked;
      },
      selectAllTeams() { this.teamFilters = new Set(); },
      resetTeamFilters() { this.teamFilters = new Set(); },
      clampWindow() {
        const { axisStart, axisEnd } = getPpAxis();
        if (this.windowStart < axisStart) this.windowStart = new Date(axisStart);
        if (this.windowEnd   > axisEnd)   this.windowEnd   = new Date(axisEnd);
      },
      initWindowIfNeeded() {
        if (this.windowStart && this.windowEnd) { this.clampWindow(); return; }
        this.setWindow(defaultWindow(new Date()));
      },
      // ── Period selector ──
      setWindow({ start, end }) {
        this.windowStart = start; this.windowEnd = end;
        this.clampWindow();
      },
      stepPeriod(delta) { this.phonePeriodIdx = window.clampPeriodIdx(this.phonePeriodIdx + delta, this.activeRows.periods || []); },
      shiftPeriod(delta) { this.setWindow(shiftWindow({ start: this.windowStart, end: this.windowEnd }, delta, getPpAxis())); },
      applyPreset(months) { this.setWindow(presetWindow(months, new Date())); },
      applyWholeRange() { const { axisStart, axisEnd } = getPpAxis(); this.setWindow({ start: new Date(axisStart), end: new Date(axisEnd) }); },
      goToday() { this.setWindow(defaultWindow(new Date())); },
      setFrom(ym) {
        if (!ym) return;
        const start = new Date(+ym.slice(0, 4), +ym.slice(4, 6) - 1, 1);
        const end = this.windowEnd && this.windowEnd >= start ? this.windowEnd : new Date(start.getFullYear(), start.getMonth() + 1, 0);
        this.setWindow({ start, end });
      },
      setTo(ym) {
        if (!ym) return;
        const end = new Date(+ym.slice(0, 4), +ym.slice(4, 6), 0);
        const start = this.windowStart && this.windowStart <= end ? this.windowStart : new Date(end.getFullYear(), end.getMonth(), 1);
        this.setWindow({ start, end });
      },
      bumpRefresh() { this.refreshTick++; },
      async loadModel() {
        const req = this.modelRequest;
        if (!req) return;
        const seq = ++this.modelSeq;
        this.modelPending = true; this.modelError = null;
        try {
          const res = await fetch('/api/planning/model', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(req),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (seq !== this.modelSeq) return;                       // a newer request superseded this one
          // Replace: every view renders from the server model, whose ownerStatus covers exactly
          // the owners that model shows (badges only; the split itself is done server-side).
          this.ownerStatusMap = data.ownerStatus || {};
          // key: the request that produced this response, so a caller (the parity capture) can
          // check the loaded model matches the current modelRequest.
          this.model = { view: data.view, data, keyMap: buildKeyMap(this.weeks), key: JSON.stringify(req) };
        } catch (err) {
          if (seq !== this.modelSeq) return;
          console.warn('[planning] model load failed:', err.message);
          this.modelError = err.message; this.model = null;
        } finally {
          if (seq === this.modelSeq) this.modelPending = false;
        }
      },
      modelPlaceholderHtml() {
        if (this.modelError) return `<div class="alert alert-danger mb-0">Could not load the planning data (${esc(this.modelError)}). Try reloading the page.</div>`;
        return '<div class="text-muted p-3">Loading planning data…</div>';
      },
      async onFileInputChange(e) {
        const f = e.target.files[0];
        e.target.value = '';
        if (f) await readXLS(f, async () => { this.bumpRefresh(); });
      },
      async exportCurrentView() {
        // Every view is model-backed: nothing to export while loading or after a failed load.
        if (this.modelPending || this.modelError) return;
        const rnd = v => Math.round(v * 10) / 10;
        if (this.view === 'byrole') {
          const { exportRows, periodMeta } = this.byRoleView;
          await this.buildStyledExcelExport({ exportRows, periodMeta, nameCount: 1, sheetName: 'Resource Planning', filename: `resource_planning_${new Date().toISOString().slice(0,10)}.xlsx` });
        } else if (this.view === 'byproject') {
          const { exportRows, periodMeta } = this.byProjectView;
          await this.buildStyledExcelExport({ exportRows, periodMeta, nameCount: 4, sheetName: 'Planning By Project', filename: 'planning_by_project.xlsx' });
        } else {
          const { exportRows, periodMeta } = this.byOwnerView;
          await this.buildStyledExcelExport({ exportRows, periodMeta, nameCount: 3, sheetName: 'Planning By Owner', filename: 'planning_by_owner.xlsx' });
        }
      },
      // exportRows: [{ v: [...values], level: 'header'|'project'|'task'|'role'|'owner'|'total' }]
      // periodMeta: [{ isPast, isCurrent }] — one entry per period column (after name + 3 metric cols)
      async buildStyledExcelExport({ exportRows, periodMeta, nameCount, sheetName, filename }) {
        const metricCount = 3;
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet(sheetName);

        const lvlFill = {
          header:  { name: 'FFD8DFF7', metric: 'FFE0E1E3' },
          project: { name: 'FFC5CEF7', metric: 'FFD8D9DB' },
          task:    { name: 'FFE8ECFF', metric: 'FFE0E1E3' },
          role:    { name: 'FFFFFFFF', metric: 'FFF0F1F2' },
          owner:   { name: 'FFFAFAFA', metric: 'FFF5F6F7' },
          total:   { name: 'FFEEF1FF', metric: 'FFC8CACC' },
        };
        const periodFill = (pm, isHeader) => {
          if (isHeader) return pm.isCurrent ? 'FF4DABF7' : pm.isPast ? 'FFDDE0E3' : 'FFE8EAFF';
          return pm.isCurrent ? 'FFC8E6FF' : pm.isPast ? 'FFD6D9DC' : 'FFF0F2FF';
        };

        exportRows.forEach(({ v: values, level }) => {
          const wsRow = ws.addRow(values);
          const lc    = lvlFill[level] || lvlFill.role;
          const isBold = ['header', 'project', 'task', 'total'].includes(level);
          wsRow.eachCell({ includeEmpty: true }, (cell, colIdx) => {
            let fgColor, fontColor = 'FF000000';
            if (colIdx <= nameCount) {
              fgColor = lc.name;
            } else if (colIdx <= nameCount + metricCount) {
              fgColor = lc.metric;
            } else {
              const pm = periodMeta[colIdx - nameCount - metricCount - 1];
              if (pm) {
                fgColor = periodFill(pm, level === 'header');
                if (level === 'header' && pm.isCurrent) fontColor = 'FFFFFFFF';
              }
            }
            if (fgColor) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fgColor } };
            cell.font = { name: 'Calibri', size: 9, bold: isBold, color: { argb: fontColor } };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFBFC4CA' } }, left: { style: 'thin', color: { argb: 'FFBFC4CA' } },
              bottom: { style: 'thin', color: { argb: 'FFBFC4CA' } }, right: { style: 'thin', color: { argb: 'FFBFC4CA' } },
            };
            cell.alignment = { vertical: 'middle', horizontal: colIdx <= nameCount ? 'left' : 'center' };
          });
          wsRow.height = 15;
        });

        ws.columns = [
          ...Array(nameCount).fill(null).map(() => ({ width: 28 })),
          ...Array(metricCount).fill(null).map(() => ({ width: 12 })),
          ...periodMeta.map(() => ({ width: 11 })),
        ];
        ws.views = [{ state: 'frozen', xSplit: nameCount + metricCount, ySplit: 1 }];

        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
      // ── Grid ──
      isOpen(id) {
        const f = this.searchFilter;
        return !(f.closedIds && f.closedIds.has(id)) && (this.openIds[this.view].has(id) || f.forcedOpenIds.has(id));
      },
      hasChildren(r) { return this.parentIds.has(r.id); },
      toggleRow(id) {
        toggleRowState(id, { open: this.openIds[this.view], suppressed: this.suppressed[this.view], forced: this.rawSearchFilter.forcedOpenIds });
      },
      expandAll() {
        const open = this.openIds[this.view];
        this.parentIds.forEach(id => open.add(id));
        this.suppressed[this.view].clear();
      },
      collapseAll() {
        this.openIds[this.view].clear();
        // during a search, the rows it forces open close too (until the search changes)
        this.rawSearchFilter.forcedOpenIds.forEach(id => this.suppressed[this.view].add(id));
      },
      // First build of a view: By role closed; By project projects open; By owner people and projects open.
      initOpenIds(view, rows) {
        if (this.openInit[view]) return;
        this.openInit[view] = true;
        const maxDepth = view === 'byproject' ? 0 : view === 'byowner' ? 1 : -1;
        const parents = new Set(rows.map(r => r.parentId).filter(Boolean));
        rows.forEach(r => { if (r.depth <= maxDepth && parents.has(r.id)) this.openIds[view].add(r.id); });
      },
      projectClient(p) { return clientLabel(p.clientId); },
      stagePill(v) { return headerBadge('stage', v); },
      statusPill(v) { return headerBadge('status', v); },
      fmtNum(v) { return (this.roundHours ? Math.round(v || 0) : (v || 0).toFixed(2)) + 'h'; },
      fmtActuals(v) { return v > 0.005 ? this.fmtNum(v) : '—'; },
      assignmentsText(n) { return n + (n === 1 ? ' assignment' : ' assignments'); },
      // the card head is one button: its name must still carry the figures it shows
      cardHeadLabel(r) {
        const tags = [r.inactive && 'inactive', r.kind === 'tbd' && 'Needs owner', r.kind === 'project' && r.stage].filter(Boolean);
        return `${this.isOpen(r.id) ? 'Collapse' : 'Expand'} ${r.label}${tags.length ? ' (' + tags.join(', ') + ')' : ''}, ${this.assignmentsText(this.leafCountMap.get(r.id) ?? 0)}, `
          + `Sold ${this.fmtNum(r.sold)}, ${this.stepper.label} ${this.phoneCellText(r)}, ${this.fmtNum(r.toPlan)} to plan`;
      },
      miniBarOf(cells) { return window.miniBar(cells); },
      phoneCell(r) { return r.cells[this.phonePeriodIdx] || { h: 0 }; },
      phoneCellText(r) { return this.cellText(this.phoneCell(r)) || '—'; },
      phoneCellClass(r) { return this.cellClass(this.phoneCell(r)); },
      cellText(c) { return formatCell(c.h, { pulse: !!c.pulse, round: this.roundHours }); },
      cellClass(c) {
        const shown = c.h > 0.005;
        return {
          'pl-cell--past': c.past,
          'pl-cell--current': c.current && !(shown && (c.pulse || c.load)),
          'pl-cell--pulse': shown && c.pulse,
          'pl-cell--high': c.load === 'high',
          'pl-cell--over': c.load === 'over',
        };
      },
      cellTitle(c, i) {
        if (!(c.h > 0.005)) return '';
        const kind = c.past ? 'actuals' : c.pulse ? 'monthly aggregate' : 'planned';
        return `${this.periodTitle(this.activeRows.periods[i])} · ${c.h.toFixed(2)}h ${kind}`;
      },
      periodMain(p) {
        if (this.interval === 'monthly') return p.label.toUpperCase();
        return `${MONTHS[p.weekStart.getMonth()]} ${p.weekStart.getDate()}`.toUpperCase();
      },
      periodSub(p) {
        if (this.interval === 'monthly') return p.isCurrent ? 'current' : p.isPast ? 'actuals' : '';
        return 'W' + isoWeek(p.weekStart);
      },
      periodTitle(p) { return this.interval === 'monthly' ? p.label : p.dateTitle; },
      shortMonth(s) {
        if (!s || s.length < 6) return '';
        const m = parseInt(s.slice(4, 6), 10);
        return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${s.slice(2, 4)}` : '';
      },
      projectSub(r) {
        const dates = [this.shortMonth(r.start), this.shortMonth(r.end)].filter(Boolean).join(' – ');
        return [r.client, dates].filter(Boolean).join(' · ');
      },
      onDocClick(e) {
        if (this.legendOpen && this.$refs.legendInfo && !this.$refs.legendInfo.contains(e.target)) this.legendOpen = false;
        if (this.periodMenuOpen && this.$refs.periodBox && !this.$refs.periodBox.contains(e.target) && e.target.isConnected) this.periodMenuOpen = false;
      },
      onDocKeydown(e) {
        if (e.key === 'Tab' && this.taOpen) {
          // aria-modal drawer: Tab and Shift+Tab stay inside it
          const panel = document.getElementById('teamAssistantPanel');
          const focusables = [...panel.querySelectorAll('button, select, textarea, input, [href], [tabindex]:not([tabindex="-1"])')]
            .filter(el => !el.disabled && el.offsetParent !== null);
          const target = focusTrapTarget(focusables, document.activeElement, e.shiftKey);
          if (target) { e.preventDefault(); target.focus(); }
          return;
        }
        if (e.key !== 'Escape') return;
        if (this.legendOpen) { this.legendOpen = false; this.$refs.legendBtn?.focus(); }
        if (this.periodMenuOpen) { this.periodMenuOpen = false; this.$refs.periodLabelBtn?.focus(); }
        if (this.taOpen) this.taOpen = false;
      },
    },
    watch: {
      // js/core.js's rolePassesTeamFilter(role) (unchanged, called as a global by Tasks 3-5's
      // ported grouping-view logic) reads the module-level `portfolioTeamFilters` Set directly —
      // it has no Vue awareness. Mirroring this.teamFilters into that global on every change
      // keeps rolePassesTeamFilter's behavior correct without reimplementing its logic in Vue
      // or modifying js/core.js (out of scope — shared by every page).
      teamFilters: { handler(v) { portfolioTeamFilters = v; }, immediate: true },
      modelRequest() { this.loadModel(); },
      activeRows(v) {
        if (v.state !== 'ready') return;
        this.initOpenIds(this.view, v.rows);
        // smartphone stepper: back to the current period after a new window or interval, else keep it inside the new periods
        if (this.phoneIdxReset) { this.phonePeriodIdx = window.defaultPeriodIdx(v.periods); this.phoneIdxReset = false; }
        else this.phonePeriodIdx = window.clampPeriodIdx(this.phonePeriodIdx, v.periods);
      },
      windowStart() { this.phoneIdxReset = true; },
      windowEnd() { this.phoneIdxReset = true; },
      interval() { this.phoneIdxReset = true; },
      // a new search starts with every matching parent open again
      search: { handler() { Object.values(this.suppressed).forEach(s => s.clear()); }, deep: true },
      // the period menu takes focus when it opens (its first preset)
      periodMenuOpen(open) {
        if (open) this.$nextTick(() => { this.$refs.periodBox?.querySelector('.pl-period-menu button')?.focus(); });
      },
      // Team assistant drawer: focus into the panel when it opens, back to its button when it closes.
      taOpen(open) {
        this.$nextTick(() => { (open ? this.$refs.taSelect : this.$refs.taOpenBtn)?.focus(); });
      },
      // The assistant's project select follows the page filters; if a filter removes the selected
      // project, reset to "no project" (same effect as changing project) instead of leaving chat/tables
      // for a project that is no longer selectable.
      taProjectOptions() {
        if (!window.selectionStillValid(this.taProjectId, this.taProjectOptions)) {
          this.taProjectId = '';
          this.taNewChat();
        }
      },
    },
    async created() {
      const user = await initNav('planning', { breadcrumbs: [
        { label: 'Home', href: '/pipeline.html' },
        { label: 'Planning' },
      ]});
      if (!user) return;

      await Promise.all([loadClientsFromApi(), loadProgramsFromApi(), loadRolesFromApi(), loadCurrenciesFromApi()]);
      // refreshTimesheetDataFromApi() stays: the views no longer read the browser copy of the
      // actuals; it only keeps the shared timesheetData cache populated for js/upload.js.
      await Promise.all([loadConfigFromApi(), refreshTimesheetDataFromApi(), loadPipelineBudgetsFromApi()]);
      // `config` is a plain global, not reactive: computeds that read it (eligibleProjects, taProjectOptions)
      // depend only on refreshTick and may already have been evaluated (e.g. by the taProjectOptions watcher at
      // creation) while config.projects was still empty, so force a recompute now that the data is in.
      this.refreshTick++;
      this.initWindowIfNeeded();

      const urlProjectId = new URLSearchParams(window.location.search).get('projectId');
      if (urlProjectId) {
        // Real behavior of the pre-migration showPlanningView(projectId) (js/planning.js:388-394) —
        // see this plan's header "Correction to the design spec's assumed scope" note. It does NOT
        // render a distinct Gantt view; it only pre-filters to one project and flags the title.
        this.returnToBurndown = true;
        this.projectFilters = new Set([urlProjectId]);
      }

      this.loading = false;
    },
    mounted() {
      document.addEventListener('click', this.onDocClick);
      document.addEventListener('keydown', this.onDocKeydown);
      const mq = window.matchMedia('(max-width: 1024px)');
      this.isTablet = mq.matches;
      mq.addEventListener('change', e => { this.isTablet = e.matches; });
      const mp = window.matchMedia('(max-width: 767.98px)');
      this.isPhone = mp.matches;
      mp.addEventListener('change', e => { this.isPhone = e.matches; });
    },
  });

  app.component('ph-icon', window.PhIcon);
  app.component('cg-date-picker', window.CgDatePicker);
  app.mount('#planningApp');

});
