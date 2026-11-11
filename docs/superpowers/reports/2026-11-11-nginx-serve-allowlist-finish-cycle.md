# Finish-cycle report — nginx-serve-allowlist

**Date:** 2026-11-11
**Branch:** nginx-serve-allowlist → main
**Execution started:** 2026-11-11 19:30  (pre-flight step 6)
**Merged at:** 2026-11-11 21:07  (Gate 4's merge commit)
**Gate durations:** Gate 1 2m · Gate 2 84m · Gate 3 10m · Gate 4 2m · Gate 5 (to report) 4m — total 102m
**Cycle counters:** subagent dispatches 3 · review rounds 3 · full test-suite runs 1
**Gate 5 tests:** docs-and-script-tests → `npx vitest run scripts/ js/lib/test-cases-parse.test.js` ×1 (green on first run)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-11-nginx-serve-allowlist.md`) · review effort high
**Claims pre-check:** Gate 1 cost about 2 minutes over the branch's `*.md` and caught 2 defects, both predicates made false by the branch itself (`docs/js/lib.md` and `docs/scripts/shoot.md` still relied on the removed `try_files … /index.html` fallback), fixed in `1ad929e`; the Gate 3 re-checks over the round-1 doc fixes took about a minute and found nothing; of round 1's 3 findings, 1 was mechanical (stale prose, finding 2).
**Acceptance:** 8 items · pre-ticked from an automated run: 1, 2, 3 (`served-check.sh` curl run against the branch stack, with and without an admin cookie), 6 and 7 (`npm test` 2943/2943; `scripts/run-tests.sh` not run, the diff touches neither `api/` nor `test-api.js`) · verified by hand with a positive outcome: 4 (app intact) and 5 (in-app notification, on a second run with a different recipient) · 8 verified at Gate 4 on the main stack (`/.env`, a fresh dump, `/CLAUDE.md`, `/js/lib/money.Test.js` → 404; `/login.html`, `/css/style.css` → 200). Criterion 1's `/TEST_CASES.md → 404` no longer holds by design after Gate 3 finding 1.

## What was done

6 commits:
- `c6ff9e5` test(scripts): nginx location selection model for the serve guard
- `13730d4` fix(nginx): serve only site files, everything else 404
- `243b2e5` docs: nginx serves only site files
- `1ad929e` docs: two sentences that relied on nginx's index.html fallback
- `66151f5` fix(nginx): serve TEST_CASES.md behind auth; js test files 404 in any case
- `87ac053` fix(nginx): no ~ in asset paths, so Windows short names cannot reach test files

## Gate outcomes

- Gate 1: passed (frontend only; 2 doc predicates fixed by the claims pre-check in `1ad929e`).
- Gate 2: ordinary path; branch stack spun up, acceptance list run (5 pre-ticked, 2 by hand), browser question answered yes, branch stack torn down.
- Gate 3: 3 rounds. Round 1: 3 findings (1 Important, 2 Minor), all fixed under "fix everything now" (`66151f5`). Round 2 (scoped `1ad929e..66151f5`): 3 Minor; 1 on the frozen spec → roadmap note, 2 fixed (`87ac053`). Round 3 (scoped `66151f5..87ac053`): no findings. No backend re-run: nothing under `api/` or `test-api.js` changed after Gate 1.
- Gate 4: merged `14e818e` (no divergence), pushed; no migration, no `api` restart. With the user's explicit confirmation: `scripts/backup-db.sh` (`backups/pdash-backup-2026-11-11-210803.dump`), then `docker compose restart nginx` on the main stack (started 2026-11-11T20:08:13Z, new config loaded); worktree removed, branch deleted.
- Gate 5: /sync-docs touched `CLAUDE.md`, `TEST_CASES.md`, `docs/BACKLOG.md` and two pins.

## Code review follow-ups

None.

## Roadmap notes

- Round 2 finding 2: the spec's acceptance criterion 1 (`docs/superpowers/specs/2026-11-11-nginx-serve-allowlist-design.md`) still lists `/TEST_CASES.md` as 404; since round 1 it is served behind auth so `test-cases.html` keeps working. Spec frozen, not edited.
- Files outside the plan's task lists: `test-cases.html` (round 1 fix), `docs/js/lib.md` and `docs/scripts/shoot.md` (claims pre-check).
- Secret rotation (`JWT_SECRET`, SMTP password, API keys) deliberately not done: the app is local-only and the only logged `/.env` hit since 2026-11-10 21:16 UTC is the user's own test. Optional action for the user.
- In a Chrome incognito window the "enable" control for browser/desktop notifications does nothing visible: the browser denies `Notification.requestPermission()` (`js/notifications.js:67`) and the page gives no feedback. Unrelated to this cycle; an observation, not filed.
- Gate 2's first run of criterion 5 failed because the instructions told the user to notify themselves, which Send Notification does not allow (self is excluded from the recipients).

## Sync-docs outcome

- §1 `ARCHITECTURE.md`: no — its `nginx.conf` tree line was already updated on the branch; no endpoint, table or module tree change.
- §2 `CLAUDE.md`: yes — File structure entry for `scripts/nginx-serve-guard.test.js` (with `scripts/lib/nginx-locations.mjs`); `scripts/claude-md-guard.test.js` pin raised 13,120 → 13,337 B for that index entry.
- §3 `TEST_CASES.md`: yes — SEC-12 "Only site files are served", `✓ (vitest)`; `js/lib/test-cases-parse.test.js` count 1004 → 1005.
- §4 `test-api.js`: no — no endpoint or auth rule changed.
- §5 PRD: evaluated, not necessary — no user-visible feature changed; the files that stopped being served were never part of the product.
- §5b operational-manual reference: no — the PRD was not touched.
- §6 PROCESS.md gate: none of the three conditions applies, so it was left untouched. The guard list in §4b is now inconsistent with `ls scripts/*-guard.test.js`: filed as B-449.
- §7 memory: yes — see below.
- `docs/BACKLOG.md`: B-449 added (B-448 and the B-028 evidence update came with the branch).

## Memory outcome

- `project_handbook_and_nginx_allowlist.md`: "allowlist cycle first (brief written)" → "nginx serve-allowlist — MERGED 2026-11-11 (`14e818e`, report …)", with what is served, the main-stack restart, the skipped rotation, B-448/B-449, and the handbook cycle 1 now NEXT with its open question 10 (add `handbook/` to the nginx allowlist and the guard).
- `MEMORY.md`: its line → "nginx allowlist cycle MERGED (`14e818e`, .env/backups no longer served); NEXT handbook/ viewer cycle 1 (brief written), then 2-3".
