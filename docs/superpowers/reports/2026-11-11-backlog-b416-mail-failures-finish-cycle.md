# Finish-cycle report — backlog-b416-mail-failures

**Date:** 2026-11-11
**Branch:** backlog-b416-mail-failures → main
**Execution started:** 2026-11-11 11:37  (pre-flight step 6)
**Merged at:** 2026-11-11 12:28  (Gate 4's merge commit)
**Gate durations:** Gate 1 4m · Gate 2 34m · Gate 3 2m · Gate 4 11m · Gate 5 (to report) 2m — total 53m
**Cycle counters:** subagent dispatches 3 · review rounds 1 · full test-suite runs 6
**Gate 5 tests:** docs-only → `npx vitest run scripts/ js/lib/test-cases-parse.test.js` ×1 (green on first run)
**Risk class:** standard (`docs/superpowers/plans/2026-11-11-backlog-b416-mail-failures.md`) · review effort medium
**Claims pre-check:** Gate 1 step 0 cost about 1 minute and caught 1 defect (a false predicate: AD-53 said Resend invite shows "The email could not be sent", it shows that text inside a "Couldn't update X." banner), fixed in `8c3b171`. Gate 3 round 1 had no findings, so none was mechanical and there were no Gate 3 re-checks.
**Acceptance:** 10 items listed (Spec criteria 1-8, `TEST_CASES.md` SH-20 and AD-53; SH-21 was added during Gate 2). Pre-ticked from an automated run: 1-5 and 8 (`bash scripts/run-tests.sh` → 848/848 with MAIL-01..MAIL-08, TS-26, PY-13; `npm test` → 2920/2920; `api` node:test → 439/439). Verified by hand with a positive outcome on the branch stack: 6 and 7, SH-20, AD-53 and the chaos-off delivery check. The first manual pass showed normal sends because the user's chaos `curl` never took effect (Mailpit's recipient probability was still 0); chaos was then switched on from this session and the checks repeated. None left as not verifiable.
<!-- Wall-clock, human wait time included. Cycle counters: subagent dispatches = the execution's final
     whole-branch review, Gate 2's background review and Gate 3's scoped review (the Gate 2 reviewer
     reported that the code-review skill it invoked started its own background fork, which this session
     did not observe); full test-suite runs = npm test ×3 (Task 6, after the final-review fixes, Gate 1),
     the backend suite ×3 (`cd api && npm test` once, and inside each of the two run-tests.sh runs). -->

## What was done

10 commits:

- `1ac8260` test(api): MAIL-01..MAIL-08 mail to Mailpit, responses when SMTP refuses (red)
- `203059e` test: stack mail goes to Mailpit in run-tests.sh and test-branch.sh (B-416)
- `f8e0e0d` fix(shares): a refused share email no longer answers 500 (B-416, B-432)
- `8006ebc` fix(auth): invite, resend-invite and forgot-password answer a refused email without a 500 (B-432)
- `f0e0b09` fix(exports): a refused export email answers 502 SEND_FAILED (B-416)
- `ebba57e` feat(ui): share modal and invite drawer say when the email could not be sent (B-416, B-432)
- `f99b070` docs: Mailpit in the test stacks; responses when the email is refused
- `2fddd38` fix(test-branch): Mailpit interface on 127.0.0.1 only; correct the run-tests.md mail sentence (final review)
- `8c3b171` docs: AD-53 names the banner Resend invite actually shows (claims pre-check)
- `99df65c` fix(shares): the program share modal offers the eligible users (Gate 2)

## Gate outcomes

- Gate 1: claims pre-check fixed 1 defect (`8c3b171`); `npm test` 2920/2920; `scripts/run-tests.sh` backend 439/439, integration 848/848 — passed.
- Gate 2: ordinary cycle; branch stack spun up (Mailpit at 127.0.0.1:8083); the user found the program Share modal offering no users — a defect already on `main` (`_renderShareList` returned early for a program without refreshing the eligible list); by the user's choice it was fixed on the branch in `99df65c` with `js/lib/shares-modal.test.js` (RED→GREEN) and `TEST_CASES.md` SH-21; all manual checks then passed; branch stack torn down after the user's "yes".
- Gate 3: round 1 = the review scoped to `f99b070..8c3b171` (the whole branch to `f99b070` was reviewed at the end of execution, its two re-graded findings fixed in `2fddd38`) plus one scoped review of `99df65c` — no findings. Backend re-run: `git diff --name-only 8c3b171..HEAD` touches neither `api/` nor `test-api.js`, nothing run.
- Gate 4: merged (`--no-ff`, merge commit `5dc4c9a`, main had not diverged), pushed; backup `backups/pdash-backup-2026-11-11-122756.dump`; no migration; `pdash-api` restarted and healthy at 2026-11-11T11:28:23Z; worktree removed, branch deleted.
- Gate 5: sync-docs touched 3 files plus the operational-manual reference; `docs/BACKLOG.md` closed B-416 and B-432 and added B-433..B-436.

## Code review follow-ups

None from Gate 3. The execution's final whole-branch review left four Minor findings deferred, recorded as `docs/BACKLOG.md` B-433..B-436:

- MAIL-02..MAIL-04 and MAIL-07 do not count notifications; MAIL-04 does not check the program's `resource_shares` rows (`test-api.js`, `testMailFailures`).
- MAIL-08 checks only the status, not the body against the unknown-address case.
- The `catch` around each `send*()` also swallows non-SMTP errors (logged; matches Spec §3).
- The other branch-stack ports still bind all interfaces (`scripts/test-branch.sh`).

## Roadmap notes

- Execution rulings (from the gitignored ledger, removed with the worktree): Mailpit pinned to `axllent/mailpit:v1.27` after checking its chaos API on a throw-away container; chaos off is sent as `ErrorCode 451, Probability 0`; the three export send blocks folded into one `emailExport()` helper; no `?v=N` bump for `js/shares.js` because no page versions it; `TEST_CASES.md` SH-20/AD-53 added although the Plan's Task 7 omitted the file (the Spec §5 lists it), with the pinned case count raised; `CLAUDE.md` left unchanged; the final review's two findings on the Mailpit bind address and the false `run-tests.md` sentence re-graded from Minor to Important and fixed.
- `js/shares.js` is loaded without `?v=N` by `pipeline.html`, `costgrid.html`, `portfolio.html` and `program.html`: a browser can keep the pre-cycle copy until its heuristic cache expires.
- Mailpit's chaos `PUT` via `curl` from a PowerShell `!` prompt silently did not take effect for the user (JSON quoting); `docs/scripts/test-branch.md` gives the request body, not a shell-specific command.
- The share modal lists only PDash users, never `team.html` resources; the user expected the Team registry there. Behaviour as designed (PRD §18.2), noted because the expectation came up at Gate 2.

## Sync-docs outcome

- Scope pass: ARCHITECTURE.md no (§5 updated on the branch); CLAUDE.md no, `docs/js/shared-libs.md` yes (routing for `js/shares.js`); TEST_CASES.md no (rows added on the branch); test-api.js no; PRD yes; 5b yes; PROCESS.md no; memory yes.
- `docs/js/shared-libs.md`: the modal covers `program` too; the 2026-11-11 messages and the program eligible-list fix.
- `docs/prd/access.md`: §15.2 — invite and resend when the email cannot be sent, password recovery answers the same; §18.2 — the share still happens and the modal says the email could not be sent.
- `.claude/skills/operational-manual/SKILL.md`: the Administration reference reconciled from `docs/prd/access.md` §15.2 and §18.2.
- PRD: updated (`docs/prd/access.md`). PROCESS.md gate: none of the three conditions applied.

## Memory outcome

- `project_backlog_cycles_2026_11_10.md`: "`scripts/run-tests.sh` sends real Gmail mail … accepted that at cycle 1's Gate 1" → "B-416 + B-432 MERGED 2026-11-11 (`5dc4c9a`, …) … NEXT: cycle 2 of the index, then B-417."
- `project_branch_stack_fixed_ports.md`: adds "since B-416 (merged 2026-11-11, `5dc4c9a`) also Mailpit 8083 on 127.0.0.1".
- `MEMORY.md`: backlog line "next: B-416 (test mail off Gmail) → cycle 2 → B-417" → "B-416+B-432 MERGED 2026-11-11 (`5dc4c9a`, tests mail to Mailpit); next: cycle 2 → B-417"; ports line "5433/3001/8081/8082" → "5433/3001/8081/8082 + Mailpit 8083 (127.0.0.1)".
