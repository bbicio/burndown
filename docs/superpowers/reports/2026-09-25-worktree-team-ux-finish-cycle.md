# Finish-cycle report — worktree-team-ux

**Date:** 2026-09-25
**Branch:** worktree-team-ux → main (merge commit `30f649e`)

"Team UX minimo": a small frontend-only cycle between the role-by-ID cycle and sub-cycle 3c of Cycle 3 (resource profile). Origin: during the 3b manual verification the user noted that `team.html` does not scale to ~150 people and dozens of unmatched names, and has no resource detail view where the 3c profile could live. Spec `docs/superpowers/specs/2026-09-25-team-ux-design.md`, plan `docs/superpowers/plans/2026-09-25-team-ux.md`.

## What was done

6 commits on the branch, merged `--no-ff` (executed **subagent-driven**, at the user's choice, one implementer per task):

- `3127cd0` feat: pure helpers for team page sorting and combo filtering — `js/lib/team-ui.js` (`sortResources`, `filterComboOptions`) + 17 vitest cases; filter matches when **every word** of the query is in the label (a refinement over the spec's plain substring, decided while planning)
- `bf59606` feat: team page tabs and sortable table
- `785675b` feat: resource detail side panel with Details, Aliases and Experience profile tabs
- `df278c3` fix: capture-phase Esc handler so a modal's Esc does not also close the detail panel (Task 3 review finding)
- `0674535` feat: searchable select for the Unmatched names assign control (`combo-select`)
- `66fcc31` fix: final-review fixes for combo-select keyboard use and panel alias errors

Rollout: `scripts/backup-db.sh` first (`backups/pdash-backup-2026-09-25-204441.dump`); no migration and no `api/` change, so no API restart. Tests at merge: `npm test` 209/209 (17 new). The backend integration suite was not needed (no `api/` file touched).

## Code review follow-ups

- The `/code-review` gate (medium, round 1) reported **no findings**. Before it, the subagent-driven process had already produced: per-task reviews (Task 3: 1 Important — Esc listener in the bubble phase would close the panel together with a modal — fixed in a fix round and re-reviewed), a whole-branch opus review ("with fixes": 2 Important — combo-select lists staying open on keyboard blur; a failed alias Remove from the panel showing no error — plus 3 minors folded in), one fix wave, one scoped re-review (clean). **No follow-ups accepted from `/code-review`.**

## Roadmap notes

- **Deferred minors (accepted, all in `docs/pages/team.md`):** rows and sortable headers are not keyboard-reachable (no `tabindex`/`aria-sort`); hard-coded hex colours in the panel's inline styles (copied from `pipeline.html`, against the "tokens only" rule); after Esc or a mouse pick, the first character typed in the combo appends to the old label (visible oddity, model not corrupted); the unmatched count shows twice on that tab; the header "Team (N)" counts inactive rows (pre-existing); re-clicking an open row flickers, and a row's action buttons close an open panel.
- **The Vue parts have no automated test** (project convention for page-level Vue); only `sortResources`/`filterComboOptions` are vitest-covered. Manual verification was done by the user in the isolated stack before the code review, and nothing changed afterwards.
- **Process observations (subagent-driven run):** implementers were haiku for Tasks 1–2 (complete code in the plan) and sonnet for Tasks 3–4; reviewers sonnet; the whole-branch review opus. The Task 3 implementer reported it had not re-read its own diff — the independent review caught the Esc defect that this would have caught. The Esc/Bootstrap-modal ordering (Bootstrap removes `.show` synchronously in `hide()`, before a bubble-phase document listener runs) is a reusable pitfall, recorded in `docs/pages/team.md`.
- **Still out of scope, by decision:** search/sort/height limit on the unmatched queue itself, candidate suggestion by similarity, projects shown per name, Team list paging, inline editing in the panel, a dedicated `resource.html` and `?resourceId=` deep link. The navigation-architecture audit (`docs/superpowers/audits/2026-09-24-navigation-ux-audit.md`, still untracked in git) is its own later cycle, after 3c.
- **Next:** sub-cycle 3c (per-project contributions, queued recalculation worker, `resources.profile` JSONB, the Experience profile tab content) — re-read `docs/superpowers/specs/2026-09-25-resource-profile-design.md` §5 first; it can now put the treeview in the panel's third tab. Also 3 of the 12 role codes in actuals (`CPROD - …`) are still missing from `roles`, so those people cannot be given that role in Team.
- Still open from earlier cycles: `costgrid.html` `toggleTag()` rollback race; the `:vId`↔`:id` gap on `structure`/`linked-projects`/`duplicate`; `PATCH /api/projects/:id` does not validate `cgVersionId` as a UUID; `scripts/test-branch.sh up` does not apply new migrations to the cloned DB.

## Sync-docs outcome

- **CLAUDE.md** — updated: the `js/lib/` list (+`team-ux`'s `team-ui.js`, only `team.html` loads it) and the `team.html` Pages-table row.
- **ARCHITECTURE.md** — updated: the `js/lib/` entry lists `team-ui.js`. No API/schema/migration change, so nothing else.
- **docs/js/lib.md** — new `team-ui.js` section (semantics of both helpers, the every-word filter). **docs/pages/team.md** — new "Team UX" section (tabs, sorting, the panel and its handler lifecycle incl. the capture-phase Esc, `combo-select`, deferred minors, what is still out of scope) and the old "Known limits" paragraph marked as mostly resolved. `docs/api/*` — not necessary (no backend change).
- **TEST_CASES.md / test-cases.html** — updated in mirror: new "Team UX" section, TU-01…TU-12 (TU-01/02 are vitest; none marked `auto` since that flag means `test-api.js` coverage); the HTML's Regression section renumbered 22 → 23.
- **test-api.js** — not necessary (no API change).
- **PRD.md** — evaluated and **updated** (user-visible): §16.7 gets a "Team page layout" paragraph (tabs, sorting, the detail panel) and the Unmatched names paragraph now describes the searchable assign list and its own tab. **`.claude/skills/operational-manual/SKILL.md`** — the inlined §16.7 reference updated to match.
- **docs/superpowers/PROCESS.md** — gate answer: none of the three conditions applied (this cycle *used* a different execution method — subagent-driven — as the process already allows); not touched.
