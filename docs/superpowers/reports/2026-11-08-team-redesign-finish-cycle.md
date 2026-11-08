# Finish-cycle report — team-redesign

**Date:** 2026-11-08
**Branch:** team-redesign → main
**Execution started:** 2026-11-08 22:46  (pre-flight step 6)
**Merged at:** 2026-11-08 23:11  (Gate 4's merge commit)
**Gate durations:** Gate 1 3m · Gate 2 8m · Gate 3 14m · Gate 4 1m · Gate 5 (to report) 6m — total 32m
**Cycle counters:** subagent dispatches unknown (plan executed in an earlier session; this session: 2, both Gate 3 reviews) · review rounds 2 · full test-suite runs unknown (this session: 1 at Gate 1; the handoff records further runs during execution)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-08-team-redesign.md`) · review effort high
**Claims pre-check:** Gate 1 took about 2 minutes over the six changed `*.md` files and found no defect (CLAUDE.md rows, `docs/BACKLOG.md` B-376…B-379 line numbers, `docs/js/lib.md` export list, `docs/css/stylesheets.md` "only `team.html`" and "no hex" predicates all re-checked); the Gate 3 round-1 fixes touched no `*.md`, so there was nothing to re-check there; none of round 1's 6 findings fell in the four mechanical classes (finding 6 is the "no numbers in prose" writing rule, not a stale number).
**Acceptance:** 16 Spec criteria listed · 5 pre-ticked from `npm test` green at `85d9dfd` (1, 3, 13, 14 via `js/lib/team-page-guard.test.js`, `js/lib/team-ui.test.js` and `js/lib/tokens.test.js`; 15 the suite itself) · 11 verified by hand on the branch stack with a positive outcome (2, 4–12, 16) · none left unverifiable. No `TEST_CASES.md` case changed on the branch.

## What was done

12 commits:
- `d55d33a` feat(team): pure helpers for the redesign
- `e755d8c` feat(css): shared pd- components; tokenise admin-crud.css
- `e292f62` feat(team): list header, callout, toolbar, table and states
- `73be46d` feat(team): row menu, busy row and delete confirmation
- `b584808` feat(team): new/edit resource drawer
- `e97dd4b` feat(team): unmatched names drawer with queue and aliases
- `8b995b5` feat(team): resource panel details and experience profile
- `c9a21a8` feat(team): tablet layout and phone fallback
- `d68ece6` fix(team): visual-check fixes (menu wrap, select width, disabled assign…)
- `f8b9358` fix(team): board decisions 4, 7, 8, 9
- `85d9dfd` docs(team): redesign narrative, shared pd- classes, backlog
- `b59ed21` fix(team): Gate 3 round 1 — inactive candidates, focus after row menu, busy state by name

## Gate outcomes

- Gate 1: passed — claims pre-check clean; `npm test` 105 files / 2690 tests; no `api/` path, so no `scripts/run-tests.sh`.
- Gate 2: ordinary path; branch stack reused; Acceptance checklist 5 pre-ticked + 11 verified by hand; browser question answered yes; branch stack torn down.
- Gate 3: 2 rounds at high. Round 1 (background, `85d9dfd`): 6 findings, 0 to spec/plan or pre-existing prose; 1–3 fixed in `b59ed21` (team tests 138/138), 4–6 to follow-up. Round 2 (`b59ed21`): the three fixes confirmed, 6 new findings, all accepted as follow-up.
- Gate 4: merged `--no-ff` (`7af9c2a`, main had not diverged) and pushed — the push also carried the spec and plan commits `c1ed641`, `ad3b067` that were only on local main; no `api/` change, so no DB backup, no migration, no `pdash-api` restart; worktree `.claude/worktrees/team-redesign` removed, branch deleted.
- Gate 5: `/sync-docs` touched 7 files in the repo plus the memory; 9 follow-up rows added to `docs/BACKLOG.md`.

## Code review follow-ups

- Round 1 — phone: the `.tm-um-table` horizontal scroll clips the Assign to dropdown (`css/team.css` line 423) → B-380.
- Round 1 — phone: `.tm-table thead { display: none; }` hides the Unmatched and Existing aliases headers (`css/team.css` line 394) → B-381.
- Round 1 — counts in prose in the Redesign narrative (`docs/pages/team.md` lines 68, 70) → B-382.
- Round 2 — the Unmatched names drawer is unreachable when the queue is empty or fails to load (`team.html` line 59; Spec'd design) → B-383.
- Round 2 — double click on Delete resource sends two DELETEs (`team.html` line 1424) → B-384.
- Round 2 — session counter incremented before the reload (`team.html` line 1222) → B-385.
- Round 2 — Tab does not close the row menu (`team.html`) → B-386.
- Round 2 — `topTopics` sorts twice (`team.html` line 942) → B-387.
- Round 2 — focus still lost after a confirmed Delete / Deactivate instead (`team.html` line 994) → B-388.

## Roadmap notes

- The boards `docs/superpowers/design/team/redesign/` cited by the spec and by `docs/pages/team.md` are still untracked in the main checkout — not committed by this cycle; decide whether to commit them.
- Round 1 also reported, not as defects of this branch: the page calls raw `fetch` instead of `apiFetch` (on main already — an expired session shows "Save failed." / "Network error." instead of redirecting to login); `comboOptions` / `candidateChipsFor` rebuilt on every render; the page-local `TmIcon` duplicates `js/lib/icons.js`; page size 25 in four places; the panel's Esc/outside-click listeners attach after a 200 ms delay.
- Plan and Spec have no "File Structure" section, so Gate 4's out-of-scope comparison had nothing to compare against.
- The gitignored SDD ledger was copied to the session scratchpad before the worktree was removed.

## Sync-docs outcome

Scope pass: §1 ARCHITECTURE.md yes · §2 CLAUDE.md no (Pages rows already updated on the branch; `team.css` deliberately not in the byte-pinned css line) · §3 TEST_CASES.md yes · §4 test-api.js no (no API change) · §5 PRD yes · §5b operational-manual reference yes · §6 PROCESS.md no · §7 memory yes.

- `ARCHITECTURE.md`: `css/team.css` added to the directory tree; the `team.html` entry names its own stylesheet.
- `TEST_CASES.md`: TM-04, TM-06, TM-08, TM-09 revised for the drawer, the 13ag role sentence, the ⋯ menu / status control and the checkbox-gated Delete; new TM-18…TM-24 (list header and filters, callout and drawer, Assign/Ignore, Existing aliases, panel tabs, profile states, layers and Esc). `js/lib/test-cases-parse.test.js` case count 959 → 966.
- PRD: `docs/prd/administration.md` §16.7 (layout paragraph rewritten for the redesign, Unmatched names as a drawer with chips and session counter, ambiguous names include the inactive fallback, profile states and Profile processing link) and §16.10 (second entry point from Team). `PRD.md` untouched (no page added or removed).
- `.claude/skills/operational-manual/SKILL.md`: the Team bullet and the Profile Processing Console bullet reconciled from `docs/prd/administration.md` §16.7 / §16.10.
- `docs/pages/team.md`: the Gate 3 fixes (`b59ed21`) added to the Redesign section.
- PROCESS.md gate: none of the three conditions applies — the cycle executed the process as documented.

## Memory outcome

- `project_ui_redesign_cycles.md`: appended "Team redesign — MERGED 2026-11-08 (`7af9c2a`)" with the report path, Gate 3 outcome, the untracked boards and the next items (B-376, B-379).
- `MEMORY.md`: UI redesign line "…User Admin redesign MERGED 2026-11-06 (…); then other page-by-page cycles" → "…User Admin redesign MERGED 2026-11-06 (…); Team redesign MERGED 2026-11-08 (`7af9c2a`, first page on shared `pd-` components, 2 review rounds); then other page-by-page cycles".
