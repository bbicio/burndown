# Finish-cycle report — save-c1-foundations

**Date:** 2026-11-17
**Branch:** save-c1-foundations → main
**Execution started:** 2026-11-17 22:44  (pre-flight step 6)
**Merged at:** 2026-11-17 23:36  (Gate 4's merge commit)
**Gate durations:** Gate 1 14m · Gate 2 17m · Gate 3 20m · Gate 4 3m · Gate 5 (to report) 3m — total 57m
**Cycle counters:** subagent dispatches 4 · review rounds 2 · full test-suite runs 5
**Gate 5 tests:** docs-only → `npx vitest run scripts/ js/lib/test-cases-parse.test.js` ×1 (green on first run)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-17-save-c1-foundations.md`) · review effort high
**Claims pre-check:** Gate 1 step 0 took about 2 minutes over the branch's eight changed `.md` files and caught 2 defects, both false predicates in this branch's own docs ("each success leaves one `change_log` row", false for a role delete that also bumps rate cards; the Roles Reload narrative missing the 404 path added by the plan's final fix pass), fixed in `1e0a5e1`; the Gate 3 re-check over round 1's `.md` fixes took about 2 minutes and caught nothing; of round 1's 9 findings, none was mechanical.
**Security review:** ran — `security-scope` review, triggered by `api/src/routes/config.js`, `api/src/services/*`, migration `037`, `js/api.js`, `js/lib/save.js` and the pages · 0 findings at confidence ≥ 8 (one pre-existing weakness noted: a malformed `:id` on the role/rate card routes answers 500)
**Acceptance:** 13 criteria from the Spec plus TEST_CASES CF-18 and CF-18b · 11 pre-ticked from automated runs green at `1e0a5e1` (1: `scripts/run-tests.sh` backend units 623/623; 2-6: `scripts/run-tests.sh` SC-01..SC-14 1097/1097; 7, 9, 10, 11: `npm test` 3438/3438; 12: both suites) · 13 (Backlog re-read) done at Gate 5 step 2b (no open row closed) · 3 manual items verified by hand on the branch stack with a positive outcome (role from two tabs = CF-18b, rate card from two tabs = CF-18, server answer adopted + delete of a new role); the third was first answered "fix now" — investigated: the user had edited an existing role used in 13 cost-grid task rows, whose delete is refused by design; re-checked on a new role and verified
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

10 commits, plan executed natively (`superpowers:executing-plans`) in the worktree `.claude/worktrees/save-c1-foundations`:

- `d85d933` feat(api): versioned write helper, entity registry and change_log migration
- `778a052` feat(api): roles and rate cards write through versionedWrite, STALE replaces RATECARD_STALE
- `f07bcbb` feat(js): apiSave with one outcome per write; apiFetch tags non-JSON, timeout and network errors
- `a800d66` feat(master-roles): save and delete through apiSave, Reload on conflict, server row adopted
- `6f4e049` feat(master-clients): rate card through apiSave, rows rebuilt from the server card; drop orphaned Api writes
- `6e44b3a` test: save-contract guard with exempt and retired lists
- `c467e6e` docs: save contract section and per-file detail
- `8e6b585` fix(master-roles): a role deleted elsewhere (404) offers Reload in the panel and the delete dialog (plan final review)
- `1e0a5e1` docs: claims pre-check fixes (one change_log row per entity, Reload on 404)
- `6406434` fix: Gate 3 round 1 (save contract) - lock strength, 5xx unknown, rate card locked while saving, safe Reload

Executor rulings (from the plan's ledger): RED of `run-tests.sh` skipped per PROCESS.md §6.2 (one run at the green step); a bare-array entries body reaches the version check (409 STALE); "Nothing to update" moved inside the write; a static test that no route reads `change_log`; the delete dialog shows the server's STALE message; Reload after a lost POST closes the panel; the guard reads nested `Api` namespaces and a namespace handed over whole; three pre-existing orphan write methods deleted (`programs.update`, `programs.delete`, `costGrids.versions.linkedProjects.remove`); `ARCHITECTURE.md`/`TEST_CASES.md` updated outside the plan's file list; the `claude-md-guard` File structure pin raised to 14,998 B.

## Gate outcomes

- Gate 1: claims pre-check fixed 2 defects (`1e0a5e1`); passed — `npm test` 3438/3438, `scripts/run-tests.sh` 1097/1097 + backend units 623/623; dependency audit none (`audit: none`).
- Gate 2: ordinary cycle; branch stack spun up, migration 037 applied to it by hand; acceptance: 11 automated, 3 manual verified (one after a "fix now" that turned out to be a by-design refusal); browser question answered yes; branch stack torn down.
- Gate 3: round 1 = background `/code-review` high (9 findings) + `/security-review` (0); rule "Critical/Important now, Minor as follow-up": 4 Important fixed in `6406434` (each RED→GREEN), 5 Minor to follow-up; 0 to specs/plans, 0 to pre-existing prose; round 2 scoped to `1e0a5e1..6406434`: no findings; backend re-run `scripts/run-tests.sh` 1097/1097 + 624/624.
- Gate 4: merged `--no-ff` (merge commit `d1b6722`, main had not diverged), pushed; backup `backups/pdash-backup-2026-11-17-233631.dump`; migration 037 applied to `pdash-db`; `pdash-api` restarted and healthy at 2026-11-17T22:37:50Z; worktree removed, branch deleted.
- Gate 5: sync-docs touched 3 files (`docs/prd/master-data.md`, `handbook/public/manual.md`, `handbook/restricted/production-checklist.md`); `docs/BACKLOG.md` B-527..B-534 added.

## Code review follow-ups

- Round 1 — a 404 from the rate card entries save (and a failed auto-create) has no Reload (`js/pages/master-clients.js`) → B-527.
- Round 1 — `isPool()` mistakes a connected plain `pg.Client` for a pool (`api/src/services/versioned-write.js` line 23) → B-528.
- Round 1 — role delete runs one `versionedWrite` per rate card (`api/src/routes/config.js` line 327) → B-529.
- Round 1 — `badRequest`/`answerRefusal` local to `config.js` (line 229) → B-530.
- Round 1 — bare-array / string-version handling of the entries `PATCH` (`api/src/routes/config.js` line 429) → B-531.
- Plan final review (deferred minors, carried) — card set read before the role lock in `DELETE /roles/:id` → B-532; Delete stays enabled after a STALE → B-533; `res.text()` failure untagged → B-534.

## Roadmap notes

- **Deliberate deviation from the frozen Spec §5.2:** `apiSave` maps **any** 5xx to `unknown` (Gate 3 round 1 #4, user's rule); the Spec's table put a JSON 5xx under `error`. `docs/js/lib.md` documents the shipped behaviour; the Spec is not edited (PROCESS.md §1).
- Out-of-range observations from round 2 (not caused by this branch, possible contract gaps for later cycles): `DELETE /api/clients/:id` sets `ratecards.client_id` to NULL through the FK with no version bump or `change_log` row — the guard cannot see FK side effects; `GET /api/ratecards` repeats the SQL `ratecardSnapshot` now owns; `DELETE /roles/:id` could lock its cards `FOR NO KEY UPDATE` instead of `FOR UPDATE`.
- Pre-existing, found by Gate 1's enumeration check: `scripts/password-policy-guard.test.js` has no entry in `CLAUDE.md`'s File structure block (it is cited only in "Passwords").
- The session ran on Opus 5.5 while the user had asked for Sonnet; flagged at the start, execution continued.

## Sync-docs outcome

Scope pass (merge `d1b6722`, 45 files): 1 ARCHITECTURE.md — no (§5/§6, schema and routes already updated on the branch; no module list to extend); 2 CLAUDE.md — no (Save contract section and index lines on the branch); 3 TEST_CASES.md — no (CF-18, CF-18b on the branch); 4 test-api.js — no (SC-01..SC-14 on the branch); 5 PRD — yes; 5c handbook — yes; 6 PROCESS.md — no; 7 memory — yes.

- `docs/prd/master-data.md`: §7.2 rate card conflict message updated to the new text with Reload and the lost-answer case; §7.6 Roles gains the conflict/deleted-role Reload and "the list shows the values the server stored".
- `handbook/public/manual.md`: Clients and groups (rate card conflict + Reload, fields read-only while saving) and Roles and rates (conflict/deleted role + Reload).
- `handbook/restricted/production-checklist.md`: migrations check also expects `change_log` and `roles.version`.
- PRD evaluated: updated (`docs/prd/master-data.md`). PROCESS.md gate: none of the three conditions applies.

## Memory outcome

- `project_save_contract_series.md`: description "…next step audit-to-brief" → "…c1 (foundations + roles/ratecard pilot) MERGED 2026-11-17 (`d1b6722`, migration 037 applied); next c2 costgrid Save-only"; "Next: /brainstorming on c1." → a c1 MERGED bullet (merge, report path, what shipped, the 5xx deviation, the three deleted orphan methods, next c2).
- `MEMORY.md`: the Save-contract series line "…next: audit-to-brief" → "…7 briefs; c1 … MERGED 2026-11-17 (`d1b6722`, migration 037 applied); next: c2 costgrid Save-only".
