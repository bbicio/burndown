# Execution worktree named as the Plan declares — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The rule for creating the execution worktree (tool, base, name, verification) lives in `PROCESS.md` §6.1b, and a `CLAUDE.md` override makes it prevail over `superpowers:using-git-worktrees` in every session.

**Architecture:** Prose only. One new §6.1b bullet replaces one sentence; the §6.1 dispatch bullet gains the worktree path; one override line in `CLAUDE.md` points at §6.1b.

**Tech Stack:** Markdown (CRLF files).

**Spec:** `docs/superpowers/specs/2026-10-14-exec-worktree-rule-design.md`

**Branch:** `exec-worktree-rule`

**Risk class:** standard — touches process files (`docs/superpowers/PROCESS.md`, `CLAUDE.md`), no high-risk category

## Global Constraints

- `PROCESS.md` and `CLAUDE.md` are CRLF: edit with the Edit tool or a Python byte round-trip that keeps CRLF; never PowerShell `Set-Content`.
- `PROCESS.md` in Italian, `CLAUDE.md` in English.
- Writing rules from `CLAUDE.md` `### Writing documentation`: no justification in the rule, no counts in prose, one home per rule (§6.1b), delete before rewording.
- `CLAUDE.md` stays at or under the ceiling of `scripts/claude-md-guard.test.js`; do not touch its File structure block.
- No plugin file, no test file, no `.claude/commands/` file is touched.
- Tasks are sequential: Task 2 points at the bullet Task 1 writes.

## Review Focus

1. The verification command targets the path `.claude/worktrees/<nome>`: a worktree made by `EnterWorktree(name=<nome>)` sits at that same path on branch `worktree-<nome>`, so the check catches it and execution stops (Task 1 text; the `branch -m` repair was dropped at Gate 3 round 1).
2. A reader on `superpowers:executing-plans` follows `using-git-worktrees` first: the `CLAUDE.md` line must name that skill and `EnterWorktree` so the override is recognisable (Task 2).
3. No sentence elsewhere in the repo still says the branch is created by `EnterWorktree` or restates the removed sentence (grep in Task 1 Step 3).

---

### Task 1: `PROCESS.md` — §6.1b worktree bullet, §6.1 dispatch path

**Files:**
- Modify: `docs/superpowers/PROCESS.md` — §6.1b header-lines bullet (the sentence «L'esecuzione crea il branch con esattamente il nome dichiarato.»); §6.1 bullet «Contesto dei file nei dispatch».

**Interfaces:**
- Produces: the §6.1b bullet titled **«Il worktree di esecuzione si crea con il nome dichiarato.»**, cited by Task 2.

- [ ] **Step 1:** Delete the sentence «L'esecuzione crea il branch con esattamente il nome dichiarato.» (and its blank line) from the header-lines bullet, and insert right after that bullet, before the «Effort di ogni `/code-review`» bullet:

  ````markdown
  - **Il worktree di esecuzione si crea con il nome dichiarato.** Dal checkout principale, su `main` locale, con Spec e Piano già committati, dove `<nome>` è il `**Branch:**` del Piano:

    ```bash
    git worktree add .claude/worktrees/<nome> -b <nome>
    git -C .claude/worktrees/<nome> branch --show-current
    ```

    Se il primo comando fallisce, o il secondo non stampa `<nome>`, ci si ferma prima di qualunque modifica. Mai `EnterWorktree`: la sessione entra nel worktree con `cd` e usa i path del worktree anche negli strumenti di file. In subagent-driven il worktree lo crea il coordinatore.
  ````
- [ ] **Step 2:** In §6.1 «Contesto dei file nei dispatch», change «il prompt di un reviewer riceve la stessa lista e il range di commit da rivedere» so both prompts also carry the worktree's absolute path: «Il prompt di dispatch di un implementer riporta il path assoluto del worktree (§6.1b), copia dal Piano …; il prompt di un reviewer riceve lo stesso path, la stessa lista e il range di commit da rivedere.»
- [ ] **Step 3:** `grep -rn "esattamente il nome dichiarato\|EnterWorktree" docs/superpowers/PROCESS.md .claude/commands CLAUDE.md` → hits only in the new bullet (and Task 2's line once written).
- [ ] **Step 4:** `npx vitest run scripts/` → PASS.
- [ ] **Step 5:** Commit `docs: PROCESS.md §6.1b execution worktree rule and verification (exec-worktree-rule)`.

### Task 2: `CLAUDE.md` — process override line

**Files:**
- Modify: `CLAUDE.md` — new paragraph after the «Process override — approvals» paragraph.

**Interfaces:**
- Consumes: the §6.1b bullet (Task 1).

- [ ] **Step 1:** Insert, as its own paragraph after the approvals override:

  ```markdown
  **Process override — execution worktree:** create a plan's execution worktree as `PROCESS.md` §6.1b says, not with the native `EnterWorktree` tool that `superpowers:using-git-worktrees` prefers.
  ```
- [ ] **Step 2:** `tr -d '\r' < CLAUDE.md | wc -c` → at or under the ceiling in `scripts/claude-md-guard.test.js`.
- [ ] **Step 3:** `npm test` → PASS.
- [ ] **Step 4:** Commit `docs: CLAUDE.md override — execution worktree per PROCESS.md §6.1b (exec-worktree-rule)`.

## Decisioni aperte

1. **Two tasks, sequential, native.** Alternativa scartata: one task for both files. Perché: the override line can be rejected independently of the rule's wording.
2. **The dispatch path goes in the existing §6.1 bullet, not in §6.1b.** Alternativa scartata: say it in the new §6.1b bullet. Perché: §6.1's bullet is already the home of what a dispatch prompt carries.
