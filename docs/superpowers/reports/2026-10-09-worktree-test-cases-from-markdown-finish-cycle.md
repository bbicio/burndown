# Finish-cycle report — worktree-test-cases-from-markdown

**Date:** 2026-10-09
**Branch:** worktree-test-cases-from-markdown → main
**Execution started:** 2026-10-09 18:20  (pre-flight step 6)
**Merged at:** 2026-10-09 18:58  (Gate 4's merge commit `ba4ffc3`)
**Gate durations:** Gate 1 2m · Gate 2 3m · Gate 3 28m · Gate 4 7m · Gate 5 ~7m — total ~47m
<!-- Wall-clock, human wait time included (pre-flight step 6). Since 2026-10-08 the code review runs
     in the background during Gate 2, so Gate 2's figure absorbs most of round 1 and Gate 3's covers
     the findings discussion and the fixes — these two gates' numbers are not comparable with cycles
     closed before that date, and the split between them is approximate. This cycle is the first to
     run the *reduced* Gate 2 text merged by the classify-cycle cycle (`821daf3`). -->

## What was done

9 commits:

- `83288d9` feat: parse TEST_CASES.md into the test-cases page data model
- `2767158` fix: make TEST_CASES.md parse cleanly
- `7bebac9` fix: drop HTML comments from the parsed Markdown
- `a14a290` feat: render test-cases.html from TEST_CASES.md at runtime
- `f1be44b` feat: classify TEST_CASES.md as runtime-loaded code
- `46fbc77` docs: drop the test-cases.html mirroring duty
- `8225dcc` fix: close the two Important findings of the whole-branch review
- `dc56898` fix: correct the stale prose this cycle created
- `3a72b7b` fix: close the two findings of the scoped round-2 review

11 files, +468 / −2.699. `test-cases.html` went from 2.988 lines / 247 KB to 404 lines / 17 KB and
now fetches `TEST_CASES.md`, rendering it through the new pure module
`js/lib/test-cases-parse.js` (vitest-covered). `TEST_CASES.md` is therefore runtime-loaded code:
it is in `RUNTIME_LOADED_ROOT_MD` in `scripts/classify-cycle.mjs`, pinned by that script's test 7,
so a cycle touching only that file classifies `ordinary`. `/sync-docs` lost its §4 mirroring duty
(§5→4 … §8→7, so project memory is now section 7).

The last two commits are this gate's own fix passes, not part of the planned work.

## Code review follow-ups

Three findings from round 1, deferred by the user's choice (all low, none urgent):

- **Round 1 — `js/lib/test-cases-parse.js:47`.** HTML comments are stripped *before* the line
  split, so a comment spanning lines collapses them: every later warning's line number is offset by
  the comment's line count, and text following `-->` is fused onto the comment's opening line
  (which can silently join a table row to a heading). Fix shape: strip per line, or replace each
  comment with its own newline count.
- **Round 1 — `js/lib/test-cases-parse.js:37`.** `readAuto` only distinguishes `vitest` from
  everything else, so the 11 cells of the form `✓ (node:test, …)` get the `API auto` badge, whose
  documented meaning (page legend, and `TEST_CASES.md`'s own `> **Auto** =` note) is specifically
  the API suite. This cycle introduced the two-way distinction, so the third case belongs here.
- **Round 1 — `test-cases.html:318-319`.** `data-id="${formatCell(c.id)}"` runs the id through the
  inline formatter inside an attribute value: an id containing a backtick pair or `**` would make
  the toggle write `state['A<code>x</code>']` while rendering reads `state['A\`x\`']`, so the button
  would appear to do nothing and the saved result would be unreachable. No current id triggers it;
  an attribute wants the escape-only variant.

Carried over from the branch's own pre-finish-cycle review (not re-raised here, still open): the
parser's lookbehind blanks the page on Safari < 16.4; an empty section still shows a green dot; the
error path leaves the statistics bar empty; the `PL-*` → `PCL-*` rename resets the recorded results
of 13 cases in a browser that had already run them; and no guard ties the page's `?v=1` to the
parser (`foundations-guard.test.js` exempts `test-cases.html` and does not look at imports anyway).

## Roadmap notes

- **Four of round 1's seven findings were stale prose this cycle had itself created** — the same
  failure surface as the doc-split cycle that produced 10 of its 16 findings on prose. One sentence
  (`RUNTIME_LOADED_ROOT_MD` is "empty today") existed in **four** places; the cycle fixed three and
  left the fourth in `.claude/commands/finish-cycle.md` — the file an agent actually executes at
  Gate 2, where the bullet above it frames a non-`no-code` verdict as a possible classifier bug. An
  agent on a `TEST_CASES.md`-only diff would have read it and treated the correct `ordinary` verdict
  as broken. Both round-2 findings were omissions of this kind, not defects in the edited lines.
- **Rounds 2 and 3 were scoped to the fix commits only**, per PROCESS.md §6.4's ban on re-reviewing
  a covered diff. Round 3 came back clean, and its reviewer verified each of the fix pass's four
  claims against the code rather than taking the commit message's word for it.
- **The exact-count assertion is now a documented duty, not a trap.** `/sync-docs` §3 says that
  adding or removing a case fails `js/lib/test-cases-parse.test.js` with no table defect present,
  and that the remedy is raising the two numbers in the same commit — never relaxing the assertion
  to a floor (the original 797 floor let nine cases disappear with the suite green) nor dropping the
  case.
- **First cycle to run the reduced Gate 2 text** merged by the classify-cycle cycle (`821daf3`):
  `node scripts/classify-cycle.mjs` returned `ordinary`, the gate did not raise the classification
  with the user, and the ordinary path ran as written. The **no-code branch is still unwalked** —
  this diff was not one.
- **Out-of-scope (non-blocking):** `docs/superpowers/PROCESS.md` is not in the plan's File
  Structure. It entered from round 1's medium finding, not from scope creep; the other 10 files
  match the plan exactly.
- The worktree lived at `Progetti\burndown-wt-test-cases`, outside the three paths `/finish-cycle`
  authorises itself to delete, so Gate 4 asked before removing it instead of cleaning up silently.

## Sync-docs outcome

- **ARCHITECTURE.md — updated.** Three targeted edits to the `### Directory structure` tree (§7):
  `js/lib/test-cases-parse.js` added to the `lib/` module list (noting it is the one module with no
  `window.` bridge, since its only consumer imports it); a new one-line `test-cases.html` entry (the
  page held none before) recording that it carries no case data, judges the fetch by payload rather
  than `res.ok`, and is the only page making a root `*.md` runtime code; and the
  `scripts/classify-cycle.mjs` entry extended with what `RUNTIME_LOADED_ROOT_MD` is for.
- **CLAUDE.md — not necessary, already done in-cycle.** Commit `46fbc77` extended both the
  `HTML pages` collective entry and the `js/lib/` entry; verified accurate against the merged tree.
- **TEST_CASES.md — no new cases.** The page is dev-only tooling with no navigation entry, not a
  product feature, and the parser it now depends on is covered by `js/lib/test-cases-parse.test.js`.
  The file's own §29 prose and the `PL-*`/`SEC-0x` id moves were already corrected in-cycle.
- **test-api.js — not necessary.** No endpoint added, no auth rule changed; the diff does not touch
  `api/`.
- **PRD.md — evaluated, not necessary (internal/dev-tooling change).** `test-cases.html` is a
  developer checklist, absent from `PRD.md` and from the Pages table, with no user-visible product
  behaviour changed. Not ambiguous: no screen, tab, button or modal of the product moved.
- **PROCESS.md gate — condition 2 applied** (a recurring change to the standard process: the
  classifier's named-exception list is no longer empty, and `/sync-docs` no longer mirrors
  `test-cases.html`). Already satisfied in-cycle: commit `dc56898` rewrote §6 point 4c's "oggi
  vuota" sentence and fixed the "sezione 8" → 7 reference. No further edit needed in this run.
- **.claude/skills/operational-manual/SKILL.md — not applicable** (PRD.md untouched).

## Memory outcome

Memory: 2 files updated, nothing left unverified.

- `project_process_optimization_plan.md`
  - frontmatter `description`: "Tier 0, Cycle 1, Cycle 2 and the classify-cycle script DONE … cycles
    3-6 next, and Cycle 3 inherits a hard obligation …" → "Tier 0, Cycle 1, Cycle 2, the
    classify-cycle script and Cycle 3 DONE … cycles 4-6 next" (the inherited obligation is
    discharged, so the warning is gone).
  - the Cycle 3 bullet: from a forward-looking spec with a ⚠ obligation → **DONE, merged `ba4ffc3`**,
    with the report path, the 2.988 → 404 line figure, the five decisions worth keeping (payload-not-
    `res.ok`, escape-before-format, the `PCL-*` rename and what it means for older reports, the
    `SEC-09/10` move, the maintained `Updated:` line), the exact-counts rule, the note that this was
    the first cycle to run Cycle 2's reduced Gate 2 text while its no-code branch stays unwalked, and
    the 3-round / 9-finding review tally.
  - "Cycles 3–6 are independent of each other" → "Cycles 4–6".
- `MEMORY.md`
  - the Process-optimization line: "Cycles 1-2 + the classify-cycle script DONE … **Cycle 3 must add
    `TEST_CASES.md` to `RUNTIME_LOADED_ROOT_MD`** … cycles 3-6 next" → "Cycles 1-3 + the
    classify-cycle script DONE (Cycle 3, merge `ba4ffc3`: test-cases.html 2.988 → 404 lines,
    `TEST_CASES.md` is code now — exact 806/35 counts, `npm test` after editing it) … cycles 4-6
    next".

Checked and deliberately left unchanged: `feedback_doc_split_prose_claims.md` — this cycle
*confirms* it (four of seven round-1 findings were prose it had itself created) rather than
contradicting it, and section 7 limits `feedback` edits to direct contradictions.
