# Finish-cycle report — worktree-navigation-b1-page-shell

**Date:** 2026-10-02
**Branch:** worktree-navigation-b1-page-shell → main (merge `aa6d762`, `--no-ff`, pushed; frontend only, no migration, `pdash-api` not restarted)

## What was done

- `8f47926` feat(nav): breadcrumb inside `#app-main`, `--sidebar-w` offset rule, keep sidebar-state key
- `bf8cba6` test(nav): canonical sidebar-state head snippet and its failure modes
- `6446693` feat(nav): page shell (`#app-shell`/`#app-main`) and sidebar-state head snippet on the 14 authenticated pages
- `95bed26` chore(nav): bump `style.css` v16, `core.js` v11, `nav.js` v12 on every page

Spec `docs/superpowers/specs/2026-10-02-navigation-b1-page-shell-design.md`, plan `docs/superpowers/plans/2026-10-02-navigation-b1-page-shell.md`. Executed inline (native); `npm test` 24 files / 436 tests green; DB backup taken before the merge (`backups/pdash-backup-2026-10-02-175421.dump`).

## Code review follow-ups

None. `/code-review` (medium) found no findings; the one thing it did not check (CSS/JS depending on `#nav-container` being a sibling of the content) was grepped by hand: no such dependency.

## Roadmap notes

- Deviation from the plan: the Task 0 baseline was not captured before the change (it needs logins as three roles); the user compared the branch stack (`:8081`) against the main stack instead, case by case, and verified everything.
- Manual case C3 (a stray `PDash_*` key is removed on navigation while `PDash_sidebarCollapsed` stays) was not run by hand; the user accepted it as covered by `nav-shell.test.js` (`keeps the key and still removes unknown PDash_* keys`).
- The offset rule is on `#app-main`, not on `body` as the Brief said, so B2's small-screen navbar can stay full width; B2's Brief should read it that way.
- B2 open questions are unchanged (unread bell look, Admin/Sysadmin groups on the small navbar, "© 2026 PDash" line, names, `.pb-board-root` / `costgrid.html:213` recompute, layout jump). The head snippet only prevents a content jump if B2's `--sidebar-w` is also set from `html[data-sidebar]` in CSS.
- The div-balance guard counts `<div` tags naively; it passes on all 14 pages today, but would false-positive if a page ever puts `<div` inside a non-markup string within the shell.

## Sync-docs outcome

Updated: `CLAUDE.md` (new "Page shell" section, `nav.js` entry pointer, localStorage key list, `core.js?v=11` in the money cache-version note), `docs/js/nav.md` (breadcrumb placement section), `TEST_CASES.md` and `test-cases.html` (N-07, N-08, mirrored, `auto` unset: manual). Not touched: `ARCHITECTURE.md` (no nav detail to correct), `test-api.js` (no API change), `PRD.md` (evaluated: not necessary, internal-only, no visible change), `.claude/skills/operational-manual/SKILL.md` (PRD untouched). PROCESS.md gate: none of the three conditions applied; not touched.

## Memory outcome

`project_ui_redesign_cycles.md`: Cycle B section rewritten — "DECIDED, nothing built" → B1 MERGED (`aa6d762`) + B2 NEXT; description line and the "NOT yet pushed" wording on the Cycle B input fixed. `MEMORY.md`: its hook line now names B1 merged and B2 next. Nothing left unverified.
