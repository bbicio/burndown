
    Vue.createApp({
      data() {
        return {
          next: (window.notificationUrl && window.notificationUrl(new URLSearchParams(window.location.search).get('next'), window.location.origin)) || '/pipeline.html',
          version: null,
          effectiveDate: '',
          termsContent: '',
          loadError: '',
          checked: false,
          saving: false,
          errorMsg: '',
        };
      },
      computed: {
        safeContent() { return window.safeTermsHtml(this.termsContent); },
      },
      async mounted() { await this.loadTerms(); },
      methods: {
        async loadTerms() {
        try {
          const r = await fetch('/api/app-settings/terms', { credentials: 'include' });
          if (r.status === 401) { window.location.href = '/login.html'; return; }
          const d = await r.json();
          this.version = d.version;
          this.effectiveDate = d.updatedAt
            ? 'Effective from: ' + new Date(d.updatedAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
            : '';
          this.termsContent = d.content;
        } catch (e) {
          this.loadError = 'Unable to load terms. Please refresh or contact your administrator.';
        }
        },
        async accept() {
          this.saving = true;
          this.errorMsg = '';
          const out = await window.apiSave('POST', '/auth/accept-terms', { version: this.version });
          if (out.kind === 'ok') { window.location.href = this.next; return; }
          this.saving = false;
          if (out.kind === 'conflict') {
            this.checked = false;
            await this.loadTerms();
          }
          this.errorMsg = out.message;
        },
      },
    }).mount('#app');
  