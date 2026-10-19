# Finish-cycle report — header-board-deviations

**Date:** 2026-10-20
**Branch:** header-board-deviations → main
**Execution started:** 2026-10-20 00:45  (pre-flight step 6)
**Merged at:** 2026-10-20 01:20  (Gate 4's merge commit)
**Gate durations:** Gate 1 8m · Gate 2 6m · Gate 3 13m · Gate 4 8m · Gate 5 unknown — total unknown
**Cycle counters:** subagent dispatches 3 · review rounds 3 · full test-suite runs 3
**Risk class:** high-risk (`docs/superpowers/plans/2026-10-20-header-board-deviations.md`) · review effort high
**Claims pre-check:** at Gate 1 it read the five changed `docs/BACKLOG.md` rows (about 2 minutes) and caught nothing. The re-checks after each Gate 3 round took a few minutes in all. They caught one over-broad claim, B-008's "the rule was never changed", which was narrowed to "unchanged since the cycle that opened the row". Of round 1's 4 findings plus 2 nits, 2 were false predicates (stale sentences in `docs/css/stylesheets.md` and `docs/pages/db-reset.md`). Both were in files the branch had not touched, so they were outside the pre-check's reach.

## What was done

10 commits on the branch; the Plan (`2dcf671`) was committed to `main` before it:

- `e9c7ad5` fix(header): primary CTA 36px tall, as on the boards (B-105)
- `f76d6de` fix(header): primary CTA label never wraps (B-111)
- `1193f03` fix(db-reset): gap between the two single-action cards (B-107)
- `8ce4527` fix(db-reset): Change proposal owner card uses tokens, not #0d6efd (B-118)
- `447596c` fix(tokens): destructive-card border back to 2px (B-109)
- `1ec1f51` docs(backlog): close B-105, B-107, B-109, B-111; add and close B-118
- `8555a6e` test(header): guard pins a 36px CTA beside 32px .ph-btn (B-105 over B-101)
- `475b9c3` fix: Gate 3 round 1 — stale docs, neutral .action-card for the owner card
- `bc1af90` fix: Gate 3 round 2 — B-008 evidence, B-118 guard, page doc
- `42ead22` fix: Gate 3 round 3 — reopen B-008, drop a justification in db-reset.md

Measured before the Plan (see its "Misure" section):

- **B-105 confirmed.** The CTA rendered at 32px; the boards draw it at about 36px.
- **B-111 not reproduced** at any width from 375px to 1440px; the fix went in as a latent one.
- **B-107 reproduced, but in a different place:** the cards inside `#resetCards` were spaced correctly; the two cards below the `<hr>` were the ones touching.

## Gate outcomes

- **Gate 1:** first run red. `js/lib/page-head-guard.test.js` still pinned B-101's "CTA as tall as `.ph-btn`", which the Plan had not seen. The user chose a 36px CTA beside 32px secondaries; the guard was rewritten (`8555a6e`) and the Plan ledger noted it. Re-run from the top: 1494/1494 passed. No `api/` files, so no backend suite.
- **Gate 2:** ordinary cycle. The branch stack was reused and the user verified it in the browser, then it was torn down.
- **Gate 3:** 3 rounds at high effort.
  - Round 1: 4 findings plus 2 nits; 4 fixed, 2 followed up.
  - Round 2: 6 findings; 5 fixed, 1 followed up.
  - Round 3: 2 findings, both fixed, with no 4th round on the user's choice (b).
- **Gate 4:** merge commit `7e28227` (`main` had not diverged) and push. No migration, no backup, no restart (no `api/` files). The worktree's directory needed `rm -rf` after "Permission denied". Local branch deleted.
- **Gate 5:** `/sync-docs` changed `CLAUDE.md` (1 line) and `TEST_CASES.md` (2 cases plus the count pin); backlog rows B-119..B-121 written.

## Code review follow-ups

- Round 1: `white-space: nowrap` on `.ph-btn-primary` could push a long label past the band edge at very narrow widths (not reproduced) — `css/style.css` line 80.
- Round 1: `js/lib/page-head-guard.test.js` indexes `[...css.matchAll(...)][0][1]`, so a renamed selector throws instead of failing a readable assertion — lines 307-308.
- Round 2: `.action-card` duplicates `.danger-card` and both keep the literals `700`/`.875rem`/`.75rem` — `_db-reset.html` lines 31-40.

## Roadmap notes

- The B-008 row in `docs/BACKLOG.md` was found closed on evidence that belonged to B-101 (mis-filed by `b0e02a2`); it is open again, and its subject (the precedence rule in `.claude/skills/sync-docs/SKILL.md`) is untouched.
- Gate 3's three rounds all came from prose written as fixes in the round before, which is the mechanism PROCESS.md §6.4d describes; the code was clean from round 1.
- Round 2 was delivered in two parts. The code-review skill launched as a fork did not return in time, so the first hand-back was partial. The full report came after the user had already decided on its first finding, and the remaining five were put to the user separately.
- Pre-existing, outside this diff: `docs/pages/db-reset.md`'s 2026-10-16 section says `.page` keeps "its own 2rem top margin", while the rule now reads `var(--content-gap)`.
- B-110 and B-112, the other visual deviations from the header cycle, are the next candidates.

## Sync-docs outcome

- `CLAUDE.md`: the Cache-busting section said `tokens.css` was "`?v=9` on all 18 pages", which is false. It now says it is versioned on every page that links it, without the number.
- `TEST_CASES.md`: PH-07 (primary action taller than the secondaries, label on one line) and DR-17 (DB Reset card layout) added; `js/lib/test-cases-parse.test.js` pins 835 cases.
- `ARCHITECTURE.md`: nothing it describes changed. `test-api.js`: no API change.
- PRD (`PRD.md` and `docs/prd/`): evaluated, not necessary — visual polish only (height, border, spacing), no change to what a user can do.
- PROCESS.md gate: none of the three conditions; not touched.

## Memory outcome

- `project_header_unification_cycle.md`: "B-105/B-107/B-109 (board deviations needing a screen measurement) are the next candidates." → closed by header-board-deviations `7e28227`, with the 36/32 decision over B-101, the 2px border, B-118 closed and B-008 reopened; next candidates B-110/B-112. The description now says the same.
- `MEMORY.md`: "next: B-105/B-107/B-109" → "B-105/B-107/B-109/B-111 closed 2026-10-20 by header-board-deviations `7e28227`; next: B-110/B-112".
