
window.__cfgApp = Vue.createApp({
  data() {
    return {
      ready:        false,
      accessDenied: false,
      globalError:  null,

      view:  'list',
      query: '',
      collapsed: {},
      addOpen: null,

      clients:   [],   // { id, name, groupId }
      groups:    [],   // { id, name, pots, clients }
      ratecards: [],
      currencies: [],

      rateClientId: null,
      rcSearch: '', rcOnlyCustom: false, rcHowOpen: false, rcFamClosed: {}, rcPhoneCurrency: 'EUR',

      // Client rate card state
      rc: { title: 'Rate Card', client: null, loading: false, loadError: null, msg: null, msgKind: 'success', msgSeq: 0, saving: false, reloadable: false, id: null, version: 0, roles: [], rows: [] },

      // New client row / client name edit / new group row / group rename
      cf: { show: false, name: '', groupId: null, error: null, loading: false },
      ce: { id: null, name: '', error: null, loading: false },
      ng: { show: false, name: '', error: null, loading: false, forClientId: null },
      gr: { id: null, name: '', error: null, loading: false },
    };
  },

  computed: {
    sortedGroups() { return [...this.groups].sort((a, b) => a.name.localeCompare(b.name)); },
    groupsById()   { return new Map(this.groups.map(g => [g.id, g])); },
    ngForClientName() { return (this.ng.forClientId && this.clients.find(c => c.id === this.ng.forClientId)?.name) || ''; },
    filtered()     { return window.filterClients(this.clients, this.groupsById, this.query); },
    sections() {
      if (this.view === 'list') return [{ key: 'all', flat: true, group: null, clients: this.filtered }];
      const q = this.query.trim().toLowerCase();
      return window.groupSections(this.filtered, this.groups)
        .filter(s => !q || s.clients.length || (s.group && s.group.name.toLowerCase().includes(q)))
        .map(s => ({ key: s.group ? s.group.id : 'none', flat: false, ...s }));
    },
    hasMatches() { return this.filtered.length > 0; },
    // Rows of the open rate card with each cell's source; a row's family groups it. Filters apply to the rows
    // shown, the "x of y customized" counts stay those of the whole family.
    rcFamilies() {
      const rows = this.rc.rows || [];
      const codes = ['EUR', ...this.rcExtraCurrencies.map(cu => cu.code)];
      const withCells = rows.map(row => {
        const cells = Object.fromEntries(codes.map(c => [c, window.cellSource({ row, code: c, currencies: this.currencies })]));
        return { row, cells, isCustom: codes.some(c => cells[c].kind === 'custom'), family: window.roleFamily(row.code) };
      });
      const q = this.rcSearch.trim().toLowerCase();
      // "Only customized" looks at the saved texts, so a row does not vanish while its field is being edited
      const shown = withCells.filter(r => (!q || (r.row.label || '').toLowerCase().includes(q) || (r.row.code || '').toLowerCase().includes(q))
        && (!this.rcOnlyCustom || window.rowIsCustom({ row: r.row, codes, currencies: this.currencies, saved: true })));
      return window.sortFamilies([...new Set(shown.map(r => r.family))]).map(name => {
        const all = withCells.filter(r => r.family === name);
        return { name, rows: shown.filter(r => r.family === name), total: all.length, custom: all.filter(r => r.isCustom).length };
      });
    },
    rcCurrencyCodes() { return ['EUR', ...this.rcExtraCurrencies.map(cu => cu.code)]; },
    rcPhoneSymbol() { return window.currencyInfo(this.rcPhoneCurrency, this.currencies).symbol; },
    rcPhoneHint() {
      const code = this.rcPhoneCurrency;
      if (code === 'EUR') return 'Empty = agency € rate.';
      const rate = Number(this.currencies.find(cu => cu.code === code)?.current_rate);
      return `Empty = agency ${code} rate; if missing, € rate × ${rate}.`;
    },
    rcCustomRowCount() {
      const codes = ['EUR', ...this.rcExtraCurrencies.map(cu => cu.code)];
      return (this.rc.rows || []).filter(row => codes.some(c => window.cellSource({ row, code: c, currencies: this.currencies }).kind === 'custom')).length;
    },
    // Cells whose amount differs from the one the card was opened (or last saved) with.
    rcDirtyCount() {
      let n = 0;
      for (const row of this.rc.rows || []) {
        for (const code of Object.keys(row.texts)) {
          const now = row.texts[code], was = row.initial?.[code] ?? '';
          if (now === was) continue;
          const a = window.readMoneyInput(now, code, this.currencies, { stored: row.stored[code] });
          const b = window.readMoneyInput(was, code, this.currencies, { stored: row.stored[code] });
          if (!(a === b || (Number.isNaN(a) && Number.isNaN(b)))) n++;
        }
      }
      return n;
    },
    rateClientName() { return this.clients.find(c => c.id === this.rateClientId)?.name || ''; },
    rcExtraCurrencies() { return this.currencies.filter(cu => cu.code !== 'EUR'); },
    eurSymbol() { return window.currencyInfo('EUR', this.currencies).symbol; },
  },

  async created() {
    const user = await initNav('config', { breadcrumbs: [
      { label: 'Home', href: '/pipeline.html' },
      { label: 'Master Data', href: '/master-clients.html' },
      { label: 'Clients & groups' },
    ]});
    if (!user) return;
    if (!['admin', 'sysadmin'].includes(user.role)) { this.accessDenied = true; return; }
    // the client rate card builds its non-EUR columns from window.__currencies
    try { window.__currencies = await Api.currencies.active(); } catch {}
    this.currencies = window.__currencies || [];
    this.view = window.readUrlState(location.search).view;
    await this.loadAll();
    this.ready = true;
    this.applyUrl();
  },

  mounted() {
    document.addEventListener('click', () => { this.addOpen = null; });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      this.addOpen = null;
      this.closeNewDrawer();
    });
    window.addEventListener('popstate', () => this.onPopState());
    window.addEventListener('beforeunload', e => {
      if (this.rateClientId && this.rcDirtyCount > 0) { e.preventDefault(); e.returnValue = ''; }
    });
    // The list crumb of the breadcrumb leaves the rate card through the same unsaved-changes check.
    document.addEventListener('click', e => {
      const a = e.target.closest && e.target.closest('#breadcrumb-bar a[href^="/master-clients.html"]');
      if (a && this.rateClientId) { e.preventDefault(); this.backToList(); }
    });
  },

  watch: {
    // The banner lives at the top of the page, above the table: a failed action on a long list
    // would otherwise set the message where nobody is looking.
    globalError(msg) { if (msg) window.scrollTo({ top: 0, behavior: 'smooth' }); },
  },

  methods: {
    async loadAll() {
      this.globalError = null;
      try {
        const [clients, groups, ratecards] = await Promise.all([
          Api.clients.list(), Api.clientGroups.list(), Api.ratecards.list(),
        ]);
        this.groups = groups;
        this.ratecards = ratecards;
        const groupOf = new Map(groups.flatMap(g => (g.clients || []).map(c => [c.id, g.id])));
        this.clients = clients.map(c => ({ id: c.id, name: c.name, groupId: groupOf.get(c.id) ?? null }));
        return true;
      } catch (e) {
        this.globalError = e.message || 'Failed to load data.';
        return false;
      }
    },

    // Re-reads the groups (and each client's group) after a change; answers true when it worked, false
    // when it failed (the page stays as it is). The caller decides what to say.
    async reloadGroups() {
      try {
        const groups = await Api.clientGroups.list();
        const groupOf = new Map(groups.flatMap(g => (g.clients || []).map(c => [c.id, g.id])));
        this.groups = groups;
        this.clients.forEach(c => { c.groupId = groupOf.get(c.id) ?? null; });
        return true;
      } catch (e) {
        return false;
      }
    },

    setView(v) {
      this.view = v;
      const qs = window.urlFor({ view: v, clientId: null });
      history.replaceState(null, '', qs || location.pathname);
    },

    groupName(id) { return this.groupsById.get(id)?.name || ''; },
    countLabel(sec) {
      const n = this.clients.filter(c => sec.group ? c.groupId === sec.group.id : !c.groupId).length;
      return `${n} client${n === 1 ? '' : 's'}`;
    },
    potLabel(g) {
      const first = g.pots[0].year;
      return g.pots.length > 1 ? `POT · ${first} +${g.pots.length - 1}` : `POT · ${first}`;
    },
    groupDeleteHint(g) {
      return g.pots && g.pots.length
        ? `Can't delete: this group has a POT (${g.pots.map(p => p.year).join(', ')}). Remove the POT first.`
        : 'Delete group';
    },
    addCandidates(g) {
      return this.clients.filter(c => c.groupId !== g.id).sort((a, b) => a.name.localeCompare(b.name));
    },
    customCountOf(clientId) {
      return window.customRateCount(this.ratecards.find(r => r.client_id === clientId));
    },
    isCollapsed(sec) { return !!this.collapsed[sec.key]; },
    toggleSection(sec) { this.collapsed = { ...this.collapsed, [sec.key]: !this.collapsed[sec.key] }; },

    // ── Clients ──
    startNewClient() {
      this.ng.show = false;
      this.cf = { show: true, name: '', groupId: null, error: null, loading: false };
      this.$nextTick(() => { const el = this.$refs.cfName; (Array.isArray(el) ? el[0] : el)?.focus(); });
    },
    cancelNewClient() { this.cf.show = false; },
    closeNewDrawer() { this.cancelNewClient(); this.cancelNewGroup(); },

    async createClient() {
      const name = this.cf.name.trim();
      this.cf.error = null;
      if (!name) { this.cf.error = 'Name is required.'; return; }
      const dup = this.clients.find(c => c.name.toLowerCase() === name.toLowerCase());
      if (dup) { this.cf.error = `A client named "${dup.name}" already exists.`; return; }

      this.cf.loading = true;
      try {
        const res = await window.apiSave('POST', '/clients', { name });
        if (res.kind !== 'ok') {
          this.cf.error = res.message || 'Save failed.';
          // the write may have happened: show what the server has
          if (res.kind === 'unknown') await this.loadAll();
          return;
        }
        const client = { id: res.data.id, name: res.data.name || name, groupId: null };
        this.clients.push(client);
        const toGroupId = this.cf.groupId;
        if (toGroupId) {
          try {
            await window.clientGroupWrites(window.apiSave).assignClient(toGroupId, client.id);
            client.groupId = toGroupId;
          } catch (e) {
            // the client exists, without a group: the form closes, so a retry cannot hit the duplicate-name check
            this.cf.show = false;
            this.globalError = e.message || 'The client was created, but adding it to the group failed.';
            await this.reloadGroups();
            return;
          }
          if (!(await this.reloadGroups())) this.globalError = window.SAVED_NOT_RELOADED;
        }
        this.cf.show = false;
      } finally {
        this.cf.loading = false;
      }
    },

    startClientEdit(c) {
      this.ce = { id: c.id, name: c.name, error: null, loading: false };
      this.$nextTick(() => { const el = this.$refs.ceName; (Array.isArray(el) ? el[0] : el)?.focus(); });
    },
    cancelClientEdit() { this.ce = { id: null, name: '', error: null, loading: false }; },

    async saveClientEdit() {
      const name = this.ce.name.trim();
      this.ce.error = null;
      if (!name) { this.ce.error = 'Name is required.'; return; }
      const dup = this.clients.find(c => c.name.toLowerCase() === name.toLowerCase() && c.id !== this.ce.id);
      if (dup) { this.ce.error = `A client named "${dup.name}" already exists.`; return; }

      this.ce.loading = true;
      const res = await window.apiSave('PATCH', '/clients/' + this.ce.id, { name });
      if (res.kind !== 'ok') {
        this.ce.error = res.message || 'Save failed.';
        this.ce.loading = false;
        if (res.kind === 'unknown') await this.loadAll();
        return;
      }
      const c = this.clients.find(c => c.id === this.ce.id);
      if (c) c.name = res.data?.name || name;
      this.cancelClientEdit();
    },

    deleteClient(client) {
      showConfirm(`Delete client "${client.name}"? This can't be undone.`, async () => {
        client._loading = true;
        const res = await window.apiSave('DELETE', '/clients/' + client.id);
        if (res.kind === 'ok') {
          this.clients = this.clients.filter(c => c.id !== client.id);
          if (!(await this.reloadGroups())) this.globalError = window.SAVED_NOT_RELOADED;
          return;
        }
        // the write may have happened: show what the server has (loadAll clears the banner, so it runs first)
        if (res.kind === 'unknown') await this.loadAll();
        else client._loading = false;
        this.globalError = res.message || 'Delete failed.';
      }, null, 'Delete client');
    },

    // The group of a client changes by remove + assign (see moveClient); the picker of that row stays
    // disabled until it is done, and a failure puts the previous group back.
    async moveTo(client, toGroupId) {
      if (client._moving) return;
      this.globalError = null;
      const fromGroupId = client.groupId || null;
      if (fromGroupId === (toGroupId || null)) return;
      client._moving = true;
      client.groupId = toGroupId || null;
      try {
        await window.moveClient({ clientId: client.id, fromGroupId, toGroupId: toGroupId || null }, window.clientGroupWrites(window.apiSave));
      } catch (e) {
        client.groupId = fromGroupId;
        this.globalError = e.message || 'Could not change the group.';
      } finally {
        const reloaded = await this.reloadGroups();
        if (!reloaded && !this.globalError) this.globalError = window.SAVED_NOT_RELOADED;
        client._moving = false;
      }
    },

    // ── Groups ──
    startNewGroup() {
      this.cf.show = false;
      this.ng = { show: true, name: '', error: null, loading: false, forClientId: null };
      this.$nextTick(() => { const el = this.$refs.ngName; (Array.isArray(el) ? el[0] : el)?.focus(); });
    },
    startNewGroupFor(client) {
      this.startNewGroup();
      this.ng.forClientId = client.id;
    },
    cancelNewGroup() { this.ng.show = false; },

    async createGroup() {
      this.globalError = null;
      const name = this.ng.name.trim();
      this.ng.error = window.groupNameError(name, this.groups, null);
      if (this.ng.error) return;

      this.ng.loading = true;
      try {
        const res = await window.saveAndReload('POST', '/client-groups', { name }, () => this.reloadGroups());
        if (res.kind !== 'ok') {
          this.ng.error = res.message || 'Save failed.';
          return;
        }
        const client = this.ng.forClientId && this.clients.find(c => c.id === this.ng.forClientId);
        this.ng.show = false;
        this.setView('group');
        if (!res.reloaded) { this.globalError = window.SAVED_NOT_RELOADED; return; }
        if (client) await this.moveTo(client, res.data.id);
      } finally {
        this.ng.loading = false;
      }
    },

    startRename(g) {
      this.gr = { id: g.id, name: g.name, error: null, loading: false };
      this.$nextTick(() => { const el = this.$refs.grName; (Array.isArray(el) ? el[0] : el)?.focus(); });
    },
    cancelRename() { this.gr = { id: null, name: '', error: null, loading: false }; },

    async saveRename() {
      this.globalError = null;
      this.gr.error = window.groupNameError(this.gr.name, this.groups, this.gr.id);
      if (this.gr.error) return;
      this.gr.loading = true;
      const res = await window.saveAndReload('PATCH', '/client-groups/' + this.gr.id, { name: this.gr.name.trim() }, () => this.reloadGroups());
      if (res.kind !== 'ok') {
        this.gr.error = res.message || 'Save failed.';
        this.gr.loading = false;
        return;
      }
      if (!res.reloaded) this.globalError = window.SAVED_NOT_RELOADED;
      this.cancelRename();
    },

    deleteGroup(g) {
      showConfirm(`Delete group "${g.name}"? Its clients become ungrouped.`, async () => {
        // a refusal (e.g. 409: a POT was created for the group since the page loaded) leaves the page as it is
        const res = await window.saveAndReload('DELETE', '/client-groups/' + g.id, undefined, () => this.reloadGroups());
        if (res.kind === 'ok') {
          if (!res.reloaded) this.globalError = window.SAVED_NOT_RELOADED;
          return;
        }
        // an unknown outcome has reloaded already; any other outcome did not write, but the list is refreshed as before
        if (res.kind !== 'unknown') await this.reloadGroups();
        this.globalError = res.message || 'Delete failed.';
      }, null, 'Delete group');
    },

    // ── Rate card (sub-view of ?client=<id>) ──
    setBreadcrumbs(client) {
      const items = [
        { label: 'Home', href: '/pipeline.html' },
        { label: 'Master Data', href: '/master-clients.html' },
      ];
      if (client) {
        items.push({ label: 'Clients & groups', href: '/master-clients.html' }, { label: `${client.name} · Rate card` });
      } else {
        items.push({ label: 'Clients & groups' });
      }
      window.updateBreadcrumbs(items);
    },
    enterRateCard(client) {
      this.rateClientId = client.id;
      this.rcSearch = ''; this.rcOnlyCustom = false; this.rcHowOpen = false; this.rcFamClosed = {}; this.rcPhoneCurrency = 'EUR';
      this.setBreadcrumbs(client);
      window.scrollTo({ top: 0 });
      return this.openClientRatecard(client);
    },
    openRateCard(client) {
      history.pushState(null, '', window.urlFor({ view: this.view, clientId: client.id }));
      return this.enterRateCard(client);
    },
    // Applies the URL (load, back/forward): a rate card for a known client, else the list.
    applyUrl() {
      const st = window.readUrlState(location.search);
      this.view = st.view;
      if (st.clientId) {
        const client = this.clients.find(c => c.id === st.clientId);
        if (client) { this.enterRateCard(client); return; }
        this.globalError = 'Client not found.';
        history.replaceState(null, '', window.urlFor({ view: st.view, clientId: null }) || location.pathname);
      }
      this.rateClientId = null;
      this.setBreadcrumbs(null);
    },
    async onPopState() {
      const st = window.readUrlState(location.search);
      if (this.rateClientId && st.clientId === this.rateClientId) return; // same card: nothing to re-read, nothing to discard
      if (this.rateClientId && !(await this.leaveRateCard())) {
        history.pushState(null, '', window.urlFor({ view: this.view, clientId: this.rateClientId }));
        return;
      }
      this.applyUrl();
    },
    // true when there is nothing unsaved or the user agreed to leave
    leaveRateCard() {
      if (this.rcDirtyCount === 0) return Promise.resolve(true);
      return new Promise(resolve => {
        showConfirm('You have unsaved rate changes. Leave without saving?', () => resolve(true), () => resolve(false), 'Unsaved changes');
      });
    },
    async backToList() {
      if (!(await this.leaveRateCard())) return;
      history.pushState(null, '', window.urlFor({ view: this.view, clientId: null }) || location.pathname);
      this.rateClientId = null;
      this.setBreadcrumbs(null);
    },
    cellPlaceholder(cell, code) {
      return cell.value > 0 ? this.amountText(cell.value, code) : '—';
    },
    cellCaption(cell, code) {
      return { custom: 'Custom', agency: 'Agency', 'agency-currency': `Agency ${code}`, converted: 'From € × rate',
               missing: code === 'EUR' ? 'No rate · set one' : 'No rate' }[cell.kind];
    },
    // Phone: the line under a role name says where the amount comes from in the selected currency.
    phoneSource(r) {
      const code = this.rcPhoneCurrency, cell = r.cells[code];
      const agency = r.row.defaults[code];
      if (code === 'EUR') return agency > 0 ? `Agency ${this.moneyText(agency, 'EUR')}` : 'No agency rate';
      if (agency != null) return `Agency ${this.moneyText(agency, code)}`;
      if (cell.kind === 'missing') return 'No agency rate';
      const rate = Number(this.currencies.find(cu => cu.code === code)?.current_rate);
      return `No agency ${code} · from € × ${rate}`;
    },
    resetRcRow(row) { Object.keys(row.texts).forEach(c => { row.texts[c] = ''; }); },
    discardRc() { this.rc.rows.forEach(row => { row.texts = { ...row.initial }; }); },
    async refreshRatecards() {
      try { this.ratecards = await Api.ratecards.list(); } catch { /* the list pills keep their last values */ }
    },

    // Text of a stored amount; keepZero makes a stored 0 reopen as '0'
    // (a missing amount stays '').
    amountText(v, code) {
      if (v == null || v === '') return '';
      return window.formatMoneyInput(v, code, this.currencies, { keepZero: true });
    },
    moneyText(v, code) { return window.formatMoney(v, code, this.currencies); },

    rcPlaceholder(row, code) {
      const d = row.defaults[code];
      return d != null ? `${this.moneyText(d, code)} (agency)` : 'agency default';
    },
    // Focus shows the unformatted amount, blur the formatted one; blank or invalid text stays as typed.
    onRcFocus(row, code) {
      const v = window.readMoneyInput(row.texts[code], code, this.currencies, { stored: row.stored[code] });
      if (typeof v !== 'number' || Number.isNaN(v)) return;
      row.texts[code] = window.formatMoneyInput(v, code, this.currencies, { keepZero: true });
    },
    onRcBlur(row, code) {
      const v = window.readMoneyInput(row.texts[code], code, this.currencies, { stored: row.stored[code] });
      if (typeof v !== 'number' || Number.isNaN(v)) return;
      row.texts[code] = window.formatMoney(v, code, this.currencies);
    },

    async openClientRatecard(client) {
      this.rc = { title: `Rate Card — ${client.name}`, client, loading: true, loadError: null, msg: null, msgKind: 'success', msgSeq: 0, saving: false, reloadable: false, id: null, version: 0, roles: [], rows: [] };
      // A later open replaces this.rc: this load writes only to the state it was started for.
      const state = this.rc;

      try {
        // Roles are read afresh: the save replaces the whole set, so a role created since the page
        // loaded must have its row, or its entry would be dropped.
        const [allRc, roleList] = await Promise.all([Api.ratecards.list(), Api.roles.list()]);
        const roles = roleList.map(r => ({
          id: r.id, label: r.label, code: r.code,
          rate: r.hourly_rate != null ? Number(r.hourly_rate) : null, rateOverrides: r.rate_overrides || {},
        }));

        // Find or auto-create this client's ratecard
        let rc = allRc.find(r => r.client_id === client.id);
        if (!rc) {
          const res = await window.apiSave('POST', '/ratecards', { name: client.name, clientId: client.id });
          if (res.kind !== 'ok') { state.loadError = res.message; return; }
          rc = res.data;
        }

        state.roles = roles;
        state.rows = this.ratecardRows(rc, roles);
        state.id = rc.id;
        state.version = rc.version ?? 0;
      } catch (e) {
        state.loadError = e.message || 'Failed to load.';
      } finally {
        state.loading = false;
      }
    },

    // The modal's rows for a card as the server answers it (list, create or save): one per role.
    ratecardRows(rc, roles) {
      const entryOf = {};
      (rc.entries || []).forEach(e => { entryOf[String(e.roleId ?? e.role_id)] = e; });

      const extra = this.rcExtraCurrencies.map(cu => cu.code);
      return roles.map(r => {
        const e = entryOf[String(r.id)];
        const eur = e ? (e.hourlyRate ?? e.hourly_rate ?? null) : null;
        const ov = (e && (e.rateOverrides ?? e.rate_overrides)) || {};
        const defaults = { EUR: r.rate != null ? Number(r.rate) : null };
        const texts = { EUR: this.amountText(eur, 'EUR') };
        const stored = { EUR: eur == null ? null : Number(eur) };
        extra.forEach(c => {
          defaults[c] = r.rateOverrides?.[c] ?? null;
          texts[c] = this.amountText(ov[c], c);
          stored[c] = ov[c] == null ? null : Number(ov[c]);
        });
        // Overrides in a currency with no column (deactivated since) are kept, so a save does not drop them.
        const hidden = {};
        Object.entries(ov).forEach(([c, v]) => { if (v != null && c !== 'EUR' && !extra.includes(c)) hidden[c] = v; });
        return { roleId: String(r.id), label: r.label, code: r.code, defaults, texts, stored, hidden, initial: { ...texts } };
      });
    },

    async saveClientRatecard() {
      if (!this.rc.id) return;
      this.rc.msg = null;
      const built = window.buildRatecardEntries(this.rc.rows, this.currencies);
      if (built.error) {
        this.rc.msg = `Enter a valid amount in ${built.error.code}, e.g. ${window.moneyFormatExample(built.error.code, this.currencies)}.`;
        this.rc.msgKind = 'error';
        return;
      }

      const state = this.rc;
      state.saving = true;
      state.reloadable = false;
      try {
        const res = await window.apiSave('PATCH', '/ratecards/' + state.id + '/entries', { version: state.version, entries: built.entries });
        if (res.kind !== 'ok') {
          // A refused save: the rows stay dirty and the server's message is shown.
          state.msg = res.message;
          state.msgKind = 'error';
          state.reloadable = res.kind === 'conflict' || res.kind === 'unknown';
          return;
        }
        // The server's card is the new reference for "unsaved changes" and for the amounts' stored value.
        state.version = res.data.version;
        state.rows = this.ratecardRows(res.data, state.roles);
        state.msg = 'Rates saved successfully.';
        state.msgKind = 'success';
        const seq = ++state.msgSeq;
        setTimeout(() => { if (state.msgSeq === seq && state.msgKind === 'success') state.msg = null; }, 3000);
        this.refreshRatecards();
      } finally {
        state.saving = false;
      }
    },
    // Reload after a conflict or a lost answer: the client's card is read again, the edits discarded.
    reloadClientRatecard() {
      if (this.rc.saving) return;
      return this.openClientRatecard(this.rc.client);
    },
  },
}).component('ph-icon', window.PhIcon).mount('#app');
