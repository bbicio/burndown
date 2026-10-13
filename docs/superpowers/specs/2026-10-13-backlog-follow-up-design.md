# A tracked backlog for cycle follow-ups — `docs/BACKLOG.md`

Date: 2026-10-13. Scenario 2 (evolution of existing behaviour). No brief: this design came out of the
conversation closing the `m3-m2-process-dedup` cycle, whose own report
(`docs/superpowers/reports/2026-10-13-m3-m2-process-dedup-finish-cycle.md`) is the immediate source of
three of the first backlog entries.

## 1. Problem

`/finish-cycle`'s Gate 5 writes accepted code-review follow-ups into the cycle report and stops there.
The report is a **register** — the persistent record of what happened — and nothing turns it into a
**tracker**. Three consequences, all of them present today:

- No file in the repository lists open work. `ls docs/` has no backlog, roadmap or todo.
- The only ordered list of open work (`project_merged_process_backlog.md`) lives in the project
  memory, **outside the repository**: no diff, no history, no guard. It is also the file that carried
  a wrong figure ("1-2 min across 7 cycles", where the cited audit says 5) for a day, uncaught,
  because nothing mechanical reads it.
- An accepted follow-up therefore survives only if someone remembers it, or happens to re-open the
  report that recorded it.

## 2. Measurement that shaped the design

All figures measured at `0f8cdc0`, 2026-10-13.

**The scale of the register, stated with the right predicate.** There are 130 reports. 62 have a
non-empty "Code review follow-ups" section, and 25 of those 62 are named by some memory file — so 37
are named by nothing that is loaded at session start. **That is an upper bound on reports, not a count
of open work**, and the distinction matters: many of those sections narrate findings *fixed during the
cycle*, round by round. The `claudemd-split` report is the clear case — 17 findings across four rounds,
16 fixed and one rejected, so **none left open**, in a section a bullet-counter would read as 17 open
items. An earlier version of this analysis
made exactly that error.

**The rot is real, and it is specific.** Sampling the one report with unambiguously open items
(`2026-10-07-…-proposal-create-clone-direct`, six listed), **three of those six** were re-verified
against the code six days later — the other three are still unchecked and are an acceptance criterion
of this cycle, not a result of it:

| Follow-up | State on 2026-10-13 | How verified |
|---|---|---|
| Dead Vue data from the removed clone modal | **still open** | `costgrid.html` line 832 still declares `cloneGridName`, `cloneError`, `cloneSourceName` |
| `hasPublishedVersion` duplicated across two routes | **still open** | 2 occurrences in `api/src/routes/cost-grids.js` |
| `CLAUDE.md` describing Clone via `openCloneModal` | closed | `docs/pages/costgrid.md` line 21 now describes the removal correctly |

Two of three still open. Both survivors are **one-line code hygiene** — dead variables, an un-extracted
helper. Across the sampled reports the *decisions* were consistently taken; what rots is the cleanup.
This is why the design does not route follow-ups through briefs: a brief is the right container for the
routing-table work and absurd for `cloneGridName: ''`.

**Two constraints on where the file can live.** `CLAUDE.md` is 63,585 LF bytes against a 64,000 ceiling
— **415 bytes of headroom** — and its File structure block is pinned *exactly* at 13,399 bytes, so an
index line there costs roughly a quarter of the remaining margin. It is also unnecessary: `docs/` holds
files that the block does not index (`docs/handoff-cold-review.md`, every spec, plan, report and
brief), so a new `docs/` file needs no `CLAUDE.md` change at all.

**One free gain decides the directory.** `scripts/lib/live-docs.mjs` puts `docs/superpowers` in
`SKIP_DIRS`, so a backlog under `docs/superpowers/` would be invisible to `doc-paths-guard`. A backlog
at `docs/BACKLOG.md` is walked, and every repo-rooted path it cites must resolve or the suite goes red.
A backlog exists to point at code; a pointer to a file that no longer exists is precisely the decay it
is meant to prevent, and the existing guard catches that class for free.

**The limits of that free gain, so this does not overpromise.** `doc-paths-guard`'s matcher requires a
closing backtick immediately after the extension, so `` `api/src/routes/cost-grids.js:58` `` does **not**
match; and its `ROOTED` test requires a real top-level directory as the first segment, so root-level
files such as `costgrid.html` are never checked however they are written. Coverage is therefore partial:
paths under `js/`, `api/`, `css/`, `scripts/`, `docs/` and `.claude/` are validated when written as a
bare backticked path; root-level pages are not.

## 3. Expected behaviour

**The file.** `docs/BACKLOG.md`, one markdown table, one row per item:

| Column | Content |
|---|---|
| ID | `B-NNN`, assigned once and never reused |
| Origin | the report (or conversation) the item came from |
| What | one sentence — the defect, not its history |
| Where | path and line written **separately** (`` `api/src/routes/cost-grids.js` line 58 ``), never `path:line` |
| State | `open` or `closed <date>` |
| Verified how | the command or observation behind the current State, with its date |

The **Verified how** column is the load-bearing one. Every `open`/`closed` verdict is a claim about the
state of the repository — the defect class that produced 19 findings in the cycle that preceded this
design. A row whose State was decided by reading a report rather than checking the code is not triaged,
and the column is what makes the difference visible.

The file opens with a header stating that reports before 2026-10-01 were not triaged, so the gap is
declared rather than implied by absence.

**The mechanism.** `/finish-cycle` Gate 5 gains one step, after the report is written and before the
diff is shown: for each follow-up the cycle accepted, add a row; for each existing row the cycle closed,
set `closed <date>` with its verification. The step is not a judgement gate and does not ask — it
records what Gate 3 already decided.

**The initial triage.** The 21 October reports with a non-empty follow-up section, working back from the
most recent. Cheap first pass: a section whose bullets all record fixes has nothing open and is marked
triaged without further work. Only surviving items are verified against the code, each row carrying its
verification.

**No new guard.** Not for economy: a guard would have to couple report bullets to backlog rows, and §2
measured that those sections mix closed findings with open items, so a bullet-counting guard would be
wrong on its first run. `PROCESS.md` §6b states the boundary — a guard may require an artefact to
*carry* information, never judge whether it is *correct*. `doc-paths-guard` already covers the
mechanically checkable part, within the limits §2 names.

## 4. Verification

- `npm test` green. The new file enters `doc-paths-guard`'s and `claude-md-guard`'s walks
  automatically; no pin changes, because no indexed file and no counted block is touched.
- Every `open` row's "Where" re-checked against the working tree at the moment the row is written, by
  the command named in its own "Verified how" cell.
- The Gate 5 step exercised by this cycle's own closeout: this cycle accepts follow-ups of its own, and
  they must appear as rows before the Gate 5 diff is shown.

## 5. Acceptance criteria

- [ ] `docs/BACKLOG.md` exists, with the header declaring the pre-2026-10-01 gap.
- [ ] Every October report with a non-empty follow-up section has been triaged; each one either
      contributed rows or is recorded as having nothing open.
- [ ] Every row has a non-empty "Verified how" cell naming a command or observation and a date.
- [ ] The three follow-ups from `2026-10-13-m3-m2-process-dedup` are rows, and **all six** items of
      `2026-10-07-…-proposal-create-clone-direct` are triaged — §2 verified only three of them, so the
      remaining three carry no verdict yet and must get one here rather than inheriting a State.
- [ ] `/finish-cycle` Gate 5 carries the new step, placed after the report is written and before the
      diff is shown.
- [ ] `npm test` green with no pinned number altered.

## 6. Explicitly excluded scope

- The 41 reports before 2026-10-01. Declared in the file, not triaged.
- Fixing any triaged item. Each becomes its own later cycle, with a brief if it warrants one.
- The product backlog held in project memory (manual-test findings, page-by-page redesign, the open
  process items M1/M4/M6). This file is for cycle follow-ups; merging the two is a separate decision.
- Any `CLAUDE.md` change, including an index line — see §2 and ledger entry 2.
- A backlog guard — see §3 and ledger entry 3.

## 7. New findings during this cycle

Anything discovered while triaging that is not a follow-up already recorded in a report is **isolated as
a new row**, never fixed in this cycle (`PROCESS.md` §2, Scenario 3). The triage is a measurement pass;
a cycle that starts fixing what it measures stops being able to say what it measured.

## Decisioni aperte

1. **`docs/BACKLOG.md`, not `docs/superpowers/BACKLOG.md`.** Alternativa scartata: the latter, beside
   the other process artefacts. Perché: `docs/superpowers` is in `SKIP_DIRS`, so no guard would ever
   validate the file references a backlog exists to carry.
2. **No index line in `CLAUDE.md`.** Alternativa scartata: indexing it in the File structure block like
   other repository files. Perché: ~110 of the 415 remaining ceiling bytes for a file opened
   deliberately, never needed in context — and `docs/` already holds unindexed files.
3. **No new guard.** Alternativa scartata: a `scripts/backlog-guard.test.js` coupling report bullets to
   rows. Perché: measured in §2, those sections mix fixed findings with open items, so the coupling is
   unreliable on day one.
4. **Triage limited to October, working back from the most recent.** Alternativa scartata: all 62
   reports with a non-empty section. Perché: the user's explicit choice; the older verdicts would
   mostly be archaeology against code rewritten since, and the file declares the gap.
5. **Gate 5 writes rows, not briefs.** Alternativa scartata: "either open a brief or record why not",
   which was the first proposal in conversation. Perché: the user's instruction — the backlog is opened
   when picking work, and the brief is written then, for the items that warrant one.
6. **A "Verified how" column rather than trusting the State field.** Alternativa scartata: the four
   obvious columns without it. Perché: every State is a claim about the repo, which is the defect class
   that produced 19 findings in the immediately preceding cycle; the column is what separates a triaged
   row from an asserted one.
