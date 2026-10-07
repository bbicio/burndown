# Finish-cycle report — worktree-costgrid-redesign-cycle-a

**Date:** 2026-10-07
**Branch:** worktree-costgrid-redesign-cycle-a → main (merge `8f69105`)

## What was done

10 commits:

- `922d2d1` docs: fix plan gap — Task 4 must bump costgrid.js version too (pre-flight plan correction, found during subagent-driven-development's pre-flight scan)
- `2d1d56e` feat(costgrid): add cgFreeTasksOf/cgOfferDetailsSummary/cgSectionDefaults, fix compact-header persistence (Task 1)
- `7b5f065` feat(costgrid): header card, collapsible-card persistence, no-modal new version (Task 2)
- `a243a10` fix(costgrid): sync cg.versions entry on version-label rename, restore on Esc (Task 2 fix round)
- `eaf410e` feat(costgrid): grid restyle, role menu, sticky column, phase-delete guard (Task 3)
- `659ba8c` fix(costgrid): remove hardcoded hex from Task 3 grid CSS, minor cleanup (Task 3 fix round)
- `b94ce5e` feat(costgrid): single-CTA selection bar, free-task bug fix, always-visible phasing, docs (Task 4)
- `3a3978d` fix(costgrid): final review fix wave - button contrast, emoji, hex, BOM, focus (whole-branch review fix wave)
- `e0ae807` fix(costgrid): box the Period/Stage and Client & rates field groups (Gate 2 manual-verification fix)
- `0b5557b` fix(costgrid): light-pill header stage badge, 2-column Tags grid (Gate 2 manual-verification fix)

Restyled `costgrid.html` (desktop + tablet): one header card with a version segmented control and no-modal "+ New version"; three collapsible cards (Offer details/Tags/Sharing) with per-proposal `localStorage` persistence; a sticky-first-column grid with role actions moved into a ⋮ menu (two-click "Remove column"); a single-CTA task-selection bar (New/Existing segmented control, replacing two always-visible buttons); Monthly Phasing always visible with an empty-period message; own stylesheet `css/costgrid.css`. Fixed two real bugs found during design/implementation: `PDash_cgCompactHeader` never actually persisted (missing from `core.js`'s `keep` Set), and three call sites checked task-assignment by id only, not id+name (`selectAllFreeInPhase`/`selectAllFree`/`cgGenerateProject`). Executed via `superpowers:subagent-driven-development` (Sonnet implementers, Opus final whole-branch review); Gate 2 manual verification then found and fixed two further real gaps no code-level review could catch (see Roadmap notes).

## Code review follow-ups

Round 1 (`/code-review` on the full branch diff, all 8 accepted as follow-up, none fixed this cycle):

1. `openRoleMenuCode`/`removeColumnConfirm` are not reset in `openVersion()` — switching versions can leave the role ⋮ menu's state stale, and if the new version happens to reuse a role code, the menu could silently reopen (or a stale armed "remove" confirm could fire on the wrong column). `costgrid.html:1191`.
2. The Sharing card's closed-state summary (avatars/count) isn't refreshed when `#shareModal` closes after an add/remove — only the expanded `<share-list>` refreshes. `costgrid.html:1801`.
3. `cgCreateNewVersionDirect`'s default label `v${cg.versions.length + 1}` has no uniqueness check — deleting a version and creating a new one can produce a duplicate label. `js/costgrid.js:781`.
4. The role-menu Teleport's scroll/resize reposition handler uses a cached DOM reference with no liveness check — combined with #1, a stale/detached node can snap the menu to the viewport's top-left corner. `costgrid.html:1018`.
5. The new client-side "can't delete an assigned phase/task" rule has no server-side mirror — `PUT /:id/versions/:vId/structure` can still silently drop a linked task's phase/task from a stale client or a direct API call. Consistent with this cycle's "no API changes" scope, but a real gap. `api/src/routes/cost-grids.js:639`.
6. `hasFreeTasks`/`isTaskAssigned` (Vue) still reimplement the id+name free-task check inline instead of calling the new shared `cgFreeTasksOf` — two parallel implementations of the same rule, already correct today only because they happen to read the same underlying data. `costgrid.html:853`.
7. `CG_HEADER_STAGE_STYLE` (added during Gate 2) duplicates `pipeline.html`'s `PB_STAGE_STYLE` and wasn't in CLAUDE.md's pipeline-stage sync list — **fixed during `/sync-docs`** (added to the sync list in CLAUDE.md), so this one is resolved, not deferred.
8. `phaseFreeState`/`toggleFreeInPhase`/`phaseFreeLabel` duplicate `selectAllFreeState`/`toggleSelectAllFree`/`selectAllFreeLabel` almost verbatim (phase-scoped vs draft-scoped), each re-filtering the task list from scratch rather than sharing one computed result — a minor perf/duplication concern, not a correctness bug.

## Roadmap notes

**Gate 2 (manual verification) caught two real implementation gaps no code-level review could see** — nothing in this session's build/review process can render the page (Claude in Chrome is blocked for `localhost` by this environment's org policy; no other browser tool is available), so Gate 2 was the only point anything visual was actually verified end to end:
- The Period+Stage and Client/Ratecard/Currency fields were implemented as flat Bootstrap rows instead of the bordered/shaded box panels the design boards show (spec §3.4 points 3–4) — fixed (`e0ae807`).
- The header's stage pill reused `js/core.js`'s `pipelineBadge()` (a solid, color-as-background chip meant for secondary badges) instead of the light pill the boards show for this prominent position — fixed with a locally-scoped `CG_HEADER_STAGE_STYLE` const (`0b5557b`), not by changing the shared helper.

**Deferred to its own future cycle (user decision, 2026-10-07):** the native browser form controls left in place by this cycle — month date pickers, Stage/Client/Ratecard `<select>` dropdowns, and the Reassign-owner `<select>` — render as plain OS/browser chrome, not the custom calendar/styled dropdown/searchable people-picker the design boards (5.11–5.15) show. The original brief only explicitly flagged this fallback for Reassign; it wasn't called out for the other fields, so the visual gap surfaced as a surprise at Gate 2 rather than during brainstorming. Matching the boards requires building shared custom form-control components, scoped as its own `/brainstorming` cycle (memory: `project_costgrid_custom_form_controls_cycle.md`). The `#cgRoleSelectModal` ("Add roles") modal's unrestyled look is unrelated and was already explicitly out of scope per the original brief.

**Cycle B (smartphone tabs/sheets)** remains a separate future spec, as agreed during brainstorming — not started.

## Sync-docs outcome

- **CLAUDE.md:** `costgrid.html`'s Pages-table row already accurately described (written during Task 4); added `costgrid.html`'s `CG_HEADER_STAGE_STYLE` to the "Pipeline stage: single source of truth" sync list (closes code-review follow-up #7).
- **docs/pages/costgrid.md:** appended a "Gate 2 fixes" subsection (the two real gaps found and fixed) and a "deferred to a future cycle" subsection (native form controls) plus the unresolved code-review follow-ups, so the page's own narrative reflects the cycle's actual final state, not just Task 4's own report.
- **ARCHITECTURE.md:** refreshed `costgrid.html`'s one-line Directory Structure description (header card, collapsible sections, own stylesheet) — still points to `docs/pages/costgrid.md` for the full narrative per the routing rule.
- **TEST_CASES.md / test-cases.html:** added CG-73..CG-80 (card persistence, ⋮ menu Move/Reset-rate/two-click-Remove, Select-free/Clear-phase toggles with the id+name fix, Existing-project disabled with no linked projects, assigned-task lock icon + phase-delete guard, Monthly Phasing always visible, the two Gate-2 fixes, Tags 2-column grid).
- **test-api.js:** not touched — no new API endpoints, no auth changes this cycle.
- **PRD.md:** updated — §4.9's toolbar description (now a header card, not a toolbar), the per-role-column controls (now a ⋮ menu, not four always-visible icons, no longer tied to the compact-header toggle), "+ New version" (no name prompt, inline-editable label), the locked-version badge (SVG icon, not a 🔒 emoji), and the task-selection bar (single CTA via a New/Existing segment, not two always-visible buttons) all described genuinely stale, user-visible behavior from before this cycle.
- **`.claude/skills/operational-manual/SKILL.md`:** updated its mirrored "PDash detail-content reference" entries for the same role-column-controls and header/toolbar changes, plus its screenshot checklist's "compact mode" wording (now "⋮ menu open").
- **PROCESS.md gate:** none of the three conditions applied (no process-skill change, no newly-recurring exception, no change to the 7-phase skeleton or scenario guardrails) — not touched.

## Memory outcome

- `project_ui_redesign_cycles.md`: description/frontmatter widened to cover this user-authored-brief cycle (not just Claude Design handoffs); appended a "Cost Grid redesign, cycle A — MERGED 2026-10-07" section with the merge hash, the two real bugs fixed, and the key lesson (no browser tool in this session can render a page, so Gate 2 is the only real visual check; native-control fallbacks must be flagged per-field, not once).
- `MEMORY.md`: updated the UI-redesign-cycles index line to mention this cycle's merge; added one new index line for the new memory below.
- Created `project_costgrid_custom_form_controls_cycle.md` (new): the deferred custom date-picker/dropdown/people-picker work, with the scope and the decision context (Gate 2, 2026-10-07).
- No items left "unverified" — every change above is grounded in the merge diff, the code-review findings, or a decision made explicitly in this conversation.
