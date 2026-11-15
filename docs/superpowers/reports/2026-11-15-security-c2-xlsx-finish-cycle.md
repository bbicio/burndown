# Finish-cycle report — security-c2-xlsx

**Date:** 2026-11-15
**Branch:** security-c2-xlsx → main
**Execution started:** 2026-11-15 13:33  (pre-flight step 6)
**Merged at:** 2026-11-15 13:50  (Gate 4's merge commit `21137f6`)
**Gate durations:** Gate 1 9m · Gate 2 8m · Gate 3 unknown · Gate 4 unknown · Gate 5 (to report) 5m — total 22m
**Cycle counters:** subagent dispatches 1 · review rounds 1 · full test-suite runs 4 (`npm test` ×1; `scripts/run-tests.sh` ×3 — two during execution, one at Gate 1)
**Gate 5 tests:** docs-only → npx vitest run scripts/ js/lib/test-cases-parse.test.js ×2 (red, then green)
**Risk class:** standard (`docs/superpowers/plans/2026-11-15-security-c2-xlsx.md`) · review effort medium
**Claims pre-check:** Gate 1 step 0 took about 3 minutes over the one changed `.md` (the advisory-payloads report) and found 1 defect: the report cited payload sizes (100,000–200,000 spaces) that were not the sizes measured on 0.18.5; corrected in `a250cd9`. The Gate 3 re-checks did not happen: round 1 had no findings, so no fix was made. Round 1 had 0 findings, so 0 mechanical ones.
**Acceptance:** 8 items: 2 (audit), 3 (legitimate file), 4 (rejected formats) and the suites half of 7 pre-ticked from `npm test` 3207/3207 and `scripts/run-tests.sh` 1001/1001 at `a250cd9` (XF-01..XF-08, `npm audit --omit=dev` showing no `xlsx`); the `/security-review` half of 7 run at the user's request after the checklist, no findings; items 1 (decision recorded) and 6 (exports download and open, pickers `.xlsx`-only) verified by hand on the branch stack with a positive outcome; item 5 not met as written (see Roadmap notes).

## What was done

Six commits on the branch (the Spec and Plan were committed on `main` before it):

- `78c62c4` fix(deps): xlsx 0.20.3 from the vendor, server and browser (S-02)
- `f210cae` feat(timesheets): xlsx file signature gate (S-02)
- `a900bf6` fix(timesheets): reject non-.xlsx uploads, unreadable files answer 400 (S-02)
- `eb881db` test(timesheets): advisory-shaped payloads are harmless on 0.20.3 (S-02)
- `2c38c13` fix(ui): actuals inputs accept only .xlsx (S-02)
- `a250cd9` docs: advisory payload report states the sizes actually measured

## Gate outcomes

- Gate 1: passed (`npm test` 3207/3207; `scripts/run-tests.sh` 1001/1001, backend unit tests 558/558); step 0 fixed one stale figure.
- Gate 2: ordinary cycle; branch stack spun up on the user's yes; acceptance checklist answered all-pass; `/security-review` added at the user's request, no findings; browser question answered yes, stack torn down.
- Gate 3: round 1 (background review at medium) no findings; HEAD did not move afterwards; no backend re-run needed.
- Gate 4: merged with `--no-ff` (`21137f6`, main had not advanced); `scripts/backup-db.sh` snapshot `backups/pdash-backup-2026-11-15-135049.dump`; `pdash-api` restarted and healthy (`2026-11-15T12:51:23Z`), then rebuilt with `docker compose up -d --build api` on the user's explicit yes (no `-v`) because the image holds `node_modules`, healthy at `2026-11-15T12:53:29Z`, `node_modules/xlsx` 0.20.3; worktree and branch removed.
- Gate 5: sync-docs touched 9 files; one TEST_CASES row added (TS-27), two rows reworded (TS-21, MA-04), case count pinned 1020 → 1021; step 3 was red once (`scripts/claude-md-guard.test.js`: my `CLAUDE.md` edit grew the File structure block by 7 bytes over its pin), fixed by shortening the entry to the original length, then green; the red voided the push pre-authorisation.

## Code review follow-ups

None.

## Roadmap notes

- **Criterion 5 not met as written** (spec line 45 applies): the advisories give no trigger, and none of the payloads derived from the 0.18.5→0.20.3 source diff (a `__proto__` sheet, a whitespace-run shared string, MIME header shapes) hurt 0.18.5. `api/src/lib/xlsx-advisories.test.js` keeps four regression checks on 0.20.3; the protection against the original exploits rests on the version bump and the signature gate. Detail: `docs/superpowers/reports/2026-11-15-security-c2-xlsx-advisory-payloads.md`.
- **Plan defect found during execution:** the plan's Global Constraints list no step for the running API image, and a plain `docker compose restart api` keeps the old `node_modules`; this cycle needed a rebuild. A future dependency change on `api/` needs a rebuild step in its plan.
- The Spec and Plan were not edited (frozen); the plan's File Structure does not list the advisory-payloads report that its Task 4 asks for.
- Stale wording left alone: historical narrative in `docs/pages/planning.md` and `docs/js/shared-libs.md` still says "Load XLS" for the Planning button's earlier name.
- No `docs/BACKLOG.md` change: nothing accepted as follow-up, nothing closed.

## Sync-docs outcome

Scope pass: ARCHITECTURE.md yes (route row for `POST /api/timesheets/upload`); CLAUDE.md yes (File Structure entry for `timesheets.js`); TEST_CASES.md yes (TS-27 added, TS-21 and MA-04 reworded, count pin in `js/lib/test-cases-parse.test.js` 1020 → 1021); `test-api.js` no (done on the branch, XF-01..XF-08); PRD yes (`docs/prd/timesheets.md` §8.1 format rule, `docs/prd/planning.md` button label; `PRD.md` itself untouched); handbook yes (`handbook/public/manual.md` Load XLSX label and the accepted format; production checklist unchanged, no architecture structure change); PROCESS.md no — none of the three conditions applies. Also `docs/api/timesheets.md` (format gate) and `docs/api/lib.md` (`xlsx-file.js`). Not updated: `docs/pages/*`, `docs/js/*` (no narrative change).

## Memory outcome

`project_security_review_series.md`: cycle 2 merged (`21137f6`), criterion 5 note, lesson that `node_modules` is baked into the image so a dependency change needs `--build`, next = cycle 3 (tokens); description "cycles 1-2 merged". `MEMORY.md`: the series line now says cycle 2 merged and next is cycle 3. No item left unverified.
