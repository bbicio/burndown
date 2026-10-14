# M1 — cycle measurement + prose-writing rules — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure every closed cycle's pre-closeout timeline from git, record three counters per cycle from now on, and put four prose-writing rules in `CLAUDE.md`.

**Architecture:** One on-demand script (`scripts/cycle-times.mjs`, pure functions + thin `git` wrapper, same shape as `scripts/classify-cycle.mjs`); one extra check in `scripts/decision-ledger-guard.test.js`; prose edits to `PROCESS.md` §6b, the Gate 5 report template and `CLAUDE.md`; one verbatim block move into `docs/pages/costgrid.md`.

**Tech Stack:** Node ESM, `node:child_process` `execFileSync`, vitest.

**Spec:** `docs/superpowers/specs/2026-10-14-m1-measurement-prose-rules-design.md`

**Branch:** `m1-measurement-prose-rules` — the name must contain the spec's slug, so the script matches this cycle to its own spec.

## Global Constraints

- The ceiling in `scripts/claude-md-guard.test.js` is not raised; the `File structure` pin is not touched (the script does not enter that index).
- Moved block: body byte-identical; only the heading level changes (`###` → `##`). Exception decided at Gate 3 round 1: the self-pointing link in the fourth bullet (spec §6).
- Never an estimate: any value not derivable prints `unknown`.
- No new dependency. User-facing text in English.
- The four writing rules apply to every line this cycle writes: no justification, no counts in prose, one home per rule, delete before rewording.
- Tasks are **sequential**, not independent: Task 4 measures `CLAUDE.md` after Task 3's prose is in.

## Review Focus

1. A report or spec saved with CRLF line endings — parsers must still read `**Branch:**` and `**Brief started:**` (test in Task 1, Task 2).
2. A branch name with regex metacharacters (`.`, `+`) — the merge lookup must match the subject literally, not as a pattern (test in Task 1: `mergeSubjectMatches`).
3. Two specs whose slugs are both contained in one branch name (e.g. `team-ux` and `team-ux-polish`) — result is `unknown`, not the first hit (test in Task 1). Superseded at Gate 3 round 1: the longest slug added inside the cycle's merge window wins; see the spec §2.
4. A report whose branch never produced a merge commit (direct commits on `main`) — every git field `unknown`, the row still printed (test in Task 1: `buildRow`).
5. `**Brief started:** unknown` and a malformed value (`2026-10-14 9:05`) — the first passes the guard, the second fails it (test in Task 2).

---

### Task 1: `scripts/cycle-times.mjs`

**Files:**
- Create: `scripts/cycle-times.mjs`
- Test: `scripts/cycle-times.test.js`

**Interfaces:**
- Produces (all exported, all pure):
  - `parseReportBranch(md: string): string | null` — text after `**Branch:** ` up to ` → main`; tolerates `\r\n`.
  - `parseBriefStarted(md: string): string | null` — `'YYYY-MM-DD HH:MM'` or `null` (absent or `unknown`).
  - `mergeSubjectMatches(subject: string, branch: string): boolean` — exact equality with `Merge branch '<branch>'`.
  - `matchBySlug(branch: string, names: string[], suffix: string): string | null` — `names` are bare filenames; slug = name minus `YYYY-MM-DD-` prefix minus `suffix`; exactly one slug contained in `branch` → that name, else `null`. Specs use `suffix = '-design.md'`, plans `'.md'` excluding names ending `-design.md` or `-brief.md`.
  - `isPlanningOnly(files: string[]): boolean` — true when non-empty and every path starts with `docs/superpowers/specs/`, `docs/superpowers/plans/` or `docs/superpowers/briefs/`.
  - `minutesBetween(a: string | null, b: string | null): number | null` — accepts ISO-with-offset and `'YYYY-MM-DD HH:MM'` (local); `null` if either is `null`.
  - `buildRow(c: {branch, brief, spec, plan, execFirst, execLast, merge}): string` — tab-separated: branch, the six moments (`unknown` for `null`, ISO values shown as `YYYY-MM-DD HH:MM` local), then five consecutive intervals in minutes (`unknown` for `null`).
  - `main(): void` — reads every `docs/superpowers/reports/*-finish-cycle.md`, gathers the moments via `git` (`execFileSync`, stderr captured as in `classify-cycle.mjs`), prints a header line then rows sorted by merge time (`unknown` last).

- [ ] **Step 1: Write the failing tests** in `scripts/cycle-times.test.js`, one `it` per behaviour:
  - `parseReportBranch('**Branch:** backlog-follow-up → main\r\n')` → `'backlog-follow-up'`; with suffix `→ main (merge \`639f57a\`)` → branch only; no Branch line → `null`.
  - `parseBriefStarted` → `'2026-10-14 11:17'`; `'**Brief started:** unknown'` → `null`; absent → `null`; CRLF tolerated.
  - `mergeSubjectMatches("Merge branch 'a.b'", 'a.b')` → true; `("Merge branch 'axb'", 'a.b')` → false; `("Merge branch 'm1-x' into main", 'm1-x')` → false.
  - `matchBySlug('backlog-follow-up', ['2026-10-13-backlog-follow-up-design.md', '2026-10-12-approval-economy-design.md'], '-design.md')` → the first name; `matchBySlug('worktree-team-ux-polish', ['2026-09-25-team-ux-design.md', '2026-09-28-team-ux-polish-design.md'], '-design.md')` → `null`; no hit → `null`.
  - `isPlanningOnly(['docs/superpowers/specs/x.md'])` → true; with `scripts/a.js` added → false; `[]` → false.
  - `minutesBetween('2026-10-13T23:25:00+02:00', '2026-10-13T23:28:00+02:00')` → 3; `(null, x)` → `null`.
  - `buildRow` with all `null` except `branch` → branch followed by eleven `unknown` cells.

- [ ] **Step 2:** `npx vitest run scripts/cycle-times.test.js` → FAIL (module not found).
- [ ] **Step 3:** Implement the exports and `main()`, plus the header comment carrying the usage line `node scripts/cycle-times.mjs`. `main()` runs only when invoked directly (same `import.meta.url` guard as `classify-cycle.mjs`). Git calls: merges `git log --merges --first-parent main --format=%H%x09%s` filtered with `mergeSubjectMatches`; exec commits `git log --format=%H%x09%aI --name-only <M>^1..<M>^2` filtered with `isPlanningOnly`; spec/plan date `git log --diff-filter=A --format=%aI -- <path>` (last line).
- [ ] **Step 4:** `npx vitest run scripts/cycle-times.test.js` → PASS.
- [ ] **Step 5:** `node scripts/cycle-times.mjs` → one row per report. Check by hand: `backlog-follow-up` has spec 2026-10-13 23:25 and plan 23:28; `m3-m2-process-dedup` has spec and plan `unknown`.
- [ ] **Step 6:** Commit `feat: scripts/cycle-times.mjs — per-cycle timeline from git (M1)`.

### Task 2: `Brief started` check in the ledger guard

**Files:**
- Modify: `scripts/decision-ledger-guard.test.js` (header comment, new constant and function, new `describe`)

**Interfaces:**
- Produces: `BRIEF_CUTOFF = '2026-10-14'`; `checkBriefStarted(md: string): boolean` — true when some line matches `^\*\*Brief started:\*\* (\d{4}-\d{2}-\d{2} \d{2}:\d{2}|unknown)\s*$` after `\r\n` → `\n`.

- [ ] **Step 1: Write the failing tests:** `checkBriefStarted` true for `'**Brief started:** 2026-10-14 11:17'` and `'**Brief started:** unknown\r\n'`; false for `'**Brief started:** 2026-10-14 9:05'` and for a document without the line. Plus the repo walk: every spec directly in `docs/superpowers/specs/`, not `-brief.md`, dated ≥ `BRIEF_CUTOFF`, passes `checkBriefStarted`.
- [ ] **Step 2:** `npx vitest run scripts/decision-ledger-guard.test.js` → FAIL (`checkBriefStarted` not defined).
- [ ] **Step 3:** Implement; the walk reuses the file's existing directory reading, specs only, no `EXEMPT` entries. Add to the header comment's "not checked" list: whether the value is correct.
- [ ] **Step 4:** Same command → PASS (this cycle's spec carries the line).
- [ ] **Step 5:** Commit `test: decision-ledger guard requires a Brief started line in new specs (M1)`.

### Task 3: Process prose — `PROCESS.md` §6b and the Gate 5 report template

**Files:**
- Modify: `docs/superpowers/PROCESS.md` (§6b, subsection `### Il ledger`)
- Modify: `.claude/commands/finish-cycle.md` (pre-flight step 6; report template under `**Gate durations:**`)

- [ ] **Step 1:** In `### Il ledger`, after its last paragraph, add one paragraph: every Spec's header carries `**Brief started:** YYYY-MM-DD HH:MM` (or `unknown`), the start of `/feature-brief`, or of `/brainstorming` when there is no Brief; `scripts/cycle-times.mjs` reads it; `scripts/decision-ledger-guard.test.js` requires it. Rule only, no justification.
- [ ] **Step 2:** In the template, under `**Gate durations:**`, add `**Cycle counters:** subagent dispatches <N> · review rounds <N> · full test-suite runs <N>`, and in the template's comment block one line each defining the three counters exactly as spec §4, plus `unknown` for a value the session did not observe in full.
- [ ] **Step 3:** In pre-flight step 6, one sentence: the three counters are kept in session from the start of plan execution, alongside the timestamps.
- [ ] **Step 4:** `npx vitest run scripts/ js/lib/test-cases-parse.test.js` → PASS.
- [ ] **Step 5:** Commit `docs: Brief started line and cycle counters in the process (M1)`.

### Task 4: `CLAUDE.md` — writing rules and the verbatim move

**Files:**
- Modify: `CLAUDE.md` (new `### Writing documentation` as last subsection of `## Development`; remove `### Cost grid editor ↔ pipeline board integration`)
- Modify: `docs/pages/costgrid.md` (new `## Cost grid editor ↔ pipeline board integration` before `## Base state`)

- [ ] **Step 1:** `grep -rn "Cost grid editor ↔ pipeline board integration" --include=*.md .` — expected: only `CLAUDE.md` and this cycle's spec/plan. Check that the lines between that heading and `### Invariants` are the five bullets only.
- [ ] **Step 2:** Save the block body (heading excluded) from `main` to the scratchpad; move it, changing only `###` → `##`.
- [ ] **Step 3:** Add `### Writing documentation` after `### Testing & tooling`'s last line and before `---`, with the four bullets copied verbatim from spec §5.
- [ ] **Step 4:** `diff` the saved body with the body now in `docs/pages/costgrid.md` → no output.
- [ ] **Step 5:** `npx vitest run scripts/` → PASS, `claude-md-guard` included. Then `tr -d '\r' < CLAUDE.md | wc -c` → ≤ 64000.
- [ ] **Step 6:** Commit `docs: prose-writing rules in CLAUDE.md; move cost-grid/pipeline integration to its page doc (M1)`.

## Decisioni aperte

1. **Merge cercato su `git log --first-parent main` e filtrato in JS per soggetto esatto.** Alternativa scartata: `--grep "^Merge branch '<branch>'"` come scritto nella spec. Perché: un nome di branch con `.` o `+` verrebbe letto come regex.
2. **Esecuzione nativa, quattro task in serie.** Alternativa scartata: subagent-driven. Perché: §6.1 «ciclo piccolo» — sette file, nessuna migrazione, nessuna API, task sequenziali (Task 4 misura dopo Task 3).
