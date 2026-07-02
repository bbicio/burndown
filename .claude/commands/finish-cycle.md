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
