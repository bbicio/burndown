# Finish-cycle report — security-process

**Date:** 2026-11-17
**Branch:** security-process → main
**Execution started:** 2026-11-17 15:50  (pre-flight step 6)
**Merged at:** 2026-11-17 16:01  (Gate 4's merge commit)
**Gate durations:** Gate 1 7m · Gate 2 unknown · Gate 3 unknown · Gate 4 1m · Gate 5 (to report) 2m — total 13m
**Cycle counters:** subagent dispatches 2 · review rounds 1 · full test-suite runs 3
**Gate 5 tests:** docs-only → `npx vitest run scripts/ js/lib/test-cases-parse.test.js` ×1 (green on first run)
**Risk class:** standard (`docs/superpowers/plans/2026-11-17-security-process.md`) · review effort medium
**Claims pre-check:** Gate 1 took about 3 minutes and caught 2 defects (a false predicate in PROCESS.md §6.4e — "nessun documento la ripete", while the Spec lists the surfaces — and an incomplete enumeration of the gates that apply §6.4e, missing Gate 5's report), fixed in `ef07654`. Gate 3 had no fix round, so no re-check ran. Round 1's one finding was not mechanical.
**Security review:** skipped — `node scripts/security-scope.mjs` printed `skip` / `audit: none` (the branch touches only `scripts/`, `.claude/`, `docs/` and `CLAUDE.md`). This closeout ran on `main`'s previous `/finish-cycle`, which had no security step; the verdict is the one the new step would have reached.
**Acceptance:** 7 items · pre-ticked from an automated run: 1 Comando (`npm test` 3398/3398, `scripts/security-scope.test.js`), 7 Documenti (`npm test` with the documentation guards, plus `grep -rn "api/src/\*\*\|docker-compose\*" docs/superpowers/PROCESS.md .claude/commands/finish-cycle.md` → none) · verified by hand with a positive outcome: 2 Gate 2, 3 Run non leggibile, 4 Skip dichiarato, 5 Security by design, 6 `npm audit` (read against `finish-cycle.md` and `feature-brief`) · none left unverifiable.

## What was done

6 commits:
- `5cbd17d` feat(process): security-scope.mjs decides when a cycle needs a security review
- `5cc14ca` feat(process): Briefs and Specs declare their security surface; the ledger guard pins it
- `253a280` feat(process): finish-cycle runs npm audit and /security-review when security-scope asks
- `4f4ed00` docs(process): PROCESS.md 6.4e and CLAUDE.md point at security-scope.mjs
- `d79af52` fix(process): Gate 3 checks post-launch commits for security on every review path
- `ef07654` docs: claims pre-check fixes for security-process

## Gate outcomes

- Gate 1: passed (frontend only, `npm test` 3398/3398; no `api/` path, `run-tests.sh` not run); claims pre-check fixed 2 defects in `ef07654`. No dependency audit: the step did not exist on `main` yet, and `security-scope` printed `audit: none`.
- Gate 2: ordinary cycle; §6.4c/§3 derogation confirmed by the user — no branch stack and no browser question, since no file nginx serves changed; acceptance checklist all passed.
- Gate 3: round 1 from the background `/code-review` (medium) at `ef07654`, HEAD unmoved; 1 Minor finding, accepted as follow-up under "Critical/Important now, Minor as follow-up"; no `api/` change since Gate 1, backend re-run not needed.
- Gate 4: merged `--no-ff` (`0db73c5`), pushed; no backup, migration or restart (no `api/`); worktree removed, local branch deleted.
- Gate 5: `/sync-docs` touched `handbook/restricted/ARCHITECTURE.md`; 7 rows added to `docs/BACKLOG.md`.

## Code review follow-ups

- Round 1 (Minor): `<security-reviewed-sha>` is set only at Gate 2 step 0, so Gate 3's foreground rerun and Gate 2's acceptance of an earlier run leave it stale or empty for the `<security-reviewed-sha>..HEAD` check — `.claude/commands/finish-cycle.md` line 113. `docs/BACKLOG.md` B-520.

## Roadmap notes

- Executed natively (`superpowers:executing-plans`) in this session, not on Sonnet as the handoff suggested: the session stayed on Opus. The SDD task scripts do not run on this host; the ledger was kept by hand.
- The final whole-branch review of execution (Opus, fresh context) found 0 Critical, 1 Important, 6 Minor. The Important (the security check of post-launch commits bound to one Gate 3 path) was fixed in `d79af52`; the 6 Minor were deferred by the executor and are B-521..B-526.
- Executor rulings: the built-in `/security-review` was observed to diff against `origin/HEAD` (its commit list included `cd230a8` and `2cfcaa3`, then on local `main` only), so the Gate 2 agent prompt compares `origin/HEAD` with `main`; Gate 3 makes the security findings round 1 when step 0 skips `/code-review`; `scripts/claude-md-guard.test.js` (outside the Plan's file list) pin raised 14,473 → 14,680 for the new CLAUDE.md entry.
- A Gate 1 test log was first written to the main checkout's root by mistake and deleted after the run; nothing was committed.
- The first cycles closed under the new step are its real test; the user's next work is the save-contract simplification series, whose cycles touch `js/` and `api/` and will all get `review`.

## Sync-docs outcome

- §1 `handbook/restricted/ARCHITECTURE.md`: yes — a `security-scope.mjs` line added to the `scripts/` tree, and the `decision-ledger-guard.test.js` line gains the `Security surface` rule.
- §2 `CLAUDE.md`: no — its File structure entry was added on the branch.
- §3 `TEST_CASES.md`: no — process change, no application behaviour.
- §4 `test-api.js`: no — no endpoint or auth change.
- §5 PRD (`PRD.md` and `docs/prd/`): evaluated, not necessary — internal process change, nothing user-visible.
- §5c handbook documents: no — no layer, route, table or user-visible flow changed.
- §6 PROCESS.md gate: yes, conditions 1 (`feature-brief`, a §5 process skill, modified) and 3 (`/finish-cycle` Gates 1-3 and 5 modified); PROCESS.md was already updated on the branch (§6.4e, §6b), nothing further needed.
- §7 memory: yes, see below.

## Memory outcome

- `project_security_review_series.md`: "next is the security-process rules cycle (Brief below); ask the user" → the cycle is MERGED, next is the save-contract simplification series (user's choice 2026-11-17); "Run `/security-review` on each branch before `/finish-cycle`" → `/finish-cycle` now runs it when `security-scope` says `review`; "The user wants it opened only AFTER the c7/c8 security cycles" → MERGED 2026-11-17 (`0db73c5`) with what shipped.
- `MEMORY.md`, Security review series line: "next: the security process rules cycle (Brief written) — ask the user" → "security process rules MERGED 2026-11-17 (`0db73c5`…); next: the save-contract simplification series (user's choice)".
