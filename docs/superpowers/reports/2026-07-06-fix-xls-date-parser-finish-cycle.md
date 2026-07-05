# Finish-cycle report — fix/xls-date-parser

**Date:** 2026-07-06
**Branch:** fix/xls-date-parser → main

## What was done

3 commits on the branch, merged via merge commit `c688e31`:
- `da0789b` feat(api): add parseFlexibleDate for XLS date disambiguation
- `8be2a3b` fix(api): formatDate uses parseFlexibleDate, fixes DD/MM/YYYY assumption
- `853e2fd` fix(api): reject entire timesheet upload on any unparseable date

Deliverable: fixes the date/hours/rate consistency audit's F1-1 finding — `formatDate()` in `api/src/routes/timesheets.js` used to assume DD/MM/YYYY unconditionally for text-formatted XLS date cells, with no validation, while the real external source is known to export MM/DD/YYYY. A new pure module, `api/src/lib/date-parse.js` (`parseFlexibleDate(a, b, year)`), disambiguates day/month order deterministically whenever one component is `>12` (unambiguous — that value can't be a month), falling back to the known-correct MM/DD default only for genuinely ambiguous cases (both `≤12`). Calendar validity is checked with exact days-in-month/leap-year arithmetic (verified against the 4/100/400 leap-year rule, e.g. 2000 valid, 1900 invalid), never JS's auto-correcting `Date` constructor. The `POST /upload` route now rejects the entire file (400, zero partial DB writes) if any row's date can't be resolved, naming the offending spreadsheet row.

This also introduces `node:test` (Node's built-in test runner, zero new dependency) as the backend's first unit-test convention, deliberately kept separate from the frontend's `vitest` toolchain — mirroring the `js/lib/` pattern with a new `api/src/lib/` directory.

Manual verification (Task 3, done via `curl` against the running dev stack rather than a browser click-through, since the exact same HTTP+DB path is exercised either way) confirmed all three scenarios with concrete requests/responses and DB query results: an unambiguous day>12 date resolves correctly, a genuinely ambiguous date resolves via the new MM/DD default, and a file with one valid row plus one calendar-invalid date is rejected wholesale — zero rows persisted, not even the valid one from the same file. Full trace preserved in `.superpowers/sdd/task-3-report.md` (not committed — see Roadmap notes below).

## Code review follow-ups

None from automated `/code-review` — this gate was explicitly skipped on the user's instruction at Gate 3 of this finish-cycle run, given a thorough final whole-branch review had already been completed during the plan's own execution (subagent-driven-development's final review, `docs/superpowers/plans/2026-07-05-xls-date-parser-fix.md`'s corresponding ledger entry): **Ready to merge: Yes**, no Critical/Important findings. Its 3 Minor findings, carried forward here since they were never formally logged as `/finish-cycle` follow-ups until now:

1. The manual-verification curl/psql trace (Task 3) lives only in `.superpowers/sdd/task-3-report.md`, a git-ignored scratch file — not durable evidence once that directory is cleaned. See Roadmap notes.
2. `api/package.json`'s `"test"` script (and any test touching `timesheets.js`) requires either `docker exec pdash-api` or a prior `npm install` on the host, since the bare host has no `api/node_modules` — a pre-existing environment characteristic, already documented in `CLAUDE.md`, not something this branch could fix.
3. `formatDate()`'s final fallthrough (`return s;` for a string that never matched the ISO or DD/MM/YYYY-shaped regex at all, e.g. literal garbage like `"next week"`) still passes through unvalidated — unchanged, pre-existing behavior, out of scope for this specific audit finding (F1-1 was about the regex-matched-but-ambiguous case, not unparseable garbage).

## Roadmap notes

- **Persist the manual-verification trace.** The reviewer's top recommendation: Task 3's curl/DB verification (3 concrete scenarios, with exact requests/responses/query results) is quoted in full in this report's "What was done" section above and in `.superpowers/sdd/task-3-report.md`, but the latter is git-ignored scratch. If a future cycle wants this as durable, independently-referenceable evidence (e.g. for an audit trail), consider committing a trimmed version of it somewhere under `docs/`.
- Gate 2 of this `/finish-cycle` run again found zero spec/plan candidates in the branch (same known blind spot flagged in the two previous cycles' reports) — the design spec and plan were committed to `main` before the feature branch was opened. Not blocking; still worth a future `/finish-cycle` refinement.
- Gate 3 (code review) was explicitly skipped by the user for this cycle, relying instead on the plan-execution's own final whole-branch review (already clean, Ready to merge: Yes). Recorded here for transparency — this is a deviation from `/finish-cycle`'s normal flow, made by explicit user instruction, not a silent skip.
- The sold-hours input-validation gap (no technical constraint enforcing the {integers, 0.25, 0.4, 0.75} set) — the last remaining finding from the original date/hours/rate consistency audit — is still untouched, as explicitly scoped out of this cycle from the start.
- `formatDate()`'s "garbage string passes through unvalidated" gap (Minor finding #3 above) is a legitimate small scope boundary for a possible future cycle, if it's ever observed causing a real problem.

## Sync-docs outcome

- **ARCHITECTURE.md** — updated: `api/src/lib/` added to the directory structure with `parseFlexibleDate`'s description; the `POST /api/timesheets/upload` API reference row updated to note the whole-file-rejection behavior.
- **CLAUDE.md** — updated: `api/src/lib/` added to the file-structure list (mirroring `js/lib/`); a new paragraph documents the `node:test` backend toolchain, its independence from `vitest`, and the `docker exec`-vs-bare-host distinction for tests touching Express-dependent route files.
- **TEST_CASES.md** — updated: TS-05/06/07 added to the existing "13. Timesheets" section (unambiguous disambiguation, ambiguous-case MM/DD default, whole-upload rejection).
- **test-cases.html** — updated to mirror TEST_CASES.md exactly (same TS-05/06/07 content); script syntax verified with `node --check`.
- **test-api.js** — not updated: no new API endpoints or auth changes in this cycle; the route-level behavior change is deliberately covered by `node:test` + manual verification only, per the approved design spec.
- **PRD.md** — evaluated explicitly, updated: §8.2's Date column format description and §8.3's Behaviour bullets were updated to describe the new deterministic disambiguation and whole-file-rejection behavior; the "Known risk" paragraph (which described exactly the bug this cycle fixed) was replaced with a description of the fixed behavior, since the risk it documented no longer exists.
