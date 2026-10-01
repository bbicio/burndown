# Finish-cycle report — worktree-new-version-full-copy

**Date:** 2026-10-01
**Branch:** worktree-new-version-full-copy → main (merge commit `f45144e`, pushed; `pdash-api` restarted and healthy; local branch and worktree removed)

## What was done

Scenario 2 (evolution), bounded path: Brief → short in-chat design (no spec/plan files) → inline TDD → `/finish-cycle`. Bug found by the user during the hardening cycle's manual checks: costgrid "+ New version" produced a version with no phases (and so no `+ task` button), because the structure copy re-sent the source's task ids and failed on `tasks_pkey`, an error swallowed by a `console.warn`. The user widened it to the intended behaviour: "+ New version" is a **full copy** of the source version (header, exchange-rate snapshot, phases, tasks, hours/PTC/dates/descriptions, role rates incl. custom ones, tags), always a Draft without project links or pipeline year, and a failure shows the error and leaves nothing behind.

2 commits (20 files, +316/−90, no migration):

- `7683b66` feat: New version is a full atomic copy of the source version — `POST …/versions/:vId/duplicate` rewritten as one transaction (label required, copies the source's `currency_rate`, client, project name, tags), `cgCreateNewVersion` calls it instead of re-sending the structure; `Api.costGrids.versions.duplicate` sends a body; `js/api.js` `?v=8`, `js/costgrid.js` `?v=36`; `test-api.js` `ND-01..ND-11`, `js/lib/costgrid-new-version.test.js`.
- `b46cefc` fix: code review round 1 — the flush of pending editor changes is strict (`cgAutoSave(true)`, `_cgUpsertVersionToApi(.., {strict:true})`), so a failed save aborts the copy with an error instead of copying stale server data; `costgrid.js` `?v=37`, `api-sync.js` `?v=22`.

Tests at merge: vitest 356/356, backend isolated suite (`scripts/run-tests.sh`) 520/520 (503 + the new `ND` section; `TAG-10` now sends a label). Manual verification by the user on a branch stack: "funziona perfettamente".

Decisions of the user worth keeping: full copy including tags; on failure show the error and create nothing (done by the server transaction, no client-side cleanup); the new version inherits the source's exchange-rate snapshot (my recommendation, approved with the design) rather than the live admin rate.

## Code review follow-ups

None open. Gate 3: round 1 gave 2 findings — the swallowed autosave failure (real, fixed at the user's request) and "duplicate route not scoped to its grid" (false positive: the router-level `versionScope` already answers 404, pinned by `VS-03`; nothing changed); round 2: no findings.

## Roadmap notes

- Versions already left empty by the old bug are not repaired (only one test version existed on real data: "TEST PROPOSAL" V2).
- "Clone proposal" (`cgCloneGrid`) still does not copy tags (out of scope here, unchanged).
- I did not watch the `ND-*` tests fail before writing the route (test and implementation were written back to back); they pass, and the client side was run red-then-green for the strict-flush fix.
- `cgAutoSave` (non-strict) still swallows save failures for every other caller by design (pre-existing).

## Sync-docs outcome

Updated: `PRD.md` (new "+ New version" bullet next to Clone: the feature was not documented at all) and the mirrored reference in `.claude/skills/operational-manual/SKILL.md`; `ARCHITECTURE.md` (duplicate route row); `TEST_CASES.md` + `test-cases.html` (CG-08 rewritten from "Duplicate version" to the full-copy behaviour, new CG-08b, TAG-10 wording; mirrored); `docs/pages/costgrid.md` and `docs/js/api-sync.md` (dated notes). Not updated: `CLAUDE.md` (no file added/removed, no cross-cutting rule changed; the cache-busting rule was followed, not changed); `test-api.js` (already extended by the cycle itself); `docs/superpowers/PROCESS.md` — PROCESS gate: none of the three conditions applied (the cycle executed the documented process, bounded path as already described).

PRD.md: evaluated and updated (user-visible behaviour of a real button).

## Memory outcome

- `project_new_version_structure_copy_bug.md`: "next-cycle candidate" → "MERGED 2026-10-01 (`f45144e`)" with what it did, decisions and what is still open.
- `MEMORY.md`: that index line rewritten; the Team UX backlog line no longer lists "New version loses its phases" as a next candidate.
- Unverified: none.
