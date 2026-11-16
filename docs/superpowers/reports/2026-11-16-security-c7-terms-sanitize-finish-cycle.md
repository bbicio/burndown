# Finish-cycle report — security-c7-terms-sanitize

**Date:** 2026-11-16
**Branch:** security-c7-terms-sanitize → main
**Execution started:** 2026-11-16 22:00  (pre-flight step 6)
**Merged at:** 2026-11-16 22:26  (Gate 4's merge commit)
**Gate durations:** Gate 1 13m · Gate 2 11m · Gate 3 1m · Gate 4 3m · Gate 5 (to report) 3m — total 31m
**Cycle counters:** subagent dispatches 2 · review rounds 1 · full test-suite runs 5
**Gate 5 tests:** docs-only → `npx vitest run scripts/ js/lib/test-cases-parse.test.js` ×2 (red, then green: 484/484 both times, the first run failed on the `afterAll` cleanup hook of `scripts/site-export.test.js` timing out at 10 s; the file passed 60/60 alone and the second full run was green)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-16-security-c7-terms-sanitize.md`) · review effort high
**Claims pre-check:** Gate 1 step 0 took under a minute over the one `docs/BACKLOG.md` row (B-504) and found no defect; no Gate 3 re-check ran (no fix round); none of round 1's three findings was mechanical.
**Acceptance:** six Spec criteria. Pre-ticked from automated runs: 1 (unit part, `js/lib/terms-html.test.js` 7/7), 2 (same file), 3 (`scripts/run-tests.sh` `TV-01`..`TV-04`), 5 (`npm test` 3289/3289, `scripts/run-tests.sh` 583 + 1055). Verified by hand with a positive outcome on the branch stack: 1 (browser part — a version published with payloads shown sanitised in `terms.html`), 4 (the same version, stored unsanitised, shown sanitised in the Privacy Notice) and 6 (`/security-review`, no findings). None left unverifiable.
<!-- Wall-clock, human wait time included (pre-flight step 6). -->

## What was done

Four commits on the branch (the URL audit, Brief, Spec and Plan were committed on `main` before the branch was cut):

- `fd5fa2a` feat(terms): safeTermsHtml sanitises the Terms HTML with DOMPurify (U-01)
- `2e6f02c` fix(terms): Terms and Privacy Notice render the Terms HTML through safeTermsHtml (U-01)
- `3d606df` fix(api): Terms content must be a string of at most 100000 characters
- `f875ceb` docs(backlog): unencoded projectId in project-config links

Cycle 7 was re-planned during the session: the CSP Brief became cycle 8, and the user chose to fix the bug at its source first. The 2026-11-15 audit had already verified the `innerHTML`/`v-html` sinks, so a mini-audit covered only the URL sinks it had not assessed (`docs/superpowers/audits/2026-11-16-url-sinks-audit.md`), which found U-01. Executed natively (`superpowers:executing-plans`); `/security-review` ran on the branch before `/finish-cycle` and found nothing.

## Gate outcomes

- Gate 1: passed (`npm test` 3289/3289; `scripts/run-tests.sh` backend 583/583, integration 1055/1055) at `f875ceb`.
- Gate 2: ordinary path; branch stack spun up, acceptance checklist answered (three manual items verified, including a version published with payloads on the branch stack only), browser question answered yes, stack torn down. A read-only query on the main stack showed the published Terms use only `h2`, `p`, `ul`, `li`, `strong` — all allowed, so production text is unchanged.
- Gate 3: round 1 (background, whole branch, high) three Minor findings; disposition rules took none; user: Critical/Important now, Minor as follow-up — the docs finding handled by `/sync-docs`, the other two plus the security review's `/\evil.com` note → B-505..B-507. Backend re-run: nothing changed after `f875ceb`, so no run.
- Gate 4: merged `--no-ff` (`8293f4f`; main had moved by `1840b6a`, an inline-favicon commit pushed from outside this session that also published this cycle's audit, Brief, Spec and Plan commits); `backups/pdash-backup-2026-11-16-222636.dump` written; no migrations; `pdash-api` restarted, healthy at 2026-11-16T21:26:58Z; no nginx reload needed (CSP unchanged); worktree and branch removed.
- Gate 5: sync-docs touched 8 files; three BACKLOG follow-up rows (B-505..B-507).

## Code review follow-ups

- Round 1 (security review) — `/\evil.com` passes `ALLOWED_URI_REGEXP` (`js/lib/terms-html.js` line 8) → B-505.
- Round 1 — `express.json()` 100 kB body limit answers 413 before the 100000-character message (`api/src/index.js` line 40) → B-506.
- Round 1 — `java&#x09;script:` from the Review Focus has no test (`js/lib/terms-html.test.js`) → B-507.

## Roadmap notes

- The first `scripts/run-tests.sh` run of Task 3 had a red backend test, `api/src/lib/xlsx-advisories.test.js` line 72 ("answered after 2029 ms"), green alone three times and in the next full run: a wall-clock threshold that slips under load. Not opened as a BACKLOG row; recorded here.
- Gate 5's first test run failed on `scripts/site-export.test.js` line 12: its `afterAll` hook (`rmSync` of temporary git repositories) exceeded vitest's 10 s hook timeout; no assertion failed, and the next runs were green. A slow delete on this host; a candidate for an explicit hook timeout.
- The `run-tests.sh` cleanup again printed a red `DELETE /api/pipeline-years/<id> → 409` in some runs, retried later; not counted in the results.
- An untracked `docs/superpowers/briefs/2026-11-16-security-process-brief.md` in the main checkout belongs to other work and was left alone.
- Next in the series: cycle 8, CSP without `'unsafe-inline'` (`docs/superpowers/briefs/2026-11-16-security-c8-csp-script-src-brief.md`).

## Sync-docs outcome

Scope: 1 ARCHITECTURE yes (`PUT /terms` gains a 400) · 2 CLAUDE.md no edit to the file, routing targets yes · 3 TEST_CASES yes · 4 test-api no (done on the branch) · 5 PRD yes (what the sysadmin's Terms show changes) · 5c production checklist and user manual checked, no change · 6 PROCESS.md no (none of the three conditions) · 7 memory yes.

- `handbook/restricted/ARCHITECTURE.md`: the `PUT /api/app-settings/terms` row gains the 400 rule.
- `docs/api/app-settings.md`: the new 400 and "stored as sent, sanitised when shown".
- `docs/pages/terms.md`: new "Sanitised content" section.
- `docs/pages/privacy-notice.md`: `v-html="safeContent"` instead of raw `v-html` (the sentence the review found false).
- `docs/js/lib.md`: new `terms-html.js` entry.
- `docs/prd/administration.md` (§16 Terms editor): which markup users see, and the 100,000-character limit.
- `handbook/restricted/TEST_CASES.md`: SEC-21; `js/lib/test-cases-parse.test.js` count 1032 → 1033.

## Memory outcome

- `project_security_review_series.md`: added "Cycle 7 re-planned and MERGED 2026-11-16" (URL audit, U-01, fix, follow-ups, lesson: read the last audit's verified table before proposing one); "How to apply: next is cycle 7 — B-497 partial …" → "next is cycle 8 — B-497 partial … Brief written … then the security-process rules cycle".
- `MEMORY.md`: Security review series line "next cycle 7 (B-497 partial, needs /feature-brief)" → "cycle 7 = Terms HTML sanitised (URL audit U-01) MERGED 2026-11-16 (`8293f4f`); next cycle 8 CSP (Brief written)".
