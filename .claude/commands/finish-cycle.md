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
