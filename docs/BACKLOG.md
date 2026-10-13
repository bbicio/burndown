# Backlog — cycle follow-ups

Open items carried out of `/finish-cycle`. Before this file existed, an accepted follow-up was written
into the cycle report and nowhere else, so it survived only if someone remembered it — measured on
2026-10-13: of two follow-ups from a 2026-10-07 report re-checked six days later, both were still open
and nothing named them. The report stays the register of what happened in a cycle; this file is the
tracker of what is still open.

**Not in context.** Nothing loads this file automatically. Open it when you are choosing what to do
next, and when `/finish-cycle` Gate 5 writes to it.

## How to read a row

**A row's `State` is worth exactly as much as its `Verified how` cell.** Every `open`/`closed` verdict
is a claim about the current state of the repository, which is the defect class that produced 19 review
findings in the cycle immediately before this file was created. A verdict reached by reading a report
rather than checking the code is not triage — the column is what makes the difference visible.

Five rules, each of them a failure this file cannot detect on its own:

1. **Write a path bare and backticked, with the line number outside it** — `` `api/src/routes/cost-grids.js` line 58 ``, never `` `api/src/routes/cost-grids.js:58` ``. `scripts/doc-paths-guard.test.js` requires a closing backtick immediately after the extension; the second form is silently never validated, so the row looks checked when it is not.
2. **A root-level file is never validated**, however it is written. The guard's `ROOTED` test requires a real top-level directory as the first path segment, so `costgrid.html` and `index.html` are outside its reach. Re-check those by hand.
3. **Never move a row to `closed` from a report's own wording.** Run something. The `Verified how` cell carries what you ran.
4. **Never reuse a `B-NNN` id**, including after deleting a row. Two rows sharing an id make "which item did we close" unanswerable, and nothing checks uniqueness.
5. **A closeout with no accepted follow-ups and nothing closed writes nothing here** and says so in one line instead. A tracker that accumulates an empty row per cycle stops being readable.

An item whose state cannot be settled by a command is `open` with `Verified how: unverified — <what it
would take>`. That is an honest state, not a placeholder: silent omission is how the untracked reports
happened.

## Triage coverage

Reports from **2026-10-01** onward have been triaged. **Reports before 2026-10-01 have not** — 41 of them
carry a non-empty follow-ups section and no verdict has been passed on any of their items. That is a
declared gap, not an implied absence.

Reports triaged with nothing left open: *(filled in by Task 2)*

## Items

| ID | Origin | What | Where | State | Verified how |
|---|---|---|---|---|---|
| B-001 | `2026-10-07-…-proposal-create-clone-direct` | Dead Vue data left by the removed clone modal (`cloneGridName`, `cloneError`, `cloneSourceName`) | `costgrid.html` line 832 | open | `grep -n` on the three names, 2026-10-13 — rule 2 applies, re-check by hand |
| B-002 | `2026-10-07-…-proposal-create-clone-direct` | `CLAUDE.md` described Clone as opening `#cgCloneModal` via `openCloneModal` | `docs/pages/costgrid.md` line 21 | closed 2026-10-13 | `grep -c openCloneModal CLAUDE.md` → 0; the surviving mention describes the removal correctly |
| B-003 | `2026-10-07-…-proposal-create-clone-direct` | `proposalBusy` resets in a `finally` as soon as the clone resolves, before `window.location.href` unloads the page, so a click in that gap can start a second create/clone | `pipeline.html` lines 1001-1020 | open | read the two `finally` blocks, 2026-10-13 — reset still precedes navigation; rule 2 applies |
| B-004 | `2026-10-07-…-proposal-create-clone-direct` | A transient upsert failure during the clone's autosave flush can surface the version-rule message instead of the real cause | `api/src/lib/project-rules.js` line 18 | open | unverified — needs reading `js/costgrid.js`'s `cgCloneGrid` error path; the message itself still exists and is still the version rule's |
| B-005 | `2026-10-07-…-proposal-create-clone-direct` | `hasPublishedVersion` duplicated across `POST /:id/versions` and `.../duplicate` | `api/src/routes/cost-grids.js`, 2 occurrences | open | `grep -c hasPublishedVersion`, 2026-10-13 → 2 |
| B-006 | `2026-10-07-…-proposal-create-clone-direct` | No test covers the clone flow's ordering (flush → source load); the only coverage is the permission branch | `js/lib/costgrid-clone.test.js` | open | read the file, 2026-10-13 — 2 tests, both on the autosave-flush permission branch |
| B-007 | `2026-10-13-m3-m2-process-dedup` | The routing table's services row covers only the index, `email.js` and `jwt.js`, while seven more modules in `api/src/services/` are already documented in `docs/api/services.md` and match no row | `.claude/skills/sync-docs/SKILL.md` | open | round-4 review of that cycle, verified against `ls api/src/services/`, 2026-10-13 |
| B-008 | `2026-10-13-m3-m2-process-dedup` | The precedence rule does not break a tie between two non-pattern rows, which is the `js/lib/cg-controls-calc.js` case; the real convention is a split entry | `.claude/skills/sync-docs/SKILL.md` | open | round-4 review, verified against `docs/js/lib.md` lines 176-178, 2026-10-13 |
| B-009 | `2026-10-13-m3-m2-process-dedup` | The bold-span regex caps at 120 characters and `startsWith` compares one way only, so a verbatim citation of the full `Infrastructure safety — …` label cannot resolve. Pre-existing, not introduced by that cycle | `scripts/claude-md-guard.test.js` | open | measured the label at 138 characters against the regex's `{3,120}`, 2026-10-13 |
