
    // Outside-click / Esc handlers for the detail panel. Module-level (not reactive data): same
    // approach as pipeline.html's _pbDetailOutsideClickHandler.
    let detailOutsideHandler = null;
    let detailKeyHandler = null;
    let menuTrigger = null;     // the ⋯ button of the open row menu (focus returns to it)
    let deleteModal = null;
    let resourceDrawer = null;
    let drawerOpener = null;    // focus returns here when the New/Edit drawer closes
    let deleteOpener = null;    // focus returns here when the Delete modal closes

    // Icons js/lib/icons.js does not have (16×16, stroke = currentColor).
    const TM_ICONS = {
      link: '<path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2.2-2.2a2.6 2.6 0 0 0-3.7-3.7l-.9.9M9.2 6.8a2.6 2.6 0 0 0-3.7 0L3.3 9a2.6 2.6 0 0 0 3.7 3.7l.9-.9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
      unlink: '<path d="M9.5 4.2l.6-.6a2.6 2.6 0 0 1 3.7 3.7l-.6.6M6.5 11.8l-.6.6a2.6 2.6 0 0 1-3.7-3.7l.6-.6M5 2.5v1.5M2.5 5H4M11 13.5V12M13.5 11H12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
      ban: '<circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4"/><path d="M4.1 11.9L11.9 4.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
      power: '<path d="M8 2v5.5M4.7 4.6a5 5 0 1 0 6.6 0" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    };
    const TmIcon = {
      props: { name: { type: String, required: true }, size: { type: Number, default: 16 } },
      template: `<svg class="pd-icon" :width="size" :height="size" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false" v-html="paths"></svg>`,
      computed: { paths() { return TM_ICONS[this.name] || ''; } },
    };

    const app = Vue.createApp({
      data() {
        return {
          ready: false,
          accessDenied: false,
          me: {},
          resources: [],
          roles: [],
          users: [],
          unmatched: [],
          aliases: [],
          assignChoice: {},
          unmatchedBanner: null,      // { kind: 'success' | 'error', strong?, text } — the drawer's section banner
          resolvedThisSession: 0,     // Assign/Ignore successes since the page loaded
          aliasFilterText: '',
          aliasResolves: 'any',
          busyAliasIds: new Set(),
          busyUnmatched: {},          // name_normalized → 'assign' | 'ignore' while its POST runs
          unmatchedFilterText: '',
          unmatchedSortKey: 'hours',
          unmatchedSortDir: 'desc',
          unmatchedPage: 1,
          expandedProjects: new Set(),
          rescanning: false,
          filterText: '',
          statusFilter: 'active',
          roleFilter: '',
          linkedFilter: 'any',
          statusFilters: [
            { val: 'active', label: 'Active', count: 'active' },
            { val: 'inactive', label: 'Inactive', count: 'inactive' },
            { val: 'all', label: 'All', count: 'total' },
          ],
          banner: null,               // { kind: 'success' | 'error', text }
          menuOpenId: null,
          menuUp: false,
          deleteTarget: null,
          deleteAck: false,
          authed: false,
          unmatchedView: 'queue',
          form: this.blankForm(),
          created: null,              // { id, name, roleText } after a successful create
          teamPage: 1,
          sortKey: 'name',
          sortDir: 'asc',
          selectedId: null,
          detailTab: 'details',
          aliasesOpen: false,         // the panel's Aliases section, closed on every open
          expanded: new Set(),        // open profile rows: dim:slug:value, dim:slug:value:code, role:code
          profileLoading: false,
          profileError: null,
          profileData: null,          // { profile, profile_computed_at } for the open resource
        };
      },
      computed: {
        counts() { return window.resourceCounts(this.resources); },
        deleteSummaryFor() { return window.deleteSummary(this.deleteTarget, this.aliases); },
        filteredResources() {
          return window.filterResources(this.resources, {
            status: this.statusFilter, roleId: this.roleFilter, linked: this.linkedFilter, text: this.filterText,
          });
        },
        extraFilterCount() { return (this.roleFilter ? 1 : 0) + (this.linkedFilter !== 'any' ? 1 : 0); },
        sortedRoles() { return this.roles.slice().sort((a, b) => String(a.label).localeCompare(String(b.label))); },
        pageRange() {
          const { page, pageItems } = this.pagedResources;
          const start = (page - 1) * 25 + 1;
          return `${start}–${start + pageItems.length - 1} of ${this.filteredResources.length}`;
        },
        filterSummary() {
          const parts = [`Status: ${this.statusFilters.find(f => f.val === this.statusFilter).label}`];
          if (this.roleFilter) {
            const role = this.roles.find(r => r.id === this.roleFilter);
            parts.push(`Role: ${role ? role.label : '—'}`);
          }
          if (this.linkedFilter !== 'any') parts.push(`PDash user: ${this.linkedFilter === 'linked' ? 'Linked' : 'Not linked'}`);
          if (this.filterText.trim()) parts.push(`Search: "${this.filterText.trim()}"`);
          return parts.join(' · ');
        },
        unmatchedHours() { return this.unmatched.reduce((sum, u) => sum + (Number(u.hours) || 0), 0); },
        unmatchedAmbiguous() { return this.unmatched.filter(u => u.candidate_resource_ids && u.candidate_resource_ids.length > 0).length; },
        sortedResources() {
          return window.sortResources(this.filteredResources, this.sortKey, this.sortDir);
        },
        pagedResources() {
          return window.paginate(this.sortedResources, this.teamPage, 25);
        },
        filteredUnmatched() {
          const q = window.foldText(this.unmatchedFilterText);
          if (!q) return this.unmatched;
          return this.unmatched.filter(u => window.foldText(u.display_name).includes(q));
        },
        sortedUnmatched() {
          return window.sortUnmatched(this.filteredUnmatched, this.unmatchedSortKey, this.unmatchedSortDir);
        },
        pagedUnmatched() {
          return window.paginate(this.sortedUnmatched, this.unmatchedPage, 25);
        },
        unmatchedRange() {
          const { page, pageItems } = this.pagedUnmatched;
          const start = (page - 1) * 25 + 1;
          return `${start}–${start + pageItems.length - 1} of ${this.filteredUnmatched.length}`;
        },
        maxUnmatchedHours() { return this.unmatched.reduce((m, u) => Math.max(m, Number(u.hours) || 0), 0); },
        progress() { return window.sessionProgress(this.resolvedThisSession, this.unmatched.length); },
        aliasList() { return window.aliasRows(this.aliases, this.resources, { text: this.aliasFilterText, resolves: this.aliasResolves }); },
        // Looked up in `resources` (not the filtered/sorted list) so the panel follows reloads and
        // is independent of the search box.
        selectedResource() {
          return this.selectedId ? (this.resources.find(r => r.id === this.selectedId) || null) : null;
        },
        detailAliases() {
          return this.selectedId ? this.aliases.filter(a => a.resource_id === this.selectedId) : [];
        },
        profileTree() {
          return this.profileData ? window.buildProfileTree(this.profileData.profile, this.roles) : null;
        },
        // Direct-experience topics by hours, and the two strongest (highlighted).
        directTopics() {
          if (!this.profileTree) return [];
          return this.profileTree.topicGroups.direct.slice().sort((a, b) => b.directHours - a.directHours || a.name.localeCompare(b.name));
        },
        topTopics() {
          return window.topTopicIds(this.directTopics.map(t => ({ id: t.id, name: t.name, hours: t.directHours })));
        },
      },
      watch: {
        detailTab(tab) { if (tab === 'profile') this.loadProfile(); },
        selectedId() {
          this.profileData = null;
          this.profileError = null;
          this.aliasesOpen = false;
          this.expanded = new Set();
          if (this.selectedId && this.detailTab === 'profile') this.loadProfile();
        },
        // The open resource vanished (deleted, or reloaded away): don't leave a stale, empty panel.
        selectedResource(now) { if (this.selectedId && !now) this.closeDetail(); },
        filterText() { this.teamPage = 1; },
        statusFilter() { this.teamPage = 1; },
        roleFilter() { this.teamPage = 1; },
        linkedFilter() { this.teamPage = 1; },
        sortKey() { this.teamPage = 1; },
        sortDir() { this.teamPage = 1; },
        unmatchedFilterText() { this.unmatchedPage = 1; },
        unmatchedSortKey() { this.unmatchedPage = 1; },
        unmatchedSortDir() { this.unmatchedPage = 1; },
      },
      async created() {
        const user = await initNav('team', { breadcrumbs: [
          { label: 'Home', href: '/pipeline.html' },
          { label: 'Team' },
        ]});
        if (!user) return;
        this.me = user;
        if (!['admin', 'sysadmin'].includes(user.role)) { this.accessDenied = true; return; }
        this.authed = true;
        // Each loader returns its error message (or null); they are joined into one banner.
        const loadErrors = (await Promise.all([this.loadResources(), this.loadRoles(), this.loadUsers()])).filter(Boolean);
        await this.loadUnmatched();
        if (loadErrors.length) this.setBanner('error', loadErrors.join(' '));
        this.ready = true;
      },
      mounted() {
        const drawerEl = document.getElementById('resourceDrawer');
        resourceDrawer = new bootstrap.Offcanvas(drawerEl);
        drawerEl.addEventListener('shown.bs.offcanvas', () => document.getElementById('resFirst')?.focus());
        drawerEl.addEventListener('hidden.bs.offcanvas', () => {
          this.created = null;
          if (drawerOpener && document.contains(drawerOpener)) drawerOpener.focus();
          drawerOpener = null;
        });
        this._unmatchedDrawer = new bootstrap.Offcanvas(document.getElementById('unmatchedDrawer'));
        deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
        document.getElementById('deleteModal').addEventListener('hidden.bs.modal', () => {
          this.deleteTarget = null;
          if (deleteOpener && document.contains(deleteOpener)) deleteOpener.focus();
          deleteOpener = null;
        });
        // Row menu: Esc closes it (focus back to ⋯), a press outside closes it.
        document.addEventListener('keydown', ev => {
          if (ev.key === 'Escape' && this.menuOpenId) { ev.stopImmediatePropagation(); this.closeMenu(true); }
        }, true);
        document.addEventListener('mousedown', ev => {
          if (this.menuOpenId && !ev.target.closest('.pd-row-menu-wrap')) this.closeMenu(false);
        });
      },
      methods: {
        async loadProfile() {
          const id = this.selectedId;
          if (!id) return;
          this.profileLoading = true;
          this.profileError = null;
          try {
            const data = await apiFetch(`/resources/${id}/profile`);
            if (id !== this.selectedId) return;            // the panel moved on while we waited
            this.profileData = data;
          } catch (e) {
            if (id === this.selectedId) this.profileError = e.message || 'The server returned an error.';
          } finally {
            if (id === this.selectedId) this.profileLoading = false;
          }
        },
        fmtHours(h) { return (Math.round((Number(h) || 0) * 100) / 100).toLocaleString('en-US'); },
        fmtPct(share) { return `${Math.round((Number(share) || 0) * 100)}%`; },
        monthText(ym) { return window.profileMonthText(ym); },
        profileCalcText(iso) { return window.profileCalcText(iso); },
        isRecent(ym) { return window.isRecentMonth(ym); },
        isExpanded(key) { return this.expanded.has(key); },
        toggleExpanded(key) {
          if (this.expanded.has(key)) this.expanded.delete(key);
          else this.expanded.add(key);
        },
        // Opens the Unmatched names drawer on the queue or on the Existing aliases view.
        openUnmatched(view) {
          this.unmatchedView = view === 'aliases' ? 'aliases' : 'queue';
          this._unmatchedDrawer.show();
        },
        setBanner(kind, text) { this.banner = { kind, text }; },
        clearBanner() { this.banner = null; },
        clearFilters() {
          this.statusFilter = 'active';
          this.roleFilter = '';
          this.linkedFilter = 'any';
          this.filterText = '';
        },
        initials(r) { return `${(r.first_name || '').charAt(0)}${(r.last_name || '').charAt(0)}`.toUpperCase(); },
        ariaSort(key) {
          if (this.sortKey !== key) return 'none';
          return this.sortDir === 'asc' ? 'ascending' : 'descending';
        },
        sortGlyph(key) {
          if (this.sortKey !== key) return '↕';
          return this.sortDir === 'asc' ? '↑' : '↓';
        },
        openDetail(r) {
          if (r.id === this.selectedId) return;          // already open: no reset, no flicker
          this.selectedId = r.id;
          this.detailTab = 'details';
          this.$nextTick(() => document.getElementById('resourcePanelTitle')?.focus());
          this.removeDetailHandlers();
          const outside = (e) => {
            const panel = document.getElementById('resourceDetailPanel');
            if (!panel || panel.contains(e.target)) return;
            // Drawers and modals opened from the panel live outside it in the DOM.
            if (e.target.closest('.modal, .offcanvas') || e.target.classList.contains('modal-backdrop')
                || e.target.classList.contains('offcanvas-backdrop')) return;
            // A row click switches the panel to that row (or keeps it): closing first would flicker.
            if (e.target.closest('.tm-row')) return;
            this.closeDetail();
          };
          const onKey = (e) => {
            // Esc closes only the topmost layer: a drawer or modal above the panel handles it itself.
            if (e.key === 'Escape' && !document.querySelector('.modal.show, .offcanvas.show')) this.closeDetail();
          };
          detailOutsideHandler = outside;
          detailKeyHandler = onKey;
          // Delayed registration: the click that opened the panel must not immediately close it,
          // and a later openDetail() supersedes an earlier pending registration.
          setTimeout(() => {
            if (detailOutsideHandler === outside) {
              document.addEventListener('mousedown', outside);
              // Capture phase: Bootstrap hides a modal (removing .show) before a bubble-phase document listener runs.
              document.addEventListener('keydown', onKey, true);
            }
          }, 200);
        },
        closeDetail() {
          this.selectedId = null;
          this.removeDetailHandlers();
        },
        removeDetailHandlers() {
          if (detailOutsideHandler) document.removeEventListener('mousedown', detailOutsideHandler);
          if (detailKeyHandler) document.removeEventListener('keydown', detailKeyHandler, true);
          detailOutsideHandler = null;
          detailKeyHandler = null;
        },
        sortBy(key) {
          if (this.sortKey === key) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
          else { this.sortKey = key; this.sortDir = 'asc'; }
        },
        unmatchedSortBy(key) {
          if (this.unmatchedSortKey === key) this.unmatchedSortDir = this.unmatchedSortDir === 'asc' ? 'desc' : 'asc';
          else { this.unmatchedSortKey = key; this.unmatchedSortDir = key === 'name' ? 'asc' : 'desc'; }
        },
        unmatchedAriaSort(key) {
          if (this.unmatchedSortKey !== key) return 'none';
          return this.unmatchedSortDir === 'asc' ? 'ascending' : 'descending';
        },
        unmatchedSortGlyph(key) {
          if (this.unmatchedSortKey !== key) return '↕';
          return this.unmatchedSortDir === 'asc' ? '↑' : '↓';
        },
        toggleProjects(u) {
          const key = u.name_normalized;
          if (this.expandedProjects.has(key)) this.expandedProjects.delete(key);
          else this.expandedProjects.add(key);
        },
        // "Project name (CODE)", alphabetical by name.
        sortedProjects(u) {
          return (u.project_list || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
        },
        isAmbiguous(u) { return !!(u.candidate_resource_ids && u.candidate_resource_ids.length); },
        // The matcher falls back to inactive namesakes only when no active resource has the name.
        ambiguousText(u) {
          const ids = new Set(u.candidate_resource_ids || []);
          const found = this.resources.filter(r => ids.has(r.id));
          const kind = found.length && found.every(r => r.status !== 'active') ? 'inactive' : 'active';
          return `${ids.size} ${kind} resources share this name. Pick the right one.`;
        },
        hoursBarPct(h) { return window.hoursBarPct(h, this.maxUnmatchedHours); },
        candidateChipsFor(u) { return window.candidateChips(u, this.resources); },
        blankForm() {
          return { id: null, firstName: '', lastName: '', email: '', roleId: '',
                    jobDescription: '', userId: null, status: 'active', loading: false, error: null, errors: {} };
        },
        // Loaders return an error message, or null on success.
        async loadResources() {
          try {
            this.resources = await apiFetch('/resources');
            return null;
          } catch (e) {
            return e.message || 'Failed to load resources.';
          }
        },
        async loadRoles() {
          try {
            this.roles = await apiFetch('/roles');
            return null;
          } catch (e) {
            return e.message || 'Failed to load roles.';
          }
        },
        async loadUsers() {
          try {
            this.users = await apiFetch('/users/active-list');
            return null;
          } catch (e) {
            return e.message || 'Failed to load users.';
          }
        },

        // Errors go to the drawer's own section banner, separate from the page one.
        async loadUnmatched() {
          try {
            const [u, a] = await Promise.all([
              apiFetch('/resources/unmatched'),
              apiFetch('/resources/aliases'),
            ]);
            this.unmatched = u;
            this.aliases = a;
            return true;
          } catch (e) {
            this.setUnmatchedError(e.message || 'Failed to load unmatched names.');
            return false;
          }
        },
        setUnmatchedError(text) { this.unmatchedBanner = { kind: 'error', text }; },
        // Grouped for the Assign to combo: same-name candidates (inactive ones when the matcher fell
        // back to them), the other active resources, then the other inactive ones (a leaver's
        // historical actuals can only belong to an inactive resource, and the API accepts an alias to one).
        comboOptions(u) {
          const cand = new Set(u.candidate_resource_ids || []);
          const opt = r => ({
            id: r.id,
            label: `${r.first_name} ${r.last_name}${r.status === 'active' ? '' : ' (inactive)'}`,
            hint: r.role_code,
          });
          const others = this.resources.filter(r => !cand.has(r.id));
          const groups = [
            ['Same name · candidates', this.resources.filter(r => cand.has(r.id))],
            ['Active resources', others.filter(r => r.status === 'active')],
            ['Inactive', others.filter(r => r.status !== 'active')],
          ];
          return groups.filter(([, list]) => list.length).flatMap(([group, list]) => [{ group }, ...list.map(opt)]);
        },
        // Busy state is keyed by name: the queue reload replaces the row objects mid-request.
        async postAlias(u, body, action) {
          const key = u.name_normalized;
          if (this.busyUnmatched[key]) return;
          this.busyUnmatched[key] = action;
          this.unmatchedBanner = null;
          const resource = body.resourceId ? this.resources.find(r => r.id === body.resourceId) : null;
          try {
            const res = await apiSave('POST', '/resources/aliases', { name: u.display_name, ...body });
            if (res.kind !== 'ok') {
              this.setUnmatchedError(res.message);
              // 409 ALREADY_RESOLVED: the name was resolved elsewhere, so the queue is stale.
              // An unknown outcome may have written: the queue is stale then too.
              if ((res.kind === 'error' && res.status === 409) || res.kind === 'unknown') await this.loadUnmatched();
              return;
            }
            delete this.assignChoice[u.name_normalized];
            this.resolvedThisSession++;
            const reloaded = await this.loadUnmatched();
            if (!reloaded) { this.setUnmatchedError(window.SAVED_NOT_RELOADED); return; }
            this.unmatchedBanner = action === 'ignore'
              ? { kind: 'success', strong: `"${u.display_name}" ignored.`, text: 'Stored as an ignored alias.' }
              : { kind: 'success',
                  strong: `"${u.display_name}" assigned to ${resource ? `${resource.first_name} ${resource.last_name} (${resource.role_code})` : 'the resource'}.`,
                  text: 'Removed from the queue. Their profile updates in the next background run.' };
          } finally {
            delete this.busyUnmatched[key];
          }
        },
        assign(u) {
          const resourceId = this.assignChoice[u.name_normalized];
          if (!resourceId) return;
          return this.postAlias(u, { resourceId }, 'assign');
        },
        ignoreName(u) { return this.postAlias(u, { ignore: true }, 'ignore'); },
        // No confirmation, as before. Busy state is tracked by id: the aliases view renders copies.
        async removeAlias(a) {
          this.busyAliasIds.add(a.id);
          this.unmatchedBanner = null;
          try {
            const res = await apiSave('DELETE', `/resources/aliases/${a.id}`);
            if (res.kind !== 'ok' && res.kind !== 'unknown') { this.setUnmatchedError(res.message); return; }
            if (res.kind === 'unknown') this.setUnmatchedError(res.message);
            const reloaded = await this.loadUnmatched();
            if (res.kind === 'ok' && !reloaded) this.setUnmatchedError(window.SAVED_NOT_RELOADED);
          } finally {
            this.busyAliasIds.delete(a.id);
          }
        },
        async rescan() {
          this.rescanning = true;
          this.unmatchedBanner = null;
          try {
            const res = await apiSave('POST', '/resources/unmatched/rescan');
            if (res.kind !== 'ok' && res.kind !== 'unknown') { this.setUnmatchedError(res.message); return; }
            if (res.kind === 'unknown') this.setUnmatchedError(res.message);
            const reloaded = await this.loadUnmatched();
            if (res.kind === 'ok' && !reloaded) this.setUnmatchedError(window.SAVED_NOT_RELOADED);
          } finally {
            this.rescanning = false;
          }
        },

        // ── New / Edit drawer ──
        openCreate() {
          this.form = this.blankForm();
          this.created = null;
          drawerOpener = document.activeElement;
          resourceDrawer.show();
        },
        openEdit(r) {
          this.form = {
            ...this.blankForm(),
            id: r.id, firstName: r.first_name, lastName: r.last_name, email: r.email,
            roleId: r.role_id, jobDescription: r.job_description || '', userId: r.user_id, status: r.status,
          };
          this.form.initial = {
            firstName: this.form.firstName, lastName: this.form.lastName, email: this.form.email,
            roleId: this.form.roleId, jobDescription: this.form.jobDescription, userId: this.form.userId,
          };
          this.created = null;
          drawerOpener = document.activeElement;
          resourceDrawer.show();
        },
        // The four fields the API requires on create (PATCH refuses the first three empty).
        validateForm() {
          const f = this.form;
          const errors = {};
          if (!String(f.firstName || '').trim()) errors.firstName = 'First name is required.';
          if (!String(f.lastName || '').trim()) errors.lastName = 'Last name is required.';
          if (!String(f.email || '').trim()) errors.email = 'Email is required.';
          if (!f.roleId) errors.roleId = 'Role is required.';
          f.errors = errors;
          const first = Object.values(errors)[0];
          // The box repeats the first field message; the Role one also says where roles come from (13ag).
          f.error = first === errors.roleId && first
            ? 'Role is required. Pick one from the list, or add it in Master Data first.'
            : (first || null);
          return !first;
        },
        async submitForm() {
          if (!this.validateForm()) return;
          const payload = {
            firstName: this.form.firstName, lastName: this.form.lastName, email: this.form.email,
            roleId: this.form.roleId, jobDescription: this.form.jobDescription, userId: this.form.userId,
          };
          const editing = !!this.form.id;
          // An edit sends only what changed; with nothing changed no request is made.
          const changes = editing ? window.changedResourceFields(this.form.initial, this.form) : null;
          if (editing && !Object.keys(changes).length) {
            resourceDrawer.hide();
            this.setBanner('success', 'No changes.');
            return;
          }
          this.form.loading = true;
          try {
            const res = editing
              ? await apiSave('PATCH', `/resources/${this.form.id}`, changes)
              : await apiSave('POST', '/resources', payload);
            if (res.kind === 'unknown') {
              this.form.error = res.message;
              await this.loadResources();
              await this.loadUnmatched();
              return;
            }
            if (res.kind !== 'ok') { this.form.error = res.message; return; }
            const data = res.data;
            if (editing) {
              const row = this.resources.find(x => x.id === this.form.id);
              if (row && data) Object.assign(row, data);
            }
            const err = await this.loadResources();
            await this.loadUnmatched();
            if (editing) {
              resourceDrawer.hide();
              this.setBanner(err ? 'error' : 'success', err ? window.SAVED_NOT_RELOADED : 'Changes saved.');
            } else {
              const role = this.roles.find(x => x.id === payload.roleId);
              this.created = {
                id: data.id,
                name: `${data.first_name} ${data.last_name}`,
                roleText: role ? `${role.label} (${role.code})` : '',
              };
              if (err) this.setBanner('error', window.SAVED_NOT_RELOADED);
            }
          } finally {
            this.form.loading = false;
          }
        },
        // Empties the form for the next person, keeping the last role.
        createAnother() {
          const roleId = this.form.roleId;
          this.form = { ...this.blankForm(), roleId };
          this.created = null;
          this.$nextTick(() => document.getElementById('resFirst')?.focus());
        },
        openCreated() {
          const r = this.created && this.resources.find(x => x.id === this.created.id);
          drawerOpener = null;
          resourceDrawer.hide();
          if (r) this.openDetail(r);
        },

        // ── Row menu ──
        // The popover opens upwards when it would not fit between the button and the viewport bottom.
        openMenu(r, ev) {
          if (this.menuOpenId === r.id) { this.closeMenu(true); return; }
          menuTrigger = ev.currentTarget;
          this.menuUp = menuTrigger.getBoundingClientRect().bottom + 240 > window.innerHeight;
          this.menuOpenId = r.id;
          this.$nextTick(() => {
            const first = document.querySelector('.pd-row-menu [role="menuitem"]');
            if (first) first.focus();
          });
        },
        closeMenu(returnFocus) {
          this.menuOpenId = null;
          if (returnFocus && menuTrigger) menuTrigger.focus();
        },
        onMenuKey(ev) {
          if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
          ev.preventDefault();
          const items = [...ev.currentTarget.querySelectorAll('[role="menuitem"]')];
          const at = items.indexOf(document.activeElement);
          const step = ev.key === 'ArrowDown' ? 1 : -1;
          items[(at + step + items.length) % items.length].focus();
        },
        // The menu closes before the action starts. The chosen item is removed with the menu, so
        // focus goes back to ⋯ and the drawer or modal returns it there.
        runMenu(r, action) {
          this.closeMenu(true);
          if (action === 'edit') this.openEdit(r);
          else if (action === 'status') this.toggleStatus(r);
          else if (action === 'delete') this.askDelete(r);
        },
        aliasCountText(r) {
          const n = window.deleteSummary(r, this.aliases).count;
          return `${n} ${n === 1 ? 'alias' : 'aliases'}`;
        },

        async toggleStatus(r) {
          r._loading = true;
          this.clearBanner();
          const name = `${r.first_name} ${r.last_name}`;
          try {
            const newStatus = r.status === 'active' ? 'inactive' : 'active';
            const res = await apiSave('PATCH', `/resources/${r.id}`, { status: newStatus });
            if (res.kind !== 'ok') { this.setBanner('error', res.message); return; }
            r.status = res.data.status;
            this.setBanner('success', res.data.status === 'active'
              ? `${name} was activated.`
              : `${name} was deactivated. Their hours and aliases stay attributed. Find them under Inactive.`);
            await this.loadUnmatched();
          } finally {
            r._loading = false;
          }
        },

        // ── Delete ──
        askDelete(r) {
          deleteOpener = document.activeElement;
          this.deleteTarget = r;
          this.deleteAck = false;
          deleteModal.show();
        },
        confirmDelete() {
          if (!this.deleteAck || !this.deleteTarget) return;
          const r = this.deleteTarget;
          deleteModal.hide();
          this.deleteResource(r);
        },
        deactivateInstead() {
          const r = this.deleteTarget;
          deleteModal.hide();
          if (r && r.status === 'active') this.toggleStatus(r);
        },
        async deleteResource(r) {
          r._loading = true;
          this.clearBanner();
          const name = `${r.first_name} ${r.last_name}`;
          try {
            const res = await apiSave('DELETE', `/resources/${r.id}`);
            if (res.kind === 'unknown') {
              this.setBanner('error', res.message);
              await this.loadResources();
              await this.loadUnmatched();
              return;
            }
            if (res.kind !== 'ok') { this.setBanner('error', res.message); return; }
            this.setBanner('success', `${name} was deleted.`);
            const err = await this.loadResources(); if (err) this.setBanner('error', window.SAVED_NOT_RELOADED);
            await this.loadUnmatched();
          } finally {
            r._loading = false;
          }
        },
      },
    });

    app.component('combo-select', window.ComboSelect);
    app.component('ph-icon', window.PhIcon);
    app.component('tm-icon', TmIcon);
    app.mount('#app');
  