# Design spec — Portfolio list view: project card restructure

**Date:** 2026-09-08
**Scenario:** evolution of an existing feature (`portfolio.html`, overview/list view)
**Source brief:** produced inline in this session (feature-brief skill), confirmed by user.

## Problem

The user, as an actual user of the product, never reads the per-project data shown today in the list view's cards (monthly Estimated/Spent/Variance table) — they always click through to the project detail page for real information. The list view should show only genuinely useful identifying data and a single path into detail, cutting everything else.

## Current behavior (cited)

- Project card markup, duplicated for grouped-program children and ungrouped projects (`portfolio.html:114-144` and `:150-181`):
  - Header: title (`fmtProjectTitle`), code, pipeline badge, status badge, `no XLS data` badge (`!cardDataMap[cfg.id].hasData`), budget badge.
  - Action buttons: ⚙️ Configure (`goConfigure`, permission-gated), 🔗 Share (`openShareModal`), 📂 Load Actuals (`triggerLoadActuals`, permission-gated), 📅 Planning (`goPlanningForProject`), 📊 View Report → (`showDashboard`, **disabled when `!hasData`**), and — ungrouped cards only — ＋ Summary (`toggleSummary`).
  - Body: a 3-row table (Budget Estimated / Budget Spent / Variance) × one column per month + Total column + PTC column when `totalPtc > 0` (`portfolio.html:134-141`, `:170-178`).
- `cardDataMap` (`portfolio.html:584-588`) already precomputes, per project, `totalPhasing`, `totalSpent`, `totalVar`, `hasData`, `hasPhasing`, `totalPtc`, `budgetBadgeHtml` — the totals this redesign needs already exist, only the per-month breakdown is being dropped.
- Variance color: `varColor(v)` with `v = Estimated − Spent` → green if positive, red if negative, muted if zero (`portfolio.html:993`). Already in the direction the user wants (spent less than planned = green).
- Detail-view KPI color: `kpiLeftColor(left, total)` (`portfolio.html:1075-1080`) → red if `left < 0`, orange if `left` under 10% of total, **no explicit green** when positive (falls through to default/neutral color).
- Detail view header action row (`portfolio.html:216-224`) already has ⚙️ Configure, 📅 Planning, 🤖 AI Analysis, 🔗 Share — i.e. 3 of the 5 relocating actions already live there today. Only 📂 Load Actuals and ＋ Summary are net-new to this row.
- `cfg.startDate`/`cfg.endDate` (`YYYYMM` strings) already exist and are used elsewhere on this page (`portfolio.html:667-669` etc.) for month-range math — usable for the new "duration" field.
- `monthLabel(ym)` (`portfolio.html:990-992`) formats a `YYYYMM` string as e.g. `"Jan '26"` — reusable for the duration display via `monthLabel(cfg.startDate) + ' – ' + monthLabel(cfg.endDate)`.
- Filtering/sorting (`portfolioSort`, `portfolioClientFilter`, `portfolio.html:44-55`) computes `sortedFilteredProjects` (`:546-552`), from which `visibleProgramGroups` (`:554-577`) and `ungroupedProjects` (`:578-583`) are derived; grouped programs render as their own block before ungrouped projects in the template. This pipeline is unchanged by this redesign.

## Expected behavior

### Card content (both grouped-child and ungrouped cards)

Header, unchanged in kind, reduced in badges:
- Title (`fmtProjectTitle`), code (if present), pipeline badge, status badge.
- Actuals-availability badge: same badge element as today's `no XLS data`, **relabeled** to speak in terms of "actuals" rather than "XLS" (e.g. `No actuals available`) — same condition (`!cardDataMap[cfg.id].hasData`), same visual treatment (`badge bg-warning text-dark`).
- Budget badge (`budgetBadgeHtml`) stays, unchanged.

Body, replacing the monthly table with a compact stats row:
- **Duration**: `monthLabel(cfg.startDate) + ' – ' + monthLabel(cfg.endDate)` (or an em-dash if either is missing).
- **Sold**: `fmtMoney(cardDataMap[cfg.id].totalPhasing)` if `hasPhasing`, else `—`.
- **Spent**: `fmtMoney(cardDataMap[cfg.id].totalSpent)` if `hasData`, else `—`.
- **Variance**: `fmtVar(cardDataMap[cfg.id].totalVar)` if both `hasData && hasPhasing`, else `—`, colored via the existing `varColor()` (no change to that function — it's already correct).

No monthly breakdown, no PTC column, in the card. (PTC remains visible in the project detail page, unaffected by this change.)

Single action:
- One "Open project →" button, **always enabled** (removes the `:disabled="!cardDataMap[cfg.id].hasData"` that gated the old View Report button), calling the same `showDashboard(cfg.id)`.

### Actions relocated to the project detail page

- Add 📂 Load Actuals (`triggerLoadActuals`, same permission gate: `v-if="dashboardProject?.my_permission !== 'viewer'"`) and ＋ Summary/✓ Summary (`toggleSummary`/`isPinnedSummary`) to the existing header action row (`portfolio.html:216-224`), alongside the Configure/Planning/AI Analysis/Share buttons already there.
- None of the relocated actions are gated on `hasData` — they never were (only the old View Report button was); this was already correct, it's simply now reachable because the entry button is unconditional.
- ⚙️ Configure remains **only** in the detail page after this change — not duplicated back onto the list card (per user: "lascerei nella card la scorciatoia... ma non per forza" — decided not to duplicate it, single source of action per screen).

### Layout: two-column grid

- Ungrouped project cards and grouped-program blocks render as siblings of a CSS grid with 2 equal columns (`display:grid; grid-template-columns: 1fr 1fr; gap: <spacing token>`).
- An ungrouped project card occupies 1 grid cell (1 column).
- A program group block (the existing violet-bordered section, header + program summary table, `portfolio.html:81-111`, **unchanged**) spans both columns (`grid-column: 1 / -1`).
- Inside an expanded program group, its child project cards render in their own nested 2-column grid (same `grid-template-columns: 1fr 1fr` pattern, own `gap`), replacing the current single-column `prog-project-list` stack.
- Grid order follows the existing render order exactly — `visibleProgramGroups` first, then `ungroupedProjects` — no reordering logic needed; CSS grid auto-flow handles both the full-width program spans and the surrounding 1-column project cards.
- Odd project counts leave the last cell alone in its row — default grid behavior, no special-case code.
- The Program Summary table content/header (`portfolio.html:81-111`) and the pinned Budget Summary panel (`:58-78`) are **out of scope** — unchanged in content, layout, and position (each still renders as its own full-width block above the grid, as today).

### Variance color consistency (list ↔ detail)

- `kpiLeftColor(left, total)` (`portfolio.html:1075-1080`) gains an explicit green branch for the positive case, matching `varColor()`'s convention: `left > 0` (and not within the existing "near zero" orange threshold) → `var(--color-success)`. Negative and near-threshold branches are unchanged (already correct). This applies to both KPI cards using this function: `⏳ Hours Left` and `💼 Budget Left`.

### Visual/style consistency requirement

This is a hard constraint on implementation, not just a preference: every color, font size, spacing unit, badge style, and button style used in the new card and grid must come from the project's existing design tokens and already-used component classes — **no new colors, font sizes, or one-off styles**. Concretely:
- Colors: `var(--color-success)`, `var(--color-danger)`, `var(--pipeline-*-bg/color)`, `var(--indigo-*)`, `var(--surface-*)`, `var(--text-muted)`, `var(--brand-navy)` etc. from `css/tokens.css` — never hardcoded hex.
- Typography: the existing `--text-xs`/`--text-sm`/`--text-base`/`--text-lg` scale already used throughout this page and `css/style.css` — never a new font size.
- Components: reuse the existing `.section-card`, `.badge`, `.btn btn-sm btn-outline-secondary` / `.btn-primary`, and `statusBadgeLarge()`/`pipelineBadge()` helpers exactly as used elsewhere on this page today — the redesign changes card **content and grid layout**, not the visual language.
- The 2-column grid itself is a new CSS layout, but its internals (badges, buttons, text) draw from the same set of classes and tokens as the rest of the page — visually it should read as "the same design system, less content," not a new design.

## Constraints

- English-only UI text (project-wide convention).
- No build step — Vue 3 via CDN; keep `v-cloak` on the root mount element.
- No hardcoded hex colors anywhere in the new markup (see visual consistency requirement above).

## Acceptance criteria

1. Each project card (grouped-child or ungrouped) shows: title, code (if present), pipeline badge, status badge, an actuals-availability badge relabeled around "actuals" (not "XLS"), duration, total Sold, total Spent, and Variance (colored green/red per `varColor()`) — no per-month table, no PTC column.
2. The card's single entry button is always enabled regardless of `hasData`, and navigates to the same project detail (`showDashboard`) as today's View Report button did.
3. Configure remains only on the detail page; Share, Load Actuals, Planning, and Summary appear only on the detail page's header action row, not on the list card; Load Actuals and Summary are not gated by `hasData`.
4. Ungrouped project cards render in a 2-column CSS grid; a program group block spans both columns and its own children render in a nested 2-column grid; render order matches today's `visibleProgramGroups` → `ungroupedProjects` sequence with no additional reordering logic.
5. Program Summary tables and the pinned Budget Summary panel are visually and functionally unchanged.
6. `kpiLeftColor()` returns `var(--color-success)` for a positive residual (not just neutral), applied to both `Hours Left` and `Budget Left` KPI cards in the detail view; negative/near-threshold behavior is unchanged.
7. No new hardcoded color, font size, or bespoke component style is introduced anywhere in the diff — every visual value traces to an existing token or already-used class.

## Explicitly excluded scope

- Program-group summary tables (`portfolio.html:100-111`) and the pinned Budget Summary panel (`:58-78`) — unchanged.
- Filtering/sorting controls and logic (`portfolioSort`, `portfolioClientFilter`, `sortedFilteredProjects`, `visibleProgramGroups`, `ungroupedProjects`) — unchanged, grid consumes their existing output order as-is.
- Exact internal layout of the detail page beyond adding the two relocated buttons to the existing header action row — no broader detail-page redesign.
- 3-per-row grid density — evaluated visually during brainstorming and rejected in favor of 2-per-row (readability margin on narrower laptop screens).

## Open questions for the implementation plan

None outstanding — all decisions were resolved during brainstorming (visual companion mockups: card layout, program-group nesting, grid density, filter/sort interaction, color/typography consistency).
