# Finish-cycle report — worktree-admin-crud-consistency

**Date:** 2026-09-23
**Branch:** worktree-admin-crud-consistency → main

## What was done

5 commits, merged `--no-ff`:

- `1bca762` fix: guard res.ok before assigning GET response bodies (admin/team/attribute-lists)
- `ba66a50` fix: enforce unique attribute-list item labels per list, closing AL-08
- `d3acf30` docs: correct CLAUDE.md's script-load-order rule to match actual practice
- `52bed6f` fix: address round-1 code-review findings on cross-page consistency cycle
- `f769db0` fix: address round-2 code-review findings on cross-page consistency cycle

A dedicated bounded cycle to close out the three cross-page consistency follow-ups deferred as round-3 code review findings from the `worktree-team-attribute-lists` cycle (see `docs/superpowers/reports/2026-09-23-worktree-team-attribute-lists-finish-cycle.md`):

1. **Missing `res.ok` guards** on `admin.html`'s `loadUsers`, `team.html`'s `loadResources`/`loadRoles`/`loadUsers`, and `attribute-lists.html`'s `loadLists`/`openList` — a non-2xx JSON error body could previously reach a `.filter()`/`.length` call and throw. All six now check `res.ok` and surface `globalError`, wrapped in try/catch so a network failure or non-JSON error page also surfaces cleanly instead of throwing an unhandled rejection.
2. **No server-side uniqueness on `attribute_list_items(list_id, label)`** — new migration `021` adds a case-insensitive unique index, with a disambiguation step for any pre-existing duplicates so the index always creates cleanly. Both item routes (`POST`/`PATCH`) now return 409 on a duplicate. `AL-08`'s test case and `test-api.js` assertions were updated from "known gap" to "fixed."
3. **Script-load-order documentation** — investigation found CLAUDE.md's literal `core.js, api.js, api-sync.js, nav.js, notifications.js, settings.js` order was never actually followed by any page (including `pipeline.html`), and `api-sync.js` exports are unused by all three admin CRUD pages. Per user decision, corrected the documentation instead of forcing the three pages into an order nothing else uses or adding an unused script include.

## Code review follow-ups

- **Round 3** — Migration 021's duplicate-label disambiguation suffix (`' (duplicate N)'`) is not itself checked for a further collision after truncation — a pathological pre-existing label already ending in that exact suffix pattern could still collide and fail the index creation. Extremely low probability; not fixed.
- **Round 3** — `team.html`'s `created()` now loads resources/roles/users sequentially (round-2 fix for a shared-`globalError`-overwrite race) instead of restructuring the three loaders to return `{ok, error}` and aggregating via `Promise.allSettled`, which would preserve concurrency. Style/quality suggestion, not a correctness bug; not fixed.
- **Round 3** — The fetch → parse-JSON → check-`res.ok` → set-error pattern is now duplicated across 6 call sites in 3 files. A shared helper (e.g. `apiGet(url, fallbackMsg)` in `js/core.js` or `js/api.js`) would reduce the risk of a future fix being applied to some copies but not others. DRY suggestion; not fixed.

All three were explicitly accepted as follow-up at the 3-round checkpoint rather than pursuing a 4th review round.

## Roadmap notes

- **Process gap discovered and fixed in this cycle:** `/finish-cycle`'s Gate 4 backend-restart step restarts `pdash-api` but never applied pending migration files. Migration `020` (`resources`/`attribute_lists` schema, merged in the prior `worktree-team-attribute-lists` cycle) had sat unapplied against the main `pdash-db` for an entire cycle as a result — `team.html`/`attribute-lists.html` never actually worked against the real stack, only against isolated test stacks (which apply every migration fresh on spin-up, masking the gap). Discovered here only because this cycle's own migration `021` failed with `relation "attribute_list_items" does not exist`. Fixed by: (a) manually applying both `020` and `021` to the main `pdash-db` as part of this cycle's Gate 4, and (b) adding a new Gate 4 step to `.claude/commands/finish-cycle.md` that applies any new migration files before the backend restart on every future cycle.
- The three round-3 follow-ups above (migration suffix collision edge case, `team.html` concurrency-vs-correctness tradeoff, DRY helper extraction) remain open — low priority, none are correctness bugs in normal operation.

## Sync-docs outcome

- **CLAUDE.md** — updated: corrected the script-load-order rule (removed the fixed-order claim nothing followed, replaced with the actual global-must-precede-use constraint); added migration `021` to the migrations table; noted the new unique-index/409 behavior in the `attribute-lists.js` file-structure entry.
- **ARCHITECTURE.md** — updated: added the `UNIQUE (list_id, lower(label))` constraint to `attribute_list_items` in §5.2; added migration `021` to §8; noted the 409 behavior in the API Reference table for the items routes.
- **PRD.md** — evaluated and **updated**: the item-label uniqueness rule is genuinely new user-visible behavior (an admin can now hit a rejection they couldn't before) — added one sentence to §16.8.
- **`.claude/skills/operational-manual/SKILL.md`** — updated (triggered by the PRD.md change): mirrored the same one-sentence addition into its detail-content reference for §16.8.
- **TEST_CASES.md** / **test-cases.html** — updated: `AL-08` changed from "known follow-up, accepted" to "fixed" with its new expected behavior (409 on duplicate).
- **test-api.js** — updated: `AL-08`'s assertion changed from expecting 201 (duplicate accepted) to expecting 409, plus a new case-insensitivity assertion. Verified live via `scripts/run-tests.sh` — 141/141 passing.
- **`.claude/commands/finish-cycle.md`** — updated (not part of `/sync-docs`'s normal scope, done directly as part of this cycle per explicit user decision): added a new Gate 4 step applying pending migration files before the backend restart — see Roadmap notes above.
- **PROCESS.md gate** — **none of the three conditions applied**: this cycle didn't modify `feature-brief`/the audit skill/`audit-to-brief`, didn't introduce a recurring exception to how those skills' own outputs get processed, and didn't touch the 7-phase skeleton or scenario guardrails. `docs/superpowers/PROCESS.md` only references `/finish-cycle` as a step name — it doesn't inline that command's own gate mechanics — so the finish-cycle.md fix above didn't require a `PROCESS.md` change either. Left untouched.
