// ── SHARE LIST COMPONENT ──────────────────────────────────────────────────────
// Reusable Vue component: inline "who has access" list with a remove-share
// action, shared between pipeline.html (#pbDetailPanel) and costgrid.html.
// Adding a new share is deliberately out of scope here — that stays in the
// existing #shareModal (js/shares.js). This component only lists + removes.

window.ShareListComponent = {
  props: {
    resourceType: { type: String, required: true }, // 'cost_grid' | 'project'
    resourceId:   { type: String, required: true },
    canManage:    { type: Boolean, default: false },
  },
  data() {
    return {
      shares: [],
      loading: true,
      error: '',
    };
  },
  computed: {
    api() {
      return this.resourceType === 'project' ? Api.projects.shares : Api.costGrids.shares;
    },
  },
  created() {
    this.load();
  },
  watch: {
    resourceId() {
      this.load();
    },
  },
  methods: {
    displayName(s) {
      return [s.first_name, s.last_name].filter(Boolean).join(' ') || s.email;
    },
    permBadgeStyle(perm) {
      const styles = {
        owner:  'background:#ede9fe;color:#5b21b6',
        editor: 'background:#dcfce7;color:#166534',
        viewer: 'background:#e0f2fe;color:#0369a1',
      };
      return styles[perm] || 'background:#f3f4f6;color:#374151';
    },
    async load() {
      if (!this.resourceId) { this.shares = []; this.loading = false; return; }
      this.loading = true;
      this.error = '';
      try {
        this.shares = await this.api.list(this.resourceId);
      } catch (e) {
        this.error = e.message || 'Failed to load.';
      } finally {
        this.loading = false;
      }
    },
    async removeShare(userId) {
      try {
        await this.api.remove(this.resourceId, userId);
        await this.load();
      } catch (e) {
        alert('Remove failed: ' + (e.message || 'Unknown error'));
      }
    },
  },
  template: `
    <div class="share-list">
      <div class="fw-semibold mb-1" style="font-size:var(--text-xs);color:var(--text-muted)">👥 Shared with</div>
      <div v-if="loading" class="text-muted" style="font-size:var(--text-xs)">Loading…</div>
      <div v-else-if="error" class="text-danger" style="font-size:var(--text-xs)">{{ error }}</div>
      <div v-else-if="!shares.length" class="text-muted" style="font-size:var(--text-xs)">Not shared with anyone yet.</div>
      <div v-else>
        <div v-for="s in shares" :key="s.user_id" class="d-flex align-items-center gap-2 py-1" style="font-size:var(--text-xs)">
          <div style="flex:1;min-width:0">
            <div class="fw-semibold text-truncate">{{ displayName(s) }}</div>
            <div class="text-muted text-truncate" style="font-size:var(--text-2xs)">{{ s.email }}</div>
          </div>
          <span :style="permBadgeStyle(s.permission) + ';font-size:var(--text-2xs);padding:2px 8px;border-radius:999px;font-weight:600'">{{ s.permission }}</span>
          <button v-if="s.permission !== 'owner' && canManage"
                  class="btn btn-sm btn-outline-danger py-0 px-2"
                  style="font-size:var(--text-2xs)" title="Remove" @click="removeShare(s.user_id)">✕</button>
          <div v-else style="width:26px"></div>
        </div>
      </div>
    </div>
  `,
};
