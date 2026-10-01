# Finish-cycle report — worktree-money-wrapper-cleanup

**Date:** 2026-10-01
**Branch:** worktree-money-wrapper-cleanup → main (merge `7f3376d`, pushed)

## What was done

Money wrapper cleanup (Approach 2 of the money centralization cycle): every one-line money wrapper was removed and each call site calls `formatMoney(amount, code, currencies)` from `js/lib/money.js` directly, with the currency always explicit. Frontend only: no API change, no migration, `pdash-api` not restarted. Spec `docs/superpowers/specs/2026-10-01-money-wrapper-cleanup-design.md`, plan `docs/superpowers/plans/2026-10-01-money-wrapper-cleanup.md` (executed subagent-driven, one task per page).

- `95024a7` refactor: timesheets.html calls formatMoney directly
- `c85efda` refactor: remove cgFmtCurrency and fmtCur wrappers
- `cb29810` refactor: remove pbFmtMoney wrapper and its window bridge
- `6d8835f` refactor: config.html calls formatMoney directly
- `1f0eb1e` refactor: project-config.html calls formatMoney directly
- `c35bc34` refactor: portfolio.html calls formatMoney directly, drop currentCfg
- `e3d5e17` refactor: remove unreachable portfolio builders that used fmtMoney
- `4ddc696` refactor: delete fmtMoney and currentCfg from core.js, guard removed wrappers
- `6ffa895` fix: bump js/lib/money.js ?v after comment edit
- `94016ac` docs: money call sites use formatMoney directly
- `a9a1241` fix: portfolio.html renders an em dash for null amounts again (code review round 1)

Version bumps: `js/core.js` 9, `js/costgrid.js` 38, `js/lib/pipeline-calc.js` 4, `js/lib/money.js` 2, `js/portfolio.js` (planning.html, was unversioned) `?v=2`. `money-guard.test.js` now fails if a removed name reappears; `money-characterization.test.js` was deleted (its cases are covered by `money.test.js`). 338 tests pass.

## Code review follow-ups

- Round 1 (fixed in `a9a1241`): `portfolio.html:91` — `formatMoney` formats null/undefined as zero where the old `fmtMoney` returned '—'. At the time no live site could pass null (the cited pinned-summary panel is commented out, its values are initialised to 0), but the user chose to fix: null guards were added to the unguarded call sites.
- Round 2 (low severity, accepted, no change): a few `portfolio.html` summary cells (`summaryTotals(...).tot*Eur`, `r.remainingEur`, `row.eur`) are still unguarded against null; only reachable if a value is ever undefined.
- Round 2 (low severity, accepted, no change): the pinned summary in `portfolio.html` (hidden by an HTML comment since 2026-09) now always formats in EUR instead of the stale `currentCfg`.

## Roadmap notes

Findings from the user's manual browser test (Gate 2); none is a regression of this branch. Full detail in project memory (`project_manual_test_findings_money_cleanup.md`).

1. End date earlier than start date is accepted on a proposal and on tasks.
2. Date handling is probably not uniform across the site (candidate cycle A, audit first).
3. Form-field validation should be reviewed everywhere (candidate cycle B).
4. Pipeline detail panel shows a proposal's amounts without the "≈ €" equivalent that the cards show (pre-existing on `main`).
5. The costgrid hourly-rate input is a plain `type="number"` input with no currency formatting (a documented exclusion of the money centralization cycle; same question for rate inputs on other pages).
6. FEATURE: show Expected and SIP in the POT widget below the "N proposals contribute to this POT" label (`pipeline.html:262`), without adding them to the target (only Anticipated and Committed count).
7. Portfolio dashboard: swap the Budget Consumed and Hours Left KPI cards.
8. ENHANCEMENT: POT details modal (`config.html`) should also show the original-currency amount; the EUR value stays visible and keeps feeding totals and the POT calculation (needs the API to return currency and local amount).
9. Planning: remove the "Compact/Expand" button — ambiguous (width toggle `planning.html:117` vs the three "Expand all" buttons); the user did not answer which one.

Other observations from the cycle:
- `EnterWorktree` branches from `origin/main`, so the unpushed spec/plan commits were missing and the worktree branch had to be fast-forwarded to local `main`.
- `scripts/backup-db.sh` run from the worktree wrote its dump inside the worktree, which was then removed; the snapshot was redone from the main checkout (`backups/pdash-backup-2026-10-01-214259.dump`).
- The merge also pushed the two spec/plan docs commits that were only on local `main`.

## Sync-docs outcome

Updated: `CLAUDE.md` (the `js/lib/` entry now says `money.js` is `?v=2`; the rest of the money documentation was already updated in `94016ac`), `ARCHITECTURE.md`, `docs/js/core.md`, `docs/js/costgrid.md`, `docs/js/lib.md`, `docs/pages/{config,pipeline,portfolio,project-config,timesheets}.md` (all in `94016ac`). Not necessary: `TEST_CASES.md`, `test-cases.html`, `test-api.js` (no new behaviour, no API change, none mentions a removed name), `PRD.md` (internal refactor with byte-identical user-facing output; evaluated, not necessary), `PROCESS.md` (gate answer: none of the three conditions applied — the cycle executed the documented process).

## Memory outcome

- `project_money_wrapper_cleanup_future_cycle.md`: "unscheduled backlog" → MERGED 2026-10-01 (`7f3376d`), with what was done, decisions, accepted follow-ups and lessons.
- `project_money_parse_x100_bug.md` and `project_project_currency_change_control_cycle.md`: "wrapper cleanup still open" → DONE 2026-10-01.
- `project_manual_test_findings_money_cleanup.md`: new, nine items from the manual test (open backlog, no cycle briefed); its status line updated after the merge.
- `MEMORY.md`: wrapper-cleanup line rewritten as MERGED, centralization line pointed at it.
- Unverified: none.
