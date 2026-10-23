# Finish-cycle report — test-hygiene

**Date:** 2026-10-23
**Branch:** test-hygiene → main
**Execution started:** 2026-10-23 11:55  (pre-flight step 6)
**Merged at:** 2026-10-23 12:16  (Gate 4's merge commit)
**Gate durations:** Gate 1 2m · Gate 2 unknown · Gate 3 unknown · Gate 4 1m · Gate 5 2m — total 22m (Gates 2 and 3 together 18m; the boundary between them was not captured)
**Cycle counters:** subagent dispatches 3 · review rounds 3 · full test-suite runs 4
**Risk class:** standard (`docs/superpowers/plans/2026-10-23-test-hygiene.md`) · review effort medium
**Claims pre-check:** at Gate 1 it took about 1 minute and caught 1 defect, a false predicate: B-116's closure command `grep -c "nav.js?v=17" docs/js/nav.md` returns 1, not 0, because a dated section still cites it; the command was rescoped to "Current state". The Gate 3 re-checks after rounds 1 and 2 took about 1 minute each and caught nothing. Of round 1's 3 findings, 2 were mechanical: an incomplete enumeration in B-116 (one dated section named where five hold numbers) and a false number in B-122 ("six cases timed out" where the report says 2, then 1).

## What was done

7 commits:

- `6f793b1` test: classify-cycle end-to-end budget 120 s per case (B-122)
- `fab3ccf` test: page-head guard checks every source of a computed title (B-117)
- `57ac426` docs: nav.md points at the guards that pin cache versions (B-116)
- `aea0834` docs: backlog — close B-116, B-117; add and close B-122
- `2a58b9f` docs: B-116 closure command scoped to Current state (claims pre-check)
- `fc090f7` fix: Gate 3 round 1 — template-literal roots in title guard, B-116/B-122 cells
- `a6dc393` fix: Gate 3 round 2 — refuse ${…} template titles, keep roots after a spread

## Gate outcomes

- Gate 1: passed (frontend suite, 58 files); no `api/` path, so no `run-tests.sh`; claims pre-check fixed 1 defect.
- Gate 2: ordinary cycle; Plan identified; no test environment started (user: no); browser question answered yes.
- Gate 3: 3 rounds. Round 1: 3 findings, all fixed. Round 2: 3 low-severity findings, all fixed. Round 3: no findings.
- Gate 4: merged with `--no-ff` (`99f8df8`, main had not diverged) and pushed; no backup, migration or restart (nothing touches `api/`); worktree removed, branch deleted. The merge first refused because of an uncommitted one-line edit in the main checkout's `docs/BACKLOG.md` (an empty line replaced with `scrivi`), which was discarded on the user's answer.
- Gate 5: `/sync-docs` changed no repo file; three memory files updated; no `docs/BACKLOG.md` change at step 2b.

## Code review follow-ups

None.

## Roadmap notes

- **Helper bug found while executing T2:** `elementTexts(html, 'ph-title')` matched `ph-title-row` too (`\b` treats `-` as a boundary), so portfolio's project-switch dropdown was read as title text. Fixed to whole class names. This is also why the Plan's `DATA_TITLE_ROOTS` listed `dashboardProgram`, which appears in no `.ph-title`; it was dropped from the list.
- **The source report asked for something else:** the 2026-10-23 `backlog-b110-b112` report asked for "a faster fixture or per-case budget … not a raised timeout by default". This cycle raised the per-case budget, as decision 1 of the Plan approved; B-122's closure cell says why.
- **Round 3, two low-confidence notes not counted as findings:** the title guard reads only the method a title calls directly, not methods that one calls; and an emoji written as an escape (`'\u{1F4B0}'`) or an HTML entity is not caught. No page has either shape today.
- `docs/superpowers/design/config-project/` is untracked in the main checkout and was left alone.

## Sync-docs outcome

- `ARCHITECTURE.md`: not updated. No module, endpoint, schema or pattern changed.
- `CLAUDE.md`: not updated. Its mention of `js/lib/page-head-guard.test.js` (the page-head rule) is still accurate.
- `TEST_CASES.md`: not updated. The cycle changed guard tests, not product behaviour.
- `test-api.js`: not updated. No endpoint or auth change.
- PRD (`PRD.md` and `docs/prd/`): evaluated, not necessary (internal tests and docs only).
- PROCESS.md gate: none of the three conditions applies. No process skill, no recurring exception, no gate or `/sync-docs` output change. `PROCESS.md` untouched.

## Memory outcome

- `MEMORY.md`, header-unification line: "still open B-113/B-116/B-117" → "B-116/B-117 closed 2026-10-23 by test-hygiene `99f8df8`; still open B-113".
- `MEMORY.md`, merged-process-backlog line: "next a pre-development consistency check" → "test-hygiene merged 2026-10-23 (`99f8df8`), next cycle 3: pre-development consistency check + M6 review + Spec Kit ideas (acceptance criteria, stories, epics)".
- `project_header_unification_cycle.md` description: adds "B-116/B-117 closed 2026-10-23 by test-hygiene `99f8df8`".
- `project_merged_process_backlog.md`: the test-hygiene step of the 2026-10-23 user direction is marked merged, with the merge hash and this report's path.
