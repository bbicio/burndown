# Finish-cycle report — backlog-b417-sse-revocation

**Date:** 2026-11-11
**Branch:** backlog-b417-sse-revocation → main
**Execution started:** 2026-11-11 18:34  (pre-flight step 6)
**Merged at:** 2026-11-11 19:07  (Gate 4's merge commit)
**Gate durations:** Gate 1 unknown · Gate 2 unknown (Gates 1+2 together 22m, the boundary between them not captured) · Gate 3 unknown · Gate 4 unknown (Gates 3+4 together 12m, the boundary between them not captured) · Gate 5 (to report) 2m — total 36m
**Cycle counters:** subagent dispatches 1 · review rounds 1 · full test-suite runs 6 (`npm test` ×1; backend: `cd api && npm test` ×1, `scripts/run-tests.sh` ×4 — two red runs without the fix, one green in Task 3, one at Gate 1)
**Gate 5 tests:** docs-only → `npx vitest run scripts/ js/lib/test-cases-parse.test.js` ×1 (green on first run)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-11-backlog-b417-sse-revocation.md`) · review effort high
**Claims pre-check:** nothing to check at Gate 1 — the branch changed no `*.md`; Gate 3 had no fix round, so no re-check ran; round 1 had 4 findings, none of them in the four mechanical classes.
**Acceptance:** 6 items listed, all 6 pre-ticked from automated runs at `fd7d69e` (`bash scripts/run-tests.sh` → 461/461 unit + 930/930 integration, SSE-01..SSE-03; `notifications.test.js` "a failed check keeps the stream"; `grep -n "sessionError(" api/src/middleware/auth.js` → one line; `npm test` → 2926/2926); none manual; browser verification confirmed by the user on the branch stack.

## What was done

3 commits:
- `5f2a29d` refactor(auth): one session lookup, `sessionRowError`, shared by `requireAuth`
- `0681e43` fix(notifications): an open SSE stream ends when its session is revoked (B-417)
- `fd7d69e` test(api): SSE-01..SSE-03, open streams end on session revocation

Spec `1fe8106` and Plan `c54b812` were committed on `main` before execution.

## Gate outcomes

- Gate 1: passed (frontend `npm test` 2926/2926 + backend `scripts/run-tests.sh` 461/461 unit, 930/930 integration).
- Gate 2: ordinary cycle; branch stack spun up, browser verification confirmed by the user, stack torn down.
- Gate 3: round 1 (background, high) — 4 Minor findings, all accepted as follow-up ("Everything as follow-up"); 0 taken by the spec/plan or pre-existing-prose rules; no fix round. Backend re-run: `git diff fd7d69e..HEAD` empty, nothing run.
- Gate 4: merged `9725834` (no divergence), pushed; `backup-db.sh` wrote `backups/pdash-backup-2026-11-11-190659.dump`; no migration; pdash-api restarted and healthy at 2026-11-11T18:07:36Z; worktree removed, local branch deleted.
- Gate 5: sync-docs touched 5 files (`ARCHITECTURE.md`, `TEST_CASES.md`, `js/lib/test-cases-parse.test.js`, `docs/api/notifications.md`, `docs/api/lib.md`); B-417 closed, B-444..B-447 added to `docs/BACKLOG.md`.

## Code review follow-ups

- Round 1 — the heartbeat check ignores the JWT `exp` claim, so an open stream outlives its 8 h token (`api/src/routes/notifications.js` line 68) → B-444.
- Round 1 — a pending check suppresses the heartbeat write, so keep-alive depends on the query finishing (`api/src/routes/notifications.js` line 66) → B-445.
- Round 1 — one users query per connection per heartbeat, no dedup per user (`api/src/routes/notifications.js` line 68) → B-446.
- Round 1 — `liveRole` and `sessionRowError` read the same row with two queries (`api/src/middleware/auth.js` line 62) → B-447.

## Roadmap notes

- Raised by the review outside the diff, not a finding: `js/notifications.js` line 114 has an empty `onerror`, so after the 401 on reconnection a revoked tab's bell silently stops updating and nothing sends the user to the login. Changes to `js/notifications.js` were out of scope; not written to `docs/BACKLOG.md`.
- The integration suite now waits up to one real heartbeat (about 25-40 s) in `testSseRevocation` (Spec, decision 3).
- Execution was native; no separate whole-branch reviewer ran before `/finish-cycle` — Gate 3 at effort high was the final review (PROCESS.md §6.4).
- `scripts/run-tests.sh` still prints the known first-try `DELETE /api/pipeline-years/… → 409` in cleanup (retried, not counted).

## Sync-docs outcome

Scope pass (`git diff --stat 9725834^1 9725834`: `api/src/middleware/auth.js`, `auth.test.js`, `api/src/routes/notifications.js`, `notifications.test.js`, `test-api.js`):
1. ARCHITECTURE.md — yes: §3.1 auth paragraph, the `/api/notifications/stream` row and the middleware tree entry now name the per-heartbeat check and `sessionRowError`.
2. CLAUDE.md — no: its index entries stay accurate; the narrative went to `docs/api/notifications.md` (new section "Stream ends with the session") and `docs/api/lib.md` (the `session.js` entry names `sessionRowError` and the stream).
3. TEST_CASES.md — yes: A-33 added (auto ✓, SSE-01..SSE-03); `js/lib/test-cases-parse.test.js` case count raised 1003 → 1004.
4. test-api.js — no: SSE-00..SSE-03 were added on the branch.
5. PRD — evaluated, not necessary: a bugfix restoring the behaviour `docs/prd/access.md` already documents ("end the user's open sessions").
5b. operational-manual reference — no: the PRD was not touched.
6. PROCESS.md — gate answer no (none of the three conditions).
7. Memory — yes, see below.

## Memory outcome

- `project_backlog_cycles_2026_11_10.md`: "B-378 stays open. NEXT: B-417, then cycle 3 of the index." → "B-378 stays open." plus a new bullet "B-417 … MERGED 2026-11-11 (`9725834`, report …, pdash-api restarted) … NEXT: cycle 3 of the index."
- `MEMORY.md`: "next: B-417 → cycle 3" → "B-417 SSE revocation MERGED 2026-11-11 (`9725834`); next: cycle 3".
