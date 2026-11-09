// js/combo-select.js
// Searchable select (no library, no build step). Option order is decided by the caller.
// options: [{ id, label, hint? }] plus non-selectable group headers { group }. Index 0 of the
// keyboard cursor is the "— none —" entry; selectable options are 1..n (headers are skipped).
// Shared by team.html and attribute-lists.html; needs window.filterComboOptions (js/lib/team-ui.js) and the
// page's ph-icon component. Classic script: register with app.component('combo-select', window.ComboSelect).
window.ComboSelect = {
  props: {
    options: { type: Array, default: () => [] },
    modelValue: { default: undefined },
    placeholder: { type: String, default: 'Select…' },
    disabled: { type: Boolean, default: false },
    ariaLabel: { type: String, default: null },
  },
  emits: ['update:modelValue'],
  data() { return { open: false, query: '', active: 0 }; },
  computed: {
    items() { return this.options.filter(o => !o.group); },
    selected() { return this.items.find(o => o.id === this.modelValue) || null; },
    // Filtered options with their group headers; a header with no option left under it is dropped.
    rows() {
      const keep = new Set(window.filterComboOptions(this.items, this.query));
      const out = [];
      let header = null;
      let n = 0;
      for (const o of this.options) {
        if (o.group) { header = o; continue; }
        if (!keep.has(o)) continue;
        if (header) { out.push({ key: 'g:' + header.group, group: header.group }); header = null; }
        out.push({ key: o.id, opt: o, idx: ++n });
      }
      return out;
    },
    visible() { return this.rows.filter(r => r.opt).map(r => r.opt); },
  },
  methods: {
    openList() {
      if (this.disabled || this.open) return;
      this.open = true;
      this.query = '';
      const idx = this.items.findIndex(o => o.id === this.modelValue);
      this.active = idx >= 0 ? idx + 1 : 0;
      document.addEventListener('mousedown', this.onDocDown);
    },
    closeList() {
      this.open = false;
      this.query = '';
      document.removeEventListener('mousedown', this.onDocDown);
    },
    scrollActive() {
      this.$nextTick(() => {
        const el = this.$refs.list && this.$refs.list.querySelector('.is-active');
        if (el) el.scrollIntoView({ block: 'nearest' });
      });
    },
    onDocDown(e) { if (!this.$el.contains(e.target)) this.closeList(); },
    onInput(e) {
      if (!this.open) this.openList();
      this.query = e.target.value;
      this.active = this.visible.length ? 1 : 0;
    },
    pick(opt) {
      this.$emit('update:modelValue', opt ? opt.id : undefined);
      this.closeList();
    },
    onKey(e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!this.open) this.openList();
        else this.active = Math.min(this.active + 1, this.visible.length);
        this.scrollActive();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.active = Math.max(this.active - 1, 0);
        this.scrollActive();
      } else if (e.key === 'Enter' && this.open) {
        e.preventDefault();
        if (this.query.trim() && !this.visible.length) return;
        if (this.active > this.visible.length) return;
        this.pick(this.active === 0 ? null : this.visible[this.active - 1]);
      } else if (e.key === 'Escape' && this.open) {
        // Only the list closes: the drawer around it must not see this Esc.
        e.preventDefault();
        e.stopPropagation();
        this.closeList();
      }
    },
  },
  beforeUnmount() { document.removeEventListener('mousedown', this.onDocDown); },
  template: `
    <div class="pd-combo" :class="{ 'is-open': open }">
      <input type="text" class="pd-combo-input" autocomplete="off" role="combobox" :aria-expanded="open" :aria-label="ariaLabel"
             :placeholder="placeholder" :disabled="disabled"
             :value="open ? query : (selected ? selected.label : '')"
             @focus="openList" @blur="closeList" @click="openList" @input="onInput" @keydown="onKey">
      <span v-if="selected && !open && selected.hint" class="pd-combo-hint" aria-hidden="true">{{ selected.hint }}</span>
      <ph-icon class="pd-combo-chevron" name="chevron-down" :size="14"></ph-icon>
      <div v-if="open" class="pd-combo-menu" @mousedown.prevent>
        <ul ref="list" class="pd-combo-list" role="listbox">
          <li class="pd-combo-opt pd-combo-none" role="option" :aria-selected="active === 0" :class="{ 'is-active': active === 0 }"
              @mousedown.prevent="pick(null)">— none —</li>
          <template v-for="r in rows" :key="r.key">
            <li v-if="r.group" class="pd-combo-group" role="presentation">{{ r.group }}</li>
            <li v-else class="pd-combo-opt" role="option" :aria-selected="r.opt.id === modelValue"
                :class="{ 'is-active': active === r.idx, 'is-selected': r.opt.id === modelValue }" @mousedown.prevent="pick(r.opt)">
              <span class="pd-combo-label">{{ r.opt.label }}</span>
              <span v-if="r.opt.hint" class="pd-combo-opt-hint">{{ r.opt.hint }}</span>
              <ph-icon v-if="r.opt.id === modelValue" name="check" :size="12"></ph-icon>
            </li>
          </template>
          <li v-if="!visible.length" class="pd-combo-empty">No matches</li>
        </ul>
        <div class="pd-combo-legend" aria-hidden="true"><span>↑↓ move</span><span>Enter select</span><span>Esc close</span></div>
      </div>
    </div>`,
};
