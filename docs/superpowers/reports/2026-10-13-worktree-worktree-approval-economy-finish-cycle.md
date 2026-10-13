# Finish-cycle report — worktree-worktree-approval-economy

**Date:** 2026-10-13
**Branch:** worktree-worktree-approval-economy → main (merge `d2b0595`)
**Execution started:** 2026-10-12 18:18 (pre-flight step 6)
**Merged at:** 2026-10-13 12:27 (Gate 4's merge commit)
**Gate durations:** Gate 1 1m · Gate 2 6m · Gate 3 ~17h · Gate 4 4m · Gate 5 20m — total ~18h
<!-- Wall-clock, human wait time included (pre-flight step 6). Gate 3 spans an overnight break and
     four review rounds; it is not a work-time figure and must not be read as one. The Gate 2/Gate 3
     split is not comparable with cycles closed before 2026-10-08, when the review moved into Gate 2. -->

## What was done

9 commits. M7 of the merged process backlog — the economy of approvals.

- `f9e3dd3` test: guard that every new spec and plan carries a decision ledger
- `31ed5dd` docs: PROCESS.md 6b — economy of approvals, and 6.1 folded into the plan handoff
- `f37c432` docs: finish-cycle — disposition rule at Gate 3, three Gate 4 automations
- `f2ce076` docs: Gate 6 stops restating Gate 5's report
- `b814a19` docs: CLAUDE.md — approvals override, Gate 4 derogation, drop two stale money claims
- `82caf4c` docs: apply the whole-branch review — 13 findings, all fixed
- `1b843ea` docs: apply Gate 3 round-1 findings (7)
- `f5b435f` docs: apply Gate 3 round-2 findings (8), after a mechanical pre-check pass
- `878ff24` docs: apply round-3 findings — closed list of 6, one round past the cap

Four of nine commits are the plan's tasks; five are review fix passes.

**What it changes.** `PROCESS.md` gains **§6b**: the A/B/C/D taxonomy of stops, the ratification rule
(a class-C gate names the decisions that could have gone another way instead of asking for approval;
with none it says so and proceeds), the guard boundary, and the mandatory `## Decisioni aperte` ledger
in every Spec and Plan. `/brainstorming`'s per-section approvals and its separate spec ratification
collapse into one stop; `/writing-plans`' handoff absorbs §6.1's mode-and-model declaration. Gate 3
gains a disposition rule for rounds 2+. Gate 4's backup becomes conditional on the stack being touched,
and its restart and branch deletion become automatic — the latter two under a **named derogation** to
`CLAUDE.md`'s Infrastructure-safety rule 3, written into all four documents that state that rule.
Gate 6 stops restating Gate 5 and a **Gate outcomes** section is added to the report template, because
the per-gate outcome had existed only in chat. New guard: `scripts/decision-ledger-guard.test.js`.

Tests: 1014 passing (48 files), up from 1007 at branch point.

## Gate outcomes

- **Gate 1:** passed. Frontend only — no path under `api/`, so `scripts/run-tests.sh` did not apply.
- **Gate 2:** `node scripts/classify-cycle.mjs` returned `ordinary` (the branch adds two `.js` files),
  while nothing in the diff is served by nginx. Handled as a **§3 derogation**, decided explicitly with
  the user: no isolated stack, no browser verification. The spec/plan walk found one candidate (the
  plan) and missed the spec, two commits further back behind two non-conventional commit messages —
  the documented under-collection gap, not a surprise.
- **Gate 3:** four rounds, 31 findings, all handled. 13 (whole-branch) → 7 → 8 → 3 substantive. The
  3-round cap fired; the user authorised one round past it with the fix list closed in advance. Round 4
  verdict: closable, no merge-blocking defect.
- **Gate 4:** merged `--no-ff` (`d2b0595`), pushed. DB backup taken before any state change
  (`pdash-backup-2026-10-13-122529.dump`, 120K, one older dump pruned). No migrations and no `api/`
  path, so neither the migration apply nor the backend restart fired. Worktree removed, local branch
  deleted. **Out-of-scope check fired:** three touched files were outside the plan's declared File
  Structure — see Roadmap notes.
- **Gate 5:** `/sync-docs` run; `npm test` green on `main` (1014). Report written.

## Code review follow-ups

All three from round 4, accepted as follow-ups on the user's decision rather than fixed, because the
reviewer judged them non-blocking and five rounds had shown this branch's "small" fixes were not small.

- **Round 4 — `scripts/decision-ledger-guard.test.js:45-48` and the code at `:119`: a new false-FAIL
  class, undeclared.** The unterminated-`<!--` alternative blanks the rest of the document even where a
  renderer would *show* the comment — inside an inline code span or a 4-space indented block. The
  header justifies it with "a renderer hides it too", which is false for those two shapes. A real
  instance already exists in the repo (`docs/superpowers/plans/2026-09-25-team-ux.md`, pre-cutoff so
  green today); the construct appears 163 times across 36 documents. Fail-closed, visible, but a
  confusing red when it lands. Suggested fix: restrict the alternative to a `<!--` at line start, or
  declare the exception.
- **Round 4 — same file, `:42-44`: the sole remaining declared false-pass vector is probably not one.**
  A fence opened inside a blockquote cannot produce a false pass (the heading would carry `> `); its
  real cost is a false *fail*. Third round running in which that header declares a vector of the wrong
  kind. The reviewer verified this by reasoning against the CommonMark spec, not by running a parser.
- **Round 4 — `docs/superpowers/PROCESS.md:233`:** the parenthetical "add a case to §6b below, not a
  clause here" points at a slot that does not quite exist — §6b's three subsections are the ratification
  rule, where it applies, and the ledger; none is a list of class-A cases.

## Roadmap notes

- **Gate 2 took a §3 derogation**, decided with the user: the classifier correctly returned `ordinary`
  because of the two `.js` files, but no file in the diff is served by nginx, so the browser question
  had no honest answer. No stack was created and none was torn down. This is the symmetric case
  `PROCESS.md` §6.4c describes, and it has now occurred a third time (cycles 5 and 6 of the process
  programme were the first two). **If it recurs again, the answer is a differently-worded Gate 2
  question, not a change to the classifier.**
- **Out-of-scope: three files outside the plan's declared File Structure** — `ARCHITECTURE.md`,
  `docs/ops/database.md`, `scripts/claude-md-guard.test.js`. None is scope creep: the first two were
  pulled in by review findings that this cycle had made their sentences false, the third because adding
  the new guard's index line required raising its pinned block size. The real lesson is about planning:
  **a cycle that modifies the description of itself cannot know its File Structure in advance.**
- **`CLAUDE.md` headroom is 415 B** (63,585 of 64,000 LF). Measured regrowth is +955 B/cycle, so this is
  less than half a cycle. The guard's comment used to claim "~2 cycles" and now states the real figure.
  Because Gate 5 runs `npm test` *after* the merge, the next `/sync-docs` that adds an index line can
  turn the suite red **on `main`**. Backlog item: reshape the ceiling so the ~20 KB of irreducible index
  is budgeted apart from the ~43 KB of narrative it currently squeezes.
- **A time-based DB backup is now an open item.** Gate 4's snapshot is conditional on the stack being
  touched, which is the right trigger for that gate, but it means merge frequency no longer produces a
  periodic dump. `backups/` is local, gitignored and holds 3 dumps — it was never disaster recovery.
- **`docs/handoff-cold-review.md:105` lists three guards and omits two.** Stale before this branch (it
  already missed `doc-paths-guard`), so deliberately not fixed here. No guard catches it.
- **Four review rounds, and the mechanism was named.** 13 → 7 → 8 → 3 findings, with most of each round
  created by the previous round's own fixes. The round-3 reviewer's diagnosis: *each fix was scoped to
  the line the finding cited, not to the predicate that line asserts.* Before the fourth fix pass the
  cycle ran four mechanical checks over the whole live repo — grep every touched predicate, re-measure
  every number at HEAD, `git log` every SHA and cycle-adjacency claim, re-check enumerations as a class
  — and **all four of those defect classes went clean and stayed clean**, confirmed independently. What
  survived was judgement prose no grep reaches. **This is direct field evidence for backlog item M5**,
  and it argues for specifying M5 as exactly that list of checks rather than a vaguer "pre-check".
- **One line was rewritten three times and broke every time** (`PROCESS.md` §6b's class-A bullet), always
  by reaching for exhaustiveness; the third version contradicted itself mid-clause. What held was
  **shortening** it to the rule plus one counterexample. A normative line that tries to be exhaustive
  over a multi-way taxonomy fails on each rewrite; the cure is deletion, not another clause.
- **The command text governing this run was the pre-merge version**, loaded from the main checkout — so
  this cycle's own changes (automatic restart and branch deletion, the conditional backup, the slimmer
  Gate 6) take effect from the *next* cycle, not this one. Gate 4 step 9 therefore still asked.

## Sync-docs outcome

- **ARCHITECTURE.md** — no change needed at Gate 5: the scripts listing and the Docker main-stack
  safety note were both corrected on the branch, by review findings. No route, table or column was
  added, so `architecture-guard`'s §5/§6 scope was not engaged.
- **CLAUDE.md** — no change needed at Gate 5: the new guard's File structure index entry, the rule-3
  derogation, the conditional-backup wording and the approvals override all landed on the branch.
- **TEST_CASES.md** — not applicable. No user-facing behaviour changed; this cycle touches the
  development process and its guards only.
- **test-api.js** — not applicable. No API endpoint added or changed, no auth rule touched.
- **PRD.md and `docs/prd/`** — **evaluated, not necessary (internal-only change).** Nothing a user of
  PDash can do, see or experience is different: no page, control, flow, permission or visible text
  changed. The whole diff is development process, documentation and one test file.
- **`.claude/skills/operational-manual/SKILL.md` §5b** — not triggered, since no PRD file was touched.
- **PROCESS.md gate — condition 3 applied** ("modified the common skeleton, or the gates of
  `/finish-cycle`"): this cycle changed Gate 3, Gate 4, Gate 5 and Gate 6, and added §6b. The update was
  made **on the branch**, not at Gate 5, because the gate texts themselves were the deliverable.

## Memory outcome

Three files changed, one index updated. No item left unverified.

- **`project_merged_process_backlog.md`** — *before:* item 2 "M7 — economy of approvals. ← NEXT",
  item 3 "M1 — retroactive measurement". *After:* M7 struck through and recorded as merged 2026-10-13
  `d2b0595` with what it actually delivered (more than the backlog text: §6b, the guard, the Gate 4
  derogation) and a pointer to this report; **M1 is now NEXT**. Added a paragraph recording that M7
  settled the "self-inflicted findings" question and ran M5's idea as a successful experiment, with the
  four checks named so M5 can be specified from them. Added the two new backlog items split out of this
  cycle (reshape the `CLAUDE.md` ceiling; time-based DB backup).
- **`project_claudemd_doc_split.md`** — *before:* the ceiling was described only as "guarded", with the
  guard's own "~2 cycles of headroom". *After:* a new block recording that the ceiling is now the
  binding constraint (415 B against +955 B/cycle), that its *shape* is the real defect (index summed
  with narrative) and is an open backlog item, and that the ceiling must not be paid by compressing
  existing prose — deletion and relocation are safe, and shortening prose written in the same cycle is
  fine.
- **`feedback_doc_split_prose_claims.md`** — *before:* four surfaces, ending at "fix the predicate, not
  the list". *After:* a fifth surface added — the same pattern at scale (4 rounds, 31 findings), the
  reviewer's one-sentence diagnosis, the three concrete instances, the **four mechanical checks** that
  closed those classes, and the half they cannot reach: a normative line reaching for exhaustiveness
  breaks on every rewrite.
- **`MEMORY.md`** — the three corresponding index lines rewritten to match.
