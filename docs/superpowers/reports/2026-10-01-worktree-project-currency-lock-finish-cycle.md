# Finish-cycle report — worktree-project-currency-lock

**Date:** 2026-10-01
**Branch:** worktree-project-currency-lock → main (merge commit `390c1a3`, pushed; `pdash-api` restarted and healthy; local branch and worktree removed)

## What was done

Scenario 2 (evolution). Raised by the user's manual tests of the money cycle: project-config's Currency menu had no control, and changing the currency of a proposal already linked to a project was not reflected in the project (so reporting labelled amounts with the project's currency and converted them with the version's rate). Brief → brainstorming (architectural path) → spec → plan → inline execution → `/finish-cycle`. Spec: `docs/superpowers/specs/2026-10-01-project-currency-lock-design.md`; plan: `docs/superpowers/plans/2026-10-01-project-currency-lock.md`.

A project generated from a proposal keeps the proposal's currency and neither side can change it afterwards. Enforced on the API for everyone except a sysadmin (live DB role): creating a project without a proposal, any project currency change, clearing/re-pointing `cgVersionId`, deleting a project, unlinking it, deleting a version/proposal that has projects and changing a version's currency while it has projects are refused with `400 { error, code: 'PROJECT_RULE' }`; a new link needs an existing version of the same currency. UI: costgrid's Currency menu locks when a project is linked, project-config's menu is read-only (editable only on a brand-new project), `＋ New project` is disabled and `project-config.html` without `projectId` redirects to the portfolio. Exchange-rate/conversion logic for projects without a proposal is deferred; project deletion/unlinking gets its own later cycle.

15 commits (20 files, +1703/−51, no migration):

- `95c69e9` docs: design spec for project currency lock
- `26c9f68` docs: spec wording fix (generate-project fallback)
- `20fe2d1` docs: spec - drop the link-time currency check (user decision; reversed at the review, see below)
- `8a172dc` docs: implementation plan for project currency lock
- `6b3147f` docs: plan/spec wording fixes
- `14d7b3f` feat: add project currency/link/removal rules (server, pure)
- `8a89c61` test: integration tests for the project currency lock; project setup/cleanup as sysadmin
- `c46b983` feat: enforce the project currency lock and the temporary creation/removal ban on the API
- `09a5803` docs: seed-planning-golden needs a sysadmin account now
- `aaddd4a` feat: add the browser side of the project rules (version currency lock, messages, flag)
- `7bcd22f` feat: lock the currency menus and switch off direct project creation in the UI
- `d86ea80` fix: costgrid currency lock recomputes right after Generate project (depend on the reactive cg) (found by me in the browser)
- `9233573` fix: code review round 1 - link-time currency check, unknown version refused, rule refusals not retried as create
- `fbf50cf` fix: code review round 2 - per-version lock for currency change vs linking, defensive 404, concurrency smoke test
- `8cfaded` fix: code review round 3 - project-config currency menu is editable on a brand-new project only

Tests at merge: vitest 351/351, `node:test` project-rules 9/9, backend isolated suite (`scripts/run-tests.sh`) 503/503 (new `PR-01..PR-14`). Manual verification by the user on a branch stack ("tutto ok"), plus mine in the browser (API refusals on cloned real data, costgrid lock alone on a SIP version with projects, project-config read-only, portfolio button and redirect).

Decisions of the user worth keeping: the lock covers the Currency menu only (the rest of the proposal stays editable); project-config's menu is read-only for ALL projects until the conversion cycle; creation and removal inhibited on the API too, sysadmin exempt (a UI-only lock can be bypassed by stale tabs: `_pushProjectToApiDetailed` re-sends the whole project); `400` for rule refusals; "linked" = a `cg_version_projects` row or a `projects.cg_version_id`; no data realignment (real data was clean: 15 projects all linked, 0 divergences, all EUR); messages approved.

## Code review follow-ups

Gate 3: three rounds, all with findings, **all fixed** at the user's request (6 findings, none high); at the 3-round cap the user chose to accept and merge (option b).

- Round 1 (3): `POST /api/projects` with a `cgVersionId` had no version-existence or same-currency check; `PATCH` linking null → version had no currency check (both the link-time rule the user had first excluded from the spec; added back, decision 9 reversed); `js/api-sync.js` retried a refused `PATCH` as a `POST` (duplicate-key error hiding the rule's message). Fixed (round 1 commit): `linkCurrencyError`, `Proposal version not found`, `code: 'PROJECT_RULE'` and no retry.
- Round 2 (2, low): `POST …/linked-projects` did not check that the version exists (unreachable thanks to `versionScope`, guarded anyway); the version-currency check and its write were not atomic against a concurrent link. Fixed: per-version advisory lock (`api/src/lib/version-lock.js`) and `PR-14`, a concurrency smoke test (it cannot be shown red: the race is not reproducible on demand).
- Round 3 (1, low): project-config's Currency menu was hard-disabled even for a brand-new project (matters only when direct creation is re-enabled). Fixed: editable only when `isNewProject`.

None remain open.

## Roadmap notes

- **Conversion / exchange-rate handling for projects without a proposal** (deferred by the user): needs a rate on `projects` (new column and migration) and reporting changes (reporting reads the rate only from the linked version snapshot). `portfolio.html` program-level totals still sum amounts of different currencies as raw numbers (shown in EUR when mixed). Re-enabling direct project creation (flags `DIRECT_PROJECT_CREATION_ENABLED` in `api/src/lib/project-rules.js` and `js/lib/project-rules.js`) belongs with it.
- **Project deletion / unlinking** gets its own cycle with a fresh analysis: there is no live UI (`cgDeleteLinkedProject` and `_deleteProjectFromApi` are dead code, an earlier note of mine saying otherwise was wrong and corrected); the API routes are refused for non-sysadmin now (`PROJECT_REMOVAL_ENABLED`).
- **Found while working:** a Vue computed that depended on a computed staying `false` did not recompute after "Generate project" (raw array push invisible to Vue); only a browser simulation of the generation showed it, now pinned by a guard assertion. The `.html` pages are not versioned and the browser caches them (already noted in `CLAUDE.md`). `scripts/backup-db.sh` must be run from the main checkout, not from a worktree (this time it was, after `ExitWorktree`).
- **Process notes:** the worktree-isolation hook refused compound shell commands, so the plan's `sdd-*` helper scripts could not run and the ledger was kept by hand; no subagent final review was dispatched by me (session rule), the independent review was Gate 3.

## Sync-docs outcome

Updated: `CLAUDE.md` (file-structure entries for `js/lib/`, `api/src/lib/`, `middleware/auth.js`; new cross-cutting section "Project currency lock (2026-10)"), `ARCHITECTURE.md` (js/lib, api/src/lib, middleware entries), `docs/api/lib.md` (new `project-rules.js, version-lock.js` section), `docs/js/lib.md` (new `project-rules.js` section), `docs/js/api-sync.md`, `docs/pages/{costgrid,project-config,portfolio}.md` (dated notes), `TEST_CASES.md` + `test-cases.html` (PC-10, MN-05, MN-07, HD-02 updated; new section PL-01..PL-09, mirrored exactly), `PRD.md` (portfolio `＋ New project`, project-config Currency row, cost-grid Currency line), `.claude/skills/operational-manual/SKILL.md` (inlined reference mirrors the PRD change). Not updated: `test-api.js` (already extended by the cycle itself: `PR-01..PR-14`); `docs/superpowers/PROCESS.md` — PROCESS gate: none of the three conditions applied (the cycle executed the documented process; no skill, recurring exception or skeleton change).

PRD.md: evaluated and updated (user-visible: disabled New project, read-only/locked Currency menus).

## Memory outcome

- `project_project_currency_change_control_cycle.md`: "next cycle candidate / STATUS implemented, next step /finish-cycle" → "MERGED 2026-10-01 (`390c1a3`), what it did, decisions kept, what is still open, lessons" (rewritten: the stale scope history was removed).
- `project_project_deletion_cycle.md`: added "STATUS: the inhibition part is DONE (`390c1a3`, flag `PROJECT_REMOVAL_ENABLED`); what is left is the cycle's real analysis".
- `MEMORY.md`: the two lines above rewritten, and the Team UX backlog line updated (currency lock done; next candidates restated).
- Unverified: none.
