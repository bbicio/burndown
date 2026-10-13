# Finish-cycle report — backlog-follow-up

**Date:** 2026-10-14
**Branch:** backlog-follow-up → main
**Execution started:** 2026-10-14 00:09  (pre-flight step 6; the branch's own work began 2026-10-13 23:31)
**Merged at:** 2026-10-14 00:36  (Gate 4's merge commit `f252f8f`)
**Gate durations:** Gate 1 2m · Gate 2 2m · Gate 3 21m · Gate 4 2m · Gate 5 14m — total 41m
**Claims pre-check:** At Gate 1 it cost ~2 minutes and caught 2 defects, committed separately — both in the
fix pass's own new rows, which no reviewer had seen: `costgrid.html` line 1801 cited for the Sharing card's
summary now holds `addToProjectModal`, and `program-calc.js`'s `:183`/`:136` were swapped relative to their
subjects. Both numbers were dropped rather than reassigned by guess. Check 4 passed by regenerating the
October report set from the repository rather than reading the file's own claim; check 3 had nothing new to
settle. At the Gate 3 re-checks it cost ~3 minutes across one round and caught nothing the reviewer had not
already found — the first time in three cycles that the re-check added nothing, worth recording as the
negative data point §6.4d asks for. Of round 1's 6 findings, **5 were mechanical**; of round 2's 8, **6 were**.
Across both rounds 14 findings, 3 of them created by round 1's own fixes.

## What was done

7 commits.

- `39588cb` docs: open the cycle follow-up backlog, with the rows this cycle verified
- `1e867f8` docs: triage the October reports into the backlog
- `398bef0` process: Gate 5 populates the follow-up backlog
- `2cb9e71` docs: apply the whole-branch review — 2 critical, 7 important, in one pass
- `4e4ee6b` docs: apply Gate 1 claims pre-check findings (2)
- `d799536` docs: apply Gate 3 round-1 findings (6)
- `af53e4b` docs: record Gate 3 round 2's eight findings as backlog rows

Delivered: `docs/BACKLOG.md`, a tracker for `/finish-cycle` follow-ups, opening with 64 rows from the triage
of all 23 October reports carrying a non-empty follow-ups section; Gate 5's new step `2b`, which writes rows
on every closeout; and the matching clause in `PROCESS.md` §1.

## Gate outcomes

- **Gate 1:** passed. Pre-check caught 2 defects; `npm test` green at 48 files / 1017 tests. No `api/` paths, so `scripts/run-tests.sh` correctly skipped.
- **Gate 2:** `node scripts/classify-cycle.mjs` → `no-code`, confirmed by the user. No stack created, browser question not asked, `scripts/test-branch.sh status` → `down` (nothing left running by an earlier attempt).
- **Gate 3:** 2 rounds, 6 then 8 findings, 3 of the second round created by the first round's fixes. Round 1 fixed in full; **round 2's eight accepted as backlog rows rather than fixed, by the user's explicit choice**. Both rounds ran scoped — round 1 over `398bef0..HEAD`, round 2 over the single fix commit — because a whole-branch review had already covered `main...2cb9e71` in this session.
- **Gate 4:** merged as `f252f8f`, a true merge commit via `--no-ff` (`main` had not diverged). DB backup skipped by its own condition — no migration added, no `api/` touched. No migration apply, no `pdash-api` restart, no worktree cleanup. Branch deleted.
- **Gate 5:** `/sync-docs` touched no repo file; step `2b` wrote nothing and surfaced a gap in itself (B-065); 3 memory files plus the index updated. `npm test` green at 1017.

## Code review follow-ups

All eight of round 2's findings were accepted as follow-ups and **are themselves rows in `docs/BACKLOG.md`**,
B-057 to B-064, each with the command that established it. Summarised here so the report stands alone:

- **B-057 (Important)** — the command that replaced the withdrawn triage count **does not run**: a literal `\n` where a line continuation belongs, so bash reads `n` as a command, 31 errors, zero output. A reader can take the empty output for "no reports carry follow-ups". The previous commit's message claimed the four checks were re-run; running this command was not among them.
- **B-058** — the same command globs `2026-10-*` while the prose two lines above says the set grows at nearly every closeout.
- **B-059 (Important)** — rule 2 still ends with "a real top-level directory", the exact phrase removed from the command and `PROCESS.md` in the same commit for being false, in the file those two now cite as the authority.
- **B-060** — the item-to-row mapping names three bundling rows where six bundle, summing to 20 against the 23 items it claims to carry.
- **B-061** — the day-one correction paragraph describes a number the coverage line no longer states.
- **B-062** — step `2b` says the same thing twice, and introduces a fresh quantifier with the same expiry as the one it removed.
- **B-063** — rule 1 and step `2b` describe one of `citedPaths`' two regexes.
- **B-064** — B-056 departs from its source report's line number without saying so, where three other rows do.

Plus **B-065**, found by running step `2b` for the first time: the step has no branch for follow-ups already
written earlier in the cycle, so its own no-op condition did not describe the situation it was in.

## Roadmap notes

- **Gate 2 took the no-code branch.** The browser question was not asked, no Plan and no Spec was identified, and therefore **Gate 4's out-of-scope check did not fire** — §6.4c requires recording this. The 2026-10-13 extension of that check to the Spec does not reach this path, for the same reason.
- **The triage found three instances of one failure, in three different passes of the same cycle.** The whole-branch review found a bullet-only regex that had excluded two reports holding 10 accepted, unfixed items; Gate 3 round 1 found a third report listed as "nothing left open" while carrying a live deferred item (now B-056); and the first pass had itself classified three reports as round narratives on a keyword heuristic, which reading them disproved — 23 open items, including B-029. Every one was a permissive misread of a report's own wording. That is the argument for the file existing, and it is measured rather than asserted.
- **All fourteen Gate 3 findings landed in the preamble; none in the 64 rows.** Two independent reviewers read the rows clean — every line number, every reproducible grep. What kept breaking was the prose framing them: the rules, the explanations, the paragraphs where the file narrates its own corrections. Each rewrite of that preamble produced the next round's findings, which is why the user closed by recording round 2 rather than rewriting it again.
- **B-051's severity was corrected downward mid-cycle, after the user had already decided on it.** It was presented as a live stored-XSS vector; the sink is a `<select>`, where `innerHTML` fragment-parses in insertion mode "in select" and discards every start tag but `option`/`optgroup`/`hr`/`script`/`template`, and a `<script>` inserted that way never runs. The reachable harm is recipient-list corruption, not script execution. The defect is real, the fix is one `esc()` call, and the queuing decision is better supported by the corrected framing than by the one it was taken on.
- **Two known-false statements were merged deliberately** (B-057's broken command, B-059's contradicting sentence), on the user's explicit choice to record rather than fix. Stated here because a reader of `main` encounters them before reading their rows.
- **The pre-check added nothing at Gate 3 this cycle**, for the first time in three. Both rounds' findings were judgement about prose the four mechanical checks cannot reach. §6.4d says the decision is taken on numbers after three cycles; this is the third, and the honest summary across them is that the leverage has been at Gate 1 and in the per-round re-check unevenly, not reliably in either.

## Sync-docs outcome

- **ARCHITECTURE.md — not updated, correctly.** No module, endpoint, table, column or frontend behaviour changed, and that file does not index `docs/` contents, so the new file needs no entry.
- **CLAUDE.md — not updated, by design.** Ledger decision 2 of the spec: an index line would cost ~110 of the 415 remaining ceiling bytes for a file opened deliberately and never needed in context, and `docs/` already holds unindexed files.
- **TEST_CASES.md — not updated.** No product behaviour changed, and its case and section counts are pinned exactly.
- **test-api.js — not applicable.** No endpoints added, no auth rules changed.
- **PRD evaluated: not necessary (internal-only change).** `PRD.md` and every `docs/prd/` file were considered and left untouched — a developer-facing tracker and a slash-command step change nothing a user can see or click.
- **5b — not applicable**, since no PRD file was touched.
- **PROCESS.md gate: YES, condition 3** — the cycle added a `/finish-cycle` gate step. §1's Gate 5 bullet was updated on the branch, so nothing was left for this step.

## Memory outcome

Memory: 2 files changed plus the index.

- `project_merged_process_backlog.md` — added a paragraph distinguishing it from `docs/BACKLOG.md`: that file tracks **cycle follow-ups** and is written by Gate 5 step `2b`; this memory remains the **process programme** list (M1, M4, M6), and the spec explicitly excluded merging the two, a decision still open.
- `feedback_doc_split_prose_claims.md` — added an eighth surface: **replacing a number with a command moves the verification rather than removing it, and the command must be run** — the snippet written to retire a decaying count was itself broken, and the commit message claiming the four checks were re-run could not have included running it. Plus the shape that collects all fourteen findings: every one landed in the preamble, none in the 64 verified data rows.
- `MEMORY.md` — the prose-claims hook extended with the eighth surface, and the process-backlog hook now opens by saying it is **not** `docs/BACKLOG.md`. **One correction during this step:** a second index line was first added pointing at the same memory file with a stray `#`, which would have given one file two hooks; removed, and the distinction folded into the existing line.
