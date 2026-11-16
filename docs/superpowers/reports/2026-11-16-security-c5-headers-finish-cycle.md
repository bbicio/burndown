# Finish-cycle report — security-c5-headers

**Date:** 2026-11-16
**Branch:** security-c5-headers → main
**Execution started:** 2026-11-16 12:44  (pre-flight step 6)
**Merged at:** 2026-11-16 14:55  (Gate 4's merge commit)
**Gate durations:** Gate 1 9m · Gate 2 52m · Gate 3 41m · Gate 4 29m · Gate 5 (to report) 7m — total 138m
**Cycle counters:** subagent dispatches 5 · review rounds 3 · full test-suite runs 2
**Gate 5 tests:** docs-and-script-tests → `npx vitest run scripts/ js/lib/test-cases-parse.test.js` ×1 (green on first run)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-16-security-c5-headers.md`) · review effort high
**Claims pre-check:** at Gate 1 it took about 2 minutes over the two changed `*.md` files (BACKLOG rows B-494..B-498, `docs/ops/security-headers.md`) and caught nothing; at Gate 3 only round 1's fixes touched `*.md`, re-checked in about a minute with nothing caught, and rounds 2 and 3 touched no `*.md`. Of round 1's 12 findings, 1 was mechanical (a stale pointer: the cycle-4 guard's header said `CDN_HOSTS` was in that file after it had moved to `scripts/lib/cdn-urls.mjs`).
**Acceptance:** 6 items from the Spec's acceptance criteria · 1 pre-ticked: Test (`npm test` → 129 files / 3260 tests green at `a5da16c`, Gate 1; the two manual reds were done in Task 2) · 5 verified by hand by the user with a positive outcome: Decision, Headers, CSP, Clickjacking, Security review · none left unverifiable. During the CSP check the user saw DevTools source-map refusals under `connect-src`, accepted with no CSP change and documented in `50ac893`.

## What was done

7 commits:

- `bd73cf1` test(csp): share the CDN reader, read external resources by kind (S-06)
- `14a5592` feat(nginx): security headers at server level, CSP report-only, guard (S-06)
- `a5da16c` feat(nginx): enforce the CSP after measuring it on the branch stack (S-06)
- `50ac893` docs(ops): DevTools source-map refusals under connect-src are expected (S-06)
- `6fb40df` test(csp): guard reads //, http:, <img> and handbook images, rejects host wildcards and -elem/-attr; shared comment strip; review round 1 (S-06)
- `954960f` test(csp): refuse protocol-relative URLs, read browser-normalised forms and reference images, token-aware comment strip; review round 2 (S-06)
- `5a9d186` test(csp): reference images resolved as marked does, malformed URL refused not thrown; review round 3 (S-06)

## Gate outcomes

- Gate 1: passed (`npm test` frontend; `scripts/run-tests.sh` not run — no `api/` path, and the integration suite talks to `api:3000` directly, not through nginx).
- Gate 2: ordinary path; branch stack reused (left up by the Task 3 measure); acceptance checklist all positive; browser question answered yes; branch stack torn down.
- Gate 3: round 1 = the background review (12 findings: 1 Important, 11 Minor) plus a scoped review of `50ac893` (2 Minor); the user's rule: fix everything, then a scoped review of the fixes. Round 2: 4 Minor, fixed under the rule. Round 3: 4 Minor + 1 note, fixed under the rule. Round cap reached: the user chose (b), so the round-3 fixes (`5a9d186`) were not re-reviewed; no finding was left open. Disposition by target: 0 findings on specs/plans, 0 on pre-existing prose. Backend re-run: no `api/` path since `a5da16c`, nothing run.
- Gate 4: merged `cf54a45` (`--no-ff`; main had not diverged), pushed together with the spec and plan commits; no DB backup (no `api/` path); no migration, no `pdash-api` restart; worktree removed, branch deleted. After the user's yes, main `pdash-nginx` tested (`nginx -t`) and reloaded; `curl -sI` on `/login.html` (200), `/pipeline.html` (302) and `/api/auth/me` (401) show every header and no `X-Powered-By`.
- Gate 5: sync-docs touched 6 files (see below).

## Code review follow-ups

None.

## Roadmap notes

- The round-3 fixes (`5a9d186`: reference images resolved as marked does, malformed URL refused) are covered by their RED→GREEN tests but were not reviewed: the user stopped at the round cap.
- As in cycle 4, every Gate 3 finding after round 1 was about the guard's regex reading (markdown images, URL forms, nginx comments), not about `nginx.conf`. The same lesson applies: reading a format with regexes in a guard keeps producing edge-case findings.
- Claude in Chrome is blocked for `localhost`, so the plan's console check was done with a throwaway CDP probe in the scratchpad (CSP violation events and console messages). `scripts/shoot.mjs` has no console capture.
- With `/c/...` output paths and `MSYS_NO_PATHCONV=1`, `scripts/shoot.mjs --out` wrote to `C:\c\...`; that directory already held files from an earlier session and was left alone.
- Observed, not related to the CSP: `project-config.html` without `projectId` logs a Vue `TypeError: Cannot read properties of null (reading 'name')` while it redirects to the portfolio.
- The plan's Task 3 checked the console with `claude-in-chrome` and did not foresee DevTools-only requests; the user's own browser check found the source-map one.

## Sync-docs outcome

Scope pass: 1 ARCHITECTURE.md yes (nginx.conf entry) · 2 CLAUDE.md yes (File structure) · 3 TEST_CASES.md yes (new security cases) · 4 test-api.js no (no endpoint) · 5 PRD no (internal, non-functional change; evaluated, not necessary) · 5c production checklist yes (ARCHITECTURE.md changed), user manual no · 6 PROCESS.md gate: none of the three conditions · 7 memory yes.

- `handbook/restricted/ARCHITECTURE.md`: the `nginx.conf` tree entry says it sets the security headers and the CSP at server level, pointing at `docs/ops/security-headers.md`.
- `CLAUDE.md`: the `cdn-integrity-guard` entry now says it reads through `scripts/lib/cdn-urls.mjs`; new two-line entry for `scripts/security-headers-guard.test.js`.
- `scripts/claude-md-guard.test.js`: File structure block pin 13,950 → 14,219 (+269 B, the new entry).
- `handbook/restricted/TEST_CASES.md`: SEC-15 (headers and CSP, ✓ vitest) and SEC-16 (framing refused, manual).
- `js/lib/test-cases-parse.test.js`: real case count 1026 → 1028.
- `handbook/restricted/production-checklist.md`: new item "Security headers reach the browser", pointing at the `curl` commands of `docs/ops/security-headers.md`.

## Memory outcome

- `project_security_review_series.md`: description "cycles 1-4 merged" → "cycles 1-5 merged"; the "Cycle 5 spec + plan committed … execution not started" paragraph → "Cycle 5 MERGED 2026-11-16 (`cf54a45`, …)" with the environment effects, the Gate 3 lesson and the open B-496/B-497; "How to apply: next is cycle 5 execution" → "next is cycle 6 (hardening, …`2026-11-15-security-c6-hardening-brief.md`)".
- `MEMORY.md`: the Security review series line "cycle 5 headers/CSP spec+plan committed …, native execution next" → "cycle 5 headers/CSP MERGED 2026-11-16 (`cf54a45`, nginx reloaded, 3 review rounds on the guard, B-496..B-498 open); cycle 6 hardening next".
