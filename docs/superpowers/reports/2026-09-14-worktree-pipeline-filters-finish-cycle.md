# Finish-cycle report — worktree-pipeline-filters

**Date:** 2026-09-14
**Branch:** worktree-pipeline-filters → main

## What was done

1 commit (bounded-path new capability, no plan document):

- `13b7113` feat: add multi-select filters to the pipeline board

Adds a filter bar to `pipeline.html`, below the title and above the kanban columns, enclosed in its own bordered/background strip: a free-text search field first, then Owner/Client/Currency/Value multi-select dropdown filters, in that order. Multi-select values within one filter combine with OR; the filter categories combine with AND. All filtering is client-side, over data already loaded (no new API calls, no change to which proposals a user is authorized to see), and applies live on every interaction — no submit button. The Draft column is never touched by any filter (it's excluded both from the option lists that populate Owner/Client and from the filtering pass itself), and column card-count badges / footer totals update automatically since they already derive from each column's own filtered card list.

Two new pure, vitest-covered functions in `js/lib/pipeline-calc.js`: `pbPriceBucketKey(amountEur)` (5-bucket classifier, boundary inclusive of the higher bucket) and `pbCardMatchesFilters(card, filters, ...)` (the AND/OR matcher, reusing the exact fee/rate EUR-equivalent arithmetic `pbComputeColumnTotals` already uses for column totals — no new conversion logic). The "Include PTC" checkbox is not an independent filter; it only switches the price-bucket total between fee-only (default) and fee+PTC.

## Code review follow-ups

Round 1 (`general-purpose` subagent, medium effort, scoped to `main..HEAD`): 0 Critical, 0 Important, 3 Minor, all accepted as-is (no fix needed):

1. Only the Owner filter's test suite has an explicit multi-value OR case; Client/Currency/Value each only have single-value tests. Low risk since all four share the identical `.includes()` pattern — not fixed this cycle.
2. The filter bar's visual "enclosure" is a background + bottom-border only (no full box/rounded border) — consistent with the rest of the page's sparse-border style; a design nit, not a defect.
3. The four dropdown blocks (Owner/Client/Currency/Value) are near-identical markup repeated explicitly rather than looped/componentized — judged a reasonable, explicit choice for a fixed 4-item set, matching this project's stated preference against premature abstraction.

## Roadmap notes

- **A real, pre-existing documentation staleness was found and corrected during this cycle's own sync-docs pass** (also independently flagged by the code reviewer): `CLAUDE.md`'s "Pipeline board layout (height math)" section documented a `#pbColumnsContainer { height: calc(100% - 61px) }` rule that no longer exists anywhere in the current markup — the columns row is actually a `flex:1; min-height:0` flex child today, not a hardcoded pixel calc. This meant the new filter-bar row (and any future row added to the board's header area) is automatically absorbed by flexbox with no matching pixel adjustment needed anywhere — a materially different (and safer) layout mechanism than what the docs described. Corrected in this cycle's CLAUDE.md update.
- **Two unrelated production incidents were investigated mid-cycle, both resolved, neither a code defect**: (1) a stale/foreign session cookie from an earlier isolated-test-branch session caused a transient "auth-check gets 404 instead of 401/200" 500 on the real production site — same symptom class as an incident from two sessions ago, now consistently understood as a client-side cookie/JWT-secret-sharing artifact of testing isolated branches and production in the same browser, not an application bug; (2) a `net::ERR_CONNECTION_REFUSED` on `localhost:8081` during the user's own manual verification pass, which was simply the isolated test-branch stack having already been torn down after this session's own verification — re-started on request, no incident at all once explained.

## Sync-docs outcome

- **CLAUDE.md** — updated: corrected the stale `#pbColumnsContainer`/hardcoded-calc description under "Pipeline board layout (height math)" to match the actual current flexbox-based layout; added a new "Filter bar (2026-09)" subsection describing the UI, the AND/OR combination rules, the Draft-exclusion guarantee, and a pointer to `js/lib/pipeline-calc.js`; `pipeline.html`'s own file-structure entry gained a short cross-reference to the new subsection; `js/lib/pipeline-calc.js`'s entry gained full documentation of the two new exports (`pbPriceBucketKey`, `pbCardMatchesFilters`).
- **TEST_CASES.md** + **test-cases.html** — updated in lockstep: added `P-46` through `P-56` (11 new cases) covering the filter bar's layout/order, live search (including the client-name-match path), multi-select OR, cross-category AND, Draft exclusion from both option lists and filtering, the Value+Include-PTC interaction, column count/total recompute, Clear filters, and the no-persistence-on-reload rule. `test-cases.html`'s embedded script re-validated with `node -e "new Function(...)"`.
- **test-api.js** — not touched: no API changes.
- **PRD.md** — **updated** (evaluated: this is a genuinely new user-visible capability — filtering didn't exist on the pipeline board before this cycle). Added new §4.3a "Filtering (2026-09)" describing the filter bar, its combination rules, and the Draft/permission guarantees, at PRD's user-facing level of detail (no implementation specifics).
- **PROCESS.md gate** — none of the three conditions applied (no process skill touched; no recurring process exception introduced; no change to the 7-phase skeleton or scenario guardrails) → `PROCESS.md` left untouched.
