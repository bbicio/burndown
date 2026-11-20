# Finish-cycle report — save-c7-account-admin-rest

**Date:** 2026-11-20
**Branch:** save-c7-account-admin-rest → main
**Execution started:** 2026-11-20 17:12
**Merged at:** 2026-11-20 18:59
**Gate durations:** Gate 1 9m · Gate 2 82m · Gate 3 7m · Gate 4 9m · Gate 5 (to report) 3m — total 110m
**Cycle counters:** subagent dispatches 20 · review rounds 3 · full test-suite runs 7
**Gate 5 tests:** docs-only → `npx vitest run scripts/ js/lib/test-cases-parse.test.js` ×1 (green on first run)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-20-save-c7-account-admin-rest.md`) · review effort high
**Claims pre-check:** Gate 1 step 0 took about 3 minutes over 16 changed `*.md` files and caught one false predicate: `docs/pages/admin.md` still described the removed `globalError`/`globalSuccess` fields (fixed in `1c78fda7`). Gate 3's re-checks of the round-1 and round-2 doc fixes took about a minute and found nothing. Of round 1's 5 findings, 1 was mechanical (the same stale admin.md sentence, already fixed); the Important one (save.js `?v=`) came from a stale number in the frozen spec (§1 "`?v=2`"), which the step does not reach because specs are not re-measured.
**Security review:** ran — `security-scope` review, triggered by the auth/share routes and the account/admin pages; background run at `9bfcbad1`, 0 findings at confidence ≥ 8 (one below threshold: the new share `PATCH` routes do not UUID-check `:id`, a 500 instead of 400, as the existing share routes — already B-501). Rounds 2-3 checked `9bfcbad1..HEAD` for security defects: none.
**Acceptance:** 11 criteria + 12 `TEST_CASES.md` cases (ACW-01..ACW-12). Pre-ticked from automated runs: 1 (`js/lib/notifications-ui.test.js`), 3 and ACW-01..12 (`scripts/run-tests.sh`, green at `e97098cb` and again at `cf050b81`, 1264/1264), 4 (`js/lib/profile-page.test.js`), 7 (shares source checks + grep), 8 (`scripts/save-contract-guard.test.js`), 9 (`npm test` 3529/3529, backend 639/639, `run-tests.sh`, security-headers guard), 10 (`doc-paths-guard`, `architecture-guard`). Verified by hand with a positive outcome on the branch stack: 2 (T&C version), 5 (session/timeout), 6 (server values). Not verifiable at Gate 2: 11 (backlog), done at Gate 5 — five rows closed.

## What was done

12 commits:

- `e97098cb` feat(api): terms acceptance on the version read, a dedicated share permission PATCH
- `2c4815b2` feat(save): the error outcome carries the response body; save.js on every signed-in page
- `96ad37b4` feat(notifications): read state and badge follow the server's answer; nav writes through apiSave
- `00efc960` fix(notifications): in-flight guard on markOneRead; sharper tests
- `7f2bdf43` feat(terms): accept the version shown; the editor adopts the server's draft metadata
- `a3ae89a4` feat(shares): permission change through the dedicated PATCH, errors inline
- `c2bd3d81` feat(profile): a device already gone leaves the list; the page adopts the server's password time
- `cc8b7ed3` feat(admin): admin, db-reset and profile-jobs write through apiSave; the guard names what stays
- `9bfcbad1` fix(admin): review round 1 - data-strategy wording, null-safe share focus, patchUser signature
- `1c78fda7` docs: admin.md describes the single banner, not the removed globalError/globalSuccess
- `cf050b81` fix: review round 1 - save.js ?v=4, sequential draft reads, share message above the list, profile-jobs 30 s note
- `0aff669f` fix(shares): the inline message keeps the mb-2 spacing it is rendered with

Executed subagent-driven (7 tasks, Sonnet implementers, a task review after each; Tasks 3 and 7 took one fix round each).

## Gate outcomes

- Gate 1: passed — claims pre-check fixed 1 predicate (`1c78fda7`); `npm test` 154 files / 3529 tests green; site-export tests not needed; `run-tests.sh` skipped — green at `e97098cb`, no backend or harness change since; audit none (no manifest changed).
- Gate 2: ordinary path; branch stack started at pre-flight; acceptance checklist answered (3 manual items verified); browser verification confirmed; stack torn down.
- Gate 3: 3 rounds. Round 1 = the plan's final review at `9bfcbad1` + the security review: 5 findings (1 Important, 4 Minor; 1 already fixed by `1c78fda7`), user chose "fix everything now", fixed in `cf050b81`. Round 2 (scoped `9bfcbad1..cf050b81`): 1 Minor, fixed under the round-1 rule in `0aff669f`. Round 3 (scoped `cf050b81..0aff669f`): no findings. Disposition by target: 0 findings on specs/plans (the spec's false `?v=2` fact goes to Roadmap notes), 0 on pre-existing prose. Backend re-run: `run-tests.sh` green at `cf050b81` (1264/1264, 639 unit), no backend change after it.
- Gate 4: merged with `--no-ff` (`86b6d9ea`, main had not diverged), pushed; DB backup `backups/pdash-backup-2026-11-20-185850.dump`; no migration; `pdash-api` restarted and healthy at 2026-11-20T17:59:27Z; worktree removed, branch deleted.
- Gate 5: sync-docs updated `docs/prd/access.md`, `docs/prd/notifications.md`, `handbook/public/manual.md`; `docs/BACKLOG.md` closed B-345, B-360, B-369, B-375, B-398.

## Code review follow-ups

None.

## Roadmap notes

- **Spec defect (frozen, not edited):** `docs/superpowers/specs/2026-11-20-save-c7-account-admin-rest-design.md` §1 says `js/lib/save.js` was at `?v=2` on main; it was at `?v=3` on 11 pages. The plan copied it ("solo `?v=3`"), so the branch changed `save.js` without bumping it; caught by the final review, fixed with `?v=4`. `nav-shell-guard` checks only that pages agree, not that a changed file's version moved past main — a guard that compares against `main` would catch this class.
- `js/shares.js` line 187 reads `' +(kind` (missing space) — cosmetic, introduced by `0aff669f`; not worth a fourth review round.
- profile-jobs actions now abort at 30 s (`apiFetch`) instead of nginx's 60 s; documented in `docs/pages/profile-jobs.md`. A per-call timeout in `apiFetch` would restore the longer window if Rebuild all routinely runs 30-60 s.
- Plan ledger rulings (decisions taken during execution):
  - test-api case ids are `ACW-01..ACW-12` (plan) rather than the spec's `SC7-*` — naming only.
  - Task 1 skipped the plan's red run of `run-tests.sh` (PROCESS §6.2 allows one run, at the green step).
  - Task 5: `unknown` on the permission `PATCH` reverts the select, as Spec §4.3 says, though the server may have applied it; reloading the list on `unknown` would be more accurate.
  - Task 7: `CLAUDE.md` "Data strategy" says the remaining exempt writes call the API directly (`Api.*` or `fetch`), not "awaited with `Api.*`" as the plan wrote — `js/pages/login.js` sends a `DELETE` with `.catch(() => {})`.
- Deferred minors from the task reviews, triaged by the final review as not blocking: ACW-04 asserts presence only; the `ALREADY_SHARED` path's "no email/notification" is not pinned; ACW-11 has a theoretical race (un-awaited revoke notification before the baseline) and no sub-labels; `nav-shell-guard` uses `indexOf('js/nav.js')`; `markAllRead` on `ok` also clears rows that SSE added after the request and `parseInt('99+')` (both pre-existing); `loadTerms` body not re-indented; a failed reload after a T&C conflict shows two messages; editor/profile/db-reset page tests leave some outcomes untested; the share-list component can show stale rows next to a reload error.
- `CLIENT_EXEMPT` is not empty after this cycle, by Spec §5: permanent entries (public pages, planning reads) and entries waiting for a future uniformation Brief (proposal lifecycle in `js/costgrid.js`, `reassignOwner`, `js/pages/pipeline.js`, actuals upload/delete — FormData needs `apiSave` support).

## Sync-docs outcome

- Scope pass: §1 ARCHITECTURE yes — already on branch (§5 routes, change-password/accept-terms/PUT terms rows), checked against the code. §2 CLAUDE.md yes — already on branch ("Sharing", "Data strategy"), checked. §3 TEST_CASES yes — already on branch (§35, ACW-01..12). §4 test-api.js yes — already on branch (`testAccountWrites`). §5 PRD yes — updated `docs/prd/access.md` (§17.1: acceptance records the version shown; §18: permission change sends nothing, a removed share is not recreated, re-adding is refused, errors inside the modal) and `docs/prd/notifications.md` (read only after the server confirms). §5c handbook: manual updated (Accepting the terms, Sharing details, the T&C editor's Reload); production checklist checked against the PRD changes, nothing to change; ARCHITECTURE already on branch. §6 PROCESS.md: no — none of the three conditions (the cycle executed the process). §7 memory: yes.
- `docs/BACKLOG.md`: five rows closed with the command run (B-345, B-360, B-369, B-375, B-398).

## Memory outcome

- `project_save_contract_series.md`: description "… c6 master-data pages MERGED 2026-11-19 (`8d91fcd4`); next c7" → "… c7 account/admin/rest MERGED 2026-11-20 (`86b6d9ea`) — Phase 1 series complete; remaining CLIENT_EXEMPT writes wait for a future uniformation Brief"; added a dated c7 line (merge, report path, what changed, why `CLIENT_EXEMPT` is not empty, the save.js `?v=` lesson).
- `MEMORY.md`: the Save-contract series line "next: c7 account/admin/rest" → "c7 … MERGED 2026-11-20 (`86b6d9ea`) — series complete; … next cycle not chosen — ask the user".
