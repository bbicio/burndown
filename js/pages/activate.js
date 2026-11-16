
    Vue.createApp({
      data() {
        return {
          state: 'loading',   // loading | invalid | form | success
          token: null,
          user: { firstName: '', email: '' },
          password: '',
          confirm: '',
          strength: 0,
          loading: false,
          error: null,
          year: new Date().getFullYear(),
        };
      },
      computed: {
        canSubmit() {
          return this.password.length >= 8 && this.password === this.confirm;
        },
        strengthClass() { return 'strength-' + this.strength; },
        strengthLabel() {
          return ['','Weak','Fair','Good','Strong'][this.strength] || '';
        },
      },
      async created() {
        this.token = new URLSearchParams(window.location.search).get('token');
        if (!this.token) { this.state = 'invalid'; return; }
        try {
          const res = await fetch(`/api/auth/invite/${this.token}`, { credentials: 'same-origin' });
          if (!res.ok) { this.state = 'invalid'; return; }
          const data = await res.json();
          this.user = { firstName: data.firstName, email: data.email };
          this.state = 'form';
        } catch {
          this.state = 'invalid';
        }
      },
      methods: {
        checkStrength() {
          const p = this.password;
          let score = 0;
          if (p.length >= 8)  score++;
          if (p.length >= 12) score++;
          if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
          if (/[0-9!@#$%^&*]/.test(p)) score++;
          this.strength = Math.min(4, Math.max(0, score));
        },

        async activate() {
          if (!this.canSubmit) return;
          this.loading = true;
          this.error = null;
          try {
            const res = await fetch('/api/auth/activate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({ token: this.token, password: this.password, passwordConfirm: this.confirm }),
            });
            const data = await res.json();
            if (!res.ok) { this.error = data.error || 'Activation failed. Please try again.'; return; }
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
  