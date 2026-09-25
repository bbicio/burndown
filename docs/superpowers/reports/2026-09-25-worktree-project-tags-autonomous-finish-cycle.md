# Finish-cycle report — worktree-project-tags-autonomous

**Date:** 2026-09-25
**Branch:** worktree-project-tags-autonomous → main (merge commit `4f2457a`)

Sub-cycle **3a** of the three-part Cycle 3 (resource profile from project history) — spec `docs/superpowers/specs/2026-09-25-resource-profile-design.md`, plan `docs/superpowers/plans/2026-09-25-project-tags-autonomous.md`. Sub-cycles 3b (name matching/aliases) and 3c (contributions, scheduler, profile) are still to do.

## What was done

3 commits on the branch, merged `--no-ff`:

- `6cece7d` feat: backfill project_tags from linked proposal versions (migration `023`)
- `07c2730` feat: project tags autonomous from proposal (seed once, editable, hardened routes) — `copyVersionTagsToProject`, 409 removed, `unnest` bulk insert, `:vId`↔`:id` check on the version tag routes, 400 on malformed UUIDs, `project-config.html` reads/edits its own tags; tests TAG-06 (revised), TAG-13…TAG-18
- `a6ca8af` fix: lock project row on first-link PATCH, correct repair note (code-review round 1) — TAG-19

Rollout: `scripts/backup-db.sh` snapshot taken first (`backups/pdash-backup-2026-09-25-114451.dump`), migration `023` applied to the real `pdash-db` (`INSERT 0 0` — no proposal version had tags yet), `pdash-api` restarted and healthy (StartedAt `2026-09-25T09:46:26Z`).

## Code review follow-ups

- **Round 1, finding 3** — `PATCH /api/projects/:id` does not validate `cgVersionId` as a UUID (unlike `POST`), so a non-UUID string yields a 500 (`22P02`) instead of a 400. Pre-existing gap; this cycle only added one more use of the raw value on the same path. Accepted as follow-up — better fixed together with the other missing input checks in that route.
- Round 1 findings 1 (race on first-link `PATCH`, fixed with a `SELECT … FOR UPDATE` transaction) and 2 (misleading "re-run 023 to heal" comment, also copied into the spec and plan) were fixed in-cycle. Round 2: no findings.

## Roadmap notes

- **Closes two of the three Cycle 2 pending findings** (`project_known_findings_tag_cycle.md`): the version tag routes now verify `:vId` belongs to `:id`, and both replace-all routes use `unnest`. Still open: the `costgrid.html` `toggleTag()` rollback race on version-tab switch, and the same `:vId`/`:id` gap on `structure`/`linked-projects`/`duplicate` (deliberately not touched — spec §0).
- **TAG-19 is a smoke test, not a proof.** A race cannot be reproduced deterministically, so it was never seen failing before the fix; it checks that two overlapping first-link `PATCH`es both succeed and seed exactly once.
- **Backfill `023` was not exercised on real data.** The cloned data had no tagged proposal version (`project_tags` had 0 rows), so the manual check passed vacuously; correctness rests on the SQL being trivially idempotent plus TAG-13/14/15 for the runtime copy path. `023` must be applied only once.
- **Copy is best-effort by design (deviates from the spec's "same transaction"):** one atomic SQL statement, failure logged not thrown, because `js/api-sync.js` treats a failed `PATCH` as "project missing". A missed copy is repaired by hand for that one project, never by rerunning `023`.
- Test IDs TAG-13…TAG-20 added (TAG-20, the backfill, is manual).
- Process observations: a worktree-isolated session refuses `git`/scripts wrapped in compound shell constructs — plain `PowerShell` `git` calls worked; PowerShell's `bash` resolves to WSL (no Docker), so repo scripts must be run with `& "C:\Program Files\Git\bin\bash.exe"`; a fresh worktree needs the gitignored `.env` copied in before `test-branch.sh up`.
- `worktree.baseRef` defaults to `origin/main`, which would have missed the unpushed spec/plan commits — the worktree was created manually from local `HEAD` instead.

## Sync-docs outcome

- **CLAUDE.md** — updated: migration `023` added to the table.
- **ARCHITECTURE.md** — updated: `project_tags` schema comment (now the sole source of project tags), `PUT /api/projects/:id/tags` row (409 removed, seeding, `unnest`, 400 codes), `versions/:vId/tags` row (404 on foreign `:vId`, `unnest`), migration `023` in the migrations list.
- **docs/pages/project-config.md** — updated: the Tags paragraph now marks the Cycle 2 two-mode design as superseded and documents the current behavior and the transition-check rationale.
- **docs/pages/costgrid.md** — not necessary (its Tags section describes the proposal-side UI, unchanged).
- **TEST_CASES.md / test-cases.html** — updated in mirror: TAG-03/04/06 revised, TAG-13…TAG-20 added (`auto:true` on 13–19).
- **test-api.js** — already updated in the cycle itself (161/161 via `scripts/run-tests.sh`).
- **PRD.md** — evaluated and **updated**: §16.9's project-tags paragraph rewritten (user-visible change: linked-project tags are now editable, seeded once from the proposal, independent after). **`.claude/skills/operational-manual/SKILL.md`** — its inlined §16.9 reference updated to match.
- **docs/superpowers/PROCESS.md** — gate answer: none of the three conditions applied (no process-skill change, no recurring process exception, no change to the skeleton/guardrails); not touched.
