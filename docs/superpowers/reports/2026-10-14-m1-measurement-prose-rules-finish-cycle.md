# Finish-cycle report — m1-measurement-prose-rules

**Date:** 2026-10-14
**Branch:** m1-measurement-prose-rules → main
**Execution started:** 2026-10-14 11:54  (pre-flight step 6; plan execution itself began 11:41)
**Merged at:** 2026-10-14 12:59  (Gate 4's merge commit `a54ea69`)
**Gate durations:** Gate 1 2m · Gate 2 unknown · Gate 3 unknown · Gate 4 1m · Gate 5 7m — total 73m
**Cycle counters:** subagent dispatches 4 · review rounds 4 · full test-suite runs 3
**Claims pre-check:** Gate 1 step 0 took about 2 minutes and found nothing. Round 1 then reported 8 findings, 4 of them in the mechanical classes (a spec predicate the code contradicted, counts in prose, a self-pointing link, an enumerated test not covered), so the Gate 1 pass missed all four. The Gate 3 re-checks were not timed; the one after round 1's fixes caught 1 defect (the spec still calling the moved block byte-identical), the one after round 2's caught none, the one after round 3's caught 3 more prose counts in the plan.
<!-- Gate 2 and Gate 3: the boundary between them (the user's "yes" to the browser question) was not
     timestamped, so neither is known on its own; together they ran 11:56 → 12:59, 63m, including
     four review rounds and a failed attempt to start the branch stack (Docker Desktop not running).
     Cycle counters: the 4 dispatches are the four Gate 3 review agents; round 1's agent also started
     the code-review skill as its own background job, not counted here. The 3 full suite runs are
     Gate 1 and Gate 5 step 3 twice (re-run after the pin change). -->

## What was done

7 commits on the branch:

- `d781142` feat: scripts/cycle-times.mjs — per-cycle timeline from git (M1)
- `ff8eff8` test: decision-ledger guard requires a Brief started line in new specs (M1)
- `4ccd9de` docs: Brief started line and cycle counters in the process (M1)
- `e0e2773` docs: prose-writing rules in CLAUDE.md; move cost-grid/pipeline integration to its page doc (M1)
- `0e206cb` fix: cycle-times merge subjects, windowed longest-slug match, repo-root git; review round 1 (M1)
- `01b7997` fix: cycle-times prefers the exact branch slug; align spec, plan and step 6 prose; review round 2 (M1)
- `ae63d1e` docs: drop superseded plan details and prose counts; widen the spec's planning-commit wording; review round 3 (M1)

Brief, spec and plan were committed on `main` before the branch (`8eb356e`, `0f41d47`).

## Gate outcomes

- Gate 1: claims pre-check clean; `npm test` passed; no `api/` change, `run-tests.sh` not run.
- Gate 2: ordinary cycle; branch stack requested but not started (Docker Desktop not running), user chose to proceed without it; browser question answered yes; no stack to tear down.
- Gate 3: 4 rounds (8 → 7 → 4 → 2 findings). Rounds 1-3 fixed in full under the user's "fix everything" rule; past the 3-round cap the user chose one last round, whose 2 findings were accepted as follow-up.
- Gate 4: merged `--no-ff` as `a54ea69` (main had not diverged), pushed; no migration, no backend change so no backup and no `pdash-api` restart; worktree removed, branch deleted.
- Gate 5: sync-docs touched `ARCHITECTURE.md`, `CLAUDE.md` and the File structure pin in `scripts/claude-md-guard.test.js`; 2 rows added to `docs/BACKLOG.md`; `npm test` run twice (once before and once after the pin change).

## Code review follow-ups

- Round 4 — the plan's Task 4 Step 4 still expects the moved-block `diff` to print nothing; since the round-1 link exception it prints one line (`docs/superpowers/plans/2026-10-14-m1-measurement-prose-rules.md` line 101). Backlog B-066.
- Round 4 — the plan's ledger entry 1 cites a `--grep` form "come scritto nella spec" that the spec no longer contains, and entry 2 carries counts against the cycle's own no-counts rule (same file, lines 107-108). Backlog B-067.

## Roadmap notes

- Most of rounds 2-4 were prose in the cycle's own Spec and Plan that still described code the previous round had replaced. The writing rules added by this cycle target exactly that; their effect can only be read on the next cycles' counters.
- `node scripts/cycle-times.mjs` takes about 90 s on this history. Cycles whose spec/plan slug is not contained in the branch name (e.g. `pipeline-detail-panel-redesign`, `*-plan.md` plans, `worktree-worktree-claudemd-split` vs `claudemd-split-phase3`) print `unknown` by design.
- Reports whose `**Branch:**` line names a branch that differs from the merge subject come out all-`unknown` (e.g. `worktree-worktree-guards-enforcement-set`); the defect is in those reports, not in the script.
- The executing-plans helper scripts (`sdd-workspace`, `task-start`, `task-done`) could not run inside the worktree session: its isolation hook refuses bash-wrapped git. The ledger was kept by hand.

## Sync-docs outcome

- `ARCHITECTURE.md`: `### Directory structure` — `cycle-times.mjs` entry added; `decision-ledger-guard.test.js` entry names the new `Brief started` check.
- `CLAUDE.md`: the `decision-ledger-guard` index entry names the `Brief started` check and its start date; the File structure block shrank by 1 B, so `scripts/claude-md-guard.test.js`'s exact pin was lowered to 13,398 in the same commit. No entry for `cycle-times.mjs` (spec ledger decision 5). `CLAUDE.md` is 62,549 LF bytes.
- `TEST_CASES.md`, `test-api.js`: not touched — dev tooling only, no app feature or endpoint.
- PRD (`PRD.md`, `docs/prd/`): evaluated, not necessary — no user-visible change.
- `PROCESS.md` gate: condition 3 applies (a `/finish-cycle` gate output changed: the report gained `Cycle counters`); `PROCESS.md` §6b was already updated on the branch (the `Brief started` paragraph), nothing further needed.

## Memory outcome

- `project_merged_process_backlog.md`: M1 "next" → MERGED 2026-10-14 `a54ea69` with what it delivered and its review cost; "M4 is next".
- `project_claudemd_doc_split.md`: added the 2026-10-14 update — 62,549 LF bytes, 1,451 B headroom (was 415 B), File structure pin 13,398.
- `MEMORY.md`: both index lines updated to match.
