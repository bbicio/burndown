# Finish-cycle report — security-password-policy

**Date:** 2026-11-17
**Branch:** security-password-policy → main
**Execution started:** 2026-11-17 12:43  (pre-flight step 6)
**Merged at:** 2026-11-17 14:40  (Gate 4's merge commit `1efbff5`)
**Gate durations:** Gate 1 13m · Gate 2 13m · Gate 3 89m · Gate 4 5m · Gate 5 (to report) 1m — total 121m
**Cycle counters:** subagent dispatches 4 · review rounds 3 · full test-suite runs 10
**Gate 5 tests:** docs-only → `npx vitest run scripts/ js/lib/test-cases-parse.test.js` ×1 (green on first run)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-17-password-policy.md`) · review effort high
**Claims pre-check:** at Gate 1 it took about 2 minutes and caught 4 defects in the branch's markdown: three false predicates (CLAUDE.md said the guard pins all three Passwords rules, A-36 said every page shows the name/email reason before submitting, the manual said every rule reason appears under the indicator) and one incomplete enumeration (the ARCHITECTURE services tree). The Gate 3 re-checks took about 3 minutes over two rounds and caught 1 incomplete enumeration (the production checklist's list of in-memory rate-limit counters), fixed before its commit. Of round 1's 7 findings, none fell in the four mechanical classes.
**Acceptance:** 15 Spec criteria plus 5 TEST_CASES cases listed. Pre-ticked from automated runs green at `9846c30`:
- criteria 1, 2, 3, 6, 7 and 8, plus A-36 and A-37: `scripts/run-tests.sh` → 1071/1071 (`PP-01..PP-04`);
- criterion 4: `api/src/services/passwords.test.js` 16/16;
- criterion 10: `scripts/password-policy-guard.test.js`;
- criteria 14 and 15: `npm test` 3368/3368.

Verified by hand by the user on the branch stack, all positive: 5/A-38 (real HIBP, `correcthorsebatterystaple`), 9 (CLI refusal), 11 (pages consistent at three widths), 12 (paste), 13 (no passwords in the logs), A-16, GD-10. None was left unverifiable.

## What was done

14 commits:
- `90f4d69` feat(auth): password policy rule and common-password list
- `ae68aa7` feat(auth): passwords service — single hash point, HIBP fail-open
- `33e0d1f` test(auth): PP-01..PP-04 password policy cases; fixtures meet the new rule
- `1459ec7` feat(auth): PASSWORD_RULE on activate, reset and change-password; create-admin applies the rule
- `42e6dff` feat(auth): browser twin of the password rule
- `0e2b587` feat(auth): activate, reset and profile read the password rule from the twin
- `da57f56` test(auth): password policy guard
- `cc320f6` test(auth): passwords service tests unset PASSWORD_BREACH_CHECK, as run-tests.sh sets it
- `b440263` docs: password policy in manual, test cases, architecture, checklist and docs
- `0368725` fix(auth): password hint at the size of the rule error, so the confirm field never moves
- `3b529de` fix(auth): test-branch.sh bootstrap password meets the rule; guard pins every create-admin.js password
- `9846c30` docs: claims pre-check fixes for security-password-policy
- `e519b04` fix(auth): rate-limit wrong current passwords on change-password
- `6278914` fix(auth): change-password limiter keyed by user and address, so a stolen cookie cannot lock the user out

## Gate outcomes

- **Gate 1:** passed. The claims pre-check committed 4 fixes (`9846c30`), then `npm test` passed 3368/3368 and `scripts/run-tests.sh` passed 1071/1071, with the unit tests at 610/610.
- **Gate 2:** ordinary path. The branch stack was reused, the acceptance checklist was fully verified, and the browser check was answered "yes". The stack was torn down after that answer.
- **Gate 3:** three rounds of `/code-review` at high, hitting the round cap. The user chose (b).
  - **Round 1** (`main...HEAD`): 7 findings. The Important one, no limiter on `/change-password`, was fixed in `e519b04`. The 6 Minor findings went to follow-up.
  - **Round 2** (`e519b04`): 7 findings. The Important one was a stolen-cookie lockout caused by the user-only key; it was fixed in `6278914` with a user+address key. The 6 Minor findings went to follow-up.
  - **Round 3** (`6278914`): 4 findings plus 2 notes. Under (b), all of them went to follow-up.
  - None of the findings targeted the frozen specs or plans, or prose outside the diff.
  - The backend re-run of `scripts/run-tests.sh` passed 1071/1071, with the unit tests at 613/613.
- **Gate 4:** `--no-ff` merge `1efbff5` (main had not diverged), pushed. Backup `backups/pdash-backup-2026-11-17-144013.dump`. There was no migration. `pdash-api` was restarted and reported healthy at `2026-11-17T13:41:01.792203255Z`. The worktree was removed and the branch deleted.
- **Gate 5:** `/sync-docs` touched 4 files (see below).

## Code review follow-ups

- Round 1 — the reset page runs the browser check with an empty context, so a password with the user's name passes live and is refused only on submit (`js/pages/reset-password.js`).
- Round 1 — `PASSWORD_BREACH_CHECK` recognises only the exact string `off` (`api/src/services/passwords.js`).
- Round 1 — the common-password list is read synchronously on the first password request, not at startup (`api/src/services/passwords.js`).
- Round 1 — `pwnedCount` has two timeout mechanisms, and its `!res.ok || res.status !== 200` check is redundant (`api/src/services/passwords.js`).
- Round 1 — the guard and `test-api.js` re-implement the list parsing instead of using `loadCommonPasswords()`.
- Round 1 — the rule error shows live from the first keystroke in a `role="alert"` element with a red field (activate, reset and profile).
- Round 2 — the profile page shows the raw "Too many attempts" on a 429, without `retryIn` (`js/pages/profile.js`).
- Round 2 — a successful change refunds only its own slot, so earlier wrong guesses keep counting (`api/src/routes/auth.js`).
- Round 2 — the success test in `api/src/routes/auth.test.js` runs ten cost-12 hashes.
- Round 2 — the shared `client.query` mock in `api/src/routes/auth.test.js` picks its answer by matching the SQL text.
- Round 2 — `handbook/restricted/production-checklist.md` restates the list of limiters.
- Round 2 — the reserve/refund/`judged` pattern is copied three times in `api/src/routes/auth.js`.
- Round 3 (Important) — the user+address key leaves no per-account ceiling on wrong current-password guesses. From many addresses the guess count grows with the number of addresses. Login's pair (per address plus per account) is the model. Also:
  - no test checks a per-user ceiling;
  - a session can create one limiter entry per address;
  - with a proxy that flattens `req.ip`, or an attacker on the same NAT, the lockout comes back.
- Round 3 — the comment "as for login" in `api/src/routes/auth.js` and the ARCHITECTURE route row promise per-account protection that does not exist.
- Execution final review (deferred minors), M-1 — activate does not pass the invitee's last name to the live check.
- Execution final review, M-2 — `passwordStrength` takes no context, so "Strong" can show next to the name error.
- Execution final review, M-3 — `create-admin.js` checks the command-line names, not the stored ones.
- Execution final review, M-4 — the `TS-28` assertion on `password_changed_at` is weak.

## Roadmap notes

- During execution the plan's SecLists URL returned 404 (the file was renamed). Its "18 × 😀 accepted" case contradicted rule 4. It also missed `css/auth.css`, `login.html`, `js/lib/auth-pages-guard.test.js`, `js/lib/test-cases-parse.test.js` and the `test-branch.sh` bootstrap password. These are recorded as rulings in the execution ledger; the plan itself was not edited.
- Gate 3 hit the 3-round cap for the fourth security cycle running. This time the cause was a design trade-off settled in review rather than in the Spec: a rate-limit key decides between lockout and total guesses.
- The cleanup line `DELETE /api/pipeline-years/<id> → 409` appears in every `scripts/run-tests.sh` run, before and after this branch. It is not counted as a failure.

## Sync-docs outcome

Scope pass:
- **1 ARCHITECTURE:** yes. Already updated on the branch; checked, no change.
- **2 CLAUDE.md:** yes. The Passwords section was already added on the branch; no change.
- **3 TEST_CASES:** yes. Added A-39 for the change-password limiter, and raised the count in `js/lib/test-cases-parse.test.js` to 1038.
- **4 test-api.js:** no. There is no new endpoint, and the limiter is covered by `api/src/routes/auth.test.js`.
- **5 PRD:** yes. `docs/prd/access.md` §15 got the new password requirement and the change-password limit; the activation, reset and change sections now say "same rule".
- **5c handbook:** the manual and the checklist were already updated on the branch.
- **6 PROCESS.md:** no; none of the three conditions applies.
- **7 memory:** yes.

Also updated `docs/pages/profile.md`, noting the 429 in the error banner.

## Memory outcome

- `project_security_review_series.md`: added a "Password policy cycle MERGED 2026-11-17" paragraph (merge `1efbff5`, report path, the limiter-key trade-off left in BACKLOG, and the lesson to decide a rate-limit key in the Spec). "How to apply" is unchanged: next is the security-process cycle, ask the user.
- `MEMORY.md`: the security-series line gained "password policy (NIST, HIBP) MERGED 2026-11-17 (`1efbff5`, change-password limiter key trade-off left in BACKLOG)".
- Checked with no change: `feature_state.md`, `project_backlog_cycles_2026_11_10.md`, `project_two_step_cycles.md`.
