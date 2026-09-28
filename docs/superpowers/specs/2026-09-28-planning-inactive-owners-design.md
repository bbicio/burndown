# planning.html — inactive-owner handling

**Date:** 2026-09-28
**Status:** approved for planning

## Context

`planning.html`'s owner breakdown (By Owner view, and the owner sub-rows inside By Project/By Role) is built entirely from free-text owner names found in uploaded actuals — there is no link to the `resources` registry. When someone leaves the company (or is a contractor whose engagement ends), their name keeps receiving a proportional share of *future* ("to be planned") hours forever, because the existing split is computed purely from each name's share of past actuals with no notion of whether that person is still active.

This is priority #2 in the resource-allocation backlog (see memory `project-team-ux-backlog`), agreed 2026-09-25, scheduled to run before Cycle 4 (AI suggestion engine) so that engine doesn't inherit bad hour-distribution on ex-employees.

Cycle 3b already solved the adjacent problem — linking free-text actuals owner names to `resources` rows — via `resource_aliases` + `api/src/lib/match-resource.js`'s `normalizeName`/`buildMatchContext`/`matchOwner`. This cycle reuses that same matching logic; it does not change how matching works, only adds a read path for `planning.html` and a redistribution rule on top of the match result.

## Goal

When a task+role's future hours are split across owners, an owner who is currently `inactive` in the `resources` registry should get **0% of the future share** — their share is redistributed proportionally among the remaining eligible owners. Their historical actuals stay exactly as they are today (name shown as-is, no change to past-week numbers), just visually flagged as inactive.

## Non-goals

- No change to how names are matched to resources (still `match-resource.js`'s exact-normalized-token matching + aliases; no fuzzy matching).
- No change to the "Unmatched names" queue on `team.html` — that stays 3b's territory.
- No AI/classification logic — that's Cycle 4.
- No change to past-actuals numbers, ever — only the future ("to be planned") split is affected.

## Design

### 1. Status resolution rule

For a given owner name, resolve one of three statuses using the existing `matchOwner(name, ctx)` from `api/src/lib/match-resource.js`, plus a `resourceId → status` lookup built from the same `resources` rows already fetched for `ctx`:

| `matchOwner` result | Resource status | Resolved status |
|---|---|---|
| `matched`, resource status = `inactive` | inactive | **`inactive`** |
| `matched`, resource status = `active` | active | `active` |
| `ambiguous`, `unmatched`, `ignored`, `empty` | — | `active` |

Only an exact, unambiguous match to a currently-inactive resource yields `inactive`. Every other outcome (no match, ambiguous match, an alias explicitly marked "ignore", or an empty/placeholder name) is treated as `active` — this is a direct extension of the already-agreed rule ("unmatched/ambiguous = active"), applied consistently to the two other `matchOwner` outcomes that weren't explicitly discussed (`ignored`, `empty`) because neither corresponds to a known inactive resource.

This resolution is a straightforward reuse of existing, already-tested matching primitives — no new matching logic, no new tests needed for `matchOwner` itself.

### 2. Backend — `POST /api/resources/match-owners`

New route in `api/src/routes/resources.js`. **Must be declared before the router's blanket `router.use(requireAuth, requireAdmin)` (currently line 11)**, with its own `requireAuth` only — `resources.js`'s other routes are legitimately admin-only (they expose resource PII), but Planning is visible to every authenticated user and this endpoint returns no PII, so it needs the looser gate. This mirrors the existing per-route-override pattern already used in `attribute-lists.js` (router-wide `requireAuth`, `requireAdmin` added only on individual write routes) — here the direction is reversed (one route loosened out of an admin-wide router) because the router's default is admin, not auth-only.

```js
// declared above router.use(requireAuth, requireAdmin)
router.post('/match-owners', requireAuth, async (req, res, next) => {
  // body: { names: string[] }
  // 1. SELECT id, first_name, last_name, status FROM resources
  // 2. SELECT alias_normalized, resource_id FROM resource_aliases
  // 3. buildMatchContext(resources, aliases); build resourceStatusById from (1)
  // 4. for each input name: matchOwner(name, ctx) -> resolve per the table above
  // 5. respond { [name]: 'active' | 'inactive' }  (no 'unmatched' in the response —
  //    already folded into 'active' per the resolution rule; keeps the response
  //    shape trivial to consume: only 'inactive' names ever need special handling)
});
```

- Request body validated: `names` must be an array of strings; cap at a generous sane limit (e.g. 2000) matching this project's existing lightweight validation style — Planning realistically has at most a few hundred distinct owners even at 150 staff with turnover.
- No pagination — this is the same "2 queries, match in memory" shape as `resource-matching.js`'s existing `refreshUnmatched`.

### 3. Frontend — shared redistribution function

New export in `js/lib/planning-calc.js`:

```js
// ownerTotals: { [name]: actualsHours }  (existing accumulator, unchanged)
// ownerStatus: { [name]: 'active' | 'inactive' }  (from the API; a name absent
//   from this map — e.g. the API call failed, or this name wasn't in the request
//   batch — is treated as 'active', i.e. fail open)
// returns: { props: { [name]: proportion }, allInactive: boolean }
function redistributeExcludingInactive(ownerTotals, ownerStatus) {
  const eligible = Object.keys(ownerTotals).filter(n => (ownerStatus[n] || 'active') !== 'inactive');
  const eligibleTotal = eligible.reduce((s, n) => s + (ownerTotals[n] || 0), 0);
  if (eligible.length === 0 || eligibleTotal <= 0.01) {
    return { props: {}, allInactive: true }; // 100% of future hours -> TBD row
  }
  const props = {};
  eligible.forEach(n => { props[n] = ownerTotals[n] / eligibleTotal; });
  return { props, allInactive: false };
}
```

- Pure, no DOM/API access — vitest-covered like every other `js/lib/planning-calc.js` export.
- `allInactive: true` covers both "every actual owner on this task+role is inactive" and "sum of eligible actuals is ~0" (defensive, mirrors the existing `totalOwnerH > 0.01` guard already used at the call sites).
- Test cases: all-active (unchanged from today's behavior — regression guard), one inactive among several (renormalizes over the rest), all-inactive (routes to TBD), unmatched name present (treated as active, gets its normal share), single eligible owner (gets 100%).

### 4. Call-site changes

Three call sites currently compute `ownerProp = ownerTotals[name] / totalOwnerH` inline and use it for **both** past-actuals display numbers and future/TBP numbers. Each is split so only the future-hours math changes:

- **By Project** view + export (`~planning.html:767-883`)
- **By Owner** view + export (`~planning.html:1026-1230`)
- **By Role** export (shares the By Project export's owner-breakdown code path)

For each: keep `ownerActualsH = ownerTotals[name]` and any past-week `byOwner[name]` lookups exactly as they are today (untouched). Replace the future/TBP proportion (`ownerProp` as used for `ownerTbpH`/`ownerSold`/future-period cells) with a lookup into `redistributeExcludingInactive(ownerTotals, ownerStatus).props[name]` (0 if absent, i.e. the owner is inactive or the redistribution routed everything elsewhere). When `allInactive` is true for a given task+role's owner set, that task+role's entire future share goes to the existing `'—'`/TBD placeholder row exactly the way a "no owners at all" case already does today (`hasOwners = false` path) — no new UI state, just a different trigger for the existing one.

### 5. Inactive badge

A small badge/pill next to any rendered owner name, in all three views' rows/sub-rows, styled consistently with the existing small inline badges already used elsewhere on this page (e.g. the `no owner` badge at `~planning.html:823`, same `--color-warning-bg`-style treatment or a neutral grey — final visual pick left to implementation, matching existing token usage, not a new color). XLS export renders the same signal as a plain-text suffix on the owner cell value, e.g. `"Jane Doe (inactive)"`, since export cells can't carry styled markup.

The badge is purely informational — it does not gate or hide anything; an inactive owner's historical row keeps showing its actuals and can still be expanded/filtered like any other row.

### 6. Data flow, caching, error handling

- On page load, once the planning dataset is fetched (existing `readXLS`-adjacent load path / whatever populates `timesheetData`), collect the set of distinct owner names across all currently loaded records and fire one `POST /api/resources/match-owners` call.
- Cache the resulting `{ name: status }` map for the page's lifetime — Planning already follows the "each page load starts fresh, no persistence" convention (see CLAUDE.md's Data strategy section), so no invalidation logic is needed within a session.
- **Fail open on error**: if the call fails (network error, non-2xx), log a `console.warn` and proceed with an empty status map — every owner resolves to `active` via the "absent = active" rule in `redistributeExcludingInactive`, i.e. behavior is identical to today. This is a UX enhancement layered on top of existing functionality; it must never be able to break Planning if the endpoint is unavailable.
- Re-fetch triggers: whenever the underlying dataset that produces the distinct-owner-name set is reloaded (matching whatever existing trigger currently recomputes `ownerTotals` etc.) — no separate polling or manual refresh needed.

### 7. Docs / cache-busting

- `docs/pages/planning.md`: new dated section describing this cycle, same narrative style as the existing "By Role project/task drill-down (2026-09)" section.
- In-page help text updates (the existing explanatory `<p>`s near the By Owner/By Project tables, e.g. `~planning.html:961-963` and `~planning.html:1228-1229`) to mention that inactive owners no longer receive future hours.
- `js/lib/planning-calc.js?v=N` bump (currently `?v=3` per `docs/pages/planning.md` — confirm current value at implementation time) wherever `planning.html` references it.
- No `?v=` concerns on the backend route (not a versioned static asset).

## Testing

- **vitest** (`js/lib/planning-calc.test.js` or equivalent): full coverage of `redistributeExcludingInactive` per the cases listed in section 3.
- **Manual verification** (per this project's established Vue-page convention — no automated E2E): against real/branch data, at least one task+role with (a) a mix of active + inactive owners, confirming the inactive owner's future share moves to the actives and past actuals are unchanged; (b) a task+role where the only owner is inactive, confirming 100% falls to TBD; (c) an owner name that doesn't match any resource, confirming it's treated as active (gets its normal share, no badge).
- Verify the endpoint is reachable by a **non-admin** authenticated user (the whole point of moving it above the router's `requireAdmin` gate) — a quick manual check as a non-admin test user, since this is an easy regression to reintroduce silently (e.g. an incautious future edit reordering routes back below `router.use`).

## Open items for the implementation plan

None — this design is considered complete. The implementation plan should sequence: (1) backend route + its own tests/manual check, (2) `planning-calc.js` pure function + vitest, (3) wire into the three call sites one at a time, (4) badge UI + export text, (5) docs/cache-bust, (6) manual verification pass.
