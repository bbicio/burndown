
const freshAct = () => ({ show: false, code: '', text: '', error: null, saving: false, pickerOpen: false, query: '', activeIndex: 0 });

window.__cfgApp = Vue.createApp({
  data() {
    return {
      ready:        false,
      accessDenied: false,
      globalError:  null,

      currencies:   [],
      histByCode:   {},

      edit:    { code: null, text: '', error: null },
      confirm: { show: false, code: '', symbol: '', oldRate: '', newRate: '', rate: null, error: null, saving: false },
      act:     freshAct(),
      hist:    { code: null, rows: [], loading: false, error: false },
      sheet:   null,
      isPhone: false,
    };
  },

  computed: {
    activeList()  { return this.currencies.filter(c => c.active); },
    eurSymbol()   { return currencyInfo('EUR', this.currencies).symbol; },
    canActivate() { return window.pickableCurrencies(this.currencies).length > 0; },
    actRate()     { return window.parseRateText(this.act.text); },
    actValid()    { return !!this.act.code && window.isValidRate(this.actRate); },
    // Shown only once something was typed: an empty rate just keeps Activate disabled.
    actRateError() { return this.act.text.trim() ? window.rateError(this.actRate) : null; },
    actInverse()  { return window.inverseRate(this.actRate); },
    histCurrency() { return this.currencies.find(c => c.code === this.hist.code) || null; },
    histEntries()  { return window.historyEntries(this.hist.rows); },
    histPoints()   { return window.sparklinePoints(this.hist.rows, 480, 90); },
    sheetInverse() {
      const cur = this.currencies.find(c => c.code === this.edit.code);
      const typed = window.parseRateText(this.edit.text);
      return window.inverseRate(window.isValidRate(typed) ? typed : cur?.current_rate);
    },
    actOptions()  { return window.pickableCurrencies(this.currencies, this.act.query); },
  },

  async created() {
    const user = await initNav('config', { breadcrumbs: [
      { label: 'Home', href: '/pipeline.html' },
      { label: 'Master Data', href: '/master-clients.html' },
      { label: 'Currencies' },
    ]});
    if (!user) return;
    if (!['admin', 'sysadmin'].includes(user.role)) { this.accessDenied = true; return; }
    try { window.__currencies = await Api.currencies.active(); } catch {}
    await this.loadAll();
    this.ready = true;
    this.loadHistories();
  },

  mounted() {
    document.addEventListener('keydown', this.onKeydown);
    document.addEventListener('mousedown', this.onDocMousedown);
    const mq = window.matchMedia('(max-width: 767.98px)');
    this.isPhone = mq.matches;
    this._mq = mq;
    // Crossing the breakpoint moves an open inline row into its sheet and back, so nothing is left hidden.
    this._onMq = ev => {
      this.isPhone = ev.matches;
      this.act.pickerOpen = false;
      this.sheet = window.sheetOnResize(ev.matches, { sheet: this.sheet, actShow: this.act.show, editCode: this.edit.code });
    };
    mq.addEventListener('change', this._onMq);
  },
  unmounted() {
    document.removeEventListener('keydown', this.onKeydown);
    document.removeEventListener('mousedown', this.onDocMousedown);
    this._mq?.removeEventListener('change', this._onMq);
  },

  methods: {
    async loadAll() {
      this.globalError = null;
      try {
        this.currencies = await Api.currencies.list();
      } catch (e) {
        this.globalError = e.message || 'Failed to load data.';
      }
    },

    // One history per active non-EUR currency, for the list's delta and user; a failed one only drops its own.
    async loadHistories(codes) {
      const list = codes || this.currencies.filter(c => c.active && c.code !== 'EUR').map(c => c.code);
      await Promise.all(list.map(async code => {
        try {
          this.histByCode[code] = { rows: await Api.currencies.history(code), error: false };
        } catch {
          this.histByCode[code] = { rows: [], error: true };
        }
      }));
    },

    startEdit(cur) {
      if (this.confirm.saving) return;
      this.cancelActivate();
      this.edit = { code: cur.code, text: window.editText(cur.current_rate), error: null };
      this.focusEditInput();
    },

    // The inline input on wide screens, the sheet's input on phone.
    focusEditInput() {
      this.$nextTick(() => {
        const el = this.sheet === 'edit' ? this.$refs.sheetInput : [].concat(this.$refs.editInput || [])[0];
        if (el) { el.focus(); el.select(); }
      });
    },

    cancelEdit() {
      if (this.confirm.saving) return;
      this.edit = { code: null, text: '', error: null };
    },

    saveEdit() {
      if (this.confirm.saving) return;
      const cur = this.currencies.find(c => c.code === this.edit.code);
      if (!cur) return;
      const rate = window.parseRateText(this.edit.text);
      if (!window.isValidRate(rate)) { this.edit.error = window.rateError(rate) || 'Rate must be a positive number'; return; }
      if (window.sameRate(rate, cur.current_rate)) { this.edit.error = 'The rate is unchanged'; return; }
      this.edit.error = null;
      this.confirm = {
        show: true, code: cur.code, symbol: cur.symbol,
        oldRate: window.formatRate(cur.current_rate), newRate: window.formatRate(rate),
        rate, error: null, saving: false, openedAt: Date.now(),
      };
      this.$nextTick(() => this.$refs.confirmBtn?.focus());
    },

    // Enter on the focused Confirm: a held key (repeat) or a second press right after the Enter that opened
    // the dialog is not a decision.
    onConfirmKey(e) {
      if (e.repeat || !window.confirmReady(this.confirm.openedAt, Date.now())) return;
      this.confirmRate();
    },

    // On phone Confirm sits where Save rate was: the second tap of a double tap is not a decision either.
    onConfirmClick() {
      if (!window.confirmReady(this.confirm.openedAt, Date.now())) return;
      this.confirmRate();
    },

    async confirmRate() {
      if (this.confirm.saving) return;
      this.confirm.saving = true; this.confirm.error = null;
      const code = this.confirm.code;
      try {
        await Api.currencies.updateRate(code, this.confirm.rate);
        this.confirm.show = false;
        this.edit = { code: null, text: '', error: null };
        this.sheet = null;
        await this.loadAll();
        this.loadHistories([code]);
      } catch (e) {
        this.confirm.error = e.message || 'Failed to update rate';
        // Confirm lost the focus while it was disabled: give it back so Enter retries.
        this.confirm.saving = false;
        this.$nextTick(() => this.$refs.confirmBtn?.focus());
      }
      this.confirm.saving = false;
    },

    closeConfirm() {
      if (this.confirm.saving) return;
      this.confirm.show = false;
      if (this.edit.code) this.focusEditInput();
    },

    openActivate() {
      this.cancelEdit();
      this.act = { ...freshAct(), show: true, pickerOpen: true };
      this.$nextTick(() => this.$refs.pickerSearch?.focus());
    },

    async activateCurrency() {
      if (!this.actValid || this.act.saving) return;
      this.act.saving = true; this.act.error = null;
      const code = this.act.code;
      try {
        await Api.currencies.activate(code, this.actRate);
        this.act = freshAct();
        this.sheet = null;
        await this.loadAll();
        this.loadHistories([code]);
      } catch (e) {
        this.act.error = e.message || 'Failed to activate currency';
        this.act.saving = false;
      }
    },

    cancelActivate() {
      if (this.act.saving) return;
      this.act = freshAct();
    },

    togglePicker() {
      if (this.act.pickerOpen) { this.act.pickerOpen = false; return; }
      this.openPicker();
    },

    openPicker() {
      this.act.pickerOpen = true; this.act.query = ''; this.act.activeIndex = 0;
      this.$nextTick(() => this.$refs.pickerSearch?.focus());
    },

    pickCurrency(code) {
      this.act.code = code; this.act.pickerOpen = false; this.act.query = '';
      this.$nextTick(() => this.$refs.actInput?.focus());
    },

    onPickerKey(e) {
      const n = this.actOptions.length;
      if (e.key === 'ArrowDown') { e.preventDefault(); if (n) this.act.activeIndex = (this.act.activeIndex + 1) % n; }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (n) this.act.activeIndex = (this.act.activeIndex - 1 + n) % n; }
      else if (e.key === 'Enter') { e.preventDefault(); const opt = this.actOptions[this.act.activeIndex]; if (opt) this.pickCurrency(opt.code); }
    },

    onDocMousedown(e) {
      if (!this.act.pickerOpen) return;
      const box = [].concat(this.$refs.picker || [])[0];
      if (box && !box.contains(e.target)) this.act.pickerOpen = false;
    },

    // Shows the list's cached history at once, then fetches again; a failed fetch keeps the cached rows out of sight.
    async openHistory(cur) {
      const cached = this.histByCode[cur.code];
      const hasRows = !!cached && !cached.error;
      this.hist = { code: cur.code, rows: hasRows ? cached.rows : [], loading: !hasRows, error: false };
      try {
        const rows = await Api.currencies.history(cur.code);
        this.histByCode[cur.code] = { rows, error: false };
        if (this.hist.code === cur.code) this.hist.rows = rows;
      } catch {
        if (this.hist.code === cur.code) { this.hist.rows = []; this.hist.error = true; }
      }
      if (this.hist.code === cur.code) this.hist.loading = false;
    },
    closeHistory()   { this.hist = { code: null, rows: [], loading: false, error: false }; },
    reloadHistory()  { const cur = this.currencies.find(c => c.code === this.hist.code); if (cur) this.openHistory(cur); },

    openEditSheet(cur) {
      if (this.confirm.saving) return;
      this.cancelActivate();
      this.edit = { code: cur.code, text: window.editText(cur.current_rate), error: null };
      this.sheet = 'edit';
      this.focusEditInput();
    },

    openActivateSheet() {
      this.cancelEdit();
      this.act = { ...freshAct(), show: true };
      this.sheet = 'activate';
    },

    closeSheet() {
      if (this.sheet === 'activate') { if (this.act.saving) return; this.cancelActivate(); }
      else if (this.sheet === 'edit') this.cancelEdit();
      this.sheet = null;
    },

    // One handler for every layer: Esc closes only the topmost one.
    onKeydown(e) {
      if (e.key !== 'Escape') return;
      if (this.act.pickerOpen) { this.act.pickerOpen = false; return; }
      if (this.confirm.show)   { this.closeConfirm(); return; }
      if (this.sheet)          { this.closeSheet(); return; }
      if (this.hist.code)      { this.closeHistory(); return; }
      if (this.edit.code)      { this.cancelEdit(); return; }
      if (this.act.show)       { this.cancelActivate(); }
    },

    nameOf(code)   { return this.currencies.find(c => c.code === code)?.name || ''; },
    symbolOf(code) { return this.currencies.find(c => c.code === code)?.symbol || ''; },
    fmtRate(r)     { return window.formatRate(r); },
    invRate(r)     { return window.inverseRate(r); },
    fmtDate(ts)    { return window.formatRateDate(ts); },
    fmtDateTime(ts)  { return window.formatRateDateTime(ts); },
    fmtHistDelta(d)  { return window.formatHistoryDelta(d); },
    deltaOf(code) {
      const h = this.histByCode[code];
      return h && !h.error ? window.rateDelta(h.rows) : null;
    },
    deltaText(code) { return window.formatDelta(this.deltaOf(code)); },
    updatedBy(code) {
      const h = this.histByCode[code];
      return h && !h.error ? (h.rows[0]?.updated_by || '') : '';
    },
  },
}).component('ph-icon', window.PhIcon).mount('#app');
