# Finish-cycle report — worktree-navigation-b2-sidebar

**Date:** 2026-10-02
**Branch:** worktree-navigation-b2-sidebar → main (merge `0cd5b23`, merge commit; `main` had advanced 2 commits — the spec and plan docs, which had been cherry-picked onto the branch)

## What was done

13 commits on the branch (11 implementation + spec and plan), executed subagent-driven from `docs/superpowers/plans/2026-10-02-navigation-b2-sidebar.md`, 510 tests green (baseline 436):

- `8c1bc4d` docs: spec for navigation cycle B2
- `c3ae243` docs: implementation plan for navigation cycle B2
- `32ee1ef` feat(nav): navigation tokens (magenta tint, icon sizes, nav alphas), tokens.css v9
- `4d6a82f` fix(nav): strip BOM accidentally added to 15 pages
- `33fed38` feat(nav): navigation model, SVG icon set and aside markup builder
- `cb0708b` feat(nav): collapse, group panels, popper placement; wire the aside into initNav; drop the footer
- `846e5f6` feat(nav): sidebar / icon-navbar CSS, anti-jump container, board height from navbar only
- `1215d99` feat(nav): unread bell state and SVG desktop-notification banner
- `297ef88` feat(nav): one name per page in menu, title and breadcrumb (Master Data, Portfolio, Planning, User Admin, DB Reset)
- `45a92d0` feat(nav): remove the fixed footer from login, activate and reset-password
- `46d34cc` chore(nav): bump nav.js v13, style.css v17, notifications.js v3 on every page
- `5f22d6b` fix(nav): raise open navigation menus above page panels, breadcrumb height 32px, magenta focus ring in group panel; bump style.css v18
- `b4d10ed` fix(nav): final-review fixes (z-index spec text and guard, raise on small screens, close groups on resize, Escape returns focus); bump nav.js v14, style.css v19

Frontend only: no `api/` change, no migration, no `pdash-api` restart. The merge conflicted only on the spec file (add/add, because the spec had been corrected on the branch); resolved with the branch version. DB backup taken before the merge: `backups/pdash-backup-2026-10-02-221050.dump`.

## Code review follow-ups

Round 1 of `/code-review` (medium): no correctness bugs; 3 low findings, all accepted as follow-ups:

- Round 1 — `js/core.js:145`: `updateNavState()` still queries `.nav-main-tab`, which the new navigation no longer renders (dead code, harmless). Remove when `core.js` is next bumped.
- Round 1 — `portfolio.html:30`: page heading still reads "📋 Project Portfolio" while menu, title and breadcrumb say "Portfolio" (the spec keeps page headings; align in the page-by-page cycle).
- Round 1 — `planning.html:356,358`: headings still read "📅 Resource Planning" while the menu says "Planning" (same reason).

Other findings of the earlier per-task and whole-branch reviews that were deferred (not in the code-review round): `navWireGroups` document listeners have no once-guard; the 1050 z-index literal has no token; the 32px breadcrumb height is not pinned by a test; the account button's `aria-label` replaces its visible email; `nav-model.test.js` uses an identity `esc` stub; `notifications-ui.test.js` leaks globals.

## Roadmap notes

- **Possible stored XSS (pre-existing, not touched):** `nav.js` builds the Send Notification recipient `<option>`s with unescaped `first_name`/`last_name`. Candidate for a small hardening cycle.
- **Not verified in a real narrow window:** widths below 1024px were checked through same-origin iframes; no throttled-network visual check (geometry only); the Planning assistant panel was not opened. The user confirmed the manual verification at Gate 2.
- **BOM incident:** the first implementer task added a UTF-8 BOM to 15 HTML pages (PowerShell text rewrite); caught by the task review, fixed, and later dispatches used byte-safe edits. Recorded as a feedback memory.
- **Bug found only in the browser:** `team.html`'s detail panel (z 1045) clipped the open account/notification menus; fixed by raising the nav to 1050 only while a menu/panel is open (`:has()`), see `docs/js/nav.md`.
- **Dead code / leftovers:** see the follow-ups above; the old `docs`/manual chapter titles ("Project Reporting", "Resource Planning") keep their wording until the operational manual is regenerated.
- **Process note:** inside the worktree-isolated session the Bash tool refused plain `git`; PowerShell worked (recorded in the worktree-removal feedback memory).

## Sync-docs outcome

- `CLAUDE.md`: updated — new section "Navigation: sidebar and icon navbar"; `nav.js`/`notifications.js`/`css/*.css` entries; Routing step 1; Page shell (B2 now sets `--sidebar-w`); "Pipeline board layout (height math)" rewritten for `--nav-top-h`/`--breadcrumb-h`; Settings/Notifications/Send Notification wording; cache-busting examples and the `tokens.css` version (v9).
- `ARCHITECTURE.md`: updated — `nav.js`, `notifications.js`, `tokens.css`, `style.css`, `_db-reset`, `_terms-editor`, `settings` entries.
- `docs/js/nav.md`: updated — historical note on the pre-B2 sections plus a full "Navigation Cycle B2" section (structure, icons, behaviour, CSS contract, bugs found, open items). `docs/js/notifications.md`: B2 note appended.
- `TEST_CASES.md` and `test-cases.html` (mirrored, `node --check` clean): N-01/N-02/N-08/ST-01/AD-34/R-27 updated, AD-35/36/37 marked obsolete (superseded by N-11/N-12/N-17), new N-09…N-23.
- `test-api.js`: not changed (no endpoints or auth rules changed).
- `PRD.md`: **evaluated — updated** (user-visible change): §3 rewritten for the sidebar/icon navbar and the new menu names, §9 Settings, §10 notifications bell, §16.6/§17 and the profile-jobs entry wording.
- `.claude/skills/operational-manual/SKILL.md` (6b): updated — navigation bullet, Settings wording, notification banner labels. `docs/OPERATIONAL_MANUAL.html` itself not regenerated (on explicit request only).
- `docs/superpowers/PROCESS.md` gate: **none of the three conditions applied** (the cycle executed the documented process; no process skill changed, no recurring exception, no change to the 7-phase skeleton or scenario guardrails) — not touched.

## Memory outcome

- `project_ui_redesign_cycles.md`: B2 "NEXT, nothing built" → "MERGED 2026-10-02 (merge `0cd5b23`, …)" with the decisions taken; description updated; open items extended (page headings with old names, dead `updateNavState`, z-index token, iframe-only narrow-width check, possible XSS in the Send Notification options).
- `MEMORY.md`: hook of the UI-redesign line updated (B2 merged, next page-by-page); new line for the new feedback memory.
- `feedback_worktree_removal.md`: added the 2026-10-02 observations (plain `git worktree remove` worked after `ExitWorktree keep`; Bash tool refuses even plain git in a worktree session, PowerShell works).
- New `feedback_powershell_bom_html_edits.md`: PowerShell `Get-Content`/`Set-Content` adds a BOM to repo HTML; use the Edit tool or a Latin-1 byte round trip and verify with `git diff --numstat` + a BOM byte check.
- Unverified / needs the user: none.
