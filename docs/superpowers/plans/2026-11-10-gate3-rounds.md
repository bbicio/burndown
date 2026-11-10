# Gate 3 rounds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** from round 2 the Gate 3 review covers only the previous round's fixes and knows the decided findings; a round whose fixes are text-only and answer only Minor findings closes without a new review; the round-1 question offers three rules.

**Architecture:** text in `.claude/commands/finish-cycle.md` Gate 3 step 3, reusing `node scripts/classify-cycle.mjs <range>` as the "text-only" predicate. One end-to-end test pins that the command judges only the range it is given.

**Tech Stack:** Markdown command file, Node ESM script `scripts/classify-cycle.mjs`, vitest.

**Spec:** `docs/superpowers/specs/2026-11-10-gate3-rounds-design.md`
**Branch:** `gate3-rounds`
**Risk class:** standard — process files (`.claude/`, `scripts/`), no high-risk category of §6.1b

The two tasks are independent; Task 2's text cites the command Task 1 pins.

## Global Constraints

- `<round-base>` = the HEAD the round just closed reviewed (Spec §2). Next round: `/code-review` at `<review-effort>` on `<round-base>..HEAD`.
- "Text-only" predicate, verbatim: `node scripts/classify-cycle.mjs <round-base>..HEAD` prints `no-code` as its first line. Any other output, an error or empty output → a new round.
- Round-1 options, verbatim and in this order: `Critical/Important now, Minor as follow-up` (recommended) · `Fix everything now` · `Everything as follow-up` · `Decide finding by finding`.
- Unchanged: the 3-round cap and options (a)/(b)/(c), the disposition-by-target rules, risk class and effort, background-review failure handling. `docs/superpowers/PROCESS.md` is not edited.
- Every file edit goes through the Edit tool, never `node -e` or `sed` with quoted text.

## Review Focus

1. **A range whose earlier commits touched code but whose own commits are docs-only** must classify `no-code` — the predicate must judge the range, not the branch. Test in Task 1.
2. **A fix that touches `TEST_CASES.md`** must start a new round (`ordinary`). Covered by `classify-cycle.test.js` case 7 (unit) — Task 1 Step 4 re-runs the file.
3. **A round fixing one Minor text finding and one Important finding** must start a new round — condition (a) is "every fixed finding is Minor". Checked in Task 2 Step 5 by reading the text.
4. **Round 3 closing by rule 2** must not trigger the (a)/(b)/(c) question. Checked in Task 2 Step 5.
5. **"Decide finding by finding"** must leave later rounds asking, as today. Checked in Task 2 Step 5.

---

### Task 1: pin `classify-cycle.mjs` on a two-dot range

**Files:**
- Test: `scripts/classify-cycle.test.js` (new case in `describe('classify-cycle.mjs end to end', …)`)

- [ ] **Step 1: Write the test** `'judges only the given two-dot range, not earlier commits'`: in `repo()`, commit `api/src/foo.js` ("base"), then commit `docs/a.md` ("docs"); `run(d, 'HEAD~1..HEAD')` → `firstLine(r.stdout)` is `'no-code'` and `r.stdout` does not contain `api/src/foo.js`. Same `E2E_TIMEOUT`.
- [ ] **Step 2: Run** `npx vitest run scripts/classify-cycle.test.js -t "two-dot"` — expected PASS (the script already accepts a range; this pins behaviour Gate 3 will depend on). To prove the test can fail, temporarily change the expectation to `'ordinary'`, watch it FAIL, restore.
- [ ] **Step 3: Commit** — `test(classify-cycle): pin that a two-dot range is judged on its own commits`.
- [ ] **Step 4: Run** `npx vitest run scripts/classify-cycle.test.js` — PASS (case 7 still pins `TEST_CASES.md` as code).

### Task 2: `.claude/commands/finish-cycle.md` — Gate 3 step 3

**Files:**
- Modify: `.claude/commands/finish-cycle.md` Gate 3 step 3 (the "Round 1 asks" bullet, the "If any fix was applied … round 1 or round 2" bullet, the "round 3" bullet's lead-in).

- [ ] **Step 1: Round-1 question.** Replace "Ask explicitly: "Fix now, accept as follow-up, or a mix (specify which)?"" with: ask with the four options of Global Constraints, the first marked recommended. The first three are rules: from round 2 they apply without asking, and the round reports how. The fourth is no rule: later rounds ask again. A rule the user writes in words still counts as today. Keep "If round 1 was decided finding by finding, no rule is inferred from it."
- [ ] **Step 2: When no new round starts (the "text-only rule").** New bullet, named in the command as the text-only rule, after "Before re-running the review…": after those checks and tests, the round closes without a new `/code-review` when (a) every finding fixed in this round was graded Minor by the reviewer and (b) the text-only predicate holds; the gate then goes to step 4, and the report's Gate 3 line says the round closed this way. Otherwise the next round starts.
- [ ] **Step 3: Scoped next round.** In "If any fix was applied and the round just completed was round 1 or round 2", "run `/code-review` again on the same scope" → "and the text-only rule (Step 2) did not close the round: run `/code-review` at `<review-effort>` on `<round-base>..HEAD`". Define `<round-base>` there (Global Constraints, plus for round 1: the HEAD covered by the collected run, or by step 1, plus commits the added scoped review covered). The reviewer's prompt carries every earlier finding with its decision (fixed, follow-up, no action) and the instruction not to re-raise them; it may read outside the range but reports only defects the range's commits cause. A scoped round counts toward the cap.
- [ ] **Step 4: Round 3.** The round-3 bullet's lead-in reads "If any fix was applied, the text-only rule did not close the round, and the round just completed was round 3".
- [ ] **Step 5: Verify** — `grep -n "on the same scope" .claude/commands/finish-cycle.md` → nothing; `grep -n "round-base\|classify-cycle.mjs <round-base>\|Decide finding by finding" .claude/commands/finish-cycle.md` → the new text; re-read Gate 3 step 3 against Review Focus 3-5; `npx vitest run scripts/` → PASS.
- [ ] **Step 6: Commit** — `docs(finish-cycle): scoped later Gate 3 rounds, no round for a text-only Minor fix, a rule at round 1`.

## Decisioni aperte

1. **Native execution.** Alternativa scartata: subagent-driven. Perché: two small tasks, one test and one block of text in a single file (§6.1).
2. **A new end-to-end test pins the two-dot range.** Alternativa scartata: relying on the existing three-dot cases. Perché: Gate 3 depends on the command judging only the range, and no current case shows earlier code commits being excluded.
