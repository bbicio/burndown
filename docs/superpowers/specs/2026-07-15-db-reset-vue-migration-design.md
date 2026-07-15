# `_db-reset.html` Vue 3 Migration — Design Spec

**Source:** Brief `docs/superpowers/specs/2026-07-15-db-reset-vue-migration-brief.md`. Tier 1, page 2 of `docs/superpowers/specs/2026-07-14-vue-migration-roadmap-design.md`. Follows the pattern validated by the `terms.html` migration (`docs/superpowers/specs/2026-07-14-terms-vue-migration-design.md`).

## Problem

`_db-reset.html` (366 lines) is the last remaining self-contained-inline-script Vanilla JS page with no shared-module dependency, aside from `terms.html` (already migrated). It also has no navbar/`initNav()` today, unlike every other authenticated page. This cycle migrates it to Vue 3 (CDN, no build step) and adds the standard navbar.

## Architecture

Single-file Vue 3 rewrite, same shape as `admin.html`/`terms.html`: full page load stack (`core.js`, `api.js`, `api-sync.js`, `nav.js`, `notifications.js`, `settings.js`) + inline `<script>` with `Vue.createApp({...}).mount('#app')`. No new `js/*.js` file — logic stays inline, matching the Brief's constraint.

`created()` calls:
```js
const user = await initNav(null, { breadcrumbs: [
  { label: 'Home', href: '/pipeline.html' },
  { label: 'Database Reset' },
]});
if (!user) return;           // initNav() already redirected to /login.html on 401
this.me = user;
if (user.role !== 'admin') { this.accessDenied = true; return; }
await this.loadActiveUsers();
this.ready = true;
```

`activeTab` is passed as `null` — `js/nav.js`'s tab-highlight logic (`js/nav.js:32-39`) only compares `activeTab` against a fixed set of known tab IDs (`pipeline`, `portfolio`, `planning`, `config`, `timesheets`, `admin`); `null` matches none of them, so no tab highlights. This matches `_db-reset.html`'s status as a hidden, unlinked admin URL — same pattern `admin.html` uses for its own `breadcrumbs` option, applied here with no active tab.

This replaces the current inline `GET /api/auth/me` IIFE (`_db-reset.html:162-180`) entirely — `initNav()` performs the auth check and 401 redirect itself; the page's own role check runs on `initNav()`'s returned user object, one auth round-trip instead of two. This is a deliberate, small deviation from strict 1:1 code structure (see "Backward compatibility" below for why the *observable* behavior is unchanged).

## Components (single Vue instance)

**`data()`:**
- `me`, `ready`, `accessDenied` — gate state from `initNav()` + the role check.
- `scopes`: reactive array replacing both the 7 static HTML cards and the `SCOPE_LABELS` map:
  ```js
  scopes: [
    { scope: 'proposals', title: 'Proposals', description: 'Deletes all cost grids, versions, phases, tasks, task roles, and related sharing records.', label: 'all proposals (cost grids, versions, phases, tasks)' },
    { scope: 'projects', title: 'Projects & Programs', description: 'Deletes all projects (including tasks and planning data) and all programs. Cost grids are not affected.', label: 'all projects and programs' },
    { scope: 'clients', title: 'Clients & Client Groups', description: 'Deletes all clients, client groups, and their POTs. Client references on proposals and projects are set to null.', label: 'all clients and client groups' },
    { scope: 'ratecards', title: 'Client Ratecards', description: 'Deletes all ratecards that are linked to a specific client (agency-wide ratecards without a client are not affected). Ratecard references on versions are set to null.', label: 'all client ratecards' },
    { scope: 'actuals', title: 'Actuals (Timesheets)', description: 'Deletes all uploaded timesheet data. Project structure is not affected.', label: 'all timesheet actuals' },
    { scope: 'pipelines', title: 'Pipeline Years & POTs', description: 'Deletes all pipeline years and all POT targets with their history. Proposals already in SIP/Committed are not affected.', label: 'all pipeline years and POTs' },
    { scope: 'notifications', title: 'Notifications', description: 'Deletes all in-app notifications for all users. Push/email history sent is not affected.', label: 'all notifications for all users' },
  ]
  ```
  `title`/`description` render each card via `v-for`; `label` is what today's `SCOPE_LABELS` map fed into the confirm-modal text — folded into the same array entry instead of a parallel lookup table.
- `pendingScope`, `pendingCgId` — mutually exclusive; unchanged semantics from today's module vars.
- `confirmText`, `confirmInputValue`, `confirmBusy` — drive the shared confirm modal.
- `cgDeleteMsg`, `cgOwnerMsg` — `{ text, isError } | null`, persistent inline messages (no auto-revert), same as today's `#cgDeleteMsg`/`#cgOwnerMsg`.
- `scopeDoneFlag` — `{ scope } | null`, drives the 3-second auto-reverting "✓ Done" button state (`setTimeout` clears it), replacing today's direct DOM class/text swap on the clicked button.
- `cgIdInput`, `cgOwnerIdInput`, `ownerOptions`, `ownerSelected` — form state; `ownerOptions` replaces manual `<option>` string building (today's `loadActiveUsersIntoOwnerSelect()`), rendered via `v-for`. Vue's text interpolation escapes automatically, so the manual `esc()` helper is dropped.

**`methods()`:**
- `openScopeConfirm(scope)` — sets `pendingScope`, `confirmText` from `scopes.find(...)`.label, opens the Bootstrap modal (still managed imperatively via `bootstrap.Modal.getOrCreateInstance`, same as `admin.html`'s pattern elsewhere — Vue doesn't own Bootstrap's own modal show/hide lifecycle).
- `openCgDeleteConfirm()` — sets `pendingCgId` from `cgIdInput`, `confirmText`, opens the modal.
- `confirmDelete()` — **the one behavioral consolidation point.** Single method, dispatches on which pending state is set:
  ```js
  async confirmDelete() {
    if (this.confirmInputValue.trim() !== 'DELETE') return;
    if (this.pendingScope) return this._doScopeDelete();
    if (this.pendingCgId)  return this._doCgDelete();
  }
  ```
  Replaces today's two independently-registered `#confirmOk` click listeners (`_db-reset.html:200-241`, `267-303`), which both fired on every click and relied on early-return guards to no-op for the wrong pending state — an artifact of the cost-grid-delete flow being bolted on with `addEventListener` after the scope-delete flow already existed (the dead `_origConfirmHandler` variable, assigned and never read, is the leftover evidence). `_doScopeDelete()`/`_doCgDelete()` carry the exact request/response handling from each original branch unchanged. Net observable behavior — same API call, same modal text, same success/error outcome for a given pending state — is identical; only the code shape collapses from two coupled listeners to one dispatcher plus two named helpers.
- `changeOwner()` — same validation/request/message logic as today's `btnChangeOwner` handler, unchanged.
- `onModalHidden()` — bound to the modal's `hidden.bs.modal` event, resets `pendingScope`/`pendingCgId`/`confirmInputValue`, same as today.
- `loadActiveUsers()` — replaces `loadActiveUsersIntoOwnerSelect()`, populates `ownerOptions` from `GET /api/users/active-list`.

## Data flow

Unchanged from today for every reset/owner-change action: same 4 admin-reset endpoints (`POST /api/admin/reset/:scope`, `POST /api/admin/reset/cost-grid/:cgId`, `PATCH /api/admin/reset/cost-grid/:cgId/owner`, `GET /api/users/active-list`), same request payloads, same response handling. The only new call is `initNav()`'s own `GET /api/auth/me`, which now feeds both the navbar chrome and this page's `accessDenied` check — replacing the page's previous standalone call to the same endpoint.

## Error handling

Identical to current for every flow:
- Scope delete failure → `alert('Error: ' + ...)`.
- Cost-grid delete / owner-change failure → persistent inline message (`cgDeleteMsg`/`cgOwnerMsg`, red).
- Network error on any request → same catch-and-message pattern as today.
- Auth-check failure (`initNav()`'s own fetch throwing) → handled by `initNav()` itself, consistent with every other authenticated page in the app; no page-specific `#authBanner` equivalent is needed since `initNav()` already owns this failure mode uniformly across the app.

## Backward compatibility

- Every reset scope, every API call/payload, every success/error message string, the `DELETE`-to-confirm gate, and the 3-second auto-revert are unchanged.
- The 401→login redirect still happens; it now happens once (inside `initNav()`) instead of once via the page's own fetch, with the same net effect.
- The non-admin access-denied state still renders identically (an alert replacing the cards area) — reached via the same `role !== 'admin'` check, now against `initNav()`'s returned user instead of a separately-fetched one.
- **Deviation from strict 1:1 code structure (not behavior):** the two-listener `confirmOk` pattern is consolidated into one dispatcher method. Justification: it was never an intentional feature — the dead `_origConfirmHandler` variable is contemporaneous evidence someone else already recognized this as a bug pattern and attempted (and abandoned) a fix. Reproducing it verbatim in new code would mean deliberately writing two handlers that rely on early returns to avoid double-firing, which is a worse artifact to hand to Vue's declarative event model than to leave behind. Observable output (which API call fires, what the user sees) is identical for both pending-state branches.
- **New behavior, deliberate:** navbar/`initNav()` is added. The page remains hidden (no nav-tab entry, `activeTab: null`) and admin-gated. The existing "← Back to pipeline" link is removed in favor of the `initNav()` breadcrumb trail (`Home > Database Reset`), per user confirmation during brainstorming.

## Testing

No `js/lib/*` pure functions are extracted — nothing here is pure/reusable enough to warrant it (all DOM-adjacent orchestration), same judgment call as `terms.html`'s migration. `npm test` (vitest) continues to pass unaffected — no existing test touches this file.

Manual verification (post-merge, browser-based — `pdash-nginx` serves `main`'s working tree only, same constraint documented in `terms.html`'s plan):
1. Non-admin user (or logged-out) hitting `/_db-reset.html` — confirm login redirect (logged-out) or access-denied alert (logged-in non-admin), navbar still renders for the logged-in-non-admin case.
2. Admin user: navbar renders, no tab highlighted, breadcrumb shows `Home > Database Reset`.
3. Each of the 7 scope-delete cards: confirm modal text matches `scopes[].label`, `DELETE` gate works, successful delete shows 3s auto-reverting button state.
4. Single-proposal delete: confirm modal text, success/error message persists (no auto-revert).
5. Change-owner: validation (both fields required), success/error message persists, `<select>` populated from active users.
6. Trigger a scope-delete confirm and a cost-grid-delete confirm in sequence — confirm only the relevant one's request fires each time (regression check for the listener consolidation).

## Explicitly out of scope

- Any change to the 4 backend API endpoints this page calls.
- Migrating any other Tier 1/Tier 2 page.
- Any build-step introduction (Vite/SFC).
- Un-hiding this page from navigation — it stays a hidden, unlinked admin URL with `activeTab: null`.
