# Design foundations (Cycle A) — design

**Date:** 2026-10-02
**Brief:** `docs/superpowers/briefs/2026-10-02-design-foundations-brief.md`
**Source handoff:** `docs/superpowers/design/2026-10-02-foundations-handoff.md` (Claude Design). Its claims were checked against the code on 2026-10-02; corrections are listed in §10.
**Path:** architectural (tokens are an interface every page depends on). First of: A (foundations) → B (navigation) → page-by-page cycles.

## 1. Purpose and success

Give the app one coherent, token-driven visual base so Cycle B and the page cycles can build on it without redoing colors. **Appearance only: no HTML structure change, no logic change, no API/DB change.** Success = no visual regression except the differences listed in §9, every new/changed color meets WCAG AA (measured), and every token the later cycles need exists.

Decisions already taken with the user: `js/core.js` is in scope (status colors only); stage text colors are darkened (backgrounds kept); `.btn-danger`, a ghost/icon button and a branded spinner are added; exact-match literals are replaced in `css/*.css`, in the `<style>` blocks of `login.html`/`activate.html`/`reset-password.html`, and for the burndown chart colors; seven items are out of scope (§11).

## 2. Tokens (`css/tokens.css`)

Names kept; no token removed or renamed.

**Changed values**
| Token | Old | New | Why |
|---|---|---|---|
| `--text-muted` | `#6c757d` | `#6b7280` | the value actually used (53×) for the same role |
| `--border-light` | `#dee2e6` | `#e5e7eb` | same (28× vs 27× literals) |
| `--pipeline-sip-color` | `#4285f4` | `#1a56c4` | AA: 3.11 → 5.78 |
| `--pipeline-expected-color` | `#e6a817` | `#8a5d00` | AA: 1.98 → 5.42 |
| `--pipeline-anticipated-color` | `#ef6c00` | `#a34700` | AA: 2.81 → 5.54 |
| `--pipeline-canceled-color` | `#757575` | `#6b6b6b` | AA: 4.23 → 4.89 |

Backgrounds of all five stages and `--pipeline-committed-color` (4.56) are unchanged.

**New tokens**
- Brand actions: `--brand-magenta-hover: #d01f6a`, `--brand-magenta-active: #b81860`.
- Semantic text-on-tint: `--color-success-text: #0f5132`, `--color-danger-text: #842029`, `--color-info-text: #055160`.
- `--focus-ring: rgba(240,40,122,.12)` (shadow colour; the focus border stays `--brand-magenta`).
- Danger action: `--color-danger-hover: #bb2d3b`, `--color-danger-active: #a52834` (white text on hover 5.91).
- Typography: `--font-family-base: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`; `--weight-regular/medium/semibold/bold` = 400/500/600/700; `--leading-tight/base/relaxed` = 1.3/1.5/1.6.
- `--z-tooltip: 800`.
- Project status: `--status-not-started-bg: #6b7280`, `--status-started-bg: var(--color-success)`, `--status-at-risk-bg: var(--color-danger)`, `--status-on-hold-bg: #b45309`, `--status-completed-bg: var(--brand-navy)`, and a shared `--status-text: #ffffff` (one text colour for all five). Contrast with white: 4.83 / 4.53 / 4.53 / 5.02 / navy (high).
- Chart: `--chart-actual: var(--kpi-blue)`, `--chart-committed: var(--pipeline-committed-color)`, `--chart-phasing: #FF6F00` (value unchanged, chart-only concept).

`?v=7` → `?v=8` on every page that links `tokens.css` (the file *is* versioned; the CLAUDE.md "exempt" note is wrong and is corrected in `/sync-docs`).

## 3. Status badges (`js/core.js`, `?v=9` → `?v=10`)

`statusBadge()` (core.js:265) and `statusBadgeLarge()` (core.js:274) map each status to `background:var(--status-<x>-bg);color:var(--status-text)`. Nothing else in either function changes (sizes, padding, `esc()`, fallbacks keep their values; the fallback for an unknown status uses the not-started token). Visible effects: "Put on hold" text is white instead of black in `statusBadge`; "Not started yet" is darker in both; the large and small badge now agree.

## 4. Burndown chart (`portfolio.html`)

Chart.js does not resolve `var()`. Add one small function in `portfolio.html`'s own script, `chartColor(name)` → `getComputedStyle(document.documentElement).getPropertyValue(name).trim()`, called while the chart config is built (portfolio.html:1146–1161): `#0d6efd` → `--chart-actual`, `#2E7D32` → `--chart-committed`, `#FF6F00` → `--chart-phasing`, and the dataset fallback `'var(--text-disabled)'` (which Chart.js cannot resolve today) → `chartColor('--text-disabled')`. The translucent fill `rgba(13,110,253,0.07)` stays as is (alpha variant of a token; no token form exists). The helper is page-local, not a shared lib, because only this page needs it (YAGNI).

## 5. Components (`css/style.css`, `?v=14` → `?v=15`)

Pattern: extend Bootstrap through `--bs-*` custom properties; never replace classes. Global overrides live in `style.css`; `admin-crud.css` stays scoped.
- `.btn-primary` / `.btn-outline-primary`: hover/active use the new tokens (replaces the literals at style.css:201–204, 213–214); `:focus-visible` gets `box-shadow: 0 0 0 3px var(--focus-ring)`.
- **New** `.btn-danger` (bg `--color-danger`, hover/active tokens above, same focus ring); **new** `.btn-ghost` (transparent, `--text-secondary` text, `--surface-subtle` hover) and `.btn-icon` (square, ghost-style, icon-only, `aria-label` required by the page author); **new** spinner colour (`.spinner-border` → `--bs-spinner-*` = `--brand-magenta`).
- All five new/updated button kinds define default / hover / active / focus-visible / disabled (`opacity:.65`, as today).
- `.alert-success/-danger/-warning/-info`: `--bs-alert-bg/-color/-border-color` from `--color-*-bg` / `-text` tokens. `.dropdown-menu`: border/shadow/radius from `--border-light` / `--shadow-md` / `--radius-md`. `.modal-content`: radius/shadow from tokens.
- Body font: `font-family: var(--font-family-base)` in `style.css` (line 7) and `admin-crud.css` (line 4). The monospace stack at style.css:182 is untouched.
- `.pp-tooltip` z-index → `var(--z-tooltip)`; the local `--z-*` and Bootstrap's z-index scales are not renumbered into each other.
- `admin-crud.css` (`?v=1` → `?v=2`, 5 pages): `.card` border/shadow literals → `--border-light` / `--shadow-sm`; `.table thead th` colour literal → `var(--text-muted)`; hover literal at line 20 → `var(--brand-magenta-hover)`.

## 6. Public pages

`login.html`, `activate.html`, `reset-password.html` load only `tokens.css`; their `<style>` blocks replace `#d01f6a` with `var(--brand-magenta-hover)`. They are covered by the `tokens.css` bump. The `.html` files themselves are not versioned (known CLAUDE.md hazard): a browser with a cached page keeps the old literal until reload; the result is the old hover colour, which is harmless.

## 7. Exact-match replacement rule

In the files of §5–6, any literal whose value equals an existing or new token is replaced by that token (`#1a1a2e` → `--text-primary`, `#0B1840` / `#F0287A` → brand tokens, `#198754` / `#dc3545` → semantic tokens, `#166534` stays as is unless a token already exists). Literals with no exact token are **not** touched. A task in the plan produces the remaining-literals inventory (file, count, proposed token or "defer") as a report appendix; no inventing of one-off tokens. The ~800 literals in other pages (`config.html`, `planning.html`, `costgrid.html`, inline `style=""` in JS templates) are deferred to the page cycles.

## 8. Invariants (must not change)

`.nav-main-tab { height:44px }` (style.css:68), `.pb-board-root { height: calc(100vh - 206px) }` (style.css:312), `.app-footer { height:100px }`, `.gantt-label-col` fixed width + sticky, `#teamAssistantPanel { right:-960px }` with its width/border. The comment at style.css:79 mentions `#pbColumnsContainer`, which no longer exists (CLAUDE.md "Pipeline board layout" is the current truth); the comment is corrected in passing. No token change in this cycle touches padding/line-height of these elements.

## 9. Verification and expected visual differences

Visual diff, manual, one screen per type, before/after (main stack vs `scripts/test-branch.sh`): `login`, `pipeline` (board + detail panel), `portfolio` (list + burndown), `config`, `team` / `attribute-lists`, `planning`, a confirm modal, a page with `.alert`.

Expected differences only: (a) the three stage text colours (and Canceled) darker in pipeline badges, cards and the board; (b) status badges: not-started darker, on-hold darker orange with white text, small and large badges consistent; (c) muted text and light borders a hair different (`#6c757d`→`#6b7280`, `#dee2e6`→`#e5e7eb`, imperceptible); (d) button focus ring and hover now token-driven; (e) alerts/dropdowns/modals colours slightly shifted to the token palette; (f) spinner magenta. Anything else is a regression.

Automated: `npm test` passes; a vitest file `js/lib/tokens.test.js` parses `css/tokens.css` and asserts (1) every token named in §2 exists, (2) the WCAG ratios of the stage and status pairs are ≥ 4.5 (contrast helper in the test only; no runtime code), (3) no old token name has disappeared (compared with a snapshot list of the previous names). Contrast results are copied into the cycle report.

## 10. Corrections to the handoff (found by checking the code)

- `--brand-mid` / `--brand-dark` are **used** (`costgrid.html:281–296`); only `--brand-gold` has no consumer. Nothing is removed.
- `tokens.css` **is** versioned (`?v=7`); the CLAUDE.md "exempt" statement is outdated.
- `#d01f6a` also appears in the inline `<style>` of three public pages and in `admin-crud.css:20`, not only in `style.css`.
- Contrast figures were wrong: Expected 1.98 (not 2.3), Anticipated 2.81 (not 3.9), Canceled 4.23 (fails, not passes). The proposed `--status-not-started` (`#9ca3af` + white, 2.54) and `--status-on-hold` (`#d97706` + white, 3.19) failed AA and are replaced above.
- `.btn-danger` and a ghost button do not exist (confirmed).
- The `#pbColumnsContainer` dependency cited in handoff §7 is obsolete; the 44px / 206px / 100px values stay as invariants anyway.

## 11. Out of scope (confirmed)

Navbar/footer and dropdowns (Cycle B); any HTML structure change; dark mode and responsive breakpoints; link colour (Bootstrap blue stays); removing `--brand-mid/-dark/-gold`; page-specific one-off hex values and the exact-match literals inside other pages' HTML (deferred, inventoried); recolouring `.badge-st-active/-inactive`.

## 12. Known gaps accepted (not fixed here)

- White text on `--brand-magenta` buttons is 3.97:1, below AA for normal-size text. The brand colour is unchanged by decision (Brief constraint); recorded for the page cycles / a brand decision.
- Checkbox/radio inputs stay raw Bootstrap (not customised today).
- Stage badge colours inside JS-built inline styles keep their current mechanism (they already use `var(--pipeline-*)`, so they follow the token change automatically).

## 13. Process

Own worktree and branch; the plan is executed inline or via subagents per `docs/superpowers/PROCESS.md`; closed by `/finish-cycle`. No Docker lifecycle operation on the main stack is needed (frontend only; branch stack via `scripts/test-branch.sh` for the visual check). `/sync-docs` updates CLAUDE.md (`tokens.css` versioning, new tokens, `style.css` / `admin-crud.css` / `core.js` versions) and `docs/js/core.md` / `docs/pages/portfolio.md` as routed.
