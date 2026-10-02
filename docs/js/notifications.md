# js/notifications.js

Bell icon + SSE notification panel; `initNotifications(user)` called by `js/nav.js`.

This file holds the full implementation narrative for `js/notifications.js` — cycle-by-cycle detail, first-attempt bugs. `CLAUDE.md`'s File structure entry keeps only a one-line pointer; when working on this file, read this file, not that line, for the detail. See `/sync-docs`'s routing rule for where future changes to this file should be written.

## Browser/desktop notifications (2026-09)

A client-side-only, best-effort echo of the same SSE "push" delivery — no server change, no new API.

`refreshBrowserNotifBanner()` (called once at page load and again every time the panel opens, via `wireNotifPanel()`'s `show.bs.dropdown` listener — so a permission change made through the browser's own UI mid-session is picked up without a reload) reads `js/lib/notif-browser.js`'s pure `getBrowserNotifBannerState(permission, optedOut)` and updates the `#nav-notif-browser-banner` markup (injected by `js/nav.js`, see `docs/js/nav.md`) to one of three states: hidden (permission `denied` — nothing this app can override), "🔔 Enable desktop notifications?" + Enable button (permission `default`), or "🔔 Desktop notifications on" + Disable button (permission `granted`).

The click handler on `#nav-notif-browser-enable` branches on live `Notification.permission`: if not yet granted, calls `Notification.requestPermission()`; if already granted, toggles a **local** opt-out instead — `localStorage['PDash_browserNotifDisabled']` — since a granted browser permission can't itself be revoked from JS (2026-09 fix: the button previously stayed stuck on "Enable" forever once granted, with no way to turn popups back off short of the browser's own site settings).

`maybeShowBrowserNotification(n)`, called from `openSseStream()`'s message handler alongside the existing `prependNotification(n)`, shows a native `Notification` only when `js/lib/notif-browser.js`'s `shouldShowBrowserNotification(permission, isPageVisible, optedOut)` returns true — permission granted, the tab isn't currently focused/visible (`document.hasFocus() && !document.hidden`, avoiding a redundant popup when the user is already looking at the panel), and the local opt-out isn't set. Clicking the popup focuses the tab and follows `n.url` if present, mirroring the panel item's own click behavior. Every check is guarded by `typeof Notification === 'undefined'` for unsupported browsers/contexts.

This file itself had never carried a cache-bust `?v=N` on any of its 10 loading pages before this feature — now at `?v=2` (see `CLAUDE.md`'s "Cache-busting" section).

## Navigation Cycle B2 (2026-10-02)

The bell moved into the sidebar's bottom block (top bar on screens < 1024px) and is restyled (`.pd-bell-btn`, `.pd-badge`; see `docs/js/nav.md`). `updateBadge(count)` now also toggles `has-unread` on `#nav-notif-btn` (count > 0 → white button with red icon and border; 0 or negative → cleared, e.g. after "Mark all read"); the numeric badge and the `99+` cap are unchanged. `refreshBrowserNotifBanner()` builds its two labels with `navIcon('bell')` (global from `nav.js`, used only if it is a function) via `innerHTML` over constant strings instead of emoji `textContent`; the text still renders when the helper is missing. Unread items use the tokens `--brand-magenta-tint` / `--brand-magenta-tint-hover` instead of literals. Tests: `js/lib/notifications-ui.test.js`. `notifications.js?v=3`.
