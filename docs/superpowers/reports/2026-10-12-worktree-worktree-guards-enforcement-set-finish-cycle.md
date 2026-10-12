# Finish-cycle report — worktree-worktree-guards-enforcement-set

**Date:** 2026-10-12
**Branch:** worktree-worktree-guards-enforcement-set → main
**Execution started:** 2026-10-12 12:28  (pre-flight step 6)
**Merged at:** 2026-10-12 12:43  (Gate 4's merge commit `b96b0a0`)
**Gate durations:** Gate 1 2m · Gate 2 5m · Gate 3 8m · Gate 4 2m · Gate 5 6m — total 23m
<!-- Wall-clock, human wait time included (pre-flight step 6). Since 2026-10-08 the code review runs
     in the background during Gate 2, so Gate 2's figure absorbs most of it and Gate 3's covers the
     findings discussion and any fixes — these two gates' numbers are not comparable with cycles
     closed before that date, and the split between them is approximate. These figures cover
     /finish-cycle only; brainstorming, spec, plan and the six tasks ran before it. -->

## What was done

8 commits (first of four fix cycles from the 2026-10-12 cold-review audit — F1, F2, F4, addendum §2):

- `d710d18` refactor: one definition of the live-document walk
- `da8a906` docs: four statements about js/config-form.js and js/dashboard.js to the past
- `1b81bb4` test: guard that every cited repo path resolves
- `fc7a07e` feat: Gate 5 runs npm test before it pushes to main
- `6cbad08` docs: ARCHITECTURE.md 5/6 is documented on the branch, not at Gate 5
- `9ee5164` docs: PROCESS.md 4b names the guards in npm test
- `f427305` fix: close the whole-branch review findings
- `8ef5d88` fix: close the scoped review of f427305

**Gate 5's new step 3 caught its own cycle on first use.** `/sync-docs` added two File-structure
entries to `CLAUDE.md` for the new files, moving the exact pin from 12,758 to 13,156 B. Before this
cycle, that edit and the pin raise would have been committed and pushed with nothing verifying them —
which is exactly what `3edd128` did one cycle earlier. The pin was raised in the same commit, per
the rule.

## Code review follow-ups

Two reviews ran, both fresh-context Opus subagents. Round 1 (whole branch, at `9ee5164`): 0 Critical,
2 Important, 6 Minor. Round 2 (scoped to `f427305`, the only commit round 1 did not cover): 1
Moderate, 1 Minor, 2 Informational. **All findings were fixed; none deferred as follow-up.**

Two of them are worth recording beyond the fix, because they are the defect class this cycle exists
to remove and the cycle produced them itself:

- **Round 1 #2 / round 2 #1 — the `docs/OPERATIONAL_MANUAL.md` allowlist entry.** It first claimed
  the file "never existed" (it did: added `bd32246`, deleted `8cac1ab`), and the correction then
  claimed it is "an OUTPUT path of the operational-manual skill" and that running the skill recreates
  it. Both false: that skill produces `docs/OPERATIONAL_MANUAL.html` only, and says so at its own
  `SKILL.md:60`. The second version was worse than the first, because it turned the false premise
  into an instruction to delete the allowlist line. **The same false premise is still in this cycle's
  spec (§2) and plan**, where it originated during `/brainstorming`; those are left as written, per
  this project's treatment of specs and plans as an immutable record. Recorded here so it is not
  silently inherited by a later cycle reading them.
- **Round 2 #2 — the comment justifying the `unresolved` unit tests named the wrong failure mode.**
  It said inverting the filter would go "vacuously green"; a 9-variant mutation harness showed every
  under-filtering mutation goes loudly red. The class that genuinely dies silently is
  over-filtering. The tests were right; the stated reason for them was wrong.

Deferred, not fixed: the `existsSync` case asymmetry (case-insensitive on Windows, case-sensitive on
Linux) applies equally to `scripts/claude-md-guard.test.js:135`, where it is not named. Pre-existing
and outside this cycle's scope. Measured during review: zero live exposure today — every cited,
existing path matches on disk case-exactly, so a Linux checkout is green.

## Roadmap notes

- **Gate 2 took an explicit §3 derogation, confirmed by the user.** `node scripts/classify-cycle.mjs`
  correctly returned `ordinary` (the diff contains three `.js`/`.mjs` files), but no file in it is
  served by nginx or fetched by any page, so the browser question has no honest answer. No test stack
  was created and the browser question was not asked. This is the symmetric case `PROCESS.md` §6's
  last bullet describes, and the third time it has occurred (after cycles 5 and 6). §6 says that if
  it becomes frequent the answer is a differently-worded Gate 2 question, never a change to the
  classifier's rule.
- **Gate 3's skip check fits this cycle in neither of its two branches.** Step 0's full skip requires
  that post-review commits both contain only that review's fixes *and* have been re-reviewed;
  `f427305` satisfied the first and not the second. Step 0b's precondition is the opposite case
  (commits that are *not* the review's fixes). The gap was closed by running 0b's scoped form anyway,
  which is the behaviour both branches are reaching for. Worth a sentence in `finish-cycle.md` — a
  candidate for cycle 4, which already owns `<reviewed-sha>` (F3).
- **The spec's and plan's §2 both carry the corrected-but-not-rewritten OPERATIONAL_MANUAL error**
  (see Code review follow-ups above).
- No `api/` paths, so no migration was applied and `pdash-api` was not restarted — neither was needed.

## Sync-docs outcome

- **ARCHITECTURE.md** — updated: two entries added to §7's `scripts/` directory tree
  (`doc-paths-guard.test.js`, `lib/live-docs.mjs`). §5/§6 untouched: no route, table or column
  changed, and `architecture-guard.test.js` confirms it.
- **CLAUDE.md** — updated: the same two entries in the File structure block, two lines each, as the
  index rule requires. The exact block pin in `scripts/claude-md-guard.test.js` was raised 12,758 →
  13,156 B in the same commit, which is the allowed growth (a new file needs an index line) and not a
  ceiling raised to fit narrative.
- **TEST_CASES.md** — not necessary. It is the manual test checklist `test-cases.html` renders for
  *application* behaviour; this cycle added developer tooling with no user-facing surface. The guards
  are covered by their own unit tests, not by a manual case.
- **test-api.js** — not necessary: no API endpoint and no auth rule changed.
- **PRD.md + docs/prd/** — evaluated. `docs/prd/project-config.md` was changed **on the branch**, but
  only to correct two stale statements about a file deleted in 2026-07 (addendum §2); no product
  behaviour changed, so no further PRD work was needed here. `PRD.md` itself untouched, and §3 not
  affected — no page added or removed, no user-visible control changed.
- **operational-manual SKILL.md §5b** — not triggered: the `docs/prd/` edit was a factual correction
  about a deleted source file, not a change to any area the manual describes.
- **PROCESS.md gate: condition 3 applied** — this cycle modified `/finish-cycle`'s gates (the new
  blocking `npm test` at Gate 5). `PROCESS.md` was updated **on the branch**, not here: new §4b
  ("Guardie meccaniche — i guard sulla documentazione"), placed beside §4. §1 and §6 were deliberately
  left untouched — they belong to cycle 2 (findings F7 and F8).

## Memory outcome

- `project_cold_review_fix_cycles.md` — "Cycle 1 … spec `a88c774`, plan `29e8e81`, both committed
  2026-10-12, **execution starting**" → "**Cycle 1 … is MERGED, 2026-10-12, `b96b0a0`**", with the
  report path and a one-line summary of what shipped, and "**NEXT = cycle 2**".
- `project_process_optimization_plan.md` — description: "only the whole-programme **cold review
  remains, which no cycle has had**" → "the whole-programme cold review **was then done on
  2026-10-12**", linking the cold-review memory.
- `MEMORY.md` — two index lines realigned to match: the process-optimization hook no longer says the
  cold review is missing, and the cold-review hook now leads with cycle 1 merged at `b96b0a0`.
- Nothing left unverified.
