# Finish-cycle report — security-c4-dependencies

**Date:** 2026-11-16
**Branch:** security-c4-dependencies → main
**Execution started:** 2026-11-16 00:45  (pre-flight step 6)
**Merged at:** 2026-11-16 02:04  (Gate 4's merge commit)
**Gate durations:** Gate 1 8m · Gate 2 11m · Gate 3 58m · Gate 4 5m · Gate 5 (to report) 5m — total 87m
**Cycle counters:** subagent dispatches 7 · review rounds 5 · full test-suite runs 12 (`npm test` 6, backend suite 6: `run-tests.sh` 5 + `cd api && npm test` 1)
**Gate 5 tests:** docs-and-script-tests → `npx vitest run scripts/ js/lib/test-cases-parse.test.js` ×1 (green on first run)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-16-security-c4-dependencies.md`) · review effort high
**Claims pre-check:** Gate 1 had nothing to check — the branch changed no `*.md` (spec and plan were committed on `main` before the branch), 0 minutes, 0 defects. No Gate 3 round fixed a `*.md`, so the re-checks did not run. Of round 1's 7 findings, 1 was mechanical (the guard header's stale count "the four in use").
**Acceptance:** 7 items from the Spec · 5 pre-ticked: Audit (`cd api && npm audit --omit=dev` → 0), Lockfile in the image (`scripts/run-tests.sh` build with `npm ci --omit=dev`; mismatch → `EUSAGE` in Task 1), Exact versions and SRI (`scripts/cdn-integrity-guard.test.js` in `npm test`), Guard (same, plus the manual red in Task 4), Mail (`scripts/run-tests.sh` → `MAIL-09`, `MAIL-10`, `AT-01`, `AT-02`) · 2 verified by hand with a positive outcome: Pages (branch stack, seven steps), Security review (`/security-review`, no findings) · none left unverifiable.
<!-- Wall-clock, human wait time included (pre-flight step 6). Write `unknown` for a gate whose
     timestamp was not captured; a gate that self-skipped gets `0m (skipped)`. Gate 5 is measured
     up to this report; Gate 5 up to its commit is read from `node scripts/cycle-times.mjs`,
     column `merge→docs`.
     The claims pre-check line is Gate 1 step 0's own measurement (PROCESS.md §6.4d). It is prose,
     not slots: a cycle where part of it did not happen says so instead of writing a zero. Keep
     the Gate 1 and Gate 3 figures distinct.
     Cycle counters, from the start of plan execution to Gate 5: subagent dispatches = calls to the
     Agent tool; review rounds = Gate 3 rounds; full test-suite runs = complete runs of `npm test`
     or of the backend suite (`node --test` over `api/`), targeted single-file runs excluded. A
     counter the session did not observe in full is `unknown`.
     Gate 5 tests: filled in by step 3, after this file exists; the verdict is the first line of
     `node scripts/gate5-scope.mjs`, and ×N counts one run per entry into step 3. Verdict and command
     are those of the green run; if an earlier run had a different verdict, append
     `(first: <verdict> → <command>)`.
     Risk class: the values Gate 2's identification step recorded.
     Acceptance: the outcome of Gate 2's Acceptance checklist. -->

## What was done

15 commits:

- `5b180ee` fix(deps): update nodemailer and express transitives, drop uuid, build with npm ci (S-09)
- `f3c7d01` test(cdn): guard exact versions and SRI on CDN libraries (S-09)
- `c7021c6` fix(cdn): pin Vue 3.5.45 and add SRI to every CDN tag (S-09)
- `84a7a17` fix(help): load Mermaid's UMD build with SRI (S-09)
- `9d28b63` test(mail): sign-in code and share mails reach Mailpit (S-09)
- `c3810db` fix(tests): rebuild the run-tests API image when the lockfile changes, final review
- `0feda84` fix(deps): upgrade multer to 2.x, review round 1 (S-09)
- `fdf4a44` fix(tests): tie run-tests' image hash to the shared image id, review round 1
- `5cc0bdb` test(cdn): the guard checks the loader applies integrity, header without a count, review round 1
- `b668aa5` test(mail): one Mailpit reader for MAIL-09/10 and the token checks, review round 1
- `b564954` fix(tests): run-tests builds when the image id cannot be read, review round 2
- `5c0c5e6` test(cdn): tie each lazy CDN URL to its own applied integrity, ignore comments, review round 2
- `c9ce19d` test(cdn): read lazy loaders through a small JS tokeniser, one object per URL, review round 3
- `7f9d282` fix(tests): run-tests says when it cannot read the image id, test pins the whole skip chain, review round 3
- `84f31f7` test(cdn): tokeniser keeps lines and reads JS scripts only, exact object names, review round 4

## Gate outcomes

- Gate 1: passed (frontend `npm test` 3221/3221 + `scripts/run-tests.sh` 1038/1038, backend unit 563/563) at `c3810db`.
- Gate 2: ordinary path; branch stack reused; acceptance checklist 5 pre-ticked + 2 ticked by hand; browser question answered yes; branch stack torn down.
- Gate 3: 5 rounds at high. Round 1 (whole branch, collected from Gate 2): 2 Important + 5 Minor; user rule "fix everything now" — 5 fixed, 2 noted (lockfile dev-dep downgrade, Mermaid UMD size); 0 findings on frozen specs/plans, 0 on pre-existing prose. Round 2 (`c3810db..b668aa5`): 5 Minor, 4 fixed under the rule, 1 pre-existing (upload >20 MB → 500) to BACKLOG by the user's choice. Round 3: 2 Important + 8 Minor, all fixed after the user chose (a) past the round cap. Round 4: 7 Minor, all fixed under the rule; the text-only rule never applied (`classify-cycle` → `ordinary` on every round range). Round 5: 5 Minor + 3 nits, all accepted as follow-ups by the user (non-converging edge cases in the guard's loader check). Backend re-run at exit: `scripts/run-tests.sh` 1038/1038 + 563/563 at `84f31f7`.
- Gate 4: merged (`f2f70a3`, merge commit; main had not diverged), pushed; `scripts/backup-db.sh` → `backups/pdash-backup-2026-11-16-020358.dump`; `pdash-api` restarted (healthy at 2026-11-16T01:04:43Z) — still on the old libraries, as expected — then rebuilt with `docker compose up -d --build api` after the user's explicit yes (no `-v`; healthy at 2026-11-16T01:06:19Z, nodemailer 10.6.0, multer 2.5.0, uuid absent); worktree removed; branch deleted.
- Gate 5: sync-docs touched 8 files (see below); BACKLOG rows B-492..B-495.

## Code review follow-ups

- Final review (before `/finish-cycle`), Minor: guard tag rules — `data-integrity=` matches, `EXACT_RE` `-x.y.z` on every host, `TAG_RE` stops at `>` in an attribute value → B-494.
- Final review, Minor: failed Mermaid `<script>` elements stay in `<head>`; no automated test of the Mermaid failure/retry path → B-492.
- Round 2, finding 5 (pre-existing): timesheet upload over 20 MB answers 500, `api/src/index.js` line 92 → B-493.
- Round 5, findings 1-5 and nits 6-7: `scripts/lib/js-code.mjs` edge cases (trailing `\` in a regex, `type` with leading whitespace, attributes inside other values, unterminated `<!--`, MIME parameters and legacy types), header name rule, repeated work in `loaderApplies` → B-495, moot once B-492 lands.
- Round 5, nit 8 (formatting in `scripts/lib/js-code.mjs`): no row; folded into B-492, which removes the file.

## Roadmap notes

- The guard's check of the lazy Mermaid loader took 4 of the 5 review rounds and did not converge: regex reading of JS/HTML keeps producing edge cases. B-492 records the structural fix (a `js/lib/` `loadScript` module tested in jsdom).
- Lockfile: `npm audit fix` also moved dev dependencies back (`nodemon` 3.1.14 → 3.1.11, `minimatch` 10 → 3, `brace-expansion` 5 → 1). Verified intentional: on `main`'s lockfile the full `npm audit` reported `brace-expansion` 4–5.0.11 (high) and `minimatch` 7–11 (moderate), and the fix resolves them with the older patched lines; `npm audit` (dev included) is 0 after the cycle.
- Mermaid's UMD build is downloaded whole (about 2.5 MB) where the ES module loaded chunks lazily — the cost of spec decision 1 (an `import()` cannot carry `integrity`).
- `multer` 1.x was deprecated with known vulnerabilities but invisible to `npm audit`; found by the code review, upgraded to 2.5.0 in this cycle by the user's choice. An audit-only dependency check misses deprecations.
- Three pages (`activate.html`, `login.html`, `reset-password.html`) start with a UTF-8 BOM on `main`; preserved, not added by this cycle.
- `/security-review` noted a pre-existing unescaped `firstName` in the invite and reset mail templates (`api/src/services/email.js`); outside this branch, not filed.
- Plan: no "File Structure" section, so Gate 4's out-of-scope check had nothing to compare; four files outside the plan's task lists were added by the reviews (`scripts/run-tests.sh`, `scripts/run-tests-image-hash.test.js`, `scripts/lib/js-code.mjs`, `scripts/lib/js-code.test.js`).
- Gate 5 process slip: the case-count bump in `js/lib/test-cases-parse.test.js` was made with `sed`, which Gate 5 forbids; the edit is correct (1023 → 1026, checked by grep and by the step 3 run).

## Sync-docs outcome

Scope pass (`git diff --stat f2f70a3^1 f2f70a3`, 33 files): 1 ARCHITECTURE yes · 2 CLAUDE.md yes · 3 TEST_CASES yes · 4 test-api.js no (no new endpoint or auth change; MAIL-09/10 were added on the branch) · 5 PRD no (internal-only: same pages, controls and flows) · 5c handbook: manual no, production checklist yes (ARCHITECTURE changed) · 6 PROCESS.md no · 7 memory yes.

- `handbook/restricted/ARCHITECTURE.md`: §2 Frontend row — CDN libraries pinned, with `integrity` + `crossorigin` (`scripts/cdn-integrity-guard.test.js`).
- `CLAUDE.md`: Cache-busting — CDN libraries carry an exact version and SRI instead of `?v=N`; File structure — two-line entry for `scripts/cdn-integrity-guard.test.js`.
- `scripts/claude-md-guard.test.js`: File structure pin 13,739 → 13,950 (+211 B, the new entry); its test title, stale at 13,269, now matches.
- `handbook/restricted/TEST_CASES.md`: SEC-13 (CDN pinned + SRI, ✓ vitest), SEC-14 (mail after nodemailer 10, ✓), HB-10 (Mermaid loaded once with integrity, manual); `js/lib/test-cases-parse.test.js` case count 1023 → 1026.
- `docs/pages/help.md`: Mermaid is the UMD build loaded by `loadMermaid()` with `integrity`/`crossOrigin`, retried after a failure.
- `docs/scripts/run-tests.md`: new section — the image hash covers the lockfile and the shared image id.
- `handbook/restricted/production-checklist.md`: new item — rebuild the API image when its dependencies changed (a restart keeps the old libraries).
- PROCESS.md gate: none of the three conditions.

## Memory outcome

- `project_security_review_series.md`: description "cycles 1-3 merged" → "cycles 1-4 merged"; added a "Cycle 4 MERGED 2026-11-16" paragraph (merge, report, libraries, rebuild, 5 rounds, the regex-guard lesson); "How to apply: next is cycle 4" → "next is cycle 5 (S-06, headers/CSP …), a CSP must allow the three CDN hosts".
- `MEMORY.md`: the Security review series line — "next = cycle 4 (dependencies and CDN, S-09)" → "cycle 4 … MERGED 2026-11-16 (`f2f70a3` …); next = cycle 5 (headers/CSP, S-06)".
