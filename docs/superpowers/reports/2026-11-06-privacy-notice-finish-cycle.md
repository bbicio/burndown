# Finish-cycle report — privacy-notice

**Date:** 2026-11-06
**Branch:** privacy-notice → main
**Execution started:** 12:31  (pre-flight step 6; plan execution itself began earlier in the same session, not timed)
**Merged at:** 14:26  (Gate 4's merge commit `7bd3c95`)
**Gate durations:** Gate 1 1m · Gate 2 22m · Gate 3 91m · Gate 4 1m · Gate 5 (to report) 4m — total 119m
**Cycle counters:** subagent dispatches 3 · review rounds 3 · full test-suite runs 4
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-06-privacy-notice.md`: `js/nav.js` is a shared file loaded by every page) · review effort high
**Claims pre-check:** Gate 1 step 0 took about 1 minute and caught 2 defects (a stale element id in `docs/js/nav.md`, a dead link to `docs/pages/settings.md` in `docs/api/exports.md`). The Gate 3 re-checks over the round fixes took about 1 minute per round and caught 0 further defects. Round 1 of the review returned 4 findings, 1 of them in the mechanical classes (a false predicate: the page doc still gave the pre-fix `apiFetch` URL); rounds 2 and 3 returned 2 and 3 findings, all stale present-tense text of the same kind (account-menu lists, a "future settings go here" sentence, a section title).
**Acceptance:** 11 criteria and 5 `TEST_CASES.md` cases listed. Pre-ticked from an automated run (`npm test` at HEAD, 102 files / 2561 tests): criteria 1 (`js/lib/nav-model.test.js`), 5 and 9 (`js/lib/privacy-notice-guard.test.js`) and 11. Verified by hand with a positive outcome on the branch stack: criteria 2, 3, 4, 6, 7, 8, 10 and cases N-02, N-03, N-12, PN-01, PN-02. Not verifiable here: none.

## What was done

9 commits on the branch:
- `443508c` feat(nav): account menu entry Settings → Privacy Notice (`#nav-privacy-btn`, `terms` icon, `nav.js?v=22` in every page)
- `a03a5ef` feat(privacy-notice): read-only Terms page replaces the empty Settings page (`settings.html` deleted, no redirect; new guard test)
- `97668c1` docs: Privacy Notice replaces the Settings page in the live docs
- `5034215` fix(privacy-notice): `apiFetch` already prepends `/api` — the page called `/api/api/…` and always showed the load error
- `acfc955` docs: claims pre-check — stale nav id and settings.md link
- `add8719` fix(privacy-notice): review round 1 — wide HTML contained, stale comment, doc leftovers
- `c41620d` fix(privacy-notice): review round 2 — stale account-menu lists in PRD and the operational-manual skill
- `2c2cce8` fix(privacy-notice): review round 3 — false "future settings go here" sentence dropped
- `93600a7` docs: restore blank line before the Header unification heading

Spec `docs/superpowers/specs/2026-11-06-privacy-notice-design.md`, Plan `docs/superpowers/plans/2026-11-06-privacy-notice.md`, Brief `docs/superpowers/briefs/2026-11-06-privacy-notice-brief.md`.

## Gate outcomes

- Gate 1: passed (`npm test`, 102 files / 2561 tests); no path under `api/`, so no backend suite. Claims pre-check fixed 2 defects.
- Gate 2: ordinary cycle; stack reused on the user's answer; every manual item ticked; browser question answered yes; branch stack torn down afterwards.
- Gate 3: three rounds at effort high, no finding on the code in any round; 4 + 2 + 3 Minor text findings, 7 fixed, 2 accepted as follow-up (user chose option (b) at the 3-round stop).
- Gate 4: merged (`--no-ff`, main had not advanced), pushed; no migration, no `api/` change, so no DB backup and no restart; worktree removed with `--force` (it held only ignored files: `.env`, `node_modules`, the SDD ledger, which was copied out first) and the local branch deleted.
- Gate 5: sync-docs routed almost everything onto the branch itself; this gate adds `docs/BACKLOG.md` rows B-361 and B-362 and this report.

## Code review follow-ups

- Round 3, #2 (B-361): `docs/OPERATIONAL_MANUAL.html` line 177 still has the chapter "8 · Settings"; regenerate it with the operational-manual skill after the PRD reconciliation audit. Verify: `grep -n "8 · Settings" docs/OPERATIONAL_MANUAL.html`.
- Round 3, #3 (B-362): PRD section 9 is still titled "Settings" (`docs/prd/notifications.md` lines 1, 3, 5, `PRD.md` line 22, the sync-docs routing table, the operational-manual reference). Verify: `grep -n "^## 9. Settings" docs/prd/notifications.md`.

## Roadmap notes

- **Plan error found at the visual check, not by a test:** the plan said `apiFetch('/api/app-settings/terms')`; `apiFetch` already prepends `API_BASE`. The first guard test matched the wrong string and passed. The guard now pins the correct path and forbids `apiFetch('/api/`. Worth remembering for any future page that reads the API through `apiFetch`.
- The plan listed a `GONE` entry for `settings.html` in `scripts/doc-paths-guard.test.js`; it was not needed (the guard cannot see a root-level path) and was not added.
- Edits to the SDD/skill scripts did not run on this host (no `task-start`/`task-done`): the ledger was kept by hand.
- Gate 2/3 reviews were run by read-only background subagents (the harness's `/code-review` skill was not invoked inside them); each ran the covering vitest files itself.
- A `node` helper used for doc edits mangled the first line of two files once (an unescaped `|` in a regex built from a string); caught by the diff stat, both files were restored from git and redone with a literal-match helper.
- `docs/superpowers/design/2026-11-06-admin-brief.md` is untracked in the main checkout and is not part of this cycle; left alone.

## Sync-docs outcome

Scope pass over `git diff --stat 7bd3c95^1 7bd3c95` (34 files): ARCHITECTURE.md — no (tree entry already updated on the branch; §5/§6 unaffected, no `api/` change); CLAUDE.md — no further edit (Pages row and the two prose references already updated on the branch); TEST_CASES.md — no further edit (N-02, N-03, N-12 updated, PN-01 and PN-02 added on the branch); test-api.js — no (no endpoint or auth change); PRD — evaluated, updated on the branch in `docs/prd/notifications.md` (§9) and `PRD.md` (§3 account-menu list); 5b — updated on the branch in `.claude/skills/operational-manual/SKILL.md` (triggering area file: `docs/prd/notifications.md`); PROCESS.md gate — none of the three conditions applies. Files updated by this gate: `docs/BACKLOG.md` (rows B-361, B-362).

## Memory outcome

- `project_next_cycle_ui_defects_consistency.md` line 15: "Settings now opens a blank `settings.html` — future settings go there" → "opened a blank `settings.html` — superseded 2026-11-06 (merge `7bd3c95`): page deleted, menu entry is now Privacy Notice → `privacy-notice.html`, no Settings page any more".
- `MEMORY.md` line for that file: "`settings.html` is a blank title-only page" → "was a blank title-only page — replaced 2026-11-06 (`7bd3c95`) by the read-only Privacy Notice page".
- Unverified, left as is: `project_ui_redesign_cycles.md`'s list of merged cycles does not mention this cycle (it is a feature change, not a page-by-page redesign cycle).
