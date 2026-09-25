# Finish-cycle report — worktree-resource-matching-aliases

**Date:** 2026-09-25
**Branch:** worktree-resource-matching-aliases → main (merge commit `d770f8d`)

Sub-cycle **3b** of the three-part Cycle 3 (resource profile from project history) — spec `docs/superpowers/specs/2026-09-25-resource-profile-design.md` §4, plan `docs/superpowers/plans/2026-09-25-resource-matching-aliases.md`. 3a (project tags) is already merged; 3c (contributions, scheduler, profile) is still to do.

## What was done

6 commits on the branch, merged `--no-ff`:

- `2954454` feat: pure name-matching module (`api/src/lib/match-resource.js`, 16 `node:test` cases)
- `5abb661` feat: `profile_unmatched` queue, refresh service and upload hook (migration `024`, `api/src/services/resource-matching.js`, `timesheets.js` upload/delete hooks, spec corrections)
- `7461119` feat: resource alias and unmatched-names API (`GET /unmatched`, `POST /unmatched/rescan`, `GET`/`POST /aliases`, `DELETE /aliases/:id`; MA-01…MA-10)
- `4e130c4` feat: Unmatched names panel in `team.html`
- `efa0451` fix: offer inactive resources in the Assign menu (MA-11)
- `c8715fa` fix: code-review round 1 — hours rounding (lib + SQL), alias `display_name` and `updated_by`/`updated_at`, 200 vs 201 on re-assignment, owner hours aggregated in SQL (MA-12, MA-13, MA-14)

Rollout: `scripts/backup-db.sh` snapshot first (`backups/pdash-backup-2026-09-25-142123.dump`), migration `024` applied to the real `pdash-db`, `pdash-api` restarted and healthy (StartedAt `2026-09-25T12:21:58Z`). Tests at merge: `npm test` 192/192, `api/src/lib` unit tests 70/70, `scripts/run-tests.sh` 192/192.

## Code review follow-ups

- Round 1 raised 4 minor findings (hours float noise, full rescan cost inside the request, alias list showing the normalized key, `created_by`/201 on re-assignment); the user chose to fix all four, all fixed in-cycle. Round 2: no findings. **No follow-ups accepted from the review.**
- The full rescan on every admin change is now cheap (SQL aggregation) but is still executed inline in the request; sub-cycle 3c replaces it with a queued background recalculation.

## Roadmap notes

- **Manual verification preceded three changes.** The user verified the panel manually and confirmed; afterwards the inactive-resources Assign menu, the alias `display_name`/audit columns and the SQL-aggregated rescan were added. They are covered by automated tests (MA-11…MA-14) and review round 2 but were **not re-verified in the browser**, and the Assign-menu change has no UI test.
- **`scripts/test-branch.sh up` skips new migrations.** It restores the main dump and, seeing the schema already present, prints "skipping migrations" — so a branch stack for a cycle that adds a migration lacks it until applied by hand (done manually to the isolated DB for this cycle's verification). Worth fixing in the script or documenting in `docs/scripts/test-branch.md`.
- **`team.html` job-title defect (found during verification).** The dropdown stores `roles.label` in `resources.job_title`, but the role strings in uploaded actuals are `roles.code` (9 of 12 distinct actual roles equal a `roles.code`, 0 equal a `roles.label`). Decided: a separate small cycle, after this one and before 3c — `resources.role_id → roles.id` NOT NULL, `job_title` dropped, no "Other…" option, dropdown `label (code)`, `config.js` role-delete guard, migration `025` that backfills and fails loudly on unmatched rows. Also 3 of the 12 actual role codes don't exist in `roles` (data quality).
- **Usability at scale (user, during verification).** ~150 people and dozens of unmatched names at once: needs search/sort/paging and a searchable assign control on the queue; there is no resource detail view, so the future experience profile has no home — the Cycle 3 spec §5 refers to a "detail" that does not exist. Planned: a "team UX" cycle before 3c (detail drawer with Details | Aliases | Experience profile tabs, page tabs with an unmatched-count badge). Recorded in project memory.
- Process notes: worktree sessions refuse compound shell constructs — plain PowerShell `git`/script calls work; run repo scripts with Git Bash, not the WSL `bash` PowerShell resolves to.
- Still open from earlier cycles: `costgrid.html` `toggleTag()` rollback race; the `:vId`↔`:id` gap on `structure`/`linked-projects`/`duplicate`; `PATCH /api/projects/:id` does not validate `cgVersionId` as a UUID.

## Sync-docs outcome

- **CLAUDE.md** — updated: migration `024` row (with the `test-branch.sh` caveat), `api/src/lib/` list (+`match-resource.js`), `api/src/services/` entry (+`resource-matching.js`), `resources.js` entry shortened to a pointer, `team.html` rows (Pages table and File structure) now point to `docs/pages/team.md`.
- **ARCHITECTURE.md** — updated: schema for `resource_aliases` and `profile_unmatched`, five new `/api/resources/*` endpoint rows and the note on the existing `POST`/`PATCH`/`DELETE` rescan triggers, `services/` tree entry, migration `024` in the list.
- **docs/api/resources.md** — created (route narrative: registry CRUD, the matching design, the `project_code` keying rationale); **docs/api/lib.md** — `match-resource.js` section added; **docs/pages/team.md** — created (registry + Unmatched names panel + known limits).
- **TEST_CASES.md / test-cases.html** — updated in mirror: new "Resource Matching" section, MA-01…MA-17 (`auto:true` on MA-01…MA-14; MA-15…MA-17 manual); the HTML's Regression section renumbered 21 → 22.
- **test-api.js** — already updated in the cycle itself (`testResourceMatching()`, `uploadCsv()` helper).
- **PRD.md** — evaluated and **updated** (user-visible: a new panel on the Team page): paragraph added to §16.7. **`.claude/skills/operational-manual/SKILL.md`** — its inlined §16.7 reference updated to match.
- **docs/superpowers/PROCESS.md** — gate answer: none of the three conditions applied; not touched.
