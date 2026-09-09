# Finish-cycle report — worktree-portfolio-list-view-cold-review-fixes

**Date:** 2026-09-09
**Branch:** worktree-portfolio-list-view-cold-review-fixes → main

## What was done

2 commits:

- `2c1f962` fix: portfolio cold-review findings — program header layout, URL sync, DB-ID display
- `d787f70` refactor: hoist program stats into a computed map; drop 3 dead CSS tokens

The user did their own manual verification of the just-merged list-view card restructure (previous cycle) and reported 3 issues:

1. The program-group header row (e.g. "Menarini Ricerche") still showed the old per-month Program Summary table after the redesign — originally an explicit, user-approved excluded-scope decision from brainstorming. On seeing it live, the user asked to extend the redesign there too, with one explicit requirement: keep the child-project count clearly visible. Fixed: the table is replaced with the same Duration/Sold/Spent/Variance stats row style as individual cards, aggregated across all children; the "N projects" badge (already in the header, outside the removed table) was untouched and stays exactly where it was.
2. `Open project →` (and the sibling-switcher dropdown) never updated the browser URL, unlike every other entry point into the same detail view (`pipeline.html`, `costgrid.html`, `planning.html`, `project-config.html`'s save-redirect), all of which use `?projectId=`. Fixed via `history.replaceState` in `showDashboard()`/`showOverview()`.
3. The detail page's title area still showed the raw DB UUID next to the title whenever the project had a name — a second instance of a bug already fixed for the sibling-switcher dropdown in the prior cycle, missed there. Fixed the same way: falls back to the project's own code before the internal id.

Code review (round 1) found 5 Minor issues, none blocking; the user asked to fix 2 of them now (hoisting `programSummary()`/`programDuration()` into a `programStatsMap` computed, mirroring the existing `cardDataMap` precedent; removing 3 now-dead CSS tokens whose only consumer was the removed program table) and accept the other 3 as follow-up. Round 2 (re-review of the follow-up commit) came back clean.

## Code review follow-ups

- Round 1, accepted as follow-up (not fixed this cycle): the program-header stats row shows `€0`/colored-zero when a program has no phasing/actuals data, where an individual project card would show `—` — a visible but minor inconsistency between two adjacent stats rows.
- Round 1, accepted as follow-up: `showOverview()`'s hardcoded `/portfolio.html` would silently drop any future query param or hash fragment if one is ever added — harmless today (no other param exists), worth remembering if that changes.
- Round 1, accepted as follow-up (informational, not actionable): `programDuration()` derives min-start and max-end from independently-filtered lists, so a child with a start but no end (or vice versa) can still contribute to the displayed range — the `v-if` gate guarantees a renderable result either way; the reviewer judged this the correct aggregate semantics, not a defect.

## Roadmap notes

None new beyond the accepted follow-ups above.

## Sync-docs outcome

- **CLAUDE.md** — updated: `portfolio.html`'s file-tree entry gained a paragraph documenting the 3 cold-review fixes and the `programStatsMap` hoist, in the same level of detail as the parent cycle's own entry.
- **ARCHITECTURE.md** — not touched: its existing one-line pointer to CLAUDE.md for `portfolio.html` detail already covers this without needing its own update (it doesn't enumerate specifics that could go stale).
- **PRD.md** — updated (user-visible behavior changed): §6.1's "Program summary row aggregates all child metrics" bullet corrected to describe the new Duration/Sold/Spent/Variance format instead of the removed per-month table; a new bullet added noting the list view's URL now stays in sync with the viewed project.
- **TEST_CASES.md** / **test-cases.html** — updated in lockstep: R-18 (program header content), R-19 (URL sync), R-20 (project code vs. raw id in the detail header) added.
- **test-api.js** — not touched: no API/auth change, this cycle is frontend-only.
- **docs/superpowers/PROCESS.md** — not touched: gate evaluated as none of the 3 conditions apply.
