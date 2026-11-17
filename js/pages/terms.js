
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
      async mounted() {
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
      methods: {
        async accept() {
          this.saving = true;
          this.errorMsg = '';
          try {
            const r = await fetch('/api/auth/accept-terms', {
              method: 'POST', credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
            });
            if (r.status === 401) { window.location.href = '/login.html'; return; }
            if (!r.ok) throw new Error('Server error ' + r.status);
            window.location.href = this.next;
          } catch (e) {
            this.saving = false;
            this.errorMsg = 'Could not save. Please try again.';
          }
        },
      },
    }).mount('#app');
  