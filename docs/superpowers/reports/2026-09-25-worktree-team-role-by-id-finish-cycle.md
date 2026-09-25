# Finish-cycle report — worktree-team-role-by-id

**Date:** 2026-09-25
**Branch:** worktree-team-role-by-id → main (merge commit `4c1c451`)

Small cycle between sub-cycles 3b and 3c of Cycle 3 (resource profile). Spec `docs/superpowers/specs/2026-09-25-team-role-by-id-design.md`, plan `docs/superpowers/plans/2026-09-25-team-role-by-id.md`. Origin: during the manual verification of 3b the user noticed that the Team "job title" dropdown stores `roles.label`, while the role strings in uploaded actuals are `roles.code`.

## What was done

6 commits on the branch, merged `--no-ff`:

- `5c1ea11` feat: link team resources to roles by id — migration `025` (`resources.role_id → roles.id` NOT NULL, backfill from `job_title` by `roles.code` then `roles.label`, aborts on an unmatched row, drops `job_title`), `resources.js` takes/returns the role by id; tests TM-04, TM-12…TM-15 and the `MA-*` setup moved to `roleId`, new `makeTestRole()` helper
- `bf1def2` fix: block deleting a role assigned to a team resource (`config.js`, TM-16)
- `761252f` feat: team page selects the role by id — `label (code)` select, no "Other…", "Role" column, search by role
- `0b13cce` fix: scroll to the error banner when a Config action fails (`config.html`; found when the user tried the role-delete guard: the 400 message went to a banner above the tabs, out of view on a long list)
- `2c4fda1` fix: let the Unmatched names assign select go back to its placeholder (`team.html`; a 3b defect — the placeholder option was `disabled`)
- `5f52bbb` fix: code-review round 1 — constraint-specific message in the role-delete catch, `ORDER BY ro.id` in the `025` code match, and the `TM-04…TM-07` rewrite / `TM-12…TM-17` cases in `TEST_CASES.md`/`test-cases.html`

Rollout: `scripts/backup-db.sh` first (`backups/pdash-backup-2026-09-25-151817.dump`), migration `025` applied to the real `pdash-db` (`resources` had 0 rows; `job_title` gone, `role_id` NOT NULL), `pdash-api` restarted and healthy (StartedAt `2026-09-25T13:21:07Z`). Tests at merge: `npm test` 192/192, `api/src/lib` 70/70, `scripts/run-tests.sh` 206/206.

## Code review follow-ups

- Round 1 raised 3 minor findings (the role-delete catch mapping any FK error to the team-resource message; `LIMIT 1` without `ORDER BY` in the `025` code match; stale `TM-04…TM-07` docs); the user chose to fix all three, all fixed in-cycle. Round 2: no findings. **No follow-ups accepted from the review.**
- One reviewer remark was inaccurate: it said `CLAUDE.md` lacked migrations 023/024. Both rows have been there since the two previous syncs (verified in the file and in git: `6aff571`, `d8d1cb7`, also on `origin/main`).

## Roadmap notes

- **Verification order.** The user's manual verification of the role-by-ID work (including the two extra fixes) completed before code review; the three round-1 fixes came after it and are covered by automated tests, the review, and a throw-away-Postgres check of the `ORDER BY` — but were not re-verified in the browser. The catch-mapping fix (`config.js`) has no failing-first test (it only triggers on a race between the assignment check and the delete); TM-16 covers the normal path.
- **Migration `025` was verified manually** (no DB access from `test-api.js`): unmatched row → explicit error and `job_title` kept; after removing it → success; re-run → no-op; ambiguous code match → lowest id. The manual test case is `TM-17`.
- **`scripts/test-branch.sh up` still skips new migrations** on the cloned DB (already noted in the 3b report): `025` had to be applied by hand to the branch DB container to test the UI.
- **`config.html` leftovers:** `deleteRole()` still uses the native `confirm()`; the new scroll-to-banner watcher only re-fires when the message changes (only `deleteRole()` resets it first), so other handlers that repeat an identical error won't re-scroll. Both left alone to keep the cycle small.
- **Migration table ordering in `ARCHITECTURE.md`:** the 3b sync had put migration 024 before 023 in the migrations list; corrected to ascending in this sync.
- **Next, already agreed (project memory):** a "team UX" cycle (resource detail view with tabs, searchable assign control and search/sort on the unmatched queue, page tabs) before sub-cycle 3c (contributions, scheduler, profile). 3 of the 12 role codes seen in actuals do not exist in `roles` (e.g. `HWGHEIN - DATA ANALYST`) — a separate data-quality issue that will keep those people from being assigned that role.
- Still open from earlier cycles: `costgrid.html` `toggleTag()` rollback race; the `:vId`↔`:id` gap on `structure`/`linked-projects`/`duplicate`; `PATCH /api/projects/:id` does not validate `cgVersionId` as a UUID.

## Sync-docs outcome

- **CLAUDE.md** — updated: migration `025` row (after `024`, table kept ascending); `team.html` Pages-table row now says "role by id".
- **ARCHITECTURE.md** — updated: `resources` schema (`role_id` replaces `job_title`), the `/api/resources/:id` row (`roleId`, FK-constraint disambiguation, `GET` returns `role_id`/`role_label`/`role_code`), the `/api/roles/:id` row (delete guard), migration `025` in the list (and the 023/024 ordering fixed).
- **docs/api/resources.md** and **docs/pages/team.md** — the "known defect" paragraphs replaced with the role-by-id design, and the Assign-placeholder fix noted; **docs/pages/config.md** — new section on the role delete guard and the error-banner scroll.
- **TEST_CASES.md / test-cases.html** — already updated in the branch (`TM-04…TM-07` revised, `TM-05` marked obsolete, `TM-12…TM-17` added; `auto:true` on 12–16).
- **test-api.js** — already updated in the cycle (`makeTestRole()`, TM-04/12–16, `MA-*` setup).
- **PRD.md** — evaluated and **updated** (user-visible: role instead of job title, no free-text option, a role in use can't be deleted): §16.7. **`.claude/skills/operational-manual/SKILL.md`** — its inlined §16.7 reference updated to match.
- **docs/superpowers/PROCESS.md** — gate answer: none of the three conditions applied; not touched.
