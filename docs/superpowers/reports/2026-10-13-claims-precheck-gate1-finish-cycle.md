# Finish-cycle report — claims-precheck-gate1

**Date:** 2026-10-13
**Branch:** claims-precheck-gate1 → main
**Execution started:** 2026-10-13 15:30  (pre-flight step 6)
**Merged at:** 2026-10-13 17:39  (Gate 4's merge commit `5b83b45`)
**Gate durations:** Gate 1 2m · Gate 2 8m · Gate 3 119m · Gate 4 1m · Gate 5 11m — total 141m
**Claims pre-check:** ~1m at Gate 1, 1 defect (a false "the suite still runs once" predicate — Gate 5
step 3 runs it too); ~5m across the five Gate 3 re-checks, 1 defect (a one-sentence fix asserting that
native execution produces no whole-branch review, which §6.4 contradicts) — caught before that commit
was made. Round 1: 5 findings, 0 of them mechanical.
<!-- Wall-clock, human wait time included (pre-flight step 6). Write `unknown` for a gate whose
     timestamp was not captured; a gate that self-skipped gets `0m (skipped)`.
     Since 2026-10-08 the code review runs in the background during Gate 2, so Gate 2's figure
     absorbs most of it and Gate 3's covers the findings discussion and any fixes — these two
     gates' numbers are not comparable with cycles closed before that date, and the split
     between them is approximate.
     Gate 1's own figure changed meaning on 2026-10-13: it now absorbs the claims pre-check (step 0,
     capped at 10m), so a rise in it across the report series is not the test suite getting slower.
     The claims pre-check line is Gate 1 step 0's own measurement (PROCESS.md §6.4d). It is prose,
     not slots: a cycle where part of it did not happen says so instead of filling a field with a
     zero that would later read as a measurement. Keep the Gate 1 and Gate 3 figures distinct —
     one mechanism's catch must not vouch for the other's. Read after three cycles, by judgement;
     there is deliberately no formula, and §6.4d says why. -->

## What was done

7 commits.

- `4bd7305` docs: add the mechanical claims pre-check as Gate 1 step 0 (M5)
- `bde9b25` docs: claims pre-check — "still runs once" was false at cycle scope
- `9f1672f` docs: apply Gate 3 round-1 findings (5)
- `ac64a98` docs: apply Gate 3 round-2 findings (8), two of them self-inflicted
- `f4a099a` docs: apply Gate 3 round-3 findings (6), past the 3-round cap
- `a251d10` docs: apply Gate 3 round-4 findings (6), plus one its own fix created
- `f1bc44d` docs: apply Gate 3 round-5 findings (5), closing the gate

Backlog item **M5**. `/finish-cycle`'s Gate 1 gains a step 0: over the `*.md` lines the branch changed,
four mechanical checks — grep every touched predicate, re-measure every number at HEAD, `git log` every
SHA and adjacency claim, re-check enumerations as a class — applied and committed without asking, before
`npm test`. The same four re-run before each Gate 3 review round (followed by the tests covering what
that round changed) and over step 0's own fix pass before it is committed. `PROCESS.md` §6.4d is the
rule; §1's gate table carries both halves.

**It is at Gate 1, not at Gate 3's head as the backlog wording said.** Round 1 is launched in the
background at Gate 2 step 0 (§6.4b), so a pre-check at Gate 3 could only duplicate findings the reviewer
already had — never prevent them, and never be measurable against them.

**The exit criterion is deliberately unquantified.** Two arithmetic versions were written and deleted
inside this cycle: the original "a third of the findings round 1 would have produced" is a counterfactual
no field can measure, and its computable replacement `2D ≥ M` mixed two populations and was satisfied by
`0 ≥ 0` — the case where the step does nothing. The report records prose; the decision is taken after
three cycles by reading it.

## Gate outcomes

- **Gate 1:** passed. Step 0 ran for the first time (1 defect fixed), then `npm test` green (48 files,
  1014 tests). No `api/` path in the diff, so `scripts/run-tests.sh` was not run.
- **Gate 2:** no-code branch (`node scripts/classify-cycle.mjs` → `no-code`), classification confirmed by
  the user. `/code-review` launched in background at step 0 over `bde9b25`. `scripts/test-branch.sh
  status` → `down`: no stack running, nothing reported, nothing torn down.
- **Gate 3:** 5 rounds — 5, 8, 6, 6, 5 findings, 30 in total, all fixed, none deferred. The 3-round cap
  was reached and the user chose to continue twice, then to close the gate at round 5.
- **Gate 4:** merged, true merge commit `5b83b45`; pushed with `8643cf9` (an unrelated audit-header
  correction already on `main`). No DB backup — the diff adds no migration and touches no `api/` path,
  so nothing in the gate went near the stack. No migration apply, no `pdash-api` restart, no worktree
  cleanup. Branch deleted.
- **Gate 5:** `/sync-docs` left the repo untouched (see below); report written; two memory files updated.

## Code review follow-ups

None. All 30 findings across the five rounds were fixed in-cycle.

## Roadmap notes

- **Gate 2 took the no-code branch.** The browser question was not asked, no plan file was identified,
  and therefore **Gate 4's out-of-scope check did not fire** (§6.4c requires recording this).
- **Five rounds for ~40 lines of prose, with most of each round created by the previous round's fixes.**
  This is the cycle's most useful output and it is uncomfortable: the step was built to stop exactly that
  mechanism, and it did not stop it in its own cycle. What the pre-check did catch was mechanical (2
  defects, both real); what kept the rounds going was *judgement* prose — justifications that were true
  of the case at hand and false in general, and enumerations elsewhere that a fix silently invalidated.
  Severity fell every round (round 5 found no false repo claim at all); the count did not. Recorded as
  the sixth surface in the `feedback_doc_split_prose_claims` memory.
- **One `npm test` run went red and is recorded as a flake, not buried.** At 17:06 the suite reported
  4 failed / 9 errors with only 39 of 48 files *collected*; two subsequent runs were fully green
  (48/48, 1014 tests), and the diff touches no JS. Three review agents had been running alongside, which
  fits the partial collection. If it recurs on a clean machine it is not a flake and needs a look.
- **`PROCESS.md` §6.2 is stale about where the full suite runs** — "una volta a fine esecuzione, nel
  coordinatore, e poi al Gate 1" omits Gate 5 step 3, which has been a blocking full run since
  2026-10-12. Pre-existing, outside this cycle's diff, deliberately not fixed here.
- **`docs/handoff-cold-review.md:105` still lists three guards and omits two.** Carried over unfixed from
  the M7 report; no guard catches it.
- **A1 is closed and verified** (first action of this session, outside the cycle): only
  `superpowers@superpowers-marketplace` 6.4.2 is enabled, and the `brainstorming` skill loaded in this
  session from `…/superpowers-marketplace/superpowers/6.4.2/…` — an in-session proof, not just config.
  The archived audit's header was corrected in `8643cf9`, which also deleted the two untracked loose
  copies of the audit and the improvement notes.

## Sync-docs outcome

- **ARCHITECTURE.md** — not updated. No module, endpoint, table or migration changed; its only two
  `/finish-cycle` references (the Docker safety note, and `classify-cycle.mjs`'s role in Gate 2) are
  untouched by this cycle.
- **CLAUDE.md** — not updated. No file added or removed, and CLAUDE.md does not describe Gate 1's
  internals (`grep "Gate 1"` returns nothing). Deliberately nothing added: 415 B of headroom.
- **TEST_CASES.md** — not updated. No user-facing behaviour changed.
- **test-api.js** — not updated. No endpoint and no auth rule changed.
- **PRD.md + docs/prd/** — **evaluated, not necessary.** The change is to the development process; no
  page, control, flow or permission a user can see or click is affected.
- **`operational-manual` detail reference (§5b)** — not applicable; no PRD file was touched.
- **PROCESS.md gate: condition 3 applies** — the cycle modified the gates of `/finish-cycle`. §6.4d and
  §1's gate table were therefore written **on the branch**, not here, and are part of the merged diff.

## Memory outcome

- **`project_merged_process_backlog.md`** — *before:* item 7 "M5 — mechanical pre-check of claims before
  Gate 3 round 1 (D5)", and the 2026-10-13 re-ordering paragraph reading "M5 → M3 → M2 → M1 → M4 → M6"
  with M5 as next. *After:* item 7 struck through as MERGED 2026-10-13 (`5b83b45`) with the report path,
  where it actually landed and why (Gate 1, not Gate 3's head), the deliberately unquantified criterion
  and the two deleted arithmetic versions, and the 5-round / 30-finding cost; the ordering paragraph now
  says M5 is done and **M3 is next**.
- **`feedback_doc_split_prose_claims.md`** — *before:* five surfaces, ending at the four mechanical checks
  and the exhaustiveness lesson. *After:* a sixth surface added — a justification is itself a claim, so
  narrowing or widening a check restates it; changing a check makes surrounding enumerations stale,
  including in the same commit; an example offered inside a rule is read as the rule. Plus what worked
  (re-reading your own fix pass before committing, which caught a defect in this very cycle) and what it
  cannot do (stop new judgement prose).
- **`MEMORY.md`** — the two corresponding index lines rewritten to match.
- Nothing left unverified.
