# /finish-cycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `.claude/commands/finish-cycle.md`, an explicit slash command that runs the full development-cycle closeout sequence (test → manual verification → code review → merge → doc sync + report → final summary) with every judgment gate stopping for explicit human confirmation and only objective gates (test pass/fail, pre-flight checks) blocking or unblocking on their own.

**Architecture:** This is a single markdown instructions file, no executable code. Each task appends one self-contained section (a "gate") to the file, in the order the command will execute them, so review can proceed gate-by-gate the same way the command runs. There is no code to unit-test; "testing" a task means grepping the produced file for the exact literal strings the spec requires (command names, prompts, file paths) so no gate silently drops the wording that makes it a *human* gate vs an *objective* one.

**Tech Stack:** Markdown only. No build step, no test runner. Verification is `grep -n` against the file being built and a final full-file read-through against the spec's checklist.

## Global Constraints

- The command file lives at `.claude/commands/finish-cycle.md` only. Do NOT create `.claude/skills/finish-cycle/SKILL.md` — no mirrored skill, no auto-activation surface (spec §"Decision: command, not skill").
- Exact verified commands to use verbatim, never paraphrased: `npm test`, `docker compose --profile test run --rm test`, `git checkout main && git merge --no-ff <branch> && git push origin main`.
- Every judgment gate (Gate 2 manual-verification question, Gate 3 findings triage, Gate 4 merge confirmation, Gate 4 branch-delete question, Gate 5 push confirmation) must contain an explicit question addressed to the user with no silent default. Every objective gate (pre-flight checks 1-4, Gate 1 test pass/fail, Gate 3 zero-findings case) must proceed or stop without asking.
- No new persisted state file anywhere in the command (spec Constraints: rejected explicitly — state is re-derived from git + the report file already on disk).
- Report files are written to `docs/superpowers/reports/<YYYY-MM-DD>-<branch-sanitized>-finish-cycle.md`; sanitization rule: replace `/` with `-` in the branch name.
- `/finish-cycle` only covers the dedicated-branch pattern: pre-flight check 1 requires the current branch not be `main`. No `<branch-name>` argument support, no PR-based merge flow (`gh pr create`/`gh pr merge`) — direct local merge + push only.

---

### Task 1: File header, Pre-flight, Gate 1 (TEST)

**Files:**
- Create: `.claude/commands/finish-cycle.md`

**Interfaces:**
- Consumes: nothing
- Produces: the file itself, with a `## Pre-flight` section (5 checks) and a `## Gate 1 — TEST` section, both referenced by heading text (`## Pre-flight`, `## Gate 1`) as insertion anchors for Task 2

- [ ] **Step 1: Create the file with header, Pre-flight, and Gate 1**

Write `.claude/commands/finish-cycle.md` with exactly this content:

```markdown
# /finish-cycle — Development Cycle Closeout Command

Run the full closeout sequence for the current feature branch: test, optional manual-verification gate, code review, merge to main, doc sync, and a persisted report. Every judgment gate (code review findings, merge, the doc-sync/report push) always stops for explicit confirmation. Only objective gates (test pass/fail, pre-flight checks) block or unblock without asking.

## Pre-flight (automatic, no confirmation)

1. Confirm the current branch is not `main` (`git branch --show-current`). If it is, stop: "finish-cycle must be run from a feature branch, not main."
2. Run `git status --short`. If there is any output (uncommitted changes), stop and ask the user to commit or stash first — do not decide this for them.
3. Run `git log main..HEAD --oneline`. If empty, stop: "No commits to close out on this branch."
4. Determine the branch name (`git branch --show-current`) and sanitize it for filesystem use: replace every `/` with `-`. Store the result as `<branch-sanitized>` — it is used in the Gate 5 report filename.
5. **Informational, non-blocking:** run `git merge-base main HEAD` and `git rev-parse main`. If they differ, run `git rev-list --count <merge-base>..main` and report: "main has advanced N commits since this branch diverged — Gate 4's merge will produce a merge commit, not a fast-forward." Do not block on this.

## Gate 1 — TEST (blocking, automatic, no confirmation)

1. Run `npm test`.
   - If it fails: stop immediately, show the failing output verbatim. Do not start Docker. Require a fix and a re-run of `/finish-cycle` from the top.
2. If it passes, run `git diff --stat main...HEAD` and inspect the listed paths.
   - If any path starts with `api/` (including `api/src/db/migrations/`), or if any touched path's relevance to backend behavior is unclear/ambiguous, proceed to step 3.
   - Otherwise, skip straight to Gate 2.
3. Run `docker compose --profile test run --rm test`.
   - If it fails: stop immediately, show the failing output verbatim. Require a fix and a re-run of `/finish-cycle` from the top.
4. Proceed automatically to Gate 2 — no confirmation needed, this is an objective gate.
```

- [ ] **Step 2: Verify the file was created with both required sections**

Run: `grep -n "^## Pre-flight\|^## Gate 1" .claude/commands/finish-cycle.md`
Expected: two lines — `## Pre-flight (automatic, no confirmation)` and `## Gate 1 — TEST (blocking, automatic, no confirmation)`, in that order.

- [ ] **Step 3: Verify the exact required commands are present verbatim**

Run: `grep -n "npm test\|docker compose --profile test run --rm test" .claude/commands/finish-cycle.md`
Expected: both strings found, exactly as written (no paraphrase, e.g. not "run the docker test suite").

- [ ] **Step 4: Commit**

```bash
git add .claude/commands/finish-cycle.md
git commit -m "docs(finish-cycle): add pre-flight and Gate 1 (TEST)"
```

---

### Task 2: Gate 2 (MANUAL VERIFICATION) and Gate 3 (CODE REVIEW)

**Files:**
- Modify: `.claude/commands/finish-cycle.md` (append after the `## Gate 1` section created in Task 1)

**Interfaces:**
- Consumes: nothing from Task 1's content directly, but appends after it in file order
- Produces: `## Gate 2` and `## Gate 3` sections; Gate 3 introduces the `code_review_followups` list, referenced by name in Task 4's Gate 5 report template

- [ ] **Step 1: Append Gate 2 and Gate 3 sections**

Using Edit on `.claude/commands/finish-cycle.md`, insert the following immediately after the last line of the Gate 1 section (`4. Proceed automatically to Gate 2 — no confirmation needed, this is an objective gate.`):

```markdown

## Gate 2 — MANUAL VERIFICATION (human gate, always confirms)

1. Run `git log --diff-filter=A main..HEAD -- docs/superpowers/` to find spec/plan files added inside this branch.
2. Run `git log main..HEAD | grep -o 'docs/superpowers/[^ ]*\.md'` to find spec/plan files referenced in this branch's commit messages.
3. Combine the two result sets (deduplicated):
   - Exactly one unique file → read it and check for mentions of browser verification or jsdom-untestable behavior. Show the file path and what was found (or state "no explicit mention of manual verification found in this file" if none).
   - More than one → state explicitly: "Found N candidates: [list] — no automatic selection."
   - Zero → state explicitly: "No spec/plan reference found in this branch's commits."
4. Regardless of the outcome in step 3, always ask explicitly: "Have you manually verified this in the browser? [yes/no]"
   - If the answer is "no" or anything other than a clear yes: stop and wait. Do not proceed.
   - If "yes": proceed to Gate 3.

## Gate 3 — CODE REVIEW (conditional human gate, max 3 rounds by default)

1. Run `/code-review` at medium effort, scoped to the diff between the current branch and `main`. This is round 1. Maintain a running list, `code_review_followups`, starting empty.
2. If the review reports zero findings: state this explicitly ("Code review: no findings.") and proceed automatically to Gate 4 — no confirmation needed.
3. If the review reports one or more findings:
   - Show all findings.
   - Ask explicitly: "Fix now, accept as follow-up, or a mix (specify which)?"
   - For every finding the user accepts as follow-up, append it to `code_review_followups`, tagged with the current round number.
   - For every finding the user chooses to fix now, apply the fix.
   - If any fix was applied and the round just completed was round 1 or round 2: run `/code-review` again on the same scope (this becomes the next round) and repeat step 2/3 for it.
   - If any fix was applied and the round just completed was round 3 (i.e. a 4th run would be required by the normal flow): do not silently re-run. Instead:
     - State explicitly: "3 rounds of code review in a row have produced findings — this suggests a more structural issue than an isolated fix, not just noise."
     - Show the full sequence of findings across all three rounds, not just round 3's.
     - Ask explicitly among exactly three options: "(a) continue past the limit with another review round, (b) accept everything remaining as follow-up, or (c) stop the cycle to reconsider the approach."
     - On (a): run another round and treat it like any other round — the user has explicitly opted past the default cap, so no further hardcoded limit applies.
     - On (b): append all remaining findings to `code_review_followups` and proceed to Gate 4.
     - On (c): stop `/finish-cycle` entirely.
4. Once the gate is passed (zero findings, or all remaining findings accepted as follow-up), proceed to Gate 4, carrying `code_review_followups` forward for use in Gate 5.
```

- [ ] **Step 2: Verify both sections and the follow-up list variable are present**

Run: `grep -n "^## Gate 2\|^## Gate 3\|code_review_followups" .claude/commands/finish-cycle.md`
Expected: `## Gate 2` heading, `## Gate 3` heading, and at least 3 occurrences of `code_review_followups` (introduced, appended-to on accept, and carried forward to Gate 4/5).

- [ ] **Step 3: Verify the 3-round limit language is present**

Run: `grep -n "3 rounds of code review\|continue past the limit" .claude/commands/finish-cycle.md`
Expected: both phrases found — confirms the escalation behavior at round 3 wasn't dropped.

- [ ] **Step 4: Commit**

```bash
git add .claude/commands/finish-cycle.md
git commit -m "docs(finish-cycle): add Gate 2 (manual verification) and Gate 3 (code review)"
```

---

### Task 3: Gate 4 (MERGE)

**Files:**
- Modify: `.claude/commands/finish-cycle.md` (append after the `## Gate 3` section created in Task 2)

**Interfaces:**
- Consumes: nothing from Tasks 1-2 directly, appends after Gate 3 in file order
- Produces: `## Gate 4` section; establishes the exact merge command sequence, referenced nowhere else verbatim but must match the Global Constraints line exactly

- [ ] **Step 1: Append the Gate 4 section**

Using Edit on `.claude/commands/finish-cycle.md`, insert the following immediately after the last line of the Gate 3 section (`4. Once the gate is passed (zero findings, or all remaining findings accepted as follow-up), proceed to Gate 4, carrying \`code_review_followups\` forward for use in Gate 5.`):

```markdown

## Gate 4 — MERGE (always an explicit human gate, never automatic)

1. Build the pre-merge summary:
   - Commit count: `git log main..HEAD --oneline | wc -l`
   - Files touched by category: run `git diff --stat main...HEAD`, then group the listed files by top-level path prefix (`js/`, `api/`, `css/`, `docs/`, or "root-level" for any file with no `/` in its path).
   - Out-of-scope check: if Gate 2 identified exactly one plan file, read its "File Structure" section (a markdown table or list of file paths near the top of the plan) and compare it against the files touched in this diff. List, non-blocking, any touched file not mentioned there as "outside the declared File Structure."
   - Include the pre-flight divergence note from check 5, if it fired.
2. Show the full summary. Ask explicitly: "Proceed with merge? [yes/no]"
   - If the answer is anything other than a clear yes: stop and wait.
3. If confirmed, run in sequence:
   ```bash
   git checkout main
   git merge --no-ff <branch>
   git push origin main
   ```
   - If `git merge` reports conflicts: stop immediately, run `git status` to list the conflicting files, show them, and do not attempt automatic resolution.
4. After a successful push, ask explicitly: "Delete the local branch `<branch>`? [yes/no]" — no default either way.
   - If yes: run `git branch -d <branch>`.
   - If no: leave the branch as-is.
```

- [ ] **Step 2: Verify the exact merge command sequence is present verbatim**

Run: `grep -n "git checkout main\|git merge --no-ff\|git push origin main" .claude/commands/finish-cycle.md`
Expected: at least 2 matches for this triad in Gate 4 (there is also a `git push origin main` in the not-yet-written Gate 5, so this check only confirms Gate 4's own three lines exist — re-run after Task 4 will show more).

- [ ] **Step 3: Verify the branch-delete question has no default**

Run: `grep -n "Delete the local branch" .claude/commands/finish-cycle.md`
Expected: one match, phrased as a yes/no question with no stated default in either direction.

- [ ] **Step 4: Commit**

```bash
git add .claude/commands/finish-cycle.md
git commit -m "docs(finish-cycle): add Gate 4 (merge)"
```

---

### Task 4: Gate 5 (SYNC-DOCS + REPORT), Gate 6 (FINAL REPORT), and self-review

**Files:**
- Modify: `.claude/commands/finish-cycle.md` (append after the `## Gate 4` section created in Task 3)

**Interfaces:**
- Consumes: `code_review_followups` list name from Task 2 (referenced in the Gate 5 report template); `<branch-sanitized>` variable name from Task 1's pre-flight step 4
- Produces: `## Gate 5` and `## Gate 6` sections; completes the file — no later task depends on this one

- [ ] **Step 1: Append the Gate 5 and Gate 6 sections**

Using Edit on `.claude/commands/finish-cycle.md`, insert the following immediately after the last line of the Gate 4 section (`   - If no: leave the branch as-is.`):

```markdown

## Gate 5 — SYNC-DOCS + REPORT (after merge, shared human gate)

1. On `main` (post-merge), invoke `/sync-docs`. Let it run its existing, unmodified scope (ARCHITECTURE.md, CLAUDE.md, TEST_CASES.md, test-cases.html, test-api.js, PRD.md-conditional) — do not reimplement or narrow it here.
2. Create the report file at `docs/superpowers/reports/<YYYY-MM-DD>-<branch-sanitized>-finish-cycle.md` (today's date; `<branch-sanitized>` from pre-flight step 4) with this structure:

   ```markdown
   # Finish-cycle report — <branch>

   **Date:** <YYYY-MM-DD>
   **Branch:** <branch> → main

   ## What was done

   <commit count and one-line-per-commit summary, from Gate 4's `git log main..HEAD --oneline` output captured before the merge>

   ## Code review follow-ups

   <one bullet per entry in code_review_followups, each noting: round number, finding summary, file/line if available. Write "None." if the list is empty.>

   ## Roadmap notes

   <dead code, candidate bugs, or other observations surfaced during Gates 1-4, collected as they came up — not invented retroactively. Write "None." if nothing surfaced.>

   ## Sync-docs outcome

   <which files /sync-docs updated and which it didn't, with reasoning — copied directly from /sync-docs's own summary output in step 1>
   ```

3. Show the combined diff (`git diff`, covers both `/sync-docs`'s edits and the new report file, since neither has been committed yet).
4. Ask explicitly: "Commit and push these doc/report changes to main? [yes/no]"
   - If the answer is anything other than a clear yes: stop and wait, leaving the changes uncommitted locally.
5. If confirmed, run in sequence:
   ```bash
   git add <files changed by sync-docs> docs/superpowers/reports/<report-filename>
   git commit -m "docs: sync docs + finish-cycle report for <branch>"
   git push origin main
   ```

## Gate 6 — FINAL REPORT (in chat)

Print in chat:
- The path to the just-committed report file.
- One line per gate (1 through 5) stating its outcome (e.g. "Gate 1: passed (frontend + backend)", "Gate 3: 1 finding, fixed and re-verified", "Gate 4: merged, merge commit (main had diverged)").
- An explicit pointer: "See the Roadmap notes section of `<report path>` for open items."
```

- [ ] **Step 2: Verify Gate 5's push confirmation has no automatic default**

Run: `grep -n "Commit and push these doc/report changes to main" .claude/commands/finish-cycle.md`
Expected: one match — confirms this gate asks explicitly rather than auto-pushing (per spec: same category as the Gate 4 merge, never automatic).

- [ ] **Step 3: Verify the report template references the right prior-task names**

Run: `grep -n "code_review_followups\|branch-sanitized" .claude/commands/finish-cycle.md`
Expected: `code_review_followups` appears in both Gate 3 (Task 2) and Gate 5 (this task); `branch-sanitized` (or `<branch-sanitized>`) appears in both pre-flight step 4 (Task 1) and Gate 5 (this task) — confirms no naming drift between tasks.

- [ ] **Step 4: Full self-review read-through against the spec**

Read the complete file: `.claude/commands/finish-cycle.md`. Check it against this list, taken directly from `docs/superpowers/specs/2026-07-02-finish-cycle-design.md`:

- [ ] Pre-flight has exactly 5 checks, the 5th explicitly marked non-blocking.
- [ ] Gate 1 runs `npm test` before any Docker command, and only runs Docker if frontend passed.
- [ ] Gate 1's backend trigger is the `api/` diff check, not a vague "if backend was touched."
- [ ] Gate 2 always asks the yes/no question, regardless of what the file search found.
- [ ] Gate 3 caps at 3 rounds by default and has the three-option escalation at round 3.
- [ ] Gate 4 always asks "Proceed with merge?" even implicitly assuming clean test/review.
- [ ] Gate 4 asks about branch deletion with no stated default.
- [ ] Gate 5 runs `/sync-docs` before writing the report, and both land in the same confirm-then-push step.
- [ ] Gate 5's report includes all four required sections: What was done, Code review follow-ups, Roadmap notes, Sync-docs outcome.
- [ ] No new state file (e.g. no `.claude/finish-cycle-state.json`) is introduced anywhere in the file.
- [ ] No `.claude/skills/finish-cycle/SKILL.md` was created (check with `ls .claude/skills/ 2>/dev/null | grep finish-cycle` — expect no output).

If any box doesn't hold, fix it inline with Edit before proceeding.

- [ ] **Step 5: Commit**

```bash
git add .claude/commands/finish-cycle.md
git commit -m "docs(finish-cycle): add Gate 5 (sync-docs + report) and Gate 6 (final report)"
```

---

## Self-Review Notes (completed by the plan author, not a task step)

**Spec coverage:** Pre-flight (Task 1), Gate 1 (Task 1), Gate 2 (Task 2), Gate 3 with 3-round limit (Task 2), Gate 4 with out-of-scope check and branch-delete question (Task 3), Gate 5 with report template and confirm-before-push (Task 4), Gate 6 (Task 4) — every gate in the spec has a task. The spec's "command, not skill" decision is enforced by Task 4 Step 4's explicit check that no `SKILL.md` was created, and by the Global Constraints line stating the same.

**Placeholder scan:** no TBD/TODO; every step contains the literal markdown to insert, not a description of it.

**Type/reference consistency:** `code_review_followups` is introduced in Task 2 (Gate 3) exactly as a list that gets appended to, and Task 4's Gate 5 report template reads from that same list — matches. `<branch-sanitized>` is defined in Task 1 (pre-flight step 4) and consumed in Task 4 (Gate 5 report filename) — matches, same name used both places. The merge command triad (`git checkout main`, `git merge --no-ff <branch>`, `git push origin main`) in Task 3 matches the Global Constraints line verbatim.
