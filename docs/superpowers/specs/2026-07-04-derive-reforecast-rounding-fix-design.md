# Derive/Reforecast Rounding Consistency Fix — Design

**Date:** 2026-07-04
**Context:** the date/hours/rate consistency audit (`docs/superpowers/audits/2026-07-03-date-hours-rate-consistency-audit.md`) found two related defects in `js/config-form.js:626-905` (Derive from Task Dates and Reforecast), both in the monthly `planning` (hours) grid:

- **F2-2 (Derive):** a round-trip lossy path through the DOM. `cfgDerivePhasing` computes a monthly hours distribution at fine precision (0.1h), and the confirmation modal's total is the sum of that same computed object. But `cfgGridHTML` (line 939) writes each cell's `value` attribute as `cfgFmtHours(raw)` — a coarser quarter-hour (0.25h) snap — before it ever reaches the DOM. `cfgReadGrid` (line 973), used by the single save path shared by every flow (manual edit, Derive, Reforecast alike — confirmed at `config-form.js:154-155`), reads back whatever string is sitting in that `value` attribute. The fine-precision computed value is discarded in favor of its own already-degraded display string: the modal promises one total, the saved grid holds a different one, with no error or warning.
- **F2-3 (Reforecast):** a real arithmetic drift, independent of the round-trip issue. A residual (e.g. 7.4h) is distributed across future months and each month is rounded to the nearest quarter-hour *independently* (`config-form.js:848`). The sum of the rounded months no longer equals the original residual (7.4h over 3 months → 2.46667 each → 2.5 each → sum 7.5h, a +0.1h drift created by the rounding itself, not by data loss).

**Goal:** eliminate both defects with a single shared distribution mechanism, so the monthly planning/phasing grids can never again show one number and save another, nor produce a distributed total that silently diverges from the value it was distributing.

## Root cause reframing (agreed during brainstorming)

Both defects are symptoms of the same missing invariant: the distribution logic computes at a precision finer than the final display/storage grid, and lets the *later* rendering step discover the final rounding uncontrolled — instead of the distribution itself producing the final, already-correct-and-exact result before it ever touches the DOM. A single function that (a) rounds to the final grid using a largest-remainder method, guaranteeing an exact sum, and (b) is called once by each of Derive and Reforecast before any DOM write, removes the round-trip loss (nothing left to lose — the value entering the DOM already **is** the final value) and the arithmetic drift (largest-remainder guarantees the sum equals the target) in one mechanism.

This was explicitly confirmed over the alternative of treating them as two separate fixes (e.g. "make save bypass the DOM for Derive/Reforecast specifically") — architecturally infeasible without introducing a second save path divergent from the shared one all other flows use (`cfgReadGrid`, `config-form.js:969`), which was rejected as re-introducing the same "two sources of truth" risk this fix exists to remove.

## `distributeHoursExact(total, rawValues, grid = 0.25)`

**Location:** `js/lib/cfg-parse.js` (extends the existing pure-function module alongside `cfgParseHours`, `roundToQuarterHour`, `cfgFmtHours`), with the same `window.*` bridge pattern for classic-script callers. Named without a `cfg` prefix, consistent with `roundToQuarterHour`'s naming (a generic algorithm, not `config-form.js`-specific business logic).

**Signature:**
- `total` (number): the exact value to distribute — may carry any fraction, including a 0.4-type value from the sold-hours set {integers, 0.25, 0.4, 0.75}.
- `rawValues` (object, `{ containerKey: number }`): unrounded per-container values (e.g. per-month hours) whose sum should approximately equal `total`. Containers are opaque keys (e.g. `YYYYMM` month strings) — the function does not interpret them.
- `grid` (number, default `0.25`): the rounding granularity of the final output.

**Validation (explicit, no silent failures):**
- Any `rawValues` entry `< 0` → throw an `Error` naming the offending container and value. Negative per-container values never occur in either caller's current domain (Derive's day-overlap fractions and Reforecast's clamped, proportionally-split residual are both always ≥ 0), so this is a fail-fast guard against a caller bug, not a real input case to support.
- `|Σ rawValues − total| > 0.05` (an absolute epsilon, chosen to absorb ordinary floating-point noise from day-overlap fraction arithmetic while still catching a real caller mismatch, e.g. `total=7.4` but `rawValues` summing to `5.0`) → throw an `Error` reporting both the expected `total` and the actual sum of `rawValues`. `rawValues` is used only for the *relative proportions* that decide which containers receive largest-remainder bumps — the function must never silently trust a `total` that doesn't correspond to what `rawValues` actually add up to.

**Algorithm (largest-remainder method):**
1. Round `total` to `grid` (a generalization of `roundToQuarterHour`'s `Math.round(n/grid)*grid` formula) → `roundedTotal`. This is where the 0.4-fraction edge case is handled explicitly: `roundToQuarterHour(0.4) = 0.5`, so a 0.4-fraction total is rounded to the nearest grid step *before* distribution, and every consumer (modal total, rendered grid, saved value) is consistent with that same rounded figure — never the raw 0.4.
2. For each container, `floorValue = floor(rawValue / grid) * grid` and `remainder = rawValue − floorValue`.
3. `stepsNeeded = round((roundedTotal − Σ floorValue) / grid)`.
4. Sort containers by `remainder` descending (deterministic tie-break: stable by container key, so results are reproducible in tests); give one `grid`-sized bump each to the top `stepsNeeded` containers.
5. Return `{ containerKey: floorValue (+ grid if bumped) }` — a new object of the same shape as `rawValues`, whose values sum to exactly `roundedTotal`.

A container with `rawValue = 0` has `remainder = 0` — the smallest possible — so it is never selected for a bump ahead of any container with a genuine positive remainder, and needs no special-casing beyond the algorithm above being applied correctly.

## Callers

**Reforecast (`cfgReforecast`, `config-form.js:707-905`):** the per-month independent rounding loop for `newPlanning` (`config-form.js:847-849`, `if (!pastYMs.has(ym)) newPlanning[ym] = roundToQuarterHour(newPlanning[ym]);`) is replaced by one call: `distributeHoursExact(remainingHours, <newPlanning restricted to future-month keys, unrounded>)`, merging the returned values back into `newPlanning` for those keys. `remainingHours` (`config-form.js:856`) is already the correct independent target — the accumulation into `newPlanning` per month (across all tasks, `config-form.js:833-835`) already happens before this point, so no restructuring of the accumulation loop is needed here, only the final rounding step. Past months and phasing/budget are untouched — no drift was found there by the audit, and this fix's scope is the hours/planning grid only.

**Derive (`cfgDerivePhasing`, `config-form.js:626-705`):** requires restructuring, confirmed deliberately over the lighter alternative (rounding per-month inside the loop and separately recomputing the modal total) — that alternative would reintroduce the same "two sources of truth" pattern this fix exists to eliminate, just relocated from "DOM vs. computed value" to "sum of independently-rounded months vs. separately recomputed modal total." The restructured flow:
1. During the existing per-month loop (`config-form.js:637-669`), accumulate **unrounded** hours per month into a raw values object (remove the per-month `Math.round(hours * 10) / 10` at line 668).
2. After the loop, compute the exact total sold hours across all billable tasks (`Σ task.resources[].soldHours`, the same pattern Reforecast already uses at `config-form.js:763`) — this is the `total` argument, independent of any per-month rounding.
3. Call `distributeHoursExact(totalHoursExact, rawMonthlyHours)` once, producing the final `newPlanning`.
4. The modal's displayed total (`config-form.js:672`) becomes the sum of this guaranteed-exact result — no longer a value that happens to fall out of per-month rounding.

Budget/phasing in Derive is likewise untouched (no drift found there).

## Testing strategy

**Characterization tests (pure function, `js/lib/cfg-parse.test.js`, extending the existing pilot test file):** written *before* any fix, pinning today's buggy behavior on known cases, then re-verified against the fix.

- 7.4h / 3 equal future months (the audit's traced Reforecast case) — today: sum drifts to 7.5h with no guarantee; after fix: `distributeHoursExact` sum is always exactly `roundToQuarterHour(7.4) = 7.5`, deterministically distributed.
- 2.4h / 3 months with real day-overlap fractions (the audit's traced Derive case, e.g. raw `{0.8, 0.7, 0.8}`) — after fix, sum is exactly `roundToQuarterHour(2.4) = 2.5`, consistent everywhere (modal, grid, save) rather than silently diverging to 2.25 as today.
- The 0.4-fraction edge case explicitly (e.g. `total = 0.4`), confirming the total-rounding step handles it before distribution, not left implicit.
- `Σ rawValues` diverging from `total` beyond the 0.05 epsilon → throws, reporting both values.
- A negative `rawValues` entry → throws.
- A zero-value container never receives a largest-remainder bump when other containers have positive remainders.
- Tie-break determinism: a case with multiple containers having equal remainders produces the same result every run.

**Caller verification (lightweight, no jsdom harness):** `cfgDerivePhasing`/`cfgReforecast` remain DOM-coupled (no further extraction in this cycle — confirmed during brainstorming as disproportionate to the risk, since all the delicate arithmetic is now isolated and fully covered in `distributeHoursExact`). Verified via careful code reading during task review (confirming each caller passes the correct `total`/`rawValues` and uses the returned result without any further re-rounding) plus manual browser verification (already required by `/finish-cycle`'s Gate 2) confirming the modal total, the rendered grid, and the saved value all agree for a known Derive and a known Reforecast scenario.

## Final acceptance test

After both fixes, for a set of known cases — including a sold-hours value with a 0.4 fraction — verify end-to-end: from the Derive computation through to save, and from the Reforecast residual through to its future-month distribution, the final total always exactly matches the expected (grid-rounded) value, with no silent exceptions anywhere in the chain.

## Out of scope

Every other finding from the audit — the XLS date-parser validation gap, the missing sold-hours input-set validation — remains for separate future fix cycles, untouched here.

## Process constraints (carried from the cfg-parse cycle)

- Test-first: characterization tests pinning current (buggy) behavior before any implementation change.
- Sold hours (the original, unrounded values in the {integers, 0.25, 0.4, 0.75} set) are never altered by this fix — only the derived `planning`/`phasing` forecast fields' rounding behavior changes.
- Single branch, single `/finish-cycle` run at the end, after both bugs are fixed — not one per bug.
