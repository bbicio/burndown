# Finish-cycle report — gate1-tests

**Date:** 2026-11-10
**Branch:** gate1-tests → main
**Execution started:** 2026-11-10 12:16  (pre-flight step 6)
**Merged at:** 2026-11-10 12:49  (Gate 4's merge commit)
**Gate durations:** Gate 1 5m · Gate 2 unknown · Gate 3 unknown · Gate 4 12m · Gate 5 (to report) 1m — total 34m
**Cycle counters:** subagent dispatches 3 · review rounds 3 · full test-suite runs 5
**Gate 5 tests:** other → `npm test` ×1 (green on first run)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-10-gate1-tests.md`) · review effort high
**Claims pre-check:** At Gate 1 it took about 2 minutes over the 7 markdown files the branch changed and found nothing. The Gate 3 re-checks over the two rounds of doc fixes took about a minute each and found nothing. Of round 1's 8 findings, 2 were mechanical, both false predicates: "this gate still runs the suite exactly once" and PROCESS.md's stale "non è un rilancia da capo" contrast.
**Acceptance:** 8 items listed · 8 pre-ticked from an automated run (`npm test` at Gate 1, 2894 green; `scripts/run-tests.sh` at Gate 1, `node --test` 398/398 then `test-api.js` 778/778; the deliberate-red run at `e18dc13`, exit 1 before `test-api.js`, no container left; greps over `.claude/commands/finish-cycle.md`, `.claude/skills/sync-docs/SKILL.md`, `docs/superpowers/PROCESS.md`, `docs/BACKLOG.md`, `docs/scripts/run-tests.md`, `CLAUDE.md`, `ARCHITECTURE.md`) · 0 verified by hand · 0 not verifiable here
<!-- Gates 2 and 3: their boundary was not captured separately; 12:21 → 12:37 covers both.
     Subagent dispatches: the three Gate 3 review rounds (round 1 backgrounded at Gate 2 step 0).
     No separate executing-plans final review (ledger ruling: high-risk, Gate 3 reviews anyway).
     Full test-suite runs: npm test at Gate 1 and at Gate 5; the backend suite (node --test over api/src) inside
     scripts/run-tests.sh three times — Task 1's green run, Task 1's deliberate red, Gate 1. -->

## What was done

5 commits:
- `e18dc13` feat(run-tests): run the backend unit tests in the disposable api container
- `50f392e` docs(finish-cycle): Gate 1 re-enters after a red instead of restarting; Gate 5 tests line records a changed verdict
- `125edc2` docs: close B-411 and B-412
- `81df7b5` docs(finish-cycle): Gate 3 round 1 fixes — re-entry adds to step 0's measurement, report example for a Gate 1 red, no stale restart contrast
- `e9c66a4` docs(finish-cycle): Gate 3 round 2 fix — a scoped step 0 counts against the same cap

## Gate outcomes

- Gate 1: passed (frontend + backend): `npm test` 2894/2894; `scripts/run-tests.sh` ran because the diff touches the backend test runner, `node --test` 398/398 then `test-api.js` 778/778; claims pre-check found nothing.
- Gate 2: ordinary cycle, §3 derogation of PROCESS.md §6.4c confirmed by the user — no branch stack, no browser question; all 8 acceptance criteria pre-ticked.
- Gate 3: 3 rounds at high. Round 1, 8 findings (2 Important, 6 Minor): 7 fixed in `81df7b5`, 1 (M5, B-412 narrowed the rule to `TEST_CASES.md`) no action by user decision; no finding took the frozen-Spec/Plan or pre-existing-prose rule. Round 2, 1 Minor born from a round-1 fix, fixed in `e9c66a4`. Round 3, no findings.
- Gate 4: merged (`209f5f4`, `--no-ff`, main had not diverged); no backup, no migration, no restart. `git worktree remove` failed with "Permission denied" after unregistering the worktree; the empty directory was removed by hand. Branch deleted.
- Gate 5: `/sync-docs` changed no repo file (ARCHITECTURE.md, CLAUDE.md and PROCESS.md were updated on the branch) and updated the memory; no `docs/BACKLOG.md` row added (no follow-up accepted; B-411 and B-412 were closed on the branch).

## Code review follow-ups

None.

## Roadmap notes

- Gate 2 took the §3 derogation of PROCESS.md §6.4c (an `ordinary` cycle nothing nginx serves): no stack, browser question not asked, decided by the user.
- No separate executing-plans final review: in `high-risk` Gate 3 never skips, so the review ran there only (ledger ruling, PROCESS.md §6.4 "la sola revisione finale (o il Gate 3)").
- `scripts/run-tests.sh` took 178 s, 294 s and 103 s on three runs of near-identical code; the variance is in the integration part, the new backend step takes about 13 s. Its fixed costs were excluded from this cycle.
- Gate 5's verdict was `other` again because of the untracked design boards under `docs/superpowers/design/team/redesign/` in the main checkout, not part of this cycle; until they are committed or removed, every Gate 5 runs `npm test` and asks before the push.
- Excluded by the user and left as candidates: a faster `npm test` (jsdom only for files that use the DOM; 94-106 s today) and `run-tests.sh`'s fixed costs.
- `api/package.json`'s `test` script (`node --test src/**/*.test.js`, unquoted) reaches only one directory level under `sh`; it matches today's files (round 1 reviewer, declined to judge, outside the diff).
- Executor rulings (from the gitignored ledger): Task 1, the `docs/scripts/run-tests.md` section was appended with a quoted heredoc; Task 2, the Gate 5 bullet shortened to "As at Gate 1, … re-entered, not restarted".

## Sync-docs outcome

Scope pass (`git diff --stat 209f5f4^1 209f5f4`, 9 files): 1 ARCHITECTURE.md no (updated on the branch); 2 CLAUDE.md no (updated on the branch, pin included); 3 TEST_CASES.md no (process change); 4 test-api.js no (no endpoint); 5 PRD no (internal-only change); 5b no; 6 PROCESS.md — gate answer yes, condition 3 (a `/finish-cycle` gate changed), already updated on the branch, no further edit; 7 memory yes. No repo file changed.

## Memory outcome

- `project_gate5_optimization_cycle.md`: added a paragraph — "Gate 1 cycle MERGED 2026-11-10 as `gate1-tests` (merge `209f5f4`, report …)", with the excluded candidates and "Next process cycle: the Gate 2/3 code-review repetition."
- `frontend-tests-node-docker.md`: added "Measured again 2026-11-10: 2894 tests, 94-106 s." after the 2026-10-06 figure.
- `MEMORY.md`, Gate 5 line: "…next process cycle Gate 1 + run-tests.sh, then Gate 2/3 code review" → "…`gate1-tests` MERGED 2026-11-10 (`209f5f4` …); next process cycle Gate 2/3 code review".
- `MEMORY.md`, merged process backlog line: "…next process cycle: Gate 1 + run-tests.sh, then Gate 2/3 code review" → "…gate1-tests MERGED 2026-11-10 (`209f5f4`); next process cycle: Gate 2/3 code review".
- `MEMORY.md`, frontend tests line: "npm test natively (~48 s)" → "npm test natively (~95-105 s on 2026-11-10)".
