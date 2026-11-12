# Finish-cycle report — handbook-diagrams

**Date:** 2026-11-12
**Branch:** handbook-diagrams → main
**Execution started:** 2026-11-12 10:04  (pre-flight step 6)
**Merged at:** 2026-11-12 11:26  (Gate 4's merge commit `7d86d69`)
**Gate durations:** Gate 1 unknown · Gate 2 unknown · Gate 3 unknown · Gate 4 unknown · Gate 5 (to report) unknown — total 89m (10:04 → 11:33); only 10:04, 10:55 (end of Gate 2, branch stack torn down), 11:26 (merge) and 11:33 (report) were captured
**Cycle counters:** subagent dispatches 2 · review rounds 1 · full test-suite runs 1
**Gate 5 tests:** docs-and-script-tests → `npx vitest run scripts/ js/lib/test-cases-parse.test.js` ×1 (green on first run)
**Risk class:** standard (the Plan's `**Risk class:**` line, `docs/superpowers/plans/2026-11-12-handbook-diagrams.md`) · review effort medium
**Claims pre-check:** Gate 1 step 0 took about 2 minutes over `docs/pages/help.md` and `handbook/restricted/ARCHITECTURE.md` and caught nothing. Gate 3 round 1 returned no findings, so there were no mechanical findings to count and no fixes to re-check. Round 1 came from the scoped path, `901389d..HEAD`, because the execution's own whole-branch review (Opus, at `901389d`) had its one Important fix, `69c7032`, committed after it and not re-reviewed.
**Acceptance:** criteria 1, 2, 3, 6, 7 pre-ticked from automated runs (`npm test` green at `69c7032`: 118 files, 3048 tests; the guards for criteria 1 and 6; the unit tests and the two mutation proofs of `1da2834` for criterion 3; `grep` for the single `handbook.js?v=5` / `help.css?v=2` reference for criterion 7). Criteria 4, 5 and 8 verified by hand on the branch stack with a positive outcome (the user's tick). The coordinator's `shoot` run had measured 17 blocks → 17 SVGs, 0 errors, scrolling at 390px.

## What was done

- `18e4ba6` feat(handbook): mermaid-facts module for diagram name checks
- `79b1f72` docs(architecture): context, ER and stage/status diagrams
- `e40d46e` docs(architecture): auth flows as sequence diagrams
- `1da2834` test(architecture-guard): check names in ARCHITECTURE.md diagrams
- `901389d` feat(help): Mermaid diagrams scroll at natural width
- `69c7032` fix(architecture-guard): report ER lines the parser cannot read

## Gate outcomes

- Gate 1: passed first time (`npm test`); `scripts/run-tests.sh` not run, the diff touched nothing under `api/`.
- Gate 2: ordinary cycle; branch stack reused; acceptance checklist and the browser question answered yes; stack torn down.
- Gate 3: scoped round 1 (`901389d..HEAD`) found nothing; no backend re-run.
- Gate 4: merged with `--no-ff` as `7d86d69` and pushed; no migration, no `api/` change, so no backup and no restart. The push also carried the two local docs commits (brief/spec and plan) that were ahead of `origin/main`.
- Gate 5: sync-docs touched `CLAUDE.md` (the architecture-guard entry, now two lines), `scripts/claude-md-guard.test.js` (pins lowered: 13,356 → 13,269 B and 12 → 11 over-length entries) and `docs/js/lib.md`.

## Code review follow-ups

None accepted at Gate 3. See Roadmap notes for the minors the execution's own review deferred.

## Roadmap notes

Minors deferred by the execution's whole-branch review (not graded or accepted at Gate 3; no `docs/BACKLOG.md` row written, none hides a defect that occurs today):
- `apiCalls` does not normalise a trailing `.`, `:` or `<br/>` on a path: it is reported as an unknown route (loud, not silent).
- `flowEdges` does not read `-- text -->`; `a <--> b`, a label containing `(...)` and a label containing `-->` are misread. None occurs in the document today.
- The `DROP TABLE` logic of the guard has no test (no migration drops a table), `DROP TABLE a, b` removes only `a`, and `ALTER TABLE … RENAME TO` is not handled.
- The stage list in the guard and the §5.1-§5.8 heading range in `mermaid-facts.mjs` are hardcoded: a new stage or a §5.10 needs a manual update.
- Diagram omissions: the `pending` 403 in §4.2, device revocation in §4.4, the 409 `NO_RECIPIENT` in §4.6.
- `erUnsupported` (`slice(1)`) assumes the first body line is `erDiagram`; a blank first line would give a false positive.
- Execution notes: Task 1's tests were written after its implementation (no literal RED run); the `timesheets` mutation proof did not fail because the word also occurs in §5 prose (a limit the guard header names); shell heredocs dropped backslashes again, so scripts with them were written with the Edit/Write tools.

## Sync-docs outcome

Scope pass: 1 ARCHITECTURE.md — content done on the branch (diagrams); no file-tree entry for the new script needed. 2 CLAUDE.md — yes: the architecture-guard entry, shrunk from three lines to two, with the two exact pins in `scripts/claude-md-guard.test.js` lowered in the same change. 3 TEST_CASES.md — no (no user-facing behaviour). 4 test-api.js — no (no endpoint). 5 PRD — not necessary (a handbook document gained diagrams; no product behaviour changed). 5b — no. 5c — production checklist checked against the changed ARCHITECTURE.md: nothing in it concerns the diagrams, no change. 6 PROCESS.md — none of the three conditions applies. Also updated `docs/js/lib.md` (`fenceBlocks` export). `docs/pages/help.md` was already updated on the branch.

## Memory outcome

`project_handbook_and_nginx_allowlist.md`: description "next the handbook/ docs viewer" → lists the viewer and the diagrams cycle as merged (`7d86d69`) and the manual cycle (B-459 first) as next; the "ORDER CHANGED" paragraph now records the diagrams cycle as merged. `MEMORY.md` line for it updated to match. Other project memories checked, no change: `project_backlog_cycles_2026_11_10.md`, `project_process_improvement_plan_2026_11_10.md`.
