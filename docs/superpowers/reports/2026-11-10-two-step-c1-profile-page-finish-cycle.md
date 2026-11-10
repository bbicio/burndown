# Finish-cycle report — two-step-c1-profile-page

**Date:** 2026-11-10
**Branch:** two-step-c1-profile-page → main
**Execution started:** 2026-11-09 18:30  (pre-flight step 6)
**Merged at:** 2026-11-10 09:57  (Gate 4's merge commit)
**Gate durations:** Gate 1 4m · Gate 2 40m · Gate 3 881m · Gate 4 3m · Gate 5 (to report) 8m — total 936m
**Cycle counters:** subagent dispatches 4 · review rounds 3 · full test-suite runs 4
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-09-two-step-c1-profile-page.md`) · review effort high
**Claims pre-check:** At Gate 1 it took about 4 minutes over the 13 markdown files the branch changed and found nothing: every predicate, count, SHA and enumeration checked held. At Gate 3 the re-checks over each round's doc fixes took about 1 minute per round and found nothing either. Of round 1's 10 findings, 1 was mechanical: a false sentence in `docs/js/nav.md` about `navRefreshAccount`'s caller.
**Acceptance:** 12 Spec criteria and 15 new or changed `TEST_CASES.md` cases were listed. Pre-ticked from automated runs:
- criteria 2, 4, 10, 12, by `npm test` 2886/2886 (`nav-behavior.test.js`, `profile-ui.test.js`), `scripts/run-tests.sh` 772/772 (`PR-OF-01`) and `node --test` on `api/src/lib` 354/354;
- N-12 and AD-50, by `nav-behavior.test.js` and `user-admin-rules.test.js`;
- AD-51, by `AD-ED-08`.

The user verified the 11 remaining manual items by hand with a positive outcome: criteria 1, 3, 5, 6, 7, 8, 9, 11, A-12, A-13, AD-48, AD-49, GD-07…GD-12. They checked the DB through `docker exec` because Adminer refused the login. None was left as not verifiable.
<!-- Wall-clock, human wait time included. Gate 3 spans the overnight wait between the Gate 2 answer and
     the round-1 disposition. Full test-suite runs: npm test ×3 (after the final-review fix pass, Gate 1,
     Gate 5) + node --test over api/src/lib ×1; scripts/run-tests.sh integration runs are not counted. -->

## What was done

13 commits:

- `87d9169` feat(api): pure user-details rules for admin edits and rectification requests
- `8c251ab` feat(api): password_changed_at, rectification requests, privacy contact; drop self-service profile edit
- `7761c9a` feat(api): admins edit a user's name and email
- `f636ee9` test(api): anonymize deletes rectification requests; anonymized details are not editable
- `4f20cbf` feat(profile): pure profile helpers and the profile sub-navigation set
- `b308c07` feat(nav): My Profile and Change password open profile.html
- `e51b072` feat(profile): My profile page
- `d9a98be` feat(admin): Edit details drawer
- `8419081` docs(backlog): B-396 — admin notification email does not escape its HTML
- `73bdc8a` fix(api): anonymize removes the admins' notifications of a request; details edits need a live admin role
- `44f4461` fix(api): refuse the anonymized address, void a pending invite on email change, link request notifications in one statement
- `ec871c7` fix(api): name limit matches the 100-char columns; an email change voids a reset link sent to the old address
- `f3aa5c1` fix: index the notification cascade, clear password_changed_at on anonymize, email admins even if the notification fails, say a pending invite was voided; shell guard covers profile.html

Merged as `dbfb760`. The push also carried two main commits that had not been pushed yet: the briefs and spec (`b31632b`) and the plan (`7806248`).

## Gate outcomes

- Gate 1: passed. Claims pre-check clean, `npm test` 2886/2886, `scripts/run-tests.sh` 772/772.
- Gate 2: ordinary cycle. Branch stack reused; acceptance checklist all positive; browser question answered yes; stack torn down.
- Gate 3: 3 rounds at high effort, then the user chose (b) past the cap.
  - Round 1: 10 findings. Fixed 4 (#1 anonymized-address lockout, #3 unlinked notifications, #6 pending invite left valid, #10 false sentence in `nav.md`); 3 accepted as follow-up; 4 already deferred.
  - Round 2: 2 new findings, both fixed: name limit 100, reset token voided on an email change.
  - Round 3: 7 findings. 5 fixed; 2 accepted as follow-up (invite route validation, batched INSERT).
  - 0 findings on frozen spec/plan files and 0 on prose outside the diff.
- Gate 4: merged `--no-ff` (`dbfb760`); main had not diverged, and the push also carried 2 unpushed spec/plan commits.
  - Backup `backups/pdash-backup-2026-11-10-095726.dump` (124K).
  - Migration `033_profile_admin_managed.sql` applied to `pdash-db`.
  - pdash-api restarted and healthy at 2026-11-10T08:58:34Z.
  - Worktree removed, branch deleted.
- Gate 5: `/sync-docs` touched 8 files (plus the memory). `docs/BACKLOG.md` gained B-397…B-410.

## Code review follow-ups

From the plan's final whole-branch review, before `/finish-cycle`:
- Final review #3: entities in the rectification email subject (`api/src/routes/auth.js` line 86). Became B-400.
- Final review #4: anonymize is not in a transaction (`api/src/routes/users.js` line 181). Became B-403.
- Final review #6: no throttle on rectification requests. Became B-401.
- Final review #7: a sole admin gets "Request sent" with no recipient. Became B-404.
- Final review #8: profile dates use the UTC day (`profile.html` line 226). Became B-402.
- Final review #9: Edit details Save enabled on a legacy mixed-case email (`admin.html` line 828). Became B-405.
- Final review #10: concurrent duplicate email answers 500. Became B-406.
- Final review #11: misplaced terms comment (`api/src/routes/app-settings.js` line 22). Became B-407.
- Final review, board comparison: 40 px phone avatar (`css/profile.css` line 76). Became B-408.

From Gate 3:
- Round 1 #5: stale JWT email used by `POST /api/exports/*`. Became B-397.
- Round 1 #9: error handling in `submitDetails` (`admin.html` line 959). Became B-398.
- Round 1 #10: dead `navRefreshAccount` (`js/nav.js` line 277). Became B-399.
- Round 3 #1: the invite route lacks the name and email rules (`api/src/routes/auth.js` line 133). Became B-409.
- Round 3 #7: sequential per-admin INSERT. Became B-410.

## Roadmap notes

- Two fixes were not verified by a test that failed first, because no fault injection is available:
  - round 1 #3, where only a link guard was added (`RR-04 every notification of the request is linked`);
  - round 3 #4, the email that goes out even when the notification insert fails.
  - Round 3 #3, the banner copy, was likewise checked only by reading the code.
- A change outside the plan (ruling in Task 6): `POST /api/auth/change-password` now answers a wrong current password with `400 { field: 'currentPassword' }` instead of 401, because `apiFetch` sends every 401 to the login page. The old modal had the same defect.
- Gate 5's `/sync-docs` shrank `CLAUDE.md`'s `css/` index entry to a pointer to `docs/css/stylesheets.md` instead of adding `profile.css` to it. The pin in `scripts/claude-md-guard.test.js` went from 13,220 to 13,107.
- During the executing-plans run, an eval script saved a wrong email on the branch-stack copy of a user. It was restored by SQL on that stack's DB only.
- Adminer on the branch stack refused the `pdash` password at Gate 2, even though the same password worked over TCP inside the DB container. The user verified through `docker exec` instead. Not investigated further.

## Sync-docs outcome

Scope pass:
1. `ARCHITECTURE.md`: yes. The directory tree gains `profile.html` and `css/profile.css`, and §8 gets a 027–033 pointer to `docs/db/migrations.md`; that list had stopped at 026.
2. `CLAUDE.md`: yes. The `css/` entry is now a pointer to the stylesheet doc, and the guard pin was lowered. The Pages row had already been added on the branch.
3. `TEST_CASES.md`: no. It was updated on the branch.
4. `test-api.js`: no. It was updated on the branch.
5. PRD: yes, because a page was added and controls changed.
   - `docs/prd/access.md` §17.2 is rewritten: details are admin-managed, the My profile page exists.
   - `docs/prd/administration.md` §16.3 gains Edit details….
   - `PRD.md` §3 now says My profile is a page without a menu entry.
- 5b: yes. The User administration bullet in `.claude/skills/operational-manual/SKILL.md` was reconciled from `docs/prd/administration.md` §16.3 and `docs/prd/access.md` §17.2.
6. `PROCESS.md`: no. None of the three conditions applies.
7. Memory: yes.

Also `docs/css/stylesheets.md` gained a `css/profile.css` section.

## Memory outcome

- New: `project_two_step_cycles.md`. Cycle 1 merged 2026-11-10 (`dbfb760`, migration 033); cycle 2, email code, is next with its brief; follow-ups B-396…B-410. A line for it was added to `MEMORY.md`.
- `feedback_shell_drops_backslashes.md` gained a second surface: `String.replace` with a replacement string collapses `$$` to `$` (use `split`/`join`), and a CRLF file breaks `\n`-anchored matching. Before, the file covered only backslashes lost through Bash.
- Checked, no change: `project_ui_redesign_cycles.md`, which does not cover this series.
