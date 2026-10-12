# Guards enforcement set — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three gaps that let the guards be bypassed — no test gate at `/finish-cycle`'s Gate 5, `architecture-guard` demanding documentation a gate later than it blocks, and cited file paths guarded by nothing — plus the four stale statements the last of those would have caught.

**Architecture:** One shared walk module (`scripts/lib/live-docs.mjs`) feeds both document guards, so the scanned scope has a single definition. A new `scripts/doc-paths-guard.test.js` asserts every repo-rooted cited path resolves, with an explicit `GONE` allowlist for verified-deleted files. The rest is prose in four files: a blocking `npm test` step in Gate 5, two sentences naming `architecture-guard`, four tense corrections, and a new `PROCESS.md` §4b.

**Tech Stack:** Vitest 4 (jsdom env, `include: ['js/**/*.test.js', 'scripts/**/*.test.js']`), Node ≥ 20.12 (this host: Node 24), ES modules. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-12-guards-enforcement-set-design.md` (committed `a88c774`)

## Global Constraints

- **No new dependency, runner, script or hook.** The guards stay inside `npm test`. `vitest.config.js` is not modified.
- **No existing pin is relaxed or raised.** `claude-md-guard.test.js`'s 64,000 B ceiling, 12,758 B block pin and 13-entry count stay exactly as they are.
- **No gate of `/finish-cycle` is reordered**, and `/sync-docs`'s scope is not changed.
- **The F4 check tests existence only, never content.**
- **Language:** guard files and their headers in English, matching `claude-md-guard.test.js` and `architecture-guard.test.js`. `PROCESS.md` §4b in **Italian**, matching that document.
- **`CLAUDE.md` is not edited on the branch.** The File-structure entries for the two new files, and the raise of the 12,758 B pin they force, are `/sync-docs` §2's work at Gate 5 — Task 4's new step is what verifies them.
- **Out of scope** (spec §6): F3, F5, F6, F7, F8; `PROCESS.md` §1 and §6; moving the pins out of the files `/sync-docs` edits; re-pointing the eight non-cluster historical paths.

## Review Focus

Five ways the new guard can mislead that no repo-wide assertion exercises. Each has a test in Task 3.

1. **A cited path carrying a `:line` suffix is silently skipped** — `` `js/core.js:264-272` `` occurs in the docs, and the closing-backtick anchor means the regex never sees it. A real citation class the guard does not cover; pin it as a known limit so nobody later assumes coverage.
2. **An allowlisted file that comes back** leaves a stale `GONE` entry that silently permits a future typo on that path. Assert the inverse: every `GONE` key must *not* exist.
3. **Case-only typos pass on Windows** — `existsSync` is case-insensitive here, case-sensitive on a Linux checkout. Cannot be fixed cheaply; name it in the header and pin the intent in the limits comment.
4. **A path soft-wrapped across two lines inside backticks** is not matched. Known limit, same treatment as 1.
5. **A broken walk returns nothing and the suite goes green** — the floor assertions are the only thing standing between "all paths resolve" and "no paths were looked at".

---

### Task 1: Extract the live-document walk into one module

Pure refactor. The existing suite is the test: `claude-md-guard.test.js` must behave identically, and it already asserts the walk reaches > 40 files.

**Files:**
- Create: `scripts/lib/live-docs.mjs`
- Modify: `scripts/claude-md-guard.test.js:53-54` (imports), `:151-168` (`SKIP_DIRS` + `liveMarkdown` removed)
- Test: `scripts/claude-md-guard.test.js` (existing, unchanged assertions)

**Interfaces:**
- Consumes: nothing.
- Produces: `ROOT: string` (repo root), `SKIP_DIRS: Set<string>`, `liveMarkdown(dir: string, acc?: string[]): string[]` — repo-relative `.md` paths under `dir`, recursive, skipping `SKIP_DIRS`.

- [ ] **Step 1: Run the existing guard to record the baseline**

Run: `npx vitest run scripts/claude-md-guard.test.js`
Expected: PASS. Note the test count — it must be identical after the refactor.

- [ ] **Step 2: Create `scripts/lib/live-docs.mjs`**

Move `SKIP_DIRS` (lines 151-158) and `liveMarkdown` (lines 160-168) verbatim, **carrying both existing comments** — the `docs/superpowers` "immutable record" reason and the `.claude/worktrees` reason about other branches' checkouts turning main's `npm test` red. Export `ROOT` too (`join(import.meta.dirname, '..', '..')` from this location), so both guards resolve paths against one value. Add a two-line header saying why the module exists: two guards share one scanned scope, and a second definition of it would let them drift.

- [ ] **Step 3: Make `claude-md-guard.test.js` import it**

Replace the removed block with `import { ROOT, liveMarkdown } from './lib/live-docs.mjs';` and drop the now-unused `readdirSync`/`statSync` from its `node:fs` import and its local `ROOT`. Leave every assertion, pinned number and comment untouched.

- [ ] **Step 4: Verify identical behaviour**

Run: `npx vitest run scripts/claude-md-guard.test.js`
Expected: PASS, with the same test count as Step 1.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/live-docs.mjs scripts/claude-md-guard.test.js
git commit -m "refactor: one definition of the live-document walk"
```

---

### Task 2: Correct the four stale statements about deleted files

Addendum §2. Tense and reference corrections only — no other claim in those paragraphs changes, and no sentence is reworded for style. These make Task 3's allowlist reason (*"only historical mentions remain"*) true; per spec §3.4 they are **not** a precondition for that guard being green.

**Files:**
- Modify: `ARCHITECTURE.md:1025`, `docs/prd/project-config.md:40`, `docs/prd/project-config.md:72`, `docs/pages/portfolio.md:9`
- Test: none (prose); verified by grep in Step 3

- [ ] **Step 1: Read each of the four lines in full before editing**

They are long single-line paragraphs; the stale clause is one fragment inside each. Read the whole line so the edit does not truncate a neighbouring claim.

- [ ] **Step 2: Apply the four corrections**

| Location | Stale clause | Correction |
|---|---|---|
| `ARCHITECTURE.md:1025` | "The mechanism still exists in `js/config-form.js` (unchanged)" | past tense; the file was deleted in `2d4446f` (2026-07-27) |
| `docs/prd/project-config.md:40` | "A raw-JSON editor toggle exists in the underlying shared `js/config-form.js`" | existed, in the since-deleted file; also drop the trailing "`js/config-form.js` itself remains loaded by `planning.html`" claim |
| `docs/prd/project-config.md:72` | "`js/config-form.js` still contains the underlying `cfgSaveReforecastSnapshot`/`cfgRollbackReforecast` functions" | contained, until its deletion |
| `docs/pages/portfolio.md:9` | "`js/dashboard.js` … is now fully orphaned dead code" | was orphaned, and has since been deleted (`2d4446f`) |

Each correction names the deletion commit, so the statement stays verifiable rather than merely vague.

- [ ] **Step 3: Verify no present-tense claim survives, and nothing else moved**

Run: `git diff --stat` (expect exactly 4 files, small line counts) and
`grep -rn "still exists in \`js/config-form\|still contains the underlying\|exists in the underlying shared\|is now fully orphaned" ARCHITECTURE.md docs/`
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add ARCHITECTURE.md docs/prd/project-config.md docs/pages/portfolio.md
git commit -m "docs: four statements about js/config-form.js and js/dashboard.js to the past"
```

---

### Task 3: The cited-path guard

F4. The citation matcher is an exported pure function so its behaviour — including its known limits — is pinned by unit tests on fixture strings, rather than demonstrated once by hand on a temporary edit.

**Files:**
- Modify: `scripts/lib/live-docs.mjs` (add `citedPaths`)
- Create: `scripts/doc-paths-guard.test.js`
- Test: `scripts/doc-paths-guard.test.js`

**Interfaces:**
- Consumes: `ROOT`, `liveMarkdown` from Task 1.
- Produces: `citedPaths(text: string): string[]` — the distinct **repo-rooted** file paths cited in `text`, from both the backticked and the markdown-link form. Rooted = first segment in `docs | js | css | api | scripts | backups | .claude`; extension in `md | html | js | mjs | css | sql | sh | json | png`.

- [ ] **Step 1: Write the failing unit tests for `citedPaths`**

```js
describe('citedPaths', () => {
  it('finds a backticked rooted path', () =>
    expect(citedPaths('see `docs/ops/database.md` for this')).toEqual(['docs/ops/database.md']));

  it('finds a markdown-link path', () =>
    expect(citedPaths('[db](docs/ops/database.md)')).toEqual(['docs/ops/database.md']));

  it('de-duplicates', () =>
    expect(citedPaths('`js/core.js` and `js/core.js`')).toEqual(['js/core.js']));

  it('ignores a path that is not repo-rooted', () =>
    expect(citedPaths('`routes/projects.js` is shorthand')).toEqual([]));

  it('ignores a bare filename and a directory', () =>
    expect(citedPaths('`CLAUDE.md` and `docs/prd/`')).toEqual([]));

  it('ignores an unknown extension', () =>
    expect(citedPaths('`docs/notes.txt`')).toEqual([]));

  // KNOWN LIMITS, pinned so no reader assumes coverage (Review Focus 1 and 4).
  it('does NOT match a path carrying a :line suffix', () =>
    expect(citedPaths('`js/core.js:264-272` resolves the rate')).toEqual([]));

  it('does NOT match a path soft-wrapped across two lines', () =>
    expect(citedPaths('see `docs/ops/\ndatabase.md`')).toEqual([]));
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run scripts/doc-paths-guard.test.js`
Expected: FAIL — `citedPaths` is not exported from `./lib/live-docs.mjs`.

- [ ] **Step 3: Implement `citedPaths(text)` in `scripts/lib/live-docs.mjs`**

Two anchored regexes over `text` — one requiring a closing backtick immediately after the extension, one requiring `](` … `)` — unioned into a `Set`, filtered by the rooted-prefix test, returned as an array. The `:line` and soft-wrap limits in Step 1 are consequences of those anchors, not extra code.

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run scripts/doc-paths-guard.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Write the failing repo-wide assertions**

Three `it` blocks in the same file:

```js
const DOCS = [...liveMarkdown('docs'), ...liveMarkdown('.claude'),
              'CLAUDE.md', 'ARCHITECTURE.md', 'PRD.md', 'TEST_CASES.md'];

// path -> the documents citing it, so a failure message can name both.
function citations() {
  const out = new Map();
  for (const rel of DOCS)
    for (const p of citedPaths(readFileSync(join(ROOT, rel), 'utf8')))
      (out.get(p) ?? out.set(p, []).get(p)).push(rel);
  return out;
}

it('scans a non-trivial set of documents and citations', () => {
  expect(DOCS.length).toBeGreaterThan(40);           // measured: 70
  expect(citations().size).toBeGreaterThan(150);     // measured: 261
});

it('every cited rooted path exists, unless allowlisted as GONE', () => {
  const missing = [...citations()]
    .filter(([p]) => !GONE.has(p) && !existsSync(join(ROOT, p)))
    .map(([p, by]) => `${p} (cited by ${by.join(', ')})`);
  expect(missing, 'fix the path, or add it to GONE with its reason').toEqual([]);
});

// Review Focus 2: a recreated file must not keep a stale allowlist entry.
it('no GONE entry names a path that exists again', () => {
  expect([...GONE.keys()].filter(p => existsSync(join(ROOT, p)))).toEqual([]);
});
```

The failure message of the second must name each missing path **and the documents citing it** — a bare path list is not actionable.

- [ ] **Step 6: Run to verify the GONE-less state fails**

Write `GONE` as an empty `Map` first. Run: `npx vitest run scripts/doc-paths-guard.test.js`
Expected: FAIL, listing exactly the 10 paths from spec §2. If the count differs, **stop and report** — the measurement has drifted and the allowlist must not be padded to match.

- [ ] **Step 7: Fill `GONE` with the 10 entries and their reasons**

A `Map` of path → one-line reason, copied from spec §2's table: `js/config-form.js`, `js/dashboard.js`, `js/main.js` (`2d4446f`), `js/ai.js` + `docs/js/ai.md` (`70082a5`), `js/pipeline-board.js` (`5a5cef5`), `js/planning.js` (`aed9679`), `js/settings.js` (`d79b6aa`), `docs/OPERATIONAL_MANUAL.md` (an output path in `operational-manual`'s SKILL, not a citation), `scripts/gen-architecture.mjs` (cited only inside `docs/handoff-ciclo5.md`'s quoted cycle-5 proposal, which was rejected; never existed).

- [ ] **Step 8: Write the file header**

Same `WHY THIS FILE EXISTS` / `WHAT IS DELIBERATELY NOT CHECKED` shape as `claude-md-guard.test.js`. It must state, without softening: the guard's value is **at the moment of deletion** — `2d4446f` would have turned it red and forced the author either to re-point the mentions or to allowlist them, which is what would have surfaced the four statements Task 2 fixes — and it cannot re-detect a tense error on an already-allowlisted file, cannot judge whether a resolving path is the *right* path, skips the `:line` and soft-wrapped forms (Step 1), skips the shorthand forms the documents also use (`routes/projects.js`, `middleware/auth.js`, `services/llm.js`, `lib/assistant-chat.js`, `sync-docs/SKILL.md`), and is **case-insensitive on Windows** so a casing-only typo can pass here and fail on a Linux checkout (Review Focus 3).

- [ ] **Step 9: Run the whole guard, then the whole suite**

Run: `npx vitest run scripts/doc-paths-guard.test.js` → Expected: PASS (11 tests)
Run: `npm test` → Expected: PASS, all files

- [ ] **Step 10: Commit**

```bash
git add scripts/lib/live-docs.mjs scripts/doc-paths-guard.test.js
git commit -m "test: guard that every cited repo path resolves"
```

---

### Task 4: A blocking `npm test` at Gate 5

F1. The gate that pushes to `main` currently has no verification between `/sync-docs`'s edits and the push, and `/sync-docs` edits exactly what the guards pin.

**Files:**
- Modify: `.claude/commands/finish-cycle.md` — Gate 5 (`:141-189`): insert a new step 3, renumber 3→4, 4→5, 5→6, and fix step 1's internal reference
- Test: none (command prose)

- [ ] **Step 1: Insert the new step 3, between the report template and the diff**

It must state, in Gate 1 step 1's register: run `npm test`; if it fails, stop immediately, show the failing output verbatim, and run **no** `git add`, `git commit` or `git push`. Then the one deliberate difference from Gate 1, spelled out so it is not inferred: the merge has already happened, so the fix belongs on `main` and this gate is re-entered from its step 1 — this is *not* a "re-run `/finish-cycle` from the top" case.

Include the reason, in one sentence, so a future reader does not read the step as ceremony: `/sync-docs` adjusts the numbers that `claude-md-guard.test.js`, `architecture-guard.test.js` and `js/lib/test-cases-parse.test.js` pin, and `3edd128` changed `CLAUDE.md` and a pin in the same untested commit. Note that `js/lib/test-cases-parse.test.js`'s counts — adjusted by `/sync-docs` §3 at exactly this point — fall inside this run because `vitest.config.js`'s `include` is `['js/**/*.test.js', 'scripts/**/*.test.js']`.

- [ ] **Step 2: Renumber the three following steps and fix the one stale reference**

Old 3 (show the diff) → 4, old 4 (ask) → 5, old 5 (`git add`/`commit`/`push`) → 6. In step 1, "is NOT part of the `git diff` shown in step 3" → step 4.

- [ ] **Step 3: Verify no other step reference is now wrong**

Run: `grep -n "step [0-9]" .claude/commands/finish-cycle.md` and check every hit inside or pointing at Gate 5. Also `grep -rn "Gate 5" .claude/ docs/superpowers/PROCESS.md --include=*.md | grep -v worktrees`.
Expected: no reference to a Gate 5 step number outside the gate itself (verified during brainstorming — re-verify, do not assume).

- [ ] **Step 4: Commit**

```bash
git add .claude/commands/finish-cycle.md
git commit -m "feat: Gate 5 runs npm test before it pushes to main"
```

---

### Task 5: Name `architecture-guard` where the branch can still act on it

F2. Two sentences. The guard blocks Gate 1 on an undocumented route, table or column, but the step that documents them runs at Gate 5, post-merge — and no process file names the guard at all (`grep -c guard .claude/commands/finish-cycle.md` = 0).

**Files:**
- Modify: `.claude/skills/sync-docs/SKILL.md` §1 (after the existing bullets, mirroring §2's guard paragraph at `:24`), `.claude/commands/finish-cycle.md` Gate 1 step 1
- Test: none (prose)

- [ ] **Step 1: Read `SKILL.md:24` first**

That is §2's paragraph about `claude-md-guard.test.js`. The new §1 bullet mirrors its structure and register deliberately; write it after reading it, not from this description.

- [ ] **Step 2: Add the §1 bullet to `sync-docs` SKILL.md**

`scripts/architecture-guard.test.js` fails `npm test` on a route handler, a migration-created table, or an `ALTER TABLE`-added column that §5/§6 does not document — so §5/§6 are updated **on the branch**, not here at Gate 5: a branch that adds an endpoint or a migration cannot reach a green Gate 1 otherwise. State the guard's own limits in one clause (no `Auth` column, no column types, no prose) so the bullet does not overpromise.

- [ ] **Step 3: Add the Gate 1 line to `finish-cycle.md`**

Under Gate 1 step 1: what a red from that guard means — an undocumented route, table or column, not a code defect — and that the fix is an `ARCHITECTURE.md` §5/§6 edit **on the branch**, never deferred to Gate 5.

- [ ] **Step 4: Verify both files now name the guard**

Run: `grep -c guard .claude/commands/finish-cycle.md .claude/skills/sync-docs/SKILL.md`
Expected: non-zero for both (`finish-cycle.md` was 0).

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/sync-docs/SKILL.md .claude/commands/finish-cycle.md
git commit -m "docs: ARCHITECTURE.md 5/6 is documented on the branch, not at Gate 5"
```

---

### Task 6: `PROCESS.md` §4b — the guards in `npm test`

`PROCESS.md` §7 condition 3 applies, because this cycle changes `/finish-cycle`'s gates. In Italian, matching the document.

**Files:**
- Modify: `docs/superpowers/PROCESS.md` — new `## 4b.` between §4 (`:88-99`) and §5 (`:101`)
- Test: none (prose)

- [ ] **Step 1: Write §4b**

Placed beside §4 because both are guards. Content, and nothing beyond it: the three guards in `npm test` (`architecture-guard.test.js`, `claude-md-guard.test.js`, `doc-paths-guard.test.js`) and what each turns red; that an `architecture-guard` red is fixed **on the branch**, never at Gate 5; that Gate 5 now runs `npm test` before showing its diff; and the standing rule the guards embody — *the rule lives in the test, never in a paraphrase here*, so a reader needing the current pinned values reads the file, not this section. Do not restate a count or a pinned number: that is the claim class §6 4c exists to remove.

- [ ] **Step 2: Verify §1 and §6 were not touched**

Run: `git diff docs/superpowers/PROCESS.md`
Expected: an addition between §4 and §5 only. §1 and §6 belong to cycle 2 (F7, F8) and must be byte-identical.

- [ ] **Step 3: Run the full suite — `PROCESS.md` is inside the new guard's walk**

Run: `npm test`
Expected: PASS. Any path §4b cites must resolve, or the guard Task 3 just added fails on this very task — which is the mechanism working.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/PROCESS.md
git commit -m "docs: PROCESS.md 4b names the guards in npm test"
```
