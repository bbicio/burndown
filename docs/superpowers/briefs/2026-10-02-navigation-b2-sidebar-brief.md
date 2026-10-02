# Brief — Navigation, Cycle B2: sidebar, small-screen navbar, account and notifications

**Scenario:** 2 (evolution), as classified by the user.
**Sources:** same as B1 (`2026-10-02-navigation-b1-page-shell-brief.md`): the Claude Design handoff + integration, the five layout images in `docs/superpowers/design/`, and the 2026-09-24 navigation audit.
**Prerequisite:** B1 merged (page shell, inert head script, `keep` Set key, `--sidebar-w` rule).
**Also an input:** `docs/superpowers/design/2026-10-02-navigation-handoff-addendum-footer-removal.md` (footer removed entirely; the `.pb-board-root` calc becomes navbar-only, and the footer term drops out of every dependent calc).
**Handoff claims checked against the code (2026-10-02):** the integration file adds §15 (SVG icons) that the first file referenced but lacked. Corrections found: the account button is not an avatar with initials today (`nav.js:98-101` shows the name as text); §15 does not map the `⚙ Admin` / `🔒 Sysadmin` trigger emoji, the banner emoji (`nav.js:88`, `notifications.js:46,50`, set via `textContent`) or the modal-title emoji (`nav.js:208,247`); audit finding 3 (`…` last crumb) is already fixed (`costgrid.html:1541-1545`, `project-config.html:622-630`); the real navbar height is 110px (not 106), and `.pb-board-root`'s 206px also omits the breadcrumb bar. The handoff's top-navbar recommendation and its §3 trims are superseded by the sidebar images.

## Current behavior (verified in code)

- Top navbar, 110px (`js/nav.js:66-120`), two rows, emoji in tabs and menus; no behavior for narrow widths (no `@media` in `css/`, no `flex-wrap`).
- Admin and Sysadmin menus are dropdowns (`nav.js:35-62`).
- Footer: fixed, 100px (`css/style.css:32-47`, `nav.js:154-161`). `.pb-board-root` is `calc(100vh - 206px)` (`css/style.css:365`).
- Account: dropdown with the name in plain text (`nav.js:97-112`). Bell: 360px fixed panel, badge `bg-danger` (`nav.js:75-95`).
- Names differ between menu, `<title>` and breadcrumb:

| Menu entry | `<title>` | Breadcrumb |
|---|---|---|
| Project Reporting | Project Reporting | Project Portfolio |
| Resource Planning | Resource Planning | Resource Planning |
| Config | Configuration | Configuration |
| Actuals Repository | Timesheets | Timesheets |
| User Admin | Admin | Administration |
| DB Reset | DB Reset | Database Reset |

- Breadcrumb: white bar under the navbar on every authenticated page.

## Expected behavior

1. **Width ≥ 1024px: left sidebar** (images `navbar_aperta`, `navbar_collassata`).
   - Open by default, collapsible to an icon rail; state remembered across pages (key and head script from B1).
   - Pipeline, Portfolio, Planning, then ADMIN and SYSADMIN sections always expanded (no dropdowns). Active item with a magenta left border.
   - Bottom: avatar, email, bell, "© 2026 PDash".
2. **Width < 1024px: dark icon-only navbar** (image `schermi-piccoli-menu`): logo, bell and avatar (initials) on the right, icon-only tabs, a dot on the two group triggers. Portrait tablets and phones use this; landscape tablets use the sidebar. No breadcrumb here.
3. **Header:** on the large layout the breadcrumb sits in the white bar at the top of the content. The fixed footer is gone.
4. **Account menu:** the current 5 entries with SVG icons. Collapsed: opens to the right of the rail, anchored to the avatar. Expanded: anchored to the email row. Small screens: 230px wide under the avatar (images `schermo-grande-avatar-notifiche`, `schermi-piccoli-avatar-notifiche`).
5. **Notifications panel:** anchored to the bell, wider than the account menu; on small screens 10px side margins instead of the fixed 360px. Unread items: magenta tint and left border, "Open →" link.
6. **Bell** always visible, never under the avatar. With unread notifications it looks different (to define).
7. **SVG icons** replace every emoji: entries, triggers, panel banner (rewritten without `textContent`) and modal titles (integration file §15).
8. **Uniform names:** menu entry, `<title>` and breadcrumb of each page use the same name (proposal: the breadcrumb name).
9. **Offset:** content shifts by the sidebar width through `--sidebar-w` (open, rail, 0 below 1024px), with no other page changes.

## Constraints

- B1 merged first.
- Existing IDs stay: `#nav-notif-btn`, `#nav-account-btn`, `#nav-profile-btn`, `#nav-settings-btn`, `#nav-send-notif-btn`, `#nav-change-pwd-btn`, `#nav-logout-btn`.
- The sidebar sits below Bootstrap modals (z-index ≤ 1030).
- Every edited file: bump all `?v=` (`nav.js?v=11`, `style.css?v=15`, `tokens.css?v=8`, `core.js?v=10`). Every text-on-background pair in `tokens.css` stays ≥ 4.5:1 (`tokens.test.js`).
- All user-facing text in English. Worktree + `/finish-cycle`.

## Acceptance criteria

1. User, admin and sysadmin see the sidebar, open on first visit; the collapse persists across pages and reloads.
2. At 1024px and up: sidebar; below: icon navbar, no horizontal scroll, no breadcrumb.
3. `.pb-board-root` fills the page exactly with the sidebar open, collapsed and the small navbar, measured in a browser.
4. The account menu and notifications panel open in the three positions of the images without leaving the viewport.
5. The bell is visible in every state and unread notifications are distinguishable.
6. No emoji remains in the nav, dropdowns, modal titles or the panel banner.
7. Every page shows the same name in menu, `<title>` and breadcrumb.
8. All `?v=` aligned and `npm test` passes. Manual check as user, admin and sysadmin with every menu open.

## Explicitly excluded scope (proposed; not yet confirmed one by one)

- Redesign of page content and modals beyond the title.
- Changing Bootstrap's danger red globally.
- Print stylesheet.
- Removing `--breadcrumb-h` if it stays without consumers.

## Open questions for /brainstorming

1. Unread bell look: white background with red icon, and does the numeric badge stay?
2. What opens when tapping the Admin and Sysadmin groups on the small navbar (proposal: a dropdown with the entries).
3. Footer: RESOLVED in part — `2026-10-02-navigation-handoff-addendum-footer-removal.md` removes the fixed footer entirely on every layout (also `.app-footer`'s rule and the `paddingBottom:100px` at `nav.js:160`), and no small-screen image shows one. STILL OPEN: the addendum says the "2026 PDash" copyright line is not kept anywhere, but `navbar_aperta.png` shows "© 2026 PDash" at the bottom of the open sidebar. The images are the user's stated source of truth; confirm whether the line stays in the open sidebar.
4. Names: breadcrumb name as the single name (Pipeline, Project Portfolio, Resource Planning, Configuration, Timesheets, Administration, Team, Attribute Lists, Database Reset, Terms & Conditions), or the short labels of the images (Portfolio, Planning, Master Data, Timesheets)?
5. Recomputing `.pb-board-root` and `costgrid.html:213` in both layouts.
6. Layout jump on load: covered by the B1 head script, or to be measured first.
