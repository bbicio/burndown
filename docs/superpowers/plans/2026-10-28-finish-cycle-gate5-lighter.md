# `/finish-cycle` Gate 5 lighter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate 5 does the same work with the same content, but skips a push question already answered at Gate 4, runs only the doc-reading tests on a docs-only diff, re-runs the follow-up checks recorded at Gate 3, and its real duration up to the commit becomes measurable.

**Architecture:** one mechanical predicate, `scripts/gate5-scope.mjs` (`docs-only` / `other`), decides both the test subset of Gate 5 step 3 and whether a Gate 4 pre-authorisation lets Gate 5 commit and push without asking. `scripts/cycle-times.mjs` gains a `docs` moment (the commit that added the cycle's report). The rest is text in `.claude/commands/finish-cycle.md`, `.claude/skills/sync-docs/SKILL.md`, `docs/superpowers/PROCESS.md` and `CLAUDE.md`.

**Tech Stack:** Node ESM scripts under `scripts/`, vitest (`scripts/**/*.test.js`), git CLI, Markdown command/skill files.

**Spec:** `docs/superpowers/specs/2026-10-28-finish-cycle-gate5-lighter-design.md`
**Branch:** `finish-cycle-gate5-lighter`
**Risk class:** standard — process files (`.claude/`, `scripts/`, `docs/superpowers/PROCESS.md`), no high-risk category of §6.1b

## Global Constraints

- What `/sync-docs` writes, the report's content and the BACKLOG rows' content do not change (Spec §1): only how and when Gate 5 works.
- `docs-only` = a non-empty path list in which every path ends in `.md` or is exactly `js/lib/test-cases-parse.test.js` (Spec §2.1). `scripts/claude-md-guard.test.js` and any other path → `other`.
- Subset command, verbatim: `npx vitest run scripts/ js/lib/test-cases-parse.test.js`. Full suite: `npm test`.
- Gate 4 second question, verbatim: `Pre-authorise Gate 5's commit and push to main, if its diff is docs-only and its tests pass on the first run? [yes/no]`. The first stays `Proceed with merge? [yes/no]`.
- Report template field, verbatim: `Gate 5 (to report) <N>m`. New `cycle-times` moment `docs`, new column header `merge→docs`.
- A value git cannot give is `unknown`, never estimated (as `scripts/cycle-times.mjs` already does).
- Spec and Plan are frozen once execution starts (PROCESS.md §1).
- Base measurement of Spec §2.1, re-run at plan time on 2026-10-28: in the 30 commits from `git log --since=2026-10-09 --grep="^docs: sync docs" --format=%h main`, the only non-`.md` paths in `git show --name-only` are `js/lib/test-cases-parse.test.js` (11) and `scripts/claude-md-guard.test.js` (3).

## Review Focus

1. **A renamed or quoted path in `git status`** — a rename yields both paths, and a path with spaces or non-ASCII characters is read exactly, not quoted. Pinned by using `-z` and tested in Task 1 (`parsePorcelainZ`).
2. **A deleted `.md` file** (`D`) is still `docs-only`; a deleted `.js` is `other`. Tested in Task 1.
3. **A cycle whose report was never committed** (an interrupted Gate 5) gets `docs` = `unknown`, and `merge→docs` = `unknown`. Tested in Task 2.
4. **A Gate 5 re-entered after a red step 3** must ask, even with the pre-authorisation. This is text: Task 3 Step 3 checks the sentence with grep.
5. **A stray untracked file** (such as today's `.superpowers_up.log`) makes the diff `other` unless it is ignored. Tested in Task 1 through `classifyGate5`; the `.gitignore` line also lands in Task 1.

Task independence: Tasks 1, 2 and 4 are independent of each other. Task 3 uses the names from Tasks 1 and 2 (CLI output, column). Task 5 documents Tasks 1 and 3 and must come last.

---

### Task 1: `scripts/gate5-scope.mjs` — the `docs-only` predicate and its guard

**Files:**
- Create: `scripts/gate5-scope.mjs`, `scripts/gate5-scope.test.js`
- Modify: `.gitignore` (one line `.superpowers_up.log`, with a one-line comment, after the `.superpowers/` block)

**Interfaces:**
- Produces:
  - `export const GATE5_TEST_FILE = 'js/lib/test-cases-parse.test.js'`
  - `export function parsePorcelainZ(stdout: string): string[]` — the paths of `git status --porcelain=v1 -z --untracked-files=all`; a rename (`R`/`C`) yields new and old path
  - `export function classifyGate5(paths: string[]): 'docs-only' | 'other'`
  - `export function mdReadingTests(files: { name: string, text: string }[]): string[]` — names of `js/lib/*.test.js` other than `GATE5_TEST_FILE` whose text matches `/\.md['"`]/` or contains `live-docs`
  - `export function main()` — runs git, prints the verdict on line 1 and one judged path per following line, exit 0. On a git error it writes the error to stderr and exits 1.
- Header comment: what the predicate is for (Gate 5 step 3 subset, step 5-6 pre-authorisation), the Spec path, and the guard's limit ("sees string literals, not a path built at runtime"). Same style as `scripts/classify-cycle.mjs`.

- [ ] **Step 1: Write the failing tests** in `scripts/gate5-scope.test.js`:
  - `classifyGate5(['docs/pages/costgrid.md', 'CLAUDE.md'])` → `'docs-only'`
  - `classifyGate5(['TEST_CASES.md', 'js/lib/test-cases-parse.test.js'])` → `'docs-only'`
  - `classifyGate5(['docs/x.md', 'scripts/claude-md-guard.test.js'])` → `'other'`
  - `classifyGate5(['docs/x.md', 'test-cases.html'])` → `'other'`
  - `classifyGate5(['.superpowers_up.log'])` → `'other'`
  - `classifyGate5([])` → `'other'`
  - `parsePorcelainZ(' M CLAUDE.md\0?? docs/superpowers/reports/a b.md\0 D docs/old.md\0R  docs/new.md\0docs/was.md\0')` → `['CLAUDE.md', 'docs/superpowers/reports/a b.md', 'docs/old.md', 'docs/new.md', 'docs/was.md']`
  - `classifyGate5(parsePorcelainZ(' D api/src/x.js\0'))` → `'other'`
  - `mdReadingTests([{ name: 'js/lib/x.test.js', text: "readFileSync('TEST_CASES.md')" }, { name: 'js/lib/y.test.js', text: '// see docs/a.md): note' }, { name: GATE5_TEST_FILE, text: "readFileSync('TEST_CASES.md')" }])` → `['js/lib/x.test.js']`
  - The guard on the real repo: `mdReadingTests` over every `js/lib/*.test.js` (read with `readdirSync`/`readFileSync`) → `[]`. Its failure message tells the reader to add that test to the Gate 5 subset or stop it reading `.md`.
- [ ] **Step 2: Run** `npx vitest run scripts/gate5-scope.test.js` → FAIL (module not found).
- [ ] **Step 3: Implement** `scripts/gate5-scope.mjs`. `main()` calls `git status --porcelain=v1 -z --untracked-files=all` from `git rev-parse --show-toplevel`. Porcelain v1 `-z` records are `XY<space>path\0`, and for `R`/`C` the next `\0`-field is the original path. Add the `.gitignore` line.
- [ ] **Step 4: Run** `npx vitest run scripts/gate5-scope.test.js` → PASS. Then `node scripts/gate5-scope.mjs` on the clean branch → first line `other` (empty list), exit 0. `git check-ignore .superpowers_up.log` → prints the path.
- [ ] **Step 5: Commit** `feat(gate5): docs-only predicate for Gate 5 (scripts/gate5-scope.mjs)`.

### Task 2: `scripts/cycle-times.mjs` — the `docs` moment

**Files:**
- Modify: `scripts/cycle-times.mjs` (`MOMENTS` line 120, `cycle()` line 185, header line 217, top comment)
- Test: `scripts/cycle-times.test.js`

**Interfaces:**
- Produces: `MOMENTS` ends `'merge', 'docs'`; the header ends `'exec→merge', 'merge→docs'`; each cycle object has `docs`, the author ISO time of the earliest commit that added the report (reuse `addedAt(report)`), or `null`.

- [ ] **Step 1: Write the failing tests:**
  - `buildRow` with `merge: '2026-10-28T13:52:27+01:00'`, `docs: '2026-10-28T14:07:19+01:00'` → the row has 14 tab-separated cells (branch, 7 moments, 6 intervals) and its last cell is `'15'`.
  - `buildRow` with `docs: null` → cell index 7 (the `docs` moment) is `'unknown'` and the last cell (the `merge→docs` interval) is `'unknown'`.
- [ ] **Step 2: Run** `npx vitest run scripts/cycle-times.test.js` → FAIL (12 cells).
- [ ] **Step 3: Implement.** Append `'docs'` to `MOMENTS`. In `cycle()`, initialise `docs: null` and set `c.docs = addedAt(report)` once the branch is known, independent of the merge. Append `'merge→docs'` to the header. Add one sentence to the top comment saying what `docs` is.
- [ ] **Step 4: Run** `npx vitest run scripts/cycle-times.test.js` → PASS. Then `node scripts/cycle-times.mjs | grep dates-c4-saves-period` → the `merge→docs` cell is `15`.
- [ ] **Step 5: Commit** `feat(gate5): cycle-times measures merge→docs`.

### Task 3: `.claude/commands/finish-cycle.md` — Gate 3, Gate 4, Gate 5, report template

**Files:**
- Modify: `.claude/commands/finish-cycle.md` (Gate 3 step 3 line 116; Gate 4 step 2 line 137 and its heading line 129; Gate 5 heading line 182 and steps 2b, 3, 5, 6 at lines 239-252; template lines 194 and 199)

**Interfaces:**
- Consumes: `node scripts/gate5-scope.mjs` (first stdout line `docs-only`/`other`; non-zero exit means "treat as `other`") from Task 1; column `merge→docs` of `node scripts/cycle-times.mjs` from Task 2.
- Produces: the session flag `<gate5-preauthorised>`.

- [ ] **Step 1: Gate 3 step 3.** The follow-up bullet (line 116) also records, per follow-up, a read-only command that settles its state (`grep -n …`, `git log …`), or `unverified — <what it would take>` (Spec §6).
- [ ] **Step 2: Gate 4 step 2.**
  - Ask the two Global Constraints questions in one `AskUserQuestion`; without the tool, ask both in chat.
  - `<gate5-preauthorised>` is true only on an explicit "yes" to both; anything unclear is false.
  - Update the gate heading ("step 2's confirmation is the only human gate here") so it says step 2 carries two questions.
- [ ] **Step 3: Gate 5.**
  - **Preamble** (one paragraph under the heading): every file edit in this gate, `/sync-docs`'s included, goes through the Edit tool or a script written to a file and run, never `node -e` or `sed` with text quoted in the shell (Spec §7).
  - **Step 2b:** re-run the commands recorded at Gate 3, in one call, and write each one with its result and date into `Verified how`. Compose a new command only for one that no longer runs. Rows closed for reasons other than a Gate 3 finding keep today's text.
  - **Step 3:** run `node scripts/gate5-scope.mjs` first. On `docs-only`, run the subset command; on `other` or a non-zero exit, run `npm test`. The red semantics are unchanged. Record whether this first run was green.
  - **Steps 5-6:**
    - Skip the question and commit and push when all three hold: `<gate5-preauthorised>` is true, the latest `scripts/gate5-scope.mjs` run printed `docs-only`, and step 3 was green on its first run in this gate.
    - Say so in one line before committing.
    - Otherwise ask as today. A red step 3, even once fixed, voids the pre-authorisation, and a re-entry into the gate always asks.
    - `/sync-docs`'s own questions are never covered.
  - **Template:** `Gate 5 <N>m` becomes `Gate 5 (to report) <N>m`. The comment adds that Gate 5 up to its commit is read from `node scripts/cycle-times.mjs`, column `merge→docs`.
- [ ] **Step 4: Verify.**
  - `grep -c "Pre-authorise Gate 5's commit and push to main" .claude/commands/finish-cycle.md` → `1`.
  - `grep -c "npx vitest run scripts/ js/lib/test-cases-parse.test.js" .claude/commands/finish-cycle.md` → `≥1`.
  - `grep -c "Gate 5 (to report)" .claude/commands/finish-cycle.md` → `1`.
  - `grep -n "re-entry\|voids" .claude/commands/finish-cycle.md` → the Step 3 sentence.
  - `npx vitest run scripts/` → PASS (`doc-paths-guard`, `claude-md-guard` pointers).
- [ ] **Step 5: Commit** `feat(gate5): finish-cycle — Gate 4 pre-authorisation, docs-only test subset, follow-up checks from Gate 3`.

### Task 4: `.claude/skills/sync-docs/SKILL.md` — scope pass first

**Files:**
- Modify: `.claude/skills/sync-docs/SKILL.md` (`## Process`, line 109)

- [ ] **Step 1: Implement.**
  - The new step 1 of Process: one `git diff --stat` for the cycle (`git diff --stat <merge-base>...<merge>` at Gate 5), then a yes/no stated for each of sections 1-7, each with its one-line reason, before reading any of their files. Section 7 is always yes.
  - The files of the "yes" sections are read in batched calls.
  - Today's steps follow, renumbered; "Read the current state of each file before editing" now refers to the files the scope pass chose.
  - The step 4 summary reports the yes/no line per section.
- [ ] **Step 2: Verify.** `grep -n "git diff --stat" .claude/skills/sync-docs/SKILL.md` → a hit in Process. Then `npx vitest run scripts/` → PASS.
- [ ] **Step 3: Commit** `feat(gate5): sync-docs starts with a scope pass`.

### Task 5: `docs/superpowers/PROCESS.md`, `CLAUDE.md` — describe what the command does

**Files:**
- Modify: `docs/superpowers/PROCESS.md` (§1 `/finish-cycle` row line 28, §4b point 2 line 108, §6.2 line 164)
- Modify: `CLAUDE.md` (File structure block, after the `scripts/classify-cycle.mjs` entry)
- Modify: `scripts/claude-md-guard.test.js` (the exact byte pin `12_914`, line 144)

- [ ] **Step 1: Implement.**
  - **PROCESS.md §1, Gate 4 bullet:** the second question.
  - **PROCESS.md §1, Gate 5 bullet:** `scripts/gate5-scope.mjs` before the tests; subset or full suite; commit and push without asking under the pre-authorisation.
  - **§4b point 2 and §6.2:** Gate 5 step 3 runs the full suite, or on a `docs-only` diff the subset. State it without justification, as the docs rule requires.
  - **CLAUDE.md:** an entry of at most two lines: `scripts/gate5-scope.mjs — classifies Gate 5's uncommitted diff (docs-only vs other) for /finish-cycle's test subset and pre-authorised push; the rule is pinned by its own .test.js.`
  - **The pin:** set it to the block's new byte count. Measure it by running the test and reading the "received" value; it changes only by the new entry. Leave the over-length entry count (`12`) unchanged, which an entry of two lines or fewer guarantees.
- [ ] **Step 2: Verify.**
  - `npm test` → PASS, the full suite once.
  - `grep -n "gate5-scope" docs/superpowers/PROCESS.md CLAUDE.md` → hits in §1 and the File structure block.
- [ ] **Step 3: Commit** `docs(gate5): PROCESS.md and CLAUDE.md describe the lighter Gate 5`.

## Decisioni aperte

1. **Cinque task, con i testi di `/finish-cycle` in uno solo.** Alternativa scartata: un task per gate. Perché: le tre modifiche al comando si citano a vicenda (`<gate5-preauthorised>` nasce al Gate 4 e si legge al Gate 5), e un reviewer le giudica insieme.
2. **Il guard sui test esclusi vive nel test di `scripts/gate5-scope.mjs`.** Alternativa scartata: un file `scripts/*-guard.test.js` a sé. Perché: protegge l'ipotesi di quello script e cade con lui; un guard nuovo allungherebbe l'elenco di §4b senza motivo.
3. **`git status --porcelain=v1 -z --untracked-files=all`** come sorgente dei path. Alternativa scartata: `git diff --name-only HEAD` più `git ls-files --others`. Perché: un solo comando, che esclude già gli ignorati e dà le rinomine in forma non quotata.
4. **Il momento `docs` è calcolato anche senza merge trovato.** Alternativa scartata: lasciarlo `unknown` quando manca il merge. Perché: il commit del report esiste comunque, e la colonna `merge→docs` resta `unknown` da sola quando manca il merge.
