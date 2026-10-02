# Navigation Cycle B2 — Sidebar, Small-Screen Navbar, Account and Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Closing the branch is `/finish-cycle`, never `superpowers:finishing-a-development-branch` (CLAUDE.md process override). **No task in this plan runs `docker compose` against the main stack** (browser checks use `scripts/test-branch.sh`, the isolated branch stack).

**Goal:** Replace the post-login top navbar with a left sidebar (≥ 1024px: open by default, collapsible to an icon rail, state remembered) and a dark icon-only navbar below 1024px; remove every fixed footer; replace emoji with SVG icons; give menu, `<title>` and breadcrumb of each page the same name.

**Architecture:** `js/nav.js` renders **one** `<aside class="pd-nav">` into `#nav-container` (brand / items / actions as direct children); media queries in `css/style.css` turn it from a fixed vertical sidebar into a two-row navbar. Bootstrap dropdowns (account, notifications) get a `popperConfig` function that picks the placement from the active layout; the Admin/Sysadmin groups are plain buttons toggling a full-width panel below 1024px (always expanded on large screens). `#nav-container` has its size and navy background from CSS alone, so nothing jumps on load. Pure helpers live at the top of `nav.js` and are unit-tested by loading the file with `new Function(...)` (the pattern of `js/lib/nav-shell.test.js`).

**Tech Stack:** static HTML + Vue 3 CDN pages (no build), classic scripts, Bootstrap 5.3.2 (CDN), vitest + jsdom (`npm test`).

**Spec:** `docs/superpowers/specs/2026-10-02-navigation-b2-sidebar-design.md` (Brief: `docs/superpowers/briefs/2026-10-02-navigation-b2-sidebar-brief.md`; images and handoff in `docs/superpowers/design/`).

## Global Constraints

- Layout switch at **1024px**: `min-width: 1024px` = sidebar, below = icon navbar; breadcrumb hidden below 1024px.
- `--sidebar-w`: **240px** open, **68px** rail, `0px` below 1024px (the base rule `:root { --sidebar-w: 0px; }` stays exactly as B1 wrote it).
- Names (menu = `<title>` = breadcrumb): **Pipeline, Portfolio, Planning, Master Data** (the current Config page), **Timesheets, User Admin, Team, Attribute Lists, DB Reset, Terms & Conditions**.
- "© 2026 PDash" only at the bottom of the **open** sidebar. No fixed footer anywhere, including `login.html`, `activate.html`, `reset-password.html` (`terms.html` has none).
- Unread bell: numeric badge **and** white background with red (`--color-danger`) icon and border; read state: light-bordered button on navy.
- Small-screen group panel: full width minus 10px per side, white card, uppercase group title, icon + label rows, active row pink (`--brand-magenta-tint`) with magenta icon and bold label.
- Existing IDs unchanged: `#nav-notif-btn`, `#nav-account-btn`, `#nav-profile-btn`, `#nav-settings-btn`, `#nav-send-notif-btn`, `#nav-change-pwd-btn`, `#nav-logout-btn`, `#nav-notif-badge`, `#navNotifWrapper`, `#nav-notif-list`, `#nav-notif-read-all`, `#nav-notif-browser-banner|label|enable`.
- Sidebar and panels below Bootstrap modals: `z-index: var(--z-fixed)` (300), never above 1030.
- `#app-shell` / `#app-main`: no `overflow`, `transform`, `filter`, `contain`, `will-change`, `position` (pinned by `nav-shell-guard.test.js`).
- localStorage key `PDash_sidebarCollapsed`, `'1'` = collapsed, attribute `data-sidebar="collapsed"` on `<html>` (B1; key already in `core.js`'s `keep` Set — `core.js` is **not** edited in this cycle).
- Icons: inline SVG, `viewBox="0 0 16 16"`, `stroke="currentColor"`, `aria-hidden="true"`; no emoji left in navigation, dropdowns, modal titles or the notification banner.
- Cache-busting: bump `js/nav.js?v=12→13`, `css/style.css?v=16→17`, `js/notifications.js?v=2→3` on every page that references them (14 pages), `css/tokens.css?v=8→9` on all 18 pages that link it; no other reference changes.
- Every text-on-background pair added to `tokens.css` stays ≥ 4.5:1 (`tokens.test.js`); no `#fff` literal and no new hex in `style.css` (use tokens).
- All user-facing text in English. No bundler, no new dependency. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Profile saved → avatar initials stale.** `window.__navUser` carries camelCase `firstName` from `/auth/me`, but the profile handler writes `first_name`; initials must follow the updated name (Task 3 test of `navRefreshAccount` + handler sets both keys).
2. **Group panel states:** a second group opens while one is open, `Esc`, tap outside, and resize across 1024px with a panel open — one open at a time, large layout never hides the panel (Task 3 tests; Task 4 CSS guard).
3. **`localStorage` blocked/throwing when collapsing** → no throw, attribute still toggles (Task 3 test).
4. **Role without groups (`user`) and unknown `activeTab` (`settings`, or `profile-jobs` which passes `'timesheets'`)** → no stray separators/group markup, no crash, correct active state (Task 2 tests).
5. **Bell state:** count 0 → `has-unread` removed and badge hidden; count > 99 → `99+`; unread class must not stick after "Mark all read" (Task 5 tests).

---

### Task 0: Workspace and baseline

**Files:** none committed.

- [ ] **Step 1: Open the worktree.** Use the `EnterWorktree` tool (load it with ToolSearch first) with the name `navigation-b2-sidebar`. It branches from `origin/main`; the spec commit `5ec7b23` exists only locally on `main`, so in the worktree run:

```bash
git cherry-pick 5ec7b23
```

Expected: the spec file and `docs/superpowers/design/2026-10-02-schermi-piccoli-sottomenu.png` appear in the worktree. (A later merge conflicts on these two files only if they are edited on the branch; resolve with the branch version.) If `origin/main` already contains `5ec7b23`, skip the cherry-pick.

- [ ] **Step 2: Install dev dependencies** (the worktree has no `node_modules`):

```bash
npm ci
```

- [ ] **Step 3: Baseline test run.**

```bash
npm test
```

Expected: PASS. Write down the number of passing tests (call it `BASE`); later tasks only add tests.

- [ ] **Step 4: Confirm the current versions** the plan bumps:

```bash
grep -ho "js/nav.js?v=[0-9]*\|css/style.css?v=[0-9]*\|js/notifications.js?v=[0-9]*\|css/tokens.css?v=[0-9]*" *.html | sort | uniq -c
```

Expected: `nav.js?v=12` ×14, `style.css?v=16` ×14, `notifications.js?v=2` ×14, `tokens.css?v=8` ×18. If any number differs, stop and report before continuing.

---

### Task 1: Tokens

**Files:**
- Modify: `css/tokens.css` (append a block at the end)
- Modify: `js/lib/tokens.test.js`
- Modify: the 18 `*.html` that link `css/tokens.css` (`?v=8` → `?v=9`)
- Modify: `js/lib/foundations-guard.test.js` (`'css/tokens.css': 8` → `9`)

**Interfaces:**
- Produces (used by Tasks 4 and 5): `--brand-magenta-tint`, `--brand-magenta-tint-hover`, `--icon-size-sm`, `--icon-size-md`, `--nav-text-muted`, `--nav-item-hover-bg`, `--nav-item-active-bg`, `--nav-sep`.

- [ ] **Step 1: Write the failing test.** In `js/lib/tokens.test.js`, add the new names to a new constant after `NEW` and a test, and a contrast test. Insert after line 43 (`const NEW = ...;`):

```js
const NAV = `brand-magenta-tint brand-magenta-tint-hover icon-size-sm icon-size-md nav-text-muted
nav-item-hover-bg nav-item-active-bg nav-sep`.split(/\s+/);
```

and inside `describe('tokens.css', ...)`, before its closing `});`:

```js
  it('defines the navigation tokens (cycle B2)', () => {
    expect(NAV.filter(n => !(n in tokens))).toEqual([]);
    expect(tokens['brand-magenta-tint']).toBe('#fdf0f5');
    expect(tokens['icon-size-sm']).toBe('14px');
    expect(tokens['icon-size-md']).toBe('16px');
  });

  it('navigation text meets AA on navy; the unread bell red meets 3:1 on white (non-text)', () => {
    // nav-text-muted is rgba(255,255,255,.65) over navy: blend it by hand
    const navy = value('brand-navy');
    const a = Number(tokens['nav-text-muted'].match(/,\s*([0-9.]+)\)/)[1]);
    const ch = i => Math.round(255 * a + parseInt(navy.slice(i, i + 2), 16) * (1 - a));
    const blended = '#' + [1, 3, 5].map(i => ch(i).toString(16).padStart(2, '0')).join('');
    expect(ratio(blended, navy)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(value('color-danger'), value('surface-white'))).toBeGreaterThanOrEqual(3);
  });
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `npx vitest run js/lib/tokens.test.js`
Expected: FAIL (`brand-magenta-tint` etc. not defined).

- [ ] **Step 3: Add the tokens.** Append to the end of `css/tokens.css`:

```css

/* ── Navigation (cycle B2, 2026-10) ── */
:root {
  --brand-magenta-tint:       #fdf0f5;
  --brand-magenta-tint-hover: #f9e8f0;
  --icon-size-sm: 14px;
  --icon-size-md: 16px;
  --nav-text-muted:      rgba(255,255,255,.65);
  --nav-item-hover-bg:   rgba(255,255,255,.07);
  --nav-item-active-bg:  rgba(255,255,255,.12);
  --nav-sep:             rgba(255,255,255,.12);
}
```

- [ ] **Step 4: Bump `tokens.css` references and the floor in the guard.**

```bash
sed -i 's#css/tokens\.css?v=8#css/tokens.css?v=9#g' *.html
sed -i "s#'css/tokens.css': 8#'css/tokens.css': 9#" js/lib/foundations-guard.test.js
grep -c "css/tokens.css?v=9" *.html | grep -v ":0" | wc -l
```

Expected: `18`.

- [ ] **Step 5: Run the tests.**

Run: `npx vitest run js/lib/tokens.test.js js/lib/foundations-guard.test.js`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add css/tokens.css js/lib/tokens.test.js js/lib/foundations-guard.test.js *.html
git commit -m "feat(nav): navigation tokens (magenta tint, icon sizes, nav alphas), tokens.css v9

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Navigation model and markup builder (pure, in `js/nav.js`)

**Files:**
- Modify: `js/nav.js` (insert helpers above `async function initNav`)
- Create: `js/lib/nav-model.test.js`

**Interfaces:**
- Produces (used by Tasks 3, 5, 6): globals in `nav.js`:
  - `NAV_MAIN` / `NAV_GROUPS` — model arrays (`{ id, label, href, icon }`; groups `{ id, title, icon, roles, items }`).
  - `navIcon(name, size = 'sm')` → SVG string (`size` `'sm'|'md'`; unknown name → `''`). Names: `pipeline portfolio planning config timesheets user team tag dbreset terms notify key signout bell lock chevronLeft chevronRight`.
  - `navInitials(user)` → string.
  - `buildNavHtml(user, activeTab)` → `<aside class="pd-nav">…</aside>` string.

- [ ] **Step 1: Write the failing tests.** Create `js/lib/nav-model.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'js/nav.js'), 'utf8');
const nav = new Function(src + '\nreturn { NAV_MAIN, NAV_GROUPS, navIcon, navInitials, buildNavHtml };')();
const EMOJI = /(?![©®™])\p{Extended_Pictographic}/u; // © is "pictographic" in Unicode but is the copyright sign, not an emoji

beforeEach(() => { globalThis.esc = s => String(s); });

const build = (role, tab = 'pipeline') => {
  const d = document.createElement('div');
  d.innerHTML = nav.buildNavHtml({ role, email: 'a@b.it', firstName: 'A', lastName: 'B' }, tab);
  return d;
};
const labels = el => [...el.querySelectorAll('.pd-nav-item .pd-nav-label')].map(n => n.textContent);

describe('navIcon', () => {
  it('returns a decorative currentColor svg with the size class', () => {
    const d = document.createElement('div');
    d.innerHTML = nav.navIcon('bell', 'md');
    const svg = d.firstElementChild;
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('viewBox')).toBe('0 0 16 16');
    expect(svg.classList.contains('nav-icon-md')).toBe(true);
    expect(svg.innerHTML).toContain('currentColor');
  });
  it('defaults to the sm size and returns an empty string for an unknown name', () => {
    expect(nav.navIcon('user')).toContain('nav-icon-sm');
    expect(nav.navIcon('nope')).toBe('');
  });
  it('defines every icon the navigation uses', () => {
    for (const n of ['pipeline', 'portfolio', 'planning', 'config', 'timesheets', 'user', 'team', 'tag',
      'dbreset', 'terms', 'notify', 'key', 'signout', 'bell', 'lock', 'chevronLeft', 'chevronRight']) {
      expect(nav.navIcon(n), n).not.toBe('');
    }
  });
});

describe('navInitials', () => {
  it('uses first + last initial, uppercased', () => {
    expect(nav.navInitials({ firstName: 'fabrizio', lastName: 'fortini' })).toBe('FF');
  });
  it('accepts the snake_case keys too', () => {
    expect(nav.navInitials({ first_name: 'Ada', last_name: 'Lovelace' })).toBe('AL');
  });
  it('falls back to a single name, then to the email letter, then to ?', () => {
    expect(nav.navInitials({ firstName: 'Ada' })).toBe('A');
    expect(nav.navInitials({ email: 'zed@x.it' })).toBe('Z');
    expect(nav.navInitials({})).toBe('?');
  });
});

describe('buildNavHtml', () => {
  it('user: 3 destinations, no group, no separator', () => {
    const el = build('user');
    expect(labels(el)).toEqual(['Pipeline', 'Portfolio', 'Planning']);
    expect(el.querySelector('.pd-nav-group')).toBeNull();
    expect(el.querySelector('.pd-nav-sep')).toBeNull();
  });
  it('admin: Admin group with the 5 entries, no Sysadmin group', () => {
    const el = build('admin');
    expect([...el.querySelectorAll('[data-group="admin"] .pd-nav-item .pd-nav-label')].map(n => n.textContent))
      .toEqual(['Master Data', 'Timesheets', 'User Admin', 'Team', 'Attribute Lists']);
    expect(el.querySelector('[data-group="sysadmin"]')).toBeNull();
  });
  it('sysadmin: both groups, Sysadmin has DB Reset and Terms & Conditions', () => {
    const el = build('sysadmin');
    expect([...el.querySelectorAll('[data-group="sysadmin"] .pd-nav-item .pd-nav-label')].map(n => n.textContent))
      .toEqual(['DB Reset', 'Terms & Conditions']);
    expect(el.querySelectorAll('.pd-nav-group').length).toBe(2);
  });
  it('marks exactly one item active and activates the group trigger of an admin page', () => {
    const el = build('sysadmin', 'team');
    const act = el.querySelectorAll('.pd-nav-item.active');
    expect(act.length).toBe(1);
    expect(act[0].getAttribute('href')).toBe('/team.html');
    expect(el.querySelector('[data-group="admin"] .pd-nav-group-toggle').classList.contains('active')).toBe(true);
    expect(el.querySelector('[data-group="sysadmin"] .pd-nav-group-toggle').classList.contains('active')).toBe(false);
  });
  it('an unknown or out-of-menu activeTab (settings) highlights nothing and does not throw', () => {
    const el = build('sysadmin', 'settings');
    expect(el.querySelector('.pd-nav-item.active')).toBeNull();
    expect(el.querySelector('.pd-nav-group-toggle.active')).toBeNull();
  });
  it('profile-jobs passes "timesheets": the Timesheets entry is active', () => {
    const el = build('admin', 'timesheets');
    expect(el.querySelector('.pd-nav-item.active').getAttribute('href')).toBe('/timesheets.html');
  });
  it('keeps every existing element id', () => {
    const el = build('user');
    for (const id of ['nav-notif-btn', 'nav-notif-badge', 'navNotifWrapper', 'nav-notif-list', 'nav-notif-read-all',
      'nav-notif-browser-banner', 'nav-notif-browser-label', 'nav-notif-browser-enable', 'nav-account-btn',
      'nav-profile-btn', 'nav-settings-btn', 'nav-send-notif-btn', 'nav-change-pwd-btn', 'nav-logout-btn']) {
      expect(el.querySelector('#' + id), id).not.toBeNull();
    }
  });
  it('shows initials and email in the account button, and the copyright line', () => {
    const el = build('user');
    expect(el.querySelector('#nav-avatar').textContent).toBe('AB');
    expect(el.querySelector('#nav-account-email').textContent).toBe('a@b.it');
    expect(el.querySelector('.pd-copyright').textContent).toContain('2026 PDash');
  });
  it('contains no emoji', () => {
    expect(build('sysadmin').innerHTML).not.toMatch(EMOJI);
  });
  it('has the three direct children brand / items / actions', () => {
    const aside = build('user').firstElementChild;
    expect([...aside.children].map(c => c.className)).toEqual(['pd-nav-brand', 'pd-nav-items', 'pd-nav-actions']);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `npx vitest run js/lib/nav-model.test.js`
Expected: FAIL (`NAV_MAIN is not defined`).

- [ ] **Step 3: Add the helpers.** In `js/nav.js`, insert the following **above** the line `async function initNav(activeTab, opts = {}) {` (below the header comment). It does not touch `initNav` yet:

```js
// ── NAVIGATION MODEL ─────────────────────────────────────────────────────────
// Menu entry, <title> and breadcrumb of a page use the same label (cycle B2).
const NAV_MAIN = [
  { id: 'pipeline',  label: 'Pipeline',  href: '/pipeline.html',  icon: 'pipeline'  },
  { id: 'portfolio', label: 'Portfolio', href: '/portfolio.html', icon: 'portfolio' },
  { id: 'planning',  label: 'Planning',  href: '/planning.html',  icon: 'planning'  },
];

const NAV_GROUPS = [
  { id: 'admin', title: 'Admin', icon: 'config', roles: ['admin', 'sysadmin'], items: [
    { id: 'config',         label: 'Master Data',     href: '/config.html',          icon: 'config'     },
    { id: 'timesheets',     label: 'Timesheets',      href: '/timesheets.html',      icon: 'timesheets' },
    { id: 'admin',          label: 'User Admin',      href: '/admin.html',           icon: 'user'       },
    { id: 'team',           label: 'Team',            href: '/team.html',            icon: 'team'       },
    { id: 'attributelists', label: 'Attribute Lists', href: '/attribute-lists.html', icon: 'tag'        },
  ] },
  { id: 'sysadmin', title: 'Sysadmin', icon: 'lock', roles: ['sysadmin'], items: [
    { id: 'dbreset',     label: 'DB Reset',           href: '/_db-reset.html',     icon: 'dbreset' },
    { id: 'termseditor', label: 'Terms & Conditions', href: '/_terms-editor.html', icon: 'terms'   },
  ] },
];

// Inner markup of the 16x16 line icons (stroke/fill = currentColor, see handoff §15).
const NAV_ICON_PATHS = {
  pipeline:  '<path d="M2 12V8M8 12V4M14 12V6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  portfolio: '<rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/>',
  planning:  '<rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M2 6H14M5 2V4.5M11 2V4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  config:    '<circle cx="8" cy="8" r="2.4" stroke="currentColor" stroke-width="1.3"/><path d="M8 2v1.6M8 12.4V14M14 8h-1.6M3.6 8H2M12.1 3.9l-1.1 1.1M5 9.9l-1.1 1.1M12.1 12.1l-1.1-1.1M5 6.1L3.9 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  timesheets:'<rect x="2" y="4" width="12" height="9" rx="1.2" stroke="currentColor" stroke-width="1.3"/><path d="M2 4l1.6-2h8.8L14 4" stroke="currentColor" stroke-width="1.3"/>',
  user:      '<circle cx="8" cy="5.5" r="2.3" stroke="currentColor" stroke-width="1.3"/><path d="M3 14c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5" stroke="currentColor" stroke-width="1.3"/>',
  team:      '<circle cx="5.5" cy="5.5" r="2" stroke="currentColor" stroke-width="1.2"/><circle cx="11" cy="6.5" r="1.6" stroke="currentColor" stroke-width="1.2"/><path d="M2 14c0-2.3 1.7-3.8 3.9-3.8 1.6 0 2.9.8 3.5 2M9.6 10.3c1.6 0 3 1.1 3 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  tag:       '<path d="M2 2h5.5L14 8.5 7.5 15 2 9.5V2Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><circle cx="5" cy="5" r="1" fill="currentColor"/>',
  dbreset:   '<ellipse cx="8" cy="3.5" rx="5.2" ry="1.8" stroke="currentColor" stroke-width="1.2"/><path d="M2.8 3.5v9c0 1 2.3 1.8 5.2 1.8s5.2-.8 5.2-1.8v-9M2.8 8c0 1 2.3 1.8 5.2 1.8s5.2-.8 5.2-1.8" stroke="currentColor" stroke-width="1.2"/>',
  terms:     '<path d="M4 2h5.5L13 5.5V14H4V2Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6 8h5M6 10.5h5M6 5.5h2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>',
  notify:    '<path d="M2 6.5v3l2.5.5L9 12.5V3.5L4.5 6 2 6.5Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M11 6.3c.8.5 1.3 1.3 1.3 2.2s-.5 1.7-1.3 2.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M4.5 10v2.3c0 .7.6 1.2 1.2 1l.8-.3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  key:       '<circle cx="5" cy="9" r="2.6" stroke="currentColor" stroke-width="1.2"/><path d="M7 7.2 13 1.2M11.2 3l1.6 1.6M9.4 4.8 11 6.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
  signout:   '<path d="M6.5 2H3.3c-.7 0-1.3.6-1.3 1.3v9.4c0 .7.6 1.3 1.3 1.3h3.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.5 11l3-3-3-3M13 8H6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
  bell:      '<path d="M8 2.2c-.3 0-.6.1-.8.3-1.7.4-3 2-3 3.9v2.1c0 .5-.2 1-.5 1.4L3 10.6c-.3.3-.1.9.3.9h9.4c.4 0 .6-.6.3-.9l-.7-.7c-.3-.4-.5-.9-.5-1.4V6.4c0-1.9-1.3-3.5-3-3.9-.2-.2-.5-.3-.8-.3Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.3 13c.3.6.9 1 1.7 1s1.4-.4 1.7-1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  lock:      '<rect x="3.5" y="7" width="9" height="6.5" rx="1.3" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  chevronLeft:  '<path d="M10 3.5L5.5 8 10 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  chevronRight: '<path d="M6 3.5L10.5 8 6 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
};

function navIcon(name, size = 'sm') {
  const paths = NAV_ICON_PATHS[name];
  if (!paths) return '';
  return `<svg class="nav-icon nav-icon-${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">${paths}</svg>`;
}

function navInitials(user) {
  const f = String(user.firstName || user.first_name || '').trim();
  const l = String(user.lastName || user.last_name || '').trim();
  const pair = ((f[0] || '') + (l[0] || '')).toUpperCase();
  if (pair) return pair;
  return (String(user.email || '').trim()[0] || '?').toUpperCase();
}

function navItemHtml(it, activeTab, size) {
  const active = activeTab === it.id;
  return `<a class="pd-nav-item${active ? ' active' : ''}" href="${it.href}"${active ? ' aria-current="page"' : ''} title="${esc(it.label)}">` +
    `${navIcon(it.icon, size)}<span class="pd-nav-label">${esc(it.label)}</span></a>`;
}

function navGroupHtml(g, activeTab) {
  const groupActive = g.items.some(i => i.id === activeTab);
  return `<span class="pd-nav-sep"></span>` +
    `<section class="pd-nav-group" data-group="${g.id}">` +
      `<button type="button" class="pd-nav-group-toggle${groupActive ? ' active' : ''}" aria-expanded="false" ` +
        `aria-controls="pd-nav-panel-${g.id}" aria-label="${esc(g.title)}" title="${esc(g.title)}">` +
        `${navIcon(g.icon, 'md')}<span class="pd-nav-dot"></span></button>` +
      `<div class="pd-nav-group-panel" id="pd-nav-panel-${g.id}">` +
        `<div class="pd-nav-group-title">${esc(g.title)}</div>` +
        g.items.map(i => navItemHtml(i, activeTab, 'sm')).join('') +
      `</div>` +
    `</section>`;
}

function buildNavHtml(user, activeTab) {
  const main = NAV_MAIN.map(it => navItemHtml(it, activeTab, 'md')).join('');
  const groups = NAV_GROUPS.filter(g => g.roles.includes(user.role)).map(g => navGroupHtml(g, activeTab)).join('');
  return `<aside class="pd-nav" aria-label="Main navigation">
    <div class="pd-nav-brand">
      <a class="pd-logo" href="/pipeline.html" aria-label="PDash home"><span class="pd-logo-full"><span class="pd-logo-p">P</span>Dash</span><span class="pd-logo-mini pd-logo-p">P</span></a>
      <button type="button" class="pd-nav-collapse" id="nav-collapse-btn" aria-label="Collapse sidebar" aria-expanded="true">${navIcon('chevronLeft', 'md')}${navIcon('chevronRight', 'md')}</button>
    </div>
    <div class="pd-nav-items">${main}${groups}</div>
    <div class="pd-nav-actions">
      <div class="dropdown pd-account">
        <button type="button" class="pd-account-btn" id="nav-account-btn" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Account menu">
          <span class="pd-avatar" id="nav-avatar">${esc(navInitials(user))}</span>
          <span class="pd-account-email" id="nav-account-email">${esc(user.email || '')}</span>
        </button>
        <ul class="dropdown-menu pd-account-menu">
          <li><button class="dropdown-item" id="nav-profile-btn">${navIcon('user')}My Profile</button></li>
          <li><button class="dropdown-item" id="nav-settings-btn">${navIcon('config')}Settings</button></li>
          <li><hr class="dropdown-divider"></li>
          <li><button class="dropdown-item" id="nav-send-notif-btn">${navIcon('notify')}Send Notification</button></li>
          <li><hr class="dropdown-divider"></li>
          <li><button class="dropdown-item" id="nav-change-pwd-btn">${navIcon('key')}Change password</button></li>
          <li><hr class="dropdown-divider"></li>
          <li><button class="dropdown-item text-danger" id="nav-logout-btn">${navIcon('signout')}Sign out</button></li>
        </ul>
      </div>
      <div class="dropdown pd-bell" id="navNotifWrapper">
        <button type="button" class="pd-bell-btn" id="nav-notif-btn" data-bs-toggle="dropdown" aria-expanded="false" data-bs-auto-close="outside" aria-label="Notifications">
          ${navIcon('bell', 'md')}<span id="nav-notif-badge" class="pd-badge" style="display:none"></span>
        </button>
        <div class="dropdown-menu pd-notif-panel p-0">
          <div class="d-flex align-items-center justify-content-between px-3 py-2 border-bottom">
            <span class="fw-semibold" style="font-size:.875rem">Notifications</span>
            <button class="btn btn-link btn-sm p-0 text-muted" id="nav-notif-read-all" style="font-size:.78rem;text-decoration:none">Mark all read</button>
          </div>
          <div id="nav-notif-browser-banner" class="px-3 py-2 border-bottom d-flex align-items-center justify-content-between gap-2" style="display:none;font-size:.78rem;background:var(--indigo-50,#eef2ff)">
            <span id="nav-notif-browser-label">${navIcon('bell')}Enable desktop notifications?</span>
            <button class="btn btn-primary btn-sm py-0 px-2" id="nav-notif-browser-enable" style="font-size:.75rem">Enable</button>
          </div>
          <div id="nav-notif-list" style="overflow-y:auto;max-height:420px">
            <div class="text-center text-muted py-4" style="font-size:.875rem">No notifications yet</div>
          </div>
        </div>
      </div>
      <div class="pd-copyright">© 2026 PDash</div>
    </div>
  </aside>`;
}
```

- [ ] **Step 4: Run the tests.**

Run: `npx vitest run js/lib/nav-model.test.js`
Expected: PASS (all). Then `npm test` → still PASS (`initNav` is untouched).

- [ ] **Step 5: Commit.**

```bash
git add js/nav.js js/lib/nav-model.test.js
git commit -m "feat(nav): navigation model, SVG icon set and aside markup builder

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Behaviour and wiring (collapse, group panels, popper placement, `initNav`, footer, modal titles)

**Files:**
- Modify: `js/nav.js`
- Create: `js/lib/nav-behavior.test.js`

**Interfaces:**
- Consumes (Task 2): `NAV_*`, `navIcon`, `navInitials`, `buildNavHtml`.
- Produces: globals `navLayout()` → `'small'|'open'|'rail'`; `navSetCollapsed(collapsed)`; `navSyncCollapseButton()`; `navPopperConfig(...args)`; `navWireGroups(root)`; `navRefreshAccount(user)`.

- [ ] **Step 1: Write the failing tests.** Create `js/lib/nav-behavior.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'js/nav.js'), 'utf8');
const nav = new Function(src + `
return { initNav, navLayout, navSetCollapsed, navSyncCollapseButton, navPopperConfig,
         navWireGroups, navRefreshAccount, buildNavHtml };`)();
const EMOJI = /(?![©®™])\p{Extended_Pictographic}/u; // © is "pictographic" in Unicode but is the copyright sign, not an emoji

const user = (role = 'sysadmin') => ({ role, email: 'u@x.it', firstName: 'U', lastName: 'X', terms_version: 1, current_terms_version: 1 });
const stubMedia = matches => { window.matchMedia = q => ({ matches, media: q }); };

beforeEach(() => {
  document.documentElement.removeAttribute('data-sidebar');
  document.body.className = '';
  document.body.removeAttribute('style');
  document.body.innerHTML = '<div id="app-shell"><div id="nav-container"></div><div id="app-main"><div id="app"></div></div></div>';
  globalThis.esc = s => String(s);
  globalThis.Api = { auth: { me: async () => user() } };
  localStorage.clear();
});
afterEach(() => { delete window.matchMedia; vi.restoreAllMocks(); });

describe('navLayout', () => {
  it('is small below 1024px, open on a wide screen, rail when collapsed', () => {
    stubMedia(false);
    expect(nav.navLayout()).toBe('small');
    stubMedia(true);
    expect(nav.navLayout()).toBe('open');
    document.documentElement.setAttribute('data-sidebar', 'collapsed');
    expect(nav.navLayout()).toBe('rail');
  });
  it('does not throw without matchMedia (treated as open)', () => {
    delete window.matchMedia;
    expect(nav.navLayout()).toBe('open');
  });
});

describe('navPopperConfig', () => {
  const defaults = { placement: 'bottom-start', modifiers: [{ name: 'offset', options: { offset: [0, 2] } }, { name: 'x' }] };
  const byName = (cfg, n) => cfg.modifiers.find(m => m.name === n);
  it('opens below the avatar/bell, right-aligned, on small screens', () => {
    stubMedia(false);
    const cfg = nav.navPopperConfig(defaults);
    expect(cfg.placement).toBe('bottom-end');
    expect(byName(cfg, 'flip').enabled).toBe(true);
    expect(byName(cfg, 'preventOverflow').options.padding).toBe(10);
  });
  it('opens to the right of the sidebar/rail on large screens, without flipping', () => {
    stubMedia(true);
    const cfg = nav.navPopperConfig(defaults);
    expect(cfg.placement).toBe('right-end');
    expect(byName(cfg, 'flip').enabled).toBe(false);
    expect(byName(cfg, 'offset').options.offset).toEqual([0, 10]);
    expect(byName(cfg, 'x')).toBeTruthy();
  });
  it('accepts the defaults as first or second argument (Bootstrap passes them either way)', () => {
    stubMedia(true);
    expect(nav.navPopperConfig(undefined, defaults).placement).toBe('right-end');
    expect(nav.navPopperConfig().placement).toBe('right-end');
  });
});

describe('navSetCollapsed', () => {
  beforeEach(() => { document.body.insertAdjacentHTML('beforeend', '<button id="nav-collapse-btn"></button>'); });
  it('sets the attribute and the key, and updates the button', () => {
    nav.navSetCollapsed(true);
    expect(document.documentElement.getAttribute('data-sidebar')).toBe('collapsed');
    expect(localStorage.getItem('PDash_sidebarCollapsed')).toBe('1');
    const b = document.getElementById('nav-collapse-btn');
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(b.getAttribute('aria-label')).toBe('Expand sidebar');
  });
  it('removes the attribute and the key when expanding', () => {
    nav.navSetCollapsed(true);
    nav.navSetCollapsed(false);
    expect(document.documentElement.hasAttribute('data-sidebar')).toBe(false);
    expect(localStorage.getItem('PDash_sidebarCollapsed')).toBeNull();
    expect(document.getElementById('nav-collapse-btn').getAttribute('aria-label')).toBe('Collapse sidebar');
  });
  it('does not throw when localStorage throws, and still toggles the attribute', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => nav.navSetCollapsed(true)).not.toThrow();
    expect(document.documentElement.getAttribute('data-sidebar')).toBe('collapsed');
    expect(() => nav.navSetCollapsed(false)).not.toThrow();
    expect(document.documentElement.hasAttribute('data-sidebar')).toBe(false);
  });
});

describe('navWireGroups', () => {
  let toggles, groups;
  beforeEach(() => {
    document.body.innerHTML = nav.buildNavHtml(user('sysadmin'), 'pipeline');
    nav.navWireGroups(document.body);
    toggles = [...document.querySelectorAll('.pd-nav-group-toggle')];
    groups = [...document.querySelectorAll('.pd-nav-group')];
  });
  const isOpen = g => g.classList.contains('open');
  it('opens a group on tap and reflects it in aria-expanded', () => {
    toggles[0].click();
    expect(isOpen(groups[0])).toBe(true);
    expect(toggles[0].getAttribute('aria-expanded')).toBe('true');
    toggles[0].click();
    expect(isOpen(groups[0])).toBe(false);
    expect(toggles[0].getAttribute('aria-expanded')).toBe('false');
  });
  it('keeps only one group open at a time', () => {
    toggles[0].click();
    toggles[1].click();
    expect(groups.map(isOpen)).toEqual([false, true]);
    expect(toggles[0].getAttribute('aria-expanded')).toBe('false');
  });
  it('closes on Escape and on a tap outside the groups, not on a tap inside the panel', () => {
    toggles[0].click();
    document.querySelector('.pd-nav-group-panel .pd-nav-item').addEventListener('click', e => e.preventDefault());
    document.querySelector('.pd-nav-group-panel .pd-nav-item').click();
    expect(isOpen(groups[0])).toBe(true);
    document.body.click();
    expect(isOpen(groups[0])).toBe(false);
    toggles[1].click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(groups.map(isOpen)).toEqual([false, false]);
  });
});

describe('navRefreshAccount', () => {
  it('rewrites initials and email from the updated user (camelCase or snake_case)', () => {
    document.body.innerHTML = '<span id="nav-avatar">AB</span><span id="nav-account-email">old@x.it</span>';
    nav.navRefreshAccount({ firstName: 'Zed', lastName: 'Yu', email: 'new@x.it' });
    expect(document.getElementById('nav-avatar').textContent).toBe('ZY');
    expect(document.getElementById('nav-account-email').textContent).toBe('new@x.it');
    nav.navRefreshAccount({ first_name: 'Ada', last_name: 'Lo', email: 'a@x.it' });
    expect(document.getElementById('nav-avatar').textContent).toBe('AL');
  });
  it('does not throw when the account markup is absent', () => {
    document.body.innerHTML = '';
    expect(() => nav.navRefreshAccount({ email: 'a@x.it' })).not.toThrow();
  });
});

describe('initNav integration', () => {
  it('renders the aside into #nav-container, wires the 5 account entries and the collapse button', async () => {
    await nav.initNav('pipeline', { breadcrumbs: [{ label: 'Home' }, { label: 'Pipeline' }] });
    const c = document.getElementById('nav-container');
    expect(c.querySelector('aside.pd-nav')).not.toBeNull();
    expect(document.getElementById('nav-avatar').textContent).toBe('UX');
    expect(c.querySelectorAll('.pd-account-menu .dropdown-item').length).toBe(5);
    document.getElementById('nav-collapse-btn').click();
    expect(document.documentElement.getAttribute('data-sidebar')).toBe('collapsed');
    document.getElementById('nav-collapse-btn').click();
    expect(document.documentElement.hasAttribute('data-sidebar')).toBe(false);
  });
  it('syncs the collapse button with a state already set by the head snippet', async () => {
    document.documentElement.setAttribute('data-sidebar', 'collapsed');
    await nav.initNav('pipeline');
    expect(document.getElementById('nav-collapse-btn').getAttribute('aria-expanded')).toBe('false');
  });
  it('injects no footer and adds no body padding', async () => {
    await nav.initNav('pipeline');
    expect(document.getElementById('app-footer')).toBeNull();
    expect(document.querySelector('footer')).toBeNull();
    expect(document.body.style.paddingBottom).toBe('');
  });
  it('has no emoji in the navigation or in the three modal titles', async () => {
    await nav.initNav('pipeline');
    expect(document.getElementById('nav-container').innerHTML).not.toMatch(EMOJI);
    for (const id of ['navChangePwdModal', 'navProfileModal', 'sendNotifModal']) {
      const title = document.querySelector(`#${id} .modal-title`);
      expect(title.textContent).not.toMatch(EMOJI);
      expect(title.querySelector('svg.nav-icon'), id).not.toBeNull();
    }
  });
  it('returns null and renders nothing when the user is not authenticated', async () => {
    globalThis.Api = { auth: { me: async () => { throw new Error('401'); } } };
    expect(await nav.initNav('pipeline')).toBeNull();
    expect(document.getElementById('nav-container').innerHTML).toBe('');
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `npx vitest run js/lib/nav-behavior.test.js`
Expected: FAIL (`navLayout is not a function` / assertions on the old markup).

- [ ] **Step 3: Add the behaviour helpers.** In `js/nav.js`, insert **below** `buildNavHtml` and above `async function initNav`:

```js
// ── NAVIGATION BEHAVIOUR ─────────────────────────────────────────────────────
const NAV_COLLAPSE_KEY = 'PDash_sidebarCollapsed';

// 'small' (< 1024px navbar), 'open' (sidebar) or 'rail' (collapsed sidebar).
function navLayout() {
  if (typeof window.matchMedia !== 'function') return 'open';
  if (!window.matchMedia('(min-width: 1024px)').matches) return 'small';
  return document.documentElement.getAttribute('data-sidebar') === 'collapsed' ? 'rail' : 'open';
}

function navSyncCollapseButton() {
  const collapsed = document.documentElement.getAttribute('data-sidebar') === 'collapsed';
  const btn = document.getElementById('nav-collapse-btn');
  if (!btn) return;
  btn.setAttribute('aria-expanded', String(!collapsed));
  btn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
}

function navSetCollapsed(collapsed) {
  const html = document.documentElement;
  if (collapsed) html.setAttribute('data-sidebar', 'collapsed'); else html.removeAttribute('data-sidebar');
  try {
    if (collapsed) localStorage.setItem(NAV_COLLAPSE_KEY, '1'); else localStorage.removeItem(NAV_COLLAPSE_KEY);
  } catch (e) { /* storage blocked: the state is simply not remembered */ }
  navSyncCollapseButton();
}

// Bootstrap evaluates `popperConfig` each time the menu opens; the placement
// depends on the layout active at that moment. Bootstrap passes the default
// config as the first or the second argument depending on the version, so take
// the first object argument.
function navPopperConfig(...args) {
  const defaults = args.find(a => a && typeof a === 'object') || {};
  const small = navLayout() === 'small';
  const modifiers = (defaults.modifiers || []).filter(m => !['offset', 'preventOverflow', 'flip'].includes(m.name));
  modifiers.push({ name: 'offset', options: { offset: [0, small ? 8 : 10] } });
  modifiers.push({ name: 'preventOverflow', options: { padding: 10 } });
  modifiers.push({ name: 'flip', enabled: small });
  return { ...defaults, placement: small ? 'bottom-end' : 'right-end', modifiers };
}

// Admin/Sysadmin panels of the small navbar: one open at a time; closed by a tap
// outside the groups or by Escape. (On large screens the CSS shows the panels
// permanently and the toggle buttons are hidden, so this has no visible effect.)
function navWireGroups(root) {
  const groups = [...root.querySelectorAll('.pd-nav-group')];
  const setOpen = (g, open) => {
    g.classList.toggle('open', open);
    g.querySelector('.pd-nav-group-toggle').setAttribute('aria-expanded', String(open));
  };
  const closeAll = except => groups.forEach(g => { if (g !== except) setOpen(g, false); });
  groups.forEach(g => {
    g.querySelector('.pd-nav-group-toggle').addEventListener('click', () => {
      const open = !g.classList.contains('open');
      closeAll(g);
      setOpen(g, open);
    });
  });
  document.addEventListener('click', e => {
    if (!e.target.closest || !e.target.closest('.pd-nav-group')) closeAll(null);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(null); });
}

function navRefreshAccount(u) {
  const av = document.getElementById('nav-avatar');
  if (av) av.textContent = navInitials(u);
  const em = document.getElementById('nav-account-email');
  if (em) em.textContent = u.email || '';
}
```

- [ ] **Step 4: Rewire `initNav`.** In `js/nav.js`:

(a) Replace everything from the line `const tabs = [` through the end of the `document.getElementById('nav-container').innerHTML = \`...\`;` statement (the template ending with `</nav>\`;`) with:

```js
  document.getElementById('nav-container').innerHTML = buildNavHtml(user, activeTab);
  navSyncCollapseButton();
  document.getElementById('nav-collapse-btn').addEventListener('click', () => {
    navSetCollapsed(document.documentElement.getAttribute('data-sidebar') !== 'collapsed');
  });
  navWireGroups(document.getElementById('nav-container'));
  if (typeof bootstrap !== 'undefined') {
    ['nav-account-btn', 'nav-notif-btn'].forEach(id => {
      bootstrap.Dropdown.getOrCreateInstance(document.getElementById(id), { popperConfig: navPopperConfig });
    });
  }
```

(b) Delete the whole `// ── FOOTER ──` block (`if (!document.getElementById('app-footer')) { ... }`, the 9 lines that create the footer and set `document.body.style.paddingBottom = '100px'`).

(c) Modal titles: replace the three title lines:
- `<h6 class="modal-title fw-semibold mb-0">Change Password</h6>` → `<h6 class="modal-title fw-semibold mb-0">${navIcon('key')}Change Password</h6>`
- `<h6 class="modal-title fw-semibold mb-0">👤 My Profile</h6>` → `<h6 class="modal-title fw-semibold mb-0">${navIcon('user')}My Profile</h6>`
- `<h6 class="modal-title fw-bold">📣 Send Notification</h6>` → `<h6 class="modal-title fw-bold">${navIcon('notify')}Send Notification</h6>`

(d) In the profile save handler, replace the block

```js
      if (window.__navUser) {
        window.__navUser.first_name = updated.first_name;
        window.__navUser.last_name  = updated.last_name;
        window.__navUser.email      = updated.email;
        const nameEl = document.getElementById('nav-account-btn');
        if (nameEl) nameEl.textContent = `${updated.first_name} ${updated.last_name} ▾`;
      }
```

with (both key styles are set because `/auth/me` returns camelCase and `navInitials` reads either):

```js
      if (window.__navUser) {
        window.__navUser.first_name = updated.first_name;
        window.__navUser.last_name  = updated.last_name;
        window.__navUser.firstName  = updated.first_name;
        window.__navUser.lastName   = updated.last_name;
        window.__navUser.email      = updated.email;
        navRefreshAccount(window.__navUser);
      }
```

(e) Update the header comment of the file (line 3–4) to say "renders the sidebar / small-screen navbar into #nav-container".

- [ ] **Step 5: Run the tests.**

Run: `npx vitest run js/lib/nav-behavior.test.js js/lib/nav-model.test.js js/lib/nav-shell.test.js`
Expected: PASS. Then `npm test` → PASS (`foundations-guard`'s CSS assertions still match the unchanged CSS).

- [ ] **Step 6: Verify Bootstrap's `popperConfig` contract** (the function form must work on the pinned CDN version):

```bash
curl -s https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.js | grep -n "popperConfig"
```

Expected: the Dropdown's `_getPopperConfig` merges the result of `execute(this._config.popperConfig, [...])` over the default config, so a function returning `{...defaults, placement, modifiers}` is honoured. If `popperConfig` is **not** executed as a function in this version, stop and report (the fallback is to set `placement` via the `data-bs-*` attribute and `Popper` offset through a `show.bs.dropdown` listener).

- [ ] **Step 7: Commit.**

```bash
git add js/nav.js js/lib/nav-behavior.test.js
git commit -m "feat(nav): collapse, group panels, popper placement; wire the aside into initNav; drop the footer

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Layout CSS and guard tests

**Files:**
- Modify: `css/style.css`
- Create: `js/lib/nav-layout-guard.test.js`
- Modify: `js/lib/foundations-guard.test.js` (layout invariants)
- Modify: `js/lib/nav-shell.test.js` (CSS expectations still true; add the media rule)

**Interfaces:**
- Consumes (Task 1 tokens; Task 2 class names): `.pd-nav`, `.pd-nav-brand`, `.pd-logo*`, `.pd-nav-collapse`, `.pd-nav-items`, `.pd-nav-item`, `.pd-nav-label`, `.pd-nav-sep`, `.pd-nav-group`, `.pd-nav-group-toggle`, `.pd-nav-dot`, `.pd-nav-group-panel`, `.pd-nav-group-title`, `.pd-nav-actions`, `.pd-account*`, `.pd-avatar`, `.pd-account-email`, `.pd-bell*`, `.pd-badge`, `.pd-notif-panel`, `.pd-copyright`, `.nav-icon*`.
- Produces: `--nav-top-h`, `--sidebar-w-open`, `--sidebar-w-rail`; `.pd-bell-btn.has-unread` (class toggled by Task 5).

- [ ] **Step 1: Write the failing tests.** Create `js/lib/nav-layout-guard.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = f => readFileSync(join(process.cwd(), f), 'utf8');
const css = read('css/style.css');

describe('navigation CSS (css/style.css)', () => {
  it('removed the footer and the old top-tab styles', () => {
    expect(css).not.toContain('.app-footer');
    expect(css).not.toContain('.nav-main-tab');
    expect(css).not.toContain('.nav-role-menu-trigger');
  });
  it('switches the layout at 1024px and sets the sidebar widths from CSS (no JS, no jump)', () => {
    expect(css).toContain('@media (min-width: 1024px)');
    expect(css).toContain('@media (max-width: 1023.98px)');
    expect(css).toContain('--sidebar-w: var(--sidebar-w-open)');
    expect(css).toContain('html[data-sidebar="collapsed"] { --sidebar-w: var(--sidebar-w-rail); }');
    expect(css).toMatch(/--sidebar-w-open:\s*240px/);
    expect(css).toMatch(/--sidebar-w-rail:\s*68px/);
  });
  it('reserves #nav-container (navy, fixed column on large screens) before the script renders', () => {
    expect(css).toMatch(/#nav-container\s*\{\s*background:\s*var\(--brand-navy\);\s*\}/);
    expect(css).toMatch(/#nav-container\s*\{[^}]*position:\s*fixed[^}]*width:\s*var\(--sidebar-w\)/);
    expect(css).toMatch(/#nav-container\s*\{\s*height:\s*var\(--nav-top-h\);\s*\}/);
  });
  it('keeps the sidebar and its panels below Bootstrap modals (z-index token <= 1030)', () => {
    const tokens = read('css/tokens.css');
    const z = Number(tokens.match(/--z-fixed:\s*(\d+)/)[1]);
    expect(z).toBeLessThanOrEqual(1030);
    expect(css).toMatch(/#nav-container\s*\{[^}]*z-index:\s*var\(--z-fixed\)/);
    expect(css).toMatch(/\.pd-nav\s*\{[^}]*z-index:\s*var\(--z-fixed\)/);
  });
  it('hides the breadcrumb and zeroes its height below 1024px', () => {
    expect(css).toMatch(/@media \(max-width: 1023\.98px\)\s*\{[\s\S]*?\.breadcrumb-bar\s*\{\s*display:\s*none;/);
    expect(css).toMatch(/body\.has-breadcrumbs\s*\{\s*--breadcrumb-h:\s*0px;\s*\}/);
  });
  it('sizes the pipeline board from the navbar and breadcrumb heights only (no footer term)', () => {
    expect(css).toContain('height: calc(100vh - var(--nav-top-h) - var(--breadcrumb-h));');
    expect(css).not.toContain('206px');
  });
  it('shows the group panels permanently on large screens and the toggle only below 1024px', () => {
    expect(css).toMatch(/@media \(min-width: 1024px\)\s*\{[\s\S]*?\.pd-nav-group-toggle,\s*\.pd-nav-dot\s*\{\s*display:\s*none;\s*\}/);
    expect(css).toMatch(/\.pd-nav-group\.open \.pd-nav-group-panel\s*\{\s*display:\s*block;\s*\}/);
  });
  it('truncates a very long email instead of widening the sidebar', () => {
    expect(css).toMatch(/\.pd-account-email\s*\{[^}]*text-overflow:\s*ellipsis/);
  });
  it('unread notifications use the magenta tint tokens, not literals', () => {
    expect(css).not.toMatch(/#fdf0f5|#f9e8f0/i);
    expect(css).toMatch(/\.notif-item\.unread\s*\{[^}]*var\(--brand-magenta-tint\)/);
  });
  it('the unread bell is white with a red icon and border', () => {
    expect(css).toMatch(/\.pd-bell-btn\.has-unread\s*\{[^}]*background:\s*var\(--surface-white\)[^}]*var\(--color-danger\)/);
  });
});

describe('public pages carry no fixed footer', () => {
  for (const f of ['login.html', 'activate.html', 'reset-password.html', 'terms.html']) {
    it(`${f} has no <footer>`, () => expect(read(f)).not.toMatch(/<footer/i));
  }
});
```

(The last `describe` fails until Task 7; it is created now so Task 7 only has to make it pass.)

- [ ] **Step 2: Run to verify it fails.**

Run: `npx vitest run js/lib/nav-layout-guard.test.js`
Expected: FAIL (old selectors still present).

- [ ] **Step 3: Rewrite the navigation CSS.** In `css/style.css`:

(a) Delete the `/* ── App footer ── */` block (`.app-footer { ... }`, lines 33–49) and the whole `/* ── Primary nav tabs ── */` and `/* ── Role-menu dropdown triggers ... ── */` blocks (`.nav-main-tab*`, `a.nav-main-tab`, `.nav-role-menu-trigger*`, lines 57–90 including their comments).

(`js/core.js:145` `updateNavState()` still queries `.nav-main-tab`; the selector now matches nothing and the function stays a harmless no-op. `core.js` is not edited, so its `?v=` does not change.)

(b) Replace the lines

```css
.notif-item.unread { border-left: 3px solid var(--brand-magenta); background: #fdf0f5; }
.notif-item.unread:hover { background: #f9e8f0; }
```

with:

```css
.notif-item.unread { border-left: 3px solid var(--brand-magenta); background: var(--brand-magenta-tint); }
.notif-item.unread:hover { background: var(--brand-magenta-tint-hover); }
```

(c) Immediately after the existing line `#app-main { margin-left: var(--sidebar-w); }` (keep it and the `:root { --sidebar-w: 0px; }` line above it exactly as they are) add:

```css
:root { --sidebar-w-open: 240px; --sidebar-w-rail: 68px; --nav-top-h: 111px; }
@media (min-width: 1024px) {
  :root { --sidebar-w: var(--sidebar-w-open); --nav-top-h: 0px; }
  html[data-sidebar="collapsed"] { --sidebar-w: var(--sidebar-w-rail); }
}
@media (max-width: 1023.98px) {
  .breadcrumb-bar { display: none; }
  body.has-breadcrumbs { --breadcrumb-h: 0px; }
}
```

(d) Replace the `.pb-board-root` height line `height: calc(100vh - 206px);` with `height: calc(100vh - var(--nav-top-h) - var(--breadcrumb-h));`.

(e) Where the removed tab blocks were (after the `/* ── Notification panel ── */` block), add the full navigation block:

```css
/* ── Navigation: sidebar (>= 1024px) / icon navbar (< 1024px) ──
   One DOM (js/nav.js buildNavHtml), two layouts. #nav-container owns its size
   and navy background from CSS alone so the page never jumps when the script
   renders the aside. Heights below 1024px are fixed (--nav-top-h) so
   .pb-board-root can be computed exactly. ── */
#nav-container { background: var(--brand-navy); }
@media (min-width: 1024px) {
  #nav-container { position: fixed; top: 0; bottom: 0; left: 0; width: var(--sidebar-w); z-index: var(--z-fixed); }
}
@media (max-width: 1023.98px) {
  #nav-container { height: var(--nav-top-h); }
}

.nav-icon { display: inline-block; flex: 0 0 auto; vertical-align: -2px; }
.nav-icon-sm { width: var(--icon-size-sm); height: var(--icon-size-sm); }
.nav-icon-md { width: var(--icon-size-md); height: var(--icon-size-md); }
.dropdown-item .nav-icon,
.modal-title .nav-icon,
#nav-notif-browser-label .nav-icon { margin-right: 8px; }
.dropdown-item .nav-icon { color: var(--text-muted); }
.dropdown-item.text-danger .nav-icon { color: inherit; }

.pd-nav { position: relative; z-index: var(--z-fixed); box-sizing: border-box; background: var(--brand-navy); color: var(--nav-text-muted); font-size: var(--text-md); }
.pd-logo { color: var(--text-inverse); text-decoration: none; font-weight: 700; letter-spacing: -.02em; line-height: 1; }
.pd-logo-p { color: var(--brand-magenta); }
.pd-logo-mini { display: none; }
.pd-nav-collapse { background: transparent; border: 0; color: var(--nav-text-muted); padding: 6px; border-radius: var(--radius-md); line-height: 0; cursor: pointer; }
.pd-nav-collapse:hover { background: var(--nav-item-hover-bg); color: var(--text-inverse); }
.pd-nav-collapse .nav-icon:last-child { display: none; }
html[data-sidebar="collapsed"] .pd-nav-collapse .nav-icon:first-child { display: none; }
html[data-sidebar="collapsed"] .pd-nav-collapse .nav-icon:last-child { display: inline-block; }
.pd-nav-item { display: flex; align-items: center; gap: 12px; color: var(--nav-text-muted); text-decoration: none; font-weight: var(--weight-medium); white-space: nowrap; transition: color var(--duration-fast), background var(--duration-fast); }
.pd-nav-item:hover { color: var(--text-inverse); background: var(--nav-item-hover-bg); }
.pd-nav-item.active { color: var(--text-inverse); background: var(--nav-item-active-bg); }
.pd-nav-item:focus-visible, .pd-nav-group-toggle:focus-visible, .pd-account-btn:focus-visible,
.pd-bell-btn:focus-visible, .pd-nav-collapse:focus-visible { outline: 2px solid var(--text-inverse); outline-offset: -2px; }
.pd-nav-group-title { font-size: var(--text-2xs); font-weight: var(--weight-semibold); letter-spacing: .08em; text-transform: uppercase; color: var(--nav-text-muted); }
.pd-nav-group-toggle { background: transparent; border: 0; color: var(--nav-text-muted); cursor: pointer; }
.pd-nav-dot { position: absolute; right: 7px; bottom: 7px; width: 5px; height: 5px; border-radius: 50%; background: var(--nav-text-muted); }
.pd-account { min-width: 0; }
.pd-account-btn { display: flex; align-items: center; gap: 12px; min-width: 0; max-width: 100%; background: transparent; border: 0; border-radius: var(--radius-md); padding: 4px; color: var(--text-inverse); cursor: pointer; }
.pd-account-btn:hover { background: var(--nav-item-hover-bg); }
.pd-avatar { width: 36px; height: 36px; flex: 0 0 auto; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: var(--nav-item-active-bg); color: var(--text-inverse); font-size: var(--text-sm); font-weight: 700; }
.pd-account-email { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-sm); font-weight: var(--weight-semibold); }
.pd-bell-btn { position: relative; width: 36px; height: 36px; flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; background: transparent; border: 1px solid var(--nav-sep); border-radius: var(--radius-md); color: var(--text-inverse); cursor: pointer; }
.pd-bell-btn:hover { background: var(--nav-item-hover-bg); }
.pd-bell-btn.has-unread { background: var(--surface-white); border-color: var(--color-danger); color: var(--color-danger); }
.pd-badge { position: absolute; top: -7px; right: -7px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--color-danger); color: var(--text-inverse); font-size: .65rem; font-weight: 700; line-height: 18px; text-align: center; }
.pd-copyright { font-size: var(--text-2xs); color: var(--nav-text-muted); padding: 0 4px; }
.pd-account-menu { min-width: 230px; }
.pd-notif-panel { width: 400px; max-width: calc(100vw - 20px); max-height: 480px; overflow: hidden; }

/* Sidebar (>= 1024px) */
@media (min-width: 1024px) {
  .pd-nav { height: 100%; display: flex; flex-direction: column; }
  .pd-nav-brand { position: relative; flex: 0 0 auto; height: 72px; display: flex; align-items: center; padding: 0 20px; border-bottom: 3px solid var(--brand-magenta); }
  .pd-logo { font-size: 2.25rem; }
  .pd-nav-collapse { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); }
  .pd-nav-items { flex: 1 1 auto; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; padding: 14px 12px; }
  .pd-nav-item { height: 44px; padding: 0 12px; border-left: 3px solid transparent; border-radius: var(--radius-md); }
  .pd-nav-item.active { border-left-color: var(--brand-magenta); }
  .pd-nav-group-toggle, .pd-nav-dot { display: none; }
  .pd-nav-sep { flex: 0 0 auto; height: 1px; margin: 10px 8px; background: var(--nav-sep); }
  .pd-nav-group { display: block; }
  .pd-nav-group-title { padding: 4px 15px 6px; }
  .pd-nav-group .pd-nav-item { height: 40px; font-size: var(--text-sm); }
  .pd-nav-actions { flex: 0 0 auto; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 12px; border-top: 1px solid var(--nav-sep); }
  .pd-copyright { grid-column: 1 / -1; }
  .pd-notif-panel { max-width: calc(100vw - var(--sidebar-w) - 20px); }

  /* Rail (collapsed) */
  html[data-sidebar="collapsed"] .pd-logo-full,
  html[data-sidebar="collapsed"] .pd-nav-label,
  html[data-sidebar="collapsed"] .pd-nav-group-title,
  html[data-sidebar="collapsed"] .pd-account-email,
  html[data-sidebar="collapsed"] .pd-copyright { display: none; }
  html[data-sidebar="collapsed"] .pd-logo-mini { display: inline; font-size: 2rem; }
  html[data-sidebar="collapsed"] .pd-nav-brand { justify-content: center; padding: 0; }
  html[data-sidebar="collapsed"] .pd-nav-collapse { top: 84px; right: auto; left: 50%; transform: translateX(-50%); }
  html[data-sidebar="collapsed"] .pd-nav-items { padding-top: 54px; }
  html[data-sidebar="collapsed"] .pd-nav-item { justify-content: center; gap: 0; padding: 0; border-left-width: 0; }
  html[data-sidebar="collapsed"] .pd-nav-actions { grid-template-columns: 1fr; justify-items: center; }
}

/* Icon navbar (< 1024px): two fixed rows, in normal flow */
@media (max-width: 1023.98px) {
  .pd-nav { height: var(--nav-top-h); display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: 56px 52px; border-bottom: 3px solid var(--brand-magenta); }
  .pd-nav-brand { grid-area: 1 / 1; display: flex; align-items: center; padding: 0 16px; }
  .pd-logo { font-size: 1.75rem; }
  .pd-nav-collapse, .pd-account-email, .pd-copyright { display: none; }
  .pd-nav-actions { grid-area: 1 / 2; display: flex; align-items: center; gap: 8px; padding-right: 16px; }
  .pd-bell { order: -1; }
  .pd-nav-items { grid-area: 2 / 1 / 3 / 3; display: flex; align-items: center; gap: 4px; padding: 0 12px; }
  .pd-nav-item, .pd-nav-group-toggle { position: relative; width: 44px; height: 44px; justify-content: center; align-items: center; display: inline-flex; padding: 0; gap: 0; border-radius: var(--radius-md); }
  .pd-nav-label { display: none; }
  .pd-nav-group-toggle.active { background: var(--nav-item-active-bg); color: var(--text-inverse); }
  .pd-nav-sep { width: 1px; height: 28px; margin: 0 8px; background: var(--nav-sep); }
  .pd-nav-sep ~ .pd-nav-sep { display: none; }
  .pd-nav-group { display: inline-flex; }
  .pd-nav-group-panel { display: none; position: absolute; top: 100%; left: 10px; right: 10px; margin-top: 8px; padding: 8px 0; background: var(--surface-white); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); }
  .pd-nav-group.open .pd-nav-group-panel { display: block; }
  .pd-nav-group-panel .pd-nav-group-title { padding: 10px 20px 8px; color: var(--text-muted); }
  .pd-nav-group-panel .pd-nav-item { display: flex; width: auto; height: 48px; justify-content: flex-start; gap: 14px; padding: 0 20px; border-radius: 0; color: var(--text-secondary); font-size: var(--text-md); }
  .pd-nav-group-panel .pd-nav-label { display: inline; }
  .pd-nav-group-panel .pd-nav-item:hover { background: var(--surface-subtle); color: var(--text-primary); }
  .pd-nav-group-panel .pd-nav-item.active { background: var(--brand-magenta-tint); color: var(--text-primary); font-weight: var(--weight-semibold); }
  .pd-nav-group-panel .pd-nav-item.active .nav-icon { color: var(--brand-magenta); }
  .pd-account-menu { width: 230px; }
  .pd-notif-panel { width: calc(100vw - 20px); }
}
```

- [ ] **Step 4: Update the old guards.**

In `js/lib/foundations-guard.test.js`, replace the test `'keeps the layout invariants'`:

```js
  it('keeps the layout invariants', () => {
    expect(css).toContain('calc(100vh - var(--nav-top-h) - var(--breadcrumb-h))');
    expect(css).toContain('right: -960px');
  });
```

(The `height: 44px` invariant belonged to the removed `.nav-main-tab`; the fixed heights are now pinned by `nav-layout-guard.test.js`.)

In `js/lib/nav-shell.test.js`, extend the `--sidebar-w rule` test so it also pins the media rules — add inside that `describe`:

```js
  it('still has the base 0px rule, and sets the width from the media query', () => {
    expect(css).toMatch(/:root\s*\{\s*--sidebar-w:\s*0px;\s*\}/);
    expect(css).toContain('--sidebar-w: var(--sidebar-w-open)');
  });
```

- [ ] **Step 5: Run the tests.**

Run: `npx vitest run js/lib/nav-layout-guard.test.js js/lib/foundations-guard.test.js js/lib/nav-shell.test.js js/lib/nav-shell-guard.test.js js/lib/tokens.test.js`
Expected: PASS **except** the `public pages carry no fixed footer` tests for `login`, `activate`, `reset-password` (fixed in Task 7). Everything else PASS.

- [ ] **Step 6: Commit.**

```bash
git add css/style.css js/lib/nav-layout-guard.test.js js/lib/foundations-guard.test.js js/lib/nav-shell.test.js
git commit -m "feat(nav): sidebar / icon-navbar CSS, anti-jump container, board height from navbar only

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Notifications — bell state and SVG banner

**Files:**
- Modify: `js/notifications.js`
- Create: `js/lib/notifications-ui.test.js`

**Interfaces:**
- Consumes: `navIcon(name)` (Task 2, optional global), `.pd-bell-btn.has-unread` / `#nav-notif-badge` (Tasks 2 and 4).
- Produces: `updateBadge(count)` also toggles `has-unread` on `#nav-notif-btn`.

- [ ] **Step 1: Write the failing tests.** Create `js/lib/notifications-ui.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'js/notifications.js'), 'utf8');
const n = new Function(src + '\nreturn { updateBadge, refreshBrowserNotifBanner };')();

beforeEach(() => {
  document.body.innerHTML =
    '<button id="nav-notif-btn" class="pd-bell-btn"><span id="nav-notif-badge" style="display:none"></span></button>';
});
const btn = () => document.getElementById('nav-notif-btn');
const badge = () => document.getElementById('nav-notif-badge');

describe('updateBadge', () => {
  it('shows the count and marks the bell unread', () => {
    n.updateBadge(3);
    expect(badge().textContent).toBe('3');
    expect(badge().style.display).toBe('');
    expect(btn().classList.contains('has-unread')).toBe(true);
  });
  it('caps at 99+', () => {
    n.updateBadge(150);
    expect(badge().textContent).toBe('99+');
  });
  it('hides the badge and clears the unread look at 0 (mark all read, or a negative count)', () => {
    n.updateBadge(2);
    n.updateBadge(0);
    expect(badge().style.display).toBe('none');
    expect(btn().classList.contains('has-unread')).toBe(false);
    n.updateBadge(2);
    n.updateBadge(-1);
    expect(btn().classList.contains('has-unread')).toBe(false);
  });
  it('does not throw when only the badge exists', () => {
    document.body.innerHTML = '<span id="nav-notif-badge"></span>';
    expect(() => n.updateBadge(1)).not.toThrow();
  });
});

describe('desktop-notification banner icon', () => {
  it('uses an SVG icon (no emoji, no textContent) when the helper is available', () => {
    globalThis.navIcon = name => `<svg class="nav-icon" data-name="${name}"></svg>`;
    globalThis.Notification = { permission: 'default' };
    globalThis.getBrowserNotifBannerState = () => ({ visible: true, label: 'Enable' });
    document.body.innerHTML =
      '<div id="nav-notif-browser-banner"></div><span id="nav-notif-browser-label"></span><button id="nav-notif-browser-enable"></button>';
    n.refreshBrowserNotifBanner();
    const label = document.getElementById('nav-notif-browser-label');
    expect(label.querySelector('svg.nav-icon')).not.toBeNull();
    expect(label.textContent).toContain('Enable desktop notifications?');
    expect(label.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    globalThis.getBrowserNotifBannerState = () => ({ visible: true, label: 'Disable' });
    n.refreshBrowserNotifBanner();
    expect(label.textContent).toContain('Desktop notifications on');
    expect(label.querySelector('svg.nav-icon')).not.toBeNull();
  });
  it('still renders the text when the icon helper is missing', () => {
    delete globalThis.navIcon;
    globalThis.Notification = { permission: 'default' };
    globalThis.getBrowserNotifBannerState = () => ({ visible: true, label: 'Enable' });
    document.body.innerHTML =
      '<div id="nav-notif-browser-banner"></div><span id="nav-notif-browser-label"></span><button id="nav-notif-browser-enable"></button>';
    n.refreshBrowserNotifBanner();
    expect(document.getElementById('nav-notif-browser-label').textContent).toContain('Enable desktop notifications?');
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `npx vitest run js/lib/notifications-ui.test.js`
Expected: FAIL (`has-unread` never set; emoji labels).

- [ ] **Step 3: Implement.** In `js/notifications.js`:

(a) In `refreshBrowserNotifBanner()`, replace the two `label.textContent = '🔔 ...'` lines (the constant strings contain no user input, so `innerHTML` is safe):

```js
  const icon = typeof navIcon === 'function' ? navIcon('bell') : '';
  if (state.label === 'Enable') {
    label.innerHTML = icon + 'Enable desktop notifications?';
    btn.textContent = 'Enable';
    btn.className = 'btn btn-primary btn-sm py-0 px-2';
  } else {
    label.innerHTML = icon + 'Desktop notifications on';
    btn.textContent = 'Disable';
    btn.className = 'btn btn-outline-secondary btn-sm py-0 px-2';
  }
```

(b) Replace `updateBadge`:

```js
function updateBadge(count) {
  const badge = document.getElementById('nav-notif-badge');
  const bell = document.getElementById('nav-notif-btn');
  if (bell) bell.classList.toggle('has-unread', count > 0);
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}
```

- [ ] **Step 4: Run the tests.**

Run: `npx vitest run js/lib/notifications-ui.test.js`
Expected: PASS. Then `npm test` → PASS apart from the three public-footer tests of Task 7.

- [ ] **Step 5: Commit.**

```bash
git add js/notifications.js js/lib/notifications-ui.test.js
git commit -m "feat(nav): unread bell state and SVG desktop-notification banner

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Uniform page names

**Files:**
- Modify: `config.html`, `portfolio.html`, `planning.html`, `admin.html`, `_db-reset.html`, `project-config.html`, `timesheets.html`, `js/portfolio.js`
- Create: `js/lib/page-names.test.js`

**Interfaces:**
- Consumes: `NAV_MAIN` / `NAV_GROUPS` labels (Task 2) as the single source of the names.

- [ ] **Step 1: Write the failing test.** Create `js/lib/page-names.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const read = f => readFileSync(join(process.cwd(), f), 'utf8');
const nav = new Function(read('js/nav.js') + '\nreturn { NAV_MAIN, NAV_GROUPS };')();

// page file -> activeTab id passed to initNav
const PAGES = {
  'pipeline.html': 'pipeline', 'portfolio.html': 'portfolio', 'planning.html': 'planning',
  'config.html': 'config', 'timesheets.html': 'timesheets', 'admin.html': 'admin', 'team.html': 'team',
  'attribute-lists.html': 'attributelists', '_db-reset.html': 'dbreset', '_terms-editor.html': 'termseditor',
};
const labelOf = id => [...nav.NAV_MAIN, ...nav.NAV_GROUPS.flatMap(g => g.items)].find(i => i.id === id).label;

describe('menu entry = <title> = breadcrumb', () => {
  for (const [file, id] of Object.entries(PAGES)) {
    const label = labelOf(id);
    const html = read(file);
    it(`${file}: "${label}"`, () => {
      expect(html).toContain(`<title>PDash — ${label}</title>`);
      const start = html.indexOf(`initNav('${id}'`);
      const call = html.slice(start, html.indexOf(']});', start));
      expect(call).toContain(`{ label: '${label}' }`);
    });
  }
  it('labels match the agreed list', () => {
    expect([...nav.NAV_MAIN, ...nav.NAV_GROUPS.flatMap(g => g.items)].map(i => i.label)).toEqual([
      'Pipeline', 'Portfolio', 'Planning', 'Master Data', 'Timesheets', 'User Admin', 'Team', 'Attribute Lists',
      'DB Reset', 'Terms & Conditions']);
  });
});

describe('no breadcrumb or in-page text keeps an old page name', () => {
  const files = [...readdirSync(process.cwd()).filter(f => /\.html$/.test(f) && f !== 'test-cases.html'),
    ...readdirSync(join(process.cwd(), 'js')).filter(f => /\.js$/.test(f)).map(f => 'js/' + f)];
  const OLD = [/label:\s*'Project Portfolio'/, /label:\s*'Resource Planning'/, /label:\s*'Configuration'/,
    /label:\s*'Administration'/, /label:\s*'Database Reset'/, /label:\s*'Project Reporting'/,
    /<title>PDash — (Project Reporting|Resource Planning|Configuration|Admin)<\/title>/];
  it('has no old crumb label or old <title> in any page or js file', () => {
    const hits = [];
    for (const f of files) for (const re of OLD) if (re.test(read(f))) hits.push(`${f}: ${re}`);
    expect(hits).toEqual([]);
  });
  it('timesheets.html refers to the Portfolio page by its new name', () => {
    expect(read('timesheets.html')).not.toContain('in Project Reporting');
    expect(read('timesheets.html')).not.toContain('in the Project Reporting view');
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `npx vitest run js/lib/page-names.test.js`
Expected: FAIL (config/portfolio/planning/admin/db-reset names, old crumbs).

- [ ] **Step 3: Grep for every old string before editing** (the test is the contract; this finds the exact lines):

```bash
grep -n "Project Reporting\|Project Portfolio\|Resource Planning\|Administration\|Database Reset\|— Configuration\|— Admin<" config.html portfolio.html planning.html admin.html _db-reset.html project-config.html timesheets.html js/portfolio.js
```

- [ ] **Step 4: Apply the renames.** Only the following (page headings and exported file/sheet names are page content and stay):
- `config.html`: `<title>PDash — Configuration</title>` → `<title>PDash — Master Data</title>`; breadcrumb `{ label: 'Configuration' }` → `{ label: 'Master Data' }`.
- `portfolio.html`: `<title>PDash — Project Reporting</title>` → `<title>PDash — Portfolio</title>`; the three crumbs `{ label: 'Project Portfolio' ... }` (initNav call, and the two in-page `updateBreadcrumbs` calls) → `{ label: 'Portfolio' ... }` (keep the `href` where present).
- `js/portfolio.js` crumb `{ label: 'Project Portfolio', href: '/portfolio.html' }` → `{ label: 'Portfolio', href: '/portfolio.html' }`.
- `project-config.html`: both parent crumbs `{ label: 'Project Portfolio', href: '/portfolio.html' }` → `{ label: 'Portfolio', href: '/portfolio.html' }`.
- `planning.html`: `<title>PDash — Resource Planning</title>` → `<title>PDash — Planning</title>`; crumb `{ label: 'Resource Planning' }` → `{ label: 'Planning' }`.
- `admin.html`: `<title>PDash — Admin</title>` → `<title>PDash — User Admin</title>`; crumb `{ label: 'Administration' }` → `{ label: 'User Admin' }`.
- `_db-reset.html`: crumb `{ label: 'Database Reset' }` → `{ label: 'DB Reset' }` (the `<h1>` page heading stays).
- `timesheets.html`: the two sentences `in Project Reporting` / `in the Project Reporting view` → `in Portfolio` / `in the Portfolio view`.

- [ ] **Step 5: Run the tests.**

Run: `npx vitest run js/lib/page-names.test.js`
Expected: PASS. Then `npm test` → PASS apart from the public-footer tests of Task 7.

- [ ] **Step 6: Commit.**

```bash
git add config.html portfolio.html planning.html admin.html _db-reset.html project-config.html timesheets.html js/portfolio.js js/lib/page-names.test.js
git commit -m "feat(nav): one name per page in menu, title and breadcrumb (Master Data, Portfolio, Planning, User Admin, DB Reset)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Remove the footers of the public pages

**Files:**
- Modify: `login.html`, `activate.html`, `reset-password.html`

- [ ] **Step 1: The failing test already exists** (`public pages carry no fixed footer` in `js/lib/nav-layout-guard.test.js`, Task 4).

Run: `npx vitest run js/lib/nav-layout-guard.test.js`
Expected: FAIL for the three pages.

- [ ] **Step 2: Remove the footer block** from each file — the three-line `<footer style="position:fixed;bottom:0;...">` … `</footer>` element (`login.html` 161–163, `activate.html` 190–192, `reset-password.html` 181–183). Read each file around those lines first and delete exactly the `<footer>…</footer>` element, nothing else. Check that the footer contained only the copyright text (no script or link):

```bash
grep -n -A3 "<footer" login.html activate.html reset-password.html
```

Expected before the edit: each block is `<footer ...>` + one line of "2026 PDash" markup + `</footer>`.

- [ ] **Step 3: Run the tests.**

Run: `npm test`
Expected: PASS (all). The three pages keep `body { min-height: 100vh; display: flex }` so their card stays centred; this is confirmed visually in Task 9.

- [ ] **Step 4: Commit.**

```bash
git add login.html activate.html reset-password.html
git commit -m "feat(nav): remove the fixed footer from login, activate and reset-password

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Cache-busting

**Files:**
- Modify: the 14 authenticated `*.html` pages (`nav.js`, `style.css`, `notifications.js` references)
- Modify: `js/lib/nav-shell-guard.test.js`

- [ ] **Step 1: Update the pin test first (it must fail).** In `js/lib/nav-shell-guard.test.js`, replace the `?v= references` block's file list and expectations:

```js
describe('?v= references of the files edited in B1 and B2', () => {
  const all = readdirSync(process.cwd()).filter(f => /^[^/]+\.html$/.test(f));
  for (const file of ['css/style.css', 'js/core.js', 'js/nav.js', 'js/notifications.js']) {
    it(`${file} is referenced with one version on every page`, () => {
      const re = new RegExp(file.replace(/[./]/g, '\\$&') + '\\?v=(\\d+)', 'g');
      const versions = new Set();
      for (const p of all) for (const m of readFileSync(join(process.cwd(), p), 'utf8').matchAll(re)) versions.add(m[1]);
      expect([...versions]).toHaveLength(1);
    });
  }
  it('uses the bumped versions', () => {
    const p = readFileSync(join(process.cwd(), 'pipeline.html'), 'utf8');
    expect(p).toContain('css/style.css?v=17');
    expect(p).toContain('js/core.js?v=11');
    expect(p).toContain('js/nav.js?v=13');
    expect(p).toContain('js/notifications.js?v=3');
    expect(p).toContain('css/tokens.css?v=9');
  });
});
```

Run: `npx vitest run js/lib/nav-shell-guard.test.js`
Expected: FAIL (`style.css?v=16`, `nav.js?v=12`, `notifications.js?v=2`).

- [ ] **Step 2: Bump every reference.**

```bash
sed -i 's#js/nav\.js?v=12#js/nav.js?v=13#g; s#css/style\.css?v=16#css/style.css?v=17#g; s#js/notifications\.js?v=2"#js/notifications.js?v=3"#g' *.html
```

- [ ] **Step 3: Verify nothing was missed.**

```bash
grep -ho "js/nav.js?v=[0-9]*\|css/style.css?v=[0-9]*\|js/notifications.js?v=[0-9]*\|css/tokens.css?v=[0-9]*\|js/core.js?v=[0-9]*" *.html | sort | uniq -c
```

Expected: `nav.js?v=13` ×14, `style.css?v=17` ×14, `notifications.js?v=3` ×14, `tokens.css?v=9` ×18, `core.js?v=11` unchanged. (`core.js` is not edited in this cycle, so its version stays.)

- [ ] **Step 4: Run all tests.**

Run: `npm test`
Expected: PASS (count ≥ `BASE` + the new tests).

- [ ] **Step 5: Commit.**

```bash
git add *.html js/lib/nav-shell-guard.test.js
git commit -m "chore(nav): bump nav.js v13, style.css v17, notifications.js v3 on every page

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Browser verification (acceptance criteria 1–8)

**Files:** none committed (record results in the `/finish-cycle` report).

No docker command touches the main stack. Frontend only, no `pdash-api` restart.

- [ ] **Step 1: Start the isolated branch stack.** The worktree lacks the gitignored `.env`: copy it from the main checkout (never commit it), then:

```bash
cp ../burndown/.env .env   # path of the main checkout; adjust to the real location
scripts/test-branch.sh up
scripts/test-branch.sh status
```

Expected: `status` exits 0 ("up"). Note the URL/ports the script prints. Leave the stack running: it is torn down only at `/finish-cycle` Gate 2 after the user's own "yes", never after my own use.

- [ ] **Step 2: Sidebar, as admin.** Log in, open `pipeline.html` at ≥ 1024px wide. Compare with `docs/superpowers/design/navbar_aperta.png`: sidebar open on first visit, magenta border on the active item, ADMIN group always expanded, avatar + email + bell at the bottom, "© 2026 PDash" visible. Fix visual drift (spacing, widths, brand row height) in `css/style.css` and re-run `npm test`; commit CSS adjustments as `fix(nav): ...` and note the final widths.

- [ ] **Step 3: Rail.** Click the collapse button; compare with `navbar_collassata.png`. Reload and navigate to another page: the state persists. Expand again: persists.

- [ ] **Step 4: Menus and panel positions.** Collapsed and expanded: open the account menu (opens to the right, bottom-aligned, stays inside the viewport) and the notification panel (wider than the account menu, anchored to the bell); compare with `2026-10-02-schermo-grande-avatar-notifiche.png`. Resize below 1024px (and to 360px wide): icon navbar with no horizontal scroll and no breadcrumb; account menu 230px under the avatar; notification panel with 10px side margins; compare with `2026-10-02-schermi-piccoli-menu.png` and `...-avatar-notifiche.png`.

- [ ] **Step 5: Group panels below 1024px.** Tap Admin: full-width card with the 5 entries, active row pink (open it from `config.html`: "Master Data" active); tap Sysadmin (as sysadmin): the Admin panel closes; `Esc` and tap outside close; compare with `2026-10-02-schermi-piccoli-sottomenu.png`. Widen the window past 1024px with a panel open: the sidebar shows both groups, no hidden state.

- [ ] **Step 6: Bell states.** With unread notifications: badge with the count and white button with red icon and border. With none: light border on navy. "Mark all read" clears it without a reload.

- [ ] **Step 7: Board fills the page exactly.** On `pipeline.html`, in the three layouts (sidebar open, rail, < 1024px), run in the browser console and require `bottom` equal to `innerHeight` (±1) and `pageScroll` ≤ 1:

```js
(() => { const r = document.querySelector('.pb-board-root').getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, innerHeight: window.innerHeight,
           pageScroll: document.documentElement.scrollHeight - window.innerHeight }; })()
```

If a layout is off, adjust `--nav-top-h` (small layout: the aside is `56px + 52px + 3px border = 111px`) or `--breadcrumb-h` in `css/style.css`, re-measure, and update the pinned value in `nav-layout-guard.test.js` if it changed.

- [ ] **Step 8: Other pages.** Check `costgrid.html` (the `calc(100vh - 300px)` area at `costgrid.html:216` neither clipped nor leaving a gap; leave as is if fine), `planning.html` (assistant panel opens), `team.html` (detail panel), `settings.html`, `profile-jobs.html` (Timesheets entry active). Check `login.html`, `activate.html?token=x`, `reset-password.html?token=x`: no footer, card still centred.

- [ ] **Step 9: No layout jump.** Reload `pipeline.html` several times with throttled network (devtools "Slow 3G"): the navy sidebar column / navbar bar is there from the first paint and the content does not shift when the navigation renders.

- [ ] **Step 10: Roles.** Repeat the checks that differ by role as **user** (3 destinations, no groups, no stray separator, small navbar with no group buttons), **admin** (Admin only) and **sysadmin** (both), with every menu open.

- [ ] **Step 11: Names and emoji.** Walk the 14 pages: menu, tab title and breadcrumb show the same name; no emoji remains in the sidebar, dropdowns, the three modal titles or the notification banner.

- [ ] **Step 12: Final run and handoff.**

```bash
npm test
git status --short
```

Expected: tests PASS; clean tree except nothing (the `.env` copy is gitignored). Then run **`/finish-cycle`** (test gate, code review, `/sync-docs` — CLAUDE.md sections to update: "Page shell", "Pipeline board layout (height math)", the footer/nav/settings entries, file-structure notes for `nav.js`/`notifications.js`/`style.css`/`tokens.css`, and `docs/js/nav.md` — `--no-ff` merge, push, worktree cleanup). Never merge or push by any other means.

---

## Self-review (run against the spec)

- **Spec §1 decisions:** names (Task 6), copyright (Task 2 markup + Task 4 CSS rail/small hide), bell (Tasks 4–5), full-width group panel (Tasks 2–4), public footers (Task 7), no jump (Task 4 + Task 9 step 9).
- **§3.1 structure** → Task 2 (three children, IDs kept). **§3.2 layouts, group panels** → Task 3 (`navWireGroups`) + Task 4 (CSS). **§3.3 account/notifications placement, banner/modals icons, initials** → Tasks 3–5. **§3.4 anti-jump** → Task 4 tests + Task 9. **§3.5 footer/heights** → Tasks 3, 4, 7, 9 (`costgrid.html:216` checked, not changed). **§3.6 icons, names, tokens** → Tasks 1, 2, 6.
- **§4 constraints:** z-index (Task 4 test), shell guard (unchanged and green), versions (Tasks 1 and 8), tokens contrast (Task 1 test), English text, worktree + `/finish-cycle` (Tasks 0 and 9).
- **§5 testing / §6 acceptance 1–9:** unit tests per task; criteria 1–7 by Task 9, 8 by Task 7 test + Task 9 step 8, 9 by Tasks 8–9.
- **Placeholders:** none; every code step carries the code. **Names consistent:** `navIcon`, `navInitials`, `buildNavHtml`, `navLayout`, `navSetCollapsed`, `navSyncCollapseButton`, `navPopperConfig`, `navWireGroups`, `navRefreshAccount` are defined in Tasks 2–3 and used with the same signatures in Tasks 3 and 5; class names in Task 2 markup match the Task 4 CSS selectors.
- **Review Focus coverage:** (1) Task 3 `navRefreshAccount` test + handler; (2) Task 3 `navWireGroups` tests + Task 4 CSS guard; (3) Task 3 `navSetCollapsed` throwing-storage test; (4) Task 2 `user`/`settings`/`timesheets` tests; (5) Task 5 `updateBadge` tests.
