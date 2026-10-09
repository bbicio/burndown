# /finish-cycle — Development Cycle Closeout Command

Run the full closeout sequence for the current feature branch: test, optional manual-verification gate — with `/code-review` launched in the background when that gate *opens*, so it runs while the human verifies — then the code-review gate itself, merge to main, backend restart (if applicable), doc sync, and a persisted report. Every judgment gate (code review findings, merge, the backend restart, the doc-sync/report push) always stops for explicit confirmation. Only objective gates (test pass/fail, pre-flight checks) block or unblock without asking.

## Pre-flight (automatic, no confirmation)

1. Confirm the current branch is not `main` (`git branch --show-current`). If it is, stop: "finish-cycle must be run from a feature branch, not main."
2. Run `git status --short`. If there is any output (uncommitted changes), stop and ask the user to commit or stash first — do not decide this for them.
3. Run `git log main..HEAD --oneline`. If empty, stop: "No commits to close out on this branch."
4. Determine the branch name (`git branch --show-current`) and sanitize it for filesystem use: replace every `/` with `-`. Store the result as `<branch-sanitized>` — it is used in the Gate 5 report filename.
5. **Informational, non-blocking:** run `git merge-base main HEAD` and `git rev-parse main`. If they differ, run `git rev-list --count <merge-base>..main` and report: "main has advanced N commits since this branch diverged — Gate 4's merge will produce a merge commit, not a fast-forward." Do not block on this.
6. **Timing capture (feeds the Gate 5 report's duration fields).** Record the current wall-clock time (`date '+%Y-%m-%d %H:%M'`) as `<started-at>`, and record it again at every gate boundary from here on — when each of Gates 1-5 is entered, at the moment Gate 4's merge commit is created (`<merged-at>`), and when Gate 5's report is written. Keep the values in the session; nothing is written to disk before Gate 5. These are **elapsed wall-clock** durations and deliberately include time spent waiting for a human answer at a gate — do not try to subtract it, and do not split a gate into "work" and "wait". If a timestamp was genuinely not captured (e.g. `/finish-cycle` was interrupted and resumed in a later session), write `unknown` for that one gate in the report — never reconstruct or estimate it after the fact. Purpose: PROCESS.md §6/§6.6 currently rest on two retrospectively reconstructed anecdotes; these fields are the measured baseline meant to replace them.

## Gate 1 — TEST (blocking, automatic, no confirmation)

1. Run `npm test` natively (host Node ≥ 20.12). In a worktree with no `node_modules`, run `npm ci` once first. Use the `docker run ... node:22` one-liner from `CLAUDE.md` only if the host Node is older than 20.12.
   - If it fails: stop immediately, show the failing output verbatim. Do not start Docker. Require a fix and a re-run of `/finish-cycle` from the top.
2. If it passes, run `git diff --stat main...HEAD` and inspect the listed paths.
   - If any path starts with `api/` (including `api/src/db/migrations/`), or if any touched path's relevance to backend behavior is unclear/ambiguous, proceed to step 3.
   - Otherwise, skip straight to Gate 2.
3. Run `scripts/run-tests.sh`.
   - If it fails: stop immediately, show the failing output verbatim. Require a fix and a re-run of `/finish-cycle` from the top.
4. Proceed automatically to Gate 2 — no confirmation needed, this is an objective gate.

## Gate 2 — MANUAL VERIFICATION (human gate, always confirms)

**Teardown is a one-way door gated on the human's own "yes" — nothing else ever triggers it.** `scripts/test-branch.sh down` for this branch's environment may run ONLY at the exact point step 6 below says so, immediately after the user has explicitly answered "yes" to the literal question "Have you manually verified this in the browser?". No other moment qualifies — not after your own exploratory use of the environment (implementation testing, debugging, a pre-check you ran to save the user time), not because you consider your own check equivalent to the user's, not as routine cleanup once you're "done" with it, not between two separate `/finish-cycle` invocations in the same conversation. If you used the environment yourself for any reason before reaching this gate, leave it running and let step 1 below discover it as already `up` — do not tear it down first "to keep things tidy" and re-spin it. Two real incidents in one session (2026-09-15, `worktree-costgrid-owner-reassign` and `worktree-planning-role-task-breakdown`) were both this exact mistake: the agent's own browser verification was mistaken for satisfying this gate, and the environment was torn down before the user had answered the question at all.

**Classification — is this a no-code cycle? (mechanical, before anything else below.)** Run `git diff --name-status --find-renames main...HEAD`. This is a **no-code cycle** when **every** path it reports — including **both** paths of a rename's `R` record — starts with `.claude/`, starts with `docs/` **and ends with `.md`**, or is a root-level `*.md` (no `/` anywhere in the path), except for the named exceptions below. Match on the **start** of the path, never anywhere inside it: `api/docs/helper.md` contains `docs/` but is a file under `api/`, so it is code. **Do not use `git diff --name-only` here:** rename detection is on by default (git >= 2.9), so `--name-only` prints only a rename's destination — a move of a live file into `docs/` would then look like a docs-only diff and defeat this entire check. An empty path list does not qualify (it cannot normally occur — pre-flight check 3 stops the command when there are no commits — and "every path qualifies" must not be vacuously true). A single path outside makes this an ordinary cycle: record `<no-code-cycle>` as false, go through the gate below unchanged, and do not raise the classification with the user at all. Otherwise record it as true.
- **The test is the path list, never a judgment about what the cycle is "about".** The name is deliberately "no-code cycle", not "process-only": `PRD.md` and `docs/prd/` are product documentation, which "process-only" would misclassify.
- **Named exceptions — root `*.md` files the running app loads at runtime: none at present.** Such a file counts as **code** here, because changing it changes what a page renders; `docker-compose.yml` mounts the whole repo root into nginx and `nginx.conf`'s `location /` serves it, so root `*.md` — and everything under `docs/` — is already reachable over HTTP. The cycle that makes the app fetch one adds its filename to this list, in that same cycle — if you are implementing such a cycle, this list is yours to update. **This is also why a `docs/` path qualifies only when it ends in `.md`:** 66 tracked files under `docs/` are not Markdown, and one of them, `docs/OPERATIONAL_MANUAL.html`, can be verified *only* in a browser — a cycle regenerating it must never be told there is nothing to verify there. The same rule covers a tracked executable or configuration file under `.claude/`: none exists today, since git tracks only `*.md` there and `settings.local.json` is gitignored.
- **On a no-code cycle:** step 0 below **still runs** — a prose-only diff is exactly where review earns its keep (one doc-split cycle produced 10 of its 16 findings on prose) — steps 1-5 are skipped, and step 6 takes its no-code branch. Two consequences, stated here rather than discovered: (a) no *new* test environment is created, but `<branch-env-active>` may already be `true` from earlier in this same session — step 1 forbids overwriting a `true` — and since this path never reaches step 1's discovery, the no-code branch's own "yes" is where that stack gets torn down; (b) because steps 2-5 are skipped, no plan file is identified, so **Gate 4's out-of-scope check does not fire** — record that in the report instead of letting it vanish.

0. **Launch the code review now, in the background, so it runs during this gate — it becomes Gate 3's round 1.** `/code-review` is read-only: it cannot affect the branch, the stack, or the user's verification, so starting it here takes its wall-clock off the critical path instead of adding it after the "yes".
   - **Skip this** if Gate 3's step 0 skip check applies **in full** — read it there rather than from a paraphrase: it also requires that every commit after the reviewed HEAD only applies fixes from that review and has itself been re-reviewed. If it does apply, that review stands and Gate 3 step 0 records the skip (PROCESS.md §6.4).
   - **If instead step 0b's precondition holds** — an earlier whole-branch review covers `main...HEAD` but HEAD has since moved by commits that are *not* its fixes — launch the review scoped to `<reviewed-sha>..HEAD`, not the whole branch, for the reason 0b gives: re-reviewing the covered part is the double review §6.4 forbids.
   - Otherwise run `/code-review` at medium effort, scoped to the diff between the current branch and `main`, **as a background agent**, and continue to step 1 immediately. Note the HEAD it covers as `<reviewed-sha>` — Gate 3 needs it if HEAD moves during this gate. If an earlier review in this session already left a `<reviewed-sha>`, keep the **earlier** of the two: a scoped range must start at the oldest point not yet reviewed, so that nothing in between is skipped.
     - If it genuinely cannot be backgrounded in the current harness, say so in one line and leave it to Gate 3, unchanged. Do **not** run it in the foreground here: that serialises it *ahead* of the human wait, saving nothing while making the gate look parallel.
   - **Do not show the findings, and do not apply a single fix, inside this gate.** A commit landing while the user is verifying would mean they verified a tree that no longer exists. They are shown and handled at Gate 3, and the question in step 6 is asked and answered exactly as before — a finished review is no input to it.

**Steps 1-5 apply only when `<no-code-cycle>` is false; on a no-code cycle go straight to step 6.**

1. Run `scripts/test-branch.sh status`.
   - If `down` (exit 1): ask explicitly "Spin up an isolated test environment for this branch now? [yes/no]"
     - If yes: run `scripts/test-branch.sh up`. Record `<branch-env-active>` = true.
     - If no: record `<branch-env-active>` = false, unless it was already true earlier in this same session (do not overwrite an existing true with false).
   - If `up` (exit 0): ask explicitly "An isolated test environment for this branch is already running (from an earlier `/finish-cycle` run on this branch) — reuse it, or rebuild it with fresh data from main? [reuse/rebuild]"
     - If reuse: do nothing further. Record `<branch-env-active>` = true.
     - If rebuild: run `scripts/test-branch.sh down`, then `scripts/test-branch.sh up`. Record `<branch-env-active>` = true.
2. Run `git log --diff-filter=A main..HEAD -- docs/superpowers/` to find spec/plan files added inside this branch.
3. Run `git log main..HEAD | grep -o 'docs/superpowers/[^ ]*\.md'` to find spec/plan files referenced in this branch's commit messages.
4. Run `git merge-base main HEAD` to get `<merge-base>` (this commit itself is included in the walk below, not just its ancestors), then `git log --oneline -8 <merge-base>` to list `<merge-base>` and the 7 commits before it — 8 chosen as enough to comfortably cover Brief+Spec and Plan as up to 2 separate doc-setup commits plus a safety margin, not a hard technical limit. Walk this list from `<merge-base>` backward and collect a *contiguous* prefix of commits whose messages match this project's own convention for spec/plan setup (`docs: brief + design spec for <topic>`, `docs: implementation plan for <topic>`) — stop at the first commit that doesn't match (do not skip over a non-matching commit to keep collecting further back). For each matching commit, run `git show --name-only <sha>` to get the `docs/superpowers/specs/*.md`/`docs/superpowers/plans/*.md` file(s) it added. This finds the common case in this project where Brief + Spec + Plan are committed to `main` *before* the feature branch is opened — steps 2-3 alone only see commits unique to the branch and miss this case entirely (a known, previously-reported blind spot). Bounding the walk to a contiguous matching prefix (rather than a flat commit-count lookback) avoids pulling in older, unrelated cycles' spec/plan commits once an ordinary merge or docs-sync commit is hit — though if a genuinely unrelated commit is ever wedged directly on `main` between a cycle's own Brief+Spec and Plan commits, this walk will under-collect (stop too early, missing the Brief+Spec found further back). This is a known residual gap, not silently unsafe: step 6 below still always asks for explicit manual-verification confirmation regardless of what this search finds, so the worst case is an incomplete candidate list shown to the user, never a skipped verification step.
5. Combine all three result sets (deduplicated):
   - Exactly one unique file → read it and check for mentions of browser verification or jsdom-untestable behavior. Show the file path and what was found (or state "no explicit mention of manual verification found in this file" if none).
   - More than one → state explicitly: "Found N candidates: [list] — no automatic selection."
   - Zero → state explicitly: "No spec/plan reference found in this branch's commits."
6. **If `<no-code-cycle>` is true, take the no-code branch in the first sub-bullet below and do not ask the browser question.** Otherwise — regardless of the outcome in step 5 — always ask explicitly: "Have you manually verified this in the browser? [yes/no]" — this question must reach the user and receive their actual answer; your own use of the environment earlier in this gate or anywhere else in the session is not a substitute answer, however thorough.
   - **No-code cycle branch (`<no-code-cycle>` true) — this is the whole of step 6 on that path; the two bullets below do not apply.** Do not ask the browser question: on this diff it has no honest answer — "yes" would be false and "no" stops the cycle — and a "yes" given as a formality erodes the very gate the two 2026-09-15 incidents created. Show `git diff --stat main...HEAD` **and** the full path list from the classification above (the `--stat` alone elides paths once there are many, and it is the classification being checked, not the content), then ask explicitly, without asserting the answer in the question: "Here is every path this diff touches — is this a no-code cycle? [yes/no]"
     - If the answer is "no", or anything other than a clear yes: **stop and wait. Do not proceed.** Exactly as the code branch below.
     - If "yes": if `<branch-env-active>` is true — possible only because it was set earlier in this same session, since this path never runs step 1 — run `scripts/test-branch.sh down` first: on this path that is the one legal teardown point for it, and skipping it leaves the stack running past Gate 4's worktree cleanup. Then proceed to Gate 3. The review launched at step 0 still has to be collected there and its findings handled — a no-code cycle does not skip Gate 3.
     - Record in the Gate 5 report's **"Roadmap notes"** section that this gate took the no-code branch, that the browser question was not asked, and that Gate 4's out-of-scope check did not fire. That report is the only persistent trace of it; do not add a new field to the report template, and do not write `0m (skipped)` for this gate — that is reserved for a gate that self-skips, and this one does ask a question.
   - If the answer is "no" or anything other than a clear yes: stop and wait. Do not proceed. Do not tear down the branch environment if `<branch-env-active>` is true — leave it running so the user can keep testing. If step 0 launched a background review, keep whatever it produced for the re-run: findings in hand, never a reason to skip a review of the commits that then fix the defect.
   - If "yes": if `<branch-env-active>` is true, run `scripts/test-branch.sh down` to tear down the test stack — this and the no-code branch's own "yes" above are the only points in the entire command where that teardown may happen. Then proceed to Gate 3.

## Gate 3 — CODE REVIEW (conditional human gate, max 3 rounds by default)

**First, collect the background review.** If Gate 2 step 0 launched one, wait for it and treat its findings as this gate's round 1: start `code_review_followups` as an empty list (step 1 declares it, and that step is skipped on this path), and then — **before step 2** — close the one gap this path can leave: if HEAD has moved past the `<reviewed-sha>` that run covered, because a commit landed during Gate 2 (typically a visual correction), run step 0b's scoped review of `<reviewed-sha>..HEAD` as well and add its findings to the round. Without that, those commits reach Gate 4 with no review at all. Then go to step 2 with the combined findings; steps 0 and 0b are not otherwise re-entered on this path. If it produced nothing usable — the agent died, timed out, or returned no readable findings — say so in one line and treat the diff as **not reviewed**, running step 1 normally. A run that cannot be read is never a clean review, and nothing below may conclude otherwise.

0. **Skip check (no double review of the same diff, PROCESS.md §6.4).** If, earlier in this same session, a whole-branch review covered `main...HEAD` (e.g. the final review of `superpowers:subagent-driven-development`), and every commit after the reviewed HEAD only applies fixes from that review and has itself been re-reviewed, do not run `/code-review`. State explicitly: "Code review: skipped — the final whole-branch review at `<sha>` already covers this diff (fixes `<sha..sha>` re-reviewed)." Carry that review's accepted follow-ups into `code_review_followups`, note the skip in the report's Roadmap notes, and proceed to Gate 4. If any condition is not met, or the review happened in another session, run step 1 normally.
0b. **Scoped-review path (partial skip).** If a whole-branch review covered `main...HEAD` earlier in this session but HEAD has since moved by commits that are *not* fixes of that review (typically Gate 2 visual corrections), do not re-review the whole branch: run `/code-review` scoped to **only those commits** (`<reviewed-sha>..HEAD`). State explicitly: "Code review: scoped to `<sha>..HEAD` — the whole-branch review at `<sha>` already covers the rest." Since the review now starts at Gate 2, a fix born at that gate is by construction newer than the reviewed HEAD, so for those fixes this scoped path is the **norm, not a case to argue each time**. Rationale (PROCESS.md §6, "esecuzione proporzionata"): in the Cost Grid A cycle the full `medium main...HEAD` sweep ran after the Opus whole-branch review for two small CSS/markup commits (+119/−48), took 18 minutes across 10 agents, and produced **zero** code changes — 3 of its 8 findings were already parked by the earlier review, one restated another, and one was outside the spec's scope.
1. Unless round 1 was already collected from Gate 2 (see the paragraph above), run `/code-review` at medium effort, scoped to the diff between the current branch and `main`. This is round 1. Maintain a running list, `code_review_followups`, starting empty.
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
3. **DB backup (automatic, no confirmation):** run `scripts/backup-db.sh` — takes a `pg_dump` snapshot of the main stack's database into `backups/` (gitignored) before any merge state changes, keeping only the 3 most recent dumps. This is a read-only safety net, not a gate: report the script's own output (backup file path/size, and any old backup it pruned) in chat, but never block or ask for confirmation on it — including when it warns that `pdash-db` isn't running and skips (that's expected if the main stack happens to be stopped, e.g. local dev).
4. **CWD safety check (worktrees):** run:
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
5. If confirmed, run in sequence (from the main repo root, per step 4):
   ```bash
   git checkout main
   git merge --no-ff <branch>
   git push origin main
   ```
   - If `git merge` reports conflicts: stop immediately, run `git status` to list the conflicting files, show them, and do not attempt automatic resolution.
6. **Apply new migrations (only if the diff touches `api/src/db/migrations/`):** nothing in the running app applies migrations automatically — no code in `api/Dockerfile`, `api/src/index.js`, or `create-admin.js` does this (see CLAUDE.md's "Database backup & full recreation" section). A migration file merged to `main` sits completely inert against the real `pdash-db` until someone runs it by hand. **This step exists because that silent gap already caused a real incident:** migration `020` (the `resources`/`attribute_lists` schema) was merged in the `worktree-team-attribute-lists` cycle (2026-09-23) and this step didn't exist yet — the file sat unapplied against the main `pdash-db` for an entire subsequent cycle, so `team.html`/`attribute-lists.html` silently never worked against the real stack (only against isolated test stacks, which apply every migration fresh on every spin-up, masking the gap). Discovered and fixed only when the very next cycle (`worktree-admin-crud-consistency`) happened to touch the same tables.
   - Identify new migration files: `git diff --diff-filter=A --name-only <merge-base>...HEAD -- api/src/db/migrations/` (files this branch added — not pre-existing ones it happened to touch).
   - If none: skip this step entirely, no mention needed.
   - If one or more: for each, in filename order, run:
     ```bash
     docker exec -i pdash-db psql -U pdash -d pdash < api/src/db/migrations/<file>
     ```
     Report each file's output. This project's migration convention (`CREATE TABLE IF NOT EXISTS`, `INSERT ... ON CONFLICT DO NOTHING`) makes re-running an already-applied migration a safe no-op, so there is no need to first check whether it was already applied. If a migration errors, stop immediately, show the error verbatim, and do not proceed to the backend restart below until it's resolved — an error here means the schema and the merged code are now out of sync.
7. **Backend restart (only if Gate 1 step 2 determined the diff touches `api/`):** `pdash-api` runs as a plain `node src/index.js` process (`api/Dockerfile`) with no hot-reload — the `./api/src:/app/src` volume mount keeps the file on disk current, but the running process keeps serving whatever was in memory at container start until it is explicitly restarted. Merging a backend change to `main` does not make it take effect on its own.
   - Ask explicitly: "This cycle touched `api/`. Restart `pdash-api` now so the merged code actually takes effect? [yes/no]"
   - If yes: run `docker compose restart api`, then poll `docker inspect pdash-api --format '{{.State.Health.Status}}'` (a few seconds apart, up to the container's own healthcheck window) until it reports `healthy`. Report the new `docker inspect pdash-api --format '{{.State.StartedAt}}'` timestamp as confirmation.
   - If no: state explicitly, as a visible warning (not a footnote): "`pdash-api` was NOT restarted — it will keep serving pre-merge backend code until it is. Any backend fix in this cycle is not actually live yet."  Record this warning for Gate 6's per-gate summary.
   - If Gate 1 step 2 determined the diff does *not* touch `api/`: skip this step entirely, no mention needed.
8. **Worktree cleanup (only if step 4 detected a linked worktree):** the branch just merged was checked out in a linked worktree at some path `<worktree-path>`. Before deleting the branch (step 9), remove the worktree — `git branch -d` fails while a worktree still references the branch.
   - Only remove worktrees whose path is under `.worktrees/`, `worktrees/`, or `.claude/worktrees/` — this project's own worktree conventions. If the path doesn't match, do not remove it; note that cleanup was skipped because the worktree isn't one this process owns.
   - From the main repo root:
     ```bash
     git worktree remove "<worktree-path>"
     git worktree prune
     ```
   - If removal fails (a recurring, known issue in this environment — locked files, leftover `node_modules`, or a stale IDE handle): this is non-blocking. Report the failure, confirm via `git status --short` inside the worktree path that nothing uncommitted would be lost, and continue — git itself already deregisters the worktree correctly even when the physical directory can't be deleted; leaving the orphaned directory does not block the rest of the cycle.
9. After a successful push (migration apply, worktree cleanup, and backend restart, if applicable), ask explicitly: "Delete the local branch `<branch>`? [yes/no]" — no default either way.
   - If yes: run `git branch -d <branch>`.
   - If no: leave the branch as-is.

## Gate 5 — SYNC-DOCS + REPORT (after merge, shared human gate)

1. On `main` (post-merge), invoke `/sync-docs`. Let it run its existing, unmodified scope (ARCHITECTURE.md, CLAUDE.md, TEST_CASES.md, test-cases.html, test-api.js, PRD.md-conditional, and — since 2026-09-29 — project memory in section 8) — do not reimplement or narrow it here. The memory update lives outside the repo, so it is NOT part of the `git diff` shown in step 3 and is never committed: it is applied by `/sync-docs` itself and appears only in that command's summary. Copy its "Memory" line into the report (step 2) so the change is at least recorded somewhere persistent.
2. Create the report file at `docs/superpowers/reports/<YYYY-MM-DD>-<branch-sanitized>-finish-cycle.md` (today's date; `<branch-sanitized>` from pre-flight step 4) with this structure:

   ```markdown
   # Finish-cycle report — <branch>

   **Date:** <YYYY-MM-DD>
   **Branch:** <branch> → main
   **Execution started:** <started-at>  (pre-flight step 6)
   **Merged at:** <merged-at>  (Gate 4's merge commit)
   **Gate durations:** Gate 1 <N>m · Gate 2 <N>m · Gate 3 <N>m · Gate 4 <N>m · Gate 5 <N>m — total <N>m
   <!-- Wall-clock, human wait time included (pre-flight step 6). Write `unknown` for a gate whose
        timestamp was not captured; a gate that self-skipped gets `0m (skipped)`.
        Since 2026-10-08 the code review runs in the background during Gate 2, so Gate 2's figure
        absorbs most of it and Gate 3's covers the findings discussion and any fixes — these two
        gates' numbers are not comparable with cycles closed before that date, and the split
        between them is approximate. -->

   ## What was done

   <commit count and one-line-per-commit summary, from Gate 4's `git log main..HEAD --oneline` output captured before the merge>

   ## Code review follow-ups

   <one bullet per entry in code_review_followups, each noting: round number, finding summary, file/line if available. Write "None." if the list is empty.>

   ## Roadmap notes

   <dead code, candidate bugs, or other observations surfaced during Gates 1-4, collected as they came up — not invented retroactively. Write "None." if nothing surfaced.>

   ## Sync-docs outcome

   <which files /sync-docs updated and which it didn't, with reasoning — copied directly from /sync-docs's own summary output in step 1>

   ## Memory outcome

   <the "Memory" line from /sync-docs's summary: each memory file changed (before → after) and any item left "unverified", or "evaluated, no change" with the files checked. Memory is outside the repo, so this section is its only persistent record.>
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
- One line for project memory (e.g. "Memory: 2 files updated, 1 item unverified" or "Memory: evaluated, no change").
- One line per gate (1 through 5) stating its outcome (e.g. "Gate 1: passed (frontend + backend)", "Gate 3: 1 finding, fixed and re-verified", "Gate 4: merged, merge commit (main had diverged), pdash-api restarted and healthy" — or, if the restart was declined, "Gate 4: merged; pdash-api NOT restarted, backend change not yet live").
- An explicit pointer: "See the Roadmap notes section of `<report path>` for open items."
- **REQUIRED, as the literal last line, with nothing after it:** `Cycle closed and pushed. If this was the last of a series of related cycles (e.g. a multi-cycle audit), consider a cold review before moving on to the next work.` This is a fixed, unconditional closing line, not optional trailing commentary — it is a text suggestion for the user to weigh, not a decision this command makes: never try to determine from repo state, commit history, or anything else whether this cycle actually was the last of a series — always print the same line, and never act on it (no starting a review, no reading other reports) beyond printing it.
