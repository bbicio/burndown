# test-cases.html derived from TEST_CASES.md at runtime — design

**Date:** 2026-10-09
**Scenario:** evolution of an existing feature
**Cycle:** Cycle 3 of the process-optimization initiative

## 1. Problem

`test-cases.html` (253.292 bytes, 2.988 lines) holds an inline `const SECTIONS = [...]`
(lines 210–2813) that duplicates `TEST_CASES.md` (204.202 bytes) case for case. The two
copies are kept in sync by hand, by §4 of `.claude/skills/sync-docs/SKILL.md`. That section
exists only because of the duplication: 11 of the last 12 sync commits touched both files,
and the HTML churns at 2–2,5× the rate of the file it duplicates.

Keeping two hand-maintained copies has already produced measurable drift (§3). The fix is to
delete the copy: the page fetches `TEST_CASES.md` and parses it.

## 2. Verified facts this design rests on

Measured on 2026-10-09, in this repo:

- `nginx.conf:82-88` — `location /` serves the repo root behind `auth_request /auth-check`,
  so `/TEST_CASES.md` is already served to a signed-in browser. No nginx change is needed.
  The deny list (`nginx.conf:66-73`) covers `node_modules`, `*.test.js`, `package*.json` and
  `vitest.config.js`; no rule touches `.md`.
- The same block ends with `try_files $uri $uri/ /index.html` and `error_page 401 = @to_login`.
  **A failed fetch therefore returns 200 with HTML, not a 404 or a 401.** Validity cannot be
  decided from `res.ok`.
- `nginx.conf:76-78` — `location ~ ^/(css|js)/` serves `js/` with no auth. A parser module
  under `js/lib/` is publicly readable, which is acceptable: it carries no data.
- `test-cases.html` contains zero `fetch(` calls and links no versioned asset. It starts with
  a UTF-8 BOM.
- Its state lives in `localStorage['pdash_test_state_v1']`, keyed by case id
  (`test-cases.html:2816-2822`). Preserving ids preserves recorded results.
- One section (`cfpot`, `test-cases.html:1345-1346`) uses `sub:[{title,start,end}]`, matched
  against case ids by lexicographic comparison in `renderContent`.
- `TEST_CASES.md` has 35 `##` headings and 4 `###` headings; `test-cases.html` has 36 sections.
- Case ids: 794 unique in the HTML, 797 in the Markdown.
- `scripts/classify-cycle.mjs:38-44` declares `RUNTIME_LOADED_ROOT_MD = []` with a comment
  naming this exact cycle as the one that must fill it.

## 3. Drift between the two copies, and what is done about it

Measured, not estimated:

| Finding | Detail | Action |
|---|---|---|
| Ids only in the HTML | `PL-30`, `PL-31`, `PL-33` | None — they exist in the Markdown as `PM-09`, `PM-10`, `PM-11` with equivalent text |
| Id only in the HTML, with no Markdown twin | `PL-32` "Planning model — loading and error states" | Added to the Markdown as `PM-12` |
| Ids only in the Markdown | `PM-09/10/11`, `PA-12`, `PA-M7/M8/M9` | None — the page gains them |
| Duplicate ids, in **both** files | `PL-01…PL-09`, used by both §7 Resource Planning and §29 Project currency lock | §29 is renamed to `PCL-01…PCL-09`. §7 keeps `PL-`: five historical reports under `docs/superpowers/reports/` cite `PL-0x` meaning Planning. Those reports are records and are not rewritten. |
| Two sections have a 4-column table, with no `Steps` | §API Security (`SEC-01…09`) and §Regression (`REG-01…06`), 24 data rows | A `Steps` column is added to both tables, copied from the corresponding objects in today's HTML |
| One row has an unescaped pipe | `NT-23`: `` `POST /api/exports/{portfolio|cost-grids|ratecards}` `` yields 7 cells | Escaped as `\|` in the Markdown |
| Field text diverges throughout | The HTML wording is often longer (e.g. `A-01`) | **Out of scope.** The Markdown is authoritative as it stands; ~790 texts are not rewritten. |

After these repairs the set of cases the page renders is a superset of today's, minus the
three renamed ids, and with `PCL-` in place of the colliding `PL-`.

## 4. The parser — `js/lib/test-cases-parse.js`

A new pure ES module: no dependency, no DOM access, no `window` bridge (its only consumer
imports it as a module). Two exports.

### `parseTestCases(markdown) → { updated, sections, warnings }`

A line-oriented state machine:

- `**Updated:** …` in the preamble fills `updated` (a string; `null` when absent).
- `## X` opens a section `{ id, title, cases: [] }`. `id` is the slug of the title
  (lowercased, non-alphanumerics collapsed to `-`), with a numeric suffix on collision. It is
  used only for the sidebar filter and the section block's DOM id, and is never persisted —
  changing it from today's hand-written ids (`auth`, `cfpot`, …) is harmless.
- `### X` does **not** open a section. It sets the current sub-label, which is written to
  `case.sub` on every following case until the next heading. The existing
  `sec.sub:[{title,start,end}]` range mechanism, and the lexicographic id comparison that
  drives it, are deleted.
- A table header row defines that table's columns. Two headers are recognised:
  `ID | Scenario | Steps | Expected | Auto` and the 4-column variant without `Steps`. Any
  other header: a warning, and the table is skipped.
- Each data row yields `{ id, scenario, steps, expected, auto, sub }`. `auto` is `'api'` for a
  bare `✓`, `'vitest'` when the cell mentions `vitest`, and `null` when the cell is empty.
- The separator row (`|---|---|…`) is skipped.

`warnings` is an array of human-readable strings. It collects: a row whose cell count does not
match its header, a case id that appears more than once in the document, a `###` outside any
`##`, and an unrecognised table header. **None of these aborts the parse** — the chosen
behaviour is tolerant, so a typo in the Markdown degrades the page instead of blanking it.

### `formatCell(text) → string`

Escapes `&`, `<`, `>`, `"` first, then applies exactly two substitutions **to the escaped
text**: `` `x` `` → `<code>x</code>` and `**x**` → `<strong>x</strong>`.

The order is the whole point: no markup originating in the Markdown can ever reach the DOM as
markup. The Markdown has 369 rows containing backticks, 19 containing `<…>` (e.g.
`<aside class="pd-nav">`) and 9 containing `**`. Today's page injects its hand-written inline
data through `innerHTML` with no escaping at all — safe only because a human wrote every
string. That stops being true the moment the text comes from a file.

## 5. The page — `test-cases.html`

From 2.988 lines to roughly 450 (~25 KB).

**Unchanged:** the whole stylesheet, the static markup, `localStorage['pdash_test_state_v1']`
and the shape of the state, `getS`/`nextS`/`saveState`, `secStats`/`globalStats`, the section
and status filters, the structure of `renderSidebar`/`renderTopbar`/`renderContent`/`render`,
and the "Reset all" button including its native `confirm()` — the page is outside `core.js`'s
reach and keeping it is deliberate.

**Changed:**

1. `const SECTIONS = [...]` is deleted. `SECTIONS` becomes a variable filled at startup.
2. The trailing `<script>` becomes `<script type="module">` and imports
   `./js/lib/test-cases-parse.js?v=1`. The `?v=` follows the project's cache-busting rule; it
   is the page's only versioned reference.
3. An `init()` runs `fetch('TEST_CASES.md', { cache: 'no-store' })`. Because of `try_files`,
   success is decided on the payload, not the status: the text must start with
   `# PDash — Test Cases`. Otherwise the content area shows, in English, *"Could not load
   TEST_CASES.md. Reload the page; if you are signed out, sign in first."* and the sidebar
   stays empty. The same message covers a network failure.
4. A non-empty `warnings` renders a yellow band above the content listing them. Visible, never
   blocking.
5. `renderContent` emits a sub-title whenever `c.sub` changes from the previous case, and
   passes every rendered field through `formatCell`.
6. Two badges instead of one: `auto === 'api'` keeps today's "API auto" badge, `auto ===
   'vitest'` gets a "vitest" badge — same shape, different colour, one new CSS rule.
7. The sidebar header shows `Updated: <value from the Markdown>` instead of
   `Last saved: <today's date>`, which corresponded to nothing.

The page stops working from `file://` (a fetch needs an origin). It is opened from the stack,
like every other page.

The file's UTF-8 BOM is preserved. Per project memory, it is edited with the Edit tool or a
byte-safe round trip — never through PowerShell's `Get-Content`/`Set-Content`.

## 6. Inherited obligation — the cycle classifier

The moment the page fetches it, `TEST_CASES.md` becomes a file the running app loads, and
therefore code. In this same cycle:

- `scripts/classify-cycle.mjs:44` becomes
  `export const RUNTIME_LOADED_ROOT_MD = ['TEST_CASES.md'];`, and the comment above it is
  rewritten — it no longer describes a planned future cycle.
- `scripts/classify-cycle.test.js` gains a case pinning the consequence: a diff touching only
  `TEST_CASES.md` classifies as `ordinary`, not `no-code`. A second case confirms an unrelated
  root `.md` still classifies as `no-code`, so the exception stays narrow.

Without this, a future cycle editing only `TEST_CASES.md` would be classified as a no-code
cycle and would skip human verification while changing what a page renders.

## 7. Documentation

- `.claude/skills/sync-docs/SKILL.md`: §4 (`test-cases.html`, line 32) is deleted. §5→4, §6→5,
  §6b→5b, §7→6, §8→7, and the internal references are updated (the summary rule at line 83
  cites "section 8" for project memory). §3 `TEST_CASES.md` gains one line stating that
  `test-cases.html` derives from the file at runtime, so there is no second copy to mirror.
- `.claude/commands/finish-cycle.md:143`: `test-cases.html` is removed from the inline list of
  `/sync-docs`'s scope.
- `CLAUDE.md`: a one-line File-structure entry for `js/lib/test-cases-parse.js`, and the
  existing mention of `test-cases.html` (line 149) extended to say the page is generated from
  `TEST_CASES.md` at runtime.
- `docs/js/lib.md`: a section for the new module, per the routing rule.

Historical plans and reports under `docs/superpowers/` that describe the old mirroring duty are
records of what was true then, and are not rewritten.

## 8. Testing

**Unit — `js/lib/test-cases-parse.test.js` (vitest):** preamble and `updated`; a single
section; `###` → `case.sub`; the 5-column and 4-column table shapes; `auto` in its three
forms; a row with too many cells → warning, case skipped; a duplicate id → warning, both cases
kept; an orphan `###`; colliding slugs disambiguated; `formatCell` against
`<aside class="pd-nav">`, against a backticked span, against `**bold**`, and against a
backticked span that itself contains `<` (escape first, format second).

**Characterization:** one test parses the real `TEST_CASES.md` from disk and asserts
`warnings.length === 0` and at least 797 cases. This is the test that stops a future
`/sync-docs` from breaking the page by writing malformed Markdown.

**Node (`node --test`):** the new `scripts/classify-cycle.test.js` cases.

**Manual, in a browser — required, no §3 waiver:** the page opened on the running stack;
section and case counts; both filter dimensions; the three-state toggle; persistence across a
reload; "Reset all"; the `Updated:` line; both badges; a row added by hand to `TEST_CASES.md`
appearing after a reload with no HTML edit; and the failure path (fetch a non-existent name)
showing the message rather than a blank page.

## 9. Acceptance criteria

1. `test-cases.html` contains no case object (`grep -c "scenario:'" test-cases.html` → 0) and
   is under 30 KB.
2. It contains exactly one `fetch`, targeting `TEST_CASES.md`.
3. On the running stack, signed in: sidebar, stats bar, both filters, the toggle, "Reset all"
   and persistence across a reload behave as before — verified by hand, not only by tests.
4. The number of sections and cases rendered matches an independent count taken from
   `TEST_CASES.md`.
5. Adding a row to a table in `TEST_CASES.md` and reloading shows the new case, with no edit to
   `test-cases.html`.
6. A failed fetch shows a readable English message, not a blank page and not an unhandled
   console error.
7. `npm test` passes, including the new parser tests and the characterization test.
8. `.claude/skills/sync-docs/SKILL.md` has no §4 about `test-cases.html`, is renumbered with no
   gaps, and no internal reference points at a number that no longer exists.
9. `scripts/classify-cycle.mjs` exports `RUNTIME_LOADED_ROOT_MD = ['TEST_CASES.md']` and
   `node --test scripts/classify-cycle.test.js` passes with the new cases.

## 10. Explicitly out of scope

- Reconciling the two copies' wording field by field, beyond the targeted repairs in §3.
- Renumbering or reorganising the sections of `TEST_CASES.md`.
- Restyling `test-cases.html` or aligning it with the app's design tokens.
- Adding the page to CLAUDE.md's Pages table or to the app navigation.
- Making the Markdown drive `test-api.js` or anything else.
- Replacing the native `confirm()` behind "Reset all" with the project's modal.
- Rendering the Markdown preamble's legend block.
