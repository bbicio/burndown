# Planning Matching + Residual Discrepancy Fix — Design Spec

**Source:** Resource Planning Audit, Finding 2 + Finding 3 (Ciclo 2 of 3)

## Problem

`js/planning.js` renders the same underlying resource-planning data in three views (by-role, by-project, by-owner). Each view independently reimplements task+role matching and the per-task residual floor, and the three implementations have diverged.

**Finding 3 — inconsistent matching:**
- By-role (`js/planning.js:614-616`) and by-project (`js/planning.js:1051-1053`) match with `r.task?.toLowerCase() === task.name.toLowerCase() && r.role?.toLowerCase() === res.role.toLowerCase()`. This crashes with a `TypeError` if `task.name` is missing, since `.toLowerCase()` is called on it directly without a null guard.
- By-owner (`js/planning.js:1346`) matches with `r.role === res.role && (!task.name || r.task === task.name)`. This tolerates a missing `task.name`, but compares **both** role and task name case-sensitively — not just task name, as the source audit brief described. This is a second, previously-undocumented divergence: by-owner's role comparison being case-sensitive while the other two views' is case-insensitive means by-owner can under-count relative to the other two views for any case-mismatched real data, independent of the task-name issue.

Net effect: task-less tasks crash two of the three views, and the three views can show different aggregate counts for the same underlying data.

**Finding 2 — aggregate floor discrepancy:**
The residual floor `Math.max(0, soldH - consumedH)` (identical in all three views: `js/planning.js:619` by-role, `:1056` by-project, `:1366` by-owner) is computed per task+role, not on the aggregated total for a role/owner/project. If a role has multiple tasks and one is over-consumed (actual hours exceed sold hours on that specific task), that task's residual floors to zero instead of going negative — but its full "actual" hours are still summed into the aggregate "From actuals" column.

Observed effect: at an aggregate row, `Sold − From actuals` can differ from (always ≤) "To be planned". Concrete case: HWGDEV-DEVELOPER, Sold 1236h − Actuals 44h = 1192h, but "To be planned" showed 1204h (+12h). This is not a calculation bug in the strict sense — it's by design, an artifact of per-task flooring — but it's an unexplained, visible discrepancy that reads to a user as "the numbers don't add up."

## Fix

### Finding 3: unified matching function

New file `js/lib/planning-calc.js`, following the same extraction pattern already established by `js/lib/cfg-parse.js` (ES module, `window` bridge, vitest-testable, no DOM dependency):

```js
export function matchesTaskRole(record, taskName, role) {
  const roleMatches = (record.role || '').toLowerCase() === (role || '').toLowerCase();
  const taskMatches = !taskName || (record.task || '').toLowerCase() === taskName.toLowerCase();
  return roleMatches && taskMatches;
}

export function computeResidual(soldH, consumedH) {
  return Math.max(0, soldH - consumedH);
}

window.matchesTaskRole = matchesTaskRole;
window.computeResidual = computeResidual;
```

`matchesTaskRole` is null-safe on both `record.task`/`record.role` and `taskName` (a missing `taskName` matches on role alone, never throws) and case-insensitive on both role and task name.

All three render functions in `js/planning.js` replace their inline filter predicates with `matchesTaskRole(r, task.name, res.role)`:
- By-role: `js/planning.js:614-616` (consumedH filter) and `:627-629` (pastWeeks actualH filter).
- By-project: `js/planning.js:1051-1053`.
- By-owner: `js/planning.js:1346` (this one filters once into `roleRecs`, which the rest of the by-owner block already reuses — no second replacement needed there, unlike by-role/by-project which recompute the filter twice; that pre-existing duplication is not touched, per the no-collateral-refactor constraint).

`planning.html` gets a new script tag: `<script type="module" src="js/lib/planning-calc.js?v=1"></script>`, placed before the existing `<script src="js/planning.js"></script>` tag (matching the load-order convention `cfg-parse.js` already uses on the same page).

### Finding 2: no formula change, static UI explanation

The per-task floor stays exactly as-is — computed via the new shared `computeResidual(soldH, consumedH)` (replacing the three duplicated `Math.max(0, soldH - consumedH)` inline expressions at `js/planning.js:619`, `:1056`, `:1366`, a pure DRY substitution with no behavior change). No aggregate-level recalculation is introduced: reconciling the aggregate would require changing which future weeks absorb which task's shortfall, which is the future-distribution logic this cycle explicitly excludes (Findings 4/5, Ciclo 3).

Instead: a static `title` attribute is added to the "To be planned" column header `<th>` in all three views (by-role, by-project, by-owner), always present regardless of whether the current dataset actually exhibits a discrepancy — computing that condition per-row would add plumbing for no real benefit, since the explanation is true unconditionally:

> "To be planned can exceed Sold − Actuals when a role has multiple tasks and one is over-consumed — hours over budget on one task aren't subtracted from another task's remaining budget."

## Backward compatibility

- For any record where role/task case already matches exactly and `task.name` is always populated (today's working case for by-role/by-project), `matchesTaskRole` returns identical results to the old inline predicates — zero behavior change for that view.
- By-owner's counts **will** change for any case-mismatched real data between `r.role`/`res.role` or `r.task`/`task.name` — this is the intended fix for the cross-view inconsistency, not a regression.
- No view crashes anymore when `task.name` is missing.
- `hasOwners`/the `'—'` placeholder-owner logic in all three views is untouched — it operates on the already-filtered result set, not on the matching predicate itself.
- `computeResidual`'s substitution for the inline `Math.max(0, ...)` expressions is behavior-neutral by construction (same formula, extracted verbatim).

## Testing

New file `js/lib/planning-calc.test.js` (vitest, no DOM/jsdom needed — pure functions):

```js
import { describe, it, expect, test } from 'vitest';
import { matchesTaskRole, computeResidual } from './planning-calc.js';

describe('matchesTaskRole', () => {
  it('matches identical role and task name', () => {
    expect(matchesTaskRole({ role: 'Developer', task: 'Build API' }, 'Build API', 'Developer')).toBe(true);
  });
  it('is case-insensitive on role', () => {
    expect(matchesTaskRole({ role: 'developer', task: 'Build API' }, 'Build API', 'Developer')).toBe(true);
  });
  it('is case-insensitive on task name', () => {
    expect(matchesTaskRole({ role: 'Developer', task: 'build api' }, 'Build API', 'Developer')).toBe(true);
  });
  it('does not crash when taskName is missing, matches on role alone', () => {
    expect(matchesTaskRole({ role: 'Developer', task: 'Build API' }, undefined, 'Developer')).toBe(true);
  });
  it('does not crash when record.task is missing', () => {
    expect(matchesTaskRole({ role: 'Developer', task: undefined }, 'Build API', 'Developer')).toBe(false);
  });
  it('rejects a different role even with matching task', () => {
    expect(matchesTaskRole({ role: 'QA', task: 'Build API' }, 'Build API', 'Developer')).toBe(false);
  });
});

describe('computeResidual', () => {
  it('returns sold minus consumed when positive', () => {
    expect(computeResidual(100, 40)).toBe(60);
  });
  it('floors at zero when consumed exceeds sold (over-consumed task)', () => {
    expect(computeResidual(20, 30)).toBe(0);
  });
});

test('per-task floor can make aggregate To-be-planned exceed aggregate Sold-Actuals (accepted, documented behavior)', () => {
  const taskA = { sold: 100, consumed: 40 };  // residual 60
  const taskB = { sold: 20,  consumed: 30 };  // over-consumed, residual floors to 0
  const aggregateTbp = computeResidual(taskA.sold, taskA.consumed) + computeResidual(taskB.sold, taskB.consumed);
  const aggregateSoldMinusActuals = (taskA.sold + taskB.sold) - (taskA.consumed + taskB.consumed);
  expect(aggregateTbp).toBe(60);
  expect(aggregateSoldMinusActuals).toBe(50);
  expect(aggregateTbp).toBeGreaterThan(aggregateSoldMinusActuals);
});
```

This satisfies acceptance criteria 4 and 5: the discrepancy test reproduces the HWGDEV-DEVELOPER shape with synthetic numbers, proving the *accepted* behavior (not a fix, since the formula is unchanged) with the same mechanism (one over-consumed task among several for the same role); the `matchesTaskRole` suite covers missing-name, missing-record-field, and case-insensitivity across exactly the scenarios that differed between the three views before this fix.

**Not automated** (DOM-coupled, same precedent as Ciclo 1's client-wiring task): the three call-site replacements in `js/planning.js` and the three tooltip `title` attributes. Verified via a manual code-trace confirming each of the three views' filter/residual lines were replaced with the shared functions and nothing else in the surrounding logic changed, plus a read-through of the three new `title` attributes for correct placement and wording. No live-browser verification is claimed as done unless actually performed against the running app.

## Explicitly out of scope

- Finding 1 (already closed, Ciclo 1).
- Finding 4 and 5 (Monthly Pulse, remain in Ciclo 3).
- Any change to future-week distribution logic (`monthlyDistribution`, even-split, Monthly Pulse) in any of the three views.
- Any modification to `timesheets.js` (closed in Ciclo 1).
- Any broader redesign of the three render functions beyond swapping in the two shared functions and adding the tooltip (no collateral refactor) — the pre-existing duplication of the by-role/by-project filter (computed twice per view) is left untouched.
