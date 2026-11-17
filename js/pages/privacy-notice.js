
  Vue.createApp({
    data() {
      return { ready: false, loading: true, loadError: '', content: '', version: null, updatedAt: null };
    },
    computed: {
      safeContent() { return window.safeTermsHtml(this.content); },
      // Publication day in UTC: the API timestamp is ISO/UTC and formatDayText takes 'YYYY-MM-DD'.
      footerLine() {
        const day = this.updatedAt ? formatDayText(String(this.updatedAt).slice(0, 10)) : '';
        return `Version ${this.version}` + (day ? ` · Published ${day}` : '');
      },
    },
    async created() {
      const user = await initNav('privacy', { breadcrumbs: [
        { label: 'Home', href: '/pipeline.html' },
        { label: 'Privacy Notice' },
      ]});
      if (!user) return;
      this.ready = true;
      try {
        const d = await apiFetch('/app-settings/terms');
        this.content = d.content || '';
        this.version = d.version;
        this.updatedAt = d.updatedAt;
      } catch (e) {
        this.loadError = 'Unable to load the privacy notice. Please refresh or contact your administrator.';
      } finally {
        this.loading = false;
      }
    },
  }).mount('#app');
