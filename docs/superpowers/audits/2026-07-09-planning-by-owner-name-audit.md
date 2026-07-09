# Resource Planning — By Owner Shows Role Instead of Owner Name Audit

**Date:** 2026-07-09
**Scope:** verification-only. `planning.html`'s By Owner view (`js/planning.js`, `renderPortfolioPlanningByOwnerContent`), extended during the session to also cover the By Project view (`renderPortfolioPlanningByProjectContent`) once the same symptom was reported there, followed upstream through the full data path to its source: `timesheetData` (in-memory, loaded via `refreshTimesheetDataFromApi()`), the `GET`/`POST /api/timesheets` routes, and the XLS-upload column-resolution logic (`api/src/routes/timesheets.js`, `resolveColumnMap`/`formatDate`), down to the live `timesheets` DB table. Finding criterion: the reported divergence — role strings shown where the owner's real name is expected — verified to root cause, not just symptom. No exclusions. No code was modified.

## Method

Read `renderPortfolioPlanningByOwnerContent` (`js/planning.js:1262-1401`) in full to see how the owner grouping key is derived and rendered. Traced `owner` back to its source: `timesheetData`, loaded from the `timesheets` table's `data` JSONB column via the upload route (`api/src/routes/timesheets.js`). Read `resolveColumnMap` (`:192-209`) and the row-mapping code (`:100-127`) that populates each row's `role`/`owner`/`task` fields. Read `api/src/routes/timesheets.test.js` to see what behavior is currently tested/intended for the column-resolution logic, in particular around the ambiguous-header scenario this repo's own `CLAUDE.md` documents as the subject of a prior fix (`2026-07-06-fix-timesheet-column-mapping-finish-cycle.md`). Queried the live `pdash-db` Docker container directly (`docker exec pdash-db psql`) to inspect actual stored `role`/`owner` values and `timesheets.uploaded_at` timestamps, to check real data rather than only reasoning from code.

## Findings

### F1 — The By Owner view's "owner" is stale, pre-fix data where `owner` was duplicated from `role`; no timesheet has been re-uploaded since the fix that was meant to correct this
- **Type:** STALE DATA (not a code defect in the currently-shipped column-mapping logic)
- **Severity:** Important (user-facing: the feature is unusable as intended until re-ingested)
- **Location:** DB table `timesheets` (live data) vs. `api/src/routes/timesheets.js:100-127,192-209` (current, already-fixed column-resolution code) vs. `js/planning.js:1326,1333,1364-1367,1440-1442` (By Owner's consumption of `r.owner`) vs. `js/planning.js:1032,1117-1118,1138` (By Project view's Owner rows — same field, same corruption, second manifestation site, confirmed during this session)
- **Evidence:**
  ```sql
  -- docker exec pdash-db psql -U pdash -d pdash
  SELECT DISTINCT role, owner FROM timesheets, jsonb_to_recordset(data) AS x(role text, owner text, task text) LIMIT 20;
  --                 role                  |                 owner
  -- ---------------------------------------+---------------------------------------
  --  TDVI - HWGCRSVS - STUDIO DIRECTOR     | TDVI - HWGCRSVS - STUDIO DIRECTOR
  --  HWGDEV - DEVELOPER                    | HWGDEV - DEVELOPER
  --  HWGDEV - SR DEVELOPER                 | HWGDEV - SR DEVELOPER
  --  ... (10 rows, role and owner identical on every single row)

  SELECT id, project_code, uploaded_at FROM timesheets ORDER BY uploaded_at DESC LIMIT 10;
  --                   id                   |    project_code    |          uploaded_at
  -- --------------------------------------+--------------------+-------------------------------
  --  f9a7c75b-...                          | HITA.000001823.001 | 2026-06-29 23:06:11.507785+00
  --  4970eacd-...                          | HITA.000001823.003 | 2026-06-29 23:06:00.259079+00
  --  d13a2689-...                          | HITA.000001586.001 | 2026-06-29 23:02:49.277038+00
  --  5a58c7ff-...                          | HITA.000001201     | 2026-06-23 14:25:57.540227+00
  -- (4 rows — every upload predates 2026-07-06)
  ```
  ```js
  // js/planning.js:1322-1323,1326 — By Owner reads r.owner verbatim, no transformation
  recs.forEach(r => { const o = r.owner?.trim() || '—'; byOwner[o] = (byOwner[o] || 0) + r.hours; });
  ...
  roleRecs.forEach(r => { const o = r.owner?.trim() || '—'; ownerTotals[o] = (ownerTotals[o] || 0) + r.hours; });
  ```
  ```js
  // js/planning.js:1440,1442 — the group header literally displays r.owner's value
  Object.entries(ownerMap).sort((a, b) => a[0].localeCompare(b[0])).forEach(([ownerName, om]) => {
    const displayName = ownerName === '—' ? 'TBD' : ownerName;
  ```
- **Also confirmed in By Project** (`js/planning.js:930-1148`, `renderPortfolioPlanningByProjectContent`): this view's hierarchy is already `Project → Task → Role → Owner` exactly as expected (confirmed via its export header, `js/planning.js:990`: `['Project', 'Task', 'Role', 'Owner', ...]`, and its nested row rendering, `:1104-1146`) — not a structural bug. Its innermost Owner rows (`:1117-1118,1138`: `const ownerLabel = isPlaceholder ? '...TBD...' : esc(ownerName);`) read from the same `ownerTotals`/`ownerNames`, built at `:1032` from `r.owner?.trim() || '—'` — the identical corrupted field. Same root cause, second confirmed manifestation, no separate code defect.
- **Description / root cause:** every currently-stored timesheet row has `owner === role` (both hold role/team codes like `HWGDEV - DEVELOPER`, never a person's name) — this is exactly the "ambiguous header silently duplicated onto both fields" bug pattern that the 2026-07-06 column-mapping fix (`docs/superpowers/reports/2026-07-06-fix-timesheet-column-mapping-finish-cycle.md`) was built to prevent. All 4 timesheet uploads in the database predate that fix by 1-2 weeks; **zero uploads exist after 2026-07-06**. The fix changed `resolveColumnMap`'s *code path* for future uploads — it has no retroactive/backfill effect on rows already stored in `timesheets.data` before it shipped. `js/planning.js`'s By Owner view has no bug of its own here: it faithfully displays whatever string is in `r.owner`, and that string has been a role/team code since before the fix existed. This directly explains "abbiamo condotto un audit e un fix ma non mi sembra cambiato nulla" — the fix was never exercised against real data, because no timesheet was re-uploaded after it shipped.

### F2 — CONFIRMED: re-uploading the same source files today still fails to populate real owner names — the current fix's deliberate fallback does not yield a real name for this project's actual column layout
- **Type:** CONFIRMED BUG (upgraded from "unverified" after a live re-upload test)
- **Severity:** Important
- **Update (post-report):** the user performed a live re-upload test after this report was first written. It reproduces the failure — confirming this is not merely a theoretical risk. The user also confirmed the exact real column header that holds the person's name in the source XLS: **`Owner: name`**. Recorded here as a verified ground-truth fact for the fix cycle. `Owner: name` on its own would resolve correctly against the current keyword lists (`'owner'` is a substring of it, and none of role's candidates — `'role'`, `'ruolo'`, `'resource'` — match it), so the reproducing failure implies at least one *other* header in the real file's full column set collides with an earlier-priority field (most likely `role`, given F1's evidence) in a way not yet diagnosed from a single column name alone. The fix cycle should capture the **full real header list** from an actual source file (not just the one target column name) before changing `resolveColumnMap`, rather than guessing at the second colliding header.
- **Location:** `api/src/routes/timesheets.test.js:50-55` vs. `api/src/routes/timesheets.js:200-202`
- **Evidence:**
  ```js
  // api/src/routes/timesheets.test.js:50-55
  test('resolveColumnMap: "Resource Name" is claimed by role, not duplicated onto owner', () => {
    const map = resolveColumnMap(['Date', 'Resource Name', 'Hours', 'Task', 'Project ID']);
    assert.equal(map.colRole, 'Resource Name');
    assert.notEqual(map.colOwner, 'Resource Name');
    assert.equal(map.colOwner, undefined);
  });
  ```
  ```js
  // api/src/routes/timesheets.js:200-202
  colRole:     findCol('role', 'ruolo', 'resource'),
  colOwner:    findCol('owner', 'worker', 'name', 'nome'),
  ```
- **Description / root cause:** the 2026-07-06 fix resolved the *duplication* (both fields getting the same header) by giving `role` priority on any header that matches both fields' keyword lists — and this specific test, written as part of that fix, both documents and locks in the chosen resolution for a "Resource Name"-only sheet (no separate literal "Role" column): the whole column goes to `role`, and `owner` is deliberately left `undefined` rather than duplicated. This is a defensible choice in the abstract (no duplication), but it means: if the real source XLS files' person-identity column is headed something like "Resource Name" or "Resource" (matching role's `'resource'` keyword) and there is no *separate* column matching owner's keyword list (`'owner'`, `'worker'`, `'name'`, `'nome'`), a fresh upload today would **not** produce real owner names — it would produce `owner: null`, which `js/planning.js:1364` (`hasOwners = ownerNames.length > 0`) would render as the `'—'`/`TBD` placeholder for every row, not a role string, but also not the person's real name. Whether this is what would actually happen cannot be determined without either the original source file or a live re-upload test — no upload has occurred since the fix shipped (F1), so this has never been exercised against the real files in question.

## Ruled out (checked, no divergence found)

- **By Project's grouping hierarchy is already `Project → Task → Role → Owner`, matching the expected structure exactly** — confirmed via `js/planning.js:990` (export header) and the nested render blocks at `:1104-1146`. No structural/schema divergence in this view; the only defect is the data itself (F1/F2).
- **By Owner's grouping hierarchy is Owner → Project → Role, not Owner → Project → Task, by explicit design — not a bug.** The view's own in-app help text states this directly: `js/planning.js:1505-1510` (`<strong>Estimation logic (By Owner):</strong> The table is structured as <strong>Owner → Project → Role</strong>...`), and the third-level row (`js/planning.js:1476-1487`) is keyed on `res.role`/`pm.roles`, never on task. Task-level detail is not shown in this view at all — that's a scope/design fact the user should be aware of when comparing against the expected "Owner, nome progetto, nome task" hierarchy, but it's consistent within the app's own documented behavior for this view, not a divergence this audit is finding.
- **`js/planning.js`'s owner-matching/grouping logic itself** (`matchesTaskRole`, `computeResidual`, the past/future week distribution in `renderPortfolioPlanningByOwnerContent`): read in full, no divergence found relative to the by-role/by-project views' already-audited, already-fixed logic (Resource Planning audit, closed). This confirms the bug is entirely upstream, in the data, not in this view's rendering/aggregation code.
- **`resolveColumnMap`'s field-priority order and `used`-Set deduplication** (`api/src/routes/timesheets.js:192-209`): functions exactly as documented and tested — no header can be claimed by two fields simultaneously anymore. This part of the 2026-07-06 fix is confirmed working correctly; the residual question (F2) is about which *specific* field a real ambiguous header should resolve to for this project's actual source files, not about whether the deduplication mechanism itself works.

## Out of scope / roadmap notes

None — this audit stayed within the By Owner view and its upstream data path; nothing unrelated surfaced during the trace.

---

## Synthesis

F1 and F2 share a root cause at different points in time: F1 explains why the *currently displayed* data is wrong (it's stale, pre-fix data, never re-ingested since); F2 — now confirmed via a real re-upload test, not just reasoned from the code — explains why simply re-uploading the same files today does not fix it either. The real source column for the person's name is confirmed to be `Owner: name`; on its own this header would resolve correctly under the current keyword lists, so the reproducing failure points to at least one other header in the file colliding with an earlier-priority field (most plausibly `role`, per F1's duplicate-value evidence). The fix cycle needs the full real header list from an actual source file to diagnose and correct precisely, rather than adjusting `resolveColumnMap` against a guess.

Report ready. Next step: audit-to-brief to translate the findings into fix cycles, or stop here if the audit doesn't call for immediate fixes.
