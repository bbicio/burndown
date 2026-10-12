# Finish-cycle report — worktree-worktree-process-md-self-description

**Date:** 2026-10-12
**Branch:** worktree-worktree-process-md-self-description → main
**Execution started:** 2026-10-12 16:00  (pre-flight step 6)
**Merged at:** 2026-10-12 16:32  (Gate 4's merge commit `a31a2f9`)
**Gate durations:** Gate 1 3m · Gate 2 2m · Gate 3 25m · Gate 4 3m · Gate 5 13m — total 46m
<!-- Wall-clock, human wait time included (pre-flight step 6). Gate 3's 25m covers three review
     rounds (background agents: 8m, 5m, 3m), two user decisions and two fix passes with a full
     suite run each. Gate 2's figure is small for a post-2026-10-08 cycle because the no-code
     branch asks one question and creates no Docker stack; the background review it launched is
     billed to Gate 3, where it was collected. -->

## What was done

5 commits, 5 files, +30/−24 — prose only, no code.

- `10eb3d9` docs: one numbering scheme for PROCESS.md section 6 (F8)
- `1cd3743` docs: section 1 describes finish-cycle's real gates (F7)
- `4d7cceb` docs: one citation form for PROCESS.md's sections
- `bcdad8d` docs: apply the Gate 3 round-1 review findings (F-1..F-6)
- `9257628` docs: apply the Gate 3 round-2 findings, and reopen F-8

Cycle 2 of the four derived from `docs/superpowers/audits/2026-10-12-process-construct-cold-review-audit.md`
(findings **F7** and **F8**), and item 1 (**CR2**) of the merged process backlog. Brief
`docs/superpowers/briefs/2026-10-12-process-md-self-description-brief.md`, spec
`docs/superpowers/specs/2026-10-12-process-md-self-description-design.md`, plan
`docs/superpowers/plans/2026-10-12-process-md-self-description.md`.

What changed in substance:

- **§6 now has one numbering scheme.** The bold points became `### 6.1 … ### 6.5` (with `6.4b`,
  `6.4c`), `## 6.6` was demoted to `### 6.6` inside §6, and its five inner points became
  `#### 6.6.1 … 6.6.5`. Every citation that existed before still resolves, and `§6.6.5` now resolves
  to a heading instead of to a position in a count.
- **The `## 4b.` ↔ `### 6.4b` collision** was closed by a **citation rule** stated once in the
  opening blockquote — a reference is always written in full (`§4b`, `§6.4b`, `§6.6.5`), never a bare
  "4b". Moving `## 4b.` to `## 8.` and renumbering §6 without letter suffixes were both evaluated and
  rejected; the second would have silently repointed `§6.5` at the wrong content.
- **§1's `/finish-cycle` row** is a `<br>`-separated bullet per gate, transcribed from the command
  rather than summarised from memory. It now carries the three Gate 4 steps it omitted (the automatic
  `scripts/backup-db.sh` **before** the merge, the migration apply, the backend restart as a human
  gate whose "no" leaves backend code merged but not live), Gate 5's blocking `npm test`, the
  existence of §4b, and the branch-deletion gate.
- **Five citation forms** were converted to `§6.4b`/`§6.4c`: `PROCESS.md` ×3 (two `§6 4c`, one
  "punto 4b"), `CLAUDE.md:58` and `.claude/commands/finish-cycle.md:30`. Two more, in
  `docs/handoff-ciclo4.md` and `docs/handoff-ciclo5.md`, were found by the review.

### The fidelity proof (the plan's point 4 — the itemised exception list)

A throwaway script in the scratchpad compared the **normalised** non-empty line multiset of
`PROCESS.md` before and after (leading `#`s, `**`, the leading numbering token and the trailing period
stripped, whitespace collapsed; the three heading-plus-body splits re-joined with `". "`). It was
validated before use with a positive control (0/0 on an unchanged file) and a negative control (1/1 on
one changed word) — the first attempt at that negative control silently changed nothing and reported a
false pass, which is why the control is in the record.

Final result: **6 lines gone, 7 added, everything else byte-identical after normalisation.** The
complete list, each with its reason:

| line | change | why |
|---|---|---|
| `---` (ex `:176`) | removed | it separated §6 from `## 6.6`, which is now a subsection of §6 |
| `:26` → `:28` | §1's `/finish-cycle` row rewritten | F7, plus the bullet form and the review's fixes |
| `:118` | `§6 4c` → `§6.4c` | one citation form |
| `:164` | "il punto 4" → `§6.4` | a reference **this cycle broke** by renumbering; found by the review |
| `:175` | "punto 4b" → `§6.4b` | a form the spec's list did not have |
| `:178` | `§6 4c` → `§6.4c` | one citation form |
| `:7` (new) | `>` + the citation rule | the only sentence this cycle adds |

No rule was "said better", no dated passage compressed, no lesson from current experience added.

## Code review follow-ups

Three rounds, all scoped per `PROCESS.md` §6.4 (round 1 whole-branch from Gate 2's background launch;
round 2 `4d7cceb..HEAD`; round 3 `bcdad8d..HEAD`). 8 findings in round 1, 2 in round 2, **0 in round
3**. Six of round 1's and both of round 2's were fixed; the rest:

- **Round 1, F-7 (nit) — accepted as follow-up, not fixed.** `.claude/commands/finish-cycle.md:12`
  writes "PROCESS.md §6/§6.6". It resolves under the new scheme and now reads as section-and-subsection
  rather than two siblings, so the pair looks redundant rather than wrong.
- **Round 1, F-8 — half fixed, half declined.** The cell's Gate 4 chain stopped at "pulizia worktree".
  Round 2 re-raised it with a new argument — step 9 ("Delete the local branch? [yes/no] — no default
  either way") is an **explicit human gate**, and the same cell opens by asserting that every judgment
  gate always stops — so the chain now ends at the branch deletion. The CWD safety check (step 4)
  stays out, as the spec decided: it is plumbing.
- **Round 3 addendum (low) — accepted as follow-up.** Inside the Gate 4 chain the DB backup carries its
  own "automatico" marker while "applicazione delle nuove migrazioni" carries none, although it is the
  one step in that chain that mutates the real schema without asking. It arrived **after** the user had
  approved the merge diff, so it was deliberately not applied: adding a sixth commit after the
  approval would have meant merging a tree the user never saw. One-word fix (`automatica`) available
  as a standalone commit.
- **Not this cycle's to fix:** `docs/superpowers/briefs/2026-10-12-reviewed-sha-definition-brief.md:31`
  (the M3 cycle's own brief) still writes "`PROCESS.md` §6 punto 4b". It resolves, and briefs are
  archival; M3 should write it as `§6.4b`.

## Roadmap notes

- **Gate 2 took the no-code branch.** `node scripts/classify-cycle.mjs` returned `no-code` for the
  three paths (`.claude/commands/finish-cycle.md`, `CLAUDE.md`, `docs/superpowers/PROCESS.md`), the
  user confirmed the classification, and **the browser question was therefore not asked**. No test
  environment was created; `scripts/test-branch.sh status` reported `down`, so nothing was left
  running and nothing was torn down.
- **Gate 4's out-of-scope check did not fire**, because the no-code branch skips steps 2-5 and no plan
  file is identified. Recorded here rather than lost: the plan's declared File Structure was
  `PROCESS.md`, `CLAUDE.md` and `.claude/commands/finish-cycle.md`; the two files beyond it,
  `docs/handoff-ciclo4.md` and `docs/handoff-ciclo5.md`, were added by review finding F-5.
- **Neither documentation guard reads `PROCESS.md`.** `scripts/lib/live-docs.mjs` has
  `docs/superpowers` in `SKIP_DIRS`, so a green `npm test` says nothing about this cycle's main file —
  its cited paths (`scripts/run-tests.sh`, `scripts/test-branch.sh`, `scripts/classify-cycle.mjs`,
  `scripts/backup-db.sh`, `api/src/db/migrations/`, `docs/superpowers/reports/`) were verified by hand
  instead. The audit already noted that nothing checks `PROCESS.md`'s internal `§N` pointers; this
  cycle's F-1 is the first measured instance of that debt biting, and both remain declared debt.
- **A measurement correction to this cycle's own spec.** Spec §2 listed `docs/pages/portfolio.md:112`
  among the live `§6.3` citations of `PROCESS.md`. It is not one: the line reads "per spec §6.3" and
  means that cycle's own design spec. The spec's list is one item long; nothing needed fixing in the
  file.
- **`<br>` in a table cell is a new form for this file.** Nothing in `npm test` renders Markdown, so
  the §1 row's rendering rests on a read of the raw cell (3 pipes, 6 `<br>` for 6 bullets, Gate 1→6
  order) and on the reviewer's independent check. Worth a glance on GitHub.

## Sync-docs outcome

- **ARCHITECTURE.md** — not touched. No module, endpoint, schema or migration changed; §5/§6 are
  unaffected, and `scripts/architecture-guard.test.js` was green at Gate 1 anyway.
- **CLAUDE.md** — not touched at Gate 5. Its one edit (`§6 point 4c` → `§6.4c` at `:58`) was made on
  the branch, where it belongs: no file was added, removed or repurposed, so the File structure block
  and the Pages table are unchanged. `scripts/claude-md-guard.test.js`'s exact 13,156-LF-byte pin is
  untouched (the edit is at line 58, outside the fenced block) and the file shrank by 6 bytes against
  a 64,000 B ceiling.
- **TEST_CASES.md** — not touched. No user-facing behaviour changed, so there is no case to add or
  amend.
- **test-api.js** — not touched. No endpoint, no auth rule.
- **PRD.md and `docs/prd/`** — **evaluated, not necessary.** This cycle changes only how the
  development process documents itself. No page was added or removed, no control a user can see or
  click changed, nothing in §3 Views and Navigation moved. Not an ambiguous case.
- **`.claude/skills/operational-manual/SKILL.md`** — not touched, correctly: §5b triggers only when
  `PRD.md` or a `docs/prd/` file was updated, and none was.
- **PROCESS.md gate — none of the three conditions applies.** (1) No process skill was introduced or
  modified. (2) No recurring exception was introduced. (3) The 7-phase skeleton and the three
  scenarios' guardrails are **unchanged in substance**: this cycle corrected the document's
  *description* of gates that already behaved that way, which is the cycle's own deliverable rather
  than a `/sync-docs` output. So `PROCESS.md` was not edited at this gate, even though it is the file
  the cycle is about.

## Memory outcome

- `project_cold_review_fix_cycles.md` — "**NEXT = cycle 2.** Cycle 3 = F5+F6, cycle 4 = F3" →
  "**Cycle 2 … is MERGED, 2026-10-12, `a31a2f9`**" with what it shipped and what binds later cycles
  (the full-form citation rule, §6's headings, the declared debt), and "**NEXT = M7**". The
  description line and the "why not a full rewrite" paragraph were updated with this cycle's measured
  finding counts (8 / 2 / 0).
- `project_merged_process_backlog.md` — item 1 (CR2) struck through and marked merged; **M7 marked as
  NEXT**; the "60-70% self-inflicted findings" paragraph updated with this cycle's 3-of-10 figure
  (n=3, still not confirmed); M6 gained CR2 as a data point for the Light-path question.
- `feedback_doc_split_prose_claims.md` — a **fourth surface** appended: the sweep you design is itself
  a claim (a renumbering breaks references in forms your grep cannot see — five forms were in
  circulation where the brief said three), and when an "only" sentence is false, fix the predicate
  rather than widening the list, or the fix generates the next round's finding, as it did here.
- `MEMORY.md` — the three corresponding index lines rewritten.
- **Nothing left unverified.** Every change above rests on a fact the merge establishes (the merge
  hash, the report path, the review's own finding counts) or on a decision taken explicitly in this
  session.
