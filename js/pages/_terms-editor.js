
  Vue.createApp({
    data() {
      return {
        ready: false,
        accessDenied: false,
        me: {},
        terms: { version: 1, content: '', updatedAt: null, updatedBy: null, saving: false, msg: null, msgOk: true, reloadable: false },
        versions: [],
        versionsLoading: false,
        versionsError: null,
        viewingVersion: null,
        viewVersionError: null,
      };
    },
    async created() {
      const user = await initNav('termseditor', { breadcrumbs: [
        { label: 'Home', href: '/pipeline.html' },
        { label: 'Terms & Conditions' },
      ]});
      if (!user) return;
      this.me = user;
      if (user.role !== 'sysadmin') { this.accessDenied = true; return; }
      await Promise.all([this.loadDraft(), this.loadVersions()]);
      this.ready = true;
    },
    methods: {
      async loadDraft() {
        try {
          const res = await fetch('/api/app-settings/terms/draft', { credentials: 'same-origin' });
          const d = await res.json();
          if (!res.ok) { this.terms.msg = d.error || 'Failed to load draft.'; this.terms.msgOk = false; return; }
          this.terms.version   = d.version;
          this.terms.content   = d.content;
          this.terms.updatedAt = d.updatedAt;
          this.terms.updatedBy = d.updatedBy;
        } catch {
          this.terms.msg = 'Network error.'; this.terms.msgOk = false;
        }
      },
      async saveTerms(publishNewVersion) {
        this.terms.saving = true;
        this.terms.msg    = null;
        this.terms.reloadable = false;
        const out = await window.apiSave('PUT', '/app-settings/terms', { content: this.terms.content, publishNewVersion });
        this.terms.saving = false;
        if (out.kind !== 'ok') {
          this.terms.msg = out.message; this.terms.msgOk = false;
          this.terms.reloadable = out.kind === 'conflict';
          return;
        }
        const d = out.data;
        this.terms.version   = d.version;
        this.terms.updatedAt = d.updatedAt;
        this.terms.updatedBy = d.updatedBy;
        this.terms.msg   = publishNewVersion
          ? `Published as v${d.newVersion || d.version} — all users will be asked to re-accept at next login.`
          : 'Draft saved.';
        this.terms.msgOk = true;
        await this.loadVersions();
      },
      async reloadTerms() {
        this.terms.msg = null;
        this.terms.reloadable = false;
        await Promise.all([this.loadDraft(), this.loadVersions()]);
      },
      async loadVersions() {
        this.versionsLoading = true;
        this.versionsError = null;
        try {
          const res = await fetch('/api/app-settings/terms/versions', { credentials: 'same-origin' });
          const d = await res.json();
          if (!res.ok) { this.versionsError = d.error || 'Failed to load version history.'; return; }
          this.versions = d;
        } catch {
          this.versionsError = 'Network error.';
        } finally {
          this.versionsLoading = false;
        }
      },
      async viewVersion(version) {
        this.viewVersionError = null;
        this.viewingVersion = null;
        const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('versionViewModal'));
        try {
          const res = await fetch(`/api/app-settings/terms/versions/${version}`, { credentials: 'same-origin' });
          const d = await res.json();
          if (!res.ok) { this.viewVersionError = d.error || 'Failed to load version.'; modal.show(); return; }
          this.viewingVersion = d;
          modal.show();
        } catch {
          this.viewVersionError = 'Network error.';
          modal.show();
        }
      },
      fmtDate(iso) {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      },
    },
  }).mount('#app');
