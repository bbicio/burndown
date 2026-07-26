# Dead Code Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove 5 confirmed-unreachable code artifacts (4 whole files + 1 dead function) that are residue from completed Vue migrations or predate the codebase's original modularization, with zero behavior change to any live page.

**Architecture:** Purely subtractive — no new files, no refactors. Re-verify each target is still unreferenced immediately before deleting it (the repo may have changed since this plan was written), delete, run tests, update the two docs that list these files in their file-tree sections, spot-check the three pages historically closest to these files.

**Tech Stack:** Vanilla JS (classic scripts, no build step), vitest (`npm test`), git.

## Global Constraints

- **Verify-before-delete, per file, at execution time** — re-run the reference checks below against the *current* repo state, not this plan's already-possibly-stale snapshot (design spec, Constraints section).
- **No behavior change is acceptable.** If verification finds even one live reference to a target this plan didn't expect, stop: do not delete that specific artifact, do not work around the discovery, and report it back as a new finding (Brief's Required Reminder / PROCESS.md Scenario 3 guard) — it must be isolated into a future Brief, never folded into this cycle.
- Do not touch `js/roles.js`, `js/clients.js`, `js/programs.js`, `js/ratecards.js`, or any other file not explicitly named in this plan — they remain genuinely loaded and used (design spec, Explicitly out of scope).
- Do not perform any refactor, behavior change, or "while we're in there" cleanup on any file this plan touches (design spec, Explicitly out of scope).

---

### Task 1: Verify, delete, and document

This is a single task — the 5 removals share no interdependencies, and splitting them into separate tasks would produce no benefit (nothing here needs a partial-approval boundary: a reviewer either agrees all 5 targets are dead, given the same evidence, or none of them).

**Files:**
- Delete: `js/dashboard.js`
- Delete: `js/config-form.js`
- Delete: `js/main.js`
- Delete: `app.js` (repo root)
- Modify: `js/ai.js:515-573` (remove `openPlanningAiAnalysis()`, the last function in the file)
- Modify: `CLAUDE.md:176` (remove the `js/config-form.js` file-structure entry)
- Modify: `ARCHITECTURE.md:678-679` (remove the `dashboard.js`/`config-form.js` file-tree entries)

**Interfaces:** None — this task has no producers/consumers relationship with any other task (there is only one task in this plan).

- [ ] **Step 1: Re-verify all 5 targets are still unreferenced**

Run each of these from the repo root and confirm the stated expected output. If any command's actual output differs from what's stated, STOP — do not proceed to Step 2 for that specific target. Instead, note the exact unexpected reference found and report back before continuing (per this plan's Global Constraints and the Brief's Required Reminder — this becomes a new finding for a future cycle, not something to delete around).

```bash
grep -rn "dashboard\.js" --include="*.html" .
```
Expected: no output (zero `<script src>` references; any hits inside `js/lib/*.js`/`js/lib/*.test.js` comment text are fine and don't block this step, since the check is scoped to `.html` files here specifically to catch a live loader).

```bash
grep -rn "config-form\.js" --include="*.html" .
```
Expected: at most one hit, a comment inside `project-config.html` (`// Currency formatting — config-form.js-specific, not extracted to js/lib...`) — a historical citation, not a `<script src>` tag. If the only hit is that comment, proceed. If there's a `<script src="js/config-form.js">` tag anywhere, STOP.

```bash
grep -rln "js/main\.js" --include="*.html" --include="*.js" .
```
Expected: no output.

```bash
grep -rln "\bapp\.js\b" --include="*.html" .
```
Expected: no output.

```bash
grep -rn "openPlanningAiAnalysis" --include="*.html" --include="*.js" .
```
Expected: exactly 2 hits — `app.js:4859` (inside the file about to be deleted) and `js/ai.js:515` (the definition itself). Zero call sites. If a third hit appears anywhere (a `<script>` calling it, another `.js` file referencing it), STOP.

```bash
grep -n "dashboard.js\|config-form.js\|main.js\|app.js" nginx.conf docker-compose.yml package.json
```
Expected: no output.

- [ ] **Step 2: Delete the 4 files**

```bash
git rm js/dashboard.js js/config-form.js js/main.js app.js
```

- [ ] **Step 3: Remove `openPlanningAiAnalysis()` from `js/ai.js`**

The function is the last thing in the file (lines 515-573 of a 573-line file, confirmed via `wc -l js/ai.js`). Read `js/ai.js` from line 505 to end to confirm this is still accurate before editing (line numbers may have shifted if the file changed since this plan was written) — the function starts with `async function openPlanningAiAnalysis() {` and its matching closing `}` is the file's final line. Delete from the blank line immediately before `async function openPlanningAiAnalysis()` through the end of the file, so `js/ai.js` ends cleanly at the closing `}` of the function that now precedes it (the function ending at what was line 513, `buildResourceAllocationSummary`'s closing brace).

- [ ] **Step 4: Run the test suite**

```bash
npm test
```

Expected: same pass count as immediately before Step 2 (record the count from a pre-Step-2 `npm test` run for comparison — no test imports any of these 5 artifacts, since none of the 4 deleted files are ES modules with exports and `openPlanningAiAnalysis` has zero callers, so this run should show zero new failures and zero missing tests).

- [ ] **Step 5: Update `CLAUDE.md`**

Remove this line (currently line 176):

```
js/config-form.js        — project config form (tasks, phasing, planning, groups); hours parsing/formatting delegated to `js/lib/cfg-parse.js`; no longer loaded by `planning.html` (confirmed dead there — no reachable `#configModal` on that page)
```

Leave every other mention of `config-form.js`/`dashboard.js`/`main.js` in `CLAUDE.md` untouched — they are historical citation comments explaining code provenance (e.g. "moved from config-form.js", "extracted from the former js/dashboard.js's renderKPIs"), not claims that the file currently exists, and remain accurate as historical notes per the design spec.

- [ ] **Step 6: Update `ARCHITECTURE.md`**

Remove these two lines (currently lines 678-679):

```
    dashboard.js          ← per-project KPI/burndown
    config-form.js        ← project config form; hours parsing/formatting/rounding delegated to js/lib/cfg-parse.js; no longer loaded by planning.html (confirmed dead there in its Vue migration — no reachable #configModal on that page)
```

Leave every other mention of `config-form.js`/`dashboard.js`/`main.js`/`app.js` in `ARCHITECTURE.md` untouched, for the same reason as Step 5 — they're historical provenance notes (e.g. `js/pipeline-board.js`/`js/dashboard.js` mentioned when explaining what a later migration folded in, or `js/main.js` mentioned as the file where confirmed-dead registry-modal openers used to live), not current-existence claims.

- [ ] **Step 7: Commit**

```bash
git add js/ai.js CLAUDE.md ARCHITECTURE.md
git commit -m "chore: remove confirmed-dead js/dashboard.js, js/config-form.js, js/main.js, app.js, and openPlanningAiAnalysis()"
```

(The `git rm` calls from Step 2 stage the deletions automatically; this commit captures both the deletions and the `js/ai.js`/doc edits together as one atomic change, matching this project's "one cycle, one coherent commit set" convention for small audit-fix cycles like the `migration.html` deletion precedent.)

- [ ] **Step 8: Manual smoke check (matches this plan's design spec Testing section)**

Open `portfolio.html`, `project-config.html`, and `planning.html` in a browser (via `docker compose up` or the project's normal dev flow) and confirm, for each:
- No new console error on page load.
- `portfolio.html`: KPI cards and burndown chart render as before.
- `project-config.html`: form loads and saves as before.
- `planning.html`: the resource planning table renders as before.

These three pages historically loaded one of the deleted files before their own Vue migrations already dropped the `<script>` tags — they're the cheapest available regression check even though none of them currently load anything this task deletes.
