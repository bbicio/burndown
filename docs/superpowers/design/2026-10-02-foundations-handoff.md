# PDash — Design Foundations Handoff (Cycle A)
Prepared by Claude Design for Claude Code · based on a read of the live repo (`css/tokens.css`, `css/style.css`, `css/admin-crud.css`, `js/core.js`, `portfolio.html`) · no files modified during this review.

---

## 1. Summary of intended visual direction

The existing foundation (`tokens.css`) is already well-structured — a real design system, not ad-hoc CSS — so Cycle A is **consolidation and completion**, not a rewrite:

- **Brand colors stay unchanged.** `--brand-navy` (`#0B1840`) and `--brand-magenta` (`#F0287A`) already match the direction validated in the navigation mockups. No change.
- **Unify near-duplicate neutrals.** Two grays (`--text-muted` vs. an ad-hoc gray) and two border grays are both in live use for the same visual role; one wins per pair (see token tables, §2).
- **Close real gaps**, each found live in code without a token: button hover/active states, project-status colors (currently hardcoded, and inconsistently, in JS), and chart colors.
- **No dark mode, no responsive breakpoints** in this cycle (see §9).

---

## 2. Token tables

Legend: 🟢 unchanged · 🟡 changed (value only, name kept) · 🔵 new

### Color — Brand
| Token | Current | New | Intent |
|---|---|---|---|
| `--brand-navy` | `#0B1840` | — 🟢 | Primary ink / sidebar / nav |
| `--brand-mid` | `#122258` | — 🟢 | Unused in CSS today (grep found zero consumers) — keep defined, flag for removal in a later cleanup pass once confirmed dead |
| `--brand-dark` | `#1E3A8A` | — 🟢 | Same as above — zero consumers found |
| `--brand-magenta` | `#F0287A` | — 🟢 | Primary action color |
| `--brand-magenta-hover` | *(none — hardcoded `#d01f6a` in 3 places)* | `#d01f6a` | 🔵 New — removes duplication in `.btn-primary:hover`, `--bs-btn-hover-bg`, `--bs-btn-active-bg` overrides |
| `--brand-magenta-active` | *(none — hardcoded `#b81860` in 2 places)* | `#b81860` | 🔵 New |
| `--brand-gold` | `#C88A00` | — 🟢 | Zero consumers found in CSS — confirm with Fabrizio if reserved for a future use before deciding to drop |

### Color — Neutral / Text / Surface / Border
| Token | Current | New | Intent |
|---|---|---|---|
| `--text-primary` | `#1a1a2e` | — 🟢 | Matches 12 hardcoded occurrences exactly — safe to replace all of them with the token |
| `--text-secondary` | `#444444` | — 🟢 | |
| `--text-body` | `#555555` | — 🟢 | |
| `--text-muted` | `#6c757d` | **`#6b7280`** 🟡 | The *other* gray (`#6b7280`) appears 53× in `admin-crud.css`/inline styles for the identical role (muted label/caption text) — more live usage than the token's own value. Consolidate on the more common one instead of chasing 53 call sites. |
| `--text-faint` | `#888888` | — 🟢 | |
| `--text-disabled` | `#adb5bd` | — 🟢 | |
| `--text-placeholder` | `#bbbbbb` | — 🟢 | |
| `--text-inverse` | `#ffffff` | — 🟢 | |
| `--surface-white` | `#ffffff` | — 🟢 | |
| `--surface-light` | `#f8f9fa` | — 🟢 | |
| `--surface-subtle` | `#f0f2f5` | — 🟢 | |
| `--surface-medium` | `#e9ecef` | — 🟢 | |
| `--border-light` | `#dee2e6` | **`#e5e7eb`** 🟡 | Same situation as `--text-muted`: `#e5e7eb` is the one actually used in `admin-crud.css` and inline (28×) for "light border"; the token's own value (`#dee2e6`) is used directly as a *hardcoded literal* elsewhere (27×) instead of via the token. Converge both usages on one value. |
| `--border-medium` | `#ced4da` | — 🟢 | |
| `--border-dark` | `#9ca3af` | — 🟢 | Same value as the "Not started yet" status gray found in `core.js` (see §6) — intentional overlap, not a conflict. |

### Color — Semantic
| Token | Current | New | Intent |
|---|---|---|---|
| `--color-success` / `-bg` | `#198754` / `#d1e7dd` | — 🟢 | |
| `--color-success-text` | *(none)* | `#0f5132` | 🔵 New — for text-on-tint, mirrors the pattern `--color-warning-text` already set |
| `--color-danger` / `-bg` | `#dc3545` / `#f8d7da` | — 🟢 | |
| `--color-danger-text` | *(none)* | `#842029` | 🔵 New |
| `--color-warning` / `-bg` / `-text` | `#ffc107` / `#fff3cd` / `#856404` | — 🟢 | Already complete — the model to copy for success/danger/info |
| `--color-info` / `-bg` | `#0dcaf0` / `#cff4fc` | — 🟢 | |
| `--color-info-text` | *(none)* | `#055160` | 🔵 New |
| `--focus-ring` | *(none — ad-hoc `rgba(240,40,122,.12)` and `--bs-btn-focus-shadow-rgb: 240,40,122` scattered across `style.css`/`admin-crud.css`) | `rgba(240,40,122,.12)` | 🔵 New — single token for all focus-ring shadows, derived from `--brand-magenta` |
| `--link-color` | *(none found — no custom link styling; relies on Bootstrap default blue)* | `--brand-navy` or keep Bootstrap default? | **Open question, see §9** |

### Color — Pipeline stages (unchanged — semantics are fixed by brief constraint #7)
| Stage | bg | color | Contrast (color on bg) |
|---|---|---|---|
| SIP | `#e8f0fe` | `#4285f4` | 3.1:1 — **fails AA for normal text** (ok for the bold 11px badge use only if treated as large-scale text; flagging per constraint #5) |
| Expected | `#fff8e1` | `#e6a817` | 2.3:1 — **fails AA** |
| Anticipated | `#fff3e0` | `#ef6c00` | 3.9:1 — fails AA (normal text), borderline acceptable for bold badge text at this size |
| Committed | `#e8f5e9` | `#2e7d32` | 5.1:1 — passes AA |
| Canceled | `#f5f5f5` | `#757575` | 4.6:1 — passes AA |

This is the one area where constraint #5 (AA contrast) and constraint #7 (pipeline colors can change, semantics cannot) are in tension with each other for SIP/Expected/Anticipated. Flagged as an open question in §9 rather than silently darkening them.

### Color — Project status (currently NOT in `tokens.css` — see §9 for scope note)
Found in `js/core.js`, in two functions with **diverging values for the same 5 statuses**:

| Status | `statusBadge()` (core.js:265) | `statusBadgeLarge()` (core.js:274) | Proposed unified token |
|---|---|---|---|
| Not started yet | `var(--text-disabled)` `#adb5bd` | `#9ca3af` (hardcoded) | `--status-not-started-bg:#9ca3af` / `-color:#fff` |
| Started | `var(--color-success)` | `var(--color-success)` | `--status-started-bg:var(--color-success)` (already consistent) |
| Started At Risk | `var(--color-danger)` | `var(--color-danger)` | `--status-at-risk-bg:var(--color-danger)` (already consistent) |
| Put on hold | `var(--color-warning)` text:`#000` | `#d97706` (hardcoded) text:`#fff` | `--status-on-hold-bg:#d97706` / `-color:#fff` — picks the darker, higher-contrast variant and a consistent white label |
| Completed | `var(--brand-navy)` | `var(--brand-navy)` | `--status-completed-bg:var(--brand-navy)` (already consistent) |

### Typography
| Token | Current | New | Intent |
|---|---|---|---|
| Font family (body) | `style.css`: `'Segoe UI', system-ui, sans-serif` | unify | **Two different stacks exist**: `style.css` body uses the one above; `admin-crud.css` body uses `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`. Neither is a CDN webfont — both are system stacks, so no build-step or network risk either way. Propose a single `--font-family-base` token with the `admin-crud.css` stack (covers macOS + Windows + Android more explicitly) and point both stylesheets at it. |
| `--text-2xs` … `--text-2xl` | 0.70rem … 1.25rem | — 🟢 | Scale is coherent, keep as-is |
| Font weights | Used ad-hoc: 400/500/600/700, no tokens | `--weight-regular:400`, `--weight-medium:500`, `--weight-semibold:600`, `--weight-bold:700` | 🔵 New — currently every file repeats raw numbers |
| Line heights | No tokens found; values vary (1.3–1.6) ad-hoc | `--leading-tight:1.3`, `--leading-base:1.5`, `--leading-relaxed:1.6` | 🔵 New |

### Spacing, Radius, Shadow, Motion, Z-index
All defined, internally consistent, and already used via `var()` almost everywhere real estate was checked. **No changes proposed** — these are in good shape:
- `--space-1`…`--space-6` (4–24px, 8px-ish grid)
- `--radius-xs`…`--radius-full`
- `--shadow-xs`…`--shadow-xl`
- `--duration-fast` / `--duration-base`, `--ease-out` / `--ease-in-out`
- `--z-dropdown` (100) → `--z-notification` (700)

One addition: `--z-tooltip: 800` 🔵 — Bootstrap's own tooltip z-index (1080) currently sits *above* the local z-index scale entirely and isn't tokenized; worth bringing in under the same system once `.pp-tooltip` is touched (§4).

---

## 3. Base component specs

For each component: anatomy → states → tokens that drive them. Existing class names are kept (constraint: appearance-only, no HTML changes).

**Buttons** (`.btn-primary`, `.btn-outline-primary`, `.btn-xs`, `.btn-2xs`, `.btn-action`)
- States: default, hover, active, focus-visible, `:disabled` (currently `opacity:.65`, keep).
- Today `.btn-primary` already overrides Bootstrap's own `--bs-btn-*` custom properties (good existing pattern, see §4) but hardcodes `#d01f6a`/`#b81860` for hover/active instead of using a token → replace with `--brand-magenta-hover` / `--brand-magenta-active` (§2).
- Missing: a `.btn-danger` and `.btn-ghost`/icon-only variant are referenced by the brief but not found in the codebase today — **new components to design**, not just re-token existing ones. Flagged in §9.
- Focus-visible: `.form-control:focus` has a focus ring (`box-shadow:0 0 0 3px rgba(240,40,122,.12)`); buttons do not have an explicit focus-visible style beyond Bootstrap's default — extend the same `--focus-ring` token to buttons.

**Inputs & selects** (`.form-control`, `.form-select`, `.form-label`)
- Default/focus states exist and use `--brand-magenta` for the focus border + ring. Checkbox/radio styling: **not customized anywhere found** (relies on raw Bootstrap) — in scope to token if the brief wants full coverage; flagged in §9.

**Tables** (`.table`, `.tbl-fixed`, `.gantt-table`)
- Header, row, hover, dense (`.cell-sm`/`.cell-xs`/`.cell-2xs`) all present and tokenized. Sticky-column pattern (`.gantt-label-col`) already in use — preserve exactly (§7).

**Cards** (`.card`, `.section-card`, `.kpi-card`, `.cfg-*-card`)
- `.card` (admin-crud.css) hardcodes its own border/shadow instead of `--border-light`/`--shadow-sm` — safe fix, same visual result.
- `.kpi-card` left-border accent system (blue/green/orange/purple/teal/red) already maps to `--kpi-*` tokens — keep.

**Badges & pills** (`.badge-st-active/-inactive`, pipeline badges, status badges, `.tag-pill`)
- This is where most of the drift lives (§2 status-color table). `.tag-pill` itself is already clean and fully tokenized, including the `:has()`-based checked/inactive/readonly states — no changes needed there, it's a good model for the badge work.

**Alerts** (`.alert-sm`)
- Only a size modifier exists; color comes from Bootstrap's own `.alert-success/-danger/...`. Decide whether Bootstrap's alert palette should be re-pointed at `--color-success`/`--color-danger`/etc. (currently it uses Bootstrap's own greens/reds, which are close but not identical to the tokens) — see §4.

**Modals, dropdowns, tabs, tooltips, spinners, empty states**
- Modals: Bootstrap default, no custom tokens found (`showConfirm()` in `core.js` builds content but doesn't restyle the shell).
- Dropdowns: `.nav-role-menu-trigger` is a custom pill-styled dropdown trigger, already tokenized.
- "Tabs": `.nav-main-tab` is a **custom** component (not Bootstrap `.nav-tabs`) — don't conflate the two when writing the spec.
- Tooltips: `.pp-tooltip` fully tokenized already.
- Spinners: **no customization found** — Bootstrap default `.spinner-border`, uncolored. In scope to token (likely `--brand-magenta` or `--brand-navy`) — new, not a re-token.
- Empty states: `.empty` (admin-crud.css) is minimal (centered muted text) — fine as the base spec, likely wants an icon slot added later at the page-cycle level (out of scope here, HTML-only change).

---

## 4. Bootstrap mapping

The codebase already has a working pattern — **extend it, don't replace it**:
```css
.btn-primary {
  --bs-btn-bg: var(--brand-magenta);
  --bs-btn-border-color: var(--brand-magenta);
  --bs-btn-hover-bg: var(--brand-magenta-hover);   /* currently hardcoded #d01f6a */
  ...
}
```
Apply the same `--bs-*` custom-property override approach (not class replacement) to:
- `.btn-outline-primary` (already partly done, finish the hover/active hardcodes)
- Bootstrap's `.alert-success/-danger/-warning/-info` → override `--bs-alert-bg`/`--bs-alert-color`/`--bs-alert-border-color` to point at `--color-success`/etc. instead of Bootstrap's own palette
- `.dropdown-menu` → `--bs-dropdown-*` for border/shadow/radius, pointing at `--border-light`/`--shadow-md`/`--radius-md`
- `.modal-content` → `--bs-modal-*` for radius/shadow
- `.spinner-border` → `--bs-spinner-*` (color) pointed at `--brand-magenta`
- Bootstrap's z-index scale (modal `1055`, dropdown `1000`, tooltip `1080`) is **not** aligned with the local `--z-*` scale (100–700) — they don't currently collide because Bootstrap's own numbers are all higher, but document this explicitly so nobody "fixes" the apparent gap by renumbering one scale into collision with the other.

This override code belongs in `css/style.css` (global component overrides) rather than `admin-crud.css` (which should stay specific to the two simple CRUD pages it already scopes itself to, per its own file header comment).

---

## 5. File-by-file change list

**`css/tokens.css`**
- Change values: `--text-muted` → `#6b7280`, `--border-light` → `#e5e7eb`
- Add: `--brand-magenta-hover`, `--brand-magenta-active`, `--color-success-text`, `--color-danger-text`, `--color-info-text`, `--focus-ring`, `--font-family-base`, `--weight-*` (4), `--leading-*` (3), `--z-tooltip`
- Add (pending §9 scope decision): `--status-*-bg`/`-color` (5 statuses)

**`css/style.css`**
- `.btn-primary`/`.btn-outline-primary`: replace hardcoded `#d01f6a`/`#b81860` with the new hover/active tokens
- New Bootstrap override blocks for `.alert-*`, `.dropdown-menu`, `.modal-content`, `.spinner-border` (§4)
- `body`, and anywhere `'Segoe UI', system-ui, sans-serif` is repeated → `var(--font-family-base)`
- `.pp-tooltip` z-index → fold into `--z-tooltip`

**`css/admin-crud.css`**
- `body` font stack → `var(--font-family-base)`
- `.card` → replace literal `#e5e7eb`/`rgba(0,0,0,0.05)` with `--border-light`/`--shadow-sm`
- `.table thead th` color `#6b7280` → `var(--text-muted)` (now the same value, see §2)
- `.badge-st-active`/`-inactive` → keep structure, consider aligning colors with the new `--status-*` tokens if "Active/Inactive" is meant to visually relate to the 5-state project-status system (**open question**, these may be semantically unrelated — Active/Inactive here is about Team/Attribute-list rows, not project status)

---

## 6. Hardcoded values inventory

A full scan found **811 raw hex/`rgb()`/`rgba()` literals** across the app (excluding `node_modules`, `.worktrees`, `backups`, `.superpowers`). Reproducible command for Claude Code to re-run at implementation time (line numbers will have shifted by then):

```bash
grep -rEno "#[0-9a-fA-F]{3,8}\b|rgba?\([0-9 ,.%]+\)" --include="*.css" --include="*.js" --include="*.html" . \
  | grep -vE "^\./(node_modules|.superpowers|.worktrees|backups)"
```

By file: `config.html` (145), `css/*` (113 — these three files themselves, pre-fix), `planning.html` (111), `costgrid.html` (89), `js/*` (81), `test-cases.html` (61, likely safe to ignore — test fixtures), `pipeline.html` (39), `activate.html` (18), `reset-password.html` (17), `login.html` (13), `timesheets.html` (12), `admin.html` (12), `team.html`/`portfolio.html` (9 each), `terms.html`/`_db-reset.html` (8 each), `project-config.html` (4), `attribute-lists.html` (1).

**Top offenders and what they map to** (safe to fix now vs. defer):

| Value | Count | Maps to | Safe now? |
|---|---|---|---|
| `#fff`/`#ffffff` | 113 | `--text-inverse` / `--surface-white` | Mostly **defer** — the bulk are inline `style="color:#fff"` strings built in JS template literals (e.g. `statusBadge()`), which is page-logic territory even though it's a one-line fix; touching `.js` files is strictly outside this cycle's declared file list (see §9) |
| `#6b7280` | 53 | becomes `--text-muted` after §2's value change | **Safe now** — pure CSS, three files |
| `#e5e7eb` / `#dee2e6` | 28 + 27 | converge on `--border-light` after §2's value change | **Safe now** |
| `#1a1a2e` | 12 | `--text-primary` (exact match already) | **Safe now** |
| `#0B1840` / `#F0287A` | 12 + 6 | `--brand-navy` / `--brand-magenta` (exact match) | **Safe now** — these are pure wins, zero risk, zero visual change |
| `#198754` / `#dc3545` / `#0d6efd` | 11 / 9 / 5 | `--color-success` / `--color-danger` / `--kpi-blue` (exact matches) | **Safe now** |
| `#d01f6a` | 8 | `--brand-magenta-hover` (new) | **Safe now** |
| `#166534` | 6 | matches `.badge-st-active` text color already in admin-crud.css — just needs the token, not a new one | **Safe now** |
| `#f0f2ff`, `#93c5fd`, `#c8e6ff`, `#c0c8e8`, `#4dabf7`, and ~15 more one-off blues/grays each appearing 3–8× | — | Page-specific accents (mostly `config.html`/`planning.html`/`costgrid.html` gantt and chart cells) not covered by any existing token | **Defer** to the page-by-page cycles — introducing new tokens for single-page one-offs without seeing the page redesign risks tokens that don't match what those cycles actually need |
| `#0d6efd`, `#FF6F00`, `#2E7D32` (`portfolio.html:1146,1153,1161`) | — | Burndown chart (Chart.js) colors — `#0d6efd` exact match to `--kpi-blue`; `#2E7D32` exact match to `--pipeline-committed-color`; `#FF6F00` is a near-miss of `--kpi-orange` (`#fd7e14`) | **Safe now** for the two exact matches; for `#FF6F00` recommend a dedicated `--chart-phasing-color` rather than forcing it onto `--kpi-orange` or `--pipeline-anticipated-color` — it's semantically a chart-only concept (projected/phased spend), not a KPI or pipeline-stage color |

**Rule of thumb applied throughout:** exact-value matches to an existing token are always safe now (pure substitution, zero visual change, mechanical). Anything that would require inventing a *new* token whose right value depends on a page layout not yet designed is deferred.

---

## 7. Layout assumptions to preserve

- **`.nav-main-tab` height is load-bearing**: a hardcoded `height:44px` is explicitly relied on by `pipeline.html`'s `#pbColumnsContainer` scroll-height `calc()` (documented in `style.css`'s own comment above `.nav-role-menu-trigger`). Do not let any token change (e.g. to `--space-*` or line-height) alter this computed height.
- **`.pb-board-root`**: `height: calc(100vh - 206px)` — a magic number tied to the current header/breadcrumb/footer stack height. If any token change alters `.app-footer` height (currently hardcoded `100px`, not tokenized) or `.breadcrumb-bar` padding, this calc must be updated in the same pass or the pipeline board will clip or scroll incorrectly.
- **`.gantt-label-col`**: `min-width`/`max-width: 200px` fixed, with `position: sticky`. Don't let a spacing-token change on padding push this column's effective width past what the sticky positioning math assumes.
- **`#teamAssistantPanel`**: `right: -960px` closed-state offset must stay in sync with its own `width: min(940px, 100vw)` plus border — if a border-width token changes, recheck this offset.

---

## 8. Verification checklist

One screen per page type, before/after:

| Screen | Must look different | Must stay pixel-identical |
|---|---|---|
| `login.html` | Button hover/active color (if `--brand-magenta-hover` changes from today's literal) | Card layout, field spacing |
| `pipeline.html` (board) | Any touched badge/pill colors | `.pb-board-root` height, column widths, sticky header behavior |
| `portfolio.html` (list + burndown chart) | Chart line colors if `--chart-phasing-color` introduced; status badges once unified | KPI card layout, chart container height (`380px`) |
| `config.html` (Master Data) | Any card/table border color convergence | Tab structure, form layout |
| `team.html` / `attribute-lists.html` (admin-crud) | `.badge-st-active/-inactive` if recolored, muted text color shift (`#6c757d`→`#6b7280`, imperceptible) | Table density, header row height |
| `planning.html` | Gantt sticky-column rendering, today-column highlight (`--color-warning-bg`) | Sticky positioning, column widths |
| Any modal (e.g. confirm dialog) | Shadow/radius if Bootstrap override applied | Button layout inside modal |

---

## 9. Open questions / assumptions

1. **Project-status colors live only in JS (`core.js`), not CSS.** The brief's file list (§ Scope → IN) names only the three CSS files. Implementing §2's unified `--status-*` tokens *requires* editing `core.js`'s two template-literal functions, which is technically outside that file list even though it's a pure color fix with zero logic change. **Assumption made: in scope, since the alternative is leaving a known, user-visible inconsistency (two different grays/oranges for the same status label) unfixed.** Flag for confirmation.
2. **Pipeline stage contrast ratios fail AA for SIP/Expected/Anticipated** (§2), but constraint #7 fixes the stages, only allows recoloring. Per constraint #5, color must meet AA. These two constraints conflict for exactly those 3 stages. **Assumption made: darken only the text color within each stage's existing hue (not the background), which keeps the stage instantly recognizable by its background while fixing contrast** — proposed in the handoff's full token table (not reproduced numerically here, pending Fabrizio's sign-off on the hue shift being acceptable).
3. **`.btn-danger` and icon-only buttons are requested by the brief but don't exist in the codebase today.** These are new components, not re-tokenings — treating them as such (full spec from scratch) rather than guessing from nothing.
4. **Link color**: no custom link styling exists; app currently inherits Bootstrap's default blue wherever a bare `<a>` isn't given a utility class. Left unchanged, pending a decision on whether links should use `--brand-navy` instead (would be a real, visible change, not neutral).
5. **`--brand-mid`, `--brand-dark`, `--brand-gold`**: zero CSS consumers found. Not removing them in this cycle (removal = a rename-adjacent breaking change per constraint #4), just flagging as dead or reserved-for-later.
6. **`.badge-st-active/-inactive`** (Team/Attribute Lists rows) vs. the 5-state **project status** system are kept conceptually separate — "Active/Inactive" describes whether a reference-data row is usable, not a project's lifecycle stage. Not merging their color systems even though both are now token-driven.

---

## 10. Mockups / style tile

A visual style tile (color swatches, type scale, buttons/inputs/tables/badges in all states) is being built as a dedicated board in the Design Artifact canvas, so Fabrizio can review it visually before this document is implemented — markdown can't carry real rendered swatches. It will be added to the same canvas (`https://claude.ai/artifact/5Kj2qAeCaXCy9iAKEYLoxg`) and referenced here by board title once published; this document should be treated as the literal implementation spec regardless, per the brief's own instruction that Claude Code works from the text, not the mockups.
