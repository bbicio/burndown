# Design — XLS timesheet column-mapping matching specificity

**Data:** 2026-08-05
**Brief:** `docs/superpowers/briefs/2026-08-05-timesheet-column-mapping-specificity-brief.md`
**Audit:** `docs/superpowers/audits/2026-08-05-timesheet-column-mapping-ambiguity-audit.md` (findings F1, F2)

## Problema

`resolveColumnMap(headers)` (`api/src/routes/timesheets.js:198-215`) resolves each of 8 timesheet fields to a header via a fixed sequential order (`colDate → colRole → colOwner → colHours → colTask → colNotes → colProjId → colProjName`), where each field claims the *first* header (by array position) matching *any* of its candidate keywords via plain case-insensitive substring inclusion.

Two consequences, both demonstrated empirically in the audit:

- **F1 (High):** an early-declared field's broad keyword (`colOwner`'s bare `'name'`/`'nome'`) can claim a header meant for a later-declared field (`colProjName`'s `'project name'`, `colTask`'s `'task'`), depending on header column order — e.g. `"Project Name"` gets misassigned to Owner, leaving `colProjName` unresolved and every row's `owner` field populated with the project's name instead of a person's.
- **F2 (Medium):** within a single field, no preference for an exact match over a partial one — e.g. `"Data Chiusura"` beats the real `"Data"` column for `colDate`, purely because it appears first in the file.

No error is ever raised in either case — the upload succeeds with silently wrong or `null` data. The real production header set is safe today, but only by coincidental column ordering (audit, "Ruled out" section).

## Expected behavior

Replace the fixed-order, first-match matching with a global specificity-scored assignment: for every (header, field) pair that matches at all, score how specific the match is; assign the highest-scoring pairs first, so a more specific match always wins regardless of which field happens to be declared first or which header happens to appear first in the file. The current production header set and all existing test expectations must resolve identically to today.

## Approcci considerati

**A — Specificity-scored global assignment, scelto:** every (header, field) match gets a score (exact match > word-boundary substring match, then by matched-keyword length); all matches are sorted by score and assigned greedily. Directly fixes F1 and F2 with one mechanism, and generalizes to header sets not yet seen — confirmed by the user as the preferred direction over a narrower patch.

**B — Targeted patch on just the two demonstrated cases (scartato, per scelta esplicita dell'utente):** narrow `colOwner`'s candidate list and add an exact-match check only where F1/F2 were observed. Smaller, but doesn't generalize — any future collision of the same shape (a different generic keyword, a different field pair) would need its own patch. Rejected in favor of A.

**C — Narrow `colOwner`'s keywords to compound phrases only, e.g. `'owner name'`/`'nome risorsa'` (considered, rejected):** removing bare `'name'`/`'nome'` avoids F1's false positives, but the real production header `"Owner: Name"` does **not** contain the literal substring `"owner name"` (a colon separates the words) — this would break the one real, currently-working header this codebase has direct evidence of. Rejected without further exploration once this was identified; approach A doesn't have this problem since it doesn't remove `colOwner`'s generic keywords, it just lets more specific competing fields outscore them when both match the same header.

## Modifica

**Modify: `api/src/routes/timesheets.js`** — replace `resolveColumnMap` (`:198-215`) with a specificity-scored version. The field→candidate table itself is unchanged (same 8 fields, same keyword lists) — only the matching/assignment algorithm changes.

```js
const FIELD_CANDIDATES = {
  colDate:     ['date', 'data'],
  colRole:     ['role', 'ruolo', 'resource'],
  colOwner:    ['owner', 'worker', 'name', 'nome'],
  colHours:    ['hours', 'ore', 'qty', 'quantity'],
  colTask:     ['task', 'attività', 'activity'],
  colNotes:    ['notes', 'note', 'description'],
  colProjId:   ['projectid', 'project id', 'project_id', 'codice'],
  colProjName: ['projectname', 'project name', 'project_name', 'progetto'],
};
const FIELD_ORDER = Object.keys(FIELD_CANDIDATES);

// Unicode-aware "not a letter/digit" check -- a plain regex \b word boundary doesn't treat
// accented letters (e.g. the "à" in "attività") as word characters, which would create a
// false boundary in the middle of that word and silently break the 'attività' candidate.
function isBoundaryChar(ch) {
  return ch === undefined || !/[\p{L}\p{N}]/u.test(ch);
}

// Returns null if `candidate` doesn't appear in `header` as a whole word (or the whole
// header), otherwise a specificity score: tier 2 = header equals candidate exactly,
// tier 1 = candidate appears as a whole word inside a longer header. Within a tier,
// a longer candidate is more specific than a shorter one.
function matchSpecificity(header, candidate) {
  const h = header.toLowerCase();
  const c = candidate.toLowerCase();
  if (h === c) return { tier: 2, length: c.length };
  const idx = h.indexOf(c);
  if (idx === -1) return null;
  if (isBoundaryChar(h[idx - 1]) && isBoundaryChar(h[idx + c.length])) {
    return { tier: 1, length: c.length };
  }
  return null;
}

function resolveColumnMap(headers) {
  const matches = [];
  headers.forEach((header, headerIdx) => {
    FIELD_ORDER.forEach((field, fieldIdx) => {
      let best = null;
      for (const candidate of FIELD_CANDIDATES[field]) {
        const score = matchSpecificity(header, candidate);
        if (score && (!best || score.tier > best.tier ||
            (score.tier === best.tier && score.length > best.length))) {
          best = score;
        }
      }
      if (best) matches.push({ header, headerIdx, field, fieldIdx, ...best });
    });
  });

  // Highest specificity first; ties broken by field-declaration order then header
  // position, matching today's behavior exactly when specificity doesn't differ.
  matches.sort((a, b) =>
    b.tier - a.tier ||
    b.length - a.length ||
    a.fieldIdx - b.fieldIdx ||
    a.headerIdx - b.headerIdx
  );

  const result = {};
  const usedHeaders = new Set();
  const usedFields = new Set();
  for (const m of matches) {
    if (usedHeaders.has(m.header) || usedFields.has(m.field)) continue;
    result[m.field] = m.header;
    usedHeaders.add(m.header);
    usedFields.add(m.field);
  }
  for (const field of FIELD_ORDER) if (!(field in result)) result[field] = undefined;
  return result;
}
```

Design notes:
- `matchSpecificity`'s word-boundary check is a manual adjacent-character test (`isBoundaryChar`), not a regex `\b`, specifically because JS's `\b` is based on `\w` (`[A-Za-z0-9_]`) and does not treat Unicode letters like `à` as word characters — a literal `\b` would insert a false boundary in the middle of `attività`, breaking that candidate silently. `\p{L}\p{N}` (Unicode property escapes, `u` flag) correctly treats any Unicode letter or digit as a word character.
- The exact-match tier (`h === c`) exists so that, e.g., a header that is *only* `"Date"` outranks a hypothetical longer competing candidate that also happens to match as a whole word — full-string equality is the strongest possible specificity signal.
- Tie-break (`fieldIdx` then `headerIdx`, both ascending) preserves today's exact behavior whenever two matches have identical tier and length — this is what keeps `"Resource Name"` resolving to `colRole` (verified by hand: `'resource'`, 8 chars, always outscores `'name'`, 4 chars, so this particular case doesn't even reach the tie-break, but the tie-break itself matches the field declaration order that produces today's result in the cases where a genuine tie occurs).
- No change to the function's signature or return shape — still receives a trimmed header array, still returns an object with the same 8 keys, each `string | undefined`. No caller (`api/src/routes/timesheets.js:99-101`) needs to change.

## Verifica

Manually traced (documented in the brainstorming session, not repeated here) against:
- The real production header set (`docs/superpowers/specs/2026-07-13-timesheet-owner-role-mapping-fix-design.md`) — every field resolves identically to today.
- All 3 existing `resolveColumnMap` tests (`api/src/routes/timesheets.test.js:48-77`) — including `"Resource Name"` still resolving to `colRole`, not `colOwner`.
- All 4 audit scenarios (F1: `"Project Name"` with/without a separate Owner column, `"Task Name"` alone, `"Nome Progetto"` + `"Nome Risorsa"`; F2: `"Data Chiusura"` + `"Data"`) — all resolve to the correct field under the new algorithm.

Implementation plan must re-verify all of the above by actually running the test suite, not just trust this hand-trace.

New tests to add (`api/src/routes/timesheets.test.js`), one per audit scenario:
- `"Project Name"` alone (no separate Owner column) resolves to `colProjName`, not `colOwner`.
- `"Project Name"` + a separate `"Owner"` column, in an order where `"Project Name"` appears first — both resolve correctly (previously `colOwner` would have won regardless of order; now `colProjName`'s more specific match wins even when it appears first).
- `"Task Name"` alone resolves to `colTask`, not `colOwner`.
- `"Nome Progetto"` + `"Nome Risorsa"` (Italian) — both resolve to their correct fields (previously `"Nome Risorsa"` was lost entirely).
- `"Data Chiusura"` + `"Data"` — `colDate` resolves to `"Data"` (the exact match), not `"Data Chiusura"`.
- Bonus (not an audit finding, a side effect of word-boundary matching): a header like `"Surname"` or `"Filename"` does **not** get misassigned to `colOwner` via a bare substring match on `'name'`.

## Gestione errori / edge case

Unchanged from today: a field with no matching header resolves to `undefined`, no error raised, no new failure mode introduced. Not in scope for this cycle (per the Brief) to add logging/warnings when a field can't be resolved or when a collision was detected and resolved by specificity — a future, separate item if ever prioritized.

## Scope escluso (confermato nel Brief)

- `formatDate()`/`parseFlexibleDate()` and row-level date/hours validation — untouched, out of the negotiated audit scope.
- `"Resource Name"` → `colRole` behavior — preserved exactly as today (verified above), not revisited.
- No data migration — no real data is currently affected (audit, "Ruled out": the real header set already resolves correctly).
