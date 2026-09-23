# js/nav.js

Navbar + footer injection, `initNav()`; injects settings, change-password, send-notification, and "My Profile" modals; T&C gate after `GET /api/auth/me` (redirects to `/terms.html` if `user.terms_version < current_terms_version`); calls `initNotifications()`; stores `window.__navUser`.

This file holds the full implementation narrative for `js/nav.js` — cycle-by-cycle detail, first-attempt bugs. `CLAUDE.md`'s File structure entry keeps only a one-line pointer; when working on this file, read this file, not that line, for the detail. See `/sync-docs`'s routing rule for where future changes to this file should be written.

## Base state

`adminHtml` block (Config/Actuals Repository/User Admin tabs) gated on `role === 'admin' || role === 'sysadmin'` (was admin-only). `sysAdminHtml` block (2026-09), gated `role === 'sysadmin'` exclusively, injected right after `adminHtml`: two tabs, "🗄 DB Reset" → `/_db-reset.html` (tab id `dbreset`) and "📄 Terms & Conditions" → `/_terms-editor.html` (tab id `termseditor`) — both pages were admin-only before this change; now carved out to sysadmin exclusively. Send Notification's broadcast option (`'All users (broadcast)'`) widened the same way, `['admin','sysadmin'].includes(role)`.

## Dropdown submenus (2026-09)

`adminHtml`/`sysAdminHtml` no longer render their pages as flat inline `<a class="nav-main-tab">` links — each is now a single Bootstrap dropdown (`<div class="dropdown">` wrapper, `<a class="nav-main-tab nav-role-menu-trigger dropdown-toggle" data-bs-toggle="dropdown">` trigger, `<ul class="dropdown-menu">` of `<li><a class="dropdown-item">` items), same pattern as the pre-existing `#nav-account-btn` dropdown further down in this file. Trigger labels: "⚙ Admin" (Config/Actuals Repository/User Admin/Team/Attribute Lists — the latter two added 2026-09 for the resource-allocation cycle's `team.html`/`attribute-lists.html`, `activeTab` ids `'team'`/`'attributelists'`) and "🔒 Sysadmin" (DB Reset/Terms & Conditions) — same role gating and hrefs as before, same preceding vertical divider.

The trigger (not the individual dropdown items) gets the `active` class whenever `activeTab` matches any page id inside its own submenu (`adminPageIds`/`sysAdminPageIds` arrays — keep these in sync with any future page added under a trigger); each `<li><a class="dropdown-item">` also keeps its own exact-match `active` class, independent of the trigger's.

Trigger styling (`.nav-role-menu-trigger` in `css/style.css`): white background + `var(--text-primary)` text, distinct from the plain-text main tabs — deliberately carries **no vertical margin** of its own; a code-review finding caught that a margin here does not collapse through the `<div class="dropdown">` wrapper (the actual flex child in the `align-items-stretch` tabs row), which silently grows that row's height beyond the other tabs' fixed 44px and eats into `pipeline.html`'s `calc(100vh - 206px)` navbar-height contract (see `CLAUDE.md`'s "Pipeline board layout" section) — the trigger relies solely on the already-shared `.nav-main-tab` `height: 44px` to stay the same size as its siblings. Any future style tweak to this trigger must not reintroduce margin/padding on the `<a>` or the `.dropdown` wrapper without re-verifying `pipeline.html`'s sticky column-totals footer stays fully visible for an admin/sysadmin user. The now-fully-dead `.nav-admin-tab` CSS rules (opacity dimming on the old flat links) were removed as part of this change.

## Browser-notification opt-in banner (2026-09)

The injected notification dropdown markup gained a `#nav-notif-browser-banner` row (between the panel header and the notification list), hidden by default and shown/wired entirely by `js/notifications.js`'s `wireBrowserNotifBanner()` — this file only carries the static markup, no logic. See `docs/js/notifications.md` for the full feature.
