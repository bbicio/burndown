# Finish-cycle report — m3-m2-process-dedup

**Date:** 2026-10-13
**Branch:** m3-m2-process-dedup → main
**Execution started:** 2026-10-13 18:19  (pre-flight step 6; branch work itself began 18:06)
**Merged at:** 2026-10-13 22:48  (Gate 4's merge commit `3760f1f`)
**Gate durations:** Gate 1 4m · Gate 2 3m · Gate 3 4h20m · Gate 4 2m · Gate 5 18m — total 4h47m
**Claims pre-check:** At Gate 1 it cost ~3 minutes and caught 3 defects, committed as `a0a7841` — one
enumeration-as-a-class (the new routing table read as a complete source→destination map, and its
`<name>.md` rows have two live counter-examples) and two false predicates; the same four checks had
already caught 2 more in the implementation pass before the first commit. At the Gate 3 re-checks it
cost ~8 minutes across five rounds and caught 5 defects in this cycle's own fixes before any reviewer
saw them: a false adjacency ("the audit counted 65 a month earlier" — it is one day old), an
antecedent orphaned by a paragraph split, two counter-example file paths that do not exist (which
`doc-paths-guard` then confirmed), a wrong ordinal ("step 0's third bullet" — it is the fourth), and
an insufficient first fix for round 4's finding 1 that only moved the defect instead of removing it.
Of round 1's 5 findings, **4 were mechanical** — they fall in the pre-check's own four classes and the
Gate 1 pass did not catch them. Across all five rounds, 19 findings were confirmed (5, 5, 3, 4, 2) and
7 of those were created by a previous round's own fixes.

## What was done

9 commits.

- `82f7c18` process: M3 — one definition of `<reviewed-sha>`, and name both licensed teardowns
- `79d72ad` process: M2 — one copy of the §7 rule, routing as a table, Gate 4 out-of-scope on the Spec, two guard precisions, npm test deduped
- `a0a7841` docs: apply Gate 1 claims pre-check findings (3)
- `ad84bcf` docs: fix a false adjacency claim and a stray blank line
- `cc532a7` docs: apply Gate 3 round-1 findings (5), four of them mechanical
- `8fa7742` docs: apply Gate 3 round-2 findings (5) + the guard brief's criterion-4 test
- `99cc70f` docs: apply Gate 3 round-3 findings (3 of 4; the fourth rejected on measurement)
- `fc8e9a0` docs: apply Gate 3 round-4 findings — fix the two that are ours, subtractively
- `c142b87` docs: apply Gate 3 round-5 findings (2), both as deletions

All seven handoff points delivered. **M3** — one `<reviewed-sha>` definition at Gate 2 step 0 cited by
its three other uses, and the teardown preamble now naming both licensed `down` points instead of
claiming one. **M2** — the §7 update-criterion rule reduced to one copy in the sync-docs skill with
§7 pointing at it (conditions 1 *and* 3 repaired), the sync-docs routing rule as a table, Gate 4's
out-of-scope check falling back to the Spec when there is no Plan, `claude-md-guard`'s pointer targets
narrowed from every bold span to a one-entry allowlist, `architecture-guard`'s header gaining its
fourth named limit, and the coordinator's end-of-execution full `npm test` dropped in favour of Gate 1
plus Gate 5 — justified as simplification, never as time saved.

## Gate outcomes

- **Gate 1:** passed. Claims pre-check ran (3 defects, committed), `npm test` green at 48 files / 1014 tests. No `api/` paths, so `scripts/run-tests.sh` was correctly skipped.
- **Gate 2:** `node scripts/classify-cycle.mjs` → `ordinary`, driven by the two `*.test.js` files. Declared **§3 derogation** (see Roadmap notes): no isolated stack, browser question not asked. Step 5 found no spec/plan candidates.
- **Gate 3:** 5 rounds — 5, 5, 3, 4, 2 confirmed findings. Round 3 hit the default 3-round cap; the user chose option (a), continue. Round 5 was scoped to the fix commit only. 2 findings carried as follow-ups by the user's decision; the rest fixed. One round-3 finding and one round-4 finding were **rejected on measurement** rather than fixed.
- **Gate 4:** merged as `3760f1f`, a true merge commit via `--no-ff` (`main` had not diverged). DB backup correctly skipped — the diff adds no migration and touches no `api/`, so neither stack-touching moment occurs. No migration apply, no `pdash-api` restart, no worktree cleanup. Branch deleted.
- **Gate 5:** `/sync-docs` touched no repo file; 3 memory files plus the index updated. `npm test` green.

## Code review follow-ups

- **Round 4, finding 3** — `.claude/skills/sync-docs/SKILL.md`, the routing table's services row covers only `api/src/services/`'s index, `email.js` and `jwt.js`, while seven further modules in that directory (`llm.js`, `planning-assistant.js`, `planning-data.js`, `profile-engine.js`, `profile-worker.js`, `resource-matching.js`, `topic-extraction.js`) are already documented in `docs/api/services.md` and match no row. Inherited verbatim from the pre-table prose; the table form is what makes it read as exhaustive. Partly mitigated by the non-exhaustiveness sentence added at Gate 1, which routes a run to look for an existing `docs/` file first.
- **Round 4, finding 4** — same file: the new precedence rule ("the more specific row wins") does not break a tie between two *non-pattern* rows, which is the `js/lib/cg-controls-calc.js` case. The convention actually in force is neither row but a split entry — index in `docs/js/lib.md:176-178`, narrative in `docs/js/cg-controls.md`.
- **Round 3, finding 4** — rejected as a regression but real as a **pre-existing** limit: `claude-md-guard`'s bold-span regex caps at 120 characters and its matching is one-directional (`t.startsWith(name)`), so a verbatim citation of the full 138-character `Infrastructure safety — Docker commands…` label cannot resolve, on `main` or now. Worth a future brief; not touched here because this cycle's briefs forbid fixing new findings in-cycle.

## Roadmap notes

- **Gate 2 took a declared §3 derogation.** `classify-cycle.mjs` correctly returned `ordinary` — the rule is the path list and two paths are `.js` — but nothing in the diff is served by nginx or executed by the API, so no stack was created and the browser question was not asked. This is PROCESS.md §6.4c's symmetric case, now seen a third time (cycle 5, cycle 6, this one). §6.4c says that if it becomes frequent the answer is a differently-worded Gate 2 question, not a wider classifier. Three occurrences is arguably frequent.
- **Gate 4's out-of-scope check did not fire, on the *ordinary* branch.** Step 5 found zero spec/plan candidates, which is the second case the extension written in this very cycle names. The extension is therefore honest about its own reach here.
- **Gate 2's spec/plan archaeology has no pattern for `docs/superpowers/briefs/`** — the string appears nowhere in `/finish-cycle`. This cycle's governing artefacts were two briefs, `2026-10-12-reviewed-sha-definition-brief.md` and `2026-10-12-guard-matcher-precision-brief.md`, both already on `main`. Neither could be found by steps 2-5, and the handoff did not mention them. The first implementation of M3 broke one brief's acceptance criterion 2 and had not met the other's criterion 4; both were recovered only because the review ran. Candidate fix: add `briefs/` to the step 2-4 search, or make the handoff-writing step list them.
- **The handoff carried three defects of its own**, each of which became a review finding: "the audit counted 65 a month earlier" (one day), "1-2 min across 7 cycles" attributed to an audit that says 5 (the 7 is from a different document), and the instruction to write that scoping `architecture-guard`'s §5 match needs the parser cycle 5 declined — measurement says §5 has 38 openers, 38 closers and 38 migration-created tables, one-to-one, so a block-scoped match is feasible and only the *generator* stays refused. Re-measuring inherited numbers and opening the cited file are the two cheap preventions.
- **Where the findings actually live.** Every one of the 19 landed on a sentence explaining *why*, never on an instruction saying *what to do*; the instructions were stable from round 2. What converged the cycle was writing rounds 4 and 5's fixes as **deletions** — a deletion adds no new falsifiable claim, so the next round has nothing in the fix to find.
- **Reading the flat round count.** Split by origin, this branch's own defects fell 5 → 4 → 2 → 2 while inherited-prose findings rose 0 → 1 → 1 → 2: 2 of round 4's 4 were verbatim from `main` and three earlier reviewers had not flagged them. Re-reviewing the whole branch each round hands each fresh reader the same large pre-existing prose. Scoping round 5 to the fix commit ended that and returned the substance verified clean.
- **Input for §6.4d's three-cycle decision, this being the second cycle.** The Gate 1 pass caught 3 and missed 4 findings of its own four classes; the per-round Gate 3 re-check caught 5, all in this cycle's own fixes, before any reviewer saw them. On this cycle's evidence the leverage is in the per-round re-check, not in the Gate 1 pass.

## Sync-docs outcome

- **ARCHITECTURE.md — not updated, correctly.** No module, endpoint, table, column or frontend behaviour changed. Its `scripts/` tree entries describe each guard by what it fails on (unchanged — `architecture-guard` still fails on undocumented routes/tables/columns, `claude-md-guard` still fails on the ceiling and on dangling pointers) and point at each file's own header for limits, which is exactly where this cycle's new limit went.
- **CLAUDE.md — not updated, correctly**, for the same reason: both guard entries state what the guard fails on and defer limits to "own header". No new file, so no new index line and the 415 B ceiling headroom is untouched.
- **TEST_CASES.md — not updated.** The two tests added are documentation guards, not product behaviour, and this file's case and section counts are pinned exactly.
- **test-api.js — not applicable.** No endpoints added, no auth rules changed.
- **PRD evaluated: not necessary (internal-only change).** `PRD.md` and every `docs/prd/` file were considered and left untouched — process documentation and dev-only guard tests are explicitly in this command's do-not-trigger list, and nothing a user can see or click changed.
- **5b — not applicable**, since no PRD file was touched.
- **PROCESS.md gate: YES, condition 3** — the cycle modified `/finish-cycle` gates (the Gate 2 teardown preamble, the Gate 3 collection paragraph, Gate 4's out-of-scope check) **and** a `/sync-docs` output. This is the very clause the cycle restored to the gate, which had been dropped when the two §7 copies were merged earlier the same day. PROCESS.md was already updated on the branch (§5, §6.2, §6.4c, §7), so nothing was left for this step; §1's gate table and §6.4b were re-checked and remain accurate.

## Memory outcome

Memory: 3 files changed plus the index.

- `project_merged_process_backlog.md` — "M5 is done … **M3 is next**" → "M5, M3 and M2 are done … **M1 is next**, then M4 → M6", recording that M3 and M2 merged together as one cycle at the user's call. Items 4 and 5 struck through with `3760f1f` and this report's path; item 5 now carries the two corrections later cycles must respect (the tie-break is the **latest** whole-branch HEAD, and Gate 3's condition turns on the launch HEAD, never on `<reviewed-sha>`). The "1-2 min across **7** cycles" figure corrected to 5 in both places it appeared, naming the document the 7 actually comes from. A new paragraph amends the "no §5 parser" ruling: the generator stays refused, block-scoping is feasible and merely out of scope.
- `project_cold_review_fix_cycles.md` — "cycles 3-4 ride inside M2/M3 … **NEXT = M7**" → all four cold-review fix cycles closed with `3760f1f`, plus the direction chosen for each of F5 and F6 (both were posed as open design decisions, not determined fixes) and "**NEXT = M1**".
- `feedback_doc_split_prose_claims.md` — added a seventh surface: a handoff's inherited numbers are claims you now own, and the defects sit in the rationale rather than the rules, so the fix that converges is deletion. Plus the origin-split reading of a flat round count, and `ls docs/superpowers/briefs/` before writing code from a handoff.
- `MEMORY.md` — the three corresponding index hooks rewritten.
- **One correction made during this step:** the seventh-surface entry and its index hook first said "21 confirmed findings"; recounting for this report gave 5+5+3+4+2 = **19**, and both were fixed. Memory sits outside the repo, so no guard would ever have caught it — it would simply have become the next handoff's inherited number, which is the defect this very surface is about.
