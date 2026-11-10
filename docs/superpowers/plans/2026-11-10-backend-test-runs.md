# Backend test runs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a backend fix is proven in the worktree with `cd api && node --test src/<file>`; `scripts/run-tests.sh` runs at Gate 1 and, only when `api/` or `test-api.js` changed since, once at the end of Gate 3; a Plan does not prescribe it per task.

**Architecture:** text only, in three documents: `docs/superpowers/PROCESS.md` §6.2, `.claude/commands/finish-cycle.md` (Gate 1 step 4, Gate 3), `CLAUDE.md` (the backend-test paragraph). No code, no test.

**Tech Stack:** Markdown.

**Spec:** `docs/superpowers/specs/2026-11-10-backend-test-runs-design.md`
**Branch:** `backend-test-runs`
**Risk class:** standard — process files (`.claude/`, `docs/superpowers/PROCESS.md`), no high-risk category of §6.1b

The two tasks are independent in content; Task 2's wording cites the command Task 1 writes into §6.2, so they run in order.

## Global Constraints

- Backend targeted command, verbatim: `cd api && node --test src/<file>`. The string `docker exec pdash-api node --test` must not remain in `.claude/commands/finish-cycle.md`, `docs/superpowers/PROCESS.md` or `CLAUDE.md`.
- The recorded HEAD is named `<gate1-green-HEAD>`, recorded at Gate 1 step 4 and again whenever Gate 1 turns green after a red.
- The Gate 3 paragraph, verbatim, titled **Backend re-run (every exit).**: "Every path out of this gate — step 0's skip, step 2's zero findings, option (b) of the round cap, step 4 — passes through this check before Gate 4. Run `git diff --name-only <gate1-green-HEAD>..HEAD`. If it prints a path under `api/` or `test-api.js`, run `scripts/run-tests.sh` once; if it is red, stop, show the failing output verbatim and re-enter as after a red at Gate 1 step 3. If it prints neither, run nothing and say so in the report's Gate 3 line."
- The three exits (step 0 skip, step 2, option (b)) replace "proceed to Gate 4" with a pointer to that paragraph. Step 4 already says "proceed to Gate 4" and gets the same pointer.
- The Plan rule in §6.2, in Italian like the section: un Piano non prescrive `scripts/run-tests.sh` per task; l'unica eccezione è il task il cui prodotto è un controllo di `test-api.js`, che lo lancia una volta, al suo passo verde. `scripts/run-tests.sh` gira al Gate 1 e, alle condizioni del Gate 3 di `/finish-cycle`, alla sua fine.
- Unchanged: the sentence "this gate is never left red", `npm test` rules, the Gate 5 subset, the pinned File structure block of `CLAUDE.md`, every file under `docs/superpowers/reports/`.
- Every file edit goes through the Edit tool, never `node -e` or `sed` with quoted text.

## Review Focus

1. **A zero-findings review at Gate 3** must still reach the re-run check — the exit most likely forgotten. Task 2 Step 3 checks all four exits by `grep -n "proceed to Gate 4" .claude/commands/finish-cycle.md`.
2. **A Gate 2 visual fix that touched `api/`** is covered because the diff starts at `<gate1-green-HEAD>`, not at the last review. Task 2 Step 4 reads the paragraph for it.
3. **Gate 1 re-entry after a red** must re-record `<gate1-green-HEAD>`, or the diff would be too wide and run once more than needed. Task 2 Step 1.
4. **`CLAUDE.md` size and pin:** the edit must not touch the File structure block. Task 1 Step 3 runs `claude-md-guard`.

---

### Task 1: `PROCESS.md` §6.2 and `CLAUDE.md`

**Files:**
- Modify: `docs/superpowers/PROCESS.md` (§6.2, the bullet "Durante i task si lanciano solo i file di test toccati o aggiunti")
- Modify: `CLAUDE.md` (the "Testing & tooling" paragraph that mentions `api`'s `node_modules`)

**Interfaces:**
- Produces: the command `cd api && node --test src/<file>` and the Plan rule that Task 2 cites.

- [ ] **Step 1: §6.2.** In that bullet replace the backend command with `cd api && node --test src/<file>`; add the two Italian sentences of Global Constraints (Plan rule with its exception; where `scripts/run-tests.sh` runs).
- [ ] **Step 2: `CLAUDE.md`.** Replace "run via `docker exec pdash-api node --test src/...` if the host has no `api/node_modules` installed" with a statement that those files need `npm ci` once in `api/`, in a worktree too. No justification.
- [ ] **Step 3: Check.** `grep -n "docker exec pdash-api node --test" docs/superpowers/PROCESS.md CLAUDE.md` prints nothing; `npx vitest run scripts/claude-md-guard.test.js scripts/doc-paths-guard.test.js` passes.
- [ ] **Step 4: Commit.** `git add docs/superpowers/PROCESS.md CLAUDE.md` then `git commit -m "docs(process): backend tests run from the worktree; run-tests.sh once per Plan task is gone"`.

### Task 2: `finish-cycle.md` — Gate 1 step 4 and Gate 3

**Files:**
- Modify: `.claude/commands/finish-cycle.md`

**Interfaces:**
- Consumes: the command of Task 1.
- Produces: `<gate1-green-HEAD>` and the **Backend re-run (every exit).** paragraph.

- [ ] **Step 1: Gate 1.** Step 4 records the HEAD as `<gate1-green-HEAD>` before proceeding; the re-entry sentences after a red (steps 1 and 3) say it is recorded again when the gate turns green.
- [ ] **Step 2: Gate 3 test line.** In step 3's "tests that cover what this round actually changed" point, replace `docker exec pdash-api node --test src/<file>` with `cd api && node --test src/<file>`; keep the rest.
- [ ] **Step 3: The paragraph and the four exits.** Add the Global Constraints paragraph after step 4. In step 0's skip, step 2, and option (b) of the cap, replace "proceed to Gate 4" with "go to the Backend re-run below"; step 4 gets the same. Verify with `grep -n "proceed to Gate 4" .claude/commands/finish-cycle.md`: no remaining hit inside Gate 3.
- [ ] **Step 4: Read it for the Review Focus.** Check by reading that the paragraph covers a zero-findings exit and a Gate 2 fix that touched `api/`.
- [ ] **Step 5: Verify the Spec's criteria.** `grep -rn "docker exec pdash-api node --test" .claude/commands/finish-cycle.md docs/superpowers/PROCESS.md CLAUDE.md` (nothing); `node scripts/classify-cycle.mjs` (first line `no-code`); `npm test` (green).
- [ ] **Step 6: Commit.** `git add .claude/commands/finish-cycle.md` then `git commit -m "docs(process): Gate 3 runs the integration suite once, at the end, only when api/ changed"`.

## Decisioni aperte

1. **Esecuzione nativa, non subagent-driven.** Alternativa scartata: subagent-driven. Perché: §6.1, ciclo piccolo — tre file di testo, nessuna migrazione, nessuna API, task in sequenza.
2. **Classe `standard`, non `low-risk`.** Alternativa scartata: `low-risk`. Perché: §6.1b esclude da `low-risk` i file di processo (`.claude/`, `docs/superpowers/PROCESS.md`).
3. **Il paragrafo del run finale sta dopo lo step 4, non come step 3b.** Alternativa scartata: uno step 3b. Perché: lo step 2 (zero finding), lo skip dello step 0 e l'opzione (b) saltano al Gate 4 senza passare dallo step 3.
4. **Il diff si prende con `git diff --name-only`, non con `classify-cycle.mjs`.** Alternativa scartata: riusare `classify-cycle.mjs`. Perché: lo script risponde a "è codice?", la domanda qui è "tocca il backend?".
5. **Nessun test.** Alternativa scartata: asserzioni sul testo di `finish-cycle.md`. Perché: fissano che la frase c'è, non che qualcuno la segue; la Spec lo ha deciso.
