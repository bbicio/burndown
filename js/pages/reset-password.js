
    Vue.createApp({
      data() {
        return {
          state: 'loading',   // loading | invalid | form | success
          token: null,
          password: '',
          confirm: '',
          loading: false,
          error: null,
          year: new Date().getFullYear(),
        };
      },
      computed: {
        ruleError() {
          return this.password ? (passwordError(this.password, {})?.message || '') : '';
        },
        canSubmit() {
          return !this.ruleError && !!this.password && this.password === this.confirm;
        },
        strength() { return passwordStrength(this.password); },
        strengthClass() { return 'strength-' + this.strength; },
        strengthLabel() { return STRENGTH_LABELS[this.strength] || ''; },
        placeholder() { return PASSWORD_PLACEHOLDER; },
        hint() { return PASSWORD_HINT; },
      },
      async created() {
        this.token = new URLSearchParams(window.location.search).get('token');
        if (!this.token) { this.state = 'invalid'; return; }
        try {
          const res = await fetch(`/api/auth/reset-password/${this.token}`, { credentials: 'same-origin' });
          if (!res.ok) { this.state = 'invalid'; return; }
          this.state = 'form';
        } catch {
          this.state = 'invalid';
        }
      },
      methods: {
        async resetPassword() {
          if (!this.canSubmit) return;
          this.loading = true;
          this.error = null;
          try {
            const res = await fetch('/api/auth/reset-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({ token: this.token, password: this.password, passwordConfirm: this.confirm }),
            });
            const data = await res.json();
            if (!res.ok) { this.error = data.error || 'Reset failed. Please try again.'; return; }
            this.state = 'success';
            setTimeout(() => { window.location.href = '/login.html'; }, 3000);
          } catch {
            this.error = 'Network error. Please try again.';
          } finally {
            this.loading = false;
          }
        },
      },
    }).mount('#app');
  