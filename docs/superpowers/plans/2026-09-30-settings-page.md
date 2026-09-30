# Settings page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Per CLAUDE.md, the terminal step of execution is `/finish-cycle`, never `superpowers:finishing-a-development-branch`.

**Goal:** Replace the Settings modal with a new blank `settings.html` page and remove the modal's features (exports, Full Backup, Restore) from the UI.

**Architecture:** Add one Vue page following `_terms-editor.html`'s pattern; `js/nav.js` navigates to it and loses the modal and its wiring; `js/settings.js` is deleted and dropped from the 13 pages that load it. Backend untouched.

**Tech Stack:** Vue 3 (CDN, no build), plain classic scripts, vitest (`npm test`) as regression gate.

**Spec:** `docs/superpowers/specs/2026-09-30-settings-page-design.md`

## Global Constraints

- All user-facing text in English.
- No bundler, no build step.
- Cache-busting: `js/nav.js` goes `?v=10` → `?v=11` in **every** page that loads it (13 existing pages + the new `settings.html` uses `?v=11`).
- `/api/exports/*` routes, `sendExportEmail` and everything under `api/` stay untouched.
- Do NOT touch anything else in `js/nav.js` (dropdown items, notifications, change-password, send-notification modal, My Profile modal).
- New Vue page must have `v-cloak` on its root mount element and no inline hex colours.
- Never run `docker compose` against the main stack; manual checks use `scripts/test-branch.sh`.
- Work in a worktree branch (`superpowers:using-git-worktrees`; copy `.env` from the main checkout, never commit it). Bash commands in a worktree-isolated session must be plain and run from the worktree.

## Review Focus

- A page that keeps a `js/settings.js` tag gets a 404: zero references must remain (grep).
- `initNav('settings')` with a tab id that is not in the tab lists must not break the navbar (comparisons only, verified).
- After removing the modal, `nav.js` must not call `openSettingsModal` / read `#settingsModal` anywhere.
- Logged-out visit to `/settings.html` redirects to login.

---

### Task 1: Create settings.html

**Files:**
- Create: `settings.html`

**Interfaces:**
- Consumes: `initNav(activeTab, { breadcrumbs })` from `js/nav.js` (returns the user or null after redirecting).
- Produces: page `/settings.html`.

- [ ] **Step 1: Create the file** with exactly this content:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PDash — Settings</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css">
  <link rel="stylesheet" href="css/tokens.css?v=7">
  <link rel="stylesheet" href="css/style.css?v=14">
  <style>
    body { background: var(--bs-white); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .page { margin: 3rem auto; }
  </style>
</head>
<body>

<!-- Navbar (injected by nav.js) -->
<div id="nav-container"></div>

<div id="app" v-cloak>

  <div v-if="ready" class="page app-container">
    <h4 class="fw-bold mb-0">Settings</h4>
  </div>

  <div v-else class="d-flex align-items-center justify-content-center" style="height:60vh">
    <div class="spinner-border text-secondary"></div>
  </div>

</div>

<script defer src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script defer src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script defer src="js/api.js?v=7"></script>
<script defer src="js/core.js?v=7"></script>
<script type="module" src="js/lib/notif-browser.js?v=2"></script>
<script defer src="js/notifications.js?v=2"></script>
<script defer src="js/nav.js?v=11"></script>
<script type="module">
  Vue.createApp({
    data() {
      return { ready: false };
    },
    async created() {
      const user = await initNav('settings', { breadcrumbs: [
        { label: 'Home', href: '/pipeline.html' },
        { label: 'Settings' },
      ]});
      if (!user) return;
      this.ready = true;
    },
  }).mount('#app');
</script>
</body>
</html>
```

Before saving, compare the `css/tokens.css` / `css/style.css` `?v=` values with those in `_terms-editor.html` and copy the current ones if they differ. `nav-container` and `app` markup mirror `_terms-editor.html`.

- [ ] **Step 2: Sanity check the file** with `grep -c "settings.js" settings.html` → expected `0`, and `grep -c "v-cloak" settings.html` → expected `1`.

- [ ] **Step 3: Commit**

```bash
git add settings.html
git commit -m "feat: add blank settings.html page

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: nav.js navigates to the page; remove the modal, its wiring and settings.js

**Files:**
- Modify: `js/nav.js` (settings modal injection block ~lines 293-332; wiring block ~lines 461-498)
- Delete: `js/settings.js`
- Modify (each of 13 pages — remove the `<script defer src="js/settings.js?v=1"></script>` line, and change `js/nav.js?v=10` → `js/nav.js?v=11`): `pipeline.html`, `costgrid.html`, `config.html`, `_terms-editor.html`, `_db-reset.html`, `timesheets.html`, `attribute-lists.html`, `admin.html`, `project-config.html`, `team.html`, `profile-jobs.html`, `portfolio.html`, `planning.html`

**Interfaces:**
- Consumes: `/settings.html` from Task 1.

- [ ] **Step 1: Edit `js/nav.js` — remove the modal injection.** Delete the whole block from `// ── SETTINGS MODAL (injected once by nav.js) ─…` through its closing `}` (the `if (!document.getElementById('settingsModal')) { … }` statement). Read the block first to get the exact start/end.

- [ ] **Step 2: Edit `js/nav.js` — replace the wiring block.** Replace the entire `// ── SETTINGS MODAL EVENTS (wired once) ──` block (the `if (!document.getElementById('stgAlreadyWired')) { … }` statement, including the export, backup and restore handlers and the marker) with:

```js
  // ── SETTINGS BUTTON (wired once) ────────────────────────────────────────────
  if (!document.getElementById('stgAlreadyWired')) {
    document.getElementById('nav-settings-btn').addEventListener('click', () => {
      window.location.href = '/settings.html';
    });

    // Mark wired
    const marker = document.createElement('span');
    marker.id = 'stgAlreadyWired';
    marker.style.display = 'none';
    document.body.appendChild(marker);
  }
```

- [ ] **Step 3: Delete `js/settings.js`.**

Run: `git rm js/settings.js`

- [ ] **Step 4: Update the 13 pages.** In each file listed above, with the Edit tool: remove the line containing `js/settings.js?v=1` and change `js/nav.js?v=10` to `js/nav.js?v=11`. (Edit each page separately; the lines differ only by indentation.)

- [ ] **Step 5: Verify no stale references remain**

Run each and expect the stated output:
- `grep -rn "settings.js" --include=*.html .` → no output
- `grep -rn "openSettingsModal\|stgExport\|downloadFullBackup\|restoreFromBackup\|settingsModal\|stg-admin-only\|stg-export-email\|stgExportStatus\|btnExport_\|btnFullBackup\|btnRestoreBackup" --include=*.html --include=*.js js *.html` → no output (only `docs/` and tests may mention them; check `git grep -n` if unsure)
- `grep -rn "js/nav.js" --include=*.html .` → 14 lines, all `?v=11`

- [ ] **Step 6: Run the suite**

Run: `npm test`
Expected: all green (none of the removed code had tests).

- [ ] **Step 7: Commit**

```bash
git add -A js/nav.js js/settings.js pipeline.html costgrid.html config.html _terms-editor.html _db-reset.html timesheets.html attribute-lists.html admin.html project-config.html team.html profile-jobs.html portfolio.html planning.html
git commit -m "feat: Settings opens settings.html; remove modal, exports UI, backup and restore

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Manual verification on the isolated stack

- [ ] **Step 1:** `scripts/test-branch.sh up`. Log in, open the account dropdown on pipeline, config, planning, project-config and admin, click "⚙ Settings" → lands on `/settings.html` each time, no modal.
- [ ] **Step 2:** On `settings.html`: navbar, footer and breadcrumb "Home › Settings" present; content white with only the title "Settings"; browser console shows no errors and no 404 for `settings.js`.
- [ ] **Step 3:** Log out, open `/settings.html` directly → redirected to login.
- [ ] **Step 4:** Open each of the 13 pages once → console clean.
- [ ] **Step 5:** Run `/finish-cycle`. Tear the stack down only after the user's own "yes" at Gate 2.

---

## Self-review

- Spec coverage: D1/D2/D3/AC1/AC2 → Tasks 1-2 and 3 steps 1-3; D4-D6/AC3/AC4 → Task 2 (steps 1-5); D7/AC5 → no `api/` change; AC6 → Task 3 step 4; AC7 → Task 2 steps 4-6. Documentation updates are done by `/sync-docs` at `/finish-cycle`.
- Names consistent: `#nav-settings-btn`, `stgAlreadyWired`, `initNav('settings')`.
- No placeholders.
