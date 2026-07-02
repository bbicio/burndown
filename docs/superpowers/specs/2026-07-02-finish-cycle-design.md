# /finish-cycle — Development Cycle Closeout Command

**Date:** 2026-07-02
**Context:** the user has manually run the same closeout sequence — test, optional manual verification, code review, merge, doc sync, report — across multiple prior cycles (both code development and documentation audits). The PRD.md audit itself split into two parts with two different closeout patterns: the first part (§1-18, including the auth/permissions/sharing/GDPR layer added as §15-18) was done on a dedicated branch with an explicit merge confirmed by the user, the same pattern as the `cfg-parse` cycle — consistent with the fast-forward visible in the log up through commit `84eda4c`. The second part (commits `00f9501` → `5dd3334`, the domain-formula/planning audit done in this same session) was instead committed and pushed directly to `main` with no dedicated branch — the same pattern as the small `sync-docs` skill extension. This is confirmed both by the log (linear history, no leftover branch) and by the direct action taken in the current session. This spec codifies the full sequence into a single explicit command so it stops being re-derived by hand each time. `/finish-cycle` itself only covers the dedicated-branch pattern (see pre-flight check 1 below) — the direct-to-main pattern remains a separate, ad hoc workflow, out of scope here.

**Goal:** a command, `/finish-cycle`, that runs the full closeout sequence for a feature branch — test, manual-verification gate, code review, merge to main, doc sync, and a persisted report — with a hard rule: every judgment gate (code review findings, merge, the doc-sync/report push) always stops for explicit confirmation; only objective gates (test pass/fail, pre-flight checks) block or unblock without asking.

## Decision: command, not skill

`/finish-cycle` is a command (`.claude/commands/finish-cycle.md`) only — **no** mirrored `.claude/skills/finish-cycle/SKILL.md`, unlike the existing `sync-docs` (which has both, for reasons not relevant here). A skill file would create an automatic-relevance activation surface; since the closing action of this sequence is `git push origin main` (an irreversible, shared-state action), activation must always be a deliberate `/finish-cycle` invocation by the user, never an inferred "this looks like a good time to wrap up" by the model.

## Constraints

- Every project reference (test commands, docker profile, file paths) below is verified against the actual repo state as of this spec, not assumed:
  - `npm test` = `vitest run` (`package.json:7`)
  - `docker compose --profile test run --rm test` is a real, working profile (`docker-compose.yml:43-64`)
  - `sync-docs` command already exists at `.claude/commands/sync-docs.md` with a fixed file perimeter (ARCHITECTURE.md, CLAUDE.md, TEST_CASES.md, test-cases.html, test-api.js, PRD.md-conditional) — reused as-is here, not reimplemented.
- No new persisted state file (e.g. no `.claude/finish-cycle-state.json`). If a `/finish-cycle` run is interrupted mid-sequence, the next invocation re-derives state from objective facts already on disk: git branch/log/status, any partial report file already written under `docs/superpowers/reports/`, and code-review follow-ups already captured in that report (once Gate 5 has run). Adding a dedicated state artifact was explicitly rejected — it would be another file to track and clean up, same category as `.tokensave/`/`wrap-output.log` clutter already flagged as unwanted.
- Non-negotiable principle carried through every gate below: objective gates (pass/fail, file-exists checks) proceed without asking; any gate involving judgment (findings triage, merge, pushing interpretive content) always stops for explicit confirmation, even when everything looks clean.

## Sequence

### Pre-flight (automatic, no confirmation — all objective checks)

1. Current branch must not be `main`. If it is, stop with an error.
2. `git status --short` — if there are uncommitted changes, stop and ask the user to commit or stash first (does not decide on the user's behalf what to do with unsaved work).
3. `git log main..HEAD --oneline` — if there are no commits ahead of main, stop ("nothing to close out on this branch").
4. Determine the branch name and sanitize it for filesystem use (`/` → `-`) for the Gate 5 report filename.
5. **Informational only, non-blocking:** compare `git merge-base main HEAD` against `git rev-parse main`. If main has commits past the merge-base, report the count and note that Gate 4's merge will produce a merge commit, not a fast-forward. No blocking — this only prevents discovering the divergence for the first time at merge.

### Gate 1 — TEST (blocking, automatic, no confirmation)

1. Run `npm test` first (fast, no Docker). If it fails, stop immediately with output; requires fix + re-run of `/finish-cycle`. Docker is never started if the frontend suite already fails.
2. If it passes: check `git diff --stat main...HEAD` for paths under `api/` or `api/src/db/migrations/`. This is the sole deterministic trigger for the backend suite — no heuristic judgment. Ambiguous/shared files that could plausibly touch backend behavior also trigger it (cost of an extra test run is low; cost of a missed backend bug is high).
3. If triggered, run `docker compose --profile test run --rm test`. If it fails, stop with output; requires fix + re-run.
4. If everything relevant passes, proceed automatically to Gate 2 — no confirmation, this is an objective gate.

### Gate 2 — MANUAL VERIFICATION (human gate, always confirms)

1. Search for a spec/plan for this cycle using verifiable signals only (no proximity/similarity heuristics):
   - `git log --diff-filter=A main..HEAD -- docs/superpowers/` — spec/plan files **added inside this branch**.
   - `git log main..HEAD | grep -o 'docs/superpowers/[^ ]*\.md'` — spec/plan files **explicitly referenced** in this branch's commit messages.
2. Combine the results:
   - Exactly one unique candidate → show it as context, note whether it mentions browser verification / jsdom-untestable behavior.
   - More than one → say so explicitly ("found N candidates: [list] — no automatic selection").
   - Zero → say so explicitly ("no spec/plan reference found in this branch's commits").
3. Regardless of outcome, always ask explicitly: "Have you manually verified this in the browser? [yes/no]." If "no", stop and wait — never assumed done.

### Gate 3 — CODE REVIEW (conditional human gate)

1. Run `/code-review` at **medium** effort, diffing the current branch against `main` (same scope as the diff used in Gate 1/pre-flight).
2. **Zero findings** → state this explicitly and proceed automatically to Gate 4 (medium already limits itself to high-confidence findings, so a clean result here is not a judgment call by `finish-cycle` itself).
3. **One or more findings** → show all of them, then ask explicitly: "Fix now, accept as follow-up, or a mix (specify which)?" — never guesses the user's preference.
4. If the user chooses to fix now, apply the fixes, then **re-run `/code-review`** on the same scope before considering the gate passed (a fix is never trusted without re-verification).
5. **Iteration limit:** maximum 3 total `/code-review` runs at this gate (1 initial + 2 re-runs after fixes). If the 3rd run still has findings, the behavior changes from step 3: stop explicitly, flag that the iteration count suggests a more structural issue than an isolated fix (the fix keeps generating new, related findings), show the full sequence of findings across all three rounds (not just the latest), and ask explicitly among three options: continue past the limit, accept everything as follow-up, or stop the cycle to reconsider the approach. No silent default.
6. Every finding accepted as follow-up (at any round) is collected into an internal list that feeds the Gate 5 report's "Code review follow-ups" section — never left to live only in chat.

### Gate 4 — MERGE (always an explicit human gate, never automatic)

1. Build a pre-merge summary:
   - Commit count on the branch (`git log main..HEAD --oneline | wc -l`).
   - Files touched, grouped by category (`git diff --stat main...HEAD`, grouped by top-level prefix: `js/`, `api/`, `css/`, `docs/`, root-level, etc.).
   - Out-of-scope check: if a plan file was identified at Gate 2 via the same verifiable-reference method, compare touched files against its **File Structure** section; flag (non-blocking) any touched file not listed there as "outside the declared File Structure."
   - Include the pre-flight divergence note (check 5) if applicable, so the merge-commit-vs-fast-forward outcome is not a surprise.
2. Show the summary, ask explicitly: "Proceed with merge? [yes/no]" — always, even when tests and review are clean.
3. If confirmed: `git checkout main && git merge --no-ff <branch> && git push origin main`.
4. If the merge fails (conflicts), stop and show the conflicting files — no automatic conflict resolution attempted.
5. After a successful merge, always ask explicitly whether to delete the local feature branch — no default either way. (Short linear cycles often want it deleted immediately; long cycles with multiple detours often want the branch kept around a while for intermediate history. Only the user knows which kind of cycle is closing.)

### Gate 5 — SYNC-DOCS + REPORT (after merge, shared human gate)

1. On `main` (post-merge), invoke `/sync-docs` as-is — reuses its existing fixed perimeter (ARCHITECTURE.md, CLAUDE.md, TEST_CASES.md, test-cases.html, test-api.js, PRD.md-conditional). Not reimplemented here.
2. Generate a report file at `docs/superpowers/reports/YYYY-MM-DD-<branch-sanitized>-finish-cycle.md` containing at minimum:
   - **What was done** — the commit summary from Gate 4, recorded here for lasting history (not just the chat transcript of the moment).
   - **Code review follow-ups** — the list collected in Gate 3 step 6 (empty section if none).
   - **Roadmap notes** — dead code discovered, candidate bugs, other observations surfaced during the cycle (collected during execution, not invented retroactively).
   - **Sync-docs outcome** — which doc files were updated and which were not, with reasoning (same transparency standard `/sync-docs` itself already reports).
3. Show the combined diff (sync-docs' doc edits + the new report file) and ask explicitly for confirmation before `git add` + commit + `git push origin main` — treated as direct writes to main, same category as the Gate 4 merge, never automatic. (This is interpretive content, not mechanical fact — and it is about to become permanent in project history, so it is reviewed before being fixed there, not after.)

### Gate 6 — FINAL REPORT (in chat)

After the Gate 5 push, print a compact summary in chat: path to the just-committed report file, outcome of each gate (test, manual verification, review, merge, sync-docs), and an explicit pointer to the report's "Roadmap notes" section so it doesn't go unnoticed.

## Out of scope

- No new persisted state artifact (see Constraints).
- No modification to the existing `/sync-docs` command's file perimeter or logic — it is invoked, not extended.
- No automatic branch selection — `/finish-cycle` always operates on the current branch; no `<branch-name>` argument support in this version.
- No PR-based merge flow (`gh pr create`/`gh pr merge`) — direct local merge + push only, matching how the user currently works (solo, same machine, no separate worktree, due to Docker port constraints).
