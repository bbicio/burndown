# Finish-cycle report — worktree-share-panel-owner-layout

**Date:** 2026-09-12
**Branch:** worktree-share-panel-owner-layout → main

## What was done

1 commit (bounded-path UI layout change, no plan document):

- `0ed1fbd` feat: reposition owner/created-at and share list in proposal panels

User-requested repositioning of the owner/created-at display and the inline share list (both shipped in earlier cycles) across `pipeline.html`'s sliding detail panel and `costgrid.html`'s full-page editor. No backend/API changes, no new component logic — pure template/markup changes to two existing pages.

**`pipeline.html`**: the line under the proposal title changed from a terse `<version label> · <date> · 👤 <owner>` to a labeled `Owner: 👤 <name>, Created at: <date>` (version label dropped — already shown as a colored badge in the version-tabs row above), separated from the Period/Currency/Fees/PTC/Total budget block by its own `<hr>`. The inline `<share-list>` moved from directly under the title down to just above the (optional) POT block, after the totals and any note — wrapped in the same `border-top` style POT's own wrapper already uses, so when POT is present the two blocks share a single grey separator line rather than drawing two consecutive ones (an explicit user correction mid-design).

**`costgrid.html`**: "Offer details" (already collapsible) gained the same `Owner: 👤 <name>, Created at: <date>` line at the top of its body. The "Sharing" section-card (previously always-expanded, non-collapsible) gained the identical collapse/expand header pattern as "Offer details" (own `sharingCollapsed` flag, same arrow/`@click`/`v-show` idiom) and dropped its own owner/created-at line now that "Offer details" shows it.

## Code review follow-ups

Round 1 (`general-purpose` subagent, medium effort, scoped to `main..HEAD`): 0 Critical, 0 Important, 2 Minor, both purely informational (reviewer explicitly noted neither required action nor recommended follow-up):

1. `costgrid.html`'s `openVersion()` resets `offerDetailsCollapsed`/`summaryCollapsed` on every version-tab switch but not `sharingCollapsed` — reviewer judged this correct (sharing is scoped to the cost grid, not the version, so persisting the user's collapse choice across version switches is reasonable), not a bug.
2. The Sharing header has no collapsed-state summary text (unlike "Offer details"' `offerDetailsSummary`) — reasonable, since there's no natural one-line summary for a share list.

## Roadmap notes

None surfaced beyond the code review's own two informational notes above.

## Sync-docs outcome

- **CLAUDE.md** — updated: the "Detail panel" section's left-column layout description rewritten to match the new top-to-bottom order (title → Owner/Created-at line → hr → totals → note → share-list, `border-top`-separated → POT → hr → linked projects, with the single-shared-separator-line nuance called out explicitly); `pipeline.html`'s and `costgrid.html`'s file-structure entries both gained a "layout follow-up (2026-09)" note describing the reposition and format change, and `costgrid.html`'s Sharing entry updated to reflect it's now collapsible and owner/date-free.
- **TEST_CASES.md** + **test-cases.html** — updated in lockstep: `SH-11` and `SH-14`'s `expected` text rewritten to match the new layout (labeled Owner/Created-at line, hr separators, share-list's new position, costgrid.html Sharing section's new collapsibility and lack of duplicated owner/date). `test-cases.html`'s embedded script re-validated with `node -e "new Function(...)"`.
- **test-api.js** — not touched: no API changes.
- **PRD.md** — **not updated** (evaluated: this is a pure layout/format change to capabilities the PRD already documents generically — owner name, creation date, and an inline share list are all already described in §18.3; their exact position/format within the panel isn't something the PRD specifies at that level of detail, so nothing in it became inaccurate).
- **PROCESS.md gate** — none of the three conditions applied (no process skill touched; no recurring process exception introduced; no change to the 7-phase skeleton or scenario guardrails) → `PROCESS.md` left untouched.
