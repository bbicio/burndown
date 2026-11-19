# Finish-cycle report — save-c4-tags

**Date:** 2026-11-19
**Branch:** save-c4-tags → main
**Execution started:** 2026-11-19 11:12
**Merged at:** 2026-11-19 12:24
**Gate durations:** Gate 1 5m · Gate 2 47m · Gate 3 14m · Gate 4 6m · Gate 5 (to report) 3m — total 77m
**Cycle counters:** subagent dispatches 13 (plus 1 resume via SendMessage) · review rounds 2 · full test-suite runs: `npm test` 4, backend suite unknown (the subagents' runs of `cd api && npm test` were not all reported)
**Gate 5 tests:** docs-only → `npx vitest run scripts/ js/lib/test-cases-parse.test.js` ×1 (green on first run)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-19-save-c4-tags.md`) · review effort high
**Claims pre-check:**
- Gate 1, about 4 minutes: it caught 4 false sentences, committed as `81c13d72`:
  - two that still named the removed `Api.*.tags.replace`;
  - an error order contradicted by `versionScope`;
  - TAG-09's "verified manually during this cycle".
- Gate 3: the re-check of the round-1 fixes caught 1 more false order in `docs/api/attribute-lists.md` (`51de76a4`), and round 2 then found a further one in the same line (`3b1684b0`).
- Round 1 of the final review had 7 findings. 3 of them were the mechanical ones Gate 1 had already fixed, all false predicates.

**Security review:** ran. Triggered by `api/src/routes/cost-grids.js`, `api/src/routes/projects.js` and the pages and `js/` files, at `d0996521` alongside the final review. 0 findings.
**Acceptance:**
- 8 criteria plus 14 `TEST_CASES.md` cases.
- Pre-ticked from automated runs:
  - Guard, Suite and Documentation: `npm test` 3405/3405 at `81c13d72`;
  - TAG-06/07/17/18/21/22/23/25/26: `scripts/run-tests.sh` 1193/1193 at `64679e6c`;
  - api unit tests 639/639.
- Verified by hand by the user, positive on the branch stack: criteria 1-4 (two tabs, failed read, failed write, adoption), TAG-01, TAG-02, TAG-05, TAG-09 and HD-04.
- Not verifiable here: criterion 8 (Backlog), done at Gate 5.

## What was done

9 commits:

- `8b475d8d` feat(tags): assign and remove one tag at a time; drop the replace-all routes
- `49e8f03f` feat(save): apiSave background option; tagToggle writes one tag
- `64679e6c` fix(tags): tighten TAG-22/23/25 assertions, repin test-case count, order TAG cases
- `accecb7a` fix(project-config): tags write one item, show load and save failures
- `d0996521` fix(costgrid): tags write one item, show load and save failures
- `81c13d72` docs: claims pre-check — drop removed tags.replace mentions, versionScope 404 order, TAG-09 wording
- `41688555` fix(tags): hide summary pills while unknown, simplify version lookup, 404 for non-UUID project id, project viewer test
- `51de76a4` docs: non-UUID project id answers 404 before the permission check
- `3b1684b0` docs: tag write errors — what answers 404 before the permission check

## Gate outcomes

- **Gate 1: passed.**
  - Step 0 fixed 4 doc claims (`81c13d72`).
  - `npm test` 3405/3405.
  - Site-export tests were not needed.
  - The security scope said `review`, and the dependency audit `none`.
  - `run-tests.sh` was skipped: it was green at `64679e6c` (Task 1's run, done by the controller), with no backend or harness change since.
- **Gate 2: passed.**
  - The branch stack was started at pre-flight. Main was not running then, so it got a fresh database. Its admin bootstrap failed under Git Bash and was re-run by hand (B-564). The data came from `seed-smoke.js`, which stopped part-way (B-563).
  - The acceptance checklist was verified by hand, and the browser question was answered "yes".
  - The stack was torn down.
- **Gate 3: 2 rounds.**
  - Round 1 was the final review (high, `cc3bbad8..d0996521`) plus the security review (0 findings): 7 Minor.
    - 3 were already fixed by Gate 1 step 0.
    - The user chose "Fix everything now" for the other 4; they were fixed in `41688555`.
    - `run-tests.sh` gave 1197/1197 at `41688555`. Its single teardown ✗ (`DELETE /api/pipeline-years/<id>` → 409) was also in the earlier run.
  - `81c13d72` (no-code) was not reviewed again.
  - Round 2 was scoped to `81c13d72..51de76a4`: all 4 fixes ADDRESSED, plus 1 new Minor on a doc. It was fixed in `3b1684b0` and the round closed under the text-only rule.
  - Backend re-run: nothing to run, no backend change since `41688555`.
  - Disposition by target: none went to Roadmap or BACKLOG.
- **Gate 4: merged** with `--no-ff` as `c2fc30fb` and pushed.
  - Backup `backups/pdash-backup-2026-11-19-122416.dump` (136K).
  - No migration.
  - pdash-api restarted and healthy at 2026-11-19T11:25:02Z.
  - Worktree removed and branch deleted.
  - Out of scope, against the Plan's per-task Files lists: `docs/js/shared-libs.md`, `docs/js/costgrid.md` and `js/lib/test-cases-parse.test.js`.
- **Gate 5:** `/sync-docs` updated `docs/prd/administration.md` and `handbook/public/manual.md`; 2 BACKLOG rows were added (B-563, B-564).

## Code review follow-ups

None.

## Roadmap notes

- **Docker was down when Task 1 reached its `run-tests.sh` step.** The controller ran it once Docker was up: the first attempt timed out on `pdash-db-test` health right after Docker started, and the second was green.
- **Branch stack bootstrap (B-564).** Under Git Bash, `scripts/test-branch.sh up` fails to bootstrap its test admin, because MSYS rewrites the `/app/...` path. It was run by hand with `MSYS_NO_PATHCONV=1`.
- **Smoke seed (B-563).** `api/src/scripts/seed-smoke.js` has been broken since `save-c3`, because `PUT /api/projects/:id/tasks` is gone. Its new tag step worked.
- **Plan rulings** (SDD ledger):
  - *Ruling:* Task 2 bumps `js/lib/save.js?v=` (1→2) in every page that loads it, which spec §5 requires and the Task 2 file list omitted. If wrong: one harmless extra bump.
  - *Ruling:* Task 4 keeps "no `versionTagRows = []`": on a version switch the previous rows stay, disabled, while the new tags load or fail. If wrong: greyed-out old ticks show after a failed read. The closed summary hides the pills while `unknown` (`41688555`).
- **Shell output was unreliable for one check.** During Gate 1 step 0 a filtered shell `grep` returned no hits where the Grep tool found two. The check was settled with the Grep tool.
- **Two out-of-scope deferred minors were triaged by the final review as fine to leave:**
  - `tag-toggle.test.js` has no conflict/rule cases;
  - `tagError` is not cleared by a successful Retry.

## Sync-docs outcome

- **1, ARCHITECTURE:** already on branch (the tag route rows).
- **2, CLAUDE.md:** no change. `js/lib/` points to `docs/js/lib.md`, which the branch updated.
- **3, TEST_CASES:** already on branch.
- **4, test-api.js:** already on branch.
- **5, PRD:** updated `docs/prd/administration.md` §16.9. Each click writes one tag; a failed load shows "Tags could not be loaded." with Retry and "Unavailable"; a failed write shows its error inline and reverts the pill. These are user-visible controls, so the update was made without asking.
- **5c:**
  - `handbook/public/manual.md` "Attribute lists and tags" gained a Details block with the same three points.
  - The production checklist has nothing on tags: no change.
  - ARCHITECTURE: see 1.
- **6, PROCESS.md gate:** none of the three conditions applies, so it was left untouched.
- **7, Memory:** updated (next section).

## Memory outcome

- `project_save_contract_series.md`:
  - description: "…c3 … MERGED 2026-11-18 (`95f69ce`, …); next c4 tags" → "…; c4 tags MERGED 2026-11-19 (`c2fc30fb`); next c5 server atomicity";
  - added a 2026-11-19 c4 paragraph: what shipped, the Gate 3 outcome, the side findings, and "Next: c5".
- `MEMORY.md`: the save-contract line "next: c4 tags" → "c4 tags MERGED 2026-11-19 (`c2fc30fb`); next: c5 server atomicity".
