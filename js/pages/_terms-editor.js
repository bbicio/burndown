
  Vue.createApp({
    data() {
      return {
        ready: false,
        accessDenied: false,
        me: {},
        terms: { version: 1, content: '', updatedAt: null, updatedBy: null, saving: false, msg: null, msgOk: true },
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
        try {
          const res = await fetch('/api/app-settings/terms', {
            method: 'PUT',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: this.terms.content, publishNewVersion }),
          });
          const d = await res.json();
          if (!res.ok) { this.terms.msg = d.error || 'Save failed'; this.terms.msgOk = false; return; }
          if (publishNewVersion && d.newVersion) this.terms.version = d.newVersion;
          this.terms.updatedAt = new Date().toISOString();
          this.terms.updatedBy = this.me.first_name + ' ' + this.me.last_name;
          this.terms.msg   = publishNewVersion
            ? `Published as v${this.terms.version} — all users will be asked to re-accept at next login.`
            : 'Draft saved.';
          this.terms.msgOk = true;
          await this.loadVersions();
        } catch {
          this.terms.msg = 'Network error.'; this.terms.msgOk = false;
        } finally {
          this.terms.saving = false;
        }
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
