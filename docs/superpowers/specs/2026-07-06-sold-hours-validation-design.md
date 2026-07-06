# Sold-Hours Input Validation — Design

**Date:** 2026-07-06
**Context:** the last remaining finding from the date/hours/rate consistency audit (`docs/superpowers/audits/2026-07-03-date-hours-rate-consistency-audit.md`, F2-1): no technical constraint restricts sold-hours entry (task × role, in both Proposal and Project) to the discrete set the business actually allows. Today the only guard is user discipline. The two prior fix cycles on this audit (Derive/Reforecast rounding, XLS date parser) are both merged; this closes the last open finding.

**Correction during brainstorming:** the audit's original brief stated the allowed set as {integers, 0.25, 0.4, 0.75}. This was confirmed, during this cycle's brainstorming, to be a transcription error carried through the entire prior audit and both previous fix cycles — the correct set is **{integers, 0.25, 0.5, 0.75}** (standard quarter-hour granularity; 0.4 does not correspond to any real business convention and was never independently verified against a source, only carried forward as a given constraint). This spec uses the corrected set. No prior merged code change assumed 0.4 as a literal input constraint (the two prior cycles' "0.4 edge case" traces were about a *sold-hours value* used as a test input to exercise rounding/distribution logic in Derive/Reforecast — that logic is unaffected by which exact fractions are "allowed," per this spec's explicit scope exclusion below, since no audit of `roundToQuarterHour`/`distributeHoursExact` call sites is in scope here).

**Goal:** sold-hours entry accepts only integers or values whose fractional part is exactly 0.25, 0.5, or 0.75 — enforced at every real point of entry, client-side for immediate feedback and server-side as a hard safety net that can't be bypassed by calling the API directly.

## Scope correction: 2 real input points, not 4

The audit's original phrasing ("Proposal (pipeline.html, costgrid.html), Project (portfolio.html, project-config.html)") names four *pages*, but only two of them contain an actual editable sold-hours field — the other two are navigation/display surfaces that link to the editing page:

- `pipeline.html` / `js/pipeline-board.js` — no sold-hours reference at all (board/navigation only).
- `portfolio.html` / `js/portfolio.js` — reads `soldHours` only to sum KPI totals (`portfolio.js:158-159`); not an editable field.

The two real input points, confirmed by reading the code directly:
1. `js/costgrid.js:507` — the cost-grid task/role hours `<input>`, reached via `costgrid.html` (linked from `pipeline.html`).
2. `js/config-form.js:453` — the project task/resource sold-hours `<input>`, reached via `project-config.html` (linked from `portfolio.html`).

Each has a corresponding server-side save endpoint that persists the value without any validation today:
3. `api/src/routes/cost-grids.js:532`, `PUT /:id/versions/:vId/structure` — persists `task_roles.days` (column type `numeric(6,2)`, no `CHECK` constraint).
4. `api/src/routes/projects.js:210`, `PUT /:id/tasks` — persists `project_tasks.resources` (column type `jsonb`, no schema-level validation possible on a JSONB blob without an in-application check).

## Validation rule

A value is valid if it is a non-negative number whose fractional part (`value - Math.trunc(value)`) is exactly `0`, `0.25`, `0.5`, or `0.75` (accounting for ordinary floating-point noise with a small epsilon, consistent with the tolerance style already used in `distributeHoursExact`'s divergence check). Any other fractional part (e.g. `0.1`, `0.4`, `0.6`) is rejected. Sign/negativity is not newly addressed by this fix — existing `min="0"` HTML attributes on both inputs are the pre-existing (unchanged) safeguard against negative values; this spec's scope is the fractional-part rule only, per the audit's own framing of the gap.

## Shared constant, once per runtime

Frontend and backend are separate runtimes with no natural shared module (the same limitation already accepted for `distributeHoursExact`, frontend-only, and `parseFlexibleDate`, backend-only, in the two prior cycles) — so "one constant, not repeated across the validation points" means one authoritative definition **per runtime**, not a single cross-runtime source:

- **Frontend:** `js/lib/cfg-parse.js` gains `SOLD_HOURS_FRACTIONS = [0, 0.25, 0.5, 0.75]` and `isValidSoldHours(value)`, exported and bridged to `window.isValidSoldHours` (and `window.SOLD_HOURS_FRACTIONS` if useful for the error message), following the existing module's pattern (`cfgParseHours`, `roundToQuarterHour`, `cfgFmtHours`, `distributeHoursExact`).
- **Backend:** a new `api/src/lib/sold-hours.js`, mirroring `api/src/lib/date-parse.js`'s pattern (pure function, no I/O, `node:test`-testable), exporting the same constant and an `isValidSoldHours(value)` function with identical logic.

## Client-side wiring

**`js/costgrid.js:507`** (the task/role hours input) and **`js/config-form.js:453`** (the project resource sold-hours input): on the value being committed (blur, or at save time — implementation plan decides the exact event, consistent with how each file already handles its own input-commit pattern), call `isValidSoldHours(value)`. If invalid, block the save/commit and show a clear, specific message naming the rejected value and the allowed set — no automatic rounding or silent correction to the nearest valid value.

## Server-side wiring

Both save endpoints validate the **entire** payload before any database write — matching the "whole-request rejection, not partial" pattern already established in the XLS date-parser fix (`api/src/routes/timesheets.js`'s `POST /upload`):

- **`api/src/routes/cost-grids.js:532`**, `PUT /:id/versions/:vId/structure`: after destructuring `phases`/`rolesBody` from `req.body` (line 539) and before the transaction begins (`pool.connect()` at line 555), iterate every phase → task → role/hours entry and validate each `days` value (from either the `hours` map or `roles` array input shape the endpoint already accepts — both are read at lines 588-603). If any value fails `isValidSoldHours`, respond `400` immediately, naming the offending phase/task/role, before any `BEGIN`/`DELETE`/`INSERT` runs.
- **`api/src/routes/projects.js:210`**, `PUT /:id/tasks`: after the `Array.isArray(tasks)` check (line 216) and before the `DELETE FROM project_tasks` (line 218), iterate every task's `resources[]` and validate each `soldHours` value. If any fails, respond `400` immediately, naming the offending task/role, before any DB write.

## Testing

**Unit tests** (test-first, both runtimes, same case matrix):
- An integer (e.g. `5`) → valid.
- Each of the three allowed fractions (`2.25`, `3.5`, `1.75`) → valid.
- At least two rejected fractions (`2.4`, `2.6`) → invalid.
- `0` itself → valid (matches the allowed set's `0` entry; existing code already treats a `0`/absent value as "no entry," which is unaffected by this validator being merely a rule-checker, not a persistence-gating mechanism on its own).

Frontend: extends `js/lib/cfg-parse.test.js` (vitest). Backend: new `api/src/lib/sold-hours.test.js` (`node:test`, run via `npm test`/`docker exec pdash-api node --test ...` per the established convention from the XLS parser fix).

**Manual verification** (not automated, consistent with the established pattern for DOM-coupled UI and HTTP-route-level behavior in this whole engagement): in the browser, attempt to enter an invalid fraction (e.g. `2.4`) in both the cost-grid editor and the project-config form, confirm the save is blocked with a clear message; attempt a direct API call (e.g. via curl) to both PUT endpoints with an invalid fractional value in the payload, confirm a `400` with no data written.

## Out of scope

- Existing data already in the database: no verification, no migration, no backfill. If ever needed, handled manually by the user (e.g. reloading test data) — not part of this cycle.
- Any audit or fix of `roundToQuarterHour`/`cfgFmtHours`/`distributeHoursExact` call sites — this fix is scoped strictly to the input-validation gap, not to the rounding/distribution logic addressed in the prior cycle.
- The three queued Resource Planning cycles remain future work, after this one.
