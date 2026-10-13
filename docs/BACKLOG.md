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

Reports triaged with **nothing left open** — every item in their follow-ups section was fixed, rejected
or accepted as a design residual inside their own cycle:
`2026-10-01-…-project-currency-lock` (3 items, all fixed in-cycle) ·
`2026-10-08-…-portfolio-overview-cycle1` (one fixed, one rejected) ·
`2026-10-08-…-claudemd-split` (17 findings over four rounds, 16 fixed and one rejected) ·
`2026-10-12-…-guards-enforcement-set` (2, both corrected in-cycle) ·
`2026-10-12-…-process-md-self-description` has open items and is in the table below, not here.

**One correction made during this triage, recorded because it is the method under test:** the three
reports `2026-10-06-…-pipeline-board-redesign`, `2026-10-07-…-costgrid-fidelity` and
`2026-10-07-…-pipeline-detail-panel` were first classified here as round narratives with nothing open,
on a keyword heuristic rather than a read. Reading them showed **23 open items**, including the most
serious entry in this file (B-029). The heuristic was wrong in the permissive direction, which is the
direction that loses work.

**Closed by a later cycle, recorded because the closure was invisible until this triage:**
`2026-10-09-…-no-code-gate2`'s first item — the `:27`-vs-`:49` contradiction in `finish-cycle.md` — was
fixed on 2026-10-13 by the M3 half of `m3-m2-process-dedup`. Nobody connected the two at the time.

**A disposition that is not a row:** two items were accepted by their own spec as design residuals
rather than deferred — last-writer-wins on a stale `costgrid.js` copy and `config.projects` not rolling
back a failed save (`2026-10-01-…-hardening-open-findings`, decisions D6/D7). They are limitations, not
work; a row would misrepresent them as pending.

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
| B-010 | `2026-10-01-…-hardening-open-findings` | The UUID regex is duplicated inline instead of living in `api/src/lib` | `api/src/routes/projects.js` lines 159 and 209, `js/api-sync.js` line 258 | open | `grep -n` for the literal regex, 2026-10-13 — three inline copies |
| B-011 | `2026-10-01-…-hardening-open-findings` | `TS-01` does not assert that an admin still gets rows for a code **with** actuals | `test-api.js` | open | unverified — needs reading the TS-01 block |
| B-012 | `2026-10-01-…-money-centralization` | Strict locale parse reads `1234.56` typed in an it-IT euro field as 123456; costgrid saves per keystroke, so it is silent until blur reformats. The strict parse is the chosen design; a mitigation was suggested, not specified | `js/lib/money.js` | open | `parseMoney` still exported and still strict, 2026-10-13 |
| B-013 | `2026-10-01-…-money-centralization` | For a program with mixed currencies the totals are raw sums labelled EUR — neither converted nor in one currency. Belongs to the currency-conversion cycle | `js/lib/portfolio-calc.js` | open | `commonCurrency` still present, 2026-10-13 |
| B-014 | `2026-10-01-…-money-wrapper-cleanup` | Some portfolio summary cells are still unguarded against null, where the old wrapper rendered an em dash | `portfolio.html` | open | 6 occurrences of the cited expressions, 2026-10-13 — rule 2 applies |
| B-015 | `2026-10-02-…-navigation-b2-sidebar` | `updateNavState()` still queries `.nav-main-tab`, which the current navigation never renders — dead code | `js/core.js` line 145 | open | `grep -n nav-main-tab`, 2026-10-13 — still there |
| B-016 | `2026-10-02-…-navigation-b2-sidebar` | Page headings disagree with the menu, title and breadcrumb: "Project Portfolio" vs "Portfolio", "Resource Planning" vs "Planning" | `portfolio.html` line 32, `planning.html` line 356 | open | read both lines, 2026-10-13 — the emoji is gone from portfolio, the wording mismatch is not; rule 2 applies |
| B-017 | `2026-10-05-…-master-data-split` | `TEST_CASES.md` still says "moved to Config → Clients" and "14 pages" where there are now 18 | `TEST_CASES.md` | open | `grep -c`, 2026-10-13 — 1 each; the "Currencies tab" wording was fixed |
| B-018 | `2026-10-10-…-prd-slim-split` | `docs/prd/pipeline.md` §4.9 still calls the cost-grid editor an overlay opening full-page, the idea this cycle corrected in §3 | `docs/prd/pipeline.md` | open | `grep -c overlay`, 2026-10-13 → 2 |
| B-019 | `2026-10-10-…-prd-slim-split` | Dangling PRD citations: `§11.3` where §11 has only 11.1/11.2, and `§16.9a` | `docs/prd/planning.md`, `docs/prd/administration.md` | open | `grep -c`, 2026-10-13 → 1 each |
| B-020 | `2026-10-10-…-prd-slim-split` | The command still describes the PRD as a single conditional file ("PRD.md-conditional") after the split into `docs/prd/` | `.claude/commands/finish-cycle.md` | open | `grep -c`, 2026-10-13 → 1; survived an edit of this file on the same day without being noticed |
| B-021 | `2026-10-10-…-prd-slim-split` | Client-side object shapes were said to be documented nowhere after §12.2/§12.3 were deleted as duplicates, though they were stale rather than duplicate | `docs/js/lib.md`, `docs/prd/planning.md` | open | unverified — `soldHours` appears in both files, so the claim is at least partly overtaken; needs a read to say what is actually missing |
| B-022 | `2026-10-09-…-no-code-gate2` | Gate 2's classification paragraph could be roughly halved without losing a rule | `.claude/commands/finish-cycle.md` | open | still long after the 2026-10-13 edits, 2026-10-13 |
| B-023 | `2026-10-09-…-test-cases-from-markdown` | Three parser defects: HTML comments stripped before line handling, `readAuto` distinguishing only `vitest`, and the row id passed through the cell formatter | `js/lib/test-cases-parse.js` lines 37 and 47, `test-cases.html` lines 318-319 | open | unverified — needs reading the three sites |
| B-024 | `2026-10-10-…-claudemd-split-phase3` | `api/package.json` carries a `migrate` script whose target the report says runs nothing | `api/package.json`, `api/src/db/migrate.js` | open | unverified — the script and the file both exist (676 B); needs reading the file |
| B-025 | `2026-10-10-…-claudemd-split-phase3` | `ARCHITECTURE.md` was said to keep a third parallel copy of the migration list | `ARCHITECTURE.md` | open | unverified — a grep for table rows found none, which does not prove absence; needs a read |
| B-026 | `2026-10-12-…-process-md-self-description` | Three accepted nits on the command and on §1's Gate 4 chain, one of them citing `:12`, a line that has since moved | `.claude/commands/finish-cycle.md`, `docs/superpowers/PROCESS.md` | open | unverified — line 12 now holds the timing-capture step, so each nit needs re-locating before it can be judged |
| B-027 | `2026-10-13-…-approval-economy` | Three findings on the ledger guard and on §6b's parenthetical, accepted as follow-up at round 4 | `scripts/decision-ledger-guard.test.js`, `docs/superpowers/PROCESS.md` | open | unverified — needs reading the three cited sites |
| B-028 | `2026-10-09-…-classify-cycle` | Deferred minors on the two unit tests added by `c719aac`, plus a recommendation to add `// @vitest-environment node` | `scripts/classify-cycle.test.js` | open | unverified — needs reading the test file |
| B-029 | `2026-10-07-…-costgrid-fidelity` | **A viewer can perform structural edits.** `isReadOnly` reached `:disabled`, but structural controls are gated on `v-if="!isLocked"` alone, so a viewer on an unlocked version can delete a task: the draft mutates, the row disappears, and only the server's refusal of the PUT stops it | `costgrid.html` | open | `grep -c 'v-if="!isLocked"'`, 2026-10-13 → 3 controls still gated that way, against 18 `isReadOnly` references and 0 combined. Narrowed since the report named ~9, not closed; rule 2 applies |
| B-030 | `2026-10-07-…-costgrid-fidelity` | Four global listeners per picker instance; `Home`/`End` call `preventDefault()` unconditionally; `commitTyped()` ignores `min`/`max` | `js/cg-controls.js` | open | unverified — needs reading the three sites |
| B-031 | `2026-10-06-…-pipeline-board-redesign` | In "All in EUR" mode the card PTC line has no "from CHF …" sub-line, though spec §3.4 covers fees and PTC | `js/lib/pipeline-calc.js` | open | unverified — needs reading `pbCardAmount` against spec §3.4 |
| B-032 | `2026-10-06-…-pipeline-board-redesign` | `cardAmount(card)` recomputed several times per card per render; `yearCards` repeats the `filterableCards` loop | `pipeline.html` | open | unverified — both are performance shape, not correctness |
| B-033 | `2026-10-06-…-pipeline-board-redesign` | `pbAggregate` duplicates `pbComputeColumnTotals`' summing, and `pbSearchSuggestions` reimplements the match rule instead of sharing `pbCardMatchesFilters` — drift risk on both | `js/lib/pipeline-calc.js` | open | unverified — needs reading the three functions |
| B-034 | `2026-10-06-…-pipeline-board-redesign` | The rate-fallback test asserts only the absence of `Infinity`/`NaN`, not that it behaves as rate 1 | `js/lib/pipeline-calc.test.js` | open | unverified — needs reading the test |
| B-035 | `2026-10-06-…-pipeline-board-redesign` | `test-api.js`: the current-year `pipeline_years` setup is not asserted with `ok()`, and two checks share the label PY-13 | `test-api.js` | open | unverified — the duplicate label is greppable, the missing assertion is not |
| B-036 | `2026-10-06-…-pipeline-board-redesign` | The Filters sheet stays open when the viewport grows past 768px (rotation); document `keydown`/`mousedown` listeners are never removed | `pipeline.html` | open | unverified — needs a browser or a jsdom test; rule 2 applies |
| B-037 | `2026-10-06-…-pipeline-board-redesign` | A client literally named "Unassigned" would render as "—" in suggestions | `js/lib/pipeline-calc.js` | open | unverified — needs reading the suggestion builder |
| B-038 | `2026-10-07-…-pipeline-detail-panel` | Literal z-index values 10 / 20 / 1040 with no `--z-*` token, against the project's no-hardcoded-values rule | `css/pipeline.css` | open | unverified — greppable, but which of the three should become tokens is a design call |
| B-039 | `2026-10-07-…-pipeline-detail-panel` | No test asserts that Canceled rows stay in `/api/pots/summary`, which the code does | `test-api.js` | open | unverified — needs reading the POT section |
| B-040 | `2026-10-07-…-pipeline-detail-panel` | Panel tabs carry `role="tab"`/`aria-selected` but no `aria-controls`/`id` pairing and no arrow-key navigation | `pipeline.html` | open | unverified — accessibility, needs a browser; rule 2 applies |
| B-041 | `2026-10-07-…-pipeline-detail-panel` | `pbFmtMonth` accepts malformed shapes like `2026-0501`; the POT legend lists zero-value segments; `Math.round(view.pct)` is redundant and `pbComputePotPercentages` is unused but still tested | `js/lib/pipeline-calc.js`, `pipeline.html` | open | unverified — four low-severity items kept on one row because they share a cycle and a file pair |
| B-042 | `2026-10-07-…-pipeline-detail-panel` | `/api/pots/summary` returns 500 on a malformed `clientId` UUID. Pre-existing; the reviewer declined to judge it | `api/src/routes/pots.js` | open | unverified — a 500 on malformed input is a defect whoever introduced it; needs reading the route |
