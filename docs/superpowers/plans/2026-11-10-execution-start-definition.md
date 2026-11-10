# Execution start definition — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/finish-cycle` and `scripts/cycle-times.mjs` share one definition of "execution start"; the report field that records the start of the command is renamed `Closeout started`; a test pins the agreement.

**Architecture:** text in `.claude/commands/finish-cycle.md` and a comment in `scripts/cycle-times.mjs`; one new `describe` in `scripts/cycle-times.test.js` reads both files as text. No code path changes.

**Tech Stack:** Markdown command file, Node ESM script, vitest.

**Spec:** `docs/superpowers/specs/2026-11-10-execution-start-definition-design.md`
**Branch:** `execution-start-definition`
**Risk class:** standard — process files (`.claude/`, `scripts/`), no high-risk category of §6.1b

The two tasks are sequential: Task 2 turns green the tests Task 1 writes red.

## Global Constraints

- Report field and placeholder, verbatim: `**Closeout started:** <closeout-started-at>  (pre-flight step 6)`. The old `Execution started` and `<started-at>` must not remain in `.claude/commands/finish-cycle.md`.
- The definition, verbatim, as its own indented paragraph directly under pre-flight step 6: `**Execution start** is the author time of the branch's first commit that does not touch only files under docs/superpowers/specs/, docs/superpowers/plans/ or docs/superpowers/briefs/ — the execFirst that scripts/cycle-times.mjs prints. It is read from git, never recorded during this command.` (paths and `execFirst` in backticks in the file).
- The two counters sentences read "from the Execution start" and the phrase `start of plan execution` appears nowhere in `finish-cycle.md`.
- Unchanged: `scripts/cycle-times.mjs` code, every file under `docs/superpowers/reports/`, the "frozen from the start of execution" sentences, `PROCESS.md`, `CLAUDE.md`.
- Every file edit goes through the Edit tool, never `node -e` or `sed` with quoted text.

## Review Focus

1. **A reintroduced `Execution started` in the template** must turn the suite red. Task 1's first assertion; Task 2 Step 4 proves it by running the red state first.
2. **A second `**Execution start**` definition added elsewhere in the command** must turn it red (a rule in one place). Task 1's count assertion.
3. **`<started-at>` surviving in step 6 while the template uses the new placeholder** — the segnaposto would point nowhere. Task 1's placeholder assertion.
4. **Editing the history by accident** (a `sed` over `docs/`). Checked in Task 2 Step 5 with `git diff main...HEAD --stat -- docs/superpowers/reports`.

---

### Task 1: the pin, written red

**Files:**
- Modify: `scripts/cycle-times.test.js` (new imports, one new `describe` at the end)

**Interfaces:**
- Consumes: `.claude/commands/finish-cycle.md` and `scripts/cycle-times.mjs`, read as text with `node:fs` `readFileSync` and paths resolved from `import.meta.url`.
- Produces: the `describe('execution start definition', …)` block Task 2 must satisfy.

- [ ] **Step 1: Write the failing tests.** Add `import { readFileSync } from 'node:fs';` and `import { fileURLToPath } from 'node:url';` to the imports; read both files once at the top of the new `describe`; the script's header is the text before its first `\nimport `. Five tests, named and asserting:
  - `the report template no longer says Execution started` — `finish-cycle.md` does not contain `Execution started`;
  - `the report template records the closeout start` — contains `**Closeout started:** <closeout-started-at>` and does not contain `<started-at>`;
  - `the command defines Execution start exactly once, on execFirst` — the count of `**Execution start**` is 1, and the physical line holding it contains `execFirst` and `scripts/cycle-times.mjs`;
  - `the counters no longer start from plan execution` — does not contain `start of plan execution`;
  - `the script header names the same definition` — the header contains `execFirst` and `Execution start`.
- [ ] **Step 2: Run it red.** `npx vitest run scripts/cycle-times.test.js` — expected: the five new tests FAIL, every existing test passes.
- [ ] **Step 3: Commit.** `git add scripts/cycle-times.test.js` then `git commit -m "test(scripts): pin the single definition of execution start (red)"`.

### Task 2: the command and the script header, green

**Files:**
- Modify: `.claude/commands/finish-cycle.md` (pre-flight step 6; the Gate 5 report template — the `Execution started` line and the "Cycle counters" sentence)
- Modify: `scripts/cycle-times.mjs` (comment only, before the `// Spec:` line of its header)

**Interfaces:**
- Consumes: the five assertions of Task 1.
- Produces: the text the Global Constraints fix.

- [ ] **Step 1: Pre-flight step 6.** Rename `<started-at>` to `<closeout-started-at>` and add one sentence there saying it is the start of this command, not the start of execution. Replace "the span from the start of plan execution, which precedes this command" with "the span from the Execution start, which precedes this command".
- [ ] **Step 2: The definition.** Add the verbatim paragraph from Global Constraints as an indented paragraph directly under step 6.
- [ ] **Step 3: The template.** Replace the `**Execution started:** <started-at>  (pre-flight step 6)` line with the `Closeout started` line of Global Constraints; in the "Cycle counters" sentence replace "from the start of plan execution to Gate 5" with "from the Execution start to Gate 5".
- [ ] **Step 4: The script header.** Add a comment line stating that Execution start is `execFirst`, the author time of the first commit that is not planning-only (`isPlanningOnly`), and that `/finish-cycle` uses the same value. Run `npx vitest run scripts/cycle-times.test.js` — expected: all pass.
- [ ] **Step 5: Verify the Spec's criteria.** Run, expecting the stated output: `grep -n "Execution started" .claude/commands/finish-cycle.md` (nothing); `grep -n "start of plan execution" .claude/commands/finish-cycle.md` (nothing); `git diff main...HEAD -- scripts/cycle-times.mjs` (comment lines only); `git diff main...HEAD --stat -- docs/superpowers/reports` (empty); `npm test` (green).
- [ ] **Step 6: Commit.** `git add .claude/commands/finish-cycle.md scripts/cycle-times.mjs` then `git commit -m "docs(process): one definition of execution start; Execution started becomes Closeout started"`.

## Decisioni aperte

1. **Esecuzione nativa, non subagent-driven.** Alternativa scartata: subagent-driven. Perché: §6.1, ciclo piccolo — tre file, nessuna migrazione, nessuna nuova API, due task sequenziali che toccano gli stessi file.
2. **Classe `standard`, non `low-risk`.** Alternativa scartata: `low-risk`. Perché: §6.1b esclude da `low-risk` i file di processo (`.claude/`, `scripts/`) e nessuna categoria `high-risk` vale qui.
3. **Il test legge i due file come testo.** Alternativa scartata: estrarre la definizione con un parser di Markdown. Perché: le cinque asserzioni sono sottostringhe e un conteggio; un parser giudicherebbe il contenuto, che il test non deve fare.
4. **L'intestazione dello script è il testo prima del primo `\nimport `.** Alternativa scartata: le prime N righe. Perché: N invecchia appena il commento cresce.
5. **Il rosso si prova una volta sola, a Task 1.** Alternativa scartata: rompere di nuovo il file al Task 2 per rivedere il rosso. Perché: il Task 1 Step 2 lo ha già mostrato su questo stato.
