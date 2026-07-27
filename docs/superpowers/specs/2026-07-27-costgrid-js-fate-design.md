# `js/costgrid.js`'s Architectural Fate — Design Spec

**Source:** Brief `docs/superpowers/specs/2026-07-27-costgrid-js-fate-brief.md`. "Cycle B1" of the two-cycle split from the cold-review Cycle B recommendation (`docs/superpowers/reports/2026-07-27-vue-migration-roadmap-cold-review.md`, item 12) — a design decision, not a mechanical fix (see that Brief for why this differs in nature from the already-merged "Cycle B2").

## Decision

**`js/costgrid.js` (1,542 lines) remains a permanent, intentional shared Vanilla business-logic library.** It is not migration debt awaiting a future rewrite — this is now the documented, deliberate architectural status. No code change results from this cycle: only documentation.

## Rationale

Explored during `/brainstorming`: the Brief's second candidate direction ("fold `js/costgrid.js`'s remaining functions into `pipeline.html`'s own Vue instance") turned out to rest on an incorrect premise. `costgrid.html` and `pipeline.html` are two independently-loaded pages — they never share a live JS runtime or Vue instance; each loads its own copy of `js/costgrid.js` and populates its own copy of the module-level state (`_cgStore`, etc.) via its own `cgSyncFromApi()` call at page load. They share *code*, not *state*. "Folding into `pipeline.html`'s instance" is therefore not literally achievable as originally framed — a real restructuring would mean duplicating the remaining stateful functions into both pages' own Vue instances separately (or a `js/lib/`-style shared module, which already exists for the pure/stateless calc functions in `js/lib/costgrid-calc.js`).

Weighed against that increased cost, the case for restructuring is weak:
- **No user-facing benefit** — both consumers are already Vue; this would only reorganize how shared logic is internally structured, not remove any Vanilla page.
- **Doubled regression risk** — unlike every prior Tier 1/Tier 2 page migration (one page, one cycle, one payoff), this would touch two already-shipped, already-reviewed Vue instances simultaneously.
- **No evidence of real pain** — the bridge pattern (`_cgVueApp` delegation in `costgrid.html`) has passed two whole-branch code reviews (the `costgrid.html` and `pipeline.html` cycles) with zero findings about the pattern itself. The two bugs fixed in "Cycle B2" were narrow, isolated silent-failure gaps, not symptoms of a systemic bridge-pattern problem.
- **The remaining functions are the hard-to-migrate ones** — the pure/stateless calc functions (`cgComputeTaskTotals`/`cgComputePhaseTotals`/`cgComputeGrandTotals`/`cgComputeColumnTotals`, `resolveRoleRate`, `stripCloneTaskIds`) were already extracted to `js/lib/costgrid-calc.js` during the `costgrid.html` migration. What's left in `js/costgrid.js` is inherently stateful/mutating (Clone, Publish, Generate Project, version/modal management) — exactly the category that resists a clean, low-risk extraction.

Decided: keep as-is, formalize the decision in documentation, close the open question.

## Documentation changes

- **`CLAUDE.md`**: the `js/costgrid.js` file-structure entry currently has no "eventual fate" language to remove (that framing lived in prior cycles' *reports*, not in `CLAUDE.md` itself) — add one sentence stating its status as a permanent shared Vanilla service layer with its 2 current consumers (`pipeline.html`, `costgrid.html`) named explicitly, so a future reader doesn't need to trace through old reports to learn this was ever in question.
- **`ARCHITECTURE.md`**: same addition, matching its existing `js/costgrid.js`-adjacent entries' level of detail.
- No other file changes. No behavior change. No new tests (nothing executable changes).

## Testing

None required — this cycle produces no code change. `npm test` is not expected to be affected; running it once is a sanity check, not a verification of anything this cycle does.

## Explicitly out of scope

- Any actual code change to `js/costgrid.js`, `pipeline.html`, or `costgrid.html`.
- Re-opening this decision without a concrete, new reason (e.g., a real pain point surfacing later) — this spec closes the question, it doesn't schedule a future revisit.
- The two already-fixed silent-failure findings (Cycle B2) and every other item from the cold-review backlog (Cycle C, Cycle D, the `initNav()` gap, the static-file documentation gap).
