# api/src/lib/

Pure functions extracted for unit testing (`node:test`, run via `npm test`/`node --test` from `api/`), mirroring the frontend's `js/lib/` convention.

This file holds the full function-by-function reference and implementation narrative for `api/src/lib/` — signatures, what each function does, cycle-by-cycle bug history, and which routes consume which module. `CLAUDE.md`'s File structure entry keeps only a one-line pointer; when working on any `api/src/lib/*.js` file, read this file, not that line, for the detail. See `/sync-docs`'s routing rule for where future changes to these modules should be written.

## date-parse.js

`parseFlexibleDate(a, b, year)`: disambiguates day/month order deterministically when one value is >12 (unambiguous), falls back to MM/DD (the source export's known convention) only when genuinely ambiguous (both ≤12), validates against real calendar/leap-year arithmetic, throws on an invalid date. Consumed by `docs/api/timesheets.md`'s `formatDate()`, which now rejects the entire upload (400, no partial DB writes) if any row's date can't be resolved — either a calendar-invalid D/M/YYYY date (via `parseFlexibleDate`) or a cell value that doesn't match any recognized date format at all (2026-08; previously fell through to storing the raw, un-validated string as the entry's date). A whitespace-only cell is treated as "no date" (`null`), not an error.

`trimRowKeys(row)` trims every uploaded row's object keys before `resolveColumnMap()` reads them (predates this session), so header/value whitespace mismatches between the sampled header row and individual data rows can't cause a column-mapping miss.

### resolveColumnMap(headers) — `api/src/routes/timesheets.js`

Column-header-to-field resolver for the XLS upload, exported (like `formatDate`) for direct `node:test` coverage. Resolves each of `colDate/colRole/colOwner/colHours/colTask/colNotes/colProjId/colProjName` via a **specificity-scored global assignment** (2026-08, replacing the earlier fixed-declaration-order/first-match algorithm) — an audit (`docs/superpowers/audits/2026-08-05-timesheet-column-mapping-ambiguity-audit.md`) found the old algorithm could silently misassign a column whenever a generic keyword from an early-declared field (e.g. `colOwner`'s bare `'name'`/`'nome'`) collided with a more specific keyword belonging to a later-declared field (e.g. `colProjName`'s `'project name'`) — the outcome depended purely on which column happened to appear first in the uploaded file, with no error ever raised (`"Project Name"` could end up as the `owner` value for every row, `colProjName` left `null`).

Every (header, field) match is now scored — tier 2 if the header equals the keyword exactly, tier 1 if the keyword appears as a whole word inside the header (word-boundary aware via a manual `\p{L}\p{N}` Unicode-property check, not a plain regex `\b`, since `\b` doesn't treat accented letters like the `à` in `attività` as word characters and would misfire on that candidate); within a tier, a longer/more specific keyword outranks a shorter/generic one — then all matches across every header and every field are sorted by score and assigned greedily (highest-specificity first), so field-declaration order only decides genuine ties (e.g. `"Resource Name"` still resolves to `colRole`, not `colOwner`, because `'resource'` (8 chars) always outscores `'name'` (4 chars) — it never reaches the tie-break).

`colTask`'s candidate list gained `'task name'`/`'nome attività'` (mirroring `colProjName`'s existing `'project name'` pattern) — a gap found mid-fix: the bare `'task'` (4 chars) tied exactly with `colOwner`'s bare `'name'` (4 chars) for the header `"Task Name"`, and without a more specific candidate to break that tie cleanly, declaration order silently regressed the exact bug being fixed.

2026-08 hardening: `matchSpecificity()` now scans every occurrence of a candidate substring, not just the first — previously a candidate whose first occurrence wasn't word-boundary-clean returned no match at all, even if a later occurrence in the same header was; and `resolveColumnMap()`'s `usedHeaders` collision-tracking `Set` now stores column index (`m.headerIdx`) instead of header text (`m.header`), so the string-vs-index distinction doesn't conflate two distinct columns that happen to share identical header text — though the practical benefit is bounded by `result[field]` still storing the header *string* (dereferenced by callers via `row[map.colX]`), so two identically-named columns still resolve to the same underlying value; no two fields in the current `FIELD_CANDIDATES` table share an overlapping candidate word, so a genuine cross-field collision isn't constructible from today's real candidate list.

The non-optimal greedy (rather than globally-optimal bipartite) assignment strategy is unchanged — no demonstrated real-world trigger, left as documented backlog.

## sold-hours.js

`isValidSoldHours(value)`/`SOLD_HOURS_FRACTIONS` (`[0, 0.25, 0.5, 0.75]`): validates that a sold-hours value lands on a quarter-hour boundary. Consumed by `cost-grids.js` and `projects.js` for their own sold-hours validation.

## email-template.js

`renderEmailHtml({ bodyHtml, appUrl, year })`: the shared HTML wrapper (navy/magenta logo header, footer with app URL + year) used by every system email (invite, password reset, share notification, export ready, admin notification) — mirrors `login.html`'s own logo styling so emails match the product's visual identity.

## rate-resolve.js (2026-09)

`resolveFee(tasks, taskName, role)`: backend port of `js/core.js`'s `findRate()` (case-insensitive task+role match, fallback to a matched task's first resource, `0` — never `null` — when nothing matches). Consumed by `docs/api/timesheets.md`'s `POST /upload` to snapshot a `fee` value onto every uploaded timesheet entry at insert time; the `0` fallback (vs. `findRate`'s `null`) is deliberate — the value is persisted, not display-only, so it needs a concrete number, and `0` matches the same "no data" display convention already used for Fee/Spent throughout `timesheets.html`.

## is-admin.js (2026-09)

`isAdminRole(role)`: `role === 'admin' || role === 'sysadmin'`, single source of truth for "does this role carry admin capabilities?" now that `role` is 3-tier. Swept into every route file that had its own bare `role === 'admin'`/`role !== 'admin'` literal instead of going through the shared `requireAdmin` middleware (found by the final whole-branch review of the sysadmin-role cycle, live-verified: a real sysadmin saw 0 projects/grids/timesheets and 403s on reporting/broadcast before this fix) — `cost-grids.js`, `projects.js`, `timesheets.js`, `exports.js`, `reporting.js`, `notifications.js`, `pipeline-years.js`. `node:test`-covered (4 cases).

## role-transition.js

`roleChangeError(actorRole, targetCurrentRole, requestedRole)`: pure validation for a requested `users.role` change, returns `null` (allowed) or an error string. Rules: only a sysadmin may grant/revoke sysadmin, or touch a row that is currently sysadmin at all (in either direction — this covers demotion too, not just promotion); promotion to sysadmin is only valid from a target currently `admin` (no direct `user → sysadmin`); demotion from sysadmin is only valid to `admin` (no direct `sysadmin → user`, added after a code-review finding — the promotion side already had this two-step rule, the demotion side didn't). Consumed by `PATCH /api/users/:id` (`docs/api/lib.md` reference; route itself in `api/src/routes/users.js`). 9 `node:test` cases.
