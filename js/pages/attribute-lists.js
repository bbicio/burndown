
    const TOPIC_STATES = [
      { status: 'proposed', label: 'Proposed' },
      { status: 'approved', label: 'Approved' },
      { status: 'rejected', label: 'Rejected' },
    ];

    // Icons missing from js/lib/icons.js, drawn in the same 16×16 style.
    const AL_ICONS = {
      power: '<path d="M8 2v5.5M4.7 4.6a5 5 0 1 0 6.6 0" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
      ban: '<circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4"/><path d="M4.1 11.9L11.9 4.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
      'rotate-ccw': '<path d="M3 8a5 5 0 1 0 1.5-3.6M3 2.5V5h2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
      merge: '<path d="M4 2.5v3.5a3 3 0 0 0 3 3h5M12 9.1l-2.2-2.2M12 9.1l-2.2 2.2M4 13.5V9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
    };
    const AlIcon = {
      props: { name: { type: String, required: true }, size: { type: Number, default: 16 } },
      template: '<svg class="pd-icon" :width="size" :height="size" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false" v-html="paths"></svg>',
      computed: { paths() { return AL_ICONS[this.name] || ''; } },
    };
    const ITEM_FILTERS = [
      { val: 'active', label: 'Active' },
      { val: 'inactive', label: 'Inactive' },
      { val: 'all', label: 'All' },
    ];
    let menuTrigger = null;   // the ⋯ button of the open row menu (focus returns to it)

    Vue.createApp({
      data() {
        return {
          authed: false,
          ready: false,
          accessDenied: false,
          loadError: false,
          retrying: false,
          me: {},
          lists: [],
          items: [],
          itemsLoading: false,
          itemsError: false,        // the shown list's items failed to load (its banner says so; no empty state)
          listsLoaded: false,       // GET /api/attribute-lists has succeeded at least once
          itemFilters: ITEM_FILTERS,
          itemStatus: 'active',
          itemText: '',
          topicText: '',
          // { kind: 'success'|'error', strong?, text, undo?: { listId, itemId, status }, viewRejected? }
          cardBanner: null,
          undoing: false,
          menuFor: null,            // 'item:<id>' | 'topic:<id>' of the open row menu
          menuUp: false,
          topics: [],
          topicStates: TOPIC_STATES,
          selection: { kind: 'none' },   // { kind: 'list', id } | { kind: 'topics', status } | { kind: 'none' }
          listForm: { mode: 'new', id: null, name: '', slug: '', error: null, saving: false },
          itemForm: { mode: 'new', id: null, listId: null, listName: '', label: '', error: null, saving: false },
          topicForm: { mode: 'new', id: null, status: 'approved', name: '', error: null, saving: false },
          reviewedThisSession: 0,   // Approve / Reject / Merge of a proposed topic since the page loaded
          mergeForm: { source: null, targetId: undefined, ack: false, error: null, saving: false },
        };
      },
      computed: {
        counts() { return window.topicCounts(this.topics); },
        currentList() { return this.selection.kind === 'list' ? this.lists.find(l => l.id === this.selection.id) || null : null; },
        itemCountsNow() { return window.itemCounts(this.items, this.itemText); },
        visibleItems() { return window.filterItems(this.items, { status: this.itemStatus, text: this.itemText }); },
        emptyItemsText() { return window.emptyItemsLine(this.itemStatus, this.itemText); },
        slugPreview() { return window.slugify(this.listForm.name) || '—'; },
        visibleTopics() { return window.filterTopics(this.topics, { status: this.selection.status, text: this.topicText }); },
        progress() { return window.sessionProgress(this.reviewedThisSession, this.counts.proposed); },
        progressText() {
          const p = this.progress;
          return p.resolved ? p.resolved + ' of ' + p.total + ' reviewed this session' : 'None reviewed yet this session';
        },
        topicNote() {
          return {
            proposed: "Approve keeps the agent's name. Rename first if the wording needs fixing; merge if the same competence already exists.",
            approved: 'Approved topics appear in experience profiles in Team. Renames, rejections and merges show there immediately, without recalculation.',
            rejected: 'Rejected topics are hidden from profiles and the agent never proposes them again. Restore makes a topic approved.',
          }[this.selection.status];
        },
        isTopics() { return this.selection.kind === 'topics'; },
        primaryLabel() { return this.isTopics ? 'New topic' : 'New list'; },
        selectionKey() {
          if (this.selection.kind === 'list') return 'list:' + this.selection.id;
          if (this.selection.kind === 'topics') return 'topics:' + this.selection.status;
          return '';
        },
        selectionLabel() {
          if (this.currentList) return this.currentList.name;
          if (this.isTopics) return TOPIC_STATES.find(s => s.status === this.selection.status).label;
          return '';
        },
        mergeOptions() { return this.mergeForm.source ? window.mergeTargetOptions(this.topics, this.mergeForm.source) : []; },
        mergeTarget() { return this.topics.find(t => t.id === this.mergeForm.targetId) || null; },
      },
      async created() {
        const user = await initNav('attributelists', { breadcrumbs: [
          { label: 'Home', href: '/pipeline.html' },
          { label: 'Attribute Lists' },
        ]});
        if (!user) return;
        this.me = user;
        if (!['admin', 'sysadmin'].includes(user.role)) { this.accessDenied = true; return; }
        this.authed = true;
        await this.loadAll();
        this.ready = true;
      },
      mounted() {
        this._topicDrawer = this.drawer('topicDrawer', 'topicName');
        // The merge drawer focuses its title, not the combo: focusing the combo would open its list at once.
        this._mergeDrawer = this.drawer('mergeDrawer', 'mergeDrawerTitle');
        // Esc in the confirmation closes only the confirmation: Bootstrap's modal handles the key on its own element,
        // and focus is inside the modal, so the drawer's offcanvas (which listens on its element) never sees it.
        const confirmEl = document.getElementById('mergeConfirmModal');
        this._mergeConfirm = new bootstrap.Modal(confirmEl);
        confirmEl.addEventListener('shown.bs.modal', () => document.getElementById('mergeConfirmTitle')?.focus());
        confirmEl.addEventListener('hidden.bs.modal', () => {
          const back = this._mergeConfirm.opener;
          this._mergeConfirm.opener = null;
          if (back && document.contains(back) && document.getElementById('mergeDrawer').classList.contains('show')) back.focus();
        });
        this._listDrawer = this.drawer('listDrawer', 'listName');
        this._itemDrawer = this.drawer('itemDrawer', 'itemLabel');
        // Row menu: Esc closes it (focus back to ⋯) before any drawer sees it; a press outside closes it.
        document.addEventListener('keydown', ev => {
          if (ev.key === 'Escape' && this.menuFor) { ev.stopImmediatePropagation(); this.closeMenu(true); }
        }, true);
        document.addEventListener('mousedown', ev => {
          if (this.menuFor && !ev.target.closest('.pd-row-menu-wrap')) this.closeMenu(false);
        });
      },
      methods: {
        // Reads: apiFetch inside try/catch. Never throws; `data` is the parsed body (or null).
        async read(path) {
          try {
            return { ok: true, data: await apiFetch(path), message: null };
          } catch (err) {
            return { ok: false, data: null, message: (err && err.message) || 'Network error. Please try again.' };
          }
        },

        // Lists and topics together; the first list is selected unless the current selection still exists.
        async loadAll() {
          const [okLists, okTopics] = await Promise.all([this.loadLists(), this.loadTopics()]);
          this.loadError = !(okLists && okTopics);
          const keep = (this.selection.kind === 'list' && this.lists.some(l => l.id === this.selection.id)) || this.isTopics;
          if (!keep) {
            if (this.lists.length) this.select({ kind: 'list', id: this.lists[0].id });
            else this.selection = { kind: 'none' };
          } else if (this.currentList) {
            await this.loadItems();   // select() was not called: reload the shown list's items once
          }
        },
        async retryLoad() {
          this.retrying = true;
          await this.loadAll();
          this.retrying = false;
        },
        async loadLists() {
          const r = await this.read('/attribute-lists');
          if (r.ok) { this.lists = r.data; this.listsLoaded = true; }
          return r.ok;
        },
        async loadTopics() {
          const r = await this.read('/topics');
          if (r.ok) this.topics = r.data.map(t => ({ ...t, _busy: null }));
          return r.ok;
        },
        // A response is stale when another list (by id) has been selected meanwhile; reloading the lists replaces
        // their objects, so identity would drop a valid response.
        async loadItems() {
          if (!this.currentList) return;
          const listId = this.currentList.id;
          this.itemsLoading = !this.items.length;
          const r = await this.read(`/attribute-lists/${listId}/items`);
          // The flag belongs to the list on screen: cleared for this list, or when no list is shown any more.
          if (this.selection.kind !== 'list' || this.selection.id === listId) this.itemsLoading = false;
          if (this.selection.kind !== 'list' || this.selection.id !== listId) return;
          this.itemsError = !r.ok;
          if (r.ok) this.items = r.data.map(it => ({ ...it, _loading: false }));
          else this.setCardBanner({ kind: 'error', text: r.message });
          return r;
        },

        isSelected(sel) {
          const s = this.selection;
          return s.kind === sel.kind && (sel.kind === 'list' ? s.id === sel.id : s.status === sel.status);
        },
        // A new selection starts clean: search cleared, Active filter, no banner, no open menu.
        select(sel) {
          this.selection = sel;
          this.itemText = '';
          this.itemStatus = 'active';
          this.topicText = '';
          this.clearCardBanner();
          this.menuFor = null;
          if (sel.kind === 'list') { this.items = []; this.itemsError = false; this.loadItems(); }
        },
        onSelectKey(key) {
          const [kind, val] = key.split(':');
          this.select(kind === 'list' ? { kind, id: val } : { kind, status: val });
        },
        setCardBanner(b) { this.cardBanner = b; },
        clearCardBanner() { this.cardBanner = null; },
        showAllItems() { this.itemStatus = 'all'; this.itemText = ''; },

        // ── Row menu (items and topics) ──
        // The popover opens upwards when it would not fit between the button and the viewport bottom.
        openMenu(key, ev) {
          if (this.menuFor === key) { this.closeMenu(true); return; }
          menuTrigger = ev.currentTarget;
          this.menuUp = menuTrigger.getBoundingClientRect().bottom + 240 > window.innerHeight;
          this.menuFor = key;
          this.$nextTick(() => {
            const first = document.querySelector('.pd-row-menu [role="menuitem"]');
            if (first) first.focus();
          });
        },
        closeMenu(returnFocus) {
          this.menuFor = null;
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
        // The menu closes before the action starts; focus goes back to ⋯, and a drawer returns it there.
        runItemMenu(it, action) {
          const opener = menuTrigger;
          this.closeMenu(true);
          if (action === 'edit') this.openItemDrawer('edit', it, { currentTarget: opener });
          else this.setItemStatus(it, it.status === 'active' ? 'inactive' : 'active');
        },

        // PATCH an item's status. The ids are captured now, so an Undo started later always targets this item of
        // this list, whatever is selected by then; the row and the counts are updated only where they still exist.
        async setItemStatus(it, status) {
          const listId = this.currentList.id;
          const itemId = it.id;
          const label = it.label;
          const was = it.status;
          it._loading = true;
          const res = await apiSave('PATCH', '/attribute-lists/' + listId + '/items/' + itemId, { status });
          it._loading = false;
          const here = this.selection.kind === 'list' && this.selection.id === listId;
          if (res.kind !== 'ok') {
            if (here) this.setCardBanner({ kind: 'error', text: res.message });
            return;
          }
          this.applyItemStatus(listId, itemId, res.data.status, was);
          if (!here) return;
          this.setCardBanner(status === 'inactive'
            ? { kind: 'success', strong: 'Deactivated "' + label + '".', text: "It's no longer offered when tagging. Existing tags stay.", undo: { listId, itemId, status: 'active' } }
            : { kind: 'success', strong: 'Activated "' + label + '".', text: "It's offered again when tagging.", undo: { listId, itemId, status: 'inactive' } });
        },
        // Applies a confirmed status to the row (if its list is still shown) and to the list's active count. `was` is
        // the status captured before the PATCH: the row may have been reloaded with the new status meanwhile.
        applyItemStatus(listId, itemId, status, was) {
          const list = this.lists.find(l => l.id === listId);
          const row = this.selection.kind === 'list' && this.selection.id === listId ? this.items.find(x => x.id === itemId) : null;
          if (row) row.status = status;
          if (list && was !== status) list.active_item_count = (list.active_item_count || 0) + (status === 'active' ? 1 : -1);
        },
        // The opposite PATCH, on the ids captured by the action; a successful Undo closes its banner.
        async runUndo() {
          const u = this.cardBanner && this.cardBanner.undo;
          if (!u) return;
          const row = this.items.find(x => x.id === u.itemId);
          const was = u.status === 'active' ? 'inactive' : 'active';
          this.undoing = true;
          if (row) row._loading = true;
          const res = await apiSave('PATCH', '/attribute-lists/' + u.listId + '/items/' + u.itemId, { status: u.status });
          if (row) row._loading = false;
          this.undoing = false;
          const here = this.selection.kind === 'list' && this.selection.id === u.listId;
          if (res.kind !== 'ok') { if (here) this.setCardBanner({ kind: 'error', text: res.message }); return; }
          this.applyItemStatus(u.listId, u.itemId, res.data.status, was);
          if (this.cardBanner && this.cardBanner.undo === u) this.clearCardBanner();
        },

        // An offcanvas that focuses its field when shown and gives focus back to its opener when hidden.
        drawer(id, fieldId) {
          const el = document.getElementById(id);
          const d = new bootstrap.Offcanvas(el);
          el.addEventListener('shown.bs.offcanvas', () => document.getElementById(fieldId)?.focus());
          el.addEventListener('hidden.bs.offcanvas', () => {
            if (d.opener && document.contains(d.opener)) d.opener.focus();
            d.opener = null;
          });
          return d;
        },
        openDrawer(d, ev) { d.opener = (ev && ev.currentTarget) || document.activeElement; d.show(); },

        openListDrawer(mode, ev) {
          const l = mode === 'rename' ? this.currentList : null;
          this.listForm = { mode, id: l ? l.id : null, name: l ? l.name : '', slug: l ? l.slug : '', error: null, saving: false };
          this.openDrawer(this._listDrawer, ev);
        },
        async submitListForm() {
          const form = this.listForm;
          if (form.saving) return;
          form.saving = true;
          form.error = null;
          const res = form.mode === 'rename'
            ? await apiSave('PATCH', '/attribute-lists/' + form.id, { name: form.name })
            : await apiSave('POST', '/attribute-lists', { name: form.name });
          form.saving = false;
          if (res.kind !== 'ok') { form.error = res.message; return; }
          this._listDrawer.hide();
          // A list created on the server but missing from a failed reload cannot be selected: the page shows the
          // load error (with Try again) instead of an empty content area.
          const reloaded = await this.loadLists();
          if (!reloaded) this.loadError = true;
          const name = res.data.name;
          if (form.mode === 'new' && reloaded) this.select({ kind: 'list', id: res.data.id });
          if (reloaded) this.setCardBanner({ kind: 'success', strong: form.mode === 'new' ? 'Created "' + name + '".' : 'Renamed to "' + name + '".', text: '' });
        },

        openItemDrawer(mode, it, ev) {
          const l = this.currentList;
          this.itemForm = { mode, id: it ? it.id : null, listId: l.id, listName: l.name, label: it ? it.label : '', error: null, saving: false };
          this.openDrawer(this._itemDrawer, ev);
        },
        async submitItemForm() {
          const form = this.itemForm;
          if (form.saving) return;
          form.saving = true;
          form.error = null;
          const base = '/attribute-lists/' + form.listId + '/items';
          const res = form.mode === 'edit'
            ? await apiSave('PATCH', base + '/' + form.id, { label: form.label })
            : await apiSave('POST', base, { label: form.label });
          form.saving = false;
          if (res.kind !== 'ok') { form.error = res.message; return; }
          this._itemDrawer.hide();
          const list = this.lists.find(l => l.id === form.listId);
          if (form.mode === 'new' && list) list.active_item_count = (list.active_item_count || 0) + 1;
          if (!(this.selection.kind === 'list' && this.selection.id === form.listId)) return;
          // A failed reload has already put its error in the card: no success banner over a stale table.
          const reloaded = await this.loadItems();
          if (!reloaded || !reloaded.ok) return;
          this.setCardBanner({ kind: 'success', strong: (form.mode === 'new' ? 'Added "' : 'Saved "') + res.data.label + '".', text: '' });
        },

        onPrimary(ev) { if (this.isTopics) this.openTopicDrawer('new', null, ev); else this.openListDrawer('new', ev); },

        descriptionsText(n) { return window.descriptionsText(n); },
        busyText(action) { return { approve: 'Approving…', reject: 'Rejecting…', restore: 'Restoring…' }[action]; },
        markReviewed() { this.reviewedThisSession++; },
        runTopicMenu(t, action) {
          const opener = menuTrigger;
          this.closeMenu(true);
          if (action === 'rename') this.openTopicDrawer('rename', t, { currentTarget: opener });
          else if (action === 'reject') this.topicAction(t, 'reject');
          else this.openMerge(t, { currentTarget: opener });
        },
        // Approve / Reject / Restore. The list is reloaded whatever the outcome (as before the redesign); a proposed
        // topic that leaves the queue counts as reviewed. Returns whether the server accepted it.
        async topicAction(t, action) {
          const name = t.name;
          const wasProposed = t.status === 'proposed';
          t._busy = action;
          const res = await apiSave('POST', '/topics/' + t.id + '/' + action);
          // A successful reload replaces the row objects (spinner gone); a failed one leaves this row, so clear it.
          const reloaded = await this.loadTopics();
          if (!reloaded) t._busy = null;
          const show = this.isTopics;
          // The row usually leaves the table: focus that was on it (or on a closed drawer) goes to the topics search.
          this.$nextTick(() => {
            const at = document.activeElement;
            if (!at || at === document.body) document.querySelector('.al-search--topics input')?.focus();
          });
          if (res.kind !== 'ok') {
            const reloadText = reloaded ? 'The list was reloaded. Server: ' : "The list couldn't be reloaded. Server: ";
            if (show) this.setCardBanner({ kind: 'error', strong: "Couldn't " + action + ' "' + name + '".', text: reloadText + res.message });
            return false;
          }
          if (wasProposed && action !== 'restore') this.markReviewed();
          if (!show) return true;
          if (action === 'approve') this.setCardBanner({ kind: 'success', strong: 'Approved "' + name + '".', text: 'It now shows in experience profiles in Team.' });
          else if (action === 'reject') this.setCardBanner({ kind: 'success', strong: 'Rejected "' + name + '".', text: "It's hidden and won't be proposed again.", viewRejected: true });
          else this.setCardBanner({ kind: 'success', strong: 'Restored "' + name + '".', text: "It's approved again and shows in experience profiles." });
          return true;
        },
        openTopicDrawer(mode, t, ev) {
          this.topicForm = { mode, id: t ? t.id : null, status: t ? t.status : 'approved', name: t ? t.name : '', error: null, saving: false };
          this.openDrawer(this._topicDrawer, ev);
        },
        async submitTopicForm() {
          const form = this.topicForm;
          if (form.saving) return;
          form.saving = true;
          form.error = null;
          const res = form.mode === 'rename'
            ? await apiSave('PATCH', '/topics/' + form.id, { name: form.name })
            : await apiSave('POST', '/topics', { name: form.name });
          form.saving = false;
          if (res.kind !== 'ok') { form.error = res.message; return; }
          this._topicDrawer.hide();
          const reloaded = await this.loadTopics();
          const name = res.data && res.data.name ? res.data.name : form.name.trim();
          if (!reloaded) {
            const done = form.mode === 'new' ? 'Created "' + name + '"' : 'Renamed to "' + name + '"';
            if (this.isTopics) this.setCardBanner({ kind: 'error', strong: done + ", but the topics couldn't be reloaded.", text: 'Reload the page to see the change.' });
            return;
          }
          if (form.mode === 'new') {
            this.select({ kind: 'topics', status: 'approved' });
            this.setCardBanner({ kind: 'success', strong: 'Created "' + name + '".', text: "It's approved and in the agent's vocabulary." });
          } else if (this.isTopics) {
            this.setCardBanner({ kind: 'success', strong: 'Renamed to "' + name + '".', text: '' });
          }
        },
        openMerge(t, ev) {
          this.mergeForm = { source: t, targetId: undefined, ack: false, error: null, saving: false };
          this.openDrawer(this._mergeDrawer, ev);
        },
        openMergeConfirm(ev) {
          this.mergeForm.ack = false;
          this.mergeForm.error = null;
          this._mergeConfirm.opener = ev.currentTarget;
          this._mergeConfirm.show();
        },
        backToMergeDrawer() { this._mergeConfirm.hide(); },
        closeMerge() {
          this._mergeConfirm.opener = null;
          this._mergeConfirm.hide();
          this._mergeDrawer.hide();
        },
        rejectInstead() {
          const source = this.mergeForm.source;
          this.closeMerge();
          this.topicAction(source, 'reject');
        },
        // A refused merge keeps the confirmation (and the drawer) open with the server's message; only a merge the
        // server accepted counts a proposed source as reviewed. The banner reads the target's count after the reload.
        async submitMerge() {
          const form = this.mergeForm;
          if (form.saving) return;
          const source = form.source;
          const targetId = form.targetId;
          const targetName = this.mergeTarget.name;
          const wasProposed = source.status === 'proposed';
          form.saving = true;
          form.error = null;
          const res = await apiSave('POST', '/topics/' + source.id + '/merge', { targetId });
          form.saving = false;
          if (res.kind !== 'ok') { form.error = res.message; return; }
          // The source row (and its ⋯ opener) disappears with the reload: focus goes to the topics search instead.
          this._mergeDrawer.opener = document.querySelector('.al-search--topics input');
          this.closeMerge();
          const reloaded = await this.loadTopics();
          if (wasProposed) this.markReviewed();
          if (!this.isTopics) return;
          // The merge happened, but the table and the target's count are stale: say so rather than quote them.
          if (!reloaded) {
            this.setCardBanner({ kind: 'error', strong: 'Merged "' + source.name + '" into "' + targetName + '", but the topics couldn\'t be reloaded.', text: 'Reload the page to see the change.' });
            return;
          }
          const target = this.topics.find(t => t.id === targetId);
          const n = target ? target.usage_count : 0;
          this.setCardBanner({ kind: 'success', strong: 'Merged "' + source.name + '" into "' + targetName + '".', text: '"' + targetName + '" is now used in ' + window.descriptionsText(n) + '.' });
        },
      },
    }).component('ph-icon', window.PhIcon).component('al-icon', AlIcon).component('combo-select', window.ComboSelect).mount('#app');
  