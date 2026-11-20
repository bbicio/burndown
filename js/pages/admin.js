
    const R = window.UserAdminRules;
    // Kept outside Vue: DOM nodes and Bootstrap instances do not belong in reactive state.
    let menuTrigger = null; // the ⋯ button of the open menu
    let disableModal = null;
    let anonymizeModal = null;
    let inviteDrawer = null;
    let inviteOpener = null; // what had focus when the drawer opened
    let detailsDrawer = null;
    let detailsOpener = null;
    const blankDetails = () => ({ userId: null, firstName: '', lastName: '', email: '', orig: null, loading: false, error: null, errorField: null });
    const blankInvite = () => ({ firstName: '', lastName: '', email: '', role: 'user', loading: false, error: null, errorField: null, sentTo: null, sentName: null, emailSent: null });
    const NETWORK_ERROR = "The server didn't respond. Check your connection and try again.";

    // Icons the shared library does not have (drawn like it: 16×16, stroke = currentColor).
    const UA_ICONS = {
      shield: '<path d="M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4l5-2Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
      power: '<path d="M8 2v5.5M4.7 4.6a5 5 0 1 0 6.6 0" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
      mail: '<rect x="2" y="3.5" width="12" height="9" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M2.5 4.5L8 9l5.5-4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
      'user-plus': '<circle cx="6.5" cy="5.5" r="2.3" stroke="currentColor" stroke-width="1.4"/><path d="M2 14c0-2.6 2-4.2 4.5-4.2S11 11.4 11 14M13 5v4M11 7h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
      'user-minus': '<circle cx="6.5" cy="5.5" r="2.3" stroke="currentColor" stroke-width="1.4"/><path d="M2 14c0-2.6 2-4.2 4.5-4.2S11 11.4 11 14M11 7h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    };
    const UaIcon = {
      props: { name: { type: String, required: true }, size: { type: Number, default: 16 } },
      template: `<svg class="pd-icon" :width="size" :height="size" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false" v-html="paths"></svg>`,
      computed: { paths() { return UA_ICONS[this.name] || ''; } },
    };

    const app = Vue.createApp({
      data() {
        return {
          authed: false,
          loading: true,
          accessDenied: false,
          me: {},
          users: [],
          filter: { status: 'all', role: 'all', search: '' },
          sort: { key: null, dir: null },
          filters: [
            { val: 'all',      label: 'All' },
            { val: 'active',   label: 'Active' },
            { val: 'pending',  label: 'Pending' },
            { val: 'disabled', label: 'Disabled' },
          ],
          headCols: [
            { key: 'name',    label: 'Name' },
            { key: 'role',    label: 'Role' },
            { key: 'status',  label: 'Status' },
            { key: 'invited', label: 'Invited by', plain: true, wide: true },
            { key: 'joined',  label: 'Joined', wide: true },
          ],
          notes: {
            self: "You can't change your own role or access. Ask another admin.",
            locked: 'Only a sysadmin can change a sysadmin account.',
            anonymized: "Personal data was removed. The account can't be restored.",
          },
          banner: null,
          menu: null,
          isPhone: window.matchMedia('(max-width: 767.98px)').matches,
          confirmTarget: null,
          anonAck: false,
          invite: blankInvite(),
          details: blankDetails(),
          detailFields: [
            { name: 'firstName', label: 'First name' },
            { name: 'lastName', label: 'Last name' },
            { name: 'email', label: 'Email' },
          ],
          inviteRoles: [
            { val: 'user',  label: 'User',  desc: 'Works on pipeline, portfolio and planning' },
            { val: 'admin', label: 'Admin', desc: 'Also manages users and master data' },
          ],
        };
      },
      computed: {
        visibleUsers() {
          return R.sortUsers(R.filterUsers(this.users, this.filter), this.sort);
        },
        counts() {
          return R.statusCounts(this.users, this.filter);
        },
        summary() {
          return R.filterSummary(this.filter);
        },
        subtitle() {
          if (this.loading) return 'Loading…';
          const n = this.users.length;
          const p = this.users.filter(u => u.status === 'pending').length;
          let s = `${n} ${n === 1 ? 'user' : 'users'}`;
          if (p) s += this.isPhone ? ` · ${p} pending` : ` · ${p} pending ${p === 1 ? 'invite' : 'invites'}`;
          return s;
        },
        inviteValid() {
          const i = this.invite;
          return !!(i.firstName.trim() && i.lastName.trim() && R.isValidEmail(i.email));
        },
        // Save needs a change and no empty field.
        detailsValid() {
          const d = this.details;
          if (!d.orig) return false;
          const now = { firstName: d.firstName.trim(), lastName: d.lastName.trim(), email: d.email.trim().toLowerCase() };
          if (!now.firstName || !now.lastName || !now.email) return false;
          return Object.keys(now).some(k => now[k] !== d.orig[k]);
        },
        menuUser() {
          return this.menu ? this.users.find(u => u.id === this.menu.userId) : null;
        },
        confirmName() {
          return this.confirmTarget ? R.displayName(this.confirmTarget) : '';
        },
        footerRule() {
          return this.me.role === 'sysadmin'
            ? 'Roles change one step at a time: user → admin → sysadmin.'
            : 'Sysadmin accounts can only be changed by a sysadmin.';
        },
      },
      async created() {
        const user = await initNav('admin', { breadcrumbs: [
          { label: 'Home', href: '/pipeline.html' },
          { label: 'User Admin' },
        ]});
        if (!user) return;
        this.me = user;
        if (!['admin', 'sysadmin'].includes(user.role)) { this.accessDenied = true; return; }
        this.authed = true;
        await this.loadUsers();
        this.loading = false;
      },
      mounted() {
        const el = document.getElementById('inviteDrawer');
        inviteDrawer = new bootstrap.Offcanvas(el);
        el.addEventListener('shown.bs.offcanvas', () => document.getElementById('inviteFirst')?.focus());
        el.addEventListener('hidden.bs.offcanvas', () => {
          this.resetInvite();
          if (inviteOpener) inviteOpener.focus();
        });
        const detEl = document.getElementById('editDetailsDrawer');
        detailsDrawer = new bootstrap.Offcanvas(detEl);
        detEl.addEventListener('shown.bs.offcanvas', () => document.getElementById('details-firstName')?.focus());
        detEl.addEventListener('hidden.bs.offcanvas', () => {
          this.details = blankDetails();
          if (detailsOpener && detailsOpener.isConnected) detailsOpener.focus();
        });
        disableModal = new bootstrap.Modal(document.getElementById('disableModal'));
        const anonEl = document.getElementById('anonymizeModal');
        anonymizeModal = new bootstrap.Modal(anonEl);
        anonEl.addEventListener('shown.bs.modal', () => document.getElementById('anonymizeCancel').focus());
        const phoneQuery = window.matchMedia('(max-width: 767.98px)');
        phoneQuery.addEventListener('change', e => { this.isPhone = e.matches; this.menu = null; });
        document.addEventListener('mousedown', ev => {
          if (this.menu && !ev.target.closest('.ua-menu, .ua-sheet-scrim, .ua-menu-trigger')) this.closeMenu(false);
        });
        document.addEventListener('keydown', ev => {
          if (ev.key === 'Escape' && this.menu) this.closeMenu(true);
        });
      },
      methods: {
        initials: R.initials,
        displayName: R.displayName,
        isAnon: R.isAnonymized,
        kind(u) { return R.rowKind(u, this.me); },
        primary(u) { return R.primaryAction(u, this.me); },

        rowClass(u) {
          const k = this.kind(u);
          return { 'ua-row--self': k === 'self', 'ua-row--busy': !!u._loading };
        },
        avatarClass(u) {
          const k = this.kind(u);
          return { 'ua-avatar--self': k === 'self', 'ua-avatar--anon': k === 'anonymized' };
        },

        menuFor(u) { return R.menuGroups(u, this.me); },
        menuIcon(name) { return name in UA_ICONS ? 'ua-icon' : 'ph-icon'; },

        // The popover opens upwards when the tallest menu would not fit between the button and the viewport bottom.
        openMenu(user, ev) {
          if (this.menu && this.menu.userId === user.id) { this.closeMenu(true); return; }
          menuTrigger = ev.currentTarget;
          const up = menuTrigger.getBoundingClientRect().bottom + 360 > window.innerHeight;
          this.menu = { userId: user.id, up };
          this.$nextTick(() => {
            const first = document.querySelector('.ua-menu [role="menuitem"], .ua-sheet [role="menuitem"]');
            if (first) first.focus();
          });
        },
        closeMenu(returnFocus) {
          this.menu = null;
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
        runItem(user, id) {
          const it = R.menuGroups(user, this.me).flatMap(g => g.items).find(i => i.id === id);
          if (!it || !it.enabled) return;
          this.closeMenu(false);
          if (id === 'make-admin' || id === 'make-user') this.toggleRole(user);
          else if (id === 'grant-sysadmin' || id === 'revoke-sysadmin') this.toggleSysAdmin(user);
          else if (id === 'resend') this.resendInvite(user);
          else if (id === 'enable') this.setStatus(user, 'active');
          else if (id === 'disable') this.askDisable(user);
          else if (id === 'anonymize') this.askAnonymize(user);
          else if (id === 'edit-details') this.openDetails(user);
        },
        openDetails(user) {
          const orig = { firstName: user.first_name || '', lastName: user.last_name || '', email: user.email || '' };
          this.details = { ...blankDetails(), userId: user.id, ...orig, orig };
          detailsOpener = menuTrigger;
          detailsDrawer.show();
        },
        async submitDetails() {
          const d = this.details;
          if (!this.detailsValid || d.loading) return;
          const body = {};
          for (const k of ['firstName', 'lastName', 'email']) if (d[k].trim() !== d.orig[k]) body[k] = d[k];
          d.loading = true;
          d.error = null;
          d.errorField = null;
          try {
            const res = await apiSave('PATCH', `/users/${d.userId}`, body);
            if (res.kind !== 'ok') {
              d.error = res.message || 'Update failed';
              const field = res.kind === 'error' ? res.data?.field : null;
              d.errorField = ['firstName', 'lastName', 'email'].includes(field) ? field : null;
              if (res.kind === 'unknown') await this.loadUsers();
              return;
            }
            const data = res.data;
            const user = this.users.find(u => u.id === d.userId);
            // The server voids the invite sent to the old address (PATCH /api/users/:id).
            const inviteVoided = body.email !== undefined && user?.status === 'pending';
            if (user) Object.assign(user, { first_name: data.first_name, last_name: data.last_name, email: data.email });
            this.setBanner('success', `Details updated for ${data.first_name} ${data.last_name}.`,
              inviteVoided ? 'Their invite was cancelled: use Resend invite to send it to the new address.' : '');
            detailsDrawer.hide();
          } finally {
            d.loading = false;
          }
        },
        askDisable(user) {
          this.confirmTarget = user;
          disableModal.show();
        },
        confirmDisable() {
          disableModal.hide();
          this.setStatus(this.confirmTarget, 'disabled');
        },
        askAnonymize(user) {
          this.confirmTarget = user;
          this.anonAck = false;
          anonymizeModal.show();
        },
        confirmAnonymize() {
          anonymizeModal.hide();
          this.anonymizeUser(this.confirmTarget);
        },

        setBanner(kind, title, text) { this.banner = { kind, title, text }; },
        clearBanner() { this.banner = null; },
        clearFilters() { this.filter = { status: 'all', role: 'all', search: '' }; },
        toggleSort(key) { this.sort = R.nextSort(this.sort, key); },
        ariaSort(key) {
          if (this.sort.key !== key) return 'none';
          return this.sort.dir === 'asc' ? 'ascending' : 'descending';
        },
        sortGlyph(key) {
          if (this.sort.key !== key) return '↕';
          return this.sort.dir === 'asc' ? '↑' : '↓';
        },

        async loadUsers() {
          try {
            const res = await fetch('/api/users', { credentials: 'same-origin' });
            const data = await res.json();
            if (!res.ok) { this.setBanner('error', "Couldn't load users.", data.error || NETWORK_ERROR); return; }
            this.users = data;
          } catch {
            this.setBanner('error', "Couldn't load users.", NETWORK_ERROR);
          }
        },

        openInvite() {
          this.resetInvite();
          inviteOpener = document.activeElement;
          inviteDrawer.show();
        },
        resetInvite() {
          this.invite = blankInvite();
        },
        inviteAnother() {
          this.resetInvite();
          this.$nextTick(() => document.getElementById('inviteFirst')?.focus());
        },

        async submitInvite() {
          // The drawer may reset this.invite while the request runs; the result belongs to the form that sent it.
          const inv = this.invite;
          if (!this.inviteValid || inv.loading) return;
          inv.loading = true;
          inv.error = null;
          inv.errorField = null;
          try {
            const res = await apiSave('POST', '/auth/invite', {
              email: inv.email,
              firstName: inv.firstName,
              lastName: inv.lastName,
              role: inv.role,
            });
            if (res.kind !== 'ok') {
              inv.error = res.message || 'Invite failed';
              if (res.kind === 'error' && res.status === 409) inv.errorField = 'email';
              if (res.kind === 'unknown') await this.loadUsers();
              return;
            }
            inv.emailSent = res.data.emailSent;
            inv.sentTo = inv.email;
            inv.sentName = `${inv.firstName} ${inv.lastName}`;
            await this.loadUsers();
          } finally {
            inv.loading = false;
          }
        },

        // PATCH one user (role or status); the three callers differ only in the body.
        async patchUser(user, body) {
          user._loading = true;
          this.clearBanner();
          try {
            const res = await apiSave('PATCH', `/users/${user.id}`, body);
            if (res.kind !== 'ok') {
              this.setBanner('error', `Couldn't update ${R.displayName(user)}.`, res.message);
              if (res.kind === 'unknown') await this.loadUsers();
              return;
            }
            Object.assign(user, res.data);
          } finally {
            user._loading = false;
          }
        },

        toggleRole(user) {
          return this.patchUser(user, { role: user.role === 'admin' ? 'user' : 'admin' });
        },
        toggleSysAdmin(user) {
          return this.patchUser(user, { role: user.role === 'sysadmin' ? 'admin' : 'sysadmin' });
        },
        setStatus(user, status) {
          return this.patchUser(user, { status });
        },

        async resendInvite(user) {
          user._sending = true;
          this.clearBanner();
          try {
            const res = await apiSave('POST', `/auth/${user.id}/resend-invite`);
            if (res.kind !== 'ok') {
              this.setBanner('error', `Couldn't update ${R.displayName(user)}.`, res.message || 'Resend failed');
              if (res.kind === 'unknown') await this.loadUsers();
              return;
            }
            this.setBanner('success', 'Invite resent.', `A new activation link was sent to ${user.email}. It's valid for 48 hours.`);
          } finally {
            user._sending = false;
          }
        },

        async anonymizeUser(user) {
          user._loading = true;
          this.clearBanner();
          try {
            const res = await apiSave('POST', `/users/${user.id}/anonymize`);
            if (res.kind !== 'ok') {
              this.setBanner('error', `Couldn't update ${R.displayName(user)}.`, res.message || 'Anonymization failed');
              if (res.kind === 'unknown') await this.loadUsers();
              return;
            }
            await this.loadUsers();
          } finally {
            user._loading = false;
          }
        },

        fmtDate(iso) {
          if (!iso) return '—';
          return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        },
      },
    });
    app.component('ph-icon', window.PhIcon);
    app.component('ua-icon', UaIcon);
    app.mount('#app');
  