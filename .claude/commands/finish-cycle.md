# /finish-cycle — Development Cycle Closeout Command

Run the full closeout sequence for the current feature branch: a mechanical pre-check of the claims the branch's markdown makes, test, optional manual-verification gate — with `/code-review` launched in the background when that gate *opens* — then the code-review gate itself, merge to main, backend restart (if applicable), doc sync, and a persisted report. Every judgment gate (code review findings, merge, the doc-sync/report push) always stops for explicit confirmation. Only objective gates (test pass/fail, pre-flight checks) block or unblock without asking. The backend restart and the local-branch deletion are **not** judgment gates and do not ask — PROCESS.md §6b is the rule.

## Pre-flight (automatic, no confirmation)

1. Confirm the current branch is not `main` (`git branch --show-current`). If it is, stop: "finish-cycle must be run from a feature branch, not main."
2. Run `git status --short`. If there is any output (uncommitted changes), stop and ask the user to commit or stash first — do not decide this for them.
3. Run `git log main..HEAD --oneline`. If empty, stop: "No commits to close out on this branch."
4. Determine the branch name (`git branch --show-current`) and sanitize it for filesystem use: replace every `/` with `-`. Store the result as `<branch-sanitized>` — it is used in the Gate 5 report filename.
5. **Informational, non-blocking:** run `git merge-base main HEAD` and `git rev-parse main`. If they differ, run `git rev-list --count <merge-base>..main` and report: "main has advanced N commits since this branch diverged — Gate 4's merge will produce a merge commit, not a fast-forward." Do not block on this.
6. **Timing capture (feeds the Gate 5 report's duration fields).** Record the current wall-clock time (`date '+%Y-%m-%d %H:%M'`) as `<started-at>`, and record it again at every gate boundary from here on — when each of Gates 1-5 is entered, at the moment Gate 4's merge commit is created (`<merged-at>`), and when Gate 5's report is written. Keep the values in the session; nothing is written to disk before Gate 5. These are **elapsed wall-clock** durations and deliberately include time spent waiting for a human answer at a gate — do not try to subtract it, and do not split a gate into "work" and "wait". If a timestamp was genuinely not captured (e.g. `/finish-cycle` was interrupted and resumed in a later session), write `unknown` for that one gate in the report — never reconstruct or estimate it after the fact. The report's cycle counters cover the span from the start of plan execution, which precedes this command: fill them from what this session observed, and write `unknown` for a counter whose whole span it did not observe.

## Gate 1 — TEST (blocking, automatic, no confirmation)

0. **Claims pre-check (automatic, no confirmation) — over the `*.md` this branch changed.** Run `git diff main...HEAD -- '*.md'`. If it is empty, say so in one line and go to step 1 — the report's claims pre-check line then says there was nothing to check at this gate, and still carries whatever Gate 3 records. Otherwise, over its added and modified lines, run these four checks and fix what they find, committing the fixes as one `docs:` commit before leaving this gate. It runs *before* `npm test`; this gate still runs the suite exactly once.
   1. **Grep every predicate you touched.** For each sentence asserting something about the repo ("only X does Y", "every Z has W", "no test covers this"), run the grep that would falsify it, over the live repo, and read the hits. Fix the predicate, not the line the sentence sits on.
   2. **Re-measure every number at HEAD** — sizes, counts, margins — against the current tree, never trusting the commit that first wrote the number.
   3. **`git log` every SHA and every adjacency claim.** A cited `<sha>` must exist and be what the sentence says it is; "the next cycle", "the same day", "merged before" are claims about order that `git log` settles.
   4. **Re-check enumerations as a class.** A list of guards, pages, gates or files asserts completeness: regenerate it from the repo (`ls scripts/*-guard.test.js` for the process and documentation guards — **not** the product guards under `js/lib/`, see PROCESS.md §4b; the Pages table for pages; …) and compare the whole list, not the entry you edited.
   - **Re-read your own fixes with the same four checks before committing them.**
   - **No fix modifies a file in `docs/superpowers/specs/` or `docs/superpowers/plans/`** (PROCESS.md §1: frozen from the start of execution). A defect found there goes to the report's **Roadmap notes**.
   - These four reach mechanical defects only. Judgement prose — whether a rule is right, whether a rationale holds — belongs to Gate 3; do not argue it here.
   - **Ten minutes is a cap, not an estimate.** At 10 minutes, stop where you are and continue to step 1, recording in the report's **Roadmap notes** that the cap was reached and what was left unchecked. The remainder is left to Gate 3.
   - Record what it cost (wall-clock minutes) and what it caught (how many defects, of what kind). Gate 3 adds its own half. This step is an experiment: PROCESS.md §6.4d says what is decided on those numbers, and when.
1. Run `npm test` natively (host Node ≥ 20.12). In a worktree with no `node_modules`, run `npm ci` once first. Use the `docker run ... node:22` one-liner from `CLAUDE.md` only if the host Node is older than 20.12.
   - If it fails: stop immediately, show the failing output verbatim. Do not start Docker. Require a fix and a re-run of `/finish-cycle` from the top.
   - **A red from `scripts/architecture-guard.test.js` is not a code defect** — it means this branch added a route handler, a migration-created table, or an `ALTER TABLE` column that `ARCHITECTURE.md` §5/§6 does not document. The fix is that documentation edit, **on this branch**, before `/finish-cycle` runs again. The other documentation guards in this run — `scripts/claude-md-guard.test.js`, `scripts/doc-paths-guard.test.js` and `scripts/decision-ledger-guard.test.js` — say in their own failure messages what they want. That list is not guaranteed complete; `ls scripts/*-guard.test.js` is (PROCESS.md §4b).
2. If it passes, run `git diff --stat main...HEAD` and inspect the listed paths.
   - If any path starts with `api/` (including `api/src/db/migrations/`), or if any touched path's relevance to backend behavior is unclear/ambiguous, proceed to step 3.
   - Otherwise, skip straight to Gate 2.
3. Run `scripts/run-tests.sh`.
   - If it fails: stop immediately, show the failing output verbatim. Require a fix and a re-run of `/finish-cycle` from the top.
4. Proceed automatically to Gate 2 — no confirmation needed, this is an objective gate.

## Gate 2 — MANUAL VERIFICATION (human gate, always confirms)

**Teardown is never your own initiative — every one of them sits on an answer the user actually gave.** `scripts/test-branch.sh down` for this branch's environment may run at exactly two points, both of them a direct consequence of the user's own answer to an explicit question, and nowhere else. **The one-way door** is step 6, immediately after the user has explicitly answered "yes" to the literal question "Have you manually verified this in the browser?" — a one-way door because it leaves the branch with no environment. **The other** is step 1's rebuild branch, immediately after the user has answered "rebuild" to that step's own explicit reuse-or-rebuild question; there the `down` is followed at once by an `up`, so the gate still has an environment to verify in, and it is not a door at all. No other moment qualifies — not after your own exploratory use of the environment (implementation testing, debugging, a pre-check you ran to save the user time), not because you consider your own check equivalent to the user's, not as routine cleanup once you're "done" with it, not between two separate `/finish-cycle` invocations in the same conversation. If you used the environment yourself for any reason before reaching this gate, leave it running and let step 1 below discover it as already `up` — do not tear it down first "to keep things tidy" and re-spin it.

**Classification — is this a no-code cycle? (mechanical, before anything else below.)** Run `node scripts/classify-cycle.mjs`. Its first stdout line is the verdict, the rest are the paths it judged. **Only the literal `no-code` there makes this a no-code cycle** — anything else (`ordinary`, an error, a missing script, empty output, a non-zero exit) is an ordinary cycle. Record it as `<no-code-cycle>`; on an ordinary cycle do not raise the classification with the user. The rule lives in that script, pinned by `scripts/classify-cycle.test.js` — read the test, not a paraphrase.
- **The test is the path list, never a judgment about what the cycle is "about".**
- **Named exceptions** — root `*.md` files the running app loads at runtime, which count as code — are the `RUNTIME_LOADED_ROOT_MD` constant in that script. The cycle that makes the app fetch one adds it there, with a test case. Read the constant and `scripts/classify-cycle.test.js` for the current contents, never a count or a list from this prose.
- **On a no-code cycle:** step 0 below **still applies, subject to its own skip and scoping checks**; steps 1-5 are skipped, and step 6 takes its no-code branch. Two consequences: (a) no test environment is created, and **none is ever torn down on this path** — a stack left running by an earlier attempt or session is *reported*, never removed (step 6's no-code branch says how); (b) step 5 collects no candidates — the identification step below still runs, but on this path its Plan feeds only the risk class — so **Gate 4's out-of-scope check does not fire**, for the Plan or for the Spec; record that in the report.

**Identification — the cycle's Plan, Spec and risk class (read-only, on both paths, before step 0).** The class rule and its effort mapping are `docs/superpowers/PROCESS.md` §6.1b; this step applies them.
- List the files directly in `docs/superpowers/plans/` (not subdirectories) that have a line starting with `` **Branch:** `<current branch>` `` — the backticked name must equal the current branch exactly; text after the closing backtick is allowed.
- Exactly one file → it is the cycle's Plan. Read its `**Spec:**` line (the Spec) and its `**Risk class:**` line — `scripts/decision-ledger-guard.test.js` holds an in-scope Plan to one.
- Zero files or more than one → no Plan is identified here. Say so in one line, with the matching files if any, and ask explicitly: "Which risk class does this cycle have? [low-risk/standard/high-risk]". The answer is the class.
- Exactly one file whose `**Risk class:**` line is absent or whose first word after the label is not `low-risk`, `standard` or `high-risk` → the class is `standard`.
- Say in one line: the class, its source (the Plan's path, the user's answer, or the reason for the fallback) and the resulting effort. Ask nothing beyond the question above.
- Record `<risk-class>` and `<review-effort>` (low, medium or high, per §6.1b). Every `/code-review` in Gate 2 and Gate 3 runs at `<review-effort>`.

0. **Launch the code review now, in the background — it becomes Gate 3's round 1.**
   - **`<reviewed-sha>` is defined here, once, and every path that uses it below — and in Gate 3 — means this.** It is the HEAD covered by a whole-branch `/code-review` of `main...HEAD` run in this session. If more than one exists, `<reviewed-sha>` is the **latest** of their HEADs. A branch with no such review in this session has no `<reviewed-sha>` at all; every path that needs one states that precondition in its own words, and no such path may be taken without it.
   - **Skip this** if Gate 3's step 0 skip check applies **in full** — read it there rather than from a paraphrase, including its `high-risk` condition: it also requires that every commit after the reviewed HEAD only applies fixes from that review and has itself been re-reviewed. If it does apply, that review stands and Gate 3 step 0 records the skip (PROCESS.md §6.4).
   - **If instead step 0b's precondition holds** (its `high-risk` condition included) — an earlier whole-branch review covers `main...HEAD` but HEAD has since moved by commits that are *not* its fixes — launch the review scoped to `<reviewed-sha>..HEAD` (as defined above), not the whole branch (§6.4).
   - Otherwise run `/code-review` at `<review-effort>`, scoped to the diff between the current branch and `main`, **as a background agent**, and continue immediately to step 1 — or, on a no-code cycle, straight to step 6. Note the HEAD this run covers — it is a `<reviewed-sha>` as defined above.
     - If it genuinely cannot be backgrounded in the current harness, say so in one line and leave it to Gate 3, unchanged. Do **not** run it in the foreground here.
   - **Do not show the findings, and do not apply a single fix, inside this gate.** They are shown and handled at Gate 3; a finished review is no input to step 6's question.

**Steps 1-5 apply only when `<no-code-cycle>` is false; on a no-code cycle go straight to step 6.**

1. Run `scripts/test-branch.sh status`.
   - If `down` (exit 1): ask explicitly "Spin up an isolated test environment for this branch now? [yes/no]"
     - If yes: run `scripts/test-branch.sh up`. Record `<branch-env-active>` = true.
     - If no: record `<branch-env-active>` = false, unless it was already true earlier in this same session (do not overwrite an existing true with false).
   - If `up` (exit 0): ask explicitly "An isolated test environment for this branch is already running (from an earlier `/finish-cycle` run on this branch) — reuse it, or rebuild it with fresh data from main? [reuse/rebuild]"
     - If reuse: do nothing further. Record `<branch-env-active>` = true.
     - If rebuild: run `scripts/test-branch.sh down`, then `scripts/test-branch.sh up`. Record `<branch-env-active>` = true.
**Steps 2-4 run only when the identification step identified no Plan.** When it did, skip them: step 5 receives the declared Plan and, if its `**Spec:**` line names one, the Spec, as its result set.

2. Run `git log --diff-filter=A main..HEAD -- docs/superpowers/` to find spec/plan files added inside this branch.
3. Run `git log main..HEAD | grep -o 'docs/superpowers/[^ ]*\.md'` to find spec/plan files referenced in this branch's commit messages.
4. Run `git merge-base main HEAD` to get `<merge-base>` (this commit itself is included in the walk below, not just its ancestors), then `git log --oneline -8 <merge-base>` to list `<merge-base>` and the 7 commits before it. Walk this list from `<merge-base>` backward and collect a *contiguous* prefix of commits whose messages match this project's own convention for spec/plan setup (`docs: brief + design spec for <topic>`, `docs: implementation plan for <topic>`) — stop at the first commit that doesn't match (do not skip over a non-matching commit to keep collecting further back). For each matching commit, run `git show --name-only <sha>` to get the `docs/superpowers/specs/*.md`/`docs/superpowers/plans/*.md` file(s) it added.
5. Combine the result sets (deduplicated):
   - Exactly one unique file → read it and check for mentions of browser verification or jsdom-untestable behavior. Show the file path and what was found (or state "no explicit mention of manual verification found in this file" if none).
   - More than one → state explicitly: "Found N candidates: [list] — no automatic selection."
   - Zero → state explicitly: "No spec/plan reference found in this branch's commits."

**Acceptance checklist (on both paths, after the identification step, before step 6's question).** The format is PROCESS.md §6b, "Criteri di accettazione".
- **Items:** the `## Criteri di accettazione` entries of the document the identification step points to — the Spec if the Plan's `**Spec:**` line names one, otherwise the Plan — each shown by its bold label; plus, on the ordinary path only, every `TEST_CASES.md` case added or modified in `git diff main...HEAD -- TEST_CASES.md`, shown as `<ID> — <title>`.
- **Form:** `AskUserQuestion` with `multiSelect: true`, four items per question, up to four questions per call, further calls for the rest; no question gets a single item (five items go as three and two), and a list of one item is asked as yes/no. The user ticks the items verified with a positive outcome. Without the tool: a numbered list in chat, answered with the numbers.
- **Unticked items:** one question — *fix now* or *not verifiable here* — answered per item or with a rule. *Fix now* is step 6's "no" branch: stop, the environment stays up. *Not verifiable here* goes to the report's `**Acceptance:**` line with its reason, and to `docs/BACKLOG.md` only if it hides a defect.
- **No document identified, or no section in it:** say so in one line, then list only the `TEST_CASES.md` cases if there are any; with none, go straight to step 6.
- **A list already answered in this session is not asked again**, including when a "no" at step 6's no-code branch moves the gate to the ordinary path: only the `TEST_CASES.md` cases not yet asked are added.
6. **If `<no-code-cycle>` is true, take the no-code branch in the first sub-bullet below and do not ask the browser question.** Otherwise — regardless of the outcome in step 5 — always ask explicitly: "Have you manually verified this in the browser? [yes/no]" — this question must reach the user and receive their actual answer; your own use of the environment earlier in this gate or anywhere else in the session is not a substitute answer, however thorough.
   - **No-code cycle branch (`<no-code-cycle>` true) — this is the whole of step 6 on that path; the three bullets after it do not apply.** Do not ask the browser question. Run the Acceptance checklist above (criteria only) first; with a *fix now* item, stop and wait, tearing nothing down. Then show `git diff --stat main...HEAD` **and** the full path list from the classification above, then ask explicitly, without asserting the answer in the question: "Here is every path this diff touches — is this a no-code cycle? [yes/no]"
     - If the answer is "no", or anything other than a clear yes: the user is saying the **mechanical classification is wrong**: do **not** stop. Set `<no-code-cycle>` to false and run the ordinary path instead: steps 1-5, then step 6's browser question, exactly as if the classification had never fired. Say in one line that you are doing so.
     - If "yes": run `scripts/test-branch.sh status` (read-only, not a teardown). If it reports `up`, this branch has a test environment left running by an earlier attempt or session: **do not tear it down** — say so explicitly in chat and record it in the report, so it is left running knowingly rather than silently. Then proceed to Gate 3. The review launched at step 0 still has to be collected there and its findings handled — a no-code cycle does not skip Gate 3.
     - On a "yes", and only then, record in the Gate 5 report's **"Roadmap notes"** section that this gate took the no-code branch, that the browser question was not asked, and that Gate 4's out-of-scope check did not fire. Put it in "Roadmap notes", not in "Gate outcomes". Do not add a new field to the report template beyond what is already there, and do not write `0m (skipped)` for this gate — that is reserved for a gate that self-skips.
   - **Ordinary path: the Acceptance checklist above comes first.** Ask the browser question only after it, and only when no item was answered *fix now*; with one, the gate stops as on a "no", without asking it.
   - If the answer is "no" or anything other than a clear yes: stop and wait. Do not proceed. Do not tear down the branch environment if `<branch-env-active>` is true — leave it running so the user can keep testing. If step 0 launched a background review, keep whatever it produced for the re-run: findings in hand, never a reason to skip a review of the commits that then fix the defect.
   - If "yes": if `<branch-env-active>` is true, run `scripts/test-branch.sh down` to tear down the test stack — this is the one-way door the preamble above names. Then proceed to Gate 3.

## Gate 3 — CODE REVIEW (conditional human gate, max 3 rounds by default)

**If `<risk-class>` was not recorded in this session, run Gate 2's identification step first.** Every `/code-review` in this gate runs at `<review-effort>`.

**First, collect the background review.** If Gate 2 step 0 launched one, wait for it and treat its findings as this gate's round 1: start `code_review_followups` as an empty list (step 1 declares it, and that step is skipped on this path), and then — **before step 2** — ask, on either of step 0's launch paths: **has HEAD moved since Gate 2 step 0 launched the run you just collected?** Settle it with `git log`, from that HEAD to the current one. If it is empty, there is nothing to do and the collected round stands as it is. If it is not — typically a visual correction landed during Gate 2 — review exactly those commits, with **one scoped `/code-review`** at `<review-effort>` over that same range and never a whole-branch one, and add its findings to the round. Then go to step 2 with the combined findings; steps 0 and 0b are not otherwise re-entered on this path. If the run you collected produced nothing usable — the agent died, timed out, or returned no readable findings — say so in one line and treat the diff as **not reviewed**, running step 1 normally. A run that cannot be read is never a clean review, and nothing below may conclude otherwise.

**Use the launch HEAD, as above, and do not substitute `<reviewed-sha>` for it.** `<reviewed-sha>` keeps its one meaning from Gate 2 step 0, and step 0b below is where it is the correct start.

**Recording for the report, on every path.** However round 1 is obtained — backgrounded from Gate 2, run at step 1, or not run at all — record its **total finding count** and **how many of those findings fall in Gate 1 step 0's four mechanical classes** (a false predicate, a stale number, a wrong SHA or adjacency, an incomplete enumeration), plus **the minutes the re-checks below cost**. All of it goes in the report's claims pre-check line, in prose: say what did not happen rather than inventing a zero. If round 1 came from step 0b's scoped path, say so. Classifying a finding is a judgement: when it is genuinely unclear, leave it out of the mechanical count rather than inflating it.

0. **Skip check (no double review of the same diff, PROCESS.md §6.4).** **In `high-risk` this skip never applies: go to step 0b or step 1.** On any branch where Gate 1 step 0 found something, its `docs:` commit is not a fix from any review, so this full skip cannot fire. What replaces it is **not automatically** step 0b: 0b needs an earlier whole-branch review of `main...HEAD` in this session — a fact to check, not to assume (§6.4). With one, step 0b decides; without one, step 1 runs a normal full review. If, earlier in this same session, a whole-branch review covered `main...HEAD` (e.g. the final review of `superpowers:subagent-driven-development`), and every commit after the reviewed HEAD only applies fixes from that review and has itself been re-reviewed, do not run `/code-review`. State explicitly: "Code review: skipped — the final whole-branch review at `<sha>` already covers this diff (fixes `<sha..sha>` re-reviewed)." Carry that review's accepted follow-ups into `code_review_followups`, note the skip in the report's Roadmap notes, and proceed to Gate 4. If any condition is not met, or the review happened in another session, run step 1 normally.
0b. **Scoped-review path (partial skip).** In `high-risk` this path applies only if the review that defines `<reviewed-sha>` ran as `/code-review` at high; otherwise go to step 1. If a whole-branch review covered `main...HEAD` earlier in this session but HEAD has since moved by commits that are *not* fixes of that review (typically Gate 2 visual corrections), do not re-review the whole branch: run `/code-review` scoped to **only those commits** (`<reviewed-sha>..HEAD`, defined at Gate 2 step 0). State explicitly: "Code review: scoped to `<sha>..HEAD` — the whole-branch review at `<sha>` already covers the rest." For fixes born at Gate 2 this scoped path is the **norm, not a case to argue each time**.
1. Unless round 1 was already collected from Gate 2 (see the paragraph above), run `/code-review` at `<review-effort>`, scoped to the diff between the current branch and `main`. This is round 1. Maintain a running list, `code_review_followups`, starting empty.
2. If the review reports zero findings: state this explicitly ("Code review: no findings.") and proceed automatically to Gate 4 — no confirmation needed.
3. If the review reports one or more findings:
   - Show all findings.
   - **Disposition by target, applied without asking, before the question below.** A finding on a file in `docs/superpowers/specs/` or `docs/superpowers/plans/` → no action (PROCESS.md §1: frozen), unless it reveals a defect in the code, which is then handled as a finding on the code. A finding on pre-existing prose outside the diff → a row in `docs/BACKLOG.md` only if it is a false rule someone could follow, otherwise no action. State in the round how many findings each rule took; the counts go in the report's Gate 3 line under "Gate outcomes". Only the remaining findings reach the question below.
   - **Round 1 asks; later rounds may not need to.** Ask explicitly: "Fix now, accept as follow-up, or a mix (specify which)?" From round 2 on, if the round-1 answer stated a **rule** rather than a list ("all follow-up except correctness"), apply it instead of re-asking, report the application ("round 2: 3 findings, 1 fixed under your rule, 2 to follow-up"), and stop only on a finding the rule does not cover. **If round 1 was decided finding by finding, no rule is inferred from it.** PROCESS.md §6b calls this a class-D gate.
   - For every finding the user accepts as follow-up, append it to `code_review_followups`, tagged with the current round number.
   - For every finding the user chooses to fix now, apply the fix. **No fix modifies a file in `docs/superpowers/specs/` or `docs/superpowers/plans/`**; a defect there goes to the report's **Roadmap notes**.
   - **Before re-running the review, re-run Gate 1 step 0's four checks over the fixes you just made** (`git diff HEAD` if they are still in the working tree, the round's fix commits if you already committed them; `*.md` only, same four checks, same "fix the predicate, not the line"). Count the defects found here **separately** from step 0's. Then run the tests that cover what this round actually changed. For `*.md` fixes that is `npx vitest run scripts/ js/lib/test-cases-parse.test.js`. **For a round that fixed code, it is the test files covering that code** (`npx vitest run <file>`, or `docker exec pdash-api node --test src/<file>` for backend). The whole suite is not prescribed here (PROCESS.md §6.2), but **this gate is never left red**, whichever path exits it, including the one that accepts everything as follow-up.
   - If any fix was applied and the round just completed was round 1 or round 2: run `/code-review` again on the same scope, at `<review-effort>` (this becomes the next round) and repeat step 2/3 for it.
   - If any fix was applied and the round just completed was round 3 (i.e. a 4th run would be required by the normal flow): do not silently re-run. Instead:
     - State explicitly: "3 rounds of code review in a row have produced findings — this suggests a more structural issue than an isolated fix, not just noise."
     - Show the full sequence of findings across all three rounds, not just round 3's.
     - Ask explicitly among exactly three options: "(a) continue past the limit with another review round, (b) accept everything remaining as follow-up, or (c) stop the cycle to reconsider the approach."
     - On (a): run another round and treat it like any other round — the user has explicitly opted past the default cap, so no further hardcoded limit applies.
     - On (b): append all remaining findings to `code_review_followups` and proceed to Gate 4.
     - On (c): stop `/finish-cycle` entirely.
4. Once the gate is passed (zero findings, or all remaining findings accepted as follow-up), proceed to Gate 4, carrying `code_review_followups` forward for use in Gate 5.

## Gate 4 — MERGE (step 2's confirmation is the only human gate here; every other step, the merge at step 5 included, runs automatically once it is given)

1. Build the pre-merge summary:
   - Commit count: `git log main..HEAD --oneline | wc -l`
   - Files touched by category: run `git diff --stat main...HEAD`, then group the listed files by top-level path prefix (`js/`, `api/`, `css/`, `docs/`, or "root-level" for any file with no `/` in its path).
   - Out-of-scope check: from the candidates Gate 2's step 5 collected, take the **Plan** if there is exactly one; if this branch has no Plan, take the **Spec** if there is exactly one. Read the chosen file's "File Structure" section (a markdown table or list of file paths near the top) and compare it against the files touched in this diff. List, non-blocking, any touched file not mentioned there as "outside the declared File Structure." The Spec is a fallback: if its section is absent, say so in one line and skip the comparison.
   - **This check does not fire when Gate 2's step 5 collected no candidates.** That covers every no-code cycle, even when the identification step found the Plan for the risk class — and equally an ordinary cycle whose step-5 search came back empty or with more than one candidate of the kind being used. Gate 2's no-code branch records the non-firing in the report.
   - Include the pre-flight divergence note from check 5, if it fired.
2. Show the full summary. Ask explicitly: "Proceed with merge? [yes/no]"
   - If the answer is anything other than a clear yes: stop and wait.
3. **DB backup (automatic, no confirmation) — only when the stack is about to be touched.** Run `scripts/backup-db.sh` if **either** the diff adds a file under `api/src/db/migrations/` (step 6 will apply it) **or** the diff touches `api/` (step 7 will restart `pdash-api`). Otherwise skip it and say so in one line. This step does not replace `CLAUDE.md`'s Infrastructure-safety rule 2, which still applies wherever it applies. When it does run: `pg_dump` snapshot into `backups/` (gitignored) before any merge state changes. It is a read-only safety net, not a gate: report the script's own output (backup file path/size, and any old backup it pruned) in chat, but never block or ask for confirmation on it — including when it warns that `pdash-db` isn't running and skips.
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
6. **Apply new migrations (only if the diff touches `api/src/db/migrations/`):** nothing in the running app applies migrations (see `docs/db/migrations.md`).
   - Identify new migration files: `git diff --diff-filter=A --name-only <merge-base>...HEAD -- api/src/db/migrations/` (files this branch added — not pre-existing ones it happened to touch).
   - If none: skip this step entirely, no mention needed.
   - If one or more: for each, in filename order, run:
     ```bash
     docker exec -i pdash-db psql -U pdash -d pdash < api/src/db/migrations/<file>
     ```
     Report each file's output. This project's migration convention (`CREATE TABLE IF NOT EXISTS`, `INSERT ... ON CONFLICT DO NOTHING`) makes re-running an already-applied migration a safe no-op, so there is no need to first check whether it was already applied. If a migration errors, stop immediately, show the error verbatim, and do not proceed to the backend restart below until it's resolved.
7. **Backend restart (only if Gate 1 step 2 determined the diff touches `api/`):**
   - **Automatic, no confirmation.** Run `docker compose restart api`, then poll `docker inspect pdash-api --format '{{.State.Health.Status}}'` (a few seconds apart, up to the container's own healthcheck window) until it reports `healthy`. Report the new `docker inspect pdash-api --format '{{.State.StartedAt}}'` timestamp as confirmation.
   - `CLAUDE.md`'s Infrastructure-safety rule 3 normally requires explicit confirmation for `docker compose` against the main stack; it carries a **named derogation for this step alone** — never `down`, never `-v`, no other command, no other moment.
   - **One honest caveat about that derogation's basis.** It is often justified by "step 3 already took a snapshot", but step 3 is deliberately non-blocking: `scripts/backup-db.sh` warns and exits 0 if `pdash-db` isn't running, and a `pg_dump` failure does not stop the gate. So if step 3 did **not** produce a snapshot, say so in one line here before restarting, rather than letting the unstated premise carry the decision. The restart touches no volume either way, which is why this is a disclosure and not a block.
   - If Gate 1 step 2 determined the diff does *not* touch `api/`: skip this step entirely, no mention needed.
8. **Worktree cleanup (only if step 4 detected a linked worktree):** the branch just merged was checked out in a linked worktree at some path `<worktree-path>`. Before deleting the branch (step 9), remove the worktree — `git branch -d` fails while a worktree still references the branch.
   - Only remove worktrees whose path is under `.worktrees/`, `worktrees/`, or `.claude/worktrees/` — this project's own worktree conventions. If the path doesn't match, do not remove it; note that cleanup was skipped because the worktree isn't one this process owns.
   - From the main repo root:
     ```bash
     git worktree remove "<worktree-path>"
     git worktree prune
     ```
   - If removal fails: this is non-blocking. Report the failure, confirm via `git status --short` inside the worktree path that nothing uncommitted would be lost, and continue.
9. **Branch deletion (automatic, no confirmation).** After a successful push (migration apply, worktree cleanup, and backend restart, if applicable), run `git branch -d <branch>`.
   - If `git branch -d` refuses, report the refusal verbatim and do **not** force it with `-D`. After step 5 a refusal means the branch is not actually merged, which is a signal, not an obstacle to push past.

## Gate 5 — SYNC-DOCS + REPORT (after merge, shared human gate)

1. On `main` (post-merge), invoke `/sync-docs`. Let it run its own scope — do not reimplement or narrow it here. The memory update lives outside the repo: it is not part of the `git diff` shown in step 4 and is never committed. Copy `/sync-docs`'s "Memory" line into the report (step 2).
2. Create the report file at `docs/superpowers/reports/<YYYY-MM-DD>-<branch-sanitized>-finish-cycle.md` (today's date; `<branch-sanitized>` from pre-flight step 4) with this structure:

   ```markdown
   # Finish-cycle report — <branch>

   **Date:** <YYYY-MM-DD>
   **Branch:** <branch> → main
   **Execution started:** <started-at>  (pre-flight step 6)
   **Merged at:** <merged-at>  (Gate 4's merge commit)
   **Gate durations:** Gate 1 <N>m · Gate 2 <N>m · Gate 3 <N>m · Gate 4 <N>m · Gate 5 <N>m — total <N>m
   **Cycle counters:** subagent dispatches <N> · review rounds <N> · full test-suite runs <N>
   **Risk class:** <class> (<source: the Plan's path | the user's answer | fallback reason → standard>) · review effort <low|medium|high>
   **Claims pre-check:** <one line of prose: what it cost at Gate 1 and at the Gate 3 re-checks, what it caught at each, and how many of round 1's findings were mechanical>
   **Acceptance:** <items listed · verified with a positive outcome · not verifiable here, each with its reason — or why there was no list>
   <!-- Wall-clock, human wait time included (pre-flight step 6). Write `unknown` for a gate whose
        timestamp was not captured; a gate that self-skipped gets `0m (skipped)`.
        The claims pre-check line is Gate 1 step 0's own measurement (PROCESS.md §6.4d). It is prose,
        not slots: a cycle where part of it did not happen says so instead of writing a zero. Keep
        the Gate 1 and Gate 3 figures distinct.
        Cycle counters, from the start of plan execution to Gate 5: subagent dispatches = calls to the
        Agent tool; review rounds = Gate 3 rounds; full test-suite runs = complete runs of `npm test`
        or of the backend suite (`node --test` over `api/`), targeted single-file runs excluded. A
        counter the session did not observe in full is `unknown`.
        Risk class: the values Gate 2's identification step recorded.
        Acceptance: the outcome of Gate 2's Acceptance checklist. -->

   ## What was done

   <commit count and one-line-per-commit summary, from Gate 4's `git log main..HEAD --oneline` output captured before the merge>

   ## Gate outcomes

   <one line per gate, 1 through 5, stating its outcome — e.g. "Gate 1: passed (frontend + backend)",
    "Gate 2: no-code branch, classification confirmed", "Gate 3: 1 finding, fixed and re-verified",
    "Gate 4: merged, merge commit (main had diverged), migration 031 applied, pdash-api restarted and
    healthy at <StartedAt>", "Gate 5: sync-docs touched 2 files".>

   ## Code review follow-ups

   <one bullet per entry in code_review_followups, each noting: round number, finding summary, file/line if available. Write "None." if the list is empty.>

   ## Roadmap notes

   <dead code, candidate bugs, or other observations surfaced during Gates 1-4, collected as they came up — not invented retroactively. Write "None." if nothing surfaced.>

   ## Sync-docs outcome

   <which files /sync-docs updated and which it didn't, with reasoning — copied directly from /sync-docs's own summary output in step 1>

   ## Memory outcome

   <the "Memory" line from /sync-docs's summary: each memory file changed (before → after) and any item left "unverified", or "evaluated, no change" with the files checked. Memory is outside the repo, so this section is its only persistent record.>
   ```

2b. **Write the accepted follow-ups into `docs/BACKLOG.md` (automatic, no confirmation).** The report records what happened in this cycle; that file is the tracker of what is still open. For each follow-up this cycle accepted, append a row; for each existing row this cycle closed, set `closed <date>` with the command that verified it. **Read that file's own header for what a row must contain** — it is not restated here. Numbered `2b` so that step 3 keeps its number, which is cited as "Gate 5 step 3". This is not a judgement gate and does not ask — it records what Gate 3 already decided.
   - **On a cycle with no accepted follow-ups and nothing closed, change no file** and say so in one line.
   - It runs **before** step 3, so that step's blocking `npm test` checks the new rows' cited paths through `scripts/doc-paths-guard.test.js`. **That cover is partial:** `docs/BACKLOG.md`'s own rules 1 and 2 say which citations the guard cannot see; do not read a green suite as having verified a row it cannot see.

3. **Run `npm test` (blocking, no confirmation).** Same semantics as Gate 1 step 1: if it fails, stop immediately, show the failing output verbatim, and run **no** `git add`, `git commit` or `git push`.
   - **Unlike Gate 1,** a failure here is **not** a "re-run `/finish-cycle` from the top" case. Fix it on `main` — usually by correcting the edit `/sync-docs` just made, or by lowering a pin in the same commit if the shrink was deliberate — then re-enter this gate from its step 1. Never make the suite green by relaxing an assertion or raising a pin to fit new content.
4. Show the combined diff (`git diff`, covers `/sync-docs`'s edits, step 2b's rows in `docs/BACKLOG.md`, and the new report file — none of the three has been committed yet).
5. Ask explicitly: "Commit and push these doc/report changes to main? [yes/no]"
   - If the answer is anything other than a clear yes: stop and wait, leaving the changes uncommitted locally.
6. If confirmed, run in sequence:
   ```bash
   git add <files changed by sync-docs> docs/BACKLOG.md docs/superpowers/reports/<report-filename>
   git commit -m "docs: sync docs + finish-cycle report for <branch>"
   git push origin main
   ```

## Gate 6 — FINAL REPORT (in chat)

**The report file written at Gate 5 is the register — this gate does not restate it.** Print in chat only:

- The path to the just-committed report file.
- **One** outcome line for the whole cycle, naming only what was not routine (e.g. "Merged and pushed; 1 review finding fixed, 2 deferred" or "Merged and pushed; clean"). Not one line per gate.
- The items that need a **human action after this cycle** — accepted code-review follow-ups and anything in Roadmap notes that is a task rather than an observation — or "nothing open" when there are none, followed by: "See the Gate outcomes and Roadmap notes sections of `<report path>` for the per-gate detail and the full list."
- **REQUIRED, as the literal last line, with nothing after it:** `Cycle closed and pushed. If this was the last of a series of related cycles (e.g. a multi-cycle audit), consider a cold review before moving on to the next work.` Always print the same line, unconditionally: never try to determine from repo state, commit history, or anything else whether this cycle actually was the last of a series, and never act on it (no starting a review, no reading other reports) beyond printing it.
