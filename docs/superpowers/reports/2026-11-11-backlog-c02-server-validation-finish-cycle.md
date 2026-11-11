# Finish-cycle report — backlog-c02-server-validation

**Date:** 2026-11-11
**Branch:** backlog-c02-server-validation → main
**Execution started:** 2026-11-11 15:34  (pre-flight step 6)
**Merged at:** 2026-11-11 17:24  (Gate 4's merge commit)
**Gate durations:** Gate 1 10m · Gate 2 69m · Gate 3 25m · Gate 4 7m · Gate 5 (to report) unknown — total unknown
**Cycle counters:** subagent dispatches 24 · review rounds 3 · full test-suite runs unknown
**Gate 5 tests:** docs-only → `npx vitest run scripts/ js/lib/test-cases-parse.test.js` ×2 (red, then green: `scripts/claude-md-guard.test.js`'s pinned File structure block size, fixed by reverting the `pipeline-years.js` entry edit)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-11-backlog-c02-server-validation-integrity.md`) · review effort high
**Claims pre-check:** At Gate 1 it took about 2 minutes over the three changed `*.md` files and caught 1 defect, a stale line number (B-439 cited line 896, the line is 895), fixed in `5b0de20`. At Gate 3 the round fixes touched no `*.md`, so there was nothing to re-check. Of round 1's 9 findings, 1 was mechanical (a false predicate: the ratecard entries docs in `ARCHITECTURE.md` and `docs/api/config.md`).
**Acceptance:** 8 items. 5 pre-ticked from automated runs at `5b0de20`: 1 no 500 (`scripts/run-tests.sh`, 895/895 with 46 SV checks), 2 shared module (`input-rules.test.js` in the backend 447/447, `grep -rn "0-9a-f\]{8}" api/src/routes` empty), 3 stale rate card refused (SV-33, SV-35), 7 NUMERIC as numbers (SV-07, SV-08), 8 suites green (`npm test` 2925/2925, backend 447/447, integration 895/895). 3 verified by hand on the branch stack with migration 035 applied: 4 two tabs on one rate card, 5 year with only a Draft proposal, 6 phasing XLS hours equal to the Phasing view. None left unverified.
<!-- Gate 5's duration is unknown: a usage-limit pause interrupted it between 17:30 and 17:51. -->

## What was done

25 commits, executed subagent-driven (9 plan tasks, a final whole-branch review and its fix wave), then three Gate 3 rounds:

- `ae5c3e0` feat(api): input-rules module; one isUuid for every route (B-010, B-212)
- `7a3cbf8` fix(api): last inline UUID regex uses isUuid (B-010)
- `86360ca` fix(api): pots and currency rates refuse malformed input with 400 (B-042, B-236, B-334)
- `6ffab37` fix(api): NUMERIC parsed as numbers; project PTC/phasing capped at NUMERIC(14,2) (B-193, B-223)
- `d512f28` test(api): MR-18b uses an amount above the new phasing cap (B-223)
- `1e3b477` fix(api): project tasks/phasing/PTC read the currency under the row lock and answer 404 (B-189, B-191, B-192)
- `4a1663c` fix(api): structure PUT checks rates under the version lock, 404 on a missing version, no custom flag without a rate (B-189, B-192, B-229)
- `2be56c3` fix(ratecards): client required, clone removed, stale saves refused by version (B-207, B-209, B-212)
- `2b7bc8c` fix(ratecards): RC-13 follows the drop-unknown-roles rule; typed ratecard id in the upsert (B-209)
- `0b5a2cd` fix(pipelines): Delete shows the proposals the server counts, Drafts included (B-297)
- `615015a` fix(api): phasing export hours are the stored hours; pots subquery only for admins (B-292, B-280)
- `3230139` fix(test): SV-21 expects the versionScope 404 for a non-UUID version id (Task 9 integration run)
- `b702b4e` docs(backlog): findings from cycle 2 brainstorming and execution
- `0ad2350` docs(architecture): drop the removed ratecard clone route
- `2ada3a0` fix(validation): strict POT summary year, SV-03b/13b/13c checks
- `719ef41` refactor(cost-grids): drop unreachable vId check, fix structure PUT indentation
- `8fc2386` docs(backlog): B-440..B-442 from the cycle 2 final review
- `5b0de20` docs: B-439 cites the current line of its evidence
- `27c62f8` fix(api): refuse malformed structure and task-list bodies with 400
- `2c623eb` fix(api): one rate card per client, integer ratecard version, numeric currency rate
- `aeee52b` fix(api): validate ids and year on every pots route; run pipeline-years counts concurrently
- `1fb22e4` test(api): SV-46..SV-53 for review round 1 fixes
- `2e5a20b` fix(api): POST /ratecards returns the existing card with its entries; modal uses them
- `4d8bf87` fix(exports): phasing export counts each proposal once, amounts in EUR like the Phasing view
- `8ca2b7d` fix(api): rate card create locks the client row FOR NO KEY UPDATE, not blocking FK writes

## Gate outcomes

- Gate 1: passed (frontend `npm test` 2925/2925; `scripts/run-tests.sh` backend 447/447 + integration 895/895) after the claims pre-check fix `5b0de20`.
- Gate 2: ordinary path; branch stack spun up, migration 035 applied to the branch DB by hand, the three manual acceptance items verified by the user, browser question answered yes, stack torn down.
- Gate 3: round 1 (background review, high) 9 findings; the user chose "Fix everything now". By target: 1 (docs now false) left to this Gate 5's `/sync-docs`, 0 to `docs/BACKLOG.md`. Round 2 (scoped `5b0de20..4d8bf87`) 2 Minor: 1 rejected as wrong (the global NUMERIC parser already returns numbers), 1 fixed under the rule (`8ca2b7d`); the text-only rule did not close it (`classify-cycle` → `ordinary`). Round 3 (scoped `4d8bf87..8ca2b7d`) no findings. Backend re-run: `scripts/run-tests.sh` backend 451/451, integration 925/925.
- Gate 4: merged as `9f9381d` (merge commit, main had advanced 1 docs commit), pushed; `backup-db.sh` wrote `backups/pdash-backup-2026-11-11-172351.dump`; migration `035_ratecard_version.sql` applied; `pdash-api` restarted, healthy at 2026-11-11T16:24:46Z; worktree removed, branch deleted.
- Gate 5: `/sync-docs` touched 10 files (see below); 16 `docs/BACKLOG.md` rows closed, B-443 added.

## Code review follow-ups

None.

## Roadmap notes

- Plan vs spec, decided during execution (ledger rulings): SV-21 asserts 404, not the spec's 400, for a non-UUID version id — the `versionScope` middleware answers first, and the handler's own check was removed as unreachable; the spec §5 export-vs-reporting integration check was not added (Plan decision 1, confirmed before execution, replaced it with `phasing-export.test.js`); the `tk.roles[]` body shape still stores a custom flag without a rate (B-439).
- Gate 3 round 1 finding 3 was fixed against the spec's "Scope escluso" line (currency conversion in the phasing export), on the user's "Fix everything now". The fix also made the XLS count one version per proposal; `/api/reporting/phasing` still counts every non-Draft version, so the view and its XLS can differ for a proposal with two versions in the year: B-443.
- `docs/BACKLOG.md` id B-440 was written on the branch for a row deleted before merge and reused for a different row, against the file's rule 4; the deleted row never reached `main`.
- `scripts/run-tests.sh` prints a first-try `DELETE /api/pipeline-years/… → 409` in cleanup (retried to 200, not counted) — the SV-40 fixture's cleanup order.
- An empty, untracked `scratchpad_t4.js` left by a Task 4 subagent in the main checkout was deleted at Gate 4.

## Sync-docs outcome

Scope pass: 1 `ARCHITECTURE.md` yes; 2 `CLAUDE.md` yes; 3 `TEST_CASES.md` yes; 4 `test-api.js` no (no new endpoint, checks already added); 5 PRD yes; 5b operational-manual reference yes; 6 `PROCESS.md` no (none of the three conditions); 7 memory yes.

- `ARCHITECTURE.md`: `ratecards` schema (`version`, `client_id` note); rows for `POST /api/ratecards`, `PATCH /api/ratecards/:id/entries`, `GET /api/exports/phasing`, `GET /api/pipeline-years`.
- `CLAUDE.md`: the Money section no longer says pg returns NUMERIC strings. The `pipeline-years.js` entry was left as it was: adding `proposals` there grew the pinned File structure block, so `proposals` is documented only in `ARCHITECTURE.md` §5.
- `docs/api/config.md`: new "Ratecard version" section (409/400 rules, one card per client, clone removed).
- `docs/api/lib.md`: `input-rules.js` and `phasing-export.js` entries.
- `docs/api/exports.md`: the phasing XLS's fix and its remaining difference from the view.
- `TEST_CASES.md`: CF-13 and CF-14 rewritten (client required, one card per client), CF-18 and CF-19 added; `js/lib/test-cases-parse.test.js` case count 1001 → 1003.
- PRD: `docs/prd/master-data.md` updated (§7.2 stale rate card message, §7.4 Delete with Draft-only proposals and the Proposal Phasing XLS).
- `.claude/skills/operational-manual/SKILL.md`: the Master Data "Pipeline years (View A)" bullet reconciled from `docs/prd/master-data.md` §7.2/§7.4.
- `PROCESS.md`: gate answered no.

## Memory outcome

- `project_backlog_cycles_2026_11_10.md`: "Cycle 2 … execution not started" → "Cycle 2 (server validation) MERGED 2026-11-11 (`9f9381d`, …, migration 035 applied, pdash-api restarted) … New rows B-437..B-443 … NEXT: B-417, then cycle 3 of the index."
- `MEMORY.md`: "next: cycle 2 (spec+plan+handoff committed 2026-11-11, execution not started) → B-417" → "cycle 2 server validation MERGED 2026-11-11 (`9f9381d`, migration 035); next: B-417 → cycle 3".
