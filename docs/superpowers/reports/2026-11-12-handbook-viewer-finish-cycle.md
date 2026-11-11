# Finish-cycle report — handbook-viewer

**Date:** 2026-11-12
**Branch:** handbook-viewer → main
**Execution started:** 2026-11-11 23:32  (pre-flight step 6)
**Merged at:** 2026-11-12 00:29  (Gate 4's merge commit)
**Gate durations:** Gate 1 7m · Gate 2 22m · Gate 3 26m · Gate 4 3m · Gate 5 (to report) 5m — total 63m
**Cycle counters:** subagent dispatches 24 · review rounds 3 · full test-suite runs 4
**Gate 5 tests:** docs-only → `npx vitest run scripts/ js/lib/test-cases-parse.test.js` ×2 (red, then green: `doc-paths-guard` refused an example image path written in backticks in B-459, reworded)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-11-handbook-viewer.md`) · review effort high
**Claims pre-check:** Gate 1 step 0 took about 2 minutes and caught 6 defects: two stale numbers (the parser test's case and section counts quoted in `docs/js/lib.md`; the `claude-md-guard` test title disagreeing with its pin), three false predicates (`CLAUDE.md`'s list of non-Vue pages, the Bitbucket brief naming one consumer of `test-cases-parse.js`, `PROCESS.md` on what `.gitignore` ignores) and one incomplete enumeration (`CLAUDE.md` did not list `scripts/handbook-guard.test.js`); fixed in `e81f589`. The Gate 3 re-check of round 1's fixes took about 2 minutes and caught 1 defect (a `PROCESS.md` heading turned into a non-existent path), fixed in `d547615`; round 2 changed no markdown. Of round 1's 9 findings, 3 were mechanical (stale `ARCHITECTURE.md` paths in `PROCESS.md`, the localStorage key missing from `CLAUDE.md`'s list, the stale header comment of `test-cases-parse.js`).
**Acceptance:** 13 criteria listed · 7 pre-ticked from automated runs (1 `git ls-files`; 8 `scripts/classify-cycle.test.js`; 9 `scripts/handbook-guard.test.js` + `js/lib/handbook.test.js`; 10 `scripts/nginx-serve.test.js`; 11 `scripts/architecture-guard.test.js`; 12 `npm test` 2993/2993 and `scripts/run-tests.sh` 934/934; 13 the Bitbucket brief's "Inclusi" line) · 6 verified by hand on the branch stack with a positive outcome (2 viewer per role, 3 server access 403/200/302, 4 test cases unchanged, 5 mermaid with a temporary uncommitted block, 6 redirect, 7 Help entry) · none left unverifiable. The plan's tests for `TEST_CASES.md` added none (the file was only moved).

## What was done

14 commits (subagent-driven execution of the plan, then Gate 1 and Gate 3 fixes):

- `bbcaba8` feat(auth): GET /api/auth/admin-check for nginx role checks
- `e5ee4f0` feat(handbook): pure viewer logic in js/lib/handbook.js
- `4fe22da` refactor(handbook): move ARCHITECTURE, TEST_CASES and the production checklist into handbook/
- `2cdc5ae` feat(nginx): serve handbook/, restricted/ for admins only; /test-cases.html redirects to the viewer
- `84d9f1c` feat(classify-cycle): handbook/ docs are no-code, audience moves are ordinary
- `c86ba4b` feat(help): single handbook viewer replaces test-cases.html; Help entry in the account menu
- `b5a35cb` docs: handbook viewer — process docs, CLAUDE.md, Bitbucket brief
- `0369b87` test(nginx): nginx-locations model test expects authBy
- `03e6aa2` docs(backlog): repoint open rows from test-cases.html to help.html
- `c92d344` fix(handbook): final-review fixes
- `e81f589` docs: Gate 1 claims pre-check fixes (handbook-viewer)
- `c12afac` fix: Gate 3 round 1 review findings (handbook-viewer)
- `d547615` docs: PROCESS.md heading names the documents, not a path (Gate 3 re-check)
- `fe272af` fix: Gate 3 round 2 review findings (handbook-viewer)

## Gate outcomes

- Gate 1: claims pre-check fixed 6 defects (`e81f589`); `npm test` 117 files / 2993 tests green; `scripts/run-tests.sh` 934/934 green.
- Gate 2: ordinary cycle; branch stack reused from the Task 5 visual check; acceptance checklist 7 pre-ticked + 6 verified by hand; browser question answered yes; branch stack torn down. `/code-review` at high launched in the background at `e81f589` (the subagent final review did not count, as high-risk requires a `/code-review` at high).
- Gate 3: 3 rounds. Round 1 (whole branch): 9 findings (1 Important, 8 Minor), user chose "fix everything now" — fixed in `c12afac` + `d547615`. Round 2 (scoped `e81f589..d547615`): 7 Minor, fixed under the same rule in `fe272af`. Round 3 (scoped `d547615..fe272af`): 1 Important + 6 Minor; round cap reached, user chose (b) accept everything remaining as follow-up. Disposition by target: 0 findings on frozen specs/plans, 0 on pre-existing prose. Backend re-run: `api/src/routes/auth.js` changed after Gate 1 → `scripts/run-tests.sh` 934/934 green.
- Gate 4: merged `--no-ff` (`0b14b16`, main had not diverged) and pushed; DB backup `backups/pdash-backup-2026-11-12-002852.dump`; no migration; pdash-api restarted and healthy at 2026-11-11T23:29:28Z; the stray uncommitted edit of `.claude/commands/finish-cycle.md` in the main checkout (a subagent's wrong-path Edit) reverted with the user's go-ahead before the merge; worktree unregistered (`git worktree list` shows main only) but its directory could not be deleted (Permission denied / busy) — empty leftover; branch deleted.
- Gate 5: `/sync-docs` touched 6 files (see below); 6 BACKLOG rows added.

## Code review follow-ups

- Round 3 — Important: handbook-guard resolves `.png` references against the document's folder, but `help.html` renders with no base URL; a public doc using `handbook/restricted/img/a.png` is not flagged, and `img/a.png` would 404 (`scripts/handbook-guard.test.js` line 60, `help.html` line 282) → B-459, handbook cycle 2.
- Round 3 — Minor: `mentions()` boundaries too narrow / too loose, redundant double call (`scripts/handbook-guard.test.js` line 69) → B-460.
- Round 3 — Minor: the image-reference extraction captures an unquoted `src=`; documents re-read per image → B-461.
- Round 3 — Minor: `flowchart-elk` accepted but ELK layout not loaded in the viewer (`js/lib/handbook.js` line 6) → B-462.
- Round 3 — Minor: stale JSDoc/header in `scripts/classify-cycle.mjs` → B-463.
- Round 3 — Minor: an unrelated delete + add sharing a basename counts as a move (safe direction; comment only) → B-464.

## Roadmap notes

- **The main-stack `pdash-nginx` reload is still pending.** The Gate 4 derogation covers only `docker compose restart api`. Until nginx is reloaded with `scripts/backup-db.sh` and the user's explicit confirmation, main serves the old `nginx.conf`: `/handbook/…` answers 404 (so `help.html` shows its load error) and `/test-cases.html` answers 404 instead of redirecting.
- Spec criterion 4's second half (an outcome saved before the cycle is still visible) can only be seen on http://localhost after the nginx reload: localStorage is per origin, and the branch stack ran on :8081. The user ticked the criterion.
- The temporary mermaid block used for criterion 5 was reverted before the merge, as the spec required.
- The leftover directory `.claude/worktrees/handbook-viewer` is empty of work (unregistered from git) and can be deleted once no process holds it.
- Execution notes: one implementer was cut off by the account usage limit and resumed with its WIP intact; one implementer's Edit hit the main checkout by absolute path (caught, reverted before merge).

## Sync-docs outcome

Scope pass: §1 ARCHITECTURE yes — already updated on the branch (admin-check route, help.html entry); no further change. §2 CLAUDE.md yes — already updated on the branch; no further change. §3 TEST_CASES yes — new section 32 "Help viewer" with HB-01..HB-08, and the parser test's exact counts raised to match (`js/lib/test-cases-parse.test.js`). §4 test-api.js no — A-07 added on the branch. §5 PRD yes (a page and a menu entry added) — `PRD.md` §3 account-menu list gains "Help"; `docs/prd/notifications.md` §9 gains the Help paragraph. §5b yes — `.claude/skills/operational-manual/SKILL.md` §9 reference gains a Help bullet, reconciled from `docs/prd/notifications.md`. §5c yes — technical documentation done on the branch; production checklist gains "Restricted documents are admin-only"; manual step not active until handbook cycle 2. §6 PROCESS.md gate: condition 3 applies (the cycle changed a `/finish-cycle` gate's wording and a `/sync-docs` output, §5c); `PROCESS.md` was updated on the branch (§4b guard row, §6.4c); no further change. §7 memory yes.

## Memory outcome

- `project_handbook_and_nginx_allowlist.md`: "execution DONE … Next: /finish-cycle …" → "MERGED 2026-11-12 (`0b14b16`, this report) … round 3 follow-ups, cycle 2 must decide image loading … main pdash-nginx reload still open".
- `MEMORY.md`: the handbook line → "handbook cycle 1 MERGED 2026-11-12 (`0b14b16`); main pdash-nginx reload still pending user confirmation; cycle 2 must decide image loading first".
- `project_sdd_scripts_windows_host.md`: added the 2026-11-11 wrong-path Edit into the main checkout and the usage-limit resume.
