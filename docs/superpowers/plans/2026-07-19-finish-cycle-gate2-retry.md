# Finish-cycle Gate 2 Retry-Aware Branch Env Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `scripts/test-branch.sh` into `/finish-cycle`'s Gate 2 so it auto-detects whether a branch test environment is already running (from an earlier `/finish-cycle` run on the same branch) and asks a reuse-vs-rebuild question instead of the ambiguous "spin up now?" question every time.

**Architecture:** A new `status` subcommand in `scripts/test-branch.sh` reports whether the branch-specific stack is up (both DB and API containers running) by querying real Docker state — no new persisted state. `finish-cycle.md`'s Gate 2 gains a new step 1 that calls `status` and branches its question accordingly; the gate's existing spec/plan-lookup and manual-verification steps are otherwise unchanged, renumbered, and gain the teardown-on-confirmed-verification / leave-running-on-not-yet-verified behavior that `<branch-env-active>` was introduced to support. `PROCESS.md`'s one-line `/finish-cycle` description is updated to match.

**Tech Stack:** Bash (`scripts/test-branch.sh`, `set -euo pipefail`), Markdown command file (`.claude/commands/finish-cycle.md`), Markdown process doc (`docs/superpowers/PROCESS.md`).

## Global Constraints

- No new persisted state file — `status` always queries Docker's actual container state, never a session variable or a file on disk.
- Gate 2's judgment gates keep stopping for explicit confirmation always — no silent automatic decision that skips asking the user (per the brief's constraint, mirroring the rest of `finish-cycle.md`'s style).
- No changes to `up()`/`down()` internals in `scripts/test-branch.sh` beyond adding the new `status()` function and its dispatch case.
- No changes to Gate 2's existing spec/plan-lookup or manual-verification question wording beyond inserting the new step 1 ahead of them, renumbering, and adding the teardown/leave-running behavior to the final step.
- No changes to Gates 1, 3, 4, 5, 6 of `finish-cycle.md`.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/test-branch.sh` (modify) | Add `status()` function + `status` dispatch case — reports `up`/`down` by querying `docker ps` for both `$DB_CONTAINER` and `$API_CONTAINER`. |
| `.claude/commands/finish-cycle.md` (modify) | Gate 2 gains a new step 1 (auto-detect via `status`, reuse/rebuild question) and gains teardown-on-yes / leave-running-on-no behavior on its final step. |
| `docs/superpowers/PROCESS.md` (modify) | Line 26's `/finish-cycle` one-line description updated to mention Gate 2's auto-detection. |

---

### Task 1: Add `status` subcommand to `scripts/test-branch.sh`

**Files:**
- Modify: `scripts/test-branch.sh:80-148` (add a `status()` function after `open_browser()`, and add a `status` case to the dispatch block at the end)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `scripts/test-branch.sh status` — prints `up` and exits 0 if both `$DB_CONTAINER` and `$API_CONTAINER` are running (per `docker ps --format '{{.Names}}'`); prints `down` and exits 1 otherwise. Task 2's `finish-cycle.md` prose consumes this exit code/output convention.

- [ ] **Step 1: Write the verification commands and run them, confirm they currently fail**

The `status` subcommand doesn't exist yet. Verify this from the repo root:

```bash
bash scripts/test-branch.sh status
echo "exit code: $?"
```

Expected: `Usage: scripts/test-branch.sh [up|down]` printed to stderr (from the existing catch-all case), exit code 1 — confirms `status` isn't recognized yet. (This requires being on a non-`main` branch, since the script refuses to run on `main` before reaching the dispatch — check out any feature branch first if needed, or note the branch-refusal message instead if run from `main`; either output confirms `status` isn't wired up yet.)

- [ ] **Step 2: Add the `status()` function**

In `scripts/test-branch.sh`, after the `open_browser()` function (ends at line 101 with a closing `}`) and before the `up()` function (starts at line 103), insert:

```bash
status() {
  if docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER" && \
     docker ps --format '{{.Names}}' | grep -qx "$API_CONTAINER"; then
    echo "up"
    exit 0
  else
    echo "down"
    exit 1
  fi
}
```

- [ ] **Step 3: Wire `status` into the dispatch block**

At the end of the file, change:

```bash
case "${1:-up}" in
  up) up ;;
  down) down ;;
  *) echo "Usage: $0 [up|down]" >&2; exit 1 ;;
esac
```

to:

```bash
case "${1:-up}" in
  up) up ;;
  down) down ;;
  status) status ;;
  *) echo "Usage: $0 [up|down|status]" >&2; exit 1 ;;
esac
```

- [ ] **Step 4: Verify syntax**

```bash
bash -n scripts/test-branch.sh
```

Expected: no output, exit 0.

- [ ] **Step 5: Re-run the Step 1 verification command, confirm `status` reports `down` when nothing is running**

From a non-`main` branch, with no branch stack currently running for it:

```bash
bash scripts/test-branch.sh status
echo "exit code: $?"
```

Expected output:
```
down
exit code: 1
```

- [ ] **Step 6: Verify `status` reports `up` when the stack is genuinely running**

This step requires Docker to actually be available and willing to build/start containers — skip with a note in your report if Docker isn't usable in this environment, and say so explicitly (do not fabricate a result).

```bash
bash scripts/test-branch.sh up
# wait for it to finish (it opens a browser tab and prints "Stack up." when done)
bash scripts/test-branch.sh status
echo "exit code: $?"
```

Expected output for the second command:
```
up
exit code: 0
```

Then tear down what you started:

```bash
bash scripts/test-branch.sh down
```

- [ ] **Step 7: Verify `status` reports `down` again after teardown**

```bash
bash scripts/test-branch.sh status
echo "exit code: $?"
```

Expected output:
```
down
exit code: 1
```

- [ ] **Step 8: Commit**

```bash
git add scripts/test-branch.sh
git commit -m "$(cat <<'EOF'
feat: add status subcommand to test-branch.sh

Reports whether the current branch's isolated test stack is running
(both DB and API containers present per `docker ps`) by querying
Docker's real state directly — no new persisted state. Consumed by
finish-cycle.md's Gate 2 to auto-detect an already-active branch
environment instead of asking the same "spin up now?" question
unconditionally on every /finish-cycle run.
EOF
)"
```

---

### Task 2: Wire Gate 2 auto-detection into `finish-cycle.md` + update `PROCESS.md`

**Files:**
- Modify: `.claude/commands/finish-cycle.md` (the `## Gate 2 — MANUAL VERIFICATION` section)
- Modify: `docs/superpowers/PROCESS.md:26`

**Interfaces:**
- Consumes: `scripts/test-branch.sh status` (Task 1) — exit 0 + stdout `up`, or exit 1 + stdout `down`.
- Produces: nothing consumed by further tasks (this is the last task in this plan).

- [ ] **Step 1: Replace the Gate 2 section in `finish-cycle.md`**

The current Gate 2 section reads exactly:

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
```

Replace the entire section with:

```markdown
## Gate 2 — MANUAL VERIFICATION (human gate, always confirms)

1. Run `scripts/test-branch.sh status`.
   - If `down` (exit 1): ask explicitly "Spin up an isolated test environment for this branch now? [yes/no]"
     - If yes: run `scripts/test-branch.sh up`. Record `<branch-env-active>` = true.
     - If no: record `<branch-env-active>` = false, unless it was already true earlier in this same session (do not overwrite an existing true with false).
   - If `up` (exit 0): ask explicitly "An isolated test environment for this branch is already running (from an earlier `/finish-cycle` run on this branch) — reuse it, or rebuild it with fresh data from main? [reuse/rebuild]"
     - If reuse: do nothing further. Record `<branch-env-active>` = true.
     - If rebuild: run `scripts/test-branch.sh down`, then `scripts/test-branch.sh up`. Record `<branch-env-active>` = true.
2. Run `git log --diff-filter=A main..HEAD -- docs/superpowers/` to find spec/plan files added inside this branch.
3. Run `git log main..HEAD | grep -o 'docs/superpowers/[^ ]*\.md'` to find spec/plan files referenced in this branch's commit messages.
4. Combine the two result sets (deduplicated):
   - Exactly one unique file → read it and check for mentions of browser verification or jsdom-untestable behavior. Show the file path and what was found (or state "no explicit mention of manual verification found in this file" if none).
   - More than one → state explicitly: "Found N candidates: [list] — no automatic selection."
   - Zero → state explicitly: "No spec/plan reference found in this branch's commits."
5. Regardless of the outcome in step 4, always ask explicitly: "Have you manually verified this in the browser? [yes/no]"
   - If the answer is "no" or anything other than a clear yes: stop and wait. Do not proceed. Do not tear down the branch environment if `<branch-env-active>` is true — leave it running so the user can keep testing.
   - If "yes": if `<branch-env-active>` is true, run `scripts/test-branch.sh down` to tear down the test stack. Then proceed to Gate 3.
```

- [ ] **Step 2: Update `PROCESS.md` line 26**

Read `docs/superpowers/PROCESS.md` and find the `/finish-cycle` row of the table in §1 (currently line 26). It reads:

```
| **`/finish-cycle`** | Terminale di ogni esecuzione in questo progetto — sostituisce `superpowers:finishing-a-development-branch`, non la segue. Gate condizionali: `npm test` → suite Docker backend (se il diff tocca `api/`) → verifica manuale (ricerca spec/piano, sempre conferma, mai euristica) → `/code-review` (max 3 round) → merge `--no-ff` con riepilogo pre-merge esplicito e pulizia worktree → `/sync-docs` + report persistito in `docs/superpowers/reports/` con conferma esplicita di push → report finale in chat. Ogni gate di giudizio si ferma sempre; solo test/preflight sono automatici. |
```

Replace the `verifica manuale (ricerca spec/piano, sempre conferma, mai euristica)` clause with `verifica manuale (ambiente Docker isolato per il branch rilevato automaticamente via scripts/test-branch.sh status — riuso o rebuild se già attivo; ricerca spec/piano, sempre conferma, mai euristica)`, keeping every other word in the row unchanged. The full replacement row:

```
| **`/finish-cycle`** | Terminale di ogni esecuzione in questo progetto — sostituisce `superpowers:finishing-a-development-branch`, non la segue. Gate condizionali: `npm test` → suite Docker backend (se il diff tocca `api/`) → verifica manuale (ambiente Docker isolato per il branch rilevato automaticamente via scripts/test-branch.sh status — riuso o rebuild se già attivo; ricerca spec/piano, sempre conferma, mai euristica) → `/code-review` (max 3 round) → merge `--no-ff` con riepilogo pre-merge esplicito e pulizia worktree → `/sync-docs` + report persistito in `docs/superpowers/reports/` con conferma esplicita di push → report finale in chat. Ogni gate di giudizio si ferma sempre; solo test/preflight sono automatici. |
```

- [ ] **Step 3: Verify the edits by reading both files back**

Read `.claude/commands/finish-cycle.md` and confirm the `## Gate 2` section matches Step 1's replacement text exactly (5 numbered steps, step 1 being the new auto-detect logic). Read `docs/superpowers/PROCESS.md` line 26 and confirm it now contains the `scripts/test-branch.sh status` clause. These are prose/markdown files — verification is a direct read-and-compare, not a test run.

- [ ] **Step 4: Commit**

```bash
git add .claude/commands/finish-cycle.md docs/superpowers/PROCESS.md
git commit -m "$(cat <<'EOF'
docs: wire Gate 2 auto-detection of an already-active branch env

finish-cycle.md's Gate 2 now runs `scripts/test-branch.sh status`
first and asks a reuse-vs-rebuild question when a branch stack from
an earlier /finish-cycle run is still active, instead of repeating
the ambiguous "spin up now?" question every time. Adds the
teardown-on-confirmed-verification / leave-running-on-not-yet-verified
behavior <branch-env-active> was introduced to support. PROCESS.md's
/finish-cycle description updated to match.

Closes Cycle 2 of docs/superpowers/audits/2026-07-18-test-branch-script-process-integration-audit.md.
EOF
)"
```

---

## Self-Review

**Spec coverage:** Design §1 (`status` subcommand) → Task 1. Design §2 (Gate 2 rewrite) → Task 2 Step 1. Design §3 (`PROCESS.md` update) → Task 2 Step 2. All three design sections have a task.

**Placeholder scan:** No TBD/TODO; every step has literal, complete content (full function code, full replaced Markdown sections, exact commit messages).

**Type consistency:** N/A (bash + Markdown, no typed interfaces beyond the `status`/exit-code contract, used consistently between Task 1's Produces and Task 2's Consumes).

## Out of scope (per the brief)

- No changes to `up()`/`down()` internals beyond what Task 1 adds.
- No changes to Gates 1, 3, 4, 5, 6 of `finish-cycle.md`.
- The pre-existing `CLAUDE.md` hot-reload/nodemon discrepancy — out of scope, as already noted in the originating audit.
