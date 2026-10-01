# Finish-cycle report — worktree-money-centralization

**Date:** 2026-10-01
**Branch:** worktree-money-centralization → main (merge commit `f963069`, pushed; `pdash-api` restarted and healthy; local branch and worktree removed)

## What was done

Scenario 2 (evolution). Started as the x100 money-input bug found in the hardening cycle's Gate 2 (`project-config.html` phasing/PTC: focus showed `350.28`, the de-DE blur parse read it as 35.028 → stored x100; costgrid per-task PTC truncated `150,75` to 150) and grew, by user decision, into centralizing all currency formatting/parsing in one locale-driven module. Brief → brainstorming (architectural path) → spec → plan → inline execution → `/finish-cycle`. Spec: `docs/superpowers/specs/2026-10-01-money-centralization-design.md`; plan: `docs/superpowers/plans/2026-10-01-money-centralization.md`.

14 commits (31 files, +1867/−115, no migration):

- `c0bac11` docs: design spec for money centralization
- `9868c9b` docs: implementation plan for money centralization, spec touch-ups
- `69d54cc` test: characterize current money formatters before centralization
- `8ff4976` feat: add locale-driven money module (format, input text, strict parse)
- `322dfba` feat: add server-side money formatter twin
- `b381c41` refactor: route fmtMoney, cgFmtCurrency, pbFmtMoney and config copies through money.js
- `45ce774` refactor: project currency is an ISO code in memory; load active currencies on money pages
- `bf820a3` fix: money inputs show and read the same locale format (no more x100 on focus/blur)
- `978d0af` refactor: move remaining hardcoded amount formatting to money.js
- `60e1975` fix: pipeline-change notification formats the amount with the currency locale
- `bb77283` test: money guard tests; bump ?v=N of every modified script
- `5caf9b7` fix: amounts always show the thousands separator of the currency locale (user request during Gate 2)
- `ee21dfd` fix: portfolio list view formats each project's amounts in its own currency (user report during Gate 2)
- `ffb8495` fix: costgrid currency-change confirm no longer throws (restore the rate lookup lost in the money refactor) (user report during Gate 2)

Tests at merge: vitest 337/337, `node:test` money-format 6/6, backend isolated stack (`scripts/run-tests.sh`) 456/456. Manual verification by the user on a branch stack (cases A–F of the cycle's list: x100 bug, USD/CHF/JPY, costgrid, display on other pages, notification), plus mine in the browser with EUR/USD/CHF/JPY projects and a CHF cost grid.

Decisions of the user worth keeping: ISO codes everywhere in memory (symbols only for display); decimals follow the currency (JPY none); parse strict per locale; CHF stays `de-CH` (`CHF 1'234.50`); thousands always separated (`€ 1.234,50`); wrappers kept for now (removal = a later cycle).

## Code review follow-ups

Gate 3, round 1 (`/code-review` medium): 3 findings, all accepted as follow-up by the user (no fix round).

- Round 1 — medium — `js/lib/money.js` `parseMoney`: strict locale parse means typing/pasting `1234.56` in an it-IT euro field is read as 123456; costgrid's per-task PTC saves on every keystroke so it is silent until blur reformats. It is the strict-parse design the user chose (spec "Risks"); possible mitigation: warn when the other convention is typed.
- Round 1 — low — `js/lib/portfolio-calc.js` `commonCurrency`: for a program with mixed currencies the totals are raw sums labelled EUR (neither converted nor in one currency). Belongs to the currency-conversion / project-currency cycle.
- Round 1 — low — `js/api-sync.js` save: the symbol→ISO normalisation was removed, so a project still carrying a symbol would fail the `currencies` FK; no source of symbols remains in the code.

## Roadmap notes

- **Project currency change control (next-cycle candidate, spec to be written after this one):** lock the currency field of project-config for projects generated from a proposal; implement exchange-rate handling for projects created directly in project-config (today `projects` has no rate, project-config has no rate logic, and reporting reads the rate only from the linked version snapshot, falling back to 1.0 — verified); and a currency change on a proposal already linked to a project is not reflected in the project (project `currency` is independent of the version's; verified on the stack: version in CHF @0.95, linked project still EUR, so config.html's Project Phasing showed € amounts and ignored the rate). The user wants these rules reviewed together. Also the mixed-currency program totals in `portfolio.html` (above).
- **Wrapper cleanup:** replace the one-line wrappers (`fmtMoney`, `cgFmtCurrency`, `pbFmtMoney`, two copies in `config.html`) with direct `formatMoney` calls (Approach 2 of the brainstorming); mechanical, behaviour already covered by tests.
- **Found during the cycle:** `*.html` pages are not versioned, so the browser kept a cached `portfolio.html` with old script tags and needed a hard reload (pre-existing; noted in `CLAUDE.md`'s Cache-busting section). `scripts/backup-db.sh` run from a worktree wrote `backups/` inside the worktree (copied by hand to the main repo's `backups/` before the worktree was removed): run it from the main checkout. Cosmetic, untouched: costgrid role-rate badges show the raw number (`150.5 CHF/h`) without locale format.
- **Process note:** my Task 7 deleted `newEntry` from costgrid's `onCurrencyChange` while the confirm handler still read it (the plan said to grep before deleting; I did not follow it to the end of the function); found by the user in the manual gate and fixed with a regression test (`js/lib/costgrid-currency-change.test.js`), plus a scan of every removed declaration in the diff.
- Test notes: the worktree-isolation hook refused compound shell commands, so the plan's `sdd-*` helper scripts could not run and the ledger was kept by hand; no impact on the result.

## Sync-docs outcome

Updated: `CLAUDE.md` (file-structure entries for `core.js`, `js/lib/`, `api/src/lib/`; new cross-cutting section "Money formatting and parsing (2026-10)"; HTML-cache note in Cache-busting), `ARCHITECTURE.md` (js/lib, api/src/lib, core.js entries), `docs/js/lib.md` (new `money.js` section, `portfolio-calc.js` `commonCurrency`, `pipeline-calc.js` `pbFmtMoney`), `docs/api/lib.md` (new `money-format.js` section), `docs/js/core.md`, `docs/js/api-sync.md`, `docs/js/costgrid.md`, `docs/pages/{project-config,costgrid,portfolio,pipeline,config}.md` (dated notes), `TEST_CASES.md` + `test-cases.html` (PC-10 changed; new section MN-01..MN-09, mirrored exactly), `PRD.md` (project Currency field, cost-grid currency line, new "Number format" paragraph in §7.7), `.claude/skills/operational-manual/SKILL.md` (inlined reference mirrors the PRD change). Not updated: `test-api.js` (no endpoint or auth change); `docs/superpowers/PROCESS.md` — PROCESS gate: none of the three conditions applied (the cycle executed the documented process; no skill, recurring exception or skeleton change).

PRD.md: evaluated and updated (user-visible: dynamic currency menu, amount format, money-field behaviour).

## Memory outcome

- `project_money_parse_x100_bug.md`: "IN BRAINSTORMING / STATUS written, NEXT STEP /finish-cycle" → "MERGED 2026-10-01 (`f963069`), report path, decisions kept, accepted follow-ups, lessons"; the obsolete "still to design" paragraph removed.
- `project_money_wrapper_cleanup_future_cycle.md`: added "Status 2026-10-01: money cycle merged, wrappers exist, cleanup unscheduled".
- `project_project_currency_change_control_cycle.md`: "start once the money cycle is merged" → "money cycle MERGED, can start now: /feature-brief" (the proposal-currency-not-reflected point and the mixed-currency program totals were already added during the cycle).
- `MEMORY.md`: lines for the three files above and the Team UX backlog line ("money ×100" candidate → done) rewritten.
- Unverified: none.
