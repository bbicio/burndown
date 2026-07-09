# Finish-cycle report — fix/status-vocabulary-reconciliation

**Date:** 2026-07-09
**Branch:** worktree-fix+status-vocabulary-reconciliation → main

## What was done

3 commits, merged `--no-ff` as `efd07dd`:

- `7447765` feat(lib): add getStatusRule, the pipeline-to-allowed-status rule
- `acf4624` feat: load status-rules.js on pages with the project Status dropdown
- `a59a8c5` fix: use getStatusRule for project Status dropdown rules

Fixes audit findings F1, F2, F3 (`docs/superpowers/audits/2026-07-09-proposal-project-status-lock-audit.md`): `Committed` pipeline was missing the `Started At Risk` status option (present for `Expected`/`Anticipated`); the dropdown wrote `'Complete'` while every other consumer (`statusBadge`, `statusBadgeLarge`, the Resource Planning eligible-projects filter) expected `'Completed'`; the pipeline-to-status rule map had three keys that were never valid pipeline stages (dead code, evidence of the root cause). All three shared one root cause and one code location (`js/core.js`'s `cfgApplyPipelineRules`), so they were fixed as a single cycle per the audit-to-brief grouping.

## Code review follow-ups

None. Each of the 3 tasks passed its subagent-driven-development task review clean; the final whole-branch review returned no Critical/Important findings.

## Roadmap notes

- During Task 2's first attempt, an implementer subagent committed directly to `main` in the primary checkout instead of the isolated worktree (a dispatch-context mistake, not a plan defect). Caught before the commit was pushed; `main` was reset to `origin/main` with the user's explicit confirmation, and Task 2 was correctly redone in the worktree with an enforced `cd`-and-verify first step added to all subsequent dispatch prompts. No lingering effect on `main` or the shipped code.
- `js/main.js` was discovered to be unreferenced by any HTML page (dead code) while investigating this cycle's second real call site of `cfgApplyPipelineRules` — noted but not removed, out of this cycle's scope.

## Sync-docs outcome

Deferred: `/sync-docs` was not run immediately after this cycle's merge — it was run together with Cycle 2's (`fix/generate-project-lock-granularity`) sync-docs pass on 2026-07-09, after both cycles and a follow-up domain-audit were complete, per explicit user request rather than immediately per-cycle. See `docs/superpowers/reports/2026-07-09-fix-generate-project-lock-granularity-finish-cycle.md` for the combined sync-docs outcome covering both cycles. This is a one-off timing deviation for this session, not a proposed change to the standard process — noted here per `PROCESS.md` §3 rather than generalized into `PROCESS.md` itself.
