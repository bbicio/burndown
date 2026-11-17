
    const app = Vue.createApp({
      data() {
        return {
          view: 'login',          // 'login' | 'code' | 'locked' | 'forgot'
          email: '',
          password: '',
          forgotEmail: '',
          loading: false,
          error: null,
          success: null,
          year: new Date().getFullYear(),
          // the code step
          twoStep: null,
          code: '',
          trust: false,
          codeState: 'idle',      // 'idle' | 'wrong' | 'resent' | 'expired' | 'sendError' | 'networkError' | 'rateLimited'
          codeMessage: '',
          attemptsLeft: 0,
          resendIn: 0,
          verifying: false,
          resending: false,
          lockedGone: false,
          timer: null,
        };
      },
      computed: {
        // No usable code (expired, or the mail never left): the boxes wait for a new one.
        noCode() { return this.codeState === 'expired' || this.codeState === 'sendError'; },
        boxesDisabled() { return this.noCode || this.verifying; },
        // The primary button already offers "Send a new code" then.
        resendHidden() { return this.noCode; },
        // The primary button resends when the code cannot be used any more.
        primaryIsResend() { return this.codeState === 'expired' || this.codeState === 'sendError'; },
        primaryLabel() {
          if (this.primaryIsResend) return 'Send a new code';
          return this.verifying ? 'Verifying…' : 'Verify';
        },
        primaryDisabled() {
          if (this.verifying || this.resending) return true;
          return this.primaryIsResend ? false : this.code.length !== 6;
        },
        codeBox() {
          switch (this.codeState) {
            case 'wrong':
              return { cls: 'alert-danger', text: 'Incorrect code. ' + (this.attemptsLeft === 1 ? '1 attempt left.' : this.attemptsLeft + ' attempts left.') };
            case 'resent':
              return { cls: 'alert-success', ok: true, text: 'A new code has been sent. Use the latest one: earlier codes no longer work.' };
            case 'expired':
              return { cls: 'alert-danger', text: 'This code has expired. Send a new one to continue.' };
            case 'sendError':
              return { cls: 'alert-danger', text: 'We couldn\'t send the email. Check your connection and try again.' };
            case 'networkError':
              return { cls: 'alert-danger', text: 'Network error. Please try again.' };
            case 'rateLimited':
              return { cls: 'alert-danger', text: this.codeMessage };
            default:
              return null;
          }
        },
      },
      methods: {
        switchToForgot() { this.forgotEmail ||= this.email; this.view = 'forgot'; this.error = null; this.success = null; },
        switchToLogin()  { this.view = 'login';  this.error = null; this.success = null; },

        rateLimitedText(retryIn) {
          const n = Math.max(1, Math.ceil((retryIn || 60) / 60));
          return 'Too many attempts. Try again in ' + n + (n === 1 ? ' minute.' : ' minutes.');
        },

        startTimer() {
          this.stopTimer();
          if (this.resendIn <= 0) return;
          this.timer = setInterval(() => {
            this.resendIn -= 1;
            if (this.resendIn <= 0) this.stopTimer();
          }, 1000);
        },
        stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null; } },
        focusCode() { this.$nextTick(() => this.$refs.otp && this.$refs.otp.focusFirst()); },

        enterCode(ts) {
          this.twoStep = ts;
          this.code = '';
          this.trust = false;
          this.codeState = ts.sendFailed ? 'sendError' : 'idle';
          this.resendIn = ts.resendIn || 0;
          this.view = 'code';
          this.startTimer();
          this.focusCode();
        },
        lock(gone) { this.stopTimer(); this.lockedGone = gone; this.view = 'locked'; },
        backToSignIn() {
          fetch('/api/auth/two-step', { method: 'DELETE', credentials: 'same-origin' }).catch(() => {});
          this.stopTimer();
          this.view = 'login';
          this.code = '';
          this.password = '';
          this.error = null;
          this.codeState = 'idle';
        },

        onCodeEdit() { if (this.codeState === 'wrong') this.codeState = 'idle'; },

        submitCode() { return this.primaryIsResend ? this.resend() : this.verify(); },

        async verify() {
          if (this.verifying || this.code.length !== 6) return;
          this.verifying = true;
          try {
            const res = await fetch('/api/auth/two-step/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({ code: this.code, trustDevice: this.trust }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) { window.location.href = '/'; return; }
            if (res.status === 401 && data.code === 'NO_CHALLENGE') return this.lock(true);
            if (res.status === 423) return this.lock(false);
            if (res.status === 410) this.codeState = 'expired';
            else if (res.status === 400 && data.code === 'WRONG_CODE') { this.codeState = 'wrong'; this.attemptsLeft = data.attemptsLeft; this.focusCode(); }
            else this.codeState = 'networkError';
          } catch {
            this.codeState = 'networkError';
          } finally {
            this.verifying = false;
          }
        },

        async resend() {
          if (this.resending) return;
          this.resending = true;
          try {
            const res = await fetch('/api/auth/two-step/resend', { method: 'POST', credentials: 'same-origin' });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
              this.code = '';
              this.codeState = 'resent';
              this.resendIn = data.resendIn || 60;
              this.startTimer();
              this.focusCode();
            } else if (res.status === 401 && data.code === 'NO_CHALLENGE') this.lock(true);
            else if (res.status === 429 && data.code === 'COOLDOWN') { this.resendIn = data.retryIn; this.startTimer(); }
            else if (res.status === 429) { this.codeState = 'rateLimited'; this.codeMessage = this.rateLimitedText(data.retryIn); }
            else if (res.status === 502) { this.codeState = 'sendError'; this.resendIn = 0; }
            else this.codeState = 'networkError';
          } catch {
            this.codeState = 'networkError';
          } finally {
            this.resending = false;
          }
        },

        async login() {
          this.loading = true;
          this.error = null;
          try {
            const res = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({ email: this.email, password: this.password }),
            });
            const data = await res.json();
            if (res.status === 429) { this.error = this.rateLimitedText(data.retryIn); return; }
            if (!res.ok) { this.error = data.error || 'Sign in failed. Please try again.'; return; }
            if (data.twoStep) {
              // Only the email method exists; anything else is a server this page does not know.
              if (data.twoStep.method !== 'email') {
                this.error = 'Sign in failed. Please try again.';
                fetch('/api/auth/two-step', { method: 'DELETE', credentials: 'same-origin' }).catch(() => {});
                return;
              }
              this.enterCode(data.twoStep);
              return;
            }
            window.location.href = '/';
          } catch {
            this.error = 'Network error. Please try again.';
          } finally {
            this.loading = false;
          }
        },

        async forgotPassword() {
          this.loading = true;
          this.error = null;
          this.success = null;
          try {
            await fetch('/api/auth/forgot-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({ email: this.forgotEmail }),
            });
            // Always show success — API never reveals if email exists
            this.success = 'If that email is registered, you\'ll receive a reset link shortly.';
          } catch {
            this.error = 'Network error. Please try again.';
          } finally {
            this.loading = false;
          }
        },
      },
      beforeUnmount() { this.stopTimer(); },
    });
    app.component('otp-input', window.OtpInput);
    app.mount('#app');
  