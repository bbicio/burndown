# Finish-cycle report — worktree-timesheet-column-mapping-specificity

**Date:** 2026-08-05
**Branch:** worktree-timesheet-column-mapping-specificity → main

## What was done

2 commits:

- `449b2aa` fix: score column-mapping matches by specificity instead of field-declaration order
- `d2cdf2b` docs: correct colTask candidate list in spec/plan to match the shipped fix

Backlog item ("XLS column-mapping keyword-breadth ambiguity," carried forward unscheduled across at least 6 prior finish-cycle reports since 2026-07-29). Given full process — this session's most recent domain-audit (`docs/superpowers/audits/2026-08-05-timesheet-column-mapping-ambiguity-audit.md`) confirmed two real, empirically-demonstrated findings in `api/src/routes/timesheets.js`'s `resolveColumnMap()`: F1 (High) — a generic keyword from an early-declared field (`colOwner`'s bare `'name'`/`'nome'`) could silently claim a spreadsheet column meant for a later-declared field (`colProjName`'s `'project name'`, `colTask`'s `'task'`), with the outcome depending purely on column order in the uploaded file and no error ever raised; F2 (Medium) — no preference for an exact header match over a merely-partial one within the same field.

`audit-to-brief` grouped both findings into one Scenario-2 (evolution) Brief, since fixing them required a genuine design decision (how to score match specificity), not a mechanical correctness restoration. `/brainstorming` settled on a specificity-scored global assignment: every (header, field) match gets a score (exact match beats word-boundary substring match; within a tier, a longer/more specific keyword outranks a shorter/generic one), all matches sorted by score, assigned greedily highest-specificity-first — replacing the old fixed-declaration-order, first-substring-match algorithm.

**A real gap was found and fixed mid-implementation**, not part of the original plan: the plan's original `colTask` candidate list had no compound-phrase equivalent to `colProjName`'s `'project name'`. For the header `"Task Name"` alone, `colTask`'s bare `'task'` (4 chars) exactly tied with `colOwner`'s bare `'name'` (4 chars), and the declaration-order tiebreak resolved it to `colOwner` — silently reintroducing the exact F1 bug this whole cycle exists to fix. The implementer subagent correctly stopped and escalated rather than forcing the test to pass; confirmed with the user, then fixed by adding `'task name'`/`'nome attività'` to `colTask`'s candidates, mirroring `colProjName`'s existing pattern. Reflected consistently across the design spec, the plan, and the shipped code (second commit above corrects the two doc files, which had been edited on disk but not yet committed when Gate 1's pre-flight check caught them).

## Process notes

- Full spec-driven process end to end: `domain-audit` → `audit-to-brief` (1 combined Brief for F1+F2, since they share root cause/file and are both design-natured per PROCESS.md Scenario 2) → `/brainstorming` (2 clarifying questions: general scoring algorithm vs. targeted patch — chose general; word-boundary matching — chose yes) → `/writing-plans` → `superpowers:subagent-driven-development` → `/finish-cycle`.
- **Live demonstration of the Gate 2 blind-spot fix from earlier today's cycle** (`worktree-finish-cycle-gate2-blindspot`, merged this same session): this cycle's own Gate 2 spec/plan search found the implementation plan via the new merge-base-walk step, but the walk stopped one commit short of finding the design spec/brief — this cycle's commit history used slightly different message shapes (`"docs: design spec for..."`, `"docs: brief for..."`, `"docs: audit..."`) than the exact `"docs: brief + design spec for..."` pattern the earlier fix's contiguous-prefix matcher looks for, since the audit-to-brief origin split brief/spec/audit into 3 separate commits instead of the usual combined one. This is precisely the "known residual gap" that earlier fix's own design spec documented (a non-doc-setup commit — or here, a differently-shaped doc-setup commit — wedged in the walk causes early stop) — non-blocking, since Gate 2's manual-verification question fired regardless and was answered. Not re-opened as a new finding here; noted for whoever next revisits that gate's heuristic.
- Pre-flight caught 2 files with real uncommitted changes (the `colTask` correction to the spec/plan docs, made directly on the branch's working tree during the mid-implementation fix) — committed before proceeding, per Gate pre-flight's explicit instruction not to decide this unilaterally.
- Diff touches `api/` — Gate 1 step 3 (`scripts/run-tests.sh`) ran: 97/97 integration tests passed. The 22 `node:test` unit tests (16 pre-existing + 6 new) were independently verified earlier in the cycle via `docker exec pdash-api node --test src/routes/timesheets.test.js`, both by the implementer and independently re-verified live by the Gate 3 reviewer.
- Manual verification: no browser/UI surface for this pure backend fix — verification was the production header-set simulation (matches today's output exactly) plus the full test suites above.
- Backend restart: `pdash-api` restarted post-merge, confirmed healthy (`docker inspect` StartedAt `2026-08-05T21:52:01Z`).

## Code review follow-ups

None blocking, across all three review passes (per-task, final whole-branch on opus, and Gate 3):
- (Minor, all three passes agree) `matchSpecificity` only checks the *first* occurrence of a candidate substring in a header (`h.indexOf(c)`), not all occurrences — a latent edge (e.g. a header like `"Nickname Name"` where the candidate first appears embedded in a larger word) with no known real-world trigger given the actual `FIELD_CANDIDATES` table.
- (Minor) The greedy assignment isn't globally optimal in a pathological multi-way-tie case — inherent to the greedy approach, no known real-world trigger.
- (Minor, Gate 3 only) `usedHeaders` keys on header string value, not index — two columns with byte-identical header text would collide. Not a regression: the old `used`/`findCol` implementation had the identical limitation.

## Roadmap notes

- Backlog item "XLS column-mapping keyword-breadth ambiguity" is now closed.
- The three Minor findings above (single-occurrence substring check, non-optimal greedy assignment, duplicate-header-string collision) are candidates for a future small hardening pass on `resolveColumnMap`, if ever prioritized — none has a demonstrated real-world trigger today.
- Remaining backlog, unscheduled: `scripts/test-branch.sh`/`scripts/run-tests.sh` joint hardening (stale-container pre-cleanup, repo-root invocation guard, unconditional `--build`, plus `scripts/test-branch.sh`'s own older hardening backlog); FOUC/`defer` on script tags across the 13 Vue pages.

## Sync-docs outcome

- **CLAUDE.md** — updated: `resolveColumnMap()`'s entry now describes the specificity-scored algorithm (tier/length scoring, Unicode word-boundary handling, the `colTask` mid-fix correction) in place of the old fixed-declaration-order description.
- **TEST_CASES.md** / **test-cases.html** — updated in lockstep: added `TS-10` (generic keyword doesn't steal a more specific field's column) and `TS-11` (exact match wins over partial match), alongside the existing `TS-08`/`TS-09`.
- **ARCHITECTURE.md** — not touched. Doesn't describe `resolveColumnMap()` in any detail; nothing there was stale.
- **test-api.js** — not touched. No API endpoints added or changed; `resolveColumnMap`'s external contract (used only internally by `POST /upload`) is unchanged.
- **PRD.md** — evaluated, left untouched. Correctness fix (prevents silent data corruption on upload), not a new or changed user-visible feature/flow.
- **docs/superpowers/PROCESS.md** — evaluated via the gate, left untouched. None of the three trigger conditions applied: no process skill was modified, the Gate 2 blind-spot observation above is a live confirmation of an already-documented residual gap (not a new recurring exception), and the 7-phase skeleton/scenario guardrails were followed as documented, not changed.
