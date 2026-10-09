# test-cases.html from TEST_CASES.md — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `test-cases.html` renders from `TEST_CASES.md` fetched at runtime, so the two copies of ~800 test cases become one.

**Architecture:** A pure ES module under `js/lib/` turns the Markdown into the `SECTIONS` array the page already renders, plus a warning list. The page keeps its stylesheet, state and renderers, loses its 2.600-line inline data block, and fetches the Markdown on load. `TEST_CASES.md` gets three targeted repairs first so it parses cleanly; `scripts/classify-cycle.mjs` is told the file is now runtime-loaded code.

**Tech Stack:** Plain ES modules, no build step, no dependency. vitest + jsdom for tests (`npm test`). nginx already serves both files.

**Spec:** `docs/superpowers/specs/2026-10-09-test-cases-from-markdown-design.md`

## Global Constraints

- All user-facing text in English.
- No bundler, no build step: `js/lib/test-cases-parse.js` is a native ES module with `export function`.
- `test-cases.html` starts with a UTF-8 BOM. Preserve it. Never edit repo HTML through PowerShell `Get-Content`/`Set-Content` (it rewrites the BOM) — use the Edit/Write tools.
- Cache-busting: the page's import of `js/lib/test-cases-parse.js` carries `?v=1`.
- `TEST_CASES.md` is LF today and must stay LF.
- The page's `localStorage` key stays `pdash_test_state_v1` and stays keyed by case id.
- `scripts/classify-cycle.test.js` is a **vitest** file (`vitest.config.js` includes `scripts/**/*.test.js`), run by `npm test`, not `node --test`.
- Frontend tests run natively on the host (Node 24): `npm test`, ~48 s. `npm ci` once per fresh worktree.

## Review Focus

1. **CRLF line endings.** `TEST_CASES.md` is LF now, but `CLAUDE.md` and `scripts/classify-cycle.mjs` in this repo are CRLF; a Windows editor flipping the file would leave `\r` on every line and break every match if the parser splits on `\n` alone. → Task 1.
2. **A leading UTF-8 BOM.** It would defeat both the parser's first-line match and the page's `# PDash — Test Cases` payload check. → Task 1 and Task 3.
3. **An escaped pipe `\|` inside a cell** must yield a literal `|` in the text, not a cell boundary. The `NT-23` repair in Task 2 introduces exactly this. → Task 1.
4. **An unbalanced backtick or `**` in a cell** must degrade to literal text, never to an unclosed `<code>`/`<strong>` that swallows the rest of the page. → Task 1.
5. **A `##` section with no table** (prose only) must produce a section with zero cases and no division by zero in the percentage. → Task 1 and Task 3.

---

### Task 1: The parser module

**Files:**
- Create: `js/lib/test-cases-parse.js`
- Test: `js/lib/test-cases-parse.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parseTestCases(markdown: string) → { updated: string|null, sections: Section[], warnings: string[] }`
  - `formatCell(text: string) → string`
  - `Section = { id: string, title: string, cases: Case[] }`
  - `Case = { id: string, scenario: string, steps: string, expected: string, auto: 'api'|'vitest'|null, sub: string|null }`

No `window.<name>` bridge: the only consumer imports the module.

- [ ] **Step 1: Write the failing tests** in `js/lib/test-cases-parse.test.js`

```js
import { describe, it, expect } from 'vitest';
import { parseTestCases, formatCell } from './test-cases-parse.js';

const MD = [
  '# PDash — Test Cases',
  '',
  '**Updated:** 2026-07-01 (rev 8)  ',
  '',
  '## 1. Authentication',
  '',
  '| ID | Scenario | Steps | Expected | Auto |',
  '|---|---|---|---|---|',
  '| A-01 | Login | POST /login | 200 | ✓ |',
  '| A-02 | Logout | Click | Cookie cleared | |',
  '| A-03 | Meter | Type | Four segments | ✓ (vitest) |',
  '',
  '## 2. Pots',
  '',
  '### View A — list',
  '',
  '| ID | Scenario | Expected | Auto |',
  '|---|---|---|---|',
  '| PT-01 | List loads | Rows shown | |',
].join('\n');

describe('parseTestCases', () => {
  it('reads the Updated line', () => {
    expect(parseTestCases(MD).updated).toBe('2026-07-01 (rev 8)');
  });

  it('builds one section per ## heading, with slug ids', () => {
    const { sections } = parseTestCases(MD);
    expect(sections.map((s) => s.id)).toEqual(['1-authentication', '2-pots']);
    expect(sections[0].title).toBe('1. Authentication');
    expect(sections[0].cases).toHaveLength(3);
  });

  it('reads auto in its three forms', () => {
    const [a1, a2, a3] = parseTestCases(MD).sections[0].cases;
    expect([a1.auto, a2.auto, a3.auto]).toEqual(['api', null, 'vitest']);
  });

  it('accepts the 4-column shape with an empty steps', () => {
    const c = parseTestCases(MD).sections[1].cases[0];
    expect(c).toMatchObject({ id: 'PT-01', scenario: 'List loads', steps: '', expected: 'Rows shown' });
  });

  it('turns ### into a sub-label on the following cases, not a section', () => {
    const { sections } = parseTestCases(MD);
    expect(sections).toHaveLength(2);
    expect(sections[1].cases[0].sub).toBe('View A — list');
    expect(sections[0].cases[0].sub).toBeNull();
  });

  it('parses CRLF input identically to LF', () => {
    expect(parseTestCases(MD.replace(/\n/g, '\r\n'))).toEqual(parseTestCases(MD));
  });

  it('ignores a leading UTF-8 BOM', () => {
    expect(parseTestCases('﻿' + MD)).toEqual(parseTestCases(MD));
  });

  it('reads an escaped pipe as a literal pipe inside one cell', () => {
    const md = '## S\n\n| ID | Scenario | Steps | Expected | Auto |\n|---|---|---|---|---|\n| X-01 | a\\|b | s | e | |';
    const { sections, warnings } = parseTestCases(md);
    expect(warnings).toEqual([]);
    expect(sections[0].cases[0].scenario).toBe('a|b');
  });

  it('warns and skips a row whose cell count does not match its header', () => {
    const md = '## S\n\n| ID | Scenario | Steps | Expected | Auto |\n|---|---|---|---|---|\n| X-01 | a|b | s | e | |';
    const { sections, warnings } = parseTestCases(md);
    expect(sections[0].cases).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('X-01');
  });

  it('warns on a duplicate id but keeps both cases', () => {
    const md = '## A\n\n| ID | Scenario | Steps | Expected | Auto |\n|---|---|---|---|---|\n| X-01 | a | s | e | |\n\n## B\n\n| ID | Scenario | Steps | Expected | Auto |\n|---|---|---|---|---|\n| X-01 | b | s | e | |';
    const { sections, warnings } = parseTestCases(md);
    expect(sections[0].cases).toHaveLength(1);
    expect(sections[1].cases).toHaveLength(1);
    expect(warnings.join(' ')).toContain('X-01');
  });

  it('warns on a ### before any ##', () => {
    expect(parseTestCases('### orphan\n').warnings).toHaveLength(1);
  });

  it('warns on an unrecognised table header and skips its rows', () => {
    const md = '## S\n\n| Foo | Bar |\n|---|---|\n| 1 | 2 |';
    const { sections, warnings } = parseTestCases(md);
    expect(sections[0].cases).toHaveLength(0);
    expect(warnings).toHaveLength(1);
  });

  it('gives a prose-only section zero cases without failing', () => {
    const { sections, warnings } = parseTestCases('## S\n\nJust prose.\n');
    expect(sections[0].cases).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('disambiguates colliding slugs', () => {
    const { sections } = parseTestCases('## Same\n\n## Same\n');
    expect(sections.map((s) => s.id)).toEqual(['same', 'same-2']);
  });
});

describe('formatCell', () => {
  it('escapes markup before formatting it', () => {
    expect(formatCell('<aside class="pd-nav">')).toBe('&lt;aside class=&quot;pd-nav&quot;&gt;');
  });

  it('renders backticks as code and ** as strong', () => {
    expect(formatCell('open `/login.html` now')).toBe('open <code>/login.html</code> now');
    expect(formatCell('**Auto** = covered')).toBe('<strong>Auto</strong> = covered');
  });

  it('escapes inside a code span too', () => {
    expect(formatCell('`<br>`')).toBe('<code>&lt;br&gt;</code>');
  });

  it('leaves an unbalanced backtick or ** as literal text', () => {
    expect(formatCell('a ` b')).toBe('a ` b');
    expect(formatCell('a ** b')).toBe('a ** b');
  });

  it('escapes an ampersand first, so an entity is not double-decoded', () => {
    expect(formatCell('a & b')).toBe('a &amp; b');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- js/lib/test-cases-parse.test.js`
Expected: FAIL — cannot resolve `./test-cases-parse.js`.

- [ ] **Step 3: Implement `js/lib/test-cases-parse.js`**

`parseTestCases` is a line machine over `markdown.replace(/^﻿/, '').split(/\r?\n/)`:

- `**Updated:** …` → `updated`, trimmed of the Markdown hard-break spaces.
- `^## (.+)` opens a section; `^### (.+)` sets the current sub-label (warn when no section is open); any heading resets the current table's column layout.
- A line starting with `|` is a table line. Split cells with `line.split(/(?<!\\)\|/)`, drop the leading and trailing empties, `trim()` each, then replace `\|` with `|`.
- An all-`-` row is the separator and is skipped.
- A row whose lowercased cells equal `['id','scenario','steps','expected','auto']` or `['id','scenario','expected','auto']` is the header and sets the layout; any other header warns and clears the layout so its rows are skipped.
- A data row with no layout warns once per table; a data row whose cell count differs from the layout warns, naming its first cell, and is skipped.
- `auto`: `'vitest'` when the cell contains `✓` and matches `/vitest/i`, `'api'` when it contains `✓`, else `null`.
- Section `id`: `title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')`, falling back to `'section'`, with `-2`, `-3` … appended on collision.
- Every case id is recorded in a `Set`; a repeat adds a warning and the case is still kept.

`formatCell(text)` escapes `&`, `<`, `>`, `"` in that order, then replaces `` /`([^`]+)`/g `` with `<code>$1</code>` and `/\*\*([^*]+)\*\*/g` with `<strong>$1</strong>`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- js/lib/test-cases-parse.test.js`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add js/lib/test-cases-parse.js js/lib/test-cases-parse.test.js
git commit -m "feat: parse TEST_CASES.md into the test-cases page data model"
```

---

### Task 2: Repair `TEST_CASES.md` so it parses cleanly

**Files:**
- Modify: `TEST_CASES.md`
- Test: `js/lib/test-cases-parse.test.js` (append a characterization block)

**Interfaces:**
- Consumes: `parseTestCases` from Task 1.
- Produces: a `TEST_CASES.md` that parses with zero warnings and a non-empty `steps` on every case — the precondition Task 3 relies on.

- [ ] **Step 1: Write the failing characterization test**

Append to `js/lib/test-cases-parse.test.js`:

```js
import { readFileSync } from 'node:fs';

describe('the real TEST_CASES.md', () => {
  const parsed = parseTestCases(readFileSync('TEST_CASES.md', 'utf8'));

  it('parses with no warnings', () => {
    expect(parsed.warnings).toEqual([]);
  });

  it('yields at least 797 cases across at least 35 sections', () => {
    const cases = parsed.sections.flatMap((s) => s.cases);
    expect(cases.length).toBeGreaterThanOrEqual(797);
    expect(parsed.sections.length).toBeGreaterThanOrEqual(35);
  });

  it('gives every case a non-empty steps', () => {
    const empty = parsed.sections.flatMap((s) => s.cases).filter((c) => !c.steps);
    expect(empty.map((c) => c.id)).toEqual([]);
  });

  it('has no duplicate case id', () => {
    const ids = parsed.sections.flatMap((s) => s.cases).map((c) => c.id);
    expect(ids.length).toBe(new Set(ids).size);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- js/lib/test-cases-parse.test.js`
Expected: FAIL on three of the four — a cell-count warning for `NT-23` and nine duplicate-id warnings; 24 cases with an empty `steps`; `PL-01…PL-09` duplicated.

- [ ] **Step 3: Escape the pipe in `NT-23`**

In the `NT-23` row, write the export path as `` `POST /api/exports/{portfolio\|cost-grids\|ratecards}` ``.

- [ ] **Step 4: Rename the colliding family**

In `## 29. Project currency lock (2026-10-01)` (`TEST_CASES.md:1041-1049`), rename `PL-01…PL-09` to `PCL-01…PCL-09`. Do not touch `## 7. Resource Planning` (`:345-353`), which keeps `PL-`: five reports under `docs/superpowers/reports/` cite `PL-0x` meaning Planning. Check the section's own prose for an in-text `PL-0x` reference and rename it too.

- [ ] **Step 5: Give the two 4-column tables a `Steps` column**

`## API — Security and Validation` (`SEC-01…09`) and the Regression section (`REG-01…06`): change the header to `| ID | Scenario | Steps | Expected | Auto |`, extend the separator row to five columns, and fill each row's `Steps` from the matching object still present in `test-cases.html` (`steps:'…'` — Task 3 deletes them, so this step must happen first). Escape any `|` in the copied text.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- js/lib/test-cases-parse.test.js`
Expected: PASS, all four characterization cases.

- [ ] **Step 7: Commit**

```bash
git add TEST_CASES.md js/lib/test-cases-parse.test.js
git commit -m "fix: make TEST_CASES.md parse cleanly (escaped pipe, PCL- rename, Steps column)"
```

---

### Task 3: Convert the page

**Files:**
- Modify: `test-cases.html`

**Interfaces:**
- Consumes: `parseTestCases`, `formatCell` from Task 1; the repaired `TEST_CASES.md` from Task 2.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Delete the inline data and switch the script to a module**

Remove `const SECTIONS = [ … ];` (`test-cases.html:210-2813`) and declare `let SECTIONS = [];` in its place. Change the trailing `<script>` opening tag to `<script type="module">` and add, as its first statement, `import { parseTestCases, formatCell } from './js/lib/test-cases-parse.js?v=1';`. Keep the BOM and the stylesheet untouched.

- [ ] **Step 2: Add the loader**

Replace the final `render();` with an `init()` that awaits `fetch('TEST_CASES.md', { cache: 'no-store' })`, reads `await res.text()`, strips a leading `﻿`, and treats the payload as valid only when it starts with `# PDash — Test Cases`. `res.ok` is not a valid test: `nginx.conf`'s `try_files $uri $uri/ /index.html` and `error_page 401 = @to_login` make a missing file or a signed-out session return 200 with HTML.

On a valid payload: assign `SECTIONS` and `updated` from the parse result, render the warnings band when `warnings.length`, then `render()`.

On anything else (invalid payload or a thrown fetch): write into `#content`
`Could not load TEST_CASES.md. Reload the page; if you are signed out, sign in first.`
and leave the sidebar empty.

- [ ] **Step 3: Update the three renderers**

- `renderSidebar`: the `<small>` shows `Updated: ${updated}` when `updated` is set, and nothing when it is not — replacing `Last saved: ${new Date().toLocaleDateString()}`.
- `renderContent`: delete the `sec.sub` / `subMap` range block; emit `<div class="sub-title">` whenever `c.sub` differs from the previous rendered case's `sub`. Pass `c.scenario`, `c.steps` and `c.expected` through `formatCell`. Replace the single `c.auto ? 'API auto' : ''` badge with `'api'` → `<span class="auto-badge">API auto</span>` and `'vitest'` → `<span class="auto-badge vitest">vitest</span>`.
- Keep the existing `total > 0 ?` guard in both percentage computations, so a section with no cases renders at 0%.

- [ ] **Step 4: Add the two CSS rules**

Next to `.auto-badge` (`test-cases.html:163-167`): `.auto-badge.vitest { background: #f0fdf4; color: #15803d; }` and a `.warn-band` rule (amber background, left border, small text, same 20px/24px padding rhythm as `.content`).

- [ ] **Step 5: Verify the file mechanically**

Run:
```bash
grep -c "scenario:'" test-cases.html; grep -c "fetch(" test-cases.html; wc -c test-cases.html
head -c 3 test-cases.html | xxd | head -1
```
Expected: `0`, `1`, a size under 30.000 bytes, and `efbbbf` as the first three bytes (the BOM survived).

- [ ] **Step 6: Verify it in the browser — required, no waiver**

With the main stack up and signed in, open `http://localhost/test-cases.html` and check: the section count and the per-section counts match `parseTestCases` run over the same file; the section filter and the status pills; the three-state toggle; a reload keeps the recorded results; "Reset all" clears them; the `Updated:` line shows the Markdown's value; both badges appear; a backticked path renders as code and no raw `<` leaks into the layout. Then append a row to a table in `TEST_CASES.md`, reload, and see it — with no edit to the HTML; revert the row. Finally point the fetch at a non-existent name for one reload and confirm the error message, then restore it.

- [ ] **Step 7: Commit**

```bash
git add test-cases.html
git commit -m "feat: render test-cases.html from TEST_CASES.md at runtime"
```

---

### Task 4: Teach the cycle classifier that TEST_CASES.md is code

**Files:**
- Modify: `scripts/classify-cycle.mjs:38-44`
- Test: `scripts/classify-cycle.test.js` (test 7)

**Interfaces:**
- Consumes: nothing.
- Produces: `RUNTIME_LOADED_ROOT_MD === ['TEST_CASES.md']`.

- [ ] **Step 1: Rewrite test 7 so it fails**

Test 7 currently asserts the list is empty and that `TEST_CASES.md` is `no-code`. Replace its body with:

```js
  it('7: TEST_CASES.md is runtime-loaded code, other root .md files are not', () => {
    // test-cases.html fetches it at runtime (2026-10-09), so a cycle touching
    // only this file still changes what a page renders.
    expect(RUNTIME_LOADED_ROOT_MD).toEqual(['TEST_CASES.md']);
    expect(classifyNameStatus(Z('M', 'TEST_CASES.md')).kind).toBe('ordinary');
    expect(classifyNameStatus(Z('M', 'PRD.md')).kind).toBe('no-code');
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- scripts/classify-cycle.test.js`
Expected: FAIL — the list is `[]` and `TEST_CASES.md` classifies as `no-code`.

- [ ] **Step 3: Fill the constant**

In `scripts/classify-cycle.mjs`, set `export const RUNTIME_LOADED_ROOT_MD = ['TEST_CASES.md'];` and rewrite the comment above it: the list names root `.md` files the running app loads, `TEST_CASES.md` is there because `test-cases.html` fetches it, and anything added here must be a file a page actually loads. The file is CRLF — keep it CRLF.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS, every file.

- [ ] **Step 5: Commit**

```bash
git add scripts/classify-cycle.mjs scripts/classify-cycle.test.js
git commit -m "feat: classify TEST_CASES.md as runtime-loaded code"
```

---

### Task 5: Remove the mirroring duty from the documentation

**Files:**
- Modify: `.claude/skills/sync-docs/SKILL.md`
- Modify: `.claude/commands/finish-cycle.md:143`
- Modify: `CLAUDE.md`
- Modify: `docs/js/lib.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

All four files are CRLF. Edit them with the Edit tool and keep the line endings.

- [ ] **Step 1: Delete §4 of the sync-docs skill and renumber**

Remove `### 4. test-cases.html` and its four bullets (`.claude/skills/sync-docs/SKILL.md:32-37`). Renumber §5→4, §6→5, §6b→5b, §7→6, §8→7. Update every internal cross-reference to a renumbered section — the final summary rule (line 83) cites "section 8" for project memory, and §1 cites "section 2" for CLAUDE.md's routing rule (unchanged, but verify).

- [ ] **Step 2: Add the one-line rule to §3**

Under `### 3. TEST_CASES.md`, state that `test-cases.html` parses this file at runtime, so there is no second copy to mirror — and that a malformed table now breaks a page, which `js/lib/test-cases-parse.test.js` guards.

- [ ] **Step 3: Drop `test-cases.html` from the finish-cycle scope list**

In `.claude/commands/finish-cycle.md:143`, remove `test-cases.html` from the parenthesised list of what `/sync-docs` covers.

- [ ] **Step 4: Update CLAUDE.md**

Add a one-line File-structure entry for `js/lib/test-cases-parse.js` next to the `js/lib/` block, and extend the existing mention of `test-cases.html` (line 149) to say the page is generated from `TEST_CASES.md` at runtime — which is also why `TEST_CASES.md` now counts as code for `scripts/classify-cycle.mjs`.

- [ ] **Step 5: Document the module**

Add a `test-cases-parse.js` section to `docs/js/lib.md`, following the file's existing per-module format: what it parses, the two exports and their shapes, the tolerant-warnings choice, and the characterization test that pins the real file.

- [ ] **Step 6: Verify**

Run:
```bash
grep -n "^### " .claude/skills/sync-docs/SKILL.md
grep -rn "test-cases.html" .claude/ CLAUDE.md
npm test
```
Expected: the section numbers run 1,2,3,4,5,5b,6,7 with no gap and no `test-cases.html` heading; no remaining instruction anywhere in `.claude/` to mirror edits into the HTML; the suite green.

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/sync-docs/SKILL.md .claude/commands/finish-cycle.md CLAUDE.md docs/js/lib.md
git commit -m "docs: drop the test-cases.html mirroring duty"
```
