# terms.html Vue 3 Migration — Design Spec

**Source:** Brief `docs/superpowers/specs/2026-07-14-terms-vue-migration-brief.md`.

## Problem

`terms.html` (`:1-142`) is Vanilla JS, imperatively manipulating the DOM via `getElementById`/`innerHTML`/manual event listeners. This is the first page of the roadmap's Tier 1 (`docs/superpowers/specs/2026-07-14-vue-migration-roadmap-design.md`) — a 1:1 port to Vue 3 (CDN, no build step), establishing the pattern the rest of Tier 1/Tier 2 will follow.

## Design

### State and lifecycle (resolved in `/brainstorming`)

The current implementation reads `next` from the URL once (`:87-88`), then does two independent DOM-mutation flows: an initial-load IIFE (`:95-109`) and a click handler (`:121-139`). The Vue port replaces every `getElementById`/`innerHTML`/`textContent` write with reactive `data()` state, and moves the initial fetch into `mounted()` (chosen over copying `login.html`'s external-IIFE pattern — `login.html` has no equivalent load-and-populate flow to mirror, and `mounted()` is the idiomatic Vue lifecycle hook for "fetch on page load," setting the pattern for later Tier 1/Tier 2 pages that will have the same shape):

```js
Vue.createApp({
  data() {
    return {
      next: new URLSearchParams(window.location.search).get('next') || '/pipeline.html',
      version: null,
      effectiveDate: '',
      termsContent: '',
      loadError: '',
      checked: false,
      saving: false,
      errorMsg: '',
    };
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
```

Template (`#app` wraps the existing `.terms-header`/`.terms-card`/`.confirm-bar` markup, `:61-84`, with these substitutions):

- `#versionLabel` → `{{ version ? 'v' + version : '…' }}`
- `#effectiveDate` → `{{ effectiveDate || 'Loading…' }}` — matches `:101-104` exactly: on a load error, `effectiveDate` is never written by the original code (only `#termsBody` gets the fallback message, `:107`), so it stays "Loading…" indefinitely. `loadError` is intentionally **not** referenced here — using it in this slot would be a behavior change, not a 1:1 port.
- `#termsBody` → `<div v-if="termsContent" v-html="termsContent"></div><div v-else-if="loadError">{{ loadError }}</div>` (preserves `:105`'s `innerHTML` assignment behavior — same XSS-surface as today, unchanged per the Brief's excluded scope — and `:107`'s fallback text, in the same slot the original code used)
- `#chkRead` → `v-model="checked"`
- `#btnAccept` → `:disabled="!checked || saving"`, label `{{ saving ? 'Saving…' : 'Continue to PDash' }}`, `@click="accept"`
- `#errMsg` → `<span v-if="errorMsg">{{ errorMsg }}</span>`

All CSS (`:9-57`) stays as-is — same classes, same selectors, since the template keeps the same element IDs-turned-`ref`-free markup and class names.

### Error handling

Identical to current behavior in every branch: 401 on load → redirect to `/login.html`; other load failure → fallback message where `#termsBody` used to show it; 401 on accept → redirect to `/login.html`; non-ok/network error on accept → button re-enables, error message shown, page stays put. No new error states introduced.

### Testing

No automated test exists for this page today (no test file references `terms.html`), and none is added — consistent with this codebase's precedent for DOM-driven page-level code (not extracted to `js/lib/`, per `CLAUDE.md`'s testing conventions). **Manual verification is required but cannot happen before merge** (resolved in `/brainstorming`): `pdash-nginx` bind-mounts the main checkout's working directory, never a linked worktree, so this page's rewritten behavior is invisible in the browser until the branch is actually merged into `main`. The implementation plan will include an explicit post-merge verification step (executed after `/finish-cycle`'s Gate 4, before Gate 5) covering: page loads without console errors, version/date/content populate correctly, checkbox enables the button, accepting redirects to the default target and to a custom `?next=` target, and a simulated 401 (e.g. via an expired/cleared session) redirects to `/login.html`.

## Backward compatibility

No API change. No URL/query-param contract change (`?next=` behaves identically). No visual change (same CSS, same DOM structure under `#app`). The only externally-observable difference is implementation language (Vue reactivity instead of imperative DOM writes) — behaviorally a no-op.

## Explicitly out of scope

*(carried over from the Brief, confirmed)*

- Any change to `/api/app-settings/terms` or `/api/auth/accept-terms`.
- Visual/UX redesign beyond the framework swap.
- Sanitizing the `v-html`-rendered T&C content (`:105` today) — same behavior preserved, flagged as a possible future audit finding, not fixed here.
- Adding `initNav()`/navbar — page stays standalone.
- Migrating any other Tier 1/Tier 2 page.
