# Finish-cycle report — process-speed-2

**Date:** 2026-11-18
**Branch:** process-speed-2 → main
**Execution started:** 2026-11-18 11:28
**Merged at:** 2026-11-18 12:46
**Gate durations:** Gate 1 10m · Gate 2 20m · Gate 3 38m · Gate 4 11m · Gate 5 (to report) 3m — total 82m
**Cycle counters:** subagent dispatches 8 (final review, security review, five scoped Gate 3 reviews, one scoped review of the Gate 1 fixes) · review rounds 5 · full test-suite runs 5 (`npm test` baseline, after Task 1, Gate 1 red, Gate 1 green; `npm run test:site-export` at Gate 1)
**Gate 5 tests:** docs-only → `npx vitest run scripts/ js/lib/test-cases-parse.test.js` ×1 (green on first run)
**Risk class:** standard (`docs/superpowers/plans/2026-11-18-process-speed-2.md`) · review effort medium
**Claims pre-check:** Gate 1 step 0 took about 2 minutes over the six changed `.md` files and caught 1 defect (a false predicate: the draft file named `<branch>.draft.md` instead of the sanitized name), fixed in `74f4a50`; the Gate 3 re-checks over the rounds' `.md` fixes took about 1-2 minutes each and caught nothing; of round 1's 7 findings, none was mechanical.
**Security review:** ran — `security-scope` review, triggered by `scripts/cycle-report.mjs`, `vitest*.config.js`, `package.json` and the test files · 0 findings (one note: `--branch` reaches a file path with only `/` replaced; trusted CLI input, not a vulnerability)
**Acceptance:** 7 criteria from the Spec · pre-ticked from runs green at `45a5e38`: 3 (automated part: `scripts/decision-ledger-guard.test.js`), 4 (automated part: `scripts/cycle-report.test.js`), 5 (automated part: `npm test` without `scripts/site-export/`, `npm run test:site-export` 60/60, `scripts/site-export-scope.test.js` 3/3), 6 (`npm test` 219.39 s → 159.47 s at Task 1, 176.20 s at Gate 1), 7 (`npm test` 3395/3395) · verified by hand by reading the text: A (criteria 1-2), B (criterion 3 text), C (criteria 4-5 text)
<!-- Wall-clock, human wait time included (pre-flight step 6). Write `unknown` for a gate whose
     timestamp was not captured; a gate that self-skipped gets `0m (skipped)`. Gate 5 is measured
     up to this report; Gate 5 up to its commit is read from `node scripts/cycle-times.mjs`,
     column `merge→docs`.
     The claims pre-check line is Gate 1 step 0's own measurement (PROCESS.md §6.4d). It is prose,
     not slots: a cycle where part of it did not happen says so instead of writing a zero. Keep
     the Gate 1 and Gate 3 figures distinct.
     Cycle counters, from the start of plan execution to Gate 5: subagent dispatches = calls to the
     Agent tool; review rounds = Gate 3 rounds; full test-suite runs = complete runs of `npm test`
     or of the backend suite (`node --test` over `api/`), targeted single-file runs excluded. A
     counter the session did not observe in full is `unknown`.
     Gate 5 tests: filled in by step 3, after this file exists; the verdict is the first line of
     `node scripts/gate5-scope.mjs`, and ×N counts one run per entry into step 3. Verdict and command
     are those of the green run; if an earlier run had a different verdict, append
     `(first: <verdict> → <command>)`.
     Risk class: the values Gate 2's identification step recorded.
     Acceptance: the outcome of Gate 2's Acceptance checklist. -->

## What was done

11 commits; brief `b77fac1`, spec `60f0492` + `182bfd2` and plan `926308f` committed on `main` before execution; executed natively in `.claude/worktrees/process-speed-2`. The header lines above and this list were printed by `node scripts/cycle-report.mjs render --branch process-speed-2` — the cycle's own new script, used on itself.

- `5c9cb6d` test: run site-export tests only through npm run test:site-export
- `b267bd5` feat(scripts): cycle-report mark/render for the finish-cycle report's mechanical lines
- `c50c571` feat(process): docs inside the tasks — Docs line guard on new plans, sync-docs checks the branch first
- `4c295cf` docs(process): final review in parallel to Gate 1, branch stack from pre-flight, cycle-report marks, site-export tests at Gate 1
- `74f4a50` docs: claims pre-check fix (draft file name)
- `45a5e38` fix(site-export): classify vitest.site-export.config.js as process (Gate 1 red)
- `e2948f6` fix: Gate 3 round 1 (process-speed-2) - shallow-clone guard, final review never skipped unhandled, stale stack and stale classification, cycle-report arguments and log reuse
- `10c8cfa` fix: Gate 3 round 2 (process-speed-2) - adopted review's later commits, nginx.conf and reused stack in the rebuild check, draft removed on log reuse, git-unreadable hint
- `e60d611` docs(process): Gate 3 round 3 - compare from the scoped run's launch HEAD; no repeated rebuild question on a reused stack
- `57244dc` docs(process): Gate 3 round 4 - up-HEAD recorded on every pre-flight answer, reuse included; rebuild asked only on a relevant change
- `e483ae1` docs(process): Gate 3 round 5 - a pre-flight 'no' skips the rebuild check

Executor rulings (plan ledger): the Docs guard's scope is computed with two git calls (`<anchor commit>..HEAD` plus untracked plans) instead of one per plan; Task 3's tests were written with the code and RED was proven by mutation; Gate 1 step 1a triggers on any path starting with `scripts/site-export` or `scripts/lib/site-export`, broader than the spec's three paths.

## Gate outcomes

- Gate 1: claims pre-check fixed 1 defect (`74f4a50`); red at step 1 — `scripts/site-export-guard.test.js`: the new `vitest.site-export.config.js` was unclassified — fixed in `45a5e38` (rule + NEVER_INCLUDED), re-entered, then passed: `npm test` 3395/3395 in 176.20 s, `npm run test:site-export` 60/60 in 103.63 s; `run-tests.sh` not needed (no backend path in the diff); audit `.` reported only: 10 vulnerabilities (1 moderate, 9 high, `undici` among them) in the root test toolchain.
- Gate 2: ordinary cycle that the browser cannot show — §6.4c deroga §3, decided in conversation: no branch stack, no browser question; acceptance as above.
- Gate 3: round 1 = the plan's final review (`/code-review` medium by an Opus agent launched at the last task's commit `4c295cf`, the cycle's own new rule applied by hand) plus a scoped review of the Gate 1 fixes (`4c295cf..45a5e38`, 0 findings) and `/security-review` (0): 4 Important + 3 Minor, all fixed in `e2948f6` under the user's "fix everything now"; round 2 (scoped): 6 Minor, all fixed in `10c8cfa` under the same rule; round 3 (scoped): 1 Important + 1 Minor, cap reached, the user chose "(a) continue", fixed in `e60d611`; round 4: 1 Important, fixed in `57244dc`; round 5, after the user chose to run it: 1 Minor, fixed in `e483ae1`, and the round closed by the text-only rule; 0 findings to specs/plans or pre-existing prose; Backend re-run: no `<backend-paths>` in the diff, nothing run.
- Gate 4: merged `--no-ff` (merge commit `693d3a9`), pushed together with the brief/spec/plan commits; no migration, no restart, no backup needed; `git worktree remove` hit "Permission denied", the directory removed by hand afterwards; branch deleted.
- Gate 5: sync-docs touched 1 file (`handbook/restricted/ARCHITECTURE.md`); no `docs/BACKLOG.md` change (no follow-up accepted, nothing closed).

## Code review follow-ups

None.

## Roadmap notes

- **Five Gate 3 rounds, all on the same two pieces of text:** the early branch stack (pre-flight step 7 and Gate 2 step 1) and the adoption of the plan's final review as Gate 3 round 1. Each fix to that text opened a new edge case (stale stack after a Gate 1 fix, repeated question on reuse, a reused stack not checked, a pre-flight "no"). The code (scripts, guards) was clean from round 2 on. It is the part of the cycle that changed the order of the gates; watch it in the first real cycles that use it, and simplify if it keeps producing questions.
- **The `/finish-cycle` this cycle ran was main's version**, not the branch's: the new rules were applied by hand where they were already usable (final review adopted as round 1, `cycle-report.mjs mark`). The next cycle is the first to run them as written.
- **The gate times in the log are when `mark` ran, not when the gate began in substance:** `gate3` was marked at 11:59, after the background reviews returned, so Gate 2 reads 20m though the deroga and checklist ended around 11:42. Mark at the gate's first action.
- **Root `npm audit`:** 10 vulnerabilities (9 high) in the root test toolchain (`undici` among them). Reported only; the toolchain never ships.
- **Plan defect:** Task 1's verification step did not run `scripts/site-export-guard.test.js`, so the new root file reached Gate 1 unclassified.

## Sync-docs outcome

Scope pass (merge `693d3a9`, 16 files): 1 ARCHITECTURE.md — yes (not touched by the branch: its directory tree lacked `scripts/cycle-report.mjs` and `vitest.site-export.config.js`, and its `decision-ledger-guard.test.js` entry lacked the sixth rule — all three added); 2 CLAUDE.md — already on branch (two override lines, the File structure entry, the pin); 3 TEST_CASES.md — no; 4 test-api.js — no; 5 PRD — evaluated, not necessary (process and test tooling, nothing user-visible); 5c handbook — no beyond ARCHITECTURE.md; 6 PROCESS.md gate — condition 3 applies (`/finish-cycle` pre-flight, Gates 1-3 and 5 and `/sync-docs` changed), and §6.1, §6.2, §6.4, §6.4b and the summary table were updated on the branch (already on branch); 7 memory — yes. `docs/scripts/site-export.md` and `docs/scripts/cycle-report.md` — already on branch.

## Memory outcome

- `MEMORY.md`: the Merged process backlog line "latest process cycle `process-speed` merged 2026-11-18 (`e7c0e2b` …)" → names both `process-speed` (`e7c0e2b`) and `process-speed-2` (`693d3a9`, with its five changes); the Frontend tests line "~214-231 s on 2026-11-18 after the site-export test split" → "~160-176 s on 2026-11-18, site-export tests moved to `npm run test:site-export`; was 373 s".
- `frontend-tests-node-docker.md`: added that `process-speed-2` (`693d3a9`) excluded `scripts/site-export/` from `npm test` (run with `npm run test:site-export` at Gate 1 when the branch touches the export tool), 219 → 159-176 s.
