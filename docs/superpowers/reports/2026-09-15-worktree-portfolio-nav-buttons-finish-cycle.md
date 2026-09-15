# Finish-cycle report — worktree-portfolio-nav-buttons

**Date:** 2026-09-15
**Branch:** worktree-portfolio-nav-buttons → main

## What was done

2 commits (bounded UI change, no Brief/spec/plan document — small navigation cleanup, confirmed directly in chat before implementation):

- `1f05c4e` feat: rename Open project button, add symmetric back-navigation buttons
- `e1c4d7c` fix: scope the new bottom back-to-portfolio button to the dashboard view only

`portfolio.html`'s list view: both "Open project →" buttons (program-grouped and ungrouped cards) renamed to "Project Dashboard". `portfolio.html`'s per-project detail view: the existing top "← Portfolio" button is now duplicated at the bottom of the page too. `project-config.html`: a new "← Back to Portfolio" / "← Project Dashboard" button pair added at the top of the page, matching the existing bottom row (which gained its own "← Project Dashboard" addition); "← Project Dashboard" is hidden for a not-yet-saved new project.

## Code review follow-ups

Round 1 (`general-purpose` subagent, medium effort, scoped to `main..HEAD`): 0 findings. Verified the fix commit correctly scopes the bottom "← Portfolio" button inside the dashboard's `<template v-else>` block, confirmed no other new element in the diff has the same class of mistake, confirmed every new "← Project Dashboard" button consistently uses the `goProjectDashboard` Vue method (never an inline `@click="window...."` expression), and confirmed the `v-if="!isNewProject"` guard is present and correct on both instances.

## Roadmap notes

- **Two real bugs found during the user's own manual verification, both fixed in the same cycle (commit `e1c4d7c`):**
  1. The new bottom "← Portfolio" button on `portfolio.html`'s detail view was originally placed *after* the closing `</template>` tag of the dashboard's `v-else` block instead of before it — making it an unconditional sibling of both the list-view and dashboard-view templates, so it rendered on the list view too, not just the dashboard. This is a real class of mistake worth remembering when duplicating an element near a view's own template boundary: always verify the closing tag it's placed relative to, not just visually near.
  2. The same button was flush against the page footer with no spacing — fixed with `mt-4 mb-4`.
- **A third bug, already fixed within the first commit itself (not a separate fix):** `project-config.html`'s new "← Project Dashboard" button initially used an inline `@click="window.location.href = ...'` expression, which threw `TypeError: Cannot read properties of undefined (reading 'location')` on click — the same Vue-template-`window`-fallback landmine already documented elsewhere in this codebase (`openShareModal`). A compiled Vue template does not reliably resolve a bare `window` global from inside its own `with()` block; only a real plain-JS method body does. Fixed by introducing a `goProjectDashboard()` Vue method.
- Backup taken automatically by `/finish-cycle` Gate 4 before this merge: `backups/pdash-backup-2026-09-15-153306.dump` (80K).

## Sync-docs outcome

- **CLAUDE.md** — updated: `portfolio.html`'s file-structure entry corrected its stale `Open project →` button-name reference (already renamed once before, now renamed again to `Project Dashboard`) and gained a note on the new symmetric bottom "← Portfolio" button, including the scoping bug found during verification; `project-config.html`'s entry gained a matching note on its new top/bottom navigation button pairs and the `window`-fallback landmine hit and fixed for `goProjectDashboard`.
- **TEST_CASES.md** + **test-cases.html** — updated in lockstep: corrected two stale `Open project →` references (R-14, R-19) to `Project Dashboard`; added R-26 through R-28 covering the bottom-button view-scoping regression, the footer-spacing fix, and the project-config.html top/bottom navigation button pairs (including the `isNewProject` hidden case). `test-cases.html`'s embedded script re-validated with `node -e "new Function(...)"`.
- **test-api.js** — not touched: no API changes (this cycle is entirely frontend markup — `portfolio.html`, `project-config.html`).
- **PRD.md** — updated (evaluated: genuinely user-visible — a renamed button and new navigation affordances). §6.1 gained a short "← Portfolio" note describing the top+bottom duplication and its rationale (avoiding a full scroll-to-top just to leave a long detail page); its "Per-project card" description's button name was corrected to `Project Dashboard`; §7.1 gained a short "Navigation" note on `project-config.html`'s new button pair.
- **PROCESS.md gate** — none of the three conditions applied (no process skill touched; no recurring process exception introduced; no change to the 7-phase skeleton or scenario guardrails) → `PROCESS.md` left untouched.
