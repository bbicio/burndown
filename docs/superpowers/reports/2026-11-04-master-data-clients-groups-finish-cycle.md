# Finish-cycle report — master-data-clients-groups

**Date:** 2026-11-04
**Branch:** master-data-clients-groups → main
**Execution started:** 11:17  (pre-flight step 6; the plan's execution began earlier, about 10:45, in native mode)
**Merged at:** 13:02  (Gate 4's merge commit `cb90479`)
**Gate durations:** Gate 1 10m · Gate 2 27m · Gate 3 unknown · Gate 4 unknown (the Gate 3/4 boundary was not captured; together 68m, 11:54→13:02) · Gate 5 (to report) 5m — total 110m
**Cycle counters:** subagent dispatches 3 (the three `/code-review` runs; plan execution was native, none) · review rounds 3 · full test-suite runs 11 (2 `npm test`, 2 `npx vitest run js/lib/ scripts/`, 7 `scripts/run-tests.sh`)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-04-master-data-clients-groups.md`, its `**Risk class:**` line) · review effort high
**Claims pre-check:** Gate 1 step 0 covered the two `*.md` files the branch changed (`docs/pages/config.md`, `TEST_CASES.md`): about 2 minutes, 0 defects. The Gate 3 re-checks found no `*.md` fix to check in any round: 0 minutes, 0 defects. Round 1 produced 10 findings, none of them in the four mechanical classes.
**Acceptance:** 4 criteria pre-ticked from automated runs at HEAD `cbaf9ac` — 6 Save payload unchanged and 7 Rate source (`js/lib/master-clients.test.js`, `npm test` 2251/2251), 9 Redirect markup and 11 No emoji or native dialogs (`js/lib/master-data-guard.test.js`, same run). Verified by hand with a positive outcome: 1 Two views, 2 Inline editing, 3 Group moves, 5 Rate card sub-view, 10 Responsive, MD-14. Items 4 (Delete group) and 8 (Unsaved guard) failed on the first pass because the page had no `#confirmModal` for `showConfirm`; fixed in `d5e61e8` and verified by hand afterwards, together with the client delete. Nothing left as not verifiable.

## What was done

Merge of 10 commits (`git log main..HEAD --oneline`, captured before the merge):

- `bdac131` feat(client-groups): refuse deleting a group with a POT; list its POT years
- `b2d470b` feat(master-clients): pure helpers for views, rate sources, save payload and group moves
- `ce06bf8` feat(master-data): segmented control, switch and icons for the Master Data pages
- `e3dc3f1` feat(master-clients): client rate card as a routed sub-view (also carries the list and by-group views and the redirect of Tasks 4 and 5: the Task 4 commit failed silently on an ignored-path pathspec)
- `cf8dd40` feat(master-clients): tablet and phone layouts for clients, groups and the rate card
- `1458dd8` docs(master-clients): Clients & groups notes, accepted deviations and manual test case
- `cbaf9ac` test(icons): the redirect page no longer calls initNav, 18 pages
- `d5e61e8` fix(master-clients): add the confirm modal showConfirm needs; clearer delete hint
- `37285c4` fix(master-clients): review round 1
- `7854c5b` fix(master-clients): review round 2

## Gate outcomes

- Gate 1: passed. `npm test` red once (a page-count pin in `js/lib/icons.test.js`, fixed in `cbaf9ac`), then 2251/2251; `scripts/run-tests.sh` 726/726.
- Gate 2: ordinary cycle, risk class high-risk. Stack on :8081 reused. Items 4 and 8 failed on the missing confirm modal, fixed and re-verified; browser question answered yes, stack torn down.
- Gate 3: 3 rounds. Round 1, 10 findings: 5 fixed (group delete under a row lock, `view` kept in the rate card URL, retry after a failed group assign, saved-state filter, banner reset), 5 to follow-up. Round 2, 10 findings: 3 fixed (`md-subnav.js?v=4`, POT years for admins only, same-client popstate), 1 to follow-up, 1 pre-existing (no action), 1 rejected as false, 4 repeats. Round 3, 9 findings: all accepted as follow-up at the user's choice (b). Fixes each got a test that failed first.
- Gate 4: merged (`cb90479`, `main` had not advanced, merge commit), no migration, `scripts/backup-db.sh` run first (`backups/pdash-backup-2026-11-04-130155.dump`), `pdash-api` restarted and healthy at 2026-11-04T12:02:44Z, worktree removed, branch deleted. The out-of-scope check did not fire: the Plan has no "File Structure" section.
- Gate 5: sync-docs touched `ARCHITECTURE.md`, `CLAUDE.md`, `docs/prd/master-data.md`, `docs/js/lib.md`, `.claude/skills/operational-manual/SKILL.md`; 11 rows added to `docs/BACKLOG.md`, 1 closed.

## Code review follow-ups

All tracked in `docs/BACKLOG.md` (B-270…B-280):

- B-270, rounds 1-3: group move is two non-atomic client-side requests.
- B-271, round 1 #6: reset ignores `hidden` overrides of deactivated currencies.
- B-272, round 1 #7: phone Edit/Rename focus the hidden desktop input.
- B-273, rounds 1-3: duplicated desktop/phone markup.
- B-274, rounds 1 and 3: per-keystroke recomputation in the rate card.
- B-275, rounds 1 and 3: rate card auto-created on open.
- B-276, rounds 2-3: `reloadGroups` overwrites another client's optimistic group.
- B-277, round 3: By group header counts and empty-state text under a search.
- B-278, round 3: a failed `loadAll` is overwritten by "Client not found.".
- B-279, round 3: `createClient` mutates a raw object.
- B-280, round 3: `pots` subquery runs for non-admins.

## Roadmap notes

- Round 2 E (`Api.currencies.active()` failure swallowed by an empty `catch`) is the old page's behaviour, outside this diff: no action, no row.
- Round 2 F (a transaction helper "already in `api/src/db/client.js`") was false: it exports only `pool`, `query`, `testConnection`.
- Gate 2 found a defect the guards could not: `master-clients.html` called `showConfirm` without carrying `#confirmModal` (each page carries it by hand). A guard now pins it for this page; whether the other pages that call `showConfirm` all carry it was not checked.
- Round 2 caught a missed `?v=` bump (`md-subnav.js`, whose icons import was bumped): no guard compares a changed file with its references, only the references with each other.
- The sdd scripts `task-start`/`task-done` were not run on this host; the ledger was kept by hand in the worktree and went with it at worktree removal.
- The Spec and the Plan were not modified.

## Sync-docs outcome

Scope pass: 1 ARCHITECTURE.md yes (rate card entry, `GET`/`DELETE /api/client-groups` rows, file tree); 2 CLAUDE.md yes (Pages table Purpose of the Master Data row only); 3 TEST_CASES.md no (MD-14 added on the branch); 4 test-api.js no (CG-POT-01…04 added on the branch); 5 PRD yes (`docs/prd/master-data.md` intro, §7.2, §7.3; `PRD.md` itself untouched, §3 does not describe the Client Groups page); 5b yes (`.claude/skills/operational-manual/SKILL.md`, triggered by `docs/prd/master-data.md`; `docs/OPERATIONAL_MANUAL.html` is regenerated on request only); 6 PROCESS.md: none of the three conditions applies; 7 memory yes. Also `docs/js/lib.md` (new `master-clients.js` section, `master-client-groups` dropped from the `money.js` page list, four icons).

## Memory outcome

`project_ui_redesign_cycles.md`: "Next: phase 2 = merge Client Groups into Clients (… unverified whether that is its brief)" → "Master Data phase 2, page 1 'Clients & groups' — MERGED 2026-11-04 (`cb90479`) …", with the lesson on `showConfirm`, and the next step (the other phase-2 pages; their boards were not seen, to be asked). `MEMORY.md`: the UI redesign line now ends "Master Data phase 2 page 1 'Clients & groups' MERGED 2026-11-04 (`cb90479`, follow-ups B-270…B-280, next the other phase-2 pages)".
