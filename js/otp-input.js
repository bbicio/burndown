// ── SIX-BOX CODE INPUT ───────────────────────────────────────────────────────
// Presentational Vue component for the sign-in code (login.html), registered on the page's app as
// <otp-input> (same pattern as js/cg-controls.js). Styles: css/otp-input.css. It holds no business
// logic: it emits the digits typed so far and `complete` on the sixth.
//
// Pure helpers come from js/lib/otp.js through its window.* bridge (this is a classic script, so it
// cannot `import`). They are only read inside methods, i.e. after every deferred script has run.

(function () {
  const LENGTH = 6;
  const toBoxes = value => {
    const typed = window.normalizeDigits(value).split('');
    return Array.from({ length: LENGTH }, (_, i) => typed[i] || '');
  };

  window.OtpInput = {
    name: 'OtpInput',
    props: {
      modelValue: { type: String, default: '' },
      label: { type: String, default: 'Code' },
      disabled: { type: Boolean, default: false },
      invalid: { type: Boolean, default: false },
    },
    emits: ['update:modelValue', 'complete'],
    data() {
      return { digits: toBoxes(this.modelValue), editedSinceInvalid: false };
    },
    computed: {
      // Red until the next input: the digits stay so the user sees what was refused.
      showInvalid() { return this.invalid && !this.editedSinceInvalid; },
    },
    watch: {
      modelValue(v) {
        if (v !== this.digits.join('')) this.digits = toBoxes(v);
      },
      invalid(v) { if (v) this.editedSinceInvalid = false; },
    },
    methods: {
      focusBox(i) {
        const el = this.$refs.box && this.$refs.box[i];
        if (el) { el.focus(); el.select(); }
      },
      focusFirst() { this.focusBox(0); },
      commit(next, focus) {
        const changed = next.join('') !== this.digits.join('');
        this.digits = next;
        if (changed) {
          this.editedSinceInvalid = true;
          this.$emit('update:modelValue', next.join(''));
          if (window.isComplete(next)) this.$emit('complete', next.join(''));
        }
        this.$nextTick(() => this.focusBox(focus));
      },
      onInput(i, e) {
        let text = e.target.value;
        // A digit typed into a filled box arrives as old+new: keep the new one.
        if (text.length === 2 && this.digits[i]) text = text[0] === this.digits[i] ? text[1] : text[0];
        const r = window.applyInput(this.digits, i, text);
        e.target.value = r.digits[i];
        this.commit(r.digits, r.focus);
      },
      onPaste(i, e) {
        e.preventDefault();
        const r = window.applyInput(this.digits, i, (e.clipboardData || window.clipboardData).getData('text'));
        this.commit(r.digits, r.focus);
      },
      onKeydown(i, e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const r = window.applyKey(this.digits, i, e.key);
        if (!r) return;
        e.preventDefault();
        this.commit(r.digits, r.focus);
      },
    },
    template: `
      <div class="otp-group" role="group" :aria-label="label">
        <input v-for="(d, i) in digits" :key="i" ref="box" type="text" inputmode="numeric"
               class="otp-box" :class="{ 'otp-box--invalid': showInvalid, 'otp-box--gap': i === 3 }"
               :value="d" :disabled="disabled" :aria-label="'Digit ' + (i + 1) + ' of 6'"
               :aria-invalid="showInvalid ? 'true' : null"
               :autocomplete="i === 0 ? 'one-time-code' : 'off'"
               @input="onInput(i, $event)" @paste="onPaste(i, $event)" @keydown="onKeydown(i, $event)"
               @focus="$event.target.select()">
      </div>`,
  };
})();
