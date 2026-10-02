# Brief — Navigation, Cycle B1: page shell and sidebar-state groundwork

**Scenario:** 2 (evolution), as classified by the user.
**Sources:** `docs/superpowers/design/2026-10-02-navigation-handoff.md` + `...-handoff-integration.md` (Claude Design), the layout images in `docs/superpowers/design/` (`navbar_aperta.png`, `navbar_collassata.png`, `2026-10-02-schermi-piccoli-menu.png`, `2026-10-02-schermo-grande-avatar-notifiche.png`, `2026-10-02-schermi-piccoli-avatar-notifiche.png`), and `docs/superpowers/audits/2026-09-24-navigation-ux-audit.md`.
**Position in the redesign:** Cycle A (foundations, merged `38f8b6e`) → **Cycle B1 (this one, no visible change)** → Cycle B2 (sidebar, see `2026-10-02-navigation-b2-sidebar-brief.md`) → page-by-page cycles. B2 starts only after B1 is merged.
**Decision history:** the handoff recommended keeping the top navbar; the images show a left sidebar instead, so the images win. The user chose two cycles: B1 prepares the pages (shell + head script), B2 builds the sidebar on top, so the ~18 pages are opened once.

## Current behavior (verified in code)

- Authenticated pages have `<div id="nav-container"></div>` as a direct child of `<body>`, before the content (e.g. `pipeline.html:15`, `admin.html:23`, `costgrid.html:15`, `planning.html:15`). Content is a sibling in normal flow (`#app`, `#planningApp`, `#costGridEditorSection`, ...) with no common wrapper.
- `js/nav.js:135-148` creates the breadcrumb bar and inserts it right after `#nav-container`, adding `body.has-breadcrumbs`.
- `js/nav.js:154-161` appends the fixed footer and sets `paddingBottom:100px` on the body. `body` has `min-height:100vh` (`css/style.css:11`).
- `js/core.js:4`: `cleanLegacyStorage()` deletes every `PDash_*` key not in the `keep` Set (`PDash_summary`, `PDash_browserNotifDisabled`).
- No page has an inline `<head>` script reading a preference. No sidebar state exists in memory or storage.
- Fixed/sticky elements that must not break: `#teamAssistantPanel` (`css/style.css:281`), the fixed side panel at `team.html:180`, the sticky bar at `costgrid.html:368`, the sticky viewer banner at `project-config.html:37`.

## Expected behavior

1. Every page that calls `initNav` (about 18; not `login`, `terms`, `activate`, `reset-password`) gets a common shell around navigation, breadcrumb and content, ready to take a lateral offset.
2. A small script in each page's `<head>` reads the sidebar state (open/collapsed) from `localStorage` and sets it as an attribute before first paint. It is inert in this cycle (no sidebar yet).
3. The new `localStorage` key is added to `core.js`'s `keep` Set.
4. Central rule `body:has(> #nav-container) { padding-left: var(--sidebar-w) }` with `--sidebar-w` at 0 for now: no visible shift.
5. The breadcrumb bar and the content stay where they are today.

## Constraints

- No visible change on any page, for any role.
- No bundler: the script stays inline or a classic file, within CLAUDE.md's script-loading rules.
- Every edited versioned file needs its `?v=N` bumped on every page that loads it (`css/style.css?v=15`, `js/core.js?v=10`); `js/lib/foundations-guard.test.js` checks tokens/style/admin-crud/core agree.
- All user-facing text in English. Worktree + `/finish-cycle`.

## Acceptance criteria

1. On every modified page the layout is identical to before: same heights, fixed/sticky panels, modals and breadcrumb.
2. The script reads the key without errors even when `localStorage` is blocked (try/catch) and changes nothing visible.
3. The key survives a page change (it is in the `keep` Set).
4. All `?v=` references are aligned and `npm test` passes.
5. Manual check as user, admin and sysadmin on at least pipeline, portfolio, planning, costgrid, project-config, team and config.

## Explicitly excluded scope (proposed; not yet confirmed one by one)

- The sidebar, the small-screen navbar, the breakpoint, SVG icons and menu names (all B2).
- Moving or removing the footer; recomputing `.pb-board-root` or `costgrid.html:213`.
- Any page-content change.

## Open questions for /brainstorming

1. The shell: a hand-written wrapper in each page, or injected by `nav.js` by moving siblings at runtime (risk with Vue mount points and `v-cloak`)? How to handle modals Bootstrap appends to `<body>`?
2. The head script: inline copied into ~18 pages, or one shared non-deferred classic file (a blocking request)? Key name and attribute values.
3. Where the breadcrumb bar lives inside the shell, so that in B2 it ends up inside the content column.
