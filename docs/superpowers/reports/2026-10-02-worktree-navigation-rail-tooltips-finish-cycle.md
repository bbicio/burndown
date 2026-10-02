# Finish-cycle report — worktree-navigation-rail-tooltips

**Date:** 2026-10-02
**Branch:** worktree-navigation-rail-tooltips → main (merge `af16592`, `--no-ff`; `main` had not advanced since the branch point, so it would have been a fast-forward)

## What was done

Follow-up to the B2 navigation cycle, a bounded change designed in chat (no spec/plan written, by the user's choice; the record is `docs/js/nav.md` "Rail tooltips", CLAUDE.md's Navigation section and this report). Request: in the collapsed sidebar, replace the browser's native `title` of the links with an HTML/CSS tooltip shown next to the rail at the icon; keep the standard title with the open sidebar; same treatment for the avatar and the bell buttons. Frontend only, no `api/`, no migration, no `pdash-api` restart. 545 tests green (baseline 510).

- `6508480` feat(nav): custom tooltip for the collapsed rail items, avatar and bell; keep the native title elsewhere; bump nav.js v15, style.css v20
- `d4273bf` fix(nav): hide the rail tooltip on resize, on programmatic collapse and when its anchor leaves the DOM; pin tooltips on group entries; bump nav.js v16

How: one `#pd-tooltip` element in `<body>` (fixed position, positioned in JS next to the hovered/focused `[data-tip]` element, because the scrolling items container would clip a CSS-only `::after`), shown only when `navLayout() === 'rail'`; `navApplyTitles()` removes the native `title` in the rail and restores it elsewhere; every item also got an `aria-label` (the label span is hidden in the rail). Developed test-first (31 tests in `js/lib/nav-tooltip.test.js`, 4 `#pd-tooltip` guards in `nav-layout-guard.test.js`). Verified in a real browser on the isolated branch stack by a subagent (10px gap and 0 vertical offset on every tested element, no `title` in the rail, no custom tooltip with the open sidebar or in iframes below 1024px); the user confirmed it manually at Gate 2. DB backup before the merge: `backups/pdash-backup-2026-10-02-230745.dump`.

## Code review follow-ups

None. Round 1 (3 low findings) was fixed in this cycle at the user's request: resize and programmatic collapse now hide the tooltip, and a re-render of the navigation under the pointer is handled via a `MutationObserver`. The finding that the Admin/Sysadmin entries would "duplicate a visible flyout label" was a false positive (in the rail the group panels are permanent, label-less rows, not a flyout) — instead of restricting the tooltip to top-level items (which would have removed tooltips the user asked for) the behaviour is pinned by a regression test. Round 2: no findings.

## Roadmap notes

- **Not verified:** a real Tab key press (the browser check used programmatic `focus()`/`blur()`), windows shorter than 640px, and the moment before the first render.
- **Accepted minor:** after a click hides the tooltip, it reappears only once the pointer leaves and re-enters the item.
- **Carried over from B2 (unchanged):** page headings "Project Portfolio"/"Resource Planning", dead `updateNavState` in `core.js`, possible stored XSS in the Send Notification recipient `<option>`s, the 1050 z-index literal without a token — see `docs/superpowers/reports/2026-10-02-worktree-navigation-b2-sidebar-finish-cycle.md`.
- **Process notes:** during Gate 2 the user first reported "the tooltip is not displayed" and then retracted it (they were not looking at the branch stack); the stack had been checked (served `nav.js?v=15`/`style.css?v=20` with the tooltip code) and no code was changed. A `Select-Object` piped into the Bash tool made the first `test-branch.sh down` attempt fail; it was re-run as a plain command (teardown happened once, after the user's "yes").

## Sync-docs outcome

- `CLAUDE.md`: updated — new "Rail tooltips" bullet in "Navigation: sidebar and icon navbar", `nav.js`/`style.css` entries, cache versions (`nav.js?v=16`, `style.css?v=20`).
- `ARCHITECTURE.md`: updated — `nav.js` and `style.css` entries.
- `docs/js/nav.md`: updated — new "Rail tooltips (follow-up to B2)" section (behaviour, mechanics, review and verification, open items).
- `TEST_CASES.md` and `test-cases.html` (mirrored, `node --check` clean): new N-24 (rail tooltips), N-25 (hiding), N-26 (native title elsewhere).
- `test-api.js`: not changed (no API change).
- `PRD.md`: evaluated — updated (user-visible: tooltips in the collapsed rail, one sentence in §3), and the operational-manual skill's inlined reference (6b) with it; `docs/OPERATIONAL_MANUAL.html` not regenerated.
- `docs/superpowers/PROCESS.md` gate: none of the three conditions applied — not touched.

## Memory outcome

- `project_ui_redesign_cycles.md`: added "B2 follow-up — rail tooltips, MERGED 2026-10-02 (merge `af16592`)" with the decisions and the no-spec choice.
- `MEMORY.md`: hook of the UI-redesign line extended (rail-tooltip follow-up merged).
- Other memory files checked, no change: `feedback_powershell_bom_html_edits.md` (the version bumps used the byte-safe Latin-1 round trip and the BOM set stayed unchanged — consistent), `feedback_worktree_removal.md` (worktree removed by `ExitWorktree keep` + plain `git worktree remove`, as recorded).
- Unverified / needs the user: none.
