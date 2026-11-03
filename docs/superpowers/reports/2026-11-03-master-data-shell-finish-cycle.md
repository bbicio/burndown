# Finish-cycle report — master-data-shell

**Date:** 2026-11-03
**Branch:** master-data-shell → main
**Execution started:** 2026-11-03 21:22  (pre-flight step 6)
**Merged at:** 2026-11-03 22:32  (Gate 4's merge commit)
**Gate durations:** Gate 1 3m · Gate 2 52m · Gate 3 14m · Gate 4 2m · Gate 5 (to report) 4m — total 75m
**Cycle counters:** subagent dispatches unknown (this session: 3, one per review round) · review rounds 3 · full test-suite runs unknown (this session: 1, Gate 1's `npm test`)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-03-master-data-shell.md`) · review effort high
**Claims pre-check:** Gate 1 step 0 took about 3 minutes over the branch's `TEST_CASES.md` and `docs/pages/config.md` lines and caught nothing (predicates, CSS values, breadcrumb, guard sets and board paths all held; no SHA cited); the Gate 3 re-checks over the round-1 and round-2 `*.md` fixes took about a minute each and caught nothing (round 2's "pinned by `master-data-guard.test.js`" claim was grepped and holds); none of round 1's 9 findings fell in the four mechanical classes.
**Acceptance:** 14 items listed (9 Spec criteria + `TEST_CASES.md` CN-01, MD-02, MD-07, MD-13, PH-01) · 5 pre-ticked from `npm test` 2208/2208 at `17ca1c5`: criteria 1, 2, 3, 9 (`js/lib/page-head-guard.test.js`, `js/lib/master-data-guard.test.js`, `js/lib/md-subnav.test.js`) and PH-01 (`page-head-guard`) · 9 verified by hand on the branch stack with a positive outcome (criteria 4-8, CN-01, MD-02, MD-07, MD-13) · none left as not verifiable. The round-1 fixes (Client Groups cross-links, `md-table-card`) and round-2 fixes (32px lock) landed after that verification and were not re-checked in a browser.

## What was done

8 commits:
- `4208817` feat(master-data): shared grouped sub-nav module
- `b528319` feat(master-data): shell styles for sub-nav, tabs, phone selector and content card
- `8516eba` feat(master-data): five pages in the shared shell (page head, generated sub-nav, content card)
- `630bd10` test(master-data): re-pin the Master Data inline-style hash after the shell dropped the old page-header rules
- `d6fc53a` fix(master-data): no double inset in the card, table cards flat and flush, no divider above the tablet tabs
- `17ca1c5` docs(master-data): shell notes, accepted deviations and manual test case
- `2442971` fix(master-data): review round 1 — Client Groups reachable from the Clients card and back, phone selector reset on pageshow, versioned icons import, explicit md-table-card; style.css v31, md-subnav v2
- `1cee3c8` fix(master-data): review round 2 — null-safe single pageshow reset, guard pins the icons.js import version, 32px access-denied lock, measurements out of the config.md prose; md-subnav v3

## Gate outcomes

- Gate 1: passed — claims pre-check clean, `npm test` 2208/2208; no `api/` path, so no `scripts/run-tests.sh`.
- Gate 2: ordinary path; branch stack on :8081 reused as the user had stated; acceptance checklist all positive; browser question answered yes; branch stack torn down.
- Gate 3: 3 rounds at high. Round 1 (background, launched at Gate 2): 9 findings, 5 fixed, 4 to follow-up. Round 2: 7 findings — 1 by the pre-existing-prose rule (stale lines of `docs/pages/config.md`, then fixed by `/sync-docs` instead of a BACKLOG row), 4 fixed, 2 to follow-up. Round 3: 1 low finding, to follow-up; that round's reviewer reported its `/code-review` call had not returned and reviewed the fix commits by hand. 0 findings took the frozen-spec/plan rule.
- Gate 4: merged with `--no-ff` (`1be7c35`, main had not diverged) and pushed; no DB backup, migration or `pdash-api` restart (no `api/` path); worktree removed after the SDD ledger was read; branch deleted.
- Gate 5: `/sync-docs` touched 4 repo files and the memory; 7 BACKLOG rows added (B-263…B-269).

## Code review follow-ups

- Round 1 — the empty static `<nav class="md-subnav">` can flash as a bordered box before the module fills it — `master-clients.html` line 66 (all five pages) → B-263
- Round 1 — `escHtml` duplicates `esc()` / `escapeHtml` — `js/lib/md-subnav.js` line 19 → B-264
- Round 1 — dead CSS `.md-card { align-self }` and the repeated desktop `.md-subnav-select { display: none; }` — `css/style.css` lines 150, 177 → B-265
- Round 1 — `.md-subnav-select-group` duplicates `.md-subnav-group` — `css/style.css` line 208 → B-266
- Round 2 — on Client Groups "Clients & groups" carries `aria-current="page"` and is pre-selected in the phone select — `master-client-groups.html` line 66 → B-267
- Round 2 — the breadcrumb's "Master Data" reloads `master-clients.html` on itself — `master-clients.html` line 267 → B-268
- Round 3 — the "does not stack listeners" test never counts listeners — `js/lib/md-subnav.test.js` line 105 → B-269

## Roadmap notes

- Out of the Plan's declared files: `js/lib/content-surface-guard.test.js`, `js/lib/nav-shell-guard.test.js`, `js/lib/test-cases-parse.test.js` — version, hash and count pins that follow the plan's own edits; each recorded as a Ruling in the SDD ledger.
- After the merge the round-3 reviewer's `/code-review` run finished late and added two low items that no gate decided on, neither tracked: (1) a page whose `data-md-active` matches no section shows a blank phone row, and picking the first option does nothing on first load (`js/lib/md-subnav.js` line 32; reachable only with a wrong id); (2) the new `.md-*` rules use literal px font sizes and radii (12.5px, 15px, 10px…) rather than `--text-*`/`--radius-*` tokens, while the guard checks only hex colours. Task: decide whether to track them.
- The CLAUDE.md Pages row for Master Data still lists Client Groups among pages "linked by a lateral sub-menu"; left as is, since the page's purpose did not change and the row is only a summary (Client Groups is now reached through the Clients card).
- The SDD ledger recorded 5 Rulings (two pin bumps, the jsdom serialisation, the card's closing position, the `page-header` substring guard) and the user's D1-D5 board decisions (D1/D2/D3/D5 fixed, D4 accepted).

## Sync-docs outcome

Scope pass (`git diff --stat 1be7c35^1 1be7c35`: 29 files):
1. ARCHITECTURE.md — no: §5/§6 unaffected; the Master Data tree line ("sharing a lateral sub-menu (.md-subnav)") is still accurate, and `js/lib/` is indexed by pointer to `docs/js/lib.md`.
2. CLAUDE.md — no: no file-structure entry changed (`js/lib/` is one pointer line), page purpose unchanged.
3. TEST_CASES.md — no: updated on the branch (CN-01, MD-02, MD-07, MD-13, PH-01).
4. test-api.js — no: no API change.
5. PRD — yes: `docs/prd/master-data.md` intro updated (shared head, breadcrumb, card, grouped sub-menu per layout, Client Groups cross-links). `PRD.md` §3 untouched (no page added or removed).
5b. Operational-manual reference — yes: the Master Data bullet in `.claude/skills/operational-manual/SKILL.md` updated, triggered by `docs/prd/master-data.md`.
6. PROCESS.md — no: none of the three conditions applies.
7. Memory — yes (see below).

Also updated: `docs/js/lib.md` (new `md-subnav.js` entry) and `docs/pages/config.md` (stale lines from the 2026-10-05 split fixed: breadcrumb now names the section, the `?v=21`/`?v=17` Versions line deleted, the "breadcrumb does not name the current page" leftover deleted, the guard's description rewritten).

## Memory outcome

- `project_ui_redesign_cycles.md`: appended a "Master Data shell (phase 1) — MERGED 2026-11-03 (`1be7c35`)" paragraph (report path, what it delivered, follow-ups B-263…B-269, next = phase 2 merge of Client Groups into Clients). The link between phase 2 and the untracked `docs/superpowers/design/MD-Clients-Groups/` folder is marked unverified.
- `MEMORY.md` line "UI redesign cycles": "…B-262 = re-model the Entries state); then other…" → "…B-262 = re-model the Entries state); Master Data shell phase 1 MERGED 2026-11-03 (`1be7c35`, follow-ups B-263…B-269, next phase 2 = merge Client Groups into Clients); then other…".
