# Brief — Decide `js/costgrid.js`'s Architectural Fate

**Scenario:** Evolution of existing functionality (Scenario 2 per `docs/superpowers/PROCESS.md` §2) — **not** an audit-fix (Scenario 3), despite originating from the same source as "Cycle B2" (`docs/superpowers/reports/2026-07-27-vue-migration-roadmap-cold-review.md`, item 12). This is "Cycle B1" of the two-cycle split confirmed with the user when Cycle B was first proposed. It differs in nature from B2 (`docs/superpowers/specs/2026-07-27-costgrid-silent-failures-brief.md`, already merged): item 12 is a design/architecture question with no single mechanical fix — it requires exploring alternatives and trade-offs — while B2's items 13-14 were correctness/consistency gaps with a clear "make it match the intended contract" fix. Per `audit-to-brief`'s own Step 4 guidance, this Brief is written in evolution-scenario shape (current behavior → alternatives for `/brainstorming` to resolve → open decision flagged), not the mechanical audit-fix template.

## Current behavior

`js/costgrid.js` is a large (~1,000+ line, unminified) shared Vanilla JS business-logic library, unmodified since the `costgrid.html` Vue migration cycle (2026-07-25) except for this cycle's own two small fixes (`docs/superpowers/reports/2026-07-27-worktree-costgrid-silent-failures-finish-cycle.md`). It is loaded, as of today, by exactly **2 pages** (re-verified via `grep -l "js/costgrid.js" *.html`):

- **`costgrid.html`** — the cost grid editor itself, migrated to Vue 3 in the same 2026-07-25 cycle. It consumes `js/costgrid.js` entirely through the "bridge pattern": three functions (`renderCgEditor()`, `renderCgVersionTabs(cg)`, `showCostGridEditorView(cgId, versionId)`) are thin delegations into the page's own mounted Vue instance via a module-level `_cgVueApp` reference (`CLAUDE.md`'s `js/costgrid.js` entry). Every other function in the file that used to render its own page's DOM directly (`renderCgEditor`'s former ~700-line innerHTML builder, `cgBindEditorEvents`, `cgApplyEditorLock`, `cgRefreshTotals`, `cgRefreshPhaseDates`, `cgRenderRoleList`, `cgFindTask`) was already deleted in that cycle — `costgrid.html` no longer depends on `js/costgrid.js`'s own rendering logic at all, only on its remaining business-logic functions (mutation operations like `cgCloneGrid`, `cgPublishDraft`, `cgCreateNewVersion`, `cgGenerateProject`, and data-loading helpers like `cgLoadStructureFromApi`) called as globals from Vue methods.
- **`pipeline.html`** — the kanban pipeline board, migrated to Vue 3 in the 2026-07-22 cycle. Re-verified via grep: it directly calls a substantial set of `js/costgrid.js` functions as globals from its own Vue instance, including `cgCloneGrid`, `cgComputeGrandTotals`/`cgComputePhaseTotals`/`cgComputeTaskTotals`, `cgConfirmDeleteGrid`, `cgConfirmDeleteVersion`, `cgCreateNewGrid`, `cgGetIndex`, `cgLoad`, `cgLoadStructureFromApi`, `cgSyncFromApi` — plus shares the `#cgCloneModal`/`#cgNewGridModal` static markup with `costgrid.html`. This is a genuine, substantial dependency, not a vestige.

As recently as the `costgrid.html` cycle's own report, this file's "eventual fate (full rewrite vs. permanent shared Vanilla service layer) remain[ed] deferred until `planning.html` (the last Vanilla consumer) is migrated" — that migration (2026-07-27) is now complete, and `planning.html`'s own migration confirmed it made no genuine calls into `js/costgrid.js` at all (only two now-removed page-local no-op overrides), so dropping its `<script>` tag there had zero impact on this file's real remaining consumer set. The deferred trigger condition is now satisfied: exactly 2 consumers remain, one of which (`costgrid.html`) already treats it as a bridge-delegated business-logic layer rather than its own rendering engine.

## Expected behavior — open design decision, not a single fix

There is no single "correct" answer here — this Brief exists to get the question in front of `/brainstorming`, not to prescribe an outcome. At minimum, two candidate directions exist (not exhaustive — `/brainstorming` should explore further options and trade-offs, not treat this as a binary choice):

1. **Keep `js/costgrid.js` as a permanent, documented shared Vanilla service layer.** Formally decide (and document in `CLAUDE.md`/`ARCHITECTURE.md`) that this file is not "temporary migration debt" but an intentional, ongoing architectural pattern — a shared business-logic library called as globals from two independent Vue instances (`costgrid.html`'s and `pipeline.html`'s). This requires no code change, only an explicit decision and doc update removing the "eventual fate TBD" framing.
2. **Fold `js/costgrid.js`'s remaining functions into `pipeline.html`'s own Vue instance**, with `costgrid.html` calling into `pipeline.html`'s exposed functions instead (or vice versa), eliminating the bridge pattern and the shared-globals model entirely. This is a real migration-scale effort (comparable in kind, if not size, to the Tier 2 page migrations) and would need its own design work: which page becomes the "owner" of the shared logic, how cross-page calls work without a build step, whether a third shared `js/lib/`-style module (but non-pure, stateful) is warranted instead of either page owning it outright.

## Constraints

- No build-step introduction (Vite/SFC) — this is a hard constraint carried through the entire Vue migration roadmap and still applies.
- Whatever is decided must not break either `costgrid.html` or `pipeline.html`'s current functionality — both are live, in-use pages.
- This decision does not need to happen in the same cycle as any resulting implementation — `/brainstorming` may conclude with "keep as-is, documented" (no further plan needed) or with "fold in" (requiring its own `/writing-plans` cycle). Both are valid, acceptable outcomes of this Brief.
- Do not conflate this with the two already-fixed silent-failure findings (Cycle B2, merged) — those are closed and out of scope for re-litigation here.

## Acceptance criteria

- [ ] A decision is reached and documented (in `CLAUDE.md`/`ARCHITECTURE.md` at minimum) on `js/costgrid.js`'s architectural status — no longer described as having a deferred/TBD "eventual fate."
- [ ] If the decision is "keep as permanent shared library": the relevant doc sections are updated to state this explicitly and drop the "deferred until X" framing inherited from the `costgrid.html`/`planning.html` cycles' reports.
- [ ] If the decision is "fold into `pipeline.html`'s Vue instance" (or any other structural change): a full design spec and implementation plan are produced via the normal `/brainstorming` → `/writing-plans` flow — this Brief's own scope ends at the decision, not the implementation.

## Explicitly excluded scope

- The two already-fixed silent-failure findings in `js/costgrid.js` (Cycle B2, items 13-14) — closed, not re-opened here.
- Every other item from the cold-review report's backlog (Cycle C — pipeline/cost-grid product decisions; Cycle D — phasing-panel rounding and Export-XLS-ExcelJS bugs; the `initNav()` no-error-banner gap; the static-file bind-mount documentation gap).
- Any actual code migration/refactor as part of *this* Brief — if `/brainstorming` concludes a structural change is warranted, that becomes its own subsequent plan, not folded into this decision-making cycle.

## Required reminder (Scenario 3 guard, per `audit-to-brief` — restated here even though this Brief itself is Scenario 2, since it originates from the same audit-to-brief workflow as B2)

Any new finding discovered during this cycle's `/brainstorming` — a new consumer of `js/costgrid.js` not accounted for above, an unrelated bug noticed while exploring the file — must be isolated and proposed as its own future Brief, never folded into this cycle's decision or any resulting implementation plan.

---

Brief ready. Next step: /brainstorming.
