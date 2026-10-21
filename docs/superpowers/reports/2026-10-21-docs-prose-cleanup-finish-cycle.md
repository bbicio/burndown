# Finish-cycle report — docs-prose-cleanup

**Date:** 2026-10-21
**Branch:** docs-prose-cleanup → main
**Execution started:** 2026-10-21 12:31  (pre-flight step 6)
**Merged at:** 2026-10-21 13:00  (Gate 4's merge commit `99ffcf2`)
**Gate durations:** Gate 1 3m · Gate 2 5m · Gate 3 21m · Gate 4 1m · Gate 5 unknown (report written at 13:02, before step 3) — total unknown
**Cycle counters:** subagent dispatches 4 · review rounds 4 · full test-suite runs 1 before Gate 5 step 3
**Risk class:** standard (the user's answer — no Plan matches the branch) · review effort medium
**Claims pre-check:** At Gate 1 it took about 3 minutes and caught 3 false predicates. All three were in `CLAUDE.md` sentences reworded during the cut: "every page is Vue except the redirects" missed `test-cases.html`; "`js/*.js` are non-Vue" missed `cg-controls.js` and `share-list-component.js`; "nav-shell-guard pins every page". The Gate 3 re-checks were not timed separately. Round 1's fix touched only a `.js` comment, so it had no `*.md` to check. Round 2's re-check caught one over-generalization in its own fix ("ogni soglia proposta" became "delle due soglie proposte") before commit. Round 3's re-check verified that the `initNav`, `app-shell` and `nav-shell-guard` PAGES sets are equal. Round 1 had 1 finding, and it was mechanical: a stale line count in `scripts/claude-md-guard.test.js`'s header. Because it sits in a `.js` comment, the `*.md`-only pre-check could not reach it.

## What was done

5 commits:
- `21a6384` docs: cut history and justification prose from CLAUDE.md and PROCESS.md. The user did this by hand from an exact-text list; the claude-md-guard pins were lowered to 12,914 B and 12 entries.
- `75cef59` docs: claims pre-check — fix three false predicates in CLAUDE.md
- `67f354c` fix: Gate 3 round 1 — drop a stale line count from claude-md-guard's header
- `94d3b78` fix: Gate 3 round 2 — pointers to deleted rationale
- `f48cc1a` fix: Gate 3 round 3 — initNav scope, two dangling pointers in finish-cycle.md

## Gate outcomes

- Gate 1: passed. The claims pre-check fixed 3 predicates, and `npm test` passed: 58 files, 1495 tests. The diff does not touch `api/`, so the backend suite was not needed.
- Gate 2: classification was `ordinary` and no stack was spun up. This is §6.4c's symmetric case: the diff is ordinary only because of a `.test.js`, and nothing in it is served. The user granted a §3 derogation: no browser verification.
- Gate 3: 4 rounds, with 1 → 2 → 4 → 0 findings, all fixed. Rounds 2 and 3 were dangling pointers to deleted rationale, plus one contradiction introduced by the round-2 fix. Past the cap the user chose option (a): one more round, scoped to `f48cc1a`, which came back clean.
- Gate 4: merged `--no-ff` as `99ffcf2` and pushed. `main` had not diverged. The diff does not touch `api/`, so there was no backup, migration or restart. There was no worktree, and the local branch was deleted.
- Gate 5: `/sync-docs` touched `.claude/skills/sync-docs/SKILL.md`, removing two stale numbers, and updated two memory files plus the index.

## Code review follow-ups

None.

## Roadmap notes

- **Gate 2:** the browser question was answered with a §3 derogation decided in conversation, not a "yes". Gate 4's out-of-scope check did not fire, because this cycle had no Brief, Spec or Plan: it was started in chat from a Spec Kit comparison.
- **Pre-existing:** `scripts/decision-ledger-guard.test.js:18` cites "§6b(d)", but `PROCESS.md` §6b has no "(d)" label, and neither did `main` before this cycle.
- **Near miss, not changed:** `docs/js/nav.md:53` still says "the wrapper every authenticated page has", inside a dated history section of that file. `terms.html` is authenticated but has no shell.
- **Lesson for the next prose cut** (`finish-cycle.md`, planned next):
  - Deleting a rationale breaks pointers to it in files the branch does not touch, such as "§6.4c says why", "§6.4d says why" and "rest on two … anecdotes". Before cutting a reason, grep the live repo for pointers that promise it.
  - Rewording a qualified sentence into a shorter universal one ("every page", "all `js/*.js`") is what produced the three Gate 1 defects.
- Round 3 judged two editor-facing instructions ("aggiunga un ciclo di dati, non una clausola" in §6.4d and §6b class A) to be meta-commentary. By the user's decision they were not restored.

## Sync-docs outcome

- `ARCHITECTURE.md`: not touched. No module, route, schema or migration changed.
- `CLAUDE.md`: not touched by `/sync-docs`; this cycle's own commits are the change. The File structure pins are already lowered in `scripts/claude-md-guard.test.js`.
- `TEST_CASES.md`, `test-api.js`: not touched. There is no feature or endpoint.
- PRD (`PRD.md` and `docs/prd/`): evaluated and not necessary. This is an internal documentation change with no user-visible behaviour.
- `PROCESS.md` gate: none of the three conditions applies. The cycle cut prose and kept every rule. The two sentences deleted from `finish-cycle.md` were informational pointers, not gate behaviour.
- `.claude/skills/sync-docs/SKILL.md`: two stale numbers removed. "~12.6 KB now" is gone, and "Thirteen entries" now reads "the entries … pinned there … read the count in the test".

## Memory outcome

- `project_claudemd_doc_split.md`: added a 2026-10-21 update. It records 51,507 LF bytes and 12,493 B of headroom (it was 1,228 B), pins 12,914 B and 12 entries, and notes that the ceiling-shape item is no longer urgent but still open.
- `project_merged_process_backlog.md`: added the off-list 2026-10-21 decision:
  - take two ideas from Spec Kit rather than adopt it;
  - the user chose cleaning in place over a separate rules-only file;
  - next comes the `finish-cycle.md` cleanup in its own branch, then a pre-development consistency check. That check is a new step and does not move §6.4d.
- `MEMORY.md`: the index lines for both files were updated to match: the headroom figure, and the next items.
- Checked with no change: `feedback_doc_split_prose_claims.md`. The lesson above is recorded in this report rather than in feedback memory.
