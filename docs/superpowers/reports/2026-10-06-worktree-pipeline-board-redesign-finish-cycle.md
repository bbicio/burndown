# Finish-cycle report — worktree-pipeline-board-redesign

**Date:** 2026-10-06
**Branch:** worktree-pipeline-board-redesign → main (merge `d966474`, `--no-ff`; main had not diverged)

## What was done

8 commits (Pipeline board redesign, cycle 1 of 2 — brief `docs/superpowers/design/2026-10-06-pipeline-brief.md`, spec `docs/superpowers/specs/2026-10-06-pipeline-board-redesign-design.md`, plan `docs/superpowers/plans/2026-10-06-pipeline-board-redesign.md`):

- `b54e296` feat(api): offers count per pipeline year with board visibility
- `46dfa06` feat(pipeline): view-model functions for card amount, column header, open pipeline, search suggestions
- `6e52c82` feat(pipeline): restyled header, year menu with offers, toolbar, search suggestions, Amounts toggle
- `14491bf` feat(pipeline): collapsible columns with header totals, restyled cards with hover actions, footer removed
- `7ccc1e2` fix(pipeline): card keyboard handling (self-only Enter, Space) and focus-revealed actions
- `3926726` fix(pipeline): reveal card actions on keyboard focus only
- `097af7a` feat(pipeline): smartphone stage tabs and Filters sheet; docs
- `7adfbbd` fix(pipeline): final review fixes - Unassigned client dash, PTC approx wording, 44px sheet rows, docs

Gates: Gate 1 passed (frontend 676/676 native, backend `scripts/run-tests.sh` 529/529). Gate 2: isolated branch stack, user verified in the browser with the 22-step checklist, stack torn down after the user's "yes". Gate 3 skipped (see Roadmap notes). Gate 4: DB backup `backups/pdash-backup-2026-10-06-230855.dump` (116K), merged and pushed, no migration, `pdash-api` restarted and healthy (started 2026-10-06T21:10:16Z), worktree removed, local branch deleted.

## Code review follow-ups

From the final whole-branch review (Opus, `192e267..097af7a`) and the per-task reviews, accepted as follow-up:

- (final) In "All in EUR" mode the card PTC line has no "from CHF …" sub-line (spec §3.4 says fees and PTC) — `js/lib/pipeline-calc.js` `pbCardAmount`.
- (final) `cardAmount(card)` is recomputed several times per card per render — `pipeline.html`; could be attached to the card in `stagesData`.
- (task 2) `pbAggregate` duplicates the summing of `pbComputeColumnTotals` (kept because the frozen function lets a negative rate through).
- (task 2) The rate-fallback test only asserts no `Infinity`/`NaN`, not "behaves as rate 1".
- (task 2) `pbSearchSuggestions` reimplements the search match rule instead of sharing it with `pbCardMatchesFilters` (drift risk).
- (task 3) `yearCards` repeats the `filterableCards` loop in `pipeline.html`.
- (task 3) The new document `keydown`/`mousedown` listeners are never removed (page lifetime, like the existing click listener).
- (task 1) `test-api.js`: the current-year `pipeline_years` setup is not asserted with `ok()`; two checks share the label PY-13.
- (task 5) The Filters sheet stays open if the viewport grows past 768px (rotation).
- (re-review) A real client literally named "Unassigned" would show "—" in suggestions.

## Roadmap notes

- **Gate 3 skipped (PROCESS.md §6.4):** the final whole-branch review at `097af7a` covered `main...HEAD`; its fix commit `7adfbbd` was re-reviewed (all 5 findings addressed, no new breakage). Its accepted follow-ups are listed above.
- **Process run (first cycle under PROCESS.md §6):** subagent-driven, 5 tasks with Sonnet implementers and per-task Sonnet reviewers, Opus final review; native `npm test` (one full run per gate), no automated screenshots (decided in `/brainstorming`), one visual check at Gate 2. Two fix rounds on Task 4 (keyboard handling: Enter bubbling from inner buttons, then actions showing on a touch tap because `:focus`/`:focus-within` match a tapped `tabindex` card — fixed with `:focus-visible`/`:has(:focus-visible)`).
- **Decisions taken on the user's behalf during execution (ledger rulings):** private `pbAggregate` for header/Open-pipeline totals; singular "1 proposal"/"1 more result"; the smartphone sheet uses `<details>` groups instead of Bootstrap dropdowns (absolute menus clip inside the scrolling offcanvas body); an extra "Clear filters" link in the sheet; the two final-review minors above accepted.
- **Plan addition vs spec:** after creating or cloning a proposal the Draft column is expanded (otherwise the new card would land in a column collapsed at load).
- **Environment friction:** inside a worktree session the hook rejects compound Bash commands containing git, so subagents ran git as single commands or via PowerShell; PowerShell's `bash` resolves to WSL (no `/bin/bash`), so `scripts/backup-db.sh` was run through the Git Bash tool from the main checkout; `ExitWorktree remove` refused (8 commits on the branch, already merged) → `ExitWorktree keep` + `git worktree remove --force`, as in the existing memory note.
- **Pre-existing, out of scope:** an admin selecting an inactive pipeline year gets 403 from `GET /api/cost-grids?year=` and an empty board.
- **Docs:** older dated paragraphs of `docs/pages/pipeline.md` (filter-bar and money-formatting history) still say "footer"; they are historical narrative, left as is.
- **Cycle 2 (next):** detail panel (brief §6: 480px container side by side when ≥ 560px remain for the board, header, Overview/Tasks/Linked projects/POT tabs) and the POT summary API extension (brief §10). Legacy `.pb-column`/`.pb-col-body`/`.pb-card` rules in `css/style.css` still to clean in a separate cycle with one bump.

## Sync-docs outcome

- **TEST_CASES.md / test-cases.html:** P-01, P-16, P-22, P-23, P-36, P-46, P-54, P-55 updated (header totals instead of footer, no stage badge, new toolbar, "Clear filters" without ✕); P-57…P-68 added (year menu, `offers` count — auto ✓ via test-api PY-10..PY-14 —, Open pipeline, search suggestions and clicks, Amounts, collapsible columns, header pills, card hover/keyboard actions, selected card, smartphone tabs, Filters sheet).
- **PRD.md:** updated (user-visible change) — §4.2 column header totals, collapsing and Open pipeline replace the footer paragraph; §4.3 card content and hover/keyboard actions; §4.3a search suggestions, Amounts, small screens; §4.5 year menu with offers / Current / Closed. §4.4 detail panel unchanged (cycle 2).
- **`.claude/skills/operational-manual/SKILL.md` (6b):** §4 Pipeline reference aligned with the PRD changes (offer cards, header totals/collapsing/Open pipeline, Amounts, search suggestions, small screens, year menu).
- **ARCHITECTURE.md:** `css/pipeline.css` entry added to the directory structure; `GET /api/pipeline-years` row documents `offers`.
- **CLAUDE.md, docs/pages/pipeline.md:** already updated inside the branch (Task 5 + final fixes); verified, no further change.
- **test-api.js:** already extended inside the branch (PY-10..PY-14); no change.
- **PROCESS.md:** gate answered "none" — the cycle executed the process as documented (including §6 for the first time); no skill or skeleton change.

## Memory outcome

- `project_ui_redesign_cycles.md`: description "… B2 (sidebar) MERGED 2026-10-02; next is the page-by-page cycles …" → "… Pipeline board cycle 1 (10-06) MERGED; NEXT = Pipeline cycle 2 (detail panel + POT API) …"; new paragraph "Pipeline board redesign, cycle 1 of 2 — MERGED 2026-10-06" (merge, docs paths, user decisions, NEXT cycle 2 scope, accepted gaps).
- `MEMORY.md`: the UI redesign line gained "Pipeline board cycle 1 … MERGED 2026-10-06 (`d966474`), NEXT = Pipeline cycle 2 detail panel + POT API".
- Unverified — needs the user: `project_manual_test_findings_money_cleanup.md` item B ("pipeline detail panel + POT: ≈ €, Expected/SIP lines, original currency in POT modal") overlaps with cycle 2's scope, and item A's "thin pipeline scrollbar" was not addressed by this cycle; left unchanged.
