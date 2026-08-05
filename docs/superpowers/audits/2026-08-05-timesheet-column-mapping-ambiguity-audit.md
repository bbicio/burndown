# XLS Timesheet Column-Mapping Keyword-Breadth Ambiguity — Audit

## Scope

Negotiated with the user: `resolveColumnMap()` (`api/src/routes/timesheets.js:198-215`) and its direct usage inside `POST /api/timesheets/upload` (`api/src/routes/timesheets.js:87-165`) only. Ground truth: the existing tests in `api/src/routes/timesheets.test.js` and the design spec at `docs/superpowers/specs/2026-07-13-timesheet-owner-role-mapping-fix-design.md` (the most recent prior fix to this area — the header/row key trimming mismatch, already resolved and out of scope here). Explicitly out of bounds per the negotiated scope: `formatDate()`/`parseFlexibleDate()` and row-level date/hours validation logic — a separate area, not touched by this audit.

A finding was pre-flagged going in: "the generic `'name'` keyword can claim a column before a more-specific field gets a chance" (carried forward across at least 6 prior finish-cycle reports since 2026-07-29, never investigated in detail). This audit's job was to determine whether that's a real, demonstrable defect or a theoretical concern, and if real, to characterize its actual scope and severity with evidence — not to fix it.

## Method

Static reading of `resolveColumnMap()`'s full candidate-keyword table (`api/src/routes/timesheets.js:206-213`), followed by empirical reproduction: an inlined, byte-identical copy of the function (the original can't run standalone outside the Express app without its dependencies, which aren't installed on the host) exercised against a set of constructed header-list scenarios chosen to test specific hypothesized collisions — both a "does this collide in principle" check (comparing candidate-keyword tables for shared substrings) and a "does it actually misfire, and under what conditions" check (running the real matching algorithm against realistic header lists, in different column orders). No code was modified during this audit.

## Findings

### F1 — Cross-field greedy matching: an early-declared field's broad keyword can silently claim a header meant for a later-declared field

**Type:** Data correctness / silent misassignment.
**Severity:** High — no error is ever raised; the upload succeeds, but the affected field is either populated with the wrong data (a different field's real value) or ends up `null` for every row. Demonstrated with header names that are more natural/plausible than the ones currently used in production.

**Evidence:**

`resolveColumnMap()`'s 8 fields are resolved via 8 sequential `findCol(...)` calls, in this fixed order (`api/src/routes/timesheets.js:206-213`):

```
colDate → colRole → colOwner → colHours → colTask → colNotes → colProjId → colProjName
```

Each `findCol` call (`:200-204`) scans the full header list for the *first* header (in header-array order) matching *any* of that field's candidate keywords via plain case-insensitive substring inclusion (`k.toLowerCase().includes(c.toLowerCase())`), then removes it from further consideration (`used.add(col)`). Critically: a field's keyword match is not required to be a *whole-word* or *exact* match — `'name'` matches inside `"Project Name"`, `"Task Name"`, `"Client Name"` equally.

`colOwner`'s candidate list (`:208`) is `'owner', 'worker', 'name', 'nome'` — the last two are single generic words, not owner-specific phrases. Because `colOwner` is resolved 3rd (before `colTask`, 5th, and `colProjName`, last), it can claim any header containing "name"/"nome" before those later fields ever get to test it, *provided* that header appears in the file's column order before whatever header `colOwner`'s own more-specific candidates (`'owner'`, `'worker'`) would otherwise have preferred.

Empirically reproduced (inlined copy of the exact function, run standalone):

```
resolveColumnMap(['Date', 'Role', 'Project Name', 'Hours', 'Task', 'Project ID'])
→ { colDate: 'Date', colRole: 'Role', colOwner: 'Project Name', colHours: 'Hours',
    colTask: 'Task', colNotes: undefined, colProjId: 'Project ID', colProjName: undefined }
```

`"Project Name"` — a completely ordinary, plausible header — is captured as the **owner** column. Every row's `owner` field is populated with the *project's name*, not a person's name; `colProjName` resolves to `undefined`, so `projectName` is `null` for every row. This reproduces identically even when a real, distinct `Owner` column also exists in the file, as long as `"Project Name"` happens to appear earlier in column order:

```
resolveColumnMap(['Date', 'Role', 'Project Name', 'Owner', 'Hours', 'Task', 'Project ID'])
→ colOwner: 'Project Name'   (same wrong result — the real 'Owner' column is never even reached)
```

...but resolves correctly if the real `Owner` column merely happens to appear *before* `Project Name` in the file:

```
resolveColumnMap(['Date', 'Role', 'Owner', 'Project Name', 'Hours', 'Task', 'Project ID'])
→ colOwner: 'Owner', colProjName: 'Project Name'   (correct)
```

This confirms the defect is genuinely **column-order-dependent** — the same header *names*, reordered, produce different (right or wrong) results. No file-content signal or validation distinguishes the two cases; whichever column physically comes first in the spreadsheet wins.

A second, more severe reproduction — `colTask` left entirely unresolved, not just misassigned:

```
resolveColumnMap(['Date', 'Role', 'Task Name', 'Hours', 'Project ID'])
→ { colDate: 'Date', colRole: 'Role', colOwner: 'Task Name', colHours: 'Hours',
    colTask: undefined, colProjId: 'Project ID', ... }
```

`"Task Name"` is arguably a *more* natural header for a task-name column than the currently-used production header (`"Task/Issue"` — see `docs/superpowers/specs/2026-07-13-timesheet-owner-role-mapping-fix-design.md`'s real header list). If a different XLS export template ever used `"Task Name"` instead, every uploaded row's `task` field would be `null`, silently breaking every downstream feature that groups or matches by task name — including the task/role matching logic fixed earlier in this session (`buildPlanningContext()`/`buildProjectSummary()`/`findRate()`, see `docs/superpowers/reports/2026-08-05-worktree-findrate-nullsafe-finish-cycle.md`) — those fixes make the matching *null-safe*, but a `null` task on every row still means zero rows ever match any configured task, not a crash but a silent, total loss of task-level attribution for the whole file.

The same class of collision reproduces in Italian, where it's *worse* — the real intended column is lost entirely, not just the wrong one populated:

```
resolveColumnMap(['Data', 'Ruolo', 'Nome Progetto', 'Nome Risorsa', 'Ore', 'Attività', 'Codice'])
→ { colDate: 'Data', colRole: 'Ruolo', colOwner: 'Nome Progetto', colHours: 'Ore',
    colTask: 'Attività', colNotes: undefined, colProjId: 'Codice', colProjName: undefined }
```

Both `"Nome Progetto"` (project name) and `"Nome Risorsa"` (resource/owner name) contain `'nome'`. `colOwner` claims the *first* one it encounters (`"Nome Progetto"`) and stops — `"Nome Risorsa"`, the column that should have been the real owner, is never assigned to anything and its data is entirely discarded, while `colOwner` is populated with project-name data.

**Root cause:** `colOwner`'s candidate list mixes two genuinely owner-specific words (`'owner'`, `'worker'`) with two maximally generic ones (`'name'`, `'nome'`) that have no inherent connection to "who owns this row" — they match any header whose *purpose* happens to involve naming something, not specifically a person. Combined with `resolveColumnMap`'s fixed field-processing order (an implementation detail — the order fields happen to be written in the returned object literal — not a deliberate priority scheme), this lets `colOwner`'s generic keywords act as a "vacuum" ahead of `colTask` and `colProjName`'s own, more specific candidates (`'projectname'`, `'project name'`, `'project_name'`, `'progetto'`), whenever the ambiguous header precedes the field's own true column in file order.

### F2 — Same-field ambiguity: no preference for an exact/closer keyword match over a merely-substring one

**Type:** Data correctness / silent misassignment.
**Severity:** Medium — narrower blast radius than F1 (only manifests when a *single* field's own candidate list matches multiple real headers in the same file), but the same "no error raised, column order decides" character.

**Evidence:**

```
resolveColumnMap(['Data Chiusura', 'Data', 'Ruolo', 'Ore', 'Codice'])
→ { colDate: 'Data Chiusura', colRole: 'Ruolo', colOwner: undefined, colHours: 'Ore',
    colTask: undefined, colNotes: undefined, colProjId: 'Codice', colProjName: undefined }
```

`colDate`'s own candidates (`'date', 'data'`) match *both* `"Data Chiusura"` ("closing date" — plausibly a different field entirely, e.g. a task-completion date, not the timesheet entry's date) and the real `"Data"` column. `findCol` (`:201`) takes the *first* header in array order that matches, with no mechanism to prefer an exact match (`"Data"` === `'data'`) over a mere substring match (`'data'` inside `"Data Chiusura"`). Here `"Data Chiusura"` happens to appear first, so it wins — the real `"Data"` column is never even considered (already excluded from the rest of the scan only because `colDate` stops at the first match; had `"Data"` appeared first, the result would have been correct).

**Root cause:** distinct from F1 — this isn't a cross-field priority problem, it's that `findCol`'s matching (`:201`) treats "contains the substring" and "is exactly the keyword" as equally good matches, with header-array position as the only tiebreaker. There is no scoring or preference step at all.

## Ruled out

- **The current production header set is safe today** — but only by coincidental column ordering, not because the underlying matching logic is sound. Verified against the exact real header list from `docs/superpowers/specs/2026-07-13-timesheet-owner-role-mapping-fix-design.md` (`Date | Job | Role: Name | Hour Type | Owner: Name | Hours | Task/Issue | Notes | D365 Project ID | WF Project Name`, already covered by `api/src/routes/timesheets.test.js:91-127`): `"Owner: Name"` happens to appear before `"WF Project Name"` in this specific file's column order, so `colOwner` correctly claims the former before ever reaching the latter. F1 is real and column-order-dependent, not merely theoretical, but it does not currently affect the one real file this codebase has direct evidence of.
- **`trimRowKeys()` / header-to-row-key trimming mismatch** (`api/src/routes/timesheets.js:190-194`) — the subject of the 2026-07-13 fix — confirmed unrelated to F1/F2; that fix addresses whitespace inconsistency between resolved header names and row-object keys, entirely orthogonal to *which* header a field's candidates match.
- **`colHours`'s (`'hours', 'ore', 'qty', 'quantity'`), `colNotes`'s (`'notes', 'note', 'description'`), and `colRole`'s (`'role', 'ruolo', 'resource'`) candidate lists**: checked pairwise against every other field's candidate list — no shared substrings found (e.g. `'resource'` does not appear inside any of `colOwner`'s, `colTask`'s, or `colProjId`'s candidates). `colRole`'s `'resource'` does collide with `colOwner`'s `'name'` at the *header* level (a header like `"Resource Name"` matches both) — already covered by an existing, passing test (`api/src/routes/timesheets.test.js:58-63`, `"Resource Name" is claimed by role, not duplicated onto owner`) documenting this specific case as intentional, accepted behavior (role wins since it's resolved first) — not a new finding, and not re-litigated here since the existing test already documents it as a deliberate trade-off, not an oversight.
- **`colProjId`'s `'codice'` vs `colTask`'s `'attività'`**: tested a header list with both `"Codice Attività"` and `"Codice Progetto"` present — resolved correctly (`colTask` claims `"Codice Attività"` via its own more specific `'attività'` match before `colProjId` is ever checked, since `colTask` is declared earlier; `colProjId` then correctly finds the remaining `"Codice Progetto"`). Not a defect in this specific configuration, though it demonstrates the same underlying fragility (F1's root cause) — included here as a "checked, no divergence in this instance" note, not a third finding, since no misassignment actually occurred.
- **Multer / XLSX parsing itself**: out of scope per the negotiated audit boundary (this audit covers `resolveColumnMap()` and its direct caller only) — not investigated here; no evidence gathered either way.

## Out of scope / roadmap notes

- **`formatDate()`/`parseFlexibleDate()` and row-level validation logic** — explicitly excluded from this audit's negotiated scope; not investigated.
- **No test currently exercises F1 or F2's exact scenarios.** `api/src/routes/timesheets.test.js`'s existing `resolveColumnMap` tests (lines 48-77) cover the "Resource Name claimed by role, not owner" case and confirm the *current* real production header list resolves correctly, but no test exercises the `"Project Name"`/`"Task Name"`/`"Nome Progetto"` collision scenarios this audit demonstrated. A fix cycle addressing F1/F2 should add regression tests for these specific scenarios, not just re-verify the existing ones still pass.
- **Design question for a fix cycle, not decided here** (per Step 4, this audit does not fix or design the fix): the two most obvious remediation directions — (a) make `colOwner`'s candidate list more specific (drop the bare `'name'`/`'nome'`, require a person-oriented compound like `'owner name'`/`'resource name'`/`'nome risorsa'`), versus (b) change `findCol`'s matching strategy to score matches by specificity (prefer an exact match, then a whole-word match, then substring) and/or process fields in specificity order rather than fixed declaration order — are different in scope and risk, and the choice affects real production header compatibility (option (a) risks *breaking* the current, working `"Owner: Name"` match if the replacement candidate list is too narrow). This is a genuine design decision for `/brainstorming`, not something this audit should preempt.

Report ready. Next step: audit-to-brief to translate the findings into fix cycles, or stop here if the audit doesn't call for immediate fixes.
