# Finish-cycle report — worktree-portfolio-list-search-status-configure

**Date:** 2026-09-16
**Branch:** worktree-portfolio-list-search-status-configure → main

## What was done

4 commits, all confined to `portfolio.html`:

1. `feat: add text search, Status filter, and Configure button to portfolio list view` — a free-text search input (project name, initially; extended in round 1), a new Status multi-select checkbox dropdown (all 5 `project.status` values, same UI idiom as `pipeline.html`'s filter bar), and a `⚙️ Configure` button on every list card (grouped-child and ungrouped), reusing the pre-existing `goConfigure()` navigation to `project-config.html?projectId=<id>`. This reintroduces a shortcut an earlier 2026-09 cycle had deliberately removed from the list cards — the user explicitly asked for it back.
2. `fix: code review findings for portfolio list-view filters` (round 1, 1 Important + 4 Minor): the Status filter compared `p.status` raw instead of matching the "Not started yet" default the card's own badge already shows for an empty status; checkbox `id`/`for` attributes contained literal spaces (invalid HTML); no "✕ Clear filters" affordance; search didn't match project code and falsely matched every unassigned-client project on the word "unassigned."
3. `fix: code review round-2 findings for portfolio list-view filters` (0 Critical/Important, 5 Minor): program groups now auto-expand while a filter is active so a matching child isn't hidden behind a manual click; an empty-state message appears when filters match nothing; search placeholder updated to mention project code; added `aria-label` to the search input; investigated the "legacy status value" concern directly against production data (`SELECT DISTINCT status FROM projects`) rather than fixing in code — only the 5 canonical values plus empty string actually occur.
4. `fix: code review round-3 finding for portfolio list-view filters` (1 Minor): the auto-expand from commit 3 made the manual "Hide Child Projects" toggle a silent no-op while filtering — worse, the click still mutated the underlying expand/collapse state, so clearing filters afterward could leave a group flipped from what the user last clicked. Fixed by replacing the toggle button with a non-interactive "▼ Shown (filtered)" badge whenever a filter is active, rather than leaving a control that visibly does nothing.

**Manual verification:** all three rounds of fixes verified directly in the isolated `scripts/test-branch.sh` environment (DOM inspection and direct state manipulation via `javascript_tool`, plus screenshots where the environment's browser-automation renderer cooperated) — search by name/code/client, Status OR-combination and empty-status default, Client+Status AND combination, Clear filters resetting exactly the three filter fields and not Sort, the empty-state message, auto-expand revealing a collapsed-group match, and the final round-3 fix confirmed both ways (toggle replaced by badge while filtering; reverts correctly to the last manual collapsed/expanded state once filters clear).

## Code review follow-ups

None outstanding. Every Important and Minor finding across all three review rounds was fixed in-cycle; the one deliberately-not-fixed item (round 2's "legacy status value" concern) was resolved by investigation rather than code — confirmed against real production data that no non-canonical status values exist, so the fixed 5-value enum is safe as-is.

## Roadmap notes

- Round 3 flagged, as an informational note rather than a defect: the pre-existing Client filter (not new to this cycle) now also triggers program-group auto-expand, since `portfolioFiltersActive` includes it alongside the new search/Status filters. Before this cycle, selecting a Client filter left program groups collapsed. This is arguably the more consistent behavior — the same reasoning that justified auto-expand for search/Status applies equally to Client — but it is an unannounced change to behavior that predates this branch. No action taken; flagging for awareness if a future report investigates unexpected group-expansion behavior tied to the Client filter alone.

## Sync-docs outcome

- **CLAUDE.md** — updated: `portfolio.html`'s entry corrected the now-stale claim that "⚙️ Configure ... list-card shortcut deliberately not kept" (explicitly reversed this cycle) and gained a new dated paragraph describing the full search/Status filter/Configure/auto-expand feature set, including the round-3 fix's reasoning.
- **TEST_CASES.md** / **test-cases.html** — 8 new test cases added (R-29 through R-36) covering search (name/code/client, the "unassigned" false-match guard), Status filter (OR-combination, empty-status default), AND-combination with Client, Clear filters (resets filters but not Sort), the empty-state message, program-group auto-expand with the toggle-replaced-by-badge behavior, and the Configure button (navigation + viewer-permission gating).
- **test-api.js** — no changes; this cycle added no API endpoints and changed no route's auth.
- **PRD.md** — updated: **user-visible behavior changed** (new search/filter controls, a returned Configure button, changed auto-expand behavior), triggering the PRD gate. Corrected the stale "Configure ... moved from list card to detail header" note and added 4 new bullets under §6.1's "View features" describing search, the Status filter, Clear-filters/empty-state, the returned Configure button, and program-group auto-expand.
- **PROCESS.md gate** — evaluated: none of the three trigger conditions apply. This cycle didn't modify a process skill, didn't introduce a new *recurring* process exception (the 3-round code-review cap that fired twice — once in this cycle, once in the prior `costgrid-generate-program` cycle — is pre-existing `/finish-cycle` behavior, not something either cycle added), and didn't touch the 7-phase skeleton or any scenario's guardrails. `PROCESS.md` left untouched.
