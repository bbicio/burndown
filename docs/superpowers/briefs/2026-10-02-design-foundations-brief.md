# Brief — Design foundations (Cycle A)

**Scenario:** 1 (new feature), as classified by the user.
**Source:** `docs/superpowers/design/2026-10-02-foundations-handoff.md` (Claude Design). The handoff's claims about the current code were NOT re-verified when writing this Brief; `/brainstorming` must verify them (see Open questions).
**Position in the redesign:** first of a sequence — Cycle A (foundations) → Cycle B (navigation) → page-by-page cycles. Cycle B and later cycles consume the tokens defined here.

## Expected behavior

The app's visual foundations are consolidated and completed. Appearance changes only; no HTML structure changes.

1. **Token changes in `css/tokens.css`**
   - Changed values (names kept): `--text-muted` → `#6b7280`, `--border-light` → `#e5e7eb`.
   - New tokens: `--brand-magenta-hover` (`#d01f6a`), `--brand-magenta-active` (`#b81860`), `--color-success-text` (`#0f5132`), `--color-danger-text` (`#842029`), `--color-info-text` (`#055160`), `--focus-ring` (`rgba(240,40,122,.12)`), `--font-family-base`, `--weight-regular/medium/semibold/bold` (400/500/600/700), `--leading-tight/base/relaxed` (1.3/1.5/1.6), `--z-tooltip` (800).
   - New project-status tokens `--status-{not-started,started,at-risk,on-hold,completed}-bg` / `-color`, unifying the two diverging implementations in `js/core.js`.
   - New chart token for the burndown phasing line (`--chart-phasing-color`).
   - All other existing tokens (brand, spacing, radius, shadow, motion, z-index, type scale, pipeline backgrounds) unchanged in name and value.
2. **Pipeline stage text colors** for SIP, Expected and Anticipated are darkened within their hue to meet WCAG AA; backgrounds and stage semantics unchanged. Exact values decided in `/brainstorming`.
3. **Single font stack** via `--font-family-base`, used by `style.css` and `admin-crud.css` (today two different system stacks).
4. **Base component styling driven by tokens**, extending the existing `--bs-*` custom-property override pattern (no class replacement):
   - `.btn-primary` / `.btn-outline-primary`: hover/active via the new tokens; visible focus state via `--focus-ring`.
   - `.alert-success/-danger/-warning/-info`, `.dropdown-menu`, `.modal-content`, `.spinner-border`: overridden through `--bs-*` variables pointing at project tokens.
   - `.card` (admin-crud): literal border/shadow replaced by `--border-light` / `--shadow-sm`.
5. **New components** (do not exist today): `.btn-danger`, a ghost/icon-only button, and a branded spinner color, each with default/hover/active/focus/disabled states.
6. **`js/core.js`**: `statusBadge()` and `statusBadgeLarge()` use the unified `--status-*` tokens. Color values only, no logic change.
7. **Hardcoded values:** every exact-match literal (value identical to an existing or new token) in the CSS files, and the two exact-match chart colors in `portfolio.html` (`#0d6efd`, `#2E7D32`), is replaced by its token with zero visual change. The `#FF6F00` phasing color uses `--chart-phasing-color`.
8. **Inventory deliverable:** the remaining hardcoded values that are not replaced here are listed (file, count, proposed token or "defer"), as input for the page cycles.

## Constraints

- No build step: plain CSS custom properties, Vue 3 via CDN, Bootstrap stays and is extended through tokens and `--bs-*` overrides. No preprocessors.
- `css/tokens.css` is the single source of truth: every color/size/spacing in the changes is a token, never a new hardcoded hex.
- Existing token names stay valid; changes are value changes, not renames. Unused tokens (`--brand-mid`, `--brand-dark`, `--brand-gold`) are kept.
- Pipeline stages (`SIP`, `Expected`, `Anticipated`, `Committed`, `Canceled`) and project statuses (`Not started yet`, `Started`, `Started At Risk`, `Put on hold`, `Completed`) cannot change; only colors may. The pipeline color sources of truth in CLAUDE.md ("Pipeline stage: single source of truth") must stay in sync.
- WCAG AA text contrast; visible focus states; color never the only carrier of meaning (badges keep their text label).
- Global Bootstrap overrides go in `css/style.css`; `css/admin-crud.css` stays scoped to its CRUD pages.
- Bootstrap's z-index scale and the local `--z-*` scale are not renumbered into each other.
- Layout-load-bearing values must not change by side effect: `.nav-main-tab` `height:44px`, `.app-footer` `height:100px`, `.pb-board-root` `calc(100vh - 206px)`, `.gantt-label-col` fixed width + sticky, `#teamAssistantPanel` `right:-960px` offset.
- Cache-busting: every edited versioned file (`css/style.css`, `css/admin-crud.css`, `js/core.js`) has its `?v=N` bumped on every page that references it (grep the whole repo). `css/tokens.css` is exempt per CLAUDE.md, but see Open questions.
- UI text stays English.
- Process: runs in its own worktree/branch; closes with `/finish-cycle`. No database or API changes.

## Acceptance criteria

1. `css/tokens.css` contains every token listed in Expected behavior §1–2 with the stated values; no existing token name is removed or renamed.
2. No remaining raw `#d01f6a` or `#b81860` in `css/`; `.btn-primary`/`.btn-outline-primary` hover and active use the new tokens; button focus uses `--focus-ring`.
3. `style.css` and `admin-crud.css` both resolve their body font through `--font-family-base`.
4. Contrast ratio of SIP, Expected and Anticipated badge text on its background is ≥ 4.5:1 (measured and recorded in the cycle's report); Committed and Canceled are unchanged.
5. `statusBadge()` and `statusBadgeLarge()` render the same color for the same status; the diff of `js/core.js` contains no change outside color values.
6. `.btn-danger`, the ghost/icon button and the spinner render in all listed states, with colors resolved through tokens.
7. `.alert-*`, `.dropdown-menu`, `.modal-content` and `.spinner-border` take their colors/radius/shadow from project tokens (verified in the browser on a page using each).
8. Re-running the handoff's hardcoded-value grep shows no remaining literal that has an exact-match token, in the files in scope; the remaining literals are listed in the cycle's inventory.
9. Layout invariants hold: `.nav-main-tab` computed height 44px, footer 100px, pipeline board fills the viewport without clipping or extra scroll, gantt sticky column unchanged.
10. Before/after check on one screen per page type (login, pipeline, portfolio incl. burndown chart, config, team/attribute-lists, planning, a modal): only the differences expected in the handoff's §8 table, everything else identical.
11. `?v=N` bumped for every edited versioned file on every page referencing it; frontend tests (`npm test`) pass.

## Explicitly excluded scope

(Confirmed by the user.)

1. Navbar, footer and their dropdowns (Cycle B).
2. Any HTML structure change.
3. Dark mode and responsive breakpoints.
4. Link color change (Bootstrap default blue stays).
5. Removing `--brand-mid`, `--brand-dark`, `--brand-gold`.
6. One-off page-specific hex values (gantt/chart cells in `config.html`, `planning.html`, `costgrid.html`, other single-page accents): deferred to the page cycles; only inventoried here.
7. Recoloring `.badge-st-active` / `.badge-st-inactive` (Team/Attribute-list row state, unrelated to project status).

## Open questions for /brainstorming

1. **Verify the handoff's claims against the code** before the spec: the 811-literal count and per-value counts, "zero consumers" of `--brand-mid/-dark/-gold`, the hover/active literals, the two body font stacks, and the nonexistence of `.btn-danger`/ghost button.
2. **Layout invariants vs. CLAUDE.md:** the handoff (§7) says `pipeline.html`'s `#pbColumnsContainer` relies on `.nav-main-tab`'s 44px; CLAUDE.md says that id and its calc no longer exist (the board is a flex column inside `.pb-board-root`). Establish which is current and which invariants really matter.
3. **`js/core.js` is in scope** for status colors although the handoff's file list was CSS only; check how many pages load it and bump all `?v=N`. Inline `#fff` inside JS template literals stays deferred unless it is part of those two functions.
4. **Exact new text colors** for SIP/Expected/Anticipated (AA-passing, same hue), plus the Chart.js `--chart-phasing-color` value (the handoff only says `#FF6F00` needs its own token), and how JS reads a CSS token for Chart.js.
5. **`css/tokens.css` is exempt from `?v`** per CLAUDE.md, yet this cycle changes its values substantially; decide whether that exemption still holds for a cycle of this size (stale-cache risk across all pages).
6. **`--status-*` for "Not started yet"** is proposed as `#9ca3af` with white text; check its contrast, and the on-hold `#d97706` with white text, against AA.
7. **Spinner and ghost-button design** (colors, sizes) have no mockup yet; the style tile promised in the handoff §10 was not delivered in the file.
8. **Verification method** for the before/after checks (manual vs. scripted screenshots) and where the contrast measurements are recorded.

Brief ready. Next step: /brainstorming.
