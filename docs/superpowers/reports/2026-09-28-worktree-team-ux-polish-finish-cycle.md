# Finish-cycle report — worktree-team-ux-polish

**Date:** 2026-09-28
**Branch:** worktree-team-ux-polish → main

## What was done

9 commits:
- `ab26180` docs: spec for team UX polish cycle (unmatched search/sort/paging, project list, Team paging)
- `4df6a30` docs: implementation plan for team UX polish cycle
- `e75b929` feat: add project_codes to GET /api/resources/unmatched
- `7884d8f` feat: add paginate() and sortUnmatched() to js/lib/team-ui.js
- `cab1a07` feat: paginate the Team table (25 rows/page)
- `66f0228` feat: search/sort/paging on the Unmatched names queue, expandable project list
- `b18fb47` docs: sync team.md/resources.md/TEST_CASES.md for the Team UX polish cycle
- `7b4e01f` fix: review findings for Team UX polish cycle (from the SDD final whole-branch review)
- `7497c63` fix: show full project name (code) in Unmatched names' expandable project list (found during Gate 2 manual verification)

Delivered: search/sort/pagination (25 rows/page) on `team.html`'s Team tab and Unmatched names tab; an expandable per-row "Project name (CODE)" list on Unmatched names, backed by a new `project_list` field on `GET /api/resources/unmatched`; two new pure helpers (`paginate`, `sortUnmatched`) plus an exported `fold` in `js/lib/team-ui.js`.

Executed via `superpowers:subagent-driven-development`: 5 plan tasks, each with a fresh implementer + task reviewer (all approved clean, no fix rounds needed at task level), followed by a whole-branch final review (Opus) that found 2 Important + 1 Minor finding, fixed in one dispatch and verified clean by a scoped re-review.

## Code review follow-ups

None. `/code-review medium` (Gate 3) returned zero findings on the merged diff.

## Roadmap notes

- **Parked, not built this cycle:** a "candidate suggestion" (token-overlap hint) for unmatched names the admin would still have to confirm — explicitly deprioritized by the user during brainstorming ("non serve ora"). Tracked in `project_team_ux_backlog.md` memory.
- **Parked minor (SDD final review, ruled correctly-implemented-per-spec, not a bug):** the Unmatched-names page resets to page 1 after every assign/ignore/rescan (not just on search/sort changes) — this matches the spec exactly, but on a large queue an admin working through several pages loses their place after each assign. Worth reconsidering in a future cycle since `paginate()`'s own clamping already handles a genuinely emptied page without needing a broad reset.
- **Parked minors (SDD final review, deferred, not blocking):** the Unmatched search box stays visible even when the queue itself is empty (cosmetic); the tab's header count (`unmatched.length`) ignores the active search filter, so it can look inconsistent with the filtered table underneath; `team.html` keeps growing (now holds two tabs' worth of search/sort/paging logic, a side panel, the profile tab and a local component) and has near-duplicated pagination/sort markup between the two tabs — a small shared `<pager>` component and a shared sort-state helper would be worth adding before the next cycle touches this page.
- **Found and fixed during Gate 2 manual verification (not part of the original plan):** the Team tab's page-reset watcher fired on `sortedResources` (any recompute — including Save/Edit/Activate/Deactivate/Delete), not just on filter/sort changes, so an admin editing a row on page 4+ was bounced back to page 1. Fixed as part of the SDD final-review fix round (Important #1) alongside the accent-insensitive-search gap (Important #2) and the bare-headers-on-empty-search minor (#3).
- **Found and fixed live with the user during Gate 2:** the expandable project list originally showed bare project codes only (`project_codes: string[]`) — the user found this impractical to read and asked for the full project name with the code in parentheses. Reworked the API field to `project_list: [{code, name}]`, resolved via the same "oldest project per code" tie-break `profile-jobs.js` already uses (`projects.code` has no uniqueness constraint).
- **Gap found while syncing docs:** `test-cases.html` was missing TU-13 through TU-18 entirely — the plan's Task 5 brief only named `TEST_CASES.md`, and `test-cases.html`'s mirroring rule wasn't followed. Closed as part of this cycle's `/sync-docs` pass (also added TU-19 for the page-reset-on-edit fix).
- **Next cycle** (per the user-confirmed priority order in `project_team_ux_backlog.md`): `planning.html` handling of inactive team members — distributing future ("to be planned") hours only among active owners, keeping past actuals attributed to inactive people with a badge.

## Sync-docs outcome

- **ARCHITECTURE.md**: updated the `GET /api/resources/unmatched` row for the new `project_list` field.
- **docs/js/lib.md**: added a `paginate`/`sortUnmatched`/`fold` section (including the mid-cycle `?v=3`→`?v=4` bump from the manual-verification fix).
- **docs/pages/team.md**, **docs/api/resources.md**: already updated inside the cycle itself (Task 5 + the Gate-2 fix commit) — verified accurate, no further changes needed.
- **CLAUDE.md**: not touched — its `api/src/routes/resources.js` and `js/lib/` entries are already short, stable pointers to the `docs/` files above, per the routing rule; no cycle-by-cycle narrative belongs there.
- **TEST_CASES.md**: updated TU-17's wording (name + code, not just code) and added TU-19 (edit-doesn't-reset-page).
- **test-cases.html**: added the missing TU-13 through TU-19 (see Roadmap notes — this was a real gap left by the plan's Task 5, closed here).
- **test-api.js**: already updated inside the cycle (MA-05b, revised for `project_list` in the same Gate-2 fix commit).
- **PRD.md**: updated — evaluated explicitly as user-visible (admin-facing UI change: paging on both tabs, search/sort added to Unmatched names, expandable project-name list). §16.7 Team revised accordingly.
- **`.claude/skills/operational-manual/SKILL.md` §6b**: synced to match the PRD.md §16.7 changes above, since PRD.md was touched this cycle.
- **`docs/superpowers/PROCESS.md`**: gate evaluated — none of the three trigger conditions applied (no process skill changed, no recurring exception introduced, no change to the 7-phase skeleton or scenario guardrails) — left untouched.
