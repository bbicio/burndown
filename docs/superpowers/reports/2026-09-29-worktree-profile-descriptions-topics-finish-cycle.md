# Finish-cycle report — worktree-profile-descriptions-topics

**Date:** 2026-09-29
**Branch:** worktree-profile-descriptions-topics → main (merge commit `fe6f937`, pushed)

## What was done

17 commits (spec `docs/superpowers/specs/2026-09-29-profile-descriptions-topics-design.md`, plan `docs/superpowers/plans/2026-09-29-profile-descriptions-topics.md`, executed subagent-driven, 11 tasks + a final-review fix wave + a code-review fix commit):

- 1371731 docs: plan — replace tautological assertion in Task 9 test
- 1bb8071 feat: pure topic-extraction library (prompt, parsing, candidate resolution)
- 65acbf8 feat: migrations 027 (project/task descriptions + backfill) and 028 (topics)
- b7f20d6 feat: project and task descriptions in the projects API, queue on change
- 3f41db2 feat: copy proposal note/task descriptions to the project; editable in project-config
- 2018e27 feat: admin API for the topic vocabulary (create, rename, approve, reject, restore, merge)
- 0771c34 feat: topic extraction service (single LLM call per project, failures never block)
- be08ef8 fix: callAnthropic must not leak a non-JSON response body in its error
- 8620ed0 feat: extract topics before processing a code; topics in the aggregated profile, resolved at read time
- c583a5f fix: a persistent topic-extraction failure is counted once, not on every run
- f4426a5 feat: Topics tab in attribute-lists.html (approval queue, rename, merge, reject/restore)
- 052db8c fix: show the server error after a failed topic action (reload first, then set the error)
- d1ae412 feat: topics block in the Experience profile (team.html)
- e0fbaad feat: profile-jobs console shows topic extraction errors, on/off switch, re-extract on Process
- e597627 docs: topics cycle documentation, migrations table, test cases
- c20256f fix: final-review wave (merge self-merge guard, LLM truncation and batching, branch-stack key blanking, minor hardening)
- 2a22a74 fix: re-queue all codes when topic extraction is re-enabled; refuse merging an approved topic into a non-approved target

Gates: Gate 1 passed (vitest 256/256, isolated integration suite 374/374 on the branch, 378/378 after the review fixes). Gate 2: branch test environment run twice (second time with the real Anthropic key, user-provided sample attribute lists); user verified end to end (description → LLM extraction → proposed topics → approve → chips in the resource profile). Gate 3: round 1 two low findings (fixed), round 2 zero findings. Gate 4: DB backup `backups/pdash-backup-2026-09-29-123811.dump` (copied to the main repo's `backups/`), merged `--no-ff`, pushed, migrations 027 and 028 applied to the real `pdash-db`, `pdash-api` recreated with `docker compose up -d api` (needed to load the new `ANTHROPIC_*` env vars; compose also restarted `pdash-db` as a dependency, data verified intact), worktree deregistered, local branch deleted.

## Code review follow-ups

None — both round-1 findings were fixed in this cycle (re-enabling extraction now re-queues all codes; an approved topic can no longer be merged into a non-approved target). Round 2: no findings.

## Roadmap notes

- **Next cycle (user decision):** move the topic-extraction LLM from the Anthropic API to a local model served by LM Studio, because production will run on Azure and everything should stay self-hosted. Single seam: `callAnthropic` in `api/src/services/topic-extraction.js`; check a small model against the JSON contract in `api/src/lib/topic-extract.js`.
- **Input for Cycle 4 (user observation):** project-level topics go to every contributor, so profiles of people on the same project look nearly identical; differentiate at read time (topic × role × hours on linked tasks) and store per-topic provenance (direct via task vs project context) in `resources.profile.topics`. Weights deferred by the user.
- Known limitations accepted (final review): a description saved during an LLM call can be absorbed by the queue until the next enqueue; "add tasks to existing project" (`cgDoAddTasksToProject`) does not copy task descriptions; a model answer that omits a text wipes that text's topics until next edit; no backoff for permanently failing texts; manual Rebuild/Recalculate/Process call the LLM inside the HTTP request; TX-04 asserts vacuously; 028 `created_by`/`updated_by` lack ON DELETE SET NULL; list-value topic names return 400 (spec said 409).
- PRD §4.4 (proposal detail panel) may still say "Notes" — not confirmed against the panel's label.
- `test-cases.html` already had two sections numbered 24; the new section is 25 and the old duplicate was not renumbered. Test label `TX-11` is used both for the merge-guard check in `test-api.js` and for a console UI case in `TEST_CASES.md` (noted as TP-10 there).
- A `pg_dump` of the real database exists at `backups/pdash-backup-2026-09-29-123811.dump` (taken before the migrations).
- The worktree needed a copy of the gitignored `.env` for `scripts/run-tests.sh`; `test-branch.sh` now blanks `ANTHROPIC_API_KEY` unless `TEST_BRANCH_ALLOW_LLM=1`.

## Sync-docs outcome

Updated: `ARCHITECTURE.md` (schema for `description` columns and the three new tables plus the setting; API table rows for `/api/topics` and `PUT /api/profile-jobs/topic-settings`; profile endpoint note; directory structure pointers), `TEST_CASES.md` (TX-09 re-enable case, TP-10 merge guard), `test-cases.html` (new section 25, 35 cases, 30 auto), `PRD.md` (Description fields in §4.9/§7.1/§12.3, Topics block in §16.7, Topics tab §16.8, console switch/column §16.10, new §16.11), `.claude/skills/operational-manual/SKILL.md` (reference mirrors the changed PRD sections), `docs/api/topics.md` and `docs/api/profile-engine.md` (merge guard, re-enable behaviour). Already updated during the cycle: `CLAUDE.md`, `docs/api/*`, `docs/pages/*`, `docs/js/lib.md`, `docs/scripts/*`. Not needed: `CLAUDE.md` (consistent with the merged state), `docs/superpowers/PROCESS.md` (gate: none of the three conditions applies — this cycle only executed the documented process). PRD.md outcome: updated (user-visible change). `docs/OPERATIONAL_MANUAL.html` not regenerated (only on explicit request).
