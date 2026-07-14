# terms.html Vue 3 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `terms.html` from imperative Vanilla JS DOM manipulation to a Vue 3 (CDN, no build step) app, 1:1 behavior — no functional or visual change.

**Architecture:** Single-file rewrite. `#app` wraps the existing markup; `data()` holds reactive state (`next`, `version`, `effectiveDate`, `termsContent`, `loadError`, `checked`, `saving`, `errorMsg`); `mounted()` performs the initial `GET /api/app-settings/terms` fetch (moved from the current external IIFE); a single `accept()` method handles the `POST /api/auth/accept-terms` flow. Same pattern as `login.html`'s `Vue.createApp({...}).mount('#app')`.

**Tech Stack:** Vue 3 via CDN (`https://unpkg.com/vue@3/dist/vue.global.prod.js`), Bootstrap 5.3.2 (already loaded), no build step, no bundler.

## Global Constraints

- Vue 3 via CDN only — no build step, no SFCs (confirmed in the roadmap Brief, `docs/superpowers/specs/2026-07-14-vue-migration-roadmap-brief.md`).
- No new `js/*.js` file for this page — logic stays inline in `terms.html`, matching `login.html`.
- No change to `/api/app-settings/terms` or `/api/auth/accept-terms` — same requests, same payloads, same credentials mode.
- No `initNav()` call — page stays standalone.
- 1:1 port: every branch of current behavior (success, 401, generic error, on both the load and the accept flow) must produce an identical outcome to today's `terms.html:87-139`.
- `pdash-nginx` serves the main checkout's working directory only — this page's new behavior is **not visible in a browser until after this branch is merged into `main`**. Manual verification cannot happen during Task 1's execution; it happens as a separate step after `/finish-cycle`'s Gate 4 (merge), before Gate 5.

---

## File Structure

- Modify: `terms.html` (full rewrite of the `<body>`, lines 59-142; the `<head>`, lines 1-58, is unchanged — same title, meta, CSS links, and `<style>` block).

---

### Task 1: Rewrite `terms.html` as a Vue 3 app

**Files:**
- Modify: `terms.html:59-142`

**Interfaces:** None — this is a self-contained page with no other file depending on its internals. `js/nav.js`/other pages do not reference anything inside `terms.html`.

- [ ] **Step 1: Replace the `<body>` content**

Open `terms.html`. The `<head>` (lines 1-58) stays exactly as-is — do not touch it. Replace everything from `<body>` (line 59) to `</html>` (line 142) with:

```html
<body>

  <div id="app">
    <div class="terms-header">
      <span class="brand-name"><span class="p">P</span>Dash</span>
      <span style="color:rgba(255,255,255,.5);margin-left:16px;font-size:.85rem">Terms of Use &amp; Privacy Notice</span>
    </div>

    <div class="terms-card">
      <h1>Terms of Use &amp; Privacy Notice <span class="version-badge">{{ version ? 'v' + version : '…' }}</span></h1>
      <p style="color:var(--text-muted);font-size:.82rem">{{ effectiveDate || 'Loading…' }}</p>
      <div style="min-height:200px">
        <div v-if="termsContent" v-html="termsContent"></div>
        <div v-else-if="loadError">{{ loadError }}</div>
      </div>
      <div style="height:80px"></div>
    </div>

    <div class="confirm-bar">
      <div class="d-flex align-items-center gap-3">
        <input type="checkbox" id="chkRead" v-model="checked" class="form-check-input" style="width:1.2em;height:1.2em;cursor:pointer;margin-top:0">
        <label for="chkRead">I have read and understood this notice</label>
      </div>
      <div class="d-flex align-items-center gap-3">
        <span v-if="errorMsg" style="color:#dc3545;font-size:.83rem">{{ errorMsg }}</span>
        <button @click="accept" :disabled="!checked || saving" class="btn btn-primary" style="background:var(--brand-navy);border-color:var(--brand-navy);min-width:200px">
          {{ saving ? 'Saving…' : 'Continue to PDash' }}
        </button>
      </div>
    </div>
  </div>

  <script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
  <script>
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
  </script>
</body>
</html>
```

Note the `min-width:200px` moved from the `#btnAccept` CSS rule (originally `terms.html:55`, `#btnAccept { min-width: 200px; }`) inline onto the `<button>` — the button no longer has the `id="btnAccept"` selector to hang that rule off of. Leave the now-unused `#btnAccept` and `#errMsg` CSS rules in the `<style>` block (lines 55-56) as dead rules for this step; Step 3 removes them.

- [ ] **Step 2: Verify the page has no syntax errors**

Run: `node -e "require('fs').readFileSync('terms.html', 'utf8')" && echo "file readable"`

This only confirms the file is readable — full behavioral verification isn't possible pre-merge (see Global Constraints). Also visually re-read the file to confirm the `<script>` block has matched braces/parens (no automated JS linter is configured for this project per `CLAUDE.md`, so this is a manual read-through, not a tool run).

- [ ] **Step 3: Remove the now-dead CSS rules**

Find in the `<style>` block (around lines 55-56):

```css
    #btnAccept { min-width: 200px; }
    #errMsg { color: #dc3545; font-size: .83rem; display: none; }
```

Delete both lines — `#btnAccept`'s width is now inline on the `<button>` (Step 1), and `#errMsg`'s styling is now inline on the `<span v-if="errorMsg">` (Step 1, `style="color:#dc3545;font-size:.83rem"`). Neither `id` exists in the new markup, so both rules are dead CSS.

- [ ] **Step 4: Commit**

```bash
git add terms.html
git commit -m "feat(terms): migrate terms.html to Vue 3

1:1 port from imperative DOM manipulation to Vue 3 (CDN, no build
step), same pattern as login.html. No functional or visual change -
same API calls, same redirect/error behavior on every branch.

Design: docs/superpowers/specs/2026-07-14-terms-vue-migration-design.md"
```

---

### Task 2: Manual verification (post-merge only — do not attempt during Task 1's review cycle)

**This task cannot be executed until after `/finish-cycle`'s Gate 4 (merge) completes.** `pdash-nginx` serves the main checkout's working directory, not this branch's worktree — `terms.html`'s new behavior is invisible in a browser until the merge writes it to `main`'s disk. Record this explicitly when running `/finish-cycle`'s Gate 2: state that manual verification is deferred to after Gate 4, per this plan, rather than answering yes/no to Gate 2's "have you verified in the browser" question as if it were possible now.

**Files:** None — this is a manual browser checklist, no code changes.

- [ ] **Step 1: After the merge, open `/terms.html?next=/portfolio.html` in a browser**

Expected: page loads with no console errors; version badge shows `v<N>` (not `…`) once loaded; effective date shows a formatted date (not stuck on "Loading…"); the T&C content renders below the header.

- [ ] **Step 2: Confirm the Accept button starts disabled**

Expected: "Continue to PDash" button is visually dimmed/disabled before the checkbox is checked.

- [ ] **Step 3: Check the checkbox, confirm the button enables**

Expected: clicking the checkbox enables the button (no longer dimmed/disabled).

- [ ] **Step 4: Click "Continue to PDash" and confirm the redirect target**

Expected: button briefly shows "Saving…", then the browser navigates to `/portfolio.html` (the `?next=` value from Step 1), not the default `/pipeline.html`.

- [ ] **Step 5: Reload `/terms.html` with no `next` param and repeat the accept flow**

Expected: on success, redirects to `/pipeline.html` (the default).

- [ ] **Step 6: Simulate a 401 (e.g. clear the `pdash_token` cookie via browser devtools, then reload `/terms.html`)**

Expected: immediate redirect to `/login.html` — matches the original `:98` behavior.

- [ ] **Step 7: Record the result**

If all 6 checks pass: note in the cycle's `/finish-cycle` report (Gate 2 or Roadmap notes section) that manual verification was completed post-merge, listing the checks above. If any check fails: this is a regression against the 1:1 port requirement — do not close the cycle; fix `terms.html` on a new small follow-up commit, re-verify, then close.

---

## Self-Review Notes

- **Spec coverage:** every data field, every template substitution, and both error-handling flows (load failure, accept failure) from the design spec's "State and lifecycle" and "Error handling" sections are present in Task 1's code. The design spec's "Testing" section (manual verification deferred to post-merge) is Task 2, not skipped.
- **Placeholder scan:** no TBD/TODO; Task 1's code block is the complete file content for the `<body>`, not a fragment description. Task 2's steps are concrete checks with expected outcomes, not "verify it works."
- **Type consistency:** `data()` field names (`next`, `version`, `effectiveDate`, `termsContent`, `loadError`, `checked`, `saving`, `errorMsg`) are used identically between the `data()` block, `mounted()`, `accept()`, and the template bindings — no naming drift.
