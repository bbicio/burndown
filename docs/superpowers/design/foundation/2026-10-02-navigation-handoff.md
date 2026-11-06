# PDash — Post-Login Navigation Handoff (Cycle B)
Prepared by Claude Design for Claude Code · based on a direct read of `js/nav.js` (517 lines, read in full), `js/notifications.js` (193 lines, read in full), `css/style.css`, `css/tokens.css`, `CLAUDE.md`, every in-scope page's `initNav(...)` call, and `docs/superpowers/audits/2026-09-24-navigation-ux-audit.md` · no files modified during this review.

Every number below was either computed by hand from the cited CSS (shown as a sum, so it can be checked) or is an explicit literal found in the source. Anything I could not establish this way is marked **unverified**, per the brief's evidence rule.

---

## 1. Summary of the intended change

The 2026-09-24 audit (non-binding input, not a requirement) found 5 real issues: fixed chrome height with no way to reclaim it, no overflow/responsive handling on the tabs row, two pages whose tab+breadcrumb don't name where the user actually is, one destination with two different names on screen at once, and the Admin dropdown's grouping existing only in the menu, not in any breadcrumb.

**Recommendation for this cycle: fix all 5 within the current top-navbar pattern** (modest height trim + overflow handling + copy/IA fixes), not a sidebar migration. Reasoning: a sidebar is a bigger structural bet than this cycle's evidence supports — I have not built and validated a sidebar mockup for this specific navbar (the audit's sketch was explicitly "not applied — for discussion"), and per this project's own working method, a structural layout change like that should go through a validated Design mockup before a blind, no-screenshot handoff is written for it. The option is kept open and sized in §13.

**What stays as-is:** the three-destination top-tab model (Pipeline/Portfolio/Planning), the Admin/Sysadmin dropdown grouping, URL-based navigation (constraint #6), the account dropdown's 5 entries, the 3 navbar-injected modals' functional behavior (Cycle A already re-themed their shell via the `.modal` token override — see CLAUDE.md's Design tokens section), and every element ID consumed elsewhere (`#nav-notif-btn`, `#nav-account-btn`, etc.) unchanged.

---

## 2. Information architecture

### 2a. Top-level tabs (all authenticated roles, `js/nav.js:24–28`)
| Order | Label (current) | `id` | `href` |
|---|---|---|---|
| 1 | Pipeline | `pipeline` | `/pipeline.html` |
| 2 | Project Reporting | `portfolio` | `/portfolio.html` |
| 3 | Resource Planning | `planning` | `/planning.html` |

### 2b. ⚙ Admin dropdown — visible if `role ∈ {admin, sysadmin}` (`js/nav.js:36–47`)
| Order | Label | `id` | `href` |
|---|---|---|---|
| 1 | ⚙ Config | `config` | `/config.html` |
| 2 | 📂 Actuals Repository | `timesheets` | `/timesheets.html` |
| 3 | 👤 User Admin | `admin` | `/admin.html` |
| 4 | 👥 Team | `team` | `/team.html` |
| 5 | 🏷 Attribute Lists | `attributelists` | `/attribute-lists.html` |

No internal grouping or dividers within this menu today — flat list of 5.

### 2c. 🔒 Sysadmin dropdown — visible only if `role === 'sysadmin'` (`js/nav.js:49–57`)
| Order | Label | `id` | `href` |
|---|---|---|---|
| 1 | 🗄 DB Reset | `dbreset` | `/_db-reset.html` |
| 2 | 📄 Terms & Conditions | `termseditor` | `/_terms-editor.html` |

### 2d. Account dropdown — all roles (`js/nav.js:95–106`)
👤 My Profile · ⚙ Settings · *divider* · 📣 Send Notification · *divider* · 🔑 Change password · *divider* · Sign out (red text)

### 2e. Pages with no menu entry (reached another way)
| Page | `activeTab` passed | How it's reached | Role |
|---|---|---|---|
| `settings.html` | `'settings'` (`settings.html:48`) — matches nothing in `tabs`/`adminPageIds`/`sysAdminPageIds`, so **no tab highlights** | Account dropdown → ⚙ Settings | any |
| `profile-jobs.html` | `'timesheets'` (confirmed by grep; file not read line-by-line this pass) — highlights the Timesheets admin entry even though this page isn't linked from any menu | A button on `timesheets.html` | admin/sysadmin |

### 2f. activeTab audit — every page's call, verified this pass
| Page | `activeTab` | Correct given above tables? |
|---|---|---|
| `pipeline.html:843` | `'pipeline'` | ✅ |
| `costgrid.html:1489` | `'pipeline'` | ⚠️ Cost Grid Editor has no tab of its own — reuses Pipeline's. Breadcrumb compounds this: `{Home}/{Pipeline→/pipeline.html}/{'…'}` (`costgrid.html:1490–1492`) — a literal ellipsis as the last, most-specific crumb |
| `portfolio.html:905` | `'portfolio'` | ✅ for the tab, but see §2g — breadcrumb text disagrees with the tab label |
| `project-config.html:508` | `'portfolio'` | ⚠️ Same pattern as Cost Grid: breadcrumb is `{Home}/{Project Portfolio→/portfolio.html}/{'…'}` (`project-config.html:509–511`) |
| `planning.html:1316` | `'planning'` | ✅ |
| `config.html:1249` | `'config'` | ✅ |
| `timesheets.html:270` | `'timesheets'` | ✅ |
| `admin.html:238` | `'admin'` | ✅ |
| `team.html:499` | `'team'` | ✅ |
| `attribute-lists.html:322` | `'attributelists'` | ✅ |
| `_db-reset.html:170` | `'dbreset'` | ✅ |
| `_terms-editor.html:127` | `'termseditor'` | ✅ |
| `settings.html:48` | `'settings'` | n/a — see §2e |
| `profile-jobs.html:280` | `'timesheets'` | ⚠️ Borrows an unrelated admin tab's highlight for a page that isn't in that menu at all |

### 2g. The naming split (confirmed, audit finding 4)
- Tab label: **"Project Reporting"** (`js/nav.js:25`)
- Breadcrumb on the very same page: **"Project Portfolio"** (`portfolio.html:907`)
- Also used independently: **"Project Portfolio"** again in `project-config.html:510`

**Proposed fix:** pick one name and use it in both places. I recommend **"Project Portfolio"** (it's already the breadcrumb string used in two places vs. the tab's one, and it's the more literal description of the page — a portfolio of projects). This only touches `js/nav.js:25`'s label string — no route, no `id`, no HTML structure change.

*(Note: this project also has a separate, exploratory Design-canvas discussion of renaming "Project Reporting"→"Portfolio" and other tabs, not yet applied to any real file. That exploration used a different final word — "Portfolio" alone, not "Project Portfolio" — from a different motivation (icon-tooltip length). The two haven't been reconciled; flagging in §13 rather than silently picking one.)*

### 2h. Admin grouping invisible in breadcrumbs (audit finding 5, re-verified)
`config.html:1251` → `"Configuration"`; `admin.html:240` → `"Administration"`; `team.html:501` → `"Team"`; `attribute-lists.html:324` → `"Attribute Lists"`; `timesheets.html:272` → `"Timesheets"`. All five are `Home > <Page>` — none include an "Admin" middle crumb, even though the dropdown visually groups them under ⚙ Admin.

**Proposed fix:** insert a non-linking middle crumb, e.g. `Home > Admin > Configuration`, for all 5 pages plus the 2 Sysadmin pages (`Home > Sysadmin > DB Reset`). Pure data change to the `breadcrumbs` array each page already passes — no markup change, `_navBcHtml` (`js/nav.js:108–115`) already renders a non-last item without an `href` as plain (non-link) text, so an `{label:'Admin'}` entry with no `href` works today, unchanged.

---

## 3. Navbar spec

### 3a. Current structure (verified)
```
<nav class="navbar navbar-dark" style="background:var(--brand-navy); border-bottom:3px solid var(--brand-magenta); padding:10px 0 0; flex-direction:column; align-items:stretch">
  <div style="height:44px">  logo · spacer · bell-dropdown · account-dropdown  </div>
  <div style="border-top:1px solid rgba(255,255,255,.1); padding-bottom:8px">  tabs · admin-dropdown · sysadmin-dropdown  </div>
</nav>
```
(`js/nav.js:63–139`)

### 3b. Current height — computed, not copy-pasted from CLAUDE.md
| Piece | Value | Source |
|---|---|---|
| `<nav>` padding-top | 10px | inline style, `js/nav.js:64` |
| Row 1 (logo/account) | 44px | inline `style="height:44px"`, `js/nav.js:65` |
| Row 2 border-top | 1px | inline style, `js/nav.js:138` |
| Row 2 content height | 44px | `.nav-main-tab{height:44px}`, `css/style.css:68` (tab is the tallest child) |
| Row 2 padding-bottom | 8px | inline style, `js/nav.js:138` |
| `<nav>` border-bottom | 3px | inline style, `js/nav.js:64` |
| **Total** | **10+44+1+44+8+3 = 110px** | sum of the above |

**This is 4px more than the "106px" figure CLAUDE.md's Design-tokens section and the brief both cite.** I can't find where 106 comes from in the current CSS (it would match if the 3px brand-magenta border-bottom or the 1px row-2 border-top were not counted). Flagging the discrepancy rather than silently using either number — **recommend confirming the true rendered height in a browser's devtools before finalizing any new calc()**, since this is exactly the kind of number the brief warns a prior handoff got wrong.

Breadcrumb bar: `body.has-breadcrumbs{--breadcrumb-h:33px}` (`css/style.css:19`) is an explicit literal, not computed from `.breadcrumb-bar`'s own box model — I can't re-derive 33px purely from `padding:6px 24px`+`font-size:var(--text-xs)` (`css/style.css:20–24`) without knowing the rendered line-height; treating **33px as the documented, presumably-measured value**, not independently re-verified. **Also verified: `var(--breadcrumb-h)` is declared but has zero consumers anywhere in the codebase** (`grep -rn "var(--breadcrumb-h)"` → no matches) — it is genuinely dead CSS today, not used by any layout calc, contrary to what its name implies.

### 3c. Proposed changes (small, low-risk trims — not a restructure)
| Change | Current | Proposed | Saves |
|---|---|---|---|
| `<nav>` padding-top | 10px | 6px | 4px |
| Row 2 top border | 1px solid | removed (row 1's own bottom edge already reads as a seam against the 3px brand-magenta border below row 2) | 1px |
| Row 2 padding-bottom | 8px | 6px | 2px |
| `.breadcrumb-bar` padding | `6px 24px` | `4px 24px` | ~4px (unverified exact render) |

Net: roughly **7px off the navbar, ~4px off the breadcrumb bar** — modest, but zero structural risk, and it actually fixes something real (removing the now-redundant 1px border) rather than just shaving numbers. **Every dependent `calc()` must be updated by this same delta** — see §10 for the full list.

### 3d. Tab states
| State | Current rule | Change? |
|---|---|---|
| Default | `color:rgba(255,255,255,.55)` (`css/style.css:57`) | none — computed contrast on navy bg ≈ **5.9:1** (hand-computed via WCAG relative-luminance formula; passes AA) |
| Hover | `color:rgba(255,255,255,.9); background:rgba(255,255,255,.07)` (`css/style.css:70`) | none |
| Active | `color:var(--text-inverse); border-bottom-color:var(--text-inverse)` (`css/style.css:71`) | none — white (`--text-inverse`) on `--brand-navy` ≈ **17.2:1** (hand-computed), passes AA easily |
| Focus-visible | **Not found** — no `:focus-visible` rule exists for `.nav-main-tab` anywhere in `css/style.css` | **New**: add `.nav-main-tab:focus-visible{outline:2px solid var(--text-inverse); outline-offset:-2px}` (offset negative so the outline stays inside the dark bar, legible against both the tab and the navy background) |
| Disabled | **Not applicable** — no tab is ever disabled; all 3 top tabs show for every authenticated role | n/a |

### 3e. Overflow / narrow-width behaviour
**Current: none exists.** Confirmed: `grep -rn "@media" css/` returns zero results in `css/style.css`/`css/tokens.css` (the audit's "two unrelated `@media` rules in `_db-reset.html`" are outside this scope). Row 2 is `d-flex` with Bootstrap's default `flex-wrap:nowrap` and no override (`js/nav.js:138`) — at narrow widths or with both dropdowns present (5 groups: 3 tabs + Admin + Sysadmin), items will overflow the viewport with no defined behavior today (clipped or causing horizontal scroll of the whole bar, depending on browser — **unverified which, would need a real narrow-viewport test**).

**Proposed:** add `overflow-x:auto; overflow-y:hidden` to the row-2 container (no `flex-wrap`, since wrapping would grow the row's height unpredictably and break the fixed-height contract every `calc()` relies on) plus `scrollbar-width:thin` for Firefox and a thin themed scrollbar for WebKit, so at narrow widths the row scrolls horizontally instead of silently breaking. This is a 2-line CSS addition, no markup change.

---

## 4. Dropdowns

All three (Account, ⚙ Admin, 🔒 Sysadmin) are Bootstrap `.dropdown`/`.dropdown-menu` — and therefore **already affected by Cycle A's global `.dropdown-menu` override** (radius 8px, `--shadow-md`, `--border-light` border; CLAUDE.md's Design-tokens section). **Decision (not left open): keep the shared override, no navbar-specific variant.** Reasoning: the open menu itself always renders as a light surface floating over the page content below the navbar — never over the dark navy bar itself — so the override's light-surface styling (built for page-level dropdowns) looks and behaves identically here. I found no selector in `css/style.css` that gives any of the 3 navbar dropdown-menus a different background/border/shadow today, so there's no existing divergent style this override would be destroying.

| Dropdown | Entries (order) | Keyboard/hover | Role visibility |
|---|---|---|---|
| Account (`js/nav.js:95–106`) | My Profile, Settings, —, Send Notification, —, Change password, —, Sign out (danger) | Standard Bootstrap dropdown — `Tab`/`Shift+Tab` through items, `Enter`/`Space` to activate, `Esc` closes. **Not verified**: whether arrow-key roving focus is enabled (Bootstrap 5.3's dropdown JS supports it by default; no custom override found that would disable it) | all |
| ⚙ Admin (`js/nav.js:39–46`) | Config, Actuals Repository, User Admin, Team, Attribute Lists — flat, no dividers | same as above | admin, sysadmin |
| 🔒 Sysadmin (`js/nav.js:51–56`) | DB Reset, Terms & Conditions — flat | same as above | sysadmin only |

**Icon change requested and added 2026-10-02** (superseding the "no icon change" statement originally in this section): every emoji in the navbar, dropdowns and account menu is replaced by an inline SVG, reusing the exact icon set already drawn in the Design-canvas navigation mockups (`DopoCollassata.dc.html`) for the entries that exist there, and new icons in the same stroke style for the ones that don't (bell, profile, key, megaphone, sign-out). Full spec, exact markup and provenance per icon: **§15**.

**Proposed addition (ties to §2h):** none to the dropdowns themselves — the Admin-grouping fix lives in the breadcrumb data, not the dropdown markup.

---

## 5. Notification bell and panel

Source: `js/notifications.js` (full file), `js/nav.js:71–93`.

- **Bell button** `#nav-notif-btn`: Bootstrap `btn-outline-light btn-sm`, emoji `🔔`, no icon-token change proposed.
- **Badge** `#nav-notif-badge`: `.badge.rounded-pill.bg-danger`, `font-size:.6rem`, hidden (`display:none`) until `updateBadge(count)` sets text and shows it (`notifications.js:93–101`). Caps at `'99+'` for count > 99. **This uses Bootstrap's own `bg-danger` red, not `--color-danger`** — inconsistent with Cycle A's token system. **Proposed:** `background:var(--color-danger)` inline or a small `.nav-notif-badge{background:var(--color-danger)!important}` rule — one-line fix, same visual result (`--color-danger` is `#dc3545`, Bootstrap's danger red is also `#dc3545` by default in this Bootstrap version — **unverified** whether a CDN version pin could make these diverge; safe either way since the values match today).
- **Panel**: `.dropdown-menu.dropdown-menu-end`, fixed `width:360px; max-height:480px` (`js/nav.js:74`). Header row: "Notifications" + "Mark all read" button. Optional browser-notification opt-in banner (`#nav-notif-browser-banner`, hidden by default, shown conditionally by `wireBrowserNotifBanner()`). List `#nav-notif-list`, `max-height:420px`, scrollable.
- **Empty state**: `"No notifications yet"`, centered, muted, `.875rem` (`js/nav.js:79`, mirrored in `notifications.js:133`).
- **List cap**: "last 50 notifications" per CLAUDE.md — **the actual fetch is `apiFetch('/notifications')` with no visible limit parameter in `notifications.js:139`**; the 50-item cap is therefore a **server-side behavior, unverified from the front-end code alone** (not contradicting CLAUDE.md, just not confirmable from the files in scope for this brief).
- **Long titles**: `renderNotifItem()` (`notifications.js:160–172`) has no `text-overflow`/`white-space` truncation on `.fw-semibold` (title) or the body text — a very long title will wrap naturally inside the 360px panel (flex-wrap of the header row is `justify-content:between` with `gap:2` — **unverified how a title longer than ~40 characters renders without a live test**, likely wraps to a second line, pushing the timestamp down but not breaking layout since nothing is fixed-height here).
- **Unread state**: `.notif-item.unread` — left border + tinted background (`css/style.css`, `.notif-item.unread{border-left:3px solid var(--brand-magenta); background:#fdf0f5}`, confirmed earlier in this project's Cycle A read). `#fdf0f5` is a hardcoded literal, not a token — **candidate new token** `--brand-magenta-tint: #fdf0f5` (or reuse if an equivalent tint token already exists elsewhere — none found in `tokens.css`).
- **Real-time delivery**: SSE (`EventSource`), delayed 2s after page load to avoid connection-slot contention (`notifications.js:14–16`) — no visual implication, noted for completeness per the brief's "states and edge cases" ask.

**Proposed token changes:** `--brand-magenta-tint:#fdf0f5` (new); badge → `var(--color-danger)` (no new token, just un-hardcoding a Bootstrap default).

---

## 6. Breadcrumb bar and footer

**Breadcrumb bar** (`.breadcrumb-bar`, `css/style.css:20–24`): white background, 1px `--border-light` bottom border, `6px 24px` padding (proposed `4px 24px`, §3c), `--text-xs` font. Rendered via `window.updateBreadcrumbs()` (`js/nav.js:118–130`), which creates the bar lazily on first call and adds `body.has-breadcrumbs` — **every in-scope authenticated page passes a non-empty `breadcrumbs` array** (confirmed in §2f's table), so the bar is effectively always present on every authenticated page today; it is not conditional in practice even though the code treats it as optional.

**Footer** (`.app-footer`, `css/style.css:32–44`): `position:fixed; bottom:0; height:100px`, navy background, 3px magenta top border, injected once per page load if not already present (`js/nav.js:144–150`), which also sets `document.body.style.paddingBottom='100px'` so content isn't hidden behind it. **No proposed height or content change** — 100px fixed footer is unrelated to the vertical-space complaint (it's at the bottom, doesn't compete with content for the fold), and the brief's OUT list doesn't ask for a footer redesign beyond stating its height for the dependent-calc list (§10).

**Coexistence with page-level fixed panels**: `#teamAssistantPanel` (`planning.html`) is `position:fixed; top:0; right:-960px` (closed) / `right:0` (open), `height:100vh` (`css/style.css:280–288`) — it is **not** offset from the navbar (`top:0`, full viewport height, rendered *above* the navbar's own stacking context since it has no `z-index` conflict with the nav's `z-index` — navbar itself has no explicit `z-index`, so default stacking order applies). This panel is unaffected by any navbar/breadcrumb height change proposed here, since it doesn't reference those heights in its own CSS (`css/style.css:280` has no `calc()` referencing nav/breadcrumb/footer tokens). Confirmed no change needed here.

---

## 7. Modals — visual changes only

All three (`#navChangePwdModal`, `#navProfileModal`, `#sendNotifModal`) are standard Bootstrap `.modal` markup injected by `nav.js`. Per CLAUDE.md's Design-tokens section, **Cycle A already re-themed the shared `.modal` shell** (radius/shadow via `--bs-*` overrides kept correctly on `.modal`, not `.modal-content`, per that cycle's own note). Reviewing the 3 modals' own markup (`js/nav.js:200–400` approx.) against that: no modal-specific hardcoded colors or hardcoded radii were found inside any of the three (all `alert-danger`/`alert-success` inside them already inherit Cycle A's semantic-color overrides) — **no further visual change proposed for Cycle B**. The only two nav-triggered interactive elements inside these modals not yet covered are the `<button class="btn-close">` (pure Bootstrap, no token hook exists for it in this Bootstrap version — **not changing**) and the password/profile `form-control-sm` inputs, which already inherit the global `.form-control:focus` ring from Cycle A.

---

## 8. Token changes

| Token | Value | Intent | New/changed | Contrast (if text-on-bg) |
|---|---|---|---|---|
| `--brand-magenta-tint` | `#fdf0f5` | Un-hardcode `.notif-item.unread`'s background literal (§5) | 🔵 New | n/a (not a text pairing) |
| *(no new token — reuse)* `var(--color-danger)` on `#nav-notif-badge` | `#dc3545` | Replace Bootstrap's own `bg-danger` utility with the project's token, for consistency, not a visual change | — | White badge text on `#dc3545` ≈ **5.25:1** (hand-computed: luminance of `#dc3545` ≈ 0.2158; contrast = (1+.05)/(0.2158+.05) = 3.95 — **recompute, see note below**) |

**Correction caught while writing this table:** my first pass at the badge contrast was wrong (I initially wrote 5.25:1) — recomputing `#dc3545` white-text contrast by hand gives **3.95:1**, which **fails** AA for normal text (needs 4.5:1). This is the exact kind of error the brief's evidence rule exists to catch, so flagging it rather than quietly fixing the number and moving on: **the 11px badge text is almost certainly fine in practice** (WCAG's large-text threshold is 3:1 at ≥14pt bold or ≥18pt regular — a 1-2 digit count in a small pill is borderline either way), but this should be spot-checked, not assumed. No token change proposed to fix it (would mean darkening Bootstrap's own danger red used project-wide, out of scope for a nav-only cycle) — **flagged as an open question in §13**, not silently resolved.

Two more new tokens from the icon-system addition (§15): `--icon-size-sm:14px`, `--icon-size-md:16px`. No new color tokens for icons — see §15's `currentColor` rationale.

Beyond those and `--brand-magenta-tint`, no other new tokens needed — Cycle A's token set (`--status-*`, `--focus-ring`, `--font-family-base`, `--weight-*`, `--leading-*`, `--z-tooltip`, etc.) already covers everything else this cycle touches.

---

## 9. File-by-file change list

**`js/nav.js`**
- Line 25: tab label `'Project Reporting'` → `'Project Reporting'` ~~→~~ **`'Project Portfolio'`** (§2g)
- Line 64: `padding:10px 0 0` → `padding:6px 0 0`
- Line 138: remove `border-top:1px solid rgba(255,255,255,.1)`; `padding-bottom:8px` → `padding-bottom:6px`; add `overflow-x:auto;overflow-y:hidden`
- No changes to element IDs, `initNav` signature, or any wired event listener

**`css/style.css`**
- `.nav-main-tab` (line 56 block): add `:focus-visible` rule (§3d)
- `.breadcrumb-bar` (line 20 block): `padding:6px 24px` → `padding:4px 24px`
- `.notif-item.unread` (wherever the `#fdf0f5` literal lives — not re-cited here since this file wasn't re-read in full this pass beyond the sections quoted above; **locate via `grep -n "fdf0f5" css/style.css`** before editing) → `var(--brand-magenta-tint)`
- `#nav-notif-badge` (new rule, nav.js-injected element, styled from `style.css`): `background:var(--color-danger)!important`

**`css/tokens.css`**
- Add `--brand-magenta-tint: #fdf0f5;` to the Brand section

**Pages — breadcrumb data only, no markup/script changes:**
- `config.html:1250–1251`, `admin.html:239–240`, `team.html:500–501`, `attribute-lists.html:323–324`, `timesheets.html:271–272`: insert `{ label: 'Admin' }` between `Home` and the page's own crumb (§2h)
- `_db-reset.html`, `_terms-editor.html`: insert `{ label: 'Sysadmin' }` the same way (file/line not re-cited — not read this pass; **verify exact breadcrumb array location before editing**, flagged as unverified)
- `costgrid.html:1490–1492`: replace the literal `'…'` crumb with the actual proposal/client name already available in that page's Vue data (page-level content — **borderline out of scope**, see §13)
- `project-config.html:509–511`: same treatment for the project name

---

## 10. Dependent layout adjustments

Every place that assumes today's 110px navbar / 33px breadcrumb / 100px footer:

| Location | Current | Must change by |
|---|---|---|
| `css/style.css:364–369` (`.pb-board-root`) | `height: calc(100vh - 206px)` (106 navbar + 100 footer, per CLAUDE.md's own stated figure — see §3b's discrepancy note) | Whatever the **actual** combined navbar+footer delta ends up being once §3c's trims are applied and verified in a browser — recommend recomputing this constant from a live measurement, not by arithmetic alone, given the §3b discrepancy already found |
| `js/nav.js:138` comment (`"breaking the navbar height math pipeline.html's .pb-board-root calc relies on"`) | Documents the exact same dependency | Update the comment text alongside the code change, so it doesn't go stale |
| `body.has-breadcrumbs{--breadcrumb-h:33px}` (`css/style.css:19`) | Declared, **zero consumers** (verified, §3b) | Either start consuming it somewhere meaningful, or leave the value alone since nothing reads it — **not a layout risk either way**, but worth a decision rather than carrying dead CSS forward silently |
| `#teamAssistantPanel` (`css/style.css:280`) | `top:0`, independent of navbar height | **No change needed** (confirmed §6) |
| `#ppResourceTable thead th{position:sticky;top:0}` (`css/style.css:273`) | Sticky relative to its own scroll container (`#portfolioPlanningContainer`), not the navbar | **No change needed** — not navbar-relative |
| `.gantt-label-col{position:sticky;left:0}` (`css/style.css:166`) | Horizontal sticky, unrelated to navbar height | **No change needed** |
| `costgrid.html:213` `calc(100vh - 300px)` | A different, page-internal scroll area (confirmed by the 2026-09-24 audit's own out-of-scope note) | **No change needed** — not navbar/footer-related |

No other `calc(100vh` usage exists in the codebase outside `docs/` (confirmed via repo-wide grep, §/method above).

**`js/nav.js` — icon markup (§15):** every label string that currently starts with an emoji (tabs row is text-only today and gets emoji added; `adminHtml`/`sysAdminHtml`/account-dropdown `<li>`s currently prefix an emoji) changes from `${esc(t.label)}` / literal `⚙ Config` style strings to `<svg class="nav-icon nav-icon-sm">…</svg><span>Config</span>` (or `nav-icon-md` for the 3 top tabs). This touches every template literal in `js/nav.js:24–57` (tabs/admin/sysadmin arrays) and `js/nav.js:95–106` (account dropdown `<li>` list) — see §15 for the exact per-entry markup.

---

## 11. States and edge cases

- **Loading, before `initNav` resolves**: `#nav-container` is empty until the navbar's `innerHTML` is set (`js/nav.js:63`) — there is **no loading skeleton or placeholder** found; the page renders with a blank strip at the top until `Api.auth.me()` resolves. **Unverified** how long this typically takes or whether it's visually noticeable — no loading-state change proposed without a measured need.
- **Very long user name**: `displayName` (`js/nav.js:60`) is `esc([firstName,lastName].filter(Boolean).join(' ') || email)`, placed directly as button text with no `max-width`/`text-overflow:ellipsis` found on `#nav-account-btn`. A long name (or a long email fallback) will widen the button and could push the bell icon/button row — **no truncation exists today**; proposing `max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap` on `#nav-account-btn`'s text, new for this cycle.
- **Many notifications**: handled by the panel's own `max-height:420px; overflow-y:auto` (§5) — scrolls, doesn't break layout.
- **A page with no active tab** (`settings.html`): confirmed in §2e — no tab or dropdown trigger highlights. This is already the de facto behavior for a page intentionally outside the IA; **no fix needed**, just documenting it as intentional rather than a bug.
- **A role with few tabs**: the lowest tier (`user`) sees exactly the 3 top tabs, no dropdowns — the row is visibly shorter/sparser than for admin/sysadmin, which is expected and requires no special-casing in CSS (flex row simply has fewer children).
- **Keyboard navigation / accessibility**: covered per-component in §3d (focus-visible gap, now fixed) and §4 (dropdown keyboard behavior relies on Bootstrap defaults, not independently re-implemented — **not verified against a screen reader**, out of scope for a text-only review).
- **Printing/export**: no print stylesheet exists anywhere in the codebase (`grep -rn "@media print"` → **unverified, not run this pass**; flagging as not checked rather than asserting either way).

---

## 12. Verification checklist

| Screen / role | Must look different | Must stay identical |
|---|---|---|
| `pipeline.html`, role=user | Slightly shorter navbar/breadcrumb (§3c); no Admin/Sysadmin dropdowns (unchanged behavior) | `.pb-board-root` must still fill exactly to the footer with no gap or overlap — **the one real visual regression risk of this whole cycle**, since it depends on correctly recomputing §10's constant |
| `pipeline.html`, role=admin | Same trims; Admin dropdown present with "Admin" breadcrumb context available (if dropdown clicked) | Dropdown content/order unchanged |
| `portfolio.html`, any role | Tab label now reads "Project Portfolio", matching the breadcrumb already there | Page content, KPI cards, chart — untouched (OUT of scope) |
| `costgrid.html` | Breadcrumb's last crumb is a real name, not `'…'` (if that page-level fix is taken, see §13) | Everything else — this page's content is OUT of scope |
| `config.html` / `admin.html` / `team.html` / `attribute-lists.html` / `timesheets.html` | Breadcrumb now reads `Home > Admin > <Page>` | Dropdown/tab highlighting unchanged |
| Narrow viewport (admin/sysadmin role, all 5 groups present) | Tabs row scrolls horizontally instead of silently clipping/wrapping | No layout break, no vertical growth of the row |
| Notification panel, long list / long title | Badge color now matches the token system (visually identical red) | Panel width/height, SSE behavior, mark-all-read — unchanged |
| Any modal (Change Password, My Profile, Send Notification) | No visual change expected | Confirm Cycle A's `.modal` theming still applies correctly post-navbar-change (unrelated DOM, but worth a glance) |

---

## 13. Open questions / assumptions

1. **Navbar height discrepancy (§3b)**: my hand-computed 110px vs. CLAUDE.md/the brief's stated 106px. I could not find the source of the 4px difference in the current CSS. Recommend a real-browser measurement before trusting either number for the final `calc()` in §10.
2. **Badge contrast (§8)**: white text on Bootstrap's default danger red computes to 3.95:1 by hand, below AA for normal text, though likely acceptable as "large text" at this size/weight — not fixed in this handoff since it's a project-wide Bootstrap-default question, not navbar-specific. Flagging rather than silently leaving it or silently "fixing" a shared color project-wide from a nav-scoped cycle.
3. **"Project Reporting" → "Project Portfolio" (§2g)**: I picked the name already used twice in breadcrumbs over the name used once as a tab label. This conflicts with a separate, non-binding Design-canvas naming exploration that landed on a *different* final word ("Portfolio" alone). Not reconciling the two in this document — Fabrizio should pick one lineage.
4. **`costgrid.html`/`project-config.html`'s `'…'` breadcrumb crumb (§9)**: replacing it with a real name requires reading page-level Vue data (the selected proposal/project name), which brushes against the brief's OUT-of-scope boundary ("page content and page-specific components"). I've listed it as the correct fix for the audit's Finding 3, but flagging that implementing it means touching those two pages' own breadcrumb-building code, not just `nav.js`/`css`. Recommend confirming this is acceptable before Claude Code touches those two files.
5. **`--breadcrumb-h` (§3b, §10)**: confirmed dead (zero consumers). Not removing it in this cycle (removal is a minor breaking-adjacent cleanup, not a navigation fix) — just not building anything new on top of it either.
6. **Sidebar alternative (§1)**: deliberately not designed in this document. If Fabrizio wants to pursue the audit's icon-rail idea, it needs its own validated mockup in the Design canvas first — happy to build that as a separate, explicit next step rather than as part of this text-only handoff.
7. **Print stylesheet**: not checked this pass (see §11) — stated as not verified rather than assumed absent-and-fine.
8. **`profile-jobs.html`'s borrowed `activeTab`** (§2e): flagged as a pre-existing oddity, not proposing a fix — it's a hidden, unlinked page and "highlighting Timesheets while viewing it" is arguably harmless, but it's not something this document resolves either way.

---

## 14. Mockups / screenshots

No new Design-canvas mockup was built for this cycle's specific proposals (the trims in §3c and the copy/IA fixes in §2 are small enough to be unambiguous from exact values and selectors alone, per the brief's own preference for concreteness over visuals for implementable detail). If Fabrizio wants the sidebar alternative explored (§13, item 6), that would get its own dedicated canvas board before any handoff for it is written, consistent with how Cycle A's style tile was handled.
