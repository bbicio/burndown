// ── COST GRID CUSTOM FORM CONTROLS ───────────────────────────────────────────
// Three presentational Vue components used only by costgrid.html, registered on
// its app as <cg-date-picker>, <cg-select> and <cg-people-picker> (same pattern
// as js/share-list-component.js). They hold no business logic: each emits a
// value and the page's existing handlers run unchanged.
//
// Pure helpers come from js/lib/cg-controls-calc.js through its window.* bridge
// (this is a classic script, so it cannot `import`). They are only read inside
// methods/computeds, i.e. after every deferred script has run.
//
// The popover mechanism (Teleport to body + fixed position from the trigger's
// getBoundingClientRect(), recomputed on scroll/resize, closed on outside
// mousedown / Escape / select) is the one already proven by the role ⋮ menu in
// costgrid.html — deliberately reused rather than reinvented, so a popover
// opened inside the horizontally scrolling grid is not clipped.

(function () {
  const SVG = {
    chevron: '<svg class="cg-ctl-glyph" viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    calendar: '<svg class="cg-ctl-glyph" viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><rect x="2" y="3.5" width="12" height="10.5" rx="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M2 6.75h12M5.5 2v3M10.5 2v3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
    lock: '<svg class="cg-ctl-glyph" viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true"><path d="M4.5 7V5.2a3.5 3.5 0 1 1 7 0V7M4 7h8a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.2"/></svg>',
    search: '<svg class="cg-pop-search-icon" viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="4.4" stroke="currentColor" stroke-width="1.3"/><path d="M10.4 10.4L14 14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    check: '<svg class="cg-opt-check" viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true"><path d="M2 6L4.8 8.8L10 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    prev: '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true"><path d="M7.5 2.5L4 6l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    next: '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true"><path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    swap: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><path d="M2.5 5.5h9M9 3l2.5 2.5L9 8M13.5 10.5h-9M7 8l-2.5 2.5L7 13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  // Shared open/close/position behaviour. Mixed into all three components.
  const cgPopover = {
    data() {
      return { cgOpen: false, cgPos: { top: 0, left: 0 } };
    },
    computed: {
      cgPopStyle() {
        return { top: this.cgPos.top + 'px', left: this.cgPos.left + 'px', width: this.cgPopWidth + 'px' };
      },
    },
    methods: {
      cgReposition() {
        const el = this.$refs.trigger;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const w = this.cgPopWidth;
        const h = this.cgPopHeight;
        let top = r.bottom + 4;
        if (top + h > window.innerHeight - 8 && r.top - 4 - h > 8) top = r.top - 4 - h;
        let left = this.cgAlignRight ? r.right - w : r.left;
        left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
        this.cgPos = { top, left };
      },
      cgOpenPopover() {
        if (this.disabled || this.locked || this.cgOpen) return;
        this.cgOpen = true;
        this.$nextTick(() => this.cgReposition());
      },
      cgClosePopover(restoreFocus) {
        if (!this.cgOpen) return;
        this.cgOpen = false;
        if (restoreFocus && this.$refs.trigger) this.$refs.trigger.focus();
      },
      cgTogglePopover() {
        if (this.cgOpen) this.cgClosePopover(false); else this.cgOpenPopover();
      },
    },
    mounted() {
      this._cgOutside = (e) => {
        if (!this.cgOpen) return;
        if (this.$el && this.$el.contains && this.$el.contains(e.target)) return;
        if (this.$refs.pop && this.$refs.pop.contains(e.target)) return;
        this.cgClosePopover(false);
      };
      this._cgEsc = (e) => {
        if (e.key === 'Escape' && this.cgOpen) { e.stopPropagation(); this.cgClosePopover(true); }
      };
      this._cgRepos = () => { if (this.cgOpen) this.cgReposition(); };
      document.addEventListener('mousedown', this._cgOutside);
      document.addEventListener('keydown', this._cgEsc);
      window.addEventListener('scroll', this._cgRepos, true);
      window.addEventListener('resize', this._cgRepos);
    },
    beforeUnmount() {
      document.removeEventListener('mousedown', this._cgOutside);
      document.removeEventListener('keydown', this._cgEsc);
      window.removeEventListener('scroll', this._cgRepos, true);
      window.removeEventListener('resize', this._cgRepos);
    },
  };

  // Move DOM focus inside a grid of <button> cells with the arrow keys.
  function moveGridFocus(container, from, delta) {
    if (!container) return;
    const cells = Array.from(container.querySelectorAll('button'));
    let i = cells.indexOf(from);
    if (i < 0) return;
    for (let step = 0; step < cells.length; step++) {
      i += delta;
      if (i < 0 || i >= cells.length) return;
      if (!cells[i].disabled) { cells[i].focus(); return; }
    }
  }

  // ── CgDatePicker ───────────────────────────────────────────────────────────
  window.CgDatePicker = {
    mixins: [cgPopover],
    props: {
      modelValue: { type: String, default: '' },
      mode: { type: String, default: 'month' },     // 'month' | 'day'
      min: { type: String, default: '' },
      // Upper bound, the mirror of `min`: it caps a Start field with its End value so an
      // invalid span cannot be *chosen* in either direction (spec 1.2). Validation of a
      // hand-typed value stays with the separate "cycle C dates" backlog item.
      max: { type: String, default: '' },
      disabled: { type: Boolean, default: false },
      placeholder: { type: String, default: '' },
      ariaLabel: { type: String, default: '' },
    },
    emits: ['update:modelValue'],
    data() {
      return { text: '', viewYear: new Date().getFullYear(), viewMonth: new Date().getMonth() + 1 };
    },
    computed: {
      isDay() { return this.mode === 'day'; },
      cgPopWidth() { return this.isDay ? 252 : 272; },
      cgPopHeight() { return this.isDay ? 290 : 230; },
      cgAlignRight() { return false; },
      locked() { return false; },
      ph() { return this.placeholder || (this.isDay ? 'dd/mm/yyyy' : 'mm/yyyy'); },
      display() {
        return this.isDay ? window.formatItDate(this.modelValue) : window.formatMonthInput(this.modelValue);
      },
      monthCells() { return window.monthGridYear(this.viewYear, { min: this.min || undefined, max: this.max || undefined }); },
      dayCells() {
        return window.dayGridMonth(this.viewYear, this.viewMonth, {
          min: this.min || undefined, max: this.max || undefined, selected: this.modelValue || undefined,
        });
      },
      dayFlat() {
        // Flat 42 cells (6 weeks x 7 days) so the CSS grid and the arrow-key index
        // math line up; leading/trailing blanks stay in place as inert cells.
        const out = [];
        this.dayCells.forEach((week, wi) => week.forEach((d, di) => {
          out.push(Object.assign({ k: d.iso || ('b' + wi + '-' + di) }, d));
        }));
        return out;
      },
      headLabel() {
        return this.isDay ? window.cgMonthLabel(this.viewMonth, true) + ' ' + this.viewYear : String(this.viewYear);
      },
    },
    watch: {
      modelValue: { immediate: true, handler() { this.text = this.display; this.syncView(); } },
      cgOpen(v) { if (v) this.syncView(); },
    },
    methods: {
      syncView() {
        const v = this.modelValue;
        if (this.isDay && /^\d{4}-\d{2}-\d{2}$/.test(v || '')) {
          this.viewYear = Number(v.slice(0, 4)); this.viewMonth = Number(v.slice(5, 7));
        } else if (!this.isDay && /^\d{6}$/.test(v || '')) {
          this.viewYear = Number(v.slice(0, 4)); this.viewMonth = Number(v.slice(4, 6));
        }
      },
      // Review Focus #3: an unparseable entry emits nothing and reverts the display;
      // an emptied field clears the value.
      commitTyped() {
        const raw = (this.text || '').trim();
        if (raw === '') { if (this.modelValue) this.$emit('update:modelValue', ''); this.text = ''; return; }
        const parsed = this.isDay ? window.parseItDate(raw) : window.parseMonthInput(raw);
        if (parsed === null) { this.text = this.display; return; }
        this.text = this.isDay ? window.formatItDate(parsed) : window.formatMonthInput(parsed);
        if (parsed !== this.modelValue) this.$emit('update:modelValue', parsed);
      },
      onEsc() {
        if (this.cgOpen) this.cgClosePopover(true); else this.text = this.display;
      },
      pick(value) {
        this.$emit('update:modelValue', value);
        this.cgClosePopover(true);
      },
      clear() {
        this.$emit('update:modelValue', '');
        this.cgClosePopover(true);
      },
      pickRelativeMonth(offset) {
        const now = new Date();
        const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() + offset, 1));
        const ym = String(d.getUTCFullYear()) + String(d.getUTCMonth() + 1).padStart(2, '0');
        this.pick(ym);
      },
      stepMonth(delta) {
        let m = this.viewMonth + delta, y = this.viewYear;
        while (m < 1) { m += 12; y--; }
        while (m > 12) { m -= 12; y++; }
        this.viewMonth = m; this.viewYear = y;
      },
      onGridKey(e) {
        const map = this.isDay
          ? { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
          : { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };
        const delta = map[e.key];
        if (delta === undefined) return;
        e.preventDefault();
        moveGridFocus(this.$refs.grid, e.target, delta);
      },
    },
    template: `
      <div class="cg-ctl cg-ctl-date" :class="{ 'cg-ctl--disabled': disabled, 'cg-ctl--open': cgOpen }">
        <div class="cg-ctl-field">
          <input ref="trigger" type="text" class="cg-ctl-input" :value="text" :placeholder="ph"
                 :disabled="disabled" :aria-label="ariaLabel" autocomplete="off" inputmode="numeric"
                 :maxlength="isDay ? 10 : 7"
                 @input="text = $event.target.value" @blur="commitTyped"
                 @keydown.enter.prevent="commitTyped" @keydown.esc.prevent.stop="onEsc"
                 @click="cgOpenPopover()">
          <button type="button" class="cg-ctl-iconbtn" :disabled="disabled" tabindex="-1"
                  aria-label="Open calendar" @mousedown.prevent @click="cgTogglePopover">
            ${SVG.calendar}
          </button>
        </div>
        <Teleport to="body">
          <div v-if="cgOpen" ref="pop" class="cg-pop cg-pop-date" :style="cgPopStyle" @mousedown.stop>
            <div class="cg-pop-head">
              <button type="button" class="cg-pop-nav" :aria-label="isDay ? 'Previous month' : 'Previous year'"
                      @click="isDay ? stepMonth(-1) : viewYear--">${SVG.prev}</button>
              <span class="cg-pop-head-label">{{ headLabel }}</span>
              <button type="button" class="cg-pop-nav" :aria-label="isDay ? 'Next month' : 'Next year'"
                      @click="isDay ? stepMonth(1) : viewYear++">${SVG.next}</button>
            </div>

            <template v-if="!isDay">
              <div ref="grid" class="cg-month-grid" @keydown="onGridKey">
                <button v-for="m in monthCells" :key="m.key" type="button" class="cg-month-cell"
                        :class="{ 'is-selected': m.key === modelValue }" :disabled="m.disabled"
                        @click="pick(m.key)">{{ m.label }}</button>
              </div>
              <div class="cg-pop-foot">
                <button type="button" class="cg-pop-foot-btn" @click="pickRelativeMonth(0)">This month</button>
                <button type="button" class="cg-pop-foot-btn" @click="pickRelativeMonth(1)">Next month</button>
                <button type="button" class="cg-pop-clear" @click="clear">Clear</button>
              </div>
            </template>

            <template v-else>
              <div class="cg-day-weekdays">
                <span v-for="w in ['MO','TU','WE','TH','FR','SA','SU']" :key="w">{{ w }}</span>
              </div>
              <div ref="grid" class="cg-day-grid" @keydown="onGridKey">
                <button v-for="c in dayFlat" :key="c.k" type="button" class="cg-day-cell"
                        :class="{ 'cg-day-blank': !c.iso, 'is-selected': c.iso && c.iso === modelValue,
                                  'is-today': c.isToday, 'is-range': c.inRange }"
                        :disabled="c.disabled || !c.iso" @click="pick(c.iso)">{{ c.day }}</button>
              </div>
              <div class="cg-pop-foot">
                <button type="button" class="cg-pop-clear" @click="clear">Clear</button>
              </div>
            </template>
          </div>
        </Teleport>
      </div>
    `,
  };

  // ── CgSelect ───────────────────────────────────────────────────────────────
  window.CgSelect = {
    mixins: [cgPopover],
    props: {
      modelValue: { type: [String, Number], default: '' },
      options: { type: Array, default: () => [] },
      disabled: { type: Boolean, default: false },
      locked: { type: Boolean, default: false },
      searchable: { type: Boolean, default: false },
      placeholder: { type: String, default: 'Select…' },
      ariaLabel: { type: String, default: '' },
      lockedTitle: { type: String, default: '' },
      width: { type: Number, default: 0 },
    },
    emits: ['update:modelValue'],
    data() {
      return { query: '', activeIndex: -1, triggerWidth: 240, typeAhead: '', typeAheadAt: 0 };
    },
    computed: {
      cgPopWidth() { return this.width || Math.max(this.triggerWidth, 220); },
      cgPopHeight() { return 300; },
      cgAlignRight() { return false; },
      selectedOption() {
        return this.options.find(o => String(o.value) === String(this.modelValue)) || null;
      },
      visibleOptions() {
        const q = this.query.trim().toLowerCase();
        if (!q) return this.options;
        return this.options.filter(o =>
          String(o.label || '').toLowerCase().includes(q) || String(o.sub || '').toLowerCase().includes(q));
      },
    },
    watch: {
      cgOpen(v) {
        if (!v) { this.query = ''; this.activeIndex = -1; return; }
        const el = this.$refs.trigger;
        if (el) this.triggerWidth = el.getBoundingClientRect().width;
        this.activeIndex = this.visibleOptions.findIndex(o => String(o.value) === String(this.modelValue));
        this.$nextTick(() => {
          this.cgReposition();
          if (this.searchable && this.$refs.search) this.$refs.search.focus();
        });
      },
    },
    methods: {
      pick(o) {
        if (o.disabled) return;
        if (String(o.value) !== String(this.modelValue)) this.$emit('update:modelValue', o.value);
        this.cgClosePopover(true);
      },
      moveActive(delta) {
        const list = this.visibleOptions;
        if (!list.length) return;
        let i = this.activeIndex;
        for (let step = 0; step < list.length; step++) {
          i = i + delta;
          if (i < 0) i = list.length - 1;
          if (i >= list.length) i = 0;
          if (!list[i].disabled) { this.activeIndex = i; return; }
        }
      },
      onTriggerKey(e) {
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); this.cgOpenPopover(); }
      },
      onListKey(e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); this.moveActive(1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); this.moveActive(-1); return; }
        if (e.key === 'Home') { e.preventDefault(); this.activeIndex = -1; this.moveActive(1); return; }
        if (e.key === 'End') { e.preventDefault(); this.activeIndex = this.visibleOptions.length; this.moveActive(-1); return; }
        if (e.key === 'Enter') {
          e.preventDefault();
          const o = this.visibleOptions[this.activeIndex];
          if (o) this.pick(o);
          return;
        }
        if (!this.searchable && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const now = Date.now();
          this.typeAhead = (now - this.typeAheadAt < 700 ? this.typeAhead : '') + e.key.toLowerCase();
          this.typeAheadAt = now;
          const i = this.visibleOptions.findIndex(o =>
            !o.disabled && String(o.label || '').toLowerCase().startsWith(this.typeAhead));
          if (i >= 0) this.activeIndex = i;
        }
      },
    },
    template: `
      <div class="cg-ctl cg-ctl-select" :class="{ 'cg-ctl--disabled': disabled, 'cg-ctl--locked': locked, 'cg-ctl--open': cgOpen }">
        <button ref="trigger" type="button" class="cg-ctl-field cg-ctl-trigger"
                :disabled="disabled || locked" :title="locked ? lockedTitle : ''" :aria-label="ariaLabel"
                :aria-expanded="cgOpen ? 'true' : 'false'" aria-haspopup="listbox"
                @click="cgTogglePopover" @keydown="onTriggerKey">
          <span v-if="selectedOption && selectedOption.dot" class="cg-ctl-dot" :style="{ background: selectedOption.dot }"></span>
          <span class="cg-ctl-value" :class="{ 'cg-ctl-placeholder': !selectedOption }">{{ selectedOption ? selectedOption.label : placeholder }}</span>
          <span v-if="locked" class="cg-ctl-glyph-wrap">${SVG.lock}</span>
          <span v-else class="cg-ctl-glyph-wrap">${SVG.chevron}</span>
        </button>
        <Teleport to="body">
          <div v-if="cgOpen" ref="pop" class="cg-pop cg-pop-list" :style="cgPopStyle"
               role="listbox" @mousedown.stop @keydown="onListKey">
            <div v-if="searchable" class="cg-pop-search">
              ${SVG.search}
              <input ref="search" type="text" class="cg-pop-search-input" v-model="query"
                     placeholder="Search…" aria-label="Search options" autocomplete="off">
            </div>
            <div class="cg-pop-rows">
              <div v-if="!visibleOptions.length" class="cg-pop-empty">No results.</div>
              <button v-for="(o, i) in visibleOptions" :key="String(o.value)" type="button" class="cg-opt"
                      :class="{ 'is-selected': String(o.value) === String(modelValue), 'is-active': i === activeIndex }"
                      :disabled="o.disabled" :title="o.disabledReason || ''"
                      role="option" :aria-selected="String(o.value) === String(modelValue) ? 'true' : 'false'"
                      @mouseenter="activeIndex = i" @click="pick(o)">
                <span v-if="o.dot" class="cg-ctl-dot" :style="{ background: o.dot }"></span>
                <span class="cg-opt-text">
                  <span class="cg-opt-label">{{ o.label }}</span>
                  <span v-if="o.sub" class="cg-opt-sub">{{ o.sub }}</span>
                </span>
                ${SVG.check}
              </button>
            </div>
          </div>
        </Teleport>
      </div>
    `,
  };

  // ── CgPeoplePicker ─────────────────────────────────────────────────────────
  window.CgPeoplePicker = {
    mixins: [cgPopover],
    props: {
      people: { type: Array, default: () => [] },
      currentId: { type: String, default: '' },
      disabled: { type: Boolean, default: false },
      footerNote: { type: String, default: '' },
      label: { type: String, default: 'Reassign' },
    },
    emits: ['select'],
    data() { return { query: '' }; },
    computed: {
      cgPopWidth() { return 280; },
      cgPopHeight() { return 320; },
      cgAlignRight() { return true; },
      locked() { return false; },
      visiblePeople() {
        const q = this.query.trim().toLowerCase();
        if (!q) return this.people;
        return this.people.filter(p =>
          String(p.name || '').toLowerCase().includes(q) || String(p.email || '').toLowerCase().includes(q));
      },
    },
    watch: {
      cgOpen(v) {
        if (!v) { this.query = ''; return; }
        this.$nextTick(() => { if (this.$refs.search) this.$refs.search.focus(); });
      },
    },
    methods: {
      initials(name) {
        return String(name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
      },
      choose(p) {
        if (p.id === this.currentId) return;
        this.cgClosePopover(true);
        this.$emit('select', p.id);
      },
    },
    template: `
      <div class="cg-ctl cg-people">
        <button ref="trigger" type="button" class="cg-btn-secondary cg-people-trigger" :disabled="disabled"
                :aria-expanded="cgOpen ? 'true' : 'false'" aria-haspopup="dialog" @click="cgTogglePopover">
          ${SVG.swap}<span>{{ label }}</span>
        </button>
        <Teleport to="body">
          <div v-if="cgOpen" ref="pop" class="cg-pop cg-pop-people" :style="cgPopStyle" @mousedown.stop>
            <div class="cg-pop-micro">Reassign owner</div>
            <div class="cg-pop-search">
              ${SVG.search}
              <input ref="search" type="text" class="cg-pop-search-input" v-model="query"
                     placeholder="Search by name or email" aria-label="Search people" autocomplete="off">
            </div>
            <div class="cg-pop-rows">
              <div v-if="!visiblePeople.length" class="cg-pop-empty">No people found.</div>
              <button v-for="p in visiblePeople" :key="p.id" type="button" class="cg-person"
                      :class="{ 'is-current': p.id === currentId }" :disabled="p.id === currentId"
                      @click="choose(p)">
                <span class="cg-person-avatar">{{ initials(p.name) }}</span>
                <span class="cg-person-text">
                  <span class="cg-person-name">{{ p.name }}</span>
                  <span class="cg-person-email">{{ p.email }}</span>
                </span>
                <span v-if="p.id === currentId" class="cg-person-pill">Current owner</span>
              </button>
            </div>
            <div v-if="footerNote" class="cg-pop-note">{{ footerNote }}</div>
          </div>
        </Teleport>
      </div>
    `,
  };
})();
