# Finish-cycle report — security-c8-csp-script-src

**Date:** 2026-11-17
**Branch:** security-c8-csp-script-src → main
**Execution started:** 2026-11-17 00:09  (pre-flight step 6)
**Merged at:** 2026-11-17 01:22  (Gate 4's merge commit)
**Gate durations:** Gate 1 8m · Gate 2 22m · Gate 3 42m · Gate 4 1m · Gate 5 (to report) 7m — total 80m
**Cycle counters:** subagent dispatches 4 · review rounds 3 · full test-suite runs 6
**Gate 5 tests:** docs-and-script-tests → `npx vitest run scripts/ js/lib/test-cases-parse.test.js` ×1 (green on first run)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-16-security-c8-csp-script-src.md`) · review effort high
**Claims pre-check:** Gate 1 cost 2 minutes over `docs/ops/security-headers.md` and caught 1 defect (an incomplete enumeration: the moved scripts' files, without the `-overrides.js` modules and the two shared scripts), fixed in `06164ba`; the Gate 3 re-check of round 1's one doc edit cost about 1 minute and caught nothing; rounds 2 and 3 changed no `*.md`. Of round 1's 10 findings, 2 were mechanical (false predicates in `CLAUDE.md` and `docs/pages/config.md` made stale by the branch).
**Acceptance:** 8 items · pre-ticked from an automated run: 1 CSP, 2 no inline script (`npm test` → `scripts/security-headers-guard.test.js` green), 6 exact copy (the characterization script, "27 pages identical" at `2f80ca6`, no `.html` or `js/pages/` change after it), 7 tests (`npm test` → 132 files / 3346 tests) · verified by hand with a positive outcome: 3 handler, 4 CDN injection, 5 pages, 8 security review · not verifiable here: none

## What was done

8 commits:
- `942bdf0` test: read root pages through pageSource in every test
- `ce91731` feat(ui): no inline head snippet, esc shim, redirect script or onclick
- `2f80ca6` refactor(ui): move every page script into js/pages/
- `94fd5c4` feat(security): CSP script-src without 'unsafe-inline', CDN files by exact URL
- `06164ba` docs: security-headers.md names every file the page scripts moved to
- `f042aec` fix(security): review round 1 — no inline handler in notifications, scheme-less CSP hosts, no esc shim
- `435ed1c` fix(security): review round 2 — directory CSP sources, quoted values in the handler and script scanners
- `84b740f` fix(security): review round 3 — handlerAttributes reads an unquoted value as one piece

## Gate outcomes

- Gate 1: passed (frontend `npm test` 132 files / 3346 tests; no `api/` path, so no `run-tests.sh`).
- Gate 2: ordinary path; the branch stack from the Task 5 probe was reused at the user's answer; Acceptance checklist 4 pre-ticked + 4 verified by hand; browser question answered yes; branch stack torn down.
- Gate 3: 3 rounds at high effort. Round 1 (whole branch, launched at Gate 2): 10 findings — by rule, 2 (stale prose made false by this branch: the `defer` rule, the head snippet, `PB_STAGE_STYLE`, the redirect lines) to this Gate 5 sync, 2 Spec decisions (public `js/pages/`, `sidebar-state.js` round trip) no action; the user chose "Fix everything now" for the other 6, fixed in `f042aec`, full suite 3353 green. Round 2 (`06164ba..f042aec`): 3 findings, fixed under that rule in `435ed1c`, `scripts/` tests 516 green. Round 3 (`f042aec..435ed1c`): 1 Important, fixed under the rule in `84b740f` (`scripts/security-headers-guard.test.js` + `scripts/cdn-integrity-guard.test.js` 103 green); round cap reached, the user chose (b), so round 3's fix was not re-reviewed; 4 more findings the round-3 agent delivered after the merge went to follow-up under the same answer. Backend re-run: `git diff --name-only 06164ba..HEAD` printed no `api/` path, nothing run.
- Gate 4: merged `d2abdc0` (`--no-ff`, main had not advanced), pushed; no migration, no `api/` change, so no backup and no `pdash-api` restart; worktree `.claude/worktrees/security-c8-csp-script-src` removed, branch deleted. Main `pdash-nginx` not reloaded by this gate: Spec §5 leaves it to the user.
- Gate 5: `/sync-docs` touched 8 files in the repo plus memory (below); BACKLOG B-497 updated, B-508 and B-509 added. At the user's yes, the main `pdash-nginx` was reloaded (`nginx -t` successful, then `nginx -s reload`); `curl -sI http://localhost/login.html` shows `script-src 'self' 'unsafe-eval'` + the file URLs.

## Code review follow-ups

- Round 3 (late, accepted at the round cap): the guard's regex HTML scanners still miss browser cases — `handlerAttributes` with no space after a quoted value, `HANDLER_IN_TAG` pairing quotes across JS source, an apostrophe inside an unquoted value in `inlineScripts` and `TAG`; round 3's fix `84b740f` not re-reviewed. `scripts/lib/js-code.mjs` lines 90, 107, 111; `scripts/security-headers-guard.test.js` line 401. → B-508.

## Roadmap notes

- Plan deviation, ruled during execution: help.html's module began with `import ... from './js/lib/test-cases-parse.js?v=3'`, which the Plan's Task 3 Step 1 said should stop the task; the specifier was rewritten to `/js/lib/test-cases-parse.js?v=3` (the same URL from `/help.html`) as the characterization's one declared exception, and `help.html?doc=test-cases` was opened by the probe and by hand.
- The Spec's `js/esc-shim.js` was created by Task 2 and removed by the round-1 fix at the user's choice ("Fix everything now"): `core.js`, deferred before `nav.js`, always defined `esc()` first.
- The Plan's Global Constraints do not mention `core.autocrlf=true`: worktree files are CRLF on disk and LF in the index; the move scripts normalised to LF and wrote CRLF back.
- Pre-existing, outside the cycle: five test regexes hold a literal backspace instead of `\b` → B-509.
- Third security cycle in a row (c4, c5, c8) where Gate 3 reached the round cap on the guard's own regex readers, never on the site's code → the B-508 direction (a real tokenizer) is the candidate for the security-process cycle's Spec.
- The production site (Bitbucket export, Azure) gets the new CSP only with the next export, and its nginx must be reloaded there.

## Sync-docs outcome

- `CLAUDE.md`: File structure gains the two-line `js/pages/` entry; the testing paragraph names `scripts/lib/page-source.setup.mjs` and `rawReadFileSync`; Page shell says the `<head>` loads `js/sidebar-state.js` blocking; Pipeline stage points at `js/pages/pipeline.js`'s `PB_STAGE_STYLE`; Script loading order names the three non-deferred classic page scripts and `sidebar-state.js` as the exceptions to `defer`, and its Rule now forbids inline scripts and handlers and sends overrides to `js/pages/<page>-overrides.js`.
- `scripts/claude-md-guard.test.js`: File structure pin 14,219 → 14,473 B (+254 B, the `js/pages/` index entry).
- `handbook/restricted/ARCHITECTURE.md`: §7 tree lists `js/pages/` and `js/sidebar-state.js`.
- `docs/pages/config.md`: both redirect lines say meta refresh, no script.
- `docs/js/notifications.md`: a section on the panel link under the CSP.
- `handbook/restricted/TEST_CASES.md`: SEC-22 (manual CSP walk-through), with the exact case count in `js/lib/test-cases-parse.test.js` raised 1033 → 1034.
- `handbook/restricted/production-checklist.md`: a "Pages run under the CSP" check (ARCHITECTURE.md changed).
- Not touched: `test-api.js` (no API change); PRD (`PRD.md`, `docs/prd/`) evaluated, not necessary — the user-visible behaviour is identical; `handbook/public/manual.md` (nothing visible changed); `docs/js/nav.md` (its "head snippet" still reads right). PROCESS.md gate: none of the three conditions applies, not touched.

## Memory outcome

- `project_security_review_series.md`: "How to apply: next is cycle 8 — …" → a "Cycle 8 MERGED 2026-11-17" paragraph (merge, report, what moved, the notifications finding, the round cap) and "How to apply: next is the security-process rules cycle; regex guards never converge — use a real tokenizer; a new CDN file needs its exact URL in script-src and an nginx reload".
- `MEMORY.md`: the Security review series line "next cycle 8 CSP (Brief written)…" → "cycle 8 … MERGED 2026-11-17 (`d2abdc0`…); next: the security process rules cycle — ask the user".
