# Finish-cycle report — worktree-finish-cycle-gate2-blindspot

**Date:** 2026-08-05
**Branch:** worktree-finish-cycle-gate2-blindspot → main

## What was done

2 commits:

- `e21774d` fix: close Gate 2's spec/plan-search blind spot for main-committed docs
- `de5f0aa` fix: address Gate-3 review findings on the Gate 2 blind-spot fix

Backlog item ("known `/finish-cycle` Gate 2 blind spot"), tracked and repeatedly reconfirmed across at least 4 prior finish-cycle reports since 2026-07-03 but never fixed until now: Gate 2's spec/plan search (old steps 2-3 of `.claude/commands/finish-cycle.md`) only looked at commits unique to the current feature branch (`git log main..HEAD`), so it found nothing whenever this project's Brief + Spec + Plan docs were committed directly to `main` *before* the feature branch was opened — a real, documented pattern from several historical cycles (originally reported in `docs/superpowers/reports/2026-07-03-docs-date-hours-rate-audit-finish-cycle.md`). This never blocked a cycle (Gate 2's manual-verification question always fires regardless of what the search finds), but the candidate list shown to the user was wrong/incomplete in those cases.

Added a new step 4 that walks backward from the branch's merge-base with `main`, collecting a *contiguous* prefix of the 8 most recent commits at/before that point whose messages match this project's own established doc-setup commit-message convention (`docs: brief + design spec for <topic>`, `docs: implementation plan for <topic>`) — stopping at the first non-matching commit, so it naturally can't span across unrelated older cycles once an ordinary merge/sync commit is hit. Old steps 4-5 renumbered to 5-6, with the internal cross-reference in the old step 5 (now step 6) updated accordingly.

## Process notes

- Lightweight, direct-implementation cycle (no Brief/brainstorming/plan) — the fix's own Gate 2 correctly found zero spec/plan candidates for this branch (self-consistently verified: this is a lightweight fix, not a process cycle with formal docs).
- **Meta-verification**: manually ran the new step 4's logic against real repository history in two cases — (1) this branch's own merge-base, where the most recent commits are all `fix:`/`Merge branch`/`docs: sync...` (no doc-setup commits), correctly yielding zero candidates; (2) the historical `worktree-docker-test-profile-container-names` cycle's merge-base, confirming the mechanism's git commands behave as intended. No automated test exists for this file (it's a prompt/instructions document, not application code) — verification was necessarily manual/live, consistent with how this kind of change has to be validated.
- Gate 3 (code review) ran 2 rounds: round 1 found 1 Important + 2 Minor findings (see below), all fixed inline per explicit user choice ("fix now"); round 2 confirmed all three resolved with no new issues.

## Code review follow-ups

**Round 1** (all fixed in commit `de5f0aa`, confirmed resolved in round 2 — none carried forward as open follow-ups):
- Important: the "contiguous prefix" heuristic can under-collect if a genuinely unrelated commit is ever wedged directly on `main` between a cycle's own Brief+Spec and Plan commits (the walk stops too early, missing the Brief+Spec further back). Not silently unsafe — Gate 2's manual-verification question always fires regardless of what the search finds — but was an undocumented assumption. Fixed: added an explicit sentence naming this as a known, accepted residual gap and explaining why it's safe (worst case is an incomplete candidate list, never a skipped verification step).
- Minor: "8 commits" was an unexplained magic number. Fixed: added a one-clause rationale (covers Brief+Spec + Plan as up to 2 separate commits, plus a safety margin — not a hard technical limit).
- Minor: "at and immediately before the branch's divergence point" imprecisely described `<merge-base>` (the merge-base commit itself IS the divergence point, not something before it). Fixed: explicitly states the merge-base commit itself is included in the walk, not just its ancestors.

## Roadmap notes

None new. This closes a backlog item that had been carried forward, unaddressed, across at least 5 finish-cycle reports since 2026-07-03. Remaining backlog, unscheduled: XLS column-mapping keyword-breadth ambiguity (needs its own dedicated cycle); `scripts/test-branch.sh`/`scripts/run-tests.sh` joint hardening; FOUC/`defer` on script tags across the 13 Vue pages.

## Sync-docs outcome

- **CLAUDE.md** — not touched. Doesn't describe Gate 2's internal search mechanism in any detail (only references `/finish-cycle` at a high level in the Process override note); nothing there was stale.
- **ARCHITECTURE.md** — not touched. No architectural/API-topology change; this is a process-tooling fix, not application code.
- **docs/superpowers/PROCESS.md** — evaluated via the gate, left untouched. None of the three trigger conditions applied: `finish-cycle` is not one of the three process skills (`feature-brief`, `domain-audit`, `audit-to-brief`) that trigger condition 1; this isn't a recurring *exception* to the standard process (it's a bug fix to the command's own internal search logic, not a deviation from it) for condition 2; and the described shape of Gate 2 in PROCESS.md §1's skeleton table ("ricerca spec/piano, sempre conferma, mai euristica") is unchanged by this fix — only *how* the search finds candidates improved, not the gate's overall structure — so condition 3 doesn't apply either.
- **TEST_CASES.md** / **test-cases.html** / **test-api.js** — not touched. No application behavior, no API, no user-facing test scenario changed.
- **PRD.md** — evaluated, left untouched. Purely internal dev-process tooling; zero user-visible behavior change.
