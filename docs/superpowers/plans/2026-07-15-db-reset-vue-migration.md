# `_db-reset.html` Vue 3 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `_db-reset.html` from imperative Vanilla JS DOM manipulation to a Vue 3 (CDN, no build step) app, 1:1 behavior for every reset/owner-change/auth flow, plus one deliberate addition: a standard navbar via `initNav()` (the page currently has none).

**Architecture:** Single-file rewrite, same shape as `admin.html`. `#app` wraps the existing markup; `data()` holds reactive state (`ready`, `accessDenied`, `scopes`, pending/message/busy state for each flow); `created()` calls `initNav(null, {breadcrumbs:[...]})` and performs the admin-role gate on its returned user; `mounted()` instantiates one `bootstrap.Modal` for the shared confirm dialog, matching `admin.html`'s own `_modal` pattern. The 7 near-duplicate scope-delete cards become one `v-for` over a `scopes` data array. The two independently-registered `#confirmOk` click listeners (an accidental pattern — see design spec) collapse into one `confirmDelete()` dispatcher method with equivalent per-branch behavior.

**Tech Stack:** Vue 3 via CDN (`https://unpkg.com/vue@3/dist/vue.global.prod.js`), Bootstrap 5.3.2 (already loaded), no build step, no bundler.

## Global Constraints

- Vue 3 via CDN only — no build step, no SFCs.
- No new `js/*.js` file — logic stays inline in `_db-reset.html`, matching `terms.html`/`admin.html`.
- No change to any of the 4 backend API endpoints this page calls (`/api/admin/reset/:scope`, `/api/admin/reset/cost-grid/:cgId`, `/api/admin/reset/cost-grid/:cgId/owner`, `/api/users/active-list`) — same requests, same payloads, same credentials mode. `initNav()` itself also calls `GET /api/auth/me`, replacing the page's own former call to the same endpoint.
- Page stays admin-only and hidden — `initNav()` is called with `activeTab: null` so no nav-tab entry highlights for this unlinked page.
- 1:1 port of every reset/owner-change/auth-gate behavior (success, error, validation, persistent vs. auto-reverting messages) — see the design spec's "Backward compatibility" section for the one deliberate code-structure deviation (the two-listener consolidation) and the one deliberate behavior addition (the navbar).
- `pdash-nginx` serves the main checkout's working directory only — this page's new behavior is **not visible in a browser until after this branch is merged into `main`**. Manual verification happens as a separate step after `/finish-cycle`'s Gate 4 (merge), before Gate 5 — same pattern `terms.html`'s plan used.

---

## File Structure

- Modify: `_db-reset.html` (full rewrite of the `<body>`, lines 33-365; the `<head>`, lines 1-32, is unchanged — same title, meta, CSS links, and `<style>` block).

---

### Task 1: Rewrite `_db-reset.html` as a Vue 3 app

**Files:**
- Modify: `_db-reset.html:33-365`

**Interfaces:** None — this is a self-contained page with no other file depending on its internals. It is not linked from any nav or other page's `<a href>`.

- [ ] **Step 1: Replace the `<body>` content**

Open `_db-reset.html`. The `<head>` (lines 1-32) stays exactly as-is — do not touch it. Replace everything from `<body>` (line 33) to `</html>` (line 365) with:

```html
<body>

<!-- Navbar (injected by nav.js) -->
<div id="nav-container"></div>

<div id="app">

  <div v-if="ready || accessDenied" class="page app-container">
    <div class="mb-4">
      <h1 class="fw-bold" style="color:#dc3545;font-size:2.5rem">⚠️ Database Reset</h1>
      <p class="text-muted">Admin-only. Each action is irreversible. Data deleted here cannot be recovered.</p>
    </div>

    <div v-if="accessDenied" class="alert alert-danger">Access denied — admin only.</div>

    <template v-else>
      <div id="resetCards">
        <div class="danger-card" v-for="s in scopes" :key="s.scope">
          <h5>{{ s.title }}</h5>
          <p>{{ s.description }}</p>
          <button class="btn btn-sm"
                  :class="scopeDoneFlag && scopeDoneFlag.scope === s.scope ? 'btn-success' : 'btn-danger'"
                  :disabled="scopeDoneFlag && scopeDoneFlag.scope === s.scope"
                  @click="openScopeConfirm(s.scope)">
            {{ scopeDoneFlag && scopeDoneFlag.scope === s.scope ? '✓ Done' : s.buttonText }}
          </button>
        </div>
      </div>

      <hr class="my-4">

      <div class="danger-card" style="max-width:560px">
        <h5>Delete single proposal + linked projects</h5>
        <p>Deletes one cost grid by UUID and all projects linked to any of its versions. Also removes resource shares for the cost grid and linked projects.</p>
        <div class="d-flex gap-2 align-items-center">
          <input type="text" v-model="cgIdInput" class="form-control form-control-sm font-monospace"
                 placeholder="Cost grid UUID" autocomplete="off" style="flex:1">
          <button class="btn btn-danger btn-sm" style="white-space:nowrap" @click="openCgDeleteConfirm">Delete proposal</button>
        </div>
        <div v-if="cgDeleteMsg" class="mt-2 small" :class="cgDeleteMsg.isError ? 'text-danger' : 'text-success'">{{ cgDeleteMsg.text }}</div>
      </div>

      <div class="danger-card" style="max-width:560px;border-color:#0d6efd">
        <h5 style="color:#0d6efd">Change proposal owner</h5>
        <p>Reassigns a proposal (cost grid) to a different active user.</p>
        <div class="d-flex flex-column gap-2">
          <input type="text" v-model="cgOwnerIdInput" class="form-control form-control-sm font-monospace"
                 placeholder="Cost grid UUID" autocomplete="off">
          <select v-model="ownerSelected" class="form-select form-select-sm">
            <option value="">{{ !ownerOptionsLoaded ? 'Loading users…' : (ownerLoadFailed ? 'Failed to load users' : 'Select new owner…') }}</option>
            <option v-for="u in ownerOptions" :key="u.id" :value="u.id">{{ u.label }}</option>
          </select>
          <button class="btn btn-primary btn-sm" style="white-space:nowrap" :disabled="ownerChangeBusy" @click="changeOwner">Change owner</button>
        </div>
        <div v-if="cgOwnerMsg" class="mt-2 small" :class="cgOwnerMsg.isError ? 'text-danger' : 'text-success'">{{ cgOwnerMsg.text }}</div>
      </div>
    </template>
  </div>

  <div v-else class="d-flex align-items-center justify-content-center" style="height:60vh">
    <div class="spinner-border text-secondary"></div>
  </div>

  <!-- Confirm modal -->
  <div class="modal fade" id="confirmModal" tabindex="-1" data-bs-backdrop="static">
    <div class="modal-dialog modal-dialog-centered" style="max-width:440px">
      <div class="modal-content border-danger">
        <div class="modal-header border-0 pb-1">
          <h6 class="modal-title fw-bold text-danger">⚠️ Confirm deletion</h6>
        </div>
        <div class="modal-body">
          <p class="mb-2">{{ confirmText }}</p>
          <p class="text-danger fw-semibold mb-3" style="font-size:.875rem">This action is permanent and cannot be undone.</p>
          <label class="form-label small fw-semibold">Type <strong>DELETE</strong> to confirm</label>
          <input type="text" class="form-control form-control-sm" v-model="confirmInputValue" placeholder="DELETE" autocomplete="off">
        </div>
        <div class="modal-footer border-0 pt-0">
          <button class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
          <button class="btn btn-danger btn-sm" :disabled="confirmInputValue.trim() !== 'DELETE' || confirmBusy" @click="confirmDelete">
            <span v-if="confirmBusy" class="spinner-border me-1"></span>
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  </div>

</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script src="js/api.js?v=4"></script>
<script src="js/core.js?v=2"></script>
<script src="js/settings.js"></script>
<script src="js/notifications.js"></script>
<script src="js/nav.js?v=4"></script>
<script>
  const SCOPES = [
    { scope: 'proposals', title: 'Proposals', description: 'Deletes all cost grids, versions, phases, tasks, task roles, and related sharing records.', buttonText: 'Delete all proposals', label: 'all proposals (cost grids, versions, phases, tasks)' },
    { scope: 'projects', title: 'Projects & Programs', description: 'Deletes all projects (including tasks and planning data) and all programs. Cost grids are not affected.', buttonText: 'Delete all projects & programs', label: 'all projects and programs' },
    { scope: 'clients', title: 'Clients & Client Groups', description: 'Deletes all clients, client groups, and their POTs. Client references on proposals and projects are set to null.', buttonText: 'Delete all clients & groups', label: 'all clients and client groups' },
    { scope: 'ratecards', title: 'Client Ratecards', description: 'Deletes all ratecards that are linked to a specific client (agency-wide ratecards without a client are not affected). Ratecard references on versions are set to null.', buttonText: 'Delete all client ratecards', label: 'all client ratecards' },
    { scope: 'actuals', title: 'Actuals (Timesheets)', description: 'Deletes all uploaded timesheet data. Project structure is not affected.', buttonText: 'Delete all actuals', label: 'all timesheet actuals' },
    { scope: 'pipelines', title: 'Pipeline Years & POTs', description: 'Deletes all pipeline years and all POT targets with their history. Proposals already in SIP/Committed are not affected.', buttonText: 'Delete all pipeline years & POTs', label: 'all pipeline years and POTs' },
    { scope: 'notifications', title: 'Notifications', description: 'Deletes all in-app notifications for all users. Push/email history sent is not affected.', buttonText: 'Delete all notifications', label: 'all notifications for all users' },
  ];

  Vue.createApp({
    data() {
      return {
        ready: false,
        accessDenied: false,
        me: {},
        scopes: SCOPES,

        pendingScope: null,
        pendingCgId: null,
        confirmText: '',
        confirmInputValue: '',
        confirmBusy: false,
        scopeDoneFlag: null,

        cgIdInput: '',
        cgDeleteMsg: null,

        cgOwnerIdInput: '',
        ownerSelected: '',
        ownerOptions: [],
        ownerOptionsLoaded: false,
        ownerLoadFailed: false,
        ownerChangeBusy: false,
        cgOwnerMsg: null,

        _modal: null,
      };
    },
    async created() {
      const user = await initNav(null, { breadcrumbs: [
        { label: 'Home', href: '/pipeline.html' },
        { label: 'Database Reset' },
      ]});
      if (!user) return;
      this.me = user;
      if (user.role !== 'admin') { this.accessDenied = true; return; }
      await this.loadActiveUsers();
      this.ready = true;
    },
    mounted() {
      const el = document.getElementById('confirmModal');
      this._modal = new bootstrap.Modal(el);
      el.addEventListener('hidden.bs.modal', () => {
        this.pendingScope = null;
        this.pendingCgId = null;
        this.confirmInputValue = '';
      });
    },
    methods: {
      openScopeConfirm(scope) {
        this.pendingScope = scope;
        this.pendingCgId = null;
        const s = this.scopes.find(x => x.scope === scope);
        this.confirmText = 'You are about to permanently delete ' + s.label + '.';
        this.confirmInputValue = '';
        this._modal.show();
      },
      openCgDeleteConfirm() {
        const cgId = this.cgIdInput.trim();
        if (!cgId) return;
        this.pendingCgId = cgId;
        this.pendingScope = null;
        this.confirmText = 'You are about to permanently delete cost grid ' + cgId + ' and all its linked projects.';
        this.confirmInputValue = '';
        this._modal.show();
      },
      async confirmDelete() {
        if (this.confirmInputValue.trim() !== 'DELETE') return;
        if (this.pendingScope) return this._doScopeDelete();
        if (this.pendingCgId)  return this._doCgDelete();
      },
      async _doScopeDelete() {
        const scope = this.pendingScope;
        this.confirmBusy = true;
        try {
          const res = await fetch('/api/admin/reset/' + scope, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          });
          const data = await res.json();
          this._modal.hide();

          if (!res.ok) {
            alert('Error: ' + (data.error || 'Unknown error'));
            return;
          }

          this.scopeDoneFlag = { scope };
          setTimeout(() => { this.scopeDoneFlag = null; }, 3000);
        } catch (e) {
          this._modal.hide();
          alert('Network error: ' + e.message);
        } finally {
          this.confirmBusy = false;
        }
      },
      async _doCgDelete() {
        const cgId = this.pendingCgId;
        this.confirmBusy = true;
        try {
          const res = await fetch('/api/admin/reset/cost-grid/' + encodeURIComponent(cgId), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          });
          const data = await res.json();
          this._modal.hide();

          if (!res.ok) {
            this.cgDeleteMsg = { text: 'Error: ' + (data.error || 'Unknown error'), isError: true };
            return;
          }

          this.cgDeleteMsg = { text: `✓ Deleted "${data.cgName}" and ${data.projectsDeleted} linked project(s).`, isError: false };
          this.cgIdInput = '';
        } catch (e) {
          this._modal.hide();
          this.cgDeleteMsg = { text: 'Network error: ' + e.message, isError: true };
        } finally {
          this.confirmBusy = false;
        }
      },
      async loadActiveUsers() {
        try {
          const res = await fetch('/api/users/active-list', { credentials: 'include' });
          const users = await res.json();
          this.ownerOptions = users.map(u => ({ id: u.id, label: `${u.first_name} ${u.last_name} (${u.email})` }));
        } catch (e) {
          this.ownerOptions = [];
          this.ownerLoadFailed = true;
        } finally {
          this.ownerOptionsLoaded = true;
        }
      },
      async changeOwner() {
        const cgId = this.cgOwnerIdInput.trim();
        const ownerId = this.ownerSelected;
        this.cgOwnerMsg = null;

        if (!cgId || !ownerId) {
          this.cgOwnerMsg = { text: 'Cost grid UUID and new owner are required.', isError: true };
          return;
        }

        this.ownerChangeBusy = true;
        try {
          const res = await fetch('/api/admin/reset/cost-grid/' + encodeURIComponent(cgId) + '/owner', {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ownerId }),
          });
          const data = await res.json();

          if (!res.ok) {
            this.cgOwnerMsg = { text: 'Error: ' + (data.error || 'Unknown error'), isError: true };
          } else {
            this.cgOwnerMsg = { text: `✓ "${data.cgName}" is now owned by ${data.newOwner}.`, isError: false };
            this.cgOwnerIdInput = '';
            this.ownerSelected = '';
          }
        } catch (e) {
          this.cgOwnerMsg = { text: 'Network error: ' + e.message, isError: true };
        } finally {
          this.ownerChangeBusy = false;
        }
      },
    },
  }).mount('#app');
</script>
</body>
</html>
```

Notes on this rewrite vs. the original:
- `js/api-sync.js` is deliberately **not** loaded — unlike `pipeline.html`/`portfolio.html`, this page has no cost-grid/project state to sync, matching `admin.html`'s precedent (which also omits it despite CLAUDE.md's general authenticated-page script list).
- The manual `esc()` helper is dropped — `js/core.js` (now loaded) already defines a global `esc()` for `nav.js`'s own use, and Vue's `{{ }}` text interpolation escapes automatically, so the owner-select options no longer need manual escaping.
- `ownerChangeBusy` disables the "Change owner" button only once validation passes and the request is in flight — matching the original's `btn.disabled = true` placement (after the `if (!cgId || !ownerId) return;` validation check, not before), so a validation-error click never disables the button.
- The non-admin branch shows only the header + access-denied alert (no hidden single-proposal/owner-change cards in the DOM) — same visible outcome as the original's `#resetCards.innerHTML` replacement, restructured to avoid duplicating the header markup in two branches.

- [ ] **Step 2: Verify the page has no syntax errors**

Run: `node -e "require('fs').readFileSync('_db-reset.html', 'utf8')" && echo "file readable"`

This only confirms the file is readable — full behavioral verification isn't possible pre-merge (see Global Constraints). Also visually re-read the file to confirm the `<script>` block has matched braces/parens (no automated JS linter is configured for this project per `CLAUDE.md`).

- [ ] **Step 3: Run the frontend test suite**

Run: `npm test`
Expected: all existing tests still pass (this file has no test coverage today, and none is being added — see the design spec's "Testing" section — so this step only confirms the change didn't break anything elsewhere).

- [ ] **Step 4: Commit**

```bash
git add _db-reset.html
git commit -m "feat(db-reset): migrate _db-reset.html to Vue 3, add navbar

1:1 port of every reset/owner-change/auth-gate flow from imperative
DOM manipulation to Vue 3 (CDN, no build step), same pattern as
admin.html. The 7 scope-delete cards collapse into one v-for over a
scopes data array. The two independently-registered #confirmOk click
listeners (an accidental artifact, not intentional behavior — see
design spec) consolidate into one confirmDelete() dispatcher with
behavior-identical branches.

Deliberate addition: initNav()/navbar, which this page previously
lacked. Page stays hidden (activeTab: null, no nav-tab entry) and
admin-gated.

Design: docs/superpowers/specs/2026-07-15-db-reset-vue-migration-design.md"
```

---

### Task 2: Manual verification (post-merge only — do not attempt during Task 1's review cycle)

**This task cannot be executed until after `/finish-cycle`'s Gate 4 (merge) completes.** `pdash-nginx` serves the main checkout's working directory, not this branch's worktree — `_db-reset.html`'s new behavior is invisible in a browser until the merge writes it to `main`'s disk. Record this explicitly when running `/finish-cycle`'s Gate 2: state that manual verification is deferred to after Gate 4, per this plan.

**Files:** None — this is a manual browser checklist, no code changes.

- [ ] **Step 1: As a non-logged-in user, open `/_db-reset.html`**

Expected: immediate redirect to `/login.html` (via `initNav()`'s own 401 handling).

- [ ] **Step 2: As a logged-in non-admin user, open `/_db-reset.html`**

Expected: navbar renders (with breadcrumb `Home > Database Reset`, no tab highlighted); page body shows the title/subtitle and an "Access denied — admin only." alert; no reset cards, no single-proposal/owner-change cards are present in the DOM.

- [ ] **Step 3: As an admin user, open `/_db-reset.html`**

Expected: navbar renders (no tab highlighted, breadcrumb `Home > Database Reset`); all 7 scope-delete cards render with correct titles/descriptions/button text; single-proposal-delete and change-owner cards render below.

- [ ] **Step 4: Trigger a scope delete (pick a low-impact scope, e.g. `notifications`)**

Click "Delete all notifications" → confirm modal opens with text "You are about to permanently delete all notifications for all users." → confirm button stays disabled until typing `DELETE` exactly → click "Delete permanently" → modal closes, button briefly shows "✓ Done" in green and is disabled, then reverts to "Delete all notifications" in red after ~3 seconds.

- [ ] **Step 5: Trigger a single-proposal delete with an invalid/nonexistent UUID**

Expected: modal opens with the UUID echoed in the confirm text; after confirming, an inline error message appears in red below the input (not an `alert()`), and does not auto-revert.

- [ ] **Step 6: Trigger a change-owner attempt with only one field filled**

Expected: inline red message "Cost grid UUID and new owner are required." appears immediately, no network request fires (check devtools Network tab), "Change owner" button never becomes disabled for this case.

- [ ] **Step 7: Open the owner `<select>` and confirm it lists active users**

Expected: dropdown shows `First Last (email)` entries, loaded from `/api/users/active-list` (verify via devtools Network tab that this request fired once on page load).

- [ ] **Step 8: Regression check for the listener consolidation — trigger a scope-delete confirm, cancel it, then immediately trigger a single-proposal-delete confirm**

Expected: only the relevant request fires each time (verify via devtools Network tab) — no duplicate or cross-triggered request from the other flow.

- [ ] **Step 9: Record the result**

If all 8 checks pass: note in the cycle's `/finish-cycle` report (Gate 2 or Roadmap notes section) that manual verification was completed post-merge, listing the checks above. If any check fails: this is a regression against the 1:1-port requirement — do not close the cycle; fix `_db-reset.html` on a new small follow-up commit, re-verify, then close.

---

## Self-Review Notes

- **Spec coverage:** every data field and method named in the design spec's "Components" section (`me`, `scopes`, `pendingScope`/`pendingCgId`, `confirmText`/`confirmInputValue`/`confirmBusy`, `cgDeleteMsg`/`cgOwnerMsg`, `scopeDoneFlag`, `ownerOptions`/`ownerSelected`, `accessDenied`/`ready`, `confirmDelete()`/`openScopeConfirm()`/`openCgDeleteConfirm()`/`changeOwner()`) is present in Task 1's code, with identical names — no drift. The design spec's `onModalHidden()` is inlined as an anonymous listener in `mounted()` instead of a named method, which is a strictly cosmetic simplification (the design spec describes it as "bound to the modal's `hidden.bs.modal` event," which this satisfies) — noted here rather than silently diverging.
- **Placeholder scan:** no TBD/TODO; Task 1's code block is the complete file content for the `<body>`, not a fragment description. Task 2's steps are concrete checks with expected outcomes, not "verify it works."
- **Type consistency:** `scopes[]` entries use `scope`/`title`/`description`/`buttonText`/`label` consistently between the data array, the template's `v-for`, and `openScopeConfirm()`'s lookup — no naming drift. `cgDeleteMsg`/`cgOwnerMsg` are consistently `{ text, isError } | null` everywhere they're read or written.
