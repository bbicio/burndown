# Timesheet Owner/Role Column Mapping Fix — Design Spec

**Source:** `docs/superpowers/audits/2026-07-09-planning-by-owner-name-audit.md`, Finding F1, F2. Brief: `docs/superpowers/specs/2026-07-09-timesheet-owner-role-mapping-fix-brief.md`.

## Problem

Resource Planning (`planning.html`, By Owner and By Project views) shows a role/team code (e.g. `HWGDEV - DEVELOPER`) instead of the real person's name wherever an owner should appear. Root-caused in `/brainstorming`, using the real XLS header list the Brief required as a non-skippable prerequisite:

```
Date | Job | Role: Name | Hour Type | Owner: Name | Hours | Task/Issue | Notes | D365 Project ID | WF Project Name
```

(all headers except `Date` and `WF Project Name` carry trailing whitespace in the real source file, e.g. `"Role: Name    "`, `"Owner: Name    "`).

**F1 (stale data):** the 4 timesheet rows currently in the `timesheets` DB table (project codes `HITA.000001823.001`, `.003`, `HITA.000001586.001`, `HITA.000001201`) all have `owner === role`, uploaded 2026-06-23 through 2026-06-29 — before the 2026-07-06 column-mapping fix (`docs/superpowers/reports/2026-07-06-fix-timesheet-column-mapping-finish-cycle.md`). That fix corrected the *code path* for future uploads only; it has no retroactive effect on rows already stored.

**F2 (the real, previously-undiagnosed bug):** a live re-upload of the real file structure was tested during this session and confirmed to still fail — not with the "ambiguous header" collision the audit's initial reading of F2 hypothesized, but with a distinct, more severe bug: `resolveColumnMap` is called with **trimmed** header names (`api/src/routes/timesheets.js:98`, `Object.keys(raw[0]).map(k => k.trim())`), but the resolved column names are then used to index into the **untrimmed** row objects that `XLSX.utils.sheet_to_json` produces (which retain the exact header text, trailing whitespace included). `row["Role: Name"]` (trimmed) never matches a row object whose real key is `"Role: Name    "` (with trailing spaces) — every field whose real header has surrounding whitespace resolves to `undefined`.

Verified directly (`docker exec pdash-api node -e ...`, simulating the exact real header list) that this affects `role`, `owner`, `hours`, `task`, **and `projectId`** — not just owner. Since `projectId` ends up empty for every row, and `api/src/routes/timesheets.js:143-148` rejects the whole upload when no row has a valid project code (`"No valid rows found (projectId column missing or empty)"`), a fresh upload of the real file is rejected outright with this exact error — it does not even reach the point of writing wrong data.

Traced the full read/write path to confirm the bug is isolated to this one location: `POST /upload`'s row-mapping (`api/src/routes/timesheets.js:91-130`) writes the (buggy) `entry` objects verbatim into the `timesheets.data` JSONB column (`:151-157`, `JSON.stringify` + `INSERT`, after a `DELETE FROM timesheets WHERE project_code = $1` for the same code — a full replace, not an append); `GET /api/timesheets/all-data` (`:50-67`, the route `refreshTimesheetDataFromApi()` calls) reads it back with a plain `json_agg(entry ...)` over `jsonb_array_elements(t.data)` — no transformation on the read side. Confirmed no foreign key in the schema references `timesheets.id`, so replacing rows via re-upload is safe.

## Design

### Fix: normalize row keys once, immediately after parsing

Add a pure function to `api/src/routes/timesheets.js`, alongside the already-exported `resolveColumnMap`/`formatDate`:

```js
function trimRowKeys(row) {
  const trimmed = {};
  for (const key of Object.keys(row)) trimmed[key.trim()] = row[key];
  return trimmed;
}
```

Apply it once, right after XLSX parsing (`api/src/routes/timesheets.js:93`):

```js
const raw = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null })
  .map(trimRowKeys);
```

From this point on, every row object's keys are already trimmed, matching the already-trimmed names `resolveColumnMap` returns. Simplify the now-redundant re-trim at line 98 from `Object.keys(raw[0]).map(k => k.trim())` to `Object.keys(raw[0])` (the keys are already trimmed by `trimRowKeys`).

**Why this approach over alternatives considered in `/brainstorming`:**
- Making `resolveColumnMap` return the original untrimmed header instead would change its contract (currently trimmed-in/trimmed-out) and require touching its existing, already-correct tests, for no additional benefit.
- Trying both trimmed and untrimmed key variants at each of the 8 individual field-read call sites is fragile and doesn't scale to future fields.
- Normalizing once, at the single point where rows first enter the system, fixes every current and future field uniformly (not just `role`/`owner` — also `hours`, `task`, and `projectId`, all confirmed affected) and touches the fewest lines.

### Testing

New tests in `api/src/routes/timesheets.test.js`:

- `trimRowKeys` unit tests: a row with mixed leading/trailing whitespace on some keys and none on others produces a row with every key trimmed and values unchanged.
- **Characterization test reproducing the exact real header list** (the Brief's required prerequisite, now fulfilled): given a row shaped like the real source file (`Date`, `Job `, `Role: Name    `, `Hour Type    `, `Owner: Name    `, `Hours    `, `Task/Issue    `, `Notes    `, `D365 Project ID    `, `WF Project Name`), composing `trimRowKeys` → `resolveColumnMap` → the same field-extraction logic `POST /upload` uses, asserts that `role`, `owner`, `hours`, `task`, and `projectId` are all correctly populated (not empty/zero) and that `role` and `owner` resolve to *different* values (the original symptom).

**Not automated** (requires the full Express route, multer file upload, and a live DB — no existing harness for this in the test suite, consistent with how `POST /upload` itself has never been unit-tested, only `resolveColumnMap`/`formatDate` as extracted pure functions): the actual `POST /api/timesheets/upload` route wiring. Verified instead via the direct `docker exec pdash-api node -e ...` trace already performed in this session (documented above) — will be re-verified with the real fix in place before merge, using the same simulation approach.

### Data correction (existing stale rows)

No manual DB migration. Per the Brief's acceptance criteria and confirmed in `/brainstorming`: `POST /upload` already replaces all rows for a given `project_code` (`DELETE` then `INSERT`, `api/src/routes/timesheets.js:151-157`), and no foreign key references `timesheets.id`. Once the fix is merged and deployed, re-uploading the same 4 original source files (project codes `HITA.000001823.001`, `.003`, `HITA.000001586.001`, `HITA.000001201`) through the normal upload flow replaces the stale rows with correctly-mapped ones. This is a manual, out-of-band action by the user after merge — not a step in the implementation plan itself, since it requires the original files and cannot be automated or verified by the implementer.

## Backward compatibility

No change to `resolveColumnMap`'s signature, behavior, or existing tests — it already receives and returns trimmed strings; `trimRowKeys` is what now guarantees the strings it's given were trimmed correctly at the source. `formatDate` and all other field-extraction logic (`.trim()` on individual values) are unaffected. No DB schema change.

## Explicitly out of scope

- The By Owner/By Project schema change (Task instead of Role as the innermost grouping) — separate `feature-brief` cycle (Scenario 2), not part of this fix.
- Any change to `js/planning.js` — already verified correct by the source audit; the bug is entirely upstream in ingestion.
- Migrating timesheet data for any project other than the 4 already identified in the audit.
- Automating the re-upload of the 4 affected files — requires the original source files, which only the user has; done manually after this cycle merges.
