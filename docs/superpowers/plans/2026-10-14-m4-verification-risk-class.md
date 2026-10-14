# M4 — verification proportional to the risk class — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A declared risk class in the Plan sets the effort of every `/code-review` in `/finish-cycle`, forbids the full skip in `high-risk`, and lets Gate 2 find the Plan by its declared branch instead of `git log` heuristics.

**Architecture:** One guard rule (`scripts/decision-ledger-guard.test.js`) pins the two Plan header lines the new behaviour reads; prose edits to `docs/superpowers/PROCESS.md` (§6.1b, a §6.1 dispatch bullet, §6b «Dove si applica») and `.claude/commands/finish-cycle.md` (Gate 2 identification step, steps 2-4 as fallback, effort in Gate 2 step 0 and Gate 3, Gate 5 template line).

**Tech Stack:** Markdown; Node ESM + vitest for the guard.

**Spec:** `docs/superpowers/specs/2026-10-14-m4-verification-risk-class-design.md`

**Branch:** `m4-verification-risk-class`

**Risk class:** standard — touches process files (`docs/superpowers/PROCESS.md`, `.claude/`, `scripts/`), no high-risk category

## Global Constraints

- Class values, exactly: `low-risk`, `standard`, `high-risk`. Effort mapping: `low-risk` → low, `standard` → medium, `high-risk` → high.
- Fallback on a missing, ambiguous or out-of-set class: `standard` (medium), stated in one line with the reason. No new question to the user.
- Plan header lines read by `/finish-cycle`, verbatim shape: `` **Branch:** `<name>` `` and `**Risk class:** <value> — <category>`.
- `CLAUDE.md` is not touched. `scripts/cycle-times.mjs` is not touched. No `superpowers` plugin file is touched.
- The no-code branch keeps skipping Gate 2 steps 2-5, and Gate 4's out-of-scope check keeps not firing there.
- Gate 3's three-round cap and disposition rule are unchanged.
- Writing rules from `CLAUDE.md` `### Writing documentation` apply to every line written: no justification, no counts in prose, one home per rule (the class rule lives in `PROCESS.md` §6.1b; `finish-cycle.md` applies it and links there), delete before rewording.
- `PROCESS.md` is in Italian, `finish-cycle.md` in English: write each in its own language.
- Tasks are **sequential**: Task 3 and 4 link to §6.1b written in Task 2.

## Review Focus

1. A Plan whose `**Branch:**` line carries a trailing explanation (as M1's does: `` `name` — the name must… ``) — Gate 2's lookup must still match on the backticked name (prose rule in Task 3; guard test in Task 1).
2. Two Plans declaring the same branch — Gate 2 must fall back to `standard` and to steps 2-4, not take the first (Task 3).
3. `**Risk class:** High-risk` (wrong case) or `medium` — out of set: the guard fails it, Gate 2 falls back to `standard` (test in Task 1; prose in Task 3).
4. A `high-risk` cycle whose earlier whole-branch `/code-review` ran at medium — step 0b must not apply; step 1 runs a full review at high (Task 4).
5. Gate 3 entered in a session where Gate 2 did not run — the class is identified there before step 0 (Task 4).

---

### Task 1: Plan-header rule in the ledger guard

**Files:**
- Modify: `scripts/decision-ledger-guard.test.js` (header comment: a THIRD RULE paragraph; new constants and function; two new `describe`s)

**Interfaces:**
- Produces: `PLAN_CUTOFF = '2026-10-14'`; `PLAN_EXEMPT = new Set(['docs/superpowers/plans/2026-10-14-m1-measurement-prose-rules.md'])`, declared closed in the header; `planInScope(relPath: string): boolean` (directly under `docs/superpowers/plans`, `.md`, dated ≥ `PLAN_CUTOFF`, not in `PLAN_EXEMPT`); `checkPlanHeader(md: string): { ok: true } | { ok: false, reason: 'missing-branch' | 'missing-risk-class' }`.
- Line patterns, CRLF tolerated: `` /^\*\*Branch:\*\* `[^`]+`/ `` and `/^\*\*Risk class:\*\* (low-risk|standard|high-risk)(\s|$)/`.

- [ ] **Step 1: Write the failing tests**, one `it` each:
  - `checkPlanHeader` accepts `` **Branch:** `x` `` + `**Risk class:** standard — r`, and the CRLF twin.
  - accepts a Branch line with a trailing explanation: `` **Branch:** `x` — the name must contain the slug ``.
  - `**Risk class:** High-risk — r` and `**Risk class:** medium` → `missing-risk-class`.
  - no Branch line → `missing-branch`; Branch without backticks (`**Branch:** x`) → `missing-branch`.
  - `planInScope`: M4's plan path → true; M1's plan → false; a `2026-10-13-…` plan → false; a spec path → false.
  - live: every in-scope plan passes `checkPlanHeader` (failure message names the files and points to `PROCESS.md` §6.1b).
- [ ] **Step 2:** `npx vitest run scripts/decision-ledger-guard.test.js` → FAIL (`checkPlanHeader` not defined).
- [ ] **Step 3:** Implement the constants and functions; extend the header comment with the third rule and its limits (does not check that the class is right nor that the branch exists, §6b; exemption list closed).
- [ ] **Step 4:** `npx vitest run scripts/decision-ledger-guard.test.js` → PASS (this Plan is in scope and carries both lines).
- [ ] **Step 5:** Commit `test: ledger guard requires Branch and Risk class in plans (M4)`.

### Task 2: `PROCESS.md` — §6.1b, dispatch bullet, §6b

**Files:**
- Modify: `docs/superpowers/PROCESS.md` — new `### 6.1b Classe di rischio, dichiarata al passaggio Piano → Esecuzione` between §6.1 and §6.2; one bullet appended to §6.1; the `/writing-plans` bullet of §6b «Dove si applica» (line 261).

**Interfaces:**
- Produces: the section title `§6.1b`, cited by Tasks 3 and 4.

- [ ] **Step 1:** Write §6.1b with the content of spec §2 and §3: the three classes and their categories, «nel dubbio la più alta», declared not deduced with the category that justifies it, the Plan header lines (`**Spec:**`, `**Branch:**`, `**Risk class:**`), the branch created with exactly the declared name, the effort mapping.
- [ ] **Step 2:** Append to §6.1 the dispatch bullet from spec §7 (implementer: the task's file list, open before editing; reviewer: same list + commit range; not applicable in native execution).
- [ ] **Step 3:** In §6b's `/writing-plans` bullet add the risk class (with its §6.1b category) next to the mode and model.
- [ ] **Step 4:** `npx vitest run scripts/` → PASS (doc-paths and claude-md guards read `PROCESS.md`).
- [ ] **Step 5:** Commit `docs: PROCESS.md §6.1b risk class, dispatch file context (M4)`.

### Task 3: `finish-cycle.md` — Gate 2

**Files:**
- Modify: `.claude/commands/finish-cycle.md` — a new block between the no-code classification bullets (line 42) and step 0 (line 44); step 0's last bullet (line 48); steps 2-4 (lines 61-63) and step 5's intro (line 64).

**Interfaces:**
- Consumes: §6.1b (Task 2).
- Produces: `<risk-class>`, `<review-effort>`, and «the identification step» as a name Task 4 cites.

- [ ] **Step 1:** Add the identification step per spec §4: runs on both branches, read-only; lists `docs/superpowers/plans/*.md` (direct files only) whose line starts with `` **Branch:** `<current branch>` `` (the backticked name, any trailing text allowed); exactly one → the cycle's Plan, read `**Spec:**` and `**Risk class:**`; zero, more than one, or a class absent / outside the three values → `standard`, said in one line with the reason; one line shows class, source, effort; no question. Records `<risk-class>` and `<review-effort>` per §6.1b's mapping.
- [ ] **Step 2:** Step 0's last bullet: `/code-review` at `<review-effort>` instead of medium. Its "Skip this" bullet: in `high-risk` the skip does not apply, and the 0b bullet applies only if the review defining `<reviewed-sha>` ran at high (same conditions as Gate 3, Task 4 — state them once in Gate 3 and link from here).
- [ ] **Step 3:** Steps 2-4: prefix "Only when the identification step found no Plan" and keep their text; step 5 receives the declared Plan and Spec when the identification step found them.
- [ ] **Step 4:** `grep -n "medium" .claude/commands/finish-cycle.md` → the only remaining hits are Gate 3 step 1 (Task 4) and the historical rationale in step 0b.
- [ ] **Step 5:** `npx vitest run scripts/` → PASS.
- [ ] **Step 6:** Commit `docs: finish-cycle Gate 2 reads Plan, Spec and risk class by declared branch (M4)`.

### Task 4: `finish-cycle.md` — Gate 3 and Gate 5 template

**Files:**
- Modify: `.claude/commands/finish-cycle.md` — Gate 3 collection paragraph (line 78), steps 0, 0b, 1 (lines 84-86), re-round bullet (line 94); Gate 5 report template after `**Cycle counters:**` (line 170) and its comment.

**Interfaces:**
- Consumes: `<risk-class>`, `<review-effort>`, the identification step (Task 3); §6.1b (Task 2).

- [ ] **Step 1:** Gate 3 head: if `<risk-class>` was not recorded in this session, run Gate 2's identification step first.
- [ ] **Step 2:** Step 0: in `high-risk` the full skip does not apply. Step 0b: in `high-risk` applies only if the review defining `<reviewed-sha>` ran at high; otherwise step 1.
- [ ] **Step 3:** Step 1, the scoped review in the collection paragraph, and the re-round bullet: `/code-review` at `<review-effort>`.
- [ ] **Step 4:** Gate 5 template: add `**Risk class:** <class> (<source: Plan | not declared → standard>) · review effort <low|medium|high>` after `**Cycle counters:**`; one comment line: the value is the one the identification step recorded.
- [ ] **Step 5:** `grep -n "medium effort" .claude/commands/finish-cycle.md` → no hit outside the step 0b historical rationale.
- [ ] **Step 6:** `npm test` → PASS.
- [ ] **Step 7:** Commit `docs: finish-cycle Gate 3 effort by risk class, no skip in high-risk; report line (M4)`.

## Decisioni aperte

1. **Native-friendly task split by file, sequential.** Alternativa scartata: one task per spec section. Perché: Gate 2 and Gate 3 edits cross-reference each other in one file, and the guard must land first so the Plan itself is checked.
2. **The high-risk skip conditions are written once, in Gate 3, and Gate 2 step 0 links to them.** Alternativa scartata: repeat them in both gates. Perché: one home per rule; Gate 2 step 0 already defers to Gate 3 for the skip check.
