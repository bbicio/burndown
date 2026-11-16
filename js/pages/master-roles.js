
window.__cfgApp = Vue.createApp({
  data() {
    return {
      ready:        false,
      accessDenied: false,
      loadError:    null,

      roles:    [],

      // List state (memory only)
      query:         '',
      missingOnly:   false,
      closedTeams:   new Set(),
      phoneCurrency: 'EUR',
      lastTeam:      '',   // team of the last role opened or saved: a new role starts in it

      // Role panel state; the saved code is joinCode(team, roleCode)
      rf: { show: false, id: null, title: '', label: '', team: '', roleCode: '', teamOpen: false, teamIdx: -1, rateText: '', overrideTexts: {}, stored: {}, error: null, loading: false },

      // Delete dialog state
      del: { role: null, error: null, blocked: false, loading: false, closeWhenShown: false },

      currencies:    [],

      // Money helpers for the template (bridged on window by js/lib/money.js)
      formatMoney:      (...a) => window.formatMoney(...a),
      formatMoneyInput: (...a) => window.formatMoneyInput(...a),
      readMoneyInput:   (...a) => window.readMoneyInput(...a),
      currencyInfo:     (...a) => window.currencyInfo(...a),
      // Roles helpers (bridged on window by js/lib/master-roles.js)
      isMissingRate:    (...a) => window.isMissingRate(...a),

    };
  },

  computed: {
    columns() { return window.rateColumns(this.currencies); },
    missingCount() { return this.roles.filter(r => window.isMissingRate(r.rate)).length; },
    // Groups of the roles that pass the search and the Missing rates filter.
    groupedRoles() {
      return window.groupRoles(window.filterRoles(this.roles, { query: this.query, missingOnly: this.missingOnly }));
    },
    filtering() { return !!this.query.trim() || this.missingOnly; },
    // Preview only: with a team and no role code yet it reads "TEAM - ROLE", as on the board.
    fullCode() {
      const role = this.rf.roleCode.trim() || (this.rf.team.trim() ? 'ROLE' : '');
      return window.joinCode(this.rf.team, role).toUpperCase();
    },
    teamMatches() {
      const q = this.rf.team.trim().toLowerCase();
      return window.teamOptions(this.roles).filter(t => !q || t.toLowerCase().includes(q));
    },
  },

  async created() {
    const user = await initNav('config', { breadcrumbs: [
      { label: 'Home', href: '/pipeline.html' },
      { label: 'Master Data', href: '/master-clients.html' },
      { label: 'Roles & rates' },
    ]});
    if (!user) return;
    if (!['admin', 'sysadmin'].includes(user.role)) { this.accessDenied = true; return; }
    await this.loadAll();
    this.ready = true;
  },

  mounted() {
    this._onKeydown = e => this.onPanelKeydown(e);
    document.addEventListener('keydown', this._onKeydown);
    // a dialog opened from code gets no focus return from Bootstrap: give it back to what opened it
    this._onDelHidden = () => { this._delShown = false; this.focusBack(this._delOpener, this.del.role?.id); this._delOpener = null; };
    // Esc, the backdrop and Cancel do not dismiss the dialog while its delete runs
    this._onDelHide = e => { if (this.del.loading) e.preventDefault(); };
    this._onDelShown = () => {
      this._delShown = true;
      if (this.del.closeWhenShown) bootstrap.Modal.getInstance(document.getElementById('roleDeleteModal'))?.hide();
    };
    const delModal = document.getElementById('roleDeleteModal');
    delModal?.addEventListener('hidden.bs.modal', this._onDelHidden);
    delModal?.addEventListener('hide.bs.modal', this._onDelHide);
    delModal?.addEventListener('shown.bs.modal', this._onDelShown);
  },
  beforeUnmount() {
    document.removeEventListener('keydown', this._onKeydown);
    document.getElementById('roleDeleteModal')?.removeEventListener('hidden.bs.modal', this._onDelHidden);
    document.getElementById('roleDeleteModal')?.removeEventListener('hide.bs.modal', this._onDelHide);
    document.getElementById('roleDeleteModal')?.removeEventListener('shown.bs.modal', this._onDelShown);
  },

  methods: {
    async loadAll() {
      this.loadError = null;
      try {
        const [roles, currencies] = await Promise.all([
          Api.roles.list(),
          Api.currencies.list(),
        ]);
        this.roles    = roles.map(r => ({ id: r.id, label: r.label, code: r.code, rate: r.hourly_rate || 0, rateOverrides: r.rate_overrides || {} }));
        this.currencies    = currencies;
      } catch (e) {
        this.loadError = e.message || 'Failed to load data.';
      }
    },

    // ── List ──
    isGroupOpen(team) { return this.filtering || !this.closedTeams.has(team); },
    toggleGroup(team) {
      if (this.filtering) return;
      const next = new Set(this.closedTeams);
      if (next.has(team)) next.delete(team); else next.add(team);
      this.closedTeams = next;
    },
    // Tablet and phone open the panel from the row (the Edit link is hidden there).
    onRowClick(role) {
      if (window.matchMedia('(max-width: 1279.98px)').matches) this.openRoleForm(role);
    },
    // A list amount: no decimals when it is a whole number (150, 150,50); the table's unit is in its header.
    rateText(v, code, { symbol = false } = {}) {
      return window.formatMoney(v, code, this.currencies, { symbol, rounded: Number.isInteger(Number(v)) });
    },
    // A non-EUR cell: the role's own override, else "—" with what a proposal would use.
    rateCell(r, cu) {
      const ov = (r.rateOverrides || {})[cu.code];
      if (ov != null) return { text: this.rateText(ov, cu.code), title: window.formatMoney(ov, cu.code, this.currencies) };
      const v = window.fallbackRate(r, cu);
      return { text: '', title: v == null ? 'No rate' : `≈ ${this.rateText(v, cu.code)} from € × rate` };
    },
    // The phone card's value in the currency picked in the segmented control.
    phoneValue(r) {
      const code = this.phoneCurrency;
      if (code === 'EUR') {
        return window.isMissingRate(r.rate)
          ? { text: 'No rate', missing: true, approx: false }
          : { text: this.rateText(r.rate, 'EUR', { symbol: true }), missing: false, approx: false };
      }
      const cu = this.columns.find(c => c.code === code);
      const ov = (r.rateOverrides || {})[code];
      if (ov != null) return { text: this.rateText(ov, code, { symbol: true }), missing: false, approx: false };
      const v = cu ? window.fallbackRate(r, cu) : null;
      return v == null
        ? { text: 'No rate', missing: true, approx: false }
        : { text: '≈ ' + this.rateText(v, code, { symbol: true }), missing: false, approx: true };
    },

    // Text of a stored amount; keepZero makes a stored 0 reopen as '0' (a missing amount stays '').
    amountText(v, code) {
      if (v == null || v === '') return '';
      return window.formatMoneyInput(v, code, this.currencies, { keepZero: true });
    },

    // ── Panel ──
    openRoleForm(role) {
      if (!this.rf.show) this._opener = document.activeElement;
      const overrideTexts = {};
      const stored = { EUR: role?.rate == null ? null : Number(role.rate) };
      for (const [cur, val] of Object.entries(role?.rateOverrides || {})) { overrideTexts[cur] = this.amountText(val, cur); stored[cur] = val == null ? null : Number(val); }
      const split = window.splitCode(role?.code || '');
      const team = role ? split.team : (this.lastTeam || window.teamOptions(this.roles)[0] || '');
      const roleCode = split.role;
      const origCode = role?.code || '';
      if (role && team) this.lastTeam = team;
      this.rf = {
        show:         true,
        id:           role?.id    || null,
        title:        role?.label || '',
        label:        role?.label || '',
        team, roleCode,
        // the code as stored and as it opened: untouched, it is sent back unchanged (spacing included)
        origCode, origTeam: team, origRole: roleCode,
        teamOpen: false, teamIdx: -1,
        rateText:     this.amountText(role?.rate, 'EUR'),
        overrideTexts,
        // the amounts the form opened with: an untouched field is sent back as the stored value, not re-rounded
        stored,
        error: null, loading: false,
      };
      this.$nextTick(() => this.$refs.rfLabel?.focus());
    },
    // Not while a save runs: the save resolves against the form it started from.
    closePanel({ restoreFocus = true } = {}) {
      if (this.rf.loading) return;
      this.rf.show = false;
      const opener = this._opener, roleId = this.rf.id; this._opener = null;
      if (restoreFocus) this.$nextTick(() => this.focusBack(opener, roleId));
    },
    // The second click of the double-click that opened the panel lands on the scrim: not a close.
    onScrimClick(e) { if (e.detail > 1) return; this.closePanel(); },
    // Focus back to what opened the panel or dialog; if Vue re-rendered or removed it, to the role's own
    // button, else to the visible "+ Add".
    focusBack(el, roleId) {
      const visible = n => n && n.isConnected && n.offsetParent !== null;
      if (visible(el) && el !== document.body) { el.focus(); return; }
      const byRole = roleId == null ? [] : [...document.querySelectorAll('[data-role-id="' + roleId + '"]')];
      const target = byRole.find(visible) || [...document.querySelectorAll('.mdr-add')].find(visible);
      target?.focus();
    },
    // Esc closes the panel; Tab stays inside it (it is a modal dialog). The delete dialog never sits above
    // it: the panel closes before that dialog opens.
    onPanelKeydown(e) {
      if (!this.rf.show) return;
      if (e.key === 'Escape') { this.closePanel(); return; }
      if (e.key !== 'Tab') return;
      const drawer = document.querySelector('.mdr-drawer');
      const items = drawer ? [...drawer.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')] : [];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !drawer.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !drawer.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    },
    onTeamKey(e) {
      const n = this.teamMatches.length;
      if (e.key === 'ArrowDown' && n) { e.preventDefault(); this.rf.teamOpen = true; this.rf.teamIdx = (this.rf.teamIdx + 1) % n; }
      else if (e.key === 'ArrowUp' && n) { e.preventDefault(); this.rf.teamOpen = true; this.rf.teamIdx = (this.rf.teamIdx - 1 + n) % n; }
      else if (e.key === 'Enter' && this.rf.teamOpen && this.rf.teamIdx >= 0) { e.preventDefault(); this.pickTeam(this.teamMatches[this.rf.teamIdx]); }
      else if (e.key === 'Escape' && this.rf.teamOpen && n) { e.stopPropagation(); this.rf.teamOpen = false; }
    },
    pickTeam(t) { this.rf.team = t; this.rf.teamOpen = false; this.rf.teamIdx = -1; },
    // The € rate typed so far, when it can be converted (a positive amount and a currency with a rate).
    typedEur(cu) {
      const eur = window.readMoneyInput(this.rf.rateText, 'EUR', this.currencies, { stored: this.rf.stored['EUR'] });
      return typeof eur === 'number' && eur > 0 && Number(cu.current_rate) > 0 ? eur : null;
    },
    overridePlaceholder(cu) {
      const eur = this.typedEur(cu);
      return eur == null ? 'Optional' : '≈ ' + window.formatMoneyInput(eur * cu.current_rate, cu.code, this.currencies);
    },
    overrideHint(cu) {
      if ((this.rf.overrideTexts[cu.code] ?? '').trim()) return `Used as is in ${cu.code} proposals`;
      return this.typedEur(cu) == null ? 'Optional' : `Empty: € rate × ${Number(cu.current_rate)}`;
    },

    // code 'EUR' is the base rate; any other code is that currency's override.
    getMoneyText(code) { return code === 'EUR' ? this.rf.rateText : (this.rf.overrideTexts[code] ?? ''); },
    setMoneyText(code, t) { if (code === 'EUR') this.rf.rateText = t; else this.rf.overrideTexts[code] = t; },

    // Focus shows the unformatted amount, blur the formatted one; blank or invalid text stays as typed.
    onMoneyFocus(code) {
      const text = this.getMoneyText(code);
      const v = window.readMoneyInput(text, code, this.currencies, { stored: this.rf.stored[code] });
      if (typeof v !== 'number' || Number.isNaN(v)) return;
      this.setMoneyText(code, window.formatMoneyInput(v, code, this.currencies, { keepZero: true }));
    },
    onMoneyBlur(code) {
      const v = window.readMoneyInput(this.getMoneyText(code), code, this.currencies, { stored: this.rf.stored[code] });
      if (typeof v !== 'number' || Number.isNaN(v)) return;
      this.setMoneyText(code, window.formatMoney(v, code, this.currencies));
    },

    async saveRole() {
      if (this.rf.loading) return;
      const label = this.rf.label.trim();
      const untouched = this.rf.id && this.rf.team === this.rf.origTeam && this.rf.roleCode === this.rf.origRole;
      const code  = untouched ? this.rf.origCode.trim() : window.joinCode(this.rf.team, this.rf.roleCode);
      this.rf.error = null;
      const badAmount = c => `Enter a valid amount in ${c}, e.g. ${window.moneyFormatExample(c, this.currencies)}.`;

      if (!label) { this.rf.error = 'Label is required.'; return; }
      if (!code)  { this.rf.error = 'Code is required.'; return; }
      if (!this.rf.roleCode.trim()) { this.rf.error = 'Role code is required.'; return; }
      const rate = window.readMoneyInput(this.rf.rateText, 'EUR', this.currencies, { stored: this.rf.stored['EUR'] });
      if (rate === null) { this.rf.error = 'Default rate is required.'; return; }
      if (Number.isNaN(rate)) { this.rf.error = badAmount('EUR'); return; }
      // Every stored override is sent back, those of currencies now inactive (no input) included.
      const rateOverrides = {};
      for (const [cur, text] of Object.entries(this.rf.overrideTexts)) {
        const v = window.readMoneyInput(text, cur, this.currencies, { stored: this.rf.stored[cur] });
        if (v === null) continue;
        if (Number.isNaN(v)) { this.rf.error = badAmount(cur); return; }
        rateOverrides[cur] = v;
      }

      const dup = this.roles.find(r => r.code.toLowerCase() === code.toLowerCase() && r.id !== this.rf.id);
      if (dup) { this.rf.error = `Code "${code}" is already used by role "${dup.label}".`; return; }

      const form = this.rf;
      const saved = code.toUpperCase();   // what the server stores (trim + uppercase)
      form.loading = true;
      try {
        if (form.id) {
          await Api.roles.update(form.id, { label, code, hourlyRate: rate, rateOverrides });
          const r = this.roles.find(r => r.id === form.id);
          if (r) { r.label = label; r.code = saved; r.rate = rate; r.rateOverrides = rateOverrides; }
        } else {
          const created = await Api.roles.create({ label, code, hourlyRate: rate, rateOverrides });
          this.roles.push({ id: created.id, label, code: created.code || saved, rate, rateOverrides });
          form.id = created.id;   // lets focusBack fall back to the new role's button if the opener is gone
        }
        // open the role's group, keep search and filter
        const team = window.extractTeam(saved);
        if (form.team.trim()) this.lastTeam = team;
        if (this.closedTeams.has(team)) { const next = new Set(this.closedTeams); next.delete(team); this.closedTeams = next; }
        form.loading = false;
        if (this.rf === form) this.closePanel();
      } catch (e) {
        form.error = e.message || 'Save failed.';
        if (this.rf === form) this.$nextTick(() => this.$refs.rfLabel?.focus());
      } finally {
        form.loading = false;
      }
    },

    // ── Delete ──
    async deleteRole(role) {
      if (!this._delOpener) this._delOpener = document.activeElement;
      this.del = { role, error: null, blocked: false, loading: false, closeWhenShown: false };
      await this.$nextTick();
      bootstrap.Modal.getOrCreateInstance(document.getElementById('roleDeleteModal')).show();
    },
    deleteFromPanel() {
      if (this.rf.loading) return;   // a running save first: never a dialog above an open panel
      const role = this.roles.find(r => r.id === this.rf.id);
      this._delOpener = this._opener;   // focus goes back to what opened the panel
      this.closePanel({ restoreFocus: false });
      if (role) this.deleteRole(role);
    },
    // A 400 from the server (role used in a cost grid / assigned to a team resource) stays in the dialog.
    // Only the rule refusal disables Delete; a timeout or a server error leaves it to retry.
    async confirmDelete() {
      if (this.del.loading || !this.del.role) return;
      const del = this.del, role = del.role;
      del.loading = true;
      del.error = null;
      try {
        await Api.roles.delete(role.id);
        this.roles = this.roles.filter(r => r.id !== role.id);
        del.loading = false;   // before hide(): the hide.bs.modal guard refuses while a delete runs
        if (this.del === del) {
          if (this._delShown) bootstrap.Modal.getInstance(document.getElementById('roleDeleteModal'))?.hide();
          else del.closeWhenShown = true;
        }
      } catch (e) {
        del.error = e.message || 'Delete failed.';
        del.blocked = /^Cannot delete role /.test(e.data?.error || '');
        // the clicked Delete is now disabled: keep focus (and Esc) inside the dialog
        if (this.del === del) this.$nextTick(() => document.querySelector('#roleDeleteModal .mdr-cancel')?.focus());
      } finally {
        del.loading = false;
      }
    },
  },
}).component('ph-icon', window.PhIcon).mount('#app');
