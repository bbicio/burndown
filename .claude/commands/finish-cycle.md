# /finish-cycle — Development Cycle Closeout Command

Run the full closeout sequence for the current feature branch: test, optional manual-verification gate, code review, merge to main, backend restart (if applicable), doc sync, and a persisted report. Every judgment gate (code review findings, merge, the backend restart, the doc-sync/report push) always stops for explicit confirmation. Only objective gates (test pass/fail, pre-flight checks) block or unblock without asking.

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

## Gate 4 — MERGE (always an explicit human gate, never automatic)

1. Build the pre-merge summary:
   - Commit count: `git log main..HEAD --oneline | wc -l`
   - Files touched by category: run `git diff --stat main...HEAD`, then group the listed files by top-level path prefix (`js/`, `api/`, `css/`, `docs/`, or "root-level" for any file with no `/` in its path).
   - Out-of-scope check: if Gate 2 identified exactly one plan file, read its "File Structure" section (a markdown table or list of file paths near the top of the plan) and compare it against the files touched in this diff. List, non-blocking, any touched file not mentioned there as "outside the declared File Structure."
   - Include the pre-flight divergence note from check 5, if it fired.
2. Show the full summary. Ask explicitly: "Proceed with merge? [yes/no]"
   - If the answer is anything other than a clear yes: stop and wait.
3. **CWD safety check (worktrees):** run:
   ```bash
   GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
   GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
   ```
   If `GIT_DIR != GIT_COMMON`, the current checkout is a linked worktree — `git checkout main` from here will fail because `main` is already checked out elsewhere. Before continuing, `cd` to the main repo root:
   ```bash
   MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
   cd "$MAIN_ROOT"
   ```
   If `GIT_DIR == GIT_COMMON`, this step is a no-op — proceed from the current directory.
4. If confirmed, run in sequence (from the main repo root, per step 3):
   ```bash
   git checkout main
   git merge --no-ff <branch>
   git push origin main
   ```
   - If `git merge` reports conflicts: stop immediately, run `git status` to list the conflicting files, show them, and do not attempt automatic resolution.
5. **Backend restart (only if Gate 1 step 2 determined the diff touches `api/`):** `pdash-api` runs as a plain `node src/index.js` process (`api/Dockerfile`) with no hot-reload — the `./api/src:/app/src` volume mount keeps the file on disk current, but the running process keeps serving whatever was in memory at container start until it is explicitly restarted. Merging a backend change to `main` does not make it take effect on its own.
   - Ask explicitly: "This cycle touched `api/`. Restart `pdash-api` now so the merged code actually takes effect? [yes/no]"
   - If yes: run `docker compose restart api`, then poll `docker inspect pdash-api --format '{{.State.Health.Status}}'` (a few seconds apart, up to the container's own healthcheck window) until it reports `healthy`. Report the new `docker inspect pdash-api --format '{{.State.StartedAt}}'` timestamp as confirmation.
   - If no: state explicitly, as a visible warning (not a footnote): "`pdash-api` was NOT restarted — it will keep serving pre-merge backend code until it is. Any backend fix in this cycle is not actually live yet."  Record this warning for Gate 6's per-gate summary.
   - If Gate 1 step 2 determined the diff does *not* touch `api/`: skip this step entirely, no mention needed.
6. **Worktree cleanup (only if step 3 detected a linked worktree):** the branch just merged was checked out in a linked worktree at some path `<worktree-path>`. Before deleting the branch (step 7), remove the worktree — `git branch -d` fails while a worktree still references the branch.
   - Only remove worktrees whose path is under `.worktrees/`, `worktrees/`, or `.claude/worktrees/` — this project's own worktree conventions. If the path doesn't match, do not remove it; note that cleanup was skipped because the worktree isn't one this process owns.
   - From the main repo root:
     ```bash
     git worktree remove "<worktree-path>"
     git worktree prune
     ```
   - If removal fails (a recurring, known issue in this environment — locked files, leftover `node_modules`, or a stale IDE handle): this is non-blocking. Report the failure, confirm via `git status --short` inside the worktree path that nothing uncommitted would be lost, and continue — git itself already deregisters the worktree correctly even when the physical directory can't be deleted; leaving the orphaned directory does not block the rest of the cycle.
7. After a successful push (worktree cleanup and backend restart, if applicable), ask explicitly: "Delete the local branch `<branch>`? [yes/no]" — no default either way.
   - If yes: run `git branch -d <branch>`.
   - If no: leave the branch as-is.

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
- One line per gate (1 through 5) stating its outcome (e.g. "Gate 1: passed (frontend + backend)", "Gate 3: 1 finding, fixed and re-verified", "Gate 4: merged, merge commit (main had diverged), pdash-api restarted and healthy" — or, if the restart was declined, "Gate 4: merged; pdash-api NOT restarted, backend change not yet live").
- An explicit pointer: "See the Roadmap notes section of `<report path>` for open items."
- **REQUIRED, as the literal last line, with nothing after it:** `Cycle closed and pushed. If this was the last of a series of related cycles (e.g. a multi-cycle audit), consider a cold review before moving on to the next work.` This is a fixed, unconditional closing line, not optional trailing commentary — it is a text suggestion for the user to weigh, not a decision this command makes: never try to determine from repo state, commit history, or anything else whether this cycle actually was the last of a series — always print the same line, and never act on it (no starting a review, no reading other reports) beyond printing it.
