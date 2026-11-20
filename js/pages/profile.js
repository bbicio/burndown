
  // The drawings the shared icon set does not have.
  const MP_ICONS = {
    mail: '<rect x="2" y="3.5" width="12" height="9" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M2.5 4.5L8 8.5l5.5-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
    laptop: '<rect x="3" y="3.5" width="10" height="7" rx="1" stroke="currentColor" stroke-width="1.4"/><path d="M1.8 12.5h12.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    phone: '<rect x="4.5" y="1.8" width="7" height="12.4" rx="1.6" stroke="currentColor" stroke-width="1.4"/><path d="M7.2 12h1.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  };
  const MpIcon = {
    props: { name: { type: String, required: true }, size: { type: Number, default: 16 } },
    template: `<svg class="pd-icon" :width="size" :height="size" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false" v-html="paths"></svg>`,
    computed: { paths() { return MP_ICONS[this.name] || ''; } },
  };
  // API timestamps are ISO/UTC; formatDayText takes 'YYYY-MM-DD'.
  const day = ts => (ts ? formatDayText(String(ts).slice(0, 10)) : '');

  Vue.createApp({
    data() {
      return {
        user: null,
        section: sectionFromHash(location.hash),
        contact: null,
        detailsBanner: '',
        req: { message: '', sending: false, error: '' },
        pw: { current: '', next: '', confirm: '', saving: false, error: '', currentError: '', done: false },
        devices: { list: null, error: '', busy: '' },
      };
    },
    computed: {
      initials() { return this.user ? maskInitials(this.user) : ''; },
      memberSince() { return day(this.user?.created_at); },
      subtitle() {
        const u = this.user;
        return `${u.first_name} ${u.last_name} · ${u.role}` + (this.memberSince ? ` · member since ${this.memberSince}` : '');
      },
      lastChanged() { return day(this.user?.password_changed_at); },
      termsAccepted() { return day(this.user?.terms_accepted_at); },
      strength() { return passwordStrength(this.pw.next); },
      pwState() {
        return passwordFormState(this.pw,
          { email: this.user?.email, firstName: this.user?.first_name, lastName: this.user?.last_name });
      },
      hint() { return PASSWORD_HINT; },
      placeholder() { return PASSWORD_PLACEHOLDER; },
      // One row per method: a v-for, so another method is one more entry.
      twoStepMethods() {
        const ts = this.user?.two_step;
        if (!ts) return [];
        return [{ id: ts.method, title: 'Email code', text: `Codes are sent to ${ts.destination} and expire after 10 minutes.` }];
      },
    },
    watch: {
      section(id) {
        const nav = document.getElementById('profileSubnav');
        nav.setAttribute('data-md-active', id);
        mountMdSubnav(nav.parentElement);
        this.applyChips();
        if (id === 'devices') this.loadDevices();
      },
    },
    async created() {
      window.addEventListener('hashchange', () => { this.section = sectionFromHash(location.hash); });
      const user = await initNav('profile', { breadcrumbs: [
        { label: 'Home', href: '/pipeline.html' },
        { label: 'My profile' },
      ]});
      if (!user) return;
      this.user = user;
      this.applyChips();
      this.loadDevices();
      Api.appSettings.privacyContact().then(c => { this.contact = c; }).catch(() => { this.contact = null; });
    },
    mounted() {
      const nav = document.getElementById('profileSubnav');
      nav.setAttribute('data-md-active', this.section);
      mountMdSubnav(nav.parentElement);
      this.applyChips();
      const drawer = document.getElementById('rectificationDrawer');
      drawer.addEventListener('hidden.bs.offcanvas', () => {
        this.req.error = '';
        document.getElementById('mpRequestBtn')?.focus();
      });
      drawer.addEventListener('shown.bs.offcanvas', () => document.getElementById('mpReqMessage')?.focus());
    },
    methods: {
      day,
      expiry(d) { return deviceExpiry(d.expires_at); },
      // The sub-navigation is rebuilt on every section change: the pills are put back each time.
      applyChips() {
        const method = this.user?.two_step?.method;
        setSubnavChip('two-step', method ? method.charAt(0).toUpperCase() + method.slice(1) : '');
        setSubnavChip('devices', this.devices.list ? String(this.devices.list.length) : '');
      },
      async loadDevices() {
        this.devices.error = '';
        try {
          this.devices.list = await apiFetch('/auth/trusted-devices');
        } catch (e) {
          this.devices.error = e.data?.error || 'Could not load your trusted devices. Please try again.';
        }
        this.applyChips();
      },
      async removeDevice(d) {
        if (this.devices.busy) return;
        this.devices.busy = d.id;
        this.devices.error = '';
        const res = await apiSave('DELETE', '/auth/trusted-devices/' + d.id, null, { background: true });
        // A device already gone (404) leaves the list like a removed one; removing this browser's device
        // also dropped its cookie, so its row goes with it.
        if (res.kind === 'ok' || (res.kind === 'error' && res.status === 404)) {
          this.devices.list = this.devices.list.filter(x => x.id !== d.id);
          this.applyChips();
        } else {
          this.devices.error = res.message;
        }
        this.devices.busy = '';
      },
      removeAll() {
        if (this.devices.busy) return;
        showConfirm('Every device will ask for a code at the next sign-in.', async () => {
          this.devices.busy = 'all';
          this.devices.error = '';
          const res = await apiSave('DELETE', '/auth/trusted-devices', null, { background: true });
          if (res.kind === 'ok') {
            this.devices.list = [];
            this.applyChips();
          } else {
            this.devices.error = res.message;
          }
          this.devices.busy = '';
        }, null, 'Remove all trusted devices?');
      },
      openRequest() {
        this.req.error = '';
        this.detailsBanner = '';
        bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('rectificationDrawer')).show();
      },
      async sendRequest() {
        if (!this.req.message.trim() || this.req.sending) return;
        this.req.sending = true;
        this.req.error = '';
        const res = await apiSave('POST', '/auth/rectification-request', { message: this.req.message });
        if (res.kind === 'ok') {
          this.req.message = '';
          this.detailsBanner = 'Request sent to the admins.';
          bootstrap.Offcanvas.getInstance(document.getElementById('rectificationDrawer'))?.hide();
        } else {
          this.req.error = res.message;
        }
        this.req.sending = false;
      },
      async submitPassword() {
        if (!this.pwState.canSubmit || this.pw.saving) return;
        this.pw.saving = true;
        this.pw.error = '';
        this.pw.currentError = '';
        this.pw.done = false;
        const res = await apiSave('POST', '/auth/change-password', { currentPassword: this.pw.current, newPassword: this.pw.next, newPasswordConfirm: this.pw.confirm });
        if (res.kind === 'ok') {
          this.pw.current = this.pw.next = this.pw.confirm = '';
          this.pw.done = true;
          this.user.password_changed_at = res.data?.password_changed_at;
          this.loadDevices();
        } else if (res.kind === 'error' && res.data?.field === 'currentPassword') {
          this.pw.currentError = res.message;
        } else {
          this.pw.error = res.message;
        }
        this.pw.saving = false;
      },
    },
  }).component('ph-icon', window.PhIcon).component('mp-icon', MpIcon).mount('#app');
