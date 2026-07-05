# XLS Timesheet Date Parser Fix — Design

**Date:** 2026-07-05
**Context:** the date/hours/rate consistency audit (`docs/superpowers/audits/2026-07-03-date-hours-rate-consistency-audit.md`, finding F1-1) found that `formatDate()` in `api/src/routes/timesheets.js:186-196` assumes DD/MM/YYYY unconditionally for text-formatted date cells, with no validation — while the external XLS source (Excel timesheet export, not modifiable) is known to export dates in US format (MM/DD/YYYY) for text-formatted cells. Native Excel date cells are already handled correctly (decoded by the `xlsx` library via `cellDates: true`, unaffected by this bug). Classified as **MISSING** (a fragile assumption that never had a validation safety net) rather than an active bug — no production data has been corrupted so far, per prior verification. This spec fixes the parsing logic and closes the missing-validation gap; it was explicitly scoped out of the two prior fix cycles (the date/hours/rate audit itself, and the Derive/Reforecast rounding fix) to be handled on its own.

**Goal:** `formatDate()`'s text-cell branch correctly parses ambiguous day/month ordering wherever it's mathematically determinable, defaults to the source's known convention (MM/DD/YYYY) only for genuinely ambiguous cases, and rejects the entire upload with an explicit, row-identifying error if any date turns out to be calendar-invalid after parsing — never silently passing through a malformed or misordered date.

## Approach (confirmed during brainstorming)

Three approaches were considered:
- **A — flip the default only** (DD/MM → MM/DD, matching the known source convention): simplest, fixes today's known case.
- **B — deterministic disambiguation first, flipped default as fallback**: when one of the two numbers is `> 12`, the ordering is unambiguous without any assumption (the value `≤ 12` must be the month) — apply this first; only fall back to the MM/DD default when both numbers are `≤ 12` (genuine ambiguity).
- **C — explicit per-upload/per-project format configuration**: most robust to a future change in the source's behavior, but adds UI complexity for a problem with a currently well-understood, reliable direction.

**A + B combined** was chosen: B's disambiguation is free defense-in-depth (correct by construction whenever it applies, not a guess) layered on top of A's corrected default for the remaining genuinely ambiguous cases. C was rejected as disproportionate to the actual, currently well-characterized problem.

## Scope decisions (confirmed during brainstorming)

- **Invalid-date handling:** if any date is calendar-invalid after parsing (e.g. a computed month `> 12`, a day invalid for its month), the **entire upload is rejected** with an explicit error identifying the offending row and value — not a per-row skip. This is stricter than the existing "skip rows with a missing D365 Project ID" behavior (`timesheets.js:112-113`), a deliberate choice: a malformed date signals the file itself may not match the expected format, which is a different class of problem than an individual incomplete row.
- **Existing data:** this fix changes `formatDate()`'s behavior for **future uploads only**. No retroactive re-verification or correction of rows already stored in the `timesheets` table — consistent with the audit's own finding that no production data has been corrupted so far, so there is nothing currently known to need correcting.
- **Testing:** the backend has no existing pure-function unit-test convention analogous to the frontend's `js/lib/` + vitest pattern (vitest is explicitly scoped as, per `CLAUDE.md`, a "frontend test toolchain," `vitest.config.js`'s `include` is `js/**/*.test.js` only). Rather than blur that boundary, the new parsing logic is extracted to `api/src/lib/date-parse.js` and unit-tested with Node's built-in `node:test` + `node:assert` (available in the backend's Docker image since Node 18, zero new `api/package.json` dependency), run via `node --test`.

## `api/src/lib/date-parse.js`

**Exported function:** `parseFlexibleDate(a, b, year)` — pure, no I/O.

- `a`, `b`: the two numeric day/month components as they appear in the source string, in their original left-to-right order (e.g. for `"03/04/2026"`, `a=3`, `b=4`).
- `year`: the four-digit year component.
- Returns an ISO date string (`YYYY-MM-DD`) on success.
- Throws an `Error` (message includes the offending raw values) if the date cannot be resolved to a valid calendar date under any interpretation, or if the resolved date is calendar-invalid (e.g. day 31 in a 30-day month).

**Algorithm:**
1. If `a > 12` and `b <= 12`: `a` cannot be a month, so `a` is unambiguously the day and `b` the month (source used DD/MM for this value, detected not assumed).
2. If `b > 12` and `a <= 12`: symmetric — `b` is unambiguously the day and `a` the month (source used MM/DD for this value, detected not assumed).
3. If both `a <= 12` and `b <= 12`: genuinely ambiguous — apply the known-source default, MM/DD, i.e. `a` = month, `b` = day.
4. If both `a > 12`: neither can be a valid month — this is not a resolvable date under any interpretation; throw.
5. After resolving day/month/year, validate the result is a real calendar date (correct days-in-month, including leap years) using exact arithmetic — not a lossy round-trip through JavaScript's auto-correcting `Date` constructor (e.g. `new Date(2026, 1, 30)` silently rolls over to March 2nd instead of signaling that February has no 30th day). Throw if invalid.

## `api/src/routes/timesheets.js` integration

In `formatDate()` (currently lines 186-196), the existing DD/MM/YYYY regex branch (lines 192-194) is replaced with a call to `parseFlexibleDate`. The already-ISO branch (line 191) and the native-`Date`-instance branch (line 188, unaffected — native Excel date cells are decoded correctly by `xlsx`'s own `cellDates: true` handling) are unchanged.

The upload route (`POST /api/timesheets/upload`, or wherever `formatDate` is invoked per-row during the parse loop) must catch a thrown `parseFlexibleDate` error and abort the **entire** upload before any row is persisted, responding with an error identifying the row number/content and the invalid date value — matching the scope decision above (whole-file rejection, not per-row skip, for a malformed date specifically).

## Testing

**Unit tests** (`api/src/lib/date-parse.test.js`, run via `node --test`):
- `a > 12`, `b <= 12` → resolves as DD/MM without applying the default (e.g. `a=25, b=3` → day 25, month 3).
- `b > 12`, `a <= 12` → resolves as MM/DD without applying the default (e.g. `a=3, b=25` → month 3, day 25).
- Both `<= 12` → resolves via the MM/DD default (e.g. `a=3, b=4` → month 3, day 4 — NOT day 3, month 4).
- Both `> 12` → throws (no valid interpretation exists).
- A resolvable day/month pair that is nonetheless calendar-invalid (e.g. day 31 in April, or Feb 30) → throws, not silently rolled over via `Date`'s auto-correction.
- A leap-year edge case (Feb 29 valid in 2024, invalid in 2026) → both directions verified explicitly.
- Existing already-working paths remain correct: ISO-format strings and native `Date` instances are unaffected by this change. `formatDate()` itself gains a named export alongside `timesheets.js`'s existing `module.exports = router` (i.e. `module.exports.formatDate = formatDate`). Requiring the file still loads its top-level dependencies (`express`, `multer`, `pg` via `../db/client`), but none of them connect or activate anything at require-time (`pg`'s `Pool` only connects lazily, on first query) — so calling the exported `formatDate` directly needs no live DB, no Docker, and no HTTP server, and this regression check runs via plain `node --test`.

**Manual verification:** upload a real XLS file (or a crafted one) containing a text-formatted date with an unambiguous case (e.g. day > 12) and an ambiguous case, confirm the resulting stored date matches the source's actual intended date; separately, upload a file with a deliberately malformed date and confirm the entire upload is rejected with a clear, row-identifying error rather than partially succeeding.

## Out of scope

- No retroactive correction of existing `timesheets` data.
- No per-upload/per-project explicit date-format configuration (Approach C, rejected).
- The other remaining audit finding — no technical validation of the sold-hours discrete set {integers, 0.25, 0.4, 0.75} — remains for a separate future cycle.
