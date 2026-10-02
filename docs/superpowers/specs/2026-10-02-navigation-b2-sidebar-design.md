# Navigation Cycle B2 — sidebar, small-screen navbar, account and notifications (design)

**Date:** 2026-10-02 · **Scenario:** 2 (evolution) · **Path:** architectural
**Inputs:** `docs/superpowers/briefs/2026-10-02-navigation-b2-sidebar-brief.md`; the five layout images and `2026-10-02-schermi-piccoli-sottomenu.png` in `docs/superpowers/design/`; `2026-10-02-navigation-handoff-integration.md` (§15 icons); `2026-10-02-navigation-handoff-addendum-footer-removal.md`.
**Prerequisite:** B1 merged (`aa6d762`): `#app-shell > #nav-container + #app-main` on the 14 pages, `--sidebar-w: 0px`, the `<head>` snippet reading `PDash_sidebarCollapsed`, breadcrumb as first child of `#app-main`.

## 1. Agreed understanding

Replace the post-login top navbar with a left sidebar (open by default, collapsible to an icon rail, state remembered) at width ≥ 1024px, and with a dark icon-only navbar below 1024px. The fixed footer disappears everywhere. Emoji become SVG icons. Menu, `<title>` and breadcrumb of each page use the same name. Page contents and modals are not redesigned.

### Decisions taken in brainstorming (2026-10-02)

| # | Question | Decision |
|---|---|---|
| 1 | Names | Short labels of the images: **Pipeline, Portfolio, Planning, Master Data** (the current Config page), **Timesheets, User Admin, Team, Attribute Lists, DB Reset, Terms & Conditions**. Used in menu, `<title>` and breadcrumb. |
| 2 | "© 2026 PDash" | Stays at the bottom of the **open** sidebar only (as `navbar_aperta.png`); absent in the rail and on small screens. |
| 3 | Unread bell | Numeric badge **plus** white button background with red icon and red border (`--color-danger`). Without unread: the light-bordered button on navy. |
| 4 | Admin/Sysadmin groups below 1024px | Icon + dot; a tap opens a **full-width panel** (10px side margins) styled as `2026-10-02-schermi-piccoli-sottomenu.png`: white card, uppercase group title, icon + label rows, active row pink with magenta icon and bold label. |
| 5 | Footers of public pages | The inline fixed `<footer>` of `login.html`, `activate.html`, `reset-password.html` is removed too (`terms.html` has none). |
| 6 | Layout jump on load | Solved in CSS (see 3.4), no measuring step needed first. |

## 2. Verified facts (against the code, 2026-10-02)

- Navbar is 110px (`js/nav.js:66-120`), the account button is plain text, footer is injected by `nav.js:158-166` with `body.style.paddingBottom = '100px'`, `.pb-board-root` is `calc(100vh - 206px)` (`css/style.css:367`) and the string is pinned by `js/lib/foundations-guard.test.js:77`.
- `--breadcrumb-h` (`style.css:18-19`) has no consumer today.
- Sticky/fixed offsets elsewhere (`planning.html`, `costgrid.html`, `team.html`, `#teamAssistantPanel`) are relative to their own container or the viewport, not to the navbar; only `.pb-board-root` depends on the chrome height. `costgrid.html:216` `calc(100vh - 300px)` is a page-internal area, re-checked visually only.
- Current cache versions: `style.css?v=16`, `core.js?v=11`, `nav.js?v=12`, `notifications.js?v=2`, `tokens.css?v=8`.

## 3. Design

### 3.1 Structure (approach A: one DOM, responsive CSS)

IDs must stay unique, so `nav.js` renders **one** `<aside class="pd-nav">` into `#nav-container`, with three direct children:

- `.pd-nav-brand` — logo ("PDash"; "P" in the rail) and, ≥ 1024px, the collapse/expand button.
- `.pd-nav-items` — the 3 destinations, then the Admin group (`admin`/`sysadmin` only) and the Sysadmin group (`sysadmin` only), each a `<section>` with a title and its entries.
- `.pd-nav-actions` — avatar (initials), email, bell, and "© 2026 PDash" (open sidebar only).

Existing IDs are unchanged: `#nav-notif-btn`, `#nav-account-btn`, `#nav-profile-btn`, `#nav-settings-btn`, `#nav-send-notif-btn`, `#nav-change-pwd-btn`, `#nav-logout-btn`, plus `#nav-notif-badge`, `#navNotifWrapper`, `#nav-notif-list`, `#nav-notif-read-all`, `#nav-notif-browser-*`. `notifications.js` keeps its logic.

### 3.2 Layouts

**≥ 1024px (sidebar):** `aside` is `position: fixed`, full viewport height, a column. `--sidebar-w` is 240px open and 68px in the rail (final values fixed against the images when implemented). `.pd-nav-items` scrolls by itself on short viewports; `.pd-nav-actions` sits at the bottom. Group titles are always visible (hidden in the rail, replaced by a divider line). Active item: magenta left border and light navy background. The collapse state toggles `data-sidebar="collapsed"` on `<html>` and writes `PDash_sidebarCollapsed` (key already in `core.js`'s `keep` Set from B1). The breadcrumb stays in the white bar at the top of `#app-main`.

**< 1024px (navbar):** `aside` is a two-row grid in normal flow (not fixed: it scrolls away, reclaiming the space). Row 1: logo left, bell and avatar right. Row 2: icon-only destinations, a separator, then the two group buttons with a dot. `--sidebar-w` is 0. The breadcrumb is hidden. Magenta bottom border as today. Landscape tablets (≥ 1024px) get the sidebar; portrait tablets and phones the navbar.

**Group panels (< 1024px):** each group button is a plain `<button>` with `aria-expanded`; the panel is absolutely positioned at the bottom of the `aside`, `left/right: 10px`, z-index below Bootstrap modals (1055): base `--z-fixed` (300), raised to 1050 only while a dropdown or group panel is open. One open at a time; closes on outside tap, `Esc` or entry selection. ~20 lines of JS, no Bootstrap component.

### 3.3 Account menu and notification panel

Both stay Bootstrap dropdowns; a `popperConfig` function evaluated on `show` picks the placement from the active layout:

| Layout | Account menu | Notification panel |
|---|---|---|
| Sidebar open | to the right, anchored to the email row, opening upward | to the right, aligned to the bell, wider than the account menu |
| Rail | to the right of the rail, aligned to the avatar bottom | same anchoring, aligned to the bell |
| < 1024px | under the avatar, 230px wide | 10px side margins instead of the fixed 360px |

Account entries are the current 5 with SVG icons. Unread items use magenta tint + left border (tokens replace `#fdf0f5`/`#f9e8f0`), "Open →" link kept. The browser-notification banner and the modal titles (profile, change password, send notification) get SVG icons built without `textContent`. The viewport must never be exceeded. Avatar initials come from first + last name, falling back to the first letter of the email.

### 3.4 No layout jump

CSS gives `#nav-container` its size and navy background from the first paint, from `html[data-sidebar]` (set by the B1 head snippet) and a `min-width: 1024px` media query: a fixed navy column of `--sidebar-w` on large screens, a navy bar on small ones. `--sidebar-w` is set by CSS, not by JS, so content never moves when the navigation appears.

### 3.5 Footer and heights

- `nav.js:158-166` (footer + `paddingBottom`) and `.app-footer` are deleted. The inline `<footer>` is deleted from `login.html`, `activate.html`, `reset-password.html`.
- `.pb-board-root`: `calc(100vh - var(--breadcrumb-h))` in the sidebar layouts (the first real consumer of `--breadcrumb-h`); below 1024px a `--nav-top-h` variable, confirmed by measuring. **Acceptance:** measured in a real browser, the board fills the page exactly (no page scroll, no gap) with the sidebar open, the rail and the small navbar.
- `costgrid.html:216` is checked visually and left as is if correct.
- `foundations-guard.test.js:77` is updated to the new formula.

### 3.6 Icons, names, tokens

- Icons per handoff §15 (`currentColor`, `aria-hidden="true"`, `.nav-icon`, sizes `--icon-size-sm`/`-md`); missing ones (modal titles, banner) reuse the set (person, megaphone, key, bell). No emoji remains in navigation, dropdowns, modal titles or the banner.
- Names applied in `<title>` and breadcrumb of `config.html` (Master Data), `portfolio.html` (Portfolio, 3 occurrences) and the parent crumb in `project-config.html`, `planning.html` (Planning), `admin.html` (User Admin), `_db-reset.html` (DB Reset). `timesheets`, `team`, `attribute-lists`, `_terms-editor` are already aligned. Before editing, grep the whole repo (tests, docs, `OPERATIONAL_MANUAL.html`) for the old strings.
- New tokens only if needed (magenta tint, icon sizes), added to `tokens.css`; every text-on-background pair stays ≥ 4.5:1 (`tokens.test.js`).

## 4. Constraints

- Sidebar and panels below Bootstrap modals (1055): base `--z-fixed` (300), raised to 1050 only while a dropdown or group panel is open.
- `#app-shell`/`#app-main` never get `overflow`, `transform`, `filter`, `contain`, `will-change` or `position` (pinned by `nav-shell-guard.test.js`).
- Every edited versioned file: bump every `?v=` reference on all pages (`nav.js` 12→13, `style.css` 16→17, `notifications.js` 2→3, `tokens.css` 8→9 and `core.js` only if changed); `foundations-guard.test.js` enforces agreement.
- All user-facing text in English. Worktree + `/finish-cycle`; Docker main-stack safety rules of `CLAUDE.md` apply (frontend only, no `pdash-api` restart expected).

## 5. Testing

- Unit (vitest): avatar initials; group-panel open/close logic (one open, outside tap, `Esc`); name map vs `<title>`/breadcrumb of the 14 pages; `foundations-guard` update; `nav-shell` tests still green.
- `npm test` green; every `?v=` aligned.
- Manual, as user, admin and sysadmin with every menu open: sidebar open / rail / < 1024px; collapse persists across pages and reloads; account menu and notification panel in the three positions of the images without leaving the viewport; bell visible in every state and unread distinguishable; no emoji left; no layout jump on reload; public pages without footer and still centred.

## 6. Acceptance criteria

1. User, admin and sysadmin see the sidebar, open on first visit; the collapse persists across pages and reloads.
2. At 1024px and up: sidebar; below: icon navbar, no horizontal scroll, no breadcrumb.
3. `.pb-board-root` fills the page exactly in the three layouts, measured in a browser.
4. Account menu and notification panel open in the three positions of the images without leaving the viewport.
5. The bell is visible in every state and unread notifications are distinguishable (badge + white/red button).
6. No emoji remains in the navigation, dropdowns, modal titles or the panel banner.
7. Every page shows the same name in menu, `<title>` and breadcrumb.
8. No fixed footer on any page, including login, activate and reset-password.
9. All `?v=` aligned and `npm test` passes; manual check completed.

## 7. Explicitly excluded

- Redesign of page content and modals beyond the title.
- Changing Bootstrap's danger red globally.
- Print stylesheet.
- Removing `--breadcrumb-h` (it gains a consumer instead).
- Titles of pages outside the menu (`settings.html`, `profile-jobs.html`).
- `terms.html` (no footer, untouched).
