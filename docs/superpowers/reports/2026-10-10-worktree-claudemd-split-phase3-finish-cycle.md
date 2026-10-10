# Finish-cycle report — worktree-claudemd-split-phase3

**Date:** 2026-10-10
**Branch:** worktree-claudemd-split-phase3 → main (merge `639f57a`)
**Execution started:** 2026-10-10 15:31
**Merged at:** 2026-10-10 16:07
**Gate durations:** Gate 1 1m · Gate 2 7m · Gate 3 26m · Gate 4 3m · Gate 5 ~8m — total ~45m
<!-- Wall-clock, human wait time included (pre-flight step 6). Gate 2 absorbed the first background
     review's launch and its death on a rate limit; Gate 3 carries the Sonnet relaunch plus two
     rounds of findings and their fixes, which is where most of the time went. -->

## What was done

Phase 3 — and the last — of the `CLAUDE.md` context-size split. `CLAUDE.md` is the only project
document loaded in full at every session start, so its size is a cost paid **per session**. It was
91,694 B (CRLF) at the start of this cycle, having regrown 2,867 B in the two days since phases 1+2
closed at 88,827 B.

**Result: 91,694 → 62,195 B CRLF (61,999 LF after `/sync-docs`), −32%, ~23k → ~16k tokens per session.**
35,729 B of page- and file-specific narrative moved to the destinations the routing rule already
prescribed, and a guard test now fails when it grows back.

10 commits:

- `f60ee36` docs: spec for CLAUDE.md split phase 3 (cycle 6)
- `474def9` docs: implementation plan for CLAUDE.md split phase 3
- `38c2b3e` docs: move the four pipeline sections to docs/pages/pipeline.md
- `b455b0f` docs: move the two cost-grid editor sections to docs/pages/costgrid.md
- `5fba88e` docs: move the Nav B2 sidebar section to docs/js/nav.md
- `3fa3c57` docs: move the DB migrations table to docs/db/migrations.md
- `8e0dd0e` docs: move the DB backup and recreation procedure to docs/ops/database.md
- `ff84b70` test: guard CLAUDE.md against regrowth and dangling pointers
- `ceb9491` docs: close the Gate 3 findings, including 26 lines moved to the wrong file
- `9d87a66` docs: close the round-2 review findings on the guard header

| Moved | → | LF bytes |
|---|---|---|
| Pipeline board layout, Filter bar, Detail panel, Column header totals | `docs/pages/pipeline.md` | 9,559 |
| Version tab switching, New Proposal / Clone | `docs/pages/costgrid.md` | 6,031 |
| Navigation: sidebar and icon navbar (Nav B2) | `docs/js/nav.md` | 5,029 |
| The 30-row DB migrations table | `docs/db/migrations.md` *(new)* | 8,170 |
| Database backup & full recreation | `docs/ops/database.md` *(new)* | 6,940 |

Each landed under a new `## Current state` section at the top of its destination, above the dated
cycle log, because those files are chronological narratives that previously **delegated current-state
description back to `CLAUDE.md`** — move 4 inverted that contract, so the pointers had to invert too.

**Method.** Moved text was extracted mechanically and never retyped. Each move was proved three ways
against a pre-move snapshot: per-section byte identity in the destination; a **vacuous-comparison
guard** (a deliberate mismatch shown to be detected first, so a comparison incapable of failing could
not pass as success); and an exact **partition** — deleting the hand-written addition from the final
`CLAUDE.md` and putting the lifted block back reproduced the pre-move file byte for byte. The
constraint came from cycle 4's measurement: its verbatim half produced zero findings, its
hand-compressed half produced six.

**Kept inline deliberately:** `Infrastructure safety` (asserted byte-identical to the pre-cycle
original, 2,143 B); the migration run command and the two apply-once backfill warnings (`023`, `027`)
plus the `test-branch.sh` caveat, each lifted verbatim from the table cell it lived in; and an
`Invariants` section for the one rule no test pins.

**The guard, `scripts/claude-md-guard.test.js`:** total size ≤ 64,000 LF bytes (a ceiling), the
`File structure` block pinned exactly, the count of over-2-line entries pinned exactly at 13, plus
pointer resolution both ways. Watched failing on five injected defects, one per assertion.

## Code review follow-ups

Gate 3 ran two rounds, 15 findings, 12 fixed and 3 carried here. Round 1 was relaunched on Sonnet
after the Opus run died on the account weekly limit (HTTP 429, resets 2026-10-14) — per PROCESS.md
§6.4b a dead run counts as **not reviewed**, never clean.

- **(round 2, minor) Commit message figures.** `ceb9491` says "26 lines moved to the wrong file" and
  "3,345 B"; it is **25 lines**, and 3,345 is the CRLF count (3,314 LF). The commit was already
  reviewed at that sha, so it was corrected in `9d87a66`'s message rather than amended.
- **(round 1, minor) `ARCHITECTURE.md` keeps its own parallel migration list** — a third copy of the
  migration index, already missing `027` and `028` before this cycle. Not deduplicated (outside this
  spec's scope, and `architecture-guard.test.js` covers §5's tables/columns, not that list). This
  `/sync-docs` run added a pointer to `docs/db/migrations.md` and an explicit "known to lag" note, so
  a reader is sent to the maintained copy; the dedup itself remains open.
- **(round 1, minor) `api/package.json` has a `"migrate": "node src/db/migrate.js"` script** that runs
  every migration in order, which would re-run the apply-once backfills `023` and `027`. Pre-existing
  and not mentioned anywhere. The wording in `CLAUDE.md` and `docs/db/migrations.md` stays correctly
  scoped to "nothing in the **running app** applies migrations", so neither is false — but the risk is
  undocumented.

## Roadmap notes

- **Acceptance criterion 1 was NOT met, and is restated rather than reworded.** The spec required
  `CLAUDE.md` between 55,000 and 62,000 B; it is **61,999 LF bytes** after `/sync-docs`. Cause: the
  band was computed assuming the whole backup section would move, which review finding C1 proved
  wrong — 3,345 B of testing/tooling rules had to come back. The 64,000 ceiling was deliberately
  **not** raised to absorb it, because raising a limit to fit content is what the rule written into
  `sync-docs` §2 forbids. Real headroom is now ~2 cycles of ordinary growth, not the ~5 KB planned.
  The other five criteria passed.
- **The cycle's worst defect was invisible to its own method.** C1: the Task 5 lift ran from the
  backup heading to `## Architecture` and swallowed 26 lines that are not about databases — the
  `test-branch.sh` usage, the **"No bundler… this must stay true"** rule, the whole frontend vitest and
  backend `node:test` toolchain, and "Still no linter". The byte-identity and partition proofs
  **cannot** catch this by construction: they prove the lifted bytes are faithful, never that the
  boundary was right. Caught only by the whole-branch review. Those paragraphs now have their own
  `### Testing & tooling` heading saying why, so the next lift cannot repeat it.
- **A false claim written by the executor, again.** I1: "no guard test asserts the 14 nav element ids
  as a set" was false — `js/lib/nav-model.test.js:91` pins exactly those ids, and the reviewer
  confirmed by deleting one from `js/nav.js` and watching the test fail. An earlier grep *listed* that
  file and the conclusion was drawn without opening it. The claim reached `CLAUDE.md`, `docs/js/nav.md`
  and two commit messages before being corrected. Same surface as `feedback_doc_split_prose_claims`.
- **Two wrong byte figures, self-caught mid-cycle.** The Task 2 and Task 3 commit messages quoted the
  proof tool's *reverted in-memory copy* as the file's size (76,705 / 71,723 instead of 76,752 /
  72,301). `5fba88e` was amended to state both correct numbers and name `b455b0f`'s error; the tool now
  prints both sizes so they cannot be confused again.
- **Gate 2 took a §3 derogation, agreed explicitly in conversation.** The cycle classifies `ordinary`
  (the `.js` guard), so Gate 2 asked the browser question on a diff containing nothing nginx serves.
  No test environment was created and none was torn down; the classification was confirmed in
  conversation instead. Gate 4's out-of-scope check **did** fire (unlike a no-code cycle) and reported
  one file outside the plan's declared File Structure: `docs/js/lib.md`, the dangling "Filter bar"
  pointer **the new guard found on its own first run**.
- **Gate 3 round 3 was skipped, declared.** The remaining diff was a reworded comment header and a
  one-line note; PROCESS.md §6.4 exists because a review of two trivial commits once cost 18 minutes
  and produced zero changes.
- **Pre-existing pointer rot found and fixed in passing:** `docs/pages/pipeline.md` cited "Column
  totals footer", a section renamed by the 2026-10-06 board redesign and dangling ever since.
- **`docs/superpowers/` was not rewritten** — ~60 references there name moved sections and stay as
  they are: they record what was true when written.
- **Open, not addressed:** the `ARCHITECTURE.md` migration-list dedup; the `migrate` script risk; the
  three items above under follow-ups. Also still open from earlier cycles and untouched here: the
  client-side `CostGrid`/`Project` shapes documented nowhere, `docs/prd/pipeline.md` §4.9's "overlay"
  contradiction, and the `:27`-vs-`:49` teardown contradiction in `finish-cycle.md`.

## Sync-docs outcome

- **ARCHITECTURE.md — updated.** Added `scripts/claude-md-guard.test.js` to the directory tree
  (`scripts/` block), and added a pointer from its `### DB migrations` section to
  `docs/db/migrations.md` with an explicit "known to lag, `027`/`028` missing" note.
- **CLAUDE.md — updated.** One new 2-line `File structure` entry for `scripts/claude-md-guard.test.js`.
  This raised the block from 12,538 to 12,758 LF bytes, so the guard's exact pin was raised in the same
  commit — the allowed kind of growth (a new file needs an index line), and the first real exercise of
  the mechanism this cycle built. The entry is 2 lines, so the over-length count stays at 13.
- **TEST_CASES.md — not updated.** No user-visible behaviour changed and no manual test case applies; a
  guard test is not a manual case. Editing it would also have required re-pinning its exact counts.
- **test-api.js — not updated.** No API endpoint and no auth rule changed.
- **PRD.md and docs/prd/ — evaluated, not necessary.** The cycle moved documentation between files and
  added a dev-only test. No page was added or removed, no control a user can see or click changed, and
  nothing alters what a user can do, see or experience. This is the "internal refactor / dev tooling"
  exclusion, not an ambiguous case.
- **operational-manual SKILL.md — not updated.** Conditional on `PRD.md`/`docs/prd/` being touched;
  they were not.
- **PROCESS.md — updated. Gate answer: conditions 3 and 2 both apply.** Condition 3 on the same reading
  cycle 4 used — the cycle modified an output/rule of `/sync-docs` (§2's routing rule now sends DB
  migrations and the backup procedure to `docs/`, and names the guard test as the enforcement).
  Condition 2 because the situation in the new §6 4c bullet has now occurred twice. Added one bullet to
  §6 4c: a documentation cycle that adds a *guard test* classifies `ordinary` and meets Gate 2's browser
  question with no honest answer — this is **not** to be fixed by widening the classifier's rule, which
  would make it a judge of content; it is a §3 derogation, decided in conversation and annotated.

## Memory outcome

- **`project_claudemd_doc_split.md` — updated.**
  - *before:* "Phase 3 is scoped and user-agreed but NOT started." → *after:* phase 3 MERGED 2026-10-10
    (`639f57a`), with the real numbers (91,694 → 62,195 B CRLF / 61,999 LF, −32%) and the report path.
  - *before:* "Target after phase 3: ~52 KB (~13k tokens)." → *after:* recorded as **not achieved and
    not achievable** — the figure came from an 88.8 KB base and smaller moves; the real landing point is
    ~62 KB, and acceptance criterion 1 was restated as not met.
  - *before:* the open item "`ARCHITECTURE.md`'s own `Directory structure` section is 18.8 KB … natural
    next candidate after phase 3" → *after:* removed as **expired** (cycle 4 took it to 7,684 B).
  - *before:* the open item "`test-cases.html` … is documented nowhere in CLAUDE.md" → *after:* removed
    as **expired** (cycle 3 documents it in the collective `HTML pages` line).
  - *added:* the mitigation that actually held, and the one that did not — the verbatim/partition proof
    caught nothing wrong in the moved text, but is **structurally blind to a wrong block boundary**,
    which is how C1 happened.
- **`project_process_optimization_plan.md` — updated.** Cycle 6 marked DONE with merge `639f57a` and
  the report path; the programme's six cycles are now complete. Recorded that the remaining item is the
  **cold review** of the whole six-cycle construct, which no cycle has had.
- **`feedback_doc_split_prose_claims.md` — updated.** Added this cycle's two instances: the false
  "no test pins this" claim (I1), and the two byte figures quoted from a tool's intermediate output
  rather than the file on disk. Added the generalisation that a proof of *fidelity* is not a proof of
  *scope*.
- **Unverified, left for the user:** whether the `api/package.json` `migrate` script is actually used by
  anyone in practice — the merge establishes that it exists and what it would do, not whether it is run.
